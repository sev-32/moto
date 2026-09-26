// The exhaust layer (src/core/62_exhaust.js) extends the V1.22 AudioWorklet module at load time
// so afterfire bangs drive the DSP pops. Headless Chromium cannot run AudioWorklets, so this
// test loads the real worklet source from the legacy script, applies the same patch, and drives
// the processor class directly.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const legacy = fs.readFileSync(path.join(ROOT, "src/legacy/10_acoustic_studio_v122.js"), "utf8");
const layer = fs.readFileSync(path.join(ROOT, "src/core/62_exhaust.js"), "utf8");
const WORKLET = legacy.match(/const WORKLET_SOURCE=String\.raw`([\s\S]*?)`;/)[1];
const POP_MSG = eval(layer.match(/const POP_MSG = (\[.*?\]);/)[1]);
const POP_RAND = eval(layer.match(/const POP_RAND = (\[.*?\]);/)[1]);

function loadProcessor(src) {
  let Proc = null;
  const scope = {
    AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null, postMessage() {} }; } },
    registerProcessor: (name, cls) => { if (name === "ducati-acoustic-processor") Proc = cls; },
    sampleRate: 48000, currentTime: 0,
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  assert.ok(Proc, "processor registered");
  return new Proc({ processorOptions: { profile: { engine: { overrunPops: 0.12, overrunThresholdRpm: 3600, firingDeg: [0, 270], cycleDeg: 720 } } } });
}
const outputs = (n) => [[new Float32Array(n)], [new Float32Array(n)], [new Float32Array(n)], [new Float32Array(n)]];

test("patch anchors exist exactly once in the V1.22 worklet source", () => {
  for (const [a] of [POP_MSG, POP_RAND]) assert.equal(WORKLET.split(a).length - 1, 1, a);
});

test("patched worklet compiles, accepts pop / extPops messages", () => {
  const p = loadProcessor(WORKLET.replace(POP_MSG[0], POP_MSG[1]).replace(POP_RAND[0], POP_RAND[1]));
  assert.equal(p.popEnv, 0);
  p.port.onmessage({ data: { type: "pop", a: 0.5 } });
  assert.ok(Math.abs(p.popEnv - 0.16) < 1e-12, "pop adds .32 x a");
  p.port.onmessage({ data: { type: "extPops", on: true } });
  assert.equal(p.extPops, true);
  p.port.onmessage({ data: { type: "state", state: { rpm: 8000, throttle: 0 } } });
  assert.equal(p.target.rpm, 8000, "state messages still work");
});

test("external pops replace the random overrun pops", () => {
  const run = (ext) => {
    const p = loadProcessor(WORKLET.replace(POP_MSG[0], POP_MSG[1]).replace(POP_RAND[0], POP_RAND[1]));
    if (ext) p.port.onmessage({ data: { type: "extPops", on: true } });
    p.s.rpm = p.target.rpm = 8000;
    p.s.throttle = p.target.throttle = 0;
    let maxPop = 0;
    for (let b = 0; b < 200; b++) { p.process([], outputs(128)); maxPop = Math.max(maxPop, p.popEnv); }
    return maxPop;
  };
  assert.ok(run(false) > 0.01, "stock DSP crackles on overrun by itself");
  assert.equal(run(true), 0, "with extPops the DSP only pops on bang messages");
});

test("unpatched worklet is unchanged when the anchors are missing", () => {
  const p = loadProcessor(WORKLET);
  p.port.onmessage({ data: { type: "pop", a: 0.5 } });
  assert.equal(p.popEnv, 0, "stock processor ignores pop messages");
});

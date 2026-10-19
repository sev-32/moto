// Her body stick in the game (headless Chromium, a stand-in gamepad installed before the page's own
// scripts): riding, the right stick moves her body - her intent's hang and tuck follow it - and the
// ride's camera does not see it (the core filters the pad the legacy ride reads); held R3 gives it back
// to the camera; L3 and U stand her on the pegs and back; O cycles how much she rides herself.
//   node tests/browser/body-stick.mjs [build.html]
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";
const file = process.argv.find((a) => a.endsWith(".html")) || path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html");
const fails = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };

// (the stand-in pad: standard mapping, its axes and buttons set by the test through window.__PAD__)
const padInit = () => {
  const P = (window.__PAD__ = { axes: [0, 0, 0, 0], pressed: new Array(17).fill(false) });
  const pad = { id: "test pad", index: 0, connected: true, mapping: "standard", timestamp: 0 };
  Object.defineProperty(pad, "axes", { get: () => P.axes.slice() });
  Object.defineProperty(pad, "buttons", { get: () => P.pressed.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })) });
  navigator.getGamepads = () => [pad, null, null, null];
};
const { browser, page, logs } = await openBuild(file + "?rider=bio", { width: 640, height: 400, init: padInit });
try {
  await page.waitForFunction(() => window.__LUCID_V1300_READY__ && window.LUCID_CORE?.riderBio?.rider, null, { timeout: 180000 }).catch(() => {});
  const btn = page.locator("button:visible", { hasText: "START ROLLING RIDE" }).first();
  if (await btn.count()) await btn.click().catch(() => {});
  await page.waitForFunction(() => window.LUCID_CORE.riderBio.placed && !window.LUCID_CORE.riderBio.rider.plan.fallen, null, { timeout: 60000 }).catch(() => {});
  // (the game's frames, as they run: wait for a few)
  const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const tel = () => page.evaluate(() => { const B = window.LUCID_CORE.riderBio, a = B.rider.telemetry.agility; return { ...a, seen: navigator.getGamepads()[0].axes.slice(2, 4), posture: { ...B.rider.plan.posture }, standToggle: B.standToggle }; });
  check(await page.evaluate(() => window.LUCID_CORE.riderBio.placed), "she is on the bike");
  const t0 = await tel();
  check(t0.assist === "assist", `her riding and the stick added by default (${t0.assist})`);

  // the right stick to the right and forward: her intent follows, the camera does not see it
  await page.evaluate(() => { window.__PAD__.axes = [0, 0, 1, -1]; });
  await frames(20);
  const t1 = await tel();
  check(t1.stick.x > 0.95 && t1.stick.y > 0.95, `the body stick reads the right stick (${t1.stick.x}, ${t1.stick.y})`);
  check(t1.intent.hang > 0.9, `her intent leans her right (hang ${t1.intent.hang})`);
  check(t1.intent.tuck > 0.9, `and tucks her (tuck ${t1.intent.tuck})`);
  check(t1.seen[0] === 0 && t1.seen[1] === 0, `the ride's camera does not see the stick (${t1.seen})`);
  check(t1.posture.hang > 0.1, `her posture moves towards it (hang ${t1.posture.hang.toFixed(2)})`);
  // R3 held: the stick is the camera's
  await page.evaluate(() => { window.__PAD__.pressed[11] = true; });
  await frames(6);
  const t2 = await tel();
  check(t2.camera && t2.seen[0] === 1, `R3 held: the camera has the stick (${t2.seen}), her body does not (${t2.stick.x})`);
  check(Math.abs(t2.stick.x) < 0.01, "and her body stick reads nothing");
  await page.evaluate(() => { window.__PAD__.pressed[11] = false; window.__PAD__.axes = [0, 0, 0, 0]; });
  await frames(6);

  // L3: she stands on the pegs; again: she sits
  await page.evaluate(() => { window.__PAD__.pressed[10] = true; });
  await frames(3);
  await page.evaluate(() => { window.__PAD__.pressed[10] = false; });
  await frames(20);
  const t3 = await tel();
  check(t3.standToggle && t3.intent.stand === 1, `L3: standing on the pegs (stand ${t3.intent.stand})`);
  await page.keyboard.press("KeyU");
  await frames(6);
  const t4 = await tel();
  check(!t4.standToggle && t4.intent.stand === 0, `U: seated again (stand ${t4.intent.stand})`);

  // O: how much she rides herself, in turn
  const seen = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press("KeyO"); await frames(4); seen.push((await tel()).assist); }
  check(seen.join(",") === "manual,sim,auto,assist", `O cycles: ${seen.join(" -> ")}`);
  // J held: the key eases her to the left as a thumb on a stick would
  await page.keyboard.down("KeyJ");
  await frames(4);
  const tj1 = await tel();
  await frames(30);
  const tj2 = await tel();
  await page.keyboard.up("KeyJ");
  check(tj1.stick.x < 0 && tj1.stick.x > -1 && tj2.stick.x < tj1.stick.x, `J eases her left (${tj1.stick.x} then ${tj2.stick.x})`);
  const errs = logs.filter((l) => l.startsWith("[pageerror]"));
  check(!errs.length, `no page errors${errs.length ? ": " + errs[0].slice(0, 200) : ""}`);
} finally {
  await browser.close();
}
console.log(fails.length ? `${fails.length} FAILED` : "all ok");
process.exit(fails.length ? 1 : 0);

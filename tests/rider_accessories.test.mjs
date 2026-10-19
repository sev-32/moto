// Her accessories (src/core/47_rider_glasses.js): the sunglasses as fitted to her head - checked here
// without a browser.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, read, character } from "../tools/clothing/engine.mjs";

const ch = character();
const b64 = (s, T) => { const b = Buffer.from(s, "base64"); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

test("her sunglasses: attributed (CC-BY), carried by her head, clear of her skin, temples resting by her ears", () => {
  const A = read(path.join(ROOT, "assets/character/accessories/lucid_sunglasses_v1.json"));
  assert.equal(A.carriedBy, "Head");
  assert.match(A.attribution.license, /CC-BY-4\.0/);
  assert.match(A.attribution.author, /martn00/);
  assert.match(A.attribution.source, /^https:\/\/sketchfab\.com\//);
  assert.deepEqual(A.parts.map((p) => p.material.kind).sort(), ["lens", "metal", "plastic"]);
  const head = ch.joints.rest[ch.joints.names.indexOf("Head")], X = ch.vrest;
  let minD = Infinity;
  for (const p of A.parts) {
    const P = b64(p.positions_f32_b64, Float32Array), I = b64(p.indices_u32_b64, Uint32Array);
    assert.ok(I.every((i) => i < P.length / 3));
    for (let i = 0; i < P.length; i += 30) {
      const q = [P[i] + head[0], P[i + 1] + head[1], P[i + 2] + head[2]];
      for (let v = 0; v < ch.nv; v++) { const d = Math.hypot(X[3 * v] - q[0], X[3 * v + 1] - q[1], X[3 * v + 2] - q[2]); if (d < minD) minD = d; }
    }
  }
  assert.ok(minD > 0.001, `glasses ${(minD * 1000).toFixed(1)} mm from her skin`);
  for (const t of Object.values(A.fit.temples)) {
    const e = A.fit.ears[t.side];
    assert.ok(Math.abs(t.end[1] - e.top) < 0.01 && Math.abs(t.end[2] - e.front) < 0.01, "a temple's end by her ear");
  }
});

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

// Her shoes (src/core/clothing/shoes.js on assets/character/accessories/lucid_vans_v1.json)
const shoesAsset = () => read(path.join(ROOT, "assets/character/accessories/lucid_vans_v1.json"));
const { decodeShoes, wearShoe, laceStrips } = await import(path.join(ROOT, "src/core/clothing/shoes.js"));

test("her shoes: attributed (CC-BY), one size for the pair, toe room, the sole under her, her skin they cover", () => {
  const A = shoesAsset(), D = decodeShoes(A);
  assert.match(A.attribution.license, /CC-BY-4\.0/);
  assert.match(A.attribution.author, /CrossFireJW/);
  assert.match(A.attribution.source, /^https:\/\/sketchfab\.com\//);
  assert.ok(A.fit.toeRoomM >= 0.008 && A.fit.toeRoomM <= 0.025, `toe room ${A.fit.toeRoomM}`);
  assert.ok(A.fit.lengthM > A.fit.footLengthM + 0.02 && A.fit.lengthM < A.fit.footLengthM + 0.05, "the shoe's length over her foot's");
  assert.ok(A.fit.skinThroughShoe.maxM <= 0.006, "her skin no more than 6 mm through the shoe");
  // the right shoe is the left mirrored (her feet are mirror images)
  const L = D.sides.L.rest, R = D.sides.R.rest;
  for (let i = 0; i < L.length; i += 300) { assert.ok(Math.abs(L[i] + R[i]) < 1e-6 && Math.abs(L[i + 1] - R[i + 1]) < 1e-6 && Math.abs(L[i + 2] - R[i + 2]) < 1e-6); }
  // the sole: its tread a sole's stack below her sole
  let minY = Infinity; for (let i = 1; i < L.length; i += 3) minY = Math.min(minY, L[i]);
  let sole = Infinity; for (let v = 0; v < ch.nv; v++) if (ch.vrest[3 * v] < -0.01 && ch.vrest[3 * v + 1] < 0.11) sole = Math.min(sole, ch.vrest[3 * v + 1]);
  assert.ok(Math.abs(sole - minY - A.fit.soleStackM) < 0.004, `tread ${((sole - minY) * 1000).toFixed(1)} mm below her sole`);
  // her skin left out: her toes in, nothing above her ankles
  const F = ch.faces, hidden = new Set(D.hiddenSkin);
  for (const f of hidden) for (let c = 0; c < 3; c++) assert.ok(ch.vrest[3 * F[3 * f + c] + 1] < 0.15);
  assert.ok(hidden.size > 1000);
  // the patch replaces some of the mesh's triangles; what is drawn is the rest
  assert.equal(D.mesh.drawn.length / 3, D.mesh.indices.length / 3 - D.patch.replaces.length);
});

test("her shoes bend with her toes: the heel stays, the forefoot turns about the flex line, the vamp creases outwards", () => {
  const D = decodeShoes(shoesAsset()), sh = wearShoe(D, "L", ch), sd = D.sides.L;
  const rest = ch.compile({}, { validate: false }), toes = ch.compile({ "leftToe.flexionExtension": 35 }, { validate: false });
  sh.update(rest, 0, {});
  for (let i = 0; i < sh.pos.length; i += 97) assert.ok(Math.abs(sh.pos[i] - sd.rest[i]) < 1e-5, "at rest the shoe is as fitted");
  sh.update(toes, 0, {});
  assert.ok(Math.abs(sh.toeAngle * 180 / Math.PI - 35) < 0.5, `her toes ${sh.toeAngle * 180 / Math.PI}`);
  const F = sd.flex.point, fw = sd.flex.forward, ax = sd.flex.axis, half = sd.flex.zoneM / 2;
  let heel = 0, front = 0;
  for (let v = 0; v < D.mesh.nv; v++) {
    const p = [sd.rest[3 * v] - F[0], sd.rest[3 * v + 1] - F[1], sd.rest[3 * v + 2] - F[2]], u = p[0] * fw[0] + p[1] * fw[1] + p[2] * fw[2], q = [sh.pos[3 * v] - F[0], sh.pos[3 * v + 1] - F[1], sh.pos[3 * v + 2] - F[2]];
    if (u < -half) heel = Math.max(heel, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
    if (u > half) { // (turned by her toes' angle about the flex line: its distance from the line kept)
      const pa = p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2], qa = q[0] * ax[0] + q[1] * ax[1] + q[2] * ax[2];
      const pr = Math.hypot(p[0] - pa * ax[0], p[1] - pa * ax[1], p[2] - pa * ax[2]), qr = Math.hypot(q[0] - qa * ax[0], q[1] - qa * ax[1], q[2] - qa * ax[2]);
      front = Math.max(front, Math.abs(pr - qr), Math.abs(pa - qa));
    }
  }
  assert.ok(heel < 1e-6, "behind the flex the shoe does not move");
  assert.ok(front < 1e-6, "in front of it, a rotation about the flex line");
  // the vamp: creased, outwards from the bent shape, never into it
  assert.ok(sh.creaseDepth() > 0.0003, `crease ${sh.creaseDepth()}`);
  const P = sh.patch, pin = D.patch.pinned;
  for (let i = 0; i < D.patch.np; i++) if (!pin[i]) { const d = (P.points[3 * i] - P.target[3 * i]) * P.targetN[3 * i] + (P.points[3 * i + 1] - P.target[3 * i + 1]) * P.targetN[3 * i + 1] + (P.points[3 * i + 2] - P.target[3 * i + 2]) * P.targetN[3 * i + 2]; assert.ok(d > -1e-9); }
});

test("her bow hangs: two loops open, two tails below the knot, the lace inextensible and outside the shoe", () => {
  const D = decodeShoes(shoesAsset()), rest = ch.compile({}, { validate: false });
  for (const S of ["L", "R"]) {
    const sh = wearShoe(D, S, ch);
    sh.update(rest, 0, {});
    sh.settleLaces(rest, 480, 1 / 240, { g: [0, -9.81, 0], ground: { n: [0, 1, 0], h: -0.012 } });
    const K = sh.laces.knot;
    for (const st of sh.laces.strands) {
      const x = st.x;
      for (let i = 0; i < st.n; i++) assert.ok(Math.abs(Math.hypot(x[3 * i + 3] - x[3 * i], x[3 * i + 4] - x[3 * i + 1], x[3 * i + 5] - x[3 * i + 2]) - st.segL) < 0.0015, "inextensible");
      if (st.kind === "loop") { let open = 0; for (let i = 1; i < st.n / 2; i++) open = Math.max(open, Math.hypot(x[3 * i] - x[3 * (st.n - i)], x[3 * i + 1] - x[3 * (st.n - i) + 1], x[3 * i + 2] - x[3 * (st.n - i) + 2])); assert.ok(open > 0.01, `a loop open ${open}`); }
      else assert.ok(x[3 * st.n + 1] < K[1] - 0.01, "a tail hangs below the knot");
      for (let i = 0; i <= st.n; i++) assert.ok(x[3 * i + 1] > -0.0125, "off the ground");
      // outside the shoe: its distance field (the model's frame) at each point, within a cell's rounding
      const T = D.sides[S].toModel, G = D.sdf;
      for (let i = 1; i <= st.n; i++) {
        const q = [x[3 * i] - T.o[0], x[3 * i + 1] - T.o[1], x[3 * i + 2] - T.o[2]], m = [0, 1, 2].map((r) => T.A[r][0] * q[0] + T.A[r][1] * q[1] + T.A[r][2] * q[2] + T.c[r]);
        const c = m.map((v, k) => Math.round((v - G.origin[k]) / G.cell - 0.5));
        if (c.some((v, k) => v < 0 || v >= [G.nx, G.ny, G.nz][k])) continue;
        assert.ok(G.d[(c[2] * G.ny + c[1]) * G.nx + c[0]] * G.stepM > -0.003, "outside the shoe");
      }
    }
    const strips = laceStrips(sh);
    assert.equal(strips.length, 4);
    assert.ok(strips.every((r) => r.P.every(Number.isFinite)));
  }
});

// Her shoes (LUCID MOTO, CANDIDATE): the fitted pair (assets/character/accessories/lucid_vans_v1.json,
// made by tools/character/fit-shoes.mjs) worn on her feet - shared by the game layer
// (src/core/47_rider_shoes.js, bundled) and the Node tools and tests. No GL here.
//
// Each shoe is carried by her foot (her Foot joint: the heel, the arch, the throat and its laces) and
// bends with her toes (her ToeBase joint): its forefoot turns about her toe joint's axis through a
// line in the sole under the joint, the turn spread smoothly over the flex zone - the rubber sole bends
// there as a beam does, its tread stretching, the upper above it shortening. Over the flex the vamp is
// a sheet of canvas (a finer patch, solved whenever her toes move): it keeps its length in tension,
// gives in compression, resists bending and cannot go inside the shoe's bent shape (her foot is
// there) - so where the bend shortens it, it buckles outwards into creases.
//
// Her bow: two loops and two tails of flat lace from the knot over the top crossing, each a chain of
// points - inextensible, resisting bending away from the bow's tied shape, held in that shape near the
// knot - under gravity less the bike's acceleration and the air seen from the bike (a ribbon's drag),
// kept outside the shoe (its shape as a distance field), off the ground and off her ankle.
//
// Frames: her rest (master) frame, +y up; a pose gives each joint's world position P and rotation G
// (rest frame to world), as 44_lucid_character.js compiles it - world = P + G (rest - restJoint).

export const SHOE_DEFAULTS = {
  // the vamp's canvas: projections per solve; how much it resists being shortened before it buckles
  // (a share of a full projection), its bending stiffness (share), how far it may stand off the shoe,
  // and how far her toes must have moved (rad) for it to be solved again
  patchIterations: 12, compressionShare: 0.04, bendShare: 0.18, maxStandoffM: 0.012, solveEveryRad: 0.004,
  // the laces (declared, CANDIDATE): a flat lace's drag on the air (1/m, as the hair's dragK: a = k |w| w;
  // a ribbon 8 mm wide of ~1.5 g/m broadside to the flow), damping per step, its bending stiffness
  // (share per projection, towards the bow's tied curvature), the bow's shape memory (knotHold at the
  // knot, e-folding over knotHoldM along the lace), points every laceSegmentM, steps per second
  laceDragK: 3.5, laceDamping: 0.985, laceBendShare: 0.22, knotHold: 0.5, knotHoldM: 0.012, laceSegmentM: 0.006, laceHz: 180, laceIterations: 6,
  // her ankle, to the laces (a capsule up her leg from her ankle joint); her foot moved further than
  // jumpM in a frame (put somewhere else): the bow tied again and hung for jumpSettle steps
  ankleRadiusM: 0.03, ankleLengthM: 0.16, jumpM: 0.1, jumpSettle: 120,
};

const b64dec = (s, T) => {
  if (typeof Buffer !== "undefined") { const b = Buffer.from(s, "base64"); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
  const raw = atob(s), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return new T(u.buffer);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
// the angle of rotation R (row-major 3x3) about unit axis k (R a rotation about k, or near one)
function angleAbout(R, k) {
  const w = Math.sqrt(Math.max(0, 1 + R[0] + R[4] + R[8])) / 2, s = 4 * (w || 1e-9);
  return 2 * Math.atan2(((R[7] - R[5]) * k[0] + (R[2] - R[6]) * k[1] + (R[3] - R[1]) * k[2]) / s, w);
}

// ------------------------------------------------------------------ the pair, decoded
export function decodeShoes(A) {
  const mesh = { uvs: b64dec(A.mesh.uvs_f32_b64, Float32Array), indices: b64dec(A.mesh.indices_u32_b64, Uint32Array), regions: b64dec(A.mesh.regions_u8_b64, Uint8Array), nv: A.mesh.vertices };
  const P = A.patch, replaces = b64dec(P.replaces_u32_b64, Uint32Array);
  const patch = {
    replaces, tri: b64dec(P.points.tri_u32_b64, Uint32Array), bary: b64dec(P.points.bary_f32_b64, Float32Array), pinned: b64dec(P.points.pinned_u8_b64, Uint8Array),
    vpoint: b64dec(P.vertices.point_u32_b64, Uint32Array), vuv: b64dec(P.vertices.uv_f32_b64, Float32Array), indices: b64dec(P.indices_u32_b64, Uint32Array),
  };
  patch.np = patch.pinned.length; patch.nrv = patch.vpoint.length;
  // the canvas sheet's edges and bending pairs (over its points: welded across the UV seams), less
  // those between two pinned points (nothing to solve)
  {
    const T = patch.indices, pt = (i) => patch.vpoint[i], E = new Map(), edges = [], bends = [], pin = patch.pinned;
    for (let f = 0; f < T.length; f += 3) for (let e = 0; e < 3; e++) {
      const a = pt(T[f + e]), b = pt(T[f + (e + 1) % 3]), c = pt(T[f + (e + 2) % 3]), k = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (!E.has(k)) { E.set(k, c); if (!(pin[a] && pin[b])) edges.push(a, b); } else { const o = E.get(k); if (o >= 0 && o !== c && !(pin[o] && pin[c])) bends.push(o, c); E.set(k, -1); }
    }
    patch.edges = Uint32Array.from(edges); patch.bends = Uint32Array.from(bends);
  }
  // the mesh less the triangles the patch replaces (drawn)
  const rep = new Uint8Array(mesh.indices.length / 3); for (const f of replaces) rep[f] = 1;
  const kept = []; for (let f = 0; f < rep.length; f++) if (!rep[f]) kept.push(mesh.indices[3 * f], mesh.indices[3 * f + 1], mesh.indices[3 * f + 2]);
  mesh.drawn = Uint32Array.from(kept);
  const sides = {};
  for (const S of ["L", "R"]) {
    const F = A.feet[S];
    sides[S] = { S, carriedBy: F.carriedBy, toes: F.toes, mirrored: !!F.mirrored, rest: Float64Array.from(b64dec(F.positions_f32_b64, Float32Array)), restN: b64dec(F.normals_f32_b64, Float32Array), restT: b64dec(F.tangents_f32_b64, Float32Array), flex: F.flex, knot: F.knot, toModel: F.toModel };
  }
  const sdf = { ...A.sdf, d: b64dec(A.sdf.int8_b64, Int8Array) };
  return { mesh, patch, sides, laces: A.laces, sdf, hiddenSkin: b64dec(A.hiddenSkin_u32_b64, Uint32Array), regions: A.regions, fit: A.fit, attribution: A.attribution };
}

// ------------------------------------------------------------------ one shoe on her foot
export function wearShoe(D, S, ch, opts = {}) {
  const O = { ...SHOE_DEFAULTS, ...opts }, sd = D.sides[S], NV = D.mesh.nv, J = ch.joints;
  const fj = J.names.indexOf(sd.carriedBy), tj = J.names.indexOf(sd.toes), cj = J.names.indexOf(S + "_Calf"), Jf = J.rest[fj];
  const F = sd.flex.point, fwd = unit(sd.flex.forward), K = unit(sd.flex.axis), half = sd.flex.zoneM / 2;
  // each vertex's share of the forefoot's turn (0 behind the flex zone, 1 in front, smooth between)
  // and the parts of Rodrigues' formula that do not change: R(t) v = v cos t + (k x v) sin t + k (k.v)(1 - cos t)
  const wv = new Float64Array(NV), pre = new Float64Array(NV * 27), X0 = sd.rest, N0 = sd.restN, T0 = sd.restT;
  const rod = (v, o) => { const kv = K[0] * v[0] + K[1] * v[1] + K[2] * v[2]; pre[o] = v[0]; pre[o + 1] = v[1]; pre[o + 2] = v[2]; pre[o + 3] = K[1] * v[2] - K[2] * v[1]; pre[o + 4] = K[2] * v[0] - K[0] * v[2]; pre[o + 5] = K[0] * v[1] - K[1] * v[0]; pre[o + 6] = K[0] * kv; pre[o + 7] = K[1] * kv; pre[o + 8] = K[2] * kv; };
  for (let v = 0; v < NV; v++) {
    const u = (X0[3 * v] - F[0]) * fwd[0] + (X0[3 * v + 1] - F[1]) * fwd[1] + (X0[3 * v + 2] - F[2]) * fwd[2], t = Math.max(0, Math.min(1, (u + half) / (2 * half)));
    wv[v] = t * t * (3 - 2 * t);
    rod([X0[3 * v] - F[0], X0[3 * v + 1] - F[1], X0[3 * v + 2] - F[2]], 27 * v); rod([N0[3 * v], N0[3 * v + 1], N0[3 * v + 2]], 27 * v + 9); rod([T0[4 * v], T0[4 * v + 1], T0[4 * v + 2]], 27 * v + 18);
  }
  const sh = {
    S, opts: O, toeAngle: 0, pos: new Float32Array(NV * 3), nor: new Float32Array(NV * 3), tan: new Float32Array(NV * 4),
    bent: new Float64Array(NV * 3), bentN: new Float64Array(NV * 3), bentT: new Float64Array(NV * 4), frame: null, stats: { solves: 0, laceSteps: 0 },
  };
  // the bend (her rest frame): the forefoot turned by q about the flex line - positions, normals, tangents
  function bend(q) {
    for (let v = 0; v < NV; v++) {
      const t = q * wv[v], c = Math.cos(t), s = Math.sin(t), C = 1 - c, o = 27 * v, x = 3 * v, y = 4 * v;
      sh.bent[x] = F[0] + pre[o] * c + pre[o + 3] * s + pre[o + 6] * C; sh.bent[x + 1] = F[1] + pre[o + 1] * c + pre[o + 4] * s + pre[o + 7] * C; sh.bent[x + 2] = F[2] + pre[o + 2] * c + pre[o + 5] * s + pre[o + 8] * C;
      sh.bentN[x] = pre[o + 9] * c + pre[o + 12] * s + pre[o + 15] * C; sh.bentN[x + 1] = pre[o + 10] * c + pre[o + 13] * s + pre[o + 16] * C; sh.bentN[x + 2] = pre[o + 11] * c + pre[o + 14] * s + pre[o + 17] * C;
      sh.bentT[y] = pre[o + 18] * c + pre[o + 21] * s + pre[o + 24] * C; sh.bentT[y + 1] = pre[o + 19] * c + pre[o + 22] * s + pre[o + 25] * C; sh.bentT[y + 2] = pre[o + 20] * c + pre[o + 23] * s + pre[o + 26] * C; sh.bentT[y + 3] = T0[y + 3];
    }
  }

  // ---- the vamp's canvas
  const PT = D.patch, NP = PT.np, idx = D.mesh.indices, pin = PT.pinned;
  const pp = new Float64Array(NP * 3), tgt = new Float64Array(NP * 3), tgtN = new Float64Array(NP * 3), prevT = new Float64Array(NP * 3);
  const corner = new Uint32Array(NP * 3); for (let i = 0; i < NP; i++) { const f = PT.tri[i]; corner[3 * i] = 3 * idx[3 * f]; corner[3 * i + 1] = 3 * idx[3 * f + 1]; corner[3 * i + 2] = 3 * idx[3 * f + 2]; }
  const target = (X, N) => {
    for (let i = 0; i < NP; i++) {
      const b0 = PT.bary[3 * i], b1 = PT.bary[3 * i + 1], b2 = PT.bary[3 * i + 2], a = corner[3 * i], b = corner[3 * i + 1], c = corner[3 * i + 2], o = 3 * i;
      tgt[o] = b0 * X[a] + b1 * X[b] + b2 * X[c]; tgt[o + 1] = b0 * X[a + 1] + b1 * X[b + 1] + b2 * X[c + 1]; tgt[o + 2] = b0 * X[a + 2] + b1 * X[b + 2] + b2 * X[c + 2];
      const nx = b0 * N[a] + b1 * N[b] + b2 * N[c], ny = b0 * N[a + 1] + b1 * N[b + 1] + b2 * N[c + 1], nz = b0 * N[a + 2] + b1 * N[b + 2] + b2 * N[c + 2], l = Math.hypot(nx, ny, nz) || 1;
      tgtN[o] = nx / l; tgtN[o + 1] = ny / l; tgtN[o + 2] = nz / l;
    }
  };
  // the sheet as cut (the rest shoe): its constraints, flat - pairs, rest lengths, stiffness in
  // tension and in compression
  target(sd.rest, sd.restN);
  const nE = PT.edges.length / 2, nB = PT.bends.length / 2, CA = new Uint32Array(nE + nB), CB = new Uint32Array(nE + nB), CL = new Float64Array(nE + nB), KT = new Float64Array(nE + nB), KC = new Float64Array(nE + nB);
  for (let e = 0; e < nE + nB; e++) {
    const bnd = e >= nE, a = bnd ? PT.bends[2 * (e - nE)] : PT.edges[2 * e], b = bnd ? PT.bends[2 * (e - nE) + 1] : PT.edges[2 * e + 1];
    CA[e] = a; CB[e] = b; CL[e] = Math.hypot(tgt[3 * a] - tgt[3 * b], tgt[3 * a + 1] - tgt[3 * b + 1], tgt[3 * a + 2] - tgt[3 * b + 2]);
    KT[e] = bnd ? O.bendShare : 1; KC[e] = bnd ? O.bendShare : O.compressionShare;
  }
  pp.set(tgt);
  let solvedAt = 0;
  function solvePatch(force) {
    if (!force && Math.abs(sh.toeAngle - solvedAt) < O.solveEveryRad) return false;
    prevT.set(tgt);
    target(sh.bent, sh.bentN);
    // carried with the shoe's bend, then the sheet's own constraints (warm: from its last shape)
    for (let i = 0; i < 3 * NP; i++) pp[i] = pin[(i / 3) | 0] ? tgt[i] : pp[i] + (tgt[i] - prevT[i]);
    const nC = CL.length, maxS = O.maxStandoffM;
    for (let it = 0; it < O.patchIterations; it++) {
      for (let e = 0; e < nC; e++) {
        const a = 3 * CA[e], b = 3 * CB[e], dx = pp[b] - pp[a], dy = pp[b + 1] - pp[a + 1], dz = pp[b + 2] - pp[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-12, err = d - CL[e];
        const wa = pin[CA[e]] ? 0 : 1, wb = pin[CB[e]] ? 0 : 1, c = ((err > 0 ? KT[e] : KC[e]) * err) / d / (wa + wb);
        pp[a] += wa * c * dx; pp[a + 1] += wa * c * dy; pp[a + 2] += wa * c * dz; pp[b] -= wb * c * dx; pp[b + 1] -= wb * c * dy; pp[b + 2] -= wb * c * dz;
      }
      // outside the shoe's bent shape (her foot is under it), and no further than a standoff from it
      for (let i = 0; i < NP; i++) {
        if (pin[i]) continue;
        const o = 3 * i; let dx = pp[o] - tgt[o], dy = pp[o + 1] - tgt[o + 1], dz = pp[o + 2] - tgt[o + 2];
        const dn = dx * tgtN[o] + dy * tgtN[o + 1] + dz * tgtN[o + 2];
        if (dn < 0) { dx -= dn * tgtN[o]; dy -= dn * tgtN[o + 1]; dz -= dn * tgtN[o + 2]; }
        const el = Math.sqrt(dx * dx + dy * dy + dz * dz), s = el > maxS ? maxS / el : 1;
        pp[o] = tgt[o] + dx * s; pp[o + 1] = tgt[o + 1] + dy * s; pp[o + 2] = tgt[o + 2] + dz * s;
      }
    }
    solvedAt = sh.toeAngle; sh.stats.solves++;
    return true;
  }
  sh.patch = { points: pp, target: tgt, targetN: tgtN, pos: new Float32Array(PT.nrv * 3), nor: new Float32Array(PT.nrv * 3), tan: new Float32Array(PT.nrv * 4) };
  // how much the vamp is creased: its free points' mean standoff from the bent shape (m)
  sh.creaseDepth = () => { let s = 0, n = 0; for (let i = 0; i < NP; i++) if (!pin[i]) { s += Math.hypot(pp[3 * i] - tgt[3 * i], pp[3 * i + 1] - tgt[3 * i + 1], pp[3 * i + 2] - tgt[3 * i + 2]); n++; } return n ? s / n : 0; };

  // ---- the shoe and its patch in the world (her foot's frame this frame)
  const W = new Float64Array(NP * 3), NPn = new Float64Array(NP * 3);
  function toWorld(Pf, Gf) {
    const X = sh.bent, N = sh.bentN, T = sh.bentT, g0 = Gf[0], g1 = Gf[1], g2 = Gf[2], g3 = Gf[3], g4 = Gf[4], g5 = Gf[5], g6 = Gf[6], g7 = Gf[7], g8 = Gf[8];
    for (let v = 0; v < NV; v++) {
      const o = 3 * v, x = X[o] - Jf[0], y = X[o + 1] - Jf[1], z = X[o + 2] - Jf[2], t = 4 * v;
      sh.pos[o] = Pf[0] + g0 * x + g1 * y + g2 * z; sh.pos[o + 1] = Pf[1] + g3 * x + g4 * y + g5 * z; sh.pos[o + 2] = Pf[2] + g6 * x + g7 * y + g8 * z;
      sh.nor[o] = g0 * N[o] + g1 * N[o + 1] + g2 * N[o + 2]; sh.nor[o + 1] = g3 * N[o] + g4 * N[o + 1] + g5 * N[o + 2]; sh.nor[o + 2] = g6 * N[o] + g7 * N[o + 1] + g8 * N[o + 2];
      sh.tan[t] = g0 * T[t] + g1 * T[t + 1] + g2 * T[t + 2]; sh.tan[t + 1] = g3 * T[t] + g4 * T[t + 1] + g5 * T[t + 2]; sh.tan[t + 2] = g6 * T[t] + g7 * T[t + 1] + g8 * T[t + 2]; sh.tan[t + 3] = T[t + 3];
    }
    // the patch: its points to the world; normals from its own triangles (the pinned edge keeps the
    // shoe's, so the seam with the rest of the shoe does not show); tangents as the shoe's there
    for (let i = 0; i < NP; i++) { const o = 3 * i, x = pp[o] - Jf[0], y = pp[o + 1] - Jf[1], z = pp[o + 2] - Jf[2]; W[o] = Pf[0] + g0 * x + g1 * y + g2 * z; W[o + 1] = Pf[1] + g3 * x + g4 * y + g5 * z; W[o + 2] = Pf[2] + g6 * x + g7 * y + g8 * z; }
    NPn.fill(0);
    const Ti = PT.indices, vp = PT.vpoint;
    for (let f = 0; f < Ti.length; f += 3) {
      const a = 3 * vp[Ti[f]], b = 3 * vp[Ti[f + 1]], c = 3 * vp[Ti[f + 2]], ux = W[b] - W[a], uy = W[b + 1] - W[a + 1], uz = W[b + 2] - W[a + 2], wx = W[c] - W[a], wy = W[c + 1] - W[a + 1], wz = W[c + 2] - W[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      NPn[a] += nx; NPn[a + 1] += ny; NPn[a + 2] += nz; NPn[b] += nx; NPn[b + 1] += ny; NPn[b + 2] += nz; NPn[c] += nx; NPn[c + 1] += ny; NPn[c + 2] += nz;
    }
    const PN = sh.patch, sn = sh.nor, st = sh.tan;
    for (let r = 0; r < PT.nrv; r++) {
      const i = vp[r], o = 3 * i, b0 = PT.bary[o], b1 = PT.bary[o + 1], b2 = PT.bary[o + 2], ca = corner[o], cb = corner[o + 1], cc = corner[o + 2], r3 = 3 * r, r4 = 4 * r;
      PN.pos[r3] = W[o]; PN.pos[r3 + 1] = W[o + 1]; PN.pos[r3 + 2] = W[o + 2];
      let mx = b0 * sn[ca] + b1 * sn[cb] + b2 * sn[cc], my = b0 * sn[ca + 1] + b1 * sn[cb + 1] + b2 * sn[cc + 1], mz = b0 * sn[ca + 2] + b1 * sn[cb + 2] + b2 * sn[cc + 2];
      let ml = Math.hypot(mx, my, mz) || 1; mx /= ml; my /= ml; mz /= ml;
      let nx = NPn[o], ny = NPn[o + 1], nz = NPn[o + 2]; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (pin[i]) { nx = mx; ny = my; nz = mz; }
      PN.nor[r3] = nx; PN.nor[r3 + 1] = ny; PN.nor[r3 + 2] = nz;
      const ta = (ca / 3) * 4, tb = (cb / 3) * 4, tc = (cc / 3) * 4;
      let tx = b0 * st[ta] + b1 * st[tb] + b2 * st[tc], ty = b0 * st[ta + 1] + b1 * st[tb + 1] + b2 * st[tc + 1], tz = b0 * st[ta + 2] + b1 * st[tb + 2] + b2 * st[tc + 2];
      const td = tx * nx + ty * ny + tz * nz; tx -= td * nx; ty -= td * ny; tz -= td * nz; ml = Math.hypot(tx, ty, tz) || 1;
      PN.tan[r4] = tx / ml; PN.tan[r4 + 1] = ty / ml; PN.tan[r4 + 2] = tz / ml; PN.tan[r4 + 3] = st[ta + 3];
    }
  }

  // ---- the bow
  const L = D.laces, seg = O.laceSegmentM, KN = sd.knot, kUp = unit(KN.up), kFwd = unit(KN.forward);
  // (across the shoe, towards her foot's outside: her left is -x)
  const c0 = unit(cross(kFwd, kUp)), kSide = c0[0] * (S === "L" ? -1 : 1) >= 0 ? c0 : c0.map((x) => -x);
  const strands = [];
  // a loop to each side and a tail to each side, tied: their shapes in her rest frame (they then hang)
  for (const [kind, len, sgn] of [["loop", L.loopsM[0], 1], ["loop", L.loopsM[1], -1], ["tail", L.tailsM[0], 1], ["tail", L.tailsM[1], -1]]) {
    const n = Math.max(3, Math.round(len / seg)), pts = [], side = kSide.map((x) => x * sgn);
    // (a loop: a teardrop out to the side, drooping over the side of the throat; a tail: out to the side
    // and down, a little forward - drawn finely, then resampled to equal steps)
    const fine = 400;
    for (let i = 0; i <= fine; i++) {
      const s = i / fine;
      if (kind === "loop") { const th = 2 * Math.PI * s, a = len * 0.17, b = len * 0.11, out = a * (1 - Math.cos(th)); pts.push(KN.point.map((p, k) => p + side[k] * out + kFwd[k] * b * Math.sin(th) + kUp[k] * (0.003 - 0.35 * out * out / (2 * a)))); }
      else { const d = unit([0, 1, 2].map((k) => side[k] * 0.75 + kFwd[k] * 0.25 - kUp[k] * 0.6)); pts.push(KN.point.map((p, k) => p + d[k] * len * s + kUp[k] * 0.003)); }
    }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const sc = len / cum[cum.length - 1], rest = [];
    for (let i = 0, j = 0; i <= n; i++) {
      const at = (i / n) * cum[cum.length - 1]; while (j < cum.length - 2 && cum[j + 1] < at) j++;
      const t = (at - cum[j]) / (cum[j + 1] - cum[j] || 1), p = pts[j].map((x, k) => x + (pts[j + 1][k] - x) * t);
      rest.push(KN.point.map((c, k) => c + (p[k] - c) * sc));
    }
    const segL = len / n, flat = Float64Array.from(rest.flat());
    // its bending: each point's distance to the one after next, as tied
    const skip = new Float64Array(n + 1); for (let i = 0; i + 2 <= n; i++) skip[i] = Math.hypot(flat[3 * i + 6] - flat[3 * i], flat[3 * i + 7] - flat[3 * i + 1], flat[3 * i + 8] - flat[3 * i + 2]);
    // its shape memory: firm at the knot, fading along the lace (for a loop, from either end)
    const hold = new Float64Array(n + 1); for (let i = 0; i <= n; i++) { const along = (kind === "loop" ? Math.min(i, n - i) : i) * segL; hold[i] = O.knotHold * Math.exp(-along / O.knotHoldM); if (hold[i] < 0.004) hold[i] = 0; }
    strands.push({ kind, n, sgn, segL, rest: flat, skip, hold, aim: new Float64Array(3 * (n + 1)), x: null, xp: null, local: null });
  }
  sh.laces = { strands, widthM: L.widthM, thicknessM: L.thicknessM, knot: null, up: null, fwd: null, side: null };
  const TM = sd.toModel, Am = TM.A, SD_ = D.sdf;
  // the frame's transforms this frame: her rest frame -> the world (less the origin o), and the world
  // (less o) -> the model's frame for the distance field
  const fr = { Pf: [0, 0, 0], Gf: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0], Mw: new Float64Array(9), mw: new Float64Array(3), Gw: new Float64Array(9) };
  function setFrame(Pf, Gf, o) {
    fr.Pf = Pf; fr.Gf = Gf; fr.o = o;
    // model = A (rest - oSide) + c, rest = Jf + Gf^T (w + o - Pf): Mw = A Gf^T, mw = A (Jf - Gf^T (Pf - o) - oSide) + c
    const Gt = [Gf[0], Gf[3], Gf[6], Gf[1], Gf[4], Gf[7], Gf[2], Gf[5], Gf[8]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) fr.Mw[3 * i + j] = Am[i][0] * Gt[j] + Am[i][1] * Gt[3 + j] + Am[i][2] * Gt[6 + j];
    const q = mv(Gt, [Pf[0] - o[0], Pf[1] - o[1], Pf[2] - o[2]]), r = [Jf[0] - q[0] - TM.o[0], Jf[1] - q[1] - TM.o[1], Jf[2] - q[2] - TM.o[2]];
    for (let i = 0; i < 3; i++) fr.mw[i] = Am[i][0] * r[0] + Am[i][1] * r[1] + Am[i][2] * r[2] + TM.c[i];
    // (a gradient in the model's frame back to the world: Gf A^T, normalised after)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) fr.Gw[3 * i + j] = Gf[3 * i] * Am[j][0] + Gf[3 * i + 1] * Am[j][1] + Gf[3 * i + 2] * Am[j][2];
    // the bow's tied shape in the world this frame
    for (const st of strands) for (let i = 0; i <= st.n; i++) { const x = st.rest[3 * i] - Jf[0], y = st.rest[3 * i + 1] - Jf[1], z = st.rest[3 * i + 2] - Jf[2]; st.aim[3 * i] = Pf[0] + Gf[0] * x + Gf[1] * y + Gf[2] * z - o[0]; st.aim[3 * i + 1] = Pf[1] + Gf[3] * x + Gf[4] * y + Gf[5] * z - o[1]; st.aim[3 * i + 2] = Pf[2] + Gf[6] * x + Gf[7] * y + Gf[8] * z - o[2]; }
  }
  // a lace point kept outside the shoe (want: the lace's half thickness and a margin)
  const want = L.thicknessM / 2 + 0.0006;
  function outsideShoe(x, r) {
    const M = fr.Mw, m0 = M[0] * x[r] + M[1] * x[r + 1] + M[2] * x[r + 2] + fr.mw[0], m1 = M[3] * x[r] + M[4] * x[r + 1] + M[5] * x[r + 2] + fr.mw[1], m2 = M[6] * x[r] + M[7] * x[r + 1] + M[8] * x[r + 2] + fr.mw[2];
    const { cell, nx, ny, nz, origin, stepM, d } = SD_;
    const fx = (m0 - origin[0]) / cell - 0.5, fy = (m1 - origin[1]) / cell - 0.5, fz = (m2 - origin[2]) / cell - 0.5, i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return;
    const tx = fx - i, ty = fy - j, tz = fz - k, b = (k * ny + j) * nx + i, sy = nx, sz = nx * ny;
    const c000 = d[b], c100 = d[b + 1], c010 = d[b + sy], c110 = d[b + sy + 1], c001 = d[b + sz], c101 = d[b + sz + 1], c011 = d[b + sz + sy], c111 = d[b + sz + sy + 1];
    const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx, x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx, y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty, dist = (y0 + (y1 - y0) * tz) * stepM;
    if (dist >= want) return;
    const g0 = ((c100 - c000) * (1 - ty) + (c110 - c010) * ty) * (1 - tz) + ((c101 - c001) * (1 - ty) + (c111 - c011) * ty) * tz, g1 = (x10 - x00) * (1 - tz) + (x11 - x01) * tz, g2 = y1 - y0, G = fr.Gw;
    const wx = G[0] * g0 + G[1] * g1 + G[2] * g2, wy = G[3] * g0 + G[4] * g1 + G[5] * g2, wz = G[6] * g0 + G[7] * g1 + G[8] * g2, wl = Math.hypot(wx, wy, wz); if (!(wl > 0)) return;
    const s = (want - dist) / wl; x[r] += wx * s; x[r + 1] += wy * s; x[r + 2] += wz * s;
  }
  function placeLaces(o) { for (const st of strands) { st.x = Float64Array.from(st.aim); st.xp = Float64Array.from(st.aim); } sh.laces.origin = o.slice(); }
  // n steps of h: forces { g, air } in the frame, the ground (a plane: dot(x, n) >= h, relative to o)
  function stepLaces(n, h, fz, ground, ankle) {
    const { g, air } = fz, k = O.laceDragK, damp = O.laceDamping, o = fr.o, Gf = fr.Gf, Pf = fr.Pf;
    // the knot this frame, and its two ends a lace's width apart along the shoe
    const kx = KN.point[0] - Jf[0], ky = KN.point[1] - Jf[1], kz = KN.point[2] - Jf[2];
    const knot = [Pf[0] + Gf[0] * kx + Gf[1] * ky + Gf[2] * kz - o[0], Pf[1] + Gf[3] * kx + Gf[4] * ky + Gf[5] * kz - o[1], Pf[2] + Gf[6] * kx + Gf[7] * ky + Gf[8] * kz - o[2]];
    const fw = mv(Gf, kFwd), hw = L.widthM * 0.5, end0 = [knot[0] - fw[0] * hw, knot[1] - fw[1] * hw, knot[2] - fw[2] * hw], end1 = [knot[0] + fw[0] * hw, knot[1] + fw[1] * hw, knot[2] + fw[2] * hw];
    // (the frame's origin moved: the points carried over to it)
    const po = sh.laces.origin || o, sx = po[0] - o[0], sy = po[1] - o[1], sz = po[2] - o[2];
    if (sx || sy || sz) for (const st of strands) for (let i = 0; i <= st.n; i++) { st.x[3 * i] += sx; st.x[3 * i + 1] += sy; st.x[3 * i + 2] += sz; st.xp[3 * i] += sx; st.xp[3 * i + 1] += sy; st.xp[3 * i + 2] += sz; }
    sh.laces.origin = o.slice();
    const ab = ankle ? [ankle.b[0] - ankle.a[0], ankle.b[1] - ankle.a[1], ankle.b[2] - ankle.a[2]] : null, abL2 = ab ? ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1 : 1, th = L.thicknessM / 2, bendS = O.laceBendShare;
    for (let s = 0; s < n; s++) {
      for (const st of strands) {
        const x = st.x, xp = st.xp, last = st.n, loop = st.kind === "loop", hold = st.hold, aim = st.aim;
        // integrate (Verlet, damped): gravity in the frame, the air's drag on the lace
        for (let i = 1; i <= last; i++) {
          if (loop && i === last) continue;
          const r = 3 * i, vx = (x[r] - xp[r]) * damp, vy = (x[r + 1] - xp[r + 1]) * damp, vz = (x[r + 2] - xp[r + 2]) * damp;
          xp[r] = x[r]; xp[r + 1] = x[r + 1]; xp[r + 2] = x[r + 2];
          const wx = air[0] - vx / h, wy = air[1] - vy / h, wz = air[2] - vz / h, wm = Math.sqrt(wx * wx + wy * wy + wz * wz) * k;
          x[r] += vx + (g[0] + wm * wx) * h * h; x[r + 1] += vy + (g[1] + wm * wy) * h * h; x[r + 2] += vz + (g[2] + wm * wz) * h * h;
        }
        const e0 = loop ? end0 : st.sgn > 0 ? end0 : end1;
        for (let it = 0; it < O.laceIterations; it++) {
          // the knot holds its ends; the bow's shape is held near it
          x[0] = e0[0]; x[1] = e0[1]; x[2] = e0[2];
          if (loop) { const r = 3 * last; x[r] = end1[0]; x[r + 1] = end1[1]; x[r + 2] = end1[2]; }
          for (let i = 1; i <= last; i++) { const a = hold[i]; if (!a || (loop && i === last)) continue; const r = 3 * i; x[r] += (aim[r] - x[r]) * a; x[r + 1] += (aim[r + 1] - x[r + 1]) * a; x[r + 2] += (aim[r + 2] - x[r + 2]) * a; }
          // inextensible
          for (let i = 0; i < last; i++) {
            const a = 3 * i, b = a + 3, dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-12;
            const wa = i === 0 ? 0 : 1, wb = loop && i + 1 === last ? 0 : 1, ws = wa + wb; if (!ws) continue;
            const c = (d - st.segL) / d / ws;
            x[a] += wa * c * dx; x[a + 1] += wa * c * dy; x[a + 2] += wa * c * dz; x[b] -= wb * c * dx; x[b + 1] -= wb * c * dy; x[b + 2] -= wb * c * dz;
          }
          // bending: each point and the one after next back towards their tied distance
          for (let i = 0; i + 2 <= last; i++) {
            const a = 3 * i, b = a + 6, dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-12;
            const wa = i === 0 ? 0 : 1, wb = loop && i + 2 === last ? 0 : 1, ws = wa + wb; if (!ws) continue;
            const c = (bendS * (d - st.skip[i])) / d / ws;
            x[a] += wa * c * dx; x[a + 1] += wa * c * dy; x[a + 2] += wa * c * dz; x[b] -= wb * c * dx; x[b + 1] -= wb * c * dy; x[b + 2] -= wb * c * dz;
          }
          // off the shoe (every other pass, and the last), the ground and her ankle
          if (it % 2 && it !== O.laceIterations - 1) continue;
          for (let i = 1; i <= last; i++) {
            if (loop && i === last) continue;
            const r = 3 * i;
            outsideShoe(x, r);
            if (ground) { const dn = x[r] * ground.n[0] + x[r + 1] * ground.n[1] + x[r + 2] * ground.n[2] - ground.h - th; if (dn < 0) { x[r] -= dn * ground.n[0]; x[r + 1] -= dn * ground.n[1]; x[r + 2] -= dn * ground.n[2]; } }
            if (ab) {
              const t = Math.max(0, Math.min(1, ((x[r] - ankle.a[0]) * ab[0] + (x[r + 1] - ankle.a[1]) * ab[1] + (x[r + 2] - ankle.a[2]) * ab[2]) / abL2));
              const cx = ankle.a[0] + ab[0] * t, cy = ankle.a[1] + ab[1] * t, cz = ankle.a[2] + ab[2] * t, dx = x[r] - cx, dy = x[r + 1] - cy, dz = x[r + 2] - cz, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d < ankle.r && d > 1e-9) { const s2 = ankle.r / d; x[r] = cx + dx * s2; x[r + 1] = cy + dy * s2; x[r + 2] = cz + dz * s2; }
            }
          }
        }
      }
      sh.stats.laceSteps++;
    }
    keepLocal();
    sh.laces.knot = knot; sh.laces.up = mv(Gf, kUp); sh.laces.fwd = fw; sh.laces.side = mv(Gf, kSide);
  }
  // (kept in her foot's frame too: paused, the laces stay as they lie on the shoe)
  function keepLocal() {
    const { Pf, Gf, o } = fr;
    for (const st of strands) {
      st.local = st.local || new Float64Array(st.x.length);
      for (let i = 0; i <= st.n; i++) { const wx = st.x[3 * i] + o[0] - Pf[0], wy = st.x[3 * i + 1] + o[1] - Pf[1], wz = st.x[3 * i + 2] + o[2] - Pf[2]; st.local[3 * i] = Jf[0] + Gf[0] * wx + Gf[3] * wy + Gf[6] * wz; st.local[3 * i + 1] = Jf[1] + Gf[1] * wx + Gf[4] * wy + Gf[7] * wz; st.local[3 * i + 2] = Jf[2] + Gf[2] * wx + Gf[5] * wy + Gf[8] * wz; }
    }
  }
  function carryLaces() {
    const { Pf, Gf, o } = fr;
    for (const st of strands) {
      if (!st.local) continue;
      for (let i = 0; i <= st.n; i++) { const x = st.local[3 * i] - Jf[0], y = st.local[3 * i + 1] - Jf[1], z = st.local[3 * i + 2] - Jf[2], r = 3 * i; st.x[r] = st.xp[r] = Pf[0] + Gf[0] * x + Gf[1] * y + Gf[2] * z - o[0]; st.x[r + 1] = st.xp[r + 1] = Pf[1] + Gf[3] * x + Gf[4] * y + Gf[5] * z - o[1]; st.x[r + 2] = st.xp[r + 2] = Pf[2] + Gf[6] * x + Gf[7] * y + Gf[8] * z - o[2]; }
    }
    const kx = KN.point[0] - Jf[0], ky = KN.point[1] - Jf[1], kz = KN.point[2] - Jf[2];
    sh.laces.origin = o.slice(); sh.laces.knot = [Pf[0] + Gf[0] * kx + Gf[1] * ky + Gf[2] * kz - o[0], Pf[1] + Gf[3] * kx + Gf[4] * ky + Gf[5] * kz - o[1], Pf[2] + Gf[6] * kx + Gf[7] * ky + Gf[8] * kz - o[2]];
    sh.laces.up = mv(Gf, kUp); sh.laces.fwd = mv(Gf, kFwd); sh.laces.side = mv(Gf, kSide);
  }
  const ankleOf = (pose, o) => { const Pf = pose.P[fj], Pc = pose.P[cj], d = unit([Pc[0] - Pf[0], Pc[1] - Pf[1], Pc[2] - Pf[2]]); return { a: [Pf[0] - o[0], Pf[1] - o[1], Pf[2] - o[2]], b: [Pf[0] + d[0] * O.ankleLengthM - o[0], Pf[1] + d[1] * O.ankleLengthM - o[1], Pf[2] + d[2] * O.ankleLengthM - o[2]], r: O.ankleRadiusM }; };

  // ---- each frame: the pose (P, G per joint), dt (0: paused), env { origin, g, air, ground }
  sh.update = (pose, dt, env = {}) => {
    const Pf = pose.P[fj], Gf = pose.G[fj], Gt = pose.G[tj];
    // her toes' angle about their joint's axis (their rotation relative to her foot's: Gf^T Gt)
    const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[3 * i + j] = Gf[i] * Gt[j] + Gf[3 + i] * Gt[3 + j] + Gf[6 + i] * Gt[6 + j];
    sh.toeAngle = angleAbout(R, K);
    bend(sh.toeAngle);
    solvePatch(!sh.frame);
    toWorld(Pf, Gf);
    const o = env.origin || [0, 0, 0];
    setFrame(Pf, Gf, o);
    // (her foot put somewhere else at once - on or off the bike, a reset: the bow tied again, hung)
    const jumped = sh.frame && Math.hypot(Pf[0] - sh.frame.Pf[0], Pf[1] - sh.frame.Pf[1], Pf[2] - sh.frame.Pf[2]) > O.jumpM;
    if (!strands[0].x || jumped) { placeLaces(o); if (jumped) stepLaces(O.jumpSettle, 1 / 240, { g: env.g || [0, 0, -9.81], air: [0, 0, 0] }, env.ground || null, ankleOf(pose, o)); }
    if (dt > 0) {
      const n = Math.max(1, Math.min(6, Math.round(dt * O.laceHz)));
      stepLaces(n, dt / n, { g: env.g || [0, 0, -9.81], air: env.air || [0, 0, 0] }, env.ground || null, ankleOf(pose, o));
    } else carryLaces();
    sh.frame = { Pf: Pf.slice(), Gf: Gf.slice() };
  };
  // the laces hang for n steps of h in still air (paused, posing: settling them where gravity puts them)
  sh.settleLaces = (pose, n = 240, h = 1 / 240, env = {}) => {
    const o = env.origin || [0, 0, 0];
    setFrame(pose.P[fj], pose.G[fj], o);
    if (!strands[0].x) placeLaces(o);
    stepLaces(n, h, { g: env.g || [0, 0, -9.81], air: [0, 0, 0] }, env.ground || null, ankleOf(pose, o));
  };
  return sh;
}

// the bow's strands for drawing: each a flat lace (its width and thickness), four sides along it -
// positions in the world (+ o), each side's normal, two triangles per side per segment. A flat lace
// bends more easily across its thickness than its width: where the strand curves its width leans
// towards the curve's binormal (up to half way: laces twist), where it runs straight its width is
// carried along from the knot (flat on the shoe)
export const LACE_SMOOTH = 3; // (drawn points per simulated segment: a Catmull-Rom spline through the points)
export function laceStrips(sh, o = [0, 0, 0]) {
  const out = [], w = sh.laces.widthM / 2, h = sh.laces.thicknessM / 2, up = sh.laces.up || [0, 0, 1], R = LACE_SMOOTH;
  for (const st of sh.laces.strands) {
    const m = st.n, X = st.x, Wd = (st.rW ||= new Float64Array((m + 1) * 3));
    // the lace's width at each of its points: carried along from the knot, leaning towards the curve's
    // binormal where it bends
    let rx = up[0], ry = up[1], rz = up[2];
    for (let i = 0; i <= m; i++) {
      const a = 3 * Math.max(0, i - 1), b = 3 * Math.min(m, i + 1), c = 3 * i;
      let tx = X[b] - X[a], ty = X[b + 1] - X[a + 1], tz = X[b + 2] - X[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let sx = ty * rz - tz * ry, sy = tz * rx - tx * rz, sz = tx * ry - ty * rx, sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-4) { sx = 0; sy = tz; sz = -ty; sl = Math.hypot(sx, sy, sz) || 1; }
      sx /= sl; sy /= sl; sz /= sl;
      if (i > 0 && i < m) {
        const kx = X[b] - 2 * X[c] + X[a], ky = X[b + 1] - 2 * X[c + 1] + X[a + 1], kz = X[b + 2] - 2 * X[c + 2] + X[a + 2];
        let bx = ty * kz - tz * ky, by = tz * kx - tx * kz, bz = tx * ky - ty * kx; const bl = Math.hypot(bx, by, bz), curv = bl / (st.segL * st.segL);
        if (bl > 1e-12) {
          bx /= bl; by /= bl; bz /= bl; if (bx * sx + by * sy + bz * sz < 0) { bx = -bx; by = -by; bz = -bz; }
          const f = Math.min(0.5, curv / 80); // (half way past ~1/40 m: a 2.5 cm bend)
          sx += (bx - sx) * f; sy += (by - sy) * f; sz += (bz - sz) * f; sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        }
      }
      if (i && sx * Wd[c - 3] + sy * Wd[c - 2] + sz * Wd[c - 1] < 0) { sx = -sx; sy = -sy; sz = -sz; }
      Wd[c] = sx; Wd[c + 1] = sy; Wd[c + 2] = sz;
      rx = sy * tz - sz * ty; ry = sz * tx - sx * tz; rz = sx * ty - sy * tx;
    }
    // drawn smooth: R points per segment along a Catmull-Rom spline, the width interpolated between
    const n = m * R, P = (st.rP ||= new Float32Array((n + 1) * 24)), N = (st.rN ||= new Float32Array((n + 1) * 24)), x = (st.rX ||= new Float64Array((n + 1) * 3)), wd = (st.rWd ||= new Float64Array((n + 1) * 3));
    for (let i = 0; i <= m; i++) for (let r = 0; r < (i < m ? R : 1); r++) {
      const t = r / R, t2 = t * t, t3 = t2 * t, p0 = 3 * Math.max(0, i - 1), p1 = 3 * i, p2 = 3 * Math.min(m, i + 1), p3 = 3 * Math.min(m, i + 2), q = 3 * (i * R + r);
      for (let k = 0; k < 3; k++) { x[q + k] = 0.5 * (2 * X[p1 + k] + (X[p2 + k] - X[p0 + k]) * t + (2 * X[p0 + k] - 5 * X[p1 + k] + 4 * X[p2 + k] - X[p3 + k]) * t2 + (3 * X[p1 + k] - X[p0 + k] - 3 * X[p2 + k] + X[p3 + k]) * t3); wd[q + k] = Wd[p1 + k] + (Wd[p2 + k] - Wd[p1 + k]) * t; }
    }
    for (let i = 0; i <= n; i++) {
      const a = 3 * Math.max(0, i - 1), b = 3 * Math.min(n, i + 1), c = 3 * i;
      let tx = x[b] - x[a], ty = x[b + 1] - x[a + 1], tz = x[b + 2] - x[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let sx = wd[c], sy = wd[c + 1], sz = wd[c + 2]; const d = sx * tx + sy * ty + sz * tz; sx -= d * tx; sy -= d * ty; sz -= d * tz; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      const nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx;
      // the four sides' edges at this point: (+w, +h) (-w, +h) (-w, -h) (+w, -h); side k from corner k to k+1
      const cw = [w, -w, -w, w], chh = [h, h, -h, -h], sn = [[nx, ny, nz], [-sx, -sy, -sz], [-nx, -ny, -nz], [sx, sy, sz]];
      for (let k = 0; k < 4; k++) for (let e = 0; e < 2; e++) {
        const q = (k + e) % 4, v = 24 * i + 6 * k + 3 * e;
        P[v] = x[c] + o[0] + sx * cw[q] + nx * chh[q]; P[v + 1] = x[c + 1] + o[1] + sy * cw[q] + ny * chh[q]; P[v + 2] = x[c + 2] + o[2] + sz * cw[q] + nz * chh[q];
        N[v] = sn[k][0]; N[v + 1] = sn[k][1]; N[v + 2] = sn[k][2];
      }
    }
    out.push({ kind: st.kind, P, N, count: n + 1 });
  }
  return out;
}
// the triangles of a lace of `count` points as laceStrips lays it out
export function laceStripIndices(count) {
  const I = [];
  for (let i = 0; i + 1 < count; i++) for (let k = 0; k < 4; k++) { const a = 8 * i + 2 * k, b = a + 1, c = a + 8, d = b + 8; I.push(a, b, c, b, d, c); }
  return Uint32Array.from(I);
}

// the knot: a small lump of lace where the bow is tied (an ellipsoid: a lace's width along the shoe,
// a width and a half across it, three-quarters of a width thick), positions and normals in the world (+ o)
export function knotMesh(sh, o = [0, 0, 0], seg = 10) {
  const K = sh.laces.knot, up = sh.laces.up, fw = sh.laces.fwd, sd = sh.laces.side;
  if (!K) return null;
  const a = sh.laces.widthM * 0.55, b = sh.laces.widthM * 0.75, c = sh.laces.widthM * 0.38, P = [], N = [], I = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= 2 * seg; j++) {
    const th = (Math.PI * i) / seg, ph = (Math.PI * j) / seg, x = Math.sin(th) * Math.cos(ph), y = Math.sin(th) * Math.sin(ph), z = Math.cos(th);
    for (let k = 0; k < 3; k++) { P.push(K[k] + o[k] + fw[k] * a * x + sd[k] * b * y + up[k] * c * (z + 0.6)); N.push((fw[k] * x) / a + (sd[k] * y) / b + (up[k] * z) / c); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < 2 * seg; j++) { const p = i * (2 * seg + 1) + j, q = p + 2 * seg + 1; I.push(p, q, p + 1, p + 1, q, q + 1); }
  for (let v = 0; v < N.length; v += 3) { const l = Math.hypot(N[v], N[v + 1], N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
  return { P: Float32Array.from(P), N: Float32Array.from(N), I: Uint32Array.from(I) };
}

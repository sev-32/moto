// LUCID MOTO core · her clothes: the LUCID Clothing Engine (T-shirt and jeans) on her riding body
// ------------------------------------------------------------------------------------------
// The engine - the Human Engine M26 cloth solver with the Clothing Engine R1 overlay (wardrobe,
// layer contact, trouser topology), vendored unchanged in src/vendor/lucid-clothing and bundled
// into this layer at build time - simulates against its own body: the Human Engine body, which is
// her Skin78 turned half a turn about +Y, with the same triangles in the same order (measured:
// assets/character/clothing/lucid_body_adapter_v1.json). Each frame her skin as it is drawn (the
// canonical path, 47_rider_render.js) is gathered into the engine's 15,602-vertex layout.
//
// The frame the cloth lives in rides with the bike: origin at the bike, axes fixed (world z up ->
// the engine's y up, as the garments were made). So the cloth feels what she feels: gravity less
// the bike's acceleration (braking, cornering, bumps), and the air the bike moves through as a
// wind from ahead. Nothing here writes to her body: the clothes are downstream only.
//
// Modes: "bound" - each garment on its carriers (where the engine anchors it to her skin), no
// dynamics, cheap; "live" - the engine stepped with a reduced per-frame budget; "quality" - the
// engine's own outfit qualification settings (verifyOutfitMotionR1), ~1 s of compute per frame:
// for renders on the virtual clock. CANDIDATE: the live budget, the skin colour, the wind.
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE) return;
  const MODULES = /*@@CLOTHING_MODULES@@*/ null;
  const MOTO = /*@@MOTO_CLOTHING@@*/ null; // (src/core/clothing: hangers.js - how the shirt hangs from its neckline; bra.js - her bust as her clothes feel it; stretch.js - stretch denim; layeredge.js - the jeans' open edges for the layer contact; fabricmap.js - fabric maps)
  const ASSET = {
    tshirt: /*@@GARMENT_TSHIRT@@*/ null,
    jeans: /*@@GARMENT_JEANS@@*/ null,
    details: /*@@GARMENT_JEANS_DETAILS@@*/ null,
    proxy: /*@@BODY_PROXY@@*/ null,
    adapter: /*@@BODY_ADAPTER@@*/ null,
    // the riding cut (tools/clothing/riding-cut.mjs, CANDIDATE): pattern lengths for her riding postures
    cut: /*@@RIDING_CUT@@*/ null,
    // her skin under each garment, well inside its openings (tools/clothing/skin-cover.mjs, CANDIDATE)
    cover: /*@@SKIN_COVER@@*/ null,
    // the jeans' fabric map (tools/clothing/fabric-map.mjs; the fabric lab paints it further, CANDIDATE)
    fabricJeans: /*@@FABRIC_JEANS@@*/ null,
  };
  const H = "labs/human-engine/", M26 = H + "clothing-safe/m26/source/public/src/clothing/", R1 = H + "clothing-engine/r1/src/";

  // the engine's own outfit settings (verifyOutfitMotionR1.mjs), and the reduced live budget. One
  // change, declared: the layer coupling's inner visual envelope 5 mm, not the qualification's 11.5 -
  // the jeans' rendered details (waistband, loops, pocket edges, rivets) stand 3.3 mm off them at the
  // median, 4.7 at the 90th percentile, 6.7 at the 99th (only the button, 10.3); held 14.5 mm off the
  // jeans' shell, her T-shirt stood out round her hips and rolled over the waistband's top edge
  const SETTINGS = {
    quality: {
      simHz: 120, renderLevels: 2,
      jeans: { stretch: 0.9, selfCollision: true, retention: true, iterations: 14, collisionPasses: 2, collisionPolishPasses: 2, postContactIterations: 2, skinFrictionStatic: 0.64, skinFrictionDynamic: 0.48, safetyFullEvery: 1,
        pantsOccupancy: true, pantsOccupancyScale: 1.0, pantsOccupancyMaxCorrectionM: 0.01, pantsContainment: true, pantsContainmentMarginM: 0.0015, pantsContainmentMaxCorrectionM: 0.012, pantsContainmentPasses: 3, pantsContainmentStrength: 0.92, pantsContainmentCouplingPasses: 2 },
      shirt: { selfCollision: true, iterations: 13, collisionPasses: 2, collisionPolishPasses: 2, postContactIterations: 2, skinFrictionStatic: 0.58, skinFrictionDynamic: 0.42, safetyFullEvery: 1 },
      layer: { gapM: 0.003, innerVisualEnvelopeM: 0.005, maxDistanceM: 0.035, maxCorrectionM: 0.008, passes: 3, frictionStatic: 0.42, frictionDynamic: 0.3 },
      settle: 12, layerSettle: 8,
    },
    live: { // CANDIDATE: fewer iterations and passes, the watertight safety audit every 8th frame, 60 Hz
      simHz: 60, renderLevels: 1,
      jeans: { stretch: 0.9, selfCollision: true, retention: true, iterations: 6, collisionPasses: 1, collisionPolishPasses: 0, postContactIterations: 0, skinFrictionStatic: 0.64, skinFrictionDynamic: 0.48, safetyFullEvery: 8, substep: 1 / 120,
        pantsOccupancy: true, pantsOccupancyScale: 1.0, pantsOccupancyMaxCorrectionM: 0.01, pantsContainment: false },
      shirt: { selfCollision: true, iterations: 6, collisionPasses: 1, collisionPolishPasses: 0, postContactIterations: 0, skinFrictionStatic: 0.58, skinFrictionDynamic: 0.42, safetyFullEvery: 8 },
      layer: { gapM: 0.003, innerVisualEnvelopeM: 0.005, maxDistanceM: 0.035, maxCorrectionM: 0.008, passes: 1, frictionStatic: 0.42, frictionDynamic: 0.3 },
      settle: 6, layerSettle: 4,
    },
  };
  const WD = (CORE.wardrobe = {
    SETTINGS, // (the engine's settings by mode: tools tune them before setMode builds the engine)
    enabled: !!(MODULES && ASSET.tshirt && ASSET.jeans && ASSET.adapter), visible: true, mode: "bound",
    worn: { shirt: true, jeans: true, details: true },
    tint: { shirt: [0.86, 0.86, 0.84], jeans: [1, 1, 1], details: [1, 1, 1] }, roughness: { shirt: 0.86, jeans: 0.9, details: 0.6 },
    wear: 0.8, // how worn the jeans are (0 new .. 1 well worn): the fading at thighs, knees, seat, hems
    // the render's lift of cloth lying on her (the engine's own is 0.85 mm): the jeans 2.5 mm - her
    // skin bulges between their vertices at a bent knee, a raised hip, and would cut through them; the
    // shirt 1 mm - her skin under it is not drawn, and lifted points made puckers where it touched her
    // in patches (her bust's apexes)
    contactLiftM: { shirt: 0.001, jeans: 0.0025 },
    hemBandM: 0.015, hemBendScale: 2.5,
    hemStrips: true, // (the turned-up hem allowances drawn inside the openings)
    maxStretch: { shirt: 0.12, jeans: 0.3 }, // (cotton jersey; stretch denim)
    windScreen: 0.3, windFairing: 0.2, windTurbulence: 0.12, // (shelter behind the screen / the fairing, flutter)
    // the air: from ahead at the bike's speed, times this (1 = fully exposed; the screen and her
    // tuck shelter her - not modelled yet)
    windScale: 1,
    // the jeans' riding cut: true - as stretch denim (src/core/clothing/stretch.js: their pattern
    // standing, stretching towards the cut where her pose asks, a firm waistband); "pattern" - as
    // their pattern (every edge at its riding length, standing too); false - their standing pattern
    ridingCut: true,
    // the jeans' fabric map (src/core/clothing/fabricmap.js): baked in when the engine is built - the
    // fabric lab's (fabricMap) or the build's default; false: the lab's own bake alone
    fabric: true, fabricMap: null,
    stats: { frames: 0, steps: 0, stepMs: 0, lastStepMs: 0, mode: null, cut: {}, paused: 0 },
    error: null, ready: false,
  });
  let E = null, gpu = null, prog = null;

  // ------------------------------------------------------------------ the engine and its body
  const b64 = (s, T) => { const raw = atob(s), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return new T(u.buffer); };
  // a fabric map's creases for the shader: each stroke's straight pieces on its flat (x0, y0, x1, y1)
  // and (width, depth, side, ends: 1 its first piece, 2 its last - a crease fades out at its ends), at
  // most MAX_CREASE of them
  const MAX_CREASE = 64;
  function creaseSegments(map) {
    const out = new Float32Array(8 * MAX_CREASE); let n = 0;
    for (const c of map.creases) { const m = c.xy.length - 1; for (let i = 0; i < m && n < MAX_CREASE; i++, n++) out.set([c.xy[i][0], c.xy[i][1], c.xy[i + 1][0], c.xy[i + 1][1], c.widthM, c.depth, c.side, (i === 0 ? 1 : 0) + (i === m - 1 ? 2 : 0)], 8 * n); }
    return { data: out, count: n };
  }
  function build(mode) {
    const M = MODULES, S = SETTINGS[mode === "quality" ? "quality" : "live"], ch = CORE.character;
    const heToSkin = b64(ASSET.adapter.heToSkin78_u16_b64, Uint16Array), indices = Uint32Array.from(b64(ASSET.adapter.indices_u16_b64, Uint16Array)), NH = heToSkin.length;
    // her rest body in the engine frame (the half turn of her master frame) - where the garments were made
    const V0 = ch.vrest, bindP = new Float32Array(NH * 3), bindN = new Float32Array(NH * 3), N0 = new Float64Array(V0.length);
    smoothNormals(V0, ch.faces, N0);
    for (let i = 0; i < NH; i++) {
      const s = 3 * heToSkin[i], o = 3 * i;
      bindP[o] = -V0[s]; bindP[o + 1] = V0[s + 1]; bindP[o + 2] = -V0[s + 2];
      bindN[o] = -N0[s]; bindN[o + 1] = N0[s + 1]; bindN[o + 2] = -N0[s + 2];
    }
    // her bra as her clothes feel it: the contact surface at her bust smoothed (her skin is not changed)
    const heOf = Array.from({ length: ch.nv }, () => []);
    for (let i = 0; i < NH; i++) heOf[heToSkin[i]].push(i);
    const cups = MOTO ? MOTO["bra.js"].makeBra(ch) : null;
    const wear = cups ? (P) => cups.apply((v, out, o) => { const k = 3 * heOf[v][0]; out[o] = P[k]; out[o + 1] = P[k + 1]; out[o + 2] = P[k + 2]; }, (v, x, y, z) => { for (const i of heOf[v]) { P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z; } }) : () => {};
    wear(bindP);
    const proxy = new M[M26 + "watertightBodyProxy.js"].WatertightBodyProxy(ASSET.proxy);
    proxy.updateFromBody(bindP, 1 / S.simHz);
    const dec = M[M26 + "garmentAsset.js"].decodeGarmentAsset;
    const shirt = dec(ASSET.tshirt), jeans = dec(ASSET.jeans);
    // the jeans' fabric map baked into their fabric-field channels before the engine is built on them
    // (src/core/clothing/fabricmap.js): the one painted in the fabric lab, or the build's default
    let fabric = null;
    if (MOTO && WD.fabric && (WD.fabricMap || ASSET.fabricJeans)) {
      const F = MOTO["fabricmap.js"];
      try { const map = WD.fabricMap || F.decodeMap(ASSET.fabricJeans, jeans), baked = F.bakeFabric(jeans, map); fabric = { map, folded: baked.folded, creased: baked.creasedVertices, segments: creaseSegments(map) }; }
      catch (e) { console.warn("[wardrobe] fabric map:", e?.message || e); }
    }
    WD.stats.fabric = fabric ? { folded: fabric.folded, creased: fabric.creased, creases: fabric.map.creases.length } : null;
    const W = new M[R1 + "wardrobeRuntime.js"].WardrobeRuntime({ bodyIndices: indices, bodyPositions: bindP, bodyNormals: bindN, bodyPrevPositions: bindP, bodySafetyProxy: proxy });
    const g = {};
    if (WD.worn.jeans) g.jeans = W.addGarment("jeans", jeans, { layer: 10, solverSettings: { ...S.jeans } });
    if (WD.worn.shirt) g.shirt = W.addGarment("shirt", shirt, { layer: 20, solverSettings: { ...S.shirt } });
    if (WD.ridingCut && ASSET.cut) for (const [k, gg] of Object.entries(g)) {
      const c = ASSET.cut.garments?.[k]; if (!c) continue;
      if (WD.ridingCut === "pattern" || !MOTO) WD.stats.cut[k] = applyCut(gg.solver, c);
      else { const X = MOTO["stretch.js"].installStretch(gg.solver, c, b64); WD.stats.cut[k] = { stretch: true, waistband: X.bandVertices }; }
    }
    // the shirt hangs from its neckline: long-range attachments, its ring, its place on her neck's base
    if (g.shirt && MOTO) MOTO["hangers.js"].installHangers(g.shirt.solver, WD.hangerOptions || {});
    // (her neck's axis in the engine frame: the neck joint, turned)
    const nj = ch.joints.rest[ch.joints.names.indexOf("NeckTwist01")], neckXZ = [-nj[0], -nj[2]];
    const open = {};
    for (const [k, gg] of Object.entries(g)) {
      const sv = gg.solver, comp = sv.componentIds, R0 = sv.rest;
      // (the shirt's neckline is finished by its rib band: no hem there)
      const neckline = k === "shirt" ? (v) => comp[v] === 6 || (Math.hypot(R0[3 * v] - neckXZ[0], R0[3 * v + 2] - neckXZ[1]) < 0.15 && R0[3 * v + 1] > 1.25)
        : (v) => R0[3 * v + 1] > 0.6; // (the jeans' waist is finished by the waistband - the details)
      open[k] = openingDistance(sv, neckline);
      WD.stats.hemBends = (WD.stats.hemBends || 0) + stiffenHems(sv, open[k], WD.hemBandM, WD.hemBendScale);
      sv._windAt = windField(sv);
    }
    const layer = g.jeans && g.shirt ? W.coupleLayers("jeans", "shirt", { ...S.layer }) : null;
    // (the jeans' open edges rounded for the coupling: src/core/clothing/layeredge.js)
    if (layer && MOTO && WD.roundEdges !== false) MOTO["layeredge.js"].roundInnerEdges(layer);
    if (layer) layer.settings.enabled = false;
    const det = g.jeans && ASSET.details ? new M[M26 + "jeansDetailRuntime.js"].JeansDetailRuntime(ASSET.details, jeans.indices) : null;
    const detRest = det ? Float32Array.from(det.positions) : null; // (the details as made: where they are on the jeans)
    const SM = M[M26 + "renderSupermesh.js"].ClothRenderSupermesh;
    const sup = {};
    for (const [k, gg] of Object.entries(g)) {
      const s = gg.solver, a = gg.asset;
      sup[k] = new SM({ positions: s.renderPositions, normals: s.renderNormals, indices: a.indices, colors: a.colors, levels: S.renderLevels, shellVertexCount: s.shellVertexCount, edges: s.edges, edgeRest: s.edgeRest });
      // (its render-only lift of cloth lying on her - WD.contactLiftM; the physics keeps every cloth
      // vertex outside her)
      sup[k].wrinkle.renderContactLiftM = typeof WD.contactLiftM === "number" ? WD.contactLiftM : WD.contactLiftM[k] ?? 0.0025;
    }
    // per render vertex: the distance to an opening (hem stitches), or -1 on the shirt's rib band
    const stitch = {};
    for (const [k, gg] of Object.entries(g)) {
      const comp = gg.solver.componentIds, d = open[k], n0 = gg.solver.vertexCount;
      let a = new Float32Array(n0);
      for (let i = 0; i < n0; i++) a[i] = k === "shirt" && comp[i] === 6 ? -1 : Math.min(d[i], 1);
      for (const st of sup[k].stages) {
        const b2 = new Float32Array(st.vertexCount); b2.set(a);
        for (let e = 0; e < st.edgeA.length; e++) { const x = a[st.edgeA[e]], y = a[st.edgeB[e]]; b2[st.inputVertexCount + e] = x < 0 || y < 0 ? (x < 0 && y < 0 ? -1 : 0.05) : 0.5 * (x + y); }
        a = b2;
      }
      stitch[k] = a;
    }
    // the shirt drawn without the engine's rib rows, and its rib neckband drawn in their place
    const draw = {}, band = g.shirt ? neckBand(g.shirt.solver, sup.shirt, stitch.shirt, ch) : null;
    if (band) draw.shirt = band.shirtIndices;
    return { mode, S, W, g, layer, det, detRest, neckXZ, sup, stitch, draw, band, proxy, heToSkin, NH, wear, fabric, body: new Float32Array(NH * 3), bodyN: new Float32Array(NH * 3), prevBody: new Float32Array(NH * 3), lastBody: null,
      origin: null, lastT: null, vel: null, acc: [0, 0, 0], anchored: false };
  }
  // how far each vertex of a garment is from its openings, along the cloth (shortest paths over its
  // edges, on its rest shape); `skip` leaves out openings (the shirt's neckline: its rib band)
  function openingDistance(solver, skip = null) {
    const I = solver.indices, n = solver.vertexCount, P = solver.rest, use = new Map(), K = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
    for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const key = K(I[f + k], I[f + (k + 1) % 3]); use.set(key, (use.get(key) || 0) + 1); }
    const adj = Array.from({ length: n }, () => []), d = new Float64Array(n).fill(Infinity);
    for (const [key, c] of use) {
      const a = Math.floor(key / 4194304), b = key % 4194304, L = Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
      adj[a].push([b, L]); adj[b].push([a, L]);
      if (c === 1) { if (!skip || !skip(a)) d[a] = 0; if (!skip || !skip(b)) d[b] = 0; }
    }
    let queue = []; for (let v = 0; v < n; v++) if (d[v] === 0) queue.push(v);
    while (queue.length) { const nx = []; for (const v of queue) for (const [u, L] of adj[v]) if (d[v] + L < d[u] - 1e-9) { d[u] = d[v] + L; nx.push(u); } queue = nx; }
    return d;
  }
  // sewn hems: a hem is a stitched double layer, stiffer in bending than the cloth - the bends within
  // bandM of an opening get scale x the bend stiffness, through the engine's own per-bend stiffness
  // scales (its fabric field). CANDIDATE: declared band and factor.
  function stiffenHems(solver, d, bandM, scale) {
    const B = solver.bends, S = solver.bendStiffnessScale;
    if (!S) return 0;
    let c = 0;
    for (let k = 0; k < B.length; k += 2) if (d[B[k]] <= bandM && d[B[k + 1]] <= bandM) { S[k >> 1] *= scale; c++; }
    return c;
  }
  // stretch limits: no edge of the cloth longer than (1 + max) its rest length - cotton jersey and
  // stretch denim stretch so far and no further. After each engine step: the positions brought back
  // and the velocity that would keep stretching the edge removed (the rest of the motion kept).
  function limitStretch(solver, max, passes = 3) {
    if (!(max > 0)) return 0;
    const E2 = solver.edges, R = solver.edgeRest, P = solver.pos, V = solver.vel, w = solver.invMass;
    let fixed = 0;
    for (let it = 0; it < passes; it++) for (let k = 0; k < E2.length; k += 2) {
      const rl = R[k >> 1]; if (!(rl >= 0.001)) continue;
      const ia = E2[k], ib = E2[k + 1], a = 3 * ia, b = 3 * ib, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], l = Math.hypot(dx, dy, dz), lim = rl * (1 + max);
      if (l <= lim) continue;
      const wa = w ? w[ia] : 1, wb = w ? w[ib] : 1, den = wa + wb; if (den <= 0) continue;
      const nx = dx / l, ny = dy / l, nz = dz / l, c = (l - lim) / den;
      P[a] += wa * c * nx; P[a + 1] += wa * c * ny; P[a + 2] += wa * c * nz; P[b] -= wb * c * nx; P[b + 1] -= wb * c * ny; P[b + 2] -= wb * c * nz;
      const vr = (V[b] - V[a]) * nx + (V[b + 1] - V[a + 1]) * ny + (V[b + 2] - V[a + 2]) * nz;
      if (vr > 0) { const q = vr / den; V[a] += wa * q * nx; V[a + 1] += wa * q * ny; V[a + 2] += wa * q * nz; V[b] -= wb * q * nx; V[b + 1] -= wb * q * ny; V[b + 2] -= wb * q * nz; }
      fixed++;
    }
    return fixed;
  }
  // the air around her on the bike (engine frame, origin at the bike, y up): the still air seen from
  // the bike, sheltered below the screen's top and by the fairing (CANDIDATE: a height model, not a
  // flow solution), with turbulence growing with the speed for the cloth's flutter. Installed as the
  // solver's wind sample (its _windAt, which its aerodynamics call per triangle).
  function windField(solver) {
    return (x, y, z) => {
      const w = solver.settings.wind, sp = Math.hypot(w[0], w[1], w[2]);
      if (sp < 1e-6) return [0, 0, 0];
      const top = E.screenY ?? 0.42;
      const u = Math.min(1, Math.max(0, (y - (top - 0.1)) / 0.15)), shelter = (y < top - 0.32 ? WD.windFairing : WD.windScreen) + (1 - WD.windScreen) * u * u * (3 - 2 * u);
      const t = solver._simTime || 0, k = 1 / 0.18, a = WD.windTurbulence * sp * shelter;
      const tx = Math.sin(2.17 * x * k + 1.13 * y * k + 0.71 * z * k + 9.1 * t) + 0.45 * Math.sin(-0.63 * x * k + 1.57 * z * k - 5.3 * t + 1.2);
      const ty = Math.sin(-0.83 * x * k + 1.91 * y * k + 1.37 * z * k + 11.7 * t + 0.7) + 0.4 * Math.sin(1.29 * x * k - 0.91 * z * k + 4.1 * t + 2.1);
      const tz = Math.sin(1.47 * x * k - 0.67 * y * k + 2.03 * z * k - 7.3 * t + 1.4) + 0.35 * Math.sin(0.77 * y * k + 1.61 * z * k + 3.7 * t + 0.2);
      return [w[0] * shelter + tx * a * 0.45, w[1] * shelter + ty * a * 0.45, w[2] * shelter + tz * a * 0.45];
    };
  }
  // the riding cut: each edge and bend of the pattern at least as long as the cut - in the engine's
  // baked rest metric (its final stretch pass and its strain metric) and the authored one
  function applyCut(solver, cut) {
    if (!cut) return 0;
    let n = 0;
    for (const [pairs, rests, key] of [["edges", ["edgeRest", "edgeRestAuthored"], "edgeRest_f32_b64"], ["bends", ["bendRest", "bendRestAuthored"], "bendRest_f32_b64"]]) {
      if (!cut[key]) continue;
      const c = b64(cut[key], Float32Array);
      if (c.length !== solver[pairs].length / 2) throw Error(`riding cut ${key}: ${c.length} for ${solver[pairs].length / 2} ${pairs}`);
      for (const r of rests) { const a = solver[r]; if (!a) continue; for (let i = 0; i < c.length; i++) if (c[i] > a[i]) { a[i] = c[i]; n++; } }
    }
    return n;
  }
  function smoothNormals(X, F, N) {
    N.fill(0);
    for (let f = 0; f < F.length; f += 3) {
      const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2];
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  }
  // her drawn skin (world, z up) -> the engine body (frame riding with the bike: x' = -x, y' = z, z' = y)
  function gather(X, N, o, P, PN) {
    const m = E.heToSkin;
    for (let i = 0; i < E.NH; i++) {
      const s = 3 * m[i], k = 3 * i;
      P[k] = -(X[s] - o[0]); P[k + 1] = X[s + 2] - o[2]; P[k + 2] = X[s + 1] - o[1];
      PN[k] = -N[s]; PN[k + 1] = N[s + 2]; PN[k + 2] = N[s + 1];
    }
    E.wear(P);
  }
  const toWorld = (src, o, dst) => { for (let i = 0; i < src.length; i += 3) { dst[i] = -src[i] + o[0]; dst[i + 1] = src[i + 2] + o[1]; dst[i + 2] = src[i + 1] + o[2]; } };
  const toWorldN = (src, dst) => { for (let i = 0; i < src.length; i += 3) { dst[i] = -src[i]; dst[i + 1] = src[i + 2]; dst[i + 2] = src[i + 1]; } };

  // ------------------------------------------------------------------ stepping
  function setFrameForces(dt, still = false) {
    // the frame's motion: the bike's position (origin) and velocity; its acceleration filtered
    // over ~40 ms (the cloth feels the bike's surges, not single-step chassis noise). still: the
    // frame at rest - no wind, no surge (her standing still; the filter's state is kept)
    const v = still ? [0, 0, 0] : (typeof free !== "undefined" && free?.v) ? free.v : [0, 0, 0];
    if (!still) {
      if (E.vel && dt > 0) {
        const a = 1 - Math.exp(-dt / 0.04);
        for (let k = 0; k < 3; k++) E.acc[k] += ((v[k] - E.vel[k]) / dt - E.acc[k]) * a;
      }
      E.vel = v.slice();
    }
    const acc = still ? [0, 0, 0] : E.acc;
    // (the screen's top in the frame: ~1.06 m above the road - CANDIDATE, the 916's screen)
    E.screenY = 1.06 - ((typeof free !== "undefined" && free?.p) ? free.p[2] : 0.64);
    // gravity in the frame, less its acceleration (world (ax, ay, az) -> engine (-ax, az, ay))
    const g = [0, 0, -9.81], ga = [g[0] - acc[0], g[1] - acc[1], g[2] - acc[2]];
    const gE = [-ga[0], ga[2], ga[1]];
    // the still air seen from the frame: -v (world) -> engine
    const ws = WD.windScale, wE = [v[0] * ws, -v[2] * ws, -v[1] * ws];
    for (const gg of Object.values(E.g)) { gg.solver.settings.gravity = gE; gg.solver.settings.gravityScale = 1; gg.solver.settings.wind = wE; }
  }
  function limits() {
    for (const [k, gg] of Object.entries(E.g)) {
      const c = limitStretch(gg.solver, WD.maxStretch[k]);
      // (a limited edge can be drawn into her: the engine's own contact pass puts it back outside)
      if (c) gg.solver._collideVertices(1 / E.S.simHz);
      WD.stats.stretchFixes = (WD.stats.stretchFixes || 0) + c;
      gg.solver.syncRender();
    }
  }
  function anchor() {
    for (const gg of Object.values(E.g)) gg.solver.reanchorToCurrentBody({ safetyPasses: E.mode === "quality" ? 4 : 1 });
    if (E.mode !== "bound") {
      const h = 1 / E.S.simHz;
      for (let i = 0; i < E.S.settle; i++) { E.W.setBodySurface(E.body, E.bodyN, E.body, h); E.W.stepFrame(h); limits(); }
      if (E.layer) E.layer.settings.enabled = true;
      for (let i = 0; i < E.S.layerSettle; i++) { E.W.setBodySurface(E.body, E.bodyN, E.body, h); E.W.stepFrame(h); limits(); }
    }
    E.anchored = true;
  }
  function step(X, N) {
    const fp = (typeof free !== "undefined" && free?.p) ? free.p : [0, 0, 0];
    const o = [fp[0], fp[1], fp[2]];
    const t = (typeof free !== "undefined" && Number.isFinite(free?.time)) ? free.time : 0;
    const dt = E.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - E.lastT));
    E.lastT = t;
    E.prevBody.set(E.body);
    gather(X, N, o, E.body, E.bodyN);
    if (!E.anchored) { E.W.setBodySurface(E.body, E.bodyN, E.body, 1 / 120); anchor(); E.lastBody = Float32Array.from(E.body); E.origin = o; return; }
    if (E.mode === "bound") {
      E.W.setBodySurface(E.body, E.bodyN, E.prevBody, dt || 1 / 60);
      for (const gg of Object.values(E.g)) gg.solver.resetToCurrentPose();
    } else if (dt === 0) {
      // (the ride stands still - paused, posing: no time for the cloth; if her body moves the
      // garments go back onto their carriers, and WD.settle() lets them hang again)
      let moved = 0;
      for (let i = 0; i < E.body.length; i += 3) moved = Math.max(moved, Math.abs(E.body[i] - E.lastBody[i]) + Math.abs(E.body[i + 1] - E.lastBody[i + 1]) + Math.abs(E.body[i + 2] - E.lastBody[i + 2]));
      if (moved > 0.004) { E.W.setBodySurface(E.body, E.bodyN, E.body, 1 / 120); for (const gg of Object.values(E.g)) gg.solver.resetToCurrentPose(); WD.stats.paused++; }
    } else {
      setFrameForces(dt);
      // the body between the last frame and this one, at the engine's rate
      const h = 1 / E.S.simHz, n = Math.max(1, Math.min(4, Math.round(dt / h))), last = E.lastBody, cur = Float32Array.from(E.body), mid = E.body;
      for (let s = 1; s <= n; s++) {
        const u = s / n;
        E.prevBody.set(mid);
        for (let i = 0; i < cur.length; i++) mid[i] = last[i] + (cur[i] - last[i]) * u;
        E.W.setBodySurface(mid, E.bodyN, E.prevBody, dt / n);
        E.W.stepFrame(dt / n);
        limits();
        WD.stats.steps++;
      }
    }
    E.lastBody.set(E.body);
    E.origin = o;
  }

  // ------------------------------------------------------------------ drawing: fabric
  // Her clothes are lit by the scene's own lights - the legacy program's four directional lights,
  // hemisphere ambient, rim, ACES and gamma, which light the bike and her skin - with cloth added:
  // wrapped diffuse (light carried through the fibres), a sheen at grazing angles, and soft
  // occlusion in the folds. The fabric is evaluated where it lies on the garment (its rest shape),
  // so patterns stay on the cloth as it moves. Denim: a 3/1 right-hand twill of rope-dyed indigo
  // warp over an ecru weft, slubs, and wear (thighs, whiskers, knees, honeycombs, seat, hems).
  // Jersey: a single knit cotton with double-needle hems, faintly showing her skin where it lies on
  // her. Thread and a metal button for the details. Features finer than a pixel fade out, so they
  // never shimmer. CANDIDATE: every pattern, wear zone and coefficient here is declared (the lab's
  // fabric maps were not part of the handoff).
  const VS = `#version 300 es
precision highp float;
layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec3 c;layout(location=3)in vec3 rp;layout(location=4)in vec3 rn;layout(location=5)in vec3 aux;
uniform mat4 vp;
out vec3 W,N,C,Rp,Rn,X;
void main(){W=p;N=n;C=c;Rp=rp;Rn=rn;X=aux;gl_Position=vp*vec4(p,1.);}`;
  const FS = `#version 300 es
precision highp float;
in vec3 W,N,C,Rp,Rn,X;
uniform vec3 eye,tint,skin;uniform vec2 neck;uniform int kind;uniform float rough,sheen,wear;
uniform vec4 cs[${2 * 64}];uniform int ncs;
out vec4 o;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float h21(vec2 q){q=fract(q*vec2(123.34,456.21));q+=dot(q,q+45.32);return fract(q.x*q.y);}
float vn(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 q){return .5*vn(q)+.25*vn(q*2.03)+.125*vn(q*4.01)+.0625*vn(q*8.05);}
// how much of a pattern of f cycles per metre survives at this pixel (1 resolved .. 0 sub-pixel)
float keep(float q,float f){return 1.-smoothstep(.22,.55,fwidth(q)*f);}
float band(float x,float c,float w){return 1.-smoothstep(0.,w,abs(x-c));}
void main(){
 vec3 nn=normalize(N);if(!gl_FrontFacing)nn=-nn;vec3 V=normalize(eye-W);
 // where on the garment (rest shape, engine frame, metres: +y up, +z her front): along the grain
 // (rest y) and across it (around the body: front and back faces by x, the sides by z)
 vec3 rn=normalize(Rn+vec3(1e-6));float wf=abs(rn.z)/(abs(rn.z)+abs(rn.x)+1e-4);
 float along=Rp.y,across=mix(Rp.z*(rn.x<0.?-1.:1.),Rp.x*(rn.z<0.?-1.:1.),wf),ax=abs(Rp.x);
 vec3 alb=C*tint;float h=0.,metal=0.,r=rough,sh=sheen,ao=X.x;
 if(kind==0){
  // indigo is not a pure blue: the lab's colours, deepened and greyed (rope-dyed indigo reflects
  // some red and green)
  alb=mix(vec3(dot(alb,vec3(.2126,.7152,.0722))),alb,.55)*.9;
  // denim: 3/1 right-hand twill, wales ~1.5 mm apart at 63 deg; the ecru weft shows in the valleys
  float tw=along*.891+across*.454,rib=.5+.5*sin(6.2832*670.*tw),kt=keep(tw,670.);
  h+=(rib-.5)*.00012*kt;
  alb=mix(alb,vec3(.62,.58,.50),.10*(1.-rib)*kt+.035*(1.-kt));
  // slubs: uneven warp yarns, streaks along the grain; and the dye's slow mottling
  float sl=fbm(vec2(across*900.,along*22.));alb*=mix(1.,mix(.84,1.13,sl),keep(across,900.)*.9+.1);
  alb*=mix(.93,1.07,fbm(vec2(across,along)*14.));
  // wear: the fronts of the thighs, the knees, the seat and the hems (rest geometry of the M16
  // jeans: knee y .46, crotch .76, hem .14); and the creases set in them - the fabric map's strokes
  // (whiskers, honeycombs, stacking: src/core/clothing/fabricmap.js), measured on the flat each was
  // drawn on (her front or back, square on): faded on the ridge, the ridge raised, its sides sunk
  float fr=smoothstep(-.15,.45,rn.z),bk=smoothstep(-.15,.45,-rn.z);
  float thigh=fr*smoothstep(.56,.66,along)*(1.-smoothstep(.79,.86,along))*band(ax,.085,.065);
  float knee=fr*exp(-pow((along-.465)/.06,2.))*band(ax,.085,.055);
  float cr=0.;
  for(int k=0;k<${64};k++){if(k>=ncs)break;vec4 a=cs[2*k],b=cs[2*k+1];
   float face=b.z>0.?fr:bk;if(face<.01)continue;
   vec2 p0=a.xy,d=a.zw-a.xy;float t=clamp(dot(Rp.xy-p0,d)/max(dot(d,d),1e-8),0.,1.),dd=length(Rp.xy-p0-d*t),w=b.x;
   float ends=(mod(b.w,2.)>.5?smoothstep(0.,.4,t):1.)*(b.w>1.5?1.-smoothstep(.6,1.,t):1.)*(.8+.4*vn(Rp.xy*180.));
   float ridge=exp(-dd*dd/(w*w))*ends,side=exp(-pow((dd-1.4*w)/(.7*w),2.))*ends;
   cr=max(cr,b.y*face*ridge);h+=b.y*face*(.00035*ridge-.00012*side)*keep(dd,1./w);}
  float seat=bk*smoothstep(.80,.86,along)*(1.-smoothstep(.93,.97,along))*band(ax,.075,.07);
  float hem=1.-smoothstep(.15,.20,along);
  float fade=clamp(.5*thigh+.45*knee+.7*cr+.4*seat+.3*hem,0.,1.)*wear*(.75+.5*fbm(vec2(across,along)*40.));
  alb=mix(alb,vec3(.085,.13,.24),fade);
  // the hems at the ankles: turned up, chain-stitched in gold thread 12 mm from the edge
  float hs=band(X.z,.012,.001)*step(.004,X.z)*keep(X.z,300.)*step(.35,fract((across+along)*300.));
  alb=mix(alb,vec3(.58,.20,.02),.85*hs);h+=.00006*hs;
  r=max(r,.82);sh=.18;
 }else if(kind==1){
  if(X.z<0.){
   // the neckband: a 1x1 rib knit around her neck (wales across the band, ~6.5 per cm)
   float th=atan(Rp.z-neck.y,Rp.x-neck.x)*.065,rb=.5+.5*sin(6.2832*650.*th),kr=keep(th,650.);
   h+=(rb-.5)*.00022*kr;alb*=1.-.04*(1.-rb)*kr;r=max(r,.8);sh=.26;
  }else{
   // cotton single jersey: wales along the grain (~14 per cm), the yarn's mottling
   float wale=.5+.5*sin(6.2832*1400.*across);h+=(wale-.5)*.00007*keep(across,1400.);
   alb*=mix(.965,1.025,fbm(vec2(across,along)*55.));
   // the hems: turned up 2 cm, sewn with a twin needle (two rows of ~3 mm stitches, 6 mm apart)
   float st=(band(X.z,.014,.0009)+band(X.z,.020,.0009))*step(.4,fract((across+along)*330.)),ks=keep(X.z,300.)*step(.004,X.z);
   alb*=1.-.2*clamp(st,0.,1.)*ks;h+=.00005*clamp(st,0.,1.)*ks;
   alb*=1.-.03*(1.-smoothstep(.019,.023,X.z)); // (the double layer, a touch heavier)
   // thin white cotton lying on her shows her skin faintly (not through the doubled hem)
   alb=mix(alb,alb*skin*1.7,.11*X.y*smoothstep(.02,.026,X.z));
  }
  if(X.z>=0.){r=max(r,.78);sh=.30;}
 }else{
  // details: X.z = 1 thread (topstitching, a twisted ply), 2 metal (the button), 0 denim
  if(X.z>1.5){metal=.9;r=.32;sh=0.;}
  else if(X.z>.5){h+=.00008*sin(6.2832*2800.*(along+across))*keep(along+across,2800.);r=.72;sh=.35;}
  else{r=.85;sh=.18;}
 }
 // the weave's relief: bump from its height through screen-space derivatives
 vec3 dpx=dFdx(W),dpy=dFdy(W);float dhx=dFdx(h),dhy=dFdy(h);
 vec3 r1=cross(dpy,nn),r2=cross(nn,dpx);float det=dot(dpx,r1);
 if(abs(det)>1e-12)nn=normalize(abs(det)*nn-sign(det)*(dhx*r1+dhy*r2));
 vec3 sky=vec3(.38,.46,.52),ground=vec3(.12,.10,.085);float hemi=.5+.5*nn.z;vec3 amb=mix(ground,sky,hemi)*.30;
 vec3 dirs[4];dirs[0]=normalize(vec3(-.55,-.38,.74));dirs[1]=normalize(vec3(.62,.18,.54));dirs[2]=normalize(vec3(-.12,.88,.34));dirs[3]=normalize(vec3(.20,-.72,.58));
 vec3 lcol[4];lcol[0]=vec3(1.20,1.12,1.02);lcol[1]=vec3(.52,.67,.82);lcol[2]=vec3(.34,.45,.58);lcol[3]=vec3(.30,.26,.22);
 vec3 F0=mix(vec3(.035),alb,metal),spec=vec3(0),dif=vec3(0),wr=vec3(0);float shin=mix(110.,10.,clamp(r,0.,1.)),nv=max(dot(nn,V),0.);
 for(int i=0;i<4;i++){vec3 L=dirs[i],H=normalize(L+V);float nl=dot(nn,L),w=clamp((nl+.4)/1.4,0.,1.);
  dif+=lcol[i]*mix(max(nl,0.),w*w,.55);wr+=lcol[i]*w;
  float fh=pow(1.-max(dot(V,H),0.),5.);vec3 F=F0+(1.-F0)*fh;spec+=lcol[i]*F*pow(max(dot(nn,H),0.),shin)*(1.15-.70*r);}
 float rim=pow(1.-nv,3.);
 vec3 shn=sh*mix(vec3(1),alb/(max(max(alb.r,alb.g),alb.b)+1e-3),.45)*pow(1.-nv,2.5)*(amb*1.5+wr*.22);
 vec3 col=alb*(amb*ao+dif*.72*mix(1.,ao,.6))*(1.-metal*.72)+spec*mix(1.,ao,.5)+shn*ao+vec3(.08,.11,.14)*rim*.6;
 col=aces(col*1.18);col=pow(col,vec3(1./2.2));o=vec4(col,1);
}`;
  function program() {
    const mk = (t, src) => { const q = gl.createShader(t); gl.shaderSource(q, src); gl.compileShader(q); if (!gl.getShaderParameter(q, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(q)); return q; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const k of ["vp", "eye", "tint", "skin", "neck", "kind", "rough", "sheen", "wear", "cs", "ncs"]) u[k] = gl.getUniformLocation(p, k);
    return { p, u };
  }
  function vertexNormals(P, I) {
    const N = new Float32Array(P.length);
    for (let f = 0; f < I.length; f += 3) {
      const a = 3 * I[f], b = 3 * I[f + 1], c = 3 * I[f + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    return N;
  }
  // a garment mesh on the GPU: posed position and normal (per frame), colour (the lab's, taken from
  // display values to linear as its renderer does), its rest position and normal (where on the
  // garment), and aux (fold occlusion, skin contact, detail material)
  function meshGpu(nv, indices, colors, rest, mat) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const mk = (loc, data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); return b; };
    const pb = mk(0, nv * 12, gl.DYNAMIC_DRAW), nb = mk(1, nv * 12, gl.DYNAMIC_DRAW);
    const col = new Float32Array(nv * 3).fill(1);
    if (colors && colors.length === nv * 3) for (let i = 0; i < col.length; i++) col[i] = Math.pow(Math.max(0, colors[i]), 2.2);
    mk(2, col, gl.STATIC_DRAW);
    mk(3, Float32Array.from(rest), gl.STATIC_DRAW);
    mk(4, vertexNormals(rest, indices), gl.STATIC_DRAW);
    const aux = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { aux[3 * i] = 1; aux[3 * i + 2] = mat ? mat[i] : 0; }
    const xb = mk(5, aux, gl.DYNAMIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, pb, nb, xb, count: indices.length, indices, pos: new Float32Array(nv * 3), nor: new Float32Array(nv * 3), aux, acc: new Float32Array(nv), cnt: new Uint16Array(nv) };
  }
  // soft occlusion in the folds: how far a vertex sits below its neighbours (its concavity)
  function foldOcclusion(m, P, Nn, contact) {
    const acc = m.acc, cnt = m.cnt, I = m.indices, aux = m.aux;
    acc.fill(0); cnt.fill(0);
    for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) {
      const v = I[f + k], a = 3 * v;
      for (let j = 1; j < 3; j++) {
        const u = 3 * I[f + (k + j) % 3], dx = P[u] - P[a], dy = P[u + 1] - P[a + 1], dz = P[u + 2] - P[a + 2], L = Math.hypot(dx, dy, dz) || 1;
        acc[v] += (Nn[a] * dx + Nn[a + 1] * dy + Nn[a + 2] * dz) / L; cnt[v]++;
      }
    }
    for (let i = 0; i < acc.length; i++) {
      const c = cnt[i] ? acc[i] / cnt[i] : 0, t = Math.min(1, Math.max(0, (c - 0.03) / 0.3));
      aux[3 * i] = 1 - 0.75 * t * t * (3 - 2 * t);
      aux[3 * i + 1] = contact ? contact[i] : 0;
    }
  }
  function drawMesh(m, kind, k) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.nor);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.xb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.aux);
    const u = prog.u, RT = CORE.riderRender;
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(u.vp, false, global.__VP__); gl.uniform3fv(u.eye, global.__EYE__);
    gl.uniform3fv(u.tint, WD.tint[k]); gl.uniform3fv(u.skin, RT?.skinColor || [0.62, 0.37, 0.25]);
    gl.uniform1i(u.kind, kind); gl.uniform1f(u.rough, WD.roughness[k]); gl.uniform1f(u.sheen, 0.25); gl.uniform1f(u.wear, WD.wear);
    gl.uniform2fv(u.neck, E.neckXZ);
    const fs = E.fabric?.segments; gl.uniform1i(u.ncs, kind === 0 && fs ? fs.count : 0); if (kind === 0 && fs) gl.uniform4fv(u.cs, fs.data);
    gl.disable(gl.CULL_FACE); // (cloth: its inside shows at the collar, the sleeves, the hems)
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
  }
  // ------------------------------------------------------------------ the openings: hems
  // A garment's openings (the cuffs, the shirt's hem and neckline, the jeans' waist and ankles) are
  // single-layer boundaries of a coarse mesh: drawn as they are, they read as torn paper. Each frame
  // their edge is smoothed along itself (Taubin: a smoothing step and an inflating step, so the loop
  // does not shrink) and a hem allowance is drawn turned up inside it - 12 mm of the same cloth just
  // inside the edge, the double layer a sewn hem is. Render only: the engine's cloth is untouched.
  function hemsOf(s) {
    const I = s.indices, K = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a), use = new Map();
    for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const key = K(I[f + k], I[f + (k + 1) % 3]); use.set(key, (use.get(key) || 0) + 1); }
    const badj = new Map(), inner = new Map(), add = (m, a, b) => { let l = m.get(a); if (!l) m.set(a, (l = [])); l.push(b); };
    for (const [key, c] of use) if (c === 1) { const a = Math.floor(key / 4194304), b = key % 4194304; add(badj, a, b); add(badj, b, a); }
    for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const a = I[f + k]; if (!badj.has(a)) continue; for (let j = 1; j < 3; j++) { const b = I[f + (k + j) % 3]; if (!badj.has(b)) add(inner, a, b); } }
    const seen = new Set(), loops = [];
    for (const v0 of badj.keys()) {
      if (seen.has(v0) || badj.get(v0).length !== 2) continue;
      const ids = [v0]; seen.add(v0);
      let prev = -1, cur = v0;
      for (;;) { const nx = badj.get(cur).find((x) => x !== prev && !seen.has(x)); if (nx === undefined) break; ids.push(nx); seen.add(nx); prev = cur; cur = nx; }
      if (ids.length < 8 || !badj.get(cur).includes(v0)) continue; // (closed loops only)
      loops.push({ ids: Int32Array.from(ids), inner: ids.map((v) => inner.get(v) || []), tmp: new Float32Array(ids.length * 3) });
    }
    // the hem's fold line: from each edge vertex three rings in along the cloth (its neighbours away
    // from the edge, the farthest from it each time) - the turned-up allowance lies on the cloth up to there
    const nbr = new Map();
    for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const a = I[f + k]; let l = nbr.get(a); if (!l) nbr.set(a, (l = new Set())); l.add(I[f + (k + 1) % 3]); l.add(I[f + (k + 2) % 3]); }
    for (const L of loops) {
      const edge = new Set(L.ids), ring = new Map(Array.from(L.ids, (v) => [v, 0]));
      let front = [...L.ids];
      for (let r = 1; r <= 3; r++) { const nx = []; for (const v of front) for (const u of nbr.get(v) || []) if (!ring.has(u)) { ring.set(u, r); nx.push(u); } front = nx; }
      L.fold = Int32Array.from(L.ids, (v) => { let cur = v; for (let r = 1; r <= 3; r++) { let best = -1; for (const u of nbr.get(cur) || []) if (ring.get(u) === r && (best < 0 || u < best)) best = u; if (best < 0) break; cur = best; } return edge.has(cur) ? -1 : cur; });
    }
    return loops;
  }
  function smoothHems(loops, P) {
    for (const L of loops) {
      const ids = L.ids, n = ids.length, tmp = L.tmp;
      for (let it = 0; it < 2; it++) for (const f of [0.5, -0.53]) {
        for (let i = 0; i < n; i++) { const a = 3 * ids[(i + n - 1) % n], b = 3 * ids[i], c = 3 * ids[(i + 1) % n]; for (let k = 0; k < 3; k++) tmp[3 * i + k] = P[b + k] + f * (0.5 * (P[a + k] + P[c + k]) - P[b + k]); }
        for (let i = 0; i < n; i++) { const b = 3 * ids[i]; for (let k = 0; k < 3; k++) P[b + k] = tmp[3 * i + k]; }
      }
    }
  }
  // the turned-up hem allowances of a garment as one mesh: per loop vertex, the edge and the fold line
  // (three rings in along the cloth), lying on the cloth's inside
  function hemGpu(s, loops) {
    let n = 0; for (const L of loops) n += L.ids.length;
    const idx = [], rest = new Float32Array(n * 6), col = new Float32Array(n * 6);
    let o = 0;
    for (const L of loops) {
      const m = L.ids.length; L.base = o;
      for (let i = 0; i < m; i++) {
        const v = L.ids[i], a = o + 2 * i, b = o + 2 * ((i + 1) % m);
        idx.push(a, b, a + 1, b, b + 1, a + 1);
        for (let k = 0; k < 3; k++) { rest[3 * a + k] = rest[3 * a + 3 + k] = s.restPositions[3 * v + k]; col[3 * a + k] = col[3 * a + 3 + k] = s.colors ? s.colors[3 * v + k] : 1; }
      }
      o += 2 * m;
    }
    const g = meshGpu(2 * n, Uint32Array.from(idx), col, rest);
    for (let i = 0; i < 2 * n; i++) g.aux[3 * i] = i % 2 ? 0.7 : 0.9; // (the fold, inside the garment, is in its shade)
    g.sim = new Float32Array(2 * n * 3); g.simN = new Float32Array(2 * n * 3);
    return g;
  }
  function fillHems(g, loops, P, Nn) {
    for (const L of loops) {
      const m = L.ids.length;
      for (let i = 0; i < m; i++) {
        const v = 3 * L.ids[i], a = 3 * (L.base + 2 * i), b = a + 3, w = L.fold[i];
        for (let k = 0; k < 3; k++) { g.sim[a + k] = P[v + k] - Nn[v + k] * 0.0006; g.simN[a + k] = -Nn[v + k]; }
        if (w >= 0) { const q = 3 * w; for (let k = 0; k < 3; k++) { g.sim[b + k] = P[q + k] - Nn[q + k] * 0.0012; g.simN[b + k] = -Nn[q + k]; } }
        else for (let k = 0; k < 3; k++) { g.sim[b + k] = g.sim[a + k]; g.simN[b + k] = g.simN[a + k]; }
      }
    }
  }
  // ------------------------------------------------------------------ the neckband
  // A crew neck's rib band: a doubled strip of 1x1 rib knit sewn to the neckline, lying up the base of
  // her neck, its top edge a fold. The engine keeps three rib rows for the collar's mechanics, but they
  // lie flat - a 0.8 cm ring pointing in at her neck, held by fixed offsets in the world (so not up
  // her neck when she leans) - and drawn they read as a grey bib. Drawn instead: the band from the
  // shirt's neckline (its seam, as the cloth moves) to 1.8 cm up towards her neck, carried on her skin
  // (the engine's own body sampling: each row a point on one of her triangles, lifted off it), its
  // fold turned under. Render only. CANDIDATE: the band's width and lift.
  function neckBand(sv, s, st, ch) {
    // the shirt's drawn triangles: all but the rib rows'
    const I0 = s.indices, keep = [];
    for (let f = 0; f < I0.length; f += 3) if (!(st[I0[f]] < 0 && st[I0[f + 1]] < 0 && st[I0[f + 2]] < 0)) keep.push(I0[f], I0[f + 1], I0[f + 2]);
    const shirtIndices = Uint32Array.from(keep), R = s.restPositions;
    // the neckline: the highest opening of what is drawn
    const loops = hemsOf({ indices: shirtIndices });
    if (!loops.length) return null;
    const ys = loops.map((L) => { let y = 0; for (const v of L.ids) y += R[3 * v + 1]; return y / L.ids.length; });
    const ring = loops[ys.indexOf(Math.max(...ys))].ids, n = ring.length;
    // her neck's axis (rest, the engine frame), and the rows: towards it and up, on her skin
    const J = ch.joints.rest, jn = ch.joints.names, HE = (v) => [-v[0], v[1], -v[2]], A0 = HE(J[jn.indexOf("NeckTwist01")]), A1 = HE(J[jn.indexOf("Head")]);
    const ax = [A1[0] - A0[0], A1[1] - A0[1], A1[2] - A0[2]], al = Math.hypot(...ax), a = ax.map((x) => x / al);
    const ROWS = [[0.009, 0.0045], [0.018, 0.0045], [0.019, 0.002]], car = new Float32Array(n * ROWS.length * 5), rest = new Float32Array(n * (ROWS.length + 1) * 3);
    for (let j = 0; j < n; j++) {
      const v = ring[j], p = [R[3 * v], R[3 * v + 1], R[3 * v + 2]], t = (p[0] - A0[0]) * a[0] + (p[1] - A0[1]) * a[1] + (p[2] - A0[2]) * a[2];
      const c = [A0[0] + a[0] * (t + 0.025), A0[1] + a[1] * (t + 0.025), A0[2] + a[2] * (t + 0.025)], dd = [c[0] - p[0], c[1] - p[1], c[2] - p[2]], dl = Math.hypot(...dd) || 1;
      rest.set(p, 3 * j);
      ROWS.forEach(([along, lift], r) => {
        const q = [p[0] + (dd[0] / dl) * along, p[1] + (dd[1] / dl) * along, p[2] + (dd[2] / dl) * along], h = sv.bodyBVH.closestPoint(q[0], q[1], q[2], 0.1), k = 5 * (r * n + j);
        if (!h) { car[k] = -1; return; }
        const sm = sv.bodyBVH.sampleTriangle(h.ti, h.u, h.v, h.w);
        car[k] = h.ti; car[k + 1] = h.u; car[k + 2] = h.v; car[k + 3] = h.w; car[k + 4] = lift;
        rest.set([sm.qx + sm.nx * lift, sm.qy + sm.ny * lift, sm.qz + sm.nz * lift], 3 * ((r + 1) * n + j));
      });
    }
    return { shirtIndices, ring: Int32Array.from(ring), rows: ROWS.length, car, rest };
  }
  function bandGpu(B) {
    const n = B.ring.length, rows = B.rows + 1, idx = [];
    for (let r = 0; r < rows - 1; r++) for (let j = 0; j < n; j++) { const a = r * n + j, b = r * n + ((j + 1) % n), c = a + n, d = b + n; idx.push(a, b, c, b, d, c); }
    const g = meshGpu(rows * n, Uint32Array.from(idx), null, B.rest, new Float32Array(rows * n).fill(-1));
    for (let r = 0; r < rows; r++) for (let j = 0; j < n; j++) g.aux[3 * (r * n + j)] = [0.93, 1, 1, 0.82][r]; // (the seam's shadow, the fold's underside)
    g.sim = new Float32Array(rows * n * 3); g.simN = new Float32Array(rows * n * 3);
    return g;
  }
  function fillBand(g, B, sv, P) {
    const n = B.ring.length, rows = B.rows + 1, X = g.sim, Nn = g.simN, car = B.car;
    for (let j = 0; j < n; j++) { const v = 3 * B.ring[j]; X[3 * j] = P[v]; X[3 * j + 1] = P[v + 1]; X[3 * j + 2] = P[v + 2]; }
    const skinN = B.skinN || (B.skinN = new Float32Array(n * 3)), tmp = B.tmp || (B.tmp = new Float32Array(n * 3));
    for (let r = 0; r < B.rows; r++) for (let j = 0; j < n; j++) {
      const k = 5 * (r * n + j), o = 3 * ((r + 1) * n + j);
      if (car[k] < 0) { X[o] = X[o - 3 * n]; X[o + 1] = X[o - 3 * n + 1]; X[o + 2] = X[o - 3 * n + 2]; continue; }
      const sm = sv.bodyBVH.sampleTriangle(car[k], car[k + 1], car[k + 2], car[k + 3]), lift = car[k + 4];
      X[o] = sm.qx + sm.nx * lift; X[o + 1] = sm.qy + sm.ny * lift; X[o + 2] = sm.qz + sm.nz * lift;
      if (r === 0) { skinN[3 * j] = sm.nx; skinN[3 * j + 1] = sm.ny; skinN[3 * j + 2] = sm.nz; }
    }
    // (the carried rows smoothed along the band: her skin's relief - collarbones, the notch - is not
    // the band's; it lies smooth)
    for (let r = 1; r < rows; r++) for (let it = 0; it < 3; it++) {
      for (let j = 0; j < n; j++) { const a = 3 * (r * n + ((j + n - 1) % n)), b = 3 * (r * n + j), c = 3 * (r * n + ((j + 1) % n)); for (let k = 0; k < 3; k++) tmp[3 * j + k] = 0.25 * X[a + k] + 0.5 * X[b + k] + 0.25 * X[c + k]; }
      for (let j = 0; j < n; j++) { const b = 3 * (r * n + j); X[b] = tmp[3 * j]; X[b + 1] = tmp[3 * j + 1]; X[b + 2] = tmp[3 * j + 2]; }
    }
    // normals: along the band x across it, turned out (her skin's side away), the same for the fold
    for (let r = 0; r < rows; r++) for (let j = 0; j < n; j++) {
      const i = 3 * (r * n + j), jp = 3 * (r * n + ((j + 1) % n)), jm = 3 * (r * n + ((j + n - 1) % n)), r0 = Math.min(r, rows - 3), up = 3 * ((r0 + 2) * n + j), dn = 3 * (r0 * n + j);
      const t1 = [X[jp] - X[jm], X[jp + 1] - X[jm + 1], X[jp + 2] - X[jm + 2]], t2 = [X[up] - X[dn], X[up + 1] - X[dn + 1], X[up + 2] - X[dn + 2]];
      let nx = t1[1] * t2[2] - t1[2] * t2[1], ny = t1[2] * t2[0] - t1[0] * t2[2], nz = t1[0] * t2[1] - t1[1] * t2[0];
      const l = Math.hypot(nx, ny, nz) || 1, sg = nx * skinN[3 * j] + ny * skinN[3 * j + 1] + nz * skinN[3 * j + 2] < 0 ? -1 / l : 1 / l;
      Nn[i] = nx * sg; Nn[i + 1] = ny * sg; Nn[i + 2] = nz * sg;
    }
  }
  const KIND = { jeans: 0, shirt: 1, details: 2 };
  function draw() {
    const RT = CORE.riderRender;
    if (!WD.enabled || !WD.visible || !RT?.gpu || !CORE.riderBio?.active || !CORE.riderBio?.placed) return;
    if (WD.mode !== (E?.mode)) { E = null; gpu = null; }
    if (!E) { E = build(WD.mode); WD.ready = true; WD.stats.mode = WD.mode; }
    const t0 = performance.now();
    step(RT.gpu.pos, RT.gpu.nor);
    const ms = performance.now() - t0;
    WD.stats.lastStepMs = ms; WD.stats.stepMs += (ms - WD.stats.stepMs) * 0.1; WD.stats.frames++;
    if (!prog) prog = program();
    if (!gpu) {
      gpu = {};
      for (const [k, s] of Object.entries(E.sup)) { const I = E.draw[k] || s.indices; gpu[k] = meshGpu(s.vertexCount, I, s.colors, s.restPositions, E.stitch[k]); gpu[k].hems = hemsOf({ indices: I }).filter((L) => L.ids.every((v) => E.stitch[k][v] >= 0 && E.stitch[k][v] < 0.002)); /* (hemmed openings: not the shirt's rib neckline, nor the jeans' waistband) */ gpu[k + "Hem"] = hemGpu(s, gpu[k].hems); }
      if (E.band) gpu.band = bandGpu(E.band);
      if (E.det) {
        // (the details' materials by the lab's colours: the orange-gold topstitch thread, the button)
        const c = E.det.colors, n = c.length / 3, mat = new Float32Array(n);
        for (let i = 0; i < n; i++) { const r = c[3 * i], g = c[3 * i + 1], b = c[3 * i + 2]; mat[i] = r > 0.7 && g < 0.6 ? 1 : Math.abs(r - 0.58) < 0.06 && Math.abs(g - 0.54) < 0.06 ? 2 : 0; }
        gpu.details = meshGpu(n, E.det.indices, c, E.detRest, mat);
      }
    }
    const o = E.origin;
    for (const [k, s] of Object.entries(E.sup)) {
      if (!WD.worn[k]) continue;
      s.update(E.g[k].solver, 1 / 60);
      smoothHems(gpu[k].hems, s.positions);
      foldOcclusion(gpu[k], s.positions, s.normals, s._contactLevels?.[s._contactLevels.length - 1]);
      toWorld(s.positions, o, gpu[k].pos); toWorldN(s.normals, gpu[k].nor);
      drawMesh(gpu[k], KIND[k], k);
      const hg = gpu[k + "Hem"];
      if (WD.hemStrips) {
        fillHems(hg, gpu[k].hems, s.positions, s.normals);
        toWorld(hg.sim, o, hg.pos); toWorldN(hg.simN, hg.nor);
        drawMesh(hg, KIND[k], k);
      }
      if (k === "shirt" && gpu.band) { fillBand(gpu.band, E.band, E.g.shirt.solver, s.positions); toWorld(gpu.band.sim, o, gpu.band.pos); toWorldN(gpu.band.simN, gpu.band.nor); drawMesh(gpu.band, KIND.shirt, "shirt"); }
    }
    if (E.det && WD.worn.details && E.g.jeans) {
      E.det.update(E.g.jeans.solver.renderPositions);
      toWorld(E.det.positions, o, gpu.details.pos); toWorldN(E.det.normals, gpu.details.nor);
      drawMesh(gpu.details, KIND.details, "details");
    }
  }

  // ------------------------------------------------------------------ API
  WD.setMode = (m) => { if (!["bound", "live", "quality"].includes(m)) throw Error("mode: bound | live | quality"); WD.mode = m; E = null; gpu = null; return m; };
  WD.reanchor = () => { if (E) E.anchored = false; };
  // settle the cloth on her pose as it is, without time passing for the ride (for posing, stills):
  // in the wind and surge of the bike's motion as it stands, or still (the frame at rest: her
  // standing in the fitting room)
  WD.settle = (steps = 24, { still = false } = {}) => {
    if (!E || !E.anchored || E.mode === "bound") return 0;
    setFrameForces(0, still);
    const h = 1 / E.S.simHz;
    for (let i = 0; i < steps; i++) { E.W.setBodySurface(E.body, E.bodyN, E.body, h); E.W.stepFrame(h); limits(); }
    return steps;
  };
  WD.metrics = () => (E ? E.W.metrics() : null);
  WD.engine = () => E; // (for tools: the engine's state as built - its runtime, garments, body)
  // for the fabric lab (49_fabric_lab.js): the fabric-map module, the jeans as made (decoded once, never
  // baked into) and the build's default map
  let kitJeans = null;
  WD.fabricKit = () => (MOTO && MODULES && ASSET.jeans ? { F: MOTO["fabricmap.js"], asset: (kitJeans ||= MODULES[M26 + "garmentAsset.js"].decodeGarmentAsset(ASSET.jeans)), defaultMap: ASSET.fabricJeans } : null);
  // a fabric map worn from now on (null: the build's default): the engine rebuilt on it, the cloth settled
  WD.wearFabric = (map, { settle = 24, still = true } = {}) => { WD.fabricMap = map || null; WD.setMode(WD.mode); return settle; };
  WD.audit = () => {
    if (!E) return null;
    const o = {};
    for (const [k, gg] of Object.entries(E.g)) { const s = gg.solver, m = s.metrics(); o[k] = { p95Strain: m.shellP95Strain, p99Strain: m.shellP99Strain, maxSpeedMps: m.maxSpeedMps, finite: m.finite, inside: E.proxy.auditPoints(s.pos, { start: 0, end: s.shellVertexCount }).inside }; }
    if (E.layer) o.layer = { behind: E.layer.audit().behind };
    return o;
  };
  // (dressed: her skin is drawn as skin, not as the legacy leathers)
  WD.dressed = () => WD.enabled && WD.visible;
  // the Skin78 triangles her clothes cover, which her body draw leaves out (null: none)
  let hiddenKey = null, hiddenMask = null;
  WD.hiddenSkin = () => {
    if (!WD.dressed() || !ASSET.cover || !E) return null;
    const ids = ["shirt", "jeans"].filter((k) => WD.worn[k] && E.g[k] && ASSET.cover.garments?.[k]), key = ids.join(",");
    if (!ids.length) return null;
    if (key !== hiddenKey) {
      hiddenKey = key; hiddenMask = null;
      for (const k of ids) { const m = b64(ASSET.cover.garments[k].hidden_u8_b64, Uint8Array); if (!hiddenMask) hiddenMask = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) hiddenMask[i] |= m[i]; }
    }
    return hiddenMask;
  };

  // drawn right after her body, in the same frame (47_rider_render.js calls its afterDraw list)
  const RTL = CORE.riderRender;
  if (RTL?.afterDraw) RTL.afterDraw.push(() => { try { draw(); } catch (e) { WD.error = String(e?.stack || e); WD.enabled = false; console.error("wardrobe", e); } });
  global.__LUCID_CORE_WARDROBE_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

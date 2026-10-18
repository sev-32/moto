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
  const ASSET = {
    tshirt: /*@@GARMENT_TSHIRT@@*/ null,
    jeans: /*@@GARMENT_JEANS@@*/ null,
    details: /*@@GARMENT_JEANS_DETAILS@@*/ null,
    proxy: /*@@BODY_PROXY@@*/ null,
    adapter: /*@@BODY_ADAPTER@@*/ null,
    // the riding cut (tools/clothing/riding-cut.mjs, CANDIDATE): pattern lengths for her riding postures
    cut: /*@@RIDING_CUT@@*/ null,
  };
  const H = "labs/human-engine/", M26 = H + "clothing-safe/m26/source/public/src/clothing/", R1 = H + "clothing-engine/r1/src/";

  // the engine's own outfit settings (verifyOutfitMotionR1.mjs), and the reduced live budget
  const SETTINGS = {
    quality: {
      simHz: 120, renderLevels: 2,
      jeans: { selfCollision: true, retention: true, iterations: 14, collisionPasses: 2, collisionPolishPasses: 2, postContactIterations: 2, skinFrictionStatic: 0.64, skinFrictionDynamic: 0.48, safetyFullEvery: 1,
        pantsOccupancy: true, pantsOccupancyScale: 1.0, pantsOccupancyMaxCorrectionM: 0.01, pantsContainment: true, pantsContainmentMarginM: 0.0015, pantsContainmentMaxCorrectionM: 0.012, pantsContainmentPasses: 3, pantsContainmentStrength: 0.92, pantsContainmentCouplingPasses: 2 },
      shirt: { selfCollision: true, iterations: 13, collisionPasses: 2, collisionPolishPasses: 2, postContactIterations: 2, skinFrictionStatic: 0.58, skinFrictionDynamic: 0.42, safetyFullEvery: 1 },
      layer: { gapM: 0.003, innerVisualEnvelopeM: 0.0115, maxDistanceM: 0.035, maxCorrectionM: 0.008, passes: 3, frictionStatic: 0.42, frictionDynamic: 0.3 },
      settle: 12, layerSettle: 8,
    },
    live: { // CANDIDATE: fewer iterations and passes, the watertight safety audit every 8th frame, 60 Hz
      simHz: 60, renderLevels: 1,
      jeans: { selfCollision: true, retention: true, iterations: 6, collisionPasses: 1, collisionPolishPasses: 0, postContactIterations: 0, skinFrictionStatic: 0.64, skinFrictionDynamic: 0.48, safetyFullEvery: 8, substep: 1 / 120,
        pantsOccupancy: true, pantsOccupancyScale: 1.0, pantsOccupancyMaxCorrectionM: 0.01, pantsContainment: false },
      shirt: { selfCollision: true, iterations: 6, collisionPasses: 1, collisionPolishPasses: 0, postContactIterations: 0, skinFrictionStatic: 0.58, skinFrictionDynamic: 0.42, safetyFullEvery: 8 },
      layer: { gapM: 0.003, innerVisualEnvelopeM: 0.0115, maxDistanceM: 0.035, maxCorrectionM: 0.008, passes: 1, frictionStatic: 0.42, frictionDynamic: 0.3 },
      settle: 6, layerSettle: 4,
    },
  };
  const WD = (CORE.wardrobe = {
    enabled: !!(MODULES && ASSET.tshirt && ASSET.jeans && ASSET.adapter), visible: true, mode: "bound",
    worn: { shirt: true, jeans: true, details: true },
    tint: { shirt: [0.86, 0.86, 0.84], jeans: [1, 1, 1], details: [1, 1, 1] }, roughness: { shirt: 0.86, jeans: 0.9, details: 0.6 },
    // the air: from ahead at the bike's speed, times this (1 = fully exposed; the screen and her
    // tuck shelter her - not modelled yet)
    windScale: 1,
    ridingCut: true, // the jeans in the riding cut (their own standing pattern if false)
    stats: { frames: 0, steps: 0, stepMs: 0, lastStepMs: 0, mode: null, cut: {}, paused: 0 },
    error: null, ready: false,
  });
  let E = null, gpu = null, prog = null;

  // ------------------------------------------------------------------ the engine and its body
  const b64 = (s, T) => { const raw = atob(s), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return new T(u.buffer); };
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
    const proxy = new M[M26 + "watertightBodyProxy.js"].WatertightBodyProxy(ASSET.proxy);
    proxy.updateFromBody(bindP, 1 / S.simHz);
    const dec = M[M26 + "garmentAsset.js"].decodeGarmentAsset;
    const shirt = dec(ASSET.tshirt), jeans = dec(ASSET.jeans);
    const W = new M[R1 + "wardrobeRuntime.js"].WardrobeRuntime({ bodyIndices: indices, bodyPositions: bindP, bodyNormals: bindN, bodyPrevPositions: bindP, bodySafetyProxy: proxy });
    const g = {};
    if (WD.worn.jeans) g.jeans = W.addGarment("jeans", jeans, { layer: 10, solverSettings: { ...S.jeans } });
    if (WD.worn.shirt) g.shirt = W.addGarment("shirt", shirt, { layer: 20, solverSettings: { ...S.shirt } });
    if (WD.ridingCut && ASSET.cut) for (const [k, gg] of Object.entries(g)) WD.stats.cut[k] = applyCut(gg.solver, ASSET.cut.garments?.[k]);
    const layer = g.jeans && g.shirt ? W.coupleLayers("jeans", "shirt", { ...S.layer }) : null;
    if (layer) layer.settings.enabled = false;
    const det = g.jeans && ASSET.details ? new M[M26 + "jeansDetailRuntime.js"].JeansDetailRuntime(ASSET.details, jeans.indices) : null;
    const SM = M[M26 + "renderSupermesh.js"].ClothRenderSupermesh;
    const sup = {};
    for (const [k, gg] of Object.entries(g)) {
      const s = gg.solver, a = gg.asset;
      sup[k] = new SM({ positions: s.renderPositions, normals: s.renderNormals, indices: a.indices, colors: a.colors, levels: S.renderLevels, shellVertexCount: s.shellVertexCount, edges: s.edges, edgeRest: s.edgeRest });
    }
    return { mode, S, W, g, layer, det, sup, proxy, heToSkin, NH, body: new Float32Array(NH * 3), bodyN: new Float32Array(NH * 3), prevBody: new Float32Array(NH * 3), lastBody: null,
      origin: null, lastT: null, vel: null, acc: [0, 0, 0], anchored: false };
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
  }
  const toWorld = (src, o, dst) => { for (let i = 0; i < src.length; i += 3) { dst[i] = -src[i] + o[0]; dst[i + 1] = src[i + 2] + o[1]; dst[i + 2] = src[i + 1] + o[2]; } };
  const toWorldN = (src, dst) => { for (let i = 0; i < src.length; i += 3) { dst[i] = -src[i]; dst[i + 1] = src[i + 2]; dst[i + 2] = src[i + 1]; } };

  // ------------------------------------------------------------------ stepping
  function setFrameForces(dt) {
    // the frame's motion: the bike's position (origin) and velocity; its acceleration filtered
    // over ~40 ms (the cloth feels the bike's surges, not single-step chassis noise)
    const v = (typeof free !== "undefined" && free?.v) ? free.v : [0, 0, 0];
    if (E.vel && dt > 0) {
      const a = 1 - Math.exp(-dt / 0.04);
      for (let k = 0; k < 3; k++) E.acc[k] += ((v[k] - E.vel[k]) / dt - E.acc[k]) * a;
    }
    E.vel = v.slice();
    // gravity in the frame, less its acceleration (world (ax, ay, az) -> engine (-ax, az, ay))
    const g = [0, 0, -9.81], ga = [g[0] - E.acc[0], g[1] - E.acc[1], g[2] - E.acc[2]];
    const gE = [-ga[0], ga[2], ga[1]];
    // the still air seen from the frame: -v (world) -> engine
    const ws = WD.windScale, wE = [v[0] * ws, -v[2] * ws, -v[1] * ws];
    for (const gg of Object.values(E.g)) { gg.solver.settings.gravity = gE; gg.solver.settings.gravityScale = 1; gg.solver.settings.wind = wE; }
  }
  function anchor() {
    for (const gg of Object.values(E.g)) gg.solver.reanchorToCurrentBody({ safetyPasses: E.mode === "quality" ? 4 : 1 });
    if (E.mode !== "bound") {
      const h = 1 / E.S.simHz;
      for (let i = 0; i < E.S.settle; i++) { E.W.setBodySurface(E.body, E.bodyN, E.body, h); E.W.stepFrame(h); }
      if (E.layer) E.layer.settings.enabled = true;
      for (let i = 0; i < E.S.layerSettle; i++) { E.W.setBodySurface(E.body, E.bodyN, E.body, h); E.W.stepFrame(h); }
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
        WD.stats.steps++;
      }
    }
    E.lastBody.set(E.body);
    E.origin = o;
  }

  // ------------------------------------------------------------------ drawing
  function program() {
    if (typeof P === "undefined" || !gl?.getAttachedShaders) return null;
    const sh = gl.getAttachedShaders(P), vsh = sh.find((s) => gl.getShaderParameter(s, gl.SHADER_TYPE) === gl.VERTEX_SHADER), fsh = sh.find((s) => gl.getShaderParameter(s, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER);
    const vs0 = gl.getShaderSource(vsh), fs = gl.getShaderSource(fsh);
    // the legacy lit program, with a per-vertex colour multiplying its colour (same lighting as the bike and her)
    const vs = vs0.replace("layout(location=1)in vec3 n;", "layout(location=1)in vec3 n;layout(location=2)in vec3 vcol;").replace("C=color;", "C=color*vcol;");
    if (vs === vs0 || !vs.includes("C=color*vcol;")) throw Error("legacy program changed: cannot derive the garment program");
    const mk = (t, s) => { const q = gl.createShader(t); gl.shaderSource(q, s); gl.compileShader(q); if (!gl.getShaderParameter(q, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(q)); return q; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const k of ["vp", "model", "eye", "color", "emission", "emissionStrength", "roughness", "metallic", "thermalMode", "thermalCount", "thermalAxis"]) u[k] = gl.getUniformLocation(p, k);
    return { p, u };
  }
  function meshGpu(nv, indices, colors) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const mk = (loc, data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); return b; };
    const pb = mk(0, nv * 12, gl.DYNAMIC_DRAW), nb = mk(1, nv * 12, gl.DYNAMIC_DRAW);
    // (the lab's garment colours are display (sRGB) values - its renderer takes them to linear with
    // pow 2.2; the legacy program lights linear albedo)
    const col = new Float32Array(nv * 3).fill(1);
    if (colors && colors.length === nv * 3) for (let i = 0; i < col.length; i++) col[i] = Math.pow(Math.max(0, colors[i]), 2.2);
    mk(2, col, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, pb, nb, count: indices.length, pos: new Float32Array(nv * 3), nor: new Float32Array(nv * 3) };
  }
  const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function drawMesh(m, tint, rough) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.nor);
    const u = prog.u;
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(u.vp, false, global.__VP__); gl.uniformMatrix4fv(u.model, false, IDENTITY); gl.uniform3fv(u.eye, global.__EYE__);
    gl.uniform3fv(u.color, tint); gl.uniform3fv(u.emission, [0, 0, 0]); gl.uniform1f(u.emissionStrength, 0); gl.uniform1f(u.roughness, rough); gl.uniform1f(u.metallic, 0);
    gl.uniform1i(u.thermalMode, 0); gl.uniform1i(u.thermalCount, 0); gl.uniform1i(u.thermalAxis, 0);
    gl.disable(gl.CULL_FACE); // (cloth: its inside shows at the collar, the sleeves, the hems)
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
  }
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
    if (!prog) return;
    if (!gpu) {
      gpu = {};
      for (const [k, s] of Object.entries(E.sup)) gpu[k] = meshGpu(s.vertexCount, s.indices, s.colors);
      if (E.det) gpu.details = meshGpu(E.det.positions.length / 3, E.det.indices, E.det.colors);
    }
    const o = E.origin;
    for (const [k, s] of Object.entries(E.sup)) {
      if (!WD.worn[k]) continue;
      s.update(E.g[k].solver, 1 / 60);
      toWorld(s.positions, o, gpu[k].pos); toWorldN(s.normals, gpu[k].nor);
      drawMesh(gpu[k], WD.tint[k], WD.roughness[k]);
    }
    if (E.det && WD.worn.details && E.g.jeans) {
      E.det.update(E.g.jeans.solver.renderPositions);
      toWorld(E.det.positions, o, gpu.details.pos); toWorldN(E.det.normals, gpu.details.nor);
      drawMesh(gpu.details, WD.tint.details, WD.roughness.details);
    }
  }

  // ------------------------------------------------------------------ API
  WD.setMode = (m) => { if (!["bound", "live", "quality"].includes(m)) throw Error("mode: bound | live | quality"); WD.mode = m; E = null; gpu = null; return m; };
  WD.reanchor = () => { if (E) E.anchored = false; };
  // settle the cloth on her pose as it is, without time passing for the ride (for posing, stills)
  WD.settle = (steps = 24) => {
    if (!E || !E.anchored || E.mode === "bound") return 0;
    const h = 1 / E.S.simHz;
    for (let i = 0; i < steps; i++) { E.W.setBodySurface(E.body, E.bodyN, E.body, h); E.W.stepFrame(h); }
    return steps;
  };
  WD.metrics = () => (E ? E.W.metrics() : null);
  WD.audit = () => {
    if (!E) return null;
    const o = {};
    for (const [k, gg] of Object.entries(E.g)) { const s = gg.solver, m = s.metrics(); o[k] = { p95Strain: m.shellP95Strain, p99Strain: m.shellP99Strain, maxSpeedMps: m.maxSpeedMps, finite: m.finite, inside: E.proxy.auditPoints(s.pos, { start: 0, end: s.shellVertexCount }).inside }; }
    if (E.layer) o.layer = { behind: E.layer.audit().behind };
    return o;
  };
  // (dressed: her skin is drawn as skin, not as the legacy leathers)
  WD.dressed = () => WD.enabled && WD.visible;

  // drawn right after her body, in the same frame (47_rider_render.js calls its afterDraw list)
  const RTL = CORE.riderRender;
  if (RTL?.afterDraw) RTL.afterDraw.push(() => { try { draw(); } catch (e) { WD.error = String(e?.stack || e); WD.enabled = false; console.error("wardrobe", e); } });
  global.__LUCID_CORE_WARDROBE_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

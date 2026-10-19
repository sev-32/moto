// LUCID MOTO core · the physical rider drawn: the LUCID canonical skin posed by her own body
// ------------------------------------------------------------------------------------------
// Every frame her articulated body (46_rider_biomech.js) gives Semantic51 commands + a world
// placement; they go through the canonical path of 44_lucid_character.js (compile -> canonical
// helper clusters -> Skin78 LBS). Her fingers close on the grips with the character's declared
// "bottle" grip synergy (a cylinder grip; hand layer, maturity as declared in the asset) and
// open to its "locomotion_relaxed" profile when a hand lets go. Nothing here writes joints,
// clusters or skin: vertices come only out of the LBS. While she is active the legacy
// mannequins (V1.28.4.1 skin, V1.28.5.3 live rider) are hidden and restored when she is not.
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE) return;
  const RT = (CORE.riderRender = {
    visible: true, draws: 0, frameMs: 0, error: null,
    color: [0.23, 0.245, 0.26], roughness: 0.68, // leathers: the legacy rider's suit material
    // dressed (47_rider_wardrobe.js) her skin is drawn as skin: one albedo, no texture yet (CANDIDATE)
    skinColor: [0.62, 0.37, 0.25], skinRoughness: 0.55,
    afterDraw: [], // (layers drawn on her body this frame, in order: her clothes)
    grip: { held: { profile: "bottle", profileGain: 1.0, thumbOpposition: 0.8, spread: 0.1 }, open: { profile: "locomotion_relaxed", profileGain: 1.0 } },
  });
  let gpu = null, legacyHidden = false;

  function makeGpu(ch) {
    if (typeof gl === "undefined" || !gl?.createVertexArray) return null;
    const nv = ch.nv, faces = ch.faces instanceof Uint32Array ? ch.faces : Uint32Array.from(ch.faces);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, nv * 12, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, nv * 12, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, faces, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, pb, nb, ib, count: faces.length, faces, pos: new Float32Array(nv * 3), nor: new Float32Array(nv * 3) };
  }

  // her skin less the triangles hidden under her clothes: a second VAO on the same vertex buffers
  function dressedIndices(g, hidden) {
    const F = g.faces, keep = [];
    for (let f = 0; f < F.length / 3; f++) if (!hidden[f]) keep.push(F[3 * f], F[3 * f + 1], F[3 * f + 2]);
    const idx = Uint32Array.from(keep);
    if (!g.vaoDressed) {
      g.vaoDressed = gl.createVertexArray();
      gl.bindVertexArray(g.vaoDressed);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.pb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.nb); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      g.ibDressed = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibDressed);
    } else { gl.bindVertexArray(g.vaoDressed); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibDressed); }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    g.countDressed = idx.length; g.hiddenRef = hidden;
  }

  // area-weighted vertex normals of the posed skin
  function normals(X, faces, out) {
    out.fill(0);
    for (let f = 0; f < faces.length; f += 3) {
      const a = 3 * faces[f], b = 3 * faces[f + 1], c = 3 * faces[f + 2];
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
      const vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
      out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
      out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
    }
    for (let i = 0; i < out.length; i += 3) {
      const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
      out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
    }
  }

  // hand layer: finger rotations for each hand (held: cylinder grip, open: relaxed)
  const handCache = { key: "", extra: null };
  function handExtra(ch, R) {
    const key = (R.grips.L.held ? "h" : "o") + (R.grips.R.held ? "h" : "o");
    if (handCache.key === key) return handCache.extra;
    let dofs = {};
    for (const [side, S] of [["left", "L"], ["right", "R"]]) Object.assign(dofs, ch.hand.synergy(side, R.grips[S].held ? RT.grip.held : RT.grip.open));
    handCache.key = key;
    handCache.extra = ch.hand.localRotations(dofs);
    return handCache.extra;
  }

  // (V1.28.5.3 already keeps the V1.28.4.1 skin hidden; its live rider is the one drawn)
  function setLegacyVisible(v) {
    const live = global.LUCID_RIDER_CONTROL_V12853?.runtime;
    if (live) live.visible = v;
    // (and the V1.28.5.5A viewport studio's overlays of that rider - its skeleton, contacts, effectors -
    // which it would keep drawing at her hip; restored with the legacy rider;
    // and the range gizmo of its selected DOF, which it draws whatever the overlay switches say)
    const st = global.LUCID_RIDER_STUDIO_V12855A?.studio, ov = st?.overlays;
    if (!ov) return;
    if (!v) {
      RT.legacyOverlays = { overlays: { ...ov }, selection: st.selection };
      for (const k of Object.keys(ov)) if (typeof ov[k] === "boolean") ov[k] = false;
      st.selection = { type: "none", id: null };
    } else if (RT.legacyOverlays) { Object.assign(ov, RT.legacyOverlays.overlays); st.selection = RT.legacyOverlays.selection; RT.legacyOverlays = null; }
  }

  function draw() {
    const BIO = CORE.riderBio, ch = CORE.character;
    const on = !!(BIO?.active && BIO.placed && RT.visible && ch);
    if (on !== legacyHidden) { setLegacyVisible(!on); legacyHidden = on; }
    if (!on || typeof drawPBR !== "function") return;
    if (!gpu) gpu = makeGpu(ch);
    if (!gpu) return;
    const t0 = performance.now();
    // (a pose being previewed - the pose lab's - is drawn in place of her body's)
    const R = BIO.rider, cmds = (RT.override && RT.override()) || R.commands();
    const pose = ch.compile(cmds.commands, { validate: false, placement: cmds.placement, extraLocal: handExtra(ch, R) });
    RT.pose = pose; // (her joints this frame, world: P positions, G rotations - for her hair)
    const X = ch.lbs(ch.clusterTransforms(pose));
    for (let i = 0; i < X.length; i++) gpu.pos[i] = X[i];
    normals(gpu.pos, gpu.faces, gpu.nor);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.pb);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpu.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.nb);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpu.nor);
    // world coordinates: identity model (as the tyres are drawn). Dressed, her skin where her clothes
    // cover it well inside their openings is left out (it would poke through where LBS bulges)
    const dressed = !!CORE.wardrobe?.dressed?.(), hidden = dressed ? CORE.wardrobe.hiddenSkin?.() : null;
    if (hidden && gpu.hiddenRef !== hidden) dressedIndices(gpu, hidden);
    const vao = hidden ? gpu.vaoDressed : gpu.vao, count = hidden ? gpu.countDressed : gpu.count;
    drawPBR(vao, count, IDENTITY, dressed ? RT.skinColor : RT.color, dressed ? RT.skinRoughness : RT.roughness, 0, true, gl.UNSIGNED_INT, gl.TRIANGLES, true);
    RT.draws++;
    RT.frameMs += (performance.now() - t0 - RT.frameMs) * 0.05;
    RT.gpu = gpu; // her posed mesh this frame, for other layers' depth passes (NIMBUS)
    RT.frame = (RT.frame || 0) + 1;
    for (const f of RT.afterDraw) f(gpu);
  }
  const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  // opaque: drawn right after the world, before the transparent passes (smoke, FX). Later layers
  // insert their hooks relative to "world" too, so the place is settled on the first frame.
  CORE.renderHooks = CORE.renderHooks || [];
  let placed = false;
  const hook = {
    id: "riderBio",
    draw: () => {
      if (!placed) {
        placed = true;
        const H = CORE.renderHooks, me = H.indexOf(hook);
        if (me >= 0) H.splice(me, 1);
        const at = H.findIndex((h) => h.id === "world");
        H.splice(at >= 0 ? at + 1 : 0, 0, hook);
      }
      try { draw(); } catch (e) { RT.error = String(e?.message || e); throw e; }
    },
  };
  CORE.renderHooks.push(hook);
  RT.draw = draw;
  global.__LUCID_CORE_RIDER_RENDER_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

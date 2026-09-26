// LUCID MOTO core · rubber marks
// ------------------------------------------------------------------------------------------
// Consolidated from the V84 skid-mark system of the VOLUMETRICS build (scrolling R8 deposit
// texture around the bike), rebuilt on this build's tire model:
//   * the deposit is physical: every frame and tire, the patch area swept since the last frame
//     receives rubber in proportion to the frictional energy per area it saw
//     (RTT sliding power x dt / swept area), saturating (1 - exp(-E / E0)), scaled by tread
//     temperature (hot rubber smears) and the surface. A stationary burnout blackens the road
//     under the tire within a second; a locked rear at 20 m/s lays a clear streak; ABS stops and
//     hard cornering leave a faint film; normal riding leaves nothing.
//   * the map is toroidal: a world point always maps to the same texel (REPEAT addressing), and
//     only the strips that enter the moving window are cleared - no copies when recentering.
//   * stamping is queued on the CPU (tick) and drawn in one batch in the render hook, so scripted
//     synchronous runs lay the same marks as live play.
// The world terrain shader samples CORE.skid (uRub) and darkens/glosses the asphalt.
// Deposit per frame: locked rear at 20 m/s ~0.7 (black streak); ABS stop ~0.15; cornering at
// the limit ~0.02 per pass; burnout saturates under the tire within a few frames.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_SKID__) return;
  const CORE = global.LUCID_CORE, gl = global.__LAB_GL__;
  if (!CORE || !gl || typeof free === "undefined") {
    console.warn("LUCID skid marks: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_SKID__ = true;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), sat = (x) => clamp(x, 0, 1);
  const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  const SK = (CORE.skid = {
    enabled: true, ready: false, error: null,
    N: 4096, texelM: 0.025, span: 4096 * 0.025, center: null, step: 4.0,
    // J/m2 of frictional energy for a 63 % (1 - 1/e) deposit. Abradability of tread rubber on
    // asphalt (~2e-9 m3/J) puts ~15 um of rubber down per 8 kJ/m2: a clearly black film.
    E0: 8000,
    minDeposit: 0.004, surface: { asphalt: 1.0, paint: 0.85, kerb: 0.8, grass: 0 },
    queue: [], last: { front: null, rear: null }, stats: { stamps: 0, maxDep: 0, clears: 0 },
    externalClock: false,
  });

  // ------------------------------------------------------------------ physics -> stamps
  function tireSurfaceC(which) {
    const t = global.LUCID_BRAKE_TIRE_FEEDBACK?.state?.tires?.[which];
    return +(t?.localSurfaceC ?? t?.surfaceC ?? 40) || 40;
  }
  function collect(dt) {
    if (!SK.enabled || !(dt > 0)) return;
    const F = free, fw3 = v5qrot(F.q, V5_Y), fl = Math.hypot(fw3[0], fw3[1]) || 1, fw = [fw3[0] / fl, fw3[1] / fl];
    for (const [which, TT] of [["front", F.tf], ["rear", F.tr]]) {
      const o = CORE.tires?.[which]?.out, cp = TT?.contactPoint, prev = SK.last[which];
      if (!o || !cp || !o.contact) { SK.last[which] = null; continue; }
      SK.last[which] = [cp[0], cp[1]];
      if (!prev) continue;
      const sx = cp[0] - prev[0], sy = cp[1] - prev[1], d = Math.hypot(sx, sy);
      if (d > 4) continue; // reset / teleport
      const surf = CORE.realtime?.road?.surface?.(cp[0], cp[1]) || "asphalt", sf = SK.surface[surf] ?? 1;
      const P = Math.max(0, o.slidingPowerW || 0);
      if (!sf || P < 50) continue;
      const hl = clamp(o.halfLengthM || 0.05, 0.02, 0.12), hw = clamp(o.halfWidthM || 0.06, 0.03, 0.1);
      // orientation: the sweep once it is longer than the patch, else the wheel heading
      let dir = fw;
      if (d > hl) dir = [sx / d, sy / d];
      const cosB = Math.abs(dir[0] * fw[0] + dir[1] * fw[1]), sinB = Math.sqrt(Math.max(0, 1 - cosB * cosB));
      const halfAcross = hw * cosB + hl * sinB, halfAlongPatch = hl * cosB + hw * sinB;
      const area = 2 * halfAcross * (d + 2 * halfAlongPatch);
      const E = (P * dt) / Math.max(area, 1e-3);
      // a sliding tread flash-heats within milliseconds whatever its bulk temperature: the bulk
      // (V1.26 surface temperature) only adds the extra smear of an already hot, soft tread
      const heat = 0.8 + 0.2 * smooth(40, 160, tireSurfaceC(which));
      const dep = (1 - Math.exp(-E / SK.E0)) * heat * sf;
      if (dep < SK.minDeposit) continue;
      SK.queue.push([prev[0], prev[1], cp[0], cp[1], dir[0], dir[1], halfAcross, halfAlongPatch, dep]);
      SK.stats.stamps++;
      if (dep > SK.stats.maxDep) SK.stats.maxDep = dep;
    }
    if (SK.queue.length > 40000) SK.queue.splice(0, SK.queue.length - 40000);
  }

  // ------------------------------------------------------------------ GL
  const STAMP_VS = `#version 300 es
layout(location=0) in vec2 aT;layout(location=1) in vec3 aL;out vec3 vL;
void main(){vL=aL;gl_Position=vec4(aT*2.-1.,0.,1.);}`;
  const STAMP_FS = `#version 300 es
precision highp float;in vec3 vL;out vec4 o;
void main(){
 // soft-edged swept patch: solid core, lighter shoulders (the crown carries the load)
 float along=1.-smoothstep(.72,1.,abs(vL.x)),across=1.-smoothstep(.45,1.,abs(vL.y));
 o=vec4(vL.z*along*across*(.82+.18*(1.-vL.y*vL.y)));}`;
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error("skid shader: " + gl.getShaderInfoLog(s));
    return s;
  }
  function init() {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, STAMP_VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, STAMP_FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error("skid link: " + gl.getProgramInfoLog(p));
    SK.prog = p;
    SK.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, SK.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, SK.N, SK.N, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    SK.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, SK.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, SK.tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.viewport(0, 0, SK.N, SK.N);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw Error("skid framebuffer incomplete");
    SK.vao = gl.createVertexArray();
    SK.vbo = gl.createBuffer();
    gl.bindVertexArray(SK.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, SK.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    SK.ready = true;
  }
  // clear the texels of world strip [a, b) along one axis (toroidal), all texels of the other
  function clearStrip(axis, a, b) {
    const n = SK.N, len = b - a;
    if (len <= 0) return;
    if (len >= SK.span) { gl.scissor(0, 0, n, n); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    let p0 = Math.floor((((a / SK.span) % 1) + 1) % 1 * n), w = Math.ceil((len / SK.span) * n) + 1;
    const rects = p0 + w > n ? [[p0, n - p0], [0, p0 + w - n]] : [[p0, w]];
    for (const [s, ww] of rects) {
      if (axis === 0) gl.scissor(s, 0, ww, n);
      else gl.scissor(0, s, n, ww);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    SK.stats.clears++;
  }
  function recenter(bx, by) {
    const st = SK.step, c = [Math.round(bx / st) * st, Math.round(by / st) * st];
    if (!SK.center) { SK.center = c; return; }
    const [c0x, c0y] = SK.center, h = SK.span / 2;
    if (c[0] === c0x && c[1] === c0y) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    if (c[0] > c0x) clearStrip(0, c0x + h, c[0] + h);
    else if (c[0] < c0x) clearStrip(0, c[0] - h, c0x - h);
    if (c[1] > c0y) clearStrip(1, c0y + h, c[1] + h);
    else if (c[1] < c0y) clearStrip(1, c[1] - h, c0y - h);
    gl.disable(gl.SCISSOR_TEST);
    SK.center = c;
  }
  const verts = [];
  function pushQuad(q, sx, sy) {
    const [x0, y0, x1, y1, dx, dy, ha, hp, dep] = q, S = SK.span;
    const nx = -dy, ny = dx, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, hl = Math.hypot(x1 - x0, y1 - y0) / 2 + hp;
    const u = hl, corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of corners) {
      const wx = mx + dx * u * a + nx * ha * b, wy = my + dy * u * a + ny * ha * b;
      verts.push(wx / S - sx, wy / S - sy, a, b, dep);
    }
  }
  function flush() {
    if (!SK.queue.length) return;
    verts.length = 0;
    const S = SK.span;
    for (const q of SK.queue) {
      const cx = (q[0] + q[2]) / 2 / S, cy = (q[1] + q[3]) / 2 / S, fx = Math.floor(cx), fy = Math.floor(cy);
      const r = (Math.hypot(q[2] - q[0], q[3] - q[1]) / 2 + q[6] + q[7]) / S, ox = cx - fx, oy = cy - fy;
      const xs = [fx], ys = [fy];
      if (ox - r < 0) xs.push(fx - 1); else if (ox + r > 1) xs.push(fx + 1);
      if (oy - r < 0) ys.push(fy - 1); else if (oy + r > 1) ys.push(fy + 1);
      for (const sx of xs) for (const sy of ys) pushQuad(q, sx, sy);
    }
    SK.queue.length = 0;
    const data = new Float32Array(verts);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SK.fbo);
    gl.viewport(0, 0, SK.N, SK.N);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); // d' = dep + d (1 - dep)
    gl.useProgram(SK.prog);
    gl.bindVertexArray(SK.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, SK.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 5);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  // ------------------------------------------------------------------ lifecycle
  let lastT = null;
  function frame() {
    if (!SK.enabled || SK.error) return;
    try {
      if (!SK.ready) init();
      const t = free.time, dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      if (!SK.externalClock && dt > 0 && dt < 0.5) collect(dt);
      else if (dt < 0 || dt >= 0.5) SK.last = { front: null, rear: null };
      gl.bindFramebuffer(gl.FRAMEBUFFER, SK.fbo);
      recenter(free.p[0], free.p[1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      flush();
    } catch (e) {
      SK.error = String((e && e.stack) || e);
      console.error("LUCID skid marks", e);
    }
  }
  SK.tick = (dt) => collect(dt); // scripted runs: once per effects tick (externalClock = true)
  SK.clear = () => {
    SK.queue.length = 0;
    SK.last = { front: null, rear: null };
    if (!SK.ready) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, SK.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  // for the terrain shader: (span, valid half-window, enabled) and the window centre
  SK.uniforms = () => (SK.ready && SK.center ? { tex: SK.tex, w: [SK.span, SK.span / 2 - SK.step, 1], c: SK.center } : null);
  CORE.renderHooks = CORE.renderHooks || [];
  const at = CORE.renderHooks.findIndex((h) => h.id === "world");
  CORE.renderHooks.splice(at >= 0 ? at : 0, 0, { id: "skid", draw: frame }); // stamp before the world draws
  global.__LUCID_CORE_SKID_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

// LUCID MOTO core · her hair: the DDHF hair engine's clump charts on a groom from her own hair cards
// ------------------------------------------------------------------------------------------
// The groom (assets/character/hair/lucid_hair_guides_v1.json, tools/character/extract_hair.py):
// 369 clumps, 12 nodes root to tip, from the 123 hair cards of the Human Engine model she was made
// with - her bob to the nape. The cards were skinned to her Head joint: the roots ride on it.
//
// Each clump is a strand: inextensible (follow-the-leader projection - the DDHF engine's balanced
// inextensibility), a shape memory towards its styled shape in her head's frame (stiff at the root,
// free at the tip: the bob keeps its volume, the ends move), collisions with her head, neck and
// shoulders (spheres and capsules fitted to her rest skin), gravity less the bike's acceleration
// (the frame rides with the bike, as her clothes' does), and the air: the still air seen from the
// bike, sheltered below the screen's top, with turbulence growing with speed.
//
// Drawn as the DDHF V25 engine draws a clump (its twist-optical chart): a 2.5D ribbon along the
// centreline, its material frame twisted by three packed coefficients per clump (an RGB8 texture,
// theta(u) = c0 + c1 u + c2 sin(pi u)), its secondary highlight shaped by the second azimuthal
// harmonic m2 = (cos 2 theta, sin 2 theta), with the engine's Kajiya-Kay primary and rim - lit by
// the scene's own lights. CANDIDATE: drag, shape memory, colours and the strand pattern are
// declared, not measured.
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE) return;
  const GUIDES = /*@@HAIR_GUIDES@@*/ null;
  const HR = (CORE.hair = {
    enabled: !!GUIDES, visible: true, sim: true,
    simHz: 120, iterations: 4, damping: 0.985,
    // shape memory per iteration: held near the scalp (the first 30 % of a strand lies on her head,
    // held there by the hair around it and its contact), then decaying to the free tip
    shape: { root: 0.85, hold: 0.3, tip: 0.015 },
    dragK: 0.4, // air drag on a clump (1/m): a = dragK |w| w, w the air relative to it
    windScreen: 0.55, turbulence: 0.2, // shelter below the screen's top; flutter
    widthScale: 1.0, twistScale: 1.0, anisotropy: 0.75,
    // a natural dark brown, lighter to the tips (linear albedo; CANDIDATE - the Human Engine model's
    // hair textures are not in the handoff: its colour is not known)
    colorRoot: [0.026, 0.016, 0.011], colorTip: [0.105, 0.064, 0.038],
    stats: { frames: 0, steps: 0, ms: 0 }, error: null,
  });
  if (!GUIDES) return;
  const NN = GUIDES.clumps[0].nodes.length, NC = GUIDES.clumps.length, SEG = 24;
  let H = null, gpu = null;

  // ------------------------------------------------------------------ the groom on her head
  const mv = (G, v) => [G[0] * v[0] + G[1] * v[1] + G[2] * v[2], G[3] * v[0] + G[4] * v[1] + G[5] * v[2], G[6] * v[0] + G[7] * v[1] + G[8] * v[2]];
  function sphereFit(pts) { // least-squares sphere (algebraic), then the radius covering most of them
    let A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
    for (const p of pts) { const r = [2 * p[0], 2 * p[1], 2 * p[2], 1], y = p[0] * p[0] + p[1] * p[1] + p[2] * p[2]; for (let i = 0; i < 4; i++) { b[i] += r[i] * y; for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; } }
    for (let i = 0; i < 4; i++) { let m = i; for (let k = i + 1; k < 4; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k; [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]]; for (let k = i + 1; k < 4; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < 4; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; } }
    const x = [0, 0, 0, 0]; for (let i = 3; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < 4; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    const c = [x[0], x[1], x[2]], d = pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])).sort((a, b2) => a - b2);
    return { c, r: d[Math.floor(d.length * 0.85)] };
  }
  function build() {
    const ch = CORE.character, J = ch.joints, idx = (n) => J.names.indexOf(n);
    const head = idx("Head"), B = J.rest, hp0 = B[head];
    // collision shapes from her rest skin, in her head's frame (rest rotation: identity)
    const X = ch.vrest, cranium = [], neck = [];
    for (let v = 0; v < ch.nv; v++) {
      const x = X[3 * v], y = X[3 * v + 1], z = X[3 * v + 2];
      if (y > 1.47 && z > -0.06) cranium.push([x, y, z]); // (the skull behind the face)
      if (y > 1.37 && y < 1.43 && Math.abs(x) < 0.08) neck.push([x, y, z]);
    }
    const sk = sphereFit(cranium), nk = idx("NeckTwist01"), na = B[nk];
    let nr = 0; for (const p of neck) nr += Math.hypot(p[0] - na[0], p[2] - na[2]); nr /= Math.max(1, neck.length);
    const loc = (p) => [p[0] - hp0[0], p[1] - hp0[1], p[2] - hp0[2]];
    const shapes = {
      skull: { c: loc(sk.c), r: sk.r }, neck: { a: nk, b: head, r: nr * 1.05 },
      back: { a: idx("Spine02"), b: nk, r: 0.1 }, shoulders: { a: idx("L_Upperarm"), b: idx("R_Upperarm"), r: 0.055 },
    };
    // the clumps: rest nodes in her head's frame, segment lengths, facing, twist coefficients
    const rest = new Float64Array(NC * NN * 3), len = new Float64Array(NC * NN), facing = new Float64Array(NC * 3), width = new Float32Array(NC);
    const tw = new Uint8Array(NC * 4);
    const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    GUIDES.clumps.forEach((c, k) => {
      c.nodes.forEach((p, i) => { const q = loc(p); for (let d = 0; d < 3; d++) rest[3 * (k * NN + i) + d] = q[d]; });
      for (let i = 1; i < NN; i++) { const a = c.nodes[i - 1], b2 = c.nodes[i]; len[k * NN + i] = Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]); }
      for (let d = 0; d < 3; d++) facing[3 * k + d] = c.facing[d];
      width[k] = c.width;
      // (a natural low twist: the V25 gameplay rank, three signed 8-bit coefficients)
      tw[4 * k] = Math.round(127 + 127 * (hash(k) * 2 - 1) * 0.6); tw[4 * k + 1] = Math.round(127 + 127 * (hash(k + 0.5) * 2 - 1) * 0.5); tw[4 * k + 2] = Math.round(127 + 127 * (hash(k + 0.25) * 2 - 1) * 0.7); tw[4 * k + 3] = 127;
    });
    // the scalp under her hair: her skin's triangles within 1.5 cm of the clumps' first 40 %, drawn in
    // the hair's colour along the hair's direction there - where strands part (the wind), hair shows,
    // not bald skin
    const rootPts = [], rootDir = [], rootClump = [];
    GUIDES.clumps.forEach((c, k) => { for (let i = 0; i <= Math.floor((NN - 1) * 0.4); i++) { const a = c.nodes[i], b2 = c.nodes[i + 1], d = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], l = Math.hypot(...d) || 1; rootPts.push(a); rootDir.push(d.map((x) => x / l)); rootClump.push(k); } });
    const capV = new Int32Array(ch.nv).fill(-1), capIds = [], capDir = [], capK = [];
    for (let v = 0; v < ch.nv; v++) {
      const x = X[3 * v], y = X[3 * v + 1], z = X[3 * v + 2];
      if (y < 1.4) continue;
      let best = 0.015 * 0.015, bi = -1;
      for (let j = 0; j < rootPts.length; j++) { const p = rootPts[j], d2 = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2; if (d2 < best) { best = d2; bi = j; } }
      if (bi < 0) continue;
      capV[v] = capIds.length; capIds.push(v); capDir.push(...rootDir[bi]); capK.push(rootClump[bi]);
    }
    const capTris = [], F = ch.faces;
    for (let f = 0; f < F.length; f += 3) if (capV[F[f]] >= 0 && capV[F[f + 1]] >= 0 && capV[F[f + 2]] >= 0) capTris.push(capV[F[f]], capV[F[f + 1]], capV[F[f + 2]]);
    const scalp = { ids: Int32Array.from(capIds), dir: Float32Array.from(capDir), clump: Float32Array.from(capK), tris: Uint32Array.from(capTris) };
    return { head, shapes, rest, len, facing, width, tw, x: null, xp: null, origin: null, lastT: null, vel: null, acc: [0, 0, 0], frame: null, prevFrame: null, scalp };
  }

  // ------------------------------------------------------------------ the strands
  function headFrame(pose) { return { p: pose.P[H.head].slice(), G: pose.G[H.head].slice() }; }
  function lerpFrame(a, b, t) { // (positions linear, rotations normalised-linear: frames are close)
    const G = a.G.map((v, i) => v + (b.G[i] - v) * t), c0 = [G[0], G[3], G[6]], c1 = [G[1], G[4], G[7]];
    const n0 = Math.hypot(...c0); c0.forEach((v, i) => (c0[i] = v / n0));
    const d = c0[0] * c1[0] + c0[1] * c1[1] + c0[2] * c1[2]; c1.forEach((v, i) => (c1[i] = v - d * c0[i]));
    const n1 = Math.hypot(...c1); c1.forEach((v, i) => (c1[i] = v / n1));
    const c2 = [c0[1] * c1[2] - c0[2] * c1[1], c0[2] * c1[0] - c0[0] * c1[2], c0[0] * c1[1] - c0[1] * c1[0]];
    return { p: a.p.map((v, i) => v + (b.p[i] - v) * t), G: [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]] };
  }
  const frameMoved = (a, b) => Math.max(...a.p.map((v, i) => Math.abs(v - b.p[i]))) > 0.002 || Math.max(...a.G.map((v, i) => Math.abs(v - b.G[i]))) > 0.005;
  // a styled node in the world (relative to the frame's origin o)
  function target(F, k, i, o, out) {
    const r = 3 * (k * NN + i), q = mv(F.G, [H.rest[r], H.rest[r + 1], H.rest[r + 2]]);
    out[0] = F.p[0] + q[0] - o[0]; out[1] = F.p[1] + q[1] - o[1]; out[2] = F.p[2] + q[2] - o[2];
    return out;
  }
  function placeAll(F, o) {
    H.x = new Float64Array(NC * NN * 3); H.xp = new Float64Array(NC * NN * 3);
    const t = [0, 0, 0];
    for (let k = 0; k < NC; k++) for (let i = 0; i < NN; i++) { target(F, k, i, o, t); const r = 3 * (k * NN + i); for (let d = 0; d < 3; d++) H.x[r + d] = H.xp[r + d] = t[d]; }
    H.frame = F; H.origin = o;
  }
  // collisions: points kept outside her skull (sphere), neck, upper back and shoulders (capsules)
  function colliders(pose, F, o) {
    const S = H.shapes, P = pose.P, out = [];
    const c = mv(F.G, S.skull.c);
    out.push({ s: 1, c: [F.p[0] + c[0] - o[0], F.p[1] + c[1] - o[1], F.p[2] + c[2] - o[2]], r: S.skull.r });
    for (const k of ["neck", "back", "shoulders"]) { const a = P[S[k].a], b = P[S[k].b]; out.push({ s: 0, a: [a[0] - o[0], a[1] - o[1], a[2] - o[2]], b: [b[0] - o[0], b[1] - o[1], b[2] - o[2]], r: S[k].r }); }
    return out;
  }
  function collide(x, r, cols) {
    const m = 0.004; // (a clump's half thickness)
    for (const C of cols) {
      let cx, cy, cz;
      if (C.s) { cx = C.c[0]; cy = C.c[1]; cz = C.c[2]; }
      else { const ab = [C.b[0] - C.a[0], C.b[1] - C.a[1], C.b[2] - C.a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1; let t = ((x[r] - C.a[0]) * ab[0] + (x[r + 1] - C.a[1]) * ab[1] + (x[r + 2] - C.a[2]) * ab[2]) / L2; t = Math.max(0, Math.min(1, t)); cx = C.a[0] + ab[0] * t; cy = C.a[1] + ab[1] * t; cz = C.a[2] + ab[2] * t; }
      const dx = x[r] - cx, dy = x[r + 1] - cy, dz = x[r + 2] - cz, d = Math.hypot(dx, dy, dz), R = C.r + m;
      if (d < R && d > 1e-9) { const s = R / d; x[r] = cx + dx * s; x[r + 1] = cy + dy * s; x[r + 2] = cz + dz * s; }
    }
  }
  // the frame's forces: gravity less the bike's acceleration (filtered over ~40 ms, as her clothes'),
  // the still air seen from the bike; still: the frame at rest (her standing still)
  function forces(dt, still) {
    if (still) return { g: [0, 0, -9.81], air: [0, 0, 0] };
    const v = typeof free !== "undefined" && free?.v ? free.v : [0, 0, 0];
    if (H.vel && dt > 0) { const a = 1 - Math.exp(-dt / 0.04); for (let k = 0; k < 3; k++) H.acc[k] += ((v[k] - H.vel[k]) / dt - H.acc[k]) * a; }
    H.vel = v.slice();
    return { g: [-H.acc[0], -H.acc[1], -9.81 - H.acc[2]], air: [-v[0], -v[1], -v[2]] };
  }
  // n steps of h from the last frame to F (her head between them interpolated)
  function simulate(pose, F, o, n, h, fz) {
    const { g, air } = fz, sp = Math.hypot(...air);
    const screenTop = 1.06 - o[2]; // (the 916's screen top above the road, in the frame - CANDIDATE)
    const cols = colliders(pose, F, o), x = H.x, xp = H.xp, t = [0, 0, 0], tt = H.t || 0;
    for (let s = 1; s <= n; s++) {
      const Fs = lerpFrame(H.frame, F, s / n), time = tt + s * h;
      for (let k = 0; k < NC; k++) {
        const b0 = k * NN;
        // integrate (Verlet, damped): gravity, the air's drag on the clump
        for (let i = 1; i < NN; i++) {
          const r = 3 * (b0 + i);
          const vx = (x[r] - xp[r]) * HR.damping, vy = (x[r + 1] - xp[r + 1]) * HR.damping, vz = (x[r + 2] - xp[r + 2]) * HR.damping;
          xp[r] = x[r]; xp[r + 1] = x[r + 1]; xp[r + 2] = x[r + 2];
          let ax = g[0], ay = g[1], az = g[2];
          if (sp > 0.05) {
            const u = Math.min(1, Math.max(0, (x[r + 2] - (screenTop - 0.08)) / 0.12)), sh = HR.windScreen + (1 - HR.windScreen) * u * u * (3 - 2 * u);
            const tq = HR.turbulence * sp * sh, ph = k * 1.731 + i * 0.37;
            const wx = air[0] * sh + tq * Math.sin(9.1 * time + ph + x[r + 2] * 21), wy = air[1] * sh + tq * Math.sin(7.3 * time + 2.1 * ph + x[r] * 17), wz = air[2] * sh + tq * 0.6 * Math.sin(11.7 * time + 0.7 * ph + x[r + 1] * 19);
            const rx = wx - vx / h, ry = wy - vy / h, rz = wz - vz / h, rm = Math.hypot(rx, ry, rz) * HR.dragK;
            ax += rm * rx; ay += rm * ry; az += rm * rz;
          }
          x[r] += vx + ax * h * h; x[r + 1] += vy + ay * h * h; x[r + 2] += vz + az * h * h;
        }
        for (let it = 0; it < HR.iterations; it++) {
          // the root on her scalp; the styled shape held, stiff at the root, free at the tip
          target(Fs, k, 0, o, t); x[3 * b0] = t[0]; x[3 * b0 + 1] = t[1]; x[3 * b0 + 2] = t[2];
          for (let i = 1; i < NN; i++) {
            const r = 3 * (b0 + i), u = i / (NN - 1), sh = HR.shape, sm = u <= sh.hold ? sh.root : sh.root * Math.pow(sh.tip / sh.root, (u - sh.hold) / (1 - sh.hold));
            target(Fs, k, i, o, t);
            x[r] += (t[0] - x[r]) * sm; x[r + 1] += (t[1] - x[r + 1]) * sm; x[r + 2] += (t[2] - x[r + 2]) * sm;
          }
          // inextensible: each segment back to its length from the root out (follow the leader)
          for (let i = 1; i < NN; i++) {
            const a = 3 * (b0 + i - 1), r = 3 * (b0 + i), L = H.len[b0 + i];
            const dx = x[r] - x[a], dy = x[r + 1] - x[a + 1], dz = x[r + 2] - x[a + 2], d = Math.hypot(dx, dy, dz) || 1e-9;
            x[r] = x[a] + (dx * L) / d; x[r + 1] = x[a + 1] + (dy * L) / d; x[r + 2] = x[a + 2] + (dz * L) / d;
            collide(x, r, cols);
          }
        }
      }
      HR.stats.steps++;
    }
    H.t = tt + n * h; H.frame = F; H.origin = o;
  }
  function step(pose, dt) {
    const fp = typeof free !== "undefined" && free?.p ? free.p : [0, 0, 0], o = [fp[0], fp[1], fp[2]];
    const F = headFrame(pose);
    if (!H.x || !H.frame) { placeAll(F, o); return; }
    if (!(dt > 0) || !HR.sim) {
      // (paused, posing: no time for the hair - if her head moves it goes back to its styled shape,
      // and HR.settle() lets it hang again)
      if (frameMoved(F, H.frame) || Math.max(...o.map((v, i) => Math.abs(v - H.origin[i]))) > 0.002) placeAll(F, o);
      return;
    }
    const n = Math.max(1, Math.min(4, Math.round(dt * HR.simHz)));
    simulate(pose, F, o, n, dt / n, forces(dt, false));
  }

  // ------------------------------------------------------------------ the charts (DDHF V25)
  const VS = `#version 300 es
precision highp float;precision highp int;
layout(location=0)in vec3 aPos;layout(location=1)in vec3 aTan;layout(location=2)in vec3 aNormal;layout(location=3)in vec3 aBaseFrame;layout(location=4)in vec3 aUPS;
uniform mat4 vp;uniform sampler2D uTwistTex;uniform float uTwistScale;
out vec3 vPos,vTan,vNormal,vBaseFrame;out vec2 vTwistCS;out vec3 vUPS;
void main(){vec3 T=normalize(aTan),F0=normalize(aBaseFrame);
 // the clump's twist from its packed coefficients: theta(u) = c0 + c1 u + c2 sin(pi u) (V25 mode one)
 vec4 q=texelFetch(uTwistTex,ivec2(int(aUPS.y),0),0);vec4 sn=(round(q*255.0)-127.0)/127.0;
 float u=aUPS.x,th=sn.x*1.5707963*abs(uTwistScale)+sn.y*.725*abs(uTwistScale)*u+sn.z*.48*abs(uTwistScale)*sin(3.14159265*u);
 vTwistCS=vec2(cos(2.*th),sin(2.*th));vPos=aPos;vTan=T;vNormal=normalize(aNormal);vBaseFrame=F0;vUPS=aUPS;gl_Position=vp*vec4(aPos,1);}`;
  const FS = `#version 300 es
precision highp float;
in vec3 vPos,vTan,vNormal,vBaseFrame;in vec2 vTwistCS;in vec3 vUPS;
uniform vec3 eye,cRoot,cTip;uniform float aniso;uniform int scalp;
out vec4 o;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float h1(float x){return fract(sin(x*91.73)*43758.5453);}
void main(){
 vec3 T=normalize(vTan),N=normalize(vNormal),V=normalize(eye-vPos);if(dot(N,V)<0.)N=-N;
 float u=vUPS.x,side=vUPS.z,clump=vUPS.y;
 // strand groups across the clump (~1 mm), uneven; thinning towards its edges and its tip
 float k=h1(clump*1.31),q=side*0.5+0.5;
 float g1=.5+.5*sin(q*150.+k*6.2832+sin(q*23.+k*9.)*1.7),g2=.5+.5*sin(q*97.+k*3.1);
 float fw=fwidth(q*150.),str=mix(.62,g1*.75+g2*.35,1.-smoothstep(.6,1.4,fw));
 float edge=1.-smoothstep(.5,1.,abs(side)),tip=1.-smoothstep(.78,1.,u)*(.6+.4*g2);
 float a=scalp==1?1.:clamp((.45+.75*str)*edge*tip,0.,1.);
 if(a<.1)discard;
 // the fibre's colour: darker at the root, lighter to the tip (sun and wear), per clump and per group
 vec3 base=mix(cRoot,cTip,smoothstep(0.,1.,u))*(.84+.3*k)*(.82+.36*g1);
 vec3 F0=normalize(vBaseFrame),B0=normalize(cross(T,F0));vec2 cs=normalize(vTwistCS);
 vec3 dirs[4];dirs[0]=normalize(vec3(-.55,-.38,.74));dirs[1]=normalize(vec3(.62,.18,.54));dirs[2]=normalize(vec3(-.12,.88,.34));dirs[3]=normalize(vec3(.20,-.72,.58));
 vec3 lcol[4];lcol[0]=vec3(1.20,1.12,1.02);lcol[1]=vec3(.52,.67,.82);lcol[2]=vec3(.34,.45,.58);lcol[3]=vec3(.30,.26,.22);
 vec3 sky=vec3(.38,.46,.52),ground=vec3(.12,.10,.085);vec3 amb=mix(ground,sky,.5+.5*N.z)*.30;
 vec3 col=base*amb*1.25;
 // the cuticle's tilt shifts the two highlights apart along the fibre: R towards the tip, TRT the root
 vec3 Tr=normalize(T+N*.10),Tt=normalize(T-N*.16);
 for(int i=0;i<4;i++){vec3 L=dirs[i],H=normalize(V+L);
  float tl=dot(T,L),kd=sqrt(max(0.,1.-tl*tl)),nl=max(dot(N,L),0.);
  // R: the first reflection, the light's colour, narrow
  float r1=dot(Tr,H),R=pow(sqrt(max(0.,1.-r1*r1)),90.);
  // TRT: through the fibre and back, the hair's colour, wider - shaped by the clump's twist (V25:
  // the second azimuthal harmonic m2 of its cross-section)
  vec2 hp=vec2(dot(H,F0),dot(H,B0));float h2=max(dot(hp,hp),1e-6),cpsi=(hp.x*hp.x-hp.y*hp.y)/h2,spsi=2.*hp.x*hp.y/h2,cos2rel=cpsi*cs.x+spsi*cs.y;
  float r2=dot(Tt,H),TRT=pow(sqrt(max(0.,1.-r2*r2)),26.)*(.55+.9*aniso*(.5+.5*cos2rel));
  col+=lcol[i]*(base*(.35*kd+.45*nl)*.62+vec3(.045)*R+base*2.2*TRT*.4);}
 // light through thin hair at grazing angles
 col+=base*.25*pow(1.-max(dot(N,V),0.),2.)*(amb*2.);
 col=aces(col*1.15);col=pow(col,vec3(1./2.2));o=vec4(col,a);}`;
  function program() {
    const mk = (t, s) => { const q = gl.createShader(t); gl.shaderSource(q, s); gl.compileShader(q); if (!gl.getShaderParameter(q, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(q)); return q; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const u = {}; for (const k of ["vp", "uTwistTex", "uTwistScale", "eye", "cRoot", "cTip", "aniso", "scalp"]) u[k] = gl.getUniformLocation(p, k);
    return { p, u };
  }
  const STRIDE = 15; // pos 3, tangent 3, normal 3, base frame 3, (u, clump, side) 3
  function makeGpu() {
    const P = program(), nv = NC * (SEG + 1) * 2, vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, nv * STRIDE * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 5; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, STRIDE * 4, i * 12); }
    const idx = new Uint32Array(NC * SEG * 6);
    let q = 0;
    for (let k = 0; k < NC; k++) for (let s = 0; s < SEG; s++) { const a = (k * (SEG + 1) + s) * 2; idx[q++] = a; idx[q++] = a + 1; idx[q++] = a + 2; idx[q++] = a + 1; idx[q++] = a + 3; idx[q++] = a + 2; }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    // the packed twist coefficients: one RGBA8 texel per clump (RGB used: the V25 gameplay rank)
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NC, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, H.tw);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { P, vao, vb, count: idx.length, tex, data: new Float32Array(nv * STRIDE) };
  }
  // the charts: each clump's nodes through a Catmull-Rom curve, SEG segments, a ribbon across it in
  // its base frame (rotation-minimising from the card's facing at the root), tapering to the tip
  function expand(o) {
    const D = gpu.data, x = H.x, F = H.frame;
    const P = (k, i) => { const r = 3 * (k * NN + Math.max(0, Math.min(NN - 1, i))); return [x[r], x[r + 1], x[r + 2]]; };
    let w = 0;
    for (let k = 0; k < NC; k++) {
      const fac = mv(F.G, [H.facing[3 * k], H.facing[3 * k + 1], H.facing[3 * k + 2]]);
      let side = null, prevT = null;
      for (let s = 0; s <= SEG; s++) {
        const uu = (s / SEG) * (NN - 1), i = Math.min(NN - 2, Math.floor(uu)), f = uu - i;
        const p0 = P(k, i - 1), p1 = P(k, i), p2 = P(k, i + 1), p3 = P(k, i + 2), pos = [0, 0, 0], tan = [0, 0, 0];
        for (let d = 0; d < 3; d++) {
          const a = p1[d], b = 0.5 * (p2[d] - p0[d]), c = p0[d] - 2.5 * p1[d] + 2 * p2[d] - 0.5 * p3[d], e = 0.5 * (p3[d] - p0[d]) + 1.5 * (p1[d] - p2[d]);
          pos[d] = a + b * f + c * f * f + e * f * f * f; tan[d] = b + 2 * c * f + 3 * e * f * f;
        }
        const tl = Math.hypot(...tan) || 1; tan[0] /= tl; tan[1] /= tl; tan[2] /= tl;
        if (!side) { side = [tan[1] * fac[2] - tan[2] * fac[1], tan[2] * fac[0] - tan[0] * fac[2], tan[0] * fac[1] - tan[1] * fac[0]]; }
        else { // (parallel transport of the side across the turn of the tangent)
          const ax = [prevT[1] * tan[2] - prevT[2] * tan[1], prevT[2] * tan[0] - prevT[0] * tan[2], prevT[0] * tan[1] - prevT[1] * tan[0]], sn = Math.hypot(...ax);
          if (sn > 1e-6) { const c = prevT[0] * tan[0] + prevT[1] * tan[1] + prevT[2] * tan[2], ux = ax[0] / sn, uy = ax[1] / sn, uz = ax[2] / sn, dt2 = ux * side[0] + uy * side[1] + uz * side[2], cr = [uy * side[2] - uz * side[1], uz * side[0] - ux * side[2], ux * side[1] - uy * side[0]]; side = [side[0] * c + cr[0] * sn + ux * dt2 * (1 - c), side[1] * c + cr[1] * sn + uy * dt2 * (1 - c), side[2] * c + cr[2] * sn + uz * dt2 * (1 - c)]; }
        }
        const sl = Math.hypot(...side) || 1; side = side.map((v) => v / sl);
        const nrm = [side[1] * tan[2] - side[2] * tan[1], side[2] * tan[0] - side[0] * tan[2], side[0] * tan[1] - side[1] * tan[0]];
        const u = s / SEG, hw = 0.5 * H.width[k] * HR.widthScale * (1 - 0.6 * Math.pow(u, 1.4));
        for (const sg of [-1, 1]) {
          D[w++] = pos[0] + o[0] + side[0] * hw * sg; D[w++] = pos[1] + o[1] + side[1] * hw * sg; D[w++] = pos[2] + o[2] + side[2] * hw * sg;
          D[w++] = tan[0]; D[w++] = tan[1]; D[w++] = tan[2]; D[w++] = nrm[0]; D[w++] = nrm[1]; D[w++] = nrm[2];
          D[w++] = side[0]; D[w++] = side[1]; D[w++] = side[2]; D[w++] = u; D[w++] = k; D[w++] = sg;
        }
        prevT = tan;
      }
    }
  }
  function scalpGpu() {
    const S = H.scalp, nv = S.ids.length, vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, nv * STRIDE * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 5; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, STRIDE * 4, i * 12); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, S.tris, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, vb, count: S.tris.length, data: new Float32Array(nv * STRIDE) };
  }
  // the cap on her skin as drawn this frame (world), lifted 1.2 mm; the hair's direction turned with her head
  function fillScalp(G) {
    const S = H.scalp, D = gpu.scalp.data, X = CORE.riderRender.gpu.pos, Nn = CORE.riderRender.gpu.nor;
    for (let i = 0; i < S.ids.length; i++) {
      const v = 3 * S.ids[i], o = i * STRIDE, t = mv(G, [S.dir[3 * i], S.dir[3 * i + 1], S.dir[3 * i + 2]]);
      for (let k = 0; k < 3; k++) { D[o + k] = X[v + k] + Nn[v + k] * 0.0012; D[o + 3 + k] = t[k]; D[o + 6 + k] = Nn[v + k]; D[o + 9 + k] = Nn[v + k]; }
      D[o + 12] = 0.06; D[o + 13] = S.clump[i]; D[o + 14] = 0;
    }
  }
  function draw() {
    const RT = CORE.riderRender, pose = RT?.pose;
    if (!HR.enabled || !HR.visible || !pose || !CORE.riderBio?.active || !CORE.riderBio?.placed) return;
    const t0 = performance.now();
    if (!H) H = build();
    const tm = typeof free !== "undefined" && Number.isFinite(free?.time) ? free.time : 0, dt = H.lastT === null ? 0 : Math.max(0, Math.min(0.1, tm - H.lastT));
    H.lastT = tm;
    step(pose, dt);
    if (!gpu) gpu = makeGpu();
    expand(H.origin);
    const u = gpu.P.u;
    gl.useProgram(gpu.P.p);
    gl.uniformMatrix4fv(u.vp, false, global.__VP__); gl.uniform3fv(u.eye, global.__EYE__);
    gl.uniform3fv(u.cRoot, HR.colorRoot); gl.uniform3fv(u.cTip, HR.colorTip); gl.uniform1f(u.aniso, HR.anisotropy); gl.uniform1f(u.uTwistScale, HR.twistScale); gl.uniform1i(u.scalp, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpu.tex); gl.uniform1i(u.uTwistTex, 0);
    gl.bindVertexArray(gpu.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpu.data);
    gl.disable(gl.CULL_FACE);
    if (H.scalp.ids.length && RT.gpu?.pos) {
      if (!gpu.scalp) gpu.scalp = scalpGpu();
      fillScalp(H.frame.G);
      gl.uniform1i(u.scalp, 1);
      gl.bindVertexArray(gpu.scalp.vao); gl.bindBuffer(gl.ARRAY_BUFFER, gpu.scalp.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpu.scalp.data);
      gl.drawElements(gl.TRIANGLES, gpu.scalp.count, gl.UNSIGNED_INT, 0);
      gl.uniform1i(u.scalp, 0);
      gl.bindVertexArray(gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, gpu.vb);
    }
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.drawElements(gl.TRIANGLES, gpu.count, gl.UNSIGNED_INT, 0);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null); gl.bindTexture(gl.TEXTURE_2D, null);
    HR.stats.frames++; HR.stats.ms += (performance.now() - t0 - HR.stats.ms) * 0.1;
  }
  HR.reset = () => { if (H) { H.x = null; H.frame = null; } };
  // let the hair hang on her pose as it is, without time passing for the ride (for posing, stills):
  // in the wind and surge of the bike's motion as it stands, or still (her standing in a room)
  HR.settle = (steps = 60, { still = false } = {}) => {
    const pose = CORE.riderRender?.pose;
    if (!H || !H.x || !pose) return 0;
    const fz = forces(0, still), F = headFrame(pose);
    for (let i = 0; i < steps; i++) simulate(pose, F, H.origin, 1, 1 / HR.simHz, fz);
    return steps;
  };
  const RTL = CORE.riderRender;
  if (RTL?.afterDraw) RTL.afterDraw.push(() => { try { draw(); } catch (e) { HR.error = String(e?.stack || e); HR.enabled = false; console.error("hair", e); } });
  global.__LUCID_CORE_HAIR_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

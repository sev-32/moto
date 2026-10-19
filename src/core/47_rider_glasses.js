// LUCID MOTO core · her sunglasses, carried by her head
// ------------------------------------------------------------------------------------------
// "Sunglasses" by martn00 (Sketchfab, CC-BY-4.0: https://sketchfab.com/3d-models/sunglasses-57185ae95254443c937b69de5c22af97),
// fitted to her face by tools/character/fit-glasses.mjs: the frame on the bridge of her nose with
// its lenses at her eyes, each temple opened at its hinge and lengthened to rest on her head where
// her ear joins it, its tip curving down behind the ear. Rigid, carried by her Head joint as her hair's
// roots are (her pose this frame: CORE.riderRender.pose). Drawn after her hair in the scene's own
// lights: the rose-gold metal frame, the red-tinted lenses (seen through, the sky reflected off them
// at grazing angles), the clear plastic nose pads and temple tips. CANDIDATE.
// LUCID_CORE.glasses: { enabled, visible, attribution, stats }.
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE) return;
  const ASSET = /*@@SUNGLASSES@@*/ null;
  const GL = (CORE.glasses = { enabled: !!ASSET, visible: true, attribution: ASSET?.attribution || null, stats: { frames: 0 }, error: null });
  if (!ASSET) return;
  const b64 = (s, T) => { const raw = atob(s), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return new T(u.buffer); };
  let G = null;

  const VS = `#version 300 es
precision highp float;
layout(location=0)in vec3 p;layout(location=1)in vec3 n;
uniform mat4 vp;out vec3 W,N;
void main(){W=p;N=n;gl_Position=vp*vec4(p,1.);}`;
  // kind 0 metal (rose gold, brushed), 1 lens (tinted glass), 2 clear plastic
  const FS = `#version 300 es
precision highp float;
in vec3 W,N;uniform vec3 eye,base;uniform int kind;uniform float rough,alpha;out vec4 o;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 sky(vec3 d){float t=clamp(d.z,-1.,1.);return t>0.?mix(vec3(.62,.66,.70),vec3(.42,.56,.74),pow(t,.6)):mix(vec3(.30,.28,.25),vec3(.16,.15,.13),-t);}
void main(){
 vec3 nn=normalize(N),V=normalize(eye-W);if(dot(nn,V)<0.)nn=-nn;
 vec3 dirs[4];dirs[0]=normalize(vec3(-.55,-.38,.74));dirs[1]=normalize(vec3(.62,.18,.54));dirs[2]=normalize(vec3(-.12,.88,.34));dirs[3]=normalize(vec3(.20,-.72,.58));
 vec3 lcol[4];lcol[0]=vec3(1.20,1.12,1.02);lcol[1]=vec3(.52,.67,.82);lcol[2]=vec3(.34,.45,.58);lcol[3]=vec3(.30,.26,.22);
 float nv=max(dot(nn,V),0.),fr=pow(1.-nv,5.);vec3 R=reflect(-V,nn),env=sky(R);
 float shin=mix(220.,12.,clamp(rough,0.,1.));vec3 spec=vec3(0),dif=vec3(0);
 vec3 F0=kind==0?base:vec3(.04);
 for(int i=0;i<4;i++){vec3 L=dirs[i],H=normalize(L+V);float nl=max(dot(nn,L),0.);dif+=lcol[i]*nl;vec3 F=F0+(1.-F0)*pow(1.-max(dot(V,H),0.),5.);spec+=lcol[i]*F*pow(max(dot(nn,H),0.),shin)*nl*(shin+8.)/(8.*3.14159);}
 vec3 amb=mix(vec3(.12,.10,.085),vec3(.38,.46,.52),.5+.5*nn.z)*.35;
 vec3 col;float a=1.;
 if(kind==0){vec3 F=F0+(1.-F0)*fr;col=F*env*mix(.85,.45,rough)+spec+base*amb*.15;}
 else if(kind==1){float F=.04+.96*fr;col=base*.18*(amb+dif*.12)+F*env*.9+spec*1.4;a=clamp(alpha+F*(1.-alpha),0.,1.);}
 else{float F=.04+.96*fr;col=base*(amb+dif*.55)*.8+F*env*.5+spec;a=clamp(alpha+.5*F,0.,1.);}
 o=vec4(pow(aces(col*1.15),vec3(1./2.2)),a);
}`;
  function program() {
    const mk = (t, src) => { const q = gl.createShader(t); gl.shaderSource(q, src); gl.compileShader(q); if (!gl.getShaderParameter(q, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(q)); return q; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const u = {}; for (const k of ["vp", "eye", "base", "kind", "rough", "alpha"]) u[k] = gl.getUniformLocation(p, k);
    return { p, u };
  }
  function build() {
    const ch = CORE.character, head = ch.joints.names.indexOf("Head");
    const parts = ASSET.parts.map((pt) => {
      const rest = b64(pt.positions_f32_b64, Float32Array), restN = b64(pt.normals_f32_b64, Float32Array), idx = b64(pt.indices_u32_b64, Uint32Array), nv = rest.length / 3;
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const mk = (loc) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, nv * 12, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); return b; };
      const pb = mk(0), nb = mk(1), ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      const kind = { metal: 0, lens: 1, plastic: 2 }[pt.material.kind] ?? 2;
      return { name: pt.name, kind, m: pt.material, rest, restN, count: idx.length, vao, pb, nb, pos: new Float32Array(nv * 3), nor: new Float32Array(nv * 3) };
    });
    // (opaque first, then the see-through parts: plastic, then the lenses)
    parts.sort((a, b) => [0, 2, 1].indexOf(a.kind) - [0, 2, 1].indexOf(b.kind));
    return { head, parts, prog: program() };
  }
  // her head this frame: world = its position + its rotation x (rest offset in her master frame)
  function pose(P, Gm, src, dst, normal) {
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      dst[i] = Gm[0] * x + Gm[1] * y + Gm[2] * z + (normal ? 0 : P[0]);
      dst[i + 1] = Gm[3] * x + Gm[4] * y + Gm[5] * z + (normal ? 0 : P[1]);
      dst[i + 2] = Gm[6] * x + Gm[7] * y + Gm[8] * z + (normal ? 0 : P[2]);
    }
  }
  function draw() {
    const RT = CORE.riderRender, ps = RT?.pose;
    if (!GL.enabled || !GL.visible || !ps || !CORE.riderBio?.active || !CORE.riderBio?.placed || typeof gl === "undefined") return;
    if (!G) G = build();
    const P = ps.P[G.head], Gm = ps.G[G.head], u = G.prog.u;
    gl.useProgram(G.prog.p);
    gl.uniformMatrix4fv(u.vp, false, global.__VP__); gl.uniform3fv(u.eye, global.__EYE__);
    gl.disable(gl.CULL_FACE);
    for (const pt of G.parts) {
      pose(P, Gm, pt.rest, pt.pos, false); pose(P, Gm, pt.restN, pt.nor, true);
      gl.bindBuffer(gl.ARRAY_BUFFER, pt.pb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pt.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, pt.nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pt.nor);
      const see = pt.kind !== 0;
      if (see) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      gl.uniform3fv(u.base, pt.m.baseColor); gl.uniform1i(u.kind, pt.kind); gl.uniform1f(u.rough, pt.kind === 0 ? Math.min(0.55, pt.m.roughness) : 0.08); gl.uniform1f(u.alpha, pt.kind === 1 ? Math.max(0.78, pt.m.alpha) : pt.m.alpha);
      gl.bindVertexArray(pt.vao); gl.drawElements(gl.TRIANGLES, pt.count, gl.UNSIGNED_INT, 0);
      if (see) { gl.disable(gl.BLEND); gl.depthMask(true); }
    }
    gl.bindVertexArray(null); gl.enable(gl.CULL_FACE);
    GL.stats.frames++;
  }
  const RTL = CORE.riderRender;
  if (RTL?.afterDraw) RTL.afterDraw.push(() => { try { draw(); } catch (e) { GL.error = String(e?.stack || e); GL.enabled = false; console.error("glasses", e); } });
})(typeof window !== "undefined" ? window : globalThis);

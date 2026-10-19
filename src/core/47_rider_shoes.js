// LUCID MOTO core · her shoes: Vans on her feet - their soles bending with her toes, their canvas
// creasing, her laces tied in a bow
// ------------------------------------------------------------------------------------------
// "Vans shoe" by JW (CrossFireJW) (Sketchfab, CC-BY-4.0:
// https://sketchfab.com/3d-models/vans-shoe-1585e5837d034631a748d1a86a846782), fitted to her feet by
// tools/character/fit-shoes.mjs: one size for the pair (its length her foot's and the toe room the fit
// leaves), the left the model mirrored, a 12 mm sole under her. src/core/clothing/shoes.js (bundled)
// wears them: each carried by her Foot joint, its forefoot bending with her toes about a line in the
// sole under her toe joint, the vamp's canvas over the flex solved as a sheet (it creases where the
// bend shortens it), and her bow - two loops and two tails - simulated as lace in the bike's frame:
// gravity less the bike's acceleration, the air seen from the bike (sheltered by the fairing, as her
// clothes' is), the shoe, the ground and her ankle. Drawn after her clothes in the scene's lights with
// the model's own textures (base colour, roughness and metal, normal map); her skin the shoes cover is
// left out of her body's draw. CANDIDATE.
// LUCID_CORE.shoes: { enabled, visible, sim, ready, attribution, fit, stats, hiddenSkin(), settle(n), shoe(S) }.
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE) return;
  const ASSET = /*@@SHOES@@*/ null;
  const MOD = /*@@MOTO_SHOES@@*/ null;
  // (?shoes=0: barefoot - her body's contacts are then her bare soles' too: 46_rider_biomech.js)
  const barefoot = typeof location !== "undefined" && /[?&]shoes=0\b/.test(location.search);
  const SH = (CORE.shoes = {
    enabled: !!(ASSET && MOD) && !barefoot, visible: true, sim: true, ready: false,
    attribution: ASSET?.attribution || null, fit: ASSET?.fit || null, soleStackM: ASSET?.fit?.soleStackM || 0, standM: ASSET?.fit?.standM || ASSET?.fit?.soleStackM || 0,
    // the air at her feet: the fairing's shelter (her clothes' windFairing when they are worn) and flutter
    windShelter: 0.2, windTurbulence: 0.12,
    stats: { frames: 0, ms: 0, toe: { L: 0, R: 0 }, creaseMM: { L: 0, R: 0 } }, error: null,
  });
  if (!SH.enabled) return;
  const M = MOD["shoes.js"];
  let D = null, pair = null, G = null, lastT = null, vel = null, acc = [0, 0, 0], maskRef = null;

  // ------------------------------------------------------------------ the pair on her feet
  function wear() {
    D = M.decodeShoes(ASSET);
    pair = { L: M.wearShoe(D, "L", CORE.character), R: M.wearShoe(D, "R", CORE.character) };
  }
  // her skin the shoes cover (her body's draw leaves it out): one flag per Skin78 triangle
  SH.hiddenSkin = () => {
    if (!SH.visible || !D) return null;
    if (!maskRef) { maskRef = new Uint8Array(CORE.character.faces.length / 3); for (const f of D.hiddenSkin) maskRef[f] = 1; }
    return maskRef;
  };
  SH.shoe = (S) => pair?.[S] || null;
  // the frame's forces at her feet: gravity less the bike's acceleration (filtered over ~40 ms, as
  // her clothes'), the still air seen from the bike, sheltered by the fairing, with flutter
  function forces(dt, still, o, t) {
    if (still) return { g: [0, 0, -9.81], air: [0, 0, 0] };
    const v = typeof free !== "undefined" && free?.v ? free.v : [0, 0, 0];
    if (vel && dt > 0) { const a = 1 - Math.exp(-dt / 0.04); for (let k = 0; k < 3; k++) acc[k] += ((v[k] - vel[k]) / dt - acc[k]) * a; }
    vel = v.slice();
    const sh = CORE.wardrobe?.windFairing ?? SH.windShelter, sp = Math.hypot(v[0], v[1], v[2]), tq = SH.windTurbulence * sp * sh;
    const air = [-v[0] * sh + tq * Math.sin(9.1 * t + o[0] * 3), -v[1] * sh + tq * Math.sin(7.3 * t + 1.7 + o[1] * 3), -v[2] * sh + tq * 0.6 * Math.sin(11.7 * t + 0.4)];
    return { g: [-acc[0], -acc[1], -9.81 - acc[2]], air };
  }
  function step(pose) {
    const t = typeof free !== "undefined" && Number.isFinite(free?.time) ? free.time : 0;
    const dt = lastT === null ? 0 : Math.max(0, Math.min(0.05, t - lastT)), fp = typeof free !== "undefined" && free?.p ? free.p : [0, 0, 0], o = [fp[0], fp[1], fp[2]];
    lastT = t;
    const fz = forces(dt, false, o, t);
    for (const S of ["L", "R"]) {
      const sh = pair[S], P = pose.P[CORE.character.joints.names.indexOf(S + "_Foot")];
      const gz = CORE.world?.enabled && CORE.world.height ? CORE.world.height(P[0], P[1]) : 0;
      sh.update(pose, SH.sim ? dt : 0, { origin: o, g: fz.g, air: fz.air, ground: { n: [0, 0, 1], h: gz - o[2] } });
      SH.stats.toe[S] = +(sh.toeAngle * 180 / Math.PI).toFixed(1); SH.stats.creaseMM[S] = +(sh.creaseDepth() * 1000).toFixed(2);
    }
    return o;
  }
  // the laces hang for n steps in still air (paused, posing, stills)
  SH.settle = (n = 240) => {
    const pose = CORE.riderRender?.pose;
    if (!pose || !pair) return 0;
    const fp = typeof free !== "undefined" && free?.p ? free.p : [0, 0, 0], o = [fp[0], fp[1], fp[2]];
    for (const S of ["L", "R"]) { const P = pose.P[CORE.character.joints.names.indexOf(S + "_Foot")], gz = CORE.world?.enabled && CORE.world.height ? CORE.world.height(P[0], P[1]) : 0; pair[S].settleLaces(pose, n, 1 / 240, { origin: o, g: [0, 0, -9.81], ground: { n: [0, 0, 1], h: gz - o[2] } }); }
    return n;
  };

  // ------------------------------------------------------------------ drawn
  const VS = `#version 300 es
precision highp float;
layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec4 t;layout(location=3)in vec2 uv;
uniform mat4 vp;out vec3 W,N;out vec4 T;out vec2 U;
void main(){W=p;N=n;T=t;U=uv;gl_Position=vp*vec4(p,1.);}`;
  // the shoe's material from its textures (kind 0), or the lace's (kind 1: its colour from the texture
  // under the model's laces, a soft woven sheen)
  const FS = `#version 300 es
precision highp float;
in vec3 W,N;in vec4 T;in vec2 U;
uniform sampler2D albedo,orm,nmap;uniform vec3 eye;uniform int kind;uniform vec2 laceUV;
out vec4 o;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
 vec3 V=normalize(eye-W),nn=normalize(N);
 vec3 base;float rough,metal;
 if(kind==0){
  base=pow(texture(albedo,U).rgb,vec3(2.2));vec3 m=texture(orm,U).rgb;rough=clamp(m.g,.05,1.);metal=m.b;
  // the normal map (tangent space, the model's tangents; their w the bitangent's sign)
  vec3 tn=texture(nmap,U).xyz*2.-1.;vec3 tt=T.xyz-nn*dot(nn,T.xyz);
  if(dot(tt,tt)>1e-8){tt=normalize(tt);vec3 bb=cross(nn,tt)*T.w;nn=normalize(tt*tn.x+bb*tn.y+nn*tn.z);}
 }else{base=pow(texture(albedo,laceUV).rgb,vec3(2.2))*1.05;rough=.8;metal=0.;}
 if(dot(nn,V)<0.)nn=-nn;
 vec3 sky=vec3(.38,.46,.52),ground=vec3(.12,.10,.085);vec3 amb=mix(ground,sky,.5+.5*nn.z)*.30;
 vec3 dirs[4];dirs[0]=normalize(vec3(-.55,-.38,.74));dirs[1]=normalize(vec3(.62,.18,.54));dirs[2]=normalize(vec3(-.12,.88,.34));dirs[3]=normalize(vec3(.20,-.72,.58));
 vec3 lcol[4];lcol[0]=vec3(1.20,1.12,1.02);lcol[1]=vec3(.52,.67,.82);lcol[2]=vec3(.34,.45,.58);lcol[3]=vec3(.30,.26,.22);
 vec3 F0=mix(vec3(.04),base,metal),dif=vec3(0),spec=vec3(0);float shin=mix(160.,8.,rough),nv=max(dot(nn,V),0.);
 for(int i=0;i<4;i++){vec3 L=dirs[i],H=normalize(L+V);float nl=max(dot(nn,L),0.);dif+=lcol[i]*nl;
  vec3 F=F0+(1.-F0)*pow(1.-max(dot(V,H),0.),5.);spec+=lcol[i]*F*pow(max(dot(nn,H),0.),shin)*nl*(shin+8.)/(8.*3.14159)*(1.-.6*rough);}
 vec3 col=base*(amb+dif*.72)*(1.-metal*.8)+spec;
 if(kind==1)col+=base*.12*pow(1.-nv,2.)*(amb*2.);
 col=aces(col*1.18);col=pow(col,vec3(1./2.2));o=vec4(col,1);
}`;
  function program() {
    const mk = (ty, src) => { const q = gl.createShader(ty); gl.shaderSource(q, src); gl.compileShader(q); if (!gl.getShaderParameter(q, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(q)); return q; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const u = {}; for (const k of ["vp", "eye", "albedo", "orm", "nmap", "kind", "laceUV"]) u[k] = gl.getUniformLocation(p, k);
    return { p, u };
  }
  // the model's textures (JPEG, embedded): mipmapped; drawn once all three have loaded
  function texture(t, onload) {
    const tex = gl.createTexture(), img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const an = gl.getExtension("EXT_texture_filter_anisotropic"); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      onload();
    };
    img.src = `data:${t.mime};base64,${t.b64}`;
    return tex;
  }
  // a dynamic mesh: positions, normals, tangents (updated each frame), UVs and triangles (fixed)
  function meshGpu(nv, uv, idx, flip) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (loc, size, data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data || nv * size * 4, usage); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return b; };
    const pb = buf(0, 3, null, gl.DYNAMIC_DRAW), nb = buf(1, 3, null, gl.DYNAMIC_DRAW), tb = buf(2, 4, null, gl.DYNAMIC_DRAW);
    if (uv) buf(3, 2, uv, gl.STATIC_DRAW); else { gl.disableVertexAttribArray(3); gl.vertexAttrib2f(3, 0, 0); }
    const I = Uint32Array.from(idx); if (flip) for (let f = 0; f < I.length; f += 3) { const q = I[f + 1]; I[f + 1] = I[f + 2]; I[f + 2] = q; }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, pb, nb, tb, count: I.length };
  }
  function build() {
    const g = { prog: program(), loaded: 0 }, done = () => { g.loaded++; if (g.loaded === 3) SH.ready = true; };
    g.tex = { albedo: texture(ASSET.textures.baseColor, done), orm: texture(ASSET.textures.orm, done), nmap: texture(ASSET.textures.normal, done) };
    g.side = {};
    for (const S of ["L", "R"]) {
      const mir = D.sides[S].mirrored;
      g.side[S] = { shoe: meshGpu(D.mesh.nv, D.mesh.uvs, D.mesh.drawn, mir), patch: meshGpu(D.patch.nrv, D.patch.vuv, D.patch.indices, mir), laces: [] };
    }
    return g;
  }
  function upload(m, pos, nor, tan) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, nor);
    if (tan) { gl.bindBuffer(gl.ARRAY_BUFFER, m.tb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tan); }
  }
  // a lace: its four sides along it (M.laceStrips' layout), its own small buffers
  const laceGpu = (count) => meshGpu(8 * count, null, M.laceStripIndices(count), false);
  function draw() {
    const RT = CORE.riderRender, pose = RT?.pose;
    if (!SH.enabled || !SH.visible || !pose || !CORE.riderBio?.active || !CORE.riderBio?.placed || typeof gl === "undefined") return;
    const t0 = performance.now();
    if (!pair) wear();
    if (!G) G = build();
    const o = step(pose);
    if (!SH.ready) return;
    const u = G.prog.u;
    gl.useProgram(G.prog.p);
    gl.uniformMatrix4fv(u.vp, false, global.__VP__); gl.uniform3fv(u.eye, global.__EYE__);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.tex.albedo); gl.uniform1i(u.albedo, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.tex.orm); gl.uniform1i(u.orm, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tex.nmap); gl.uniform1i(u.nmap, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2fv(u.laceUV, D.laces.uv);
    gl.disable(gl.CULL_FACE);
    for (const S of ["L", "R"]) {
      const sh = pair[S], g = G.side[S];
      gl.uniform1i(u.kind, 0);
      upload(g.shoe, sh.pos, sh.nor, sh.tan); gl.bindVertexArray(g.shoe.vao); gl.drawElements(gl.TRIANGLES, g.shoe.count, gl.UNSIGNED_INT, 0);
      upload(g.patch, sh.patch.pos, sh.patch.nor, sh.patch.tan); gl.bindVertexArray(g.patch.vao); gl.drawElements(gl.TRIANGLES, g.patch.count, gl.UNSIGNED_INT, 0);
      // her bow
      gl.uniform1i(u.kind, 1);
      M.laceStrips(sh, o).forEach((r, i) => {
        const m = (g.laces[i] ||= laceGpu(r.count));
        upload(m, r.P, r.N, null); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      });
      const k = M.knotMesh(sh, o);
      if (k) { const m = (g.knot ||= meshGpu(k.P.length / 3, null, k.I, false)); upload(m, k.P, k.N, null); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); }
    }
    gl.bindVertexArray(null); gl.enable(gl.CULL_FACE);
    SH.stats.frames++; SH.stats.ms += (performance.now() - t0 - SH.stats.ms) * 0.1;
  }
  const RTL = CORE.riderRender;
  if (RTL?.afterDraw) RTL.afterDraw.push(() => { try { draw(); } catch (e) { SH.error = String(e?.stack || e); SH.enabled = false; console.error("shoes", e); } });
})(typeof window !== "undefined" ? window : globalThis);

// LUCID MOTO core · world: proving ground
// ------------------------------------------------------------------------------------------
// The legacy free road was a 28 m grey square that followed the bike under a flat clear
// colour, with an 80 m far plane. This layer adds a place to ride:
//   * a 3 km circuit (spline centreline, 12 m asphalt, painted edges, red/white kerbs on the
//     tight corners, grass run-off with rolling hills, elevation along the lap) and a flat
//     200 x 280 m test apron beside the start straight (skid-pad ring, bump strip)
//   * ONE set of fields drives physics and pixels: a 2 m height / signed-distance grid is
//     sampled bilinearly by the tires (RT.road.height/normal/mu) and uploaded as textures that
//     the terrain vertex/fragment shaders sample - what you see is what the tires feel
//   * surface grip map: asphalt 1.0, paint 0.9, kerb 0.85, grass 0.5
//   * rendering inside the legacy WebGL2 frame (depth-correct): terrain with procedural
//     asphalt/grass/kerb/paint, sky with sun and aerial-perspective fog, soft analytic shadow of
//     the bike + rider (capsules projected along the key light), far plane 80 m -> 2.5 km
//   * minimap + lap timer overlay in the ride view
// The spawn (0,0) on the start straight is flat and level, so every legacy lab/test that
// assumes a flat road at the origin is unaffected. LUCID_CORE.world.setEnabled(false)
// restores the legacy road.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_WORLD__) return;
  const CORE = global.LUCID_CORE, RT = CORE?.realtime;
  if (!RT || typeof free === "undefined") {
    console.warn("LUCID core world: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_WORLD__ = true;
  const TRACK = /*@@TRACK_JSON@@*/;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // ------------------------------------------------------------------ track centreline
  function buildCenterline(ctrl, ds) {
    const n = ctrl.length, dense = [], d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      const t0 = 0, t1 = t0 + Math.sqrt(d(p0, p1)), t2 = t1 + Math.sqrt(d(p1, p2)), t3 = t2 + Math.sqrt(d(p2, p3));
      const L = (pa, pb, ta, tb, t) => [((tb - t) / (tb - ta)) * pa[0] + ((t - ta) / (tb - ta)) * pb[0], ((tb - t) / (tb - ta)) * pa[1] + ((t - ta) / (tb - ta)) * pb[1]];
      const m = Math.max(8, Math.ceil(d(p1, p2) / 0.5));
      for (let k = 0; k < m; k++) {
        const t = t1 + ((t2 - t1) * k) / m;
        const A1 = L(p0, p1, t0, t1, t), A2 = L(p1, p2, t1, t2, t), A3 = L(p2, p3, t2, t3, t);
        dense.push(L(L(A1, A2, t0, t2, t), L(A2, A3, t1, t3, t), t1, t2, t));
      }
    }
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + d(dense[i - 1], dense[i % dense.length]));
    const total = cum[cum.length - 1], N = Math.round(total / ds), X = new Float64Array(N), Y = new Float64Array(N);
    for (let i = 0, j = 0; i < N; i++) {
      const s = (i * total) / N;
      while (cum[j + 1] < s) j++;
      const a = dense[j], b = dense[(j + 1) % dense.length], u = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      X[i] = a[0] + (b[0] - a[0]) * u;
      Y[i] = a[1] + (b[1] - a[1]) * u;
    }
    const step = total / N, TX = new Float64Array(N), TY = new Float64Array(N), K0 = new Float64Array(N), K = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy);
      TX[i] = dx / l;
      TY[i] = dy / l;
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 2 + N) % N, b = (i + 2) % N;
      let da = Math.atan2(TY[b], TX[b]) - Math.atan2(TY[a], TX[a]);
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      K0[i] = da / (4 * step);
    }
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -6; k <= 6; k++) s += K0[(i + k + N) % N];
      K[i] = s / 13;
    }
    return { N, step, length: total, X, Y, TX, TY, K };
  }

  // ------------------------------------------------------------------ value noise (JS; baked into the grid)
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.03 + 17.1, y * 2.03 - 9.2) * 0.28 + vnoise(x * 4.1 - 3.3, y * 4.1 + 5.7) * 0.17;

  // ------------------------------------------------------------------ world fields
  const W = (CORE.world = { enabled: true, track: TRACK, lap: { current: null, last: null, best: null, lapStartT: null } });
  function build() {
    const t0 = performance.now();
    const tr = buildCenterline(TRACK.control, 1);
    const hw = TRACK.width / 2, kerbW = TRACK.kerbWidth, pad = TRACK.pad;
    // spawn: closest centreline sample to the origin; the start straight around it stays level
    let s0 = 0, best = 1e18;
    for (let i = 0; i < tr.N; i++) {
      const dd = tr.X[i] * tr.X[i] + tr.Y[i] * tr.Y[i];
      if (dd < best) { best = dd; s0 = i; }
    }
    // elevation along the lap: zero from 380 m before to 450 m after the spawn, rolling elsewhere
    const flatA = -380, flatB = 450, span = tr.N - (flatB - flatA);
    const zTrack = new Float64Array(tr.N);
    for (let i = 0; i < tr.N; i++) {
      let rel = i - s0;
      if (rel < -tr.N / 2) rel += tr.N;
      if (rel > tr.N / 2) rel -= tr.N;
      if (rel >= flatA && rel <= flatB) { zTrack[i] = 0; continue; }
      let u = rel > flatB ? (rel - flatB) / span : (rel - flatA + tr.N - (flatB - flatA) + (flatB - flatA)) / span; // 0..1 through the hilly part
      u = ((u % 1) + 1) % 1;
      const env = Math.sin(Math.PI * u);
      zTrack[i] = env * env * (7.5 * Math.sin(2 * Math.PI * u * 1.0 + 0.4) + 3.2 * Math.sin(2 * Math.PI * u * 3.0 + 1.9)) + env * 2.5;
    }
    // kerbs on tight corners (inside at the apex; outside too on the tightest)
    const kerb = new Int8Array(tr.N);
    for (let i = 0; i < tr.N; i++) {
      const k = tr.K[i];
      if (Math.abs(k) > TRACK.kerbCurvature) kerb[i] = k > 0 ? 1 : -1; // +1 kerb on the left (inside of a left turn)
      if (Math.abs(k) > 2.2 * TRACK.kerbCurvature) kerb[i] = 2 * Math.sign(k); // both sides
    }
    // grid covering the track + margin
    let x0 = Math.min(pad.x0, ...tr.X) - 260, x1 = Math.max(pad.x1, ...tr.X) + 260, y0 = Math.min(pad.y0, ...tr.Y) - 260, y1 = Math.max(pad.y1, ...tr.Y) + 260;
    const cell = 2, nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1;
    x1 = x0 + (nx - 1) * cell;
    y1 = y0 + (ny - 1) * cell;
    // bucket the centreline for nearest queries
    const B = 24, bx = Math.ceil((x1 - x0) / B) + 1, by = Math.ceil((y1 - y0) / B) + 1, buckets = new Array(bx * by);
    for (let i = 0; i < tr.N; i++) {
      const ix = Math.floor((tr.X[i] - x0) / B), iy = Math.floor((tr.Y[i] - y0) / B), k = iy * bx + ix;
      (buckets[k] || (buckets[k] = [])).push(i);
    }
    const H = new Float32Array(nx * ny), D = new Float32Array(nx * ny), S = new Int32Array(nx * ny), PAD = new Uint8Array(nx * ny);
    const R = 4; // bucket search radius (96 m); beyond that the node is far from the track
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * cell, iyb = Math.floor((y - y0) / B);
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell, ixb = Math.floor((x - x0) / B);
        let bi = -1, bd = 1e18;
        for (let q = -R; q <= R; q++) {
          const yy = iyb + q;
          if (yy < 0 || yy >= by) continue;
          for (let p = -R; p <= R; p++) {
            const xx = ixb + p;
            if (xx < 0 || xx >= bx) continue;
            const L = buckets[yy * bx + xx];
            if (!L) continue;
            for (const k of L) {
              const dx = x - tr.X[k], dy = y - tr.Y[k], dd = dx * dx + dy * dy;
              if (dd < bd) { bd = dd; bi = k; }
            }
          }
        }
        const idx = j * nx + i;
        const inPadX = smooth(pad.x0 - 30, pad.x0, x) * (1 - smooth(pad.x1, pad.x1 + 30, x)), inPadY = smooth(pad.y0 - 30, pad.y0, y) * (1 - smooth(pad.y1, pad.y1 + 30, y));
        const padW = inPadX * inPadY;
        const natural = (fbm(x / 170, y / 170) - 0.5) * 26 + (fbm(x / 60 + 40, y / 60 - 20) - 0.5) * 5;
        let h, sd;
        if (bi >= 0) {
          const dx = x - tr.X[bi], dy = y - tr.Y[bi];
          sd = dx * -tr.TY[bi] + dy * tr.TX[bi]; // + left of the direction of travel
          const t = smooth(hw + TRACK.runoff, hw + TRACK.runoff + 90, Math.abs(sd));
          h = zTrack[bi] * (1 - t) + (natural + zTrack[bi] * 0.6) * t;
          S[idx] = bi;
        } else {
          sd = 1000;
          h = natural;
          S[idx] = -1;
        }
        H[idx] = h * (1 - padW);
        D[idx] = sd;
        PAD[idx] = x >= pad.x0 && x <= pad.x1 && y >= pad.y0 && y <= pad.y1 ? 1 : 0;
      }
    }
    Object.assign(W, { tr, zTrack, kerb, s0, grid: { x0, y0, x1, y1, nx, ny, cell }, H, D, S, PAD, buildMs: performance.now() - t0 });
  }
  build();

  // ------------------------------------------------------------------ physics queries
  const G = W.grid;
  function bil(A, x, y) {
    const fx = clamp((x - G.x0) / G.cell, 0, G.nx - 1.0001), fy = clamp((y - G.y0) / G.cell, 0, G.ny - 1.0001);
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * G.nx + i;
    return A[k] * (1 - u) * (1 - v) + A[k + 1] * u * (1 - v) + A[k + G.nx] * (1 - u) * v + A[k + G.nx + 1] * u * v;
  }
  function nearestIndex(x, y) {
    const fx = clamp(Math.round((x - G.x0) / G.cell), 0, G.nx - 1), fy = clamp(Math.round((y - G.y0) / G.cell), 0, G.ny - 1);
    return W.S[fy * G.nx + fx];
  }
  const BUMP = { x0: -170, x1: -120, y0: -110, y1: 110, amp: 0.035, wave: 7 }; // bump strip on the apron
  function fineDetail(x, y) {
    let h = 0;
    if (x > BUMP.x0 && x < BUMP.x1 && y > BUMP.y0 && y < BUMP.y1) {
      const e = smooth(BUMP.x0, BUMP.x0 + 3, x) * (1 - smooth(BUMP.x1 - 3, BUMP.x1, x)) * smooth(BUMP.y0, BUMP.y0 + 8, y) * (1 - smooth(BUMP.y1 - 8, BUMP.y1, y));
      h += e * BUMP.amp * (1 - Math.cos((2 * Math.PI * (y - BUMP.y0)) / BUMP.wave)) * 0.5 * 2;
    }
    return h;
  }
  function kerbAt(x, y, sd) {
    const hw = TRACK.width / 2, a = Math.abs(sd);
    if (a < hw || a > hw + TRACK.kerbWidth) return 0;
    const i = nearestIndex(x, y);
    if (i < 0) return 0;
    const k = W.kerb[i];
    if (!k) return 0;
    if (Math.abs(k) === 2) return 1;
    return Math.sign(sd) === Math.sign(k) ? 1 : 0;
  }
  function height(x, y) {
    let h = bil(W.H, x, y) + fineDetail(x, y);
    const sd = bil(W.D, x, y);
    if (kerbAt(x, y, sd)) {
      // raised, sloped kerb: 0 at the asphalt edge rising to 22 mm over 0.4 m, flat, back down
      const e = Math.abs(sd) - TRACK.width / 2, kw = TRACK.kerbWidth;
      h += 0.022 * smooth(0, 0.4, e) * (1 - smooth(kw - 0.2, kw, e));
    }
    return h;
  }
  function normal(x, y) {
    const e = 0.35, hx = height(x + e, y) - height(x - e, y), hy = height(x, y + e) - height(x, y - e);
    const n = [-hx / (2 * e), -hy / (2 * e), 1], l = Math.hypot(n[0], n[1], n[2]);
    return [n[0] / l, n[1] / l, n[2] / l];
  }
  function surface(x, y) {
    const pad = bil(W.D, x, y), inPad = x >= TRACK.pad.x0 && x <= TRACK.pad.x1 && y >= TRACK.pad.y0 && y <= TRACK.pad.y1;
    const a = Math.abs(pad), hw = TRACK.width / 2;
    if (inPad || a <= hw) {
      const paint = a > hw - 0.45 && a < hw - 0.15;
      return paint ? "paint" : "asphalt";
    }
    if (kerbAt(x, y, pad)) return "kerb";
    return "grass";
  }
  const MU = { asphalt: 1.0, paint: 0.9, kerb: 0.85, grass: 0.5 };
  function mu(x, y) {
    // soft edge between asphalt and grass so the grip does not step at a hard line
    const sd = bil(W.D, x, y), a = Math.abs(sd), hw = TRACK.width / 2, inPad = x >= TRACK.pad.x0 - 0.5 && x <= TRACK.pad.x1 + 0.5 && y >= TRACK.pad.y0 - 0.5 && y <= TRACK.pad.y1 + 0.5;
    if (inPad) return MU.asphalt;
    if (a <= hw) return a > hw - 0.45 && a < hw - 0.15 ? MU.paint : MU.asphalt;
    if (kerbAt(x, y, sd)) return MU.kerb;
    return MU.grass + (MU.asphalt - MU.grass) * (1 - smooth(hw, hw + 0.35, a));
  }
  const flatRoad = { ...RT.road };
  function applyRoad(on) {
    if (on) Object.assign(RT.road, { flat: false, height, normal, mu, surface });
    else Object.assign(RT.road, flatRoad);
  }
  applyRoad(true);
  W.height = height;
  W.normal = normal;
  W.mu = mu;
  W.surface = surface;

  // ------------------------------------------------------------------ rendering
  const gl = global.__LAB_GL__;
  const R = { ready: false, err: null };
  W.render = R;
  const SUN = (() => {
    const v = [-0.55, -0.38, 0.74], l = Math.hypot(...v);
    return v.map((x) => x / l); // the legacy key light: shadows agree with the bike shading
  })();
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s) + "\n" + src.split("\n").map((l, i) => i + 1 + ": " + l).join("\n"));
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i), name = info.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  const GLSL_COMMON = `
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.03+vec2(17.1,-9.3);a*=.5;}return s;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
uniform vec3 uSun,uSunCol,uSkyZen,uSkyHor,uEye;uniform float uFogDen;
vec3 skyColor(vec3 d){float t=clamp(d.z,-.25,1.);vec3 c=mix(uSkyHor,uSkyZen,pow(max(t,0.),.55));
 c=mix(c,uSkyHor*vec3(.78,.80,.78),smoothstep(0.,-.25,t));float sd=max(dot(d,uSun),0.);
 c+=uSunCol*(pow(sd,1200.)*6.+pow(sd,90.)*.22+pow(sd,8.)*.06);return c;}
vec3 fogIt(vec3 col,vec3 w){vec3 v=w-uEye;float dist=length(v);vec3 d=v/max(dist,1e-3);
 float f=1.-exp(-dist*uFogDen*(1.+1.2*exp(-max(w.z,0.)*.02)));vec3 fc=skyColor(vec3(d.xy,max(d.z,.02)));
 fc+=uSunCol*pow(max(dot(d,uSun),0.),6.)*.12;return mix(col,fc,clamp(f,0.,1.));}
vec3 finish(vec3 c){c=aces(c*1.18);return pow(c,vec3(1./2.2));}
`;
  const TERRAIN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aGrid;
uniform mat4 uVP;uniform vec2 uCenter;uniform vec4 uField;uniform sampler2D uF0;
uniform vec4 uBump;uniform vec2 uBumpY;uniform vec2 uBumpW;
out vec3 vW;out vec2 vUV;
float smooth01(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
void main(){
 float sp=aGrid.z;vec2 w=floor((uCenter+aGrid.xy)/sp+.5)*sp;vec2 uv=(w-uField.xy)*uField.zw;
 float h=texture(uF0,uv).r;
 if(w.x>uBump.x&&w.x<uBump.y&&w.y>uBumpY.x&&w.y<uBumpY.y){
  float e=smooth01(uBump.x,uBump.x+3.,w.x)*(1.-smooth01(uBump.y-3.,uBump.y,w.x))*smooth01(uBumpY.x,uBumpY.x+8.,w.y)*(1.-smooth01(uBumpY.y-8.,uBumpY.y,w.y));
  h+=e*uBumpW.x*(1.-cos(6.2831853*(w.y-uBumpY.x)/uBumpW.y));}
 vW=vec3(w,h-.004);vUV=uv;gl_Position=uVP*vec4(vW,1.);}`;
  const TERRAIN_FS = `#version 300 es
precision highp float;
in vec3 vW;in vec2 vUV;
uniform sampler2D uF0,uF1;uniform vec4 uField;uniform vec2 uTexel;uniform float uCell;
uniform vec4 uTrackW;uniform vec4 uPad;uniform vec4 uCaps[24];uniform int uCapN;uniform vec3 uSkid;
out vec4 o;
${GLSL_COMMON}
float capDist(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);return length(pa-ba*h);}
void main(){
 vec4 F0=texture(uF0,vUV),F1=texture(uF1,vUV);
 float hx1=texture(uF0,vUV+vec2(uTexel.x,0.)).r,hx0=texture(uF0,vUV-vec2(uTexel.x,0.)).r;
 float hy1=texture(uF0,vUV+vec2(0.,uTexel.y)).r,hy0=texture(uF0,vUV-vec2(0.,uTexel.y)).r;
 vec3 N=normalize(vec3(-(hx1-hx0)/(2.*uCell),-(hy1-hy0)/(2.*uCell),1.));
 vec2 P=vW.xy;float sd=F0.g,ad=abs(sd),hw=uTrackW.x,kw=uTrackW.y;
 float dist=length(vW-uEye),aa=clamp(dist*.0025,.02,1.4);
 bool pad=P.x>=uPad.x&&P.x<=uPad.y&&P.y>=uPad.z&&P.y<=uPad.w;
 // grass
 float g1=fbm(P*.08),g2=fbm(P*1.7);vec3 alb=mix(vec3(.105,.155,.055),vec3(.16,.2,.075),g1);alb*=.85+.3*g2;
 alb*=1.+.05*sign(sin(P.x*.3927));
 // asphalt (track + pad)
 float asp=pad?1.:1.-smoothstep(hw-aa*.3,hw+aa*.3,ad);
 float agg=vnoise(P*38.)*.55+vnoise(P*9.)*.45;vec3 asphalt=vec3(.082,.085,.09)*(.82+.36*agg);
 if(pad)asphalt*=1.12;
 alb=mix(alb,asphalt,asp);
 // painted edge lines and centre dashes
 float edge=(1.-smoothstep(.10,.10+aa,abs(ad-(hw-.3))));float dash=step(.35,F1.r)*(1.-smoothstep(.07,.07+aa,ad));
 float paint=pad?0.:max(edge,dash);
 // start/finish chequer
 if(!pad&&abs(P.x)<hw&&P.y>24.&&P.y<26.4){float c=mod(floor(P.x*2.)+floor(P.y*2.),2.);paint=0.;alb=mix(alb,vec3(c*.8+.05),.95);}
 // apron markings: skid-pad ring and bump strip borders
 if(pad){float r=length(P-uSkid.xy);paint=max(paint,1.-smoothstep(.12,.12+aa,abs(r-uSkid.z)));
  paint=max(paint,(1.-smoothstep(.1,.1+aa,abs(P.x+170.)))*step(abs(P.y),110.));paint=max(paint,(1.-smoothstep(.1,.1+aa,abs(P.x+120.)))*step(abs(P.y),110.));}
 alb=mix(alb,vec3(.78,.78,.74),paint*.9);
 // kerbs: alternating red/white 1 m blocks beside the asphalt edge
 float kerbSide=F1.b;float kerb=0.;
 if(!pad&&ad>hw&&ad<hw+kw){float side=sd>0.?1.:-1.;if(abs(kerbSide)>1.5||kerbSide*side>.5)kerb=1.;}
 if(kerb>0.){float st=step(0.,F0.b);alb=mix(vec3(.72,.07,.06),vec3(.8,.8,.78),st);}
 // soft capsule shadows of the bike and rider
 float sh=0.;for(int i=0;i<12;i++){if(i>=uCapN)break;vec4 c=uCaps[2*i],r=uCaps[2*i+1];float dd=capDist(P,c.xy,c.zw);sh=max(sh,r.y*(1.-smoothstep(r.x*.55,r.x*1.35,dd)));}
 float ndl=max(dot(N,uSun),0.);vec3 amb=mix(vec3(.09,.085,.07),uSkyZen*.9,.5+.5*N.z)*.42;
 vec3 col=alb*(amb+uSunCol*ndl*(1.-.78*sh));
 // wet-look sheen on asphalt at grazing angles
 vec3 V=normalize(uEye-vW),Hh=normalize(uSun+V);col+=asp*(1.-paint)*uSunCol*pow(max(dot(N,Hh),0.),60.)*.05;
 col=fogIt(col,vW);o=vec4(finish(col),1.);}`;
  const SKY_VS = `#version 300 es
precision highp float;layout(location=0) in vec2 aP;out vec2 vN;void main(){vN=aP;gl_Position=vec4(aP,1.,1.);}`;
  const SKY_FS = `#version 300 es
precision highp float;in vec2 vN;uniform mat4 uInvVP;out vec4 o;
${GLSL_COMMON}
void main(){vec4 a=uInvVP*vec4(vN,1.,1.);vec3 d=normalize(a.xyz/a.w-uEye);o=vec4(finish(skyColor(d)),1.);}`;

  const SKY = { zen: [0.19, 0.35, 0.62], hor: [0.6, 0.68, 0.74], sun: [1.25, 1.14, 1.0], fog: 1 / 5200 };
  function buildGridMesh() {
    // camera-centred grid: 1 m spacing near the rider, growing geometrically to ~1.4 km
    const offs = [0], sp = [1];
    const bands = [[40, 1], [24, 2], [24, 4], [24, 8], [24, 16], [14, 48]];
    let o = 0;
    for (const [n, s] of bands) for (let k = 0; k < n; k++) { o += s; offs.push(o); sp.push(s); }
    const K = offs.length - 1, line = [];
    for (let k = -K; k <= K; k++) line.push([Math.sign(k) * offs[Math.abs(k)], sp[Math.abs(k)]]);
    const n = line.length, V = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o3 = (j * n + i) * 3;
      V[o3] = line[i][0];
      V[o3 + 1] = line[j][0];
      V[o3 + 2] = Math.max(line[i][1], line[j][1]);
    }
    const I = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      I[q++] = a; I[q++] = b; I[q++] = d; I[q++] = a; I[q++] = d; I[q++] = c;
    }
    return { V, I, count: I.length };
  }
  function initGL() {
    if (!gl) throw Error("no WebGL2 context");
    R.terrain = program(TERRAIN_VS, TERRAIN_FS);
    R.sky = program(SKY_VS, SKY_FS);
    const mesh = buildGridMesh();
    R.vao = gl.createVertexArray();
    gl.bindVertexArray(R.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.V, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.I, gl.STATIC_DRAW);
    R.count = mesh.count;
    R.skyVao = gl.createVertexArray();
    gl.bindVertexArray(R.skyVao);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    // field textures: F0 = height, signed distance, kerb stripe phase (sin, cos) ; F1 = dash phase, -, kerb side, pad
    const { nx, ny } = G, f0 = new Float32Array(nx * ny * 4), f1 = new Float32Array(nx * ny * 4);
    for (let k = 0; k < nx * ny; k++) {
      const si = W.S[k], s = si >= 0 ? si * W.tr.step : 0;
      f0[4 * k] = W.H[k];
      f0[4 * k + 1] = clamp(W.D[k], -60000, 60000);
      f0[4 * k + 2] = Math.sin((2 * Math.PI * s) / 2);
      f0[4 * k + 3] = Math.cos((2 * Math.PI * s) / 2);
      f1[4 * k] = Math.sin((2 * Math.PI * s) / 9);
      f1[4 * k + 1] = Math.cos((2 * Math.PI * s) / 9);
      f1[4 * k + 2] = si >= 0 ? W.kerb[si] : 0;
      f1[4 * k + 3] = W.PAD[k];
    }
    const tex = (data) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, nx, ny, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    R.tex0 = tex(f0);
    R.tex1 = tex(f1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    R.ready = true;
  }
  function inv4(m) {
    const a = m, o = new Float32Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5];
    const b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12];
    const b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return o;
  }
  // soft shadow casters: segments on the bike and rider projected along the sun onto the ground
  function shadowCaps() {
    const F = free, caps = [], q = F.q, p = F.p, B = (v) => v5add(p, v5qrot(q, v));
    const z0 = height(p[0], p[1]);
    const proj = (P) => {
      const t = (P[2] - z0) / Math.max(0.2, SUN[2]);
      return [P[0] - SUN[0] * t, P[1] - SUN[1] * t];
    };
    const seg = (A, Bp, r, s = 0.62) => {
      const a = proj(A), b = proj(Bp);
      caps.push([a[0], a[1], b[0], b[1]], [r, s, 0, 0]);
    };
    try {
      const FK = F._frontKinematics(), RK = F._rearKinematics(), fw = v5qrot(q, V5_Y), up = v5qrot(q, V5_UP);
      for (const [K, r] of [[FK, 0.3], [RK, 0.31]]) {
        seg(v5add(K.hubW, v5mul(fw, -r)), v5add(K.hubW, v5mul(fw, r)), 0.085);
        seg(v5add(K.hubW, v5mul(up, -r)), v5add(K.hubW, v5mul(up, r * 0.8)), 0.085);
      }
      seg(B([0, 0.46, 0.18]), B([0, -0.78, 0.16]), 0.17);
      seg(B([0, 0.25, -0.2]), B([0, -0.32, -0.22]), 0.2);
      seg(B([0, 0.46, 0.2]), FK.hubW, 0.06);
      const Rb = CORE.rider;
      if (Rb?.active && Rb.initialized) {
        seg(Rb.pelvis.x, Rb.upper.x, 0.19);
        seg(Rb.upper.x, v5add(Rb.upper.x, v5mul(v5norm(v5sub(Rb.upper.x, Rb.pelvis.x)), 0.28)), 0.14);
        seg(Rb.pelvis.x, B([-0.26, -0.3, -0.24]), 0.08, 0.5);
        seg(Rb.pelvis.x, B([0.26, -0.3, -0.24]), 0.08, 0.5);
      } else seg(B([0, -0.24, 0.26]), B([0, 0.05, 0.5]), 0.2);
      // contact occlusion right under the tires
      for (const T of [F.tf, F.tr]) if (T?.contactPoint && (T.loadN || 0) > 5) caps.push([T.contactPoint[0], T.contactPoint[1] - 0.05, T.contactPoint[0], T.contactPoint[1] + 0.05], [0.16, 0.45, 0, 0]);
    } catch (_) {}
    return caps.slice(0, 24);
  }
  let capArr = new Float32Array(96);
  function drawWorld() {
    if (!W.enabled) return;
    if (!R.ready) {
      if (R.err) return;
      try {
        initGL();
      } catch (e) {
        R.err = String(e);
        console.warn("LUCID world renderer disabled:", R.err);
        return;
      }
    }
    const vp = global.__VP__, eye = global.__EYE__;
    if (!vp || !eye) return;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    // terrain
    const T = R.terrain, u = T.u;
    gl.useProgram(T.p);
    const setCommon = (u) => {
      gl.uniform3fv(u.uSun, SUN);
      gl.uniform3fv(u.uSunCol, SKY.sun);
      gl.uniform3fv(u.uSkyZen, SKY.zen);
      gl.uniform3fv(u.uSkyHor, SKY.hor);
      gl.uniform3fv(u.uEye, eye);
      gl.uniform1f(u.uFogDen, SKY.fog);
    };
    setCommon(u);
    gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniform2f(u.uCenter, Math.round(eye[0]), Math.round(eye[1]));
    gl.uniform4f(u.uField, G.x0 - 0.5 * G.cell, G.y0 - 0.5 * G.cell, 1 / (G.cell * G.nx), 1 / (G.cell * G.ny)); // texel centres on grid nodes
    gl.uniform2f(u.uTexel, 1 / G.nx, 1 / G.ny);
    gl.uniform1f(u.uCell, G.cell);
    gl.uniform4f(u.uTrackW, TRACK.width / 2, TRACK.kerbWidth, 0, 0);
    gl.uniform4f(u.uPad, TRACK.pad.x0, TRACK.pad.x1, TRACK.pad.y0, TRACK.pad.y1);
    gl.uniform3f(u.uSkid, -80, 50, 30);
    gl.uniform4f(u.uBump, BUMP.x0, BUMP.x1, 0, 0);
    gl.uniform2f(u.uBumpY, BUMP.y0, BUMP.y1);
    gl.uniform2f(u.uBumpW, BUMP.amp, BUMP.wave);
    const caps = shadowCaps();
    capArr.fill(0);
    caps.forEach((c, i) => capArr.set(c, i * 4));
    gl.uniform4fv(u.uCaps, capArr);
    gl.uniform1i(u.uCapN, caps.length / 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.tex0);
    gl.uniform1i(u.uF0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, R.tex1);
    gl.uniform1i(u.uF1, 1);
    gl.bindVertexArray(R.vao);
    gl.drawElements(gl.TRIANGLES, R.count, gl.UNSIGNED_INT, 0);
    // sky fills whatever is still at the far plane
    const S = R.sky;
    gl.useProgram(S.p);
    setCommon(S.u);
    const inv = inv4(vp);
    if (inv) {
      gl.uniformMatrix4fv(S.u.uInvVP, false, inv);
      gl.depthMask(false);
      gl.bindVertexArray(R.skyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.enable(gl.CULL_FACE);
    gl.depthFunc(gl.LESS);
  }

  // ------------------------------------------------------------------ hooks into the legacy frame
  CORE.renderHooks = CORE.renderHooks || [];
  CORE.renderHooks.unshift({ id: "world", draw: drawWorld });
  const basePerspective = global.perspective;
  if (typeof basePerspective === "function") {
    global.perspective = function (f, a, n, fa) {
      // the free-ride camera asks for (48 deg, aspect, 0.02, 80): open the far plane for the world
      if (W.enabled && fa === 80) return basePerspective.call(this, f, a, 0.05, 2600);
      return basePerspective.call(this, f, a, n, fa);
    };
  }
  let wrapped = false;
  function wrapRenderFree() {
    if (wrapped || typeof renderFree !== "function") return;
    const base = renderFree;
    // eslint-disable-next-line no-global-assign
    renderFree = function (...args) {
      const box = global.document?.getElementById("showRoad");
      if (box && W.enabled && box.checked) box.checked = false;
      const r = base.apply(this, args);
      for (const h of CORE.renderHooks) {
        try {
          h.draw();
        } catch (e) {
          if (!h.err) console.warn("LUCID render hook " + h.id + " failed:", e);
          h.err = String(e);
        }
      }
      return r;
    };
    wrapped = true;
  }
  // wrap after the legacy rider (V1.28.5.3) wraps renderFree, so world + FX draw last
  let tries = 0;
  (function waitRider() {
    if (global.__LUCID_V12853_READY__ || tries++ > 200) return wrapRenderFree();
    setTimeout(waitRider, 50);
  })();

  // ------------------------------------------------------------------ minimap + lap timer
  function lapUpdate() {
    const F = free, L = W.lap, y = F.p[1], x = F.p[0];
    if (L.lapStartT !== null && F.time < L.lapStartT) { L.lapStartT = null; L.prevY = undefined; } // bike was reset
    if (L.prevY !== undefined && Math.abs(x) < TRACK.width / 2 + 1 && L.prevY < 25 && y >= 25) {
      const t = F.time;
      if (L.lapStartT !== null) {
        L.last = t - L.lapStartT;
        if (!L.best || L.last < L.best) L.best = L.last;
      }
      L.lapStartT = t;
    }
    L.prevY = y;
    L.current = L.lapStartT !== null ? F.time - L.lapStartT : null;
  }
  let mm = null;
  function minimap() {
    if (!global.document) return;
    const ride = String(global.__LUCID_ACTIVE_PAGE__ || "RIDE").toUpperCase() === "RIDE";
    if (!mm) {
      const host = global.document.getElementById("gl")?.parentElement;
      if (!host) return;
      const c = global.document.createElement("canvas");
      c.id = "lucidMinimap";
      c.style.cssText = "position:absolute;right:12px;top:12px;width:180px;height:180px;z-index:12;pointer-events:none;border-radius:8px;background:rgba(5,12,16,.55);border:1px solid #29434e";
      host.appendChild(c);
      const t = global.document.createElement("div");
      t.id = "lucidLap";
      t.style.cssText = "position:absolute;right:12px;top:198px;width:180px;z-index:12;pointer-events:none;font:11px ui-monospace,monospace;color:#cfe8ef;background:rgba(5,12,16,.55);border:1px solid #29434e;border-radius:6px;padding:4px 7px;box-sizing:border-box";
      host.appendChild(t);
      mm = { c, t, path: null };
      const tr = W.tr, xs = [...tr.X, TRACK.pad.x0, TRACK.pad.x1], ys = [...tr.Y, TRACK.pad.y0, TRACK.pad.y1];
      mm.b = { x0: Math.min(...xs) - 30, x1: Math.max(...xs) + 30, y0: Math.min(...ys) - 30, y1: Math.max(...ys) + 30 };
    }
    mm.c.style.display = mm.t.style.display = ride && W.enabled ? "block" : "none";
    if (!ride || !W.enabled) return;
    const d = Math.min(global.devicePixelRatio || 1, 2), w = 180, h = 180;
    if (mm.c.width !== w * d) { mm.c.width = w * d; mm.c.height = h * d; }
    const x = mm.c.getContext("2d"), b = mm.b, sc = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0)) * 0.94;
    const ox = (w - (b.x1 - b.x0) * sc) / 2, oy = (h - (b.y1 - b.y0) * sc) / 2;
    const P = (X, Y) => [ox + (X - b.x0) * sc, h - oy - (Y - b.y0) * sc];
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, w, h);
    const pd = TRACK.pad, a0 = P(pd.x0, pd.y1), a1 = P(pd.x1, pd.y0);
    x.fillStyle = "rgba(120,130,135,.35)";
    x.fillRect(a0[0], a0[1], a1[0] - a0[0], a1[1] - a0[1]);
    x.strokeStyle = "#8aa3ad";
    x.lineWidth = 3;
    x.beginPath();
    const tr = W.tr;
    for (let i = 0; i <= tr.N; i += 6) {
      const q = P(tr.X[i % tr.N], tr.Y[i % tr.N]);
      i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]);
    }
    x.stroke();
    const F = free, q = P(F.p[0], F.p[1]), fw = v5qrot(F.q, V5_Y), ang = Math.atan2(-fw[1], fw[0]);
    x.save();
    x.translate(q[0], q[1]);
    x.rotate(ang);
    x.fillStyle = "#ffcf3a";
    x.beginPath();
    x.moveTo(7, 0);
    x.lineTo(-5, 4);
    x.lineTo(-5, -4);
    x.closePath();
    x.fill();
    x.restore();
    const L = W.lap, f = (t) => (t === null || t === undefined ? "--:--.--" : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`);
    const kph = (Math.hypot(F.v[0], F.v[1]) * 3.6).toFixed(0), surf = surface(F.p[0], F.p[1]);
    mm.t.innerHTML = `LAP ${f(L.current)}<br>LAST ${f(L.last)} &nbsp;BEST ${f(L.best)}<br>${kph} km/h · ${surf}`;
  }
  CORE.renderHooks.push({ id: "minimap", draw: () => { lapUpdate(); minimap(); } });

  // ------------------------------------------------------------------ clean ride view
  // The studio build overlays its development panels (chain HUD, simulation overlay, rider
  // studio/operations panels) on the ride view. Clean view hides them in FREE RIDE only;
  // backquote (\`) or the DEV chip toggles; the choice is remembered.
  const DEV_PANELS = ["v57ChainHUD", "simOverlayCanvas", "simOverlayHUD", "v12854Labels", "v1300OpsPanel", "v1310Panel", "v1310Overlay"];
  let clean = true;
  try { clean = global.localStorage?.getItem("lucid.cleanRide") !== "0"; } catch (_) {}
  let chip = null;
  function applyClean() {
    const D = global.document;
    if (!D) return;
    const ride = String(global.__LUCID_ACTIVE_PAGE__ || "RIDE").toUpperCase() === "RIDE";
    for (const id of DEV_PANELS) {
      const el = D.getElementById(id);
      if (!el) continue;
      if (ride && clean) {
        if (el.dataset.lucidHidden !== "1") { el.dataset.lucidDisplay = el.style.display; el.style.display = "none"; el.dataset.lucidHidden = "1"; }
      } else if (el.dataset.lucidHidden === "1") { el.style.display = el.dataset.lucidDisplay || ""; el.dataset.lucidHidden = "0"; }
    }
    if (!chip) {
      const host = D.getElementById("gl")?.parentElement;
      if (!host) return;
      chip = D.createElement("button");
      chip.id = "lucidDevChip";
      chip.style.cssText = "position:absolute;left:12px;bottom:12px;z-index:130;font:10px ui-monospace,monospace;color:#9fd3e3;background:rgba(5,12,16,.7);border:1px solid #29434e;border-radius:5px;padding:4px 8px;cursor:pointer";
      chip.onclick = () => toggleClean();
      host.appendChild(chip);
    }
    chip.style.display = ride ? "block" : "none";
    chip.textContent = clean ? "DEV PANELS OFF  [\`]" : "DEV PANELS ON  [\`]";
  }
  function toggleClean() {
    clean = !clean;
    try { global.localStorage?.setItem("lucid.cleanRide", clean ? "1" : "0"); } catch (_) {}
    applyClean();
  }
  global.addEventListener?.("keydown", (e) => {
    if (e.code === "Backquote" && !e.repeat) {
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag !== "INPUT" && tag !== "TEXTAREA") toggleClean();
    }
  });
  let cleanAcc = 0;
  CORE.renderHooks.push({ id: "cleanView", draw: () => { if (++cleanAcc % 15 === 0) applyClean(); } });
  W.setCleanView = (on) => { clean = !!on; applyClean(); return clean; };

  W.setEnabled = (on) => {
    W.enabled = !!on;
    applyRoad(W.enabled);
    const box = global.document?.getElementById("showRoad");
    if (box && !W.enabled) box.checked = true;
    return W.enabled;
  };
  // place the bike on the circuit at arc length s (m from the spawn), heading along the track
  W.spawnAt = (s = 0, speed = 20) => {
    const F = free, tr = W.tr;
    F.reset(speed, 0);
    const i = (((Math.round(W.s0 + s / tr.step) % tr.N) + tr.N) % tr.N), x = tr.X[i], y = tr.Y[i];
    const yaw = Math.atan2(tr.TY[i], tr.TX[i]) - Math.PI / 2, ahead = 3;
    const slope = Math.atan2(height(x + tr.TX[i] * ahead, y + tr.TY[i] * ahead) - height(x - tr.TX[i] * ahead, y - tr.TY[i] * ahead), 2 * ahead);
    const qy = v5qaxis(V5_UP, yaw), qp = v5qaxis(v5qrot(qy, V5_X), slope), qr = v5qmul(qp, qy);
    const g0 = [0, 0, 0], g1 = [x, y, height(x, y)];
    F.p = v5add(g1, v5qrot(qr, v5sub(F.p, g0)));
    F.v = v5qrot(qr, F.v);
    F.q = v5qmul(qr, F.q);
    if (CORE.rider) CORE.rider.initialized = false;
    CORE.tires?.front?.resetBrush?.();
    CORE.tires?.rear?.resetBrush?.();
    F._syncTyres(F.S.dt, true);
    W.lap.lapStartT = null;
    F.__rttLite = false;
    F.compute();
    return { x, y, yawDeg: (yaw * 180) / Math.PI, slopeDeg: (slope * 180) / Math.PI, z: g1[2] };
  };
  W.info = () => ({ lengthM: W.tr.length, grid: { ...G }, buildMs: W.buildMs, renderer: { ready: R.ready, err: R.err } });
  global.__LUCID_CORE_WORLD_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

// LUCID MOTO core · volumetric effects (tire smoke, exhaust, afterfire, heat haze, dirt)
// ------------------------------------------------------------------------------------------
// The studio's effects were screen-space overlays: V1.27 drew 2D circles on a separate canvas
// (projected with __VP__, never occluded by the bike) and V1.28 ran a refraction overlay on a
// second WebGL context. This layer renders them inside the main WebGL2 frame after the world:
//   * particles live in world space, are depth-tested against the bike, rider and terrain,
//     sorted back to front and shaded as lit volumetric puffs (noise density, sun + sky)
//   * every emitter is driven by the physics, stepped on simulation time (pause/slow-motion
//     stay in sync):
//       tire smoke   RTT sliding power x V1.26 tread surface temperature (burnouts, lock-ups)
//       exhaust      V1.25/V1.28 tailpipe temperature + mass flow: heat plume (refraction),
//                    visible vapour on a cold engine, blue haze on rich overrun
//       afterfire    closed throttle above the overrun threshold (same condition and mean
//                    rate as the V1.22 DSP pops): short flame bursts at both silencers
//       brake heat   V1.26 rotor temperature -> rising shimmer at the discs
//       dirt         spinning or sliding on grass throws soil and grass clippings
//   * heat haze refracts a resolved copy of the frame where the platform allows it
// The legacy 2D overlays are hidden while this layer renders in the ride view.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_FX__) return;
  const CORE = global.LUCID_CORE, gl = global.__LAB_GL__;
  if (!CORE || !gl || typeof free === "undefined") {
    console.warn("LUCID core fx: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_FX__ = true;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rnd = (() => {
    let s = 0x9e3779b9;
    return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296;
  })();

  const FX = (CORE.fx = {
    enabled: true,
    max: 2600,
    tireSmoke: { enabled: true, perKW: 2.2, minKW: 2.5, life: [4.5, 7.5] },
    exhaust: { enabled: true, tipsBody: [[-0.105, -0.7, 0.2], [0.105, -0.7, 0.2]], dirBody: [0, -0.94, -0.18] },
    afterfire: { enabled: true, rpmMin: 3500, meanPerS: 0.45 },
    brakeHeat: { enabled: true },
    dirt: { enabled: true },
    haze: { enabled: true },
    stats: { alive: 0, emitted: 0, hazeOk: null },
  });

  // ------------------------------------------------------------------ particle pool
  const N = FX.max, P = {
    x: new Float32Array(N * 3), v: new Float32Array(N * 3), age: new Float32Array(N), life: new Float32Array(N),
    s0: new Float32Array(N), s1: new Float32Array(N), dens: new Float32Array(N), heat: new Float32Array(N),
    type: new Uint8Array(N), seed: new Float32Array(N), rot: new Float32Array(N), alive: 0,
  };
  // types: 0 smoke, 1 exhaust vapour / haze-visible, 2 flame, 3 heat (refraction only), 4 dirt
  function emit(type, pos, vel, life, s0, s1, dens, heat) {
    let i;
    if (P.alive < N) i = P.alive++;
    else {
      // recycle the oldest (by relative age)
      let best = 0, ba = -1;
      for (let k = 0; k < N; k += 7) {
        const a = P.age[k] / P.life[k];
        if (a > ba) { ba = a; best = k; }
      }
      i = best;
    }
    P.x[3 * i] = pos[0]; P.x[3 * i + 1] = pos[1]; P.x[3 * i + 2] = pos[2];
    P.v[3 * i] = vel[0]; P.v[3 * i + 1] = vel[1]; P.v[3 * i + 2] = vel[2];
    P.age[i] = 0; P.life[i] = life; P.s0[i] = s0; P.s1[i] = s1; P.dens[i] = dens; P.heat[i] = heat;
    P.type[i] = type; P.seed[i] = rnd() * 100; P.rot[i] = rnd() * 6.283;
    FX.stats.emitted++;
  }
  function kill(i) {
    const j = --P.alive;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { P.x[3 * i + k] = P.x[3 * j + k]; P.v[3 * i + k] = P.v[3 * j + k]; }
    P.age[i] = P.age[j]; P.life[i] = P.life[j]; P.s0[i] = P.s0[j]; P.s1[i] = P.s1[j]; P.dens[i] = P.dens[j];
    P.heat[i] = P.heat[j]; P.type[i] = P.type[j]; P.seed[i] = P.seed[j]; P.rot[i] = P.rot[j];
  }

  // ------------------------------------------------------------------ emitters (physics driven)
  const acc = { smokeF: 0, smokeR: 0, exh: 0, brakeF: 0, brakeR: 0, dirtF: 0, dirtR: 0 };
  const jitter = (a) => [(rnd() - 0.5) * a, (rnd() - 0.5) * a, (rnd() - 0.5) * a];
  const ground = (x, y) => CORE.realtime?.road?.height?.(x, y) || 0;
  function tireSurfaceC(which) {
    const t = global.LUCID_BRAKE_TIRE_FEEDBACK?.state?.tires?.[which];
    return +(t?.localSurfaceC ?? t?.surfaceC ?? 40) || 40;
  }
  function emitters(dt) {
    const F = free, T = CORE.tires, V = global.__LUCID_VOLUMETRIC_THERMAL_INPUT__ || {}, q = F.q;
    const fw = v5qrot(q, V5_Y), vBike = F.v;
    // --- tire smoke + dirt
    for (const [which, TT, K, key, dkey] of [["front", F.tf, F.FK, "smokeF", "dirtF"], ["rear", F.tr, F.RK, "smokeR", "dirtR"]]) {
      const o = T?.[which]?.out, cp = TT?.contactPoint;
      if (!o || !cp || !o.contact) continue;
      const kW = (o.slidingPowerW || 0) / 1000, surf = CORE.realtime?.road?.surface?.(cp[0], cp[1]) || "asphalt";
      const Ts = tireSurfaceC(which), spin = which === "rear" ? (F.omegaR || 0) * (o.effectiveRadiusM || 0.3) : (F.omegaF || 0) * (o.effectiveRadiusM || 0.3);
      const vSlip = spin - v5dot(vBike, fw);
      if (surf === "grass") {
        if (FX.dirt.enabled && kW > 0.8) {
          acc[dkey] += dt * kW * 9;
          while (acc[dkey] >= 1) {
            acc[dkey]--;
            const back = clamp(vSlip, -25, 25) * -0.35;
            emit(4, v5add(cp, [0, 0, 0.05]), v5add(v5mul(vBike, 0.6), v5add(v5mul(fw, back), [(rnd() - 0.5) * 2.5, (rnd() - 0.5) * 2.5, 1.5 + rnd() * 3])), 0.9 + rnd() * 0.7, 0.05, 0.12, 0.9, 0);
          }
        }
        continue;
      }
      if (!FX.tireSmoke.enabled || kW < FX.tireSmoke.minKW) continue;
      if (which === "rear" && FX.rearSmokeByNimbus && CORE.nimbus?.enabled && !CORE.nimbus?.error) continue; // volumetric solver owns it
      // rubber vapour: sliding power, strongly amplified once the tread surface is hot
      const heatF = 0.25 + 0.75 * smooth(90, 210, Ts);
      acc[key] += dt * FX.tireSmoke.perKW * kW * heatF;
      let n = 0;
      while (acc[key] >= 1 && n++ < 40) {
        acc[key]--;
        const up = [0, 0, 1], lat = v5norm(v5cross(fw, up));
        const pos = v5add(cp, v5add(v5mul(lat, (rnd() - 0.5) * 0.14), [0, 0, 0.08 + rnd() * 0.05]));
        const thrown = v5mul(fw, -clamp(vSlip, -30, 30) * (0.18 + 0.12 * rnd()));
        const vel = v5add(v5add(v5mul(vBike, 0.45), thrown), [(rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2, 0.5 + rnd() * 0.9]);
        const life = FX.tireSmoke.life[0] + rnd() * (FX.tireSmoke.life[1] - FX.tireSmoke.life[0]);
        emit(0, pos, vel, life, 0.28 + rnd() * 0.12, 2.6 + rnd() * 1.6, 0.55 + 0.35 * heatF, 0.6 + 0.4 * heatF);
      }
    }
    // --- exhaust: heat plume, cold vapour, rich overrun haze, afterfire
    const pt = global.DUCATI_ADVANCED_POWERTRAIN?.states?.free, rpm = pt?.engine?.rpm || 0, thr = pt?.command?.throttle ?? 0;
    if (FX.exhaust.enabled && rpm > 400) {
      const tip = FX.exhaust.tipsBody.map((b) => v5add(F.p, v5qrot(q, b))), dir = v5norm(v5qrot(q, FX.exhaust.dirBody));
      const flow = +V.exhaustMassFlowKgS || 0.004 * (rpm / 1000) * (0.3 + thr), tC = +V.tailpipeTempC || 250;
      const gasV = clamp(flow * 350, 2, 28); // ~ exit velocity (m/s) for two 45 mm tips
      acc.exh += dt * (10 + 160 * flow);
      const cold = 1 - smooth(60, 140, tC), rich = thr < 0.04 && rpm > 4000 ? 1 : 0;
      while (acc.exh >= 1) {
        acc.exh--;
        const t = tip[(rnd() * 2) | 0], vel = v5add(v5add(v5mul(dir, gasV * (0.55 + 0.4 * rnd())), v5mul(vBike, 0.85)), jitter(0.6));
        const h01 = clamp((tC - 60) / 600, 0, 1);
        if (FX.haze.enabled && h01 > 0.05) emit(3, t, vel, 0.45 + rnd() * 0.35, 0.05, 0.42, 1, h01);
        if (cold > 0.05 || rich) emit(1, t, vel, 1.4 + rnd(), 0.06, 0.55, 0.22 * cold + 0.1 * rich, 0.2);
      }
      if (FX.afterfire.enabled && thr < 0.035 && rpm > FX.afterfire.rpmMin) {
        const rate = FX.afterfire.meanPerS * clamp((rpm - FX.afterfire.rpmMin) / 3000, 0.2, 1.6);
        if (rnd() < rate * dt) {
          const t = tip[(rnd() * 2) | 0], k = 4 + ((rnd() * 5) | 0);
          for (let i = 0; i < k; i++) emit(2, v5add(t, jitter(0.02)), v5add(v5add(v5mul(dir, 6 + 9 * rnd()), v5mul(vBike, 0.9)), jitter(1.2)), 0.045 + rnd() * 0.06, 0.05, 0.16 + 0.1 * rnd(), 1, 1);
          emit(1, t, v5add(v5mul(dir, 3), v5mul(vBike, 0.9)), 0.9, 0.08, 0.5, 0.18, 0.4);
          FX.lastAfterfire = F.time;
        }
      }
    }
    // --- brake rotor heat shimmer
    if (FX.brakeHeat.enabled && FX.haze.enabled) {
      for (const [key, h, K] of [["brakeF", +V.frontBrakeHeat01 || 0, F.FK], ["brakeR", +V.rearBrakeHeat01 || 0, F.RK]]) {
        if (h < 0.08 || !K?.hubW) continue;
        acc[key] += dt * 28 * h;
        while (acc[key] >= 1) {
          acc[key]--;
          emit(3, v5add(K.hubW, [(rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.25, 0.05]), v5add(v5mul(vBike, 0.8), [0, 0, 0.6 + rnd() * 0.5]), 0.6, 0.08, 0.3, 1, h);
        }
      }
    }
  }

  // ------------------------------------------------------------------ particle dynamics
  function stepParticles(dt) {
    const F = free, bp = F.p, bv = F.v;
    for (let i = P.alive - 1; i >= 0; i--) {
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) { kill(i); continue; }
      const t = P.type[i], o = 3 * i, age = P.age[i];
      let ax = 0, ay = 0, az = 0, tau;
      // air: still, plus the wake dragged along close behind the bike
      const dx = P.x[o] - bp[0], dy = P.x[o + 1] - bp[1], dz = P.x[o + 2] - bp[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const wake = 0.35 * Math.exp(-d / 2.5);
      const air = [bv[0] * wake, bv[1] * wake, bv[2] * wake];
      if (t === 4) {
        tau = 0.9;
        az -= 9.81;
      } else if (t === 2) {
        tau = 0.08;
      } else {
        tau = t === 3 ? 0.12 : 0.35 + 0.25 * Math.min(1, age); // puffs slow down fast, then drift
        // buoyancy of hot gas, decaying as it mixes
        const heat = P.heat[i] * Math.exp(-age / (t === 3 ? 0.5 : 1.4));
        az += (t === 0 ? 2.6 : 3.5) * heat - (t === 0 ? 0.12 : 0);
        // turbulence: smooth per-particle wander
        const s = P.seed[i], w = 1.1 + 0.6 * Math.min(1, age);
        ax += w * Math.sin(1.7 * age + s) * Math.cos(0.9 * age + 1.3 * s);
        ay += w * Math.sin(1.3 * age + 2.1 * s);
        az += 0.4 * w * Math.sin(2.3 * age + 0.7 * s);
      }
      const k = dt / tau;
      P.v[o] += ((air[0] - P.v[o]) * k + ax * dt) / (1 + (t === 4 ? 0 : 0));
      P.v[o + 1] += (air[1] - P.v[o + 1]) * k + ay * dt;
      P.v[o + 2] += (air[2] - P.v[o + 2]) * (t === 4 ? k * 0.2 : k) + az * dt;
      P.x[o] += P.v[o] * dt;
      P.x[o + 1] += P.v[o + 1] * dt;
      P.x[o + 2] += P.v[o + 2] * dt;
      const g = ground(P.x[o], P.x[o + 1]);
      if (t === 4) {
        if (P.x[o + 2] < g + 0.02) { P.x[o + 2] = g + 0.02; P.v[o] *= 0.3; P.v[o + 1] *= 0.3; P.v[o + 2] = 0; P.life[i] = Math.min(P.life[i], P.age[i] + 0.25); }
      } else {
        const r = size(i) * 0.3;
        if (P.x[o + 2] < g + r) { P.x[o + 2] = g + r; if (P.v[o + 2] < 0) P.v[o + 2] *= -0.2; }
      }
    }
    FX.stats.alive = P.alive;
  }
  function size(i) {
    const u = P.age[i] / P.life[i], t = P.type[i];
    const g = t === 2 ? u : t === 0 ? 1 - Math.pow(1 - u, 2.2) : Math.sqrt(u);
    return P.s0[i] + (P.s1[i] - P.s0[i]) * g;
  }

  // ------------------------------------------------------------------ GPU
  const R = { ready: false, err: null };
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
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
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPosSize;   // xyz, size
layout(location=2) in vec4 iParams;    // alpha, type, heat, seed
layout(location=3) in float iRot;
uniform mat4 uVP;uniform vec3 uRight,uUp;
out vec2 vUV;out vec4 vP;out vec3 vW;
void main(){float c=cos(iRot),s=sin(iRot);vec2 q=vec2(c*aCorner.x-s*aCorner.y,s*aCorner.x+c*aCorner.y);
 vec3 w=iPosSize.xyz+(uRight*q.x+uUp*q.y)*iPosSize.w;vUV=aCorner;vP=iParams;vW=w;gl_Position=uVP*vec4(w,1.);}`;
  const FS = `#version 300 es
precision highp float;
in vec2 vUV;in vec4 vP;in vec3 vW;
uniform vec3 uSun,uSunCol,uSky,uRight,uUp,uFwd,uEye;uniform sampler2D uScene;uniform vec2 uView;uniform int uPass;uniform float uFogDen;
out vec4 o;
float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){return .5*n3(p)+.25*n3(p*2.03+7.1)+.125*n3(p*4.01+3.3);}
void main(){
 float r2=dot(vUV,vUV);if(r2>1.)discard;
 float a=vP.x,type=vP.y,heat=vP.z,seed=vP.w;
 bool hz=type>2.5&&type<3.5;if((uPass==1)!=hz)discard; // pass 1: refraction only; pass 0: everything else
 vec3 nrm=normalize(uRight*vUV.x+uUp*vUV.y-uFwd*sqrt(max(0.,1.-r2)));
 if(type<.5||(type>.5&&type<1.5)){
  // smoke / vapour: noisy volumetric puff, lit from the sun with a soft self-shadow
  float n=fbm3(vec3(vUV*1.7,seed)+vec3(0.,0.,seed*.37));
  float d=smoothstep(1.,.25,sqrt(r2))*(.55+.75*n);
  float alpha=clamp(d*a,0.,1.);if(alpha<.004)discard;
  float lit=.55+.45*clamp(dot(nrm,uSun),-.2,1.);float core=smoothstep(.2,1.,d);
  vec3 base=type<.5?vec3(.86,.86,.84):vec3(.78,.84,.9);
  vec3 col=base*(uSky*.55+uSunCol*.62*lit)*(1.-.28*core*a);
  float fog=1.-exp(-length(vW-uEye)*uFogDen*1.5);col=mix(col,uSky*1.05,fog*.8);
  o=vec4(col*alpha,alpha);
 } else if(type<2.5){
  // flame: hot core (yellow-white) to orange rim to blue base, additive
  float n=fbm3(vec3(vUV*3.,seed));float d=smoothstep(1.,0.,sqrt(r2))*(.6+.8*n);
  vec3 col=mix(vec3(1.,.35,.05),vec3(1.,.85,.45),smoothstep(.3,.9,d))*d*a*2.2+vec3(.15,.25,1.)*pow(1.-d,3.)*a*.25;
  o=vec4(col,0.);
 } else if(type<3.5){
  // heat haze: refract the resolved frame (uPass==1) with a noise-gradient offset
  vec2 sc=gl_FragCoord.xy/uView;float t=seed;
  float e=.08;vec3 p=vec3(vUV*2.2,t+vW.z*1.3);
  vec2 g=vec2(fbm3(p+vec3(e,0,0))-fbm3(p-vec3(e,0,0)),fbm3(p+vec3(0,e,0))-fbm3(p-vec3(0,e,0)));
  float w=smoothstep(1.,.2,sqrt(r2))*a*heat;
  vec3 col=texture(uScene,sc+g*.045*w).rgb;
  o=vec4(col,w*.9);
 } else {
  // dirt / grass clippings
  float n=n3(vec3(vUV*4.,seed));if(n<.45)discard;
  vec3 col=mix(vec3(.18,.13,.08),vec3(.2,.32,.1),step(.7,fract(seed)))*(uSky*.5+uSunCol*.6);
  o=vec4(col*a,a);
 }
}`;
  function initGL() {
    R.prog = program(VS, FS);
    R.vao = gl.createVertexArray();
    gl.bindVertexArray(R.vao);
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    R.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, R.inst);
    gl.bufferData(gl.ARRAY_BUFFER, N * 9 * 4, gl.DYNAMIC_DRAW);
    const st = 36;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, st, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    R.data = new Float32Array(N * 9);
    R.order = new Uint16Array(N);
    R.depth = new Float32Array(N);
    R.ready = true;
  }
  // resolved copy of the frame for heat-haze refraction (multisampled default framebuffer ->
  // single-sample texture via blitFramebuffer); falls back to no refraction if unsupported
  function sceneCopy(w, h) {
    try {
      if (!R.sceneTex || R.sw !== w || R.sh !== h) {
        if (R.sceneTex) { gl.deleteTexture(R.sceneTex); gl.deleteFramebuffer(R.sceneFbo); }
        R.sceneTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, R.sceneTex);
        const alpha = gl.getContextAttributes?.()?.alpha;
        gl.texImage2D(gl.TEXTURE_2D, 0, alpha ? gl.RGBA8 : gl.RGB8, w, h, 0, alpha ? gl.RGBA : gl.RGB, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        R.sceneFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.sceneFbo);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R.sceneTex, 0);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        R.sw = w;
        R.sh = h;
      }
      for (let k = 0; k < 8 && gl.getError() !== gl.NO_ERROR; k++); // flush errors raised elsewhere
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.sceneFbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      const ok = gl.getError() === gl.NO_ERROR;
      FX.stats.hazeOk = ok;
      return ok;
    } catch (_) {
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      FX.stats.hazeOk = false;
      return false;
    }
  }
  function inv4(a) {
    const o = new Float32Array(16);
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
  const unproj = (inv, x, y, z) => {
    const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
    return [(inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w, (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w, (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w];
  };
  const SUN = (() => { const v = [-0.55, -0.38, 0.74], l = Math.hypot(...v); return v.map((x) => x / l); })();
  function draw() {
    if (!FX.enabled || !P.alive) return;
    if (!R.ready) {
      if (R.err) return;
      try { initGL(); } catch (e) { R.err = String(e); console.warn("LUCID fx disabled:", R.err); return; }
    }
    const vp = global.__VP__, eye = global.__EYE__;
    if (!vp || !eye) return;
    const inv = inv4(vp);
    if (!inv) return;
    const c0 = unproj(inv, 0, 0, 0.5), cx = unproj(inv, 0.2, 0, 0.5), cy = unproj(inv, 0, 0.2, 0.5);
    const fwd = v5norm(v5sub(c0, eye)), right = v5norm(v5sub(cx, c0)), up = v5norm(v5sub(cy, c0));
    // pack + sort (back to front)
    let n = 0, hazeN = 0;
    for (let i = 0; i < P.alive; i++) {
      const o = 3 * i, dz = (P.x[o] - eye[0]) * fwd[0] + (P.x[o + 1] - eye[1]) * fwd[1] + (P.x[o + 2] - eye[2]) * fwd[2];
      if (dz < 0.1) continue;
      R.order[n] = i;
      R.depth[i] = dz;
      n++;
      if (P.type[i] === 3) hazeN++;
    }
    const idx = Array.from(R.order.subarray(0, n)).sort((a, b) => R.depth[b] - R.depth[a]);
    const D = R.data;
    for (let k = 0; k < n; k++) {
      const i = idx[k], o = 3 * i, t = P.type[i], u = P.age[i] / P.life[i], sz = size(i);
      let a;
      if (t === 0) a = P.dens[i] * smooth(0, 0.06, u) * (1 - smooth(0.45, 1, u)) * Math.min(1, (0.55 / sz) ** 0.9);
      else if (t === 1) a = P.dens[i] * (1 - u) * smooth(0, 0.08, u);
      else if (t === 2) a = 1 - u;
      else if (t === 3) a = (1 - u) * smooth(0, 0.1, u);
      else a = 1 - smooth(0.7, 1, u);
      const b = k * 9;
      D[b] = P.x[o]; D[b + 1] = P.x[o + 1]; D[b + 2] = P.x[o + 2]; D[b + 3] = sz;
      D[b + 4] = clamp(a, 0, 1); D[b + 5] = t; D[b + 6] = P.heat[i]; D[b + 7] = P.seed[i]; D[b + 8] = P.rot[i] + 0.25 * P.age[i] * (t === 0 ? 1 : 0);
    }
    const cvs = gl.canvas, w = cvs.width, h = cvs.height;
    const hazeOk = FX.haze.enabled && hazeN > 0 && sceneCopy(w, h);
    gl.viewport(0, 0, w, h);
    const S = R.prog, u = S.u;
    gl.useProgram(S.p);
    gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniform3fv(u.uRight, right);
    gl.uniform3fv(u.uUp, up);
    gl.uniform3fv(u.uFwd, fwd);
    gl.uniform3fv(u.uEye, eye);
    gl.uniform3fv(u.uSun, SUN);
    gl.uniform3f(u.uSunCol, 1.2, 1.1, 0.98);
    gl.uniform3f(u.uSky, 0.62, 0.7, 0.78);
    gl.uniform1f(u.uFogDen, 1 / 5200);
    gl.uniform2f(u.uView, w, h);
    if (hazeOk) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, R.sceneTex);
      gl.uniform1i(u.uScene, 0);
    }
    gl.bindVertexArray(R.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, n * 9);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    // pass 0: haze refraction first (it samples the opaque frame), then smoke/vapour/dirt
    // premultiplied, then flames additive
    if (hazeOk) {
      gl.uniform1i(u.uPass, 1);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    }
    gl.uniform1i(u.uPass, 0);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
  }

  // ------------------------------------------------------------------ frame hook
  let lastSimT = null;
  function frame() {
    const F = free, t = F.time;
    let dt = lastSimT === null ? 0 : t - lastSimT;
    lastSimT = t;
    if (dt < 0 || dt > 0.25) dt = 0; // reset or big jump: no burst
    if (FX.enabled && dt > 0) {
      emitters(dt);
      const n = Math.max(1, Math.ceil(dt / 0.02));
      for (let k = 0; k < n; k++) stepParticles(dt / n);
    }
    // the V1.27 2D particle canvas and the V1.28 refraction overlay are superseded here
    const D = global.document;
    if (D) for (const id of ["v127FxCanvas", "v128HazeCanvas"]) {
      const el = D.getElementById(id);
      if (el && FX.enabled && el.style.display !== "none") el.style.display = "none";
    }
    draw();
  }
  CORE.renderHooks = CORE.renderHooks || [];
  const at = CORE.renderHooks.findIndex((h) => h.id === "world");
  CORE.renderHooks.splice(at >= 0 ? at + 1 : CORE.renderHooks.length, 0, { id: "fx", draw: frame });
  // advance emitters + particles by sim time without drawing (scripted / synchronous runs)
  FX.tick = (dt) => {
    if (!(dt > 0)) return;
    emitters(dt);
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepParticles(dt / n);
    lastSimT = free.time;
  };
  FX.emit = emit;
  FX.clear = () => { P.alive = 0; };
  FX.particles = P;
  global.__LUCID_CORE_FX_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

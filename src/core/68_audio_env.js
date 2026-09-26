// LUCID MOTO core · tire + wind audio
// ------------------------------------------------------------------------------------------
// The V1.22 acoustic studio synthesises the engine, intake, mechanical and driveline channels
// (untouched here). This layer adds the two sound sources a rider feels the limit through, fed
// from the physics and mixed into the same WebAudio graph:
//   tires   stick-slip squeal of the sliding part of each contact patch: band-limited noise at
//           the tread-block eigenfrequency (~0.7-1 kHz) rising with sliding speed, plus its
//           second partial, loudness ~ sliding power^0.7 (RTT), rough with stick-slip AM;
//           rolling road roar ~ speed^1.5 (texture of the surface: asphalt, paint, kerb
//           ripple, grass rumble)
//   wind    broadband roar ~ airspeed^2 whose brightness rises with speed; quieter tucked in
//           behind the screen, louder in the helmet camera
// Tire sources enter the bike bus (distance, air absorption and room like the engine); wind
// enters after the room (it is at the listener). Levels: profile.mixer.tires / .wind.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_AUDIO_ENV__) return;
  const CORE = global.LUCID_CORE;
  if (!CORE || typeof free === "undefined") {
    console.warn("LUCID audio env: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_AUDIO_ENV__ = true;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), sat = (x) => clamp(x, 0, 1);

  const AE = (CORE.audioEnv = {
    enabled: true, ctx: null, nodes: null, error: null,
    levels: { tires: 0.7, wind: 0.5 }, // defaults when the sound profile has no mixer.tires / .wind
    state: { squealF: 0, squealR: 0, road: 0, wind: 0, fF: 0, fR: 0, view: "" },
  });

  function noiseBuffer(ctx, seconds, seed) {
    const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(1, n, ctx.sampleRate), a = b.getChannelData(0);
    let s = seed >>> 0;
    for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; a[i] = (s / 4294967296) * 2 - 1; }
    return b;
  }
  function build(E) {
    // bike bus: the distance/room chain entry (worklet path: sum; compatibility DSP: distanceLP)
    const ctx = E.ctx, bus = E.sum || E.distanceLP, post = E.comp || E.master;
    if (!ctx || !bus || !post) return null;
    const src = [noiseBuffer(ctx, 2.3, 0x1234567), noiseBuffer(ctx, 2.9, 0x7654321)].map((buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    });
    const bp = (f, q) => { const n = ctx.createBiquadFilter(); n.type = "bandpass"; n.frequency.value = f; n.Q.value = q; return n; };
    const lp = (f) => { const n = ctx.createBiquadFilter(); n.type = "lowpass"; n.frequency.value = f; return n; };
    const gain = (g = 0) => { const n = ctx.createGain(); n.gain.value = g; return n; };
    const pan = (p) => { const n = ctx.createStereoPanner(); n.pan.value = p; return n; };
    const N = { src, tireBus: gain(1), windBus: gain(1) };
    // per tire: fundamental + second partial through a stick-slip amplitude modulator
    for (const [k, s, p] of [["F", src[0], -0.05], ["R", src[1], 0.05]]) {
      const b1 = bp(800, 7), b2 = bp(1700, 9), g1 = gain(0), g2 = gain(0), am = gain(1), pn = pan(p);
      s.connect(b1); b1.connect(g1); g1.connect(am);
      s.connect(b2); b2.connect(g2); g2.connect(am);
      am.connect(pn); pn.connect(N.tireBus);
      N["b1" + k] = b1; N["b2" + k] = b2; N["g1" + k] = g1; N["g2" + k] = g2; N["am" + k] = am;
    }
    // rolling roar
    N.roadLP = lp(420); N.roadBP = bp(900, 0.9); N.road = gain(0);
    src[0].connect(N.roadLP); N.roadLP.connect(N.road);
    src[1].connect(N.roadBP); N.roadBP.connect(N.road);
    N.road.connect(N.tireBus);
    N.tireBus.connect(bus);
    // wind
    N.windLP = lp(600); N.windHP = ctx.createBiquadFilter(); N.windHP.type = "highpass"; N.windHP.frequency.value = 60; N.wind = gain(0);
    src[1].connect(N.windHP); N.windHP.connect(N.windLP); N.windLP.connect(N.wind); N.wind.connect(N.windBus);
    N.windBus.connect(post);
    return N;
  }
  function teardown() {
    const N = AE.nodes;
    if (!N) return;
    try { N.src.forEach((s) => { s.stop(); s.disconnect(); }); N.tireBus.disconnect(); N.windBus.disconnect(); } catch (_) {}
    AE.nodes = null;
  }
  function currentView() {
    const b = global.document?.querySelector?.("#v123RideCams .v124on, #v123RideCams .active");
    return b?.dataset?.view || "chase";
  }
  let amPhase = 0;
  function update(dt) {
    const E = global.DUCATI_SOUND_STUDIO?.engine;
    if (!AE.enabled || !E?.ctx || !E.enabled) { if (AE.nodes) { AE.nodes.tireBus.gain.value = 0; AE.nodes.windBus.gain.value = 0; } return; }
    if (AE.ctx !== E.ctx || !AE.nodes) { teardown(); AE.ctx = E.ctx; AE.nodes = build(E); if (!AE.nodes) return; }
    const N = AE.nodes, ctx = AE.ctx, t = ctx.currentTime, F = free, S = AE.state;
    const mix = E.profile?.mixer || {}, lt = +(mix.tires ?? AE.levels.tires), lw = +(mix.wind ?? AE.levels.wind);
    // AudioParam throws on non-finite values: never let a physics transient reach it
    const v = Math.hypot(F.v[0], F.v[1], F.v[2]) || 0, set = (p, x, tc = 0.04) => { if (Number.isFinite(x)) p.setTargetAtTime(x, t, tc); };
    amPhase += dt;
    // --- tires
    let roadAmp = 0, surfRough = 1;
    for (const [k, which, TT] of [["F", "front", F.tf], ["R", "rear", F.tr]]) {
      const o = CORE.tires?.[which]?.out;
      const P = o && o.contact ? Math.max(0, o.slidingPowerW || 0) : 0;
      const omega = which === "front" ? F.omegaF || 0 : F.omegaR || 0, Re = o?.effectiveRadiusM || 0.3;
      const vx = TT?.Vlong ?? v, vy = TT?.Vlat ?? 0, vSlide = Math.hypot(omega * Re - vx, vy);
      const loud = Math.pow(sat((P - 250) / 9000), 0.7) * sat(o?.slidingFraction * 4 || 0);
      const f0 = clamp(640 + 55 * vSlide, 600, 2600);
      // stick-slip roughness: fast irregular amplitude modulation
      const rough = 0.72 + 0.28 * Math.sin(amPhase * (37 + 11 * Math.sin(amPhase * 3.1))) * Math.sin(amPhase * 23.7);
      set(N["b1" + k].frequency, f0, 0.03);
      set(N["b2" + k].frequency, f0 * 2.13, 0.03);
      set(N["g1" + k].gain, 0.55 * loud, 0.025);
      set(N["g2" + k].gain, 0.18 * loud, 0.025);
      set(N["am" + k].gain, rough, 0.01);
      S["squeal" + k] = +loud.toFixed(3);
      S["f" + k] = Math.round(f0);
      if (o?.contact) {
        const surf = CORE.realtime?.road?.surface?.(TT?.contactPoint?.[0] ?? F.p[0], TT?.contactPoint?.[1] ?? F.p[1]) || "asphalt";
        surfRough = Math.max(surfRough, { asphalt: 1, paint: 0.8, kerb: 2.2, grass: 1.6 }[surf] ?? 1);
        roadAmp += 0.5;
      }
    }
    const road = roadAmp * Math.pow(sat(v / 60), 1.5) * 0.22 * surfRough;
    set(N.road.gain, road, 0.08);
    set(N.roadLP.frequency, 260 + 9 * v * (surfRough > 1.5 ? 0.6 : 1), 0.1);
    set(N.tireBus.gain, clamp(lt, 0, 1.5), 0.05);
    S.road = +road.toFixed(3);
    // --- wind: the tuck hides the helmet behind the screen
    const view = currentView(), onboard = view === "drive";
    const tuck = sat(+(CORE.rider?.posture?.tuck ?? 0) || 0);
    const w = Math.pow(sat(v / 70), 2) * (onboard ? 0.5 : 0.24) * (1 - 0.45 * tuck);
    set(N.wind.gain, w, 0.12);
    set(N.windLP.frequency, 380 + 26 * v, 0.2);
    set(N.windBus.gain, clamp(lw, 0, 1.5), 0.05);
    S.wind = +w.toFixed(3);
    S.view = view;
  }
  let lastT = null;
  function frame() {
    try {
      const tt = free.time, dt = lastT === null ? 0 : clamp(tt - lastT, 0, 0.1);
      lastT = tt;
      update(dt);
    } catch (e) {
      if (!AE.error) console.warn("LUCID audio env", e);
      AE.error = String(e);
    }
  }
  CORE.renderHooks = CORE.renderHooks || [];
  CORE.renderHooks.push({ id: "audioEnv", draw: frame });
  AE.update = update;
  global.__LUCID_CORE_AUDIO_ENV_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

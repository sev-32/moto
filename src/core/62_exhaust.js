// LUCID MOTO core · exhaust gas dynamics + afterfire
// ------------------------------------------------------------------------------------------
// Consolidates the exhaust effects of the studio (V1.27/V1.28 overlays, V1.22 DSP pops) and of
// the VOLUMETRICS build (V85.10: crank-phased afterfire, exhaust aerosol, hot gas) into one
// physical model that owns both what you see and what you hear at the tailpipes.
//
//   breathing   per-cylinder charge  m_air = rho V_cyl VE(rpm, throttle), fuel by AFR (rich at
//               WOT and on overrun, richer after a throttle chop: manifold wall film)
//   crank       720 deg cycle integrated from the V1.21 crank speed; the 916 L-twin fires at
//               0 / 270 deg, each exhaust valve opens ~125 deg after its TDC
//   combustion  normal cycles burn ~98.5 %; on closed-throttle overrun the diluted charge
//               misfires or burns partially (propensity = the sound profile's overrunPops);
//               the soft limiter cuts sparks (probability 1 - V1.21 limiter factor)
//   pipes       each unburnt charge becomes a parcel travelling header -> collector -> silencer
//               at the mean gas velocity (m_dot / rho(T) A); lengths come from the V1.25 thermal
//               network
//   ignition    the parcel lights when it meets a hot pulse of a normally-fired cycle or hot
//               walls (V1.25 wall temperatures): a cold exhaust barely pops, a hot one crackles;
//               it bangs inside (muffled, sound only) or at the outlet (flame + sharp pop);
//               unlit parcels leave as a puff of rich hydrocarbon mist
//   energy      E = m_unburnt x 43 MJ/kg x 0.9 -> flame length ~ E^(1/3), flame temperature
//               (blackbody-shaded soot), and the pop amplitude sent to the V1.22 DSP
//   exit flow   pulsed jets at the measured silencer end caps (GLB UnderseatMuffler_1/2_EndCap:
//               21.5 deg upward): heat shimmer per exhaust pulse (lumpy at idle), water vapour
//               condensing while the silencers are cold, all on simulation time
// Audio sync: the V1.22 worklet module is extended at load time with a "pop" message and its
// own random overrun pops are switched off, so every pop you hear is a bang of this model (and
// every visible flame is heard). Legacy sources stay untouched; when the worklet path is not
// available (compatibility DSP) the visuals run alone.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_EXHAUST__) return;
  const CORE = global.LUCID_CORE;
  if (!CORE || !CORE.fx || typeof free === "undefined") {
    console.warn("LUCID exhaust: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_EXHAUST__ = true;
  const FX = CORE.fx, TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), sat = (x) => clamp(x, 0, 1);
  const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  let seed = 0x5f3759df;
  const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) ^ Math.imul(seed ^ (seed >>> 13), 3266489917)) >>> 0) / 4294967296;
  const LHV = 43e6, RHO_AIR = 1.18, R_GAS = 287;

  const EX = (CORE.exhaust = {
    enabled: true, audioSync: true,
    // body frame (x right, y forward, z up) relative to the chassis reference, measured from the
    // GLB end caps; the axis runs from the silencer inlet collar to the end cap
    tipsBody: [[-0.135, -1.034, 0.224], [0.134, -1.034, 0.224]],
    axisBody: [0, -0.93, 0.367],
    tipAreaM2: Math.PI * 0.021 * 0.021,
    engine: { cylL: 0.458, firingDeg: [0, 270], evoDeg: 125 },
    pipe: { headerM: [0.88, 1.1], collectorM: 0.31, mufflerM: 0.49, areaM2: Math.PI * 0.02 * 0.02 },
    visibleFlameBias: 0.2, // share of bangs reaching the outlet for small charges (stock-ish cans)
    state: { crank: 0, prevThr: 0, film: 0, parcels: [], t: 0, egtC: 300, flowKgS: 0, vGas: 0 },
    stats: { cycles: 0, misfires: 0, cuts: 0, bangs: 0, flames: 0, unlit: 0, lastBangJ: 0, maxBangJ: 0, popsSent: 0, audio: "pending" },
    events: [], // recent bangs {t, E, cyl, outlet} for telemetry / tests
  });

  // ------------------------------------------------------------------ inputs
  const PT = () => global.DUCATI_ADVANCED_POWERTRAIN?.states?.free;
  const soundProfile = () => global.DUCATI_SOUND_STUDIO?.engine?.profile?.engine || {};
  function network() {
    const ex = global.LUCID_COMPONENT_ORCHESTRATOR?.state?.exhaust;
    if (!ex) return null;
    return ex;
  }
  const maxOf = (a, d) => (Array.isArray(a) && a.length ? Math.max(...a) : d);
  // volumetric efficiency: throttle-limited, with the 916's torque hump around 7-8.5 krpm
  function VE(rpm, thr) {
    const wot = 0.78 + 0.18 * Math.exp(-Math.pow((rpm - 7800) / 3200, 2));
    return 0.12 + (wot - 0.12) * Math.pow(sat(thr), 0.7);
  }
  // exhaust gas temperature at the port (C) for a normally-fired cycle
  function EGT(rpm, load) { return 300 + 520 * Math.pow(sat(load), 0.8) + 0.015 * rpm; }

  // ------------------------------------------------------------------ audio: extend the V1.22 worklet
  const POP_MSG = ["else if(d.type==='resetPhase')this.phaseDeg=0};", "else if(d.type==='resetPhase')this.phaseDeg=0;else if(d.type==='pop')this.popEnv+=.32*(+d.a||0);else if(d.type==='extPops')this.extPops=!!d.on};"];
  const POP_RAND = ["if(thr<.035&&rpm>(+e.overrunThresholdRpm||3500)", "if(!this.extPops&&thr<.035&&rpm>(+e.overrunThresholdRpm||3500)"];
  const AWp = global.AudioWorklet?.prototype;
  if (AWp && !AWp.__lucidExhaustPatch) {
    const baseAdd = AWp.addModule;
    AWp.addModule = async function (url, opts) {
      try {
        const src = await (await fetch(url)).text();
        if (src.includes("ducati-acoustic-processor") && src.includes(POP_MSG[0]) && src.includes(POP_RAND[0])) {
          const u2 = URL.createObjectURL(new Blob([src.replace(POP_MSG[0], POP_MSG[1]).replace(POP_RAND[0], POP_RAND[1])], { type: "application/javascript" }));
          try {
            const r = await baseAdd.call(this, u2, opts);
            EX.stats.audio = "worklet patched";
            return r;
          } finally { URL.revokeObjectURL(u2); }
        }
      } catch (e) {
        EX.stats.audio = "patch skipped: " + (e?.message || e);
      }
      return baseAdd.call(this, url, opts);
    };
    AWp.__lucidExhaustPatch = true;
  }
  let extPopsSent = null;
  function audioPort() {
    const E = global.DUCATI_SOUND_STUDIO?.engine;
    return EX.stats.audio === "worklet patched" && E?.node?.port && E.node.context?.state !== "closed" ? E.node.port : null;
  }
  function syncAudioMode() {
    const port = audioPort(), on = !!(EX.enabled && EX.audioSync);
    if (!port) { extPopsSent = null; return; }
    if (extPopsSent !== on) { port.postMessage({ type: "extPops", on }); extPopsSent = on; }
  }
  function sendPop(a) {
    const port = audioPort();
    if (!port || !EX.audioSync) return;
    port.postMessage({ type: "pop", a });
    EX.stats.popsSent++;
  }

  // ------------------------------------------------------------------ geometry
  function tips() {
    const F = free, q = F.q;
    return {
      p: EX.tipsBody.map((b) => v5add(F.p, v5qrot(q, b))),
      d: v5norm(v5qrot(q, EX.axisBody)),
    };
  }

  // ------------------------------------------------------------------ model step (sim time)
  function step(dt) {
    if (!EX.enabled || !(dt > 0)) return;
    const pt = PT(), S = EX.state;
    S.t += dt;
    syncAudioMode();
    if (!pt) return;
    const L = pt.last || {}, cmd = pt.command || {}, rpm = pt.engine?.rpm || 0, omega = pt.engine?.omega || 0;
    const running = cmd.mode === "ENGINE" && rpm > 350;
    const thr = sat(L.engine?.throttle ?? cmd.throttle ?? 0), limiter = L.engine?.limiter ?? 1;
    const torque = L.engine?.controlledCrankTorqueNm ?? 0, load = sat(torque / 95);
    const prof = soundProfile(), popsK = Math.max(0, +(prof.overrunPops ?? 0.12)) / 0.12, rpmPop = +(prof.overrunThresholdRpm ?? 3600);
    // manifold wall film: a throttle chop dumps it into the next cycles (rich misfires)
    const dThr = thr - S.prevThr;
    S.prevThr = thr;
    if (dThr < 0) S.film = Math.min(1.5, S.film + -dThr * 1.4);
    S.film *= Math.exp(-dt / 0.6);
    // flows and temperatures
    const net = network();
    const hdr = EX.pipe.headerM.map((d, i) => +(net?.[i ? "headerB" : "headerA"]?.lengthM) || d);
    const colL = +(net?.collector?.lengthM) || EX.pipe.collectorM, mufL = +(net?.mufflerA?.lengthM) || EX.pipe.mufflerM;
    const wallHot = Math.max(maxOf(net?.collector?.wallC, 22), maxOf(net?.mufflerA?.wallC, 22), maxOf(net?.mufflerB?.wallC, 22), 0.85 * Math.max(maxOf(net?.headerA?.wallC, 22), maxOf(net?.headerB?.wallC, 22)));
    const mufWall = 0.5 * (maxOf(net?.mufflerA?.wallC, 22) + maxOf(net?.mufflerB?.wallC, 22));
    const outC = net ? 0.5 * ((+net.mufflerA?.gasOutC || 22) + (+net.mufflerB?.gasOutC || 22)) : 22;
    const ve = VE(rpm, thr), mAir = RHO_AIR * EX.engine.cylL * 1e-3 * ve;
    const overrun = running && thr < 0.04 && rpm > 1800;
    const afr = overrun ? clamp(12.6 - 2.2 * S.film, 9.5, 13) : thr > 0.85 ? 12.8 : 13.9;
    const mFuel = mAir / afr, egt = EGT(rpm, load);
    S.egtC += (egt - S.egtC) * (1 - Math.exp(-dt / 0.08));
    const flowKgS = running ? 2 * (mAir + mFuel) * (rpm / 120) : 0;
    S.flowKgS = flowKgS;
    const rhoGas = 101325 / (R_GAS * (S.egtC + 273.15));
    S.vGas = clamp(flowKgS / 2 / (rhoGas * EX.pipe.areaM2), 0.4, 160); // mean velocity in one header

    // --- crank: exhaust valve openings in this interval
    const evs = [];
    if (running) {
      const a0 = S.crank, a1 = a0 + omega * dt;
      for (let k = 0; k < 2; k++) {
        const e = ((EX.engine.firingDeg[k] + EX.engine.evoDeg) % 720) * DEG;
        for (let base = Math.floor(a0 / (4 * Math.PI)) * 4 * Math.PI; base <= a1; base += 4 * Math.PI) {
          const ang = base + e;
          if (ang > a0 && ang <= a1) evs.push([(ang - a0) / Math.max(a1 - a0, 1e-9), k]);
        }
      }
      S.crank = a1 % (4 * Math.PI);
      evs.sort((x, y) => x[0] - y[0]);
    }
    const T = tips(), vBike = free.v;
    for (const [frac, k] of evs) {
      const tEv = S.t - dt * (1 - frac);
      EX.stats.cycles++;
      let burnt = 0.985, kind = "fire";
      if (limiter < 0.999 && rnd() < 0.6 * (1 - limiter)) { burnt = 0; kind = "cut"; EX.stats.cuts++; } // soft limiter: spark cuts
      else if (overrun && rpm > 0.8 * rpmPop) {
        // calibrated so the default profile (overrunPops 0.12) crackles like the V1.22 DSP did:
        // ~5-7 pops/s at 7-8 krpm with a hot exhaust, a burst right after a chop
        const pMis = popsK * (0.012 + 0.045 * sat((rpm - rpmPop) / 5500) + 0.06 * S.film);
        if (rnd() < pMis) { burnt = 0.5 * rnd(); kind = "misfire"; EX.stats.misfires++; }
      }
      const tPulse = burnt > 0.9 ? S.egtC : 180 + (S.egtC - 180) * burnt;
      // a hot pulse lights the parcels it runs into (its own header, or everything past the collector)
      if (burnt > 0.9) for (const p of S.parcels) {
        if (p.lit || (p.cyl !== k && p.x < hdr[p.cyl])) continue;
        const pIgn = sat((tPulse - 520) / 300) * 0.55;
        if (rnd() < pIgn) bang(p, tEv, p.x > hdr[p.cyl] + colL + 0.6 * mufL, T, vBike);
      }
      const mU = mFuel * (1 - burnt);
      if (kind !== "fire" && mU > 2e-7) S.parcels.push({ cyl: k, x: 0, mU, born: tEv, lit: false, kind }); // normal-cycle HC slip post-oxidises quietly
      pulseAtTips(k, tPulse, mAir + mFuel, T, vBike, outC, mufWall, rpm, thr);
    }
    // --- parcels travel; hot walls light them; the outlet lights or releases them
    const total = (k) => hdr[k] + colL + mufL;
    for (const p of S.parcels) {
      if (p.lit) continue;
      p.x += S.vGas * (p.x < hdr[p.cyl] ? 1 : 0.62) * dt; // the collector/silencer are wider: slower
      const lam = 22 * sat((wallHot - 430) / 260);
      if (lam > 0 && rnd() < 1 - Math.exp(-lam * dt)) { bang(p, S.t, p.x > total(p.cyl) - 0.35 * mufL, T, vBike); continue; }
      if (p.x >= total(p.cyl)) {
        // outlet: the rich hot pocket meets fresh air
        const pExit = sat((Math.max(outC, wallHot - 120) - 330) / 300) * 0.8;
        if (rnd() < pExit) bang(p, S.t, true, T, vBike);
        else { p.lit = true; unlit(p, T, vBike); }
      }
    }
    S.parcels = S.parcels.filter((p) => !p.lit && S.t - p.born < 2);
    if (EX.events.length > 40) EX.events.splice(0, EX.events.length - 40);
  }

  // ------------------------------------------------------------------ outcomes
  function bang(p, t, outlet, T, vBike) {
    p.lit = true;
    const E = p.mU * LHV * 0.9;
    EX.stats.bangs++;
    EX.stats.lastBangJ = E;
    EX.stats.maxBangJ = Math.max(EX.stats.maxBangJ, E);
    // the bigger the charge, the more of it is still burning when it reaches the outlet
    const visible = outlet || rnd() < sat(EX.visibleFlameBias + 0.25 * Math.log10(Math.max(E, 1) / 50));
    // DSP pop amplitude: a typical overrun misfire (~150 J) ~ the V1.22 default pop (0.32 x 0.12)
    const a = clamp(0.1 * Math.sqrt(E / 90) * (visible ? 1.15 : 0.75), 0.02, 1.2);
    sendPop(a);
    EX.events.push({ t: +t.toFixed(3), E: Math.round(E), cyl: p.cyl, kind: p.kind, outlet: visible, a: +a.toFixed(3) });
    if (visible) { EX.stats.flames++; flame(E, T, vBike); }
  }
  function flame(E, T, vBike) {
    // 2-1-2 system: a collector bang can flame either silencer, big ones both
    const cans = E > 600 && rnd() < 0.5 ? [0, 1] : [rnd() < 0.5 ? 0 : 1];
    const len = clamp(0.08 + 0.1 * Math.cbrt(E / 120), 0.08, 0.42), Tk = clamp(1450 + 180 * Math.log10(Math.max(E, 10) / 60) + 160 * rnd(), 1300, 2150);
    for (const c of cans) {
      // the flame is a burning jet anchored at the outlet: the kernel is laid out along the axis
      // (flame length from the energy) and only creeps outward while it burns out (30-80 ms)
      const o = T.p[c], d = T.d, n = Math.max(5, Math.round(6 + 6 * sat(E / 900)));
      for (let j = 0; j < n; j++) {
        const u = (j + rnd() * 0.8) / n, ax = 0.005 + len * Math.pow(u, 1.15);
        const pos = [o[0] + d[0] * ax, o[1] + d[1] * ax, o[2] + d[2] * ax];
        const vel = v5add(v5add(vBike, v5mul(d, 0.6 + 1.6 * u + 1.2 * rnd())), [(rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35, 0.25 * rnd()]);
        const r0 = 0.014 + 0.026 * Math.sin(Math.PI * Math.min(1, 0.15 + u)), r1 = r0 * (1.35 + 0.5 * rnd());
        FX.emit(2, pos, vel, 0.028 + 0.035 * sat(E / 600) + 0.02 * rnd(), r0, r1, 0.85 + 0.3 * rnd(), (Tk - 320 * u) / 2500);
      }
      // the burnt pocket leaves a short-lived hot shimmer and a wisp of smoke
      FX.emit(3, o, v5add(vBike, v5mul(d, 3)), 0.35, 0.05, 0.3, 1, 1);
      FX.emit(1, o, v5add(vBike, v5mul(d, 2.5)), 0.7, 0.05, 0.3, 0.1, 0.3);
    }
  }
  function unlit(p, T, vBike) {
    EX.stats.unlit++;
    const dens = clamp(p.mU / 8e-6, 0.03, 0.35), c = rnd() < 0.5 ? 0 : 1;
    FX.emit(1, T.p[c], v5add(vBike, v5mul(T.d, 1.5 + rnd())), 1.1 + rnd(), 0.04, 0.32, dens, 0.1);
  }
  // each exhaust pulse at the tips: shimmer of the hot gas, condensing vapour while cold
  function pulseAtTips(k, tPulse, mCharge, T, vBike, outC, mufWall, rpm, thr) {
    // above ~4 krpm the pulses merge into a steady jet: sample every 3rd; the 2-1-2 system feeds
    // both silencers from the collector, so pulses alternate between the two outlets
    const every = rpm > 4200 ? 3 : 1;
    if (EX.stats.cycles % every) return;
    const d = T.d, vj = clamp(S_vExit(mCharge, outC, rpm) * (1.5 + 0.8 * rnd()), 0.6, 40);
    const hot = sat((outC - 45) / 520);
    for (const c of rpm > 4200 ? [((EX.stats.cycles / every) | 0) % 2] : [0, 1]) {
      const vel = v5add(v5add(vBike, v5mul(d, vj)), [(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.2]);
      if (hot > 0.03 && FX.haze.enabled) FX.emit(3, T.p[c], vel, 0.3 + 0.25 * rnd(), 0.035, 0.22 + 0.15 * hot, 1, 0.25 + 0.75 * hot);
      // water from combustion (~1.35 kg per kg fuel) condenses in cold silencers: white vapour
      const cold = 1 - smooth(45, 95, mufWall), water = 1.35 * mCharge / 14.5;
      if (cold > 0.04) FX.emit(1, T.p[c], vel, 0.45 + 0.6 * rnd(), 0.03, 0.2 + 0.1 * rnd(), clamp(cold * water / 6e-6 * 0.07, 0.01, 0.2), 0.15);
    }
  }
  function S_vExit(mCharge, outC, rpm) {
    const rho = 101325 / (R_GAS * (Math.max(outC, 20) + 273.15));
    return (mCharge * (rpm / 120)) / (rho * EX.tipAreaM2); // both cylinders share two outlets
  }

  // ------------------------------------------------------------------ wiring
  FX.emitters.push(step);
  EX.reset = () => { const S = EX.state; S.parcels.length = 0; S.film = 0; S.prevThr = 0; EX.events.length = 0; };
  EX.snapshot = () => ({ ...EX.stats, egtC: +EX.state.egtC.toFixed(0), flowGs: +(EX.state.flowKgS * 1000).toFixed(2), vGas: +EX.state.vGas.toFixed(1), film: +EX.state.film.toFixed(3), parcels: EX.state.parcels.length, recent: EX.events.slice(-6) });
  global.__LUCID_CORE_EXHAUST_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

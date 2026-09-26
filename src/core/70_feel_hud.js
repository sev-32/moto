// LUCID MOTO core · feel HUD
// ------------------------------------------------------------------------------------------
// A compact physics readout for judging the feel while riding (T toggles, remembered):
//   friction circles   per tire, (Fy, Fx) / (mu_peak Fz) from the RTT with a 1.5 s trail:
//                      how much of the grip the rider is using and in which direction
//   loads              NF / NR and their share (load transfer under brakes / throttle)
//   slip               slip ratio kappa, slip angle alpha, sliding power
//   suspension         fork and rear wheel travel with the end-stop zones and live rates
//   attitude           lean, pitch, steer torque; rider posture (hang / fore-aft / tuck)
//   inputs             throttle, front / rear brake pressure, clutch, gear, rpm
// Drawn on a small 2D canvas at ~20 Hz; FREE RIDE only.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_FEEL_HUD__) return;
  const CORE = global.LUCID_CORE, D = global.document;
  if (!CORE || !D || typeof free === "undefined") return;
  global.__LUCID_CORE_FEEL_HUD__ = true;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const DEG = 180 / Math.PI;
  let on = false;
  try { on = global.localStorage?.getItem("lucid.feelHud") === "1"; } catch (_) {}
  const H = (CORE.feelHud = { get on() { return on; }, trail: { front: [], rear: [] }, frames: 0 });
  const W = 348, HH = 196;
  let cv = null, ctx = null, dpr = 1;
  function ensure() {
    if (cv) return true;
    const host = D.getElementById("gl")?.parentElement;
    if (!host) return false;
    cv = D.createElement("canvas");
    cv.id = "lucidFeelHud";
    cv.style.cssText = `position:absolute;left:18px;top:104px;width:${W}px;height:${HH}px;z-index:129;pointer-events:none;border-radius:8px`;
    host.appendChild(cv);
    ctx = cv.getContext("2d");
    return true;
  }
  function setOn(v) {
    on = !!v;
    try { global.localStorage?.setItem("lucid.feelHud", on ? "1" : "0"); } catch (_) {}
    if (cv) cv.style.display = on ? "block" : "none";
  }
  H.toggle = () => setOn(!on);
  H.set = setOn;
  global.addEventListener?.("keydown", (e) => {
    if (e.code !== "KeyT" || e.repeat || e.ctrlKey || e.metaKey) return;
    const tag = (e.target?.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (String(global.__LUCID_ACTIVE_PAGE__ || "RIDE").toUpperCase() !== "RIDE") return;
    H.toggle();
  });

  const col = (u) => (u < 0.7 ? "#63e38a" : u < 0.9 ? "#f3d35b" : "#ff5a4a");
  function circle(x, y, r, which, o) {
    const g = ctx, T = H.trail[which];
    g.strokeStyle = "rgba(160,210,230,.35)";
    g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.7, 0, 2 * Math.PI); g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
    const mu = Math.max(0.2, o?.muPeak || 1.3), Fz = Math.max(1, o?.Fz || 0), c = o?.contact !== false && Fz > 30;
    const nx = c ? clamp((o.Fy || 0) / (mu * Fz), -1.3, 1.3) : 0, ny = c ? clamp((o.Fx || 0) / (mu * Fz), -1.3, 1.3) : 0;
    T.push([nx, ny]);
    if (T.length > 30) T.shift();
    g.strokeStyle = "rgba(255,255,255,.35)";
    g.beginPath();
    T.forEach(([a, b], i) => (i ? g.lineTo(x + a * r, y - b * r) : g.moveTo(x + a * r, y - b * r)));
    g.stroke();
    const u = Math.hypot(nx, ny);
    g.fillStyle = c ? col(u) : "#6b7a80";
    g.beginPath(); g.arc(x + nx * r, y - ny * r, 4, 0, 2 * Math.PI); g.fill();
    return u;
  }
  function vbar(x, y, w, h, frac, label, color, marks = []) {
    const g = ctx;
    g.fillStyle = "rgba(255,255,255,.07)";
    g.fillRect(x, y, w, h);
    for (const [f, c] of marks) { g.fillStyle = c; g.fillRect(x, y + h * (1 - f), w, 1); }
    g.fillStyle = color;
    const f = clamp(frac, 0, 1);
    g.fillRect(x, y + h * (1 - f), w, h * f);
    g.fillStyle = "#9fc6d2";
    g.fillText(label, x + w / 2 - g.measureText(label).width / 2, y + h + 10);
  }
  function hbar(x, y, w, v, label, color, signed = false) {
    const g = ctx;
    g.fillStyle = "rgba(255,255,255,.07)";
    g.fillRect(x, y, w, 5);
    g.fillStyle = color;
    if (signed) { const c = x + w / 2, e = c + (w / 2) * clamp(v, -1, 1); g.fillRect(Math.min(c, e), y, Math.abs(e - c), 5); }
    else g.fillRect(x, y, w * clamp(v, 0, 1), 5);
    g.fillStyle = "#9fc6d2";
    g.fillText(label, x - 30, y + 5);
  }
  function draw() {
    const F = free, T = CORE.tires, pt = global.DUCATI_ADVANCED_POWERTRAIN?.states?.free, cmd = pt?.command || {}, S = F.S;
    const r = Math.min(devicePixelRatio || 1, 2);
    if (r !== dpr || cv.width !== W * r) { dpr = r; cv.width = W * r; cv.height = HH * r; }
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, HH);
    g.fillStyle = "rgba(5,12,16,.72)";
    g.fillRect(0, 0, W, HH);
    g.font = "9px ui-monospace,monospace";
    const fo = T?.front?.out, ro = T?.rear?.out;
    const uF = circle(48, 58, 38, "front", fo), uR = circle(140, 58, 38, "rear", ro);
    g.fillStyle = "#cfe9f2";
    g.fillText("FRONT", 33, 12);
    g.fillText("REAR", 128, 12);
    const NF = fo?.Fz || 0, NR = ro?.Fz || 0, tot = Math.max(1, NF + NR);
    const line = (x, y, s) => g.fillText(s, x, y);
    g.fillStyle = "#e6f6fb";
    line(10, 112, `N ${Math.round(NF)}  ${Math.round((100 * NF) / tot)}%`);
    line(102, 112, `N ${Math.round(NR)}  ${Math.round((100 * NR) / tot)}%`);
    g.fillStyle = "#9fc6d2";
    line(10, 123, `k ${(fo?.kappa || 0).toFixed(3)} a ${((fo?.alpha || 0) * DEG).toFixed(1)}`);
    line(102, 123, `k ${(ro?.kappa || 0).toFixed(3)} a ${((ro?.alpha || 0) * DEG).toFixed(1)}`);
    line(10, 134, `use ${Math.round(uF * 100)}%  ${((fo?.slidingPowerW || 0) / 1000).toFixed(1)}kW`);
    line(102, 134, `use ${Math.round(uR * 100)}%  ${((ro?.slidingPowerW || 0) / 1000).toFixed(1)}kW`);
    // suspension
    const fx = F.forkTravel || 0, fMax = S.travelFHard || 0.12, su = F.last?.suspension || {};
    const rx = su.rearTravelM ?? 0, rMax = 0.13;
    vbar(196, 16, 12, 100, fx / fMax, "FORK", fx / fMax > 0.9 ? "#ff5a4a" : "#4fb3d9", [[0.25, "#cfe9f2"], [0.9, "#ff5a4a"]]);
    vbar(222, 16, 12, 100, rx / rMax, "REAR", rx / rMax > 0.9 ? "#ff5a4a" : "#4fb3d9", [[0.25, "#cfe9f2"], [0.9, "#ff5a4a"]]);
    g.fillStyle = "#e6f6fb";
    line(186, 140, `${Math.round(fx * 1000)} / ${Math.round(rx * 1000)} mm`);
    // attitude + posture + inputs
    const ang = v5bodyAngles(F.q), v = Math.hypot(F.v[0], F.v[1]);
    g.fillStyle = "#e6f6fb";
    line(252, 14, `lean ${(ang.rollRad * DEG).toFixed(1)}`);
    line(252, 25, `pitch ${(ang.pitchRad * DEG).toFixed(1)}`);
    line(252, 36, `steer ${(F.controls?.userSteerTorqueNm || 0).toFixed(1)}Nm`);
    line(252, 47, `${(v * 3.6).toFixed(0)} km/h  g${cmd.gear ?? "-"}`);
    line(252, 58, `${Math.round(pt?.engine?.rpm || 0)} rpm`);
    const P = CORE.rider?.posture || {};
    hbar(282, 70, 58, P.hang || 0, "hang", "#b58cff", true);
    hbar(282, 80, 58, P.foreAft || 0, "fwd", "#b58cff", true);
    hbar(282, 90, 58, P.tuck || 0, "tuck", "#b58cff", true);
    hbar(282, 104, 58, cmd.throttle || 0, "thr", "#63e38a");
    hbar(282, 114, 58, (cmd.frontBrakeBar || 0) / 60, "F bar", "#ff7b54");
    hbar(282, 124, 58, (cmd.rearBrakeBar || 0) / 40, "R bar", "#ff7b54");
    hbar(282, 134, 58, cmd.clutch ?? 1, "clu", "#4fb3d9");
    g.fillStyle = "#6f94a0";
    line(10, 156, "friction circle: (Fy, Fx) / (mu Fz)   ring 70 %   T hides");
    const ex = CORE.exhaust?.state, rb = CORE.burnoutRig;
    line(10, 168, `EGT ${Math.round(ex?.egtC || 0)}C  bangs ${CORE.exhaust?.stats?.bangs ?? 0}  ${rb?.active ? "BURNOUT " + rb.phase : ""}`);
    const au = CORE.audioEnv?.state;
    if (au) line(10, 180, `squeal F ${au.squealF} R ${au.squealR}  wind ${au.wind}`);
  }
  let acc = 0;
  function frame() {
    const ride = String(global.__LUCID_ACTIVE_PAGE__ || "RIDE").toUpperCase() === "RIDE";
    if (!ensure()) return;
    cv.style.display = on && ride ? "block" : "none";
    if (!on || !ride) return;
    if (++acc % 3) return;
    draw();
    H.frames++;
  }
  (CORE.renderHooks = CORE.renderHooks || []).push({ id: "feelHud", draw: frame });
  global.__LUCID_CORE_FEEL_HUD_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

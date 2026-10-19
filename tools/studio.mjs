// The render studio shared by tools/capture-ride.mjs and tools/pose-board.mjs: the game's canvas
// alone at a fixed size (the page's UI hidden), camera rigs fixed on the bike (its position and
// heading, not its lean: the horizon stays level, her movement on the bike reads directly), and a
// frame read straight from the WebGL canvas (drawn and read in one call: WebGL clears the canvas
// once the page has shown it).
export const RIGS = {
  side: { yaw: 90, pitch: 6, dist: 2.9, at: [0, -0.05, 0.85], fov: 42 },
  left: { yaw: -90, pitch: 6, dist: 2.9, at: [0, -0.05, 0.85], fov: 42 },
  front34: { yaw: 40, pitch: 9, dist: 3.0, at: [0, 0.05, 0.85], fov: 42 },
  rear34: { yaw: 145, pitch: 12, dist: 3.1, at: [0, -0.1, 0.85], fov: 42 },
  front: { yaw: 0, pitch: 6, dist: 3.4, at: [0, 0.1, 0.8], fov: 40 },
  rear: { yaw: 180, pitch: 8, dist: 3.4, at: [0, -0.2, 0.8], fov: 40 },
  top: { yaw: 90, pitch: 70, dist: 3.6, at: [0, -0.05, 0.6], fov: 42 },
  rider: { yaw: 70, pitch: 4, dist: 1.9, at: [0, -0.1, 1.0], fov: 40 },
};
// (yaw: degrees from the bike's forward towards its right, of the eye seen from the target; at:
// the target in the bike's heading frame - right, forward, height above the ground)
export async function installStudio(page, { W = 960, H = 600 } = {}) {
  return page.evaluate(({ W, H, RIGS }) => {
    const cvs = document.getElementById("gl");
    const keep = new Set();
    for (let e = cvs; e; e = e.parentElement) keep.add(e);
    for (const e of document.querySelectorAll("body *")) if (!keep.has(e) && !e.contains(cvs)) e.style.visibility = "hidden";
    Object.assign(cvs.style, { position: "fixed", left: "0px", top: "0px", width: W + "px", height: H + "px", zIndex: 9999 });
    const S = (window.__STUDIO_CAM__ = { on: true, mode: "side", rigs: RIGS });
    const base = updateFreeCamera;
    updateFreeCamera = function () {
      if (!S.on) return base();
      const R = S.rigs[S.mode] || S.rigs.side, f0 = v5qrot(free.q, V5_Y), n = Math.hypot(f0[0], f0[1]) || 1, f = [f0[0] / n, f0[1] / n, 0], r = [f[1], -f[0], 0];
      const a = (R.yaw * Math.PI) / 180, d = [f[0] * Math.cos(a) + r[0] * Math.sin(a), f[1] * Math.cos(a) + r[1] * Math.sin(a)];
      cam.yaw = Math.atan2(d[0], d[1]);
      cam.pitch = (R.pitch * Math.PI) / 180;
      cam.dist = R.dist;
      cam.target = [free.p[0] + r[0] * R.at[0] + f[0] * R.at[1], free.p[1] + r[1] * R.at[0] + f[1] * R.at[1], R.at[2]];
      window.__LUCID_RIDE_CAMERA_UP__ = [0, 0, 1];
      window.__LUCID_RIDE_FOV__ = R.fov;
    };
    return { canvas: [cvs.width, cvs.height], rigs: Object.keys(RIGS) };
  }, { W, H, RIGS });
}
// one frame from one camera rig, as PNG bytes
export async function grab(page, mode) {
  const data = await page.evaluate((m) => {
    window.__STUDIO_CAM__.mode = m;
    try { renderFree(); } catch (e) { console.error(e?.message || e); }
    return document.getElementById("gl").toDataURL("image/png");
  }, mode);
  return Buffer.from(data.split(",")[1], "base64");
}
// the virtual clock: page time advances only when the recorder says (installed before the page's
// own scripts run; window.__VCLOCK__.start() takes over, .frame(ms) advances one frame)
export const clockInit = () => {
  const realNow = performance.now.bind(performance), realRAF = window.requestAnimationFrame.bind(window);
  const V = (window.__VCLOCK__ = { on: false, t: 0, q: [], frames: 0 });
  Object.defineProperty(performance, "now", { value: () => (V.on ? V.t : realNow()), configurable: true });
  window.requestAnimationFrame = (cb) => { if (V.on) { V.q.push(cb); return V.q.length; } return realRAF(cb); };
  V.start = () => { V.t = realNow(); V.on = true; };
  V.frame = (ms) => {
    V.t += ms;
    const q = V.q.splice(0);
    for (const cb of q) { try { cb(V.t); } catch (e) { console.error("frame", e?.message || e); } }
    V.frames++;
    return q.length;
  };
};
// open the build on the ride page, rolling
export async function openRide(openBuild, file, { W = 960, H = 600, clock = false } = {}) {
  const r = await openBuild(file, { width: W, height: H + 60, init: clock ? clockInit : null });
  await r.page.waitForFunction(() => window.__LUCID_CORE_WORLD_READY__, null, { timeout: 180000 }).catch(() => {});
  const btn = r.page.locator("button:visible", { hasText: "START ROLLING RIDE" }).first();
  if (await btn.count()) await btn.click().catch(() => {});
  // (the launch starts the audio, then resets the ride to its rolling start and closes the
  // launcher - seconds later at times: wait for it, or the reset lands on a tool's setup)
  await r.page.waitForFunction(() => !document.getElementById("v1282Launcher")?.classList.contains("open"), null, { timeout: 30000 }).catch(() => {});
  await r.page.waitForTimeout(1500);
  return r;
}

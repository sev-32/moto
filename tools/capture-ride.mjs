#!/usr/bin/env node
// Record the rider on the bike, frame by frame, from the real game build - for review and for
// working on her movement together (renders, GIFs, video).
//
//   node tools/capture-ride.mjs [options]
//     --maneuver NAME   a scripted ride from 90_maneuvers (LUCID_CORE.maneuvers.names()): coast,
//                       brakeFirm, lean35, radius60, slalom, wheelie, stoppie, ... (default coast)
//     --seconds S       how much ride to record (default: the maneuver's own length)
//     --fps N           frames per second of ride time (default 25)
//     --cams LIST       comma list of studio cameras: side, left, front34, rear34, front, rear,
//                       top, rider (close on her, from the right) (default side)
//     --size WxH        canvas size (default 960x600)
//     --out DIR         where frames, MP4 and GIF go (default tmp/capture/<maneuver>)
//     --gif-width W     GIF width (default 480; 0 = no GIF)
//     --still T         instead of a clip: one PNG per camera at ride time T (s)
//     --posture JSON    rider posture held while recording, e.g. '{"tuck":1}' (BIO.setPosture)
//     --pose-set FILE   a pose set (JSON, exported from the in-game POSE LAB) applied first
//     --build FILE      the built HTML (default dist/LucidMoto_V2.0.0_dev.html; npm run build first)
//
// How: the page's clock is replaced by a virtual one (performance.now and requestAnimationFrame),
// so each recorded frame is exactly 1/fps of simulated ride however slowly the software renderer
// runs; the camera is a fixed studio rig on the bike (its heading, not its lean - the horizon stays
// level and her movement on the bike reads directly); each frame is read straight from the WebGL
// canvas, so no page UI is in it. Needs ffmpeg (on PATH or FFMPEG=...) for MP4/GIF; frames alone
// otherwise.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { openBuild, ROOT } from "../tests/browser/lib.mjs";
import { installStudio, grab, openRide } from "./studio.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const maneuver = opt("maneuver", "coast");
const fps = +opt("fps", 25);
const cams = String(opt("cams", "side")).split(",").map((s) => s.trim()).filter(Boolean);
const [W, H] = String(opt("size", "960x600")).split("x").map(Number);
const out = path.resolve(opt("out", path.join(ROOT, "tmp/capture", maneuver)));
const gifW = +opt("gif-width", 480);
const still = opt("still", null);
const posture = opt("posture", null);
const build = opt("build", path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html"));
const setFile = opt("pose-set", null);
const ffmpeg = process.env.FFMPEG || "ffmpeg";
fs.mkdirSync(out, { recursive: true });

const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const { browser, page, logs } = await openRide(openBuild, build, { W, H, clock: true });
log("build loaded, ride page:", await page.evaluate(() => window.__LUCID_ACTIVE_PAGE__));
// the studio (the canvas alone, the camera rigs), the clock taken over, the maneuver started
const studio = await installStudio(page, { W, H });
if (setFile) log("pose set:", JSON.stringify(await page.evaluate((t) => { const L = window.LUCID_CORE.poseLab; L.open(); L.close(); return L.apply(t); }, fs.readFileSync(setFile, "utf8"))));
const setup = await page.evaluate(({ maneuver, posture }) => {
  const C = window.LUCID_CORE, BIO = C.riderBio?.active ? C.riderBio : null;
  window.__VCLOCK__.start();
  const res = C.maneuvers.play(maneuver);
  if (posture && BIO) { BIO.auto = false; BIO.setPosture(JSON.parse(posture)); }
  return { res, rider: BIO ? "riderBio" : C.rider ? "legacy" : "none" };
}, { maneuver, posture });
log("studio:", JSON.stringify({ ...setup, ...studio }));

const T = still != null ? +still : +(opt("seconds", setup.res.T));
const n = Math.round(T * fps), dtMs = 1000 / fps;
// (frames: the same ride from every camera at each instant - the clock advances once per frame,
// the camera rigs take turns re-rendering it)
for (const c of cams) fs.mkdirSync(path.join(out, c), { recursive: true });
const meta = [];
for (let i = 0; i <= n; i++) {
  if (i > 0) await page.evaluate((ms) => window.__VCLOCK__.frame(ms), dtMs);
  if (still != null && i < n) continue;
  for (const c of cams) fs.writeFileSync(path.join(out, c, `f${String(still != null ? 0 : i).padStart(4, "0")}.png`), await grab(page, c));
  const s = await page.evaluate(() => {
    const F = free, L = window.LUCID_CORE.maneuvers.live(), B = window.LUCID_CORE.riderBio;
    return { t: +L.t.toFixed(3), live: L.active, speed: +Math.hypot(F.v[0], F.v[1]).toFixed(2), rollDeg: +((v5bodyAngles(F.q).rollRad * 180) / Math.PI).toFixed(1), mode: B?.plan?.mode };
  });
  meta.push({ i, ...s });
  if (i % Math.max(1, Math.round(fps)) === 0) log(`frame ${i}/${n}`, JSON.stringify(s));
}
fs.writeFileSync(path.join(out, "frames.json"), JSON.stringify({ maneuver, fps, cams, size: [W, H], frames: meta }, null, 1));
const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
if (errs.length) log("page errors:\n" + errs.slice(0, 6).join("\n"));
await browser.close();

// encode: one MP4 per camera, and a GIF
if (still == null) {
  const have = spawnSync(ffmpeg, ["-version"]).status === 0;
  if (!have) log("no ffmpeg (set FFMPEG=...): frames only in", out);
  else for (const c of cams) {
    const src = path.join(out, c, "f%04d.png"), mp4 = path.join(out, `${maneuver}_${c}.mp4`), gif = path.join(out, `${maneuver}_${c}.gif`);
    spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", mp4], { stdio: "inherit" });
    if (gifW > 0) spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", src, "-vf", `fps=${Math.min(fps, 20)},scale=${gifW}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, gif], { stdio: "inherit" });
    log("wrote", mp4, gifW > 0 ? gif : "");
  }
}
log("done:", out);

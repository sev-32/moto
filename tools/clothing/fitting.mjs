#!/usr/bin/env node
// The fitting room: her standing in her rest pose - the A-pose her garments were made on - beside
// the bike, dressed, the cloth settled under gravity with the clothing engine's quality settings,
// seen from the front, three-quarter, side and back. For judging size and fit standing, before
// she rides. The ride's clock is stopped (the virtual clock: nothing moves unless drawn) and the
// cloth settles still - no wind, no surge - as on her standing in a room.
//
//   node tools/clothing/fitting.mjs [--out FILE.png] [--settle 60] [--tile 480x600]
//        [--garments shirt,jeans] [--set JSON]   (--set: wardrobe fields, e.g. '{"ridingCut":false}')
//        [--settings JSON]   (the engine's settings, merged: e.g. '{"quality":{"layer":{"passes":2}}}')
//        [--rigs front,front34,side,back,torso,legs]   (also: neck, sleeve, sleeveBack, hem close-ups)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { openBuild, ROOT } from "../../tests/browser/lib.mjs";
import { installStudio, grab, openRide } from "../studio.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const out = path.resolve(opt("out", path.join(ROOT, "tmp/fitting.png")));
const settle = Number(opt("settle", 60)), [TW, TH] = String(opt("tile", "480x600")).split("x").map(Number);
const garments = String(opt("garments", "shirt,jeans")).split(",");
const set = JSON.parse(opt("set", "{}")), settings = JSON.parse(opt("settings", "{}"));
const build = opt("build", path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html"));
const SIDE = 1.6; // (m to the bike's right)
const RIGS = {
  front: { yaw: 0, pitch: 4, dist: 2.7, at: [SIDE, 0, 0.88], fov: 40 },
  front34: { yaw: 40, pitch: 6, dist: 2.7, at: [SIDE, 0, 0.88], fov: 40 },
  side: { yaw: 90, pitch: 4, dist: 2.7, at: [SIDE, 0, 0.88], fov: 40 },
  back: { yaw: 180, pitch: 6, dist: 2.7, at: [SIDE, 0, 0.88], fov: 40 },
  torso: { yaw: 25, pitch: 6, dist: 1.25, at: [SIDE, 0, 1.2], fov: 40 },
  bust: { yaw: 30, pitch: 4, dist: 0.55, at: [SIDE, 0, 1.2], fov: 40 },
  waist: { yaw: 20, pitch: 2, dist: 0.7, at: [SIDE, 0, 0.95], fov: 40 },
  lap: { yaw: 15, pitch: 10, dist: 0.75, at: [SIDE, 0, 0.74], fov: 40 },
  kneeBack: { yaw: 160, pitch: 4, dist: 0.8, at: [SIDE, 0, 0.5], fov: 40 },
  ankles: { yaw: 25, pitch: 8, dist: 0.7, at: [SIDE, 0, 0.2], fov: 40 },
  // her shoes: her left from the outside, from the front, from above, and her right from the inside
  shoes: { yaw: 35, pitch: 12, dist: 0.62, at: [SIDE, 0, 0.07], fov: 40 },
  shoeL: { yaw: 75, pitch: 10, dist: 0.42, at: [SIDE - 0.08, 0, 0.06], fov: 40 },
  shoeFront: { yaw: 0, pitch: 18, dist: 0.5, at: [SIDE, 0, 0.06], fov: 40 },
  shoeTop: { yaw: 10, pitch: 62, dist: 0.45, at: [SIDE, 0, 0.04], fov: 40 },
  shoeR: { yaw: -100, pitch: 10, dist: 0.42, at: [SIDE + 0.08, 0, 0.06], fov: 40 },
  // her left bow, close: from above and the front, from her left, from the front
  bowTop: { yaw: 20, pitch: 55, dist: 0.2, at: [SIDE - 0.064, 0.058, 0.085], fov: 40 },
  bowSide: { yaw: 80, pitch: 15, dist: 0.2, at: [SIDE - 0.064, 0.058, 0.08], fov: 40 },
  bowFront: { yaw: 5, pitch: 20, dist: 0.2, at: [SIDE - 0.064, 0.058, 0.08], fov: 40 },
  face: { yaw: 25, pitch: 2, dist: 0.42, at: [SIDE, 0, 1.52], fov: 40 },
  faceSide: { yaw: 90, pitch: 2, dist: 0.42, at: [SIDE, 0, 1.52], fov: 40 },
  legs: { yaw: 30, pitch: 4, dist: 1.5, at: [SIDE, 0, 0.5], fov: 40 },
  // close-ups: the neckband, her right sleeve from the front and from behind, the hem at her side
  neck: { yaw: 10, pitch: 12, dist: 0.55, at: [SIDE, 0.02, 1.36], fov: 40 },
  sleeve: { yaw: 35, pitch: 4, dist: 0.7, at: [SIDE + 0.22, 0, 1.3], fov: 40 },
  sleeveBack: { yaw: 150, pitch: 8, dist: 0.7, at: [SIDE + 0.22, 0, 1.3], fov: 40 },
  hem: { yaw: 60, pitch: 2, dist: 0.9, at: [SIDE, 0, 0.98], fov: 40 },
};
const rigs = opt("rigs", "front,front34,side,back,torso,legs").split(",");
const tiles = out.replace(/\.png$/, "") + "_tiles";
fs.mkdirSync(tiles, { recursive: true });
const { browser, page, logs } = await openRide(openBuild, build, { W: TW * 2, H: TH * 2, clock: true });
await page.waitForTimeout(3000);
const info = await page.evaluate(({ SIDE, garments, set, settings }) => {
  const C = window.LUCID_CORE, RT = C.riderRender, ch = C.character, W = C.wardrobe;
  window.__VCLOCK__.start(); // (the ride's time stops here: the pose lab's pause does not hold - the ride page un-pauses)
  // her rest pose, upright, facing the bike's way, her hip at hip height to the bike's right - placed
  // from where the bike is at each frame (the cloth's frame rides with the bike: she stays still in it)
  const J = ch.joints.rest, b = J[0]?.length === 3 ? Array.from(J[0]) : [J[0], J[1], J[2]]; // (her rest hip)
  const commands = Object.fromEntries(ch.dofs.map((d) => [d.id, 0]));
  const place = () => {
    const f0 = v5qrot(free.q, V5_Y), n = Math.hypot(f0[0], f0[1]) || 1, f = [f0[0] / n, f0[1] / n, 0], r = [f[1], -f[0], 0];
    const Rw = [r[0], 0, -f[0], r[1], 0, -f[1], r[2], 1, -f[2]];
    const hip = [free.p[0] + r[0] * SIDE, free.p[1] + r[1] * SIDE, b[1] + (C.shoes?.enabled ? C.shoes.soleStackM : 0)]; // (in her shoes: on their soles)
    return { R: Rw, t: [hip[0] - b[0], hip[1] - b[1], hip[2] - b[2]], hip };
  };
  RT.override = () => ({ commands, placement: place() });
  const hip = place().hip;
  Object.assign(W, set);
  const merge = (a, o) => { for (const [k, v] of Object.entries(o)) if (v && typeof v === "object" && !Array.isArray(v) && a[k]) merge(a[k], v); else a[k] = v; };
  merge(W.SETTINGS, settings);
  for (const k of ["shirt", "jeans"]) W.worn[k] = garments.includes(k);
  W.setMode("quality");
  return { hip, b, worn: W.worn };
}, { SIDE, garments, set, settings });
console.log("fitting:", JSON.stringify(info));
await installStudio(page, { W: TW * 2, H: TH * 2 });
await page.evaluate((R) => Object.assign(window.__STUDIO_CAM__.rigs, R), RIGS);
await page.evaluate(() => renderFree()); // (dressed on her pose: the garments made on her and settled)
const audit = await page.evaluate((n) => { const C = window.LUCID_CORE, W = C.wardrobe; W.settle(n, { still: true }); C.hair?.settle?.(120, { still: true }); C.shoes?.settle?.(480); return { ...W.audit(), hair: C.hair ? { enabled: C.hair.enabled, error: C.hair.error, steps: C.hair.stats.steps } : null, shoes: C.shoes ? { enabled: C.shoes.enabled, error: C.shoes.error, stats: C.shoes.stats } : null }; }, settle);
await page.waitForFunction(() => !window.LUCID_CORE.shoes?.enabled || window.LUCID_CORE.shoes.ready, null, { timeout: 20000 }).catch(() => console.log("shoes: textures not loaded"));
console.log("cloth:", JSON.stringify(audit));
const files = [];
for (const c of rigs) { const fp = path.join(tiles, `${c}.png`); fs.writeFileSync(fp, await grab(page, c)); files.push(fp); }
const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
if (errs.length) console.log(errs.slice(0, 6).join("\n"));
await browser.close();
const py = `
import sys, json
from PIL import Image, ImageDraw
s = json.loads(sys.argv[1]); TW, TH = s["tile"]; fs = s["files"]
cols = 3; rows = (len(fs) + cols - 1) // cols
im = Image.new("RGB", (TW * cols, TH * rows), (20, 24, 28)); d = ImageDraw.Draw(im)
for i, f in enumerate(fs):
    t = Image.open(f).convert("RGB").resize((TW, TH), Image.LANCZOS); im.paste(t, ((i % cols) * TW, (i // cols) * TH))
    name = f.split("/")[-1][:-4]; d.rectangle([(i % cols) * TW + 4, (i // cols) * TH + 4, (i % cols) * TW + 10 + 7 * len(name), (i // cols) * TH + 20], fill=(6, 16, 24)); d.text(((i % cols) * TW + 7, (i // cols) * TH + 6), name, fill=(190, 240, 255))
if s.get("title"):
    d.rectangle([4, TH * rows - 22, 10 + 7 * len(s["title"]), TH * rows - 4], fill=(6, 16, 24)); d.text((7, TH * rows - 20), s["title"], fill=(255, 220, 150))
im.save(s["out"])
`;
const r = spawnSync("python3", ["-c", py, JSON.stringify({ tile: [TW, TH], files, out, title: opt("title", "") })], { stdio: "inherit" });
console.log(r.status === 0 ? "wrote " + out : "tiles in " + tiles);

#!/usr/bin/env node
// A sheet of her riding postures, each the IK's pose for her targets (frozen: the ride paused,
// the pose lab's preview), from fixed studio cameras - optionally with a pose set applied (one
// exported from the in-game POSE LAB). For comparing postures, and pose sets, at a glance.
//
//   node tools/pose-board.mjs [--pose-set FILE.json] [--cams side,front34] [--out FILE.png]
//                              [--postures alert,seated,tuck,hangR,hangL,stand] [--tile 480x300]
//                              [--wardrobe off|bound|quality] [--settle N]
//
// Clothes (47_rider_wardrobe.js): "bound" - on their carriers (default); "quality" - the clothing
// engine's outfit settings, re-anchored on each posture and settled (its own 20 steps + N more at
// 120 Hz): ~1 s of compute a step, so a board takes minutes; "off" - her body as before.
//
// Postures (her intent: tuck -1 sat up .. +1 tucked, hang -1 left .. +1 right, stand 0..1):
//   alert = slowing, sat up (tuck -1)      seated = neutral      tuck = speed (tuck +1)
//   hangR / hangL = hung off right / left  stand = standing on the pegs
// Needs PIL (python3) to compose the sheet; tiles are kept in <out>_tiles/ either way.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { openBuild, ROOT } from "../tests/browser/lib.mjs";
import { installStudio, grab, openRide } from "./studio.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const POSTURES = {
  alert: { label: "slowing, alert (sat up)", hang: 0, tuck: -1, stand: 0, foreAft: 0 },
  seated: { label: "seated", hang: 0, tuck: 0, stand: 0, foreAft: 0 },
  tuck: { label: "tucked (speed)", hang: 0, tuck: 1, stand: 0, foreAft: 0 },
  hangR: { label: "hung off right", hang: 1, tuck: 0.3, stand: 0, foreAft: 0 },
  hangL: { label: "hung off left", hang: -1, tuck: 0.3, stand: 0, foreAft: 0 },
  stand: { label: "standing on the pegs", hang: 0, tuck: 0, stand: 1, foreAft: 0 },
};
const postures = String(opt("postures", "alert,seated,tuck,hangR,stand")).split(",").filter((p) => POSTURES[p]);
const cams = String(opt("cams", "side,front34")).split(",");
const [TW, TH] = String(opt("tile", "480x300")).split("x").map(Number);
const out = path.resolve(opt("out", path.join(ROOT, "tmp/pose-board.png")));
const setFile = opt("pose-set", null);
const wardrobe = String(opt("wardrobe", "bound")), settle = Number(opt("settle", 24));
const build = opt("build", path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html"));
const tiles = out.replace(/\.png$/, "") + "_tiles";
fs.mkdirSync(tiles, { recursive: true });

const W = TW * 2, H = TH * 2;
const { browser, page, logs } = await openRide(openBuild, build, { W, H });
await page.waitForTimeout(3000);
const info = await page.evaluate(({ setText, wardrobe }) => {
  const L = window.LUCID_CORE.poseLab;
  L.open(); L.close(); // (captures the build's defaults)
  const rep = setText ? L.apply(setText) : null;
  L.freeze(true);
  const W = window.LUCID_CORE.wardrobe;
  if (W) { if (wardrobe === "off") W.visible = false; else W.setMode(wardrobe); }
  return { rep, ready: L.ready, wardrobe: W ? { mode: W.mode, visible: W.visible } : null };
}, { setText: setFile ? fs.readFileSync(setFile, "utf8") : null, wardrobe });
console.log("pose lab:", JSON.stringify(info));
await installStudio(page, { W, H });
const sheet = [];
for (const p of postures) {
  const P = POSTURES[p];
  await page.evaluate((P) => {
    const C = window.LUCID_CORE, B = C.riderBio, R = B.rider;
    B.auto = false; B.setPosture({ hang: P.hang, tuck: P.tuck, stand: P.stand, foreAft: P.foreAft });
    Object.assign(R.plan.posture, { hang: P.hang, tuck: P.tuck, stand: P.stand, foreAft: P.foreAft });
    R.plan.reachLean = R.calibration?.reachLean ?? 0; // (each posture's reach settled from the same start)
    C.poseLab.refresh();
    C.wardrobe?.reanchor?.(); // (the clothes re-made on her for this posture at the next frame)
  }, P);
  if (wardrobe === "quality") {
    await page.evaluate(() => renderFree()); // (the posture drawn: the clothes re-anchored and settled)
    const st = await page.evaluate((n) => { const W = window.LUCID_CORE.wardrobe; W.settle(n); return W.audit(); }, settle);
    console.log("  cloth", p, JSON.stringify(st));
  }
  const row = [];
  for (const c of cams) {
    const f = path.join(tiles, `${p}_${c}.png`);
    fs.writeFileSync(f, await grab(page, c));
    row.push(f);
  }
  sheet.push({ label: P.label, files: row });
  console.log("posture", p, "done");
}
const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
if (errs.length) console.log(errs.slice(0, 6).join("\n"));
await browser.close();
// compose: rows = postures, columns = cameras, labelled
const py = `
import sys, json
from PIL import Image, ImageDraw
spec = json.loads(sys.argv[1]); TW, TH = spec["tile"]
rows = spec["rows"]; cols = max(len(r["files"]) for r in rows)
im = Image.new("RGB", (TW * cols, TH * len(rows)), (20, 24, 28))
d = ImageDraw.Draw(im)
for ri, r in enumerate(rows):
    for ci, f in enumerate(r["files"]):
        t = Image.open(f).convert("RGB").resize((TW, TH), Image.LANCZOS)
        im.paste(t, (ci * TW, ri * TH))
    d.rectangle([4, ri * TH + 4, 8 + 7 * len(r["label"]), ri * TH + 20], fill=(6, 16, 24))
    d.text((7, ri * TH + 6), r["label"], fill=(190, 240, 255))
if spec.get("title"):
    d.rectangle([TW * cols - 10 - 7 * len(spec["title"]), 4, TW * cols - 4, 20], fill=(6, 16, 24))
    d.text((TW * cols - 7 - 7 * len(spec["title"]), 6), spec["title"], fill=(255, 220, 150))
im.save(spec["out"])
`;
const r = spawnSync("python3", ["-c", py, JSON.stringify({ tile: [TW, TH], rows: sheet, out, title: setFile ? "pose set: " + path.basename(setFile) : "build defaults" })], { stdio: "inherit" });
console.log(r.status === 0 ? "wrote " + out : "tiles in " + tiles);

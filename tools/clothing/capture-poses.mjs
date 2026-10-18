#!/usr/bin/env node
// Her riding poses, as the game makes them, for the clothing harness: the IK pose the planner
// reaches for in each posture (the pose lab's frozen preview) and her body after riding live -
// Semantic51 commands and her placement (world rotation; the translation is not used).
//
//   node tools/clothing/capture-poses.mjs [--out tests/fixtures/rider_poses.json]
import fs from "node:fs";
import path from "node:path";
import { openBuild, ROOT } from "../../tests/browser/lib.mjs";
import { openRide } from "../studio.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const out = path.resolve(opt("out", path.join(ROOT, "tests/fixtures/rider_poses.json")));
const build = opt("build", path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html"));
const POSTURES = {
  alert: { hang: 0, tuck: -1, stand: 0, foreAft: 0 }, seated: { hang: 0, tuck: 0, stand: 0, foreAft: 0 },
  tuck: { hang: 0, tuck: 1, stand: 0, foreAft: 0 }, hangR: { hang: 1, tuck: 0.3, stand: 0, foreAft: 0 },
  hangL: { hang: -1, tuck: 0.3, stand: 0, foreAft: 0 }, stand: { hang: 0, tuck: 0, stand: 1, foreAft: 0 },
};
const { browser, page } = await openRide(openBuild, build, { W: 640, H: 400 });
await page.waitForTimeout(4000);
const live = await page.evaluate(() => {
  const R = window.LUCID_CORE.riderBio.rider, c = R.commands();
  return { commands: c.commands, placement: { R: Array.from(c.placement.R), t: Array.from(c.placement.t) } };
});
const frozen = await page.evaluate((POSTURES) => {
  const C = window.LUCID_CORE, L = C.poseLab, B = C.riderBio, R = B.rider, o = {};
  L.open(); L.close(); L.freeze(true);
  for (const [k, P] of Object.entries(POSTURES)) {
    B.auto = false; B.setPosture(P); Object.assign(R.plan.posture, P);
    R.plan.reachLean = R.calibration?.reachLean ?? 0;
    L.refresh();
    const c = C.riderRender.override();
    o[k] = { commands: c.commands, placement: { R: Array.from(c.placement.R), t: Array.from(c.placement.t) } };
  }
  return o;
}, POSTURES);
await browser.close();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ schema: "lucid-moto.rider-poses.v1", about: "Semantic51 commands + placement (R row-major, master frame to world) of her riding postures: the planner's IK pose per posture (frozen) and her body riding live", live, postures: frozen }, null, 1));
console.log("wrote", path.relative(ROOT, out), Object.keys(frozen).join(", "), "+ live");

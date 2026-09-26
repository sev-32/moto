// Real-time burnout in the live loop (front brake + throttle at a standstill) and screenshots.
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";
const out = process.argv[2] || path.join(ROOT, "tmp/burnout.png");
const cam = +(process.argv[3] || 1);
const { browser, page, logs } = await openBuild(path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html"), { width: 1280, height: 720 });
await page.waitForFunction(() => window.__LUCID_CORE_FX_READY__, null, { timeout: 120000 });
const btn = page.locator("button:visible", { hasText: "STANDING START" }).first();
if (await btn.count()) await btn.click();
await page.waitForTimeout(1500);
await page.evaluate((cam) => document.querySelectorAll("#v123RideCams button")[cam]?.click(), cam);
await page.keyboard.down("KeyS");
await page.waitForTimeout(400);
await page.keyboard.down("KeyW");
const t0 = Date.now();
let info;
while (Date.now() - t0 < 9000) {
  await page.waitForTimeout(1500);
  info = await page.evaluate(() => {
    const f = window.DUCATI_V5_API.free, C = window.LUCID_CORE, pt = window.DUCATI_ADVANCED_POWERTRAIN.states.free;
    return { t: +f.time.toFixed(2), v: +Math.hypot(f.v[0], f.v[1]).toFixed(2), omR: +f.omegaR.toFixed(1), slideKW: +(C.tires.rear.out.slidingPowerW / 1000).toFixed(1), rearC: +(window.LUCID_BRAKE_TIRE_FEEDBACK?.state?.tires?.rear?.localSurfaceC ?? 0).toFixed(0), fx: { ...C.fx.stats }, rpm: Math.round(pt.engine.rpm), gear: pt.command.gear, thr: pt.command.throttle, fb: pt.command.frontBrakeBar, clutch: pt.command.clutch };
  });
  console.log(JSON.stringify(info));
}
await page.screenshot({ path: out });
await page.keyboard.up("KeyW");
await page.keyboard.up("KeyS");
const errs = logs.filter((l) => /pageerror|LUCID fx|render hook/i.test(l));
if (errs.length) console.log(errs.slice(0, 6).join("\n"));
await browser.close();

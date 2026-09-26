// Screenshot the ride view after the build settles:  node tests/browser/screenshot.mjs out.png [wait ms] [js-to-eval]
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";
const out = process.argv[2] || path.join(ROOT, "tmp/shot.png");
const wait = +(process.argv[3] || 6000);
const js = process.argv[4] || "";
const { browser, page, logs } = await openBuild(path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html"), { width: 1280, height: 720 });
await page.waitForFunction(() => window.__LUCID_CORE_WORLD_READY__, null, { timeout: 120000 }).catch(() => {});
const click = process.env.CLICK ?? "START ROLLING RIDE";
if (click) {
  const btn = page.locator("button", { hasText: click }).first();
  if (await btn.count()) await btn.click().catch(() => {});
}
if (js) await page.evaluate(js);
await page.waitForTimeout(wait);
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({ world: window.LUCID_CORE?.world?.info?.(), hooks: (window.LUCID_CORE?.renderHooks || []).map((h) => [h.id, h.err || "ok"]), page: window.__LUCID_ACTIVE_PAGE__ }));
console.log(JSON.stringify(info));
const errs = logs.filter((l) => /pageerror|\[error\]|warn/i.test(l));
if (errs.length) console.log(errs.slice(0, 8).join("\n"));
await browser.close();

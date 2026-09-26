// Rasterize an SVG with the headless Chromium used by the browser tests.
import { openBuild } from "../../tests/browser/lib.mjs";
import path from "node:path";
const [inp, out] = process.argv.slice(2);
const { browser, page } = await openBuild(path.resolve(inp), { width: 1000, height: 1000 });
const el = await page.$("svg");
await el.screenshot({ path: out });
await browser.close();

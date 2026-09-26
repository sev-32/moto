// Crop + zoom a PNG with headless Chromium (no image libraries needed):
//   node tools/crop.mjs in.png x y w h scale out.png
import { openBuild } from "../tests/browser/lib.mjs";
import fs from "node:fs";
import path from "node:path";
const [inp, x, y, w, h, scale = "3", out] = process.argv.slice(2);
const S = +scale, html = path.join(path.dirname(path.resolve(out)), "_crop.html");
const b64 = fs.readFileSync(inp).toString("base64");
fs.writeFileSync(html, `<body style="margin:0;background:#000;overflow:hidden"><img id="i" src="data:image/png;base64,${b64}" style="position:absolute;left:${-x * S}px;top:${-y * S}px;image-rendering:pixelated" onload="this.style.width=this.naturalWidth*${S}+'px';document.title='ok'"></body>`);
const { browser, page } = await openBuild(html, { width: w * S, height: h * S });
await page.waitForFunction(() => document.title === "ok");
await page.screenshot({ path: out });
await browser.close();
fs.unlinkSync(html);

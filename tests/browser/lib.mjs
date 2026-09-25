// Headless Chromium helpers (Playwright is provided by the environment / devDependency).
import path from "node:path";
import fs from "node:fs";
const candidates = ["playwright", "/opt/node22/lib/node_modules/playwright/index.js"];
let pw = null;
for (const c of candidates) {
  try { pw = (await import(c)).default || (await import(c)); break; } catch (_) {}
}
if (!pw) throw Error("playwright not available");
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export async function openBuild(file, { width = 1280, height = 800, logs = [] } = {}) {
  const exe = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
  const browser = await pw.chromium.launch({
    executablePath: exe,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 400)));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || "").slice(0, 800)}`));
  await page.goto("file://" + path.resolve(file), { waitUntil: "load", timeout: 240000 });
  return { browser, page, logs };
}

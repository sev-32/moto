// Smoke test of the consolidated build in headless Chromium:
//   every core layer boots, the ride starts, render hooks stay healthy, the physics stays finite
//   in the live loop, and the page logs no errors.   node tests/browser/smoke.mjs [build.html]
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";
const file = process.argv[2] || path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html");
const { browser, page, logs } = await openBuild(file, { width: 1280, height: 720 });
const fails = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };
try {
  const FLAGS = ["__LUCID_V1300_READY__", "__LUCID_CORE_WORLD_READY__", "__LUCID_CORE_SKID_READY__", "__LUCID_CORE_FX_READY__", "__LUCID_CORE_EXHAUST_READY__", "__LUCID_CORE_NIMBUS_READY__", "__LUCID_CORE_AUDIO_ENV_READY__", "__LUCID_CORE_FEEL_HUD_READY__"];
  await page.waitForFunction((F) => F.every((k) => window[k]), FLAGS, { timeout: 180000 }).catch(() => {});
  const flags = await page.evaluate((F) => F.filter((k) => !window[k]), FLAGS);
  check(!flags.length, `boot flags ${flags.length ? "missing: " + flags.join(", ") : "all set"}`);
  const btn = page.locator("button:visible", { hasText: "START ROLLING RIDE" }).first();
  if (await btn.count()) await btn.click().catch(() => {});
  // the session start resets the bike (and its clock) a few frames later: sample the clock
  const samples = [];
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(2000); samples.push(await page.evaluate(() => window.DUCATI_V5_API.free.time)); }
  const advancing = samples.some((t, i) => i > 0 && t > samples[i - 1] + 1e-6);
  const r = await page.evaluate(() => {
    const C = window.LUCID_CORE, f = window.DUCATI_V5_API.free;
    const finite = [...f.p, ...f.v, ...f.q, ...f.w, f.omegaF, f.omegaR, f.forkTravel, f.rearAngle, f.steer].every(Number.isFinite);
    return {
      time: f.time, finite, speed: Math.hypot(f.v[0], f.v[1]), page: window.__LUCID_ACTIVE_PAGE__,
      hooks: (C.renderHooks || []).map((h) => [h.id, h.err || "ok"]),
      layers: ["realtime", "tires", "chassis", "rider", "world", "skid", "fx", "exhaust", "nimbus", "audioEnv", "feelHud", "maneuvers", "burnoutRig"].filter((k) => !C[k]),
      nimbusErr: C.nimbus?.error || null, skidErr: C.skid?.error || null, worldErr: C.world?.render?.err || null,
      maneuvers: C.maneuvers?.names?.().length || 0,
    };
  });
  check(r.page === "RIDE", `ride page active (${r.page})`);
  check(advancing, `live loop advances simulation time (${samples.map((t) => t.toFixed(2)).join(", ")} s)`);
  check(r.finite, "vehicle state finite");
  check(!r.layers.length, `core APIs ${r.layers.length ? "missing: " + r.layers.join(", ") : "present"}`);
  const bad = r.hooks.filter(([, e]) => e !== "ok");
  check(!bad.length && r.hooks.length >= 8, `render hooks healthy (${r.hooks.map(([id]) => id).join(", ")})${bad.length ? " failing: " + JSON.stringify(bad) : ""}`);
  check(!r.nimbusErr && !r.skidErr && !r.worldErr, "NIMBUS / skid / world renderers without errors");
  check(r.maneuvers >= 14, `maneuver library (${r.maneuvers})`);
  const errs = logs.filter((l) => /\[pageerror\]|\[error\]/i.test(l));
  check(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""}`);
} catch (e) {
  check(false, "smoke run threw: " + (e?.message || e));
} finally {
  await browser.close();
}
console.log(fails.length ? `\n${fails.length} smoke check(s) failed` : "\nsmoke OK");
process.exit(fails.length ? 1 : 0);

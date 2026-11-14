// Regression: transitioning directly from the stationary burnout rig to a scripted
// maneuver must not retain the rig's temporary fore-aft/tuck override.
// Run after npm run build: node tests/browser/posture-transition.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { openBuild, ROOT } from './lib.mjs';

const html = path.join(ROOT, 'dist/LucidMoto_V2.0.0_dev.html');
const { browser, page, logs } = await openBuild(html, { width: 800, height: 560 });
try {
  await page.waitForFunction(
    () => window.__LUCID_V1300_READY__ && window.LUCID_CORE?.maneuvers && window.LUCID_CORE?.riderBio?.active,
    null, { timeout: 120000 }
  );
  const result = await page.evaluate(() => {
    const C = window.LUCID_CORE, F = window.DUCATI_V5_API.free;
    C.realtime.timeScale = 0;
    C.burnoutRig.stop();
    C.riderBio.setPosture({ foreAft: null, tuck: null });
    const baseline = C.maneuvers.simulate('lean35').metrics;
    F.reset(0, 0);
    const start = C.burnoutRig.start();
    const during = { active: C.burnoutRig.active, manual: { ...C.riderBio.manual } };
    const next = C.maneuvers.simulate('lean35').metrics;
    return { baseline, start, during, next,
      after: { active: C.burnoutRig.active, manual: { ...C.riderBio.manual } } };
  });
  assert.equal(result.start.ok, true);
  assert.equal(result.during.active, true);
  assert.equal(result.during.manual.foreAft, 1);
  assert.equal(result.during.manual.tuck, 0.6);
  assert.equal(result.after.active, false);
  assert.equal(result.after.manual.foreAft, undefined);
  assert.equal(result.after.manual.tuck, undefined);
  assert.equal(result.next.finite, true);
  assert.equal(result.next.crashT, null);
  for (const key of ['maxAbsRollDeg', 'steadyYawRateDeg', 'distanceM', 'maxDecelG', 'maxAccelG']) {
    assert.ok(Math.abs(result.baseline[key] - result.next[key]) < 0.001,
      `${key}: clean ${result.baseline[key]}, after burnout ${result.next[key]}`);
  }
  assert.equal(logs.filter(x => x.startsWith('[pageerror]')).length, 0);
  console.log('PASS: burnout-to-lean posture cleared and maneuver matches baseline', JSON.stringify({
    roll: result.next.maxAbsRollDeg, yawRate: result.next.steadyYawRateDeg,
    distance: result.next.distanceM,
  }));
} finally {
  await browser.close();
}

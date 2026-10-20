// Browser regression for high-grip panic-brake events. This test classifies *why* the
// maneuver runner stops; it does not claim calibration of real-world crash mechanics.
import assert from 'node:assert/strict';
import path from 'node:path';
import { openBuild, ROOT } from './lib.mjs';

const { browser, page, logs } = await openBuild(
  path.join(ROOT, 'dist/LucidMoto_V2.0.0_dev.html'), { width: 800, height: 560 }
);
try {
  await page.waitForFunction(() => window.LUCID_CORE?.maneuvers && window.__LUCID_V1300_READY__,
    null, { timeout: 120000 });
  const events = await page.evaluate(() => {
    const C = window.LUCID_CORE;
    C.burnoutRig.stop();
    C.riderBio?.setPosture({ foreAft: null, tuck: null });
    const grab = C.maneuvers.simulate('brakeGrab').metrics;
    const firm = C.maneuvers.simulate('brakeFirm').metrics;
    return { grab, firm };
  });
  const { grab, firm } = events;
  assert.equal(grab.finite, true);
  assert.ok(grab.frontLockT > 0.3, 'panic brake should exhibit front lock');
  assert.ok(grab.rearLiftT > grab.frontLockT, 'rear lift must follow the initial lock');
  assert.equal(grab.terminationReason, 'near_vertical_pitch_attitude',
    'the uncalibrated reference scenario ends in a nose-over, not a verified low-side');
  assert.ok(Math.abs(grab.terminationPitchDeg) > 75);
  assert.equal(grab.firstBodyContactT, null,
    'the crashT scalar is NOT a proxy-ground impact timestamp in this regression');
  assert.equal(firm.crashT, null);
  assert.equal(firm.terminationReason, null);
  assert.equal(firm.frontLockT, null);
  assert.equal(firm.rearLiftT, null);
  assert.ok(Math.abs(firm.maxDecelG - 0.808) < 0.02, 'firm brake numeric baseline preserved');
  assert.equal(logs.filter(s => s.startsWith('[pageerror]')).length, 0);
  console.log('PASS incident semantics', JSON.stringify({ grab, firm }));
} finally {
  await browser.close();
}

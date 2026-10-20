// Controlled incident probe. Guarded off by default; the ordinary brakeGrab mode must
// keep the original 0.807 s attitude stop, while a <=3 s diagnostic extension can
// distinguish first physical proxy contact from a change in body-forward velocity sign.
import assert from 'node:assert/strict';
import path from 'node:path';
import { openBuild, ROOT } from './lib.mjs';

const { browser, page, logs } = await openBuild(path.join(ROOT, 'dist/LucidMoto_V2.0.0_dev.html'),
  { width: 800, height: 560 });
try {
  await page.waitForFunction(() => window.LUCID_CORE?.maneuvers && window.__LUCID_V1300_READY__,
    null, { timeout: 120000 });
  const records = await page.evaluate(() => {
    const C = window.LUCID_CORE;
    C.burnoutRig.stop();
    C.riderBio?.setPosture({ foreAft: null, tuck: null });
    const stock = C.maneuvers.simulate('brakeGrab').metrics;
    const extended = C.maneuvers.simulate('brakeGrab', { T: 2.5, probeContinuePastAttitude: true });
    let rejectedExcessiveDuration = false;
    try { C.maneuvers.simulate('brakeGrab', { T: 4, probeContinuePastAttitude: true }); }
    catch (e) { rejectedExcessiveDuration = /limited to 3/.test(String(e.message)); }
    return { stock, extended: extended.metrics, trace: extended.trace, rejectedExcessiveDuration };
  });
  const { stock, extended: m, trace } = records;
  assert.equal(records.rejectedExcessiveDuration, true);
  assert.equal(stock.terminationReason, 'near_vertical_pitch_attitude');
  assert.equal(stock.groundStopT, null);
  assert.equal(stock.firstBodyContactT, null);
  assert.equal(stock.crashT, 0.807);
  assert.equal(m.finite, true);
  assert.equal(m.terminationReason, 'body_contact');
  assert.equal(m.firstBodyContactName, 'fairing_left');
  assert.ok(m.firstBodyContactT > 1.9 && m.firstBodyContactT < 2.2);
  assert.equal(m.groundStopT, null, 'never stops within the 2.5 s probe');
  assert.ok(m.headingVelocityReversalT > 0.8 && m.headingVelocityReversalT < 0.9);
  const flipped = trace.find(t => t.t > 0.9 && t.v < -10 && t.groundV > 10);
  assert.ok(flipped, 'body-forward speed sign flips without world-ground stop');
  assert.equal(logs.filter(s => s.startsWith('[pageerror]')).length, 0);
  console.log('PASS overturn collision provenance', JSON.stringify({ stock, extended: m, flipped }));
} finally { await browser.close(); }

// R4: Do not confuse body Euler stop with ground stop or generalized torque
// with an independent external rigid-body torque. This probe is opt-in.
import assert from 'node:assert/strict';
import path from 'node:path';
import { openBuild, ROOT } from './lib.mjs';

const { browser, page, logs } = await openBuild(path.join(ROOT, 'dist/LucidMoto_V2.0.0_dev.html'), { width: 800, height: 560 });
try {
  await page.waitForFunction(() => window.LUCID_CORE?.maneuvers && window.__LUCID_V1300_READY__, null, { timeout: 120000 });
  const result = await page.evaluate(() => {
    const C = window.LUCID_CORE, F = window.DUCATI_V5_API.free, P = window.DUCATI_ADVANCED_POWERTRAIN;
    const snapshot = () => ({ position: F.p.slice(), velocity: F.v.slice(),
      time: F.time, gear: P.states.free.command.gear, burnout: C.burnoutRig.active });
    const before = snapshot();
    let error = '';
    try { C.maneuvers.simulate('brakeGrab', { T: 4, probeContinuePastAttitude: true }); }
    catch (e) { error = String(e.message); }
    const after = snapshot();
    C.burnoutRig.stop();
    C.riderBio?.setPosture({ foreAft: null, tuck: null });
    const defaultGrab = C.maneuvers.simulate('brakeGrab', { probeDynamics: true }).metrics;
    const extended = C.maneuvers.simulate('brakeGrab', {
      T: 2.5, probeContinuePastAttitude: true, probeDynamics: true, traceHz: 20,
    });
    const firm = C.maneuvers.simulate('brakeFirm', { probeDynamics: true }).metrics;
    return { before, after, error, defaultGrab, extended, firm };
  });
  assert.match(result.error, /limited to 3/);
  assert.deepEqual(result.before, result.after, 'invalid probe must be rejected before any state mutation');
  assert.equal(result.defaultGrab.terminationReason, 'near_vertical_pitch_attitude');
  assert.ok(result.defaultGrab.dynamics?.samples > 400);
  assert.ok(result.defaultGrab.dynamics.firstLock.t < result.defaultGrab.dynamics.firstRearLift.t);
  assert.equal(result.defaultGrab.dynamics.firstProxyImpact, null);
  assert.equal(result.extended.metrics.firstBodyContactName, 'fairing_left');
  assert.ok(result.extended.metrics.firstBodyContactT > 1.9 && result.extended.metrics.firstBodyContactT < 2.2);
  assert.equal(result.extended.metrics.groundStopT, null);
  assert.ok(result.extended.metrics.dynamics.firstProxyImpact?.t > 2);
  assert.equal(result.firm.stopT, result.firm.groundStopT);
  assert.equal(result.firm.dynamics.firstLock, null);
  assert.equal(logs.filter(s => s.startsWith('[pageerror]')).length, 0);
  console.log('PASS R4 pitch and incident audit', JSON.stringify({
    firstLock: result.defaultGrab.dynamics.firstLock.t,
    firstFairingImpact: result.extended.metrics.firstBodyContactT,
    firmStop: result.firm.groundStopT,
  }));
} finally { await browser.close(); }

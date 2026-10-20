// R5 numerical diagnostics: solver equation and constraint impulse accounting.
// Run after npm run build; requires Node Playwright and Chromium/ANGLE WebGL2.
// This is an algebraic consistency gate, NOT a tire/chassis realism benchmark.
import assert from 'node:assert/strict';
import path from 'node:path';
import { openBuild, ROOT } from './lib.mjs';

const { browser, page, logs } = await openBuild(
  path.join(ROOT, 'dist/LucidMoto_V2.0.0_dev.html'), { width: 800, height: 560 }
);
try {
  await page.waitForFunction(
    () => !!window.LUCID_CORE?.maneuvers && !!window.__LUCID_V1300_READY__,
    null, { timeout: 120000 }
  );
  const result = await page.evaluate(() => {
    const C = window.LUCID_CORE;
    C.burnoutRig.stop();
    C.riderBio?.setPosture({ foreAft: null, tuck: null });
    const g = C.maneuvers.simulate('brakeGrab', { probeBalance: true, traceHz: 20 }).metrics;
    const f = C.maneuvers.simulate('brakeFirm', { probeBalance: true, traceHz: 20 }).metrics;
    const e = C.maneuvers.simulate('brakeGrab', {
      T: 2.5, probeContinuePastAttitude: true, probeBalance: true, traceHz: 20,
    }).metrics;
    const turn = C.maneuvers.simulate('lean35').metrics;
    return { g, f, e, turn, retained: !!window.DUCATI_V5_API.free.coupled?.balanceProbe };
  });
  for (const { balance } of [result.g, result.f, result.e]) {
    assert.ok(balance.samples > 200, 'observed coupled solve at runtime');
    assert.ok(Number.isFinite(balance.peakRelativeResidual));
    assert.ok(balance.peakRelativeResidual < 1e-9,
      'all nine mass-matrix equations must close numerically');
    assert.ok(balance.maxImpulseRelativeResidual < 1e-9,
      'generalized joint-limit impulse changes must satisfy M Δu = J^T λ');
    assert.ok(balance.peakAbsPitchCrossCouplingNm > 1,
      'pitch diagonal cannot be mistaken for full generalized dynamics');
  }
  assert.equal(result.g.terminationReason, 'near_vertical_pitch_attitude');
  assert.equal(result.g.balance.jointImpulseFrames, 0);
  assert.equal(result.f.stopT, 4.05);
  assert.equal(result.f.balance.jointImpulseFrames, 0);
  assert.equal(result.e.firstBodyContactName, 'fairing_left');
  assert.ok(Math.abs(result.e.firstBodyContactT - 2.007) < .025);
  assert.ok(result.e.balance.jointImpulseFrames > 0);
  assert.equal(result.e.groundStopT, null);
  assert.ok(Math.abs(result.turn.maxAbsRollDeg - 34.716) < .01);
  assert.equal(result.turn.balance, null, 'non-probe mode has no added diagnostics');
  assert.equal(result.retained, false, 'probe not persisted in normal coupled state');
  assert.equal(logs.filter(x => x.startsWith('[pageerror]')).length, 0);
  console.log('PASS R5 nine-DOF and joint-impulse algebraic consistency');
} finally {
  await browser.close();
}

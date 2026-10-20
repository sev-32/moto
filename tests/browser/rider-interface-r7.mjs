// R7 rider↔bike interface work regression. Execute after npm run build.
// Node Playwright entrypoint; equivalent numerical scenarios were actually
// executed in native Chromium via CDP and saved under evidence/R7.
import assert from 'node:assert/strict';
import path from 'node:path';
import { openBuild, ROOT } from './lib.mjs';
const { browser, page, logs } = await openBuild(
  path.join(ROOT,'dist/LucidMoto_V2.0.0_dev.html'), {width:800,height:560}
);
try {
  await page.waitForFunction(() => !!window.LUCID_CORE?.maneuvers && !!window.__LUCID_V1300_READY__, null, {timeout:120000});
  const runs=await page.evaluate(() => {
    const C=window.LUCID_CORE, F=window.DUCATI_V5_API.free;
    C.burnoutRig.stop(); C.riderBio?.setPosture({foreAft:null,tuck:null});
    const opts={probeWork:true,probeInterface:true,traceHz:20};
    const brakeFirm=C.maneuvers.simulate('brakeFirm',opts).metrics;
    const lean35=C.maneuvers.simulate('lean35',opts).metrics;
    const brakeGrab=C.maneuvers.simulate('brakeGrab',opts).metrics;
    const normal=C.maneuvers.simulate('lean35',{traceHz:20}).metrics;
    return {brakeFirm,lean35,brakeGrab,normal,
      probeFlag:!!F.__motoInterfaceProbe, retained:!!C.riderBio?.interfaceProbe};
  });
  for(const m of [runs.brakeFirm,runs.lean35,runs.brakeGrab]) {
    const I=m.interface, W=m.work;
    assert.ok(I?.samples>400);
    assert.ok(I.missingSamples<=1);
    assert.equal(Object.keys(I.sourcePairs).length,6);
    assert.ok(I.peakAbsBikeLedgerPowerMismatchW<1e-6);
    assert.ok(Math.abs(I.bikeLedgerMismatchJ)<1e-7);
    const pairs=Object.values(I.sourcePairs);
    assert.ok(Math.abs(I.bikeWorkJ-pairs.reduce((s,v)=>s+v.bikeWorkJ,0))<1e-7);
    assert.ok(Math.abs(I.riderContactWorkJ-pairs.reduce((s,v)=>s+v.riderWorkJ,0))<1e-7);
    assert.ok(Math.abs(I.pairSlipWorkJ-I.bikeWorkJ-I.riderContactWorkJ)<1e-7);
    assert.ok(Math.abs(I.riderKineticDeltaJ+I.riderPotentialDeltaJ-I.riderEnergyDeltaJ)<1e-7);
    assert.ok(Math.abs(I.riderEnergyDeltaJ-I.riderContactWorkJ-I.jointWorkJ-I.groundWorkJ-I.residualJ)<1e-7);
    assert.ok(I.riderMassKg>75&&I.riderMassKg<76);
    assert.ok(W.maxForceClosure<1e-8);
  }
  assert.ok(Math.abs(runs.brakeFirm.groundStopT-4.05)<0.01);
  assert.ok(Math.abs(runs.lean35.maxAbsRollDeg-34.716)<.03);
  assert.equal(runs.brakeGrab.terminationReason,'near_vertical_pitch_attitude');
  assert.ok(Math.abs(runs.brakeFirm.interface.bikeWorkJ-23581.34)<2);
  assert.ok(Math.abs(runs.brakeFirm.interface.riderKineticDeltaJ+23565.07)<2);
  assert.equal(runs.normal.interface,null);
  assert.equal(runs.probeFlag,false);
  assert.equal(runs.retained,false);
  assert.equal(logs.filter(x=>x.startsWith('[pageerror]')).length,0);
  console.log('PASS R7 two-sided contact and kinetic energy exchange');
} finally {await browser.close();}

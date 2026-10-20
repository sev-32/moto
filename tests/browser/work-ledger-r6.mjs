// R6 browser regression. Requires Node Playwright/Chromium; see evidence/R6 for
// the actual CDP-executed equivalent from 2026-10-20.
import assert from 'node:assert/strict';
import path from 'node:path';
import { openBuild, ROOT } from './lib.mjs';
const { browser, page, logs } = await openBuild(path.join(ROOT,'dist/LucidMoto_V2.0.0_dev.html'),{width:800,height:560});
try {
  await page.waitForFunction(()=>!!window.LUCID_CORE?.maneuvers && !!window.__LUCID_V1300_READY__,null,{timeout:120000});
  const out=await page.evaluate(()=>{
    const C=window.LUCID_CORE, F=window.DUCATI_V5_API.free;
    C.burnoutRig.stop();C.riderBio?.setPosture({foreAft:null,tuck:null});
    const grab=C.maneuvers.simulate('brakeGrab',{probeWork:true,traceHz:20}).metrics;
    const firm=C.maneuvers.simulate('brakeFirm',{probeWork:true,traceHz:20}).metrics;
    const corner=C.maneuvers.simulate('lean35',{probeWork:true,traceHz:20}).metrics;
    const endo=C.maneuvers.simulate('brakeGrab',{probeWork:true,probeContinuePastAttitude:true,T:2.5,traceHz:20}).metrics;
    const noProbe=C.maneuvers.simulate('lean35').metrics;
    return {grab,firm,corner,endo,noProbe,retained:!!F.coupled?.workProbe,flag:!!F.__motoWorkProbe};
  });
  for(const m of [out.grab,out.firm,out.corner,out.endo]) {
    assert.ok(m.work.samples>400);
    assert.equal(Object.keys(m.work.categories).length,23);
    assert.ok(m.work.maxForceClosure<1e-9);
    assert.ok(m.work.maxPowerClosureW<1e-7);
    assert.ok(m.work.maxPitchClosureNm<1e-9);
    const cats=m.work.categories;
    assert.ok('wrench_6_riderWrench' in cats && 'wrench_7_riderWrench' in cats);
    const sum=Object.values(cats).reduce((a,c)=>a+c.signedWorkJ,0);
    assert.ok(Math.abs(sum-m.work.totalGeneralizedWorkJ)<1e-7);
  }
  assert.equal(out.grab.terminationReason,'near_vertical_pitch_attitude');
  assert.ok(Math.abs(out.firm.groundStopT-4.05)<0.01);
  assert.ok(Math.abs(out.corner.maxAbsRollDeg-34.716)<0.01);
  assert.ok(Math.abs(out.endo.firstBodyContactT-2.007)<0.025);
  assert.equal(out.endo.firstBodyContactName,'fairing_left');
  assert.equal(out.noProbe.work,null);
  assert.ok(Math.abs(out.noProbe.maxAbsRollDeg-34.716)<0.01);
  assert.equal(out.retained,false);
  assert.equal(out.flag,false);
  assert.equal(logs.filter(x=>x.startsWith('[pageerror]')).length,0);
  console.log('PASS R6 work ledger source closure, provenance and nonprobe parity');
} finally {await browser.close();}

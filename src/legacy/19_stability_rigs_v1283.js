

(function(global){
'use strict';
if(global.__LUCID_V1283_STABILITY_RIGS__)return;
global.__LUCID_V1283_STABILITY_RIGS__=true;

const D=global.document,q=id=>D?.getElementById(id);
const deep=o=>o==null?o:JSON.parse(JSON.stringify(o));
const finite=x=>Number.isFinite(+x);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=(x,d=2)=>finite(x)?(+x).toFixed(d):'—';
const rt={
 version:'V1.28.3',
 installed:false,
 running:false,
 results:{SUSPENSION:null,BRAKES:null,TIRES:null,THERMAL:null,SOUND:null},
 lastSuite:null
};

function core(){
 return{
  A:global.DUCATI_V5_API,
  PT:global.DUCATI_ADVANCED_POWERTRAIN,
  V:global.VEHICLE_LAB_API,
  O:global.LUCID_COMPONENT_ORCHESTRATOR,
  B:global.LUCID_BRAKE_TIRE_FEEDBACK,
  M:global.LUCID_THERMAL_MATERIALS,
  T:global.LUCID_THERMOFLUID,
  S:global.DUCATI_SOUND_STUDIO,
  U:global.LUCID_USABILITY,
  R:global.LUCID_RECOVERY
 };
}
function check(id,pass,detail){return{id,pass:!!pass,detail:String(detail??'')}}
function makeResult(id,checks,metrics={},note=''){
 return{
  schema:'lucid.v1283.subsystem-proof.v1',
  id,time:new Date().toISOString(),
  pass:checks.length>0&&checks.every(x=>x.pass),
  checks,metrics,note
 };
}
function setTitle(a,b){
 const t=q('v123PageTitle');if(!t)return;
 const s=t.querySelector('strong'),m=t.querySelector('span');
 if(s)s.textContent=a;if(m)m.textContent=b;
}
function setNav(page){
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page===page));
}
function enterStability(){
 // Let the modular shell cleanly leave Free Ride before taking over the lab dock.
 q('v123Nav')?.querySelector('button[data-v123-page="ENGINE"]')?.click();
 D.body.dataset.v123Page='STABILITY';
 global.__LUCID_ACTIVE_PAGE__='STABILITY';
 global.__LUCID_PERF_MODE__='LAB';
 setNav('STABILITY');
 setTitle('STABILITY PROOF RIGS','suspension · brakes · tires · thermal · sound · explicit PASS / FAIL');
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page==='STABILITY'));
 renderAll();
}
function resultClass(r){return!r?'idle':r.pass?'ok':'bad'}
function resultLabel(r){return!r?'NOT RUN':r.pass?'PASS':'FAIL'}
function renderChecks(r){
 if(!r)return'<div class="v1283Empty">No proof run yet.</div>';
 return r.checks.map(c=>`<div class="v1283Check ${c.pass?'ok':'bad'}"><b>${c.pass?'PASS':'FAIL'} · ${c.id}</b><span>${c.detail}</span></div>`).join('');
}
function renderMetrics(r){
 if(!r||!r.metrics)return'';
 return Object.entries(r.metrics).map(([k,v])=>`<span>${k}</span><b>${typeof v==='number'?fmt(v,3):String(v)}</b>`).join('');
}
function renderOne(id){
 const r=rt.results[id],card=q('v1283Card'+id),badge=q('v1283Badge'+id),body=q('v1283Checks'+id),met=q('v1283Metrics'+id);
 if(card)card.classList.remove('ok','bad'),card?.classList.add(resultClass(r));
 if(badge){badge.textContent=resultLabel(r);badge.className='v1283Badge '+resultClass(r)}
 if(body)body.innerHTML=renderChecks(r);
 if(met)met.innerHTML=renderMetrics(r);
 // Inline page badge/button status.
 const ib=q('v1283Inline'+id);
 if(ib){ib.textContent=resultLabel(r);ib.className='v1283InlineBadge '+resultClass(r)}
}
function renderAll(){
 Object.keys(rt.results).forEach(renderOne);
 const vals=Object.values(rt.results),ran=vals.filter(Boolean),pass=ran.filter(x=>x.pass).length;
 const s=q('v1283SuiteSummary');
 if(s)s.textContent=ran.length?`${pass}/${ran.length} completed subsystem proofs passing${ran.length===5?' · suite '+(pass===5?'PASS':'FAIL'):''}`:'No subsystem proof has been run.';
 const b=q('v1283SuiteBadge');
 if(b){const done=ran.length===5,ok=done&&pass===5;b.textContent=!done?'NOT COMPLETE':ok?'SUITE PASS':'SUITE FAIL';b.className='v1283Badge '+(!done?'idle':ok?'ok':'bad')}
}

function saveDomain(){
 const C=core();return{domain:C.A?.domain?.()||'FREE_ROAD',active:global.__LUCID_ACTIVE_PAGE__};
}
function restoreDomain(s){
 try{core().A?.setDomain?.(s.domain)}catch(_){}
 global.__LUCID_ACTIVE_PAGE__='STABILITY';
}

function runSuspension(){
 const C=core(),O=C.O,A=C.A;
 if(!O?.suspension||!A?.free?.S)return makeResult('SUSPENSION',[check('dependencies',false,'V1.25 suspension/V5 API missing')]);
 const old=saveDomain(),S=A.free.S;
 let dive,squat;
 try{
  dive=O.suspension.runBrakeDive?.();
  squat=O.suspension.runAccelSquat?.();
 }catch(e){
  restoreDomain(old);
  return makeResult('SUSPENSION',[check('execution',false,e.message)]);
 }
 restoreDomain(old);
 const d=dive?.summary||{},s=squat?.summary||{};
 const travelFmm=(+S.travelF||.127)*1000,travelRmm=(+S.travelR||.130)*1000;
 const dSpan=(+d.maxFrontTravelMm||0)-(+d.minFrontTravelMm||0);
 const sSpan=(+s.maxRearTravelMm||0)-(+s.minRearTravelMm||0);
 const checks=[
  check('brake-dive-rig',Array.isArray(dive?.rows)&&dive.rows.length>20,`${dive?.rows?.length||0} samples`),
  check('accel-squat-rig',Array.isArray(squat?.rows)&&squat.rows.length>20,`${squat?.rows?.length||0} samples`),
  check('front-motion',finite(d.maxFrontTravelMm)&&dSpan>.5&&d.maxFrontTravelMm<travelFmm*1.18,`span ${fmt(dSpan,2)} mm · max ${fmt(d.maxFrontTravelMm,2)} / ${fmt(travelFmm,1)} mm travel`),
  check('rear-motion',finite(s.maxRearTravelMm)&&sSpan>.25&&s.maxRearTravelMm<travelRmm*1.18,`span ${fmt(sSpan,2)} mm · max ${fmt(s.maxRearTravelMm,2)} / ${fmt(travelRmm,1)} mm travel`),
  check('damper-velocity',finite(d.peakFrontDamperSpeedMps)&&finite(s.peakRearDamperSpeedMps)&&d.peakFrontDamperSpeedMps>0.005&&s.peakRearDamperSpeedMps>0.002,`front ${fmt(d.peakFrontDamperSpeedMps,3)} m/s · rear ${fmt(s.peakRearDamperSpeedMps,3)} m/s`),
  check('loads-finite',finite(d.peakFrontLoadN)&&finite(s.peakRearLoadN)&&d.peakFrontLoadN>500&&s.peakRearLoadN>500,`front ${fmt(d.peakFrontLoadN,0)} N · rear ${fmt(s.peakRearLoadN,0)} N`)
 ];
 return makeResult('SUSPENSION',checks,{
  diveFrontMaxMm:+d.maxFrontTravelMm||0,
  diveFrontDamperMps:+d.peakFrontDamperSpeedMps||0,
  squatRearMaxMm:+s.maxRearTravelMm||0,
  squatRearDamperMps:+s.peakRearDamperSpeedMps||0
 },'Runs the actual V5 suspension test path; the test resets the free-road state to a safe condition.');
}

function runBrakes(){
 const C=core(),B=C.B;
 if(!B?.runBrakeRig)return makeResult('BRAKES',[check('dependencies',false,'V1.26 brake feedback API missing')]);
 let rig;
 try{rig=B.runBrakeRig()}catch(e){return makeResult('BRAKES',[check('execution',false,e.message)])}
 const z=rig?.summary||{},cold=B.brakeMu?.(80,70,18),hot=B.brakeMu?.(650,70,18);
 const prev=B.calibration?.brakes?.enabled;
 let bypassOk=false,restoreOk=false;
 try{
  B.setBrakeFeedback(false);bypassOk=B.calibration.brakes.enabled===false;
  B.setBrakeFeedback(prev);restoreOk=B.calibration.brakes.enabled===!!prev;
 }catch(_){}
 const checks=[
  check('repeated-stop-rig',Array.isArray(rig?.rows)&&rig.rows.length>100,`${rig?.rows?.length||0} samples`),
  check('rotor-heats',finite(z.peakTempC)&&z.peakTempC>250&&z.peakTempC<900,`peak ${fmt(z.peakTempC,1)} °C`),
  check('fade-direction',finite(cold)&&finite(hot)&&hot<cold*.82,`μ80 ${fmt(cold,3)} → μ650 ${fmt(hot,3)}`),
  check('wear-energy',finite(z.padWearMm)&&finite(z.rotorWearMicron)&&z.padWearMm>0&&z.rotorWearMicron>0,`pad ${fmt(z.padWearMm,6)} mm · rotor ${fmt(z.rotorWearMicron,6)} µm`),
  check('feedback-bypass',bypassOk&&restoreOk,`bypass ${bypassOk?'OK':'FAIL'} · restore ${restoreOk?'OK':'FAIL'}`)
 ];
 return makeResult('BRAKES',checks,{
  peakRotorC:+z.peakTempC||0,finalMu:+z.finalMu||0,coldMu:+cold||0,hotMu:+hot||0
 },'Brake proof uses the deterministic V1.26 repeated-stop model plus the live feedback enable/bypass control.');
}

function runTires(){
 const C=core(),B=C.B,A=C.A;
 if(!B?.runTireRig)return makeResult('TIRES',[check('dependencies',false,'V1.26 tire feedback API missing')]);
 let rig;
 try{rig=B.runTireRig()}catch(e){return makeResult('TIRES',[check('execution',false,e.message)])}
 const z=rig?.summary||{},cal=B.calibration?.tires||{};
 const hotGrip=B.tireGrip?.(125,.50),workingGrip=B.tireGrip?.(75,0);
 const prev=!!cal.enabled;
 let bypassBase=false,restored=false;
 try{
  B.setTireFeedback(false);
  const fmu=A?.free?.front?.p?.mu,rmu=A?.free?.rear?.p?.mu;
  bypassBase=finite(fmu)&&finite(rmu)&&Math.abs(fmu-(B.baseline?.frontMu??fmu))<1e-9&&Math.abs(rmu-(B.baseline?.rearMu??rmu))<1e-9;
  B.setTireFeedback(prev);B.development?.applyNow?.();restored=B.calibration.tires.enabled===prev;
 }catch(_){}
 const checks=[
  check('thermal-rig',Array.isArray(rig?.rows)&&rig.rows.length>200,`${rig?.rows?.length||0} samples`),
  check('surface-heats',finite(z.surfaceC)&&finite(z.coreC)&&z.surfaceC>z.coreC+10&&z.surfaceC<190,`surface ${fmt(z.surfaceC,1)} °C · core ${fmt(z.coreC,1)} °C`),
  check('hot-pressure',finite(z.pressurePsi)&&z.pressurePsi>(cal.coldPsiRear||34.8)&&z.pressurePsi<48,`${fmt(z.pressurePsi,2)} psi from ${fmt(cal.coldPsiRear||34.8,1)} psi cold`),
  check('grip-window',finite(workingGrip)&&finite(hotGrip)&&workingGrip>hotGrip&&workingGrip>.95,`working ${fmt(workingGrip,3)} · hot/worn ${fmt(hotGrip,3)}`),
  check('wear-accumulates',finite(z.localWear01)&&z.localWear01>0,`local wear ${fmt(z.localWear01*100,5)} %`),
  check('authority-bypass',bypassBase&&restored,`baseline restore ${bypassBase?'OK':'FAIL'} · feedback restore ${restored?'OK':'FAIL'}`)
 ];
 return makeResult('TIRES',checks,{
  surfaceC:+z.surfaceC||0,coreC:+z.coreC||0,pressurePsi:+z.pressurePsi||0,gripFactor:+z.gripFactor||0,wear01:+z.localWear01||0
 },'Tire proof uses the local multi-rib thermal rig and separately verifies the V5 tire-authority bypass path.');
}

function restoreTopObject(target,snap){
 if(!target||!snap)return;
 Object.keys(target).forEach(k=>delete target[k]);
 Object.assign(target,deep(snap));
}
function runThermal(){
 const C=core(),O=C.O,A=C.A,PT=C.PT,SND=C.S;
 if(!O?.development?.advanceThermalSeconds||!A||!PT)return makeResult('THERMAL',[check('dependencies',false,'V1.25 thermal/V5/V1.21 API missing')]);
 const savedState=deep(O.state),savedSound=SND?.profile?.(),old=saveDomain();
 const pst=PT.states?.dyno,saveCmd=pst?.command?{...pst.command}:null;
 let result;
 try{
  O.resetThermal();
  A.setDomain?.('DYNO');
  A.dyno?.startRolling?.(18);
  if(pst?.command)Object.assign(pst.command,{mode:'ENGINE',gear:3,clutch:1,throttle:.72,frontBrakeBar:0,rearBrakeBar:0,absEnabled:false,tcEnabled:false,brakeModel:'HYDRAULIC_FERIT450'});
  for(let i=0;i<180;i++)A.dyno?.step?.();
  const amb=+O.cfg.ambientC||22,before=+O.state.exhaust.headerA.wallMeanC||amb;
  O.development.advanceThermalSeconds(18);
  const st=O.state,ex=st.exhaust,bridge=global.__LUCID_THERMAL_RENDER__,vol=global.__LUCID_VOLUMETRIC_THERMAL_INPUT__;
  const wall=+ex.headerA.wallMeanC,gas=+ex.headerA.gasOutC,muff=+ex.mufflerA.gasOutC;
  const checks=[
   check('source-live',finite(st.source?.rpm)&&st.source.rpm>1500&&finite(st.source?.egtC)&&st.source.egtC>250,`rpm ${fmt(st.source?.rpm,0)} · EGT proxy ${fmt(st.source?.egtC,1)} °C`),
   check('header-heats',finite(wall)&&wall>before+8,`${fmt(before,1)} → ${fmt(wall,1)} °C`),
   check('gas-path-finite',finite(gas)&&finite(muff)&&gas>muff&&muff>amb,`header out ${fmt(gas,1)} °C · muffler out ${fmt(muff,1)} °C`),
   check('render-bridge',finite(bridge?.nodes?.[23]?.tempC)&&Math.abs(bridge.nodes[23].tempC-wall)<2,`node 23 ${fmt(bridge?.nodes?.[23]?.tempC,1)} °C`),
   check('volumetric-bridge',finite(vol?.tailpipeTempC)&&finite(vol?.exhaustMassFlowKgS)&&vol.exhaustMassFlowKgS>0,`tailpipe ${fmt(vol?.tailpipeTempC,1)} °C · ${fmt(vol?.exhaustMassFlowKgS,4)} kg/s`)
  ];
  result=makeResult('THERMAL',checks,{
   rpm:+st.source?.rpm||0,egtC:+st.source?.egtC||0,headerWallC:wall,headerGasOutC:gas,mufflerGasOutC:muff,massFlowKgS:+st.source?.massFlowKgS||0
  },'Runs the real V1.25 thermal network against a controlled dyno state, then restores the prior thermal state.');
 }catch(e){result=makeResult('THERMAL',[check('execution',false,e.message)])}
 finally{
  if(saveCmd&&pst?.command)Object.assign(pst.command,saveCmd);
  restoreTopObject(O.state,savedState);
  try{O.bridges?.setRendererGlow?.(O.cfg.rendererGlow)}catch(_){}
  try{if(savedSound)SND?.setProfile?.(savedSound)}catch(_){}
  restoreDomain(old);
 }
 return result;
}

async function runSound(){
 const C=core(),S=C.S;
 if(!S?.enable||!S?.engine)return makeResult('SOUND',[check('dependencies',false,'V1.22 sound API missing')]);
 const saved=S.profile?.(),wasEnabled=!!S.engine.enabled;
 let result;
 try{
  await S.enable();
  const E=S.engine;
  E.updateState?.({rpm:1400,throttle:.10,loadNm:6,clutchSlipRpm:0,clutch:1,gear:2,wheelRpmR:180,tcFactor:1,limiter:1,speedMps:8});
  const low=S.metrics?.()||{};
  E.updateState?.({rpm:6500,throttle:.82,loadNm:72,clutchSlipRpm:120,clutch:1,gear:4,wheelRpmR:950,tcFactor:1,limiter:1,speedMps:42});
  const high=S.metrics?.()||{},snap=S.snapshot?.()||{};
  const running=/^RUNNING/.test(String(E.audioState||''))||E.enabled===true;
  const resonance=[high?.exhaust?.headerAHz,high?.exhaust?.headerBHz,high?.exhaust?.mufflerHelmholtzHz,high?.intake?.airboxHelmholtzHz];
  const checks=[
   check('audio-running',running,`${E.audioState||'UNKNOWN'} · context ${snap.audioContextState||'none'} · ${snap.sampleRate||0} Hz`),
   check('state-propagation',Math.abs((snap.state?.rpm||0)-6500)<1&&Math.abs((snap.state?.throttle||0)-.82)<.01,`rpm ${fmt(snap.state?.rpm,0)} · throttle ${fmt(snap.state?.throttle,2)}`),
   check('firing-rate-response',finite(low.firingRateHz)&&finite(high.firingRateHz)&&high.firingRateHz>low.firingRateHz*3.5,`${fmt(low.firingRateHz,1)} → ${fmt(high.firingRateHz,1)} Hz`),
   check('resonators-finite',resonance.every(x=>finite(x)&&x>20),`exhaust ${fmt(resonance[0],1)} / ${fmt(resonance[1],1)} Hz · intake ${fmt(resonance[3],1)} Hz`),
   check('four-bus-mixer',!!E.gains?.exhaust&&!!E.gains?.intake&&!!E.gains?.mechanical&&!!E.gains?.driveline,'exhaust · intake · mechanical · driveline buses present')
  ];
  result=makeResult('SOUND',checks,{
   audioState:E.audioState||'UNKNOWN',sampleRate:+snap.sampleRate||0,lowFireHz:+low.firingRateHz||0,highFireHz:+high.firingRateHz||0,
   headerAHz:+resonance[0]||0,headerBHz:+resonance[1]||0,intakeHz:+resonance[3]||0
  },'AudioWorklet is preferred; the V1.28.1 compatibility DSP is accepted as a running audible path when the browser rejects AudioWorklet.');
 }catch(e){result=makeResult('SOUND',[check('execution',false,e.message)])}
 finally{
  try{if(saved)S.setProfile?.(saved)}catch(_){}
  // Do not forcibly mute a user-started audio context; a proof button is a valid user gesture.
  if(!wasEnabled && !result?.pass){try{S.mute?.()}catch(_){}}
 }
 return result;
}

const runners={
 SUSPENSION:()=>Promise.resolve(runSuspension()),
 BRAKES:()=>Promise.resolve(runBrakes()),
 TIRES:()=>Promise.resolve(runTires()),
 THERMAL:()=>Promise.resolve(runThermal()),
 SOUND:()=>runSound()
};
async function run(id){
 id=String(id||'').toUpperCase();
 if(!runners[id])throw Error('Unknown stability rig '+id);
 if(rt.running)throw Error('A stability proof is already running');
 rt.running=true;
 const badge=q('v1283Badge'+id);if(badge){badge.textContent='RUNNING';badge.className='v1283Badge run'}
 try{
  const r=await runners[id]();
  rt.results[id]=r;renderOne(id);renderAll();return deep(r);
 }finally{rt.running=false}
}
async function runAll(){
 if(rt.running)throw Error('A stability proof is already running');
 const order=['SUSPENSION','BRAKES','TIRES','THERMAL','SOUND'],out={};
 for(const id of order){out[id]=await run(id)}
 const pass=Object.values(out).every(x=>x.pass);
 rt.lastSuite={schema:'lucid.v1283.stability-suite.v1',time:new Date().toISOString(),pass,results:deep(out)};
 renderAll();return deep(rt.lastSuite);
}

function addInlineProof(page,id,label){
 let target;
 if(page==='SOUND'){
  target=q('v123SoundDock')?.querySelector('.asTop,.asHead,.asStudioHead')||q('v123SoundDock');
 }else{
  target=q('v125LabDock')?.querySelector(`[data-v125-page="${page}"] .v125Head`);
 }
 if(!target||target.querySelector?.(`[data-v1283-rig="${id}"]`))return;
 const bar=D.createElement('div');bar.className='v1283InlineProof';bar.dataset.v1283Rig=id;
 bar.innerHTML=`<button>RUN ${label} PROOF</button><span id="v1283Inline${id}" class="v1283InlineBadge idle">NOT RUN</span>`;
 target.appendChild(bar);
 bar.querySelector('button').onclick=()=>run(id).catch(e=>{rt.results[id]=makeResult(id,[check('exception',false,e.message)]);renderAll()});
}

function buildPage(){
 const nav=q('v123Nav');
 if(nav&&!q('v1283StabilityBtn')){
  const b=D.createElement('button');b.id='v1283StabilityBtn';b.dataset.v123Page='STABILITY';b.textContent='STABILITY';
  b.onclick=e=>{e.preventDefault();e.stopPropagation();enterStability()};
  nav.insertBefore(b,q('v1281SystemBtn')||null);
 }
 const dock=q('v125LabDock');
 if(dock&&!dock.querySelector('[data-v125-page="STABILITY"]')){
  const p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='STABILITY';
  const cards=[
   ['SUSPENSION','Suspension Rig','V5 travel, damping velocity, tire loads, brake-dive and acceleration-squat response.'],
   ['BRAKES','Brake Rig','V1.26 repeated stops, rotor heating, μ fade direction, wear, and feedback bypass.'],
   ['TIRES','Tire Rig','Multi-rib thermal response, hot pressure, grip window, wear, and V5 authority bypass.'],
   ['THERMAL','Thermal Rig','Engine heat source → segmented exhaust → render and volumetric bridges, with state restoration.'],
   ['SOUND','Sound Rig','Audio startup/fallback, engine-state propagation, firing-rate response, resonators, and four audio buses.']
  ];
  p.innerHTML=`
   <div class="v125Head"><h2>STABILITY / ONE-CLICK PROOF RIGS</h2><p>These tests prove the major development subsystems independently of Free Ride. A green status means the subsystem executed its expected response checks—not merely that its JavaScript parsed.</p></div>
   <div class="v1283SuiteBar"><button id="v1283RunAll">RUN ALL FIVE PROOFS</button><span id="v1283SuiteBadge" class="v1283Badge idle">NOT COMPLETE</span><b id="v1283SuiteSummary">No subsystem proof has been run.</b></div>
   <div class="v1283Cards">${cards.map(([id,title,desc])=>`
    <article id="v1283Card${id}" class="v1283RigCard idle">
     <header><div><h3>${title}</h3><p>${desc}</p></div><span id="v1283Badge${id}" class="v1283Badge idle">NOT RUN</span></header>
     <button class="v1283RunOne" data-v1283-run="${id}">RUN ${id} PROOF</button>
     <div id="v1283Checks${id}" class="v1283Checks"><div class="v1283Empty">No proof run yet.</div></div>
     <div id="v1283Metrics${id}" class="v1283Metrics v125KV"></div>
    </article>`).join('')}</div>
   <div class="v125Note">Suspension proof deliberately resets the free-road state. Thermal proof temporarily uses DYNO and restores the thermal state afterward. Brake/tire rig calculations are deterministic development tests. Sound must be started from a user gesture, so RUN SOUND or RUN ALL is the intended entry point.</div>`;
  dock.appendChild(p);
  q('v1283RunAll').onclick=()=>runAll().catch(e=>{console.error('V1.28.3 suite failed',e)});
  p.querySelectorAll('[data-v1283-run]').forEach(b=>b.onclick=()=>run(b.dataset.v1283Run).catch(e=>{rt.results[b.dataset.v1283Run]=makeResult(b.dataset.v1283Run,[check('exception',false,e.message)]);renderAll()}));
 }
 addInlineProof('SUSPENSION','SUSPENSION','SUSPENSION');
 addInlineProof('BRAKES','BRAKES','BRAKE');
 addInlineProof('TIRES','TIRES','TIRE');
 addInlineProof('THERMAL','THERMAL','THERMAL');
 addInlineProof('SOUND','SOUND','SOUND');
 renderAll();
}
function addStyle(){
 const s=D.createElement('style');s.textContent=`
 body.v123 #v123Brand strong:after{content:" · V1.28.3 STABILITY GATE"!important;color:#8cf0b1;font-weight:650}
 body[data-v123-page="STABILITY"] #app{grid-template-columns:minmax(0,1fr) min(860px,62vw);grid-template-rows:minmax(0,1fr)}
 body[data-v123-page="STABILITY"] #v125LabDock{display:block}
 body[data-v123-page="STABILITY"] #v123Right{display:none!important}
 .v1283SuiteBar{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px;padding:10px;border:1px solid #2a4855;background:#09161e;border-radius:7px;margin-bottom:10px}
 .v1283SuiteBar button,.v1283RunOne,.v1283InlineProof button{background:#123525;border:1px solid #5ba979;color:#e8f8ee;padding:8px 10px;border-radius:5px;font:650 9px ui-monospace;cursor:pointer}
 .v1283SuiteBar b{font:10px ui-monospace;color:#a9c1ca}
 .v1283Cards{display:grid;grid-template-columns:1fr 1fr;gap:9px}.v1283RigCard{border:1px solid #294550;background:#071118;border-radius:7px;padding:10px;min-width:0}
 .v1283RigCard:last-child{grid-column:1/-1}.v1283RigCard.ok{border-color:#347052}.v1283RigCard.bad{border-color:#8b443f}
 .v1283RigCard header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.v1283RigCard h3{margin:0 0 4px}.v1283RigCard p{margin:0;color:#8ba6b0;font:9px/1.45 ui-monospace}
 .v1283Badge,.v1283InlineBadge{white-space:nowrap;border:1px solid #38515c;color:#8fa8b2;background:#101b20;padding:4px 6px;border-radius:4px;font:650 8px ui-monospace}
 .v1283Badge.ok,.v1283InlineBadge.ok{color:#82e9aa;border-color:#347052;background:#0b2518}.v1283Badge.bad,.v1283InlineBadge.bad{color:#ff897c;border-color:#8b443f;background:#2c1211}.v1283Badge.run{color:#87dff5;border-color:#39738a}
 .v1283RunOne{margin:9px 0 7px;background:#102832;border-color:#3b6170}.v1283Checks{display:grid;gap:4px}.v1283Check{display:grid;grid-template-columns:minmax(120px,.55fr) 1fr;gap:6px;padding:4px 6px;border-left:2px solid #3b5560;background:#081218;font:8.5px/1.35 ui-monospace}
 .v1283Check.ok{border-color:#4d9a6c}.v1283Check.bad{border-color:#b25249}.v1283Check b{color:#dceff5}.v1283Check.ok b{color:#82e9aa}.v1283Check.bad b{color:#ff897c}.v1283Check span{color:#98afb8}
 .v1283Metrics{margin-top:8px;padding-top:7px;border-top:1px solid #203640}.v1283Empty{color:#6d8994;font:9px ui-monospace;padding:7px 0}
 .v1283InlineProof{display:flex;gap:7px;align-items:center;margin-top:8px}.v1283InlineProof button{padding:6px 8px;background:#102832;border-color:#3b6170}
 @media(max-width:900px){.v1283Cards{grid-template-columns:1fr}.v1283RigCard:last-child{grid-column:auto}.v1283SuiteBar{grid-template-columns:1fr auto}.v1283SuiteBar b{grid-column:1/-1}}
 `;D.head.appendChild(s);
}
let retries=0;
function boot(){
 if(rt.installed)return;
 const C=core();
 if(!D||!q('v125LabDock')||!C.A||!C.O||!C.B||!C.S){
  if(retries++<40)return setTimeout(boot,50);
  global.__LUCID_V1283_READY__=false;return;
 }
 rt.installed=true;addStyle();buildPage();global.__LUCID_V1283_READY__=true;
}
if(D?.readyState==='loading')D.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

global.LUCID_STABILITY_RIGS={
 version:'V1.28.3',
 runtime:rt,
 enter:enterStability,
 run,runAll,
 results:()=>deep(rt.results),
 lastSuite:()=>deep(rt.lastSuite),
 required:['SUSPENSION','BRAKES','TIRES','THERMAL','SOUND'],
 allPassing:()=>Object.values(rt.results).filter(Boolean).length===5&&Object.values(rt.results).every(r=>r?.pass)
};
})(typeof window!=='undefined'?window:globalThis);


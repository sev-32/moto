
(function(global){
'use strict';
if(global.__LUCID_V127_THERMAL_MATERIALS__)return;
global.__LUCID_V127_THERMAL_MATERIALS__=true;

const D=global.document;
const API=global.DUCATI_V5_API;
const PT=global.DUCATI_ADVANCED_POWERTRAIN;
const ORCH=global.LUCID_COMPONENT_ORCHESTRATOR;
const BT=global.LUCID_BRAKE_TIRE_FEEDBACK;
if(!D||!API||!PT||!ORCH||!BT){console.warn('V1.27 thermal/materials: required V5/V1.21/V1.25/V1.26 APIs unavailable');return}

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const q=id=>D.getElementById(id);
const deep=o=>JSON.parse(JSON.stringify(o));
const activePage=()=>String(global.__LUCID_ACTIVE_PAGE__||D.body?.dataset?.v123Page||'RIDE').toUpperCase();

const CAL={
 schema:'lucid.v127.thermal-materials-calibration.v1',
 thermalHz:40,
 wheel:{
  front:{hubMassKg:1.15,rimMassKg:4.0,hubCp:880,rimCp:880,rotorHubWPerK:3.2,hubRimWPerK:8.0,rimTireAirWPerK:5.5,rimTireCoreWPerK:2.5,convBaseWPerK:4.5,convSpeedWPerK:1.8},
  rear:{hubMassKg:1.35,rimMassKg:5.1,hubCp:880,rimCp:880,rotorHubWPerK:2.6,hubRimWPerK:7.5,rimTireAirWPerK:5.0,rimTireCoreWPerK:2.3,convBaseWPerK:4.8,convSpeedWPerK:1.9}
 },
 damper:{
  enabled:true,referenceTempC:22,temperatureSlopePerC:.0045,minFactor:.72,maxFactor:1.08
 },
 materials:{
  enabled:true,exhaustAgingRate:1/14000,rotorAgingRate:1/900,rotorRecoveryRate:1/7200
 },
 fx:{
  enabled:true,exhaust:true,brakes:true,tires:true,maxParticlesRide:170,maxParticlesLab:300,
  exhaustRate:22,tireRate:38,brakeRate:10
 },
 renderer:{spatialExhaust:true,spatialRotors:true}
};

const amb=()=>ORCH.state?.ambientC??22;
function wheelState(name){let T=amb();return{name,hubC:T,rimC:T,rotorHeatW:0,toTireAirW:0,toTireCoreW:0}}
const state={
 schema:'lucid.v127.thermal-materials-state.v1',
 wheels:{front:wheelState('front'),rear:wheelState('rear')},
 materials:{
  exhaust:{headerA:0,headerB:0,mufflerA:0,mufflerB:0},
  rotors:{frontL:0,frontR:0,rear:0}
 },
 damper:{frontFactor:1,rearFactor:1,enabled:true,authored:null},
 fx:{particles:[],emitted:{exhaust:0,brake:0,tire:0}},
 simTimeS:ORCH.state?.simTimeS||0,lastStepS:ORCH.state?.simTimeS||0
};

function captureAuthored(){
 const S=API.free?.S;if(!S)return;
 state.damper.authored={cFc:S.cFc,cFr:S.cFr,cRc:S.cRc,cRr:S.cRr};
}
captureAuthored();
const baseSuspensionApply=ORCH.suspension?.apply;
if(baseSuspensionApply)ORCH.suspension.apply=function(p){
 const r=baseSuspensionApply.call(ORCH.suspension,p);
 captureAuthored();applyDamperFeedback();return r;
};

function viscosityFactor(T){
 return clamp(Math.exp(-CAL.damper.temperatureSlopePerC*((T??CAL.damper.referenceTempC)-CAL.damper.referenceTempC)),CAL.damper.minFactor,CAL.damper.maxFactor);
}
function applyDamperFeedback(){
 const S=API.free?.S,a=state.damper.authored;if(!S||!a)return;
 const en=CAL.damper.enabled;
 const fF=en?viscosityFactor(ORCH.state?.suspension?.front?.oilC):1;
 const fR=en?viscosityFactor(ORCH.state?.suspension?.rear?.oilC):1;
 state.damper.frontFactor=fF;state.damper.rearFactor=fR;state.damper.enabled=en;
 S.cFc=a.cFc*fF;S.cFr=a.cFr*fF;S.cRc=a.cRc*fR;S.cRr=a.cRr*fR;
}
function syncAuthoredFromSuspensionUI(){
 const nums=id=>+q(id)?.value;
 if(!q('v125Fc'))return captureAuthored();
 state.damper.authored={
  cFc:nums('v125Fc')*1000,cFr:nums('v125Fr')*1000,cRc:nums('v125Rc')*1000,cRr:nums('v125Rr')*1000
 };
 applyDamperFeedback();
}

function coupleWheel(which,dt){
 const C=CAL.wheel[which],W=state.wheels[which],B=BT.state?.brakes,T=BT.state?.tires?.[which],speed=Math.abs(API.free?.last?.body?.speedMps||0);
 if(!B||!T)return;
 const rotorC=which==='front'?((B.frontL?.meanC||amb())+(B.frontR?.meanC||amb()))*.5:(B.rear?.meanC||amb());
 const qRH=C.rotorHubWPerK*(rotorC-W.hubC),qHR=C.hubRimWPerK*(W.hubC-W.rimC);
 const qConv=(C.convBaseWPerK+C.convSpeedWPerK*Math.sqrt(speed))*Math.max(0,W.rimC-amb());
 const qAir=C.rimTireAirWPerK*(W.rimC-T.airC);
 const avgCore=T.ribs?.length?T.ribs.reduce((s,r)=>s+r.coreC,0)/T.ribs.length:T.localCoreC;
 const qCore=C.rimTireCoreWPerK*(W.rimC-avgCore);
 W.hubC=clamp(W.hubC+(qRH-qHR)*dt/(C.hubMassKg*C.hubCp),amb()-15,850);
 W.rimC=clamp(W.rimC+(qHR-qConv-qAir-qCore)*dt/(C.rimMassKg*C.rimCp),amb()-15,420);
 T.airC=clamp(T.airC+qAir*dt/(which==='front'?180:210),amb()-20,175);
 if(T.ribs?.length){let per=qCore/Math.max(1,T.ribs.length),cap=which==='front'?980:1160;for(const r of T.ribs)r.coreC=clamp(r.coreC+per*dt/cap,amb()-20,180)}
 W.rotorHeatW=qRH;W.toTireAirW=qAir;W.toTireCoreW=qCore;
}

function agingStep(dt){
 if(!CAL.materials.enabled)return;
 const E=ORCH.state?.exhaust,B=BT.state?.brakes;if(!E||!B)return;
 const hot=(T,start,span)=>clamp((T-start)/span,0,2);
 for(const k of ['headerA','headerB','mufflerA','mufflerB']){
  const p=E[k],ox=p?.oxidation||[];
  state.materials.exhaust[k]=ox.length?clamp(ox.reduce((a,b)=>a+b,0)/ox.length,0,1):state.materials.exhaust[k];
 }
 for(const k of ['frontL','frontR','rear']){
  const T=B[k]?.maxC??amb(),old=state.materials.rotors[k];
  state.materials.rotors[k]=clamp(old+hot(T,380,420)*CAL.materials.rotorAgingRate*dt-(T<120?CAL.materials.rotorRecoveryRate*dt:0),0,1);
 }
}

function augmentRenderer(){
 const bridge=global.__LUCID_THERMAL_RENDER__,E=ORCH.state?.exhaust,B=BT.state?.brakes;if(!bridge?.nodes||!E||!B)return;
 bridge.schema='lucid.v127.thermal-render-bridge.v3';
 const pipe=(node,p,aging,eps)=>{
  if(!bridge.nodes[node])bridge.nodes[node]={};
  Object.assign(bridge.nodes[node],{
   spatialTemps:CAL.renderer.spatialExhaust?(p.wallC||[]).slice(0,16):null,spatialAxis:2,
   roughnessOverride:clamp(.06+aging*.22,0.05,.34),
   materialAge01:aging,source:'V1.27 gas-path wall cells → mesh-axis visual interpolation'
  });
 };
 pipe(23,E.headerA,state.materials.exhaust.headerA,.5);pipe(31,E.headerB,state.materials.exhaust.headerB,.5);
 pipe(25,E.mufflerA,state.materials.exhaust.mufflerA,.44);pipe(26,E.mufflerA,state.materials.exhaust.mufflerA,.44);pipe(27,E.mufflerA,state.materials.exhaust.mufflerA,.36);
 pipe(28,E.mufflerB,state.materials.exhaust.mufflerB,.44);pipe(29,E.mufflerB,state.materials.exhaust.mufflerB,.44);pipe(30,E.mufflerB,state.materials.exhaust.mufflerB,.36);
 const rot=(node,key)=>{
  let th=bridge.nodes[node],r=B[key];if(!th||!r)return;
  th.spatialBands=CAL.renderer.spatialRotors?r.tempC.map(x=>x.slice()):null;th.spatialAxis=0;
  const a=state.materials.rotors[key];th.tintRGB=a<.45?[.28,.30,.34]:[.28,.22,.34];th.tintAmount=clamp(a*.28,0,.28);th.roughnessOverride=clamp(.14+a*.13,.12,.32);th.materialAge01=a;
 };
 rot(127,'frontL');rot(128,'frontR');rot(147,'rear');
 bridge.authority='V1.27: physical temperatures are authoritative from V1.25/V1.26; spatial exhaust mapping is a GLB mesh-axis interpolation proxy, rotor grid maps directly to rotor-local radius/angle.';
}

function publishVolumetrics(){
 const V=global.__LUCID_VOLUMETRIC_THERMAL_INPUT__;if(V){
  V.schema='lucid.v127.volumetric-thermal-input.v3';V.consumerPresent=!!CAL.fx.enabled;
  V.consumer='V1.27 lightweight world-space thermal FX';
  V.wheelThermal={front:{...state.wheels.front},rear:{...state.wheels.rear}};
  V.damperViscosity={frontFactor:state.damper.frontFactor,rearFactor:state.damper.rearFactor,enabled:CAL.damper.enabled};
  V.materialAging=deep(state.materials);
 }
 const E=ORCH.state?.exhaust;if(E)global.__LUCID_ACOUSTIC_THERMAL_PROFILE__={
  schema:'lucid.v127.acoustic-thermal-profile.v1',
  headerA:{gasC:(E.headerA.gasC||[]).slice(),wallC:(E.headerA.wallC||[]).slice()},
  headerB:{gasC:(E.headerB.gasC||[]).slice(),wallC:(E.headerB.wallC||[]).slice()},
  collector:{gasC:(E.collector?.gasC||[]).slice(),wallC:(E.collector?.wallC||[]).slice()},
  mufflerA:{gasC:(E.mufflerA.gasC||[]).slice(),wallC:(E.mufflerA.wallC||[]).slice()},
  mufflerB:{gasC:(E.mufflerB.gasC||[]).slice(),wallC:(E.mufflerB.wallC||[]).slice()},
  currentConsumer:'V1.22/V1.25 effective exhaust gas temperature; per-section wave-speed DSP is bridge-ready, not yet consumed.'
 };
}

function thermalStep(dt){
 coupleWheel('front',dt);coupleWheel('rear',dt);agingStep(dt);applyDamperFeedback();augmentRenderer();publishVolumetrics();
 state.simTimeS=ORCH.state?.simTimeS??state.simTimeS+dt;
}

function reset(){
 const T=amb();state.wheels.front=wheelState('front');state.wheels.rear=wheelState('rear');
 for(const g of Object.values(state.materials))for(const k of Object.keys(g))g[k]=0;
 captureAuthored();applyDamperFeedback();state.fx.particles.length=0;augmentRenderer();publishVolumetrics();return state;
}

// ---- lightweight world-space thermal FX consumer ----
function qrot(q,v){if(!q)return v.slice();let x=q[0],y=q[1],z=q[2],w=q[3],vx=v[0],vy=v[1],vz=v[2],tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);return[vx+w*tx+(y*tz-z*ty),vy+w*ty+(z*tx-x*tz),vz+w*tz+(x*ty-y*tx)]}
function add3(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function mul3(a,s){return[a[0]*s,a[1]*s,a[2]*s]}
function emitterLocal(local){let F=API.free,qv=F?.q,p=F?.p||[0,0,0];return add3(p,qrot(qv,local))}
function velLocal(local){let F=API.free,v=F?.v||[0,0,0];return add3(v,qrot(F?.q,local))}
function emit(kind,pos,vel,life,size,intensity){
 const cap=activePage()==='RIDE'?CAL.fx.maxParticlesRide:CAL.fx.maxParticlesLab,P=state.fx.particles;
 if(P.length>=cap)P.splice(0,Math.max(1,P.length-cap+1));
 P.push({kind,p:pos.slice(),v:vel.slice(),age:0,life,size,intensity});state.fx.emitted[kind]=(state.fx.emitted[kind]||0)+1;
}
let emitAcc={exhaust:0,brake:0,tire:0};
function fxEmit(dt){
 if(!CAL.fx.enabled)return;const V=global.__LUCID_VOLUMETRIC_THERMAL_INPUT__||{},F=API.free;
 if(!F)return;
 if(CAL.fx.exhaust){
  let u=clamp(V.exhaustHeatHaze01||0,0,1),flow=clamp((V.exhaustMassFlowKgS||0)/.12,0,1.5);emitAcc.exhaust+=dt*CAL.fx.exhaustRate*u*(.25+flow);
  while(emitAcc.exhaust>=1){emitAcc.exhaust--;for(let x of [-.105,.105]){let p=emitterLocal([x,-.68,.22]),v=velLocal([0,-(1.1+flow*2.2),.18+.45*u]);emit('exhaust',p,v,1.0+.7*u,.045+.07*u,u)}}
 }
 const kin=global.__FREE_VISUAL_KINEMATICS__||{};
 if(CAL.fx.brakes){
  let uf=clamp(V.frontBrakeHeat01||0,0,1),ur=clamp(V.rearBrakeHeat01||0,0,1);emitAcc.brake+=dt*CAL.fx.brakeRate*(uf+ur);
  while(emitAcc.brake>=1){emitAcc.brake--;let front=uf>=ur,pos=front?kin.frontHub:kin.rearHub,u=front?uf:ur;if(pos)emit('brake',pos,velLocal([0,-.15,.45+.35*u]),.75,.035+.05*u,u)}
 }
 if(CAL.fx.tires){
  let uf=clamp(V.frontTireSmokePotential01||0,0,1),ur=clamp(V.rearTireSmokePotential01||0,0,1);emitAcc.tire+=dt*CAL.fx.tireRate*(uf+ur);
  while(emitAcc.tire>=1){emitAcc.tire--;let front=uf>=ur,u=front?uf:ur,cp=front?F.tf?.contactPoint:F.tr?.contactPoint;if(cp)emit('tire',cp,velLocal([0,-.35,.18+.22*u]),1.3,.06+.13*u,u)}
 }
}
function fxStep(dt){
 fxEmit(dt);let P=state.fx.particles,drag=Math.exp(-dt*1.25);
 for(let i=P.length-1;i>=0;i--){let a=P[i];a.age+=dt;if(a.age>=a.life){P.splice(i,1);continue}a.v[0]*=drag;a.v[1]*=drag;a.v[2]=a.v[2]*drag+.36*dt;a.p[0]+=a.v[0]*dt;a.p[1]+=a.v[1]*dt;a.p[2]+=a.v[2]*dt}
}
function project(p,w,h){
 const m=global.__VP__;if(!m)return null;let x=p[0],y=p[1],z=p[2],cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],cw=m[3]*x+m[7]*y+m[11]*z+m[15];if(cw<=.02)return null;let nx=cx/cw,ny=cy/cw;if(Math.abs(nx)>1.4||Math.abs(ny)>1.4)return null;return[(nx*.5+.5)*w,(1-(ny*.5+.5))*h,1/cw]}
function drawFX(){
 const c=q('v127FxCanvas');if(!c)return;const show=['RIDE','THERMAL','VOLUMETRICS','MATERIALS'].includes(activePage())&&CAL.fx.enabled;c.style.display=show?'block':'none';if(!show)return;
 const d=Math.min(global.devicePixelRatio||1,2),r=c.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);if(c.width!==Math.round(w*d)||c.height!==Math.round(h*d)){c.width=Math.round(w*d);c.height=Math.round(h*d)}
 let x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,w,h);
 for(const a of state.fx.particles){let s=project(a.p,w,h);if(!s)continue;let life=1-a.age/a.life,rad=a.size*(250*s[2]+25),alpha=clamp(a.intensity*life*.22,0,.20);
  if(a.kind==='tire'){x.fillStyle=`rgba(150,155,158,${alpha*.95})`;x.beginPath();x.arc(s[0],s[1],rad*1.4,0,Math.PI*2);x.fill()}
  else{x.strokeStyle=a.kind==='brake'?`rgba(255,175,110,${alpha*.40})`:`rgba(205,225,235,${alpha*.33})`;x.lineWidth=Math.max(1,rad*.08);x.beginPath();x.ellipse(s[0],s[1],rad*.8,rad*1.7,0,0,Math.PI*2);x.stroke()}
 }
}
let fxLast=performance.now();
function fxLoop(t){let dt=clamp((t-fxLast)/1000,0,.05);fxLast=t;if(['RIDE','THERMAL','VOLUMETRICS','MATERIALS'].includes(activePage()))fxStep(dt);drawFX();global.requestAnimationFrame(fxLoop)}

// ---- UI ----
const CSS=`
body.v123 #v123Brand strong:after{content:" · V1.27 THERMAL MATERIALS"!important;color:#70dffb;font-weight:500}
body[data-v123-page="MATERIALS"] #app,body[data-v123-page="VOLUMETRICS"] #app{grid-template-columns:minmax(0,1fr) min(680px,50vw);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="MATERIALS"] #v125LabDock,body[data-v123-page="VOLUMETRICS"] #v125LabDock{display:block}
body[data-v123-page="MATERIALS"] #v123Right,body[data-v123-page="VOLUMETRICS"] #v123Right{display:none!important}
#v127FxCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:9;pointer-events:none}
.v127Gauge{height:7px;background:#071017;border:1px solid #243e49;border-radius:5px;overflow:hidden;margin:4px 0 8px}.v127Gauge b{display:block;height:100%;background:linear-gradient(90deg,#54cbe8,#ffca68,#ff6759)}
.v127Row{display:grid;grid-template-columns:1fr auto;gap:8px;font:9px ui-monospace;color:#91abb6;padding:4px 0;border-bottom:1px solid #132a34}.v127Row b{color:#e1f2f7}
`;
function addStyle(){let s=D.createElement('style');s.textContent=CSS;D.head.appendChild(s)}
function kv(el,rows){if(el)el.innerHTML=rows.map(r=>`<div class="v127Row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}
function addNav(){
 const nav=q('v123Nav');if(!nav)return;
 for(const [page,label] of [['MATERIALS','MATERIALS'],['VOLUMETRICS','VOLUMETRICS']])if(!nav.querySelector(`[data-v123-page="${page}"]`)){let b=D.createElement('button');b.className='v125Nav';b.dataset.v123Page=page;b.textContent=label;b.onclick=e=>{e.preventDefault();e.stopPropagation();enter(page)};nav.appendChild(b)}
}
function addPages(){
 const dock=q('v125LabDock');if(!dock)return;
 if(!dock.querySelector('[data-v125-page="MATERIALS"]')){let p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='MATERIALS';p.innerHTML=`
  <div class="v125Head"><h2>THERMAL MATERIALS / AGING</h2><p>One shared temperature history drives incandescence, persistent exhaust/rotor material aging, wheel heat transfer and damper-oil viscosity. Incandescence and permanent heat history are separate states.</p></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>WHEEL HEAT PATH</h3><div id="v127WheelKV"></div></div>
   <div class="v125Card"><h3>DAMPER OIL FEEDBACK</h3><label class="v125Field"><span>viscosity feedback</span><input id="v127DamperEnable" type="checkbox"><small>LIVE</small></label><div id="v127DamperKV"></div></div>
   <div class="v125Card full"><h3>MATERIAL HISTORY</h3><div id="v127MaterialKV"></div><div class="v125Note">Exhaust oxidation and rotor temper/oxide state persist after cooling. The coefficients are development calibration; visible incandescence remains derived from instantaneous absolute temperature.</div></div>
   <div class="v125Card full"><h3>RENDER AUTHORITY</h3><div class="v125Note v125Good">LIVE — exhaust cells now drive longitudinal mesh emission and 3×12 rotor cells drive rotor-local radial/sector emission. The curved header visual mapping is a mesh-axis interpolation proxy; the underlying thermal propagation remains gas-path based.</div></div>
  </div>`;dock.appendChild(p)}
 if(!dock.querySelector('[data-v125-page="VOLUMETRICS"]')){let p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='VOLUMETRICS';p.innerHTML=`
  <div class="v125Head"><h2>THERMAL VOLUMETRICS</h2><p>Performance-bounded world-space thermal FX consumer driven by the V1.25/V1.26 energy state: exhaust shimmer/plume, rotor heat shimmer, and slip/temperature/wear tire smoke.</p></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>FX ROUTING</h3>
    <label class="v125Field"><span>master</span><input id="v127FxEnable" type="checkbox"><small>FX</small></label>
    <label class="v125Field"><span>exhaust thermal plume</span><input id="v127FxExhaust" type="checkbox"><small>HEAT</small></label>
    <label class="v125Field"><span>brake heat shimmer</span><input id="v127FxBrake" type="checkbox"><small>HEAT</small></label>
    <label class="v125Field"><span>tire smoke</span><input id="v127FxTire" type="checkbox"><small>SLIP</small></label>
   </div>
   <div class="v125Card"><h3>LIVE VOLUMETRIC INPUT</h3><div id="v127FxKV"></div></div>
   <div class="v125Card full"><h3>BOUNDARY</h3><div class="v125Note">This checkpoint adds a lightweight world-space particle/shimmer consumer, not full refractive CFD. Exhaust visibility is heat-dominant; tire smoke requires both thermal/slip state. A future GPU volume pass can consume the same bridge without changing vehicle physics.</div></div>
  </div>`;dock.appendChild(p)}
}
function installFxCanvas(){let view=q('view');if(!view||q('v127FxCanvas'))return;let c=D.createElement('canvas');c.id='v127FxCanvas';view.appendChild(c)}
function enter(page){
 const base=q('v123Nav')?.querySelector('button[data-v123-page="DYNAMICS"]');if(activePage()==='RIDE'||!['DYNAMICS','SUSPENSION','BRAKES','TIRES','THERMAL','WEAR','MATERIALS','VOLUMETRICS'].includes(activePage()))base?.click();
 try{API.setDomain?.('FREE_ROAD')}catch(_){}
 D.body.dataset.v123Page=page;global.__LUCID_ACTIVE_PAGE__=page;global.__LUCID_PERF_MODE__='LAB';
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page===page));
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page===page));
 const title=q('v123PageTitle'),m=page==='MATERIALS'?['THERMAL MATERIALS','incandescence · aging · wheel heat · damper oil']:['THERMAL VOLUMETRICS','exhaust plume · heat shimmer · tire smoke'];
 if(title){title.querySelector('strong').textContent=m[0];title.querySelector('span').textContent=m[1]}
 if(q('v123Domain'))q('v123Domain').textContent='FREE_ROAD · '+page;
}
function addSuspensionThermalCard(){
 const page=D.querySelector('[data-v125-page="SUSPENSION"] .v125Grid');if(!page||q('v127SuspThermal'))return;let c=D.createElement('div');c.className='v125Card full';c.innerHTML='<h3>V1.27 DAMPER THERMAL AUTHORITY</h3><div id="v127SuspThermal"></div><div class="v125Note">Oil temperature scales the authored compression/rebound coefficients through a bounded viscosity proxy. Disable on Materials for exact V1.26 damping.</div>';page.appendChild(c)
}
function updateUI(){
 if(activePage()==='MATERIALS'){
  kv(q('v127WheelKV'),[['front hub / rim',state.wheels.front.hubC.toFixed(1)+' / '+state.wheels.front.rimC.toFixed(1)+' °C'],['rear hub / rim',state.wheels.rear.hubC.toFixed(1)+' / '+state.wheels.rear.rimC.toFixed(1)+' °C'],['front rotor→hub',state.wheels.front.rotorHeatW.toFixed(0)+' W'],['rear rotor→hub',state.wheels.rear.rotorHeatW.toFixed(0)+' W'],['rim→tire air F/R',state.wheels.front.toTireAirW.toFixed(1)+' / '+state.wheels.rear.toTireAirW.toFixed(1)+' W']]);
  kv(q('v127DamperKV'),[['front viscosity factor',state.damper.frontFactor.toFixed(3)],['rear viscosity factor',state.damper.rearFactor.toFixed(3)],['front oil',(+ORCH.state.suspension.front.oilC).toFixed(1)+' °C'],['rear oil',(+ORCH.state.suspension.rear.oilC).toFixed(1)+' °C']]);
  kv(q('v127MaterialKV'),Object.entries(state.materials.exhaust).map(([k,v])=>['exhaust '+k,(v*100).toFixed(1)+' % history']).concat(Object.entries(state.materials.rotors).map(([k,v])=>['rotor '+k,(v*100).toFixed(1)+' % history'])));
 }else if(activePage()==='VOLUMETRICS'){
  let V=global.__LUCID_VOLUMETRIC_THERMAL_INPUT__||{};
  kv(q('v127FxKV'),[['tailpipe gas',(+V.tailpipeTempC||0).toFixed(0)+' °C'],['exhaust heat',((+V.exhaustHeatHaze01||0)*100).toFixed(0)+' %'],['front brake heat',((+V.frontBrakeHeat01||0)*100).toFixed(0)+' %'],['rear brake heat',((+V.rearBrakeHeat01||0)*100).toFixed(0)+' %'],['tire smoke F/R',((+V.frontTireSmokePotential01||0)*100).toFixed(0)+' / '+((+V.rearTireSmokePotential01||0)*100).toFixed(0)+' %'],['active particles',String(state.fx.particles.length)]]);
 }
 if(activePage()==='SUSPENSION')kv(q('v127SuspThermal'),[['front oil / factor',(+ORCH.state.suspension.front.oilC).toFixed(1)+' °C / '+state.damper.frontFactor.toFixed(3)],['rear oil / factor',(+ORCH.state.suspension.rear.oilC).toFixed(1)+' °C / '+state.damper.rearFactor.toFixed(3)],['feedback',CAL.damper.enabled?'LIVE':'BYPASS']]);
}
function bind(){
 q('v127DamperEnable').checked=CAL.damper.enabled;q('v127DamperEnable').onchange=e=>{CAL.damper.enabled=!!e.target.checked;applyDamperFeedback()};
 q('v127FxEnable').checked=CAL.fx.enabled;q('v127FxEnable').onchange=e=>CAL.fx.enabled=!!e.target.checked;
 q('v127FxExhaust').checked=CAL.fx.exhaust;q('v127FxExhaust').onchange=e=>CAL.fx.exhaust=!!e.target.checked;
 q('v127FxBrake').checked=CAL.fx.brakes;q('v127FxBrake').onchange=e=>CAL.fx.brakes=!!e.target.checked;
 q('v127FxTire').checked=CAL.fx.tires;q('v127FxTire').onchange=e=>CAL.fx.tires=!!e.target.checked;
 q('v125SuspApply')?.addEventListener('click',()=>global.setTimeout(syncAuthoredFromSuspensionUI,0));
 q('v125SuspBaseline')?.addEventListener('click',()=>global.setTimeout(syncAuthoredFromSuspensionUI,0));
}
let lastSim=ORCH.state?.simTimeS||0,uiLast=0;
function scheduler(t){
 let now=Number(ORCH.state?.simTimeS);if(Number.isFinite(now)){if(now<lastSim-1e-6)lastSim=now;let d=now-lastSim;if(d>0){lastSim=now;let dt=Math.min(d,.1),n=Math.max(1,Math.ceil(dt*.5*CAL.thermalHz)),h=dt/n;for(let i=0;i<n;i++)thermalStep(h)}}
 if(t-uiLast>100){uiLast=t;if(['MATERIALS','VOLUMETRICS','SUSPENSION'].includes(activePage()))updateUI()}
 global.requestAnimationFrame(scheduler)
}
function boot(){
 addStyle();addNav();addPages();installFxCanvas();addSuspensionThermalCard();bind();augmentRenderer();publishVolumetrics();
 global.requestAnimationFrame(scheduler);global.requestAnimationFrame(fxLoop);global.__LUCID_V127_READY__=true
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

global.LUCID_THERMAL_MATERIALS={
 version:'V1.27.0',calibration:CAL,state,
 reset,setDamperFeedback:v=>{CAL.damper.enabled=!!v;applyDamperFeedback();return CAL.damper.enabled},
 setFxEnabled:v=>CAL.fx.enabled=!!v,
 enterMaterials:()=>enter('MATERIALS'),enterVolumetrics:()=>enter('VOLUMETRICS'),
 snapshot:()=>deep({calibration:CAL,state,thermalRender:global.__LUCID_THERMAL_RENDER__,volumetrics:global.__LUCID_VOLUMETRIC_THERMAL_INPUT__}),
 development:{
  step:(dt=.025)=>{thermalStep(dt);return deep(state)},
  advanceSeconds:seconds=>{let n=Math.round(clamp(+seconds||0,0,180)*CAL.thermalHz),h=1/CAL.thermalHz;for(let i=0;i<n;i++)thermalStep(h);return deep(state)},
  captureAuthored,syncAuthoredFromSuspensionUI,augmentRenderer,publishVolumetrics
 }
};
})(typeof window!=='undefined'?window:globalThis);

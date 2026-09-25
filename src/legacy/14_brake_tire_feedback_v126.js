
(function(global){
'use strict';
if(global.__LUCID_V126_BRAKE_TIRE_FEEDBACK__)return;
global.__LUCID_V126_BRAKE_TIRE_FEEDBACK__=true;

const D=global.document;
const API=global.DUCATI_V5_API;
const PT=global.DUCATI_ADVANCED_POWERTRAIN;
const PM=global.Ducati916PowertrainModel;
const ORCH=global.LUCID_COMPONENT_ORCHESTRATOR;
if(!D||!API||!PT||!PM||!ORCH){
 console.warn('V1.26 brake/tire feedback: required V5/V1.21/V1.25 APIs unavailable');
 return;
}

const PI=Math.PI,SIGMA=5.670374419e-8,PSI_PA=6894.757293168;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const q=id=>D.getElementById(id);
const deep=o=>JSON.parse(JSON.stringify(o));
const fmt=(v,d=2)=>Number.isFinite(+v)?(+v).toFixed(d):'—';
const activePage=()=>String(global.__LUCID_ACTIVE_PAGE__||D.body?.dataset?.v123Page||'RIDE').toUpperCase();

const CAL={
 schema:'lucid.v126.brake-tire-feedback-calibration.v1',
 authority:{
  brake:'LIVE feedback uses the V1.21 hydraulic geometry and the period FERIT 450 FF nominal friction band. The temperature/pressure/sliding-speed surface is a bounded provisional calibration because no measured Ducati 916 / FERIT 450 response surface is present in the project.',
  tire:'LIVE feedback modifies the existing V5 finite-thickness tire solver by changing its friction cap and reference inflation pressure. Temperature window, wear-energy scale and tread depth are provisional compound calibration parameters, not measured original-tire data.',
  rotorSpatial:'Three radial bands x twelve angular sectors are a reduced-order thermal state. It improves hot-spot/heat-soak behavior without claiming FEA fidelity.',
  wear:'Wear is energy-driven and temperature-weighted. Absolute wear rate is a development calibration until tire/pad/disc-specific dynamometer data are available.'
 },
 brakes:{
  enabled:true,
  nominalMu:.40,
  tempPoints:[[20,.38],[80,.40],[180,.415],[320,.405],[450,.36],[600,.30],[750,.24],[850,.20]],
  pressureSensitivityPer100Bar:-.018,
  speedHighSensitivity:-.018,
  speedLowBoost:.010,
  factorMin:.48,
  factorMax:1.10,
  radialBands:3,
  angularSectors:12,
  radialHeatWeights:[.14,.56,.30],
  radialMassWeights:[.28,.44,.28],
  circumConductionWPerK:22,
  radialConductionWPerK:32,
  hotSpotSpeedRadS:14,
  convBaseWm2K:18,
  convSpeedGainWm2K:8,
  frontDiscMassKg:1.45,
  rearDiscMassKg:.85,
  frontAreaM2:.145,
  rearAreaM2:.072,
  emissivity:.72,
  steelCpJkgK:480,
  padWearReferenceJPerMm:4.2e7,
  rotorWearReferenceJPerMicron:8.0e7,
  tempWearGain:1.8
 },
 tires:{
  enabled:true,
  ribCount:9,
  baselineMuFront:null,
  baselineMuRear:null,
  coldPsiFront:32,
  coldPsiRear:34.8,
  nominalAmbientC:22,
  tempPoints:[[10,.82],[20,.90],[40,.96],[60,.99],[75,1.00],[95,.99],[115,.93],[135,.84],[155,.72]],
  wearGripLossAtEnd:.28,
  criticalWearStart:.78,
  treadDepthMmFront:4.0,
  treadDepthMmRear:4.2,
  wearReferenceJFront:1.6e8,
  wearReferenceJRear:1.9e8,
  frictionHeatToSurface:.90,
  rollingHeatCoeff:0.00022,
  surfaceCapacityJPerKPerRibFront:620,
  surfaceCapacityJPerKPerRibRear:760,
  coreCapacityJPerKPerRibFront:1050,
  coreCapacityJPerKPerRibRear:1250,
  surfaceCoreWPerKRib:7.5,
  lateralConductionWPerK:5.5,
  airCouplingWPerKRib:1.7,
  roadCoolingWPerKRib:2.0,
  convBaseWPerKRib:1.0,
  convSpeedWPerKRib:.18,
  contactSigmaRibs:1.05,
  minGripFactor:.58,
  maxGripFactor:1.03,
  minPressurePsi:18,
  maxPressurePsi:48
 }
};

const state=ORCH.state;
const base={
 frontMu:+API.free?.front?.p?.mu||1.18,
 rearMu:+API.free?.rear?.p?.mu||1.27,
 frontPressurePa:+API.free?.front?.p?.pressurePa||CAL.tires.coldPsiFront*PSI_PA,
 rearPressurePa:+API.free?.rear?.p?.pressurePa||CAL.tires.coldPsiRear*PSI_PA
};
CAL.tires.baselineMuFront=base.frontMu;
CAL.tires.baselineMuRear=base.rearMu;

function interp(points,x){
 if(x<=points[0][0])return points[0][1];
 for(let i=1;i<points.length;i++){
  if(x<=points[i][0]){
   let a=points[i-1],b=points[i],t=(x-a[0])/(b[0]-a[0]);
   return lerp(a[1],b[1],t);
  }
 }
 return points[points.length-1][1];
}

function makeRotor(name,massKg,areaM2,seedC){
 const rb=CAL.brakes.radialBands,ns=CAL.brakes.angularSectors,T=Number.isFinite(seedC)?seedC:state.ambientC;
 return{
  name,massKg,areaM2,phaseRad:0,
  tempC:Array.from({length:rb},()=>Array(ns).fill(T)),
  meanC:T,maxC:T,minC:T,
  padWearMm:0,rotorWearMicron:0,energyJ:0,
  muLive:CAL.brakes.nominalMu,feedbackFactor:1,
  pressureBar:0,slidingSpeedMps:0
 };
}
function makeTire(name,basePsi,baseMu,seed){
 const n=CAL.tires.ribCount,amb=state.ambientC||CAL.tires.nominalAmbientC;
 const surf=seed?.surfaceC??amb,core=seed?.coreC??amb,air=seed?.airC??amb;
 return{
  name,basePsi,baseMu,airC:air,pressurePsi:basePsi,contactRib:(n-1)/2,
  ribs:Array.from({length:n},(_,i)=>({
   i,xNorm:n===1?0:-1+2*i/(n-1),
   surfaceC:surf,coreC:core,wear01:0,energyJ:0,
   treadDepthMm:name==='front'?CAL.tires.treadDepthMmFront:CAL.tires.treadDepthMmRear
  })),
  localSurfaceC:surf,localCoreC:core,localWear01:0,
  gripFactor:interp(CAL.tires.tempPoints,.65*core+.35*surf),
  appliedMu:baseMu,energyJ:0
 };
}

const feedback={
 schema:'lucid.v126.feedback-state.v1',
 brakes:{
  frontL:makeRotor('frontL',CAL.brakes.frontDiscMassKg,CAL.brakes.frontAreaM2,state.brakes.frontL.tempC),
  frontR:makeRotor('frontR',CAL.brakes.frontDiscMassKg,CAL.brakes.frontAreaM2,state.brakes.frontR.tempC),
  rear:makeRotor('rear',CAL.brakes.rearDiscMassKg,CAL.brakes.rearAreaM2,state.brakes.rear.tempC)
 },
 tires:{
  front:makeTire('front',CAL.tires.coldPsiFront,base.frontMu,state.tires.front),
  rear:makeTire('rear',CAL.tires.coldPsiRear,base.rearMu,state.tires.rear)
 },
 lastThermalTimeS:state.simTimeS||0,
 brakeTest:null,tireTest:null,lastVisualPublishS:-1e9,
 feedbackApplied:{frontMu:base.frontMu,rearMu:base.rearMu,frontPsi:CAL.tires.coldPsiFront,rearPsi:CAL.tires.coldPsiRear},
 authority:CAL.authority
};

function thermalMu(tempC,pressureBar,slidingSpeedMps){
 const muT=interp(CAL.brakes.tempPoints,tempC);
 const pf=clamp(1+CAL.brakes.pressureSensitivityPer100Bar*((pressureBar||0)-70)/100,.965,1.035);
 const vf=clamp(1+CAL.brakes.speedLowBoost*Math.exp(-Math.max(0,slidingSpeedMps||0)/4)+CAL.brakes.speedHighSensitivity*clamp(((slidingSpeedMps||0)-18)/32,0,1),.965,1.025);
 return clamp(muT*pf*vf,.16,.46);
}
function brakeFactor(rotor,padTempC,pressureBar,slidingSpeedMps){
 const effectiveT=Math.max(rotor.meanC*.42+(padTempC||rotor.meanC)*.58,rotor.maxC*.72);
 const mu=thermalMu(effectiveT,pressureBar,slidingSpeedMps);
 rotor.muLive=mu;rotor.feedbackFactor=clamp(mu/CAL.brakes.nominalMu,CAL.brakes.factorMin,CAL.brakes.factorMax);
 rotor.pressureBar=pressureBar||0;rotor.slidingSpeedMps=slidingSpeedMps||0;
 return rotor.feedbackFactor;
}

function angularWeights(rotor,omega){
 const n=CAL.brakes.angularSectors;
 if(Math.abs(omega)>=CAL.brakes.hotSpotSpeedRadS)return Array(n).fill(1/n);
 rotor.phaseRad=(rotor.phaseRad+omega*(1/40))%(2*PI);
 const c=((rotor.phaseRad%(2*PI))+2*PI)%(2*PI)/(2*PI)*n;
 let w=[],sum=0;
 for(let j=0;j<n;j++){
  let d=Math.abs(j-c);d=Math.min(d,n-d);
  let a=Math.exp(-.5*(d/.75)**2);w.push(a);sum+=a;
 }
 return w.map(x=>x/Math.max(sum,1e-9));
}
function stepRotor(rotor,powerW,omega,speed,padTempC,dt){
 const C=CAL.brakes,amb=state.ambientC||22,rb=C.radialBands,ns=C.angularSectors;
 const old=rotor.tempC.map(r=>r.slice()),aw=angularWeights(rotor,omega);
 const qDisc=Math.max(0,powerW)*.82;
 let sum=0,max=-1e9,min=1e9,weighted=0,wm=0;
 for(let r=0;r<rb;r++)for(let s=0;s<ns;s++){
  const area=rotor.areaM2*C.radialMassWeights[r]/ns;
  const mass=rotor.massKg*C.radialMassWeights[r]/ns;
  const T=old[r][s],Tk=T+273.15,Ak=amb+273.15;
  const qIn=qDisc*C.radialHeatWeights[r]*aw[s];
  const h=C.convBaseWm2K+C.convSpeedGainWm2K*Math.sqrt(Math.max(0,speed));
  const qConv=h*area*(T-amb);
  const qRad=C.emissivity*SIGMA*area*(Math.pow(Math.max(Tk,1),4)-Math.pow(Math.max(Ak,1),4));
  const sp=old[r][(s+1)%ns],sm=old[r][(s+ns-1)%ns];
  const qCirc=C.circumConductionWPerK*((sp+sm)*.5-T)/ns;
  let qRadial=0;
  if(r>0)qRadial+=C.radialConductionWPerK*(old[r-1][s]-T);
  if(r<rb-1)qRadial+=C.radialConductionWPerK*(old[r+1][s]-T);
  // Pad-to-disc conduction is concentrated in the swept middle/outer bands.
  const padCouple=(r===0?.10:r===1?.55:.35)*18*(padTempC-T)/ns;
  const next=clamp(T+(qIn+qCirc+qRadial+padCouple-qConv-qRad)*dt/Math.max(1,mass*C.steelCpJkgK),amb-20,1100);
  rotor.tempC[r][s]=next;
  sum+=next;max=Math.max(max,next);min=Math.min(min,next);
  weighted+=next*C.radialMassWeights[r];wm+=C.radialMassWeights[r];
 }
 rotor.meanC=sum/(rb*ns);rotor.maxC=max;rotor.minC=min;rotor.energyJ+=Math.max(0,powerW)*dt;
 const wearT=clamp(1+C.tempWearGain*clamp((Math.max(rotor.maxC,padTempC)-250)/500,0,1),1,1+C.tempWearGain);
 rotor.padWearMm+=Math.max(0,powerW)*dt/C.padWearReferenceJPerMm*wearT;
 rotor.rotorWearMicron+=Math.max(0,powerW)*dt/C.rotorWearReferenceJPerMicron*wearT;
}

function contactCenter(side,tire){
 const n=CAL.tires.ribCount;
 let cx=side?.tire?.contact?.centroid?.[0],width=side?.tire?.carcass?.sectionWidthM;
 if(Number.isFinite(cx)&&Number.isFinite(width)&&width>.02){
  return clamp((cx/(width*.5)+1)*.5*(n-1),0,n-1);
 }
 const cam=Number(side?.camberDeg||0);
 return clamp((n-1)/2 + Math.sin(cam*PI/180)*(n-1)*.42,0,n-1);
}
function ribWeights(center){
 const n=CAL.tires.ribCount,s=CAL.tires.contactSigmaRibs,w=[];let sum=0;
 for(let i=0;i<n;i++){let a=Math.exp(-.5*((i-center)/s)**2);w.push(a);sum+=a}
 return w.map(x=>x/Math.max(sum,1e-9));
}
function tireSlipPower(side,M){
 const speed=Math.max(.5,Math.abs(M?.body?.speedMps||0));
 const k=Math.abs(side?.slipRatio||0),a=Math.abs((side?.slipAngleDeg||0)*PI/180);
 return Math.abs(side?.FxN||0)*k*speed + Math.abs(side?.FyN||0)*Math.tan(clamp(a,0,1.1))*speed;
}
function tireGripFactor(tempC,wear){
 let tf=interp(CAL.tires.tempPoints,tempC);
 let wf=1-CAL.tires.wearGripLossAtEnd*Math.pow(clamp(wear,0,1),.82);
 if(wear>CAL.tires.criticalWearStart){
  const u=(wear-CAL.tires.criticalWearStart)/(1-CAL.tires.criticalWearStart);
  wf*=lerp(1,.72,clamp(u,0,1));
 }
 return clamp(tf*wf,CAL.tires.minGripFactor,CAL.tires.maxGripFactor);
}
function stepTire(tire,side,M,dt,front){
 const C=CAL.tires,amb=state.ambientC||22,n=C.ribCount;
 const speed=Math.abs(M?.body?.speedMps||0),load=Math.max(0,side?.loadN||0);
 const slipP=tireSlipPower(side,M),rollP=load*speed*C.rollingHeatCoeff;
 const center=contactCenter(side,tire),weights=ribWeights(center);tire.contactRib=center;
 const oldS=tire.ribs.map(r=>r.surfaceC),oldC=tire.ribs.map(r=>r.coreC);
 const Cs=front?C.surfaceCapacityJPerKPerRibFront:C.surfaceCapacityJPerKPerRibRear;
 const Cc=front?C.coreCapacityJPerKPerRibFront:C.coreCapacityJPerKPerRibRear;
 let avgCore=0;
 for(let i=0;i<n;i++){
  const r=tire.ribs[i],ws=weights[i],qIn=(slipP*C.frictionHeatToSurface+rollP)*ws;
  const qSC=C.surfaceCoreWPerKRib*(oldS[i]-oldC[i]);
  let qLat=0;if(i>0)qLat+=C.lateralConductionWPerK*(oldS[i-1]-oldS[i]);if(i<n-1)qLat+=C.lateralConductionWPerK*(oldS[i+1]-oldS[i]);
  const qRoad=C.roadCoolingWPerKRib*ws*(oldS[i]-amb);
  const qConv=(C.convBaseWPerKRib+C.convSpeedWPerKRib*Math.sqrt(speed))*(oldS[i]-amb);
  const nextS=clamp(oldS[i]+(qIn-qSC+qLat-qRoad-qConv)*dt/Cs,amb-20,190);
  let qCoreLat=0;if(i>0)qCoreLat+=C.lateralConductionWPerK*.35*(oldC[i-1]-oldC[i]);if(i<n-1)qCoreLat+=C.lateralConductionWPerK*.35*(oldC[i+1]-oldC[i]);
  const qAir=C.airCouplingWPerKRib*(oldC[i]-tire.airC);
  const nextC=clamp(oldC[i]+(qSC+qCoreLat-qAir)*dt/Cc,amb-20,170);
  r.surfaceC=nextS;r.coreC=nextC;
  const wearRef=front?C.wearReferenceJFront:C.wearReferenceJRear;
  const tempWear=clamp(.65+Math.max(0,nextS-55)/70,.55,2.8);
  const e=Math.max(0,slipP)*ws*dt;r.energyJ+=e;tire.energyJ+=e;
  r.wear01=clamp(r.wear01+e/wearRef*tempWear,0,1);
  const baseDepth=front?C.treadDepthMmFront:C.treadDepthMmRear;
  r.treadDepthMm=baseDepth*(1-r.wear01);
  avgCore+=nextC/n;
 }
 const airCap=front?180:210;
 const qAirIn=C.airCouplingWPerKRib*n*(avgCore-tire.airC),qAirOut=1.2*(tire.airC-amb);
 tire.airC=clamp(tire.airC+(qAirIn-qAirOut)*dt/airCap,amb-20,155);
 tire.pressurePsi=clamp(tire.basePsi*(tire.airC+273.15)/(C.nominalAmbientC+273.15),C.minPressurePsi,C.maxPressurePsi);
 let ws=ribWeights(center),ls=0,lc=0,lw=0;
 for(let i=0;i<n;i++){ls+=tire.ribs[i].surfaceC*ws[i];lc+=tire.ribs[i].coreC*ws[i];lw+=tire.ribs[i].wear01*ws[i]}
 tire.localSurfaceC=ls;tire.localCoreC=lc;tire.localWear01=lw;
 const effectiveT=.35*ls+.65*lc;
 tire.gripFactor=tireGripFactor(effectiveT,lw);
 tire.appliedMu=tire.baseMu*tire.gripFactor;
}

function updateLiveTireAuthority(){
 const F=API.free,fr=feedback.tires.front,rr=feedback.tires.rear;
 if(!F?.front?.p||!F?.rear?.p)return;
 if(CAL.tires.enabled){
  F.front.p.mu=fr.appliedMu;F.rear.p.mu=rr.appliedMu;
  F.front.p.pressurePa=fr.pressurePsi*PSI_PA;F.rear.p.pressurePa=rr.pressurePsi*PSI_PA;
 }else{
  F.front.p.mu=base.frontMu;F.rear.p.mu=base.rearMu;
  F.front.p.pressurePa=base.frontPressurePa;F.rear.p.pressurePa=base.rearPressurePa;
 }
 feedback.feedbackApplied.frontMu=F.front.p.mu;feedback.feedbackApplied.rearMu=F.rear.p.mu;
 feedback.feedbackApplied.frontPsi=F.front.p.pressurePa/PSI_PA;feedback.feedbackApplied.rearPsi=F.rear.p.pressurePa/PSI_PA;
}

function brakeFeedbackFor(side,input,p){
 const B=feedback.brakes;
 if(side==='front'){
  const omega=Math.abs(input?.omegaF||0),re=p?.brakes?.active100Bar?.frontEffectiveRadiusM||.14354;
  const bar=p?.brakes?.appliedFrontBar||0,slide=omega*re;
  const pad=(state.brakes.frontL.padTempC+state.brakes.frontR.padTempC)*.5;
  const f1=brakeFactor(B.frontL,pad,bar,slide),f2=brakeFactor(B.frontR,pad,bar,slide);
  return (f1+f2)*.5;
 }
 const omega=Math.abs(input?.omegaR||0),re=p?.brakes?.active100Bar?.rearEffectiveRadiusM||.0936;
 return brakeFactor(B.rear,state.brakes.rear.padTempC,p?.brakes?.appliedRearBar||0,omega*re);
}

// Patch V1.21 brake output after ABS modulation but before V5 consumes wheel brake torque.
const basePowertrainStep=PM.stepState;
PM.stepState=function(st,input){
 const p=basePowertrainStep.call(PM,st,input);
 if(!p?.brakes)return p;
 const fF=CAL.brakes.enabled?brakeFeedbackFor('front',input,p):1;
 const fR=CAL.brakes.enabled?brakeFeedbackFor('rear',input,p):1;
 const b=p.brakes,base100=b.active100Bar||{};
 b.thermalFeedbackEnabled=!!CAL.brakes.enabled;
 b.thermalFactorFront=fF;b.thermalFactorRear=fR;
 b.thermalMuFront=feedback.brakes.frontL.muLive*.5+feedback.brakes.frontR.muLive*.5;
 b.thermalMuRear=feedback.brakes.rear.muLive;
 b.frontTorqueNm*=fF;b.rearTorqueNm*=fR;b.frontPowerKw*=fF;b.rearPowerKw*=fR;
 b.active100Bar=Object.assign({},base100,{
  frontNm:(base100.frontNm??base100.frontNmAt100Bar??0)*fF,
  rearNm:(base100.rearNm??base100.rearNmAt100Bar??0)*fR,
  padMuFront:b.thermalMuFront,padMuRear:b.thermalMuRear,
  thermalFactorFront:fF,thermalFactorRear:fR
 });
 // st.last references the same object returned by the base step, so the live ledger is coherent.
 return p;
};

function augmentRendererBridge(){
 const bridge=global.__LUCID_THERMAL_RENDER__;if(!bridge?.nodes)return;
 const B=feedback.brakes;
 const toNode=(r,eps=.72)=>{
  const temp=r.maxC,vis=Math.pow(clamp((temp-430)/520,0,1.4),1.45),K=clamp(temp+273.15,1000,40000),t=K/100;
  let R,G,Bl;if(t<=66){R=255;G=99.4708025861*Math.log(t)-161.1195681661}else{R=329.698727446*Math.pow(t-60,-.1332047592);G=288.1221695283*Math.pow(t-60,-.0755148492)}
  if(t>=66)Bl=255;else if(t<=19)Bl=0;else Bl=138.5177312231*Math.log(t-10)-305.0447927307;
  let rgb=[clamp(R,0,255)/255,clamp(G,0,255)/255,clamp(Bl,0,255)/255],rad=eps*Math.pow((temp+273.15)/1100,4);
  return{tempC:r.meanC,maxTempC:r.maxC,emissionRGB:rgb,emissionStrength:vis*rad*2.8,spatialBands:r.tempC.map(x=>x.slice()),source:'V1.26 3x12 rotor thermal state'};
 };
 bridge.schema='lucid.v126.thermal-render-bridge.v2';
 bridge.nodes[127]=toNode(B.frontL);bridge.nodes[128]=toNode(B.frontR);bridge.nodes[147]=toNode(B.rear);
}

function publishVisuals(){
 const tf=feedback.tires.front,tr=feedback.tires.rear;
 function tireVisual(t){
  const wear=t.localWear01,hot=clamp((t.localSurfaceC-45)/85,0,1),baseV=.070+wear*.018-hot*.006;
  return{
   colorRGB:[baseV*.96,baseV,baseV*1.03],
   roughness:clamp(.84-wear*.16-hot*.05,.60,.90),
   treadScale:clamp(1-wear,0,1),
   localWear01:wear,temperatureC:t.localSurfaceC,
   ribs:t.ribs.map(r=>({xNorm:r.xNorm,wear01:r.wear01,treadDepthMm:r.treadDepthMm,surfaceC:r.surfaceC,coreC:r.coreC}))
  };
 }
 global.__LUCID_TIRE_VISUAL__={schema:'lucid.v126.tire-visual-input.v1',front:tireVisual(tf),rear:tireVisual(tr)};
 const vol=global.__LUCID_VOLUMETRIC_THERMAL_INPUT__;
 if(vol){
  vol.schema='lucid.v126.volumetric-thermal-input.v2';
  vol.frontTireSmokePotential01=clamp((tf.localSurfaceC-90)/60,0,1)*clamp(Math.abs(API.free?.last?.front?.slipRatio||0)*2.4,0,1)*(1+.35*tf.localWear01);
  vol.rearTireSmokePotential01=clamp((tr.localSurfaceC-90)/60,0,1)*clamp(Math.abs(API.free?.last?.rear?.slipRatio||0)*2.4,0,1)*(1+.35*tr.localWear01);
  vol.frontRotorMaxC=feedback.brakes.frontL.maxC;
  vol.rearRotorMaxC=feedback.brakes.rear.maxC;
 }
 augmentRendererBridge();
}

function stepSpatial(dt){
 const M=API.free?.last,P=PT.states?.free?.last;if(!M||!P)return;
 const speed=Math.abs(M.body?.speedMps||0),omegaF=Math.abs(M.wheels?.omegaF||0),omegaR=Math.abs(M.wheels?.omegaR||0);
 const pf=Math.max(0,(P.brakes?.frontPowerKw||0)*1000),pr=Math.max(0,(P.brakes?.rearPowerKw||0)*1000);
 stepRotor(feedback.brakes.frontL,pf*.5,omegaF,speed,state.brakes.frontL.padTempC,dt);
 stepRotor(feedback.brakes.frontR,pf*.5,omegaF,speed,state.brakes.frontR.padTempC,dt);
 stepRotor(feedback.brakes.rear,pr,omegaR,speed,state.brakes.rear.padTempC,dt);
 stepTire(feedback.tires.front,M.front,M,dt,true);
 stepTire(feedback.tires.rear,M.rear,M,dt,false);
 updateLiveTireAuthority();
 const visualPeriod=activePage()==='RIDE'?.08:.04;
 if((state.simTimeS||0)-feedback.lastVisualPublishS>=visualPeriod){feedback.lastVisualPublishS=state.simTimeS||0;publishVisuals()}
}

function resetFeedback(){
 const amb=state.ambientC||22;
 feedback.brakes.frontL=makeRotor('frontL',CAL.brakes.frontDiscMassKg,CAL.brakes.frontAreaM2,amb);
 feedback.brakes.frontR=makeRotor('frontR',CAL.brakes.frontDiscMassKg,CAL.brakes.frontAreaM2,amb);
 feedback.brakes.rear=makeRotor('rear',CAL.brakes.rearDiscMassKg,CAL.brakes.rearAreaM2,amb);
 feedback.tires.front=makeTire('front',CAL.tires.coldPsiFront,base.frontMu,{surfaceC:amb,coreC:amb,airC:amb});
 feedback.tires.rear=makeTire('rear',CAL.tires.coldPsiRear,base.rearMu,{surfaceC:amb,coreC:amb,airC:amb});
 feedback.lastThermalTimeS=state.simTimeS||0;feedback.brakeTest=null;feedback.tireTest=null;feedback.lastVisualPublishS=-1e9;
 updateLiveTireAuthority();publishVisuals();return feedback;
}
const baseResetThermal=ORCH.resetThermal;
ORCH.resetThermal=function(){let r=baseResetThermal.apply(ORCH,arguments);resetFeedback();return r};

function modelBrakeStopTest(){
 const amb=state.ambientC||22,r=makeRotor('test',CAL.brakes.frontDiscMassKg,CAL.brakes.frontAreaM2,amb),rows=[];
 const dt=.025;
 for(let stop=0;stop<8;stop++){
  for(let t=0;t<5;t+=dt){
   const active=t<2.3,p=active?43000*(1-t/5):0,omega=active?130*(1-t/2.8):0,speed=Math.max(0,omega*.30);
   stepRotor(r,p,omega,speed,lerp(amb,520,clamp(stop/7,0,1)),dt);
   const bar=active?70:0,mu=thermalMu(Math.max(r.maxC,amb),bar,Math.abs(omega)*.14354);
   if(Math.round((stop*5+t)/.1)!==Math.round((stop*5+t-dt)/.1))rows.push({t:stop*5+t,temp:r.maxC,mu});
  }
 }
 feedback.brakeTest={schema:'lucid.v126.brake-stop-rig.v1',rows,summary:{peakTempC:r.maxC,finalMu:thermalMu(r.maxC,70,18),padWearMm:r.padWearMm,rotorWearMicron:r.rotorWearMicron}};
 drawBrakeRig();return deep(feedback.brakeTest);
}
function modelTireHeatTest(){
 const amb=state.ambientC||22,t=makeTire('rear',CAL.tires.coldPsiRear,base.rearMu,{surfaceC:amb,coreC:amb,airC:amb}),rows=[];
 const fakeM={body:{speedMps:25}},side={loadN:1500,FxN:420,FyN:900,slipRatio:.08,slipAngleDeg:3.2,camberDeg:38,tire:{contact:{centroid:[.065,0]},carcass:{sectionWidthM:.180}}};
 const dt=.025;
 for(let s=0;s<80;s+=dt){
  if(s>45){side.slipRatio=.16;side.FxN=700}
  stepTire(t,side,fakeM,dt,false);
  if(Math.round(s/.1)!==Math.round((s-dt)/.1))rows.push({t:s,surface:t.localSurfaceC,core:t.localCoreC,air:t.airC,psi:t.pressurePsi,grip:t.gripFactor,wear:t.localWear01});
 }
 feedback.tireTest={schema:'lucid.v126.tire-thermal-rig.v1',rows,summary:{surfaceC:t.localSurfaceC,coreC:t.localCoreC,airC:t.airC,pressurePsi:t.pressurePsi,gripFactor:t.gripFactor,localWear01:t.localWear01}};
 drawTireRig();return deep(feedback.tireTest);
}

let lastSpatial=state.simTimeS||0;
function scheduler(){
 const now=Number(state.simTimeS);
 if(Number.isFinite(now)){
  if(now<lastSpatial-1e-6)lastSpatial=now;
  let d=now-lastSpatial;
  if(d>0){
   lastSpatial=now;
   let dt=Math.min(d,.1),n=Math.max(1,Math.ceil(dt/.025)),h=dt/n;
   for(let i=0;i<n;i++)stepSpatial(h);
  }
 }
 global.requestAnimationFrame(scheduler);
}

function curveCanvas(c,series,minY,maxY){
 if(!c)return;let x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle='#050b0f';x.fillRect(0,0,w,h);
 x.strokeStyle='#1b3440';x.lineWidth=1;for(let i=1;i<5;i++){x.beginPath();x.moveTo(0,h*i/5);x.lineTo(w,h*i/5);x.stroke()}
 series.forEach((s,k)=>{x.strokeStyle=s.color||['#6fdcff','#ffc66c','#78efb1'][k%3];x.lineWidth=2;x.beginPath();s.data.forEach((p,i)=>{let xx=i/(s.data.length-1||1)*w,yy=h-8-(p-minY)/(maxY-minY)*(h-18);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()});
}
function drawBrakeCurve(){
 const a=[];for(let t=20;t<=850;t+=5)a.push(thermalMu(t,70,18));
 curveCanvas(q('v126BrakeCurve'),[{data:a,color:'#ffc66c'}],.15,.46);
}
function drawRotorMap(canvas,rotor){
 if(!canvas)return;let x=canvas.getContext('2d'),w=canvas.width,h=canvas.height,rb=CAL.brakes.radialBands,ns=CAL.brakes.angularSectors;
 x.clearRect(0,0,w,h);x.fillStyle='#050b0f';x.fillRect(0,0,w,h);
 for(let r=0;r<rb;r++)for(let s=0;s<ns;s++){
  let T=rotor.tempC[r][s],u=clamp((T-20)/800,0,1),R=Math.round(255*clamp(u*1.5,0,1)),G=Math.round(255*clamp((u-.18)*1.5,0,.75)),B=Math.round(100*clamp((u-.55)*2,0,1));
  x.fillStyle=`rgb(${R},${G},${B})`;x.fillRect(s*w/ns,r*h/rb,w/ns-1,h/rb-1);
 }
 x.fillStyle='#d8eef6';x.font='11px ui-monospace';x.fillText(`mean ${fmt(rotor.meanC,0)}°C · max ${fmt(rotor.maxC,0)}°C`,8,14);
}
function drawTireRibs(canvas,tire){
 if(!canvas)return;let x=canvas.getContext('2d'),w=canvas.width,h=canvas.height,n=tire.ribs.length;x.clearRect(0,0,w,h);x.fillStyle='#050b0f';x.fillRect(0,0,w,h);
 tire.ribs.forEach((r,i)=>{let u=clamp((r.surfaceC-20)/130,0,1),wear=r.wear01;
  x.fillStyle=`rgb(${Math.round(40+210*u)},${Math.round(105+90*u)},${Math.round(135-80*u)})`;x.fillRect(i*w/n,0,w/n-2,h*.62);
  x.fillStyle='#243641';x.fillRect(i*w/n,h*.67,w/n-2,h*.23);x.fillStyle='#8fe7ff';x.fillRect(i*w/n,h*.67,w/n-2,h*.23*(1-wear));
  x.fillStyle='#dceff5';x.font='9px ui-monospace';x.fillText(fmt(r.surfaceC,0)+'°',i*w/n+3,14);
 });
 x.strokeStyle='#fff';x.lineWidth=2;let cx=(tire.contactRib+.5)*w/n;x.beginPath();x.moveTo(cx,0);x.lineTo(cx,h);x.stroke();
}
function drawBrakeRig(){
 const T=feedback.brakeTest;if(!T)return;curveCanvas(q('v126BrakeRig'),[
  {data:T.rows.map(r=>r.temp/900),color:'#ff735f'},
  {data:T.rows.map(r=>r.mu),color:'#6fdcff'}
 ],0,1);
 const e=q('v126BrakeRigText');if(e)e.textContent=`8-stop reduced-order rig · peak rotor ${fmt(T.summary.peakTempC,0)} °C · final μ ${fmt(T.summary.finalMu,3)} · pad wear ${fmt(T.summary.padWearMm,4)} mm`;
}
function drawTireRig(){
 const T=feedback.tireTest;if(!T)return;curveCanvas(q('v126TireRig'),[
  {data:T.rows.map(r=>r.surface/180),color:'#ff735f'},
  {data:T.rows.map(r=>r.core/180),color:'#ffc66c'},
  {data:T.rows.map(r=>r.grip),color:'#6fdcff'}
 ],0,1.1);
 const e=q('v126TireRigText');if(e)e.textContent=`80 s leaned thermal rig · surface/core ${fmt(T.summary.surfaceC,1)} / ${fmt(T.summary.coreC,1)} °C · hot pressure ${fmt(T.summary.pressurePsi,2)} psi · grip factor ${fmt(T.summary.gripFactor,3)}`;
}

function updateUI(){
 const page=activePage();
 if(page==='BRAKES'){
  const B=feedback.brakes;
  const tf=(B.frontL.feedbackFactor+B.frontR.feedbackFactor)*.5;
  const s=q('v126BrakeLive');if(s)s.innerHTML=[
   ['feedback authority',CAL.brakes.enabled?'LIVE':'BYPASS'],
   ['front thermal μ',fmt((B.frontL.muLive+B.frontR.muLive)*.5,3)],
   ['rear thermal μ',fmt(B.rear.muLive,3)],
   ['front torque factor',fmt(tf,3)+' ×'],
   ['rear torque factor',fmt(B.rear.feedbackFactor,3)+' ×'],
   ['front rotor max',fmt(Math.max(B.frontL.maxC,B.frontR.maxC),1)+' °C'],
   ['front pad wear',fmt((B.frontL.padWearMm+B.frontR.padWearMm)*.5,5)+' mm'],
   ['rear rotor wear',fmt(B.rear.rotorWearMicron,4)+' μm']
  ].map(r=>`<span>${r[0]}</span><b>${r[1]}</b>`).join('');
  drawRotorMap(q('v126RotorMap'),B.frontL);
  const old=q('v125BrakeCoupling');if(old){old.classList.toggle('v125Warn',!CAL.brakes.enabled);old.classList.toggle('v125Good',CAL.brakes.enabled);old.textContent=CAL.brakes.enabled?'V1.26 LIVE — rotor/pad thermal state now scales the V1.21 hydraulic torque after ABS modulation; next-step ABS response sees the changed wheel torque.':'V1.26 BYPASS — V1.21 nominal hydraulic torque restored.'}
 }else if(page==='TIRES'||page==='WEAR'){
  const F=feedback.tires.front,R=feedback.tires.rear;
  const live=q('v126TireLive');if(live)live.innerHTML=[
   ['feedback authority',CAL.tires.enabled?'LIVE':'BYPASS'],
   ['front μ applied',fmt(F.appliedMu,3)],
   ['rear μ applied',fmt(R.appliedMu,3)],
   ['front hot pressure',fmt(F.pressurePsi,2)+' psi'],
   ['rear hot pressure',fmt(R.pressurePsi,2)+' psi'],
   ['front local grip',fmt(F.gripFactor,3)+' ×'],
   ['rear local grip',fmt(R.gripFactor,3)+' ×'],
   ['front contact rib',fmt(F.contactRib,2)],
   ['rear contact rib',fmt(R.contactRib,2)]
  ].map(r=>`<span>${r[0]}</span><b>${r[1]}</b>`).join('');
  drawTireRibs(q('v126TireRibsF'),F);drawTireRibs(q('v126TireRibsR'),R);
  if(page==='WEAR'){
   const w=q('v126WearLive');if(w)w.innerHTML=[
    ['front max wear',fmt(Math.max(...F.ribs.map(r=>r.wear01))*100,4)+' %'],
    ['front minimum tread',fmt(Math.min(...F.ribs.map(r=>r.treadDepthMm)),3)+' mm'],
    ['rear max wear',fmt(Math.max(...R.ribs.map(r=>r.wear01))*100,4)+' %'],
    ['rear minimum tread',fmt(Math.min(...R.ribs.map(r=>r.treadDepthMm)),3)+' mm'],
    ['front slip energy',fmt(F.energyJ/1000,1)+' kJ'],
    ['rear slip energy',fmt(R.energyJ/1000,1)+' kJ']
   ].map(r=>`<span>${r[0]}</span><b>${r[1]}</b>`).join('');
  }
 }
}

function addStyle(){
 const s=D.createElement('style');s.textContent=`
body.v123 #v123Brand strong:after{content:" · V1.26 FEEDBACK"!important;color:#70dffb;font-weight:500}
body[data-v123-page="WEAR"] #app{grid-template-columns:minmax(0,1fr) min(680px,50vw);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="WEAR"] #view{grid-column:1;grid-row:1}
body[data-v123-page="WEAR"] #ctrl,body[data-v123-page="WEAR"] #bottom,body[data-v123-page="WEAR"] #v123EngineDock,body[data-v123-page="WEAR"] #v123SoundDock{display:none!important}
body[data-v123-page="WEAR"] #v125LabDock{display:block}
.v126Card{background:#09151d;border:1px solid #2b4855;border-radius:7px;padding:9px;min-width:0}
.v126Card h3{margin:0 0 7px;font-size:10px;letter-spacing:.09em;color:#8fe7ff}
.v126Canvas{width:100%;height:170px;background:#050b0f;border:1px solid #1f3540;border-radius:5px;display:block}
.v126Toggle{display:flex;align-items:center;gap:8px;font:9px ui-monospace;color:#a7c0cb;margin:6px 0}
.v126Toggle input{accent-color:#70dffb}
.v126Grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.v126Badge{display:inline-block;border:1px solid #3a6372;border-radius:10px;padding:2px 7px;font:9px ui-monospace;color:#8fe7ff}
@media(max-width:900px){.v126Grid2{grid-template-columns:1fr}}
`;D.head.appendChild(s);
}

function addCards(){
 const brakeGrid=D.querySelector('.v125Page[data-v125-page="BRAKES"] .v125Grid');
 if(brakeGrid&&!q('v126BrakeLive')){
  const c=D.createElement('div');c.className='v125Card full';c.innerHTML=`
   <h3>V1.26 LIVE FRICTION AUTHORITY</h3>
   <label class="v126Toggle"><input id="v126BrakeEnable" type="checkbox"> apply μ(T, pressure, sliding-speed) to hydraulic torque</label>
   <div id="v126BrakeLive" class="v125KV"></div>
   <canvas id="v126BrakeCurve" class="v126Canvas" width="900" height="210"></canvas>
   <div class="v125Note">Normal operating μ remains centered on the FERIT 450 FF nominal 0.40 seed. High-temperature fade outside the FF test band is provisional and editable in the calibration file.</div>`;
  brakeGrid.appendChild(c);
  const z=D.createElement('div');z.className='v125Card full';z.innerHTML=`<h3>3 × 12 ROTOR THERMAL MAP</h3><canvas id="v126RotorMap" class="v126Canvas" width="900" height="210"></canvas><div class="v125Note">At wheel speed the input is circumferentially smeared; at very low speed the current pad sector can form a localized hot region. The GL renderer still consumes a rotor-level temperature/emission value; the full zonal shader is staged for the volumetric/material renderer phase.</div>`;brakeGrid.appendChild(z);
  const t=D.createElement('div');t.className='v125Card full';t.innerHTML=`<h3>REPEATED-STOP DEVELOPMENT RIG</h3><div class="v125Btns"><button id="v126RunBrakeRig">RUN 8-STOP THERMAL RIG</button></div><canvas id="v126BrakeRig" class="v126Canvas" width="900" height="210"></canvas><div id="v126BrakeRigText" class="v125Note">Run the reduced-order rig to exercise heat soak, fade and wear without disturbing the live ride state.</div>`;brakeGrid.appendChild(t);
  q('v126BrakeEnable').checked=CAL.brakes.enabled;q('v126BrakeEnable').onchange=e=>CAL.brakes.enabled=!!e.target.checked;
  q('v126RunBrakeRig').onclick=modelBrakeStopTest;drawBrakeCurve();
 }
 const tireGrid=D.querySelector('.v125Page[data-v125-page="TIRES"] .v125Grid');
 if(tireGrid&&!q('v126TireLive')){
  const c=D.createElement('div');c.className='v125Card full';c.innerHTML=`
   <h3>V1.26 LIVE FINITE-THICKNESS COUPLING</h3>
   <label class="v126Toggle"><input id="v126TireEnable" type="checkbox"> apply local temperature/wear grip + hot inflation pressure</label>
   <div id="v126TireLive" class="v125KV"></div>
   <div class="v125Note">The grip factor changes the existing solver's p.mu friction cap; hot pressure changes its existing p.pressurePa reference. Tire carcass/contact equations themselves remain V5.</div>`;tireGrid.appendChild(c);
  const r=D.createElement('div');r.className='v125Card full';r.innerHTML=`<h3>9-RIB LOCAL THERMAL / WEAR STATE</h3><div class="v126Grid2"><canvas id="v126TireRibsF" class="v126Canvas" width="430" height="180"></canvas><canvas id="v126TireRibsR" class="v126Canvas" width="430" height="180"></canvas></div><div class="v125Note">The white marker is the current contact-rib center derived from the V5 contact-patch centroid (camber fallback only when centroid data are unavailable).</div>`;tireGrid.appendChild(r);
  const t=D.createElement('div');t.className='v125Card full';t.innerHTML=`<h3>LEANED TIRE THERMAL RIG</h3><div class="v125Btns"><button id="v126RunTireRig">RUN 80 s HEAT / WEAR RIG</button></div><canvas id="v126TireRig" class="v126Canvas" width="900" height="210"></canvas><div id="v126TireRigText" class="v125Note">Run the model-only rig to exercise local shoulder heating, hot pressure and grip-window behavior.</div>`;tireGrid.appendChild(t);
  q('v126TireEnable').checked=CAL.tires.enabled;q('v126TireEnable').onchange=e=>{CAL.tires.enabled=!!e.target.checked;updateLiveTireAuthority()};
  q('v126RunTireRig').onclick=modelTireHeatTest;
  const old=tireGrid.querySelector('.v125Note.v125Warn');if(old){old.classList.remove('v125Warn');old.classList.add('v125Good');old.textContent='V1.26 LIVE — tire thermal pressure and local temperature/wear grip now feed the existing finite-thickness V5 tire solver. Use the checkbox above for immediate A/B bypass.'}
 }
}

function addWearPage(){
 const nav=q('v123Nav');
 if(nav&&!nav.querySelector('[data-v123-page="WEAR"]')){
  const b=D.createElement('button');b.className='v125Nav';b.dataset.v123Page='WEAR';b.textContent='WEAR';b.onclick=e=>{e.preventDefault();e.stopPropagation();enterWear()};nav.appendChild(b);
 }
 const dock=q('v125LabDock');
 if(dock&&!dock.querySelector('[data-v125-page="WEAR"]')){
  const p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='WEAR';p.innerHTML=`
   <div class="v125Head"><h2>TIRE WEAR / COMPOUND LIFE</h2><p>Spatial tread-consumption state layered around the current finite-thickness tire. Wear follows local slip energy and temperature rather than distance alone.</p></div>
   <div class="v125Grid">
    <div class="v125Card"><h3>LIVE WEAR STATE</h3><div id="v126WearLive" class="v125KV"></div></div>
    <div class="v125Card"><h3>AUTHORITY</h3><div class="v125Note v125Good">LIVE — local wear modifies the tire friction cap. Tread-depth geometry displacement is not yet applied to the GL mesh; material roughness/color receives a lightweight wear bridge.</div></div>
    <div class="v125Card full"><h3>FRONT / REAR TREAD RIBS</h3><div class="v126Grid2"><canvas id="v126WearF" class="v126Canvas" width="430" height="190"></canvas><canvas id="v126WearR" class="v126Canvas" width="430" height="190"></canvas></div></div>
    <div class="v125Card full"><h3>WEAR MODEL BOUNDARY</h3><div class="v125Note">V1.26 uses dissipated slip energy × local thermal severity. Absolute life in kilometers/laps is intentionally not claimed until a tire-specific calibration is supplied. Remaining tread depth is therefore a development state, not an homologation estimate.</div></div>
   </div>`;
  dock.appendChild(p);
 }
}
function enterWear(){
 ORCH.enterPage?.('TIRES');
 D.body.dataset.v123Page='WEAR';global.__LUCID_ACTIVE_PAGE__='WEAR';global.__LUCID_PERF_MODE__='LAB';
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page==='WEAR'));
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page==='WEAR'));
 const title=q('v123PageTitle');if(title){title.querySelector('strong').textContent='TIRE WEAR LAB';title.querySelector('span').textContent='local tread energy · shoulder wear · compound life · grip coupling'}
 q('v123Domain')&&(q('v123Domain').textContent='FREE_ROAD · WEAR');
}
function updateWearCanvases(){
 if(activePage()!=='WEAR')return;
 const copy=(from,to)=>{let a=q(from),b=q(to);if(!a||!b)return;drawTireRibs(b,from.endsWith('F')?feedback.tires.front:feedback.tires.rear)};
 copy('v126TireRibsF','v126WearF');copy('v126TireRibsR','v126WearR');
}

let uiLast=0;
function uiLoop(t){
 if(t-uiLast>100){uiLast=t;if(['BRAKES','TIRES','WEAR'].includes(activePage())){updateUI();updateWearCanvases()}}
 global.requestAnimationFrame(uiLoop);
}

function boot(){
 addStyle();addCards();addWearPage();resetFeedback();
 if(q('v125ThermalReset'))q('v125ThermalReset').onclick=()=>{ORCH.resetThermal();resetFeedback()};
 global.requestAnimationFrame(scheduler);global.requestAnimationFrame(uiLoop);
 global.__LUCID_V126_READY__=true;
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

global.LUCID_BRAKE_TIRE_FEEDBACK={
 version:'V1.26.0',
 calibration:CAL,state:feedback,baseline:base,
 setBrakeFeedback:v=>{CAL.brakes.enabled=!!v;return CAL.brakes.enabled},
 setTireFeedback:v=>{CAL.tires.enabled=!!v;updateLiveTireAuthority();return CAL.tires.enabled},
 reset:resetFeedback,
 brakeMu:(T,bar,v)=>thermalMu(T,bar,v),
 tireGrip:(T,wear)=>tireGripFactor(T,wear),
 runBrakeRig:modelBrakeStopTest,runTireRig:modelTireHeatTest,
 enterWear,
 snapshot:()=>deep({calibration:CAL,state:feedback,applied:feedback.feedbackApplied}),
 development:{
  stepSpatial,
  setRotorTemperature:(name,tempC)=>{let r=feedback.brakes[name];if(!r)return false;r.tempC.forEach(row=>row.fill(+tempC));r.meanC=r.maxC=r.minC=+tempC;return true},
  setTireRibState:(name,i,p={})=>{let t=feedback.tires[name],r=t?.ribs?.[i];if(!r)return false;Object.assign(r,p);return true},
  applyNow:()=>{updateLiveTireAuthority();publishVisuals();return deep(feedback.feedbackApplied)}
 }
};
})(typeof window!=='undefined'?window:globalThis);


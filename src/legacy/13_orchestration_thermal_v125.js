

(function(global){
'use strict';
if(global.__LUCID_V125_ORCHESTRATION__) return;
global.__LUCID_V125_ORCHESTRATION__=true;

const D=global.document;
const API=global.DUCATI_V5_API;
const PT=global.DUCATI_ADVANCED_POWERTRAIN;
const SOUND=global.DUCATI_SOUND_STUDIO;
if(!D||!API||!PT){ console.warn('V1.25 orchestration: required V5/V1.21 APIs unavailable'); return; }

const PI=Math.PI, SIGMA=5.670374419e-8;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const q=id=>D.getElementById(id);
const fmt=(v,d=1)=>Number.isFinite(+v)?(+v).toFixed(d):'—';
const deep=o=>JSON.parse(JSON.stringify(o));
const activePage=()=>String(global.__LUCID_ACTIVE_PAGE__||D.body?.dataset?.v123Page||'RIDE').toUpperCase();

const AUTHORITY={
 schema:'lucid.v125.authority.v1',
 suspension:'V5.3 free-road suspension equations and geometry are authoritative. V1.25 exposes/tunes their existing coefficients rather than replacing the solver.',
 exhaustThermal:'Reduced-order quasi-1D gas/wall energy network. Geometry is seeded from the V1.22 acoustic path proxies and GLB semantic exhaust nodes; thermal coefficients and wall thickness are provisional calibration inputs.',
 brakeThermal:'Brake heating uses V1.21 applied hydraulic brake torque/power. Rotor/pad masses, heat split, convection and fade curve are provisional until measured component data are supplied.',
 tireThermal:'Real-time multi-node thermal/wear shadow model driven by V5 slip work proxies. No V1.25 grip or pressure feedback is applied to the tire solver.',
 renderer:'Temperature-derived blackbody-style emission proxy. It is physically monotonic with absolute temperature but not a calibrated luminance/colorimetry model.',
 sound:'Exhaust gas temperature can automatically follow the thermal network. This changes the V1.22 acoustic propagation/resonance model; it does not feed acoustic resonance back into engine torque.',
 volumetrics:'V1.25 publishes a thermal/plume bridge object only. No volumetric renderer is present in the current V1.24 standalone, so no smoke/heat-haze visual is falsely claimed.'
};

const cfg={
 ambientC:22,
 thermalHz:40,
 uiHz:15,
 historyHz:10,
 soundBridgeHz:4,
 soundThermalAuto:true,
 rendererGlow:true,
 historyMax:1200,
 exhaust:{
  wallThicknessM:.0010,
  steelDensity:7900,
  steelCp:500,
  steelK:16,
  gasCp:1100,
  emissivityFresh:.28,
  emissivityOxidized:.68,
  internalHBase:55,
  internalHFlowGain:250,
  externalHBase:8,
  externalHSpeedGain:4.5,
  headerA:{lengthM:.88,diameterM:.045,cells:8},
  headerB:{lengthM:1.25,diameterM:.045,cells:10},
  collector:{lengthM:.31,diameterM:.050,cells:4},
  mufflerA:{lengthM:.49403,diameterM:.1466,cells:6,wallThicknessM:.0009},
  mufflerB:{lengthM:.49403,diameterM:.1466,cells:6,wallThicknessM:.0009}
 },
 brakes:{
  steelCp:480,
  emissivity:.72,
  heatToDisc:.82,
  padCp:900,
  padToDiscCouplingWPerK:14,
  frontDiscMassKg:1.45,
  rearDiscMassKg:.85,
  frontDiscAreaM2:.145,
  rearDiscAreaM2:.072,
  frontPadMassKg:.16,
  rearPadMassKg:.11
 },
 tires:{
  treadHeatCapacityJPerKFront:5200,
  treadHeatCapacityJPerKRear:6400,
  coreHeatCapacityJPerKFront:8800,
  coreHeatCapacityJPerKRear:10400,
  airHeatCapacityJPerKFront:180,
  airHeatCapacityJPerKRear:210,
  surfaceToCoreWPerK:42,
  coreToAirWPerK:14,
  roadConductWPerK:10,
  convBaseWPerK:12,
  convSpeedWPerK:2.0,
  wearReferenceJ:1.2e8
 },
 suspension:{
  frontOilHeatCapacityJPerK:8200,
  rearOilHeatCapacityJPerK:6200,
  frontCoolWPerK:4.5,
  rearCoolWPerK:3.8
 }
};

function syncGeometryFromSound(){
 try{
  const p=SOUND?.engine?.profile;
  if(!p)return;
  const x=p.exhaust||{};
  if(x.headerA){cfg.exhaust.headerA.lengthM=+x.headerA.lengthM||cfg.exhaust.headerA.lengthM;cfg.exhaust.headerA.diameterM=+x.headerA.diameterM||cfg.exhaust.headerA.diameterM}
  if(x.headerB){cfg.exhaust.headerB.lengthM=+x.headerB.lengthM||cfg.exhaust.headerB.lengthM;cfg.exhaust.headerB.diameterM=+x.headerB.diameterM||cfg.exhaust.headerB.diameterM}
  if(x.collector){cfg.exhaust.collector.lengthM=+x.collector.lengthM||cfg.exhaust.collector.lengthM;cfg.exhaust.collector.diameterM=+x.collector.diameterM||cfg.exhaust.collector.diameterM}
  if(x.muffler){
   cfg.exhaust.mufflerA.lengthM=cfg.exhaust.mufflerB.lengthM=+x.muffler.lengthM||cfg.exhaust.mufflerA.lengthM;
   cfg.exhaust.mufflerA.diameterM=cfg.exhaust.mufflerB.diameterM=Math.max(.07,Math.sqrt(Math.max(.001,(+x.muffler.chamberVolumeL||5.7)/1000)*4/(PI*Math.max(.1,+x.muffler.lengthM||.494))));
  }
 }catch(_){}
}

function makePipe(name,c){
 const n=Math.max(2,c.cells|0),amb=cfg.ambientC;
 return{
  name,lengthM:c.lengthM,diameterM:c.diameterM,cells:n,
  wallThicknessM:c.wallThicknessM||cfg.exhaust.wallThicknessM,
  gasC:Array(n).fill(amb),wallC:Array(n).fill(amb),oxidation:Array(n).fill(0),
  gasOutC:amb,wallMeanC:amb,wallMaxC:amb
 };
}
function pipeConfig(name){return cfg.exhaust[name]}
function buildExhaust(){
 syncGeometryFromSound();
 return{
  headerA:makePipe('headerA',pipeConfig('headerA')),
  headerB:makePipe('headerB',pipeConfig('headerB')),
  collector:makePipe('collector',pipeConfig('collector')),
  mufflerA:makePipe('mufflerA',pipeConfig('mufflerA')),
  mufflerB:makePipe('mufflerB',pipeConfig('mufflerB'))
 };
}

function brakeState(name,mass,area,padMass){
 return{name,tempC:cfg.ambientC,padTempC:cfg.ambientC,energyJ:0,padEnergyJ:0,discMassKg:mass,areaM2:area,padMassKg:padMass,muShadow:.40,fadeFactorShadow:1};
}
function tireState(name,basePsi){
 return{name,surfaceC:cfg.ambientC,coreC:cfg.ambientC,airC:cfg.ambientC,basePsi,pressurePsiShadow:basePsi,wear01:0,slipEnergyJ:0,gripFactorShadow:.78};
}
function suspensionThermalState(name){return{name,oilC:cfg.ambientC,powerW:0,energyJ:0}}

const state={
 schema:'lucid.v125.component-state.v1',
 simTimeS:0,
 ambientC:cfg.ambientC,
 source:{egtC:cfg.ambientC,massFlowKgS:0,enginePowerKw:0,throttle:0,rpm:0,speedMps:0},
 exhaust:buildExhaust(),
 brakes:{
  frontL:brakeState('frontL',cfg.brakes.frontDiscMassKg,cfg.brakes.frontDiscAreaM2,cfg.brakes.frontPadMassKg),
  frontR:brakeState('frontR',cfg.brakes.frontDiscMassKg,cfg.brakes.frontDiscAreaM2,cfg.brakes.frontPadMassKg),
  rear:brakeState('rear',cfg.brakes.rearDiscMassKg,cfg.brakes.rearDiscAreaM2,cfg.brakes.rearPadMassKg)
 },
 tires:{front:tireState('front',32),rear:tireState('rear',34.8)},
 suspension:{front:suspensionThermalState('front'),rear:suspensionThermalState('rear')},
 history:[],
 lastHistoryS:-1e9,
 lastSoundPushS:-1e9,
 authority:AUTHORITY
};

function resetThermal(){
 state.simTimeS=0;state.source={egtC:cfg.ambientC,massFlowKgS:0,enginePowerKw:0,throttle:0,rpm:0,speedMps:0};
 state.exhaust=buildExhaust();
 for(const b of Object.values(state.brakes)){b.tempC=b.padTempC=cfg.ambientC;b.energyJ=b.padEnergyJ=0;b.muShadow=.40;b.fadeFactorShadow=1}
 for(const t of Object.values(state.tires)){t.surfaceC=t.coreC=t.airC=cfg.ambientC;t.wear01=0;t.slipEnergyJ=0;t.pressurePsiShadow=t.basePsi;t.gripFactorShadow=.78}
 for(const s of Object.values(state.suspension)){s.oilC=cfg.ambientC;s.powerW=0;s.energyJ=0}
 state.history.length=0;state.lastHistoryS=-1e9;state.lastSoundPushS=-1e9;
 publish();
}

function liveModel(){
 const domain=API.domain?.()||'FREE_ROAD';
 const sim=domain==='FREE_ROAD'?API.free:API.dyno;
 const pst=domain==='FREE_ROAD'?PT.states?.free:PT.states?.dyno;
 return{domain,sim,M:sim?.last||null,P:pst?.last||null};
}

function deriveSources(M,P){
 const amb=cfg.ambientC;
 const speed=Math.abs(M?.body?.speedMps ?? M?.speedMps ?? P?.wheel?.speedMps ?? 0);
 const rpm=Math.max(0,P?.engine?.rpm||0),thr=clamp(P?.engine?.throttle||0,0,1);
 const crankKw=Math.max(0,P?.engine?.crankPowerKw||0);
 const loadFrac=clamp((P?.engine?.controlledCrankTorqueNm||0)/95,0,1);
 const rpmFrac=clamp(rpm/10500,0,1);
 // Calibration proxy only: deliberately explicit, bounded, and not claimed measured 916 EGT.
 const egt=clamp(amb+215+440*Math.pow(thr,.68)+115*loadFrac+55*rpmFrac,amb,930);
 const mdot=clamp(.006+.105*thr*(.28+.72*rpmFrac)+.018*loadFrac,.004,.145);
 return{egtC:egt,massFlowKgS:mdot,enginePowerKw:crankKw,throttle:thr,rpm,speedMps:speed};
}

function pipeStep(pipe,inletC,mdot,speed,dt){
 const e=cfg.exhaust,amb=cfg.ambientC,n=pipe.cells,dx=pipe.lengthM/n,d=pipe.diameterM,th=pipe.wallThicknessM;
 const area=PI*d*dx,mass=Math.max(.02,area*th*e.steelDensity),oldW=pipe.wallC.slice();
 let gas=inletC,maxW=-Infinity,sumW=0;
 for(let i=0;i<n;i++){
  const wall=oldW[i],eps=lerp(e.emissivityFresh,e.emissivityOxidized,clamp(pipe.oxidation[i],0,1));
  const hIn=e.internalHBase+e.internalHFlowGain*Math.sqrt(clamp(mdot/.07,0,2));
  const hOut=e.externalHBase+e.externalHSpeedGain*Math.sqrt(Math.max(0,speed));
  const qIn=hIn*area*(gas-wall);
  const Tk=wall+273.15,Ak=amb+273.15;
  const qConv=hOut*area*(wall-amb);
  const qRad=eps*SIGMA*area*(Math.pow(Math.max(1,Tk),4)-Math.pow(Math.max(1,Ak),4));
  let qAx=0;
  if(i>0)qAx+=e.steelK*(PI*d*th)/Math.max(.01,dx)*(oldW[i-1]-wall);
  if(i<n-1)qAx+=e.steelK*(PI*d*th)/Math.max(.01,dx)*(oldW[i+1]-wall);
  const nextW=clamp(wall+(qIn-qConv-qRad+qAx)*dt/(mass*e.steelCp),amb-20,1150);
  pipe.wallC[i]=nextW;
  const gasDrop=qIn/Math.max(.004,mdot*e.gasCp);
  gas=clamp(gas-gasDrop,amb,1050);
  pipe.gasC[i]=gas;
  if(nextW>260){
   const doseRate=Math.pow(clamp((nextW-260)/520,0,1.5),1.35)/2500;
   pipe.oxidation[i]=clamp(pipe.oxidation[i]+doseRate*dt,0,1);
  }
  sumW+=nextW;maxW=Math.max(maxW,nextW);
 }
 pipe.gasOutC=gas;pipe.wallMeanC=sumW/n;pipe.wallMaxC=maxW;
 return gas;
}

function brakeMuShadow(tempC){
 // V1.25 shadow curve only. V1.21 hydraulic torque still uses its nominal FERIT 450 coefficient.
 let mu=.40;
 if(tempC<80)mu=.34+(.40-.34)*clamp((tempC-20)/60,0,1);
 else if(tempC<320)mu=.40+.02*clamp((tempC-80)/240,0,1);
 else if(tempC<520)mu=.42-.10*clamp((tempC-320)/200,0,1);
 else mu=.32-.10*clamp((tempC-520)/280,0,1);
 return clamp(mu,.18,.44);
}
function stepBrake(b,powerW,speed,dt){
 const C=cfg.brakes,amb=cfg.ambientC;
 const qDisc=Math.max(0,powerW)*C.heatToDisc,qPad=Math.max(0,powerW)*(1-C.heatToDisc);
 const h=18+7*Math.sqrt(Math.max(0,speed));
 const Tk=b.tempC+273.15,Ak=amb+273.15;
 const qConv=h*b.areaM2*(b.tempC-amb);
 const qRad=C.emissivity*SIGMA*b.areaM2*(Math.pow(Tk,4)-Math.pow(Ak,4));
 const qPadDisc=C.padToDiscCouplingWPerK*(b.padTempC-b.tempC);
 b.tempC=clamp(b.tempC+(qDisc+qPadDisc-qConv-qRad)*dt/(b.discMassKg*C.steelCp),amb-20,1100);
 const padCool=4.5*(b.padTempC-amb);
 b.padTempC=clamp(b.padTempC+(qPad-qPadDisc-padCool)*dt/(b.padMassKg*C.padCp),amb-20,900);
 b.energyJ+=qDisc*dt;b.padEnergyJ+=qPad*dt;
 b.muShadow=brakeMuShadow(Math.max(b.tempC,b.padTempC));
 b.fadeFactorShadow=b.muShadow/.40;
}

function tireGripShadow(tempC,wear){
 // Shadow-only working-window proxy, intentionally not fed into V5 in V1.25.
 let tempFactor;
 if(tempC<65)tempFactor=lerp(.72,1,clamp((tempC-15)/50,0,1));
 else if(tempC<95)tempFactor=1;
 else tempFactor=lerp(1,.78,clamp((tempC-95)/55,0,1));
 return clamp(tempFactor*(1-.22*clamp(wear,0,1)),.45,1.02);
}
function tireSlipPower(side,M){
 if(!side||!M)return 0;
 const speed=Math.max(.5,Math.abs(M.body?.speedMps||0));
 const k=Math.abs(side.slipRatio||0),a=Math.abs((side.slipAngleDeg||0)*PI/180);
 return Math.abs(side.FxN||0)*k*speed + Math.abs(side.FyN||0)*Math.tan(clamp(a,0,1.1))*speed;
}
function stepTire(t,powerW,speed,dt,front){
 const C=cfg.tires,amb=cfg.ambientC;
 const Cs=front?C.treadHeatCapacityJPerKFront:C.treadHeatCapacityJPerKRear;
 const Cc=front?C.coreHeatCapacityJPerKFront:C.coreHeatCapacityJPerKRear;
 const Ca=front?C.airHeatCapacityJPerKFront:C.airHeatCapacityJPerKRear;
 const qFric=Math.max(0,powerW),qSC=C.surfaceToCoreWPerK*(t.surfaceC-t.coreC);
 const qRoad=C.roadConductWPerK*(t.surfaceC-amb),qAir=(C.convBaseWPerK+C.convSpeedWPerK*speed)*(t.surfaceC-amb);
 const qCA=C.coreToAirWPerK*(t.coreC-t.airC),qCoreCool=3.5*(t.coreC-amb),qAirCool=1.2*(t.airC-amb);
 t.surfaceC=clamp(t.surfaceC+(qFric-qSC-qRoad-qAir)*dt/Cs,amb-20,180);
 t.coreC=clamp(t.coreC+(qSC-qCA-qCoreCool)*dt/Cc,amb-20,160);
 t.airC=clamp(t.airC+(qCA-qAirCool)*dt/Ca,amb-20,150);
 const T0=cfg.ambientC+273.15,T=t.airC+273.15;
 t.pressurePsiShadow=t.basePsi*T/T0;
 const tempWear=clamp(.65+Math.max(0,t.surfaceC-55)/80,.5,2.6);
 t.wear01=clamp(t.wear01+qFric*dt/C.wearReferenceJ*tempWear,0,1);
 t.slipEnergyJ+=qFric*dt;
 t.gripFactorShadow=tireGripShadow(t.surfaceC,t.wear01);
}

function stepSuspensionThermal(s,powerW,dt,front){
 const C=cfg.suspension,amb=cfg.ambientC,cap=front?C.frontOilHeatCapacityJPerK:C.rearOilHeatCapacityJPerK,cool=front?C.frontCoolWPerK:C.rearCoolWPerK;
 s.powerW=Math.max(0,powerW);s.energyJ+=s.powerW*dt;
 s.oilC=clamp(s.oilC+(s.powerW*.86-cool*(s.oilC-amb))*dt/cap,amb-20,180);
}

function thermalStep(dt){
 const {M,P}=liveModel();if(!M)return;
 state.source=deriveSources(M,P);
 const s=state.source,ex=state.exhaust;
 const outA=pipeStep(ex.headerA,s.egtC,s.massFlowKgS*.5,s.speedMps,dt);
 const outB=pipeStep(ex.headerB,s.egtC,s.massFlowKgS*.5,s.speedMps,dt);
 const outC=pipeStep(ex.collector,(outA+outB)*.5,s.massFlowKgS,s.speedMps,dt);
 pipeStep(ex.mufflerA,outC,s.massFlowKgS*.5,s.speedMps,dt);
 pipeStep(ex.mufflerB,outC,s.massFlowKgS*.5,s.speedMps,dt);

 const pF=Math.max(0,(P?.brakes?.frontPowerKw||0)*1000),pR=Math.max(0,(P?.brakes?.rearPowerKw||0)*1000);
 stepBrake(state.brakes.frontL,pF*.5,s.speedMps,dt);stepBrake(state.brakes.frontR,pF*.5,s.speedMps,dt);stepBrake(state.brakes.rear,pR,s.speedMps,dt);

 stepTire(state.tires.front,tireSlipPower(M.front,M),s.speedMps,dt,true);
 stepTire(state.tires.rear,tireSlipPower(M.rear,M),s.speedMps,dt,false);

 const su=M.suspension||{};
 stepSuspensionThermal(state.suspension.front,Math.abs((su.frontDamperN||0)*(su.frontVelMps||0)),dt,true);
 stepSuspensionThermal(state.suspension.rear,Math.abs((su.rearDamperN||0)*(su.rearVelMps||0)),dt,false);

 state.simTimeS+=dt;
 publish();
 maybeHistory();
 maybeBridgeSound();
}

function blackbodyRGB(tempC){
 // Compact blackbody-style visible-color approximation. Input is physical absolute temperature.
 let K=clamp(tempC+273.15,1000,40000),t=K/100,r,g,b;
 if(t<=66){r=255;g=99.4708025861*Math.log(t)-161.1195681661}else{r=329.698727446*Math.pow(t-60,-.1332047592);g=288.1221695283*Math.pow(t-60,-.0755148492)}
 if(t>=66)b=255;else if(t<=19)b=0;else b=138.5177312231*Math.log(t-10)-305.0447927307;
 return[clamp(r,0,255)/255,clamp(g,0,255)/255,clamp(b,0,255)/255];
}
function emission(tempC,emissivity){
 const vis=Math.pow(clamp((tempC-430)/520,0,1.4),1.45);
 const rgb=blackbodyRGB(tempC),rad=emissivity*Math.pow((tempC+273.15)/1100,4);
 return{emissionRGB:rgb,emissionStrength:cfg.rendererGlow?vis*rad*2.8:0};
}
function exhaustTint(pipe){
 const ox=pipe.oxidation.reduce((a,b)=>a+b,0)/pipe.oxidation.length;
 let rgb=ox<.33?[.58,.42,.16]:ox<.66?[.30,.26,.55]:[.22,.34,.62];
 return{tintRGB:rgb,tintAmount:clamp(ox*.38,0,.38)};
}
function nodeThermal(tempC,eps,tint){
 return Object.assign({tempC},emission(tempC,eps),tint||{});
}

function publish(){
 const ex=state.exhaust,B=state.brakes;
 global.__LUCID_THERMAL_RENDER__={
  schema:'lucid.v125.thermal-render-bridge.v1',
  nodes:{
   23:nodeThermal(ex.headerA.wallMeanC,lerp(cfg.exhaust.emissivityFresh,cfg.exhaust.emissivityOxidized,Math.max(...ex.headerA.oxidation)),exhaustTint(ex.headerA)),
   31:nodeThermal(ex.headerB.wallMeanC,lerp(cfg.exhaust.emissivityFresh,cfg.exhaust.emissivityOxidized,Math.max(...ex.headerB.oxidation)),exhaustTint(ex.headerB)),
   25:nodeThermal(ex.mufflerA.wallMeanC,.44,exhaustTint(ex.mufflerA)),
   26:nodeThermal(ex.mufflerA.wallMeanC,.44,exhaustTint(ex.mufflerA)),
   27:nodeThermal(ex.mufflerA.wallMeanC,.36,exhaustTint(ex.mufflerA)),
   28:nodeThermal(ex.mufflerB.wallMeanC,.44,exhaustTint(ex.mufflerB)),
   29:nodeThermal(ex.mufflerB.wallMeanC,.44,exhaustTint(ex.mufflerB)),
   30:nodeThermal(ex.mufflerB.wallMeanC,.36,exhaustTint(ex.mufflerB)),
   127:nodeThermal(B.frontL.tempC,cfg.brakes.emissivity),
   128:nodeThermal(B.frontR.tempC,cfg.brakes.emissivity),
   147:nodeThermal(B.rear.tempC,cfg.brakes.emissivity)
  },
  authority:AUTHORITY.renderer
 };
 global.__LUCID_VOLUMETRIC_THERMAL_INPUT__={
  schema:'lucid.v125.volumetric-thermal-input.v1',
  tailpipeTempC:(ex.mufflerA.gasOutC+ex.mufflerB.gasOutC)*.5,
  exhaustWallMaxC:Math.max(ex.headerA.wallMaxC,ex.headerB.wallMaxC,ex.collector.wallMaxC,ex.mufflerA.wallMaxC,ex.mufflerB.wallMaxC),
  exhaustMassFlowKgS:state.source.massFlowKgS,
  exhaustHeatHaze01:clamp(((ex.mufflerA.gasOutC+ex.mufflerB.gasOutC)*.5-cfg.ambientC)/650,0,1),
  frontBrakeHeat01:clamp((Math.max(B.frontL.tempC,B.frontR.tempC)-120)/650,0,1),
  rearBrakeHeat01:clamp((B.rear.tempC-120)/650,0,1),
  frontTireSmokePotential01:clamp((state.tires.front.surfaceC-85)/70,0,1)*clamp(Math.abs(API.free?.last?.front?.slipRatio||0)*2,0,1),
  rearTireSmokePotential01:clamp((state.tires.rear.surfaceC-85)/70,0,1)*clamp(Math.abs(API.free?.last?.rear?.slipRatio||0)*2,0,1),
  consumerPresent:false,
  authority:AUTHORITY.volumetrics
 };
}

function maybeBridgeSound(){
 if(!cfg.soundThermalAuto||!SOUND?.engine?.profile?.exhaust)return;
 if(state.simTimeS-state.lastSoundPushS<1/cfg.soundBridgeHz)return;
 state.lastSoundPushS=state.simTimeS;
 const ex=state.exhaust;
 const target=clamp((ex.headerA.gasC[1]+ex.headerB.gasC[1]+ex.collector.gasC[0])/3,80,950);
 const p=SOUND.engine.profile.exhaust,old=+p.gasTempC||target,next=lerp(old,target,.35);
 if(Math.abs(next-old)>.5){p.gasTempC=next;try{SOUND.engine.pushProfile?.()}catch(_){}}
}

function maybeHistory(){
 const page=activePage();
 if(!['SUSPENSION','BRAKES','TIRES','THERMAL','TELEMETRY'].includes(page))return;
 if(state.simTimeS-state.lastHistoryS<1/cfg.historyHz)return;
 state.lastHistoryS=state.simTimeS;
 const M=liveModel().M||{},su=M.suspension||{};
 state.history.push({
  t:state.simTimeS,
  egt:state.source.egtC,
  exA:state.exhaust.headerA.wallMaxC,exB:state.exhaust.headerB.wallMaxC,
  bf:Math.max(state.brakes.frontL.tempC,state.brakes.frontR.tempC),br:state.brakes.rear.tempC,
  tf:state.tires.front.surfaceC,tr:state.tires.rear.surfaceC,
  fo:state.suspension.front.oilC,ro:state.suspension.rear.oilC,
  xF:su.frontTravelM||0,xR:su.rearTravelM||0,vF:su.frontVelMps||0,vR:su.rearVelMps||0
 });
 if(state.history.length>cfg.historyMax)state.history.splice(0,state.history.length-cfg.historyMax);
}

let lastSimTime=null,acc=0;
function scheduler(){
 const {M}=liveModel();
 const t=Number(M?.timeS);
 if(Number.isFinite(t)){
  if(lastSimTime===null||t<lastSimTime-1e-6){lastSimTime=t;acc=0}
  let d=t-lastSimTime;lastSimTime=t;
  if(d>0&&d<1){acc+=Math.min(d,.25);const h=1/cfg.thermalHz;let guard=0;while(acc>=h&&guard++<20){thermalStep(h);acc-=h}}
 }
 global.requestAnimationFrame(scheduler);
}

// ---------- Suspension tuning / lab ----------
const susp={
 baseline:null,lastTest:null,
 damperForce(v,cComp,cReb,highFrac,knee){const cLo=v>=0?cComp:cReb,cHi=cLo*highFrac,k=Math.max(.015,knee||.1);return cHi*v+(cLo-cHi)*k*Math.tanh(v/k)},
 capture(){
  const S=API.free.S;
  return{kF:S.kF,kR:S.kR,kRProg:S.kRProg,cFc:S.cFc,cFr:S.cFr,cRc:S.cRc,cRr:S.cRr,damperHighFracF:S.damperHighFracF,damperHighFracR:S.damperHighFracR,damperKneeF:S.damperKneeF,damperKneeR:S.damperKneeR,sagF:S.sagF,sagR:S.sagR,bumpStartF:S.bumpStartF,bumpStartR:S.bumpStartR};
 },
 apply(p){
  const F=API.free,S=F.S;
  Object.keys(p||{}).forEach(k=>{if(k in S&&Number.isFinite(+p[k]))S[k]=+p[k]});
  // Recompute preload forces so the requested static sag remains a setup target.
  const Fs=S.mSprung*S.g*.5,az=Math.max(.2,F.geom?.forkAxisBody?.[2]||.9);
  F.preF=Fs*az-S.kF*S.sagF;
  const kr=S.kR*(1+S.kRProg*Math.pow(S.sagR/S.travelR,2));F.preR=Fs-kr*S.sagR;
  F.compute();
  return F.last;
 }
};
susp.baseline=susp.capture();

function setInput(id,v){const e=q(id);if(e)e.value=String(v)}
function readNum(id,scale=1){const e=q(id);return e?+e.value*scale:NaN}
function populateSuspension(){
 const S=API.free.S;
 setInput('v125Fk',S.kF/1000);setInput('v125Rk',S.kR/1000);setInput('v125Prog',S.kRProg);
 setInput('v125Fc',S.cFc/1000);setInput('v125Fr',S.cFr/1000);setInput('v125Rc',S.cRc/1000);setInput('v125Rr',S.cRr/1000);
 setInput('v125FHi',S.damperHighFracF);setInput('v125RHi',S.damperHighFracR);setInput('v125FKnee',S.damperKneeF);setInput('v125RKnee',S.damperKneeR);
 setInput('v125FSag',S.sagF*1000);setInput('v125RSag',S.sagR*1000);setInput('v125FBump',S.bumpStartF*100);setInput('v125RBump',S.bumpStartR*100);
}
function applySuspensionUI(){
 susp.apply({
  kF:readNum('v125Fk',1000),kR:readNum('v125Rk',1000),kRProg:readNum('v125Prog'),
  cFc:readNum('v125Fc',1000),cFr:readNum('v125Fr',1000),cRc:readNum('v125Rc',1000),cRr:readNum('v125Rr',1000),
  damperHighFracF:readNum('v125FHi'),damperHighFracR:readNum('v125RHi'),damperKneeF:readNum('v125FKnee'),damperKneeR:readNum('v125RKnee'),
  sagF:readNum('v125FSag',.001),sagR:readNum('v125RSag',.001),bumpStartF:readNum('v125FBump',.01),bumpStartR:readNum('v125RBump',.01)
 });
 drawDamperCurves();
}

function runSuspensionTest(kind){
 const F=API.free,S=F.S,st=PT.states?.free;if(!F||!st)return;
 const saveCmd={...st.command},saveSpeed=Math.max(0,F.last?.body?.speedMps||20),rows=[];
 const setup=kind==='BRAKE_DIVE'
   ?{speed:25,gear:3,duration:1.8,start:.25,stop:1.05,throttle:0,frontBar:48,rearBar:6}
   :kind==='ACCEL_SQUAT'
   ?{speed:10,gear:2,duration:1.8,start:.20,stop:1.20,throttle:.92,frontBar:0,rearBar:0}
   :{speed:18,gear:3,duration:1.5,start:.20,stop:.65,throttle:.20,frontBar:0,rearBar:0};

 API.setDomain?.('FREE_ROAD');F.reset(setup.speed,0);
 Object.assign(st.command,{mode:'ENGINE',gear:setup.gear,clutch:1,throttle:0,frontBrakeBar:0,rearBrakeBar:0,absEnabled:false,tcEnabled:false,brakeModel:'HYDRAULIC_FERIT450'});
 const n=Math.round(setup.duration/S.dt);
 for(let i=0;i<n;i++){
  const t=i*S.dt,on=t>=setup.start&&t<=setup.stop;
  st.command.throttle=on?setup.throttle:0;
  st.command.frontBrakeBar=on?setup.frontBar:0;st.command.rearBrakeBar=on?setup.rearBar:0;
  F.step();
  if(i%5===0){
   const M=F.last,su=M.suspension||{};
   rows.push({t:M.timeS,xF:su.frontTravelM||0,xR:su.rearTravelM||0,vF:su.frontVelMps||0,vR:su.rearVelMps||0,loadF:M.front?.loadN||0,loadR:M.rear?.loadN||0,speed:M.body?.speedMps||0});
  }
 }
 Object.assign(st.command,saveCmd);
 const max=(a,k)=>Math.max(...a.map(x=>x[k])),min=(a,k)=>Math.min(...a.map(x=>x[k]));
 susp.lastTest={
  schema:'lucid.v125.suspension-test.v1',kind,rows,
  summary:{
   maxFrontTravelMm:max(rows,'xF')*1000,minFrontTravelMm:min(rows,'xF')*1000,
   maxRearTravelMm:max(rows,'xR')*1000,minRearTravelMm:min(rows,'xR')*1000,
   peakFrontDamperSpeedMps:Math.max(...rows.map(x=>Math.abs(x.vF))),
   peakRearDamperSpeedMps:Math.max(...rows.map(x=>Math.abs(x.vR))),
   peakFrontLoadN:max(rows,'loadF'),peakRearLoadN:max(rows,'loadR')
  }
 };
 F.reset(Math.max(0,saveSpeed),0);
 drawSuspTest();
 return susp.lastTest;
}

function restoreSuspensionBaseline(){susp.apply(susp.baseline);populateSuspension();drawDamperCurves()}

// ---------- UI ----------
const CSS=`
body.v123 #v123Brand strong:after{content:" · V1.25 ORCHESTRATION"!important;color:#70dffb;font-weight:500}
#v123Nav{overflow-x:auto}
#v123Nav .v125Nav{color:#9db6c2;border-left:1px solid #1f3540}
body[data-v123-page="SUSPENSION"] #app,body[data-v123-page="BRAKES"] #app,body[data-v123-page="TIRES"] #app,body[data-v123-page="THERMAL"] #app{grid-template-columns:minmax(0,1fr) min(680px,50vw);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="SUSPENSION"] #view,body[data-v123-page="BRAKES"] #view,body[data-v123-page="TIRES"] #view,body[data-v123-page="THERMAL"] #view{grid-column:1;grid-row:1}
body[data-v123-page="SUSPENSION"] #ctrl,body[data-v123-page="SUSPENSION"] #bottom,body[data-v123-page="BRAKES"] #ctrl,body[data-v123-page="BRAKES"] #bottom,body[data-v123-page="TIRES"] #ctrl,body[data-v123-page="TIRES"] #bottom,body[data-v123-page="THERMAL"] #ctrl,body[data-v123-page="THERMAL"] #bottom{display:none!important}
body[data-v123-page="SUSPENSION"] #v123EngineDock,body[data-v123-page="SUSPENSION"] #v123SoundDock,body[data-v123-page="BRAKES"] #v123EngineDock,body[data-v123-page="BRAKES"] #v123SoundDock,body[data-v123-page="TIRES"] #v123EngineDock,body[data-v123-page="TIRES"] #v123SoundDock,body[data-v123-page="THERMAL"] #v123EngineDock,body[data-v123-page="THERMAL"] #v123SoundDock{display:none!important}
#v125LabDock{display:none;grid-column:2;grid-row:1;min-width:0;min-height:0;overflow:auto;background:#071017;border-left:1px solid #2a4653;padding:12px;color:#d9edf5}
body[data-v123-page="SUSPENSION"] #v125LabDock,body[data-v123-page="BRAKES"] #v125LabDock,body[data-v123-page="TIRES"] #v125LabDock,body[data-v123-page="THERMAL"] #v125LabDock{display:block}
.v125Page{display:none}.v125Page.on{display:block}
.v125Head{position:sticky;top:-12px;z-index:4;margin:-12px -12px 10px;padding:12px;background:#08131bea;border-bottom:1px solid #274452;backdrop-filter:blur(12px)}
.v125Head h2{font-size:13px;margin:0;letter-spacing:.1em}.v125Head p{font-size:9px;color:#86a4b2;margin:4px 0 0;max-width:760px}
.v125Grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v125Card{background:#0a151d;border:1px solid #243f4b;border-radius:7px;padding:9px;min-width:0}.v125Card.full{grid-column:1/-1}
.v125Card h3{margin:0 0 7px;font-size:10px;letter-spacing:.09em;color:#8fe7ff}.v125Field{display:grid;grid-template-columns:1fr 100px 34px;gap:5px;align-items:center;margin:4px 0;font-size:9px;color:#9eb8c4}.v125Field input{width:100%;background:#08131a;color:#dff1f6;border:1px solid #2b4855;border-radius:4px;padding:4px}.v125Field small{color:#6e8a96}
.v125KV{display:grid;grid-template-columns:1fr auto;gap:3px 10px;font-size:9px}.v125KV span{color:#7f9ca9}.v125KV b{font-weight:500;color:#dff4fb;text-align:right}
.v125Btns{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.v125Btns button{font-size:9px}
.v125Note{font-size:9px;color:#829ca8;border-left:2px solid #355562;padding-left:7px;margin-top:7px}.v125Warn{color:#ffc56a}.v125Good{color:#76e8b1}
.v125Canvas{width:100%;height:170px;background:#050b0f;border:1px solid #1f3540;border-radius:5px;display:block}
#v125ThermalStrip{height:240px}
.v125Meter{height:7px;background:#061017;border:1px solid #294651;border-radius:5px;overflow:hidden}.v125Meter i{display:block;height:100%;width:0;background:linear-gradient(90deg,#60d5ff,#76e8b1,#ffc56a,#ff735f)}
.v125Big{font:700 24px/1 ui-monospace,Consolas,monospace;color:#e7f7fb}
@media(max-width:900px){body[data-v123-page="SUSPENSION"] #app,body[data-v123-page="BRAKES"] #app,body[data-v123-page="TIRES"] #app,body[data-v123-page="THERMAL"] #app{grid-template-columns:1fr}body[data-v123-page="SUSPENSION"] #view,body[data-v123-page="BRAKES"] #view,body[data-v123-page="TIRES"] #view,body[data-v123-page="THERMAL"] #view{display:none}#v125LabDock{grid-column:1}.v125Grid{grid-template-columns:1fr}}
`;

function addStyle(){const s=D.createElement('style');s.id='v125Style';s.textContent=CSS;D.head.appendChild(s)}

function buildNav(){
 const nav=q('v123Nav');if(!nav)return;
 [['SUSPENSION','SUSP'],['BRAKES','BRAKES'],['TIRES','TIRES'],['THERMAL','THERMAL']].forEach(([k,l])=>{
  const b=D.createElement('button');b.className='v125Nav';b.dataset.v123Page=k;b.textContent=l;
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();enterLab(k)});
  nav.appendChild(b);
 });
}

function pageHTML(){
 return`
 <section class="v125Page" data-v125-page="SUSPENSION">
  <div class="v125Head"><h2>SUSPENSION LAB</h2><p>Direct editor for the current V5.3 free-road fork / rear linkage model. Force–velocity curves use the exact dual-slope damper equation already used by the live solver.</p></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>FRONT FORK</h3>
    <div class="v125Field"><span>spring rate</span><input id="v125Fk" type="number" min="5" max="80" step=".1"><small>N/mm</small></div>
    <div class="v125Field"><span>static sag target</span><input id="v125FSag" type="number" min="5" max="70" step=".5"><small>mm</small></div>
    <div class="v125Field"><span>compression low-speed</span><input id="v125Fc" type="number" min=".1" max="12" step=".05"><small>kNs/m</small></div>
    <div class="v125Field"><span>rebound low-speed</span><input id="v125Fr" type="number" min=".1" max="16" step=".05"><small>kNs/m</small></div>
    <div class="v125Field"><span>high-speed fraction</span><input id="v125FHi" type="number" min=".1" max="1" step=".01"><small>×</small></div>
    <div class="v125Field"><span>knee velocity</span><input id="v125FKnee" type="number" min=".02" max=".5" step=".005"><small>m/s</small></div>
    <div class="v125Field"><span>bump-stop onset</span><input id="v125FBump" type="number" min="50" max="98" step="1"><small>%</small></div>
   </div>
   <div class="v125Card"><h3>REAR SHOCK / LINKAGE</h3>
    <div class="v125Field"><span>wheel spring base</span><input id="v125Rk" type="number" min="5" max="100" step=".1"><small>N/mm</small></div>
    <div class="v125Field"><span>static sag target</span><input id="v125RSag" type="number" min="5" max="70" step=".5"><small>mm</small></div>
    <div class="v125Field"><span>progressivity</span><input id="v125Prog" type="number" min="0" max="8" step=".05"><small>×</small></div>
    <div class="v125Field"><span>compression low-speed</span><input id="v125Rc" type="number" min=".1" max="14" step=".05"><small>kNs/m</small></div>
    <div class="v125Field"><span>rebound low-speed</span><input id="v125Rr" type="number" min=".1" max="18" step=".05"><small>kNs/m</small></div>
    <div class="v125Field"><span>high-speed fraction</span><input id="v125RHi" type="number" min=".1" max="1" step=".01"><small>×</small></div>
    <div class="v125Field"><span>knee velocity</span><input id="v125RKnee" type="number" min=".02" max=".5" step=".005"><small>m/s</small></div>
    <div class="v125Field"><span>bump-stop onset</span><input id="v125RBump" type="number" min="50" max="98" step="1"><small>%</small></div>
   </div>
   <div class="v125Card full"><h3>FORCE / VELOCITY — EXACT LIVE DAMPER LAW</h3><canvas id="v125DamperCurve" class="v125Canvas" width="900" height="220"></canvas>
    <div class="v125Btns"><button id="v125SuspApply">APPLY SETUP</button><button id="v125SuspBaseline">RESTORE V5 BASELINE</button><button id="v125Dive">BRAKE-DIVE TEST</button><button id="v125Squat">ACCEL-SQUAT TEST</button></div>
    <div class="v125Note">Positive shaft velocity is compression in the current V5 equation; negative is rebound. Rear motion ratio remains geometry-computed in the vehicle solver.</div>
   </div>
   <div class="v125Card"><h3>LIVE SUSPENSION STATE</h3><div id="v125SuspLive" class="v125KV"></div></div>
   <div class="v125Card"><h3>THERMAL SHADOW</h3><div id="v125SuspTherm" class="v125KV"></div><div class="v125Note">Damper work already heats the new oil-temperature shadow state. Viscosity/damping feedback remains disabled until its calibration step.</div></div>
   <div class="v125Card full"><h3>TEST TRACE</h3><canvas id="v125SuspTest" class="v125Canvas" width="900" height="220"></canvas><div id="v125SuspResult" class="v125Note">Run a deterministic test to populate this trace.</div></div>
  </div>
 </section>

 <section class="v125Page" data-v125-page="BRAKES">
  <div class="v125Head"><h2>BRAKE LAB · THERMAL FOUNDATION</h2><p>V1.21 hydraulic torque feeds a persistent rotor/pad energy model. The displayed temperature-dependent μ curve is shadow-only in V1.25 and cannot silently change braking performance.</p></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>FRONT ROTORS</h3><div id="v125BrakeFront" class="v125KV"></div></div>
   <div class="v125Card"><h3>REAR ROTOR</h3><div id="v125BrakeRear" class="v125KV"></div></div>
   <div class="v125Card full"><h3>THERMAL HISTORY</h3><canvas id="v125BrakeCanvas" class="v125Canvas" width="900" height="220"></canvas></div>
   <div class="v125Card full"><h3>COUPLING STATUS</h3><div id="v125BrakeCoupling" class="v125Note v125Warn">V1.25 SHADOW — calculated μ(T) / fade factors are not yet applied to V1.21 hydraulic brake torque. V1.26 will add the calibrated feedback loop after validation.</div></div>
  </div>
 </section>

 <section class="v125Page" data-v125-page="TIRES">
  <div class="v125Head"><h2>TIRE LAB · THERMAL / WEAR SHADOW</h2><p>Slip work drives surface/core/inner-air temperature and a persistent wear-energy state around the existing finite-thickness tire solver. Grip and pressure feedback are deliberately staged for V1.26.</p></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>FRONT TIRE</h3><div id="v125TireFront" class="v125KV"></div></div>
   <div class="v125Card"><h3>REAR TIRE</h3><div id="v125TireRear" class="v125KV"></div></div>
   <div class="v125Card full"><h3>THERMAL / WEAR HISTORY</h3><canvas id="v125TireCanvas" class="v125Canvas" width="900" height="220"></canvas></div>
   <div class="v125Card full"><div class="v125Note v125Warn">V1.25 SHADOW — pressure and grip factors shown here are diagnostics. The live finite-thickness tire still uses its existing pressure/grip authority until V1.26 calibration and A/B tests.</div></div>
  </div>
 </section>

 <section class="v125Page" data-v125-page="THERMAL">
  <div class="v125Head"><h2>THERMAL / MATERIALS ORCHESTRATOR</h2><p>Shared component state links combustion → exhaust gas/wall heat, braking → rotors/pads, tire slip → tread/core/air, suspension work → damper oil, renderer emission, sound temperature and future volumetric consumers.</p></div>
  <div class="v125Grid">
   <div class="v125Card full"><h3>EXHAUST GAS-PATH TEMPERATURE</h3><canvas id="v125ThermalStrip" class="v125Canvas" width="900" height="300"></canvas><div id="v125ThermalSummary" class="v125KV"></div></div>
   <div class="v125Card"><h3>BRIDGES</h3>
    <div class="v125Field"><span>sound follows thermal gas</span><input id="v125SoundAuto" type="checkbox"><small>AUTO</small></div>
    <div class="v125Field"><span>temperature material glow</span><input id="v125Glow" type="checkbox"><small>GL</small></div>
    <div class="v125Btns"><button id="v125ThermalReset">RESET THERMAL STATE</button></div>
    <div class="v125Note">Volumetric thermal outputs are published globally, but V1.24 has no compatible volumetric renderer consumer. This page reports that boundary explicitly.</div>
   </div>
   <div class="v125Card"><h3>LIVE ENERGY SOURCES</h3><div id="v125Sources" class="v125KV"></div></div>
   <div class="v125Card full"><h3>WHOLE-BIKE THERMAL HISTORY</h3><canvas id="v125WholeTherm" class="v125Canvas" width="900" height="220"></canvas></div>
  </div>
 </section>`;
}

function buildDock(){
 const app=q('app');if(!app)return;
 const dock=D.createElement('section');dock.id='v125LabDock';dock.innerHTML=pageHTML();app.appendChild(dock);
 q('v125SuspApply').onclick=applySuspensionUI;q('v125SuspBaseline').onclick=restoreSuspensionBaseline;
 q('v125Dive').onclick=()=>runSuspensionTest('BRAKE_DIVE');q('v125Squat').onclick=()=>runSuspensionTest('ACCEL_SQUAT');
 q('v125SoundAuto').checked=cfg.soundThermalAuto;q('v125SoundAuto').onchange=e=>cfg.soundThermalAuto=!!e.target.checked;
 q('v125Glow').checked=cfg.rendererGlow;q('v125Glow').onchange=e=>{cfg.rendererGlow=!!e.target.checked;publish()};
 q('v125ThermalReset').onclick=resetThermal;
 populateSuspension();drawDamperCurves();
}

function enterLab(page){
 // Run the existing shell's DYNAMICS transition first so its internal state leaves RIDE,
 // pauses the session, restores diagnostics and selects FREE_ROAD. Then take ownership of the new page.
 const base=q('v123Nav')?.querySelector('button[data-v123-page="DYNAMICS"]');
 if(!['DYNAMICS','SUSPENSION','BRAKES','TIRES','THERMAL'].includes(activePage()))base?.click();
 else if(activePage()==='RIDE')base?.click();
 try{if(API.domain?.()!=='FREE_ROAD')API.setDomain?.('FREE_ROAD')}catch(_){}
 D.body.dataset.v123Page=page;global.__LUCID_ACTIVE_PAGE__=page;global.__LUCID_PERF_MODE__='LAB';
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page===page));
 const title=q('v123PageTitle'),m={
  SUSPENSION:['SUSPENSION LAB','fork · shock · linkage · damping curves · deterministic tests'],
  BRAKES:['BRAKE LAB','hydraulics · rotor / pad heat · fade shadow · cooling'],
  TIRES:['TIRE LAB','surface / core / air temperature · pressure shadow · wear energy'],
  THERMAL:['THERMAL / MATERIALS','exhaust gas/wall network · renderer / sound / volumetric bridges']
 }[page];
 if(title&&m){title.querySelector('strong').textContent=m[0];title.querySelector('span').textContent=m[1]}
 q('v123Domain')&&(q('v123Domain').textContent=`FREE_ROAD · ${page}`);
 q('v123PerfTop')&&(q('v123PerfTop').textContent='DEV RUNTIME');
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page===page));
}

function kv(el,rows){
 if(!el)return;el.innerHTML=rows.map(r=>`<span>${r[0]}</span><b>${r[1]}</b>`).join('');
}

function plotSeries(canvas,series,range,labelFns){
 if(!canvas)return;const x=canvas.getContext('2d'),w=canvas.width,h=canvas.height;x.clearRect(0,0,w,h);x.fillStyle='#050b0f';x.fillRect(0,0,w,h);
 x.strokeStyle='#1f3440';x.lineWidth=1;for(let i=1;i<5;i++){x.beginPath();x.moveTo(0,h*i/5);x.lineTo(w,h*i/5);x.stroke()}
 if(!series?.length)return;
 const min=range?.[0]??Math.min(...series.flatMap(s=>s.data.map(p=>p.y))),max=range?.[1]??Math.max(...series.flatMap(s=>s.data.map(p=>p.y))),span=Math.max(1e-9,max-min);
 const n=Math.max(...series.map(s=>s.data.length));
 series.forEach((s,j)=>{x.strokeStyle=s.color||['#6fdcff','#ffc66c','#78efb1','#ff7365','#c88cff'][j%5];x.lineWidth=2;x.beginPath();s.data.forEach((p,i)=>{let xx=n<=1?0:i/(n-1)*w,yy=h-8-(p.y-min)/span*(h-18);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()});
}

function drawDamperCurves(){
 const c=q('v125DamperCurve');if(!c)return;const S=API.free.S,front=[],rear=[];for(let i=0;i<=160;i++){let v=-1.2+i/160*2.4;front.push({y:susp.damperForce(v,S.cFc,S.cFr,S.damperHighFracF,S.damperKneeF)/1000});rear.push({y:susp.damperForce(v,S.cRc,S.cRr,S.damperHighFracR,S.damperKneeR)/1000})}
 const m=Math.max(...front.concat(rear).map(x=>Math.abs(x.y)))*1.08;plotSeries(c,[{data:front,color:'#6fdcff'},{data:rear,color:'#ffc66c'}],[-m,m]);
 const x=c.getContext('2d');x.fillStyle='#9ab7c4';x.font='11px ui-monospace';x.fillText('FRONT',10,14);x.fillStyle='#ffc66c';x.fillText('REAR',70,14);x.fillStyle='#7897a5';x.fillText('rebound ← shaft velocity → compression',c.width-320,c.height-8);
}
function drawSuspTest(){
 const c=q('v125SuspTest'),T=susp.lastTest;if(!c||!T)return;plotSeries(c,[{data:T.rows.map(r=>({y:r.xF*1000})),color:'#6fdcff'},{data:T.rows.map(r=>({y:r.xR*1000})),color:'#ffc66c'}],[0,140]);
 const s=T.summary;const el=q('v125SuspResult');if(el)el.textContent=`${T.kind} · max fork ${fmt(s.maxFrontTravelMm,1)} mm · max rear ${fmt(s.maxRearTravelMm,1)} mm · peak damper speed F/R ${fmt(s.peakFrontDamperSpeedMps,3)} / ${fmt(s.peakRearDamperSpeedMps,3)} m/s · peak tire load F/R ${fmt(s.peakFrontLoadN,0)} / ${fmt(s.peakRearLoadN,0)} N`;
}

function tempColor(t){
 const x=clamp((t-20)/800,0,1);
 const stops=[[.10,.65,.95],[.22,.85,.70],[1,.75,.25],[1,.22,.12]];
 let u=x*(stops.length-1),i=Math.min(stops.length-2,Math.floor(u)),f=u-i,a=stops[i],b=stops[i+1];
 return `rgb(${Math.round(255*lerp(a[0],b[0],f))},${Math.round(255*lerp(a[1],b[1],f))},${Math.round(255*lerp(a[2],b[2],f))})`;
}
function drawThermalStrip(){
 const c=q('v125ThermalStrip');if(!c)return;const x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle='#050b0f';x.fillRect(0,0,w,h);
 const pipes=[state.exhaust.headerA,state.exhaust.headerB,state.exhaust.collector,state.exhaust.mufflerA,state.exhaust.mufflerB],labels=['HEADER A','HEADER B','COLLECTOR','MUFFLER A','MUFFLER B'];
 const y0=34,row=45;for(let r=0;r<pipes.length;r++){let p=pipes[r],yy=y0+r*row;x.fillStyle='#8da8b5';x.font='11px ui-monospace';x.fillText(labels[r],8,yy+14);let left=120,ww=w-left-16,cw=ww/p.cells;for(let i=0;i<p.cells;i++){x.fillStyle=tempColor(p.wallC[i]);x.fillRect(left+i*cw,yy,cw-2,18);x.fillStyle='#dcecf3';x.font='9px ui-monospace';if(cw>45)x.fillText(Math.round(p.wallC[i])+'°',left+i*cw+4,yy+13)}x.fillStyle='#65808c';x.fillText(`gas out ${fmt(p.gasOutC,0)}°C`,left,yy+32)}
}
function drawHist(canvas,keys,colors,range){
 const H=state.history;if(!H.length)return;plotSeries(q(canvas),keys.map((k,i)=>({data:H.map(r=>({y:r[k]||0})),color:colors[i]})),range);
}
function uiUpdate(){
 const page=activePage(),{M,P}=liveModel();
 if(page==='SUSPENSION'){
  const su=M?.suspension||{};
  kv(q('v125SuspLive'),[
   ['fork travel',fmt((su.frontTravelM||0)*1000,1)+' mm'],['fork velocity',fmt(su.frontVelMps,3)+' m/s'],['fork spring',fmt(su.frontSpringN,0)+' N'],['fork damper',fmt(su.frontDamperN,0)+' N'],
   ['rear travel',fmt((su.rearTravelM||0)*1000,1)+' mm'],['rear velocity',fmt(su.rearVelMps,3)+' m/s'],['rear spring',fmt(su.rearSpringN,0)+' N'],['rear damper',fmt(su.rearDamperN,0)+' N'],
   ['rear motion ratio',fmt(su.shockGeometryMotionRatio,3)]
  ]);
  kv(q('v125SuspTherm'),[['front damper power',fmt(state.suspension.front.powerW,0)+' W'],['front oil',fmt(state.suspension.front.oilC,1)+' °C'],['rear damper power',fmt(state.suspension.rear.powerW,0)+' W'],['rear oil',fmt(state.suspension.rear.oilC,1)+' °C']]);
 }else if(page==='BRAKES'){
  const B=state.brakes,fb=Math.max(B.frontL.tempC,B.frontR.tempC);
  kv(q('v125BrakeFront'),[['left rotor',fmt(B.frontL.tempC,1)+' °C'],['right rotor',fmt(B.frontR.tempC,1)+' °C'],['pad temp L/R',fmt(B.frontL.padTempC,1)+' / '+fmt(B.frontR.padTempC,1)+' °C'],['live brake power',fmt(P?.brakes?.frontPowerKw||0,2)+' kW'],['μ(T) shadow',fmt((B.frontL.muShadow+B.frontR.muShadow)*.5,3)],['fade factor shadow',fmt((B.frontL.fadeFactorShadow+B.frontR.fadeFactorShadow)*.5,3)]]);
  kv(q('v125BrakeRear'),[['rotor',fmt(B.rear.tempC,1)+' °C'],['pad',fmt(B.rear.padTempC,1)+' °C'],['live brake power',fmt(P?.brakes?.rearPowerKw||0,2)+' kW'],['μ(T) shadow',fmt(B.rear.muShadow,3)],['fade factor shadow',fmt(B.rear.fadeFactorShadow,3)]]);
  drawHist('v125BrakeCanvas',['bf','br'],['#6fdcff','#ffc66c'],[0,900]);
 }else if(page==='TIRES'){
  const TF=state.tires.front,TR=state.tires.rear;
  kv(q('v125TireFront'),[['surface',fmt(TF.surfaceC,1)+' °C'],['core',fmt(TF.coreC,1)+' °C'],['inner air',fmt(TF.airC,1)+' °C'],['pressure shadow',fmt(TF.pressurePsiShadow,2)+' psi'],['wear',fmt(TF.wear01*100,4)+' %'],['grip factor shadow',fmt(TF.gripFactorShadow,3)],['slip energy',fmt(TF.slipEnergyJ/1000,1)+' kJ']]);
  kv(q('v125TireRear'),[['surface',fmt(TR.surfaceC,1)+' °C'],['core',fmt(TR.coreC,1)+' °C'],['inner air',fmt(TR.airC,1)+' °C'],['pressure shadow',fmt(TR.pressurePsiShadow,2)+' psi'],['wear',fmt(TR.wear01*100,4)+' %'],['grip factor shadow',fmt(TR.gripFactorShadow,3)],['slip energy',fmt(TR.slipEnergyJ/1000,1)+' kJ']]);
  drawHist('v125TireCanvas',['tf','tr'],['#6fdcff','#ffc66c'],[0,180]);
 }else if(page==='THERMAL'){
  drawThermalStrip();
  const E=state.exhaust;
  kv(q('v125ThermalSummary'),[['engine EGT source',fmt(state.source.egtC,0)+' °C'],['header max A / B',fmt(E.headerA.wallMaxC,0)+' / '+fmt(E.headerB.wallMaxC,0)+' °C'],['collector wall mean',fmt(E.collector.wallMeanC,0)+' °C'],['tail gas A / B',fmt(E.mufflerA.gasOutC,0)+' / '+fmt(E.mufflerB.gasOutC,0)+' °C'],['sound gas temperature',fmt(SOUND?.engine?.profile?.exhaust?.gasTempC,0)+' °C']]);
  kv(q('v125Sources'),[['engine power',fmt(state.source.enginePowerKw,1)+' kW'],['throttle',fmt(state.source.throttle*100,1)+' %'],['mass-flow proxy',fmt(state.source.massFlowKgS,4)+' kg/s'],['speed',fmt(state.source.speedMps*3.6,1)+' km/h'],['front brake power',fmt(P?.brakes?.frontPowerKw||0,2)+' kW'],['rear brake power',fmt(P?.brakes?.rearPowerKw||0,2)+' kW'],['volumetric consumer',global.__LUCID_VOLUMETRIC_THERMAL_INPUT__?.consumerPresent?'CONNECTED':'NOT PRESENT']]);
  drawHist('v125WholeTherm',['exA','bf','tf','fo'],['#ff7365','#ffc66c','#6fdcff','#78efb1'],[0,1000]);
 }
}

let uiLast=0;
function uiLoop(t){
 if(t-uiLast>1000/cfg.uiHz){uiLast=t;if(['SUSPENSION','BRAKES','TIRES','THERMAL'].includes(activePage()))uiUpdate()}
 global.requestAnimationFrame(uiLoop);
}

function boot(){
 addStyle();buildNav();buildDock();publish();
 global.requestAnimationFrame(scheduler);global.requestAnimationFrame(uiLoop);
 global.__LUCID_V125_READY__=true;
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

global.LUCID_COMPONENT_ORCHESTRATOR={
 version:'V1.25.0',
 state,cfg,authority:AUTHORITY,
 snapshot:()=>deep({state,cfg,authority:AUTHORITY,activePage:activePage()}),
 resetThermal,
 suspension:{
  capture:()=>susp.capture(),apply:p=>susp.apply(p),baseline:deep(susp.baseline),
  runBrakeDive:()=>runSuspensionTest('BRAKE_DIVE'),runAccelSquat:()=>runSuspensionTest('ACCEL_SQUAT'),
  lastTest:()=>deep(susp.lastTest)
 },
 enterPage:enterLab,
 bridges:{
  renderer:()=>global.__LUCID_THERMAL_RENDER__,
  volumetrics:()=>global.__LUCID_VOLUMETRIC_THERMAL_INPUT__,
  setSoundThermalAuto:v=>cfg.soundThermalAuto=!!v,
  setRendererGlow:v=>{cfg.rendererGlow=!!v;publish()}
 },
 development:{
  advanceThermalSeconds:seconds=>{let n=Math.max(0,Math.round(clamp(+seconds||0,0,120)*cfg.thermalHz)),h=1/cfg.thermalHz;for(let i=0;i<n;i++)thermalStep(h);return deep(state)}
 }
};
})(typeof window!=='undefined'?window:globalThis);


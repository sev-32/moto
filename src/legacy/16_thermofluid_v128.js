
(function(global){
'use strict';
if(global.__LUCID_V128_THERMOFLUID__)return;
global.__LUCID_V128_THERMOFLUID__=true;

const D=global.document;
const API=global.DUCATI_V5_API;
const PT=global.DUCATI_ADVANCED_POWERTRAIN;
const ORCH=global.LUCID_COMPONENT_ORCHESTRATOR;
const BT=global.LUCID_BRAKE_TIRE_FEEDBACK;
const TM=global.LUCID_THERMAL_MATERIALS;
const SOUND=global.DUCATI_SOUND_STUDIO;
if(!D||!API||!PT||!ORCH||!BT||!TM){
 console.warn('V1.28 thermofluid/session: required V5/V1.21/V1.25/V1.26/V1.27 APIs unavailable');
 return;
}

const PI=Math.PI, R_AIR=287.05;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const deep=o=>JSON.parse(JSON.stringify(o));
const q=id=>D.getElementById(id);
const activePage=()=>String(global.__LUCID_ACTIVE_PAGE__||D.body?.dataset?.v123Page||'RIDE').toUpperCase();
const fmt=(v,d=2)=>Number.isFinite(+v)?(+v).toFixed(d):'—';

const CAL={
 schema:'lucid.v128.thermofluid-acoustic-session-calibration.v1',
 flowHz:40,
 ambientPressurePa:101325,
 gasGamma:1.33,
 gasR:287.05,
 smoothWallRoughnessM:1.5e-5,
 gasViscosityRefPaS:1.85e-5,
 viscosityRefK:300,
 sutherlandK:110.4,
 pressureClampPa:220000,
 junction:{
  mergeK:.32,
  splitK:.28,
  headerMinorK:.18,
  collectorMinorK:.22,
  mufflerMinorK:1.45
 },
 acoustic:{
  enabled:true,
  pushHz:8,
  smooth:.34,
  minWaveSpeedMps:300,
  maxWaveSpeedMps:720
 },
 wheelMaterials:{
  enabled:true,
  frontNodes:[129,131,132],
  rearNodes:[145,149,150,151,152],
  freshRoughness:.31,
  hotRoughness:.36
 },
 treadVisual:{
  enabled:true,
  maxErosionM:.0036,
  startRadiusM:.255,
  frontHalfWidthM:.075,
  rearHalfWidthM:.105
 },
 haze:{
  enabled:true,
  rideScale:.46,
  labScale:.62,
  maxFpsRide:24,
  maxFpsLab:30,
  minStrength:.045,
  exhaustRadiusPx:90,
  brakeRadiusPx:65,
  maxEmitters:6,
  displacementPx:7.0
 },
 session:{
  sampleHz:20,
  spatialHz:2,
  maxSeconds:900,
  defaultName:'Thermal development session'
 }
};

const AUTHORITY={
 schema:'lucid.v128.authority.v1',
 thermofluid:'Reduced-order quasi-1D prescribed-mass-flow network. V1.25 gas/wall temperatures remain thermal authority; V1.28 derives pressure loss, density, velocity, Reynolds number, Mach number and local acoustic speed. This is not a full method-of-characteristics gas-exchange solver.',
 acoustic:'LIVE: V1.22 AudioWorklet now accepts independent effective wave speeds for Header A, Header B, collector and the two muffler paths, derived from V1.28 cell temperatures. Back-pressure does not alter engine torque in V1.28.',
 backpressure:'SHADOW: manifold back-pressure is calculated from the prescribed mass-flow/pressure-loss network and published for future gas-exchange/VE work. It is not applied to V1.21 combustion torque.',
 tread:'LIVE VISUAL ONLY: V1.26 rib wear can reduce rendered outer tread radius. V5 tire force/compliance authority remains V1.26/V5; no extra physical radius correction is introduced in V1.28.',
 haze:'VISUAL: secondary WebGL2 screen-space refractive overlay samples the primary renderer canvas. It is performance-capped and has no dynamics authority.',
 session:'ANALYSIS: records synchronized snapshots from all current authorities. Replay is lab analysis and does not rewind or override live vehicle physics.'
};

function viscosity(TK){
 const C=CAL;
 return C.gasViscosityRefPaS*Math.pow(TK/C.viscosityRefK,1.5)*(C.viscosityRefK+C.sutherlandK)/(TK+C.sutherlandK);
}
function soundSpeed(TK){return Math.sqrt(CAL.gasGamma*CAL.gasR*Math.max(180,TK))}
function frictionFactor(Re,diam){
 if(Re<1)return 0;
 if(Re<2300)return 64/Re;
 // Swamee-Jain style explicit turbulent approximation.
 const rr=CAL.smoothWallRoughnessM/Math.max(.005,diam);
 const x=Math.log10(rr/3.7+5.74/Math.pow(Re,.9));
 return clamp(.25/(x*x),.008,.12);
}
function harmonicWaveSpeed(pipe){
 const cells=pipe?.cells||[];
 if(!cells.length)return 343;
 let L=pipe.lengthM||cells.length,dx=L/cells.length,travel=0;
 for(const c of cells)travel+=dx/Math.max(1,c.soundSpeedMps);
 return L/Math.max(1e-6,travel);
}
function flowDiameter(name,pipe){
 const p=SOUND?.engine?.profile?.exhaust;
 if(name==='mufflerA'||name==='mufflerB')return clamp(+p?.muffler?.coreDiameterM||.042,.020,.090);
 return clamp(+pipe?.diameterM||(+p?.[name]?.diameterM)||.045,.020,.120);
}
function pipeMinorK(name){
 if(name==='headerA'||name==='headerB')return CAL.junction.headerMinorK;
 if(name==='collector')return CAL.junction.collectorMinorK;
 return CAL.junction.mufflerMinorK;
}
function solvePipeBackward(name,thermalPipe,mdot,pOutletPa,diamOverride){
 const n=Math.max(1,thermalPipe?.gasC?.length||thermalPipe?.cells||1);
 const L=Math.max(.02,+thermalPipe?.lengthM||.2),diam=Math.max(.012,diamOverride||flowDiameter(name,thermalPipe));
 const A=PI*diam*diam/4,dx=L/n,cells=Array(n),minor=pipeMinorK(name)/n;
 let pDown=clamp(pOutletPa,CAL.ambientPressurePa*.75,CAL.pressureClampPa);
 for(let i=n-1;i>=0;i--){
  const TC=thermalPipe?.gasC?.[i] ?? thermalPipe?.gasOutC ?? ORCH.state?.source?.egtC ?? 22;
  const TK=clamp(TC+273.15,180,1500);
  let pMean=pDown,props=null,pUp=pDown;
  for(let it=0;it<3;it++){
   const rho=Math.max(.08,pMean/(CAL.gasR*TK));
   const vel=mdot/(rho*A);
   const mu=viscosity(TK),Re=Math.max(0,rho*Math.abs(vel)*diam/Math.max(1e-8,mu));
   const f=frictionFactor(Re,diam),qdyn=.5*rho*vel*vel;
   const dp=clamp((f*dx/diam+minor)*qdyn,0,45000);
   pUp=clamp(pDown+dp,CAL.ambientPressurePa*.75,CAL.pressureClampPa);
   pMean=.5*(pDown+pUp);
   const c=soundSpeed(TK);
   props={index:i,tempC:TC,tempK:TK,pInPa:pUp,pOutPa:pDown,pMeanPa:pMean,pressureDropPa:dp,
    densityKgM3:rho,velocityMps:vel,mach:Math.abs(vel)/c,reynolds:Re,frictionFactor:f,
    soundSpeedMps:c,dynamicPressurePa:qdyn,diameterM:diam,areaM2:A,dxM:dx};
  }
  cells[i]=props;pDown=pUp;
 }
 const maxMach=Math.max(...cells.map(c=>c.mach)),drop=pDown-pOutletPa;
 return{name,lengthM:L,flowDiameterM:diam,massFlowKgS:mdot,pInPa:pDown,pOutPa:pOutletPa,pressureDropPa:drop,maxMach,
  effectiveSoundSpeedMps:harmonicWaveSpeed({lengthM:L,cells}),cells};
}
function junctionRise(mdot,diam,TK,K){
 const A=PI*diam*diam/4,p=CAL.ambientPressurePa,rho=p/(CAL.gasR*TK),v=mdot/(rho*A);
 return K*.5*rho*v*v;
}

const state={
 schema:'lucid.v128.thermofluid-state.v1',
 simTimeS:0,
 network:{
  headerA:null,headerB:null,collector:null,mufflerA:null,mufflerB:null,
  manifoldBackpressureKPa:0,collectorPressureKPa:0,tailpipePressureKPa:CAL.ambientPressurePa/1000,
  maxMach:0,massFlowKgS:0
 },
 acoustic:{
  effectiveWaveSpeedMps:{headerA:343,headerB:343,collector:343,mufflerA:343,mufflerB:343},
  pushCount:0,lastPushS:-1e9
 },
 session:{
  recording:false,name:CAL.session.defaultName,startedSimS:null,frames:[],spatial:[],
  lastSampleS:-1e9,lastSpatialS:-1e9,playback:{playing:false,timeS:0,rate:1},imported:false
 },
 haze:{available:false,active:false,lastError:null,frames:0},
 flowSweep:null
};

function computeNetworkAt(mdotOverride=null){
 const E=ORCH.state?.exhaust;
 if(!E)return null;
 const mdot=Math.max(.0001,mdotOverride==null?(+ORCH.state?.source?.massFlowKgS||.006):+mdotOverride);
 const pAmb=CAL.ambientPressurePa;
 const dM=flowDiameter('mufflerA',E.mufflerA);
 const mA=solvePipeBackward('mufflerA',E.mufflerA,mdot*.5,pAmb,dM);
 const mB=solvePipeBackward('mufflerB',E.mufflerB,mdot*.5,pAmb,flowDiameter('mufflerB',E.mufflerB));
 const TcolK=((E.collector?.gasC?.at?.(-1)??E.collector?.gasOutC??300)+273.15);
 const dCol=flowDiameter('collector',E.collector);
 const splitRise=junctionRise(mdot,dCol,TcolK,CAL.junction.splitK);
 const pCollectorOut=.5*(mA.pInPa+mB.pInPa)+splitRise;
 const col=solvePipeBackward('collector',E.collector,mdot,pCollectorOut,dCol);
 const mergeRise=junctionRise(mdot,dCol,((E.collector?.gasC?.[0]??300)+273.15),CAL.junction.mergeK);
 const pHeaderOut=col.pInPa+mergeRise;
 const hA=solvePipeBackward('headerA',E.headerA,mdot*.5,pHeaderOut,flowDiameter('headerA',E.headerA));
 const hB=solvePipeBackward('headerB',E.headerB,mdot*.5,pHeaderOut,flowDiameter('headerB',E.headerB));
 const manifold=.5*(hA.pInPa+hB.pInPa);
 const wave={headerA:hA.effectiveSoundSpeedMps,headerB:hB.effectiveSoundSpeedMps,collector:col.effectiveSoundSpeedMps,mufflerA:mA.effectiveSoundSpeedMps,mufflerB:mB.effectiveSoundSpeedMps};
 return{headerA:hA,headerB:hB,collector:col,mufflerA:mA,mufflerB:mB,
  manifoldBackpressureKPa:(manifold-pAmb)/1000,collectorPressureKPa:col.pInPa/1000,tailpipePressureKPa:pAmb/1000,
  maxMach:Math.max(hA.maxMach,hB.maxMach,col.maxMach,mA.maxMach,mB.maxMach),massFlowKgS:mdot,effectiveWaveSpeedMps:wave};
}

function pushAcoustic(){
 if(!CAL.acoustic.enabled||!SOUND?.engine?.profile?.exhaust)return;
 const t=+ORCH.state?.simTimeS||0;
 if(t-state.acoustic.lastPushS<1/CAL.acoustic.pushHz)return;
 state.acoustic.lastPushS=t;
 const target=state.network.effectiveWaveSpeedMps||{};
 const x=SOUND.engine.profile.exhaust;
 if(!x.thermalWaveSpeedMps)x.thermalWaveSpeedMps={};
 let changed=false;
 for(const k of ['headerA','headerB','collector','mufflerA','mufflerB']){
  const trg=clamp(+target[k]||343,CAL.acoustic.minWaveSpeedMps,CAL.acoustic.maxWaveSpeedMps),had=Number.isFinite(+x.thermalWaveSpeedMps[k]);
  const old=had?+x.thermalWaveSpeedMps[k]:trg,next=lerp(old,trg,CAL.acoustic.smooth);
  if(!had||Math.abs(next-old)>.05){x.thermalWaveSpeedMps[k]=next;changed=true}
  state.acoustic.effectiveWaveSpeedMps[k]=next;
 }
 x.thermalBackpressureKPa=state.network.manifoldBackpressureKPa;
 if(changed){try{SOUND.engine.pushProfile?.();state.acoustic.pushCount++}catch(_){}}
 global.__LUCID_ACOUSTIC_THERMAL_PROFILE__={
  schema:'lucid.v128.acoustic-thermofluid-profile.v2',
  source:'V1.25 thermal cells + V1.28 prescribed-flow gas properties',
  effectiveWaveSpeedMps:{...state.acoustic.effectiveWaveSpeedMps},
  manifoldBackpressureKPa:state.network.manifoldBackpressureKPa,
  sections:Object.fromEntries(['headerA','headerB','collector','mufflerA','mufflerB'].map(k=>[k,{
   gasC:(ORCH.state.exhaust[k]?.gasC||[]).slice(),wallC:(ORCH.state.exhaust[k]?.wallC||[]).slice(),
   pressureKPa:(state.network[k]?.cells||[]).map(c=>c.pMeanPa/1000),
   velocityMps:(state.network[k]?.cells||[]).map(c=>c.velocityMps),
   mach:(state.network[k]?.cells||[]).map(c=>c.mach),
   soundSpeedMps:(state.network[k]?.cells||[]).map(c=>c.soundSpeedMps)
  }])),
  consumer:'V1.22 AudioWorklet section-effective delay/resonance speed is LIVE; per-cell pressure waves and engine torque back-pressure remain future gas-exchange authority.'
 };
}

function augmentWheelMaterials(){
 if(!CAL.wheelMaterials.enabled)return;
 const bridge=global.__LUCID_THERMAL_RENDER__,W=TM.state?.wheels;if(!bridge?.nodes||!W)return;
 const add=(nodes,wh)=>{
  for(const n of nodes){
   if(!bridge.nodes[n])bridge.nodes[n]={};
   const isRim=(n===129||n===145),T=isRim?wh.rimC:wh.hubC;
   Object.assign(bridge.nodes[n],{
    tempC:T,emissionStrength:Math.pow(clamp((T-430)/450,0,1),1.7)*.4,
    roughnessOverride:lerp(CAL.wheelMaterials.freshRoughness,CAL.wheelMaterials.hotRoughness,clamp((T-80)/400,0,1)),
    source:'V1.28 brake→hub→rim thermal material bridge'
   });
  }
 };
 add(CAL.wheelMaterials.frontNodes,W.front);add(CAL.wheelMaterials.rearNodes,W.rear);
}

function ribAt(side,xNorm){
 const t=BT.state?.tires?.[side],r=t?.ribs||[];
 if(!r.length)return null;
 xNorm=clamp(xNorm,-1,1);
 let p=(xNorm+1)*.5*(r.length-1),i=Math.floor(p),j=Math.min(r.length-1,i+1),u=p-i;
 return{wear01:lerp(r[i].wear01,r[j].wear01,u),treadDepthMm:lerp(r[i].treadDepthMm,r[j].treadDepthMm,u),surfaceC:lerp(r[i].surfaceC,r[j].surfaceC,u)};
}
global.__LUCID_V128_TIRE_ERODE__=function(rel,side){
 if(!CAL.treadVisual.enabled||!Array.isArray(rel)||rel.length<3)return rel;
 const hw=side==='front'?CAL.treadVisual.frontHalfWidthM:CAL.treadVisual.rearHalfWidthM;
 const rib=ribAt(side,(+rel[0]||0)/Math.max(.02,hw));if(!rib)return rel;
 const radial=Math.hypot(rel[1],rel[2]);if(radial<CAL.treadVisual.startRadiusM)return rel;
 const wear=clamp(rib.wear01,0,1),erode=CAL.treadVisual.maxErosionM*wear;
 if(erode<=0||radial<=erode+.001)return rel;
 const s=(radial-erode)/radial;
 return[rel[0],rel[1]*s,rel[2]*s];
};

function captureSummary(){
 const M=API.free?.last||{},P=PT.states?.free?.last||{},B=BT.state?.brakes||{},T=BT.state?.tires||{},W=TM.state?.wheels||{},S=ORCH.state?.suspension||{};
 return{
  t:+ORCH.state?.simTimeS||+M.timeS||0,
  speedKmh:+M.body?.speedKmh||0,rollDeg:+M.body?.rollDeg||0,pitchDeg:+M.body?.pitchDeg||0,yawDeg:+M.body?.yawDeg||0,
  rpm:+P.engine?.rpm||0,throttle:+P.engine?.throttle||0,gear:+P.gear?.selected||+P.gear||0,crankTorqueNm:+P.engine?.controlledCrankTorqueNm||0,
  clutchSlipRpm:+P.clutch?.slipRpm||0,
  brakeBarF:+M.controls?.frontBrakeBar||0,brakeBarR:+M.controls?.rearBrakeBar||0,
  rotorFrontC:Math.max(+B.frontL?.maxC||0,+B.frontR?.maxC||0),rotorRearC:+B.rear?.maxC||0,
  brakeFactorF:.5*((+B.frontL?.feedbackFactor||1)+(+B.frontR?.feedbackFactor||1)),brakeFactorR:+B.rear?.feedbackFactor||1,
  tireSurfaceF:+T.front?.localSurfaceC||0,tireSurfaceR:+T.rear?.localSurfaceC||0,
  tireCoreF:+T.front?.localCoreC||0,tireCoreR:+T.rear?.localCoreC||0,
  tirePsiF:+T.front?.pressurePsi||0,tirePsiR:+T.rear?.pressurePsi||0,
  tireWearF:+T.front?.localWear01||0,tireWearR:+T.rear?.localWear01||0,
  tireGripF:+T.front?.gripFactor||1,tireGripR:+T.rear?.gripFactor||1,
  forkTravelMm:(+M.suspension?.frontTravelM||0)*1000,rearTravelMm:(+M.suspension?.rearTravelM||0)*1000,
  forkOilC:+S.front?.oilC||0,shockOilC:+S.rear?.oilC||0,
  hubFrontC:+W.front?.hubC||0,rimFrontC:+W.front?.rimC||0,hubRearC:+W.rear?.hubC||0,rimRearC:+W.rear?.rimC||0,
  egtC:+ORCH.state?.source?.egtC||0,tailpipeC:+global.__LUCID_VOLUMETRIC_THERMAL_INPUT__?.tailpipeTempC||0,
  backpressureKPa:+state.network.manifoldBackpressureKPa||0,maxMach:+state.network.maxMach||0,
  waveHA:+state.network.effectiveWaveSpeedMps?.headerA||0,waveHB:+state.network.effectiveWaveSpeedMps?.headerB||0,waveCol:+state.network.effectiveWaveSpeedMps?.collector||0
 };
}
function captureSpatial(){
 const T=BT.state?.tires||{},B=BT.state?.brakes||{},E=ORCH.state?.exhaust||{};
 return{
  t:+ORCH.state?.simTimeS||0,
  tireFront:(T.front?.ribs||[]).map(r=>({x:r.xNorm,surfaceC:r.surfaceC,coreC:r.coreC,wear:r.wear01,treadMm:r.treadDepthMm})),
  tireRear:(T.rear?.ribs||[]).map(r=>({x:r.xNorm,surfaceC:r.surfaceC,coreC:r.coreC,wear:r.wear01,treadMm:r.treadDepthMm})),
  rotorFrontL:(B.frontL?.tempC||[]).map(row=>row.slice()),rotorFrontR:(B.frontR?.tempC||[]).map(row=>row.slice()),rotorRear:(B.rear?.tempC||[]).map(row=>row.slice()),
  exhaust:Object.fromEntries(['headerA','headerB','collector','mufflerA','mufflerB'].map(k=>[k,{gasC:(E[k]?.gasC||[]).slice(),wallC:(E[k]?.wallC||[]).slice(),
   pressureKPa:(state.network[k]?.cells||[]).map(c=>c.pMeanPa/1000)}]))
 };
}
function sessionStart(name){
 const S=state.session;S.recording=true;S.name=String(name||S.name||CAL.session.defaultName);S.startedSimS=+ORCH.state?.simTimeS||0;
 S.frames=[];S.spatial=[];S.lastSampleS=-1e9;S.lastSpatialS=-1e9;S.imported=false;S.playback={playing:false,timeS:0,rate:1};
 return sessionSnapshot();
}
function sessionStop(){state.session.recording=false;return sessionSnapshot()}
function sessionClear(){const name=state.session.name;Object.assign(state.session,{recording:false,name,startedSimS:null,frames:[],spatial:[],lastSampleS:-1e9,lastSpatialS:-1e9,playback:{playing:false,timeS:0,rate:1},imported:false});return sessionSnapshot()}
function sessionSample(){
 const S=state.session;if(!S.recording)return;
 const t=+ORCH.state?.simTimeS||0;
 if(S.startedSimS==null)S.startedSimS=t;
 if(t-S.startedSimS>CAL.session.maxSeconds){S.recording=false;return}
 if(t-S.lastSampleS>=1/CAL.session.sampleHz){S.lastSampleS=t;S.frames.push(captureSummary())}
 if(t-S.lastSpatialS>=1/CAL.session.spatialHz){S.lastSpatialS=t;S.spatial.push(captureSpatial())}
}
function sessionDuration(){
 const F=state.session.frames;if(F.length<2)return 0;return Math.max(0,F[F.length-1].t-F[0].t);
}
function sessionFrameAt(relativeS){
 const F=state.session.frames;if(!F.length)return null;
 const target=F[0].t+clamp(+relativeS||0,0,sessionDuration());
 let lo=0,hi=F.length-1;
 while(lo<hi){let m=(lo+hi)>>1;if(F[m].t<target)lo=m+1;else hi=m}
 if(lo>0&&Math.abs(F[lo-1].t-target)<Math.abs(F[lo].t-target))lo--;
 return F[lo];
}
function sessionSpatialAt(relativeS){
 const F=state.session.spatial;if(!F.length)return null,target=(state.session.frames[0]?.t||F[0].t)+clamp(+relativeS||0,0,sessionDuration());
 let best=F[0],d=Math.abs(best.t-target);for(const f of F){let z=Math.abs(f.t-target);if(z<d){best=f;d=z}}return best;
}
function sessionSnapshot(){return deep({schema:'lucid.v128.session-export.v1',name:state.session.name,authority:AUTHORITY.session,sampleHz:CAL.session.sampleHz,spatialHz:CAL.session.spatialHz,frames:state.session.frames,spatial:state.session.spatial})}
function importSession(obj){
 if(!obj||!Array.isArray(obj.frames))throw Error('Invalid V1.28 session');
 state.session.recording=false;state.session.name=String(obj.name||'Imported session');state.session.frames=deep(obj.frames);state.session.spatial=deep(obj.spatial||[]);
 state.session.imported=true;state.session.playback={playing:false,timeS:0,rate:1};return sessionSnapshot();
}
function download(name,text,type='application/json'){
 const a=D.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;D.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},200);
}
function exportSessionJSON(){const s=sessionSnapshot();download((s.name||'session').replace(/[^\w.-]+/g,'_')+'.json',JSON.stringify(s,null,2))}
function exportSessionCSV(){
 const F=state.session.frames;if(!F.length)return;
 const keys=Object.keys(F[0]),csv=[keys.join(',')].concat(F.map(f=>keys.map(k=>Number.isFinite(+f[k])?f[k]:String(f[k]??'').replaceAll(',',';')).join(','))).join('\n');
 download((state.session.name||'session').replace(/[^\w.-]+/g,'_')+'.csv',csv,'text/csv');
}

function flowStep(){
 const N=computeNetworkAt();if(!N)return;
 Object.assign(state.network,N);state.simTimeS=+ORCH.state?.simTimeS||state.simTimeS;
 pushAcoustic();augmentWheelMaterials();sessionSample();
 global.__LUCID_THERMOFLUID__={
  schema:'lucid.v128.thermofluid-bridge.v1',
  massFlowKgS:N.massFlowKgS,manifoldBackpressureKPa:N.manifoldBackpressureKPa,maxMach:N.maxMach,
  effectiveWaveSpeedMps:{...N.effectiveWaveSpeedMps},
  sections:Object.fromEntries(['headerA','headerB','collector','mufflerA','mufflerB'].map(k=>[k,{pressureDropPa:N[k].pressureDropPa,pInPa:N[k].pInPa,pOutPa:N[k].pOutPa,maxMach:N[k].maxMach,effectiveSoundSpeedMps:N[k].effectiveSoundSpeedMps}]))
 };
}
function runFlowSweep(){
 const rows=[];for(let mdot=.008;mdot<=.1451;mdot+=.006){const N=computeNetworkAt(mdot);if(N)rows.push({mdot,backpressureKPa:N.manifoldBackpressureKPa,maxMach:N.maxMach,cHeaderA:N.effectiveWaveSpeedMps.headerA,cCollector:N.effectiveWaveSpeedMps.collector})}
 state.flowSweep={schema:'lucid.v128.flow-sweep.v1',rows,ambientPressurePa:CAL.ambientPressurePa};drawFlowSweep();return deep(state.flowSweep);
}

// -------- Secondary WebGL2 refractive heat-haze overlay --------
let haze=null;
function compile(gl,type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'shader compile');return s}
function makeProgram(gl,vs,fs){let p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)||'program link');return p}
function initHaze(){
 if(haze||!CAL.haze.enabled)return;
 try{
  const view=q('view'),src=q('gl');if(!view||!src)return;
  let c=D.createElement('canvas');c.id='v128HazeCanvas';view.appendChild(c);
  const gl=c.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:false});
  if(!gl)throw Error('WebGL2 unavailable');
  const vs=`#version 300 es
  precision highp float;const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));out vec2 uv;
  void main(){vec2 p=P[gl_VertexID];uv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
  const fs=`#version 300 es
  precision highp float;in vec2 uv;out vec4 o;uniform sampler2D scene;uniform vec2 resolution;uniform int nHeat;uniform vec4 heat[6];uniform float time;uniform float dispPx;
  void main(){vec2 px=uv*resolution;vec2 off=vec2(0);float field=0.;
   for(int i=0;i<6;i++){if(i>=nHeat)break;vec2 d=px-heat[i].xy;float r=max(8.,heat[i].z);float w=exp(-dot(d,d)/(r*r))*heat[i].w;field+=w;
    float ph=sin((d.y*.075)+(time*7.1)+float(i)*2.3)+sin((d.x*.047)-(time*5.3)+float(i));off+=vec2(ph,sin(ph*1.7+time*3.))*w;}
   field=clamp(field,0.,1.);vec2 duv=off*(dispPx/max(resolution.x,resolution.y));vec3 col=texture(scene,clamp(uv+duv,vec2(0),vec2(1))).rgb;
   o=vec4(col,field*.46);
  }`;
  let p=makeProgram(gl,vs,fs),tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  haze={canvas:c,gl,program:p,tex,src,last:0,loc:{res:gl.getUniformLocation(p,'resolution'),n:gl.getUniformLocation(p,'nHeat'),heat:gl.getUniformLocation(p,'heat[0]'),time:gl.getUniformLocation(p,'time'),disp:gl.getUniformLocation(p,'dispPx')}};
  state.haze.available=true;
 }catch(e){state.haze.available=false;state.haze.lastError=String(e?.message||e)}
}
function projectWorld(p){
 const m=global.__VP__,src=q('gl');if(!m||!src||!p)return null;
 let x=p[0],y=p[1],z=p[2],cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],cw=m[3]*x+m[7]*y+m[11]*z+m[15];
 if(cw<=.01)return null;let nx=cx/cw,ny=cy/cw;if(Math.abs(nx)>1.25||Math.abs(ny)>1.25)return null;
 return[(nx*.5+.5)*src.clientWidth,(1-(ny*.5+.5))*src.clientHeight];
}
function qrot(qq,v){if(!qq)return v.slice();let x=qq[0],y=qq[1],z=qq[2],w=qq[3],vx=v[0],vy=v[1],vz=v[2],tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);return[vx+w*tx+(y*tz-z*ty),vy+w*ty+(z*tx-x*tz),vz+w*tz+(x*ty-y*tx)]}
function localWorld(local){let F=API.free,p=F?.p||[0,0,0],r=qrot(F?.q,local);return[p[0]+r[0],p[1]+r[1],p[2]+r[2]]}
function hazeEmitters(){
 const V=global.__LUCID_VOLUMETRIC_THERMAL_INPUT__||{},kin=global.__FREE_VISUAL_KINEMATICS__||{},out=[];
 const add=(wp,r,s)=>{let p=projectWorld(wp);if(p&&s>CAL.haze.minStrength)out.push([p[0],p[1],r,s])};
 let ex=clamp(+V.exhaustHeatHaze01||0,0,1);add(localWorld([-.105,-.68,.22]),CAL.haze.exhaustRadiusPx,ex);add(localWorld([.105,-.68,.22]),CAL.haze.exhaustRadiusPx,ex);
 let bf=clamp(+V.frontBrakeHeat01||0,0,1),br=clamp(+V.rearBrakeHeat01||0,0,1);if(kin.frontHub)add(kin.frontHub,CAL.haze.brakeRadiusPx,bf);if(kin.rearHub)add(kin.rearHub,CAL.haze.brakeRadiusPx,br);
 return out.slice(0,CAL.haze.maxEmitters);
}
function drawHaze(t){
 initHaze();if(!haze)return;
 const allowed=['RIDE','VOLUMETRICS','THERMAL','MATERIALS'].includes(activePage()),emit=allowed?hazeEmitters():[];
 const maxS=emit.reduce((m,e)=>Math.max(m,e[3]),0);state.haze.active=allowed&&maxS>CAL.haze.minStrength;
 haze.canvas.style.display=state.haze.active?'block':'none';if(!state.haze.active)return;
 const fps=activePage()==='RIDE'?CAL.haze.maxFpsRide:CAL.haze.maxFpsLab;if(t-haze.last<1000/fps)return;haze.last=t;
 try{
  const scale=activePage()==='RIDE'?CAL.haze.rideScale:CAL.haze.labScale,src=haze.src,gl=haze.gl,w=Math.max(2,Math.round(src.clientWidth*scale)),h=Math.max(2,Math.round(src.clientHeight*scale));
  if(haze.canvas.width!==w||haze.canvas.height!==h){haze.canvas.width=w;haze.canvas.height=h}
  const sx=w/Math.max(1,src.clientWidth),sy=h/Math.max(1,src.clientHeight),arr=new Float32Array(CAL.haze.maxEmitters*4);
  emit.forEach((e,i)=>{arr[i*4]=e[0]*sx;arr[i*4+1]=e[1]*sy;arr[i*4+2]=e[2]*Math.sqrt(sx*sy);arr[i*4+3]=e[3]});
  gl.viewport(0,0,w,h);gl.useProgram(haze.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,haze.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  gl.uniform2f(haze.loc.res,w,h);gl.uniform1i(haze.loc.n,emit.length);gl.uniform4fv(haze.loc.heat,arr);gl.uniform1f(haze.loc.time,t*.001);gl.uniform1f(haze.loc.disp,CAL.haze.displacementPx*scale);
  gl.drawArrays(gl.TRIANGLES,0,3);state.haze.frames++;
 }catch(e){state.haze.lastError=String(e?.message||e);state.haze.active=false;haze.canvas.style.display='none'}
}

function enter(page){
 const allowed=['DYNAMICS','SUSPENSION','BRAKES','TIRES','THERMAL','WEAR','MATERIALS','VOLUMETRICS','EXHAUST','SESSIONS'];
 const base=q('v123Nav')?.querySelector('button[data-v123-page="DYNAMICS"]');
 if(activePage()==='RIDE'||!allowed.includes(activePage()))base?.click();
 try{API.setDomain?.('FREE_ROAD')}catch(_){}
 D.body.dataset.v123Page=page;global.__LUCID_ACTIVE_PAGE__=page;global.__LUCID_PERF_MODE__='LAB';
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page===page));
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page===page));
 const info=page==='EXHAUST'?['EXHAUST THERMOFLUID','pressure · flow · Mach · local acoustic wave speed']:['THERMAL SESSIONS','record · synchronize · scrub · export'];
 const title=q('v123PageTitle');if(title){title.querySelector('strong').textContent=info[0];title.querySelector('span').textContent=info[1]}
 if(q('v123Domain'))q('v123Domain').textContent='FREE_ROAD · '+page;
}
const CSS=`
body.v123 #v123Brand strong:after{content:" · V1.28 THERMOFLUID"!important;color:#73e6ce;font-weight:500}
body[data-v123-page="EXHAUST"] #app,body[data-v123-page="SESSIONS"] #app{grid-template-columns:minmax(0,1fr) min(700px,52vw);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="EXHAUST"] #v125LabDock,body[data-v123-page="SESSIONS"] #v125LabDock{display:block}
body[data-v123-page="EXHAUST"] #v123Right,body[data-v123-page="SESSIONS"] #v123Right{display:none!important}
#v128HazeCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:8;pointer-events:none}
.v128Table{width:100%;border-collapse:collapse;font:9px ui-monospace;color:#a5bdc7}.v128Table th,.v128Table td{padding:5px 6px;border-bottom:1px solid #16303a;text-align:right}.v128Table th:first-child,.v128Table td:first-child{text-align:left}.v128Table th{color:#70e5ce;font-weight:600}
.v128Controls{display:flex;gap:6px;flex-wrap:wrap;margin:7px 0}.v128Controls button{background:#102832;border:1px solid #315260;color:#d7ebf1;padding:6px 9px;border-radius:4px;font:9px ui-monospace;cursor:pointer}.v128Controls button.hot{border-color:#6ae1c7;color:#85f2db}
.v128SessionBar{display:grid;grid-template-columns:1fr auto auto;gap:7px;align-items:center}.v128SessionBar input[type=range]{width:100%}
.v128Stat{display:grid;grid-template-columns:1fr auto;gap:8px;font:9px ui-monospace;padding:4px 0;border-bottom:1px solid #132b35;color:#92acb6}.v128Stat b{color:#e5f4f7}
.v128Canvas{width:100%;height:220px;background:#061015;border:1px solid #1f3a45;border-radius:5px}
`;
function addStyle(){let s=D.createElement('style');s.textContent=CSS;D.head.appendChild(s)}
function addNav(){
 const nav=q('v123Nav');if(!nav)return;
 for(const [page,label] of [['EXHAUST','EXHAUST FLOW'],['SESSIONS','SESSIONS']])if(!nav.querySelector(`[data-v123-page="${page}"]`)){
  let b=D.createElement('button');b.className='v125Nav';b.dataset.v123Page=page;b.textContent=label;b.onclick=e=>{e.preventDefault();e.stopPropagation();enter(page)};nav.appendChild(b)
 }
}
function addPages(){
 const dock=q('v125LabDock');if(!dock)return;
 if(!dock.querySelector('[data-v125-page="EXHAUST"]')){
  let p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='EXHAUST';p.innerHTML=`
  <div class="v125Head"><h2>EXHAUST THERMOFLUID / ACOUSTIC NETWORK</h2><p>One segmented path now publishes gas temperature, wall temperature, pressure, density, velocity, Mach number and acoustic speed. Prescribed mass flow is inherited from the calibrated V1.25 source proxy; calculated back-pressure remains shadow-only for engine torque.</p></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>LIVE NETWORK</h3><div id="v128FlowSummary"></div><div class="v128Controls"><button id="v128FlowSweep">RUN MASS-FLOW SWEEP</button><button id="v128AcousticToggle">ACOUSTIC LIVE</button></div></div>
   <div class="v125Card"><h3>AUTHORITY</h3><div class="v125Note v125Good">LIVE acoustic wave speed by section. SHADOW manifold back-pressure. V1.25 wall/gas temperatures remain the thermal authority.</div><div id="v128HazeSummary"></div></div>
   <div class="v125Card full"><h3>SECTION STATE</h3><div id="v128SectionTable"></div></div>
   <div class="v125Card full"><h3>FLOW / BACK-PRESSURE SWEEP</h3><canvas id="v128FlowCanvas" class="v128Canvas" width="1000" height="240"></canvas><div id="v128FlowResult" class="v125Note">Uses current thermal cell temperatures while sweeping prescribed mass flow. It does not alter the live engine.</div></div>
  </div>`;dock.appendChild(p)
 }
 if(!dock.querySelector('[data-v125-page="SESSIONS"]')){
  let p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='SESSIONS';p.innerHTML=`
  <div class="v125Head"><h2>THERMAL / DYNAMICS SESSION RECORDER</h2><p>One synchronized run can be inspected by suspension, brakes, tires, sound, materials and exhaust development. Replay is analysis-only; it never rewinds the live physics solver.</p></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>CAPTURE</h3><label class="v125Field"><span>session name</span><input id="v128SessionName" type="text" value="${CAL.session.defaultName}"><small>RUN</small></label><div class="v128Controls"><button id="v128RecStart" class="hot">START</button><button id="v128RecStop">STOP</button><button id="v128RecClear">CLEAR</button></div><div id="v128SessionSummary"></div></div>
   <div class="v125Card"><h3>TRANSFER</h3><div class="v128Controls"><button id="v128ExportJson">EXPORT JSON</button><button id="v128ExportCsv">EXPORT CSV</button><button id="v128Import">IMPORT JSON</button><input id="v128ImportFile" type="file" accept=".json,application/json" hidden></div><div class="v125Note">Summary is sampled at ${CAL.session.sampleHz} Hz; full spatial tire/rotor/exhaust fields at ${CAL.session.spatialHz} Hz.</div></div>
   <div class="v125Card full"><h3>ANALYSIS PLAYBACK</h3><div class="v128SessionBar"><input id="v128SessionSlider" type="range" min="0" max="0" step=".01" value="0"><button id="v128SessionPlay">PLAY</button><b id="v128SessionClock">0.00 s</b></div><div id="v128SessionFrame"></div></div>
   <div class="v125Card full"><h3>SYNCHRONIZED RUN TRACE</h3><canvas id="v128SessionCanvas" class="v128Canvas" width="1000" height="250"></canvas></div>
  </div>`;dock.appendChild(p)
 }
}
function statRows(el,rows){if(el)el.innerHTML=rows.map(r=>`<div class="v128Stat"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}
function updateFlowUI(){
 if(activePage()!=='EXHAUST')return;const N=state.network;
 statRows(q('v128FlowSummary'),[['mass flow',fmt(N.massFlowKgS,4)+' kg/s'],['manifold back-pressure',fmt(N.manifoldBackpressureKPa,2)+' kPa'],['collector absolute pressure',fmt(N.collectorPressureKPa,1)+' kPa'],['max Mach',fmt(N.maxMach,3)],['acoustic bridge',CAL.acoustic.enabled?'LIVE':'BYPASS']]);
 statRows(q('v128HazeSummary'),[['GPU haze',state.haze.available?(CAL.haze.enabled?'READY':'DISABLED'):'UNAVAILABLE'],['haze frames',String(state.haze.frames)],['tread visual erosion',CAL.treadVisual.enabled?'LIVE VISUAL':'OFF']]);
 const secs=['headerA','headerB','collector','mufflerA','mufflerB'];let H='<table class="v128Table"><thead><tr><th>section</th><th>Δp kPa</th><th>p-in kPa</th><th>flow m/s</th><th>Mach max</th><th>c eff m/s</th></tr></thead><tbody>';
 for(const k of secs){let s=N[k],vel=s?.cells?.reduce((a,c)=>a+c.velocityMps,0)/Math.max(1,s?.cells?.length||1);H+=`<tr><td>${k}</td><td>${fmt((s?.pressureDropPa||0)/1000,3)}</td><td>${fmt((s?.pInPa||0)/1000,1)}</td><td>${fmt(vel,1)}</td><td>${fmt(s?.maxMach,3)}</td><td>${fmt(s?.effectiveSoundSpeedMps,1)}</td></tr>`}H+='</tbody></table>';if(q('v128SectionTable'))q('v128SectionTable').innerHTML=H;
}
function prepCanvas(id){let c=q(id);if(!c)return null;let x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle='#061015';x.fillRect(0,0,w,h);return{x,w,h}}
function drawFlowSweep(){
 let C=prepCanvas('v128FlowCanvas'),R=state.flowSweep?.rows;if(!C||!R?.length)return;let{x,w,h}=C;
 const maxBp=Math.max(1,...R.map(r=>r.backpressureKPa)),maxM=Math.max(.05,...R.map(r=>r.maxMach)),x0=54,y0=h-34,ww=w-78,hh=h-58;
 x.strokeStyle='#29434d';x.strokeRect(x0,18,ww,hh);x.font='10px ui-monospace';x.fillStyle='#8da8b2';x.fillText('mass flow kg/s →',w-130,h-10);
 const plot=(key,max,col)=>{x.strokeStyle=col;x.lineWidth=2;x.beginPath();R.forEach((r,i)=>{let X=x0+i/(R.length-1)*ww,Y=y0-clamp(r[key]/max,0,1)*hh;i?x.lineTo(X,Y):x.moveTo(X,Y)});x.stroke()};
 plot('backpressureKPa',maxBp,'#ffbd6e');plot('maxMach',maxM,'#69e5d0');x.fillStyle='#ffbd6e';x.fillText('back-pressure',60,15);x.fillStyle='#69e5d0';x.fillText('Mach',155,15);
 if(q('v128FlowResult'))q('v128FlowResult').textContent=`${R.length} points · ${fmt(R[0].mdot,3)}→${fmt(R.at(-1).mdot,3)} kg/s · peak shadow back-pressure ${fmt(maxBp,2)} kPa · peak Mach ${fmt(maxM,3)}`;
}
function drawSession(){
 let C=prepCanvas('v128SessionCanvas'),F=state.session.frames;if(!C||F.length<2)return;let{x,w,h}=C,t0=F[0].t,t1=F.at(-1).t,x0=46,y0=h-27,ww=w-66,hh=h-48;
 x.strokeStyle='#27414b';x.strokeRect(x0,14,ww,hh);
 const plot=(key,min,max,col)=>{x.strokeStyle=col;x.lineWidth=1.8;x.beginPath();F.forEach((f,i)=>{let X=x0+(f.t-t0)/Math.max(.001,t1-t0)*ww,Y=y0-clamp((f[key]-min)/Math.max(.001,max-min),0,1)*hh;i?x.lineTo(X,Y):x.moveTo(X,Y)});x.stroke()};
 plot('rpm',0,11000,'#73dff7');plot('speedKmh',0,250,'#7decaa');plot('rotorFrontC',0,900,'#ff8a66');plot('tireSurfaceR',0,160,'#ffcf68');plot('backpressureKPa',0,Math.max(15,...F.map(f=>f.backpressureKPa||0)),'#d48cff');
 x.font='10px ui-monospace';[['RPM','#73dff7'],['speed','#7decaa'],['front rotor','#ff8a66'],['rear tire','#ffcf68'],['back-pressure','#d48cff']].forEach((a,i)=>{x.fillStyle=a[1];x.fillText(a[0],54+i*112,12)});
}
function updateSessionUI(){
 if(activePage()!=='SESSIONS')return;const S=state.session,d=sessionDuration(),pb=S.playback;
 if(q('v128SessionName')&&D.activeElement!==q('v128SessionName'))q('v128SessionName').value=S.name;
 statRows(q('v128SessionSummary'),[['state',S.recording?'RECORDING':S.imported?'IMPORTED':'IDLE'],['summary frames',String(S.frames.length)],['spatial frames',String(S.spatial.length)],['duration',fmt(d,2)+' s']]);
 let slider=q('v128SessionSlider');if(slider){slider.max=String(Math.max(.001,d));if(D.activeElement!==slider)slider.value=String(clamp(pb.timeS,0,d))}
 if(q('v128SessionClock'))q('v128SessionClock').textContent=fmt(pb.timeS,2)+' / '+fmt(d,2)+' s';
 if(q('v128SessionPlay'))q('v128SessionPlay').textContent=pb.playing?'PAUSE':'PLAY';
 const f=sessionFrameAt(pb.timeS);if(f)statRows(q('v128SessionFrame'),[['speed / RPM',fmt(f.speedKmh,1)+' km/h · '+fmt(f.rpm,0)+' rpm'],['gear / throttle',String(f.gear)+' · '+fmt(f.throttle*100,0)+' %'],['rotor front / rear',fmt(f.rotorFrontC,0)+' / '+fmt(f.rotorRearC,0)+' °C'],['tire surface F / R',fmt(f.tireSurfaceF,1)+' / '+fmt(f.tireSurfaceR,1)+' °C'],['pressure F / R',fmt(f.tirePsiF,2)+' / '+fmt(f.tirePsiR,2)+' psi'],['fork / rear travel',fmt(f.forkTravelMm,1)+' / '+fmt(f.rearTravelMm,1)+' mm'],['exhaust back-pressure',fmt(f.backpressureKPa,2)+' kPa'],['Header A / B wave speed',fmt(f.waveHA,0)+' / '+fmt(f.waveHB,0)+' m/s']]);
 drawSession();
}
function bind(){
 q('v128FlowSweep').onclick=runFlowSweep;
 q('v128AcousticToggle').onclick=()=>{CAL.acoustic.enabled=!CAL.acoustic.enabled;q('v128AcousticToggle').textContent=CAL.acoustic.enabled?'ACOUSTIC LIVE':'ACOUSTIC BYPASS'};
 q('v128RecStart').onclick=()=>sessionStart(q('v128SessionName')?.value);
 q('v128RecStop').onclick=sessionStop;q('v128RecClear').onclick=sessionClear;
 q('v128ExportJson').onclick=exportSessionJSON;q('v128ExportCsv').onclick=exportSessionCSV;
 q('v128Import').onclick=()=>q('v128ImportFile')?.click();
 q('v128ImportFile').onchange=async e=>{let f=e.target.files?.[0];if(!f)return;try{importSession(JSON.parse(await f.text()))}catch(err){alert('Session import failed: '+err.message)}e.target.value=''};
 q('v128SessionSlider').oninput=e=>{state.session.playback.timeS=+e.target.value||0;state.session.playback.playing=false;updateSessionUI()};
 q('v128SessionPlay').onclick=()=>{if(state.session.frames.length)state.session.playback.playing=!state.session.playback.playing};
}
let lastSim=-1e9,uiLast=0,playLast=performance.now();
function scheduler(t){
 const sim=+ORCH.state?.simTimeS||0;if(sim<lastSim-1e-6)lastSim=sim;
 if(sim-lastSim>=1/CAL.flowHz){lastSim=sim;flowStep()}
 if(t-uiLast>100){uiLast=t;if(activePage()==='EXHAUST')updateFlowUI();else if(activePage()==='SESSIONS')updateSessionUI()}
 let rdt=clamp((t-playLast)/1000,0,.1);playLast=t;
 if(state.session.playback.playing){let d=sessionDuration();state.session.playback.timeS+=rdt*state.session.playback.rate;if(state.session.playback.timeS>=d){state.session.playback.timeS=d;state.session.playback.playing=false}}
 drawHaze(t);global.requestAnimationFrame(scheduler)
}
function boot(){
 addStyle();addNav();addPages();bind();flowStep();runFlowSweep();initHaze();global.requestAnimationFrame(scheduler);global.__LUCID_V128_READY__=true;
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

global.LUCID_THERMOFLUID={
 version:'V1.28.0',calibration:CAL,authority:AUTHORITY,state,
 computeNetwork:()=>deep(computeNetworkAt()),runFlowSweep,
 setAcousticLive:v=>{CAL.acoustic.enabled=!!v;return CAL.acoustic.enabled},
 setTreadVisual:v=>{CAL.treadVisual.enabled=!!v;return CAL.treadVisual.enabled},
 setHaze:v=>{CAL.haze.enabled=!!v;return CAL.haze.enabled},
 enterExhaust:()=>enter('EXHAUST'),enterSessions:()=>enter('SESSIONS'),
 session:{
  start:sessionStart,stop:sessionStop,clear:sessionClear,snapshot:sessionSnapshot,import:importSession,
  frameAt:t=>deep(sessionFrameAt(t)),spatialAt:t=>deep(sessionSpatialAt(t)),duration:sessionDuration
 },
 development:{
  step:flowStep,augmentWheelMaterials,pushAcoustic,captureSummary,captureSpatial,
  solvePipeBackward:(name,pipe,mdot,pOut,diam)=>deep(solvePipeBackward(name,pipe,mdot,pOut,diam))
 }
};
global.LUCID_SESSION_BUS={
 schema:'lucid.v128.session-bus.v1',
 get recording(){return state.session.recording},
 get frames(){return state.session.frames},
 get spatial(){return state.session.spatial},
 get durationS(){return sessionDuration()},
 frameAt:t=>sessionFrameAt(t),spatialAt:t=>sessionSpatialAt(t),snapshot:sessionSnapshot
};
})(typeof window!=='undefined'?window:globalThis);

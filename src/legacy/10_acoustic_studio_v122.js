

(function(global){
'use strict';
if(global.__DUCATI_V122_ACOUSTIC_STUDIO__) return;

const TAU=Math.PI*2, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const deepClone=o=>JSON.parse(JSON.stringify(o));
const nowMs=()=>typeof performance!=='undefined'?performance.now():Date.now();

const MESH_SEED=Object.freeze({
 schema:'ducati916.acoustic-visual-mesh-seed.v1',
 authority:'embedded GLB visual geometry proxy; muffler PCA dimensions measured from render mesh; header acoustic path lengths remain editable path-length proxies, not CFD/centerline measurements',
 sourceNodes:{
  headerA:{node:23,name:'ExhaustHeaderPipe_0',pcaSpanM:[0.72201367,0.59777415,0.29692743]},
  headerB:{node:31,name:'ExhaustHeaderPipe_4',pcaSpanM:[1.13450448,0.57837154,0.16219531]},
  mufflerA:{node:25,name:'UnderseatMuffler_1_Shell',pcaSpanM:[0.49402852,0.15039979,0.14306412]},
  mufflerB:{node:28,name:'UnderseatMuffler_2_Shell',pcaSpanM:[0.49402865,0.15039985,0.14306404]}
 },
 stockHeaderDiameterM:.045,
 stockHeaderDiameterAuthority:'916 Strada 45 mm exhaust family reference; treated as nominal outside/nominal system diameter rather than proven acoustic bore',
 headerAEffectiveLengthM:.88,
 headerBEffectiveLengthM:1.25,
 headerPathAuthority:'visual-envelope-to-path proxy only; intentionally user-calibratable',
 mufflerShellLengthM:.49403,
 mufflerShellEquivalentDiameterM:.1466,
 mufflerExternalEnvelopeVolumeL:8.34,
 mufflerAcousticChamberVolumeL:5.70
});

const DEFAULT_PROFILE={
 schema:'lucid.acoustic-profile.v1',
 name:'Ducati 916 · GLB acoustic seed',
 version:'1.0',
 authority:{
  firing:'90-degree single-pin four-stroke V-twin pattern: 0/270 degrees over 720-degree cycle',
  geometry:MESH_SEED.authority,
  fidelity:'real-time procedural acoustic model; not a 1-D CFD/gas-dynamics solver and not a calibrated SPL prediction'
 },
 engine:{
  cycleDeg:720,
  firingDeg:[0,270],
  intakeOffsetDeg:360,
  combustionPulseMs:3.6,
  pulseSharpness:.72,
  cycleJitter:.006,
  loadExponent:.72,
  overrunPops:.12,
  overrunThresholdRpm:3600,
  idleRoughness:.045
 },
 exhaust:{
  gasTempC:560,
  wallLoss:.12,
  pulseGain:1.0,
  mergeGain:.86,
  headerA:{lengthM:MESH_SEED.headerAEffectiveLengthM,diameterM:.045,reflection:.71},
  headerB:{lengthM:MESH_SEED.headerBEffectiveLengthM,diameterM:.045,reflection:.71},
  collector:{lengthM:.31,diameterM:.050,reflection:.60},
  muffler:{lengthM:MESH_SEED.mufflerShellLengthM,chamberVolumeL:MESH_SEED.mufflerAcousticChamberVolumeL,coreDiameterM:.042,outletDiameterM:.042,absorption:.38,reflection:.55},
  tailpipeHighpassHz:58,
  saturation:1.22
 },
 intake:{
  airTempC:28,
  pulseGain:.68,
  runnerA:{lengthM:.245,diameterM:.050,reflection:.58},
  runnerB:{lengthM:.255,diameterM:.050,reflection:.58},
  airboxVolumeL:8.2,
  snorkelLengthM:.19,
  snorkelDiameterM:.050,
  filterLoss:.20,
  airboxQ:4.6
 },
 mechanical:{
  crankOrderGain:.12,
  valveGain:.20,
  beltGain:.08,
  clutchGain:.24,
  gearGain:.11,
  chainGain:.08,
  gearMeshOrder:18,
  rearSprocketTeeth:36,
  bodyResonanceHz:188,
  bodyResonanceQ:3.4
 },
 mixer:{
  master:.70,
  exhaust:.82,
  intake:.48,
  mechanical:.40,
  driveline:.34,
  environmentWet:.10,
  listenerDistanceM:2.5,
  airAbsorption:.18,
  perspective:'CHASE',
 },
 development:{
  followSimulation:true,
  previewRpm:1800,
  previewThrottle:.10,
  previewLoadNm:8,
  telemetryHz:30
 }
};

const PRESETS={
 '916_GLBS_SEED':DEFAULT_PROFILE,
 '916_OPEN_45':(()=>{
   let p=deepClone(DEFAULT_PROFILE);p.name='Ducati 916 · open 45 mm';p.exhaust.muffler.absorption=.16;p.exhaust.muffler.outletDiameterM=.045;p.exhaust.muffler.coreDiameterM=.045;p.exhaust.muffler.reflection=.48;p.exhaust.saturation=1.34;p.mixer.exhaust=.92;return p;
 })(),
 '916_RACE_50':(()=>{
   let p=deepClone(DEFAULT_PROFILE);p.name='Ducati 916 · race 50 mm concept';p.exhaust.headerA.diameterM=.050;p.exhaust.headerB.diameterM=.050;p.exhaust.collector.diameterM=.054;p.exhaust.muffler.coreDiameterM=.050;p.exhaust.muffler.outletDiameterM=.050;p.exhaust.muffler.absorption=.12;p.exhaust.wallLoss=.08;p.exhaust.saturation=1.38;p.mixer.exhaust=.96;return p;
 })(),
 'NEUTRAL_DEV':(()=>{
   let p=deepClone(DEFAULT_PROFILE);p.name='Neutral acoustic development';p.exhaust.muffler.absorption=.28;p.mixer.environmentWet=0;p.mixer.listenerDistanceM=1;p.engine.cycleJitter=0;p.engine.idleRoughness=0;return p;
 })()
};

function speedOfSound(tempC,gamma=1.4){return Math.sqrt(gamma*287.05*(Math.max(-50,+tempC||0)+273.15))}
function areaD(d){return Math.PI*Math.pow(Math.max(.001,+d||.001),2)/4}
function quarterWave(c,L){return c/(4*Math.max(.03,+L||.03))}
function halfWave(c,L){return c/(2*Math.max(.03,+L||.03))}
function helmholtz(c,diameterM,volumeL,neckLengthM){
 const d=Math.max(.005,+diameterM||.005),A=areaD(d),V=Math.max(.0001,(+volumeL||.1)/1000),r=d/2,Le=Math.max(.005,+neckLengthM||.005)+1.7*r;
 return c/(TAU)*Math.sqrt(A/(V*Le));
}
function mismatchReflection(d1,d2){
 const a=areaD(d1),b=areaD(d2);return (b-a)/(b+a);
}
function normalizeFiring(list,cycle){
 cycle=Math.max(180,+cycle||720);
 let a=(Array.isArray(list)?list:[]).map(Number).filter(Number.isFinite).map(x=>((x%cycle)+cycle)%cycle).sort((a,b)=>a-b);
 return a.length?a:[0];
}
function acousticMetrics(profile){
 const p=profile||DEFAULT_PROFILE,e=p.engine||{},x=p.exhaust||{},i=p.intake||{},cycle=Math.max(180,+e.cycleDeg||720),fires=normalizeFiring(e.firingDeg,cycle);
 const cEx=speedOfSound(x.gasTempC,1.33),cIn=speedOfSound(i.airTempC,1.40),tw=x.thermalWaveSpeedMps||{};
 const cHA=+tw.headerA||cEx,cHB=+tw.headerB||cEx,cCOL=+tw.collector||cEx,cMA=+tw.mufflerA||cEx,cMB=+tw.mufflerB||cEx,cM=.5*(cMA+cMB);
 const muff=x.muffler||{},col=x.collector||{},hA=x.headerA||{},hB=x.headerB||{},rA=i.runnerA||{},rB=i.runnerB||{};
 const m={
  cExhaustMps:cEx,cIntakeMps:cIn,cycleDeg:cycle,firingDeg:fires,
  crankCycleOrder:360/cycle,
  thermalWaveSpeedMps:{headerA:cHA,headerB:cHB,collector:cCOL,mufflerA:cMA,mufflerB:cMB},
  exhaust:{
   headerAHz:quarterWave(cHA,hA.lengthM),headerBHz:quarterWave(cHB,hB.lengthM),
   collectorHz:halfWave(cCOL,col.lengthM),mufflerLongitudinalHz:halfWave(cM,muff.lengthM),
   mufflerHelmholtzHz:helmholtz(cM,muff.outletDiameterM,muff.chamberVolumeL,Math.max(.04,muff.lengthM*.17)),
   headerCollectorReflectionA:mismatchReflection(hA.diameterM,col.diameterM),
   headerCollectorReflectionB:mismatchReflection(hB.diameterM,col.diameterM),
   collectorCoreReflection:mismatchReflection(col.diameterM,muff.coreDiameterM),
   coreOutletReflection:mismatchReflection(muff.coreDiameterM,muff.outletDiameterM),
   collectorOutletReflection:mismatchReflection(col.diameterM,muff.outletDiameterM)
  },
  intake:{
   runnerAHz:quarterWave(cIn,rA.lengthM),runnerBHz:quarterWave(cIn,rB.lengthM),
   snorkelHz:quarterWave(cIn,i.snorkelLengthM),
   airboxHelmholtzHz:helmholtz(cIn,i.snorkelDiameterM,i.airboxVolumeL,i.snorkelLengthM)
  }
 };
 return m;
}
function dynamicMetrics(profile,state){
 const base=acousticMetrics(profile),rpm=Math.max(0,+state?.rpm||0),cycleHz=rpm/60*(360/base.cycleDeg),fireHz=cycleHz*base.firingDeg.length;
 return {...base,rpm,cycleHz,firingRateHz:fireHz,crankHz:rpm/60,camHz:rpm/120};
}

const WORKLET_SOURCE=String.raw`
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function cSound(t,g){return Math.sqrt(g*287.05*(Math.max(-50,+t||0)+273.15))}
function areaD(d){return Math.PI*Math.pow(Math.max(.001,+d||.001),2)/4}
function mismatch(d1,d2){let a=areaD(d1),b=areaD(d2);return(b-a)/(b+a)}
function helm(c,d,vL,L){const A=areaD(d),V=Math.max(.0001,vL/1000),r=d/2,Le=Math.max(.005,L)+1.7*r;return c/TAU*Math.sqrt(A/(V*Le))}
function normFire(a,cycle){let z=(Array.isArray(a)?a:[]).map(Number).filter(Number.isFinite).map(x=>((x%cycle)+cycle)%cycle).sort((a,b)=>a-b);return z.length?z:[0]}
class PipeRes{
 constructor(sr,maxSec=.12){this.sr=sr;this.buf=new Float32Array(Math.ceil(sr*maxSec));this.w=0;this.delay=100;this.fb=-.5;this.lp=0;this.lpA=.15;this.drive=1}
 set(length,c,reflection,loss,quarter=true,drive=1){
  this.delay=clamp(2*Math.max(.03,length)/Math.max(220,c)*this.sr,2,this.buf.length-4);
  this.fb=(quarter?-1:1)*clamp(Math.abs(reflection)*(1-clamp(loss,0,.85)),.02,.96);
  this.lpA=clamp(.06+(1-clamp(loss,0,.85))*.22,.03,.35);this.drive=drive||1;
 }
 step(x){
  let rp=this.w-this.delay;while(rp<0)rp+=this.buf.length;let i0=Math.floor(rp)%this.buf.length,i1=(i0+1)%this.buf.length,t=rp-Math.floor(rp);
  let d=this.buf[i0]*(1-t)+this.buf[i1]*t;this.lp+=this.lpA*(d-this.lp);
  let v=Math.tanh((x+this.fb*this.lp)*this.drive);this.buf[this.w]=v;this.w=(this.w+1)%this.buf.length;return d;
 }
}
class BP{
 constructor(sr){this.sr=sr;this.z1=0;this.z2=0;this.b0=1;this.b1=0;this.b2=0;this.a1=0;this.a2=0}
 set(f,q=3){f=clamp(f,20,this.sr*.45);q=clamp(q,.25,30);let w=TAU*f/this.sr,a=Math.sin(w)/(2*q),c=Math.cos(w),A=1+a;this.b0=a/A;this.b1=0;this.b2=-a/A;this.a1=-2*c/A;this.a2=(1-a)/A}
 step(x){let y=this.b0*x+this.z1;this.z1=this.b1*x-this.a1*y+this.z2;this.z2=this.b2*x-this.a2*y;return y}
}
class LP{
 constructor(sr,f=1000){this.sr=sr;this.y=0;this.set(f)}
 set(f){this.a=1-Math.exp(-TAU*clamp(f,10,this.sr*.45)/this.sr)}
 step(x){this.y+=this.a*(x-this.y);return this.y}
}
class DucatiAcousticProcessor extends AudioWorkletProcessor{
 constructor(opts){
  super();this.profile=opts.processorOptions?.profile||{};this.target={rpm:1300,throttle:0,loadNm:0,clutchSlipRpm:0,clutch:1,gear:1,wheelRpmR:0,tcFactor:1,limiter:1,speedMps:0};
  this.s={...this.target};this.phaseDeg=0;this.combF=[0,0];this.combS=[0,0];this.noiseEnv=[0,0];this.intF=[0,0];this.valveEnv=0;this.popEnv=0;this.seed=0x12345678;
  this.hA=new PipeRes(sampleRate);this.hB=new PipeRes(sampleRate);this.col=new PipeRes(sampleRate);this.m1=new PipeRes(sampleRate);this.m2=new PipeRes(sampleRate);
  this.rA=new PipeRes(sampleRate);this.rB=new PipeRes(sampleRate);this.snork=new PipeRes(sampleRate);
  this.muffBP=new BP(sampleRate);this.airboxBP=new BP(sampleRate);this.bodyBP=new BP(sampleRate);
  this.exLP=new LP(sampleRate,80);this.intLP=new LP(sampleRate,7000);this.mechLP=new LP(sampleRate,12000);
  this.clutchRing=0;this.clutchPhase=0;this.beltPhase=0;this.gearPhase=0;this.chainPhase=0;this.lastTel=0;this.updateProfile();
  this.port.onmessage=e=>{let d=e.data||{};if(d.type==='state')this.target={...this.target,...d.state};else if(d.type==='profile'){this.profile=d.profile||this.profile;this.updateProfile()}else if(d.type==='resetPhase')this.phaseDeg=0};
 }
 rnd(){let x=this.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x|0;return((x>>>0)/4294967295)*2-1}
 updateProfile(){
  let p=this.profile,e=p.engine||{},x=p.exhaust||{},i=p.intake||{},m=p.mechanical||{};this.cycle=Math.max(180,+e.cycleDeg||720);this.fires=normFire(e.firingDeg,this.cycle);this.intakes=this.fires.map(v=>(v+(+e.intakeOffsetDeg||this.cycle/2))%this.cycle);
  let ce=cSound(x.gasTempC,1.33),ci=cSound(i.airTempC,1.4),tw=x.thermalWaveSpeedMps||{},ceA=+tw.headerA||ce,ceB=+tw.headerB||ce,ceC=+tw.collector||ce,ceM1=+tw.mufflerA||ce,ceM2=+tw.mufflerB||ce,ceM=.5*(ceM1+ceM2),loss=clamp(+x.wallLoss||0,0,.8),hA=x.headerA||{},hB=x.headerB||{},c=x.collector||{},mu=x.muffler||{},rA=i.runnerA||{},rB=i.runnerB||{};
  let hAr=clamp((+hA.reflection||.7)*.74+Math.abs(mismatch(+hA.diameterM||.045,+c.diameterM||.05))*.42,.04,.96),hBr=clamp((+hB.reflection||.7)*.74+Math.abs(mismatch(+hB.diameterM||.045,+c.diameterM||.05))*.42,.04,.96);
  let mur=clamp((+mu.reflection||.55)*.72+Math.abs(mismatch(+c.diameterM||.05,+mu.coreDiameterM||.042))*.45,.04,.96);
  let rAr=clamp((+rA.reflection||.55)*.75+Math.abs(mismatch(+rA.diameterM||.05,+i.snorkelDiameterM||.05))*.30,.04,.96),rBr=clamp((+rB.reflection||.55)*.75+Math.abs(mismatch(+rB.diameterM||.05,+i.snorkelDiameterM||.05))*.30,.04,.96);
  this.outletScale=clamp(Math.sqrt(areaD(+mu.outletDiameterM||.042)/areaD(.042)),.45,1.85);this.coreScale=clamp(Math.sqrt(areaD(+mu.coreDiameterM||.042)/areaD(.042)),.55,1.65);
  this.intScaleA=clamp(Math.sqrt(areaD(+rA.diameterM||.05)/areaD(.05)),.55,1.55);this.intScaleB=clamp(Math.sqrt(areaD(+rB.diameterM||.05)/areaD(.05)),.55,1.55);
  this.hA.set(+hA.lengthM||.8,ceA,hAr,loss,true,1.04);this.hB.set(+hB.lengthM||1.1,ceB,hBr,loss,true,1.04);this.col.set(+c.lengthM||.3,ceC,+c.reflection||.6,loss*.85,false,1.02);
  this.m1.set(+mu.lengthM||.48,ceM1,mur,clamp((+mu.absorption||.3)+loss*.45,0,.9),false,1.0);this.m2.set((+mu.lengthM||.48)*1.012,ceM2,mur,clamp((+mu.absorption||.3)+loss*.45,0,.9),false,1.0);
  this.rA.set(+rA.lengthM||.24,ci,rAr,+i.filterLoss||.2,true,1.0);this.rB.set(+rB.lengthM||.25,ci,rBr,+i.filterLoss||.2,true,1.0);this.snork.set(+i.snorkelLengthM||.2,ci,.50,+i.filterLoss||.2,true,1.0);
  this.muffBP.set(helm(ceM,+mu.outletDiameterM||.04,+mu.chamberVolumeL||5,+mu.lengthM*.17),2.8+6*(1-clamp(+mu.absorption||.3,0,.9)));
  this.airboxBP.set(helm(ci,+i.snorkelDiameterM||.05,+i.airboxVolumeL||8,+i.snorkelLengthM||.2),+i.airboxQ||4.5);this.bodyBP.set(+m.bodyResonanceHz||190,+m.bodyResonanceQ||3.2);
  this.exLP.set(+x.tailpipeHighpassHz||60);this.intLP.set(5000*(1-clamp(+i.filterLoss||.2,0,.8))+2200);
 }
 crossed(a,b,t){return b>=a?(t>a&&t<=b):(t>a||t<=b)}
 fireEvent(idx,load,thr,rpm){
  let e=this.profile.engine||{},x=this.profile.exhaust||{},amp=Math.pow(clamp(.20+.82*load,0,1.4),+e.loadExponent||.7)*(+x.pulseGain||1);
  amp*=.72+.28*Math.sqrt(clamp(rpm/9000,0,1.2));let rough=(+e.cycleJitter||0)+(+e.idleRoughness||0)*(1-thr)*clamp((2600-rpm)/1800,0,1);amp*=1+this.rnd()*rough;amp*=.35+.65*clamp(this.s.limiter,0,1);
  let k=idx&1;this.combF[k]+=amp;this.combS[k]+=amp;this.noiseEnv[k]+=amp*.35;this.valveEnv+=.11+.15*load;
 }
 intakeEvent(idx,thr,load){let k=idx&1,g=(this.profile.intake?.pulseGain||.6)*(.08+.92*Math.pow(clamp(thr,0,1),.55))*(.75+.25*load);this.intF[k]+=g;this.valveEnv+=.07}
 process(inputs,outputs){
  let outE=outputs[0]?.[0],outI=outputs[1]?.[0],outM=outputs[2]?.[0],outD=outputs[3]?.[0];if(!outE||!outI||!outM||!outD)return true;
  let e=this.profile.engine||{},x=this.profile.exhaust||{},i=this.profile.intake||{},m=this.profile.mechanical||{},n=outE.length,smooth=1-Math.exp(-1/(sampleRate*.025));
  let sharp=clamp(+e.pulseSharpness||.72,0,1),pulseS=(+e.combustionPulseMs||3.6)/1000;let fastD=Math.exp(-1/(sampleRate*Math.max(.00028,pulseS*(.34-.22*sharp)))),slowD=Math.exp(-1/(sampleRate*Math.max(.0012,pulseS*(1.20-.42*sharp))));
  let intD=Math.exp(-1/(sampleRate*.0065)),valD=Math.exp(-1/(sampleRate*.0033)),popD=Math.exp(-1/(sampleRate*.011));
  for(let z=0;z<n;z++){
   for(let k of ['rpm','throttle','loadNm','clutchSlipRpm','clutch','gear','wheelRpmR','tcFactor','limiter','speedMps'])this.s[k]+=smooth*((+this.target[k]||0)-this.s[k]);
   let rpm=clamp(this.s.rpm,0,14000),thr=clamp(this.s.throttle,0,1),load=clamp(Math.abs(this.s.loadNm)/100,0,1.25),inc=rpm/60*360/sampleRate,prev=this.phaseDeg,cur=prev+inc;if(cur>=this.cycle)cur%=this.cycle;
   for(let q=0;q<this.fires.length;q++)if(this.crossed(prev,cur,this.fires[q]))this.fireEvent(q,load,thr,rpm);
   for(let q=0;q<this.intakes.length;q++)if(this.crossed(prev,cur,this.intakes[q]))this.intakeEvent(q,thr,load);
   this.phaseDeg=cur;
   if(thr<.035&&rpm>(+e.overrunThresholdRpm||3500)&&(+e.overrunPops||0)>0&&this.rnd()>(.99990-(+e.overrunPops||0)*.000065))this.popEnv+=.32*(+e.overrunPops||0);
   let p0=(2.55*this.combF[0]-1.55*this.combS[0])+this.rnd()*this.noiseEnv[0],p1=(2.55*this.combF[1]-1.55*this.combS[1])+this.rnd()*this.noiseEnv[1];
   this.combF[0]*=fastD;this.combF[1]*=fastD;this.combS[0]*=slowD;this.combS[1]*=slowD;this.noiseEnv[0]*=.992;this.noiseEnv[1]*=.992;
   let h0=.34*p0+1.16*this.hA.step(p0),h1=.34*p1+1.16*this.hB.step(p1),merge=(h0+h1)*(+x.mergeGain||.85),co=.32*merge+1.05*this.col.step(merge);
   let mm=.52*this.coreScale*(this.m1.step(co)+this.m2.step(co))+.24*this.muffBP.step(co)+.16*co+this.popEnv*this.rnd();this.popEnv*=popD;
   let hp=mm-this.exLP.step(mm),sat=+x.saturation||1.2;outE[z]=Math.tanh(hp*sat)*.82*this.outletScale;
   let ip0=this.intF[0],ip1=this.intF[1];this.intF[0]*=intD;this.intF[1]*=intD;let ri=.5*(this.rA.step(ip0)*this.intScaleA+this.rB.step(ip1)*this.intScaleB),ab=.55*ri+1.1*this.airboxBP.step(ri),sn=.42*ab+.9*this.snork.step(ab);outI[z]=this.intLP.step(Math.tanh(sn*1.45))*.70;
   this.valveEnv*=valD;let crankHz=rpm/60,crank=Math.sin(this.phaseDeg*Math.PI/180)*(.22+.28*load)*(+m.crankOrderGain||0),body=this.bodyBP.step(crank);
   this.beltPhase=(this.beltPhase+TAU*(crankHz*.5*20)/sampleRate)%TAU;let belt=(Math.sin(this.beltPhase)+.23*Math.sin(2*this.beltPhase))*(+m.beltGain||0)*(.15+.85*clamp(rpm/9000,0,1));
   let valve=this.rnd()*this.valveEnv*(+m.valveGain||0);
   outM[z]=this.mechLP.step(Math.tanh((crank+body*.9+belt+valve)*1.3))*.72;
   let slip=Math.abs(this.s.clutchSlipRpm),clutchAmp=(+m.clutchGain||0)*clamp((slip/800)+(.18*(1-thr))*(this.s.clutch>.75?1:0),0,1.2);
   if(this.rnd()>.99925-clamp(clutchAmp,0,1)*.00035)this.clutchRing+=clutchAmp*(.3+.7*Math.abs(this.rnd()));
   let clutchF=950+clamp(slip,0,2500)*.22;this.clutchPhase=(this.clutchPhase+TAU*clutchF/sampleRate)%TAU;let clutchTone=Math.sin(this.clutchPhase)*this.clutchRing;this.clutchRing*=.9972;
   let gearF=clamp(crankHz*(+m.gearMeshOrder||18),20,sampleRate*.42);this.gearPhase=(this.gearPhase+TAU*gearF/sampleRate)%TAU;let gear=(Math.sin(this.gearPhase)+.25*Math.sin(2*this.gearPhase))*(+m.gearGain||0)*clamp(load+.08,0,1);
   let chainF=clamp(Math.abs(this.s.wheelRpmR)/60*(+m.rearSprocketTeeth||36),10,sampleRate*.42);this.chainPhase=(this.chainPhase+TAU*chainF/sampleRate)%TAU;let chain=(Math.sin(this.chainPhase)+.18*this.rnd())*(+m.chainGain||0)*clamp(load+.06,0,1);
   outD[z]=Math.tanh((clutchTone+gear+chain)*1.2)*.66;
  }
  this.lastTel+=n;if(this.lastTel>sampleRate/10){this.lastTel=0;this.port.postMessage({type:'dsp',phaseDeg:this.phaseDeg,rpm:this.s.rpm})}
  return true;
 }
}
registerProcessor('ducati-acoustic-processor',DucatiAcousticProcessor);
`;

function getPath(o,path){
 return String(path).split('.').reduce((a,k)=>a==null?undefined:a[k],o);
}
function setPath(o,path,value){
 let ks=String(path).split('.'),a=o;for(let i=0;i<ks.length-1;i++){if(!a[ks[i]]||typeof a[ks[i]]!=='object')a[ks[i]]={};a=a[ks[i]]}a[ks[ks.length-1]]=value;return o;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(v,d=1){return Number.isFinite(+v)?(+v).toFixed(d):'—'}

class AcousticEngine{
 constructor(profile){
  this.profile=deepClone(profile||DEFAULT_PROFILE);this.ctx=null;this.node=null;this.enabled=false;this.started=false;this.audioState='OFF';
  this.gains={};this.pans={};this.telemetry=[];this.lastState={rpm:0,throttle:0,loadNm:0,clutchSlipRpm:0,clutch:1,gear:1,wheelRpmR:0,tcFactor:1,limiter:1,speedMps:0};
  this.lastDSP={};this.mediaDest=null;this.recorder=null;this.recChunks=[];this.lastRecording=null;this.analyser=null;this.freqData=null;this.timeData=null;this._raf=0;this._lastTick=0;
 }
 dspProfile(){return deepClone(this.profile)}
 async enable(){
  if(this.enabled&&this.ctx){if(this.ctx.state==='suspended')await this.ctx.resume();return}
  const AC=global.AudioContext||global.webkitAudioContext;if(!AC)throw Error('Web Audio API unavailable');
  this.ctx=new AC({latencyHint:'interactive'});this.audioState='STARTING';
  if(!this.ctx.audioWorklet)throw Error('AudioWorklet unavailable in this browser');
  const blob=new Blob([WORKLET_SOURCE],{type:'application/javascript'}),url=URL.createObjectURL(blob);
  try{await this.ctx.audioWorklet.addModule(url)}finally{URL.revokeObjectURL(url)}
  this.node=new AudioWorkletNode(this.ctx,'ducati-acoustic-processor',{numberOfInputs:0,numberOfOutputs:4,outputChannelCount:[1,1,1,1],processorOptions:{profile:this.dspProfile()}});
  this.node.port.onmessage=e=>{if(e.data?.type==='dsp')this.lastDSP=e.data};
  const sum=this.ctx.createGain();this.sum=sum;
  const names=['exhaust','intake','mechanical','driveline'];
  names.forEach((name,idx)=>{let g=this.ctx.createGain(),p=this.ctx.createStereoPanner();this.node.connect(g,idx,0);g.connect(p);p.connect(sum);this.gains[name]=g;this.pans[name]=p});
  this.distanceLP=this.ctx.createBiquadFilter();this.distanceLP.type='lowpass';this.dryGain=this.ctx.createGain();this.wetGain=this.ctx.createGain();this.convolver=this.ctx.createConvolver();
  this.comp=this.ctx.createDynamicsCompressor();this.comp.threshold.value=-10;this.comp.knee.value=12;this.comp.ratio.value=5;this.comp.attack.value=.004;this.comp.release.value=.12;
  this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=4096;this.analyser.smoothingTimeConstant=.72;this.freqData=new Float32Array(this.analyser.frequencyBinCount);this.timeData=new Float32Array(this.analyser.fftSize);
  this.master=this.ctx.createGain();
  sum.connect(this.distanceLP);this.distanceLP.connect(this.dryGain);this.dryGain.connect(this.comp);this.distanceLP.connect(this.convolver);this.convolver.connect(this.wetGain);this.wetGain.connect(this.comp);
  this.comp.connect(this.analyser);this.analyser.connect(this.master);this.master.connect(this.ctx.destination);
  this.mediaDest=this.ctx.createMediaStreamDestination();this.master.connect(this.mediaDest);
  this._buildImpulse(.55,1.4);this.applyMix();if(this.ctx.state==='suspended')await this.ctx.resume();
  this.enabled=true;this.started=true;this.audioState='RUNNING';this.pushProfile();this._loop();
 }
 disable(){if(this.master)this.master.gain.setTargetAtTime(0,this.ctx.currentTime,.02);this.enabled=false;this.audioState='MUTED'}
 resume(){if(!this.ctx)return this.enable();this.enabled=true;this.audioState='RUNNING';this.ctx.resume();this.applyMix()}
 _buildImpulse(decay=1.2,tone=1){
  if(!this.ctx||!this.convolver)return;let n=Math.floor(this.ctx.sampleRate*1.6),b=this.ctx.createBuffer(2,n,this.ctx.sampleRate),seed=1234567;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967295*2-1};
  for(let c=0;c<2;c++){let a=b.getChannelData(c);for(let i=0;i<n;i++){let t=i/this.ctx.sampleRate,env=Math.exp(-t*(3.2/Math.max(.2,decay)));let early=(i===Math.floor(this.ctx.sampleRate*(.028+c*.004))?.7:0)+(i===Math.floor(this.ctx.sampleRate*(.061-c*.003))?.42:0);a[i]=(rnd()*.12*env+early)*tone}}
  this.convolver.buffer=b;
 }
 setProfile(p){this.profile=deepClone(p);this.pushProfile();this.applyMix();return this.snapshot()}
 pushProfile(){if(this.node)this.node.port.postMessage({type:'profile',profile:this.dspProfile()})}
 updateState(s){this.lastState={...this.lastState,...s};if(this.node)this.node.port.postMessage({type:'state',state:this.lastState})}
 applyMix(){
  if(!this.ctx)return;let m=this.profile.mixer||{},t=this.ctx.currentTime,dist=Math.max(.3,+m.listenerDistanceM||2.5),air=clamp(+m.airAbsorption||0,0,1);
  const vals={exhaust:+m.exhaust||0,intake:+m.intake||0,mechanical:+m.mechanical||0,driveline:+m.driveline||0};
  Object.keys(vals).forEach(k=>this.gains[k]?.gain.setTargetAtTime(Math.pow(clamp(vals[k],0,1.5),1.35),t,.03));
  let persp=m.perspective||'CHASE',pan={exhaust:.28,intake:-.18,mechanical:0,driveline:.08};
  if(persp==='EXHAUST_SIDE'){pan.exhaust=.72;pan.intake=-.35}else if(persp==='INTAKE_SIDE'){pan.exhaust=.18;pan.intake=-.72}else if(persp==='ONBOARD'){pan={exhaust:.18,intake:-.12,mechanical:0,driveline:.05}}
  Object.keys(pan).forEach(k=>this.pans[k]?.pan.setTargetAtTime(pan[k],t,.05));
  let distGain=1/Math.max(1,Math.pow(dist/1.5,.72));this.sum?.gain.setTargetAtTime(distGain,t,.05);
  this.distanceLP.frequency.setTargetAtTime(clamp(19000/(1+air*Math.max(0,dist-1)*.34),1800,20000),t,.05);
  this.dryGain.gain.setTargetAtTime(1,t,.03);this.wetGain.gain.setTargetAtTime(clamp(+m.environmentWet||0,0,.8),t,.03);
  this.master?.gain.setTargetAtTime(this.enabled?Math.pow(clamp(+m.master||0,0,1.4),1.4):0,t,.03);
 }
 rmsDb(){
  if(!this.analyser||!this.timeData)return -Infinity;this.analyser.getFloatTimeDomainData(this.timeData);let s=0;for(let v of this.timeData)s+=v*v;let r=Math.sqrt(s/this.timeData.length);return r>1e-9?20*Math.log10(r):-Infinity;
 }
 spectrumPeaks(count=6){
  if(!this.analyser||!this.freqData)return[];this.analyser.getFloatFrequencyData(this.freqData);let sr=this.ctx.sampleRate,N=this.analyser.fftSize,peaks=[];
  for(let i=2;i<this.freqData.length-2;i++){let v=this.freqData[i];if(v>-95&&v>this.freqData[i-1]&&v>=this.freqData[i+1])peaks.push({hz:i*sr/N,db:v})}
  peaks.sort((a,b)=>b.db-a.db);let out=[];for(let p of peaks){if(out.every(q=>Math.abs(q.hz-p.hz)>25)){out.push(p);if(out.length>=count)break}}return out;
 }
 startRecording(){
  if(!this.mediaDest||typeof MediaRecorder==='undefined')throw Error('MediaRecorder unavailable');if(this.recorder?.state==='recording')return;
  this.recChunks=[];this.recorder=new MediaRecorder(this.mediaDest.stream);this.recorder.ondataavailable=e=>{if(e.data?.size)this.recChunks.push(e.data)};this.recorder.onstop=()=>{this.lastRecording=new Blob(this.recChunks,{type:this.recorder.mimeType||'audio/webm'})};this.recorder.start();return true;
 }
 stopRecording(){if(this.recorder?.state==='recording')this.recorder.stop()}
 snapshot(){
  return{schema:'lucid.acoustic-studio.snapshot.v1',enabled:this.enabled,audioState:this.audioState,audioContextState:this.ctx?.state||'none',sampleRate:this.ctx?.sampleRate||null,profile:deepClone(this.profile),meshSeed:deepClone(MESH_SEED),metrics:dynamicMetrics(this.profile,this.lastState),state:{...this.lastState},rmsDbfs:this.rmsDb(),spectrumPeaks:this.spectrumPeaks(),dsp:{...this.lastDSP}};
 }
 _loop(){
  cancelAnimationFrame(this._raf);const tick=(t)=>{if(!this.ctx)return;if((!global.__LUCID_ACTIVE_PAGE__||global.__LUCID_ACTIVE_PAGE__==='SOUND')&&t-this._lastTick>1000/Math.max(5,+this.profile.development.telemetryHz||30)){this._lastTick=t;let snap=this.snapshot();this.telemetry.push({t:t/1000,rpm:snap.state.rpm,throttle:snap.state.throttle,loadNm:snap.state.loadNm,rmsDbfs:snap.rmsDbfs,firingRateHz:snap.metrics.firingRateHz,hA:snap.metrics.exhaust.headerAHz,hB:snap.metrics.exhaust.headerBHz,muffH:snap.metrics.exhaust.mufflerHelmholtzHz,intH:snap.metrics.intake.airboxHelmholtzHz});if(this.telemetry.length>12000)this.telemetry.splice(0,2000)}this._raf=requestAnimationFrame(tick)};this._raf=requestAnimationFrame(tick);
 }
}

function simState(profile){
 let d=profile.development||{},A=global.DUCATI_V5_API;if(d.followSimulation&&A){
  try{let key=A.domain?.()==='FREE_ROAD'?'free':'dyno',raw=global.DUCATI_ADVANCED_POWERTRAIN?.states?.[key],L=raw?.last||A.powertrainSnapshot?.()?.last;if(L)return{rpm:L.engine?.rpm||0,throttle:L.engine?.throttle||0,loadNm:L.engine?.controlledCrankTorqueNm||0,clutchSlipRpm:L.clutch?.slipRpm||0,clutch:L.clutch?.engagement??1,gear:L.gear||1,wheelRpmR:L.wheel?.wheelRpmR||0,tcFactor:L.tc?.torqueFactor??1,limiter:L.engine?.limiter??1,speedMps:L.wheel?.speedMps||0}}
  catch(_){}
 }
 return{rpm:+d.previewRpm||0,throttle:+d.previewThrottle||0,loadNm:+d.previewLoadNm||0,clutchSlipRpm:0,clutch:1,gear:1,wheelRpmR:(+d.previewRpm||0)/7,tcFactor:1,limiter:1,speedMps:0};
}

class AcousticStudioUI{
 constructor(engine){
  this.e=engine;this.box=null;this.tab='MIX';this.lastDraw=0;this.manualFields=[];this.reference={ctx:null,buffer:null,source:null,analyser:null,gain:null,playing:false,name:''};this._build();this._wire();this._tick();
 }
 _build(){
  const style=document.createElement('style');style.textContent=`
  #acousticDock{position:fixed;right:438px;top:10px;z-index:62;display:flex;gap:6px;align-items:center}
  #acousticDock button{background:#08131aee;border:1px solid #557280;color:#e1f5fb}
  #acousticStudio{position:fixed;right:438px;top:46px;z-index:61;width:min(720px,calc(100vw - 470px));max-height:calc(100vh - 58px);overflow:auto;background:#061018f5;border:1px solid #557280;border-radius:8px;color:#dcecf3;box-shadow:0 12px 32px #000b;font:10px/1.35 ui-monospace,Consolas,monospace}
  #acousticStudio.hidden{display:none}#acousticStudio *{box-sizing:border-box}.asHead{position:sticky;top:0;z-index:2;background:#07131cf7;padding:8px;border-bottom:1px solid #29414d}.asHeadTop{display:flex;gap:8px;align-items:center}.asHead h3{margin:0;flex:1;font-size:12px;letter-spacing:.08em}.asStatus{font-weight:bold}.asTabs{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.asTabs button{padding:4px 7px;font-size:9px}.asTabs button.on{border-color:#6fdcff;background:#173b49}.asBody{padding:8px}.asPanel{display:none}.asPanel.on{display:block}.asGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.asCard{border:1px solid #263e4a;border-radius:6px;padding:7px;background:#0a151dcc}.asCard h4{margin:0 0 6px;font-size:10px;letter-spacing:.07em}.asField{display:grid;grid-template-columns:1fr 88px 58px;gap:5px;align-items:center;margin:3px 0}.asField input[type=number]{width:100%;background:#0d1c25;border:1px solid #395360;color:#dcecf3;padding:3px}.asField input[type=range]{grid-column:1/4}.asField select{grid-column:2/4;padding:3px}.asUnit{color:#86a4b2}.asTiny{font-size:9px;color:#88a6b5}.asButtons{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.asCanvas{display:block;width:100%;height:170px;background:#050d12;border:1px solid #1f3540;border-radius:5px}.asTele{white-space:pre-wrap;background:#050d12;border:1px solid #1f3540;border-radius:5px;padding:6px;min-height:70px}.asWide{grid-column:1/3}.asBadge{display:inline-block;padding:2px 5px;border:1px solid #385765;border-radius:4px;margin-right:4px}.asWarn{color:#ffc66c}.asGood{color:#78efb1}.asTable{width:100%;border-collapse:collapse}.asTable td{padding:2px 4px;border-bottom:1px solid #19313b}.asTable td:last-child{text-align:right}.asFile{font-size:9px;max-width:100%}@media(max-width:1000px){#acousticDock{right:10px}#acousticStudio{right:10px;width:calc(100vw - 20px)}}
  `;document.head.appendChild(style);
  const dock=document.createElement('div');dock.id='acousticDock';dock.innerHTML=`<button id="asToggle">ACOUSTIC STUDIO</button><button id="asAudio">ENABLE AUDIO</button><span id="asMiniState" class="asBadge">OFF</span>`;document.body.appendChild(dock);
  const box=document.createElement('div');box.id='acousticStudio';box.className='hidden';box.innerHTML=`
   <div class="asHead"><div class="asHeadTop"><h3>LUCID ACOUSTIC STUDIO · PROCEDURAL ENGINE / INTAKE / EXHAUST</h3><span id="asHeadState" class="asStatus">OFF</span><button id="asClose">×</button></div>
   <div class="asTabs">${['MIX','ENGINE','EXHAUST','INTAKE','MECH','TELEMETRY','PROFILE'].map(x=>`<button data-astab="${x}" class="${x==='MIX'?'on':''}">${x}</button>`).join('')}</div></div>
   <div class="asBody">
    <div class="asPanel on" data-panel="MIX"><div class="asGrid">
     <div class="asCard"><h4>SIMULATION COUPLING</h4>
      ${this._check('Follow live engine / drivetrain','development.followSimulation')}
      ${this._num('Preview RPM','development.previewRpm',700,12000,10,'rpm')}
      ${this._num('Preview throttle','development.previewThrottle',0,1,.01,'0–1')}
      ${this._num('Preview load','development.previewLoadNm',-100,120,1,'N·m')}
      <div class="asTiny">When FOLLOW is enabled, RPM, throttle, crank torque, clutch slip, gear, rear-wheel RPM, TC factor and limiter state are read from the V1.21 powertrain every animation frame.</div>
     </div>
     <div class="asCard"><h4>MASTER / PERSPECTIVE</h4>
      ${this._num('Master','mixer.master',0,1.25,.01,'gain')}
      ${this._num('Listener distance','mixer.listenerDistanceM',.3,25,.1,'m')}
      ${this._num('Air absorption','mixer.airAbsorption',0,1,.01,'0–1')}
      ${this._select('Perspective','mixer.perspective',[['CHASE','Chase'],['ONBOARD','Onboard'],['EXHAUST_SIDE','Exhaust side'],['INTAKE_SIDE','Intake side']])}
      ${this._num('Environment wet','mixer.environmentWet',0,.8,.01,'mix')}
     </div>
     <div class="asCard asWide"><h4>LAYER MIXER</h4><div class="asGrid">
      <div>${this._num('Exhaust','mixer.exhaust',0,1.25,.01,'gain')}${this._num('Intake','mixer.intake',0,1.25,.01,'gain')}</div>
      <div>${this._num('Engine mechanical','mixer.mechanical',0,1.25,.01,'gain')}${this._num('Clutch / gears / chain','mixer.driveline',0,1.25,.01,'gain')}</div>
     </div></div>
    </div></div>
    <div class="asPanel" data-panel="ENGINE"><div class="asGrid">
     <div class="asCard"><h4>FIRING / COMBUSTION</h4>
      ${this._num('Cycle','engine.cycleDeg',360,1440,1,'deg')}
      <div class="asField"><span>Firing phases</span><input id="asFiringText" type="text" value="${esc(this.e.profile.engine.firingDeg.join(','))}"><span class="asUnit">deg</span></div>
      ${this._num('Intake offset','engine.intakeOffsetDeg',0,720,1,'deg')}
      ${this._num('Pulse duration','engine.combustionPulseMs',1,12,.1,'ms')}
      ${this._num('Pulse sharpness','engine.pulseSharpness',0,1,.01,'shape')}
      ${this._num('Cycle jitter','engine.cycleJitter',0,.04,.001,'frac')}
      ${this._num('Idle roughness','engine.idleRoughness',0,.2,.005,'mix')}
     </div>
     <div class="asCard"><h4>TRANSIENT CHARACTER</h4>
      ${this._num('Load exponent','engine.loadExponent',.25,1.6,.01,'exp')}
      ${this._num('Overrun pops','engine.overrunPops',0,1,.01,'prob')}
      ${this._num('Pop threshold','engine.overrunThresholdRpm',1500,9000,50,'rpm')}
      <div class="asTiny">The source is event-timed pressure-pulse synthesis. It does not use a continuously pitched oscillator as the primary exhaust source.</div>
     </div>
     <div class="asCard asWide"><h4>ORDER / FIRING TELEMETRY</h4><div id="asEngineTele" class="asTele"></div></div>
    </div></div>
    <div class="asPanel" data-panel="EXHAUST"><div class="asGrid">
     <div class="asCard asWide"><h4>PARAMETRIC EXHAUST INSTRUMENT</h4><canvas id="asExhaustViz" class="asCanvas" width="900" height="260"></canvas><div class="asTiny">Two firing banks → unequal headers → collector → twin resonant under-seat mufflers → radiating outlets. Geometry drives delay-line and cavity resonances in real time.</div></div>
     <div class="asCard"><h4>HEADER A / B</h4>
      ${this._num('Header A length','exhaust.headerA.lengthM',.20,2.4,.005,'m')}
      ${this._num('Header A diameter','exhaust.headerA.diameterM',.025,.080,.001,'m')}
      ${this._num('Header A reflection','exhaust.headerA.reflection',0,.96,.01,'R')}
      ${this._num('Header B length','exhaust.headerB.lengthM',.20,2.4,.005,'m')}
      ${this._num('Header B diameter','exhaust.headerB.diameterM',.025,.080,.001,'m')}
      ${this._num('Header B reflection','exhaust.headerB.reflection',0,.96,.01,'R')}
     </div>
     <div class="asCard"><h4>COLLECTOR / GAS</h4>
      ${this._num('Collector length','exhaust.collector.lengthM',.08,1.2,.005,'m')}
      ${this._num('Collector diameter','exhaust.collector.diameterM',.03,.10,.001,'m')}
      ${this._num('Collector reflection','exhaust.collector.reflection',0,.96,.01,'R')}
      ${this._num('Gas temperature','exhaust.gasTempC',100,950,5,'°C')}
      ${this._num('Wall / junction loss','exhaust.wallLoss',0,.8,.01,'loss')}
      ${this._num('Merge gain','exhaust.mergeGain',0,1.5,.01,'gain')}
     </div>
     <div class="asCard"><h4>TWIN MUFFLER ACOUSTICS</h4>
      ${this._num('Shell / path length','exhaust.muffler.lengthM',.15,.90,.005,'m')}
      ${this._num('Chamber volume','exhaust.muffler.chamberVolumeL',.5,15,.1,'L')}
      ${this._num('Core diameter','exhaust.muffler.coreDiameterM',.02,.08,.001,'m')}
      ${this._num('Outlet diameter','exhaust.muffler.outletDiameterM',.02,.09,.001,'m')}
      ${this._num('Packing absorption','exhaust.muffler.absorption',0,.9,.01,'loss')}
      ${this._num('End reflection','exhaust.muffler.reflection',0,.96,.01,'R')}
     </div>
     <div class="asCard"><h4>RADIATION / NONLINEARITY</h4>
      ${this._num('Exhaust pulse gain','exhaust.pulseGain',0,1.8,.01,'gain')}
      ${this._num('Tail radiation HP','exhaust.tailpipeHighpassHz',20,240,1,'Hz')}
      ${this._num('Pressure saturation','exhaust.saturation',.5,2.4,.01,'drive')}
      <div id="asExhaustTele" class="asTele"></div>
     </div>
    </div></div>
    <div class="asPanel" data-panel="INTAKE"><div class="asGrid">
     <div class="asCard"><h4>RUNNERS</h4>
      ${this._num('Runner A length','intake.runnerA.lengthM',.08,.80,.005,'m')}
      ${this._num('Runner A diameter','intake.runnerA.diameterM',.025,.075,.001,'m')}
      ${this._num('Runner A reflection','intake.runnerA.reflection',0,.96,.01,'R')}
      ${this._num('Runner B length','intake.runnerB.lengthM',.08,.80,.005,'m')}
      ${this._num('Runner B diameter','intake.runnerB.diameterM',.025,.075,.001,'m')}
      ${this._num('Runner B reflection','intake.runnerB.reflection',0,.96,.01,'R')}
     </div>
     <div class="asCard"><h4>AIRBOX / SNORKEL</h4>
      ${this._num('Airbox volume','intake.airboxVolumeL',1,25,.1,'L')}
      ${this._num('Snorkel length','intake.snorkelLengthM',.04,.70,.005,'m')}
      ${this._num('Snorkel diameter','intake.snorkelDiameterM',.02,.10,.001,'m')}
      ${this._num('Air temperature','intake.airTempC',-20,80,1,'°C')}
      ${this._num('Filter loss','intake.filterLoss',0,.8,.01,'loss')}
      ${this._num('Airbox Q','intake.airboxQ',.5,20,.1,'Q')}
      ${this._num('Intake pulse gain','intake.pulseGain',0,1.5,.01,'gain')}
     </div>
     <div class="asCard asWide"><h4>INTAKE RESONANCE TELEMETRY</h4><div id="asIntakeTele" class="asTele"></div></div>
    </div></div>
    <div class="asPanel" data-panel="MECH"><div class="asGrid">
     <div class="asCard"><h4>ENGINE MECHANICAL LAYERS</h4>
      ${this._num('Crank / case order','mechanical.crankOrderGain',0,.8,.01,'gain')}
      ${this._num('Desmo / valve events','mechanical.valveGain',0,.8,.01,'gain')}
      ${this._num('Timing-belt texture','mechanical.beltGain',0,.5,.01,'gain')}
      ${this._num('Case resonance','mechanical.bodyResonanceHz',80,800,1,'Hz')}
      ${this._num('Case resonance Q','mechanical.bodyResonanceQ',.5,15,.1,'Q')}
     </div>
     <div class="asCard"><h4>DRIVELINE LAYERS</h4>
      ${this._num('Dry-clutch rattle','mechanical.clutchGain',0,1,.01,'gain')}
      ${this._num('Gear whine','mechanical.gearGain',0,.8,.01,'gain')}
      ${this._num('Gear-mesh order','mechanical.gearMeshOrder',4,40,1,'order')}
      ${this._num('Chain texture','mechanical.chainGain',0,.8,.01,'gain')}
      ${this._num('Rear sprocket teeth','mechanical.rearSprocketTeeth',20,60,1,'teeth')}
      <div class="asTiny">Clutch rattle is driven by live clutch slip/engagement; gear and chain layers are driven by crank and rear-wheel state. Gear tooth/order values remain calibration parameters unless replaced by exact transmission tooth counts.</div>
     </div>
     <div class="asCard asWide"><h4>MECHANICAL TELEMETRY</h4><div id="asMechTele" class="asTele"></div></div>
    </div></div>
    <div class="asPanel" data-panel="TELEMETRY"><div class="asGrid">
     <div class="asCard asWide"><h4>LIVE WAVEFORM</h4><canvas id="asWave" class="asCanvas" width="900" height="190"></canvas></div>
     <div class="asCard asWide"><h4>LIVE SPECTRUM / ENGINE ORDERS</h4><canvas id="asSpec" class="asCanvas" width="900" height="220"></canvas></div>
     <div class="asCard"><h4>ACOUSTIC STATE</h4><div id="asTeleText" class="asTele"></div></div>
     <div class="asCard"><h4>CAPTURE</h4><div class="asButtons"><button id="asRec">START AUDIO REC</button><button id="asRecStop">STOP REC</button><button id="asRecSave">SAVE LAST AUDIO</button><button id="asCsv">EXPORT TELEMETRY CSV</button></div><div id="asRecState" class="asTiny">Recorder idle.</div></div>
     <div class="asCard asWide"><h4>REFERENCE AUDIO A/B</h4><div class="asButtons"><input id="asRefFile" class="asFile" type="file" accept="audio/*"><button id="asRefPlay">PLAY / STOP REF</button></div><div id="asRefState" class="asTiny">Load a real recording to A/B by ear. Reference audio is not used as hidden training data and does not alter the procedural profile automatically.</div></div>
    </div></div>
    <div class="asPanel" data-panel="PROFILE"><div class="asGrid">
     <div class="asCard"><h4>PRESETS / LOCAL PROFILES</h4>
      <div class="asField"><span>Factory preset</span><select id="asPreset"><option value="916_GLBS_SEED">916 GLB acoustic seed</option><option value="916_OPEN_45">916 open 45 mm</option><option value="916_RACE_50">916 race 50 mm concept</option><option value="NEUTRAL_DEV">Neutral development</option></select><span></span></div>
      <div class="asButtons"><button id="asLoadPreset">LOAD PRESET</button><button id="asSaveLocal">SAVE LOCAL</button><button id="asLoadLocal">LOAD LOCAL</button></div>
      <div class="asTiny">Local profile storage uses this browser only.</div>
     </div>
     <div class="asCard"><h4>PORTABLE PROFILE</h4><div class="asButtons"><button id="asExportProfile">EXPORT JSON</button><label style="display:inline-block"><input id="asImportProfile" type="file" accept=".json,application/json" style="max-width:185px"></label></div><div id="asProfileState" class="asTiny"></div></div>
     <div class="asCard asWide"><h4>VISUAL-MESH GEOMETRY SEED</h4><div id="asMeshSeed" class="asTele"></div><div class="asButtons"><button id="asApplyMeshSeed">RE-APPLY GLB EXHAUST SEED</button></div></div>
     <div class="asCard asWide"><h4>MODEL BOUNDARY</h4><div class="asTiny">This V1.22 subsystem is a real-time procedural acoustic synthesizer. It is physically parameterized and powertrain-driven, but it is not yet a full 1-D compressible-flow / finite-volume gas-dynamics model. The embedded render mesh gives useful external geometry proxies; it does not reveal internal perforated cores, packing density, baffle topology, true gas temperature distribution, or measured transfer functions. Those remain explicit calibration inputs rather than fabricated “exact” values.</div></div>
    </div></div>
   </div>`;
  document.body.appendChild(box);this.box=box;this._refreshInputs();this._meshSeedText();
 }
 _num(label,path,min,max,step,unit){
  let v=getPath(this.e.profile,path);return `<div class="asField"><span>${esc(label)}</span><input data-aspath="${esc(path)}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(v)}"><span class="asUnit">${esc(unit)}</span></div>`;
 }
 _check(label,path){let v=!!getPath(this.e.profile,path);return `<label style="display:block;margin:5px 0"><input data-aspath="${esc(path)}" data-astype="bool" type="checkbox" ${v?'checked':''}> ${esc(label)}</label>`}
 _select(label,path,opts){let v=getPath(this.e.profile,path);return `<div class="asField"><span>${esc(label)}</span><select data-aspath="${esc(path)}">${opts.map(o=>`<option value="${esc(o[0])}" ${o[0]===v?'selected':''}>${esc(o[1])}</option>`).join('')}</select><span></span></div>`}
 _refreshInputs(){
  if(!this.box)return;this.box.querySelectorAll('[data-aspath]').forEach(el=>{let v=getPath(this.e.profile,el.dataset.aspath);if(el.dataset.astype==='bool')el.checked=!!v;else if(document.activeElement!==el)el.value=v});
  let f=this.box.querySelector('#asFiringText');if(f&&document.activeElement!==f)f.value=this.e.profile.engine.firingDeg.join(',');
 }
 _wire(){
  const q=s=>document.querySelector(s),b=this.box;
  q('#asToggle').onclick=()=>b.classList.toggle('hidden');q('#asClose').onclick=()=>b.classList.add('hidden');
  q('#asAudio').onclick=async()=>{try{if(!this.e.started)await this.e.enable();else if(this.e.enabled)this.e.disable();else await this.e.resume();q('#asAudio').textContent=this.e.enabled?'MUTE AUDIO':'ENABLE AUDIO'}catch(err){this._status('ERROR: '+err.message,true)}};
  b.querySelectorAll('[data-astab]').forEach(btn=>btn.onclick=()=>{this.tab=btn.dataset.astab;b.querySelectorAll('[data-astab]').forEach(x=>x.classList.toggle('on',x===btn));b.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('on',x.dataset.panel===this.tab));this._drawAll()});
  b.addEventListener('input',ev=>{let el=ev.target,path=el.dataset?.aspath;if(!path)return;let v=el.dataset.astype==='bool'?el.checked:(el.tagName==='SELECT'?el.value:+el.value);setPath(this.e.profile,path,v);this.e.pushProfile();this.e.applyMix();this._drawAll()});
  b.querySelector('#asFiringText').addEventListener('change',ev=>{let a=ev.target.value.split(/[,;\s]+/).map(Number).filter(Number.isFinite);this.e.profile.engine.firingDeg=normalizeFiring(a,this.e.profile.engine.cycleDeg);ev.target.value=this.e.profile.engine.firingDeg.join(',');this.e.pushProfile();this._drawAll()});
  b.querySelector('#asLoadPreset').onclick=()=>{let k=b.querySelector('#asPreset').value;this.e.setProfile(PRESETS[k]||DEFAULT_PROFILE);this._refreshInputs();this._drawAll();this._status('Loaded '+this.e.profile.name)};
  b.querySelector('#asSaveLocal').onclick=()=>{try{localStorage.setItem('lucid.acoustic.profile.v1',JSON.stringify(this.e.profile));this._status('Saved profile locally')}catch(err){this._status(err.message,true)}};
  b.querySelector('#asLoadLocal').onclick=()=>{try{let p=JSON.parse(localStorage.getItem('lucid.acoustic.profile.v1')||'null');if(!p)throw Error('No local profile');this.e.setProfile(p);this._refreshInputs();this._drawAll();this._status('Loaded local profile')}catch(err){this._status(err.message,true)}};
  b.querySelector('#asExportProfile').onclick=()=>this._download(new Blob([JSON.stringify(this.e.profile,null,2)],{type:'application/json'}),(this.e.profile.name||'acoustic-profile').replace(/[^\w.-]+/g,'_')+'.json');
  b.querySelector('#asImportProfile').onchange=async ev=>{let f=ev.target.files?.[0];if(!f)return;try{let p=JSON.parse(await f.text());if(!p?.engine||!p?.exhaust||!p?.intake)throw Error('Not a compatible acoustic profile');this.e.setProfile(p);this._refreshInputs();this._drawAll();this._status('Imported '+f.name)}catch(err){this._status(err.message,true)}};
  b.querySelector('#asApplyMeshSeed').onclick=()=>{let p=this.e.profile;p.exhaust.headerA.lengthM=MESH_SEED.headerAEffectiveLengthM;p.exhaust.headerB.lengthM=MESH_SEED.headerBEffectiveLengthM;p.exhaust.headerA.diameterM=p.exhaust.headerB.diameterM=MESH_SEED.stockHeaderDiameterM;p.exhaust.muffler.lengthM=MESH_SEED.mufflerShellLengthM;p.exhaust.muffler.chamberVolumeL=MESH_SEED.mufflerAcousticChamberVolumeL;this.e.pushProfile();this._refreshInputs();this._drawAll();this._status('Re-applied GLB exhaust geometry seed')};
  b.querySelector('#asRec').onclick=()=>{try{this.e.startRecording();b.querySelector('#asRecState').textContent='Recording master output…'}catch(err){b.querySelector('#asRecState').textContent=err.message}};
  b.querySelector('#asRecStop').onclick=()=>{this.e.stopRecording();b.querySelector('#asRecState').textContent='Recording stopped; press SAVE LAST AUDIO after finalization.'};
  b.querySelector('#asRecSave').onclick=()=>{if(this.e.lastRecording)this._download(this.e.lastRecording,'lucid_acoustic_capture.webm');else b.querySelector('#asRecState').textContent='No completed recording yet.'};
  b.querySelector('#asCsv').onclick=()=>{let rows=this.e.telemetry,head='time_s,rpm,throttle,load_Nm,rms_dBFS,firing_Hz,headerA_Hz,headerB_Hz,mufflerHelmholtz_Hz,intakeHelmholtz_Hz\n',csv=head+rows.map(r=>[r.t,r.rpm,r.throttle,r.loadNm,r.rmsDbfs,r.firingRateHz,r.hA,r.hB,r.muffH,r.intH].join(',')).join('\n');this._download(new Blob([csv],{type:'text/csv'}),'lucid_acoustic_telemetry.csv')};
  b.querySelector('#asRefFile').onchange=ev=>{let f=ev.target.files?.[0];if(f)this._loadReference(f)};
  b.querySelector('#asRefPlay').onclick=()=>this._toggleReference();
 }
 _download(blob,name){let a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},500)}
 async _loadReference(file){
  try{let AC=global.AudioContext||global.webkitAudioContext;if(!this.reference.ctx)this.reference.ctx=new AC();let ab=await file.arrayBuffer();this.reference.buffer=await this.reference.ctx.decodeAudioData(ab.slice(0));this.reference.name=file.name;this.box.querySelector('#asRefState').textContent=`Loaded ${file.name} · ${this.reference.buffer.duration.toFixed(2)} s · ${this.reference.buffer.sampleRate} Hz`;if(this.reference.ctx.state==='suspended')await this.reference.ctx.resume()}catch(err){this.box.querySelector('#asRefState').textContent='Reference error: '+err.message}
 }
 _toggleReference(){
  let R=this.reference;if(!R.buffer)return this.box.querySelector('#asRefState').textContent='Load reference audio first.';
  if(R.playing){try{R.source.stop()}catch(_){}R.playing=false;return}
  let s=R.ctx.createBufferSource(),g=R.ctx.createGain();s.buffer=R.buffer;s.loop=true;g.gain.value=.75;s.connect(g);g.connect(R.ctx.destination);s.onended=()=>R.playing=false;s.start();R.source=s;R.gain=g;R.playing=true;
 }
 _status(msg,err=false){let e=this.box.querySelector('#asProfileState');if(e){e.textContent=msg;e.className='asTiny '+(err?'asWarn':'asGood')}}
 _meshSeedText(){
  let s=MESH_SEED,el=this.box.querySelector('#asMeshSeed');el.textContent=`embedded GLB node 23 header envelope PCA: ${s.sourceNodes.headerA.pcaSpanM.map(v=>v.toFixed(3)).join(' × ')} m
embedded GLB node 31 header envelope PCA: ${s.sourceNodes.headerB.pcaSpanM.map(v=>v.toFixed(3)).join(' × ')} m
muffler shells: ~${s.mufflerShellLengthM.toFixed(3)} m long × ${(s.mufflerShellEquivalentDiameterM*1000).toFixed(0)} mm equivalent external diameter
external shell envelope: ~${s.mufflerExternalEnvelopeVolumeL.toFixed(2)} L each
active acoustic chamber seed: ${s.mufflerAcousticChamberVolumeL.toFixed(2)} L each
header acoustic path seeds: ${s.headerAEffectiveLengthM.toFixed(2)} / ${s.headerBEffectiveLengthM.toFixed(2)} m
authority: ${s.authority}`;
 }
 _drawExhaust(){
  let c=this.box.querySelector('#asExhaustViz');if(!c)return;let x=c.getContext('2d'),w=c.width,h=c.height,p=this.e.profile,m=dynamicMetrics(p,this.e.lastState),E=p.exhaust;
  x.clearRect(0,0,w,h);x.strokeStyle='#24414d';x.lineWidth=1;for(let i=1;i<8;i++){x.beginPath();x.moveTo(w*i/8,0);x.lineTo(w*i/8,h);x.stroke()}
  const sx=80,mergeX=390,muffX=610,outX=840,yA=72,yB=176,my=124;
  const pipe=(pts,d,label)=>{x.strokeStyle='#9cc6d6';x.lineWidth=clamp(d*180,3,14);x.beginPath();x.moveTo(pts[0][0],pts[0][1]);for(let k=1;k<pts.length;k++)x.lineTo(pts[k][0],pts[k][1]);x.stroke();x.fillStyle='#dcecf3';x.font='12px ui-monospace';x.fillText(label,pts[Math.floor(pts.length/2)][0]-32,pts[Math.floor(pts.length/2)][1]-10)};
  x.fillStyle='#6f8792';x.fillRect(30,yA-25,52,50);x.fillRect(30,yB-25,52,50);x.fillStyle='#dcecf3';x.fillText('CYL A',35,yA+4);x.fillText('CYL B',35,yB+4);
  pipe([[82,yA],[170,yA],[260,96],[mergeX,my]],E.headerA.diameterM,`A ${fmt(E.headerA.lengthM,2)}m · ${fmt(m.exhaust.headerAHz,0)}Hz`);
  pipe([[82,yB],[160,yB],[270,160],[mergeX,my]],E.headerB.diameterM,`B ${fmt(E.headerB.lengthM,2)}m · ${fmt(m.exhaust.headerBHz,0)}Hz`);
  pipe([[mergeX,my],[530,my]],E.collector.diameterM,`collector ${fmt(m.exhaust.collectorHz,0)}Hz`);
  x.strokeStyle='#8aaeba';x.lineWidth=3;x.strokeRect(muffX,42,160,64);x.strokeRect(muffX,142,160,64);x.fillStyle='#dcecf3';x.fillText(`MUFF 1 · ${fmt(E.muffler.chamberVolumeL,1)}L`,muffX+14,78);x.fillText(`MUFF 2 · ${fmt(m.exhaust.mufflerHelmholtzHz,0)}Hz Helmholtz`,muffX+14,178);
  pipe([[530,my],[580,74],[muffX,74]],E.muffler.coreDiameterM,'');pipe([[530,my],[580,174],[muffX,174]],E.muffler.coreDiameterM,'');pipe([[770,74],[outX,74]],E.muffler.outletDiameterM,'');pipe([[770,174],[outX,174]],E.muffler.outletDiameterM,'');
  x.fillStyle='#7f9daa';x.fillText(`c(exhaust) ${fmt(m.cExhaustMps,0)} m/s · gas ${fmt(E.gasTempC,0)}°C · wall loss ${fmt(E.wallLoss,2)}`,28,246);
 }
 _drawWave(){
  let c=this.box.querySelector('#asWave'),a=this.e.analyser;if(!c||!a||!this.e.timeData)return;let x=c.getContext('2d'),w=c.width,h=c.height;a.getFloatTimeDomainData(this.e.timeData);x.clearRect(0,0,w,h);x.strokeStyle='#223b47';x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke();x.strokeStyle='#dcecf3';x.lineWidth=1.5;x.beginPath();for(let i=0;i<this.e.timeData.length;i++){let xx=i/(this.e.timeData.length-1)*w,yy=h*.5-this.e.timeData[i]*h*.42;if(i===0)x.moveTo(xx,yy);else x.lineTo(xx,yy)}x.stroke();
 }
 _drawSpec(){
  let c=this.box.querySelector('#asSpec'),a=this.e.analyser;if(!c||!a||!this.e.freqData)return;let x=c.getContext('2d'),w=c.width,h=c.height;a.getFloatFrequencyData(this.e.freqData);x.clearRect(0,0,w,h);x.strokeStyle='#223b47';x.fillStyle='#7f9daa';x.font='10px ui-monospace';
  const fmin=20,fmax=Math.min(12000,this.e.ctx.sampleRate/2),lx=f=>Math.log(f/fmin)/Math.log(fmax/fmin)*w;
  for(let f of [50,100,200,500,1000,2000,5000,10000])if(f<fmax){let xx=lx(f);x.beginPath();x.moveTo(xx,0);x.lineTo(xx,h);x.stroke();x.fillText(f>=1000?(f/1000)+'k':String(f),xx+2,h-5)}
  x.strokeStyle='#dcecf3';x.lineWidth=1.4;x.beginPath();let started=false;for(let i=1;i<this.e.freqData.length;i++){let f=i*this.e.ctx.sampleRate/this.e.analyser.fftSize;if(f<fmin||f>fmax)continue;let db=this.e.freqData[i],xx=lx(f),yy=clamp((-db)/100*h,0,h);if(!started){x.moveTo(xx,yy);started=true}else x.lineTo(xx,yy)}x.stroke();
  let dm=dynamicMetrics(this.e.profile,this.e.lastState),orders=[dm.crankHz,dm.firingRateHz,dm.exhaust.headerAHz,dm.exhaust.headerBHz,dm.exhaust.mufflerHelmholtzHz,dm.intake.airboxHelmholtzHz].filter(f=>f>=fmin&&f<=fmax);
  x.strokeStyle='#ffc66c';x.fillStyle='#ffc66c';for(let f of orders){let xx=lx(f);x.beginPath();x.moveTo(xx,0);x.lineTo(xx,h);x.stroke();x.fillText(fmt(f,0),xx+2,12)}
 }
 _drawAll(){this._drawExhaust()}
 _updateText(){
  let s=this.e.snapshot(),m=s.metrics,L=s.state;
  let engine=`RPM ${fmt(L.rpm,0)} · crank ${fmt(m.crankHz,1)} Hz · 720/cycle fundamental ${fmt(m.cycleHz,1)} Hz
firing rate ${fmt(m.firingRateHz,1)} Hz · phases ${m.firingDeg.join('°, ')}°
throttle ${fmt(L.throttle*100,1)}% · crank load ${fmt(L.loadNm,1)} N·m
gear ${L.gear} · clutch slip ${fmt(L.clutchSlipRpm,0)} rpm · rear wheel ${fmt(L.wheelRpmR,0)} rpm
TC factor ${fmt(L.tcFactor,3)} · limiter ${fmt(L.limiter,3)}`;
  let ex=`header A q-wave ${fmt(m.exhaust.headerAHz,1)} Hz
header B q-wave ${fmt(m.exhaust.headerBHz,1)} Hz
collector half-wave ${fmt(m.exhaust.collectorHz,1)} Hz
muffler longitudinal ${fmt(m.exhaust.mufflerLongitudinalHz,1)} Hz
muffler Helmholtz ${fmt(m.exhaust.mufflerHelmholtzHz,1)} Hz
A→collector area reflection ${fmt(m.exhaust.headerCollectorReflectionA,3)}
B→collector area reflection ${fmt(m.exhaust.headerCollectorReflectionB,3)}
collector→core reflection ${fmt(m.exhaust.collectorCoreReflection,3)}
core→outlet reflection ${fmt(m.exhaust.coreOutletReflection,3)}`;
  let inn=`runner A q-wave ${fmt(m.intake.runnerAHz,1)} Hz
runner B q-wave ${fmt(m.intake.runnerBHz,1)} Hz
snorkel q-wave ${fmt(m.intake.snorkelHz,1)} Hz
airbox Helmholtz ${fmt(m.intake.airboxHelmholtzHz,1)} Hz
c(intake) ${fmt(m.cIntakeMps,1)} m/s`;
  let me=`dry-clutch slip driver ${fmt(Math.abs(L.clutchSlipRpm),0)} rpm
gear mesh synthesis order ${fmt(this.e.profile.mechanical.gearMeshOrder,0)} × crank
rear chain pass order ${fmt(this.e.profile.mechanical.rearSprocketTeeth,0)} × wheel
case resonance ${fmt(this.e.profile.mechanical.bodyResonanceHz,0)} Hz
mechanical gains crank/valve/belt ${fmt(this.e.profile.mechanical.crankOrderGain,2)} / ${fmt(this.e.profile.mechanical.valveGain,2)} / ${fmt(this.e.profile.mechanical.beltGain,2)}`;
  this.box.querySelector('#asEngineTele').textContent=engine;this.box.querySelector('#asExhaustTele').textContent=ex;this.box.querySelector('#asIntakeTele').textContent=inn;this.box.querySelector('#asMechTele').textContent=me;
  let peaks=s.spectrumPeaks.map(p=>`${fmt(p.hz,0)} Hz ${fmt(p.db,1)} dBFS`).join(' · ')||'no live spectrum yet';
  this.box.querySelector('#asTeleText').textContent=`audio ${s.audioState} · context ${s.audioContextState} · ${s.sampleRate||'—'} Hz
master RMS ${Number.isFinite(s.rmsDbfs)?fmt(s.rmsDbfs,1):'—'} dBFS (relative digital level; NOT calibrated SPL)
top spectral peaks: ${peaks}
profile: ${this.e.profile.name}`;
  let state=this.e.enabled?'RUNNING':this.e.started?'MUTED':'OFF';document.querySelector('#asMiniState').textContent=state;this.box.querySelector('#asHeadState').textContent=state;
 }
 _tick(t=0){
  let s=simState(this.e.profile);this.e.updateState(s);if((!global.__LUCID_ACTIVE_PAGE__||global.__LUCID_ACTIVE_PAGE__==='SOUND')&&t-this.lastDraw>70){this.lastDraw=t;this._updateText();if(this.tab==='EXHAUST')this._drawExhaust();if(this.tab==='TELEMETRY'){this._drawWave();this._drawSpec()}}requestAnimationFrame(x=>this._tick(x));
 }
}

const engine=new AcousticEngine(DEFAULT_PROFILE);
let ui=null;
function boot(){if(typeof document==='undefined')return;try{ui=new AcousticStudioUI(engine);global.__DUCATI_V122_ACOUSTIC_UI__=ui}catch(err){console.error('V1.22 acoustic studio UI init failed',err)}}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}

global.Ducati916AcousticModel={DEFAULT_PROFILE:deepClone(DEFAULT_PROFILE),PRESETS:Object.fromEntries(Object.entries(PRESETS).map(([k,v])=>[k,deepClone(v)])),MESH_SEED:deepClone(MESH_SEED),speedOfSound,quarterWave,halfWave,helmholtz,mismatchReflection,acousticMetrics,dynamicMetrics};
global.DUCATI_SOUND_STUDIO={
 version:'V1.22.0',engine,
 enable:()=>engine.enable(),mute:()=>engine.disable(),resume:()=>engine.resume(),
 snapshot:()=>engine.snapshot(),profile:()=>deepClone(engine.profile),setProfile:p=>engine.setProfile(p),
 set:q=>{for(let [k,v] of Object.entries(q||{}))setPath(engine.profile,k,v);engine.pushProfile();engine.applyMix();return engine.snapshot()},
 metrics:()=>dynamicMetrics(engine.profile,engine.lastState),meshSeed:deepClone(MESH_SEED),
 setPreview:(rpm,throttle=.1,loadNm=0)=>{engine.profile.development.followSimulation=false;engine.profile.development.previewRpm=+rpm||0;engine.profile.development.previewThrottle=clamp(+throttle||0,0,1);engine.profile.development.previewLoadNm=+loadNm||0;return engine.snapshot()}
};
global.__DUCATI_V122_ACOUSTIC_STUDIO__=true;
})(typeof window!=='undefined'?window:globalThis);


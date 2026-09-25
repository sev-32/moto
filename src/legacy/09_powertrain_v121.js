
(function(global){
'use strict';
if(global.__DUCATI_V121_POWERTRAIN__)return;
const PI=Math.PI,TAU=2*PI,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t;
const CAL={
 schema:'ducati916.powertrain-calibration.v2',
 engine:{id:'916-biposto-stock-research',displacementCc:916,idleRpm:1300,redlineRpm:10200,limiterRpm:10400,peakPowerHp:114,peakPowerRpm:9000,peakTorqueNm:90,peakTorqueRpm:7000,
  crankInertiaKgM2:.055,
  crankInertiaAuthority:'project V84 carry-forward; provisional pending measured assembly inertia',
  torqueCurve:[[1200,34],[2000,45],[3000,58],[4000,70],[5000,80],[6000,87],[7000,90],[8000,89.5],[9000,88.92],[9500,84],[10000,75],[10400,60]],
  engineBrakeCurve:[[1200,-3],[2000,-6],[3000,-10],[4000,-14],[5000,-19],[6000,-23],[7000,-27],[8000,-30],[9000,-33],[10000,-35],[10400,-36]]},
 transmission:{primary:2.0,gears:[2.466,1.765,1.350,1.091,.958,.857],finalDrive:2.4,efficiency:.94,
  dynamics:{internalSubsteps:4,
   clutch:{type:'dry-multiplate',capacityNm:195,capacityAuthority:'project V84 carry-forward; provisional',engagementExponent:1.7,lockSlipRadS:18,slipScaleRadS:9},
   gearbox:{equivInertiaKgM2:.018,stiffnessNmPerRad:220,dampingNmsPerRad:4.00,authority:'lumped crank-equivalent provisional compliance'},
   finalDrive:{equivInertiaKgM2:.014,stiffnessNmPerRad:110,dampingNmsPerRad:4.00,authority:'lumped crank-equivalent gearbox/chain/cush compliance; provisional'},
   torqueGuardNm:500}},
 brakes:{
  hydraulic:{id:'916-ferit-450-ff',padMaterial:'FERIT I/D 450 FF',padMuNominal:.40,padMuRange:[.35,.45],
   front:{rotorDiameterM:.320,calipers:2,pistonsOneSideMm:[30,34],padSweptRadialM:.0343,effectiveRadiusMethod:'uniform-pressure annular strip from Brembo P4 pad swept depth'},
   rear:{rotorDiameterM:.220,calipers:1,pistonsOneSideMm:[32],padSweptRadialM:.0350,effectiveRadiusMethod:'uniform-pressure annular strip; 35 mm P2-family swept depth proxy pending exact P2.105N friction-outline scan'}},
  legacyV84:{frontNmAt100Bar:1180,rearNmAt100Bar:265}},
 controllers:{absTarget:.18,absBand:.025,absBuildBarS:420,absReleaseBarS:1150,absMinSpeedMps:3.0,tcTarget:.10,tcMinSpeedMps:3.0,tcCutGain:5.0,tcCutRateS:12,tcRecoverRateS:2.8}
};
function interp(curve,x){if(x<=curve[0][0])return curve[0][1];for(let i=1;i<curve.length;i++){if(x<=curve[i][0]){let a=curve[i-1],b=curve[i],t=(x-a[0])/(b[0]-a[0]);return lerp(a[1],b[1],t)}}return curve[curve.length-1][1]}
function hpFromKw(k){return k/0.73549875}
function overallRatio(gear){gear=clamp(Math.round(gear||1),1,6);return CAL.transmission.primary*CAL.transmission.gears[gear-1]*CAL.transmission.finalDrive}
function annularMeanRadius(outerRadiusM,sweptRadialM){let ro=outerRadiusM,ri=Math.max(1e-6,ro-sweptRadialM);return (2/3)*(ro**3-ri**3)/(ro**2-ri**2)}
function brakeHydraulic100(mu=CAL.brakes.hydraulic.padMuNominal){
 const h=CAL.brakes.hydraulic,P=100*1e5,area=ds=>ds.reduce((s,d)=>s+PI/4*(d/1000)**2,0);
 mu=clamp(+mu||h.padMuNominal,h.padMuRange[0],h.padMuRange[1]);
 const rf=annularMeanRadius(h.front.rotorDiameterM/2,h.front.padSweptRadialM),rr=annularMeanRadius(h.rear.rotorDiameterM/2,h.rear.padSweptRadialM);
 return{frontNm:h.front.calipers*2*mu*P*area(h.front.pistonsOneSideMm)*rf,rearNm:h.rear.calipers*2*mu*P*area(h.rear.pistonsOneSideMm)*rr,padMu:mu,frontEffectiveRadiusM:rf,rearEffectiveRadiusM:rr};
}
const HYD100=brakeHydraulic100(),HYD100_RANGE={low:brakeHydraulic100(CAL.brakes.hydraulic.padMuRange[0]),high:brakeHydraulic100(CAL.brakes.hydraulic.padMuRange[1])};
function makeDriveline(){return{initialized:false,lastGear:null,omegaGear:0,omegaFinal:0,twistGearbox:0,twistFinal:0,clutchTorqueNm:0,gearboxTorqueNm:0,finalTorqueNm:0,clutchSlipRadS:0}}
function createState(){return{enabled:true,command:{mode:'ENGINE',throttle:0,gear:3,autoShift:false,clutch:1,frontBrakeBar:0,rearBrakeBar:0,absEnabled:false,tcEnabled:false,brakeModel:'HYDRAULIC_FERIT450',padMu:CAL.brakes.hydraulic.padMuNominal},abs:{frontBar:0,rearBar:0,frontActive:false,rearActive:false,interventionsF:0,interventionsR:0},tc:{factor:1,active:false,interventions:0},engine:{rpm:CAL.engine.idleRpm,omega:CAL.engine.idleRpm*TAU/60},driveline:makeDriveline(),last:null,history:[],events:[]}}
function resetState(st){const cmd={...st.command};Object.assign(st,createState());st.command=cmd;return st}
function rateToward(x,target,upRate,downRate,dt){let d=target-x,r=d>=0?upRate:downRate;return x+clamp(d,-r*dt,r*dt)}
function autoGear(gear,rpm,throttle){let g=gear;if(rpm>9700&&g<6)g++;else if(rpm<3200&&g>1&&throttle>.08)g--;return g}
function absChannel(prev,cmdBar,slip,speed,cfg,dt){let b=prev,active=false,brakeSlip=Math.max(0,-slip);if(speed<cfg.absMinSpeedMps||cmdBar<=.1){return{bar:cmdBar,active:false}}if(brakeSlip>cfg.absTarget+cfg.absBand){b=Math.max(0,b-cfg.absReleaseBarS*dt);active=true}else if(brakeSlip<cfg.absTarget-cfg.absBand){b=Math.min(cmdBar,b+cfg.absBuildBarS*dt)}else{b=Math.min(b,cmdBar);active=true}return{bar:clamp(b,0,cmdBar),active}}
function limiterAt(rpm){return rpm>=CAL.engine.limiterRpm?0:rpm>CAL.engine.redlineRpm?clamp((CAL.engine.limiterRpm-rpm)/(CAL.engine.limiterRpm-CAL.engine.redlineRpm),0,1):1}
function crankTorqueAt(omega,throttle,tcFactor){
 let rpm=Math.max(0,omega*60/TAU),full=interp(CAL.engine.torqueCurve,Math.max(1200,rpm)),drag=interp(CAL.engine.engineBrakeCurve,Math.max(1200,rpm)),limiter=limiterAt(rpm);
 let idleOmega=CAL.engine.idleRpm*TAU/60,idleAssist=(1-throttle)*clamp((idleOmega-omega)*.16,0,12);
 let requested=throttle*full*limiter+(1-throttle)*drag+idleAssist,controlled=requested>0?requested*tcFactor:requested;
 return{rpm,full,drag,limiter,idleAssist,requested,controlled};
}
function initDriveline(st,gear,omegaWheelRef){
 let d=st.driveline,idle=CAL.engine.idleRpm*TAU/60;
 d.initialized=true;d.lastGear=gear;d.omegaGear=omegaWheelRef;d.omegaFinal=omegaWheelRef;d.twistGearbox=0;d.twistFinal=0;d.clutchTorqueNm=0;d.gearboxTorqueNm=0;d.finalTorqueNm=0;
 st.engine.omega=Math.max(idle,omegaWheelRef);st.engine.rpm=st.engine.omega*60/TAU;
}
function stepDriveline(st,gear,ratio,omegaR,throttle,clutch,tcFactor,dt){
 const dyn=CAL.transmission.dynamics,d=st.driveline,omegaWheelRef=Math.abs(omegaR||0)*ratio;
 if(!d.initialized)initDriveline(st,gear,omegaWheelRef);
 if(d.lastGear!==gear){d.lastGear=gear;d.omegaGear=omegaWheelRef;d.omegaFinal=omegaWheelRef;d.twistGearbox=0;d.twistFinal=0}
 const n=Math.max(1,dyn.internalSubsteps|0),h=dt/n,Je=CAL.engine.crankInertiaKgM2,Jg=dyn.gearbox.equivInertiaKgM2,Jf=dyn.finalDrive.equivInertiaKgM2;
 let eng=crankTorqueAt(st.engine.omega,throttle,tcFactor),Tcl=0,Tgb=0,Tfd=0,slip=0;
 for(let i=0;i<n;i++){
  eng=crankTorqueAt(st.engine.omega,throttle,tcFactor);
  Tgb=dyn.gearbox.stiffnessNmPerRad*d.twistGearbox+dyn.gearbox.dampingNmsPerRad*(d.omegaGear-d.omegaFinal);
  Tfd=dyn.finalDrive.stiffnessNmPerRad*d.twistFinal+dyn.finalDrive.dampingNmsPerRad*(d.omegaFinal-omegaWheelRef);
  Tgb=clamp(Tgb,-dyn.torqueGuardNm,dyn.torqueGuardNm);Tfd=clamp(Tfd,-dyn.torqueGuardNm,dyn.torqueGuardNm);
  slip=st.engine.omega-d.omegaGear;
  const c=dyn.clutch,engagement=clamp(clutch,0,1),cap=c.capacityNm*Math.pow(engagement,c.engagementExponent);
  if(cap<=1e-6)Tcl=0;
  else{
   const req=(slip/h+eng.controlled/Je+Tgb/Jg)/(1/Je+1/Jg);
   if(Math.abs(slip)<=c.lockSlipRadS&&Math.abs(req)<=cap)Tcl=req;
   else Tcl=cap*Math.tanh(slip/c.slipScaleRadS);
  }
  Tcl=clamp(Tcl,-dyn.torqueGuardNm,dyn.torqueGuardNm);
  st.engine.omega=Math.max(0,st.engine.omega+(eng.controlled-Tcl)/Je*h);
  d.omegaGear=Math.max(0,d.omegaGear+(Tcl-Tgb)/Jg*h);
  d.omegaFinal=Math.max(0,d.omegaFinal+(Tgb-Tfd)/Jf*h);
  d.twistGearbox=clamp(d.twistGearbox+(d.omegaGear-d.omegaFinal)*h,-2.5,2.5);
  d.twistFinal=clamp(d.twistFinal+(d.omegaFinal-omegaWheelRef)*h,-2.5,2.5);
 }
 d.clutchTorqueNm=Tcl;d.gearboxTorqueNm=Tgb;d.finalTorqueNm=Tfd;d.clutchSlipRadS=slip;
 st.engine.rpm=st.engine.omega*60/TAU;
 return{engine:eng,omegaWheelRef,rearWheelTorqueNm:Tfd*ratio*CAL.transmission.efficiency,gearboxEnergyJ:.5*dyn.gearbox.stiffnessNmPerRad*d.twistGearbox*d.twistGearbox,finalDriveEnergyJ:.5*dyn.finalDrive.stiffnessNmPerRad*d.twistFinal*d.twistFinal};
}
function selectBrake100(cmd){
 let legacy=cmd.brakeModel==='LEGACY_V84'||cmd.brakeModel==='CALIBRATED';
 return legacy?{frontNm:CAL.brakes.legacyV84.frontNmAt100Bar,rearNm:CAL.brakes.legacyV84.rearNmAt100Bar,padMu:null}:brakeHydraulic100(cmd.padMu);
}
function stepState(st,input){
 const dt=Math.max(1e-5,input.dt||1/540),cmd=st.command,cfg=CAL.controllers,speed=Math.abs(input.speedMps||0);
 let gear=clamp(Math.round(cmd.gear||1),1,6),ratio=overallRatio(gear),throttle=clamp(+cmd.throttle||0,0,1),clutch=clamp(cmd.clutch==null?1:+cmd.clutch,0,1);
 if(!st.driveline.initialized)initDriveline(st,gear,Math.abs(input.omegaR||0)*ratio);
 if(cmd.autoShift){gear=autoGear(gear,st.engine.rpm,throttle);cmd.gear=gear;ratio=overallRatio(gear)}
 let pre=crankTorqueAt(st.engine.omega,throttle,1),tcTarget=cfg.tcTarget*(1-.28*Math.abs(Math.sin((input.leanDeg||0)*PI/180))),tcActive=false;
 if(cmd.tcEnabled&&speed>=cfg.tcMinSpeedMps&&pre.requested>0){let excess=(input.slipR||0)-tcTarget,desired=excess>0?clamp(1-cfg.tcCutGain*excess,0,1):1,old=st.tc.factor;st.tc.factor=rateToward(old,desired,cfg.tcRecoverRateS,cfg.tcCutRateS,dt);tcActive=st.tc.factor<.995;if(tcActive&&!st.tc.active)st.tc.interventions++}
 else st.tc.factor=rateToward(st.tc.factor,1,cfg.tcRecoverRateS,cfg.tcRecoverRateS,dt);
 st.tc.active=tcActive;
 let drive=stepDriveline(st,gear,ratio,input.omegaR||0,throttle,clutch,st.tc.factor,dt),eng=crankTorqueAt(st.engine.omega,throttle,st.tc.factor);
 let direct=+cmd.directRearWheelTorqueNm||0,rearWheelTorque=cmd.mode==='DIRECT'?direct:drive.rearWheelTorqueNm;
 let af={bar:+cmd.frontBrakeBar||0,active:false},ar={bar:+cmd.rearBrakeBar||0,active:false};
 if(cmd.absEnabled){af=absChannel(st.abs.frontBar,+cmd.frontBrakeBar||0,input.slipF||0,speed,cfg,dt);ar=absChannel(st.abs.rearBar,+cmd.rearBrakeBar||0,input.slipR||0,speed,cfg,dt)}else{af.bar=+cmd.frontBrakeBar||0;ar.bar=+cmd.rearBrakeBar||0}
 if(af.active&&!st.abs.frontActive)st.abs.interventionsF++;if(ar.active&&!st.abs.rearActive)st.abs.interventionsR++;
 st.abs.frontBar=af.bar;st.abs.rearBar=ar.bar;st.abs.frontActive=af.active;st.abs.rearActive=ar.active;
 let brake100=selectBrake100(cmd),brakeTF=af.bar/100*brake100.frontNm,brakeTR=ar.bar/100*brake100.rearNm,rpm=st.engine.rpm,crankKw=eng.controlled*st.engine.omega/1000,wheelKw=rearWheelTorque*(input.omegaR||0)/1000,brakePowerF=brakeTF*Math.abs(input.omegaF||0)/1000,brakePowerR=brakeTR*Math.abs(input.omegaR||0)/1000;
 st.last={schema:'ducati916.advanced-powertrain-state.v2',timeS:input.timeS||0,mode:cmd.mode,gear,overallRatio:ratio,
  engine:{rpm,omegaRadS:st.engine.omega,throttle,fullTorqueNm:eng.full,engineBrakeNm:eng.drag,idleAssistNm:eng.idleAssist,requestedCrankTorqueNm:eng.requested,controlledCrankTorqueNm:eng.controlled,crankPowerKw:crankKw,crankPowerHp:hpFromKw(crankKw),limiter:eng.limiter,crankInertiaKgM2:CAL.engine.crankInertiaKgM2},
  clutch:{engagement:clutch,type:CAL.transmission.dynamics.clutch.type,capacityNm:CAL.transmission.dynamics.clutch.capacityNm*Math.pow(clutch,CAL.transmission.dynamics.clutch.engagementExponent),transmittedTorqueNm:st.driveline.clutchTorqueNm,slipRadS:st.driveline.clutchSlipRadS,slipRpm:st.driveline.clutchSlipRadS*60/TAU},
  drive:{rearWheelTorqueNm:rearWheelTorque,rearWheelPowerKw:wheelKw,drivetrainEfficiency:CAL.transmission.efficiency,gearboxNodeOmegaRadS:st.driveline.omegaGear,finalDriveNodeOmegaRadS:st.driveline.omegaFinal,gearboxTwistRad:st.driveline.twistGearbox,finalDriveTwistRad:st.driveline.twistFinal,gearboxTorqueNm:st.driveline.gearboxTorqueNm,finalDriveTorqueNm:st.driveline.finalTorqueNm,gearboxStoredEnergyJ:drive.gearboxEnergyJ,finalDriveStoredEnergyJ:drive.finalDriveEnergyJ},
  brakes:{model:cmd.brakeModel,padMu:brake100.padMu,commandFrontBar:+cmd.frontBrakeBar||0,commandRearBar:+cmd.rearBrakeBar||0,appliedFrontBar:af.bar,appliedRearBar:ar.bar,frontTorqueNm:brakeTF,rearTorqueNm:brakeTR,frontPowerKw:brakePowerF,rearPowerKw:brakePowerR,active100Bar:brake100,hydraulicNominal100Bar:HYD100,hydraulicRange100Bar:HYD100_RANGE,legacyV84100Bar:CAL.brakes.legacyV84},
  abs:{enabled:!!cmd.absEnabled,targetSlip:cfg.absTarget,frontActive:af.active,rearActive:ar.active,interventionsF:st.abs.interventionsF,interventionsR:st.abs.interventionsR},
  tc:{enabled:!!cmd.tcEnabled,targetSlip:tcTarget,active:tcActive,torqueFactor:st.tc.factor,interventions:st.tc.interventions},
  wheel:{speedMps:speed,slipF:+input.slipF||0,slipR:+input.slipR||0,wheelRpmF:Math.abs(input.omegaF||0)*60/TAU,wheelRpmR:Math.abs(input.omegaR||0)*60/TAU},
  authority:{enginePeak:'114 hp @ 9000 rpm source-grounded',torqueAnchor:'90 Nm @ 7000 rpm secondary-source anchor',gearing:'historical 916 ratios',crankInertia:'project carry-forward; provisional',clutchCapacity:'project carry-forward; provisional',drivelineCompliance:'lumped dynamic parameters; provisional pending measured torsional data',brakes:'period FERIT I/D 450 FF + 30/34 front/P2.105N rear geometry; mu range explicit',controllers:'research ABS/TC; not OEM 916 equipment'}};
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE'){st.history.push(st.last);if(st.history.length>900)st.history.splice(0,st.history.length-900)}return st.last
}
function sweep({gear=3,throttle=1}={}){let rows=[];for(let rpm=1500;rpm<=10400;rpm+=100){let full=interp(CAL.engine.torqueCurve,rpm),drag=interp(CAL.engine.engineBrakeCurve,rpm),crank=throttle*full+(1-throttle)*drag,kw=crank*rpm*TAU/60/1000,ratio=overallRatio(gear),wheelT=crank*ratio*CAL.transmission.efficiency,omegaR=rpm/ratio*TAU/60;rows.push({rpm,torqueNm:crank,powerKw:kw,powerHp:hpFromKw(kw),wheelTorqueNm:wheelT,wheelPowerKw:wheelT*omegaR/1000})}return{schema:'ducati916.power-sweep.v2',gear,throttle,rows,peakPower:rows.reduce((a,b)=>b.powerHp>a.powerHp?b:a,rows[0]),peakTorque:rows.reduce((a,b)=>b.torqueNm>a.torqueNm?b:a,rows[0])}}
global.Ducati916PowertrainModel={CAL,HYD100,HYD100_RANGE,HW100:HYD100,brakeHydraulic100,annularMeanRadius,createState,resetState,stepState,sweep,overallRatio,interp};
global.__DUCATI_V121_POWERTRAIN__=true;
})(typeof window!=='undefined'?window:globalThis);

(function(global){
'use strict';
const API=global.DUCATI_V5_API,M=global.Ducati916PowertrainModel;if(!API||!M)return;const dyn=API.dyno,free=API.free;function ensure(o){return o._advancedPowertrain||(o._advancedPowertrain=M.createState())}ensure(dyn);ensure(free);
function dynInput(o,dt){let S=o.S,V=o.speedMps||0,slF=o._kinematicSlip(o.omegaF,S.rF,V),slR=o._kinematicSlip(o.omegaR,S.rR,V);return{dt,timeS:o.time||0,speedMps:V,omegaF:o.omegaF,omegaR:o.omegaR,slipF:slF,slipR:slR,leanDeg:o.leanDeg?o.leanDeg():0}}
const DP=Object.getPrototypeOf(dyn),baseDStep=DP.step,baseDStart=DP.startRolling;baseDStart&&(DP.startRolling=function(...a){M.resetState(ensure(this));return baseDStart.apply(this,a)});DP.step=function(dt=this.S.dt){let st=ensure(this);if(!st.enabled)return baseDStep.call(this,dt);let p=M.stepState(st,dynInput(this,dt)),S=this.S,save={fb:S.frontBrakeBar,rb:S.rearBrakeBar,drive:S.rearDriveTorqueNm,tf:S.brakeTqF,tr:S.brakeTqR},b100=p.brakes.active100Bar;S.frontBrakeBar=p.brakes.appliedFrontBar;S.rearBrakeBar=p.brakes.appliedRearBar;S.rearDriveTorqueNm=p.drive.rearWheelTorqueNm;S.brakeTqF=b100.frontNm??b100.frontNmAt100Bar;S.brakeTqR=b100.rearNm??b100.rearNmAt100Bar;let r=baseDStep.call(this,dt);if(this.last)this.last.powertrain=JSON.parse(JSON.stringify(p));S.frontBrakeBar=save.fb;S.rearBrakeBar=save.rb;S.rearDriveTorqueNm=save.drive;S.brakeTqF=save.tf;S.brakeTqR=save.tr;return r};
const FP=Object.getPrototypeOf(free),baseFW=FP._integrateWheels,baseFC=FP.compute,baseFR=FP.reset;FP.reset=function(...a){M.resetState(ensure(this));return baseFR.apply(this,a)};FP._integrateWheels=function(dt){let st=ensure(this);if(!st.enabled)return baseFW.call(this,dt);let speed=this.speedMps?this.speedMps():Math.hypot(this.v?.[0]||0,this.v?.[1]||0),p=M.stepState(st,{dt,timeS:this.time||0,speedMps:speed,omegaF:this.omegaF,omegaR:this.omegaR,slipF:this.front?.p?.slipRatio||0,slipR:this.rear?.p?.slipRatio||0,leanDeg:(this.last?.body?.rollDeg||0)}),S=this.S,c=this.controls,save={fb:c.frontBrakeBar,rb:c.rearBrakeBar,drive:c.rearDriveTorqueNm,tf:S.brakeTqF,tr:S.brakeTqR},b100=p.brakes.active100Bar;c.frontBrakeBar=p.brakes.appliedFrontBar;c.rearBrakeBar=p.brakes.appliedRearBar;c.rearDriveTorqueNm=p.drive.rearWheelTorqueNm;S.brakeTqF=b100.frontNm??b100.frontNmAt100Bar;S.brakeTqR=b100.rearNm??b100.rearNmAt100Bar;let r=baseFW.call(this,dt);c.frontBrakeBar=save.fb;c.rearBrakeBar=save.rb;c.rearDriveTorqueNm=save.drive;S.brakeTqF=save.tf;S.brakeTqR=save.tr;return r};FP.compute=function(...a){let r=baseFC.apply(this,a),st=ensure(this);if(this.last&&st.last)this.last.powertrain=global.__LUCID_ACTIVE_PAGE__==='RIDE'?st.last:JSON.parse(JSON.stringify(st.last));return r};
function target(domain){return domain==='FREE_ROAD'?free:dyn}function setControls(q={},domain=API.domain()){let st=ensure(target(domain));Object.assign(st.command,q);if(q.enabled!==undefined)st.enabled=!!q.enabled;return snapshot(domain)}function snapshot(domain=API.domain()){let o=target(domain),st=ensure(o);return JSON.parse(JSON.stringify({enabled:st.enabled,command:st.command,last:st.last,calibration:M.CAL}))}
function runSweep(q){let r=M.sweep(q||{});global.__V121_DYNO_SWEEP__=r;return r}
API.setPowertrainControls=setControls;API.powertrainSnapshot=snapshot;API.powerSweep=runSweep;API.powertrainCalibration=()=>JSON.parse(JSON.stringify(M.CAL));global.DUCATI_ADVANCED_POWERTRAIN={setControls,snapshot,runSweep,calibration:M.CAL,states:{dyno:ensure(dyn),free:ensure(free)}};
})(typeof window!=='undefined'?window:globalThis);

(function(global){
'use strict';
if(typeof document==='undefined'||!global.DUCATI_V5_API)return;const A=global.DUCATI_V5_API,M=global.Ducati916PowertrainModel,view=document.getElementById('view');if(!view)return;
const css=document.createElement('style');css.textContent=`#advDyno{position:absolute;left:12px;bottom:12px;z-index:18;width:430px;max-height:74%;overflow:auto;background:#071018ed;border:1px solid #496977;border-radius:7px;padding:8px;color:#dcecf3;font:10px/1.3 ui-monospace,Consolas,monospace;box-shadow:0 8px 22px #0008}#advDyno.min .advBody{display:none}#advDyno h3{margin:0;font-size:11px;letter-spacing:.1em}.advHead{display:flex;justify-content:space-between;align-items:center;gap:6px}.advGrid{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-top:6px}.advGrid label{display:grid;grid-template-columns:1fr auto;gap:5px;align-items:center}.advGrid input[type=range]{grid-column:1/3;width:100%}.advTele{display:grid;grid-template-columns:1fr auto;gap:2px 8px;border-top:1px solid #28404b;margin-top:6px;padding-top:6px}.advTele b{color:#72e7ff;font-weight:500}.advBtns{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.advBtns button,.advGrid select{font:inherit;background:#14232d;color:#dcecf3;border:1px solid #385664;border-radius:4px;padding:3px 5px}#advCurve,#advTrace{width:100%;height:120px;background:#050b0f;border:1px solid #1c3039;margin-top:6px}.advWarn{color:#ffc66c;margin-top:5px}`;document.head.appendChild(css);
const box=document.createElement('div');box.id='advDyno';box.innerHTML=`<div class="advHead"><h3>ADVANCED ENGINE / DYNO / ABS / TC</h3><button id="advMin">–</button></div><div class="advBody"><div class="advGrid"><label>Power source<select id="advMode"><option value="ENGINE">916 ENGINE</option><option value="DIRECT">DIRECT WHEEL</option></select></label><label>Gear<select id="advGear">${[1,2,3,4,5,6].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Throttle <b id="advThrottleV">0%</b><input id="advThrottle" type="range" min="0" max="100" value="0"></label><label>Clutch <b id="advClutchV">100%</b><input id="advClutch" type="range" min="0" max="100" value="100"></label><label>Front brake <b id="advFBV">0 bar</b><input id="advFB" type="range" min="0" max="120" value="0"></label><label>Rear brake <b id="advRBV">0 bar</b><input id="advRB" type="range" min="0" max="120" value="0"></label><label>Brake model<select id="advBrakeModel"><option value="HYDRAULIC_FERIT450">FERIT 450 HYDRAULIC</option><option value="LEGACY_V84">LEGACY V84</option></select></label><label><span><input id="advABS" type="checkbox"> ABS research</span><span><input id="advTC" type="checkbox"> TC research</span></label></div><div class="advBtns"><button id="advSweep">POWER SWEEP</button><button id="advAbsTest">ABS TEST</button><button id="advTcTest">TC TEST</button><button id="advExport">EXPORT</button></div><div id="advTele" class="advTele"></div><canvas id="advCurve" width="410" height="120"></canvas><canvas id="advTrace" width="410" height="120"></canvas><div class="advWarn">916 engine peak/ratios are historical calibration anchors. ABS/TC are research overlays, not original 916 equipment. FERIT 450 FF friction is modeled at nominal μ=0.40 with explicit 0.35–0.45 sensitivity; driveline compliance constants remain provisional.</div></div>`;view.appendChild(box);const q=id=>document.getElementById(id);q('advGear').value='3';
function controls(){return{mode:q('advMode').value,throttle:+q('advThrottle').value/100,clutch:+q('advClutch').value/100,gear:+q('advGear').value,frontBrakeBar:+q('advFB').value,rearBrakeBar:+q('advRB').value,absEnabled:q('advABS').checked,tcEnabled:q('advTC').checked,brakeModel:q('advBrakeModel').value}}
function apply(){q('advThrottleV').textContent=q('advThrottle').value+'%';q('advClutchV').textContent=q('advClutch').value+'%';q('advFBV').textContent=q('advFB').value+' bar';q('advRBV').textContent=q('advRB').value+' bar';A.setPowertrainControls(controls(),'DYNO');A.setPowertrainControls(controls(),'FREE_ROAD')}
['advMode','advGear','advThrottle','advClutch','advFB','advRB','advABS','advTC','advBrakeModel'].forEach(id=>q(id).addEventListener('input',apply));q('advMin').onclick=()=>box.classList.toggle('min');
function plot(canvas,series){let x=canvas.getContext('2d'),w=canvas.width,h=canvas.height;x.clearRect(0,0,w,h);x.strokeStyle='#1d333d';for(let i=1;i<5;i++){x.beginPath();x.moveTo(0,h*i/5);x.lineTo(w,h*i/5);x.stroke()}if(!series?.length)return;let max=Math.max(1,...series.map(v=>Math.abs(v.y)));x.strokeStyle='#6fdcff';x.lineWidth=2;x.beginPath();series.forEach((v,i)=>{let px=i/(series.length-1)*w,py=h*.92-v.y/max*h*.78;i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()}
function sweep(){let r=A.powerSweep({gear:+q('advGear').value,throttle:1});plot(q('advCurve'),r.rows.map(v=>({y:v.powerHp})));return r}q('advSweep').onclick=sweep;
function controllerTest(kind){const D=A.dyno,save=JSON.parse(JSON.stringify(global.DUCATI_ADVANCED_POWERTRAIN.states.dyno.command)),st=global.DUCATI_ADVANCED_POWERTRAIN.states.dyno;M.resetState(st);st.command={...save,mode:'ENGINE',gear:kind==='ABS'?3:1,clutch:1,throttle:kind==='TC'?1:0,frontBrakeBar:kind==='ABS'?25:0,rearBrakeBar:kind==='ABS'?8:0,absEnabled:kind==='ABS',tcEnabled:kind==='TC',brakeModel:'HYDRAULIC_FERIT450'};D.startRolling(kind==='ABS'?25:12);let rows=[],duration=kind==='ABS'?.17:.30,n=Math.round(duration/D.S.dt);for(let i=0;i<n;i++){D.step();if(i%5===0&&st.last)rows.push({t:D.time,slipF:st.last.wheel.slipF,slipR:st.last.wheel.slipR,absF:st.last.brakes.appliedFrontBar,tc:st.last.tc.torqueFactor,wheelTorque:st.last.drive.rearWheelTorqueNm})}let rec={schema:'ducati916.controller-test.v2',kind,rows,summary:{maxBrakeSlipF:Math.max(...rows.map(r=>Math.max(0,-r.slipF))),maxDriveSlipR:Math.max(...rows.map(r=>Math.max(0,r.slipR))),minTcFactor:Math.min(...rows.map(r=>r.tc)),minFrontBar:Math.min(...rows.map(r=>r.absF)),maxFrontBar:Math.max(...rows.map(r=>r.absF))}};global['__V121_'+kind+'_TEST__']=rec;st.command=save;D.stopRolling();plot(q('advTrace'),rows.map(r=>({y:kind==='ABS'?-r.slipF:r.slipR})));return rec}q('advAbsTest').onclick=()=>controllerTest('ABS');q('advTcTest').onclick=()=>controllerTest('TC');q('advExport').onclick=()=>{let data={powertrain:A.powertrainSnapshot(),sweep:global.__V121_DYNO_SWEEP__||sweep(),abs:global.__V121_ABS_TEST__||null,tc:global.__V121_TC_TEST__||null};let b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ducati916_v121_powertrain_telemetry.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function update(){if(global.__LUCID_ACTIVE_PAGE__&&global.__LUCID_ACTIVE_PAGE__!=='ENGINE')return;let p=A.powertrainSnapshot();let L=p.last;if(!L){q('advTele').innerHTML='<span>Powertrain</span><b>READY</b>';return}let rows=[['domain',A.domain()],['engine',`${L.engine.rpm.toFixed(0)} rpm · gear ${L.gear}`],['crank torque',`${L.engine.controlledCrankTorqueNm.toFixed(1)} N·m`],['crank power',`${L.engine.crankPowerHp.toFixed(1)} hp / ${L.engine.crankPowerKw.toFixed(1)} kW`],['clutch',`${L.clutch.transmittedTorqueNm.toFixed(1)} N·m · slip ${L.clutch.slipRpm.toFixed(0)} rpm`],['drive twist',`${L.drive.gearboxTwistRad.toFixed(3)} / ${L.drive.finalDriveTwistRad.toFixed(3)} rad`],['rear wheel',`${L.drive.rearWheelTorqueNm.toFixed(0)} N·m · ${L.drive.rearWheelPowerKw.toFixed(1)} kW`],['slip F / R',`${L.wheel.slipF.toFixed(3)} / ${L.wheel.slipR.toFixed(3)}`],['brake cmd F / R',`${L.brakes.commandFrontBar.toFixed(0)} / ${L.brakes.commandRearBar.toFixed(0)} bar`],['brake applied F / R',`${L.brakes.appliedFrontBar.toFixed(1)} / ${L.brakes.appliedRearBar.toFixed(1)} bar`],['brake torque F / R',`${L.brakes.frontTorqueNm.toFixed(0)} / ${L.brakes.rearTorqueNm.toFixed(0)} N·m`],['brake power F / R',`${L.brakes.frontPowerKw.toFixed(1)} / ${L.brakes.rearPowerKw.toFixed(1)} kW`],['ABS',`${L.abs.enabled?'ON':'OFF'}${L.abs.frontActive||L.abs.rearActive?' · ACTIVE':''}`],['TC',`${L.tc.enabled?'ON':'OFF'} · ${(L.tc.torqueFactor*100).toFixed(0)}% torque`]];q('advTele').innerHTML=rows.map(r=>`<span>${r[0]}</span><b>${r[1]}</b>`).join('');let H=global.DUCATI_ADVANCED_POWERTRAIN.states[A.domain()==='FREE_ROAD'?'free':'dyno'].history.slice(-180);plot(q('advTrace'),H.map(x=>({y:x.drive.rearWheelPowerKw-x.brakes.frontPowerKw-x.brakes.rearPowerKw})))}setInterval(update,100);apply();sweep();global.__DUCATI_V121_ADV_DYNO_UI__=true;
})(typeof window!=='undefined'?window:globalThis);


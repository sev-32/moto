

(function(global){
'use strict';
const DATA={"schema":"lucid.rider.character-comfort-dynamics.v1291","version":"V1.29.1","status":"AUTHORING_SETTLE_ALPHA","hierarchy":["ANATOMY_AND_SKIN_HARD","NONPENETRATION_AND_ACTIVE_CONTACTS","TASK_INTENT","LOCAL_GROUP_COMFORT","SHARED_BODY_COMFORT_ESCALATION","CONTACT_MANIFOLD_MIGRATION","TASK_SATURATION","STYLE"],"sharedSpineWarmStart":{"spine01.flexionExtension":-10.0,"spine02.flexionExtension":-5.0},"armWarmStart":{"R":[28.539450115989894,-2.056011653970927,-11.943051252048463,-2.4791246349923313,-31.58544236700982,1.6530240667052567,23.097789247054607,-2.340054210042581,2.44985753018409],"L":[0.07168931141495705,-14.684823500458151,-20.093813486397266,8.693565601482987,-32,0.6209936989471316,-16.109681909903884,1.7745666056871414,7.5797324208542705]},"contactFirstSharedWitness":{"R":[39.75332660973072,-0.9907895149663091,-22.20081003010273,-4.036148404702544,-32,-0.06199329625815153,20.229442631825805,-0.9553315304219723,3.3450942458584905]},"rightControlReadyWitness":{"arm":[35.157620234414935,-5.804686030372977,-20.019656293094158,-7.821179081685841,-21.70054489094764,-5.937853544950485,7.984132679179311,0.7225054339505732,1.025790230371058],"meanPalmGripAxisTmm":-11.272382843677493,"indexLeverGapMm":11.79930795408359,"middleLeverGapMm":30.375834648982796,"authority":"EXPLORATORY_WITNESS_NOT_DEFAULT_EQUILIBRIUM"},"comfort":{"spine":{"spine01.flexionExtension":{"softDeg":12,"weight":0.45,"omega":2.2},"spine02.flexionExtension":{"softDeg":8,"weight":0.45,"omega":2.4}},"arm":{"Wrist.flexionExtension":{"softDeg":18,"weight":3.5,"omega":5.0},"Wrist.radialUlnarDeviation":{"softDeg":12,"weight":2.7,"omega":5.0},"Forearm.pronationSupination":{"softDeg":20,"weight":2.3,"omega":4.2},"Elbow.flexionExtension":{"softDeg":24,"weight":1.0,"omega":3.8},"Shoulder.flexionExtension":{"softDeg":26,"weight":0.7,"omega":3.2},"Shoulder.abductionAdduction":{"softDeg":22,"weight":0.7,"omega":3.2},"Shoulder.axialRotation":{"softDeg":26,"weight":0.7,"omega":3.2},"Clavicle.elevationDepression":{"softDeg":8,"weight":1.0,"omega":2.8},"Clavicle.protractionRetraction":{"softDeg":9,"weight":1.0,"omega":2.8}},"hardLimitReserveFraction":0.14,"hardLimitBarrierGain":8.0,"dampingRatio":1.0,"modalOmega":2.8},"gripManifold":{"coordinates":["t_axial","phi_roll"],"rightRelaxedWitnessMeanTmm":87.6,"rightControlReadyWitnessMeanTmm":-11.272382843677493,"note":"t and phi are contact-state coordinates chosen by comfort/task energy, not authored hand positions."},"controlRoles":{"right":{"primaryGrip":["palm","thumb","ring","pinky"],"controlReady":["index","middle"],"tasks":["throttle","frontBrake"]},"left":{"primaryGrip":["palm","thumb","ring","pinky"],"controlReady":["index","middle"],"tasks":["clutch"]}},"throttleSweepWitness":[{"throttle":0,"wristCommandDeg":40.52438652056428,"forearmCommandDeg":-41.94305125204846,"gripState":"ENGAGED","gripGapMm":0.200612494539381,"semanticLeverGapMm":126.51110698548351},{"throttle":0.25,"wristCommandDeg":37.444246031653044,"forearmCommandDeg":-40.403869849347956,"gripState":"ENGAGED","gripGapMm":0.4101711414625474,"semanticLeverGapMm":129.0405035645248},{"throttle":0.5,"wristCommandDeg":34.36410554274181,"forearmCommandDeg":-38.86468844664745,"gripState":"ENGAGED","gripGapMm":0.39988812382531214,"semanticLeverGapMm":131.67762287307923},{"throttle":0.75,"wristCommandDeg":31.283965053830578,"forearmCommandDeg":-37.325507043946935,"gripState":"ENGAGED","gripGapMm":0.14716519293739466,"semanticLeverGapMm":134.40637620588865},{"throttle":1,"wristCommandDeg":28.20382456491934,"forearmCommandDeg":-35.78632564124643,"gripState":"ENGAGED","gripGapMm":0.06576107463787152,"semanticLeverGapMm":137.23799316591942}],"truth":{"pelvisComfortAuthority":"NONE_IN_HAND_UPPER_BODY_TIER","warmStartsHaveFinalAuthority":false,"linearPoseTweenIsConstraintAuthority":false,"settlingPolicy":"PROJECTED_SPRING_DAMPER_WITH_BACKTRACK_OR_HOLD","controlReadyRightLeverContactSolved":false,"leftLeverContactSolved":false,"rightThrottleGripRetainedAcrossSweep":true,"runtime540HzCertified":false,"independentDofTweenIsComfortAuthority":false,"modalPathRequiresLiveRevalidation":true},"modalComfortPath":{"R":{"sWaypoint":0.8,"contactFirst":[39.75332660973072,-0.9907895149663091,-22.20081003010273,-4.036148404702544,-32,-0.06199329625815153,20.229442631825805,-0.9553315304219723,3.3450942458584905],"waypoint":[29.577187637193127,-1.3040297152474523,-14.1138026941102,-2.532729223370552,-31.903496881760656,0.8719374427571893,23.110881991870702,-1.632997815869749,2.1474650649353864],"relaxed":[28.539450115989894,-2.056011653970927,-11.943051252048463,-2.4791246349923313,-31.58544236700982,1.6530240667052567,23.097789247054607,-2.340054210042581,2.44985753018409],"authority":"VALIDATED_CONSTRAINT_MANIFOLD_WAYPOINT_WARMSTART_ZERO_FINAL_AUTHORITY"},"L":{"relaxed":[0.07168931141495705,-14.684823500458151,-20.093813486397266,8.693565601482987,-32,0.6209936989471316,-16.109681909903884,1.7745666056871414,7.5797324208542705],"authority":"CONTACT_FIRST_ALREADY_NEAR_RELAXED_IN_SHARED_SPINE_PROOF"}}};
const state={
 enabled:true,acquired:false,mode:'RELAXED',phase:'UNACQUIRED',
 targets:{shared:{},L:[],R:[]},
 current:{shared:{},L:[],R:[]},
 velocity:{shared:{},L:[],R:[]},
 lastValid:{shared:{},L:[],R:[]},
 blocked:false,blockedSide:null,blockedCount:0,lastAudit:null,initialPelvis:null,
 modal:{s:1,v:0,target:1,lastValidS:1}
};
const H=()=>global.LUCID_AUTOMATIC_HAND_GRIP_V1290;
const R=()=>global.LUCID_RIDER_CONTROL_V12853;
const C=()=>global.LUCID_RIDER_CONTACTS_V12851;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ARM_SUFFIX=[
 'Wrist.flexionExtension','Wrist.radialUlnarDeviation','Forearm.pronationSupination',
 'Elbow.flexionExtension','Shoulder.flexionExtension','Shoulder.abductionAdduction',
 'Shoulder.axialRotation','Clavicle.elevationDepression','Clavicle.protractionRetraction'
];
const SPINE=['spine01.flexionExtension','spine02.flexionExtension'];
function armNames(side){const p=side==='L'?'left':'right';return ARM_SUFFIX.map(s=>p+s)}
function defs(){return Object.fromEntries((R()?.definitions||[]).map(d=>[d.id,d]))}
function copy(x){return JSON.parse(JSON.stringify(x))}
function currentArm(side){const r=R();return armNames(side).map(k=>+(r.controls.dofOffsets?.[k]||0))}
function applyArm(side,x){const r=R(),n=armNames(side);for(let i=0;i<n.length;i++)r.controls.dofOffsets[n[i]]=+x[i]||0;r.updateNow()}
function currentShared(){const r=R();return Object.fromEntries(SPINE.map(k=>[k,+(r.controls.dofOffsets?.[k]||0)]))}
function applyShared(s){const r=R();for(const k of SPINE)r.controls.dofOffsets[k]=+(s[k]||0);r.updateNow()}
function pelvisOffsets(){const r=R();return{
 pitch:+(r.controls.dofOffsets?.['pelvis.pitch']||0),
 yaw:+(r.controls.dofOffsets?.['pelvis.yaw']||0),
 roll:+(r.controls.dofOffsets?.['pelvis.roll']||0)
}}
function armComfortSpec(id){
 const suffix=ARM_SUFFIX.find(s=>id.endsWith(s));return DATA.comfort.arm[suffix]
}
function comfortEnergySide(side){
 const r=R(),D=defs(),names=armNames(side),x=currentArm(side),parts={};let E=0;
 for(let i=0;i<names.length;i++){
  const id=names[i],spec=armComfortSpec(id),off=x[i],cmd=+(r.runtime?.pose?.commands?.[id]||0),d=D[id];
  let e=spec.weight*(off/spec.softDeg)**2;
  if(d){
   const span=Math.max(1e-6,d.maxDeg-d.minDeg),reserve=Math.min(cmd-d.minDeg,d.maxDeg-cmd)/span,
     f=DATA.comfort.hardLimitReserveFraction;
   if(reserve<f)e+=spec.weight*DATA.comfort.hardLimitBarrierGain*((f-reserve)/f)**2;
  }
  parts[id]=e;E+=e;
 }
 return{energy:E,parts,offsets:x,commands:Object.fromEntries(names.map(k=>[k,r.runtime?.pose?.commands?.[k]]))}
}
function sharedEnergy(){
 const r=R();let E=0,parts={};
 for(const k of SPINE){const s=DATA.comfort.spine[k],v=+(r.controls.dofOffsets?.[k]||0),e=s.weight*(v/s.softDeg)**2;parts[k]=e;E+=e}
 return{energy:E,parts,offsets:currentShared()}
}
function validateSide(side){
 const h=H(),base=h?.state?.baseline?.[side];
 if(!h||!base)return{valid:false,reason:'NO_BASELINE'};
 const pm=h.palmMetric(side,base),A=h.data.acceptance,good=pm.bands.filter(b=>b.q05Mm<=A.palmBandQ05MaxMm).length;
 const valid=!pm.badShoulder&&
   pm.broad.maxPenMm<=A.broadHandCylinderPenetrationProxyMaxMm&&
   pm.frame.axisErrorDeg<=A.palmAxisErrorMaxDeg&&
   pm.frame.palmarNormalErrorDeg<=A.palmarNormalErrorMaxDeg&&good>=3;
 return{valid,goodPalmBands:good,palm:pm};
}
function contactSnapshot(){
 const c=C();c?.refresh?.();const s=c?.evaluate?.()?.states||{};
 return{L:s.leftHand||null,R:s.rightHand||null}
}
function audit(){
 const L=validateSide('L'),Rr=validateSide('R'),contacts=contactSnapshot(),
 eL=comfortEnergySide('L'),eR=comfortEnergySide('R'),eS=sharedEnergy(),pelvis=pelvisOffsets();
 const out={
  schema:'lucid.rider.character-comfort-audit.v1291',
  valid:L.valid&&Rr.valid,
  sides:{L,R:Rr},contacts,energy:{L:eL,R:eR,shared:eS,total:eL.energy+eR.energy+eS.energy},
  pelvis,phase:state.phase,mode:state.mode,blocked:state.blocked,blockedSide:state.blockedSide
 };
 state.lastAudit=out;return out;
}
function setTargetRelaxed(){
 state.targets.shared=copy(DATA.sharedSpineWarmStart);
 state.targets.R=DATA.armWarmStart.R.slice();
 state.targets.L=DATA.armWarmStart.L.slice();
 state.mode='RELAXED';return copy(state.targets)
}
function saveCurrent(){
 state.current.shared=currentShared();state.current.L=currentArm('L');state.current.R=currentArm('R');
 state.lastValid=copy(state.current);
 if(!state.velocity.L.length){state.velocity.L=state.current.L.map(()=>0);state.velocity.R=state.current.R.map(()=>0)}
 for(const k of SPINE)if(!Number.isFinite(state.velocity.shared[k]))state.velocity.shared[k]=0;
}
function applyState(q){
 applyShared(q.shared);applyArm('L',q.L);applyArm('R',q.R);C()?.refresh?.()
}
function tryCandidate(candidate){
 const before=copy(state.lastValid);
 applyState(candidate);
 const a=audit();
 if(a.valid){
   state.lastValid=copy(candidate);state.current=copy(candidate);state.blocked=false;state.blockedSide=null;return{ok:true,audit:a}
 }
 // backtrack globally; hard constraints outrank comfort.
 for(const f of [.5,.25,.125,.0625]){
   const q={shared:{},L:[],R:[]};
   for(const k of SPINE)q.shared[k]=before.shared[k]+(candidate.shared[k]-before.shared[k])*f;
   q.L=before.L.map((v,i)=>v+(candidate.L[i]-v)*f);
   q.R=before.R.map((v,i)=>v+(candidate.R[i]-v)*f);
   applyState(q);const b=audit();
   if(b.valid){state.lastValid=copy(q);state.current=copy(q);state.blocked=true;state.blockedCount++;return{ok:true,projected:true,audit:b}}
 }
 applyState(before);state.current=copy(before);state.blocked=true;state.blockedCount++;
 state.blockedSide=!a.sides.L.valid&&!a.sides.R.valid?'BOTH':!a.sides.L.valid?'L':!a.sides.R.valid?'R':null;
 state.lastAudit=audit();
 return{ok:false,audit:state.lastAudit}
}
function omegaFor(id){
 if(DATA.comfort.spine[id])return DATA.comfort.spine[id].omega;
 const s=armComfortSpec(id);return s?.omega||3;
}
function integrateOne(q,v,target,omega,dt){
 const z=DATA.comfort.dampingRatio,a=omega*omega*(target-q)-2*z*omega*v,
 vn=v+a*dt,qn=q+vn*dt;return[qn,vn]
}

function modalRight(s){
 const P=DATA.modalComfortPath.R,w=P.sWaypoint;
 if(s<=w){const u=clamp(s/Math.max(1e-6,w),0,1);return P.contactFirst.map((v,i)=>v+(P.waypoint[i]-v)*u)}
 const u=clamp((s-w)/Math.max(1e-6,1-w),0,1);return P.waypoint.map((v,i)=>v+(P.relaxed[i]-v)*u)
}
function applyModalS(s){
 const q={shared:copy(state.targets.shared),L:state.targets.L.slice(),R:modalRight(s)};
 applyState(q);const a=audit();
 return{q,audit:a,valid:a.valid}
}
function advanceModal(dt=1/60){
 if(!state.acquired)return{ok:false,status:'NOT_ACQUIRED'};
 dt=clamp(+dt||0,1/1000,.05);
 const m=state.modal,omega=DATA.comfort.modalOmega,z=DATA.comfort.dampingRatio,
   acc=omega*omega*(m.target-m.s)-2*z*omega*m.v,
   vn=m.v+acc*dt,raw=clamp(m.s+vn*dt,0,1);
 let test=applyModalS(raw);
 if(test.valid){
   m.s=raw;m.v=vn;m.lastValidS=raw;state.current=copy(test.q);state.lastValid=copy(test.q);
   state.blocked=false;state.blockedSide=null;state.phase=m.s>.995?'RELAXED_EQUILIBRIUM':'MODAL_SETTLING';
   return{ok:true,status:'ADVANCED_MODAL',s:m.s,audit:test.audit,snapshot:snapshot()}
 }
 // scalar backtracking stays on the prevalidated coordinated mode instead of independently tweening joints.
 const old=m.lastValidS;
 for(const f of [.5,.25,.125,.0625]){
   const ss=old+(raw-old)*f,t=applyModalS(ss);
   if(t.valid){
     m.s=ss;m.v=0;m.lastValidS=ss;state.current=copy(t.q);state.lastValid=copy(t.q);
     state.blocked=true;state.blockedCount++;state.phase='MODAL_PROJECTED';
     return{ok:true,status:'PROJECTED_MODAL',s:m.s,audit:t.audit,snapshot:snapshot()}
   }
 }
 applyModalS(old);m.s=old;m.v=0;state.blocked=true;state.blockedCount++;state.phase='MODAL_BLOCKED';
 state.lastAudit=audit();
 return{ok:false,status:'MODAL_BLOCKED',s:m.s,audit:state.lastAudit,snapshot:snapshot()}
}

function advance(dt=1/60){
 if(!state.acquired)return{ok:false,status:'NOT_ACQUIRED'};
 dt=clamp(+dt||0,1/1000,.05);
 const q=copy(state.current),vel=state.velocity;
 for(const k of SPINE){const [nq,nv]=integrateOne(q.shared[k],vel.shared[k]||0,state.targets.shared[k],omegaFor(k),dt);q.shared[k]=nq;vel.shared[k]=nv}
 for(const side of['L','R']){
  const names=armNames(side);
  for(let i=0;i<names.length;i++){const [nq,nv]=integrateOne(q[side][i],vel[side][i]||0,state.targets[side][i],omegaFor(names[i]),dt);q[side][i]=nq;vel[side][i]=nv}
 }
 const res=tryCandidate(q);
 if(!res.ok||res.projected){
  // constraint projection absorbs momentum at the blocked boundary.
  if(state.blockedSide==='L'||state.blockedSide==='BOTH')state.velocity.L.fill(0);
  if(state.blockedSide==='R'||state.blockedSide==='BOTH')state.velocity.R.fill(0);
 }
 return{...res,status:res.ok?(res.projected?'PROJECTED':'ADVANCED'):'BLOCKED',snapshot:snapshot()}
}
function settle(seconds=1.5,dt=1/60){
 const n=Math.max(1,Math.ceil(seconds/dt)),rows=[];
 for(let i=0;i<n;i++){const r=advanceModal(dt);if(i===0||i===n-1||i%Math.max(1,Math.floor(n/6))===0)rows.push({i,t:i*dt,status:r.status,audit:state.lastAudit});if(!r.ok&&state.blockedCount>4)break}
 return{rows,snapshot:snapshot()}
}
function applyRelaxedWarm(){
 if(!state.acquired)return{ok:false,status:'NOT_ACQUIRED'};
 const pre=copy(state.current),q={shared:copy(state.targets.shared),L:state.targets.L.slice(),R:state.targets.R.slice()};
 applyState(q);const a=audit();
 if(a.valid){state.current=copy(q);state.lastValid=copy(q);state.velocity.L.fill(0);state.velocity.R.fill(0);for(const k of SPINE)state.velocity.shared[k]=0;state.modal.s=1;state.modal.v=0;state.modal.target=1;state.modal.lastValidS=1;state.phase='RELAXED_EQUILIBRIUM';return{ok:true,audit:a}}
 applyState(pre);state.current=pre;return{ok:false,status:'WARM_TARGET_INVALID',audit:a}
}
function acquire(){
 const r=R(),h=H();if(!r||!h)return{ok:false,status:'DEPENDENCY_MISSING'};
 state.initialPelvis=pelvisOffsets();
 setTargetRelaxed();
 // Shared-body escalation is explicit and pelvis-free.
 applyShared(state.targets.shared);h.invalidate?.();
 const rr=h.solveHand('R'),ll=h.solveHand('L');
 if(!rr?.ok||!ll?.ok){
   // Revert shared escalation and reacquire local hands rather than violating contacts.
   applyShared({'spine01.flexionExtension':0,'spine02.flexionExtension':0});h.invalidate?.();
   const r0=h.solveHand('R'),l0=h.solveHand('L');
   state.phase='LOCAL_ONLY_FALLBACK';state.acquired=!!(r0?.ok&&l0?.ok);saveCurrent();return{ok:state.acquired,status:state.phase,R:r0,L:l0,audit:audit()}
 }
 state.phase='SHARED_COMFORT_ACQUIRED';state.acquired=true;saveCurrent();
 const warm=applyRelaxedWarm();state.phase=warm.ok?'RELAXED_EQUILIBRIUM':'SHARED_CONTACT_FIRST';
 return{ok:true,status:state.phase,R:rr,L:ll,warm,audit:audit()}
}

function adoptAcquired(){
 const h=H();
 if(!h?.state?.baseline?.L||!h?.state?.baseline?.R||!h?.state?.accepted?.L||!h?.state?.accepted?.R)
   return{ok:false,status:'CONTACT_BASELINES_NOT_READY'};
 state.initialPelvis=state.initialPelvis||pelvisOffsets();
 setTargetRelaxed();state.acquired=true;state.phase='SHARED_CONTACT_FIRST';saveCurrent();
 const warm=applyRelaxedWarm();state.phase=warm.ok?'RELAXED_EQUILIBRIUM':'SHARED_CONTACT_FIRST';
 return{ok:true,status:state.phase,warm,audit:audit()};
}

function resetToContactFirst(){
 if(!state.acquired)return false;
 const h=H(),r=h.state.last.R?.armX||DATA.contactFirstSharedWitness.R,l=h.state.last.L?.armX||state.current.L;
 const q={shared:copy(DATA.sharedSpineWarmStart),L:l.slice(),R:r.slice()};applyState(q);state.current=copy(q);state.lastValid=copy(q);
 state.velocity.L=q.L.map(()=>0);state.velocity.R=q.R.map(()=>0);for(const k of SPINE)state.velocity.shared[k]=0;
 state.modal.s=0;state.modal.v=0;state.modal.target=1;state.modal.lastValidS=0;state.phase='CONTACT_FIRST_SHARED';return audit()
}
function throttleAudit(){
 const r=R(),c=C(),old=r.controls.throttle,rows=[];
 for(const t of[0,.25,.5,.75,1]){r.controls.throttle=t;r.updateNow();c.refresh();const s=c.evaluate().states.rightHand;
  rows.push({throttle:t,wristCommandDeg:r.runtime.pose.commands['rightWrist.flexionExtension'],
   forearmCommandDeg:r.runtime.pose.commands['rightForearm.pronationSupination'],gripState:s.state,gripGapM:s.gapM})}
 r.controls.throttle=old;r.updateNow();c.refresh();return rows
}
function snapshot(){
 return copy({version:'V1.29.1',state:{enabled:state.enabled,acquired:state.acquired,mode:state.mode,phase:state.phase,
  targets:state.targets,current:state.current,velocity:state.velocity,blocked:state.blocked,blockedSide:state.blockedSide,
  blockedCount:state.blockedCount,initialPelvis:state.initialPelvis},audit:state.lastAudit,truth:DATA.truth,
  controlReadyWitness:DATA.rightControlReadyWitness})
}
setTargetRelaxed();
global.LUCID_CHARACTER_COMFORT_DYNAMICS_V1291={version:'V1.29.1',data:DATA,state,acquire,adoptAcquired,audit,advance,advanceModal,settle,
 applyRelaxedWarm,resetToContactFirst,throttleAudit,comfortEnergySide,sharedEnergy,validateSide,setTargetRelaxed,snapshot};
global.__LUCID_V1291_COMFORT_READY__=true;
})(window);


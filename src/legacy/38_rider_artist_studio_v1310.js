

(function(global){
'use strict';
const DATA={"schema":"lucid.rider.artist-authoring-studio.v1310","version":"V1.31.0","baseAuthority":"V1.30.0_RIDER_OPERATIONS_STUDIO","cameraMap":{"THREE_QUARTER":"persp","TOP":"top","REAR":"rear","SIDE":"side","FRONT":"front"},"targets":{"rightKnee":{"label":"RIGHT KNEE","owner":"right_leg","pick":{"type":"effector","id":"rightKnee"},"allowed":["rightHip.flexionExtension","rightHip.abductionAdduction","rightHip.axialRotation","rightKnee.flexionExtension","rightKnee.axialRotation","rightAnkle.dorsiPlantarflexion","rightAnkle.inversionEversion","rightAnkle.axialRotation","rightToe.flexionExtension"],"locks":["pelvis","rightFoot","leftFoot","leftHand","rightHand"],"requiredContacts":["leftHand","rightHand","leftFoot","rightFoot","pelvis"],"collisionGroups":["rightLeg"],"outwardSignX":-1},"leftKnee":{"label":"LEFT KNEE","owner":"left_leg","pick":{"type":"effector","id":"leftKnee"},"allowed":["leftHip.flexionExtension","leftHip.abductionAdduction","leftHip.axialRotation","leftKnee.flexionExtension","leftKnee.axialRotation","leftAnkle.dorsiPlantarflexion","leftAnkle.inversionEversion","leftAnkle.axialRotation","leftToe.flexionExtension"],"locks":["pelvis","leftFoot","rightFoot","leftHand","rightHand"],"requiredContacts":["leftHand","rightHand","leftFoot","rightFoot","pelvis"],"collisionGroups":["leftLeg"],"outwardSignX":1},"rightElbow":{"label":"RIGHT ELBOW","owner":"right_arm","pick":{"type":"joint","id":"R_Forearm"},"allowed":["rightClavicle.protractionRetraction","rightClavicle.elevationDepression","rightShoulder.flexionExtension","rightShoulder.abductionAdduction","rightShoulder.axialRotation","rightElbow.flexionExtension","rightForearm.pronationSupination","rightWrist.flexionExtension","rightWrist.radialUlnarDeviation"],"locks":["pelvis","rightHand","leftHand","rightFoot","leftFoot"],"requiredContacts":["leftHand","rightHand","leftFoot","rightFoot","pelvis"],"collisionGroups":[],"outwardSignX":-1},"leftElbow":{"label":"LEFT ELBOW","owner":"left_arm","pick":{"type":"joint","id":"L_Forearm"},"allowed":["leftClavicle.protractionRetraction","leftClavicle.elevationDepression","leftShoulder.flexionExtension","leftShoulder.abductionAdduction","leftShoulder.axialRotation","leftElbow.flexionExtension","leftForearm.pronationSupination","leftWrist.flexionExtension","leftWrist.radialUlnarDeviation"],"locks":["pelvis","leftHand","rightHand","leftFoot","rightFoot"],"requiredContacts":["leftHand","rightHand","leftFoot","rightFoot","pelvis"],"collisionGroups":[],"outwardSignX":1},"head":{"label":"HEAD / GAZE","owner":"head_neck","pick":{"type":"joint","id":"Head"},"allowed":["spine02.flexionExtension","spine02.lateralBend","spine02.axialRotation","neck.flexionExtension","neck.lateralBend","neck.axialRotation","head.nod","head.tilt","head.turn"],"locks":["pelvis","leftHand","rightHand","leftFoot","rightFoot"],"requiredContacts":["leftHand","rightHand","leftFoot","rightFoot","pelvis"],"collisionGroups":[],"outwardSignX":1}},"profiles":[{"id":"MINIMUM_CHANGE","label":"MINIMUM CHANGE","targetWeight":1.0,"lockScale":1.15,"lambda":3.0,"clearanceMinMm":0.0},{"id":"ARTIST_SILHOUETTE","label":"ARTIST SILHOUETTE","targetWeight":1.35,"lockScale":1.0,"lambda":0.8,"clearanceMinMm":0.0},{"id":"MAXIMUM_CLEARANCE","label":"MAXIMUM CLEARANCE","targetWeight":1.1,"lockScale":1.25,"lambda":1.2,"clearanceMinMm":12.0}],"acceptance":{"handGapMaxMm":3.0,"footGapMaxMm":5.0,"wristFlexMaxDeg":20.0,"wristDeviationMaxDeg":14.0,"palmBandQ05MaxMm":3.5,"minPalmBands":3,"maxPalmPenetrationMm":1.5,"maxPalmAxisErrorDeg":25.0,"maxPalmarNormalErrorDeg":25.0,"maxShoulderP99":1.3,"targetErrorMaxPx":28.0},"statusModel":["AI_PROPOSED","ENGINE_VALID","ARTIST_APPROVED","FULLY_CERTIFIED"],"truth":{"rawBoneWrites":false,"semanticDofOnly":true,"candidateCommitIsAtomic":true,"artistApprovalSeparateFromEngineValidation":true,"fullyCertifiedRequiresExternalRenderAndRegression":true,"poseSpaceCorrectiveEditorIncluded":false,"contactPainterIncluded":false}};
const state={
 selectedTarget:'rightKnee',
 directManipulation:true,
 currentRecipe:null,
 solveBaseline:null,
 candidates:[],
 previewIndex:-1,
 currentLayer:null,
 layers:[],
 correctionMemory:[],
 undo:[],
 redo:[],
 artistCamera:null,
 drag:null,
 overlayTimer:null,
 panelOpen:true,
 lastError:null,
 sessionId:'V1310-'+Date.now().toString(36)
};

const R=()=>global.LUCID_RIDER_CONTROL_V12853;
const S=()=>global.LUCID_RIDER_STUDIO_V12855A;
const C=()=>global.LUCID_RIDER_CONTACTS_V12851;
const H=()=>global.LUCID_AUTOMATIC_HAND_GRIP_V1290;
const CR=()=>global.LUCID_EMBODIED_COLLISION_REGISTRY_V1289;
const CS=()=>global.LUCID_EMBODIED_CONSTRAINT_SOLVER_V1288;
const CB=()=>global.LUCID_CORNER_BALANCE_V12862;
const Ops=()=>global.LUCID_RIDER_OPERATIONS_V1300;
const deep=x=>JSON.parse(JSON.stringify(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const nowISO=()=>new Date().toISOString();

function editableState(){
 const r=R();
 return{
  controls:{
   throttle:r.controls.throttle,clutch:r.controls.clutch,
   frontBrake:r.controls.frontBrake,rearBrake:r.controls.rearBrake,
   seatForeAft:r.controls.seatForeAft,posture:r.controls.posture,shift:r.controls.shift,
   lookYawDeg:r.controls.lookYawDeg,lookPitchDeg:r.controls.lookPitchDeg,
   horizonLock:r.controls.horizonLock,followBike:r.controls.followBike,linkBike:r.controls.linkBike,
   dofOffsets:deep(r.controls.dofOffsets||{}),
   comfortLimits:deep(r.controls.comfortLimits||{}),
   enforceComfort:!!r.controls.enforceComfort,
   taskLimits:deep(r.controls.taskLimits||{}),
   activeTaskMode:r.controls.activeTaskMode,
   enforceTaskLimits:!!r.controls.enforceTaskLimits,
   poseOverride:deep(r.controls.poseOverride),
   fingerMultipliers:deep(r.controls.fingerMultipliers||{}),
   fingerJointOffsets:deep(r.controls.fingerJointOffsets||{}),
   fingerOppositionOffsets:deep(r.controls.fingerOppositionOffsets||{})
  }
 };
}
function restoreEditable(s){
 const r=R(),c=deep(s.controls);
 for(const[k,v]of Object.entries(c))r.controls[k]=v;
 r.updateNow();C().refresh();
 try{H().installContactAuthority()}catch(_){}
 C().refresh();S().renderAll()
}
function stateDelta(a,b){
 const out={dof:{},hipTargetMm:[0,0,0],fingerOffsetCount:0};
 const A=a.controls.dofOffsets||{},B=b.controls.dofOffsets||{};
 for(const k of new Set([...Object.keys(A),...Object.keys(B)])){
  const d=(B[k]||0)-(A[k]||0);if(Math.abs(d)>1e-7)out.dof[k]=d
 }
 const ah=a.controls.poseOverride?.hipTargetM,bh=b.controls.poseOverride?.hipTargetM;
 if(ah&&bh)out.hipTargetMm=ah.map((v,i)=>(bh[i]-v)*1000);
 out.fingerOffsetCount=Object.keys(b.controls.fingerJointOffsets||{}).length;
 return out
}
function definitionMap(){return Object.fromEntries((R().definitions||[]).map(d=>[d.id,d]))}
function pick(type,id){
 return S().pickCandidates().find(x=>x.type===type&&x.id===id)||null
}
function effectorPick(id){return pick('effector',id)}
function targetPick(recipe){
 const q=DATA.targets[recipe.target]?.pick;
 return q?pick(q.type,q.id):null
}
function camera(viewName){
 const id=DATA.cameraMap[viewName]||viewName;
 let setView=null;
 try{setView=(0,eval)('view')}catch(_){}
 if(typeof setView==='function')setView(id);
 else document.querySelector(`#v12855Cam [data-cam='${id}']`)?.click();
 S().renderAll();drawOverlay();
 return{view:viewName,id}
}
function parseIntent(text){
 text=String(text||'').trim();
 const lower=text.toLowerCase();
 let target=state.selectedTarget;
 if(/right[^.]{0,18}knee|knee[^.]{0,18}right/.test(lower))target='rightKnee';
 else if(/left[^.]{0,18}knee|knee[^.]{0,18}left/.test(lower))target='leftKnee';
 else if(/right[^.]{0,18}elbow|elbow[^.]{0,18}right/.test(lower))target='rightElbow';
 else if(/left[^.]{0,18}elbow|elbow[^.]{0,18}left/.test(lower))target='leftElbow';
 else if(/head|neck|gaze|horizon/.test(lower))target='head';
 const T=DATA.targets[target];
 let dx=0,dy=0;
 if(/outward|outside|wider|wide stance/.test(lower))dx+=T.outwardSignX*42;
 if(/inward|inside|narrower/.test(lower))dx-=T.outwardSignX*36;
 if(/higher|raise|upward|move up/.test(lower))dy-=26;
 if(/lower|downward|move down/.test(lower))dy+=26;
 if(/forward/.test(lower)){dx-=12;dy-=10}
 if(/backward|rearward/.test(lower)){dx+=12;dy+=10}
 const px=lower.match(/(?:x|horizontal)[^-\d]*(-?\d+(?:\.\d+)?)\s*(?:px|pixel)/);
 const py=lower.match(/(?:y|vertical)[^-\d]*(-?\d+(?:\.\d+)?)\s*(?:px|pixel)/);
 if(px)dx=+px[1];if(py)dy=+py[1];
 if(dx===0&&dy===0)dx=T.outwardSignX*34;
 const cm=lower.match(/(?:clearance|clear)[^\d]*(\d+(?:\.\d+)?)\s*mm/)||
          lower.match(/(\d+(?:\.\d+)?)\s*mm[^.]{0,18}(?:clearance|clear)/);
 const clearanceMinMm=cm?+cm[1]:0;
 const recipe={
  schema:'lucid.rider.operation-recipe.v1310',
  id:'recipe-'+Date.now().toString(36),
  createdAt:nowISO(),
  intentText:text||`Move ${T.label.toLowerCase()} with protected contacts`,
  target,
  owner:T.owner,
  targetScreenDeltaPx:{x:dx,y:dy},
  allowedControls:T.allowed.slice(),
  lockedEffectors:T.locks.slice(),
  requirements:{
   contacts:T.requiredContacts.slice(),
   collisionGroups:T.collisionGroups.slice(),
   clearanceMinMm,
   preservePelvis:T.locks.includes('pelvis'),
   preserveMassPosition:T.locks.includes('pelvis'),
   hardWristLimits:true
  },
  preferences:{
   comfort:.85,minimumChange:.75,silhouette:.65,clearance:clearanceMinMm>0?1:.25
  },
  interpretation:`${T.label}: screen delta ${dx.toFixed(1)} / ${dy.toFixed(1)} px; owner ${T.owner}; `+
    `locks ${T.locks.join(', ')}; ${clearanceMinMm?`clearance ${clearanceMinMm} mm`:'no added clearance request'}`
 };
 state.selectedTarget=target;state.currentRecipe=recipe;renderUI();drawOverlay();
 return deep(recipe)
}
function setRecipe(recipe){
 const t=DATA.targets[recipe?.target];
 if(!t)throw Error('unsupported target '+recipe?.target);
 state.currentRecipe=deep(recipe);state.selectedTarget=recipe.target;
 renderUI();drawOverlay();return deep(state.currentRecipe)
}
function lockWeight(id,profile){
 const base=id==='pelvis'?6:(/Foot/.test(id)?3.8:(/Hand/.test(id)?3.2:2.2));
 return base*profile.lockScale
}
function linearSolve(A,b){
 const n=b.length,M=A.map((row,i)=>row.slice().concat([b[i]]));
 for(let i=0;i<n;i++){
  let p=i;for(let k=i+1;k<n;k++)if(Math.abs(M[k][i])>Math.abs(M[p][i]))p=k;
  [M[i],M[p]]=[M[p],M[i]];
  let d=M[i][i];if(Math.abs(d)<1e-9)d=d<0?-1e-9:1e-9;
  for(let j=i;j<=n;j++)M[i][j]/=d;
  for(let k=0;k<n;k++)if(k!==i){
   const f=M[k][i];for(let j=i;j<=n;j++)M[k][j]-=f*M[i][j]
  }
 }
 return M.map(row=>row[n])
}
function contactValid(name,s){
 if(!s)return false;
 const loaded=['ENGAGED','LOADED'].includes(s.state),gap=s.gapM*1000,A=DATA.acceptance;
 if(/Hand/.test(name))return loaded&&gap<=A.handGapMaxMm;
 if(/Foot/.test(name))return loaded&&gap<=A.footGapMaxMm;
 if(name==='pelvis')return loaded;
 return loaded
}
function palmAudit(Side){
 const h=H(),r=R(),pm=h.palmMetric(Side,h.state.baseline[Side]),pre=Side==='L'?'left':'right',
  wf=r.runtime.pose.commands[pre+'Wrist.flexionExtension']||0,
  wd=r.runtime.pose.commands[pre+'Wrist.radialUlnarDeviation']||0,A=DATA.acceptance,
  good=pm.bands.filter(b=>b.q05Mm<=A.palmBandQ05MaxMm).length,
  valid=!pm.badShoulder&&good>=A.minPalmBands&&pm.broad.maxPenMm<=A.maxPalmPenetrationMm&&
   pm.frame.axisErrorDeg<=A.maxPalmAxisErrorDeg&&
   pm.frame.palmarNormalErrorDeg<=A.maxPalmarNormalErrorDeg&&
   pm.shoulder.edgeP99Sym<=A.maxShoulderP99&&
   Math.abs(wf)<=A.wristFlexMaxDeg&&Math.abs(wd)<=A.wristDeviationMaxDeg;
 return{valid,good,wristFlexDeg:wf,wristDeviationDeg:wd,palm:pm}
}
function auditCandidate(recipe,basePicks,desired){
 C().refresh();
 const target=targetPick(recipe),contacts=C().evaluate().states,seat=CB().supportState(),
  locks={},collisions={},proxies={};
 let lockError2=0;
 for(const id of recipe.lockedEffectors){
  const q=effectorPick(id),b=basePicks.locks[id];
  if(q&&b){const e=Math.hypot(q.x-b.x,q.y-b.y);locks[id]={errorPx:e,current:q,baseline:b};lockError2+=e*e}
 }
 let exactValid=true;
 for(const g of recipe.requirements.collisionGroups){
  const x=CR().auditGroup(g),p=CS().collisionMetric(g);collisions[g]=x;proxies[g]=p;if(!x.valid)exactValid=false
 }
 const contactAudit={};let contactsValid=true;
 for(const name of recipe.requirements.contacts){
  const valid=contactValid(name,contacts[name]);contactAudit[name]={valid,state:contacts[name]};if(!valid)contactsValid=false
 }
 let Lp=null,Rp=null,palmsValid=true;
 if(recipe.requirements.contacts.includes('leftHand')){try{Lp=palmAudit('L');if(!Lp.valid)palmsValid=false}catch(e){Lp={valid:false,error:String(e)};palmsValid=false}}
 if(recipe.requirements.contacts.includes('rightHand')){try{Rp=palmAudit('R');if(!Rp.valid)palmsValid=false}catch(e){Rp={valid:false,error:String(e)};palmsValid=false}}
 const targetErrorPx=target?Math.hypot(target.x-desired.x,target.y-desired.y):Infinity,
  clearanceMm=Math.min(...Object.values(proxies).map(x=>x.minSignedM*1000).concat([Infinity])),
  clearanceValid=!Number.isFinite(clearanceMm)||clearanceMm>=recipe.requirements.clearanceMinMm,
  engineValid=targetErrorPx<=DATA.acceptance.targetErrorMaxPx&&contactsValid&&palmsValid&&
   exactValid&&seat.state!=='NONE'&&clearanceValid;
 return{
  schema:'lucid.rider.artist-candidate-audit.v1310',
  engineValid,targetErrorPx,lockErrorPx:Math.sqrt(lockError2),
  clearanceMm:Number.isFinite(clearanceMm)?clearanceMm:null,clearanceValid,
  contactsValid,palmsValid,exactValid,seatState:seat.state,
  target:{current:target,desired},locks,contacts:contactAudit,palms:{L:Lp,R:Rp},
  collisions,collisionProxies:proxies
 }
}
async function solveProfile(recipe,profile,baseline,basePicks,desired){
 restoreEditable(baseline);
 const r=R(),defs=definitionMap(),allowed=recipe.allowedControls.slice(),
  baseTotal=Object.fromEntries(allowed.map(k=>[k,(r.runtime.pose.commands[k]||0)-(r.controls.dofOffsets[k]||0)])),
  x0=allowed.map(k=>r.controls.dofOffsets[k]||0),
  bounds=allowed.map((k,i)=>{
   const d=defs[k];if(!d)throw Error('missing semantic DOF '+k);
   return[Math.max(d.minDeg-baseTotal[k],x0[i]-40),Math.min(d.maxDeg-baseTotal[k],x0[i]+40)]
  });
 function apply(x){for(let i=0;i<allowed.length;i++)r.controls.dofOffsets[allowed[i]]=x[i];r.updateNow();C().refresh()}
 function residual(x){
  apply(x);const t=targetPick(recipe);if(!t)return[1e6,1e6];
  const q=[(t.x-desired.x)*profile.targetWeight,(t.y-desired.y)*profile.targetWeight];
  for(const id of recipe.lockedEffectors){
   const p=effectorPick(id),b=basePicks.locks[id];if(!p||!b)continue;
   const w=lockWeight(id,profile);q.push((p.x-b.x)*w,(p.y-b.y)*w)
  }
  return q
 }
 let x=x0.slice();
 for(let iter=0;iter<7;iter++){
  const v=residual(x),m=v.length,n=x.length,J=Array.from({length:m},()=>Array(n).fill(0));
  for(let j=0;j<n;j++){
   const y=x.slice();y[j]=clamp(y[j]+1,bounds[j][0],bounds[j][1]);
   const w=residual(y),den=y[j]-x[j]||1;
   for(let i=0;i<m;i++)J[i][j]=(w[i]-v[i])/den
  }
  const A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
  for(let j=0;j<n;j++){
   for(let k=0;k<n;k++){
    let s=0;for(let i=0;i<m;i++)s+=J[i][j]*J[i][k];
    A[j][k]=s+(j===k?profile.lambda:0)
   }
   let s=0;for(let i=0;i<m;i++)s+=J[i][j]*v[i];b[j]=-s
  }
  const dx=linearSolve(A,b);
  for(let j=0;j<n;j++)x[j]=clamp(x[j]+clamp(dx[j],-8,8),bounds[j][0],bounds[j][1])
 }
 apply(x);
 const audit=auditCandidate(recipe,basePicks,desired),after=editableState(),
  delta=stateDelta(baseline,after),
  movementNorm=Math.sqrt(Object.values(delta.dof).reduce((s,v)=>s+v*v,0));
 return{
  id:'candidate-'+profile.id.toLowerCase()+'-'+Date.now().toString(36),
  profileId:profile.id,label:profile.label,
  status:audit.engineValid?'ENGINE_VALID':'AI_PROPOSED_REJECTED',
  engineValid:audit.engineValid,artistApproved:false,fullyCertified:false,
  state:after,delta,audit,movementNorm,
  score:audit.targetErrorPx+audit.lockErrorPx*.25+movementNorm*.04
 }
}
async function solveRecipe(recipe=state.currentRecipe){
 if(!recipe)throw Error('no operation recipe');
 recipe=deep(recipe);setRecipe(recipe);camera('THREE_QUARTER');S().renderAll();
 await new Promise(r=>setTimeout(r,20));
 const baseline=editableState(),t0=targetPick(recipe);
 if(!t0)throw Error('target is not projectable in the current camera');
 const basePicks={target:deep(t0),locks:{}};
 for(const id of recipe.lockedEffectors){const p=effectorPick(id);if(p)basePicks.locks[id]=deep(p)}
 const desired={x:t0.x+recipe.targetScreenDeltaPx.x,y:t0.y+recipe.targetScreenDeltaPx.y};
 state.solveBaseline=baseline;state.candidates=[];state.previewIndex=-1;
 setStatus('SOLVING CANDIDATES…');
 for(const p of DATA.profiles){
  const profile=deep(p);profile.clearanceMinMm=Math.max(profile.clearanceMinMm,recipe.requirements.clearanceMinMm||0);
  try{
   const c=await solveProfile(recipe,profile,baseline,basePicks,desired);
   state.candidates.push(c)
  }catch(e){
   state.candidates.push({id:'failed-'+p.id,profileId:p.id,label:p.label,status:'SOLVER_ERROR',
    engineValid:false,artistApproved:false,fullyCertified:false,error:String(e)})
  }
  await new Promise(r=>setTimeout(r,0))
 }
 restoreEditable(baseline);state.lastError=null;renderUI();drawOverlay();
 const valid=state.candidates.filter(c=>c.engineValid).length;
 setStatus(`${valid}/${state.candidates.length} ENGINE-VALID CANDIDATES`);
 return deep({recipe,candidates:state.candidates.map(c=>({...c,state:undefined})),validCount:valid})
}
function previewCandidate(index){
 const c=state.candidates[index];if(!c)throw Error('candidate not found');
 restoreEditable(c.state);state.previewIndex=index;renderUI();drawOverlay();
 return deep({...c,state:undefined})
}
function rejectCandidates(){
 if(state.solveBaseline)restoreEditable(state.solveBaseline);
 state.candidates=[];state.previewIndex=-1;renderUI();drawOverlay();setStatus('CANDIDATES REJECTED · BASELINE RESTORED');
 return true
}
function approveCandidate(index,name='ARTIST CORRECTION'){
 const c=state.candidates[index];if(!c)throw Error('candidate not found');
 if(!c.engineValid)throw Error('engine-invalid candidate cannot be approved');
 const before=deep(state.solveBaseline),after=deep(c.state);
 restoreEditable(after);
 const layer={
  schema:'lucid.rider.artist-correction-layer.v1310',
  id:'layer-'+Date.now().toString(36),
  name:String(name||'ARTIST CORRECTION'),
  createdAt:nowISO(),sessionId:state.sessionId,
  status:'ARTIST_APPROVED',engineValid:true,artistApproved:true,fullyCertified:false,
  recipe:deep(state.currentRecipe),candidateProfile:c.profileId,
  delta:stateDelta(before,after),audit:deep(c.audit),
  before,after
 };
 state.undo.push({before,after,layer:deep(layer)});if(state.undo.length>40)state.undo.shift();
 state.redo=[];state.layers.push(layer);
 state.correctionMemory.push({
  id:layer.id,name:layer.name,createdAt:layer.createdAt,target:layer.recipe.target,
  intentText:layer.recipe.intentText,owner:layer.recipe.owner,
  allowedControls:layer.recipe.allowedControls,
  lockedEffectors:layer.recipe.lockedEffectors,
  candidateProfile:layer.candidateProfile,
  delta:deep(layer.delta),metrics:{
   targetErrorPx:layer.audit.targetErrorPx,lockErrorPx:layer.audit.lockErrorPx,
   clearanceMm:layer.audit.clearanceMm
  },
  status:'ARTIST_APPROVED'
 });
 c.artistApproved=true;c.status='ARTIST_APPROVED';state.currentLayer=layer;
 state.solveBaseline=after;state.candidates=[];state.previewIndex=-1;
 renderUI();drawOverlay();setStatus(`ARTIST APPROVED · ${layer.name}`);
 return deep({...layer,before:undefined,after:undefined})
}
function undo(){
 const h=state.undo.pop();if(!h)return false;
 restoreEditable(h.before);state.redo.push(h);
 const i=state.layers.findIndex(x=>x.id===h.layer.id);if(i>=0)state.layers.splice(i,1);
 renderUI();drawOverlay();setStatus('UNDO · COMPLETE STATE RESTORED');return true
}
function redo(){
 const h=state.redo.pop();if(!h)return false;
 restoreEditable(h.after);state.undo.push(h);state.layers.push(h.layer);
 renderUI();drawOverlay();setStatus('REDO · ARTIST LAYER RESTORED');return true
}
function exportSession(){
 return deep({
  schema:'lucid.rider.artist-authoring-session.v1310',
  version:'V1.31.0',sessionId:state.sessionId,exportedAt:nowISO(),
  baseAuthority:DATA.baseAuthority,
  layers:state.layers.map(x=>({...x,before:undefined,after:undefined})),
  correctionMemory:state.correctionMemory,
  activeRecipe:state.currentRecipe,
  truth:DATA.truth
 })
}
function downloadSession(){
 const blob=new Blob([JSON.stringify(exportSession(),null,2)],{type:'application/json'}),
  a=document.createElement('a');a.href=URL.createObjectURL(blob);
 a.download=`LUCID_ARTIST_SESSION_${state.sessionId}.json`;a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),2000)
}
function setStatus(text){
 const e=document.querySelector('#v1310Panel [data-role=status]');if(e)e.textContent=text
}
function selectedPoint(){
 const T=DATA.targets[state.selectedTarget];return T?pick(T.pick.type,T.pick.id):null
}
function placeOverlay(){
 const gl=document.querySelector('#gl'),o=document.getElementById('v1310Overlay');
 if(!gl||!o)return;const r=gl.getBoundingClientRect();
 o.style.left=r.left+'px';o.style.top=r.top+'px';o.style.width=r.width+'px';o.style.height=r.height+'px';
 const d=devicePixelRatio||1,w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
 if(o.width!==w||o.height!==h){o.width=w;o.height=h}
}
function drawOverlay(){
 const o=document.getElementById('v1310Overlay');if(!o)return;placeOverlay();
 const d=devicePixelRatio||1,ctx=o.getContext('2d');ctx.setTransform(d,0,0,d,0,0);
 const r=o.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);
 const p=selectedPoint();if(!p)return;
 const recipe=state.currentRecipe,T=DATA.targets[state.selectedTarget];
 ctx.lineWidth=2;ctx.strokeStyle='#7ff4ff';ctx.fillStyle='rgba(0,180,220,.20)';
 ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.font='11px ui-monospace';ctx.fillStyle='#dff';ctx.fillText(T.label,p.x+14,p.y-12);
 if(recipe&&recipe.target===state.selectedTarget){
  const q=state.drag?.target||{x:p.x+recipe.targetScreenDeltaPx.x,y:p.y+recipe.targetScreenDeltaPx.y};
  ctx.setLineDash([5,4]);ctx.strokeStyle='#ffcf70';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='rgba(255,180,40,.25)';ctx.strokeStyle='#ffcf70';ctx.beginPath();ctx.arc(q.x,q.y,11,0,Math.PI*2);ctx.fill();ctx.stroke();
 }
 if(recipe){
  ctx.font='9px ui-monospace';
  for(const id of recipe.lockedEffectors){
   const z=effectorPick(id);if(!z)continue;
   ctx.fillStyle='#aaf0b8';ctx.fillRect(z.x-4,z.y-4,8,8);ctx.fillText('LOCK '+id,z.x+7,z.y+3)
  }
 }
}
function pointerLocal(e){
 const o=document.getElementById('v1310Overlay'),r=o.getBoundingClientRect();
 return{x:e.clientX-r.left,y:e.clientY-r.top}
}
function overlayDown(e){
 if(!state.directManipulation)return;const p=selectedPoint(),q=pointerLocal(e);
 if(!p||Math.hypot(q.x-p.x,q.y-p.y)>22)return;
 e.preventDefault();state.drag={start:deep(p),target:deep(p),pointerId:e.pointerId};
 e.currentTarget.setPointerCapture(e.pointerId);drawOverlay();setStatus('DRAG TARGET · RELEASE TO GENERATE CANDIDATES')
}
function overlayMove(e){
 if(!state.drag||state.drag.pointerId!==e.pointerId)return;
 state.drag.target=pointerLocal(e);drawOverlay()
}
async function overlayUp(e){
 if(!state.drag||state.drag.pointerId!==e.pointerId)return;
 const drag=state.drag;state.drag=null;
 const delta={x:drag.target.x-drag.start.x,y:drag.target.y-drag.start.y};
 const recipe=state.currentRecipe&&state.currentRecipe.target===state.selectedTarget
  ?deep(state.currentRecipe):parseIntent(`Directly manipulate ${DATA.targets[state.selectedTarget].label}`);
 recipe.targetScreenDeltaPx=delta;recipe.intentText=`DIRECT MANIPULATOR · ${DATA.targets[state.selectedTarget].label}`;
 recipe.interpretation=`Artist drag ${delta.x.toFixed(1)} / ${delta.y.toFixed(1)} px; ${recipe.allowedControls.length} semantic controls; ${recipe.lockedEffectors.length} locks`;
 setRecipe(recipe);await solveRecipe(recipe)
}
function candidateHTML(c,i){
 if(c.error)return`<div class="v1310Cand bad"><b>${c.label}</b><span>SOLVER ERROR</span><small>${c.error}</small></div>`;
 const a=c.audit,good=c.engineValid;
 return`<div class="v1310Cand ${good?'good':'bad'}"><b>${c.label}</b><span>${good?'ENGINE VALID':'REJECTED'}</span>`+
 `<small>target ${a.targetErrorPx.toFixed(1)}px · locks ${a.lockErrorPx.toFixed(1)}px · clear ${a.clearanceMm===null?'n/a':a.clearanceMm.toFixed(1)+'mm'} · move ${c.movementNorm.toFixed(1)}°</small>`+
 `<div><button data-preview="${i}">PREVIEW</button><button data-approve="${i}" ${good?'':'disabled'}>APPROVE</button></div></div>`
}
function renderUI(){
 const p=document.getElementById('v1310Panel');if(!p)return;
 p.style.display=state.panelOpen?'block':'none';
 const recipe=state.currentRecipe;
 p.querySelector('[data-target]').value=state.selectedTarget;
 p.querySelector('[data-direct]').checked=state.directManipulation;
 if(recipe){
  p.querySelector('[data-intent]').value=recipe.intentText||'';
  p.querySelector('[data-dx]').value=recipe.targetScreenDeltaPx.x.toFixed(1);
  p.querySelector('[data-dy]').value=recipe.targetScreenDeltaPx.y.toFixed(1);
  p.querySelector('[data-role=recipe]').textContent=
   `OWNER ${recipe.owner}\nALLOWED ${recipe.allowedControls.join(', ')}\nLOCKED ${recipe.lockedEffectors.join(', ')}\nREQUIRED ${recipe.requirements.contacts.join(', ')}\n${recipe.interpretation}`
 }
 p.querySelector('[data-role=candidates]').innerHTML=state.candidates.length
  ?state.candidates.map(candidateHTML).join('')
  :'<div class="v1310Empty">No candidates. Drag the viewport handle or solve the recipe.</div>';
 p.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>previewCandidate(+b.dataset.preview));
 p.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>{
  const name=prompt('Correction layer name',`${DATA.targets[state.selectedTarget].label} CORRECTION`)||'ARTIST CORRECTION';
  try{approveCandidate(+b.dataset.approve,name)}catch(e){setStatus(String(e))}
 });
 p.querySelector('[data-role=history]').textContent=
  `${state.layers.length} approved layers · ${state.correctionMemory.length} correction-memory records · `+
  `${state.undo.length} undo / ${state.redo.length} redo`;
}
function addUI(){
 if(document.getElementById('v1310Panel'))return;
 const style=document.createElement('style');style.id='v1310Style';style.textContent=`
 #v1310Panel{position:fixed;left:12px;top:56px;width:530px;max-height:88vh;overflow:auto;z-index:999998;background:rgba(2,8,12,.965);border:1px solid #52b8c7;color:#e8f9ff;padding:10px;font:10px ui-monospace;box-shadow:0 10px 30px #000a}
 #v1310Panel button,#v1310Panel select,#v1310Panel input,#v1310Panel textarea{font:10px ui-monospace;background:#081821;color:#dff;border:1px solid #365b68}
 #v1310Panel button{padding:4px 7px}#v1310Panel textarea{width:100%;height:58px;box-sizing:border-box}
 #v1310Panel .row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:5px 0}
 #v1310Panel pre{white-space:pre-wrap;border:1px solid #29444d;padding:6px;background:#051118;max-height:145px;overflow:auto}
 #v1310Panel .cands{display:grid;grid-template-columns:1fr;gap:5px}
 .v1310Cand{border:1px solid #456;padding:6px;display:grid;grid-template-columns:140px 90px 1fr auto;gap:6px;align-items:center}
 .v1310Cand.good{border-color:#3f9b78}.v1310Cand.bad{border-color:#a45c50}.v1310Cand small{color:#a9c4cc}.v1310Cand span{font-weight:700}
 .v1310Empty{color:#8ba4ac;padding:8px;border:1px dashed #345}
 #v1310Overlay{position:fixed;z-index:999997;pointer-events:auto}
 `;
 document.head.appendChild(style);
 const p=document.createElement('div');p.id='v1310Panel';
 p.innerHTML=`<div style="font-weight:900;color:#83edff;font-size:12px">V1.31.0 · ARTIST-IN-THE-LOOP RIDER STUDIO</div>
 <div style="color:#9fb8c0;margin:3px 0 8px">AI proposes · engine protects · artist approves</div>
 <div class="row"><label>TARGET <select data-target>${Object.entries(DATA.targets).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></label>
 <label><input data-direct type="checkbox" checked> DIRECT MANIPULATOR</label>
 <button data-cam="THREE_QUARTER">CAM 3/4</button><button data-cam="SIDE">SIDE</button><button data-cam="TOP">TOP</button><button data-cam="REAR">REAR</button></div>
 <textarea data-intent>Move the right knee outward. Lock the pelvis, both hands, both feet, and preserve the peg. Require 12 mm clearance.</textarea>
 <div class="row"><button data-parse>INTERPRET</button><label>DX <input data-dx type="number" step="1" style="width:64px"></label>
 <label>DY <input data-dy type="number" step="1" style="width:64px"></label><button data-solve>GENERATE 3 CANDIDATES</button><button data-reject>REJECT / RESTORE</button></div>
 <pre data-role="recipe">No recipe</pre>
 <div class="cands" data-role="candidates"></div>
 <div class="row"><button data-undo>UNDO</button><button data-redo>REDO</button><button data-export>EXPORT SESSION</button></div>
 <div data-role="history" style="color:#9fb8c0"></div>
 <pre data-role="status" style="color:#8fffc8">READY</pre>`;
 document.body.appendChild(p);
 const o=document.createElement('canvas');o.id='v1310Overlay';document.body.appendChild(o);
 p.querySelector('[data-target]').onchange=e=>{state.selectedTarget=e.target.value;state.currentRecipe=parseIntent(`Directly manipulate ${DATA.targets[state.selectedTarget].label}`);drawOverlay()};
 p.querySelector('[data-direct]').onchange=e=>{state.directManipulation=e.target.checked;o.style.pointerEvents=state.directManipulation?'auto':'none';drawOverlay()};
 p.querySelector('[data-parse]').onclick=()=>parseIntent(p.querySelector('[data-intent]').value);
 p.querySelector('[data-solve]').onclick=async()=>{
  let r=state.currentRecipe||parseIntent(p.querySelector('[data-intent]').value);
  r=deep(r);r.targetScreenDeltaPx={x:+p.querySelector('[data-dx]').value||0,y:+p.querySelector('[data-dy]').value||0};
  setRecipe(r);try{await solveRecipe(r)}catch(e){state.lastError=String(e);setStatus('SOLVER ERROR · '+e)}
 };
 p.querySelector('[data-reject]').onclick=rejectCandidates;
 p.querySelector('[data-undo]').onclick=undo;p.querySelector('[data-redo]').onclick=redo;p.querySelector('[data-export]').onclick=downloadSession;
 p.querySelectorAll('[data-cam]').forEach(b=>b.onclick=()=>camera(b.dataset.cam));
 o.addEventListener('pointerdown',overlayDown);o.addEventListener('pointermove',overlayMove);o.addEventListener('pointerup',overlayUp);o.addEventListener('pointercancel',()=>{state.drag=null;drawOverlay()});
 state.currentRecipe=parseIntent(p.querySelector('[data-intent]').value);
 state.overlayTimer=setInterval(drawOverlay,180);renderUI();drawOverlay()
}
function snapshot(){
 return deep({
  version:'V1.31.0',state:{
   selectedTarget:state.selectedTarget,currentRecipe:state.currentRecipe,
   candidateCount:state.candidates.length,previewIndex:state.previewIndex,
   layerCount:state.layers.length,correctionMemoryCount:state.correctionMemory.length,
   undoCount:state.undo.length,redoCount:state.redo.length,lastError:state.lastError
  },
  layers:state.layers.map(x=>({...x,before:undefined,after:undefined})),
  correctionMemory:state.correctionMemory,truth:DATA.truth
 })
}
function boot(){
 if(!R()||!S()||!C()||!H()||!CR()||!CS()||!CB()||!Ops())return setTimeout(boot,50);
 addUI();global.__LUCID_V1310_READY__=true;setStatus('READY · SELECT OR DRAG A SEMANTIC TARGET')
}
global.LUCID_ARTIST_AUTHORING_V1310={
 version:'V1.31.0',data:DATA,state,editableState,restoreEditable,stateDelta,
 parseIntent,setRecipe,solveRecipe,previewCandidate,rejectCandidates,approveCandidate,
 undo,redo,exportSession,downloadSession,camera,drawOverlay,snapshot
};
setTimeout(boot,0)
})(window);


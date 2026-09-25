
(function(global){
'use strict';
if(global.__LUCID_V1287_RIDER_DYNAMICS_BRIDGE__)return;
global.__LUCID_V1287_RIDER_DYNAMICS_BRIDGE__=true;
const D=typeof document!=='undefined'?document:null,$=id=>D?.getElementById(id);
const CFG={
 schema:'lucid.rider.motorcycle-dynamics-foundation.v1287',
 mode:'SHADOW_ONLY',
 integrationAuthority:'DUCATI_V5_FIXED_STEP',
 physicalCoordinate:'RIDER_COG_LATERAL_DELTA_M',
 naturalFrequencyHz:2.0,
 dampingRatio:1.0,
 maxLateralSpeedMps:0.55,
 maxLateralAccelMps2:3.5,
 fallbackAuthoringHz:60,
 bodyOriginM:[0,0,0.64],
 riderMassKg:75.337,
 truth:{
  highRateLateralRiderStateIntegrated:true,
  existingV5QuasiStaticComCouplingPresent:true,
  dynamicsMassStateDrivesV5MassMatrix:false,
  dynamicsWritesRawBones:false,
  dynamicsWritesSemanticCommands:false,
  skinPoseDerivedThroughValidatedCornerSurface:true,
  relativeRiderWrenchComputedShadow:true,
  relativeRiderWrenchAppliedToV5:false,
  relativeWrenchDerivativeAuthority:'LATERAL_X_ONLY',
  cornerSurfaceYZDerivativeAuthority:false,
  cornerSurfaceC1Continuous:false,
  cornerSurfaceC2Continuous:false,
  relativeWrenchValidAtSurfaceKnots:false,
  contactWrenchesSolvedJointlyWithVehicle:false,
  upperBodyPassiveDynamicsSolved:false,
  armHandlebarComplianceSolved:false,
  tireRiderClosedLoopValidated:false,
  dynamicFeasibilityCertified:false
 }
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(a[0],a[1],a[2]);
const finite3=a=>Array.isArray(a)&&a.length>=3&&a.slice(0,3).every(Number.isFinite);
function qconj(q){return[-q[0],-q[1],-q[2],q[3]]}
function qmul(a,b){let[x,y,z,w]=a,[X,Y,Z,W]=b;return[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]}
function qrot(q,v){let p=qmul(qmul(q,[v[0],v[1],v[2],0]),qconj(q));return[p[0],p[1],p[2]]}
function qinvrot(q,v){return qrot(qconj(q),v)}
function matVec(M,v){return[M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]]}
function reducedMassMatrixWitness(){
 const snap=global.DUCATI_V5_API?.snapshot?.(),q=snap?.body?.quaternion||getFree()?.q;if(!Array.isArray(q))return null;
 const n=10,J=Array.from({length:3},()=>Array(n).fill(0)),r=state.comOffsetBodyM,axes=[[1,0,0],[0,1,0],[0,0,1]];
 for(let i=0;i<3;i++)J[i][i]=1;
 for(let j=0;j<3;j++){let c=qrot(q,cross(axes[j],r));for(let k=0;k<3;k++)J[k][3+j]=c[k]}
 let ex=qrot(q,[1,0,0]);for(let k=0;k<3;k++)J[k][9]=ex[k];
 let M=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let j=0;j<n;j++){let s=0;for(let k=0;k<3;k++)s+=J[k][i]*J[k][j];M[i][j]=CFG.riderMassKg*s}
 let sym=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)sym=Math.max(sym,Math.abs(M[i][j]-M[j][i]));
 return{schema:'lucid.rider.reduced-mass-witness.v1287',layout:['body.tx','body.ty','body.tz','body.wx','body.wy','body.wz','steer','fork','rearSwing','riderCogX'],riderCoordinateIndex:9,derivativeAuthority:'dr/dx=[1,0,0] BODY LOCAL ONLY',riderPointMassContributionKg:M,diagonal:M.map((r,i)=>r[i]),symmetryError:sym,appliedToV5:false};
}
function getCorner(){return global.LUCID_CORNER_BALANCE_V12862||global.LUCID_CORNER_BALANCE_V12861}
function getRiderDyn(){return global.LUCID_RIDER_DYNAMICS_V12852}
function getRider(){return global.LUCID_RIDER_CONTROL_V12853}
function getFree(){return global.DUCATI_V5_API?.free}
const state={
 enabled:true,initialized:false,lastAdvanceSource:'NONE',lastV5WallS:-Infinity,v5Steps:0,fallbackSteps:0,
 xM:0,xRateMps:0,xAccelMps2:0,targetXM:0,hang:0,hangRatePerS:0,
 comOffsetBodyM:[0,0,0],comRateBodyMps:[0,0,0],comAccelBodyMps2:[0,0,0],
 prevComOffsetBodyM:null,prevComRateBodyMps:[0,0,0],
 correctedRiderWrenchBody:null,relativeMotionCorrectionBody:null,
 generalizedBikeReactionShadow:Array(9).fill(0),lastVehicle:null,
 geometryResidualM:null,lastDtS:0,warnings:[],uiTicks:0,surfaceSegmentKey:'NEUTRAL',surfaceKnotCrossing:false
};
function ranges(){
 const C=getCorner(),ksL=C?.data?.surface?.sides?.left?.knots||[],ksR=C?.data?.surface?.sides?.right?.knots||[];
 let l=ksL.length?ksL[ksL.length-1].riderComDeltaM[0]:-.13,r=ksR.length?ksR[ksR.length-1].riderComDeltaM[0]:.13;
 return{leftM:l,rightM:r};
}
function targetX(){
 const C=getCorner();if(!C)return 0;
 const h=Number.isFinite(C.engine?.hangTarget)?C.engine.hangTarget:0;
 const q=C.surfaceComDelta?.(h);return finite3(q)?q[0]:0;
}
function comOffsetFromHang(h){
 const C=getCorner(),q=C?.surfaceComDelta?.(h)||[0,0,0],neutral=C?.data?.surface?.neutral?.riderComM;
 if(!finite3(neutral))return[0,0,0];
 return[neutral[0]+q[0]-CFG.bodyOriginM[0],neutral[1]+q[1]-CFG.bodyOriginM[1],neutral[2]+q[2]-CFG.bodyOriginM[2]];
}
function surfaceSegmentKey(h){
 const C=getCorner(),side=h<0?'left':h>0?'right':'neutral',u=Math.abs(h),ks=side==='neutral'?null:C?.data?.surface?.sides?.[side]?.knots;
 if(!ks?.length||u<=0)return'neutral';
 for(let i=1;i<ks.length;i++)if(u<=ks[i].u+1e-12)return`${side}:${i-1}-${i}`;
 return`${side}:${ks.length-2}-${ks.length-1}`;
}
function resetFromCurrent(){
 const C=getCorner(),r=ranges(),h=clamp(Number(C?.engine?.hangCurrent)||0,-1,1),q=C?.surfaceComDelta?.(h)||[0,0,0];
 state.xM=clamp(Number(q[0])||0,r.leftM,r.rightM);state.targetXM=state.xM;state.xRateMps=0;state.xAccelMps2=0;state.hang=h;state.hangRatePerS=0;
 state.comOffsetBodyM=comOffsetFromHang(h);state.comRateBodyMps=[0,0,0];state.comAccelBodyMps2=[0,0,0];state.prevComOffsetBodyM=state.comOffsetBodyM.slice();state.prevComRateBodyMps=[0,0,0];state.surfaceSegmentKey=surfaceSegmentKey(h);state.surfaceKnotCrossing=false;state.initialized=true;
 C?.setExternalDynamicsDrive?.(true);C?.setDynamicHangState?.(h,0);
 return snapshot();
}
function updateGeometryResidual(){
 const dyn=getRiderDyn(),actual=dyn?.mass?.comOffsetBodyM;
 state.geometryResidualM=finite3(actual)?sub(actual,state.comOffsetBodyM):null;
}
function vehicleShadow(){
 const F=getFree(),M=global.DUCATI_V5_API?.snapshot?.()||F?.last;if(!M?.body)return null;
 let q=M.body.quaternion||F?.q,w=M.body.omegaBodyRadS||F?.w,alpha=M.dynamics?.bodyAngularAccelRadS2||[0,0,0],aWorld=M.dynamics?.bodyAccelWorld||[0,0,0];
 if(!finite3(w)||!finite3(alpha)||!finite3(aWorld)||!Array.isArray(q))return null;
 let aOrigin=qinvrot(q,aWorld),gBody=qinvrot(q,[0,0,-9.80665]),r=state.comOffsetBodyM;
 // Only the explicitly integrated lateral CoG coordinate has derivative authority in V1.28.7.
 // Y/Z surface motion is piecewise-linear and is therefore position authority only until a
 // C1/C2 replacement is revalidated against contacts and skin deformation.
 let u=[state.xRateMps,0,0],ud=[state.xAccelMps2,0,0],uGeom=state.comRateBodyMps,udGeom=state.comAccelBodyMps2;
 let rigid=add(aOrigin,add(cross(alpha,r),cross(w,cross(w,r))));
 let relative=add(ud,mul(cross(w,u),2)),relativeGeomDiagnostic=add(udGeom,mul(cross(w,uGeom),2));
 let total=add(rigid,relative),Fcontact=mul(sub(total,gBody),CFG.riderMassKg),Frel=mul(relative,CFG.riderMassKg);
 let I=getRiderDyn()?.mass?.inertiaAboutComKgM2,Mr=[0,0,0];
 if(Array.isArray(I)&&I.length===3){let Ia=matVec(I,alpha),Iw=matVec(I,w);Mr=add(Ia,cross(w,Iw))}
 // This is the equal-and-opposite *shadow* generalized force that the moving rider
 // would apply to the bike beyond the instantaneous fixed-r COM mass terms.
 let bikeFBody=mul(Frel,-1),bikeFWorld=qrot(q,bikeFBody),bikeTauBody=cross(r,bikeFBody),Q=[bikeFWorld[0],bikeFWorld[1],bikeFWorld[2],bikeTauBody[0],bikeTauBody[1],bikeTauBody[2],0,0,0];
 state.correctedRiderWrenchBody={forceN:Fcontact,momentAtComNm:Mr,rigidAccelBodyMps2:rigid,relativeAccelBodyMps2:relative,geometryRelativeAccelDiagnosticBodyMps2:relativeGeomDiagnostic,validity:'PARTIAL_LATERAL_X_ONLY_SHADOW',surfaceKnotCrossing:state.surfaceKnotCrossing};
 state.relativeMotionCorrectionBody={forceOnRiderN:Frel,forceOnBikeBodyN:bikeFBody,momentOnBikeOriginNm:bikeTauBody};
 state.generalizedBikeReactionShadow=Q;state.lastVehicle={timeS:M.timeS??F?.time??0,rollDeg:M.body.rollDeg??0,speedMps:M.body.speedMps??0,omegaBodyRadS:w.slice(),bodyAccelWorld:aWorld.slice()};
 return state.correctedRiderWrenchBody;
}
function advance(dtS,source='V5_STEP'){
 const C=getCorner();if(!state.enabled||!C)return snapshot();
 if(!state.initialized)resetFromCurrent();
 let dt=clamp(Number(dtS)||0,1/2000,.05),R=ranges(),xt=clamp(targetX(),R.leftM,R.rightM),wn=2*Math.PI*CFG.naturalFrequencyHz,z=CFG.dampingRatio;
 let acc=wn*wn*(xt-state.xM)-2*z*wn*state.xRateMps;acc=clamp(acc,-CFG.maxLateralAccelMps2,CFG.maxLateralAccelMps2);
 let v=clamp(state.xRateMps+acc*dt,-CFG.maxLateralSpeedMps,CFG.maxLateralSpeedMps),x=state.xM+v*dt;
 if((x<R.leftM&&v<0)||(x>R.rightM&&v>0)){x=clamp(x,R.leftM,R.rightM);v=0;acc=0}
 let h=C.hangFromCog?.(x);if(!Number.isFinite(h))h=0;h=clamp(h,-1,1);
 let prevH=state.hang,prevSeg=state.surfaceSegmentKey,nextSeg=surfaceSegmentKey(h),com=comOffsetFromHang(h),comRate=state.prevComOffsetBodyM?mul(sub(com,state.prevComOffsetBodyM),1/dt):[0,0,0],comAccel=mul(sub(comRate,state.prevComRateBodyMps||[0,0,0]),1/dt);state.surfaceKnotCrossing=prevSeg!==nextSeg;state.surfaceSegmentKey=nextSeg;
 state.targetXM=xt;state.xM=x;state.xRateMps=v;state.xAccelMps2=acc;state.hang=h;state.hangRatePerS=(h-prevH)/dt;state.lastDtS=dt;
 state.comOffsetBodyM=com;state.comRateBodyMps=comRate;state.comAccelBodyMps2=comAccel;state.prevComOffsetBodyM=com.slice();state.prevComRateBodyMps=comRate.slice();
 state.lastAdvanceSource=source;if(source==='V5_STEP'){state.v5Steps++;state.lastV5WallS=performance.now()/1000}else state.fallbackSteps++;
 C.setExternalDynamicsDrive?.(true);C.setDynamicHangState?.(h,state.hangRatePerS);
 updateGeometryResidual();vehicleShadow();return snapshot();
}
function snapshot(){
 const R=ranges(),res=state.geometryResidualM;
 return{
  schema:'lucid.rider.motorcycle-dynamics-state.v1287',mode:CFG.mode,enabled:state.enabled,coordinate:'RIDER_COG_LATERAL_DELTA_M',
  lateral:{targetM:state.targetXM,positionM:state.xM,velocityMps:state.xRateMps,accelerationMps2:state.xAccelMps2,rangeM:[R.leftM,R.rightM]},
  poseLookup:{hang01:state.hang,hangRatePerS:state.hangRatePerS,semanticSurface:'V1.28.6.2 rig-safe corridor',rawBoneWrites:false},
  massKinematics:{comOffsetBodyM:state.comOffsetBodyM.slice(),comRateBodyMps:state.comRateBodyMps.slice(),comAccelBodyMps2:state.comAccelBodyMps2.slice(),geometryResidualM:res?res.slice():null,geometryResidualNormM:res?norm(res):null,surfaceSegment:state.surfaceSegmentKey,knotCrossing:state.surfaceKnotCrossing,derivativeAuthority:'FINITE_DIFFERENCE_ON_C0_SURFACE_DIAGNOSTIC_ONLY'},
  wrenchShadow:state.correctedRiderWrenchBody?JSON.parse(JSON.stringify(state.correctedRiderWrenchBody)):null,
  relativeMotionCorrection:state.relativeMotionCorrectionBody?JSON.parse(JSON.stringify(state.relativeMotionCorrectionBody)):null,
  generalizedBikeReactionShadow:state.generalizedBikeReactionShadow.slice(),
  reducedMassMatrixWitness:reducedMassMatrixWitness(),
  integration:{source:state.lastAdvanceSource,lastDtS:state.lastDtS,v5Steps:state.v5Steps,fallbackSteps:state.fallbackSteps,v5DtS:getFree()?.S?.dt??null},
  config:{...CFG,truth:{...CFG.truth}},vehicle:state.lastVehicle?JSON.parse(JSON.stringify(state.lastVehicle)):null,warnings:state.warnings.slice()
 };
}
function setEnabled(v){state.enabled=!!v;if(state.enabled)resetFromCurrent();else getCorner()?.setExternalDynamicsDrive?.(false);return state.enabled}
function setConfig(patch={}){
 for(let k of ['naturalFrequencyHz','dampingRatio','maxLateralSpeedMps','maxLateralAccelMps2'])if(Number.isFinite(+patch[k]))CFG[k]=Math.max(k==='dampingRatio'?0.1:0.01,+patch[k]);
 return{...CFG,truth:{...CFG.truth}};
}
function addUi(){
 if(!D||$('v1287DynCard'))return;
 let page=D.querySelector('[data-v125-page="RIDER_DYN"] .v125Grid');if(!page)return;
 let card=D.createElement('div');card.id='v1287DynCard';card.className='v125Card full';card.innerHTML='<h3>V1.28.7 RIDER ↔ MOTORCYCLE DYNAMICS FOUNDATION</h3><div id="v1287DynReadout" class="v125KV"></div><div class="v125Note">High-rate state is rider lateral CoG in metres. The rig is only a semantic pose consumer. Relative-motion chassis wrench is telemetry/shadow only; it is deliberately not injected into V5 until the remaining articulated/contact-rate gates are satisfied.</div>';page.appendChild(card)
}
function ui(){
 state.uiTicks++;addUi();let e=$('v1287DynReadout');if(!e)return;let s=snapshot(),q=s.relativeMotionCorrection?.forceOnBikeBodyN||[0,0,0];
 e.innerHTML=`<span>dynamic coordinate</span><b>ΔCoG x</b><span>x / target</span><b>${(s.lateral.positionM*1000).toFixed(1)} / ${(s.lateral.targetM*1000).toFixed(1)} mm</b><span>ẋ / ẍ</span><b>${s.lateral.velocityMps.toFixed(3)} m/s · ${s.lateral.accelerationMps2.toFixed(2)} m/s²</b><span>pose lookup</span><b>hang ${s.poseLookup.hang01.toFixed(3)}</b><span>integration</span><b>${s.integration.source} · V5 ${(s.integration.v5DtS?1/s.integration.v5DtS:0).toFixed(0)} Hz</b><span>next coupled layout</span><b>V5 + RIDER x · 10 DOF</b><span>wrench derivative authority</span><b>LATERAL x ONLY</b><span>surface derivative</span><b>C0 · Y/Z FORCE BLOCKED${s.massKinematics.knotCrossing?' · KNOT CROSSING':''}</b><span>relative-motion bike force (shadow)</span><b>${q.map(v=>v.toFixed(1)).join(' / ')} N</b><span>force coupling</span><b>BLOCKED / SHADOW ONLY</b>`;
}
let baseStep=null;
function hookV5(){
 const F=getFree();if(!F||F.__v1287RiderDynamicsHook)return false;
 baseStep=F.step.bind(F);F.step=function(...args){let dt=Number.isFinite(+args[0])&&+args[0]>0?+args[0]:(this.S?.dt||1/540);advance(dt,'V5_STEP');return baseStep(...args)};F.__v1287RiderDynamicsHook=true;return true
}
let tries=0;
function boot(){
 if(global.__LUCID_V1287_READY__)return;
 if(!getCorner()||!getRiderDyn()||!getRider()||!getFree()){if(tries++<240)return setTimeout(boot,50);return}
 resetFromCurrent();hookV5();global.LUCID_RIDER_MOTORCYCLE_DYNAMICS_V1287={version:'V1.28.7',config:CFG,state,advance,snapshot,reset:resetFromCurrent,setEnabled,setConfig};
 global.__LUCID_V1287_READY__=true;
 setInterval(()=>{let now=performance.now()/1000;if(state.enabled&&now-state.lastV5WallS>.08&&['RIDER_STUDIO','RIDER_DYN','RIDER_CTRL'].includes(global.__LUCID_ACTIVE_PAGE__))advance(1/CFG.fallbackAuthoringHz,'AUTHORING_FALLBACK');if(global.__LUCID_ACTIVE_PAGE__==='RIDER_DYN')ui()},1000/CFG.fallbackAuthoringHz)
}
if(D?.readyState==='loading')D.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})(typeof window!=='undefined'?window:globalThis);


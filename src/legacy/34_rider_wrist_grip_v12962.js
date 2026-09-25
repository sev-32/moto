

(function(global){
'use strict';
const DATA={"schema":"lucid.rider.relaxed-wrist-grip-authority.v12962","version":"V1.29.6.2","bodyCommands":{"leftClavicle.elevationDepression":12.229831961001818,"leftShoulder.abductionAdduction":-19.325834124389846,"rightAnkle.dorsiPlantarflexion":29.999999999999996,"rightShoulder.axialRotation":-7.580051143920651,"rightWrist.radialUlnarDeviation":3.0099649331607576,"spine01.flexionExtension":8.0,"leftAnkle.axialRotation":-0.15757845255041159,"leftForearm.pronationSupination":-30.0,"leftWrist.radialUlnarDeviation":-3.0748983141335042,"pelvis.pitch":34.37823513171445,"leftHip.axialRotation":0.9748511749986426,"leftShoulder.axialRotation":6.218852715045979,"rightShoulder.flexionExtension":81.8711186046752,"rightShoulder.abductionAdduction":-19.325834124389846,"head.nod":-18.414216496251573,"leftClavicle.protractionRetraction":23.87935274310025,"rightClavicle.elevationDepression":12.229831961001818,"rightWrist.flexionExtension":11.984936404574388,"rightHip.flexionExtension":92.2115303322239,"leftWrist.flexionExtension":11.843556790117198,"leftKnee.flexionExtension":110.79465892010126,"leftHip.flexionExtension":92.2115303322239,"leftElbow.flexionExtension":45.2239893125711,"spine02.flexionExtension":-1.4692086055276201,"rightForearm.pronationSupination":-30.0,"rightElbow.flexionExtension":45.56051527059173,"leftShoulder.flexionExtension":81.8711186046752,"rightHip.axialRotation":0.2048363250013574,"neck.flexionExtension":-29.614216937748893,"leftAnkle.inversionEversion":0.14436683467369066,"rightKnee.flexionExtension":110.79465892010126,"rightAnkle.inversionEversion":-0.14436683467369066,"rightHip.abductionAdduction":32.88826451560656,"leftHip.abductionAdduction":32.84138951560656,"rightClavicle.protractionRetraction":23.87935274310025,"leftAnkle.dorsiPlantarflexion":29.999999999999996,"rightAnkle.axialRotation":0.15757845255041159},"hipTargetM":[-0.001500847245251802,-0.30311606560335275,0.9069059989543337],"armDofOffsets":{"rightWrist.flexionExtension":2.312439761057771,"rightWrist.radialUlnarDeviation":-10.538333936136283,"rightForearm.pronationSupination":-20.171259829308838,"rightElbow.flexionExtension":-10.7461963375099,"rightShoulder.flexionExtension":-32,"rightShoulder.abductionAdduction":-2.1810787706635892,"rightShoulder.axialRotation":21.257441161200404,"rightClavicle.elevationDepression":4.536896861158311,"rightClavicle.protractionRetraction":1.7083825655281544,"leftWrist.flexionExtension":-22.466489690326178,"leftWrist.radialUlnarDeviation":3.3777990848126205,"leftForearm.pronationSupination":-20.068008766975254,"leftElbow.flexionExtension":-15.38139182748273,"leftShoulder.flexionExtension":-16.80642746668309,"leftShoulder.abductionAdduction":4.199667314533144,"leftShoulder.axialRotation":-12.561091780196875,"leftClavicle.elevationDepression":-3.1856962298043072,"leftClavicle.protractionRetraction":0.566733505576849},"fingerJointOffsets":{"L_Ring1":34.44032636367452,"L_Ring2":-1.383583632521919,"L_Ring3":34.9823790641112,"L_Pinky1":37.817963890986846,"L_Pinky2":4.410294676251183,"L_Pinky3":0.19343326740388989,"L_Thumb1":-11.339614287548953,"L_Thumb2":-5.010830709342688,"L_Thumb3":18.26865362781189,"R_Ring1":32.35231347332968,"R_Ring2":2.0364374809739445,"R_Ring3":32.822365729271695,"R_Pinky1":35.20794777805581,"R_Pinky2":-7.217777109634746,"R_Pinky3":17.905542613087732,"R_Thumb1":-11.483153708910331,"R_Thumb2":-15.03249212802807,"R_Thumb3":10.27611766564419},"fingerMultipliers":{"L":{"index":1,"middle":1,"ring":1,"pinky":1,"thumb":1},"R":{"index":1,"middle":1,"ring":1,"pinky":1,"thumb":1}},"fingerOppositionOffsets":{"L":-4.697653790008772,"R":-4.404050428133225},"wristComfort":{"flexionHardDeg":20,"deviationHardDeg":14},"acceptance":{"palmBandQ05MaxMm":3.5,"minGoodPalmBands":3,"maxBroadPenMm":1.5,"maxAxisErrorDeg":25,"maxPalmarNormalErrorDeg":25,"maxShoulderP99":1.3},"validated":{"L":{"wristFlexDeg":-10.6229,"wristDeviationDeg":0.3029,"forearmDeg":-50.0,"elbowDeg":29.8426,"palmQ05Mm":[2.23,2.92,0.82,0.13],"penetrationMm":0.4,"axisErrorDeg":9.1,"palmarErrorDeg":11.7,"shoulderP99":1.158},"R":{"wristFlexDeg":14.2974,"wristDeviationDeg":-7.5284,"forearmDeg":-50.0,"elbowDeg":34.8143,"palmQ05Mm":[0.29,1.16,0.61,0.23],"penetrationMm":0.61,"axisErrorDeg":7.6,"palmarErrorDeg":5.8,"shoulderP99":1.215}},"truth":{"V12961BentWristAuthority":false,"genericGapIsGripAuthority":false,"palmManifoldIsGripAuthority":true,"wristComfortIsHardConstraint":true,"sharedTorsoMayEscalateBeforeWrist":true,"shoulderSkinGuardRequired":true}};
const state={active:false,last:null,failures:[]};
const R=()=>global.LUCID_RIDER_CONTROL_V12853;
const H=()=>global.LUCID_AUTOMATIC_HAND_GRIP_V1290;
const C=()=>global.LUCID_RIDER_CONTACTS_V12851;
const CB=()=>global.LUCID_CORNER_BALANCE_V12862;
const D56=()=>global.LUCID_RIDER_DYNAMICS_POSITIONS_V12856;
const deep=x=>JSON.parse(JSON.stringify(x));

function captureBaselines(){
 const r=R(),h=H();
 const saved=deep(r.controls.dofOffsets||{});
 r.controls.dofOffsets={};
 r.controls.poseOverride={commands:deep(DATA.bodyCommands),hipTargetM:DATA.hipTargetM.slice(),weight:1};
 r.controls.fingerJointOffsets={};r.controls.fingerOppositionOffsets={L:0,R:0};
 r.updateNow();
 h.state.baseline.L={pos:Array.from(r.runtime.pos),hang:0};
 h.state.baseline.R={pos:Array.from(r.runtime.pos),hang:0};
 r.controls.dofOffsets=saved;
 r.updateNow();
}
function applyGrip(){
 const r=R(),h=H();
 CB()?.setEnabled?.(false);D56()?.setAuto?.(false);if(D56()?.engine)D56().engine.transition=null;
 r.controls.poseOverride={commands:deep(DATA.bodyCommands),hipTargetM:DATA.hipTargetM.slice(),weight:1};
 r.controls.dofOffsets=deep(DATA.armDofOffsets);
 r.controls.fingerJointOffsets=deep(DATA.fingerJointOffsets);
 r.controls.fingerMultipliers=deep(DATA.fingerMultipliers);
 r.controls.fingerOppositionOffsets=deep(DATA.fingerOppositionOffsets);
 captureBaselines();
 r.controls.dofOffsets=deep(DATA.armDofOffsets);
 r.controls.fingerJointOffsets=deep(DATA.fingerJointOffsets);
 r.controls.fingerMultipliers=deep(DATA.fingerMultipliers);
 r.controls.fingerOppositionOffsets=deep(DATA.fingerOppositionOffsets);
 r.updateNow();
 h.state.accepted={L:true,R:true};h.installContactAuthority();C().refresh();
 const a=audit();state.active=a.valid;state.last=a;
 if(!a.valid)state.failures.push(a);
 return{ok:a.valid,status:a.valid?'RELAXED_WRIST_GRIP_ACCEPTED':'RELAXED_WRIST_GRIP_REJECTED',audit:a}
}
function openHands(){
 const r=R();
 r.controls.fingerJointOffsets={};r.controls.fingerOppositionOffsets={L:0,R:0};
 for(const S of['L','R'])for(const f of['index','middle','ring','pinky','thumb'])r.controls.fingerMultipliers[S][f]=0;
 r.updateNow();C().refresh();state.active=false;state.last=audit();return state.last
}
function sideAudit(S){
 const h=H(),r=R(),pm=h.palmMetric(S,h.state.baseline[S]),p=S==='L'?'left':'right',A=DATA.acceptance,
 wf=r.runtime.pose.commands[p+'Wrist.flexionExtension'],wd=r.runtime.pose.commands[p+'Wrist.radialUlnarDeviation'],
 good=pm.bands.filter(b=>b.q05Mm<=A.palmBandQ05MaxMm).length,
 valid=good>=A.minGoodPalmBands&&pm.broad.maxPenMm<=A.maxBroadPenMm&&
  pm.frame.axisErrorDeg<=A.maxAxisErrorDeg&&pm.frame.palmarNormalErrorDeg<=A.maxPalmarNormalErrorDeg&&
  pm.shoulder.edgeP99Sym<=A.maxShoulderP99&&Math.abs(wf)<=DATA.wristComfort.flexionHardDeg&&
  Math.abs(wd)<=DATA.wristComfort.deviationHardDeg&&!pm.badShoulder;
 return{valid,good,wristFlexDeg:wf,wristDeviationDeg:wd,palm:pm}
}
function audit(){
 C().refresh();const e=C().evaluate().states,L=sideAudit('L'),Rr=sideAudit('R');
 const out={schema:'lucid.rider.relaxed-wrist-grip-audit.v12962',valid:L.valid&&Rr.valid,L,R:Rr,
  contacts:{L:e.leftHand,R:e.rightHand}};
 state.last=out;return out
}
function snapshot(){return deep({version:'V1.29.6.2',state:{active:state.active,failures:state.failures},audit:state.last,truth:DATA.truth})}
function boot(){
 if(!R()||!H()||!C())return setTimeout(boot,50);
 const x=applyGrip();global.__LUCID_V12962_READY__=true;return x
}
global.LUCID_RELAXED_WRIST_GRIP_AUTHORITY_V12962={version:'V1.29.6.2',data:DATA,state,applyGrip,openHands,audit,snapshot};
setTimeout(boot,0);
})(window);


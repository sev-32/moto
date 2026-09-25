
(function(global){
'use strict';
if(global.__LUCID_V124_FREE_RIDE__)return;
global.__LUCID_V124_FREE_RIDE__=true;

const D=document, $=id=>D.getElementById(id), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const API=global.DUCATI_V5_API, PT=global.DUCATI_ADVANCED_POWERTRAIN, SOUND=global.DUCATI_SOUND_STUDIO;
if(!API||!PT)return;

const cfg={
 inputProfile:'STREET',
 steerMaxNm:16,
 steerExpo:1.45,
 frontBrakeMaxBar:55,
 rearBrakeMaxBar:28,
 launchAssist:true,
 rollAssistOnLaunch:true,
 cameraResponse:'DYNAMIC',
 horizonLean:0.62,
 speedFov:true,
 audioPerspective:true
};
const profileMap={
 DIRECT:{thrRise:.025,thrFall:.045,brRise:.022,brFall:.040,cluEngage:.070,cluRelease:.025,steerTau:.035},
 STREET:{thrRise:.070,thrFall:.105,brRise:.045,brFall:.070,cluEngage:.115,cluRelease:.035,steerTau:.060},
 SMOOTH:{thrRise:.145,thrFall:.180,brRise:.085,brFall:.120,cluEngage:.180,cluRelease:.055,steerTau:.095}
};
const rt={
 session:'ROLLING',
 input:{throttle:0,frontBar:0,rearBar:0,clutch:1,steerNm:0,rawSteer:0},
 lastStepMs:performance.now(),
 fps:{last:performance.now(),frames:0,value:0},
 hudLast:0,
 gpPrev:[],
 launch:{active:false,latched:false,sawLever:false},
 camera:{mode:'chase',init:false,lastMs:performance.now(),lookYaw:0,lookPitch:0,zoom:1,lastSpeed:0,accel:0,up:[0,0,1],fov:50},
 pointer:{down:false,x:0,y:0},
 soundSaved:null,
 pageWasRide:false
};

const CSS=`
body.v123 #v123Brand small{display:none}
body.v123 #v123Brand strong:after{content:" · V1.24 FREE RIDE";color:#70dffb;font-weight:500}
body[data-v123-page="RIDE"] #v123RideHud{display:none!important}
#v124Dash{display:none;position:fixed;z-index:121;left:50%;bottom:58px;transform:translateX(-50%);width:min(680px,calc(100vw - 36px));pointer-events:none}
body[data-v123-page="RIDE"] #v124Dash{display:block}
#v124Dash .shell{background:linear-gradient(180deg,#071018e8,#050a0fe5);border:1px solid #385865;border-radius:12px;box-shadow:0 12px 34px #000a;backdrop-filter:blur(10px);padding:9px 12px 8px}
#v124Dash .main{display:grid;grid-template-columns:132px 64px minmax(180px,1fr);gap:12px;align-items:end}
#v124Speed{font:800 46px/.86 ui-monospace,Consolas,monospace;letter-spacing:-.065em}
#v124SpeedUnit{font-size:9px;color:#829ca8;margin-left:4px}
#v124Gear{font:900 46px/.9 ui-monospace,Consolas,monospace;text-align:center;color:#73e0fb}
#v124GearLabel,#v124RpmLabel{font-size:8px;letter-spacing:.15em;color:#7897a4;text-align:center}
#v124Tach{height:13px;border:1px solid #294855;border-radius:6px;overflow:hidden;background:#04090d;margin:4px 0 3px}
#v124TachFill{height:100%;width:0;background:linear-gradient(90deg,#4ec7e8 0 58%,#73e8aa 72%,#ffc766 87%,#ff705f 100%);transition:width .04s linear}
#v124Tach.hot{box-shadow:0 0 14px #ff6e5b75;border-color:#b4564b}
#v124RpmText{font-size:11px;color:#dcecf2}
#v124Meta{font-size:8px;color:#87a3af;letter-spacing:.06em;margin-top:3px}
#v124Lower{display:grid;grid-template-columns:minmax(150px,1fr) 270px auto;gap:12px;align-items:center;border-top:1px solid #203640;margin-top:7px;padding-top:7px}
#v124Mode{font-size:9px;color:#b9d1db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v124Meters{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
.v124Meter{font-size:7px;color:#6f8b97;text-align:center}.v124Meter i{display:block;height:4px;background:#0d1a21;border:1px solid #223e49;border-radius:3px;overflow:hidden;margin-top:2px}.v124Meter i b{display:block;height:100%;width:0;background:#71dff9}
.v124Lamps{display:flex;gap:4px;justify-content:flex-end}.v124Lamp{font-size:7px;padding:3px 4px;border:1px solid #29434e;border-radius:4px;color:#698691;background:#081117}.v124Lamp.on{color:#73e8ac;border-color:#357258}.v124Lamp.hot{color:#ffc56a;border-color:#786039}
#v124Alert{display:none;position:fixed;z-index:125;left:50%;top:calc(var(--v123-top) + 14px);transform:translateX(-50%);background:#140b0be8;border:1px solid #a34c43;color:#ffd0ca;border-radius:7px;padding:7px 12px;font-size:10px;letter-spacing:.08em;box-shadow:0 8px 24px #0009}
body[data-v123-page="RIDE"] #v124Alert.show{display:block}
#v124SessionPill{display:none;position:fixed;z-index:120;left:18px;top:calc(var(--v123-top) + 16px);padding:6px 8px;border:1px solid #355361;border-radius:6px;background:#071119d9;color:#a9c3ce;font-size:8px;letter-spacing:.08em;pointer-events:none}
body[data-v123-page="RIDE"] #v124SessionPill{display:block}
#v123RideCams{bottom:14px}
#v123RideCams button.active,#v123RideCams button.v124on{border-color:#66dafa;background:#173a48;color:#e8fbff}
#v123RideDrawer{width:350px}
.v124PresetGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.v124PresetGrid button{font-size:8px;padding:6px 4px}
.v124PresetGrid button.on{border-color:#67ddfb;background:#173b48}
.v124Note{font-size:8px;color:#7897a5;line-height:1.45;margin-top:5px}
.v124Field{display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;margin:5px 0}.v124Field input,.v124Field select{width:100%}
.v124Val{text-align:right;color:#72dcfa;font-size:8px}
@media(pointer:coarse),(max-width:760px){
 #v124Dash{bottom:145px;width:calc(100vw - 20px)}
 #v124Dash .shell{padding:7px 8px}#v124Dash .main{grid-template-columns:96px 48px minmax(110px,1fr);gap:7px}
 #v124Speed{font-size:34px}#v124Gear{font-size:34px}#v124Lower{grid-template-columns:1fr;gap:5px}
 .v124Lamps{justify-content:flex-start}.v124Meters{grid-template-columns:repeat(5,1fr)}
 #v124SessionPill{top:calc(var(--v123-top) + 10px);left:10px}
 #v123RideDrawer{right:10px;width:min(350px,calc(100vw - 20px))}
}
`;

function addCSS(){let s=D.createElement('style');s.id='v124Style';s.textContent=CSS;D.head.appendChild(s)}
function alpha(dt,tau){return 1-Math.exp(-Math.max(0,dt)/Math.max(.001,tau))}
function toward(x,t,dt,rise,fall){return x+(t-x)*alpha(dt,t>=x?rise:fall)}
function deadExpo(x,dz=.07,expo=1.4){let a=Math.abs(x);if(a<=dz)return 0;a=(a-dz)/(1-dz);return Math.sign(x)*Math.pow(clamp(a,0,1),expo)}
function norm3(v){let m=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/m,v[1]/m,v[2]/m]}
function mix3(a,b,t){return norm3([a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t,a[2]*(1-t)+b[2]*t])}
function angleWrap(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a}
function dirYaw(v){return Math.atan2(v[0],v[1])}
function uiRideState(){try{return global.LUCID_MOTO_UI.rideState()||{}}catch(_){return{}}}
function setText(id,v){let e=$(id);if(e)e.textContent=v}
function setWidth(id,p){let e=$(id);if(e)e.style.width=clamp(p,0,100).toFixed(1)+'%'}

function buildDash(){
 let dash=D.createElement('div');dash.id='v124Dash';dash.innerHTML=`
 <div class="shell">
  <div class="main">
   <div><span id="v124Speed">0</span><span id="v124SpeedUnit">km/h</span></div>
   <div><div id="v124GearLabel">GEAR</div><div id="v124Gear">N</div></div>
   <div><div id="v124RpmLabel">DESMOQUATTRO</div><div id="v124Tach"><div id="v124TachFill"></div></div><div><span id="v124RpmText">1300 rpm</span></div><div id="v124Meta">0.0° lean · 0.0° steer · κR 0.000</div></div>
  </div>
  <div id="v124Lower">
   <div id="v124Mode">ROLLING · CHASE · RAW</div>
   <div class="v124Meters">
    <div class="v124Meter">THR<i><b id="v124ThrBar"></b></i></div>
    <div class="v124Meter">FBR<i><b id="v124FbrBar"></b></i></div>
    <div class="v124Meter">RBR<i><b id="v124RbrBar"></b></i></div>
    <div class="v124Meter">CLU<i><b id="v124CluBar"></b></i></div>
    <div class="v124Meter">STR<i><b id="v124StrBar"></b></i></div>
   </div>
   <div class="v124Lamps"><span id="v124Abs" class="v124Lamp">ABS</span><span id="v124Tc" class="v124Lamp">TC</span><span id="v124Launch" class="v124Lamp">LAUNCH</span><span id="v124Audio" class="v124Lamp">AUDIO</span></div>
  </div>
 </div>`;D.body.appendChild(dash);
 let alert=D.createElement('div');alert.id='v124Alert';D.body.appendChild(alert);
 let pill=D.createElement('div');pill.id='v124SessionPill';pill.textContent='FREE RIDE · HOT PHYSICS PATH';D.body.appendChild(pill);
}

function decorateCameraStrip(){
 const strip=$('v123RideCams');if(!strip)return;
 const labels={chase:'1 CHASE',side:'2 SIDE',front:'3 FRONT',rear:'4 TAIL',top:'5 HIGH',path:'6 CINEMA',drive:'7 HELMET'};
 strip.querySelectorAll('[data-view]').forEach(b=>{if(labels[b.dataset.view])b.textContent=labels[b.dataset.view]});
}

function addRideControls(){
 const dr=$('v123RideDrawer');if(!dr)return;
 dr.insertAdjacentHTML('afterbegin',`
 <div class="v123Section" id="v124SessionSection">
  <h4>FREE RIDE SESSION</h4>
  <div class="v124PresetGrid"><button data-v124-session="ROLLING">ROLLING<br>72 km/h</button><button data-v124-session="SLOW">SLOW<br>30 km/h</button><button data-v124-session="STANDING">STANDING<br>LAUNCH</button></div>
  <div class="v124Field"><span>Launch assist</span><input id="v124LaunchAssist" type="checkbox" checked></div>
  <div class="v124Field"><span>Roll assist on launch</span><input id="v124LaunchRollAssist" type="checkbox" checked></div>
  <div class="v124Note">Standing start opens the dry clutch and resets the V1.21 crank to idle. Manual mode waits for one clutch-lever press/release; launch assist only schedules clutch engagement from live crank RPM/throttle. It does not add engine torque.</div>
 </div>`);
 dr.insertAdjacentHTML('beforeend',`
 <div class="v123Section">
  <h4>RIDER INPUT MAPPING</h4>
  <div class="v124Field"><span>Response</span><select id="v124Response"><option>DIRECT</option><option selected>STREET</option><option>SMOOTH</option></select></div>
  <div class="v124Field"><span>Steer effort max</span><input id="v124SteerMax" type="range" min="6" max="24" step=".5" value="16"></div><div class="v124Val" id="v124SteerMaxV">16.0 N·m</div>
  <div class="v124Field"><span>Steer expo</span><input id="v124SteerExpo" type="range" min="1" max="2.2" step=".05" value="1.45"></div><div class="v124Val" id="v124SteerExpoV">1.45×</div>
  <div class="v124Field"><span>Front brake max</span><input id="v124FrontMax" type="range" min="20" max="100" step="1" value="55"></div><div class="v124Val" id="v124FrontMaxV">55 bar</div>
  <div class="v124Field"><span>Rear brake max</span><input id="v124RearMax" type="range" min="10" max="60" step="1" value="28"></div><div class="v124Val" id="v124RearMaxV">28 bar</div>
 </div>
 <div class="v123Section">
  <h4>CAMERA / LISTENER</h4>
  <div class="v124Field"><span>Camera response</span><select id="v124CamResponse"><option>LOCKED</option><option selected>DYNAMIC</option><option>CINEMATIC</option></select></div>
  <div class="v124Field"><span>Horizon follows lean</span><input id="v124Horizon" type="range" min="0" max="1" step=".05" value=".62"></div><div class="v124Val" id="v124HorizonV">62%</div>
  <div class="v124Field"><span>Speed-sensitive FOV</span><input id="v124SpeedFov" type="checkbox" checked></div>
  <div class="v124Field"><span>Camera drives audio view</span><input id="v124AudioPerspective" type="checkbox" checked></div>
  <div class="v124Note">Right stick or drag = temporary look. Wheel = chase zoom. Camera/audio perspective changes are ride-local and restored when leaving Free Ride.</div>
 </div>`);
 dr.querySelectorAll('[data-v124-session]').forEach(b=>b.onclick=()=>applySession(b.dataset.v124Session,true));
 $('v124LaunchAssist').onchange=e=>cfg.launchAssist=e.target.checked;
 $('v124LaunchRollAssist').onchange=e=>cfg.rollAssistOnLaunch=e.target.checked;
 $('v124Response').onchange=e=>cfg.inputProfile=e.target.value;
 $('v124SteerMax').oninput=e=>{cfg.steerMaxNm=+e.target.value;setText('v124SteerMaxV',cfg.steerMaxNm.toFixed(1)+' N·m')};
 $('v124SteerExpo').oninput=e=>{cfg.steerExpo=+e.target.value;setText('v124SteerExpoV',cfg.steerExpo.toFixed(2)+'×')};
 $('v124FrontMax').oninput=e=>{cfg.frontBrakeMaxBar=+e.target.value;setText('v124FrontMaxV',cfg.frontBrakeMaxBar.toFixed(0)+' bar')};
 $('v124RearMax').oninput=e=>{cfg.rearBrakeMaxBar=+e.target.value;setText('v124RearMaxV',cfg.rearBrakeMaxBar.toFixed(0)+' bar')};
 $('v124CamResponse').onchange=e=>cfg.cameraResponse=e.target.value;
 $('v124Horizon').oninput=e=>{cfg.horizonLean=+e.target.value;setText('v124HorizonV',Math.round(cfg.horizonLean*100)+'%')};
 $('v124SpeedFov').onchange=e=>cfg.speedFov=e.target.checked;
 $('v124AudioPerspective').onchange=e=>{cfg.audioPerspective=e.target.checked;if(e.target.checked)applyCameraSound();else restoreSoundView()};
 $('v123Reset')?.addEventListener('click',()=>setTimeout(()=>postResetArm(),0));
}

function dispatchKey(code){
 try{global.dispatchEvent(new KeyboardEvent('keydown',{code,key:code==='KeyE'?'e':'q',bubbles:true,cancelable:true}))}catch(_){}
}
function setInternalGear(target){
 target=clamp(target|0,1,6);let r=uiRideState(),cur=clamp((r.gear||PT.states?.free?.command?.gear||3)|0,1,6),guard=0;
 while(cur<target&&guard++<8){dispatchKey('KeyE');cur++}
 while(cur>target&&guard++<16){dispatchKey('KeyQ');cur--}
 if(PT.states?.free?.command)PT.states.free.command.gear=target;
}
function setStartSpeed(v){
 const e=$('v123StartSpeed');if(!e)return;e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));
}
function setAssist(mode){
 const e=$('v123Assist');if(!e)return;e.value=mode;e.dispatchEvent(new Event('change',{bubbles:true}));
}
function postResetArm(){
 if(rt.session==='STANDING'){
  rt.launch.active=true;rt.launch.latched=true;rt.launch.sawLever=false;rt.input.clutch=0;
  if(PT.states?.free?.command){PT.states.free.command.clutch=0;PT.states.free.command.gear=1}
 }else{rt.launch.active=false;rt.launch.latched=false;rt.input.clutch=1}
 rt.input.throttle=rt.input.frontBar=rt.input.rearBar=rt.input.steerNm=0;
}
function applySession(name,doReset){
 rt.session=name;
 let speed=20,gear=3;
 if(name==='SLOW'){speed=8.333333;gear=2}
 if(name==='STANDING'){speed=0;gear=1}
 setStartSpeed(speed);setInternalGear(gear);
 if(name==='STANDING'&&cfg.rollAssistOnLaunch)setAssist('ROLL_ASSIST');
 if(doReset)$('v123Reset')?.click();else postResetArm();
 D.querySelectorAll('[data-v124-session]').forEach(b=>b.classList.toggle('on',b.dataset.v124Session===name));
}

function readGamepad(){
 let gp=null;try{gp=[...(navigator.getGamepads?.()||[])].find(Boolean)}catch(_){}
 if(!gp)return{connected:false,thr:0,front:0,rear:0,steer:0,clutch:false,camX:0,camY:0};
 const val=i=>gp.buttons?.[i]?.value||0,down=i=>!!gp.buttons?.[i]?.pressed,dz=x=>Math.abs(x)<.08?0:x;
 let now=(gp.buttons||[]).map(b=>!!b.pressed),prev=rt.gpPrev;
 if(now[5]&&!prev[5])dispatchKey('KeyE');if(now[4]&&!prev[4])dispatchKey('KeyQ');
 if(now[9]&&!prev[9]){try{global.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',bubbles:true,cancelable:true}))}catch(_){}}
 if(now[3]&&!prev[3]){try{global.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',bubbles:true,cancelable:true}));global.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyR',bubbles:true,cancelable:true}))}catch(_){}}
 rt.gpPrev=now;
 return{connected:true,thr:val(7),front:val(6),rear:down(1)?1:0,steer:dz(gp.axes?.[0]||0),clutch:down(0),camX:dz(gp.axes?.[2]||0),camY:dz(gp.axes?.[3]||0)};
}

function clutchTarget(lever,throttle,rpm,speed,dt){
 if(rt.session!=='STANDING'||!rt.launch.active)return lever?0:1;
 if(rt.launch.latched){
  if(lever)rt.launch.sawLever=true;
  if(cfg.launchAssist&&throttle>.08)rt.launch.latched=false;
  else if(rt.launch.sawLever&&!lever)rt.launch.latched=false;
  else return 0;
 }
 if(lever)return 0;
 if(cfg.launchAssist){
  let rpmGate=clamp((rpm-1750)/1900,0,1),thrGate=clamp((throttle-.04)/.48,0,1),speedGate=clamp(speed/10,0,1);
  let target=clamp((.12+.88*rpmGate)*(.35+.65*thrGate)+speedGate*.35,0,1);
  if(speed>11||PT.states?.free?.last?.gear>1){rt.launch.active=false;return 1}
  return target;
 }
 if(speed>8)rt.launch.active=false;
 return 1;
}

function v124PreStep(){
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE')return;
 const now=performance.now(),dt=clamp((now-rt.lastStepMs)/1000,.001,.05);rt.lastStepMs=now;
 const r=uiRideState(),g=readGamepad(),P=profileMap[cfg.inputProfile]||profileMap.STREET;
 const rawThr=Math.max(r.throttleKey?1:0,g.thr||0);
 const rawFront=Math.max(r.frontBrakeKey?1:0,g.front||0);
 const rawRear=Math.max(r.rearBrakeKey?1:0,g.rear||0);
 const rawSteer=g.connected?g.steer:(r.steerKey||0);
 const lever=!!(r.clutchKey||g.clutch);
 let steer=deadExpo(rawSteer,.065,cfg.steerExpo);
 let speed=Math.hypot(free.v?.[0]||0,free.v?.[1]||0),speedScale=1-.28*clamp((speed-18)/42,0,1);
 let steerTarget=steer*cfg.steerMaxNm*speedScale;
 rt.input.throttle=toward(rt.input.throttle,Math.pow(clamp(rawThr,0,1),1.18),dt,P.thrRise,P.thrFall);
 rt.input.frontBar=toward(rt.input.frontBar,Math.pow(clamp(rawFront,0,1),1.38)*cfg.frontBrakeMaxBar,dt,P.brRise,P.brFall);
 rt.input.rearBar=toward(rt.input.rearBar,Math.pow(clamp(rawRear,0,1),1.25)*cfg.rearBrakeMaxBar,dt,P.brRise,P.brFall);
 rt.input.steerNm=toward(rt.input.steerNm,steerTarget,dt,P.steerTau,P.steerTau);
 rt.input.rawSteer=rawSteer;
 let rpm=PT.states?.free?.last?.engine?.rpm||PT.states?.free?.engine?.rpm||1300;
 let cTarget=clutchTarget(lever,rt.input.throttle,rpm,speed,dt);
 rt.input.clutch=toward(rt.input.clutch,cTarget,dt,cTarget<rt.input.clutch?P.cluRelease:P.cluEngage,cTarget<rt.input.clutch?P.cluRelease:P.cluEngage);

 if(g.connected){rt.camera.lookYaw+=g.camX*dt*1.5;rt.camera.lookPitch+=g.camY*dt*1.0}
 rt.camera.lookYaw*=Math.exp(-dt*.55);rt.camera.lookPitch*=Math.exp(-dt*.72);
 rt.camera.lookYaw=clamp(rt.camera.lookYaw,-.85,.85);rt.camera.lookPitch=clamp(rt.camera.lookPitch,-.42,.42);

 try{freeKeyboard.left=false;freeKeyboard.right=false}catch(_){}
 const steerEl=$('freeSteer');if(steerEl)steerEl.value=String(clamp(rt.input.steerNm,-25,25));
 const gearNow=clamp((PT.states?.free?.command?.gear||r.gear||3)|0,1,6);
 const cmd=PT.states?.free?.command;
 if(cmd)Object.assign(cmd,{mode:'ENGINE',throttle:rt.input.throttle,clutch:rt.input.clutch,gear:gearNow,
  frontBrakeBar:rt.input.frontBar,rearBrakeBar:rt.input.rearBar,absEnabled:!!r.abs,tcEnabled:!!r.tc,
  brakeModel:'HYDRAULIC_FERIT450'});
}
global.__LUCID_RIDE_PRESTEP__=v124PreStep;

/* V1.23 called free.setControls() every ride frame through freeApplyUI(), which
   also called compute(). Ride mode now writes the same live controls directly. */
const baseFreeApplyUI=freeApplyUI;
freeApplyUI=function(){
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE')return baseFreeApplyUI();
 if(!$('freeSteer'))return;
 free.controls.userSteerTorqueNm=+$('freeSteer').value||0;
 free.controls.frontBrakeBar=0;free.controls.rearBrakeBar=0;free.controls.rearDriveTorqueNm=0;
 free.S.frontPsi=+$('fp').value;free.S.rearPsi=+$('rp').value;free.S.tireLoss=+$('tl').value;
 if($('forkOffset'))free.S.forkOffsetCorrectionM=+$('forkOffset').value/1000;
};

const baseView=view, baseUpdateFreeCamera=updateFreeCamera, baseLook=look, basePerspective=perspective;
function cameraModeFromView(name){return({chase:'chase',side:'side',front:'front',rear:'rear',top:'top',path:'path',drive:'drive'})[name]||name}
function setRideCamera(name){
 rt.camera.mode=cameraModeFromView(name);rt.camera.init=false;currentView=name;
 try{v5ChaseInit=false}catch(_){}
 D.querySelectorAll('#v123RideCams [data-view]').forEach(b=>b.classList.toggle('v124on',b.dataset.view===name));
 applyCameraSound();
}
view=function(name){
 if(global.__LUCID_ACTIVE_PAGE__==='RIDE'&&['chase','side','front','rear','top','path','drive'].includes(name)){setRideCamera(name);return}
 return baseView(name);
};

updateFreeCamera=function(){
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE')return baseUpdateFreeCamera();
 const C=rt.camera,now=performance.now(),dt=clamp((now-C.lastMs)/1000,.001,.05);C.lastMs=now;
 let f=norm3(v5qrot(free.q,V5_Y)),right=norm3(v5qrot(free.q,V5_X)),upBike=norm3(v5qrot(free.q,V5_UP));
 let speed=Math.hypot(free.v?.[0]||0,free.v?.[1]||0),a=(speed-C.lastSpeed)/dt;C.lastSpeed=speed;C.accel=toward(C.accel,clamp(a,-10,10),dt,.18,.18);
 let mode=C.mode||cameraModeFromView(currentView),target,yaw,pitch,dist,fov,leanMix=cfg.horizonLean*.16;
 const behind=dirYaw([-f[0],-f[1],0]),ahead=dirYaw(f),side=dirYaw(right);
 if(mode==='drive'){
  let lookD=4.6,targetEye=v5add(free.p,v5mul(upBike,.34));
  target=v5add(targetEye,v5add(v5mul(f,lookD),v5mul(right,clamp(free.steer/DEG/28,-1,1)*.22)));
  yaw=behind+C.lookYaw;pitch=C.lookPitch*.65;dist=lookD;fov=61+(cfg.speedFov?5*clamp(speed/55,0,1):0);leanMix=cfg.horizonLean*.82;
 }else if(mode==='side'){
  target=v5add(free.p,[0,0,.50]);yaw=side+C.lookYaw*.5;pitch=.10+C.lookPitch*.5;dist=3.6+.018*speed;fov=50;leanMix=cfg.horizonLean*.10;
 }else if(mode==='front'){
  target=v5add(free.p,v5add(v5mul(f,.15),[0,0,.52]));yaw=ahead+C.lookYaw*.4;pitch=.08+C.lookPitch*.4;dist=3.5+.016*speed;fov=50;leanMix=cfg.horizonLean*.10;
 }else if(mode==='rear'){
  target=v5add(free.p,v5add(v5mul(f,.25),[0,0,.48]));yaw=behind+C.lookYaw*.55;pitch=.07+C.lookPitch*.45;dist=2.05+.020*speed;fov=53;leanMix=cfg.horizonLean*.28;
 }else if(mode==='top'){
  target=v5add(free.p,v5add(v5mul(f,1.5),[0,0,.05]));yaw=behind+C.lookYaw*.18;pitch=1.18+C.lookPitch*.18;dist=9.5;fov=49;leanMix=0;
 }else if(mode==='path'){
  target=v5add(free.p,v5add(v5mul(f,5.8),[0,0,.25]));yaw=behind-.32+C.lookYaw*.25;pitch=.40+C.lookPitch*.25;dist=10.2;fov=51;leanMix=cfg.horizonLean*.06;
 }else{
  target=v5add(free.p,v5add(v5mul(f,.42),[0,0,.55]));yaw=behind+C.lookYaw;pitch=.14-clamp(C.accel,-7,7)*.006+C.lookPitch;dist=(3.05+.034*speed)*C.zoom;fov=49+(cfg.speedFov?8*clamp(speed/58,0,1):0);leanMix=cfg.horizonLean*.20;
 }
 const resp=cfg.cameraResponse==='LOCKED'?{yaw:.035,target:.035,pitch:.05,dist:.07}:cfg.cameraResponse==='CINEMATIC'?{yaw:.32,target:.28,pitch:.28,dist:.34}:{yaw:.115,target:.095,pitch:.12,dist:.15};
 if(!C.init){cam.yaw=yaw;cam.pitch=pitch;cam.dist=dist;cam.target=target.slice();C.init=true}
 let dy=angleWrap(yaw-cam.yaw);cam.yaw+=dy*alpha(dt,resp.yaw);cam.pitch+=angleWrap(pitch-cam.pitch)*alpha(dt,resp.pitch);cam.dist+=((dist)-cam.dist)*alpha(dt,resp.dist);
 for(let i=0;i<3;i++)cam.target[i]+=(target[i]-cam.target[i])*alpha(dt,resp.target);
 C.up=mix3([0,0,1],upBike,clamp(leanMix,0,.92));C.fov=fov;global.__LUCID_RIDE_CAMERA_UP__=C.up;global.__LUCID_RIDE_FOV__=fov;
};

look=function(eye,tar,up){
 if(global.__LUCID_ACTIVE_PAGE__==='RIDE'&&global.__LUCID_RIDE_CAMERA_UP__)return baseLook(eye,tar,global.__LUCID_RIDE_CAMERA_UP__);
 return baseLook(eye,tar,up);
};
perspective=function(f,a,n,fa){
 if(global.__LUCID_ACTIVE_PAGE__==='RIDE'){f=(global.__LUCID_RIDE_FOV__||50)*DEG;fa=Math.max(260,fa||0)}
 return basePerspective(f,a,n,fa);
};

const baseRenderFree=renderFree;
renderFree=function(){
 baseRenderFree();
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE'||!$('showRoad')?.checked)return;
 try{
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
  drawPBR(roadVao,6,mul4(T(free.p[0],free.p[1],-.006),S(92)),[.105,.119,.126],.97,0,false,0,gl.TRIANGLES,true);
  let P=[],C=[],push=(a,b,c)=>{P.push(...a,...b);C.push(...c,...c)},step=10,span=80,x0=Math.floor(free.p[0]/step)*step,y0=Math.floor(free.p[1]/step)*step;
  for(let y=y0-span;y<=y0+span;y+=step)push([x0-span,y,.004],[x0+span,y,.004],[.135,.16,.17]);
  for(let x=x0-span;x<=x0+span;x+=step)push([x,y0-span,.004],[x,y0+span,.004],[.135,.16,.17]);
  for(let y=Math.floor((free.p[1]-70)/20)*20;y<=free.p[1]+120;y+=20){push([-1.4,y,.008],[-.35,y,.008],[.38,.42,.42]);push([.35,y,.008],[1.4,y,.008],[.38,.42,.42])}
  lines(P,C,global.__VP__);
 }catch(err){global.__LUCID_V124_WORLD_ERROR__=String(err?.message||err)}
};

function installPointerCamera(){
 const oldDown=cvs.onpointerdown,oldMove=cvs.onpointermove,oldUp=cvs.onpointerup,oldWheel=cvs.onwheel;
 cvs.onpointerdown=e=>{
  if(global.__LUCID_ACTIVE_PAGE__==='RIDE'){rt.pointer.down=true;rt.pointer.x=e.clientX;rt.pointer.y=e.clientY;cvs.setPointerCapture?.(e.pointerId);return}
  oldDown?.call(cvs,e);
 };
 cvs.onpointermove=e=>{
  if(global.__LUCID_ACTIVE_PAGE__==='RIDE'&&rt.pointer.down){let dx=e.clientX-rt.pointer.x,dy=e.clientY-rt.pointer.y;rt.pointer.x=e.clientX;rt.pointer.y=e.clientY;rt.camera.lookYaw=clamp(rt.camera.lookYaw-dx*.0045,-.85,.85);rt.camera.lookPitch=clamp(rt.camera.lookPitch+dy*.004,-.42,.42);return}
  oldMove?.call(cvs,e);
 };
 cvs.onpointerup=e=>{if(global.__LUCID_ACTIVE_PAGE__==='RIDE'){rt.pointer.down=false;return}oldUp?.call(cvs,e)};
 cvs.onwheel=e=>{if(global.__LUCID_ACTIVE_PAGE__==='RIDE'){rt.camera.zoom=clamp(rt.camera.zoom*Math.exp(e.deltaY*.0008),.72,1.55);e.preventDefault();return}oldWheel?.call(cvs,e)};
}

function cameraSoundSpec(){
 const m=rt.camera.mode;
 if(m==='drive')return{perspective:'ONBOARD',distance:.7};
 if(m==='side')return{perspective:'EXHAUST_SIDE',distance:2.1};
 if(m==='front')return{perspective:'INTAKE_SIDE',distance:2.4};
 if(m==='rear')return{perspective:'EXHAUST_SIDE',distance:1.8};
 return{perspective:'CHASE',distance:2.5};
}
function saveSoundView(){
 if(rt.soundSaved||!SOUND?.profile)return;try{let p=SOUND.profile();rt.soundSaved={perspective:p.mixer?.perspective,distance:p.mixer?.listenerDistanceM}}catch(_){}
}
function applyCameraSound(){
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE'||!cfg.audioPerspective||!SOUND?.set)return;
 saveSoundView();let s=cameraSoundSpec();try{SOUND.set({'mixer.perspective':s.perspective,'mixer.listenerDistanceM':s.distance})}catch(_){}
}
function restoreSoundView(){
 if(!rt.soundSaved||!SOUND?.set)return;try{SOUND.set({'mixer.perspective':rt.soundSaved.perspective,'mixer.listenerDistanceM':rt.soundSaved.distance})}catch(_){}
 rt.soundSaved=null;
}
function pageChanged(){
 const ride=global.__LUCID_ACTIVE_PAGE__==='RIDE';
 if(ride&&!rt.pageWasRide){saveSoundView();applyCameraSound();rt.camera.init=false}
 if(!ride&&rt.pageWasRide)restoreSoundView();
 rt.pageWasRide=ride;
}

function lamp(id,on,hot){let e=$(id);if(!e)return;e.classList.toggle('on',!!on);e.classList.toggle('hot',!!hot)}
function v124RideFrame(M){
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE'||!M)return;
 const now=performance.now();rt.fps.frames++;
 if(now-rt.fps.last>=500){rt.fps.value=rt.fps.frames*1000/(now-rt.fps.last);rt.fps.frames=0;rt.fps.last=now}
 if(now-rt.hudLast<45)return;rt.hudLast=now;
 const L=PT.states?.free?.last||M.powertrain||{},speed=M.body?.speedKmh??Math.hypot(...(M.body?.velocityMps||[0,0,0]))*3.6;
 const rpm=L.engine?.rpm||1300,gear=L.gear||PT.states?.free?.command?.gear||1,roll=M.body?.rollDeg||0,steer=M.steering?.angleDeg||0,slip=L.wheel?.slipR??M.rear?.slipRatio??0;
 setText('v124Speed',Math.max(0,speed).toFixed(speed<100?1:0));setText('v124Gear',gear);setText('v124RpmText',Math.round(rpm)+' rpm');
 setWidth('v124TachFill',rpm/10400*100);$('v124Tach')?.classList.toggle('hot',rpm>9800);
 setText('v124Meta',`${roll.toFixed(1)}° lean · ${steer.toFixed(1)}° steer · κR ${Number(slip||0).toFixed(3)} · ${rt.fps.value.toFixed(0)} fps`);
 let assist=API.assistMode?.()||'RAW',cm=({drive:'HELMET',path:'CINEMA',rear:'TAIL',top:'HIGH'})[rt.camera.mode]||String(rt.camera.mode||'CHASE').toUpperCase();
 setText('v124Mode',`${rt.session} · ${cm} · ${assist} · ${cfg.inputProfile}`);
 setWidth('v124ThrBar',rt.input.throttle*100);setWidth('v124FbrBar',rt.input.frontBar/cfg.frontBrakeMaxBar*100);setWidth('v124RbrBar',rt.input.rearBar/cfg.rearBrakeMaxBar*100);setWidth('v124CluBar',rt.input.clutch*100);setWidth('v124StrBar',50+50*clamp(rt.input.steerNm/cfg.steerMaxNm,-1,1));
 const r=uiRideState();lamp('v124Abs',r.abs,L.abs?.frontActive||L.abs?.rearActive);lamp('v124Tc',r.tc,L.tc?.active);lamp('v124Launch',rt.launch.active,rt.launch.latched);lamp('v124Audio',!!SOUND?.engine?.enabled,false);
 let alert=$('v124Alert'),msg='';
 if(Math.abs(roll)>67)msg='BIKE DOWN · R / RESET';
 else if(rpm>=10350)msg='REV LIMITER';
 else if(L.tc?.active)msg='TRACTION CONTROL';
 else if(L.abs?.frontActive||L.abs?.rearActive)msg='ABS MODULATION';
 if(alert){alert.textContent=msg;alert.classList.toggle('show',!!msg)}
 setText('v124SessionPill',`FREE RIDE · ${rt.session} · ${cm} · TELEMETRY OFF`);
}
global.__LUCID_RIDE_FRAME__=v124RideFrame;

function extraKeys(e){
 if(global.__LUCID_ACTIVE_PAGE__!=='RIDE')return;
 if(e.code==='KeyV'&&!e.repeat){
  const seq=['chase','side','front','rear','top','path','drive'],i=Math.max(0,seq.indexOf(rt.camera.mode));view(seq[(i+1)%seq.length]);e.preventDefault();
 }else if(e.code==='Escape'){
  $('v123RideDrawer')?.classList.remove('open');$('v123RideHelp')?.classList.remove('open');
 }
}
function resetKeyUp(e){if(global.__LUCID_ACTIVE_PAGE__==='RIDE'&&(e.code==='KeyR'||e.code==='Enter'))postResetArm()}

function patchHelp(){
 const h=$('v123RideHelp');if(!h)return;
 const k=h.querySelector('.keys');if(k)k.insertAdjacentHTML('beforeend','<b>V / right stick</b><span>cycle camera / temporary look</span><b>Gamepad</b><span>RT throttle · LT front brake · B rear brake · A clutch · LB/RB gears · Y reset · Start pause</span>');
}
function status(){
 return{
  version:'V1.24.0',
  session:rt.session,
  input:{...rt.input,profile:cfg.inputProfile,steerMaxNm:cfg.steerMaxNm,frontBrakeMaxBar:cfg.frontBrakeMaxBar,rearBrakeMaxBar:cfg.rearBrakeMaxBar},
  camera:{mode:rt.camera.mode,fovDeg:rt.camera.fov,horizonLean:cfg.horizonLean,response:cfg.cameraResponse},
  launch:{...rt.launch,assist:cfg.launchAssist},
  performance:{telemetryDOM:false,chartRendering:false,deepSnapshotClone:false,trajectoryPredictionInRide:false,freeApplyUIExtraCompute:false,powertrainHistory:false,freeRoadHistory:false,acousticTelemetry:false,worldGrid:'lightweight render-only',audioDSP:true}
 };
}

function install(){
 addCSS();buildDash();decorateCameraStrip();addRideControls();installPointerCamera();patchHelp();
 D.title='Ducati 916 LUCID MOTO Studio V1.24 · Free Ride Experience / Engine / Sound / Dynamics';
 let mo=new MutationObserver(pageChanged);mo.observe(D.body,{attributes:true,attributeFilter:['data-v123-page']});
 global.addEventListener('keydown',extraKeys,true);global.addEventListener('keyup',resetKeyUp,true);
 applySession('ROLLING',false);setRideCamera('chase');pageChanged();
 global.__LUCID_V124_FREE_RIDE_STATUS__={version:'V1.24.0',authority:'V5 free-road physics + V1.21 compliant powertrain + V1.22 procedural acoustics',notes:[
  'Ride input shaping changes rider command mapping only; it does not alter tire/chassis equations.',
  'Standing launch assist schedules dry-clutch engagement only and does not add crank torque.',
  'Expanded proving-ground visuals are render-only on the same flat free-road physics surface.'
 ]};
 global.LUCID_MOTO_RIDE={status,applySession,setCamera:setRideCamera,config:()=>({...cfg}),input:()=>({...rt.input})};
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(typeof window!=='undefined'?window:globalThis);

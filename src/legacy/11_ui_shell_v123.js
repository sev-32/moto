
(function(global){
'use strict';
if(global.__LUCID_V123_UI_SHELL__) return;
global.__LUCID_V123_UI_SHELL__=true;
global.__LUCID_PERF_MODE__='LAB';

const D=document, q=id=>D.getElementById(id), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const API=global.DUCATI_V5_API;
const PT=global.DUCATI_ADVANCED_POWERTRAIN;
const SOUND=global.DUCATI_SOUND_STUDIO;

const state={
 page:'RIDE',
 diagnosticsSaved:null,
 hudLast:0,
 fpsLast:performance.now(),
 fpsFrames:0,
 fps:0,
 gamepadPrev:[],
 ride:{
  throttleKey:false, frontBrakeKey:false, rearBrakeKey:false, clutchKey:false,
  steerKey:0, gear:3, abs:false, tc:false, startSpeed:20, assist:'RAW',
  gamepad:false
 }
};

const CSS=`
:root{--v123-top:58px;--v123-panel:520px;--v123-sound:720px;--v123-engine:500px}
body.v123{--bg:#05090d;--p:#091219;--p2:#0d1820;--ln:#223844;--tx:#dfeff5;--mu:#7f9eac;--cy:#68dafa;--gr:#6ce6a9;--am:#ffc56a;--rd:#ff7365}
body.v123 #app{position:absolute;left:0;right:0;top:var(--v123-top);bottom:0;height:auto;min-height:0}
#v123Top{position:fixed;left:0;right:0;top:0;height:var(--v123-top);z-index:150;display:flex;align-items:center;gap:12px;padding:0 14px;background:linear-gradient(180deg,#09131bf8,#071017f0);border-bottom:1px solid #2b4654;box-shadow:0 8px 24px #0007;backdrop-filter:blur(14px)}
#v123Brand{min-width:245px;display:flex;align-items:center;gap:10px}
#v123Mark{width:31px;height:31px;border:1px solid #567482;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:10px;letter-spacing:.08em;box-shadow:inset 0 0 0 4px #0d1b23}
#v123Brand strong{display:block;font-size:12px;letter-spacing:.11em}#v123Brand small{display:block;color:#7897a5;font-size:9px;margin-top:2px}
#v123Nav{display:flex;align-items:center;gap:4px;flex:1;min-width:0}
#v123Nav button{border-color:transparent;background:transparent;color:#89a7b5;padding:8px 10px;letter-spacing:.06em;font-size:10px;white-space:nowrap}
#v123Nav button:hover{color:#dfeff5;border-color:#345261}
#v123Nav button.on{color:#e9faff;background:#10242e;border-color:#4b7788;box-shadow:inset 0 -2px #68dafa}
#v123TopRight{display:flex;gap:6px;align-items:center}
.v123Chip{border:1px solid #2d4a57;background:#08151c;border-radius:5px;padding:5px 7px;color:#9eb8c3;font-size:9px;white-space:nowrap}
.v123Chip.good{color:#73e8b0;border-color:#2e6c52}.v123Chip.warn{color:#ffc56a;border-color:#735e37}
#v123AudioBtn{padding:6px 8px;font-size:9px}
#v123EngineDock,#v123SoundDock{display:none;min-width:0;min-height:0;overflow:hidden;background:#071017;border-left:1px solid #243b46}
body[data-v123-page="RIDE"] #app{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="RIDE"] #view{grid-column:1;grid-row:1;border:0}
body[data-v123-page="RIDE"] #ctrl,body[data-v123-page="RIDE"] #bottom,body[data-v123-page="RIDE"] #v123EngineDock,body[data-v123-page="RIDE"] #v123SoundDock{display:none!important}
body[data-v123-page="ENGINE"] #app{grid-template-columns:minmax(0,1fr) var(--v123-engine);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="ENGINE"] #view{grid-column:1;grid-row:1}body[data-v123-page="ENGINE"] #v123EngineDock{display:block;grid-column:2;grid-row:1}
body[data-v123-page="ENGINE"] #ctrl,body[data-v123-page="ENGINE"] #bottom,body[data-v123-page="ENGINE"] #v123SoundDock{display:none!important}
body[data-v123-page="SOUND"] #app{grid-template-columns:minmax(0,1fr) min(var(--v123-sound),54vw);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="SOUND"] #view{grid-column:1;grid-row:1}body[data-v123-page="SOUND"] #v123SoundDock{display:block;grid-column:2;grid-row:1}
body[data-v123-page="SOUND"] #ctrl,body[data-v123-page="SOUND"] #bottom,body[data-v123-page="SOUND"] #v123EngineDock{display:none!important}
body[data-v123-page="DYNAMICS"] #app,body[data-v123-page="INSPECT"] #app{grid-template-columns:minmax(0,1fr) var(--v123-panel);grid-template-rows:minmax(0,1fr)}
body[data-v123-page="DYNAMICS"] #view,body[data-v123-page="INSPECT"] #view{grid-column:1;grid-row:1}
body[data-v123-page="DYNAMICS"] #ctrl,body[data-v123-page="INSPECT"] #ctrl{display:block;grid-column:2;grid-row:1}
body[data-v123-page="DYNAMICS"] #bottom,body[data-v123-page="INSPECT"] #bottom,body[data-v123-page="DYNAMICS"] #v123EngineDock,body[data-v123-page="DYNAMICS"] #v123SoundDock,body[data-v123-page="INSPECT"] #v123EngineDock,body[data-v123-page="INSPECT"] #v123SoundDock{display:none!important}
body[data-v123-page="TELEMETRY"] #app{grid-template-columns:minmax(0,1fr) var(--v123-panel);grid-template-rows:minmax(0,1fr) 300px}
body[data-v123-page="TELEMETRY"] #view{grid-column:1;grid-row:1}body[data-v123-page="TELEMETRY"] #bottom{display:grid;grid-column:1;grid-row:2}
body[data-v123-page="TELEMETRY"] #ctrl{display:block;grid-column:2;grid-row:1/3}body[data-v123-page="TELEMETRY"] #v123EngineDock,body[data-v123-page="TELEMETRY"] #v123SoundDock{display:none!important}
body.v123 #badge{display:none}body.v123 #tireQualityQuick{display:none!important}
body.v123 #v53Tabs{display:none!important}
#v123CtrlContext{position:sticky;top:0;z-index:45;background:#09131bf5;border-bottom:1px solid #27404b;padding:8px;margin:0 -8px 8px;display:flex;gap:5px;flex-wrap:wrap;backdrop-filter:blur(10px)}
#v123CtrlContext button{font-size:9px;padding:6px 8px}#v123CtrlContext button.on{border-color:#68dafa;background:#173b49}
body.v123 #ctrl{padding-top:0}
body[data-v123-page="ENGINE"] #advDyno{position:relative;left:auto;right:auto;bottom:auto;top:auto;width:100%;height:100%;max-height:none;border:0;border-radius:0;padding:11px;background:#071018;box-shadow:none;overflow:auto}
body[data-v123-page="ENGINE"] #advDyno.min .advBody{display:block}
body[data-v123-page="ENGINE"] #advDyno #advMin{display:none}
body[data-v123-page="SOUND"] #acousticStudio{position:relative;left:auto;right:auto;top:auto;width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;overflow:auto;display:block}
body[data-v123-page="SOUND"] #acousticStudio.hidden{display:block}body[data-v123-page="SOUND"] #asClose{display:none}
body.v123 #acousticDock{display:none!important}
#v123RideHud{display:none;position:fixed;z-index:120;left:18px;top:calc(var(--v123-top) + 16px);pointer-events:none}
body[data-v123-page="RIDE"] #v123RideHud{display:block}
#v123RideHud .cluster{display:flex;align-items:flex-end;gap:16px;background:linear-gradient(120deg,#061018db,#07131a9e);border:1px solid #365361;border-radius:9px;padding:10px 13px;box-shadow:0 8px 26px #0008;backdrop-filter:blur(7px)}
#v123Speed{font:700 42px/0.9 ui-monospace,Consolas,monospace;letter-spacing:-.06em}#v123SpeedUnit{font-size:10px;color:#8aa5b1;margin-left:3px}
#v123Gear{font:800 38px/1 ui-monospace,Consolas,monospace;color:#76e4ff;min-width:28px;text-align:center}
#v123RpmBlock{width:220px}.v123HudLabel{font-size:8px;color:#7897a5;letter-spacing:.12em}.v123HudValue{font-size:11px;color:#dff4fb}
#v123RpmTrack{height:7px;border:1px solid #31505d;background:#061018;border-radius:4px;overflow:hidden;margin:4px 0 3px}#v123RpmFill{height:100%;width:0;background:linear-gradient(90deg,#55cbe9,#70e9a9,#ffc56a,#ff7365)}
#v123RideState{margin-top:7px;display:flex;gap:5px;flex-wrap:wrap}.v123Lamp{padding:3px 5px;border:1px solid #29434f;border-radius:4px;background:#071118;color:#718e9a;font-size:8px}.v123Lamp.on{color:#75e8b1;border-color:#317459}.v123Lamp.hot{color:#ffca72;border-color:#7a6236}
#v123RidePerf{margin-top:7px;color:#79dca8;font-size:9px;letter-spacing:.06em}
#v123RideCams{display:none;position:fixed;z-index:121;left:50%;transform:translateX(-50%);bottom:16px;gap:5px;padding:5px;background:#061018cc;border:1px solid #2e4a57;border-radius:7px;backdrop-filter:blur(7px)}
body[data-v123-page="RIDE"] #v123RideCams{display:flex}
#v123RideCams button{font-size:9px;padding:5px 7px;background:#0b1921dd}
#v123RideDrawerToggle{display:none;position:fixed;right:18px;top:calc(var(--v123-top) + 16px);z-index:124}
body[data-v123-page="RIDE"] #v123RideDrawerToggle{display:block}
#v123RideDrawer{display:none;position:fixed;z-index:123;right:18px;top:calc(var(--v123-top) + 52px);width:310px;max-height:calc(100vh - var(--v123-top) - 74px);overflow:auto;background:#071119ed;border:1px solid #385866;border-radius:9px;padding:10px;box-shadow:0 10px 30px #0009;backdrop-filter:blur(12px)}
body[data-v123-page="RIDE"] #v123RideDrawer.open{display:block}
.v123Section{border-top:1px solid #213843;padding-top:8px;margin-top:8px}.v123Section:first-child{border-top:0;padding-top:0;margin-top:0}.v123Section h4{font-size:9px;letter-spacing:.12em;color:#98c8d9;margin:0 0 7px}
.v123Field{display:grid;grid-template-columns:1fr 105px;gap:7px;align-items:center;margin:5px 0}.v123Field input,.v123Field select{width:100%}.v123Field span:last-child{text-align:right;color:#70dcfa}
.v123Buttons{display:flex;gap:5px;flex-wrap:wrap}.v123Buttons button{font-size:9px;padding:6px 8px}
#v123RideHelp{display:none;position:fixed;z-index:126;left:18px;bottom:62px;width:420px;max-width:calc(100vw - 36px);background:#061018ee;border:1px solid #385866;border-radius:8px;padding:10px;box-shadow:0 10px 30px #0009}
body[data-v123-page="RIDE"] #v123RideHelp.open{display:block}
#v123RideHelp .keys{display:grid;grid-template-columns:105px 1fr;gap:4px 10px;font-size:9px}#v123RideHelp .keys b{color:#73dcf8}#v123RideHelp .keys span{color:#9bb3bd}
#v123PageTitle{position:fixed;z-index:90;left:18px;top:calc(var(--v123-top) + 14px);display:none;background:#061018d8;border:1px solid #2f4b57;border-radius:7px;padding:8px 10px;pointer-events:none}
body:not([data-v123-page="RIDE"]) #v123PageTitle{display:block}
#v123PageTitle strong{display:block;font-size:11px;letter-spacing:.11em}#v123PageTitle span{display:block;color:#7e9ca9;font-size:9px;margin-top:2px}
body[data-v123-page="ENGINE"] #viewBtns,body[data-v123-page="SOUND"] #viewBtns{top:58px}
body[data-v123-page="DYNAMICS"] #viewBtns,body[data-v123-page="TELEMETRY"] #viewBtns,body[data-v123-page="INSPECT"] #viewBtns{top:58px}
body[data-v123-page="RIDE"] #viewBtns{display:none!important}
body[data-v123-page="RIDE"] #advDyno,body[data-v123-page="RIDE"] #acousticStudio{display:none!important}
#v123Touch{display:none}
@media(pointer:coarse),(max-width:760px){
 #v123Brand{min-width:auto}#v123Brand small{display:none}#v123Brand strong{font-size:10px}#v123Mark{display:none}
 #v123Nav{overflow:auto}#v123Nav button{padding:7px 8px}#v123TopRight .v123Chip{display:none}
 #v123RideHud .cluster{gap:9px;padding:8px}#v123Speed{font-size:32px}#v123Gear{font-size:30px}#v123RpmBlock{width:130px}
 #v123RideCams{bottom:82px;max-width:94vw;overflow:auto}
 #v123Touch{position:fixed;z-index:130;left:10px;right:10px;bottom:12px;display:none;grid-template-columns:repeat(8,1fr);gap:5px}
 body[data-v123-page="RIDE"] #v123Touch{display:grid}#v123Touch button{height:56px;font-size:9px;background:#0a1720dd}
 body[data-v123-page="ENGINE"] #app,body[data-v123-page="SOUND"] #app{grid-template-columns:1fr}
 body[data-v123-page="ENGINE"] #view,body[data-v123-page="SOUND"] #view{display:none}
 body[data-v123-page="ENGINE"] #v123EngineDock,body[data-v123-page="SOUND"] #v123SoundDock{grid-column:1}
}
`;

function addStyle(){const s=D.createElement('style');s.id='v123Style';s.textContent=CSS;D.head.appendChild(s)}

function buildTop(){
 const top=D.createElement('header');top.id='v123Top';
 top.innerHTML=`<div id="v123Brand"><div id="v123Mark">916</div><div><strong>LUCID MOTO · DEVELOPMENT STUDIO</strong><small>V1.23 modular UI · V5 free-road / V1.21 powertrain / V1.22 acoustics</small></div></div>
 <nav id="v123Nav">${[
  ['RIDE','FREE RIDE'],['ENGINE','ENGINE'],['SOUND','SOUND'],['DYNAMICS','DYNAMICS'],['TELEMETRY','TELEMETRY'],['INSPECT','INSPECT']
 ].map(([k,l])=>`<button data-v123-page="${k}">${l}</button>`).join('')}</nav>
 <div id="v123TopRight"><span id="v123Domain" class="v123Chip">DOMAIN —</span><span id="v123PerfTop" class="v123Chip good">LAB</span><button id="v123AudioBtn">AUDIO OFF</button></div>`;
 D.body.appendChild(top);
 q('v123Nav').onclick=e=>{const b=e.target.closest('[data-v123-page]');if(b)setPage(b.dataset.v123Page)};
 q('v123AudioBtn').onclick=toggleAudio;
}

function buildDocks(){
 const app=q('app');if(!app)return;
 const ed=D.createElement('section');ed.id='v123EngineDock';
 const sd=D.createElement('section');sd.id='v123SoundDock';
 app.append(ed,sd);
 const adv=q('advDyno');if(adv)ed.appendChild(adv);
 const ac=q('acousticStudio');if(ac){ac.classList.remove('hidden');sd.appendChild(ac)}
}

function buildContext(){
 const ctrl=q('ctrl');if(!ctrl)return;
 const c=D.createElement('div');c.id='v123CtrlContext';ctrl.prepend(c);
}

function buildRide(){
 const hud=D.createElement('div');hud.id='v123RideHud';hud.innerHTML=`
  <div class="cluster">
   <div><span id="v123Speed">0</span><span id="v123SpeedUnit">km/h</span></div>
   <div><div class="v123HudLabel">GEAR</div><div id="v123Gear">3</div></div>
   <div id="v123RpmBlock"><div class="v123HudLabel">ENGINE</div><div><span id="v123Rpm" class="v123HudValue">0 rpm</span></div><div id="v123RpmTrack"><div id="v123RpmFill"></div></div><div class="v123HudLabel"><span id="v123RideSub">RAW · 0.0° lean · 0.0° steer</span></div></div>
  </div>
  <div id="v123RideState"><span id="v123AbsLamp" class="v123Lamp">ABS</span><span id="v123TcLamp" class="v123Lamp">TC</span><span id="v123AudioLamp" class="v123Lamp">AUDIO</span><span id="v123ClutchLamp" class="v123Lamp">CLUTCH</span><span id="v123PauseLamp" class="v123Lamp">RUN</span></div>
  <div id="v123RidePerf">PERFORMANCE RUNTIME · engineering telemetry suspended</div>`;
 D.body.appendChild(hud);

 const cams=D.createElement('div');cams.id='v123RideCams';
 [['chase','CHASE'],['side','SIDE'],['front','FRONT'],['rear','REAR'],['top','TOP'],['path','PATH'],['drive','DRIVE']].forEach(([id,l])=>{
   const b=D.createElement('button');b.textContent=l;b.dataset.view=id;b.onclick=()=>{try{view(id)}catch(_){}};cams.appendChild(b);
 });
 D.body.appendChild(cams);

 const tog=D.createElement('button');tog.id='v123RideDrawerToggle';tog.textContent='RIDE SETUP';tog.onclick=()=>q('v123RideDrawer').classList.toggle('open');D.body.appendChild(tog);
 const dr=D.createElement('div');dr.id='v123RideDrawer';dr.innerHTML=`
 <div class="v123Section"><h4>SESSION</h4><div class="v123Buttons"><button id="v123Run">PAUSE</button><button id="v123Reset">RESET</button><button id="v123HelpBtn">CONTROLS</button></div>
 <div class="v123Field"><span>Reset speed</span><input id="v123StartSpeed" type="range" min="0" max="60" step=".5" value="20"></div><div class="v123Field"><span></span><span id="v123StartSpeedV">20.0 m/s</span></div></div>
 <div class="v123Section"><h4>RIDER / STABILITY LANE</h4><div class="v123Field"><span>Assist lane</span><select id="v123Assist"><option value="RAW">RAW</option><option value="ROLL_ASSIST">ROLL ASSIST</option><option value="STEER_ASSIST">STEER ASSIST</option><option value="BOTH">ROLL + STEER</option></select></div>
 <div class="v123Field"><span>Research ABS</span><input id="v123Abs" type="checkbox"></div><div class="v123Field"><span>Research TC</span><input id="v123Tc" type="checkbox"></div></div>
 <div class="v123Section"><h4>RUNTIME QUALITY</h4><div class="v123Field"><span>Tire structure</span><select id="v123Quality"><option value="STANDARD">STANDARD · 22</option><option value="HIGH">HIGH · 36</option><option value="ULTRA">ULTRA · 48</option></select></div>
 <div class="v123Field"><span>Audio engine</span><button id="v123RideAudio">ENABLE / MUTE</button></div><div class="v123HudLabel">Ride mode suppresses chart rendering, telemetry DOM construction, part inspection, per-frame deep snapshot cloning, engine plot refresh, and acoustic analyzer UI. Audio DSP and engine-state coupling remain active.</div></div>`;
 D.body.appendChild(dr);
 q('v123Run').onclick=()=>{paused=!paused;q('v123Run').textContent=paused?'RUN':'PAUSE'};
 q('v123Reset').onclick=resetRide;
 q('v123HelpBtn').onclick=()=>q('v123RideHelp').classList.toggle('open');
 q('v123StartSpeed').oninput=e=>{state.ride.startSpeed=+e.target.value;q('v123StartSpeedV').textContent=(+e.target.value).toFixed(1)+' m/s'};
 q('v123Assist').onchange=e=>{state.ride.assist=e.target.value;try{API.setAssistMode?.(state.ride.assist)}catch(_){}};
 q('v123Abs').onchange=e=>state.ride.abs=e.target.checked;
 q('v123Tc').onchange=e=>state.ride.tc=e.target.checked;
 q('v123Quality').onchange=e=>{try{API.setTireQuality(e.target.value)}catch(err){console.error(err)}};
 q('v123RideAudio').onclick=toggleAudio;

 const help=D.createElement('div');help.id='v123RideHelp';help.innerHTML=`<div class="v123Section"><h4>FREE RIDE CONTROLS</h4><div class="keys">
 <b>W / ↑ / RT</b><span>throttle</span><b>S / ↓ / LT</b><span>front brake / gamepad combined brake</span><b>SPACE</b><span>rear brake</span>
 <b>A D / ← → / LS-X</b><span>steering effort</span><b>C / SHIFT</b><span>clutch lever</span><b>E / RB</b><span>shift up</span><b>Q / LB</b><span>shift down</span>
 <b>1–7</b><span>camera views</span><b>P</b><span>pause / run</span><b>R / ENTER</b><span>reset ride</span><b>M</b><span>mute / enable procedural audio</span><b>H</b><span>toggle this panel</span>
 </div></div>`;D.body.appendChild(help);

 const touch=D.createElement('div');touch.id='v123Touch';touch.innerHTML=`<button data-act="left">LEFT</button><button data-act="right">RIGHT</button><button data-act="thr">THR</button><button data-act="fbr">F.BR</button><button data-act="rbr">R.BR</button><button data-act="clu">CLU</button><button data-act="down">GEAR−</button><button data-act="up">GEAR+</button>`;
 D.body.appendChild(touch);
 wireTouch(touch);
}

function buildPageTitle(){
 const t=D.createElement('div');t.id='v123PageTitle';t.innerHTML='<strong></strong><span></span>';D.body.appendChild(t);
}

function setTitle(page){
 const map={
  ENGINE:['ENGINE LAB','crank · clutch · gearbox compliance · hydraulic brakes · ABS / TC'],
  SOUND:['ACOUSTIC STUDIO','procedural combustion · intake · exhaust · mechanical / driveline sound'],
  DYNAMICS:['DYNAMICS LAB','free-road setup · rider-assist lanes · tire / steering / suspension research'],
  TELEMETRY:['TELEMETRY & ANALYSIS','live system telemetry · plots · capture / export'],
  INSPECT:['INSPECT / AUDIT','181-part live inspector · model authority · validation']
 };
 const r=map[page]||['',''];q('v123PageTitle').querySelector('strong').textContent=r[0];q('v123PageTitle').querySelector('span').textContent=r[1];
}

function selectLegacyTab(name){
 const b=D.querySelector(`#v53Tabs [data-v53tab="${name}"]`);if(b)b.click();
}
function context(page){
 const c=q('v123CtrlContext');if(!c)return;
 const items=page==='DYNAMICS'?[['RUN','RUN'],['SETUP','SETUP'],['ASSIST','ASSIST'],['PHYSICS','PHYSICS']]
   :page==='TELEMETRY'?[['TELEMETRY','LIVE TELEMETRY']]
   :page==='INSPECT'?[['PARTS','PARTS'],['AUDIT','AUDIT']]:[];
 c.innerHTML=items.map(([k,l],i)=>`<button data-tab="${k}" class="${i?'':'on'}">${l}</button>`).join('');
 c.onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;c.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));selectLegacyTab(b.dataset.tab)};
 if(items.length)selectLegacyTab(items[0][0]);
}

function saveAndDisableDiagnostics(){
 if(state.diagnosticsSaved)return;
 const ids=['showTrajectory','showSlipDiag','showBeadLock','showSteerGeom','showTireWire','showInner','showForce','showShock','showChain','showTread'];
 state.diagnosticsSaved={};ids.forEach(id=>{const e=q(id);if(e){state.diagnosticsSaved[id]=e.checked;e.checked=false}});
 if(q('showRoad'))q('showRoad').checked=true;if(q('showChassis'))q('showChassis').checked=true;
}
function restoreDiagnostics(){
 if(!state.diagnosticsSaved)return;Object.entries(state.diagnosticsSaved).forEach(([id,v])=>{const e=q(id);if(e)e.checked=v});state.diagnosticsSaved=null;
}

function setPage(page){
 page=String(page||'RIDE').toUpperCase();if(!['RIDE','ENGINE','SOUND','DYNAMICS','TELEMETRY','INSPECT'].includes(page))page='RIDE';
 const prev=state.page;state.page=page;D.body.dataset.v123Page=page;global.__LUCID_ACTIVE_PAGE__=page;global.__LUCID_PERF_MODE__=page==='RIDE'?'RIDE':page==='SOUND'?'SOUND':'LAB';
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page===page));
 q('v123PerfTop').textContent=page==='RIDE'?'RIDE PERF':'DEV RUNTIME';q('v123PerfTop').className='v123Chip '+(page==='RIDE'?'good':'');
 setTitle(page);context(page);

 if(page==='RIDE'){
  saveAndDisableDiagnostics();
  try{if(API.domain?.()!=='FREE_ROAD')API.setDomain('FREE_ROAD')}catch(_){}
  try{view('chase')}catch(_){}
  try{state.ride.assist=API.assistMode?.()||state.ride.assist;q('v123Assist').value=state.ride.assist}catch(_){}
  const st=PT?.states?.free;if(st?.command){state.ride.gear=st.command.gear||state.ride.gear;state.ride.abs=!!st.command.absEnabled;state.ride.tc=!!st.command.tcEnabled;q('v123Abs').checked=state.ride.abs;q('v123Tc').checked=state.ride.tc}
  paused=false;q('v123Run').textContent='PAUSE';
 }else{
  restoreDiagnostics();
  if(prev==='RIDE') paused=true;
  if(page==='ENGINE'){try{if(API.domain?.()!=='DYNO')API.setDomain('DYNO');view('side')}catch(_){}}
  if(page==='SOUND'){try{q('acousticStudio')?.classList.remove('hidden')}catch(_){}}
  if(page==='DYNAMICS'||page==='TELEMETRY'||page==='INSPECT'){try{if(API.domain?.()!=='FREE_ROAD')API.setDomain('FREE_ROAD')}catch(_){}}
 }
 updateTopStatus();
}

function resetRide(){
 try{
  if(q('freeSpeed'))q('freeSpeed').value=String(state.ride.startSpeed);
  if(q('freeRoll'))q('freeRoll').value='0';
  API.resetFree(state.ride.startSpeed,0);API.setAssistMode?.(state.ride.assist);
  view('chase');paused=false;
 }catch(err){console.error('ride reset',err)}
}

function gear(delta){
 state.ride.gear=clamp((state.ride.gear|0)+delta,1,6);
 const st=PT?.states?.free;if(st?.command)st.command.gear=state.ride.gear;
}

function isTyping(e){const t=e.target;return !!(t&&(t.matches?.('input,select,textarea,[contenteditable="true"]')))}

function keyDown(e){
 if(state.page!=='RIDE'||isTyping(e))return;
 let handled=true;
 switch(e.code){
  case'KeyW':case'ArrowUp':state.ride.throttleKey=true;break;
  case'KeyS':case'ArrowDown':state.ride.frontBrakeKey=true;break;
  case'Space':state.ride.rearBrakeKey=true;break;
  case'KeyC':case'ShiftLeft':case'ShiftRight':state.ride.clutchKey=true;break;
  case'KeyA':case'ArrowLeft':state.ride.steerKey=-1;freeKeyboard.left=true;freeKeyboard.right=false;break;
  case'KeyD':case'ArrowRight':state.ride.steerKey=1;freeKeyboard.right=true;freeKeyboard.left=false;break;
  case'KeyE':if(!e.repeat)gear(1);break;case'KeyQ':if(!e.repeat)gear(-1);break;
  case'KeyP':if(!e.repeat){paused=!paused;q('v123Run').textContent=paused?'RUN':'PAUSE'}break;
  case'KeyR':case'Enter':if(!e.repeat)resetRide();break;
  case'KeyM':if(!e.repeat)toggleAudio();break;
  case'KeyH':if(!e.repeat)q('v123RideHelp').classList.toggle('open');break;
  case'Digit1':view('chase');break;case'Digit2':view('side');break;case'Digit3':view('front');break;case'Digit4':view('rear');break;case'Digit5':view('top');break;case'Digit6':view('path');break;case'Digit7':view('drive');break;
  default:handled=false;
 }
 if(handled){e.preventDefault();e.stopImmediatePropagation()}
}
function keyUp(e){
 if(state.page!=='RIDE'||isTyping(e))return;
 let handled=true;
 switch(e.code){
  case'KeyW':case'ArrowUp':state.ride.throttleKey=false;break;
  case'KeyS':case'ArrowDown':state.ride.frontBrakeKey=false;break;
  case'Space':state.ride.rearBrakeKey=false;break;
  case'KeyC':case'ShiftLeft':case'ShiftRight':state.ride.clutchKey=false;break;
  case'KeyA':case'ArrowLeft':state.ride.steerKey=0;freeKeyboard.left=false;break;
  case'KeyD':case'ArrowRight':state.ride.steerKey=0;freeKeyboard.right=false;break;
  default:handled=false;
 }
 if(handled){e.preventDefault();e.stopImmediatePropagation()}
}

function wireTouch(el){
 const set=(act,on)=>{
  if(act==='thr')state.ride.throttleKey=on;
  if(act==='fbr')state.ride.frontBrakeKey=on;
  if(act==='rbr')state.ride.rearBrakeKey=on;
  if(act==='clu')state.ride.clutchKey=on;
  if(act==='left'){state.ride.steerKey=on?-1:0;freeKeyboard.left=on}
  if(act==='right'){state.ride.steerKey=on?1:0;freeKeyboard.right=on}
 };
 el.querySelectorAll('button').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);if(b.dataset.act==='up')gear(1);else if(b.dataset.act==='down')gear(-1);else set(b.dataset.act,true)});
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,e=>{if(!['up','down'].includes(b.dataset.act))set(b.dataset.act,false)}));
 });
}

function readGamepad(){
 let gp=null;try{gp=[...(navigator.getGamepads?.()||[])].find(Boolean)}catch(_){}
 if(!gp){state.ride.gamepad=false;return{thr:0,br:0,steer:null,clutch:false}}
 state.ride.gamepad=true;
 const btn=i=>gp.buttons?.[i]?.value||0, pressed=i=>!!gp.buttons?.[i]?.pressed;
 const dz=x=>Math.abs(x)<.08?0:x;
 let steer=dz(gp.axes?.[0]||0),thr=btn(7),br=btn(6),clutch=pressed(0);
 const prev=state.gamepadPrev;
 if(pressed(5)&&!prev[5])gear(1);if(pressed(4)&&!prev[4])gear(-1);
 state.gamepadPrev=(gp.buttons||[]).map(x=>!!x.pressed);
 return{thr,br,steer,clutch};
}

function preStep(){
 if(state.page!=='RIDE')return;
 const g=readGamepad();
 const throttle=Math.max(state.ride.throttleKey?1:0,g.thr||0);
 const frontBar=Math.max(state.ride.frontBrakeKey?70:0,(g.br||0)*80);
 const rearBar=Math.max(state.ride.rearBrakeKey?50:0,(g.br||0)*24);
 const clutch=(state.ride.clutchKey||g.clutch)?0:1;
 if(g.steer!==null&&Math.abs(g.steer)>.001){
  freeKeyboard.left=freeKeyboard.right=false;
  const s=q('freeSteer');if(s)s.value=String(clamp(g.steer*25,-25,25));
 }else if(!state.ride.steerKey){const s=q('freeSteer');if(s)s.value='0'}
 if(PT?.setControls)PT.setControls({mode:'ENGINE',throttle,clutch,gear:state.ride.gear,frontBrakeBar:frontBar,rearBrakeBar:rearBar,absEnabled:state.ride.abs,tcEnabled:state.ride.tc,brakeModel:'HYDRAULIC_FERIT450'},'FREE_ROAD');
}
global.__LUCID_RIDE_PRESTEP__=preStep;

function rideFrame(M){
 if(state.page!=='RIDE'||!M)return;
 const now=performance.now();state.fpsFrames++;
 if(now-state.fpsLast>=500){state.fps=state.fpsFrames*1000/(now-state.fpsLast);state.fpsFrames=0;state.fpsLast=now}
 if(now-state.hudLast<45)return;state.hudLast=now;
 const st=PT?.states?.free,L=st?.last;
 const speed=M.body?.speedKmh??Math.hypot(...(M.body?.velocityMps||[0,0,0]))*3.6;
 const rpm=L?.engine?.rpm||0,gearN=L?.gear||state.ride.gear,roll=M.body?.rollDeg||0,steer=M.steering?.angleDeg||0;
 q('v123Speed').textContent=Math.max(0,speed).toFixed(speed<100?1:0);q('v123Gear').textContent=gearN;q('v123Rpm').textContent=rpm.toFixed(0)+' rpm';
 q('v123RpmFill').style.width=clamp(rpm/11000*100,0,100).toFixed(1)+'%';
 q('v123RideSub').textContent=`${API.assistMode?.()||'RAW'} · ${roll.toFixed(1)}° lean · ${steer.toFixed(1)}° steer`;
 const lamp=(id,on,hot=false)=>{const e=q(id);e.classList.toggle('on',!!on);e.classList.toggle('hot',!!hot)};
 lamp('v123AbsLamp',state.ride.abs,L?.abs?.frontActive||L?.abs?.rearActive);lamp('v123TcLamp',state.ride.tc,L?.tc?.active);lamp('v123AudioLamp',!!global.DUCATI_SOUND_STUDIO?.engine?.enabled);lamp('v123ClutchLamp',state.ride.clutchKey,false);lamp('v123PauseLamp',!paused,paused);
 q('v123PauseLamp').textContent=paused?'PAUSED':'RUN';
 q('v123RidePerf').textContent=`RIDE PERF · ${state.fps.toFixed(0)} fps · telemetry DOM/plots/snapshots OFF · ${state.ride.gamepad?'gamepad':'keyboard'} · audio ${global.DUCATI_SOUND_STUDIO?.engine?.enabled?'ON':'OFF'}`;
 updateTopStatus();
}
global.__LUCID_RIDE_FRAME__=rideFrame;

function updateTopStatus(){
 const d=API?.domain?.()||'—';const e=q('v123Domain');if(e)e.textContent=`${d} · ${state.page}`;
 const ab=q('v123AudioBtn'),on=!!global.DUCATI_SOUND_STUDIO?.engine?.enabled;if(ab)ab.textContent=on?'AUDIO ON':'AUDIO OFF';
}

async function toggleAudio(){
 try{
  const E=global.DUCATI_SOUND_STUDIO?.engine;if(!E)return;
  if(!E.started)await global.DUCATI_SOUND_STUDIO.enable();else if(E.enabled)global.DUCATI_SOUND_STUDIO.mute();else await global.DUCATI_SOUND_STUDIO.resume();
 }catch(err){console.error('audio toggle',err)}
 updateTopStatus();
}

function syncInitial(){
 try{
  const quality=API.tireQuality?.();if(quality&&q('v123Quality'))q('v123Quality').value=quality.id;
  const st=PT?.states?.free;if(st?.command){state.ride.gear=st.command.gear||3;state.ride.abs=!!st.command.absEnabled;state.ride.tc=!!st.command.tcEnabled}
 }catch(_){}
}

function install(){
 D.body.classList.add('v123');addStyle();buildTop();buildDocks();buildContext();buildRide();buildPageTitle();syncInitial();
 global.addEventListener('keydown',keyDown,true);global.addEventListener('keyup',keyUp,true);
 setPage('RIDE');
 global.__LUCID_V123_UI_STATUS__={
  version:'V1.23.0',
  pages:['RIDE','ENGINE','SOUND','DYNAMICS','TELEMETRY','INSPECT'],
  rideRuntime:{telemetryDOM:false,chartRendering:false,partInspector:false,deepSnapshotClone:false,enginePlotTimer:false,acousticAnalyzerUI:false,physics:true,renderer:true,audioDSP:true,powertrainCoupling:true},
  sourceReference:'V85 freeride UI used for separation-of-concerns / control-layout cues only; current V5/V1.21/V1.22 simulation remains authority'
 };
 global.LUCID_MOTO_UI={setPage,page:()=>state.page,rideState:()=>({...state.ride}),status:()=>JSON.parse(JSON.stringify(global.__LUCID_V123_UI_STATUS__))};
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(typeof window!=='undefined'?window:globalThis);


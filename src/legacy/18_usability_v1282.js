
(function(global){
'use strict';
if(global.__LUCID_V1282_USABILITY__)return;
global.__LUCID_V1282_USABILITY__=true;

const D=global.document,q=id=>D?.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rt={
 version:'V1.28.2',installed:false,benchActive:false,lastInput:'none',lastInputMs:0,
 bench:{throttle:0,clutch:0,gear:3,frontBar:0,rearBar:0,abs:false,tc:false,speedMps:18,history:[],lastFunctional:null},
 watchdog:{lastFreeTime:null,lastAdvanceMs:performance.now(),stalled:false}
};

function core(){
 return{
  A:global.DUCATI_V5_API,
  PT:global.DUCATI_ADVANCED_POWERTRAIN,
  V:global.VEHICLE_LAB_API,
  S:global.DUCATI_SOUND_STUDIO,
  R:global.LUCID_RECOVERY,
  ride:global.LUCID_MOTO_RIDE
 };
}
function setTitle(a,b){
 const t=q('v123PageTitle');if(!t)return;
 const s=t.querySelector('strong'),m=t.querySelector('span');if(s)s.textContent=a;if(m)m.textContent=b;
}
function setNav(page){
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page===page));
}
function ensureSoundFollow(){
 const E=core().S?.engine;if(!E)return;
 if(E.profile?.development)E.profile.development.followSimulation=true;
 try{E.pushProfile?.()}catch(_){}
}
async function startAudio(){
 const S=core().S;if(!S)throw Error('Sound subsystem is missing');
 await S.enable();ensureSoundFollow();return S.engine?.audioState||'RUNNING';
}
function setBenchControls(patch={}){
 Object.assign(rt.bench,patch);
 const {PT}=core();const st=PT?.states?.dyno;if(st?.command){
  Object.assign(st.command,{
   mode:'ENGINE',throttle:clamp(rt.bench.throttle,0,1),clutch:clamp(rt.bench.clutch,0,1),
   gear:clamp(rt.bench.gear|0,1,6),frontBrakeBar:Math.max(0,rt.bench.frontBar),
   rearBrakeBar:Math.max(0,rt.bench.rearBar),absEnabled:!!rt.bench.abs,tcEnabled:!!rt.bench.tc,
   brakeModel:'HYDRAULIC_FERIT450'
  });
 }
 updateBenchControls();
}
function startBenchRolling(speed=rt.bench.speedMps){
 const {A,V,PT}=core();if(!A||!V||!PT)throw Error('V5/powertrain bench dependencies are missing');
 rt.bench.speedMps=Math.max(0,+speed||0);
 A.setDomain?.('DYNO');
 V.rolling?.(rt.bench.speedMps);
 V.resume?.();
 setBenchControls({});
 rt.benchActive=true;
}
function stopBench(){
 const {V}=core();try{V?.pause?.()}catch(_){}
 rt.bench.throttle=0;rt.bench.frontBar=0;rt.bench.rearBar=0;setBenchControls({});
}
function enterBench(){
 const {A}=core();
 // Let V1.23 leave RIDE cleanly first.
 q('v123Nav')?.querySelector('button[data-v123-page="ENGINE"]')?.click();
 try{A?.setDomain?.('DYNO')}catch(_){}
 D.body.dataset.v123Page='BENCH';global.__LUCID_ACTIVE_PAGE__='BENCH';global.__LUCID_PERF_MODE__='LAB';
 setNav('BENCH');setTitle('FUNCTIONAL TEST BENCH','engine · clutch · drivetrain · brakes · sound · live proof');
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page==='BENCH'));
 rt.benchActive=true;startBenchRolling(rt.bench.speedMps);renderBench();
}
async function quickRide(session='ROLLING'){
 const {R,ride}=core();
 try{await startAudio()}catch(e){console.warn('V1.28.2 audio start failed; ride will continue muted',e)}
 if(R?.safeRide)R.safeRide(session);
 else{global.LUCID_MOTO_UI?.setPage?.('RIDE');ride?.applySession?.(session,true)}
 closeLauncher();
}
function openLauncher(){
 let e=q('v1282Launcher');if(e)e.classList.add('open');
}
function closeLauncher(){q('v1282Launcher')?.classList.remove('open')}

function captureInput(e){
 if(e.type==='keydown'&&e.repeat)return;
 rt.lastInput=`${e.type.replace('key','').toUpperCase()} ${e.code||e.key||'?'}`;rt.lastInputMs=performance.now();
 const el=q('v1282LastInput');if(el)el.textContent=rt.lastInput;
}
global.addEventListener('keydown',captureInput,true);global.addEventListener('keyup',captureInput,true);

function telemetry(){
 const st=core().PT?.states?.dyno,L=st?.last;
 return L||null;
}
function fmt(x,n=1){return Number.isFinite(+x)?(+x).toFixed(n):'—'}
function renderBench(){
 if(global.__LUCID_ACTIVE_PAGE__!=='BENCH')return;
 const L=telemetry(),E=core().S?.engine;
 const rows=q('v1282BenchTele');
 if(rows){
  const data=L?[
   ['ENGINE',`${fmt(L.engine?.rpm,0)} rpm · ${fmt(L.engine?.controlledCrankTorqueNm,1)} N·m · ${fmt(L.engine?.crankPowerHp,1)} hp`],
   ['THROTTLE / LIMITER',`${fmt((L.engine?.throttle||0)*100,0)}% · ${fmt((L.engine?.limiter??1)*100,0)}%`],
   ['CLUTCH',`${fmt((L.clutch?.engagement??0)*100,0)}% · ${fmt(L.clutch?.transmittedTorqueNm,1)} N·m · slip ${fmt(L.clutch?.slipRpm,0)} rpm`],
   ['GEAR / REAR WHEEL',`${L.gear||'—'} · ${fmt(L.drive?.rearWheelTorqueNm,1)} N·m · ${fmt(L.drive?.rearWheelPowerKw,1)} kW`],
   ['BRAKES',`${fmt(L.brakes?.appliedFrontBar,1)} / ${fmt(L.brakes?.appliedRearBar,1)} bar · ${fmt(L.brakes?.frontTorqueNm,0)} / ${fmt(L.brakes?.rearTorqueNm,0)} N·m`],
   ['WHEEL / SLIP',`${fmt(L.wheel?.speedMps,2)} m/s · F ${fmt(L.wheel?.slipF,3)} · R ${fmt(L.wheel?.slipR,3)}`],
   ['AUDIO',`${E?.audioState||'OFF'}${global.LUCID_RECOVERY?.runtime?.audioFallback?' · FALLBACK DSP':''}`],
   ['LAST INPUT',rt.lastInput]
  ]:[['POWERTRAIN','No completed dyno step yet. Press START BENCH.'],['AUDIO',E?.audioState||'OFF'],['LAST INPUT',rt.lastInput]];
  rows.innerHTML=data.map(r=>`<span>${r[0]}</span><b>${r[1]}</b>`).join('');
 }
 if(L){
  rt.bench.history.push({t:performance.now()/1000,rpm:+L.engine?.rpm||0,wheel:+L.drive?.rearWheelTorqueNm||0,crank:+L.engine?.controlledCrankTorqueNm||0});
  if(rt.bench.history.length>420)rt.bench.history.splice(0,rt.bench.history.length-420);
  drawBench();
 }
 const fs=q('v1282FunctionalResult');if(fs&&rt.bench.lastFunctional){
   const r=rt.bench.lastFunctional;fs.className='v1282Result '+(r.pass?'ok':'bad');
   fs.textContent=`${r.pass?'PASS':'FAIL'} · ${r.peakRpm.toFixed(0)} rpm · ${r.peakRearNm.toFixed(1)} N·m rear · ${r.peakHp.toFixed(1)} hp sweep · ${r.audioState}`;
 }
}
function drawBench(){
 const c=q('v1282BenchPlot');if(!c)return;const x=c.getContext('2d'),w=c.width,h=c.height,H=rt.bench.history;
 x.clearRect(0,0,w,h);x.fillStyle='#050b0f';x.fillRect(0,0,w,h);x.strokeStyle='#1b3039';
 for(let i=1;i<5;i++){x.beginPath();x.moveTo(0,h*i/5);x.lineTo(w,h*i/5);x.stroke()}
 if(H.length<2)return;const draw=(key,max,col)=>{x.strokeStyle=col;x.lineWidth=2;x.beginPath();H.forEach((v,i)=>{let px=i/(H.length-1)*w,py=h-8-clamp(v[key]/max,-1,1)*(h-22);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()};
 draw('rpm',11000,'#6fdcff');draw('wheel',600,'#ffc66c');
 x.fillStyle='#6fdcff';x.font='10px ui-monospace';x.fillText('RPM',8,14);x.fillStyle='#ffc66c';x.fillText('REAR TORQUE',48,14);
}
function updateBenchControls(){
 const pairs=[['v1282Thr',rt.bench.throttle*100],['v1282Clu',rt.bench.clutch*100],['v1282Gear',rt.bench.gear],['v1282FB',rt.bench.frontBar],['v1282RB',rt.bench.rearBar],['v1282Speed',rt.bench.speedMps]];
 pairs.forEach(([id,v])=>{const e=q(id);if(e&&D.activeElement!==e)e.value=String(v)});
 const labels=[['v1282ThrV',`${Math.round(rt.bench.throttle*100)}%`],['v1282CluV',`${Math.round(rt.bench.clutch*100)}%`],['v1282FBV',`${Math.round(rt.bench.frontBar)} bar`],['v1282RBV',`${Math.round(rt.bench.rearBar)} bar`],['v1282SpeedV',`${fmt(rt.bench.speedMps,1)} m/s`]];
 labels.forEach(([id,v])=>{const e=q(id);if(e)e.textContent=v});
 if(q('v1282ABS'))q('v1282ABS').checked=rt.bench.abs;if(q('v1282TC'))q('v1282TC').checked=rt.bench.tc;
}

async function functionalTest(){
 const {A,PT,S}=core();if(!A||!PT)throw Error('Powertrain unavailable');
 let audioState='OFF';try{audioState=await startAudio()}catch(e){audioState='AUDIO ERROR: '+e.message}
 A.setDomain?.('DYNO');const dyn=A.dyno,st=PT.states.dyno;
 const save={...st.command},histOn=global.__LUCID_ACTIVE_PAGE__;
 try{
   global.__LUCID_ACTIVE_PAGE__='BENCH';
   global.Ducati916PowertrainModel?.resetState?.(st);
   dyn.startRolling?.(18);
   Object.assign(st.command,{mode:'ENGINE',gear:3,clutch:0,throttle:0,frontBrakeBar:0,rearBrakeBar:0,absEnabled:false,tcEnabled:false,brakeModel:'HYDRAULIC_FERIT450'});
   for(let i=0;i<80;i++)dyn.step();
   Object.assign(st.command,{clutch:1,throttle:.82});
   let peakRpm=0,peakRearNm=0;
   for(let i=0;i<300;i++){dyn.step();let L=st.last;if(L){peakRpm=Math.max(peakRpm,+L.engine?.rpm||0);peakRearNm=Math.max(peakRearNm,+L.drive?.rearWheelTorqueNm||0)}}
   const sw=A.powerSweep?.({gear:3,throttle:1}),peakHp=sw?.peakPower?.powerHp||0;
   const pass=peakRpm>1800&&peakRearNm>120&&peakHp>110&&peakHp<118&&!String(audioState).startsWith('AUDIO ERROR');
   rt.bench.lastFunctional={pass,peakRpm,peakRearNm,peakHp,audioState};
 }finally{
   Object.assign(st.command,save);global.__LUCID_ACTIVE_PAGE__=histOn;
 }
 startBenchRolling(rt.bench.speedMps);setBenchControls({});
 renderBench();return rt.bench.lastFunctional;
}

function watchdogTick(){
 const {A}=core();const now=performance.now(),F=A?.free;if(!F)return;
 const t=+F.time||0;
 if(rt.watchdog.lastFreeTime===null||t!==rt.watchdog.lastFreeTime){rt.watchdog.lastFreeTime=t;rt.watchdog.lastAdvanceMs=now;rt.watchdog.stalled=false}
 if(global.__LUCID_ACTIVE_PAGE__==='RIDE'){
  const cmd=core().PT?.states?.free?.command;
  const expects=!!(cmd&&(+cmd.throttle>.12||+cmd.frontBrakeBar>1||+cmd.rearBrakeBar>1));
  if(expects&&now-rt.watchdog.lastAdvanceMs>900){
    rt.watchdog.stalled=true;
    const a=q('v124Alert');if(a){a.textContent='RUNTIME WATCHDOG · PHYSICS TIME IS NOT ADVANCING';a.classList.add('show')}
  }
 }
}
function buildBench(){
 const nav=q('v123Nav');if(nav&&!q('v1282BenchBtn')){
  const b=D.createElement('button');b.id='v1282BenchBtn';b.dataset.v123Page='BENCH';b.textContent='TEST BENCH';b.onclick=e=>{e.preventDefault();e.stopPropagation();enterBench()};nav.insertBefore(b,q('v1281SystemBtn')||null);
 }
 const dock=q('v125LabDock');if(dock&&!dock.querySelector('[data-v125-page="BENCH"]')){
  const p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='BENCH';p.innerHTML=`
   <div class="v125Head"><h2>FUNCTIONAL TEST BENCH</h2><p>A deliberately simple proving surface for the live V1.21 engine/clutch/drivetrain/brakes and V1.22 sound. Use this before Free Ride when checking a build.</p></div>
   <div class="v125Grid">
    <div class="v125Card"><h3>START / PROVE</h3>
     <div class="v1282Btns"><button id="v1282Start">START BENCH</button><button id="v1282StartAudio">START AUDIO</button><button id="v1282Func">RUN FUNCTIONAL TEST</button></div>
     <div id="v1282FunctionalResult" class="v1282Result">No functional test run yet.</div>
     <div class="v125Note">Functional test performs a short real crank/clutch/drivetrain run plus the historical power-map sweep. Audio must successfully start from this button gesture for a PASS.</div>
    </div>
    <div class="v125Card"><h3>QUICK STATES</h3>
     <div class="v1282Btns"><button data-v1282-preset="IDLE">IDLE / CLUTCH OPEN</button><button data-v1282-preset="LOAD">50% LOAD</button><button data-v1282-preset="FULL">FULL LOAD</button><button data-v1282-preset="COAST">CLOSED THROTTLE</button><button data-v1282-preset="STOP">STOP</button></div>
     <div class="v125Note">These controls drive the dyno domain only. They do not secretly modify the Free Ride setup.</div>
    </div>
    <div class="v125Card"><h3>ENGINE / DRIVETRAIN COMMAND</h3>
     <div class="v125Field"><span>throttle</span><input id="v1282Thr" type="range" min="0" max="100" step="1"><small id="v1282ThrV"></small></div>
     <div class="v125Field"><span>clutch engagement</span><input id="v1282Clu" type="range" min="0" max="100" step="1"><small id="v1282CluV"></small></div>
     <div class="v125Field"><span>gear</span><select id="v1282Gear">${[1,2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select><small></small></div>
     <div class="v125Field"><span>roller start speed</span><input id="v1282Speed" type="range" min="0" max="45" step=".5"><small id="v1282SpeedV"></small></div>
    </div>
    <div class="v125Card"><h3>BRAKE COMMAND</h3>
     <div class="v125Field"><span>front pressure</span><input id="v1282FB" type="range" min="0" max="100" step="1"><small id="v1282FBV"></small></div>
     <div class="v125Field"><span>rear pressure</span><input id="v1282RB" type="range" min="0" max="80" step="1"><small id="v1282RBV"></small></div>
     <div class="v125Field"><span>ABS research</span><input id="v1282ABS" type="checkbox"><small></small></div>
     <div class="v125Field"><span>TC research</span><input id="v1282TC" type="checkbox"><small></small></div>
    </div>
    <div class="v125Card full"><h3>LIVE POWER FLOW</h3><div id="v1282BenchTele" class="v125KV"></div></div>
    <div class="v125Card full"><h3>LIVE TRACE</h3><canvas id="v1282BenchPlot" class="v125Canvas" width="900" height="220"></canvas><div class="v125Note">Cyan = crank RPM normalized to 11,000 rpm. Amber = rear-wheel torque normalized to 600 N·m. This trace runs only while TEST BENCH is open.</div></div>
   </div>`;
  dock.appendChild(p);
 }
 q('v1282Start').onclick=()=>startBenchRolling(rt.bench.speedMps);
 q('v1282StartAudio').onclick=async()=>{try{await startAudio()}catch(e){alert('Audio could not start: '+e.message)}renderBench()};
 q('v1282Func').onclick=()=>functionalTest().catch(e=>{rt.bench.lastFunctional={pass:false,peakRpm:0,peakRearNm:0,peakHp:0,audioState:'ERROR '+e.message};renderBench()});
 q('v1282Thr').oninput=e=>setBenchControls({throttle:+e.target.value/100});
 q('v1282Clu').oninput=e=>setBenchControls({clutch:+e.target.value/100});
 q('v1282Gear').onchange=e=>setBenchControls({gear:+e.target.value});
 q('v1282FB').oninput=e=>setBenchControls({frontBar:+e.target.value});
 q('v1282RB').oninput=e=>setBenchControls({rearBar:+e.target.value});
 q('v1282ABS').onchange=e=>setBenchControls({abs:!!e.target.checked});
 q('v1282TC').onchange=e=>setBenchControls({tc:!!e.target.checked});
 q('v1282Speed').oninput=e=>{rt.bench.speedMps=+e.target.value;updateBenchControls()};
 D.querySelectorAll('[data-v1282-preset]').forEach(b=>b.onclick=()=>{
   const k=b.dataset.v1282Preset;
   if(k==='IDLE'){startBenchRolling(rt.bench.speedMps);setBenchControls({throttle:0,clutch:0,frontBar:0,rearBar:0})}
   if(k==='LOAD'){startBenchRolling(rt.bench.speedMps);setBenchControls({throttle:.5,clutch:1,frontBar:0,rearBar:0})}
   if(k==='FULL'){startBenchRolling(rt.bench.speedMps);setBenchControls({throttle:1,clutch:1,frontBar:0,rearBar:0})}
   if(k==='COAST'){startBenchRolling(rt.bench.speedMps);setBenchControls({throttle:0,clutch:1,frontBar:0,rearBar:0})}
   if(k==='STOP')stopBench();
 });
 updateBenchControls();
}
function buildLauncher(){
 if(q('v1282Launcher'))return;
 const e=D.createElement('div');e.id='v1282Launcher';e.className='open';e.innerHTML=`
  <div class="v1282LaunchCard">
   <div class="v1282Eyebrow">LUCID MOTO · V1.28.2 USABLE BASELINE</div>
   <h1>Start with something that proves it works.</h1>
   <p>This launcher starts audio from a real user gesture and gives you a known-good ride or an isolated functional bench. No development telemetry is required for Free Ride.</p>
   <div class="v1282LaunchBtns"><button id="v1282GoRide">START ROLLING RIDE + SOUND</button><button id="v1282GoStand">STANDING START + SOUND</button><button id="v1282GoBench">OPEN TEST BENCH + SOUND</button><button id="v1282GoMute">CONTINUE MUTED</button></div>
   <div class="v1282Keys"><b>RIDE:</b> W throttle · S front brake · Space rear brake · A/D steer · C clutch · Q/E gear · R reset · M audio · H help</div>
   <div class="v1282Core" id="v1282LaunchCore"></div>
  </div>`;
 D.body.appendChild(e);
 q('v1282GoRide').onclick=()=>quickRide('ROLLING');
 q('v1282GoStand').onclick=()=>quickRide('STANDING');
 q('v1282GoBench').onclick=async()=>{try{await startAudio()}catch(err){console.warn(err)}closeLauncher();enterBench()};
 q('v1282GoMute').onclick=closeLauncher;
 const c=q('v1282LaunchCore'),C=core();
 if(c)c.textContent=`CORE ${C.A&&C.PT&&C.ride?'READY':'NOT READY'} · ${C.S?'SOUND API READY':'SOUND API MISSING'} · SYSTEM ${C.R?.runSelfTest?.().pass?'PASS':'CHECK'}`;
}
function addStyle(){
 const s=D.createElement('style');s.textContent=`
 body.v123 #v123Brand strong:after{content:" · V1.28.2 USABLE BASELINE"!important;color:#8cf0b1;font-weight:600}
 body[data-v123-page="BENCH"] #app{grid-template-columns:minmax(0,1fr) min(760px,55vw);grid-template-rows:minmax(0,1fr)}
 body[data-v123-page="BENCH"] #v125LabDock{display:block}
 body[data-v123-page="BENCH"] #v123Right{display:none!important}
 .v1282Btns{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.v1282Btns button{background:#102832;border:1px solid #365866;color:#e0f1f5;padding:7px 9px;border-radius:4px;font:9px ui-monospace;cursor:pointer}
 .v1282Result{padding:7px;border:1px solid #29434e;border-radius:5px;color:#a6bec8;font:9px/1.4 ui-monospace}.v1282Result.ok{color:#7bedac;border-color:#357258}.v1282Result.bad{color:#ff8374;border-color:#8e4a45}
 #v1282Launcher{display:none;position:fixed;inset:0;z-index:2147483000;background:#020609e8;backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:20px}
 #v1282Launcher.open{display:flex}.v1282LaunchCard{width:min(780px,96vw);background:#071018;border:1px solid #416373;border-radius:14px;padding:24px;box-shadow:0 25px 80px #000c;color:#e8f4f7;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
 .v1282LaunchCard h1{margin:5px 0 8px;font-size:28px}.v1282LaunchCard p{color:#a7bec8;max-width:690px}.v1282Eyebrow{font:10px ui-monospace;color:#7bedac;letter-spacing:.12em}
 .v1282LaunchBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}.v1282LaunchBtns button{padding:12px;background:#102832;border:1px solid #416575;border-radius:7px;color:#e8f4f7;font-weight:650;cursor:pointer}.v1282LaunchBtns button:first-child{border-color:#5ba979;background:#123525}
 .v1282Keys,.v1282Core{font:10px/1.55 ui-monospace;color:#8faab5;border-top:1px solid #1d3540;padding-top:10px;margin-top:10px}.v1282Core{color:#72dca1}
 @media(max-width:720px){.v1282LaunchBtns{grid-template-columns:1fr}.v1282LaunchCard h1{font-size:22px}}
 `;D.head.appendChild(s);
}
function boot(){
 if(rt.installed)return;rt.installed=true;
 addStyle();
 const C=core();
 if(!C.A||!C.PT||!q('v125LabDock')){
  global.__LUCID_V1282_READY__=false;
  return;
 }
 buildBench();buildLauncher();
 setInterval(()=>{if(global.__LUCID_ACTIVE_PAGE__==='BENCH')renderBench();watchdogTick()},50);
 global.__LUCID_V1282_READY__=true;
}
if(D?.readyState==='loading')D.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);

global.LUCID_USABILITY={
 version:'V1.28.2',runtime:rt,enterBench,startBenchRolling,setBenchControls,functionalTest,startAudio,quickRide,openLauncher,
 snapshot:()=>({activePage:global.__LUCID_ACTIVE_PAGE__,bench:{...rt.bench,history:undefined},audio:core().S?.engine?.audioState||'OFF',lastInput:rt.lastInput,watchdog:{...rt.watchdog}})
};
})(typeof window!=='undefined'?window:globalThis);


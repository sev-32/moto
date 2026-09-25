

(function(global){
'use strict';
if(global.__LUCID_V1281_RECOVERY__)return;
global.__LUCID_V1281_RECOVERY__=true;

const D=global.document;
const q=id=>D?.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const deep=o=>JSON.parse(JSON.stringify(o));
const runtime={errors:[],selfTest:null,lastTestMs:0,audioFallback:false,audioFallbackReason:'',installed:false};

function recordError(kind,msg,stack){
 runtime.errors.push({t:Date.now(),kind,message:String(msg||''),stack:String(stack||'').slice(0,2200)});
 if(runtime.errors.length>20)runtime.errors.splice(0,runtime.errors.length-20);
 updateSystemNav();
}
global.addEventListener('error',e=>recordError('error',e.message,e.error?.stack||''));
global.addEventListener('unhandledrejection',e=>recordError('promise',e.reason?.message||e.reason,e.reason?.stack||''));

function crossing(a,b,t,cycle){
 a=((a%cycle)+cycle)%cycle;b=((b%cycle)+cycle)%cycle;t=((t%cycle)+cycle)%cycle;
 return b>=a?(t>a&&t<=b):(t>a||t<=b);
}
function seededNoise(st){
 let x=st.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;st.seed=x|0;return((x>>>0)/4294967295)*2-1;
}
function installFallbackAudio(E,reason){
 if(!E?.ctx)throw Error('Audio fallback requires AudioContext');
 const ctx=E.ctx;
 if(!ctx.createScriptProcessor)throw Error('AudioWorklet unavailable and ScriptProcessor fallback unsupported');
 try{E.node?.disconnect?.()}catch(_){}
 E.gains={};E.pans={};
 const proc=ctx.createScriptProcessor(1024,0,4);
 const split=ctx.createChannelSplitter(4),sum=ctx.createGain();
 proc.connect(split);
 const names=['exhaust','intake','mechanical','driveline'];
 names.forEach((name,idx)=>{let g=ctx.createGain(),p=ctx.createStereoPanner();split.connect(g,idx);g.connect(p);p.connect(sum);E.gains[name]=g;E.pans[name]=p});
 E.distanceLP=ctx.createBiquadFilter();E.distanceLP.type='lowpass';E.dryGain=ctx.createGain();E.wetGain=ctx.createGain();E.convolver=ctx.createConvolver();
 E.comp=ctx.createDynamicsCompressor();E.comp.threshold.value=-10;E.comp.knee.value=12;E.comp.ratio.value=5;E.comp.attack.value=.004;E.comp.release.value=.12;
 E.analyser=ctx.createAnalyser();E.analyser.fftSize=2048;E.analyser.smoothingTimeConstant=.68;E.freqData=new Float32Array(E.analyser.frequencyBinCount);E.timeData=new Float32Array(E.analyser.fftSize);
 E.master=ctx.createGain();
 sum.connect(E.distanceLP);E.distanceLP.connect(E.dryGain);E.dryGain.connect(E.comp);E.distanceLP.connect(E.convolver);E.convolver.connect(E.wetGain);E.wetGain.connect(E.comp);
 E.comp.connect(E.analyser);E.analyser.connect(E.master);E.master.connect(ctx.destination);
 try{E.mediaDest=ctx.createMediaStreamDestination();E.master.connect(E.mediaDest)}catch(_){E.mediaDest=null}
 try{E._buildImpulse?.(.50,1.2)}catch(_){}

 const st={phase:0,exEnv:[0,0],intEnv:[0,0],resA:0,resB:0,resC:0,mech:0,gear:0,chain:0,seed:0x1a2b3c4d,lastRpm:1300};
 proc.onaudioprocess=ev=>{
  const sr=ctx.sampleRate||44100,p=E.profile||{},eng=p.engine||{},ex=p.exhaust||{},inn=p.intake||{},mech=p.mechanical||{},S=E.lastState||{};
  const cycle=Math.max(180,+eng.cycleDeg||720),fires=(Array.isArray(eng.firingDeg)&&eng.firingDeg.length?eng.firingDeg:[0,270]).map(v=>((+v%cycle)+cycle)%cycle);
  const rpm=clamp(+S.rpm||1300,0,12000),thr=clamp(+S.throttle||0,0,1),load=Math.abs(+S.loadNm||0),wheel=Math.abs(+S.wheelRpmR||0),clSlip=Math.abs(+S.clutchSlipRpm||0);
  const cDef=Math.sqrt(1.33*287.05*Math.max(180,(+ex.gasTempC||450)+273.15)),tw=ex.thermalWaveSpeedMps||{},cA=+tw.headerA||cDef,cB=+tw.headerB||cDef,cC=+tw.collector||cDef;
  const hA=ex.headerA||{},hB=ex.headerB||{},col=ex.collector||{};
  const fA=clamp(cA/(4*Math.max(.18,+hA.lengthM||.88)),35,1500),fB=clamp(cB/(4*Math.max(.18,+hB.lengthM||1.25)),35,1500),fC=clamp(cC/(4*Math.max(.12,+col.lengthM||.31)),45,1800);
  const dps=rpm/60*360/sr,decay=Math.exp(-1/(sr*Math.max(.002,(+eng.combustionPulseMs||3.6)/1000*2.2))),iDecay=Math.exp(-1/(sr*.010));
  const amp=clamp(.16+.66*Math.pow(thr,.72)+.0035*load,0.12,1.15),lim=clamp(+S.limiter==null?1:+S.limiter,0,1);
  const out=[ev.outputBuffer.getChannelData(0),ev.outputBuffer.getChannelData(1),ev.outputBuffer.getChannelData(2),ev.outputBuffer.getChannelData(3)];
  for(let i=0;i<out[0].length;i++){
    let prev=st.phase;st.phase=(st.phase+dps)%cycle;
    for(let fi=0;fi<fires.length;fi++){
      if(crossing(prev,st.phase,fires[fi],cycle))st.exEnv[fi&1]+=amp*(fi&1?.90:1.0)*lim;
      let intake=(fires[fi]+(+eng.intakeOffsetDeg||cycle/2))%cycle;
      if(crossing(prev,st.phase,intake,cycle))st.intEnv[fi&1]+=.46*(.25+.75*thr);
    }
    st.exEnv[0]*=decay;st.exEnv[1]*=decay;st.intEnv[0]*=iDecay;st.intEnv[1]*=iDecay;
    st.resA+=2*Math.PI*fA/sr;st.resB+=2*Math.PI*fB/sr;st.resC+=2*Math.PI*fC/sr;
    st.mech+=2*Math.PI*(rpm/60)/sr;st.gear+=2*Math.PI*Math.max(20,(rpm/60)*(+mech.gearMeshOrder||18))/sr;st.chain+=2*Math.PI*Math.max(10,(wheel/60)*(+mech.rearSprocketTeeth||36))/sr;
    const n=seededNoise(st);
    const pulse=st.exEnv[0]+st.exEnv[1];
    let exSig=pulse*.34 + pulse*(Math.sin(st.resA)*.12+Math.sin(st.resB)*.10+Math.sin(st.resC)*.07) + n*pulse*.025;
    let inSig=(st.intEnv[0]+st.intEnv[1])*.24 + Math.sin(st.mech*2)*thr*.035;
    let mSig=Math.sin(st.mech*2)*(.025+.075*thr)+Math.sin(st.mech*4)*(.018+.035*thr)+n*(.012+.025*thr);
    let dSig=Math.sin(st.gear)*(.012+.035*thr)+Math.sin(st.chain)*(.010+.022*thr)+n*clamp(clSlip/2500,0,.08);
    out[0][i]=Math.tanh(exSig*1.35)*.52;out[1][i]=Math.tanh(inSig*1.6)*.42;out[2][i]=Math.tanh(mSig*1.8)*.34;out[3][i]=Math.tanh(dSig*2.0)*.30;
  }
  E.lastDSP={type:'dsp',fallback:true,rpm,headerAHz:fA,headerBHz:fB,collectorHz:fC,reason:runtime.audioFallbackReason};
 };
 E.fallbackProcessor=proc;E.fallbackSplitter=split;
 E.node={port:{postMessage:()=>{},onmessage:null},disconnect:()=>{try{proc.disconnect()}catch(_){}}};
 E.applyMix?.();if(ctx.state==='suspended')ctx.resume();
 E.enabled=true;E.started=true;E.audioState='RUNNING_FALLBACK';
 runtime.audioFallback=true;runtime.audioFallbackReason=String(reason?.message||reason||'AudioWorklet unavailable');
 try{E._loop?.()}catch(_){}
 updateSystemNav();
 return E.snapshot?.();
}
function patchAudio(){
 const E=global.DUCATI_SOUND_STUDIO?.engine;if(!E||E.__v1281Patched)return;
 E.__v1281Patched=true;const base=E.enable.bind(E);
 E.enable=async function(){
  if(this.enabled&&this.ctx){if(this.ctx.state==='suspended')await this.ctx.resume();return this.snapshot?.()}
  try{return await base()}
  catch(err){
   console.warn('LUCID recovery: AudioWorklet path failed; using compatibility DSP.',err);
   try{return installFallbackAudio(this,err)}
   catch(fb){this.audioState='ERROR';recordError('audio',fb.message,fb.stack);throw fb}
  }
 };
}

function checks(){
 const API=global.DUCATI_V5_API,PT=global.DUCATI_ADVANCED_POWERTRAIN,PM=global.Ducati916PowertrainModel;
 const arr=[];
 const add=(id,pass,detail)=>arr.push({id,pass:!!pass,detail:String(detail??'')});
 add('webgl2',!!global.__LAB_GL__,global.__LAB_GL__?'renderer context initialized':'renderer did not initialize');
 add('v5-api',!!API,API?.domain?.()||'missing');
 add('powertrain-api',!!PT,PT?.states?.free?'free-road state present':'missing');
 add('ride-layer',!!global.LUCID_MOTO_RIDE,global.__LUCID_V124_FREE_RIDE_STATUS__?.version||'not installed');
 add('sound-api',!!global.DUCATI_SOUND_STUDIO,global.DUCATI_SOUND_STUDIO?.engine?.audioState||'missing');
 add('thermal-v125',!!global.__LUCID_V125_READY__,global.LUCID_COMPONENT_ORCHESTRATOR?.version||'missing');
 add('brake-tire-v126',!!global.__LUCID_V126_READY__,global.LUCID_BRAKE_TIRE_FEEDBACK?.version||'missing');
 add('materials-v127',!!global.__LUCID_V127_READY__,global.LUCID_THERMAL_MATERIALS?.version||'missing');
 add('flow-v128',!!global.__LUCID_V128_READY__,global.LUCID_THERMOFLUID?.version||'missing');
 if(PM){
   let sw=PM.sweep({gear:3,throttle:1}),hp=sw?.peakPower?.powerHp||0;
   add('engine-sweep',hp>110&&hp<118,hp.toFixed(2)+' hp peak');
   let b=PM.brakeHydraulic100?.(),f=b?.frontNm||0,r=b?.rearNm||0;
   add('brake-model',f>3000&&r>450,`${f.toFixed(0)} / ${r.toFixed(0)} N·m @100bar`);
 }else{add('engine-sweep',false,'model missing');add('brake-model',false,'model missing')}
 if(API&&PT?.states){
   const key=API.domain?.()==='DYNO'?'dyno':'free';
   let L=PT.states[key]?.last||PT.states.free?.last||PT.states.dyno?.last;
   add('live-ledger',!!L, L?`${key.toUpperCase()} · ${(+L.engine?.rpm||0).toFixed(0)} rpm · ${(+L.drive?.rearWheelTorqueNm||0).toFixed(1)} N·m rear`:'no completed powertrain step');
 }
 return arr;
}
function runSelfTest(){
 const c=checks(),pass=c.every(x=>x.pass);
 runtime.selfTest={time:new Date().toISOString(),pass,checks:c,errorCount:runtime.errors.length};
 runtime.lastTestMs=performance.now();renderSystem();updateSystemNav();return deep(runtime.selfTest);
}

function enterSystem(){
 const base=q('v123Nav')?.querySelector('button[data-v123-page="DYNAMICS"]');
 if((global.__LUCID_ACTIVE_PAGE__||'RIDE')==='RIDE')base?.click();
 D.body.dataset.v123Page='SYSTEM';global.__LUCID_ACTIVE_PAGE__='SYSTEM';global.__LUCID_PERF_MODE__='LAB';
 q('v123Nav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page==='SYSTEM'));
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page==='SYSTEM'));
 const title=q('v123PageTitle');if(title){title.querySelector('strong').textContent='SYSTEM CHECK / RECOVERY';title.querySelector('span').textContent='runtime · controls · powertrain · audio · labs'}
 renderSystem();
}
function safeRide(session='ROLLING'){
 try{
  global.LUCID_MOTO_UI?.setPage?.('RIDE');
  global.LUCID_MOTO_RIDE?.applySession?.(session,true);
  const st=global.DUCATI_ADVANCED_POWERTRAIN?.states?.free;
  if(st?.command)Object.assign(st.command,{mode:'ENGINE',throttle:0,frontBrakeBar:0,rearBrakeBar:0,absEnabled:false,tcEnabled:false,brakeModel:'HYDRAULIC_FERIT450'});
  return true
 }catch(e){recordError('safe-ride',e.message,e.stack);return false}
}
async function audioTest(){
 const S=global.DUCATI_SOUND_STUDIO;if(!S)return false;
 try{await S.enable();renderSystem();return true}catch(e){recordError('audio-test',e.message,e.stack);renderSystem();return false}
}
function rows(items){return items.map(x=>`<div class="v1281Row ${x.pass?'ok':'bad'}"><b>${x.pass?'PASS':'FAIL'} · ${x.id}</b><span>${x.detail}</span></div>`).join('')}
function renderSystem(){
 const box=q('v1281Checks');if(!box)return;
 const c=checks();box.innerHTML=rows(c);
 const sum=q('v1281Summary'),pass=c.filter(x=>x.pass).length;if(sum)sum.textContent=`${pass}/${c.length} runtime checks passing · captured errors ${runtime.errors.length}`;
 const a=q('v1281AudioState');if(a){let E=global.DUCATI_SOUND_STUDIO?.engine;a.textContent=`${E?.audioState||'MISSING'}${runtime.audioFallback?' · COMPATIBILITY DSP':''}${runtime.audioFallbackReason?' · '+runtime.audioFallbackReason:''}`}
 const err=q('v1281Errors');if(err)err.innerHTML=runtime.errors.length?runtime.errors.slice(-6).reverse().map(e=>`<div class="v1281Err"><b>${e.kind}</b> ${e.message}<pre>${e.stack}</pre></div>`).join(''):'<div class="v1281Good">No captured runtime exceptions since recovery layer installed.</div>';
}
function updateSystemNav(){
 const b=q('v1281SystemBtn');if(!b)return;const bad=runtime.errors.length>0||checks().some(x=>!x.pass);
 b.textContent=bad?'SYSTEM !':'SYSTEM OK';b.classList.toggle('v1281Bad',bad);
}
function buildSystem(){
 const nav=q('v123Nav');if(nav&&!q('v1281SystemBtn')){
  let b=D.createElement('button');b.id='v1281SystemBtn';b.dataset.v123Page='SYSTEM';b.textContent='SYSTEM';b.onclick=e=>{e.preventDefault();e.stopPropagation();enterSystem()};nav.appendChild(b)
 }
 const dock=q('v125LabDock');if(dock&&!dock.querySelector('[data-v125-page="SYSTEM"]')){
  let p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='SYSTEM';p.innerHTML=`
   <div class="v125Head"><h2>RUNTIME RECOVERY / SYSTEM CHECK</h2><p>This page exists to prove that the renderer, V5 physics, V1.21 powertrain, Free Ride controls, audio, and development layers actually initialized. A syntax-clean file is not considered a usable build.</p></div>
   <div class="v125Grid">
    <div class="v125Card"><h3>CORE STATUS</h3><div id="v1281Summary"></div><div id="v1281Checks"></div><div class="v1281Btns"><button id="v1281RunTest">RUN SELF TEST</button><button id="v1281SafeRide">SAFE ROLLING RIDE</button><button id="v1281Standing">STANDING START</button></div></div>
    <div class="v125Card"><h3>AUDIO</h3><div id="v1281AudioState"></div><div class="v1281Btns"><button id="v1281Audio">START / TEST AUDIO</button></div><div class="v125Note">AudioWorklet remains the primary hyperreal path. If the browser/file context rejects it, V1.28.1 automatically installs a lighter procedural ScriptProcessor compatibility DSP so the bike is still audible and testable.</div></div>
    <div class="v125Card full"><h3>CAPTURED RUNTIME ERRORS</h3><div id="v1281Errors"></div></div>
    <div class="v125Card full"><h3>RECOVERY FIXES</h3><div class="v1281Good">V5 browser-global reference repaired · V1.24 DOM startup order repaired · V1.28 canvas initialization repaired · audio compatibility fallback added · system validation page added.</div></div>
   </div>`;
  dock.appendChild(p);
  q('v1281RunTest').onclick=runSelfTest;q('v1281SafeRide').onclick=()=>safeRide('ROLLING');q('v1281Standing').onclick=()=>safeRide('STANDING');q('v1281Audio').onclick=audioTest;
 }
}
function addStyle(){
 let s=D.createElement('style');s.textContent=`
 body.v123 #v123Brand strong:after{content:" · V1.28.1 RECOVERY"!important;color:#8cf0b1;font-weight:600}
 body[data-v123-page="SYSTEM"] #app{grid-template-columns:minmax(0,1fr) min(720px,54vw);grid-template-rows:minmax(0,1fr)}
 body[data-v123-page="SYSTEM"] #v125LabDock{display:block}
 body[data-v123-page="SYSTEM"] #v123Right{display:none!important}
 #v1281SystemBtn.v1281Bad{color:#ff8374!important;border-color:#8e4a45!important}
 .v1281Row{display:grid;grid-template-columns:180px 1fr;gap:10px;padding:5px 0;border-bottom:1px solid #18313a;font:9px ui-monospace}.v1281Row b{letter-spacing:.04em}.v1281Row.ok b{color:#7bedac}.v1281Row.bad b{color:#ff8374}.v1281Row span{color:#a2b9c3}
 .v1281Btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.v1281Btns button{background:#102832;border:1px solid #365866;color:#e0f1f5;padding:7px 9px;border-radius:4px;font:9px ui-monospace;cursor:pointer}
 .v1281Good{color:#83e9ac;font:9px/1.45 ui-monospace}.v1281Err{color:#ffc0b8;font:9px/1.35 ui-monospace;border-bottom:1px solid #3a2424;padding:5px 0}.v1281Err pre{white-space:pre-wrap;max-height:90px;overflow:auto;color:#8fa5ae}
 `;D.head.appendChild(s)
}

function showFatalCore(message){
 if(!D?.body)return;
 let old=q('v1281FatalCore');if(old)return;
 let box=D.createElement('div');box.id='v1281FatalCore';
 box.style.cssText='position:fixed;z-index:2147483647;inset:18px;max-width:760px;height:max-content;margin:auto;background:#100f12;color:#f4f1eb;border:1px solid #c65353;border-radius:12px;padding:22px 24px;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 18px 70px #000b';
 box.innerHTML='<div style="font-size:12px;letter-spacing:.12em;color:#ff7d74;margin-bottom:8px">SIMULATION CORE DID NOT START</div>'+
 '<div style="font-size:22px;font-weight:750;margin-bottom:10px">The UI shell loaded, but the motorcycle runtime did not.</div>'+
 '<div style="opacity:.9;margin-bottom:14px">'+String(message||'WebGL2 / V5 initialization failed.')+'</div>'+
 '<div style="opacity:.72">Check that WebGL2 and hardware acceleration are enabled in this browser. V1.28.1 shows this message instead of leaving a dead-looking simulator with non-functional controls.</div>';
 D.body.appendChild(box);
}

function boot(){
 if(runtime.installed)return;runtime.installed=true;
 patchAudio();addStyle();buildSystem();runSelfTest();global.__LUCID_V1281_READY__=true;
 const missing=!global.DUCATI_V5_API||!global.__VEHICLE_LAB_READY__;
 if(missing){
  const msg='V5/WebGL2 core did not initialize. The simulator cannot run until WebGL2 is available.';
  recordError('startup',msg,'');showFatalCore(msg);
 }
 setInterval(()=>{if(global.__LUCID_ACTIVE_PAGE__==='SYSTEM')renderSystem();updateSystemNav()},500);
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

global.LUCID_RECOVERY={
 version:'V1.28.1',runtime,checks,runSelfTest,safeRide,audioTest,
 snapshot:()=>deep({runtime,checks:checks(),activePage:global.__LUCID_ACTIVE_PAGE__})
};
})(typeof window!=='undefined'?window:globalThis);


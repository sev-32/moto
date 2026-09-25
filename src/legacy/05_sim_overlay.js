
(function(){
'use strict';
if(window.__DUCATI_SIM_OVERLAY_PATCH__) return;
window.__DUCATI_SIM_OVERLAY_PATCH__ = true;

const style = document.createElement('style');
style.textContent = `
#simOverlayCanvas{position:absolute;inset:0;pointer-events:none;z-index:12}
#simOverlayHUD{position:absolute;right:12px;bottom:12px;z-index:16;min-width:250px;max-width:320px;padding:8px 10px;background:#071018e8;border:1px solid #45606d;border-radius:6px;color:#d9edf5;font:10px/1.35 ui-monospace,Consolas,monospace;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.28)}
#simOverlayHUD .ttl{font-size:11px;font-weight:800;letter-spacing:.08em;color:#dff6ff;margin-bottom:4px}
#simOverlayHUD .mut{color:#89aab8}
#simOverlayHUD .sec{margin-top:5px;padding-top:5px;border-top:1px solid rgba(120,160,180,.22)}
#simOverlayHUD .row{display:grid;grid-template-columns:1fr auto;gap:8px;margin:2px 0}
#simOverlayHUD .v{color:#7ce7ff}
#simOverlayCtrl .buttons{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
#simOverlayCtrl .checks{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:11px}
#simOverlayCtrl label{display:flex;gap:6px;align-items:center;color:#d4e8f0}
#simOverlayCtrl .tiny{margin-top:6px;color:#8fb1bf}
`;
document.head.appendChild(style);

const viewPane = document.getElementById('view');
const ctrl = document.getElementById('ctrl');
const viewBtns = document.getElementById('viewBtns');
if(!viewPane || !ctrl || !viewBtns) return;

const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'simOverlayCanvas';
viewPane.appendChild(overlayCanvas);
const octx = overlayCanvas.getContext('2d');

const hud = document.createElement('div');
hud.id = 'simOverlayHUD';
hud.style.display = 'none';
viewPane.appendChild(hud);

const sec = document.createElement('div');
sec.className = 'sec';
sec.id = 'simOverlayCtrl';
sec.innerHTML = `
  <h3>SIMULATION OVERLAY / RIG VIEW</h3>
  <div class="buttons">
    <button type="button" data-rig-preset="OFF">Off</button>
    <button type="button" data-rig-preset="HYBRID">Hybrid</button>
    <button type="button" data-rig-preset="RIG">Rig</button>
    <button type="button" data-rig-preset="DRIVE">Drive</button>
    <button type="button" data-rig-preset="FULL">Full Sim</button>
  </div>
  <div class="checks">
    <label><input type="checkbox" id="rigEnabled" checked>Overlay enabled</label>
    <label><input type="checkbox" id="rigLabels" checked>Labels</label>
    <label><input type="checkbox" id="rigFrame" checked>Frame / chassis</label>
    <label><input type="checkbox" id="rigLimits" checked>Limits / bars</label>
    <label><input type="checkbox" id="rigSusp" checked>Suspension</label>
    <label><input type="checkbox" id="rigContact" checked>Wheel / contact</label>
    <label><input type="checkbox" id="rigDrive" checked>Drivetrain</label>
    <label><input type="checkbox" id="rigHardpoints" checked>Rider hardpoints</label>
  </div>
  <div class="tiny">Overlay is drawn from solver/kinematic state, not from mesh topology. The Rig preset hides the beauty chassis so the machine remains readable as a pure simulation skeleton.</div>
`;
ctrl.insertBefore(sec, ctrl.firstChild);

const rigBtn = document.createElement('button');
rigBtn.dataset.view = 'sim';
rigBtn.textContent = 'Rig';
viewBtns.appendChild(rigBtn);

const state = {
  enabled: true,
  labels: true,
  frame: true,
  susp: true,
  drive: true,
  contact: true,
  hardpoints: true,
  limits: true,
  preset: 'FULL'
};

const C = {
  frame: 'rgba(0,220,255,.92)',
  susp: 'rgba(90,255,190,.95)',
  drive: 'rgba(255,180,60,.98)',
  driveLoose: 'rgba(170,180,155,.9)',
  contact: 'rgba(104,220,255,.95)',
  hard: 'rgba(198,110,255,.95)',
  limit: 'rgba(255,110,110,.95)',
  text: 'rgba(235,245,250,.95)',
  ghost: 'rgba(255,255,255,.22)'
 };

 function chk(id){ return document.getElementById(id); }
 function syncUI(){
   chk('rigEnabled').checked = state.enabled;
   chk('rigLabels').checked = state.labels;
   chk('rigFrame').checked = state.frame;
   chk('rigSusp').checked = state.susp;
   chk('rigDrive').checked = state.drive;
   chk('rigContact').checked = state.contact;
   chk('rigHardpoints').checked = state.hardpoints;
   chk('rigLimits').checked = state.limits;
 }
 function readUI(){
   state.enabled = !!chk('rigEnabled').checked;
   state.labels = !!chk('rigLabels').checked;
   state.frame = !!chk('rigFrame').checked;
   state.susp = !!chk('rigSusp').checked;
   state.drive = !!chk('rigDrive').checked;
   state.contact = !!chk('rigContact').checked;
   state.hardpoints = !!chk('rigHardpoints').checked;
   state.limits = !!chk('rigLimits').checked;
 }
 ['rigEnabled','rigLabels','rigFrame','rigSusp','rigDrive','rigContact','rigHardpoints','rigLimits'].forEach(id=>chk(id).addEventListener('change',readUI));

 const PRESETS = {
   OFF: { enabled:false, labels:false, frame:false, susp:false, drive:false, contact:false, hardpoints:false, limits:false },
   HYBRID: { enabled:true, labels:true, frame:true, susp:true, drive:true, contact:true, hardpoints:false, limits:true, showChassis:true },
   RIG: { enabled:true, labels:true, frame:true, susp:true, drive:true, contact:true, hardpoints:true, limits:true, showChassis:false },
   DRIVE: { enabled:true, labels:true, frame:false, susp:false, drive:true, contact:true, hardpoints:false, limits:true, showChassis:true },
   FULL: { enabled:true, labels:true, frame:true, susp:true, drive:true, contact:true, hardpoints:true, limits:true, showChassis:true }
 };
 function setPreset(name){
   const p = PRESETS[name] || PRESETS.FULL;
   state.preset = name;
   Object.assign(state, p);
   if(typeof p.showChassis === 'boolean' && document.getElementById('showChassis')) document.getElementById('showChassis').checked = p.showChassis;
   syncUI();
 }
 sec.querySelectorAll('[data-rig-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.rigPreset)));
 syncUI();

 const oldView = view;
 view = function(name){
   if(name === 'sim'){
     currentView = 'sim';
     if(typeof v5ChaseInit !== 'undefined') v5ChaseInit = false;
     document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view === name));
     cam = { yaw:-.94, pitch:.24, dist:2.28, target:[0,.02,.46] };
     setPreset('RIG');
     return;
   }
   return oldView(name);
 };
 rigBtn.onclick = ()=>view('sim');

 function dpr(){ return Math.min(window.devicePixelRatio || 1, 2); }
 function fitCanvas(){
   const r = viewPane.getBoundingClientRect(), s = dpr();
   if(overlayCanvas.width !== Math.round(r.width*s) || overlayCanvas.height !== Math.round(r.height*s)){
     overlayCanvas.width = Math.round(r.width*s);
     overlayCanvas.height = Math.round(r.height*s);
     overlayCanvas.style.width = r.width + 'px';
     overlayCanvas.style.height = r.height + 'px';
   }
   octx.setTransform(s,0,0,s,0,0);
   octx.clearRect(0,0,r.width,r.height);
   return { w:r.width, h:r.height };
 }

 function add(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
 function sub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
 function mul(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
 function len(a){ return Math.hypot(a[0],a[1],a[2]); }
 function norm(a){ const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; }
 function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; }
 function basisFromMatrix(M){ return { right:norm([M[0],M[1],M[2]]), fwd:norm([M[4],M[5],M[6]]), up:norm([M[8],M[9],M[10]]) }; }
 function project(p,dim){
   const m = window.__VP__;
   if(!m || !p) return null;
   const x=p[0], y=p[1], z=p[2];
   const cx = m[0]*x + m[4]*y + m[8]*z + m[12];
   const cy = m[1]*x + m[5]*y + m[9]*z + m[13];
   const cw = m[3]*x + m[7]*y + m[11]*z + m[15];
   if(cw <= 0.02) return null;
   const nx = cx / cw, ny = cy / cw;
   return { x:(nx*.5+.5)*dim.w, y:(1-(ny*.5+.5))*dim.h, ndcX:nx, ndcY:ny, w:cw };
 }
 function line3(a,b,color,w,dim,dashed=false){
   const A=project(a,dim), B=project(b,dim); if(!A||!B) return;
   octx.save();
   octx.strokeStyle = color; octx.lineWidth = w || 2;
   if(dashed) octx.setLineDash([5,4]);
   octx.beginPath(); octx.moveTo(A.x,A.y); octx.lineTo(B.x,B.y); octx.stroke();
   octx.restore();
 }
 function poly3(pts,color,w,dim,dashed=false){ for(let i=1;i<pts.length;i++) line3(pts[i-1],pts[i],color,w,dim,dashed); }
 function dot3(p,color,r,dim){ const P=project(p,dim); if(!P) return; octx.save(); octx.fillStyle=color; octx.beginPath(); octx.arc(P.x,P.y,r||3,0,Math.PI*2); octx.fill(); octx.restore(); }
 function cross3(p,color,r,dim){ const P=project(p,dim); if(!P) return; octx.save(); octx.strokeStyle=color; octx.lineWidth=1.5; octx.beginPath(); octx.moveTo(P.x-r,P.y); octx.lineTo(P.x+r,P.y); octx.moveTo(P.x,P.y-r); octx.lineTo(P.x,P.y+r); octx.stroke(); octx.restore(); }
 function tag3(p,text,color,dim,ox=6,oy=-6){ if(!state.labels) return; const P=project(p,dim); if(!P) return; octx.save(); octx.font='10px ui-monospace,Consolas,monospace'; octx.fillStyle=color||C.text; octx.strokeStyle='rgba(3,10,14,.78)'; octx.lineWidth=3; octx.strokeText(text,P.x+ox,P.y+oy); octx.fillText(text,P.x+ox,P.y+oy); octx.restore(); }
 function capsule3(a,b,color,dim,w=3){ line3(a,b,color,w,dim,false); dot3(a,color,2.5,dim); dot3(b,color,2.5,dim); }

 function proxy(name){ return (v5Geom && v5Geom.collisionProxies || []).find(p=>p.name===name) || null; }
 function hardpointLocals(){
   const hl=proxy('handlebar_left')?.c || [-.37,.46,.27];
   const hr=proxy('handlebar_right')?.c || [.37,.46,.27];
   const seat=[0,-.14,.21];
   const pegL=[-.18,-.04,-.16];
   const pegR=[ .18,-.04,-.16];
   const hip=[0,-.10,.33];
   return { gripL:hl, gripR:hr, seat, pegL, pegR, hip };
 }

 function worldFromMatrix(M,p){ return tr(M,p); }

 function buildDyno(snap){
   const B = bodyX(), fs = frontState(), sw = swingState(), sk = shockState(), b = basisFromMatrix(B);
   const locals = hardpointLocals();
   const forkDir = norm(sub(fs.tar, tr(B, v5Geom?.sourceSteerPivotBody || v5Geom?.steerPivotBody || [0,.52,.48])));
   const steerPivot = tr(B, v5Geom?.sourceSteerPivotBody || v5Geom?.steerPivotBody || [0,.52,.48]);
   const rearPivot = sw.piv;
   const engine = tr(B,[0,.03,-.22]);
   const seat = tr(B,locals.seat);
   const gripL = tr(B,locals.gripL), gripR = tr(B,locals.gripR);
   const pegL = tr(B,locals.pegL), pegR = tr(B,locals.pegR), hip = tr(B,locals.hip);
   const chain = (typeof chainGeometry === 'function') ? chainGeometry() : null;
   const chainParam = window.DUCATI_CHAIN_PARAMETRIC && window.DUCATI_CHAIN_PARAMETRIC.inspect ? window.DUCATI_CHAIN_PARAMETRIC.inspect('dyno') : null;
   const k = window.__VISUAL_KINEMATICS__ || {};
   return {
     domain:'DYNO', B, basis:b, steerPivot, rearPivot,
     frontHub:fs.tar, rearHub:sw.tar, forkDir,
     shockTop:sk.p1, shockBottom:sk.q1, linkage:sk.linkageMount,
     engine, seat, gripL, gripR, pegL, pegR, hip,
     frontContact:[fs.tar[0],fs.tar[1],0], rearContact:[sw.tar[0],sw.tar[1],0],
     frontTireR:dyn.S?.rF || .300, rearTireR:dyn.S?.rR || .311,
     chain, chainParam,
     values:{
       steerDeg:snap?.steering?.angleDeg ?? 0,
       steerLimitDeg:dyn.S?.steerLimitDeg ?? 35,
       frontTravelM:snap?.suspension?.frontTravelM ?? 0,
       frontTravelMaxM:dyn.S?.travelF ?? .127,
       rearTravelM:snap?.suspension?.rearTravelM ?? 0,
       rearTravelMaxM:dyn.S?.travelR ?? .130,
       shockStrokeM:k.shockStrokeM ?? 0,
       shockStrokeMaxM:(dyn.S?.travelR ?? .130)/Math.max(1,dyn.S?.motionRatio || 1.83),
       loadedRun:chainParam?.load?.loadedRun || chain?.tightRun || 'none',
       topTensionN:chainParam?.load?.topTensionN || 0,
       bottomTensionN:chainParam?.load?.bottomTensionN || 0,
       topWaveM:chainParam?.wave?.top?.amplitudeM || 0,
       bottomWaveM:chainParam?.wave?.bottom?.amplitudeM || 0,
       forkSlideM:k.forkSlideM ?? fs.slide,
       swingAngleDeg:Math.atan2(sw.tar[2]-sw.piv[2],-(sw.tar[1]-sw.piv[1]))*180/Math.PI
     }
   };
 }

 function buildFree(snap){
   const V = v5JointVisuals(), B = V.B, b = basisFromMatrix(B), locals = hardpointLocals();
   const steerPivot = tr(B, v5Geom?.sourceSteerPivotBody || v5Geom?.steerPivotBody || [0,.52,.48]);
   const rearPivot = tr(B, v5Geom?.sourceRearPivotBody || v5Geom?.rearPivotBody || [0,-.36,.24]);
   const frontHub = V.FK.hubW, rearHub = V.RK.hubW;
   const forkDir = norm(sub(frontHub, steerPivot));
   const engine = tr(B,[0,.03,-.22]);
   const seat = tr(B,locals.seat);
   const gripL = tr(B,locals.gripL), gripR = tr(B,locals.gripR);
   const pegL = tr(B,locals.pegL), pegR = tr(B,locals.pegR), hip = tr(B,locals.hip);
   const chain = (typeof v57FreeChainGeometry === 'function') ? v57FreeChainGeometry(V) : null;
   const chainParam = window.DUCATI_CHAIN_PARAMETRIC && window.DUCATI_CHAIN_PARAMETRIC.inspect ? window.DUCATI_CHAIN_PARAMETRIC.inspect('free') : null;
   const frontContact = free.tf?.contactPoint || [frontHub[0],frontHub[1],0];
   const rearContact = free.tr?.contactPoint || [rearHub[0],rearHub[1],0];
   return {
     domain:'FREE_ROAD', B, basis:b, steerPivot, rearPivot, frontHub, rearHub, forkDir,
     shockTop:V.sh.topWorld, shockBottom:V.sh.bottomWorld, linkage:V.sh.bottomWorld,
     engine, seat, gripL, gripR, pegL, pegR, hip,
     frontContact, rearContact,
     frontTireR:free.S?.rF || .300, rearTireR:free.S?.rR || .311,
     chain, chainParam,
     values:{
       steerDeg:(free.steer||0)*180/Math.PI,
       steerLimitDeg:free.S?.steerLimitDeg ?? 35,
       frontTravelM:free.forkTravel ?? 0,
       frontTravelMaxM:free.S?.travelF ?? .127,
       rearTravelM:Math.max(0, Math.abs(free.rearAngle||0) * Math.hypot(rearHub[1]-rearPivot[1], rearHub[2]-rearPivot[2])),
       rearTravelMaxM:free.S?.travelR ?? .130,
       shockStrokeM:Math.max(0,(v5Geom?.shockRestLengthM||0) - (V.sh.lengthM||0)),
       shockStrokeMaxM:.065,
       loadedRun:chainParam?.load?.loadedRun || chain?.tightRun || 'none',
       topTensionN:chainParam?.load?.topTensionN || 0,
       bottomTensionN:chainParam?.load?.bottomTensionN || 0,
       topWaveM:chainParam?.wave?.top?.amplitudeM || 0,
       bottomWaveM:chainParam?.wave?.bottom?.amplitudeM || 0,
       forkSlideM:free.forkTravel ?? 0,
       swingAngleDeg:(free.rearAngle||0)*180/Math.PI
     }
   };
 }

 function getRig(){
   const domain = window.DUCATI_V5_API?.domain?.() || 'DYNO';
   const snap = window.DUCATI_V5_API?.snapshot?.() || {};
   try{ return domain === 'FREE_ROAD' ? buildFree(snap) : buildDyno(snap); }
   catch(err){ console.warn('sim overlay build failed', err); return null; }
 }

 function frameShape(r){
   return [r.steerPivot, r.engine, r.rearPivot, r.seat];
 }
 function wheelAxisEnds(hub,right,w=.13){ return [add(hub,mul(right,-w)), add(hub,mul(right,w))]; }
 function forkTubeEnds(r,side){
   const off = mul(r.basis.right, side*.09);
   return [ add(r.steerPivot, off), add(r.frontHub, off) ];
 }
 function swingarmEnds(r,side){ const off = mul(r.basis.right, side*.07); return [add(r.rearPivot,off), add(r.rearHub,off)]; }
 function steerLimitPts(r){
   const limit = (r.values.steerLimitDeg||35) * Math.PI/180, base = r.basis.fwd, up = r.basis.up, right = r.basis.right;
   const dirL = norm(add(mul(base,Math.cos(limit)*.26), mul(right,Math.sin(limit)*.26)));
   const dirR = norm(add(mul(base,Math.cos(-limit)*.26), mul(right,Math.sin(-limit)*.26)));
   return [ add(r.steerPivot, mul(dirL,.32)), add(r.steerPivot, mul(dirR,.32)) ];
 }
 function drawTravelBar(x,y,w,h,val,max,label,color){
   const t = Math.max(0,Math.min(1, max>1e-6 ? val/max : 0));
   octx.save();
   octx.fillStyle = 'rgba(8,18,24,.80)'; octx.strokeStyle='rgba(100,140,160,.45)'; octx.lineWidth=1;
   octx.fillRect(x,y,w,h); octx.strokeRect(x,y,w,h);
   octx.fillStyle = color; octx.fillRect(x+1,y+1,(w-2)*t,h-2);
   octx.fillStyle = C.text; octx.font='10px ui-monospace,Consolas,monospace'; octx.fillText(label, x, y-4); octx.fillText((val*1000).toFixed(0)+' / '+(max*1000).toFixed(0)+' mm', x+w+8, y+h-1);
   octx.restore();
 }
 function drawChain(r,dim){
   const g = r.chain; if(!g || !g.links || g.links.length<2) return;
   for(let i=1;i<g.links.length;i++){
     const prev=g.links[i-1], cur=g.links[i], run=(g.runs && g.runs[i-1]) || 'wrap';
     const loaded = r.values.loadedRun !== 'none' && run === r.values.loadedRun;
     line3(prev,cur, loaded ? C.drive : C.driveLoose, loaded ? 2.6 : 1.6, dim, false);
   }
   line3(g.links[g.links.length-1], g.links[0], r.values.loadedRun!=='none' && (g.runs&&g.runs[g.runs.length-1])===r.values.loadedRun ? C.drive : C.driveLoose, 1.6, dim, false);
   if(g.c1) { cross3(g.c1,C.drive,5,dim); tag3(g.c1,'countershaft',C.drive,dim,8,-8); }
   if(g.c2) { cross3(g.c2,C.drive,5,dim); tag3(g.c2,'rear sprocket',C.drive,dim,8,-8); }
 }
 function drawRig(r,dim){
   // frame
   if(state.frame){
     poly3(frameShape(r), C.frame, 3, dim, false);
     capsule3(r.steerPivot, r.engine, C.frame, dim, 2.5);
     capsule3(r.engine, r.rearPivot, C.frame, dim, 2.5);
     capsule3(r.rearPivot, r.seat, C.frame, dim, 2.5);
     tag3(r.steerPivot,'steer pivot',C.frame,dim);
     tag3(r.rearPivot,'swing pivot',C.frame,dim);
     tag3(r.engine,'engine ref',C.frame,dim);
   }
   // suspension
   if(state.susp){
     const [f1a,f1b]=forkTubeEnds(r,-1), [f2a,f2b]=forkTubeEnds(r,1), [s1a,s1b]=swingarmEnds(r,-1), [s2a,s2b]=swingarmEnds(r,1);
     capsule3(f1a,f1b,C.susp,dim,2.4); capsule3(f2a,f2b,C.susp,dim,2.4);
     line3(f1b,f2b,C.susp,2,dim,false); line3(f1a,f2a,C.susp,2,dim,false);
     capsule3(s1a,s1b,C.susp,dim,2.4); capsule3(s2a,s2b,C.susp,dim,2.4);
     line3(r.shockTop,r.shockBottom,C.susp,3,dim,false);
     if(r.linkage) line3(r.shockBottom,r.linkage,'rgba(255,205,90,.85)',2,dim,false);
     tag3(r.shockTop,'shock top',C.susp,dim); tag3(r.shockBottom,'shock bottom',C.susp,dim);
     const lim = steerLimitPts(r); line3(r.steerPivot, lim[0], C.limit, 1.6, dim, true); line3(r.steerPivot, lim[1], C.limit, 1.6, dim, true);
   }
   // wheel/contact
   if(state.contact){
     const [fa,fb]=wheelAxisEnds(r.frontHub, r.basis.right,.14); const [ra,rb]=wheelAxisEnds(r.rearHub, r.basis.right,.16);
     line3(fa,fb,C.contact,2.2,dim,false); line3(ra,rb,C.contact,2.2,dim,false);
     cross3(r.frontHub,C.contact,6,dim); cross3(r.rearHub,C.contact,6,dim);
     line3(r.frontHub,r.frontContact,C.contact,1.5,dim,true); line3(r.rearHub,r.rearContact,C.contact,1.5,dim,true);
     cross3(r.frontContact,C.contact,4,dim); cross3(r.rearContact,C.contact,4,dim);
     tag3(r.frontHub,'front axle',C.contact,dim); tag3(r.rearHub,'rear axle',C.contact,dim);
     tag3(r.frontContact,'contact F',C.contact,dim); tag3(r.rearContact,'contact R',C.contact,dim);
   }
   // drivetrain
   if(state.drive) drawChain(r,dim);
   // hardpoints
   if(state.hardpoints){
     [ ['grip L',r.gripL], ['grip R',r.gripR], ['peg L',r.pegL], ['peg R',r.pegR], ['seat',r.seat], ['hip ref',r.hip] ].forEach(([nm,p])=>{ dot3(p,C.hard,4,dim); tag3(p,nm,C.hard,dim,8,-8); });
     line3(r.gripL,r.gripR,C.hard,1.6,dim,false);
     line3(r.pegL,r.pegR,C.hard,1.3,dim,false);
     line3(r.seat,r.hip,C.hard,1.3,dim,true);
   }
   if(state.limits){
     drawTravelBar(14, 14, 100, 10, r.values.frontTravelM||0, r.values.frontTravelMaxM||1, 'Fork travel', 'rgba(72,255,202,.92)');
     drawTravelBar(14, 40, 100, 10, r.values.rearTravelM||0, r.values.rearTravelMaxM||1, 'Rear travel', 'rgba(0,210,255,.92)');
     drawTravelBar(14, 66, 100, 10, Math.abs(r.values.shockStrokeM||0), r.values.shockStrokeMaxM||.065, 'Shock stroke', 'rgba(255,188,78,.92)');
     octx.save(); octx.fillStyle=C.text; octx.font='10px ui-monospace,Consolas,monospace';
     octx.fillText('Steer: '+(r.values.steerDeg||0).toFixed(1)+'° / ±'+(r.values.steerLimitDeg||0).toFixed(0)+'°', 14, 96);
     octx.fillText('Swingarm: '+(r.values.swingAngleDeg||0).toFixed(1)+'°', 14, 110);
     octx.restore();
   }
 }

 function updateHUD(r){ return updateHUD2(r); }

 // safer HUD generation for display flags
 function updateHUD2(r){
   hud.style.display = state.enabled ? 'block' : 'none';
   if(!state.enabled || !r){ hud.innerHTML=''; return; }
   const v=r.values, flags=[]; if(state.frame)flags.push('FRAME'); if(state.susp)flags.push('SUSP'); if(state.drive)flags.push('DRIVE'); if(state.contact)flags.push('CONTACT'); if(state.hardpoints)flags.push('HARDPOINTS'); if(state.limits)flags.push('LIMITS');
   hud.innerHTML = `
     <div class="ttl">SIMULATION OVERLAY · ${r.domain}</div>
     <div class="mut">Authoritative rig view from kinematic/simulation state</div>
     <div class="sec">
       <div class="row"><span>Steer</span><span class="v">${(v.steerDeg||0).toFixed(2)}°</span></div>
       <div class="row"><span>Fork travel</span><span class="v">${((v.frontTravelM||0)*1000).toFixed(1)} mm</span></div>
       <div class="row"><span>Rear travel</span><span class="v">${((v.rearTravelM||0)*1000).toFixed(1)} mm</span></div>
       <div class="row"><span>Shock stroke</span><span class="v">${((v.shockStrokeM||0)*1000).toFixed(1)} mm</span></div>
     </div>
     <div class="sec">
       <div class="row"><span>Loaded run</span><span class="v">${(v.loadedRun||'none').toUpperCase()}</span></div>
       <div class="row"><span>Top tension</span><span class="v">${((v.topTensionN||0)/1000).toFixed(2)} kN</span></div>
       <div class="row"><span>Bottom tension</span><span class="v">${((v.bottomTensionN||0)/1000).toFixed(2)} kN</span></div>
       <div class="row"><span>Top wave</span><span class="v">${((v.topWaveM||0)*1000).toFixed(2)} mm</span></div>
       <div class="row"><span>Bottom wave</span><span class="v">${((v.bottomWaveM||0)*1000).toFixed(2)} mm</span></div>
     </div>
     <div class="sec">
       <div class="row"><span>Preset</span><span class="v">${state.preset}</span></div>
       <div class="row"><span>Display</span><span class="v">${flags.join(' · ')}</span></div>
     </div>`;
 }

 const oldRender = render;
 render = function(){
   oldRender();
   const dim = fitCanvas();
   if(!state.enabled){ hud.style.display='none'; return; }
   const rig = getRig();
   if(!rig){ hud.style.display='none'; return; }
   drawRig(rig, dim);
   updateHUD2(rig);
   window.__SIM_OVERLAY_LAST__ = { domain:rig.domain, values:rig.values, preset:state.preset };
 };

 setPreset('FULL');
 console.log('Ducati sim overlay patch ready');
})();



(function(global,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global)global.DucatiChainParametricV2=api;
  if(global&&global.document)api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const DEFAULTS={
  schema:'ducati916.chain-parametric-impact.v2',
  baseTensionN:320,
  minimumTensionN:85,
  slackDecayM:.010,
  linearDensityKgM:.82,
  dampingRatio:.065,
  impactGain:2.2,
  lengthAccelGain:.35,
  maxImpactAccelMps2:120,
  maxWaveM:.028,
  modes:2,
  animateLinks:false
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const clone=v=>JSON.parse(JSON.stringify(v));
function baseGeometry(dy,dz,r1,r2,pitch=.015875,nLinksHint=null){
  const D=Math.hypot(dy,dz)||1,th=Math.atan2(dz,dy),dr=r2-r1,phi=Math.asin(clamp(dr/D,-.999,.999)),Tl=Math.sqrt(Math.max(1e-9,D*D-dr*dr));
  const n1=th+Math.PI/2+phi,n2=th-Math.PI/2-phi,A0=[Math.cos(n1)*r1,Math.sin(n1)*r1],A1=[dy+Math.cos(n1)*r2,dz+Math.sin(n1)*r2],B0=[dy+Math.cos(n2)*r2,dz+Math.sin(n2)*r2],B1=[Math.cos(n2)*r1,dz+0];
  B1[1]=Math.sin(n2)*r1;
  const wrap2=Math.PI+2*phi,wrap1=Math.PI-2*phi,Ltaut=2*Tl+r1*wrap1+r2*wrap2;
  let nLinks=nLinksHint;
  if(!nLinks){nLinks=Math.max(80,2*Math.round((Ltaut+pitch*.55)/(2*pitch)));if(nLinks*pitch<Ltaut)nLinks+=2;}
  const chainLengthM=nLinks*pitch,surplusM=Math.max(0,chainLengthM-Ltaut),stretchM=Math.max(0,Ltaut-chainLengthM),zA=(A0[1]+A1[1])*.5,zB=(B0[1]+B1[1])*.5,runA=zA>=zB?'top':'bottom',runB=runA==='top'?'bottom':'top';
  return{D,th,phi,Tl,n1,n2,A0,A1,B0,B1,wrap1,wrap2,Ltaut,nLinks,chainLengthM,surplusM,stretchM,runA,runB,r1,r2,dy,dz,pitchM:pitch};
}
function loadState(driveTorqueNm,rearRadiusM,surplusM,cfg=DEFAULTS){
  const signedDelta=(+driveTorqueNm||0)/Math.max(.01,+rearRadiusM||.01),deltaTensionN=Math.abs(signedDelta),base=Math.max(cfg.minimumTensionN,cfg.baseTensionN*Math.exp(-Math.max(0,surplusM)/Math.max(.001,cfg.slackDecayM)));
  const topTensionN=base+Math.max(0,signedDelta),bottomTensionN=base+Math.max(0,-signedDelta),loadedRun=Math.abs(driveTorqueNm||0)>.1?(signedDelta>=0?'top':'bottom'):'none';
  return{driveTorqueNm:+driveTorqueNm||0,signedDeltaTensionN:signedDelta,deltaTensionN,baseTensionN:base,topTensionN,bottomTensionN,loadedRun};
}
function blankSpan(){return{q:[0,0],qd:[0,0],amplitudeM:0,f1Hz:0,f2Hz:0,tensionN:0,sagM:0};}
function blankState(){return{initialized:false,lastTimeS:null,lastRearZ:null,lastRearVz:0,lastLengthM:null,lastLengthVel:0,impactAccelMps2:0,pathAccelMps2:0,top:blankSpan(),bottom:blankSpan(),last:null};}
class ParametricChainModel{
  constructor(config={}){this.config={...DEFAULTS,...config};this.states={};this.fixedLinks={};}
  reset(key=null){if(key==null){this.states={};this.fixedLinks={};}else delete this.states[key];}
  _state(key){return this.states[key]||(this.states[key]=blankState());}
  advance(key,{timeS,rearZ,driveTorqueNm,r1,r2,dy,dz}){
    const cfg=this.config,st=this._state(key),hint=this.fixedLinks[key]||null,g=baseGeometry(dy,dz,r1,r2,.015875,hint);this.fixedLinks[key]=g.nLinks;
    const load=loadState(driveTorqueNm,r2,g.surplusM,cfg),time=Number.isFinite(+timeS)?+timeS:0,z=Number.isFinite(+rearZ)?+rearZ:g.dz;
    if(!st.initialized||st.lastTimeS==null||time<=st.lastTimeS){st.initialized=true;st.lastTimeS=time;st.lastRearZ=z;st.lastRearVz=0;st.lastLengthM=g.Ltaut;st.lastLengthVel=0;st.impactAccelMps2=0;st.pathAccelMps2=0;st.top=blankSpan();st.bottom=blankSpan();}
    let dt=time-st.lastTimeS;if(dt>0){dt=Math.min(dt,.05);const rearVz=(z-st.lastRearZ)/dt,impact=clamp((rearVz-st.lastRearVz)/dt,-cfg.maxImpactAccelMps2,cfg.maxImpactAccelMps2),Lv=(g.Ltaut-st.lastLengthM)/dt,Lacc=clamp((Lv-st.lastLengthVel)/dt,-cfg.maxImpactAccelMps2,cfg.maxImpactAccelMps2);st.impactAccelMps2=impact;st.pathAccelMps2=Lacc;
      for(const run of ['top','bottom']){const span=st[run],T=Math.max(cfg.minimumTensionN,load[run+'TensionN']),L=Math.max(.05,g.Tl),c=Math.sqrt(T/cfg.linearDensityKgM),f1=c/(2*L),geomSag=Math.sqrt(Math.max(0,3*L*g.surplusM/8)),sag=geomSag*clamp(Math.sqrt(Math.max(cfg.minimumTensionN,load.baseTensionN)/T),.12,1.35);span.tensionN=T;span.sagM=sag;span.f1Hz=f1;span.f2Hz=2*f1;
        const targetH=Math.min(dt,1/Math.max(240,span.f2Hz*26)),steps=Math.max(1,Math.ceil(dt/targetH)),h=dt/steps,forcing=-(impact+cfg.lengthAccelGain*Lacc)*cfg.impactGain;
        for(let ss=0;ss<steps;ss++)for(let m=0;m<cfg.modes;m++){const n=m+1,w=2*Math.PI*n*f1,zeta=cfg.dampingRatio,participation=2/(n*Math.PI),q=span.q[m]||0,qd=span.qd[m]||0,qdd=forcing*participation-2*zeta*w*qd-w*w*q;let v=qd+qdd*h,qq=q+v*h;const lim=cfg.maxWaveM/(n*n);if(Math.abs(qq)>lim){qq=clamp(qq,-lim,lim);v*=.35;}span.q[m]=qq;span.qd[m]=v;}
        span.amplitudeM=Math.min(cfg.maxWaveM,span.q.reduce((a,x)=>a+Math.abs(x),0));
      }
      st.lastTimeS=time;st.lastRearZ=z;st.lastRearVz=rearVz;st.lastLengthM=g.Ltaut;st.lastLengthVel=Lv;
    } else {
      for(const run of ['top','bottom']){const span=st[run],T=Math.max(cfg.minimumTensionN,load[run+'TensionN']),L=Math.max(.05,g.Tl),c=Math.sqrt(T/cfg.linearDensityKgM),geomSag=Math.sqrt(Math.max(0,3*L*g.surplusM/8));span.tensionN=T;span.sagM=geomSag*clamp(Math.sqrt(Math.max(cfg.minimumTensionN,load.baseTensionN)/T),.12,1.35);span.f1Hz=c/(2*L);span.f2Hz=2*span.f1Hz;}
    }
    st.last={schema:cfg.schema,key,timeS:time,geometry:{spanLengthM:g.Tl,tautLengthM:g.Ltaut,chainLengthM:g.chainLengthM,surplusM:g.surplusM,nLinks:g.nLinks,pitchM:g.pitchM},load,wave:{impactAccelMps2:st.impactAccelMps2,pathAccelMps2:st.pathAccelMps2,top:clone(st.top),bottom:clone(st.bottom)},animation:{enabled:!!cfg.animateLinks}};
    return{geometry:g,parametric:st.last};
  }
  waveAt(key,run,t){const st=this._state(key)[run];if(!st)return 0;return(st.q[0]||0)*Math.sin(Math.PI*t)+(st.q[1]||0)*Math.sin(2*Math.PI*t);}
  inspect(key){return clone(this._state(key).last);}
}
function install(global){
  const model=new ParametricChainModel(global.__DUCATI_CHAIN_PARAMETRIC_CONFIG__||{});global.DUCATI_CHAIN_PARAMETRIC=model;global.__DUCATI_CHAIN_PARAMETRIC_READY__=true;
  function path2D(dy,dz,r1,r2,drive,phase,key,timeS,rearZ){const res=model.advance(key,{timeS,rearZ,driveTorqueNm:drive,r1,r2,dy,dz}),g=res.geometry,pm=res.parametric,A0=g.A0,A1=g.A1,B0=g.B0,B1=g.B1,runA=g.runA,runB=g.runB,segs=[{run:runA,t:'L',p0:A0,p1:A1,len:g.Tl,sag:pm.wave[runA].sagM},{run:'wrap',t:'C',c:[dy,dz],r:r2,a0:g.n1,a1:g.n1-g.wrap2,len:r2*g.wrap2},{run:runB,t:'L',p0:B0,p1:B1,len:g.Tl,sag:pm.wave[runB].sagM},{run:'wrap',t:'C',c:[0,0],r:r1,a0:g.n2,a1:g.n2-g.wrap1,len:r1*g.wrap1}],total=segs.reduce((a,q)=>a+q.len,0),links=[],runs=[];phase=model.config.animateLinks?(((phase%total)+total)%total):0;for(let i=0;i<g.nLinks;i++){let ss=(phase+i*g.pitchM)%total,k=0;while(k<segs.length-1&&ss>segs[k].len){ss-=segs[k].len;k++;}let q=segs[k],y,z;if(q.t==='L'){let t=clamp(ss/q.len,0,1);y=q.p0[0]+(q.p1[0]-q.p0[0])*t;z=q.p0[1]+(q.p1[1]-q.p0[1])*t-q.sag*4*t*(1-t)+model.waveAt(key,q.run,t);}else{let a=q.a0+(q.a1-q.a0)*clamp(ss/q.len,0,1);y=q.c[0]+Math.cos(a)*q.r;z=q.c[1]+Math.sin(a)*q.r;}links.push([y,z]);runs.push(q.run);}return{links,runs,nLinks:g.nLinks,pitchM:g.pitchM,tautLengthM:g.Ltaut,chainLengthM:g.chainLengthM,surplusM:g.surplusM,stretchM:g.stretchM,tightRun:pm.load.loadedRun,c1:[0,0],c2:[dy,dz],r1,r2,parametric:pm};}
  function hud(g,mode){let el=document.getElementById('v57ChainHUD');if(!el){el=document.createElement('div');el.id='v57ChainHUD';el.style.cssText='position:absolute;left:12px;bottom:12px;z-index:15;padding:6px 8px;background:#071018e8;border:1px solid #45606d;border-radius:5px;color:#d8edf5;font:10px/1.25 ui-monospace,Consolas,monospace;pointer-events:none;white-space:pre';document.getElementById('view')?.appendChild(el);}const p=g.parametric,L=p.load,w=p.wave,sgn=L.driveTorqueNm>0?'+':L.driveTorqueNm<0?'−':'0 ',run=L.loadedRun==='none'?'NEUTRAL':L.loadedRun.toUpperCase()+' LOADED',anim=model.config.animateLinks?'ON':'OFF';el.textContent=`CHAIN PARAM V2 · ${mode} · ${sgn}${Math.abs(L.driveTorqueNm).toFixed(0)} N·m · ${run}\nT top ${L.topTensionN.toFixed(0)} N · bottom ${L.bottomTensionN.toFixed(0)} N · Δ ${L.deltaTensionN.toFixed(0)} N\nwave top ${(w.top.amplitudeM*1000).toFixed(1)} mm @ ${w.top.f1Hz.toFixed(1)} Hz · bottom ${(w.bottom.amplitudeM*1000).toFixed(1)} mm @ ${w.bottom.f1Hz.toFixed(1)} Hz\nimpact ${w.impactAccelMps2.toFixed(1)} m/s² · path ${w.pathAccelMps2.toFixed(1)} m/s² · links ${g.nLinks} × ${(g.pitchM*1000).toFixed(3)} mm · phase ${anim}`;el.style.display=document.getElementById('showChain')?.checked?'block':'none';}
  function installFns(){
    if(typeof dyn==='undefined'||typeof free==='undefined'||typeof v5qrot!=='function')return false;
    global.v57ChainPath2D=path2D;global.v57ChainHUD=hud;
    global.chainGeometry=function(){let ch=dyn.last.chain||{},cy=ch.countershaftY??dyn.S.countershaftY,cz=ch.countershaftZ??(dyn.zBody+dyn.S.countershaftZFromBody),ay=ch.rearAxleY??dyn._rearAxleY(),az=ch.rearAxleZ??dyn.rear.hubZ,drive=ch.driveTorqueNm??dyn.S.rearDriveTorqueNm??0,g=path2D(ay-cy,az-cz,dyn.S.frontSprocketRadius,dyn.S.rearSprocketRadius,drive,(dyn.wheelAngleR||0)*dyn.S.rearSprocketRadius,'dyno',dyn.time,az-cz);g.links=g.links.map(q=>[chainX,cy+q[0],cz+q[1]]);g.c1=[chainX,cy,cz];g.c2=[chainX,ay,az];return g;};
    global.drawChain=function(push){let g=global.chainGeometry(),drive=g.parametric.load.driveTorqueNm;drawCircleYZ(push,g.c1,g.r1,[.55,.58,.54]);drawCircleYZ(push,g.c2,g.r2,[.63,.65,.60]);v57DrawChainLinks(push,g);v57DrawChainMesh(g,[1,0,0]);hud(g,'DYNO');window.__CHAIN_GEOM__={schema:'ducati916.chain-parametric-visual.v2',...g.parametric,links:g.nLinks,pitchM:g.pitchM,tautLengthM:g.tautLengthM,chainLengthM:g.chainLengthM,surplusM:g.surplusM,mesh:'procedural-3d-roller-chain',visualLinkMotion:model.config.animateLinks};};
    global.v57FreeChainGeometry=function(V){let ey=v5qrot(free.q,V5_Y),ez=v5qrot(free.q,V5_UP),ex=v5qrot(free.q,V5_X),c1=v5add(free.p,v5qrot(free.q,[chainX,dyn.S.countershaftY,dyn.S.countershaftZFromBody])),c2=v5add(V.RK.hubW,v5mul(V.RK.axleW,chainX)),d=v5sub(c2,c1),dy=v5dot(d,ey),dz=v5dot(d,ez),drive=free.controls?.rearDriveTorqueNm||0,g=path2D(dy,dz,dyn.S.frontSprocketRadius,dyn.S.rearSprocketRadius,drive,(free.wheelAngleR||0)*dyn.S.rearSprocketRadius,'free',free.time,dz),world=g.links.map(q=>v5add(c1,v5add(v5mul(ey,q[0]),v5mul(ez,q[1]))));g.links=world;g.c1=c1;g.c2=c2;g.axis=ex;g.deltaTensionN=g.parametric.load.deltaTensionN;return g;};
    global.v57DrawFreeChain=function(push,V){let g=global.v57FreeChainGeometry(V),w=V57_CHAIN_WIDTH*.5,axis=v5norm(g.axis);for(let i=0;i<g.links.length;i++){let a=g.links[i],b=g.links[(i+1)%g.links.length],run=g.runs[i],loaded=g.tightRun!=='none'&&run===g.tightRun,col=loaded?[1,.76,.18]:(run==='wrap'?[.72,.73,.67]:[.60,.64,.61]),am=v5add(a,v5mul(axis,-w)),ap=v5add(a,v5mul(axis,w)),bm=v5add(b,v5mul(axis,-w)),bp=v5add(b,v5mul(axis,w));push(am,bm,col);push(ap,bp,col);push(am,ap,loaded?[1,.88,.42]:[.76,.78,.73]);}v57DrawChainMesh(g,axis);hud(g,'FREE ROAD');window.__FREE_CHAIN_GEOM__={schema:'ducati916.free-road-chain-parametric.v2',...g.parametric,links:g.nLinks,pitchM:g.pitchM,tautLengthM:g.tautLengthM,chainLengthM:g.chainLengthM,surplusM:g.surplusM,countershaftWorld:g.c1,rearSprocketWorld:g.c2,mesh:'procedural-3d-roller-chain',visualLinkMotion:model.config.animateLinks};};
    if(!dyn.__v58ChainWrapped){const step=dyn.step.bind(dyn);dyn.step=function(...a){const r=step(...a);try{let ch=this.last?.chain||{},cy=ch.countershaftY??this.S.countershaftY,cz=ch.countershaftZ??(this.zBody+this.S.countershaftZFromBody),ay=ch.rearAxleY??this._rearAxleY(),az=ch.rearAxleZ??this.rear.hubZ;model.advance('dyno',{timeS:this.time,rearZ:az-cz,driveTorqueNm:ch.driveTorqueNm??this.S.rearDriveTorqueNm??0,r1:this.S.frontSprocketRadius,r2:this.S.rearSprocketRadius,dy:ay-cy,dz:az-cz});}catch(_){}return r;};dyn.__v58ChainWrapped=true;}
    if(!free.__v58ChainWrapped){const step=free.step.bind(free);free.step=function(...a){const r=step(...a);try{let V={RK:this._rearKinematics()},ey=v5qrot(this.q,V5_Y),ez=v5qrot(this.q,V5_UP),c1=v5add(this.p,v5qrot(this.q,[chainX,dyn.S.countershaftY,dyn.S.countershaftZFromBody])),c2=v5add(V.RK.hubW,v5mul(V.RK.axleW,chainX)),d=v5sub(c2,c1),dy=v5dot(d,ey),dz=v5dot(d,ez);model.advance('free',{timeS:this.time,rearZ:dz,driveTorqueNm:this.controls?.rearDriveTorqueNm||0,r1:dyn.S.frontSprocketRadius,r2:dyn.S.rearSprocketRadius,dy,dz});}catch(_){}return r;};free.__v58ChainWrapped=true;}
    window.__RIG_REPAIR_BUILD__=window.__RIG_REPAIR_BUILD__||{};window.__RIG_REPAIR_BUILD__.version='v1.11';window.__RIG_REPAIR_BUILD__.chain='parametric-impact-v2';window.__RIG_REPAIR_BUILD__.chainVisualLinkMotion=false;return true;
  }
  let tries=0,timer=setInterval(()=>{tries++;try{if(installFns()){clearInterval(timer);global.__DUCATI_CHAIN_PARAMETRIC_INSTALLED__=true;}}catch(e){global.__DUCATI_CHAIN_PARAMETRIC_INSTALL_ERROR__=String(e?.stack||e);if(tries>200)clearInterval(timer);}},10);
  return model;
}
return{DEFAULTS,baseGeometry,loadState,ParametricChainModel,install};
});


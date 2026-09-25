(function(root){
'use strict';
const PI=Math.PI, DEG=PI/180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), lerp=(a,b,t)=>a+(b-a)*t;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{let L=len(a)||1;return[a[0]/L,a[1]/L,a[2]/L]};
function hull2(points){if(points.length<3)return points.slice();const ps=points.map(p=>[p[0],p[1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];for(const p of ps){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}for(let i=ps.length-1;i>=0;i--){const p=ps[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p)}lo.pop();up.pop();return lo.concat(up)}
function polyArea(p){let a=0;for(let i=0;i<p.length;i++){let q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1]}return Math.abs(a)*.5}
function linReg(xs,ys,ws){let sw=0,sx=0,sy=0,sxx=0,sxy=0;for(let i=0;i<xs.length;i++){let w=ws?ws[i]:1;sw+=w;sx+=w*xs[i];sy+=w*ys[i];sxx+=w*xs[i]*xs[i];sxy+=w*xs[i]*ys[i]}let d=sw*sxx-sx*sx;return Math.abs(d)<1e-12?0:(sw*sxy-sx*sy)/d}

class FiniteThicknessTyreSolverV5{
 constructor(asset,opt={}){
  if(!asset||!asset.profile)throw Error('Ducati tire asset required');
  this.asset=asset; this.outerProfile=asset.profile.map(q=>q.slice()); this.innerProfile=[]; this.thicknessProfile=[];
  let ths=[...new Set((asset.visualVertices||[]).filter(v=>v[4]===Math.floor(asset.profile.length/2)).map(v=>v[3]))].sort((a,b)=>a-b);this.sourceThetaPhase=ths.length?ths[0]:0;this.thetaPhase=0;this.sourceRingCount=ths.length||0;
  this.p=Object.assign({
   Ntheta:22, pressurePa:34.8*6894.757293168, ambientPa:101325, gasGamma:1.24,
   tyreMassKg:5.8, rimHubMassKg:9, axlePayloadKg:145, gravity:9.81, camberDeg:0,
   speedMps:0, slipAngleDeg:0, slipRatio:0, mu:1.18, roadZ:0, dt:1/720, constraintIterations:9,
   // finite-thickness structure
   kOuterCircBelt:2.8e6,kOuterCircSide:7.0e5,kInnerCirc:7.5e5,
   kOuterProfileBelt:1.6e6,kOuterProfileSide:6.5e5,kInnerProfile:7.0e5,
   kOuterDiag:3.0e5,kInnerDiag:2.0e5,kThickness:3.0e7,kThicknessCrown:5.0e7,kShear:120,
   kBendOuterCirc:5.0e5,kBendOuterProfile:3.5e5,kBendInnerCirc:1.6e5,kBendInnerProfile:1.2e5,
   prestrainBelt:.006,prestrainSide:.012,velocityDamping:.15,
   dampingBelt:.055,dampingSidewall:.18,dampingThickness:.26,dampingShear:.22,
   brushDensity:1.5e7,contactFilter:.30,dropHeightM:.06,
   materialLossScale:1.0, thicknessViscRate:800, shearViscRate:400, beadViscRate:140, bulkContactViscRate:800, viscoTau:0.045, viscoFracBelt:0.06, viscoFracSide:0.20, viscoFracThickness:0.34, viscoFracShear:0.24, centrifugalScale:1.0, minThicknessFrac:0.72, materialVolumeCorrection:0.90,
   rimProtectionEnabled:true, rimStopOnsetFrac:.70, rimStopK:420000, rimStopK2:14000000, rimStopC:10000,
   renderSurfaceContactGateEnabled:true, contactActivationToleranceM:0.00005, contactReleaseGapM:0.003, contactAngularSamples:110, runtimeProfileBendScale:1.0, resolutionBrushScale:1.0, resolutionNormalizationId:'v119-standard_22'
  },opt);
  this.outerNodes=[];this.innerNodes=[];this.nodes=this.outerNodes;this.particles=[];this.constraints=[];this.visualContacts=[];
  this.time=0;this.hubZ=asset.nominal.R0+.05;this.hubVz=0;this.roadContactLatched=false;this.inflatedReference=null;this.innerInflatedReference=null;this.Vasset=0;this.VgasRef=0;this.materialVolumeRef=0;this.dampingLossJ=0;this.brushLossJ=0;this.drop={};
  this.build();
 }
 idx(it,j){let nt=this.p.Ntheta,np=this.outerProfile.length;return((it%nt)+nt)%nt*np+j}
 iidx(it,j){return this.idx(it,j)}
 camberRad(){return this.p.camberDeg*DEG}
 transformLocal(q,hub=this.hubZ){let g=this.camberRad(),c=Math.cos(g),s=Math.sin(g),x=q[0],y=q[1],z=q[2];return[c*x+s*z,y,-s*x+c*z+hub]}
 invTransformWorld(q){let g=this.camberRad(),c=Math.cos(g),s=Math.sin(g),x=q[0],y=q[1],z=q[2]-this.hubZ;return[c*x-s*z,y,s*x+c*z]}
 thicknessForJ(j){const np=this.outerProfile.length,mid=(np-1)/2,d=Math.abs(j-mid)/mid;if(d>.93)return .0045;if(d>.80)return .0065;if(d>.62)return .0055;if(d>.43)return .0065;if(d>.25)return .0085;if(d>.10)return .0100;return .0115}
 buildInnerProfile(){
  const P=this.outerProfile,target=[0,this.asset.nominal.rimDia*.5+.030],np=P.length;this.innerProfile=[];this.thicknessProfile=[];
  for(let j=0;j<np;j++){
   let t=this.thicknessForJ(j),jm=Math.max(0,j-1),jp=Math.min(np-1,j+1),tg=norm([P[jp][0]-P[jm][0],P[jp][1]-P[jm][1],0]),n1=[-tg[1],tg[0]],n2=[tg[1],-tg[0]],v=[target[0]-P[j][0],target[1]-P[j][1]],n=dot([n1[0],n1[1],0],[v[0],v[1],0])>dot([n2[0],n2[1],0],[v[0],v[1],0])?n1:n2;
   this.innerProfile.push([P[j][0]+n[0]*t,P[j][1]+n[1]*t]);this.thicknessProfile.push(t);
  }
 }
 build(){
  this.buildInnerProfile();const P=this.p,nt=P.Ntheta,np=this.outerProfile.length,dth=2*PI/nt;
  this.outerNodes=[];this.innerNodes=[];this.nodes=this.outerNodes;this.particles=[];this.constraints=[];this.visualContacts=[];this.inflatedReference=null;this.innerInflatedReference=null;
  let weights=[];let sumW=0;
  for(let it=0;it<nt;it++)for(let j=0;j<np;j++){
   let jm=Math.max(0,j-1),jp=Math.min(np-1,j+1),o=this.outerProfile[j],ds=.5*Math.hypot(this.outerProfile[jp][0]-this.outerProfile[jm][0],this.outerProfile[jp][1]-this.outerProfile[jm][1]),ar=Math.max(1e-7,ds*o[1]*dth),w=ar*this.thicknessProfile[j];weights.push({ar,w});sumW+=w;
  }
  for(let it=0;it<nt;it++){
   let th=this.thetaPhase+2*PI*it/nt;
   for(let j=0;j<np;j++){
    let oi=this.idx(it,j),[x,r]=this.outerProfile[j],[xi,ri]=this.innerProfile[j],wo=weights[oi],mass=P.tyreMassKg*wo.w/sumW,bead=j===0||j===np-1;
    let ol=[x,r*Math.sin(th),-r*Math.cos(th)],il=[xi,ri*Math.sin(th),-ri*Math.cos(th)];
    let out={layer:'outer',it,j,th,local:ol,pos:[0,0,0],prev:[0,0,0],vel:[0,0,0],force:[0,0,0],mass:mass*.62,invMass:bead?0:1/(mass*.62),area:wo.ar,bead,fn:0,fnRaw:0,contact:false,flong:0,flat:0,util:0,sat:0,brushLong:0,brushLat:0};
    let inn={layer:'inner',it,j,th,local:il,pos:[0,0,0],prev:[0,0,0],vel:[0,0,0],force:[0,0,0],mass:mass*.38,invMass:bead?0:1/(mass*.38),area:wo.ar,bead};
    this.outerNodes.push(out);this.innerNodes.push(inn);
   }
  }
  this.particles=this.outerNodes.concat(this.innerNodes);this.innerOffset=this.outerNodes.length;
  this.beadMassKg=this.particles.filter(n=>n.bead).reduce((a,n)=>a+n.mass,0);
  const flat=(layer,it,j)=>layer==='outer'?this.idx(it,j):this.innerOffset+this.iidx(it,j);
  const pnode=k=>this.particles[k], isB=j=>j>=4&&j<=np-5;
  const addC=(la,ia,ja,lb,ib,jb,k,type,pre=0)=>{let a=flat(la,ia,ja),b=flat(lb,ib,jb),L=len(sub(pnode(a).local,pnode(b).local));{let L0=L*(1-pre);this.constraints.push({a,b,L0,Lasset:L,k,type,lambda:0,Lvis:L0,LvisRef:null})}};
  for(let it=0;it<nt;it++)for(let j=0;j<np;j++){
   let belt=isB(j),pre=belt?P.prestrainBelt:P.prestrainSide;
   addC('outer',it,j,'outer',it+1,j,belt?P.kOuterCircBelt:P.kOuterCircSide,belt?'outerBeltCirc':'outerSideCirc',pre);
   addC('inner',it,j,'inner',it+1,j,P.kInnerCirc,'innerCirc',pre*.30);
   addC('outer',it,j,'outer',it+2,j,P.kBendOuterCirc*(belt?1:.32),'outerBendCirc',pre*.25);
   addC('inner',it,j,'inner',it+2,j,P.kBendInnerCirc,'innerBendCirc',0);
   if(j<np-1){let bp=belt||isB(j+1),pp=bp?P.prestrainBelt:P.prestrainSide;
    addC('outer',it,j,'outer',it,j+1,bp?P.kOuterProfileBelt:P.kOuterProfileSide,bp?'outerBeltProfile':'outerSideProfile',pp*.45);
    addC('inner',it,j,'inner',it,j+1,P.kInnerProfile,'innerProfile',pp*.12);
    addC('outer',it,j,'outer',it+1,j+1,P.kOuterDiag*(bp?1:.55),'outerDiag',pp*.25);addC('outer',it+1,j,'outer',it,j+1,P.kOuterDiag*(bp?1:.55),'outerDiag',pp*.25);
    addC('inner',it,j,'inner',it+1,j+1,P.kInnerDiag,'innerDiag',0);addC('inner',it+1,j,'inner',it,j+1,P.kInnerDiag,'innerDiag',0);
    // through-thickness profile shear: creates finite bending/shear authority
    addC('outer',it,j,'inner',it,j+1,P.kShear,'thickShear',0);addC('inner',it,j,'outer',it,j+1,P.kShear,'thickShear',0);
   }
   if(j<np-2){addC('outer',it,j,'outer',it,j+2,P.kBendOuterProfile*(belt?1:.30),'outerBendProfile',0);addC('inner',it,j,'inner',it,j+2,P.kBendInnerProfile,'innerBendProfile',0)}
   let kt=belt?P.kThicknessCrown:P.kThickness;addC('outer',it,j,'inner',it,j,kt,belt?'thicknessCrown':'thicknessSide',0);
   // circumferential through-thickness shear
   addC('outer',it,j,'inner',it+1,j,P.kShear*(belt?1.25:.8),'thickShearCirc',0);addC('inner',it,j,'outer',it+1,j,P.kShear*(belt?1.25:.8),'thickShearCirc',0);
  }
  this.buildVisualContacts();
  this.resetRaw(this.asset.nominal.R0+.08);this.Vasset=this.computeGasVolume();this.materialVolumeRef=this.computeMaterialVolume();this.equilibrateInflation();this.reset(this.asset.nominal.R0+.04);this.computeMetrics();
 }
 buildVisualContacts(){
  // Symmetric contact quadrature sampled from the Ducati-derived outer profile.
  // The render mesh is still the original Ducati tire; contact weights no longer
  // inherit arbitrary source-mesh tessellation density or seam asymmetry.
  let nt=this.p.Ntheta,np=this.outerProfile.length,out=[],nang=Math.max(24,Math.round(this.p.contactAngularSamples||110));this.contactSubsamplesPerSector=nang/Math.max(1,nt);this.contactAngularSamples=nang;
  for(let ks=0;ks<nang;ks++){
   let uq=(ks+.5)/nang*nt,it=Math.floor(uq)%nt,t=uq-Math.floor(uq),ang=this.thetaPhase+2*PI*(ks+.5)/nang;
   for(let j=0;j<np;j++){
    let [x,r]=this.outerProfile[j],v=[x,r*Math.sin(ang),-r*Math.cos(ang),ang,j];
    out.push({v,i:it,t,j,lambda:0,fn:0,contact:false});
   }
  }
  this.visualContacts=out;
  let seen=new Set(),rp=[];for(let v of (this.asset.visualVertices||[])){let key=[v[0].toFixed(6),v[1].toFixed(6),v[2].toFixed(6),v[3].toFixed(6),v[4]].join('|');if(seen.has(key))continue;seen.add(key);let ang=((v[3]-this.thetaPhase)%(2*PI)+2*PI)%(2*PI),q=ang/(2*PI)*nt,i=Math.floor(q)%nt,t=q-Math.floor(q);rp.push({v,i,t,j:v[4]})}this.renderProjectionContacts=rp;
 }
 visualSamplePos(s){let v=s.v,n0=this.outerNodes[this.idx(s.i,s.j)],n1=this.outerNodes[this.idx(s.i+1,s.j)],base=this.transformLocal([v[0],v[1],v[2]]),r0=this.transformLocal(n0.local),r1=this.transformLocal(n1.local);return[base[0]+(1-s.t)*(n0.pos[0]-r0[0])+s.t*(n1.pos[0]-r1[0]),base[1]+(1-s.t)*(n0.pos[1]-r0[1])+s.t*(n1.pos[1]-r1[1]),base[2]+(1-s.t)*(n0.pos[2]-r0[2])+s.t*(n1.pos[2]-r1[2])]}
 minRenderSurfaceGap(){let road=this.p.roadZ,list=(this.renderProjectionContacts&&this.renderProjectionContacts.length)?this.renderProjectionContacts:this.visualContacts,min=Infinity;for(let q of list){let p=this.visualSamplePos(q),g=p[2]-road;if(g<min)min=g}return Number.isFinite(min)?min:Infinity}
 roadContactGate(record=true){let gap=this.minRenderSurfaceGap(),tol=Math.max(0,this.p.contactActivationToleranceM??0),release=Math.max(tol,this.p.contactReleaseGapM??.003),enabled=this.p.renderSurfaceContactGateEnabled!==false;if(!enabled)this.roadContactLatched=true;else if(!this.roadContactLatched&&gap<=tol)this.roadContactLatched=true;else if(this.roadContactLatched&&gap>release)this.roadContactLatched=false;let active=!enabled||!!this.roadContactLatched,q={enabled,minVisibleGapM:gap,toleranceM:tol,releaseGapM:release,latched:!!this.roadContactLatched,active,structuralRings:this.p.Ntheta,contactSubsamplesPerSector:this.contactSubsamplesPerSector||0};if(record)this.surfaceContactGate=q;return q}
 beadAnchor(n){return this.transformLocal(n.local)}
 resetRaw(hub){this.hubZ=hub;this.hubVz=0;this.time=0;this.roadContactLatched=false;this.dampingLossJ=0;this.brushLossJ=0;for(let n of this.particles){n.pos=this.transformLocal(n.local);n.prev=n.pos.slice();n.vel=[0,0,0];n.force=[0,0,0];if(n.layer==='outer'){n.fn=n.fnRaw=0;n.contact=false;n.flong=n.flat=n.util=n.sat=0;n.brushLong=n.brushLat=0}}this.VgasRef=this.Vasset||this.computeGasVolume();this.pressureGaugePa=this.p.pressurePa;this.pressureAbsPa=this.p.ambientPa+this.p.pressurePa;for(let c of this.constraints)c.Lvis=c.LvisRef??c.L0;this.drop={active:false,contactStarted:false,impactVz:null,peakLoadN:0,reboundHeightM:0,startHubZ:hub,impactHubZ:null,wasContact:false,bounceCount:0,currentApexM:hub,flightApexesM:[],settleTimeS:0}}
 reset(hub=this.asset.nominal.R0+.04){this.hubZ=hub;this.hubVz=0;this.time=0;this.roadContactLatched=false;this.dampingLossJ=0;this.brushLossJ=0;if(!this.inflatedReference||!this.innerInflatedReference)return this.resetRaw(hub);for(let i=0;i<this.outerNodes.length;i++){for(let L of ['outer','inner']){let n=L==='outer'?this.outerNodes[i]:this.innerNodes[i],ref=L==='outer'?this.inflatedReference[i]:this.innerInflatedReference[i],p=this.transformLocal(ref,hub);n.pos=p;n.prev=p.slice();n.vel=[0,0,0];if(L==='outer'){n.fn=n.fnRaw=0;n.contact=false;n.flong=n.flat=n.util=n.sat=0;n.brushLong=n.brushLat=0}}}for(let c of this.constraints)c.Lvis=c.LvisRef??c.L0;this.drop={active:false,contactStarted:false,impactVz:null,peakLoadN:0,reboundHeightM:0,startHubZ:hub,impactHubZ:null,wasContact:false,bounceCount:0,currentApexM:hub,flightApexesM:[],settleTimeS:0};this.updatePressure()}
 set(q={}){let oldCam=this.p.camberDeg;Object.assign(this.p,q);if(q.camberDeg!==undefined&&q.camberDeg!==oldCam){let ol=this.outerNodes.map(n=>this.invTransformWorld(n.pos)),il=this.innerNodes.map(n=>this.invTransformWorld(n.pos));for(let i=0;i<this.outerNodes.length;i++){for(let [n,l] of [[this.outerNodes[i],ol[i]],[this.innerNodes[i],il[i]]]){n.pos=this.transformLocal(l);n.prev=n.pos.slice();n.vel=[0,0,0]}}}this.updatePressure()}
 computeGasVolume(){
  let nt=this.p.Ntheta,np=this.innerProfile.length,V=0;const tri=(A,B,C,out)=>{let nn=cross(sub(B,A),sub(C,A)),ctr=mul(add(add(A,B),C),1/3),rad=[ctr[0],ctr[1],ctr[2]-this.hubZ];if((out&&dot(nn,rad)<0)||(!out&&dot(nn,rad)>0)){let t=B;B=C;C=t}let a=[A[0],A[1],A[2]-this.hubZ],b=[B[0],B[1],B[2]-this.hubZ],c=[C[0],C[1],C[2]-this.hubZ];V+=dot(a,cross(b,c))/6};
  for(let it=0;it<nt;it++){let i1=(it+1)%nt;for(let j=0;j<np-1;j++){let a=this.innerNodes[this.iidx(it,j)].pos,b=this.innerNodes[this.iidx(i1,j)].pos,c=this.innerNodes[this.iidx(i1,j+1)].pos,d=this.innerNodes[this.iidx(it,j+1)].pos;if((it+j)&1){tri(a,b,d,true);tri(b,c,d,true)}else{tri(a,b,c,true);tri(a,c,d,true)}}let a=this.innerNodes[this.iidx(it,0)].pos,b=this.innerNodes[this.iidx(it,np-1)].pos,c=this.innerNodes[this.iidx(i1,np-1)].pos,d=this.innerNodes[this.iidx(i1,0)].pos;tri(a,b,c,false);tri(a,c,d,false)}return Math.abs(V)
 }
 computeMaterialVolume(){let nt=this.p.Ntheta,np=this.outerProfile.length,V=0;for(let it=0;it<nt;it++){let i1=(it+1)%nt;for(let j=0;j<np-1;j++){let O=[this.outerNodes[this.idx(it,j)].pos,this.outerNodes[this.idx(i1,j)].pos,this.outerNodes[this.idx(i1,j+1)].pos,this.outerNodes[this.idx(it,j+1)].pos],I=[this.innerNodes[this.iidx(it,j)].pos,this.innerNodes[this.iidx(i1,j)].pos,this.innerNodes[this.iidx(i1,j+1)].pos,this.innerNodes[this.iidx(it,j+1)].pos],area=0;for(let S of [O,I])area+=.25*(len(cross(sub(S[1],S[0]),sub(S[3],S[0])))+len(cross(sub(S[2],S[1]),sub(S[3],S[1]))));let th=0;for(let k=0;k<4;k++)th+=len(sub(O[k],I[k]));th*=.25;V+=area*th}}return V}
 updatePressure(constant){let Vref=this.VgasRef||this.Vasset,V=Math.max(this.computeGasVolume(),Vref*.70),p0=this.p.ambientPa+this.p.pressurePa;if(constant!==undefined){this.pressureGaugePa=constant;this.pressureAbsPa=this.p.ambientPa+constant}else{this.pressureAbsPa=p0*Math.pow(Vref/V,this.p.gasGamma);this.pressureGaugePa=Math.max(1000,this.pressureAbsPa-this.p.ambientPa)}this.volumeM3=V}
 addPressureForces(){
  let nt=this.p.Ntheta,np=this.innerProfile.length,p=this.pressureGaugePa,nonBead=[0,0,0];
  const apply=(ia,ib,ic)=>{let A=this.innerNodes[ia].pos,B=this.innerNodes[ib].pos,C=this.innerNodes[ic].pos,nn=cross(sub(B,A),sub(C,A)),ctr=mul(add(add(A,B),C),1/3),rad=[ctr[0],ctr[1],ctr[2]-this.hubZ];if(dot(nn,rad)<0)nn=mul(nn,-1);let f=mul(nn,p*.5/3);for(let ii of [ia,ib,ic]){let n=this.innerNodes[ii];if(!n.bead){n.force=add(n.force,f);nonBead=add(nonBead,f)}}};
  for(let it=0;it<nt;it++){let i1=(it+1)%nt;for(let j=0;j<np-1;j++){let a=this.iidx(it,j),b=this.iidx(i1,j),c=this.iidx(i1,j+1),d=this.iidx(it,j+1);if((it+j)&1){apply(a,b,d);apply(b,c,d)}else{apply(a,b,c);apply(a,c,d)}}}
  // Pressure is internal to the closed tire+rim system. The rigid rim/bead closure
  // carries the exact equal-and-opposite reaction to the pressure applied to all
  // non-bead liner particles. This avoids a fictitious net force from an approximate cap.
  this.pressureForceNonBead=nonBead.slice();this.pressureClosureHubFz=-nonBead[2];return this.pressureClosureHubFz;
 }
 addCentrifugal(){let w=Math.abs(this.p.speedMps)/Math.max(.08,this.asset.nominal.R0),scale=this.p.centrifugalScale;if(w<1e-5||scale<=0)return;for(let n of this.particles){if(n.bead)continue;let q=this.invTransformWorld(n.pos),rr=Math.hypot(q[1],q[2])||1,fl=n.mass*w*w*rr*scale,local=[0,q[1]/rr*fl,q[2]/rr*fl],g=this.camberRad(),c=Math.cos(g),s=Math.sin(g),world=[s*local[2],local[1],c*local[2]];n.force=add(n.force,world)}}
 constraintDamping(c){let s=this.p.materialLossScale;switch(c.type){case'outerBeltCirc':case'outerBeltProfile':case'outerBendCirc':case'outerBendProfile':return this.p.dampingBelt*s;case'thicknessCrown':case'thicknessSide':return this.p.dampingThickness*s;case'thickShear':case'thickShearCirc':return this.p.dampingShear*s;default:return this.p.dampingSidewall*s}}
 constraintViscoFrac(c){switch(c.type){case'outerBeltCirc':case'outerBeltProfile':return this.p.viscoFracBelt;case'thicknessCrown':case'thicknessSide':return this.p.viscoFracThickness;case'thickShear':case'thickShearCirc':return this.p.viscoFracShear;default:return this.p.viscoFracSide}}
 particlePos(n){return n.bead?this.beadAnchor(n):n.pos}
 enforceLateralSymmetry(){
  if(Math.abs(this.p.camberDeg)>1e-8||Math.abs(this.p.slipAngleDeg)>1e-8)return;
  let nt=this.p.Ntheta,np=this.outerProfile.length,mid=Math.floor(np/2);
  for(let layer of [this.outerNodes,this.innerNodes])for(let it=0;it<nt;it++){
   for(let j=0;j<mid;j++){
    let k=np-1-j,a=layer[this.idx(it,j)],b=layer[this.idx(it,k)];if(a.bead&&b.bead)continue;
    let xm=.5*(Math.abs(a.pos[0])+Math.abs(b.pos[0])),ym=.5*(a.pos[1]+b.pos[1]),zm=.5*(a.pos[2]+b.pos[2]);
    a.pos[0]=-xm;b.pos[0]=xm;a.pos[1]=b.pos[1]=ym;a.pos[2]=b.pos[2]=zm;
   }
   if(np%2){let a=layer[this.idx(it,mid)];if(!a.bead)a.pos[0]=0}
  }
 }
 solveConstraints(dt,opt={}){
  for(let c of this.constraints)c.lambda=0;for(let q of this.visualContacts)q.lambda=0;let hubInv=opt.holdHub?0:1/Math.max(1,this.p.axlePayloadKg+this.p.rimHubMassKg+this.beadMassKg),road=this.p.roadZ,contactGate=this.roadContactGate(),roadActive=contactGate.active;
  for(let it=0;it<this.p.constraintIterations;it++){
   for(let ci=0;ci<this.constraints.length;ci++){let c=this.constraints[(it&1)?this.constraints.length-1-ci:ci],a=this.particles[c.a],b=this.particles[c.b],A=this.particlePos(a),B=this.particlePos(b),d=sub(B,A),L=len(d);if(L<1e-9)continue;let e=mul(d,1/L),C=L-c.L0,gaZ=a.bead?-e[2]:0,gbZ=b.bead?e[2]:0,gHub=gaZ+gbZ,w=(a.bead?0:a.invMass)+(b.bead?0:b.invMass)+hubInv*gHub*gHub;if(w<=0)continue;let pb=(c.type==='outerBendProfile'||c.type==='innerBendProfile'),rbs=(!this._inflationEquilibrating&&pb)?(this.p.runtimeProfileBendScale??1):1,keff=c.k*Math.max(1e-6,rbs),alpha=1/(keff*dt*dt),dl=(-C-alpha*c.lambda)/(w+alpha);c.lambda+=dl;if(!a.bead){a.pos[0]-=a.invMass*dl*e[0];a.pos[1]-=a.invMass*dl*e[1];a.pos[2]-=a.invMass*dl*e[2]}if(!b.bead){b.pos[0]+=b.invMass*dl*e[0];b.pos[1]+=b.invMass*dl*e[1];b.pos[2]+=b.invMass*dl*e[2]}if(hubInv&&gHub)this.hubZ+=hubInv*dl*gHub}
   this.enforceLateralSymmetry();
   // Road contact can activate only after the actual visible Ducati tire surface reaches the road.
   if(roadActive)for(let qi=0;qi<this.visualContacts.length;qi++){let q=this.visualContacts[(it&1)?this.visualContacts.length-1-qi:qi],v=q.v,g=this.camberRad(),c=Math.cos(g),ss=Math.sin(g),baseLocalZ=-ss*v[0]+c*v[2];if(this.hubZ+baseLocalZ>road+.045)continue;let n0=this.outerNodes[this.idx(q.i,q.j)],n1=this.outerNodes[this.idx(q.i+1,q.j)],P=this.visualSamplePos(q),C=P[2]-road;if(C>=2e-6&&q.lambda<=0)continue;let w0=n0.bead?0:n0.invMass,w1=n1.bead?0:n1.invMass,a=1-q.t,b=q.t,gHub=(n0.bead?a:0)+(n1.bead?b:0),w=w0*a*a+w1*b*b+hubInv*gHub*gHub;if(w<=0)continue;let old=q.lambda,nl=Math.max(0,old-C/w),dl=nl-old;q.lambda=nl;if(w0)n0.pos[2]+=w0*a*dl;if(w1)n1.pos[2]+=w1*b*dl;if(hubInv&&gHub)this.hubZ+=hubInv*dl*gHub}
  }
  // final one-way projection; active only after visible-surface touchdown and never attracts tire to road
  if(roadActive)for(let pass=0;pass<3;pass++)for(let q of this.visualContacts){let P=this.visualSamplePos(q),C=P[2]-road;if(C>=0)continue;let n0=this.outerNodes[this.idx(q.i,q.j)],n1=this.outerNodes[this.idx(q.i+1,q.j)],a=1-q.t,b=q.t,w0=n0.bead?0:n0.invMass,w1=n1.bead?0:n1.invMass,w=w0*a*a+w1*b*b;if(w<=0)continue;let dl=-C/w;q.lambda+=dl;if(w0)n0.pos[2]+=w0*a*dl;if(w1)n1.pos[2]+=w1*b*dl}
  for(let n of this.particles)if(n.bead)n.pos=this.beadAnchor(n)
 }
 applyBrushForces(){
  const P=this.p,contact=this.outerNodes.filter(n=>n.fn>1&&n.contact),alpha=P.slipAngleDeg*DEG,kappa=P.slipRatio;
  // Geometric carcass deformation is not tread slip. With zero kinematic slip,
  // a stationary loaded tire must carry zero tangential brush force.
  if(!contact.length|| (Math.abs(alpha)<1e-7&&Math.abs(kappa)<1e-7)){
   for(let n of this.outerNodes){n.flong=n.flat=n.util=n.sat=0;n.brushLong=n.brushLat=0}return;
  }
  let lead=-1e9,trail=1e9;for(let n of contact){lead=Math.max(lead,n.pos[1]);trail=Math.min(trail,n.pos[1])}
  let travel=Math.max(.005,lead-trail),ta=Math.tan(alpha),brushScale=this.p.resolutionBrushScale??1;
  for(let n of contact){
   let dist=clamp(lead-n.pos[1],0,travel),inn=this.innerNodes[this.iidx(n.it,n.j)];
   // Through-thickness shear is the structural compliance that can absorb some
   // rim-vs-road mismatch. Pure radial flattening is excluded from this measure.
   let refO=this.inflatedReference?this.transformLocal(this.inflatedReference[this.idx(n.it,n.j)]):this.transformLocal(n.local),
       refI=this.innerInflatedReference?this.transformLocal(this.innerInflatedReference[this.iidx(n.it,n.j)]):this.transformLocal(inn.local),
       shear=sub(sub(n.pos,inn.pos),sub(refO,refI)),uLong=shear[1],uLat=shear[0],
       targetLong=kappa*dist,targetLat=ta*dist,kb=P.brushDensity*brushScale*n.area,
       fl=kb*(targetLong-uLong),fy=kb*(targetLat-uLat),mag=Math.hypot(fl,fy),cap=P.mu*n.fn;
   if(mag>cap&&mag>1e-9){let sc=cap/mag;fl*=sc;fy*=sc;n.sat=1}else n.sat=0;
   n.brushLong=targetLong-uLong;n.brushLat=targetLat-uLat;n.flong=fl;n.flat=fy;n.util=cap>0?Math.hypot(fl,fy)/cap:0;
   n.force[1]+=fl;n.force[0]+=fy; // road-plane lateral brush force; camber must not inject artificial vertical force
  }
 }
 enforceThicknessFloor(){
  const frac=clamp(this.p.minThicknessFrac||.72,.45,.95);
  for(let i=0;i<this.outerNodes.length;i++){
   let o=this.outerNodes[i],inn=this.innerNodes[i];if(o.bead&&inn.bead)continue;
   let ro=this.inflatedReference?this.inflatedReference[i]:o.local,ri=this.innerInflatedReference?this.innerInflatedReference[i]:inn.local,
       minL=len(sub(ro,ri))*frac,d=sub(o.pos,inn.pos),L=len(d);if(L>=minL||L<1e-9)continue;
   let e=mul(d,1/L),wo=o.bead?0:o.invMass,wi=inn.bead?0:inn.invMass,w=wo+wi;if(w<=0)continue;let C=minL-L;
   let dl=C/w;if(wo){o.pos[0]+=wo*dl*e[0];o.pos[1]+=wo*dl*e[1];o.pos[2]+=wo*dl*e[2]}if(wi){inn.pos[0]-=wi*dl*e[0];inn.pos[1]-=wi*dl*e[1];inn.pos[2]-=wi*dl*e[2]}
  }
 }
 projectRenderSurface(){
  let road=this.p.roadZ,maxCorr=0,g=this.camberRad(),cg=Math.cos(g),sg=Math.sin(g),near=road+0.040,gate=this.roadContactGate(false);if(!gate.active){this.renderProjectionCorrectionMaxM=0;return;}
  // Only circumferential stations that can actually approach the road are sampled.
  // This is a pure broad-phase rejection: every candidate that can reach the road still
  // receives the exact same outer-surface unilateral projection as before.
  const proj=(list,force)=>{for(let q of list){let v=q.v,baseZ=this.hubZ-sg*v[0]+cg*v[2];if(baseZ>near)continue;let P=this.visualSamplePos(q),C=P[2]-road;if(C>=0)continue;let n0=this.outerNodes[this.idx(q.i,q.j)],n1=this.outerNodes[this.idx(q.i+1,q.j)],a=1-q.t,b=q.t,w0=n0.bead?0:n0.invMass,w1=n1.bead?0:n1.invMass,w=w0*a*a+w1*b*b;if(w<=0)continue;let dl=-C/w;maxCorr=Math.max(maxCorr,-C);if(force&&q.lambda!==undefined)q.lambda+=dl;if(w0)n0.pos[2]+=w0*a*dl;if(w1)n1.pos[2]+=w1*b*dl;}};
  // Material-volume/thickness projection happens after the XPBD contact iteration.
  // Re-project both the symmetric force quadrature and the actual Ducati render mesh
  // so neither numerical incompressibility nor display tessellation can pass the road.
  for(let k=0;k<2;k++){proj(this.visualContacts,true);proj(this.renderProjectionContacts||[],false)}
  proj(this.visualContacts,true);proj(this.renderProjectionContacts||[],false);
  this.renderProjectionCorrectionMaxM=maxCorr;
 }
 enforceMaterialVolume(){
  let ref=this.materialVolumeRef;if(!(ref>0))return;let V=this.computeMaterialVolume();if(!(V>1e-12))return;
  let gain=clamp(this.p.materialVolumeCorrection||0,0,.9),scale=1+(Math.pow(ref/V,.62)-1)*gain;scale=clamp(scale,.985,1.015);
  if(Math.abs(scale-1)<2e-5)return;
  for(let i=0;i<this.outerNodes.length;i++){
   let o=this.outerNodes[i],inn=this.innerNodes[i];if(o.bead&&inn.bead)continue;let d=sub(o.pos,inn.pos),wo=o.bead?0:o.invMass,wi=inn.bead?0:inn.invMass,w=wo+wi;if(w<=0)continue;
   let corr=mul(d,scale-1);if(wo){let f=wo/w;o.pos[0]+=corr[0]*f;o.pos[1]+=corr[1]*f;o.pos[2]+=corr[2]*f}if(wi){let f=wi/w;inn.pos[0]-=corr[0]*f;inn.pos[1]-=corr[1]*f;inn.pos[2]-=corr[2]*f}
  }
 }

 applyBulkContactViscosity(dt){if(!(this.visualContacts.some(q=>q.contact)))return;let P=this.p,M=Math.max(1,P.axlePayloadKg+P.rimHubMassKg+this.beadMassKg),hubInv=1/M,q=1-Math.exp(-P.bulkContactViscRate*Math.max(0,P.materialLossScale)*dt);q=clamp(q,0,.90);for(let n of this.particles){if(n.bead)continue;let rel=n.vel[2]-this.hubVz,w=n.invMass+hubInv;if(w<=0)continue;let meff=1/w,J=-rel*meff*q;n.vel[2]+=J*n.invMass;this.hubVz-=J*hubInv;this.dampingLossJ+=Math.max(0,.5*meff*rel*rel*(1-(1-clamp(q,0,.90))*(1-clamp(q,0,.90))));}}
 applyBeadViscosity(dt){let P=this.p,np=this.outerProfile.length,M=Math.max(1,P.axlePayloadKg+P.rimHubMassKg+this.beadMassKg),hubInv=1/M,sel=[];for(let L of [this.outerNodes,this.innerNodes])for(let n of L)if(!n.bead&&(n.j<=3||n.j>=np-4))sel.push(n);for(let n of sel){let rel=n.vel[2]-this.hubVz,w=n.invMass+hubInv;if(w<=0)continue;let meff=1/w,side=Math.abs(n.j-(np-1)/2)/((np-1)/2),q=1-Math.exp(-P.beadViscRate*Math.max(0,P.materialLossScale)*(.65+.55*side)*dt),J=-rel*meff*clamp(q,0,.92);n.vel[2]+=J*n.invMass;this.hubVz-=J*hubInv;this.dampingLossJ+=Math.max(0,.5*meff*rel*rel*(1-(1-clamp(q,0,.92))*(1-clamp(q,0,.92))));}}
 applyThicknessViscosity(dt){let P=this.p,loss=Math.max(0,P.materialLossScale);for(let i=0;i<this.outerNodes.length;i++){let o=this.outerNodes[i],n=this.innerNodes[i];if(o.bead&&n.bead)continue;let vo=o.bead?[0,0,this.hubVz]:o.vel,vi=n.bead?[0,0,this.hubVz]:n.vel,d=sub(o.pos,n.pos),L=len(d);if(L<1e-9)continue;let e=mul(d,1/L),rel=sub(vo,vi),rn=dot(rel,e),rvn=mul(e,rn),rvt=sub(rel,rvn),wo=o.bead?0:o.invMass,wi=n.bead?0:n.invMass,w=wo+wi;if(w<=0)continue;let meff=1/w,side=Math.abs(o.j-(this.outerProfile.length-1)/2)/((this.outerProfile.length-1)/2),qn=1-Math.exp(-P.thicknessViscRate*loss*(.75+.55*side)*dt),qt=1-Math.exp(-P.shearViscRate*loss*(.70+.65*side)*dt),Jn=mul(rvn,-meff*clamp(qn,0,.94)),Jt=mul(rvt,-meff*clamp(qt,0,.90)),J=add(Jn,Jt);if(!o.bead){o.vel[0]+=J[0]*wo;o.vel[1]+=J[1]*wo;o.vel[2]+=J[2]*wo}if(!n.bead){n.vel[0]-=J[0]*wi;n.vel[1]-=J[1]*wi;n.vel[2]-=J[2]*wi}this.dampingLossJ+=Math.max(0,.5*meff*(dot(rel,rel)-dot(add(rel,mul(J,1/meff)),add(rel,mul(J,1/meff)))));}}
 applyMaterialDamping(dt){let Mhub=Math.max(1,this.p.axlePayloadKg+this.p.rimHubMassKg+this.beadMassKg),hubInv=1/Mhub;for(let c of this.constraints){let a=this.particles[c.a],b=this.particles[c.b],A=this.particlePos(a),B=this.particlePos(b),d=sub(B,A),L=len(d);if(L<1e-9)continue;let e=mul(d,1/L),va=a.bead?[0,0,this.hubVz]:a.vel,vb=b.bead?[0,0,this.hubVz]:b.vel,vr=dot(sub(vb,va),e),wa=a.bead?hubInv:a.invMass,wb=b.bead?hubInv:b.invMass,w=wa+wb;if(w<=0)continue;let meff=1/w,z=this.constraintDamping(c),cc=2*Math.max(0,z)*Math.sqrt(Math.max(1e-6,c.k*meff)),q=1-Math.exp(-cc*dt/Math.max(meff,1e-9)),J=-vr*meff*clamp(q,0,.90);if(a.bead)this.hubVz-=J*e[2]*hubInv;else{a.vel[0]-=J*e[0]*a.invMass;a.vel[1]-=J*e[1]*a.invMass;a.vel[2]-=J*e[2]*a.invMass}if(b.bead)this.hubVz+=J*e[2]*hubInv;else{b.vel[0]+=J*e[0]*b.invMass;b.vel[1]+=J*e[1]*b.invMass;b.vel[2]+=J*e[2]*b.invMass}let vra=vr+J/meff;this.dampingLossJ+=Math.max(0,.5*meff*(vr*vr-vra*vra))}}
 substep(dt=this.p.dt,opt={}){
  const P=this.p;this.time+=dt;this.updatePressure(opt.constantPressurePa);let prevHub=this.hubZ;
  for(let n of this.particles){n.force=[0,0,n.bead?0:-n.mass*P.gravity];n.prev=n.pos.slice();if(n.layer==='outer'){n.flong=n.flat=n.util=n.sat=0}}
  let pressureHubFz=this.addPressureForces();this.addCentrifugal();this.applyBrushForces();let M=P.axlePayloadKg+P.rimHubMassKg+this.beadMassKg,rr=this.asset.nominal.rimDia*.5,sideH=Math.max(.03,this.asset.nominal.R0-rr),rimClear=this.hubZ-P.roadZ-rr,rimOnset=sideH*(P.rimStopOnsetFrac??.70),rimX=P.rimProtectionEnabled===false?0:Math.max(0,rimOnset-rimClear),rimSpring=rimX>0?(P.rimStopK??420000)*rimX+(P.rimStopK2??14000000)*rimX*rimX:0,rimDamp=rimX>0?(P.rimStopC??10000)*this.hubVz:0,rimProtectN=Math.max(0,rimSpring-rimDamp);this.rimProtection={enabled:P.rimProtectionEnabled!==false,clearanceM:rimClear,onsetM:rimOnset,compressionM:rimX,forceN:rimProtectN,sidewallHeightM:sideH};
  if(!opt.holdHub)this.hubZ+=this.hubVz*dt+(-P.gravity+(pressureHubFz+rimProtectN+(opt.hubExternalForceN||0))/Math.max(1,M))*dt*dt;else this.hubVz=(opt.hubVz===undefined?0:opt.hubVz);
  for(let n of this.particles){if(n.bead){n.pos=this.beadAnchor(n);continue}n.pos[0]+=n.vel[0]*dt+n.force[0]*n.invMass*dt*dt;n.pos[1]+=n.vel[1]*dt+n.force[1]*n.invMass*dt*dt;n.pos[2]+=n.vel[2]*dt+n.force[2]*n.invMass*dt*dt}
  this.solveConstraints(dt,opt);this.enforceThicknessFloor();this.enforceMaterialVolume();this.enforceThicknessFloor();this.projectRenderSurface();if(!opt.holdHub)this.hubVz=(this.hubZ-prevHub)/dt;else this.hubVz=(opt.hubVz===undefined?0:opt.hubVz);
  let any=false,total=0,damp=Math.exp(-P.velocityDamping*dt);for(let n of this.particles){let vx=(n.pos[0]-n.prev[0])/dt,vy=(n.pos[1]-n.prev[1])/dt,vz=(n.pos[2]-n.prev[2])/dt;if(n.bead)n.vel=[0,0,this.hubVz];else n.vel=[vx*damp,vy*damp,vz*damp];if(n.layer==='outer'){n.contact=false;n.fnRaw=0}}
  for(let q of this.visualContacts){q.fn=Math.max(0,q.lambda/(dt*dt));q.contact=q.fn>1;if(!q.contact)continue;any=true;total+=q.fn;let n0=this.outerNodes[this.idx(q.i,q.j)],n1=this.outerNodes[this.idx(q.i+1,q.j)],a=1-q.t,b=q.t;n0.fnRaw+=a*q.fn;n1.fnRaw+=b*q.fn;n0.contact=n1.contact=true}
  for(let n of this.outerNodes){if(n.contact){n.fn=lerp(n.fn||0,n.fnRaw,P.contactFilter);if(n.vel[2]<0)n.vel[2]=0}else{n.fnRaw=0;n.fn=(n.fn||0)*Math.exp(-dt*100)}}
  this.applyBulkContactViscosity(dt);this.applyBeadViscosity(dt);this.applyThicknessViscosity(dt);this.applyMaterialDamping(dt);
  if(this.drop.active){if(!this.drop.contactStarted&&any){this.drop.contactStarted=true;this.drop.impactVz=this.hubVz;this.drop.impactHubZ=this.hubZ;this.drop.currentApexM=this.hubZ}if(this.drop.contactStarted){this.drop.peakLoadN=Math.max(this.drop.peakLoadN,total);this.drop.minHubZ=this.drop.minHubZ===undefined?this.hubZ:Math.min(this.drop.minHubZ,this.hubZ);this.drop.peakPsi=Math.max(this.drop.peakPsi||0,this.pressureGaugePa/6894.757293168);if(this.hubVz>0)this.drop.reboundHeightM=Math.max(this.drop.reboundHeightM,this.hubZ-this.drop.impactHubZ);if(any&&Math.abs(this.hubVz)<.025)this.drop.settleTimeS=(this.drop.settleTimeS||0)+dt;else this.drop.settleTimeS=0;this.drop.wasContact=any}}
 }
 shiftRigid(dz){this.hubZ+=dz;for(let n of this.particles){n.pos[2]+=dz;n.prev[2]+=dz}}
 equilibrateInflation(){this._inflationEquilibrating=true;let oldG=this.p.gravity,oldVD=this.p.velocityDamping,oldLoss=this.p.materialLossScale;this.p.gravity=0;this.p.velocityDamping=2.5;this.p.materialLossScale=2.5;this.VgasRef=this.Vasset;let steps=Math.ceil(.28/this.p.dt);for(let i=0;i<steps;i++)this.substep(this.p.dt,{holdHub:true,constantPressurePa:this.p.pressurePa});let out=this.outerNodes.map(n=>this.invTransformWorld(n.pos)),inn=this.innerNodes.map(n=>this.invTransformWorld(n.pos));
  // enforce only exact source symmetry in the unloaded reference, not during simulation
  let nt=this.p.Ntheta,np=this.outerProfile.length;for(let arr of [out,inn])for(let it=0;it<nt;it++)for(let j=0;j<Math.floor(np/2);j++){let k=np-1-j,a=arr[this.idx(it,j)],b=arr[this.idx(it,k)],xm=.5*(Math.abs(a[0])+Math.abs(b[0])),ym=.5*(a[1]+b[1]),zm=.5*(a[2]+b[2]);arr[this.idx(it,j)]=[-xm,ym,zm];arr[this.idx(it,k)]=[xm,ym,zm];if(np%2)arr[this.idx(it,Math.floor(np/2))][0]=0}
  this.inflatedReference=out;this.innerInflatedReference=inn;for(let i=0;i<this.outerNodes.length;i++){for(let [n,r] of [[this.outerNodes[i],out[i]],[this.innerNodes[i],inn[i]]]){n.pos=this.transformLocal(r);n.prev=n.pos.slice();n.vel=[0,0,0]}}
  for(let i=0;i<Math.ceil(.14/this.p.dt);i++)this.substep(this.p.dt,{holdHub:true,constantPressurePa:this.p.pressurePa});this.inflatedReference=this.outerNodes.map(n=>this.invTransformWorld(n.pos));this.innerInflatedReference=this.innerNodes.map(n=>this.invTransformWorld(n.pos));this.VgasRef=this.computeGasVolume();this.materialVolumeRef=this.computeMaterialVolume();for(let c of this.constraints)c.LvisRef=c.Lvis;this.updatePressure(this.p.pressurePa);for(let n of this.particles)n.vel=[0,0,0];this.p.gravity=oldG;this.p.velocityDamping=oldVD;this.p.materialLossScale=oldLoss;this._inflationEquilibrating=false}
 touchHubZ(clear=0){let g=this.camberRad(),c=Math.cos(g),s=Math.sin(g),mn=Infinity,ref=this.inflatedReference||this.outerNodes.map(n=>n.local);for(let q of ref){let z=-s*q[0]+c*q[2];mn=Math.min(mn,z)}return -mn+clear}
 placeOnGround(clear=.0005){this.reset(this.touchHubZ(clear));return this.last}
 startDrop(h=this.p.dropHeightM){this.reset(this.touchHubZ(Math.max(.005,h)));this.drop.active=true;this.drop.startHubZ=this.hubZ;return this.last}
 solveStatic(maxBlocks=80){let P=this.p,oldVD=P.velocityDamping,oldLoss=P.materialLossScale;P.velocityDamping=4;P.materialLossScale=2.2;this.placeOnGround(.0005);let target=(P.axlePayloadKg+P.rimHubMassKg+P.tyreMassKg)*P.gravity,stable=0;for(let b=0;b<maxBlocks;b++){for(let k=0;k<6;k++)this.substep(P.dt,{holdHub:true});this.computeMetrics();let err=target-this.last.contact.loadN;if(Math.abs(err)<Math.max(7,target*.01))stable++;else stable=0;if(stable>=4)break;this.shiftRigid(-clamp(err*1.35e-6,-.0016,.0016))}this.hubVz=0;for(let n of this.particles)n.vel=[0,0,0];P.velocityDamping=oldVD;P.materialLossScale=oldLoss;this.computeMetrics();this.last.staticTargetLoadN=target;this.last.staticLoadClosure=target>0?Math.abs(this.last.contact.loadN-target)/target:0;return this.last}
 settleStatic(){return this.solveStatic(80)} stepTime(t){let n=Math.max(1,Math.ceil(t/this.p.dt)),dt=t/n;for(let i=0;i<n;i++)this.substep(dt);this.computeMetrics();return this.last} stepSubsteps(n=1){for(let i=0;i<n;i++)this.substep();this.computeMetrics();return this.last}
 visualPosition(v){let nt=this.p.Ntheta,ang=((v[3]-this.thetaPhase)%(2*PI)+2*PI)%(2*PI),q=ang/(2*PI)*nt,i=Math.floor(q)%nt,t=q-Math.floor(q),n0=this.outerNodes[this.idx(i,v[4])],n1=this.outerNodes[this.idx(i+1,v[4])],base=this.transformLocal([v[0],v[1],v[2]]),r0=this.transformLocal(n0.local),r1=this.transformLocal(n1.local);return[base[0]+lerp(n0.pos[0]-r0[0],n1.pos[0]-r1[0],t),base[1]+lerp(n0.pos[1]-r0[1],n1.pos[1]-r1[1],t),base[2]+lerp(n0.pos[2]-r0[2],n1.pos[2]-r1[2],t)]}
 innerPosition(it,j){return this.innerNodes[this.iidx(it,j)].pos}
 computeMetrics(){
  this.updatePressure();let vc=this.visualContacts.filter(q=>q.fn>1),load=vc.reduce((a,q)=>a+q.fn,0),contact=this.outerNodes.filter(n=>n.contact||n.fn>1),Fx=contact.reduce((a,n)=>a+n.flong,0),Fy=contact.reduce((a,n)=>a+n.flat,0),sat=contact.reduce((a,n)=>a+n.fn*(n.sat?1:0),0),pts=vc.map(q=>{let p=this.visualSamplePos(q);return[p[0],p[1]]}),h=hull2(pts),minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let q of h){minX=Math.min(minX,q[0]);maxX=Math.max(maxX,q[0]);minY=Math.min(minY,q[1]);maxY=Math.max(maxY,q[1])}let area=h.length>=3?polyArea(h):0,width=h.length?maxX-minX:0,L=h.length?maxY-minY:0,cx=0,cy=0;if(load>0)for(let q of vc){let p=this.visualSamplePos(q);cx+=p[0]*q.fn;cy+=p[1]*q.fn}cx/=load||1;cy/=load||1;
  let nt=this.p.Ntheta,np=this.outerProfile.length,left=Infinity,right=-Infinity,refL=Infinity,refR=-Infinity,crown=0,cn=0,thSum=0,thMin=Infinity,thMax=0,thComp=0,tc=0;for(let di=-2;di<=2;di++){let it=(di+nt)%nt;for(let j=0;j<np;j++){let o=this.outerNodes[this.idx(it,j)],inn=this.innerNodes[this.iidx(it,j)],q=this.invTransformWorld(o.pos),r=this.inflatedReference?this.inflatedReference[this.idx(it,j)]:o.local;left=Math.min(left,q[0]);right=Math.max(right,q[0]);refL=Math.min(refL,r[0]);refR=Math.max(refR,r[0]);let th=len(sub(o.pos,inn.pos)),ro=this.inflatedReference?this.inflatedReference[this.idx(it,j)]:o.local,ri=this.innerInflatedReference?this.innerInflatedReference[this.iidx(it,j)]:inn.local,thr=len(sub(ro,ri));thSum+=th;thMin=Math.min(thMin,th);thMax=Math.max(thMax,th);thComp+=thr-th;tc++;if(j>=6&&j<=10){crown+=Math.hypot(r[1],r[2])-Math.hypot(q[1],q[2]);cn++}}}
  let xs=[],ys=[],ws=[],g=this.camberRad(),lat=[Math.cos(g),0,-Math.sin(g)];for(let n of contact){let ref=this.inflatedReference?this.transformLocal(this.inflatedReference[this.idx(n.it,n.j)]):this.transformLocal(n.local);xs.push(n.pos[1]);ys.push(dot(sub(n.pos,ref),lat));ws.push(n.fn)}let yaw=Math.atan(linReg(xs,ys,ws));let springE=0;for(let c of this.constraints){let a=this.particlePos(this.particles[c.a]),b=this.particlePos(this.particles[c.b]),C=len(sub(b,a))-c.L0;springE+=.5*c.k*C*C}let nodeKE=0,gravPE=0;for(let n of this.particles){if(!n.bead)nodeKE+=.5*n.mass*dot(n.vel,n.vel);gravPE+=n.mass*this.p.gravity*n.pos[2]}let M=this.p.axlePayloadKg+this.p.rimHubMassKg+this.beadMassKg,hubKE=.5*M*this.hubVz*this.hubVz;gravPE+=(this.p.axlePayloadKg+this.p.rimHubMassKg)*this.p.gravity*this.hubZ;let V0=this.VgasRef,V=this.volumeM3,p0=this.p.ambientPa+this.p.pressurePa,ga=this.p.gasGamma,gasE=Math.abs(ga-1)>1e-5?p0*Math.pow(V0,ga)/(ga-1)*(Math.pow(V,1-ga)-Math.pow(V0,1-ga)):p0*V0*Math.log(V0/V),matV=this.computeMaterialVolume(),minVisualZ=Infinity,minForceZ=Infinity,gz=this.camberRad(),cgz=Math.cos(gz),sgz=Math.sin(gz),nearZ=this.p.roadZ+.055;for(let q of (this.renderProjectionContacts||this.visualContacts)){let v=q.v,baseZ=this.hubZ-sgz*v[0]+cgz*v[2];if(baseZ>nearZ)continue;minVisualZ=Math.min(minVisualZ,this.visualSamplePos(q)[2])}for(let q of this.visualContacts){let v=q.v,baseZ=this.hubZ-sgz*v[0]+cgz*v[2];if(baseZ>nearZ)continue;minForceZ=Math.min(minForceZ,this.visualSamplePos(q)[2])}if(!Number.isFinite(minVisualZ))minVisualZ=this.hubZ-this.asset.nominal.R0;if(!Number.isFinite(minForceZ))minForceZ=minVisualZ;
  this.last={schema:'ducati916.pneumatic-tire-lab.v5-finite-thickness',timeS:this.time,sourceAsset:this.asset.source,hub:{zM:this.hubZ,vzMps:this.hubVz,payloadKg:this.p.axlePayloadKg},pressure:{psi:this.pressureGaugePa/6894.757293168,gaugePa:this.pressureGaugePa,volumeM3:V,referenceVolumeM3:V0,volumeDeltaPct:(V/V0-1)*100},material:{volumeM3:matV,referenceVolumeM3:this.materialVolumeRef,volumeDeltaPct:this.materialVolumeRef?(matV/this.materialVolumeRef-1)*100:0,meanThicknessM:tc?thSum/tc:0,minThicknessM:thMin,maxThicknessM:thMax,meanThicknessCompressionM:tc?thComp/tc:0},contact:{loadN:load,nodes:vc.length,areaM2:area,lengthM:L,widthM:width,hull:h,centroid:[cx,cy],slidingFraction:load?sat/load:0,minOuterZ:Math.min(...this.outerNodes.map(n=>n.pos[2])),minForceZ,minVisualZ,visualPenetrationM:Math.max(0,this.p.roadZ-minVisualZ),renderProjectionCorrectionM:this.renderProjectionCorrectionMaxM||0,samples:vc.map(q=>{let p=this.visualSamplePos(q);return{x:p[0],y:p[1],z:p[2],fn:q.fn}})},forces:{FxN:Fx,FyN:Fy,pressureClosureErrorN:(this.pressureForceNonBead?.[2]||0)+(this.pressureClosureHubFz||0)},carcass:{leftBulgeM:Math.max(0,refL-left),rightBulgeM:Math.max(0,right-refR),sectionWidthM:right-left,referenceWidthM:refR-refL,crownCompressionM:cn?crown/cn:0,beltYawDeg:yaw/DEG},energy:{springJ:springE,gasCompressionJ:gasE,nodeKineticJ:nodeKE,hubKineticJ:hubKE,gravityPotentialJ:gravPE,dampingLossJ:this.dampingLossJ},drop:Object.assign({},this.drop),rimProtection:Object.assign({enabled:this.p.rimProtectionEnabled!==false,clearanceM:this.hubZ-this.p.roadZ-this.asset.nominal.rimDia*.5},this.rimProtection||{}),contactActivation:Object.assign({},this.surfaceContactGate||this.roadContactGate(true),{currentVisibleGapM:this.minRenderSurfaceGap()}),resolution:{structuralRings:this.p.Ntheta,profilePoints:this.outerProfile.length,contactSubsamplesPerSector:this.contactSubsamplesPerSector||0,contactAngularSamples:this.contactAngularSamples||0,contactSamples:this.visualContacts.length,runtimeProfileBendScale:this.p.runtimeProfileBendScale??1,resolutionBrushScale:this.p.resolutionBrushScale??1,resolutionNormalizationId:this.p.resolutionNormalizationId||'none'},params:Object.assign({},this.p)};return this.last
 }
 runAudit(){let checks=[],ck=(n,p,v)=>checks.push({name:n,pass:!!p,value:v}),save=Object.assign({},this.p),mk=q=>{Object.assign(this.p,save,q);this.build();return this};
  mk({gravity:0,camberDeg:0,axlePayloadKg:145,pressurePa:34.8*6894.757293168});this.reset(this.touchHubZ(.10));let z0=this.hubZ;this.stepTime(.35);let a=this.computeMetrics();ck('free_space_no_contact',a.contact.loadN<1&&a.contact.visualPenetrationM===0,[a.contact.loadN,a.contact.visualPenetrationM]);ck('free_space_no_drift',Math.abs(this.hubZ-z0)<2e-4,this.hubZ-z0);ck('finite_thickness_present',a.material.meanThicknessM>.004&&a.material.meanThicknessM<.015,a.material.meanThicknessM);ck('material_volume_stable_free',Math.abs(a.material.volumeDeltaPct)<1.5,a.material.volumeDeltaPct);
  mk({gravity:9.81,camberDeg:0,axlePayloadKg:145,pressurePa:34.8*6894.757293168});a=this.solveStatic();ck('static_load_closure',a.staticLoadClosure<.02,a.staticLoadClosure);ck('zero_slip_zero_tangent',Math.hypot(a.forces.FxN,a.forces.FyN)<2,[a.forces.FxN,a.forces.FyN]);ck('zero_slip_no_sliding',a.contact.slidingFraction<.002,a.contact.slidingFraction);ck('static_material_volume',Math.abs(a.material.volumeDeltaPct)<1.2,a.material.volumeDeltaPct);ck('static_contact_symmetric',Math.abs(a.contact.centroid[0])<.004&&Math.abs(a.carcass.beltYawDeg)<.12,[a.contact.centroid[0],a.carcass.beltYawDeg]);ck('pressure_internal_closure',Math.abs(a.forces.pressureClosureErrorN)<1e-6,a.forces.pressureClosureErrorN);ck('visible_nonpenetrating',a.contact.visualPenetrationM<3e-6,a.contact.visualPenetrationM);ck('pneumatic_bulge',a.carcass.leftBulgeM+a.carcass.rightBulgeM>.0015,[a.carcass.leftBulgeM,a.carcass.rightBulgeM]);ck('thickness_changes_under_load',Math.abs(a.material.meanThicknessCompressionM)>.00002,a.material.meanThicknessCompressionM);let A0=a.contact.areaM2;
  mk({gravity:9.81,camberDeg:0,axlePayloadKg:220,pressurePa:34.8*6894.757293168});let heavy=this.solveStatic();ck('payload_increases_patch',heavy.contact.areaM2>A0*1.06,[A0,heavy.contact.areaM2]);
  mk({gravity:9.81,camberDeg:0,axlePayloadKg:145,pressurePa:22*6894.757293168});let low=this.solveStatic();mk({gravity:9.81,camberDeg:0,axlePayloadKg:145,pressurePa:42*6894.757293168});let hi=this.solveStatic();ck('pressure_changes_patch',low.contact.areaM2>hi.contact.areaM2*1.05,[low.contact.areaM2,hi.contact.areaM2]);
  mk({gravity:9.81,camberDeg:35,axlePayloadKg:145,pressurePa:34.8*6894.757293168});let cam=this.solveStatic();ck('camber_migrates_contact',Math.abs(cam.contact.centroid[0])>.025,cam.contact.centroid[0]);ck('camber_nonpenetrating',cam.contact.visualPenetrationM<3e-6,cam.contact.visualPenetrationM);
  mk({gravity:9.81,camberDeg:0,axlePayloadKg:145,pressurePa:34.8*6894.757293168});this.startDrop(.06);this.stepTime(.55);let d=this.computeMetrics(),vTheory=Math.sqrt(2*this.p.gravity*.06);ck('drop_impacts',d.drop.impactVz!==null,d.drop.impactVz);ck('drop_impact_speed',d.drop.impactVz!==null&&Math.abs(Math.abs(d.drop.impactVz)-vTheory)<.25,[d.drop.impactVz,vTheory]);ck('drop_rebounds',d.drop.reboundHeightM>.003&&d.drop.reboundHeightM<.05,d.drop.reboundHeightM);ck('drop_nonpenetrating',d.contact.visualPenetrationM<1.5e-5,d.contact.visualPenetrationM);
  let out={schema:'ducati916.tire-lab.v5-finite-thickness-audit',passed:checks.filter(c=>c.pass).length,total:checks.length,checks,final:d};Object.assign(this.p,save);this.build();return out
 }
}
root.FiniteThicknessTyreSolverV5=FiniteThicknessTyreSolverV5;root.FiniteThicknessTyreSolverV4=FiniteThicknessTyreSolverV5;root.PneumaticTyreSolverV3=FiniteThicknessTyreSolverV5;if(typeof module!=='undefined'&&module.exports)module.exports={FiniteThicknessTyreSolverV5,FiniteThicknessTyreSolverV4:FiniteThicknessTyreSolverV5,PneumaticTyreSolverV3:FiniteThicknessTyreSolverV5};
})(typeof window!=='undefined'?window:globalThis);

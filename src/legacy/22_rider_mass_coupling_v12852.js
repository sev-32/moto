
(function(global){
'use strict';
if(global.__LUCID_V12852_DYNAMICS__)return;
global.__LUCID_V12852_DYNAMICS__=true;
const D=document,$=id=>D.getElementById(id);
const MASS={"schema":"lucid.rider.mass-properties.v1285.2","sourceAuthority":{"characterArchive":"LUCID_CHARACTER_CONTROL_API_V2_9_ARTICULATED_CONTACT_MICROPLANT_CANDIDATE.zip","characterArchiveSha256":"c74197fff711c8fca9f36ea0b0e2900fec3e6cdde409dcf478784fdd61304079","microplantTotalMassKg":75.337,"causalBodyGraphRawMassFractionSum":0.945,"massFractionNormalizationFactor":1.0582010582010584,"note":"CAUSAL_BODY_GRAPH_V1 labels current mass fractions as coarse priors. They are normalized to the microplant total mass; this is not subject-measured anthropometry."},"meshAuthority":{"vertexCount":14164,"triangleCount":28092,"skinClusterCount":78,"deformationScale":1.0,"method":"segment mass priors distributed over immutable skin-cluster weight fields on corrected rider pose"},"segmentMassProperties":{"pelvis":{"massKg":11.320480423280424,"fractionNormalized":0.15026455026455027,"comM":[-0.0016409361995579435,-0.3249912719191778,0.9073621600547281],"weightedVertexCount":1126},"left_thigh":{"massKg":7.972169312169314,"fractionNormalized":0.10582010582010583,"comM":[-0.20594202891117414,-0.17583381852422153,0.7765134415749085],"weightedVertexCount":720},"right_thigh":{"massKg":7.972169312169314,"fractionNormalized":0.10582010582010583,"comM":[0.20200634605326256,-0.1754830842121229,0.7765871199146837],"weightedVertexCount":719},"abdomen":{"massKg":9.88548994708995,"fractionNormalized":0.13121693121693123,"comM":[-0.0011194623888028399,-0.19930455813727643,0.9914212001359891],"weightedVertexCount":1136},"thorax":{"massKg":14.031017989417991,"fractionNormalized":0.18624338624338627,"comM":[-0.0009793927283747212,-0.0266064496197928,1.0941097704018803],"weightedVertexCount":1773},"left_shank_foot":{"massKg":4.863023280423281,"fractionNormalized":0.06455026455026455,"comM":[-0.28322762972442794,-0.2628865463013504,0.42139221841528235],"weightedVertexCount":1155},"left_upper_arm":{"massKg":2.2322074074074076,"fractionNormalized":0.02962962962962963,"comM":[-0.2014834728387823,0.11583981990668583,1.0482671611459191],"weightedVertexCount":482},"neck_head":{"massKg":6.457457142857144,"fractionNormalized":0.08571428571428572,"comM":[-0.0004929683154091738,0.20956321603439854,1.1944488051555247],"weightedVertexCount":4919},"right_shank_foot":{"massKg":4.863023280423281,"fractionNormalized":0.06455026455026455,"comM":[0.2825907587476891,-0.2638574460622959,0.4227749836003262],"weightedVertexCount":1155},"right_upper_arm":{"massKg":2.2322074074074076,"fractionNormalized":0.02962962962962963,"comM":[0.20057132449562934,0.11642629488905577,1.0494470105158649],"weightedVertexCount":482},"left_forearm_hand":{"massKg":1.753877248677249,"fractionNormalized":0.023280423280423283,"comM":[-0.23668112553216916,0.4752245091591416,0.8748487217849635],"weightedVertexCount":2079},"right_forearm_hand":{"massKg":1.753877248677249,"fractionNormalized":0.023280423280423283,"comM":[0.23439775963214377,0.475730456692692,0.876558342036642],"weightedVertexCount":2079}},"totalMassKg":75.337,"comSimLocalM":[-0.0011558957133035773,-0.10413677650861204,0.8943561227888652],"neutralV5BodyOriginM":[0.0,0.0,0.64],"comOffsetBodyM":[-0.0011558957133035773,-0.10413677650861204,0.2543561227888652],"inertiaAboutComKgM2":[[7.699308409728404,-0.002547647234995651,-0.0020606804848318874],[-0.002547647234995651,6.398818804587141,-1.6045025819316254],[-0.0020606804848318874,-1.6045025819316254,5.809905718083106]],"principalMomentsKgM2":[4.473061051487099,7.699300408530876,7.735671472380678],"principalAxesColumns":[[-0.000996192638622273,0.9998454832144367,0.017550421531018878],[-0.6401152724545781,0.01284604002626489,-0.7681714764465319],[-0.7682782344766952,-0.01199953963005651,0.6400035667697788]],"v5MassReplacement":{"legacyCombinedMassKg":286.0,"legacySprungMassKg":239.0,"legacyRiderLumpKg":75.0,"bikeMassPreservedKg":211.0,"bikeSprungMassPreservedKg":164.0,"newCombinedMassKg":286.337,"newSprungMassKg":239.337,"massDeltaKg":0.3370000000000033},"couplingPolicy":{"defaultMode":"COM_COUPLED","LEGACY_POINT":"original V5 point-lump rider mass","COM_COUPLED":"replace old 75 kg rider lump with 75.337 kg and shift the rider point-mass contribution from V5 body origin to measured rider COM; add gravity moment and centripetal bias","FULL_RIDER_INERTIA_EXPERIMENTAL":"COM_COUPLED plus the rider intrinsic inertia tensor; experimental because legacy V5 bike-only inertia has not been isolated"}};
const RS={"schema":"lucid.rider.bike-reaction-sites.v1285.2","space":"V5 body-local neutral coordinates","comM":[-0.0011558957133035773,-0.10413677650861204,0.8943561227888652],"sites":{"seat.left":{"effector":"pelvis","roles":["support"],"pointM":[-0.07750926080231649,-0.3293873189611443,0.7911845888074864],"normal":[-0.4689145458820216,0.2618472347654457,0.8435372987046554],"referenceGapM":0.0016515465169976875,"basisCost":[1.0,4.0,4.0],"forcePolicy":"compression_preferred"},"seat.right":{"effector":"pelvis","roles":["support"],"pointM":[0.06980984056891607,-0.33807375327804895,0.7931101215996222],"normal":[0.2510834740907694,0.24791946645543916,0.9356778436999351],"referenceGapM":0.0013097006598084726,"basisCost":[1.0,4.0,4.0],"forcePolicy":"compression_preferred"},"peg.left":{"effector":"leftFoot","roles":["support","stand","balance"],"pointM":[-0.2433352174820223,-0.3679844947955423,0.4003980313850847],"normal":[-0.06689803508183846,-0.7013583272729675,0.7096627013356798],"referenceGapM":0.0009605286903225221,"basisCost":[1.2,3.5,3.5],"forcePolicy":"compression_preferred"},"peg.right":{"effector":"rightFoot","roles":["support","stand","balance"],"pointM":[0.24313679929263632,-0.3678645354788579,0.40053528925031623],"normal":[0.06689803508183846,-0.7013583272729675,0.7096627013356798],"referenceGapM":0.0009737312506112323,"basisCost":[1.2,3.5,3.5],"forcePolicy":"compression_preferred"},"grip.left":{"effector":"leftHand","roles":["grab","hold"],"pointM":[-0.24926642437229177,0.3799872293928715,0.8937865080897548],"normal":[0.37177276646824,-0.8773389447137373,0.3034161930437091],"referenceGapM":1.1739354480444076e-05,"basisCost":[3.0,3.0,3.0],"forcePolicy":"grab_can_push_or_pull"},"grip.right":{"effector":"rightHand","roles":["grab","hold"],"pointM":[0.2396924482034675,0.4165477535681816,0.8967254103294802],"normal":[-0.37253670186082316,-0.9033370814471074,-0.21259944273041315],"referenceGapM":0.0001796821712682916,"basisCost":[3.0,3.0,3.0],"forcePolicy":"grab_can_push_or_pull"},"tank.chest":{"effector":"chest","roles":["brace","lean"],"pointM":[0.06829600452644671,-0.14391851745397674,0.9591112530365608],"normal":[0.5589408476489195,-0.44538985883063814,0.6994376330169343],"referenceGapM":0.00016101072936761267,"basisCost":[8.0,10.0,10.0],"forcePolicy":"compression_preferred"},"tank.knee.left":{"effector":"leftKnee","roles":["brace"],"pointM":[-0.12465699846745838,-0.08120524067283486,0.747629174880013],"normal":[-0.9760530757524344,-0.19900517860493402,0.0878483477512869],"referenceGapM":0.06401184841754318,"basisCost":[5.0,8.0,8.0],"forcePolicy":"compression_only_when_engaged"},"tank.knee.right":{"effector":"rightKnee","roles":["brace"],"pointM":[0.11405131891299822,-0.08814832431699496,0.7456359184821224],"normal":[0.976053213183641,-0.199004495477668,0.08784836830339322],"referenceGapM":0.06875679386413339,"basisCost":[5.0,8.0,8.0],"forcePolicy":"compression_only_when_engaged"},"frame.thigh.left":{"effector":"leftInnerThigh","roles":["brace","support"],"pointM":[-0.007932708939211245,-0.28872632387695674,0.7500133950627021],"normal":[-0.8582058114677293,-0.24003951419954647,0.4537221801784236],"referenceGapM":0.06274109743797304,"basisCost":[5.0,8.0,8.0],"forcePolicy":"compression_only_when_engaged"},"frame.thigh.right":{"effector":"rightInnerThigh","roles":["brace","support"],"pointM":[0.010139816600441819,-0.2902305814320541,0.7500182816234654],"normal":[0.8636394508710152,-0.2416078355890849,0.4424393209030691],"referenceGapM":0.06246643222238778,"basisCost":[5.0,8.0,8.0],"forcePolicy":"compression_only_when_engaged"}},"allocationPolicy":{"method":"weighted minimum-norm 6D wrench allocation over active real-geometry contact bases","note":"basisCost is numerical load-sharing regularization, not geometry authority or measured tissue stiffness","supportNegativeNormalPolicy":"remove unloading compression-only site and re-solve","bikeForceInjection":"NO_BASE_FORCE_INJECTION_INTERNAL_LOADS_ONLY","why":"rider mass is already part of the combined V5 mass matrix; adding contact reactions again as external base forces would double-count the rider"}};
const rt={
 mode:'COM_COUPLED',
 installed:false,
 baseMassMethod:null,
 baseResolveCollision:null,
 oldMass:null,
 sample:null,
 reaction:null,
 collision:{lastImpulseNs:0,handReleaseThresholdNs:120,braceReleaseThresholdNs:220,events:[]},
 inertiaIntrinsicInjected:false
};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(a[0],a[1],a[2]),norm=a=>{let l=len(a)||1;return[a[0]/l,a[1]/l,a[2]/l]};
function qmul(a,b){let[x,y,z,w]=a,[X,Y,Z,W]=b;return[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]}
function qconj(q){return[-q[0],-q[1],-q[2],q[3]]}
function qrot(q,v){let p=qmul(qmul(q,[v[0],v[1],v[2],0]),qconj(q));return[p[0],p[1],p[2]]}
function qinvrot(q,v){return qrot(qconj(q),v)}
function zeros(r,c){return Array.from({length:r},()=>Array(c).fill(0))}
function matVec(A,x){return A.map(r=>r.reduce((s,v,i)=>s+v*x[i],0))}
function transpose(A){return A[0].map((_,j)=>A.map(r=>r[j]))}
function mmul(A,B){let BT=transpose(B);return A.map(r=>BT.map(c=>r.reduce((s,v,i)=>s+v*c[i],0)))}
function invert(A){
 let n=A.length,M=A.map((r,i)=>r.slice().concat(Array.from({length:n},(_,j)=>i===j?1:0)));
 for(let c=0;c<n;c++){
  let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;
  if(Math.abs(M[p][c])<1e-12)throw Error('singular matrix');
  [M[c],M[p]]=[M[p],M[c]];let d=M[c][c];for(let j=0;j<2*n;j++)M[c][j]/=d;
  for(let r=0;r<n;r++)if(r!==c){let f=M[r][c];for(let j=0;j<2*n;j++)M[r][j]-=f*M[c][j]}
 }
 return M.map(r=>r.slice(n));
}
function basis(n){
 n=norm(n);let ref=Math.abs(n[2])<.85?[0,0,1]:[0,1,0],t1=norm(cross(ref,n)),t2=norm(cross(n,t1));
 return[[n[0],t1[0],t2[0]],[n[1],t1[1],t2[1]],[n[2],t1[2],t2[2]]];
}
function mv3(M,v){return[M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]]}
function symError(M){let e=0;for(let i=0;i<M.length;i++)for(let j=0;j<M.length;j++)e=Math.max(e,Math.abs(M[i][j]-M[j][i]));return e}

function contactsApi(){return global.LUCID_RIDER_CONTACTS_V12851||null}

function contactActive(effector){
 let A=contactsApi();if(!A)return true;
 let s=A.evaluate?.()?.states?.[effector];
 return !!s && (s.state==='ENGAGED'||s.state==='LOADED');
}

function massMode(mode){
 if(!['LEGACY_POINT','COM_COUPLED','FULL_RIDER_INERTIA_EXPERIMENTAL'].includes(mode))throw Error('invalid coupling mode');
 rt.mode=mode;rt.inertiaIntrinsicInjected=mode==='FULL_RIDER_INERTIA_EXPERIMENTAL';
 let F=global.DUCATI_V5_API?.free;
 if(F&&rt.oldMass){
  if(mode==='LEGACY_POINT'){F.S.mTotal=rt.oldMass.mTotal;F.S.mSprung=rt.oldMass.mSprung}
  else{F.S.mTotal=MASS.v5MassReplacement.newCombinedMassKg;F.S.mSprung=MASS.v5MassReplacement.newSprungMassKg}
 }
 refresh();return mode;
}

function patchMassMatrix(){
 let F=global.DUCATI_V5_API?.free;if(!F||rt.baseMassMethod)return false;
 rt.oldMass={mTotal:F.S.mTotal,mSprung:F.S.mSprung};
 rt.baseMassMethod=F._massMatrixAndBias.bind(F);
 F._massMatrixAndBias=function(){
  let out=rt.baseMassMethod();
  if(rt.mode==='LEGACY_POINT')return out;
  const m=MASS.totalMassKg,r=MASS.comOffsetBodyM,q=this.q,w=this.w;
  let J=zeros(3,9);for(let i=0;i<3;i++)J[i][i]=1;
  const axes=[[1,0,0],[0,1,0],[0,0,1]];
  for(let j=0;j<3;j++){
   let c=qrot(q,cross(axes[j],r));
   for(let k=0;k<3;k++)J[k][3+j]=c[k];
  }
  // Replace rider point mass at body origin with the same rider mass at the measured rider COM.
  for(let i=0;i<9;i++)for(let j=0;j<9;j++){
   let s=0;for(let k=0;k<3;k++)s+=J[k][i]*J[k][j];
   out.M[i][j]+=m*s;
  }
  for(let i=0;i<3;i++)out.M[i][i]-=m;
  // Fixed-point centripetal bias of the moved rider COM.
  let b=qrot(q,cross(w,cross(w,r))),mb=mul(b,m);
  for(let i=0;i<9;i++){let s=0;for(let k=0;k<3;k++)s+=J[k][i]*mb[k];out.C[i]+=s}
  // Move rider gravity line of action from body origin to measured COM.
  let rw=qrot(q,r),Fg=[0,0,-m*this.S.g],tauBody=qinvrot(q,cross(rw,Fg));
  for(let i=0;i<3;i++)out.C[3+i]-=tauBody[i];
  // Optional full rider intrinsic inertia. OFF by default because legacy bike-only inertia is not isolated.
  if(rt.mode==='FULL_RIDER_INERTIA_EXPERIMENTAL'){
   let I=MASS.inertiaAboutComKgM2;
   for(let i=0;i<3;i++)for(let j=0;j<3;j++)out.M[3+i][3+j]+=I[i][j];
   let Iw=mv3(I,w),gyro=cross(w,Iw);for(let i=0;i<3;i++)out.C[3+i]+=gyro[i];
  }
  out.symmetryError=symError(out.M);
  out.riderCoupling={mode:rt.mode,massKg:m,comOffsetBodyM:r.slice(),gravityTorqueBodyNm:tauBody.slice(),intrinsicInertiaInjected:rt.inertiaIntrinsicInjected};
  return out;
 };
 massMode('COM_COUPLED');
 return true;
}

function buildAllocation(activeNames){
 const cols=[],costs=[],meta=[];
 for(let name of activeNames){
  let s=RS.sites[name],B=basis(s.normal),r=sub(s.pointM,MASS.comSimLocalM);
  for(let j=0;j<3;j++){
   let f=[B[0][j],B[1][j],B[2][j]],mom=cross(r,f);
   cols.push(f.concat(mom));costs.push(s.basisCost[j]);meta.push({site:name,basis:j,B});
  }
 }
 if(cols.length<6)return null;
 let A=transpose(cols),n=cols.length,Winv=zeros(n,n);for(let i=0;i<n;i++)Winv[i][i]=1/(costs[i]*costs[i]);
 let AW=mmul(A,Winv),K=mmul(AW,transpose(A));for(let i=0;i<6;i++)K[i][i]+=1e-8;
 let Ki=invert(K),P=mmul(mmul(Winv,transpose(A)),Ki);
 return{A,P,meta};
}

function activeReactionSites(){
 let names=[];
 for(let [name,s] of Object.entries(RS.sites)){
  if(name.startsWith('seat.')){if(contactActive('pelvis'))names.push(name);continue}
  if(contactActive(s.effector))names.push(name);
 }
 return names;
}

function kinematicSample(){
 let snap=null;try{snap=global.DUCATI_V5_API?.snapshot?.()}catch(_e){}
 if(!snap?.body)return null;
 let now=performance.now()/1000,q=snap.body.quaternion||[0,0,0,1],v=snap.body.velocityMps||[0,0,0],w=snap.body.omegaBodyRadS||[0,0,0];
 let aW=[0,0,0],alpha=[0,0,0];
 if(rt.sample){
  let dt=Math.max(1e-3,now-rt.sample.t);
  aW=[(v[0]-rt.sample.v[0])/dt,(v[1]-rt.sample.v[1])/dt,(v[2]-rt.sample.v[2])/dt];
  alpha=[(w[0]-rt.sample.w[0])/dt,(w[1]-rt.sample.w[1])/dt,(w[2]-rt.sample.w[2])/dt];
 }
 rt.sample={t:now,v:v.slice(),w:w.slice()};
 return{snap,q,v,w,aW,alpha};
}

function targetRiderWrench(){
 let k=kinematicSample(),m=MASS.totalMassKg,r=MASS.comOffsetBodyM,g=9.80665;
 if(!k)return{wrench:[0,0,m*g,0,0,0],kinematic:null};
 let aOrigin=qinvrot(k.q,k.aW),gBody=qinvrot(k.q,[0,0,-g]);
 let aCom=add(aOrigin,add(cross(k.alpha,r),cross(k.w,cross(k.w,r))));
 let F=mul(sub(aCom,gBody),m),I=MASS.inertiaAboutComKgM2,Ia=mv3(I,k.alpha),Iw=mv3(I,k.w),M=add(Ia,cross(k.w,Iw));
 return{wrench:F.concat(M),kinematic:k};
}

function reactionLoads(){
 let target=targetRiderWrench(),active=activeReactionSites(),alloc=buildAllocation(active);
 if(!alloc)return{activeSites:active,targetWrenchBody:target.wrench,forces:{},residual:target.wrench.slice(),residualNorm:len(target.wrench),authority:'INTERNAL_LOADS_NO_BASE_FORCE_INJECTION'};
 let c=matVec(alloc.P,target.wrench),forces={},coeff={};
 for(let i=0;i<c.length;i++){
  let md=alloc.meta[i],s=RS.sites[md.site],B=md.B,j=md.basis,f=[B[0][j]*c[i],B[1][j]*c[i],B[2][j]*c[i]];
  forces[md.site]=add(forces[md.site]||[0,0,0],f);
  if(!coeff[md.site])coeff[md.site]=[0,0,0];coeff[md.site][j]=c[i];
 }
 // Compression-only support/brace sites unload instead of pulling.
 let exclude=[];
 for(let [name,cs] of Object.entries(coeff)){
  let pol=RS.sites[name].forcePolicy||'';
  if(pol.includes('compression') && cs[0]<-1e-6)exclude.push(name);
 }
 if(exclude.length && active.length-exclude.length>=2){
  active=active.filter(n=>!exclude.includes(n));alloc=buildAllocation(active);
  if(alloc){
   c=matVec(alloc.P,target.wrench);forces={};coeff={};
   for(let i=0;i<c.length;i++){let md=alloc.meta[i],B=md.B,j=md.basis,f=[B[0][j]*c[i],B[1][j]*c[i],B[2][j]*c[i]];forces[md.site]=add(forces[md.site]||[0,0,0],f);if(!coeff[md.site])coeff[md.site]=[0,0,0];coeff[md.site][j]=c[i]}
  }
 }
 let achieved=matVec(alloc.A,c),res=target.wrench.map((v,i)=>achieved[i]-v),rn=Math.hypot(...res);
 let bikeForces={};for(let [n,f] of Object.entries(forces))bikeForces[n]=mul(f,-1);
 let steerRequest=0,F=global.DUCATI_V5_API?.free;
 if(F?.geom){
  let piv=F.geom.steerPivotBody,ax=norm(F.geom.forkAxisBody);
  for(let n of ['grip.left','grip.right'])if(bikeForces[n])steerRequest+=dot(cross(sub(RS.sites[n].pointM,piv),bikeForces[n]),ax);
 }
 rt.reaction={activeSites:active,targetWrenchBody:target.wrench,forcesOnRiderBodyN:forces,forcesOnBikeBodyN:bikeForces,coefficientBySite:coeff,residual:res,residualNorm:rn,steerContactTorqueRequestNm:steerRequest,authority:'INTERNAL_LOADS_NO_BASE_FORCE_INJECTION'};
 return rt.reaction;
}

function patchCollision(){
 let F=global.DUCATI_V5_API?.free;if(!F||rt.baseResolveCollision)return false;
 rt.baseResolveCollision=F._resolveGroundCollisions.bind(F);
 F._resolveGroundCollisions=function(){
  let out=rt.baseResolveCollision();
  let J=+out?.impulseNs||0;rt.collision.lastImpulseNs=J;
  let A=contactsApi();
  if(A&&J>=rt.collision.handReleaseThresholdNs){
   A.release('leftHand');A.release('rightHand');
   rt.collision.events.push({timeS:this.time,impulseNs:J,event:'HANDS_RELEASE'});
  }
  if(A&&J>=rt.collision.braceReleaseThresholdNs){
   A.release('chest');
   rt.collision.events.push({timeS:this.time,impulseNs:J,event:'CHEST_BRACE_RELEASE'});
  }
  if(rt.collision.events.length>100)rt.collision.events.splice(0,50);
  return out;
 };
 return true;
}

function syntheticImpact(impulseNs){
 let A=contactsApi(),J=+impulseNs||0;
 if(A&&J>=rt.collision.handReleaseThresholdNs){A.release('leftHand');A.release('rightHand')}
 if(A&&J>=rt.collision.braceReleaseThresholdNs)A.release('chest');
 rt.collision.lastImpulseNs=J;rt.collision.events.push({timeS:performance.now()/1000,impulseNs:J,event:'SYNTHETIC_TEST'});
 return reactionLoads();
}
function reacquirePrimary(){let A=contactsApi();for(let e of ['leftHand','rightHand','chest'])A?.reacquire?.(e);return reactionLoads()}
function registerLiveEffector(name,fn){return contactsApi()?.registerEffectorProvider?.(name,fn)??false}

function massState(){
 let F=global.DUCATI_V5_API?.free,mb=F?F._massMatrixAndBias():null;
 return{mode:rt.mode,mTotalKg:F?.S?.mTotal,mSprungKg:F?.S?.mSprung,comSimLocalM:MASS.comSimLocalM,comOffsetBodyM:MASS.comOffsetBodyM,inertiaAboutComKgM2:MASS.inertiaAboutComKgM2,massMatrixSymmetryError:mb?.symmetryError,riderCoupling:mb?.riderCoupling||null};
}

function refresh(){
 let ms=massState(),rr=reactionLoads();
 if($('v12852Mode'))$('v12852Mode').textContent=ms.mode;
 if($('v12852Mass'))$('v12852Mass').textContent=(ms.mTotalKg||0).toFixed(3)+' kg';
 if($('v12852COM'))$('v12852COM').textContent=MASS.comOffsetBodyM.map(v=>v.toFixed(3)).join(', ');
 if($('v12852Residual'))$('v12852Residual').textContent=rr.residualNorm.toFixed(3);
 if($('v12852Impact'))$('v12852Impact').textContent=rt.collision.lastImpulseNs.toFixed(1)+' Ns';
 let tb=$('v12852Forces');if(tb){
  tb.innerHTML='<table class="v12852Table"><thead><tr><th>Site</th><th>Force on rider (N)</th><th>|F|</th><th>Effector</th></tr></thead><tbody>'+
   Object.entries(rr.forcesOnRiderBodyN||{}).map(([n,f])=>`<tr><td><b>${n}</b></td><td>${f.map(v=>v.toFixed(1)).join(', ')}</td><td>${Math.hypot(...f).toFixed(1)}</td><td>${RS.sites[n].effector}</td></tr>`).join('')+
   '</tbody></table>';
 }
}
function enter(){
 const nav=$('v123Nav'),active=String(D.body?.dataset?.v123Page||'').toUpperCase();
 if(active==='RIDE')nav?.querySelector('button[data-v123-page="DYNAMICS"]')?.click();
 D.body.dataset.v123Page='RIDER_DYN';global.__LUCID_ACTIVE_PAGE__='RIDER_DYN';global.__LUCID_PERF_MODE__='LAB';
 nav?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v123Page==='RIDER_DYN'));
 D.querySelectorAll('.v125Page').forEach(x=>x.classList.toggle('on',x.dataset.v125Page==='RIDER_DYN'));
 const title=$('v123PageTitle');if(title){title.querySelector('strong').textContent='RIDER DYNAMICS';title.querySelector('span').textContent='75.337 kg mass authority · measured COM · internal contact reactions · collision release'}
 refresh();
}
function buildUI(){
 let nav=$('v123Nav');if(nav&&!$('v12852Btn')){let b=D.createElement('button');b.id='v12852Btn';b.dataset.v123Page='RIDER_DYN';b.textContent='RIDER DYN';b.onclick=e=>{e.preventDefault();enter()};nav.appendChild(b)}
 let dock=$('v125LabDock');if(dock&&!dock.querySelector('[data-v125-page="RIDER_DYN"]')){
  let p=D.createElement('section');p.className='v125Page';p.dataset.v125Page='RIDER_DYN';
  p.innerHTML=`<div class="v125Head"><h2>RIDER MASS / REACTION COUPLING</h2><p>The legacy 75 kg rider point lump is replaced with the supplied character microplant's 75.337 kg mass and measured posed COM. Real seat/peg/grip/tank reaction loads are internal loads and are not double-applied to the V5 base.</p></div>
  <div class="v12852Hero"><div><span>MODE</span><strong id="v12852Mode">COM_COUPLED</strong></div><div><span>COMBINED MASS</span><strong id="v12852Mass">286.337 kg</strong></div><div><span>RIDER COM OFFSET</span><strong id="v12852COM"></strong></div><div><span>WRENCH RESIDUAL</span><strong id="v12852Residual"></strong></div></div>
  <div class="v125Grid">
   <div class="v125Card"><h3>MASS AUTHORITY</h3><div class="v125KV"><span>rider mass</span><b>${MASS.totalMassKg.toFixed(3)} kg</b><span>source</span><b>articulated_contact_microplant.py</b><span>raw mass-prior sum</span><b>${MASS.sourceAuthority.causalBodyGraphRawMassFractionSum.toFixed(3)}</b><span>rider scale</span><b class="v125Good">1.000000</b><span>intrinsic rider inertia</span><b>${MASS.principalMomentsKgM2.map(v=>v.toFixed(3)).join(' / ')} kg·m²</b></div><div class="v125Note">Default COM_COUPLED adds the geometrically required COM/parallel-axis correction while preserving V5's legacy intrinsic bike inertia. Full rider intrinsic inertia is available only as an explicit experimental mode.</div></div>
   <div class="v125Card"><h3>COUPLING CONTROL</h3><div class="v125Btns"><button id="v12852Legacy">LEGACY POINT</button><button id="v12852COMBtn">COM COUPLED</button><button id="v12852Full">FULL INERTIA EXP.</button></div><div class="v125KV"><span>collision impulse</span><b id="v12852Impact">0 Ns</b><span>hand release threshold</span><b>${rt.collision.handReleaseThresholdNs} Ns</b><span>brace release threshold</span><b>${rt.collision.braceReleaseThresholdNs} Ns</b></div><div class="v125Btns"><button id="v12852Release">TEST 150 Ns IMPACT</button><button id="v12852Acquire">REACQUIRE</button></div></div>
   <div class="v125Card full"><h3>INTERNAL CONTACT REACTIONS</h3><div id="v12852Forces"></div><div class="v125Note">These forces are the real-geometry load distribution needed to accelerate the rider mass. Equal-and-opposite loads are available to local bike/contact systems, but are intentionally not re-injected as external base force because rider mass is already in the combined V5 mass matrix.</div></div>
  </div>`;
  dock.appendChild(p);
  $('v12852Legacy').onclick=()=>massMode('LEGACY_POINT');
  $('v12852COMBtn').onclick=()=>massMode('COM_COUPLED');
  $('v12852Full').onclick=()=>massMode('FULL_RIDER_INERTIA_EXPERIMENTAL');
  $('v12852Release').onclick=()=>{syntheticImpact(150);refresh()};
  $('v12852Acquire').onclick=()=>{reacquirePrimary();refresh()};
 }
}
function style(){
 if($('v12852Style'))return;let s=D.createElement('style');s.id='v12852Style';s.textContent=`
 body.v123 #v123Brand strong:after{content:" · V1.28.5.2 RIDER DYNAMICS"!important;color:#f2d487;font-weight:700}
 body[data-v123-page="RIDER_DYN"] #app{grid-template-columns:minmax(0,1fr) min(800px,60vw)}
 body[data-v123-page="RIDER_DYN"] #v125LabDock{display:block}
 body[data-v123-page="RIDER_DYN"] #v123Right{display:none!important}
 .v12852Hero{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:9px}
 .v12852Hero>div{background:#09151c;border:1px solid #2b4855;border-radius:7px;padding:9px}
 .v12852Hero span{display:block;font:8px ui-monospace;color:#73919e}.v12852Hero strong{font:650 10px ui-monospace;color:#e6f3f7}
 .v12852Table{width:100%;border-collapse:collapse;font:10px ui-monospace}.v12852Table th,.v12852Table td{border-bottom:1px solid #22343e;padding:7px;text-align:left}
 `;D.head.appendChild(s)
}
let tries=0;
function boot(){
 if(global.__LUCID_V12852_READY__)return;
 if(!$('v123Nav')||!$('v125LabDock')||!global.DUCATI_V5_API?.free||!contactsApi()){if(tries++<100)return setTimeout(boot,50);return}
 patchMassMatrix();patchCollision();style();buildUI();
 global.LUCID_RIDER_DYNAMICS_V12852={
  version:'V1.28.5.2',mass:MASS,reactionSites:RS,runtime:rt,
  setCouplingMode:massMode,massState,reactionLoads,targetRiderWrench,
  syntheticImpact,reacquirePrimary,registerLiveEffector,enter,refresh
 };
 global.__LUCID_V12852_READY__=true;
 setInterval(()=>{reactionLoads();if(global.__LUCID_ACTIVE_PAGE__==='RIDER_DYN')refresh()},100);
}
if(D?.readyState==='loading')D.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})(typeof window!=='undefined'?window:globalThis);

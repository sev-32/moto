
import {DynamicTriangleBVH} from './dynamicBvh.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smoothstep01=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const hypot3=(x,y,z)=>Math.hypot(x,y,z);

function percentile(values,p){
  if(!values.length)return 0;
  const a=Array.from(values).sort((x,y)=>x-y);
  return a[Math.min(a.length-1,Math.max(0,Math.floor(p*(a.length-1))))];
}
function vertexNormals(pos,indices,out=new Float32Array(pos.length)){
  out.fill(0);
  for(let k=0;k<indices.length;k+=3){
    const ia=indices[k]*3,ib=indices[k+1]*3,ic=indices[k+2]*3;
    const abx=pos[ib]-pos[ia],aby=pos[ib+1]-pos[ia+1],abz=pos[ib+2]-pos[ia+2];
    const acx=pos[ic]-pos[ia],acy=pos[ic+1]-pos[ia+1],acz=pos[ic+2]-pos[ia+2];
    const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    out[ia]+=nx;out[ia+1]+=ny;out[ia+2]+=nz;
    out[ib]+=nx;out[ib+1]+=ny;out[ib+2]+=nz;
    out[ic]+=nx;out[ic+1]+=ny;out[ic+2]+=nz;
  }
  for(let i=0;i<out.length;i+=3){
    const l=Math.hypot(out[i],out[i+1],out[i+2])||1;
    out[i]/=l;out[i+1]/=l;out[i+2]/=l;
  }
  return out;
}
function restLengths(pos,pairs){
  const r=new Float64Array(pairs.length/2);
  for(let k=0;k<pairs.length;k+=2){
    const a=pairs[k]*3,b=pairs[k+1]*3;
    r[k/2]=Math.hypot(pos[b]-pos[a],pos[b+1]-pos[a+1],pos[b+2]-pos[a+2]);
  }
  return r;
}

export class LucidClothSolver{
  constructor(garment,{bodyIndices,bodyPositions,bodyNormals=null,bodyPrevPositions=null,bodySafetyProxy=null,fit=true}={}){
    if(!bodyIndices||!bodyPositions)throw new Error('LucidClothSolver requires the live Body triangle surface');
    this.asset=garment;
    this.meta=garment.meta;
    this.indices=garment.indices;
    this.edges=garment.edges;
    this.bends=garment.bends;
    this.seams=garment.seams;
    this.componentIds=garment.componentIds;
    this.uvs=garment.uvs||null;
    this.vertexThicknessScale=garment.vertexThicknessScale||null;
    this.vertexSkinFrictionStatic=garment.vertexSkinFrictionStatic||null;
    this.vertexSkinFrictionDynamic=garment.vertexSkinFrictionDynamic||null;
    this.vertexWrinkleAmplitude=garment.vertexWrinkleAmplitude||null;
    this.vertexCreaseBias=garment.vertexCreaseBias||null;
    this.vertexBendScale=garment.vertexBendScale||null;
    this.vertexStretchScale=garment.vertexStretchScale||null;
    this.vertexDampingScale=garment.vertexDampingScale||null;
    this.vertexDirectionAngle=garment.vertexDirectionAngle||null;
    this.edgeStiffnessScale=garment.edgeStiffnessScale||null;
    this.edgeRestScaleAuthored=garment.edgeRestScale||null;
    this.bendStiffnessScale=garment.bendStiffnessScale||null;
    this.bendRestScaleAuthored=garment.bendRestScale||null;
    this.vertexCount=this.meta.vertexCount;
    this.shellVertexCount=this.meta.shellVertexCount;
    this.collar={...this.meta.collar};
    this.pos=new Float64Array(garment.positions);
    this.prev=new Float64Array(garment.positions);
    this.vel=new Float64Array(this.pos.length);
    this.acc=new Float64Array(this.pos.length);
    this.renderPositions=new Float32Array(garment.positions);
    this.renderNormals=new Float32Array(this.pos.length);
    this.bodyIndices=bodyIndices;
    this.bodyPositions=bodyPositions;
    this.bodyNormals=bodyNormals;
    this.bodyPrevPositions=bodyPrevPositions||new Float32Array(bodyPositions);
    this.bodySafetyProxy=bodySafetyProxy||null;this._frameIndex=0;
    this.bodyBVH=new DynamicTriangleBVH(bodyIndices,bodyPositions,{leafSize:10});
    this.bodyBVH.refit(bodyPositions,bodyNormals,this.bodyPrevPositions,1/60);
    this.contactFlags=new Uint8Array(this.vertexCount);
    this.contactNormal=new Float32Array(this.pos.length);
    this.contactVelocity=new Float32Array(this.pos.length);
    this.contactDepth=new Float32Array(this.vertexCount);
    this.clearance=new Float32Array(this.vertexCount);this.clearance.fill(.08);
    this.settings={
      gravity:[0,-9.81,0],gravityScale:1,
      iterations:10,substep:1/120,maxSubsteps:5,
      damping:this.meta.fabric?.damping??.992,
      stretch:this.meta.fabric?.stretchStiffness??.985,
      bend:this.meta.fabric?.bendStiffness??.055,
      // M15 skin friction: relative to the moving Body surface. The legacy
      // scalar is retained for compatibility; static/dynamic coefficients
      // drive a Coulomb stick-slip solve instead of simple tangent damping.
      friction:this.meta.fabric?.friction??.48,
      skinFrictionStatic:this.meta.fabric?.skinFrictionStatic??.55,
      skinFrictionDynamic:this.meta.fabric?.skinFrictionDynamic??(this.meta.fabric?.friction??.40),
      skinStickSpeedMps:.025,skinFrictionDepthGain:.35,
      rho:1.225,cdN:this.meta.fabric?.airDragNormal??1.10,cdT:this.meta.fabric?.airDragTangent??.08,
      wind:[0,0,0],windScale:1,
      // M12 deterministic spatially coherent wind profile. The base vector
      // remains compatible with setWind(); gust/turbulence are optional and
      // affect only clothing acceleration, never character state.
      windProfile:{enabled:false,gustMps:0,gustHz:.35,turbulenceMps:0,turbulenceScaleM:.45,turbulenceHz:.85,verticalShear:0,phase:0},
      shapeHz:1.50,shapeGain:.22,sleeveShapeHz:3.0,sleeveShapeGain:.24,
      // Causal Wardrobe V2: a cached body-relative cloth residual may softly
      // guide the shell, but constraints/contact remain authoritative.
      predictionHz:3.0,predictionGain:.10,predictionMaxAccel:28,predictionMinConfidence:.55,
      selfCollision:true,selfThickness:.0035,
      collision:true,ccd:true,interiorContact:true,retention:true,
      // M14 sleeve occupancy guard: the native shirt is allowed to fold freely,
      // but sleeve vertices may not drift arbitrarily far from their persistent
      // live upper-body carriers. This preserves the arm-through-sleeve topology
      // without skinning the sleeve or writing to the character rig.
      sleeveOccupancy:true,sleeveFreeM:.015,sleeveGuardStrength:.55,sleeveMaxCorrectionM:.0045,
      collisionPasses:1,postContactIterations:0,collisionPolishPasses:0,collisionMaxCorrection:.014,
      globalContactEvery:32,localContactRings:2,globalCCD:true,
      // Alpha 4: closed-manifold deep-collision authority. Visible Body remains
      // the fine contact/friction surface; the proxy only prevents true inside states.
      safetyProxy:true,safetyMargin:.0015,safetyFullEvery:8,safetyNearClearance:.020,
      maxSpeed:4.0
    };
    // Garment-local qualified overrides (e.g. denim uses smaller substeps and
    // a stiffer body-relative coarse guide). T-shirt assets without this block
    // keep their existing settings unchanged.
    if(this.meta.solver&&typeof this.meta.solver==='object')Object.assign(this.settings,this.meta.solver);
    this.diag={contacts:0,ccd:0,interior:0,selfContacts:0,retentionCorrections:0,sleeveGuardCorrections:0,sleeveGuardMaxErrorM:0,frictionStaticContacts:0,frictionDynamicContacts:0,frictionSlipRemovedMps:0,substeps:0,predictionSubsteps:0,promotionIterations:0,safetyTests:0,safetyCorrections:0,safetyMaxDepthM:0};
    this.predictionResidual=null;this.predictionConfidence=0;this.predictionSource='none';
    // V2 adaptive correction budget. Null values defer to qualified V1 settings.
    this.runtimeBudget={iterations:null,selfCollisionEvery:4,globalContactEvery:null,promotionMask:null,promotionExtraIterations:0,label:'full'};
    this._accumulator=0;this._stepIndex=0;this._simTime=0;
    this._fitEdgeRest=restLengths(this.pos,this.edges);
    this._buildCollarDrive();
    this._fitCollarRelative();
    this._buildShellSeamGroups();
    if(fit)this.fitToBody();
    this.bakeRest();
    this._buildCarrierMap();
    this._buildRetention();
    this._buildSleeveOccupancy();
    this._buildNeighborSet();
    this.computeNormals();
  }
  setBodySurface(positions,normals=null,prevPositions=null,dt=1/60){
    this.bodyPositions=positions;this.bodyNormals=normals;
    if(prevPositions)this.bodyPrevPositions=prevPositions;
    this.bodyBVH.refit(positions,normals,this.bodyPrevPositions,dt);
    if(this.bodySafetyProxy)this.bodySafetyProxy.updateFromBody(positions,dt);
  }
  setBodySafetyProxy(proxy){
    this.bodySafetyProxy=proxy||null;
    if(this.bodySafetyProxy)this.bodySafetyProxy.updateFromBody(this.bodyPositions,1/60);
  }
  refreshCausalReference(){
    // Public V2 bridge: refresh the live body-relative carrier without stepping.
    // The physics path refreshes it again at each substep; this call is for
    // causal state encoding/querying before the step.
    this._updateCarrierTargets();
    return this.carrierTarget;
  }
  exportCausalResidual(out=null){
    // Only the sewn shell is predicted. The dynamic rib remains governed by
    // its dedicated fold constraints, avoiding cache-induced collar collapse.
    const n=this.shellVertexCount*3;
    out=out||new Float32Array(n);
    if(out.length!==n)throw new Error('Causal residual size mismatch');
    this._updateCarrierTargets();
    for(let i=0;i<n;i++)out[i]=this.pos[i]-this.carrierTarget[i];
    return out;
  }
  setCausalPrediction(residual,confidence=0,{source='cache'}={}){
    if(!residual||residual.length!==this.shellVertexCount*3||!Number.isFinite(confidence)||confidence<=0){
      this.clearCausalPrediction();return false;
    }
    this.predictionResidual=residual;
    this.predictionConfidence=clamp(confidence,0,1);
    this.predictionSource=source;
    return true;
  }
  clearCausalPrediction(){
    this.predictionResidual=null;this.predictionConfidence=0;this.predictionSource='none';
  }
  setAdaptiveBudget({iterations=null,selfCollisionEvery=4,globalContactEvery=null,promotionMask=null,promotionExtraIterations=0,label='adaptive'}={}){
    this.runtimeBudget={
      iterations:Number.isFinite(iterations)?Math.max(2,Math.floor(iterations)):null,
      selfCollisionEvery:Math.max(1,Math.floor(selfCollisionEvery||4)),
      globalContactEvery:Number.isFinite(globalContactEvery)?Math.max(1,Math.floor(globalContactEvery)):null,
      promotionMask:promotionMask||null,
      promotionExtraIterations:Math.max(0,Math.floor(promotionExtraIterations||0)),
      label:String(label)
    };
  }
  clearAdaptiveBudget(){
    this.runtimeBudget={iterations:null,selfCollisionEvery:4,globalContactEvery:null,promotionMask:null,promotionExtraIterations:0,label:'full'};
  }
  _buildCollarDrive(){
    const {outerStart,ringCount,midStart}=this.collar;
    if(!ringCount){this.collarDrive=[];return}
    const anchor=new Int32Array(ringCount);anchor.fill(-1);
    for(let k=0;k<this.seams.length;k+=2){
      const a=this.seams[k],b=this.seams[k+1];
      if(a<this.shellVertexCount&&b>=outerStart&&b<midStart)anchor[b-outerStart]=a;
      else if(b<this.shellVertexCount&&a>=outerStart&&a<midStart)anchor[a-outerStart]=b;
    }
    const known=[];for(let j=0;j<ringCount;j++)if(anchor[j]>=0)known.push(j);
    if(!known.length)throw new Error('Garment collar has no sewn outer-row anchors');
    this.collarDrive=Array.from({length:ringCount},(_,j)=>{
      let sa=anchor[j],sb=sa,t=0;
      if(sa<0){
        let bp=-1,bn=-1,dp=1e9,dn=1e9;
        for(const q of known){
          const back=(j-q+ringCount)%ringCount,fwd=(q-j+ringCount)%ringCount;
          if(back<dp){dp=back;bp=q}if(fwd<dn){dn=fwd;bn=q}
        }
        sa=anchor[bp];sb=anchor[bn];const span=dp+dn;t=span>0?dp/span:0;
      }
      const co=(outerStart+j)*3,a=sa*3,b=sb*3;
      const bx=this.pos[a]*(1-t)+this.pos[b]*t,by=this.pos[a+1]*(1-t)+this.pos[b+1]*t,bz=this.pos[a+2]*(1-t)+this.pos[b+2]*t;
      const os=.15;
      return{sa,sb,t,ox:(this.pos[co]-bx)*os,oy:(this.pos[co+1]-by)*os,oz:(this.pos[co+2]-bz)*os};
    });
  }
  _fitCollarRelative(){
    const {outerStart,ringCount,midStart,innerStart}=this.collar;
    this.collarMidRel=new Float64Array(ringCount*3);
    this.collarInnerRel=new Float64Array(ringCount*3);
    for(let j=0;j<ringCount;j++){
      const o=(outerStart+j)*3,m=(midStart+j)*3,n=(innerStart+j)*3,r=j*3;
      this.collarMidRel[r]=this.pos[m]-this.pos[o];this.collarMidRel[r+1]=this.pos[m+1]-this.pos[o+1];this.collarMidRel[r+2]=this.pos[m+2]-this.pos[o+2];
      this.collarInnerRel[r]=this.pos[n]-this.pos[o];this.collarInnerRel[r+1]=this.pos[n+1]-this.pos[o+1];this.collarInnerRel[r+2]=this.pos[n+2]-this.pos[o+2];
    }
  }
  _driveCollarOuter(){
    const {outerStart,ringCount}=this.collar;
    for(let j=0;j<ringCount;j++){
      const d=this.collarDrive[j],p=(outerStart+j)*3,a=d.sa*3,b=d.sb*3,t=d.t;
      this.pos[p]=this.pos[a]*(1-t)+this.pos[b]*t+d.ox;
      this.pos[p+1]=this.pos[a+1]*(1-t)+this.pos[b+1]*t+d.oy;
      this.pos[p+2]=this.pos[a+2]*(1-t)+this.pos[b+2]*t+d.oz;
      this.prev[p]=this.prev[a]*(1-t)+this.prev[b]*t+d.ox;
      this.prev[p+1]=this.prev[a+1]*(1-t)+this.prev[b+1]*t+d.oy;
      this.prev[p+2]=this.prev[a+2]*(1-t)+this.prev[b+2]*t+d.oz;
    }
  }
  _solveCollarFold(midK=.20,innerK=.11){
    const {outerStart,ringCount,midStart,innerStart}=this.collar;
    for(let j=0;j<ringCount;j++){
      const o=(outerStart+j)*3,m=(midStart+j)*3,n=(innerStart+j)*3,r=j*3;
      let tx=this.pos[o]+this.collarMidRel[r],ty=this.pos[o+1]+this.collarMidRel[r+1],tz=this.pos[o+2]+this.collarMidRel[r+2];
      this.pos[m]+=(tx-this.pos[m])*midK;this.pos[m+1]+=(ty-this.pos[m+1])*midK;this.pos[m+2]+=(tz-this.pos[m+2])*midK;
      tx=this.pos[o]+this.collarInnerRel[r];ty=this.pos[o+1]+this.collarInnerRel[r+1];tz=this.pos[o+2]+this.collarInnerRel[r+2];
      this.pos[n]+=(tx-this.pos[n])*innerK;this.pos[n+1]+=(ty-this.pos[n+1])*innerK;this.pos[n+2]+=(tz-this.pos[n+2])*innerK;
    }
  }
  _solvePairs(pairs,rest,stiffness,skipKinematic=false){
    const inv=this.invMass;
    const localScale=pairs===this.edges?this.edgeStiffnessScale:(pairs===this.bends?this.bendStiffnessScale:null);
    for(let k=0;k<pairs.length;k+=2){
      const ia=pairs[k],ib=pairs[k+1],rl=rest[k/2];if(rl<.001)continue;
      const a=ia*3,b=ib*3,dx=this.pos[b]-this.pos[a],dy=this.pos[b+1]-this.pos[a+1],dz=this.pos[b+2]-this.pos[a+2],l=Math.hypot(dx,dy,dz);if(l<1e-10)continue;
      const wa=inv?inv[ia]:1,wb=inv?inv[ib]:1,den=wa+wb;if(den<=0)continue;
      const pairStiff=stiffness*(localScale?.[k>>1]??1);
      const s=pairStiff*(l-rl)/(l*den),cx=dx*s,cy=dy*s,cz=dz*s;
      this.pos[a]+=wa*cx;this.pos[a+1]+=wa*cy;this.pos[a+2]+=wa*cz;
      this.pos[b]-=wb*cx;this.pos[b+1]-=wb*cy;this.pos[b+2]-=wb*cz;
    }
  }
  _solvePairsMasked(pairs,rest,stiffness,mask){
    if(!mask)return;
    const inv=this.invMass,ml=mask.length;
    for(let k=0;k<pairs.length;k+=2){
      const ia=pairs[k],ib=pairs[k+1];if((ia>=ml||!mask[ia])&&(ib>=ml||!mask[ib]))continue;
      const rl=rest[k/2];if(rl<.001)continue;
      const a=ia*3,b=ib*3,dx=this.pos[b]-this.pos[a],dy=this.pos[b+1]-this.pos[a+1],dz=this.pos[b+2]-this.pos[a+2],l=Math.hypot(dx,dy,dz);if(l<1e-10)continue;
      const wa=inv?inv[ia]:1,wb=inv?inv[ib]:1,den=wa+wb;if(den<=0)continue;
      const q=stiffness*(l-rl)/(l*den),cx=dx*q,cy=dy*q,cz=dz*q;
      this.pos[a]+=wa*cx;this.pos[a+1]+=wa*cy;this.pos[a+2]+=wa*cz;
      this.pos[b]-=wb*cx;this.pos[b+1]-=wb*cy;this.pos[b+2]-=wb*cz;
    }
  }
  _buildShellSeamGroups(){
    const n=this.shellVertexCount,parent=new Int32Array(n),active=new Set();for(let i=0;i<n;i++)parent[i]=i;
    const find=(x)=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x]}return x};
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
    for(let k=0;k<this.seams.length;k+=2){
      const a=this.seams[k],b=this.seams[k+1];if(a<n&&b<n){active.add(a);active.add(b);join(a,b)}
    }
    const groups=new Map();
    for(const i of active){const r=find(i);let g=groups.get(r);if(!g)groups.set(r,g=[]);g.push(i)}
    this.shellSeamGroups=[...groups.values()].filter(g=>g.length>1).map(g=>Uint32Array.from(g));
    this.shellSeamGroupIndex=new Int32Array(n);this.shellSeamGroupIndex.fill(-1);
    for(let gi=0;gi<this.shellSeamGroups.length;gi++)for(const v of this.shellSeamGroups[gi])this.shellSeamGroupIndex[v]=gi;
  }
  _hardWeldShell(passes=1){
    const groups=this.shellSeamGroups;
    if(!groups?.length)return;
    for(let pass=0;pass<passes;pass++)for(const g of groups){
      let sx=0,sy=0,sz=0,sw=0;
      for(const i of g){const p=i*3,w=this.invMass?Math.max(1e-12,this.invMass[i]):1;sx+=this.pos[p]*w;sy+=this.pos[p+1]*w;sz+=this.pos[p+2]*w;sw+=w}
      if(sw<=0)continue;const x=sx/sw,y=sy/sw,z=sz/sw;
      for(const i of g){const p=i*3;this.pos[p]=x;this.pos[p+1]=y;this.pos[p+2]=z}
    }
  }
  _collideSeamGroups(){
    if(!this.settings.collision||!this.shellSeamGroups?.length)return 0;
    let contacts=0;
    for(const g of this.shellSeamGroups){
      let best=null,bestDef=0;
      for(const i of g){
        const p=i*3,q=this._contactHit(i,.075),h=q.h;if(!h)continue;
        const def=this.contactMargin[i]-h.signed;
        if(def>bestDef){bestDef=def;best=h}
      }
      if(!best||bestDef<=0)continue;
      const c=Math.min(this.settings.collisionMaxCorrection??.014,bestDef);
      for(const i of g){const p=i*3;this.pos[p]+=best.nx*c;this.pos[p+1]+=best.ny*c;this.pos[p+2]+=best.nz*c}
      contacts++;
    }
    return contacts;
  }
  _projectBodyRange(start,end,margin,maxCorrection=.012){
    let contacts=0;
    for(let i=start;i<end;i++){
      const p=i*3,h=this.bodyBVH.closestPoint(this.pos[p],this.pos[p+1],this.pos[p+2],.14);
      if(!h||h.signed>=margin)continue;
      const c=Math.min(maxCorrection,margin-h.signed);
      this.pos[p]+=h.nx*c;this.pos[p+1]+=h.ny*c;this.pos[p+2]+=h.nz*c;contacts++;
    }
    return contacts;
  }
  fitToBody({iterations=24}={}){
    // Target-specific rest fitting. Structural shape is retained while the
    // coarse Wardrobe retarget is moved to the exact LUCID bind surface.
    this.invMass=null;
    for(let it=0;it<iterations;it++){
      this._solvePairs(this.edges,this._fitEdgeRest,.12);
      this._hardWeldShell(1);
      this._projectBodyRange(0,this.shellVertexCount,.005,Math.min(.014,.006+it*.0005));
      this._driveCollarOuter();
      this._solveCollarFold(.34,.22);
      this._projectBodyRange(this.collar.midStart,this.vertexCount,.002,.008);
      if((it%4)===3){this._hardWeldShell(2);this._driveCollarOuter()}
    }
    this._hardWeldShell(3);this._projectBodyRange(0,this.shellVertexCount,.0045,.050);
    this._driveCollarOuter();this._solveCollarFold(.45,.30);this._projectBodyRange(this.collar.midStart,this.vertexCount,.002,.010);
    this.prev.set(this.pos);this.vel.fill(0);
  }
  bakeRest(){
    this.rest=new Float64Array(this.pos);
    this.edgeRest=restLengths(this.rest,this.edges);
    this.bendRest=restLengths(this.rest,this.bends);
    this.edgeRestAuthored=new Float64Array(this.edgeRest);
    this.bendRestAuthored=new Float64Array(this.bendRest);
    if(this.edgeRestScaleAuthored?.length)for(let i=0;i<this.edgeRestAuthored.length;i++)this.edgeRestAuthored[i]*=this.edgeRestScaleAuthored[i]??1;
    if(this.bendRestScaleAuthored?.length)for(let i=0;i<this.bendRestAuthored.length;i++)this.bendRestAuthored[i]*=this.bendRestScaleAuthored[i]??1;
    this._fitCollarRelative();
    // Mass from target-fitted rest triangle area.
    const mass=new Float64Array(this.vertexCount);mass.fill(1e-7);
    const density=this.meta.fabric?.surfaceDensityKgM2??.150;
    let restArea=0;
    for(let k=0;k<this.indices.length;k+=3){
      const ia=this.indices[k]*3,ib=this.indices[k+1]*3,ic=this.indices[k+2]*3;
      const abx=this.rest[ib]-this.rest[ia],aby=this.rest[ib+1]-this.rest[ia+1],abz=this.rest[ib+2]-this.rest[ia+2];
      const acx=this.rest[ic]-this.rest[ia],acy=this.rest[ic+1]-this.rest[ia+1],acz=this.rest[ic+2]-this.rest[ia+2];
      const area=.5*Math.hypot(aby*acz-abz*acy,abz*acx-abx*acz,abx*acy-aby*acx);restArea+=area;
      const m=area*density/3;mass[this.indices[k]]+=m;mass[this.indices[k+1]]+=m;mass[this.indices[k+2]]+=m;
    }
    this.restArea=restArea;this.mass=mass;this.invMass=new Float64Array(this.vertexCount);
    for(let i=0;i<this.vertexCount;i++)this.invMass[i]=1/mass[i];
    for(let i=this.collar.outerStart;i<this.collar.midStart;i++)this.invMass[i]=0;
    // Per-vertex contact thickness follows garment role, not current world pose.
    this.contactMargin=new Float32Array(this.vertexCount);
    for(let i=0;i<this.shellVertexCount;i++){
      const p=i*3,upper=this.rest[p+1]>1.20,sleeve=this.componentIds[i]===0||this.componentIds[i]===1||this.componentIds[i]===4||this.componentIds[i]===5;
      this.contactMargin[i]=sleeve&&upper?(this.meta.fabric?.shoulderContactMarginM??.0060):(this.meta.fabric?.contactMarginM??.0045);
      if(this.vertexThicknessScale?.length)this.contactMargin[i]*=this.vertexThicknessScale[i]??1;
    }
    for(let i=this.collar.outerStart;i<this.vertexCount;i++)this.contactMargin[i]=this.meta.fabric?.collarContactMarginM??.0020;
    this.prev.set(this.pos);this.vel.fill(0);
  }
  _buildCarrierMap(){
    const n=this.shellVertexCount;
    this.carrierTri=new Int32Array(n);this.carrierTri.fill(-1);
    this.carrierUVW=new Float32Array(n*3);
    this.carrierOffset=new Float32Array(n*3);
    this.carrierTarget=new Float32Array(n*3);
    this.carrierNormal=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const p=i*3,h=this.bodyBVH.closestPoint(this.rest[p],this.rest[p+1],this.rest[p+2],.20);
      if(!h)continue;
      this.carrierTri[i]=h.ti;this.carrierUVW[p]=h.u;this.carrierUVW[p+1]=h.v;this.carrierUVW[p+2]=h.w;
      const s=this.bodyBVH.sampleTriangle(h.ti,h.u,h.v,h.w);
      const dx=this.rest[p]-s.qx,dy=this.rest[p+1]-s.qy,dz=this.rest[p+2]-s.qz;
      this.carrierOffset[p]=dx*s.tx+dy*s.ty+dz*s.tz;
      this.carrierOffset[p+1]=dx*s.bx+dy*s.by+dz*s.bz;
      this.carrierOffset[p+2]=dx*s.nx+dy*s.ny+dz*s.nz;
    }
    this._updateCarrierTargets();
    this.contactTri=new Int32Array(this.vertexCount);this.contactTri.fill(-1);
    for(let i=0;i<this.shellVertexCount;i++)this.contactTri[i]=this.carrierTri[i];
    for(let i=this.shellVertexCount;i<this.vertexCount;i++){
      const p=i*3,h=this.bodyBVH.closestPoint(this.rest[p],this.rest[p+1],this.rest[p+2],.12);
      if(h)this.contactTri[i]=h.ti;
    }
  }
  _updateCarrierTargets(){
    for(let i=0;i<this.shellVertexCount;i++){
      const ti=this.carrierTri[i],p=i*3;if(ti<0){this.carrierTarget[p]=this.rest[p];this.carrierTarget[p+1]=this.rest[p+1];this.carrierTarget[p+2]=this.rest[p+2];this.carrierNormal[p]=0;this.carrierNormal[p+1]=0;this.carrierNormal[p+2]=0;continue}
      const s=this.bodyBVH.sampleTriangle(ti,this.carrierUVW[p],this.carrierUVW[p+1],this.carrierUVW[p+2]);
      this.carrierNormal[p]=s.nx;this.carrierNormal[p+1]=s.ny;this.carrierNormal[p+2]=s.nz;
      const ot=this.carrierOffset[p],ob=this.carrierOffset[p+1],on=this.carrierOffset[p+2];
      this.carrierTarget[p]=s.qx+s.tx*ot+s.bx*ob+s.nx*on;
      this.carrierTarget[p+1]=s.qy+s.ty*ot+s.by*ob+s.ny*on;
      this.carrierTarget[p+2]=s.qz+s.tz*ot+s.bz*ob+s.nz*on;
    }
    if(this.sleeveFrames)this._updateSleeveRigidTargets();
  }
  _buildRetention(){
    if(this.meta.garmentType==='pants'&&Array.isArray(this.meta.construction?.waistbandVertexIds)){
      const src=this.meta.construction.waistbandVertexIds.filter(i=>i>=0&&i<this.shellVertexCount);
      this.retentionIds=Uint32Array.from(src.filter((_,i)=>i%2===0));
      this.retentionMode='waistband';
      this.waistbandFollowWeight=new Float32Array(this.shellVertexCount);
      let top=-Infinity;for(const i of src)top=Math.max(top,this.rest[i*3+1]);
      const low=top-.255;
      for(let i=0;i<this.shellVertexCount;i++){
        const y=this.rest[i*3+1],u=clamp((y-low)/(top-low),0,1);
        this.waistbandFollowWeight[i]=smoothstep01(u)*smoothstep01(u);
      }
      return;
    }
    const ids=new Set();
    const {outerStart,midStart}=this.collar;
    for(let k=0;k<this.seams.length;k+=2){
      const a=this.seams[k],b=this.seams[k+1];
      if(a<this.shellVertexCount&&b>=outerStart&&b<midStart)ids.add(a);
      else if(b<this.shellVertexCount&&a>=outerStart&&a<midStart)ids.add(b);
    }
    // Keep the guard compact: every second neckline seed is enough to define
    // a stable body-relative centroid without freezing the shoulder cloth.
    this.retentionIds=Uint32Array.from([...ids].sort((a,b)=>a-b).filter((_,i)=>i%2===0));
  }
  _applyRetention(){
    if(!this.settings.retention||!this.retentionIds.length)return;
    if(this.retentionMode==='waistband'&&this.waistbandFollowWeight){
      let moved=0;
      for(let i=0;i<this.shellVertexCount;i++){
        const w=this.waistbandFollowWeight[i];if(w<=1e-4)continue;
        const p=i*3,g=.78*w;
        const dx=(this.carrierTarget[p]-this.pos[p])*g,dy=(this.carrierTarget[p+1]-this.pos[p+1])*g,dz=(this.carrierTarget[p+2]-this.pos[p+2])*g;
        this.pos[p]+=dx;this.pos[p+1]+=dy;this.pos[p+2]+=dz;
        this.prev[p]+=dx;this.prev[p+1]+=dy;this.prev[p+2]+=dz;
        // A fitted jeans waistband should not numerically bounce against the
        // pelvis every substep. Damp only relative waistband velocity; the
        // lower legs remain fully dynamic.
        const vd=.82*w,rx=this.pos[p]-this.prev[p],ry=this.pos[p+1]-this.prev[p+1],rz=this.pos[p+2]-this.prev[p+2];
        this.prev[p]=this.pos[p]-rx*(1-vd);this.prev[p+1]=this.pos[p+1]-ry*(1-vd);this.prev[p+2]=this.pos[p+2]-rz*(1-vd);
        moved++;
      }
      if(moved)this.diag.retentionCorrections++;
      return;
    }
    let cx=0,cy=0,cz=0,tx=0,ty=0,tz=0;
    for(const i of this.retentionIds){const p=i*3;cx+=this.pos[p];cy+=this.pos[p+1];cz+=this.pos[p+2];tx+=this.carrierTarget[p];ty+=this.carrierTarget[p+1];tz+=this.carrierTarget[p+2]}
    const n=this.retentionIds.length;cx/=n;cy/=n;cz/=n;tx/=n;ty/=n;tz/=n;
    const dx=tx-cx,dy=ty-cy,dz=tz-cz,d=Math.hypot(dx,dy,dz),free=this.retentionMode==='waistband'?.010:.032;
    if(d<=free)return;
    const gain=this.retentionMode==='waistband'?.86:.70,s=(d-free)/d*gain,ox=dx*s,oy=dy*s,oz=dz*s;
    for(let i=0;i<this.vertexCount;i++){const p=i*3;this.pos[p]+=ox;this.pos[p+1]+=oy;this.pos[p+2]+=oz;this.prev[p]+=ox;this.prev[p+1]+=oy;this.prev[p+2]+=oz}
    this.diag.retentionCorrections++;
  }
  _buildSleeveOccupancy(){
    const norm3=(v)=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]};
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const centroid=(ids,src)=>{let x=0,y=0,z=0;for(const i of ids){const p=i*3;x+=src[p];y+=src[p+1];z+=src[p+2]}const n=Math.max(1,ids.length);return[x/n,y/n,z/n]};
    const frames=[],guard=[];
    this.sleeveFollowWeight=new Float32Array(this.shellVertexCount);
    for(const cid of [0,4]){
      const ids=[];for(let i=0;i<this.shellVertexCount;i++)if(this.componentIds[i]===cid)ids.push(i);
      if(!ids.length)continue;
      let amin=1e9,amax=-1e9;for(const i of ids){const a=Math.abs(this.rest[i*3]);amin=Math.min(amin,a);amax=Math.max(amax,a)}
      const span=Math.max(1e-6,amax-amin),uv=ids.map(i=>(Math.abs(this.rest[i*3])-amin)/span);
      const inner=ids.filter((_,j)=>uv[j]<.20),cuff=ids.filter((_,j)=>uv[j]>.82);
      const mid=ids.filter((_,j)=>uv[j]>.35&&uv[j]<.75).sort((a,b)=>this.rest[a*3+1]-this.rest[b*3+1]);
      const under=mid.slice(0,Math.max(3,Math.ceil(mid.length*.25)));
      const I0=centroid(inner,this.rest),C0=centroid(cuff,this.rest),U0=centroid(under,this.rest);
      const x0=norm3([C0[0]-I0[0],C0[1]-I0[1],C0[2]-I0[2]]);
      const vv=[U0[0]-I0[0],U0[1]-I0[1],U0[2]-I0[2]],proj=dot(vv,x0);
      let y0=norm3([vv[0]-x0[0]*proj,vv[1]-x0[1]*proj,vv[2]-x0[2]*proj]);
      let z0=norm3(cross(x0,y0));y0=norm3(cross(z0,x0));
      const local=new Float32Array(ids.length*3),blend=new Float32Array(ids.length);
      for(let j=0;j<ids.length;j++){
        const i=ids[j],p=i*3,d=[this.rest[p]-I0[0],this.rest[p+1]-I0[1],this.rest[p+2]-I0[2]];
        local[j*3]=dot(d,x0);local[j*3+1]=dot(d,y0);local[j*3+2]=dot(d,z0);
        let w=clamp((uv[j]-.10)/.40,0,1);blend[j]=smoothstep01(w);
        let fw=clamp((uv[j]-.35)/.45,0,1);fw=smoothstep01(fw);this.sleeveFollowWeight[i]=fw;
        guard.push(i);
      }
      frames.push({cid,ids:Uint32Array.from(ids),inner:Uint32Array.from(inner),cuff:Uint32Array.from(cuff),under:Uint32Array.from(under),I0,x0,y0,z0,local,blend});
    }
    this.sleeveFrames=frames;
    this.sleeveOccupancyIds=Uint32Array.from(guard);
    this.sleeveTarget=new Float32Array(this.shellVertexCount*3);
    this._updateSleeveRigidTargets();
  }
  _updateSleeveRigidTargets(){
    if(!this.sleeveFrames?.length||!this.sleeveTarget)return;
    const norm3=(v)=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]};
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const centroid=(ids)=>{let x=0,y=0,z=0;for(const i of ids){const p=i*3;x+=this.carrierTarget[p];y+=this.carrierTarget[p+1];z+=this.carrierTarget[p+2]}const n=Math.max(1,ids.length);return[x/n,y/n,z/n]};
    for(const f of this.sleeveFrames){
      const I=centroid(f.inner),C=centroid(f.cuff),U=centroid(f.under);
      const x=norm3([C[0]-I[0],C[1]-I[1],C[2]-I[2]]);
      const vv=[U[0]-I[0],U[1]-I[1],U[2]-I[2]],proj=dot(vv,x);
      let y=norm3([vv[0]-x[0]*proj,vv[1]-x[1]*proj,vv[2]-x[2]*proj]);
      let z=norm3(cross(x,y));y=norm3(cross(z,x));
      for(let j=0;j<f.ids.length;j++){
        const i=f.ids[j],p=i*3,q=j*3,lx=f.local[q],ly=f.local[q+1],lz=f.local[q+2],w=f.blend[j];
        const rx=I[0]+x[0]*lx+y[0]*ly+z[0]*lz,ry=I[1]+x[1]*lx+y[1]*ly+z[1]*lz,rz=I[2]+x[2]*lx+y[2]*ly+z[2]*lz;
        this.sleeveTarget[p]=this.carrierTarget[p]*(1-w)+rx*w;
        this.sleeveTarget[p+1]=this.carrierTarget[p+1]*(1-w)+ry*w;
        this.sleeveTarget[p+2]=this.carrierTarget[p+2]*(1-w)+rz*w;
      }
    }
  }
  _applySleeveOccupancy(){
    if(!this.settings.sleeveOccupancy||!this.sleeveOccupancyIds?.length)return 0;
    const free=Math.max(.010,this.settings.sleeveFreeM??.030);
    const strength=clamp(this.settings.sleeveGuardStrength??.55,0,1);
    const maxC=Math.max(.001,this.settings.sleeveMaxCorrectionM??.006);
    let corrected=0,maxErr=0;
    for(const i of this.sleeveOccupancyIds){
      const p=i*3,tx=this.sleeveTarget[p],ty=this.sleeveTarget[p+1],tz=this.sleeveTarget[p+2],dx=tx-this.pos[p],dy=ty-this.pos[p+1],dz=tz-this.pos[p+2];
      const d=Math.hypot(dx,dy,dz);maxErr=Math.max(maxErr,d);
      if(d<=free)continue;
      const c=Math.min(maxC,(d-free)*strength),s=c/(d||1);
      this.pos[p]+=dx*s;this.pos[p+1]+=dy*s;this.pos[p+2]+=dz*s;corrected++;
    }
    this.diag.sleeveGuardCorrections+=corrected;
    this.diag.sleeveGuardMaxErrorM=Math.max(this.diag.sleeveGuardMaxErrorM,maxErr);
    return corrected;
  }
  _buildNeighborSet(){
    this.neighborSet=new Set();
    const add=(a,b)=>{if(a>b){const t=a;a=b;b=t}this.neighborSet.add(a+','+b)};
    for(let k=0;k<this.edges.length;k+=2)add(this.edges[k],this.edges[k+1]);
    for(let k=0;k<this.seams.length;k+=2)add(this.seams[k],this.seams[k+1]);
  }
  _selfCollision(){
    if(!this.settings.selfCollision)return 0;
    const cell=.010,minD=this.settings.selfThickness*2,minD2=minD*minD,grid=new Map(),key=(x,y,z)=>x+'|'+y+'|'+z;
    let count=0;
    for(let i=0;i<this.shellVertexCount;i++){
      const p=i*3,ix=Math.floor(this.pos[p]/cell),iy=Math.floor(this.pos[p+1]/cell),iz=Math.floor(this.pos[p+2]/cell);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
        const a=grid.get(key(ix+dx,iy+dy,iz+dz));if(!a)continue;
        for(const j of a){
          const lo=Math.min(i,j),hi=Math.max(i,j);if(this.neighborSet.has(lo+','+hi))continue;
          const q=j*3,vx=this.pos[p]-this.pos[q],vy=this.pos[p+1]-this.pos[q+1],vz=this.pos[p+2]-this.pos[q+2],d2=vx*vx+vy*vy+vz*vz;
          if(d2>=minD2||d2<1e-12)continue;
          const d=Math.sqrt(d2),wa=this.invMass[i],wb=this.invMass[j],den=wa+wb;if(den<=0)continue;
          const c=(minD-d)/(d*den)*.35,cx=vx*c,cy=vy*c,cz=vz*c;
          this.pos[p]+=wa*cx;this.pos[p+1]+=wa*cy;this.pos[p+2]+=wa*cz;
          this.pos[q]-=wb*cx;this.pos[q+1]-=wb*cy;this.pos[q+2]-=wb*cz;count++;
        }
      }
      const kk=key(ix,iy,iz);let arr=grid.get(kk);if(!arr)grid.set(kk,arr=[]);arr.push(i);
    }
    return count;
  }
  _windAt(x,y,z){
    const b=this.settings.wind,scale=this.settings.windScale;
    let wx=b[0]*scale,wy=b[1]*scale,wz=b[2]*scale;
    const P=this.settings.windProfile;
    if(!P?.enabled)return[wx,wy,wz];
    const base=Math.hypot(wx,wy,wz),inv=base>1e-8?1/base:0;
    const dx=inv?wx*inv:0,dy=inv?wy*inv:0,dz=inv?wz*inv:1;
    // Multi-frequency, deterministic gust. Clamp the along-wind speed to
    // non-negative so a gust never flips the prevailing direction.
    if(P.gustMps){
      const t=this._simTime,om=2*Math.PI*Math.max(.01,P.gustHz||.35),ph=P.phase||0;
      const g=P.gustMps*(.56*Math.sin(om*t+ph)+.29*Math.sin(om*.47*t+1.73+ph*.31)+.15*Math.sin(om*1.91*t+.43-ph*.17));
      const along=Math.max(0,base+g);
      wx=dx*along;wy=dy*along;wz=dz*along;
    }
    if(P.verticalShear&&base>1e-8){
      // Reference around torso height (~1.0 m); bounded to avoid exploding
      // high/low vertices when a character changes scale.
      const sh=1+Math.max(-.45,Math.min(.45,P.verticalShear*(y-1.0)));
      wx*=sh;wy*=sh;wz*=sh;
    }
    if(P.turbulenceMps){
      const L=Math.max(.08,P.turbulenceScaleM||.45),k=1/L,t=this._simTime*(2*Math.PI*Math.max(.01,P.turbulenceHz||.85)),ph=P.phase||0;
      // Three coherent incommensurate waves. Project most of the fluctuation
      // away from the prevailing direction so it reads as eddies/flutter
      // rather than random changes in mean wind speed.
      let tx=Math.sin(2.17*x*k+1.13*y*k+.71*z*k+t+ph)+.45*Math.sin(-.63*x*k+1.57*z*k-t*.61+1.2);
      let ty=Math.sin(-.83*x*k+1.91*y*k+1.37*z*k+t*1.31+.7)+.40*Math.sin(1.29*x*k-.91*z*k+t*.47+2.1);
      let tz=Math.sin(1.47*x*k-.67*y*k+2.03*z*k-t*.79+1.4)+.35*Math.sin(.77*y*k+1.61*z*k+t*.53+.2);
      tx/=1.45;ty/=1.40;tz/=1.35;
      if(base>1e-8){
        const q=tx*dx+ty*dy+tz*dz;
        tx-=q*dx*.72;ty-=q*dy*.72;tz-=q*dz*.72;
      }
      const a=P.turbulenceMps*.57735026919;
      wx+=tx*a;wy+=ty*a;wz+=tz*a;
    }
    return[wx,wy,wz];
  }
  _addAero(){
    const w0=this.settings.wind,baseMag=Math.hypot(w0[0],w0[1],w0[2])*this.settings.windScale;
    const P=this.settings.windProfile;
    if(baseMag<1e-6&&!(P?.enabled&&(P.gustMps||P.turbulenceMps)))return;
    const rho=this.settings.rho,cdN=this.settings.cdN,cdT=this.settings.cdT;
    for(let k=0;k<this.indices.length;k+=3){
      const ia=this.indices[k],ib=this.indices[k+1],ic=this.indices[k+2],a=ia*3,b=ib*3,c=ic*3;
      const abx=this.pos[b]-this.pos[a],aby=this.pos[b+1]-this.pos[a+1],abz=this.pos[b+2]-this.pos[a+2];
      const acx=this.pos[c]-this.pos[a],acy=this.pos[c+1]-this.pos[a+1],acz=this.pos[c+2]-this.pos[a+2];
      let nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx,cr=Math.hypot(nx,ny,nz);if(cr<1e-10)continue;
      const area=.5*cr;nx/=cr;ny/=cr;nz/=cr;
      const cx=(this.pos[a]+this.pos[b]+this.pos[c])/3,cy=(this.pos[a+1]+this.pos[b+1]+this.pos[c+1])/3,cz=(this.pos[a+2]+this.pos[b+2]+this.pos[c+2])/3;
      const ww=this._windAt(cx,cy,cz),wx0=ww[0],wy0=ww[1],wz0=ww[2];
      const cvx=(this.vel[a]+this.vel[b]+this.vel[c])/3,cvy=(this.vel[a+1]+this.vel[b+1]+this.vel[c+1])/3,cvz=(this.vel[a+2]+this.vel[b+2]+this.vel[c+2])/3;
      const rvx=wx0-cvx,rvy=wy0-cvy,rvz=wz0-cvz,vn=rvx*nx+rvy*ny+rvz*nz;
      const tx=rvx-vn*nx,ty=rvy-vn*ny,tz=rvz-vn*nz,vt=Math.hypot(tx,ty,tz);
      const fn=.5*rho*cdN*area*vn*Math.abs(vn),ft=.5*rho*cdT*area*vt*vt;
      let fx=fn*nx,fy=fn*ny,fz=fn*nz;
      if(vt>1e-8){fx+=ft*tx/vt;fy+=ft*ty/vt;fz+=ft*tz/vt}
      for(const vi of [ia,ib,ic]){const p=vi*3,s=this.invMass[vi]/3;this.acc[p]+=fx*s;this.acc[p+1]+=fy*s;this.acc[p+2]+=fz*s}
    }
  }
  _contactHit(i,maxDist){
    const p=i*3,ti=this.contactTri?.[i]??-1;
    let h=ti>=0?this.bodyBVH.closestPointNeighborhood(this.pos[p],this.pos[p+1],this.pos[p+2],ti,this.settings.localContactRings):null;
    const baseEvery=Math.max(1,(this.runtimeBudget?.globalContactEvery??this.settings.globalContactEvery)|0);
    const every=i>=this.collar.midStart?Math.min(baseEvery,1):baseEvery;
    const forceGlobal=((i+this._stepIndex*23)%every)===0;
    // The rest-surface carrier is O(1) and is normally the correct collision
    // face. Periodic global queries still catch hands, opposite limbs and
    // topology crossings that are not represented by that carrier.
    if(forceGlobal||!h){
      const g=this.bodyBVH.closestPoint(this.pos[p],this.pos[p+1],this.pos[p+2],maxDist);
      if(g&&(!h||g.d2<h.d2)){h=g;if(this.contactTri)this.contactTri[i]=g.ti}
    }
    return{h,forceGlobal};
  }
  _collideVertices(dt){
    if(!this.settings.collision)return 0;
    let contacts=0,ccd=0;
    const shellPasses=Math.max(1,Math.floor(this.settings.collisionPasses||1));
    for(let pass=0;pass<shellPasses;pass++)for(let i=0;i<this.shellVertexCount;i++){
      const p=i*3,margin=this.contactMargin[i];
      let {h,forceGlobal}=this._contactHit(i,.075);
      const move=Math.hypot(this.pos[p]-this.prev[p],this.pos[p+1]-this.prev[p+1],this.pos[p+2]-this.prev[p+2]);
      if(pass===0&&this.settings.ccd&&this.settings.globalCCD&&move>.0015&&(forceGlobal||move>.012)){
        const sw=this.bodyBVH.sweepSegment(this.prev[p],this.prev[p+1],this.prev[p+2],this.pos[p],this.pos[p+1],this.pos[p+2],{pad:margin});
        if(sw){
          const startHit=this.bodyBVH.closestPoint(this.prev[p],this.prev[p+1],this.prev[p+2],.06);
          if(!startHit||startHit.signed>-.002){
            this.pos[p]=sw.x+sw.nx*margin;this.pos[p+1]=sw.y+sw.ny*margin;this.pos[p+2]=sw.z+sw.nz*margin;
            h={...sw,qx:sw.x,qy:sw.y,qz:sw.z,signed:margin,d2:margin*margin};if(this.contactTri)this.contactTri[i]=sw.ti;ccd++;
          }
        }
      }
      if(h&&h.signed<margin){
        const c=Math.min(this.settings.collisionMaxCorrection??.014,margin-h.signed);
        this.pos[p]+=h.nx*c;this.pos[p+1]+=h.ny*c;this.pos[p+2]+=h.nz*c;contacts++;
      }
      if(h&&h.signed<margin*1.6){
        this.contactFlags[i]=1;this.contactNormal[p]=h.nx;this.contactNormal[p+1]=h.ny;this.contactNormal[p+2]=h.nz;
        this.contactVelocity[p]=h.vx;this.contactVelocity[p+1]=h.vy;this.contactVelocity[p+2]=h.vz;
        this.contactDepth[i]=Math.max(this.contactDepth[i],Math.max(0,margin-h.signed));
        this.clearance[i]=Math.sqrt(Math.max(0,h.d2||0));
      }else if(pass===shellPasses-1)this.clearance[i]=h?Math.sqrt(Math.max(0,h.d2)):.075;
    }
    for(let pass=0;pass<3;pass++)for(let i=this.collar.midStart;i<this.vertexCount;i++){
      const p=i*3,margin=this.contactMargin[i],q=this._contactHit(i,.050),h=q.h;
      if(h&&h.signed<margin){const c=Math.min(.006,margin-h.signed);this.pos[p]+=h.nx*c;this.pos[p+1]+=h.ny*c;this.pos[p+2]+=h.nz*c;contacts++}
    }
    this.diag.ccd+=ccd;return contacts;
  }
  _collideInterior(){
    if(!this.settings.collision||!this.settings.interiorContact)return 0;
    // M15 virtual-contact tessellation. Physical vertices stay low-resolution,
    // but sleeve triangles are sampled at their centroid + edge midpoints every
    // substep so an arm cannot tunnel through the interior of a coarse cloth
    // triangle while all three physical vertices remain outside the Body.
    const shellN=this.shellVertexCount,acc=new Float32Array(shellN*3),hits=new Uint16Array(shellN);
    const centroidOnly=((this._stepIndex%4)===0);
    let added=0;
    const sample=(ia,ib,ic,wa,wb,wc,sleeve)=>{
      const a=ia*3,b=ib*3,c=ic*3;
      const x=this.pos[a]*wa+this.pos[b]*wb+this.pos[c]*wc;
      const y=this.pos[a+1]*wa+this.pos[b+1]*wb+this.pos[c+1]*wc;
      const z=this.pos[a+2]*wa+this.pos[b+2]*wb+this.pos[c+2]*wc;
      // Sleeve virtual contacts deliberately use a global narrow-phase query:
      // a carrier triangle can be the wrong patch after large arm motion.
      let h=this.bodyBVH.closestPoint(x,y,z,sleeve?.040:.030);
      if(!h)return;
      const margin=this.contactMargin[ia]*wa+this.contactMargin[ib]*wb+this.contactMargin[ic]*wc;
      if(h.signed>=margin)return;
      const depth=Math.min(sleeve?.0060:.0045,margin-h.signed);
      const den=wa*wa+wb*wb+wc*wc||1;
      const add=(i,w)=>{
        if(w<=0)return;
        const q=i*3,f=w/den;
        acc[q]+=h.nx*depth*f;acc[q+1]+=h.ny*depth*f;acc[q+2]+=h.nz*depth*f;hits[i]++;
      };
      add(ia,wa);add(ib,wb);add(ic,wc);added++;
    };
    for(let k=0;k<this.indices.length;k+=3){
      const ia=this.indices[k],ib=this.indices[k+1],ic=this.indices[k+2];
      if(ia>=shellN||ib>=shellN||ic>=shellN)continue;
      const sleeve=(this.componentIds[ia]===0||this.componentIds[ia]===4)
        &&(this.componentIds[ib]===0||this.componentIds[ib]===4)
        &&(this.componentIds[ic]===0||this.componentIds[ic]===4);
      if(!sleeve&&!centroidOnly)continue;
      if(!sleeve&&Math.min(this.clearance[ia],this.clearance[ib],this.clearance[ic])>.016)continue;
      sample(ia,ib,ic,1/3,1/3,1/3,sleeve);
      if(sleeve){
        sample(ia,ib,ic,.5,.5,0,true);
        sample(ia,ib,ic,0,.5,.5,true);
        sample(ia,ib,ic,.5,0,.5,true);
      }
    }
    for(let i=0;i<shellN;i++){
      const n=hits[i];if(!n)continue;
      const p=i*3,dx=acc[p]/n,dy=acc[p+1]/n,dz=acc[p+2]/n,d=Math.hypot(dx,dy,dz);
      const cap=.0060,sc=d>cap?cap/d:1;
      this.pos[p]+=dx*sc;this.pos[p+1]+=dy*sc;this.pos[p+2]+=dz*sc;
    }
    return added;
  }

  _projectSafetyProxy(full=false){
    const proxy=this.bodySafetyProxy;if(!proxy||!this.settings.safetyProxy)return 0;
    const margin=Math.max(0,this.settings.safetyMargin||.001),near=this.settings.safetyNearClearance??.020;
    const doneGroups=new Set();let corrected=0,tests=0,maxDepth=0;
    const shift=(i,dx,dy,dz)=>{const p=i*3;this.pos[p]+=dx;this.pos[p+1]+=dy;this.pos[p+2]+=dz;this.prev[p]+=dx;this.prev[p+1]+=dy;this.prev[p+2]+=dz};
    for(let i=0;i<this.shellVertexCount;i++){
      if(!full&&!this.contactFlags[i]&&this.clearance[i]>near)continue;
      const gi=this.shellSeamGroupIndex?.[i]??-1;if(gi>=0&&doneGroups.has(gi))continue;
      const p=i*3;tests++;
      const q=proxy.projectPointOutside(this.pos[p],this.pos[p+1],this.pos[p+2],margin,.25);if(!q)continue;
      maxDepth=Math.max(maxDepth,q.depth||0);
      if(gi>=0){doneGroups.add(gi);for(const v of this.shellSeamGroups[gi])shift(v,q.dx,q.dy,q.dz)}
      else shift(i,q.dx,q.dy,q.dz);
      corrected++;
    }
    if(corrected)this._hardWeldShell(1);
    this.diag.safetyTests+=tests;this.diag.safetyCorrections+=corrected;this.diag.safetyMaxDepthM=Math.max(this.diag.safetyMaxDepthM,maxDepth);
    return corrected;
  }
  _applyContactVelocity(dt){
    const muS=clamp(this.settings.skinFrictionStatic??.55,0,1.5);
    const muD=clamp(this.settings.skinFrictionDynamic??this.settings.friction??.40,0,muS);
    const stickEps=Math.max(0,this.settings.skinStickSpeedMps??.025);
    const depthGain=Math.max(0,this.settings.skinFrictionDepthGain??.35);
    const gx=this.settings.gravity[0]*this.settings.gravityScale,gy=this.settings.gravity[1]*this.settings.gravityScale,gz=this.settings.gravity[2]*this.settings.gravityScale;
    let stat=0,dyn=0,removed=0;
    for(let i=0;i<this.shellVertexCount;i++)if(this.contactFlags[i]){
      const p=i*3,nx=this.contactNormal[p],ny=this.contactNormal[p+1],nz=this.contactNormal[p+2],bx=this.contactVelocity[p],by=this.contactVelocity[p+1],bz=this.contactVelocity[p+2];
      let rx=this.vel[p]-bx,ry=this.vel[p+1]-by,rz=this.vel[p+2]-bz;
      const vn=rx*nx+ry*ny+rz*nz;
      let tx=rx-vn*nx,ty=ry-vn*ny,tz=rz-vn*nz,vt=Math.hypot(tx,ty,tz);
      // Normal impulse budget in velocity units. Closing velocity, geometric
      // collision correction, and gravity-supported contact all contribute.
      const closing=Math.max(0,-vn);
      const supported=Math.max(0,-(gx*nx+gy*ny+gz*nz))*dt;
      const depthBudget=(this.contactDepth[i]||0)/Math.max(1e-6,dt)*depthGain;
      const jn=Math.max(closing,supported,depthBudget);
      const muSi=clamp(this.vertexSkinFrictionStatic?.[i]??muS,0,1.5);
      const muDi=clamp(this.vertexSkinFrictionDynamic?.[i]??muD,0,muSi);
      const staticLimit=muSi*jn;
      if(vt<=stickEps+staticLimit){
        removed+=vt;tx=ty=tz=0;vt=0;stat++;
      }else if(vt>1e-9&&muDi>0&&jn>0){
        const cut=Math.min(vt,muDi*jn),s=(vt-cut)/vt;
        tx*=s;ty*=s;tz*=s;removed+=cut;dyn++;
      }
      // Do not allow friction to create normal suction: retain only separating
      // relative normal velocity. Moving-skin velocity is always carried.
      const vo=Math.max(0,vn);
      this.vel[p]=bx+nx*vo+tx;this.vel[p+1]=by+ny*vo+ty;this.vel[p+2]=bz+nz*vo+tz;
    }
    this.diag.frictionStaticContacts+=stat;this.diag.frictionDynamicContacts+=dyn;this.diag.frictionSlipRemovedMps+=removed;
  }
  _substep(dt){
    this.diag.substeps++;this._simTime+=dt;this._updateCarrierTargets();
    this.contactFlags.fill(0);this.contactDepth.fill(0);
    this.acc.fill(0);
    const gx=this.settings.gravity[0]*this.settings.gravityScale,gy=this.settings.gravity[1]*this.settings.gravityScale,gz=this.settings.gravity[2]*this.settings.gravityScale;
    for(let i=0;i<this.vertexCount;i++){
      if(i>=this.collar.outerStart&&i<this.collar.midStart)continue;
      const p=i*3;this.acc[p]+=gx;this.acc[p+1]+=gy;this.acc[p+2]+=gz;
      if(i<this.shellVertexCount&&this.carrierTri[i]>=0){
        const sleeve=this.componentIds[i]===0||this.componentIds[i]===4;
        const g=sleeve?this.settings.sleeveShapeGain:this.settings.shapeGain;
        const hz=sleeve?this.settings.sleeveShapeHz:this.settings.shapeHz;
        const omega=2*Math.PI*hz,fw=sleeve&&this.sleeveFollowWeight?this.sleeveFollowWeight[i]:1,k=omega*omega*g*fw;
        const tx=sleeve&&this.sleeveTarget?this.sleeveTarget[p]:this.carrierTarget[p],ty=sleeve&&this.sleeveTarget?this.sleeveTarget[p+1]:this.carrierTarget[p+1],tz=sleeve&&this.sleeveTarget?this.sleeveTarget[p+2]:this.carrierTarget[p+2];
        this.acc[p]+=(tx-this.pos[p])*k;this.acc[p+1]+=(ty-this.pos[p+1])*k;this.acc[p+2]+=(tz-this.pos[p+2])*k;
      }
    }
    const pr=this.predictionResidual,pc=this.predictionConfidence;
    if(pr&&pc>=this.settings.predictionMinConfidence){
      const omega=2*Math.PI*this.settings.predictionHz;
      const k=omega*omega*this.settings.predictionGain*pc,maxA=this.settings.predictionMaxAccel;
      for(let i=0;i<this.shellVertexCount;i++){
        const p=i*3;
        let ax=(this.carrierTarget[p]+pr[p]-this.pos[p])*k;
        let ay=(this.carrierTarget[p+1]+pr[p+1]-this.pos[p+1])*k;
        let az=(this.carrierTarget[p+2]+pr[p+2]-this.pos[p+2])*k;
        const a=Math.hypot(ax,ay,az);
        if(a>maxA){const s=maxA/a;ax*=s;ay*=s;az*=s}
        this.acc[p]+=ax;this.acc[p+1]+=ay;this.acc[p+2]+=az;
      }
      this.diag.predictionSubsteps++;
    }
    this._addAero();
    for(let i=0;i<this.vertexCount;i++){
      if(i>=this.collar.outerStart&&i<this.collar.midStart)continue;
      const p=i*3;this.prev[p]=this.pos[p];this.prev[p+1]=this.pos[p+1];this.prev[p+2]=this.pos[p+2];
      this.vel[p]+=this.acc[p]*dt;this.vel[p+1]+=this.acc[p+1]*dt;this.vel[p+2]+=this.acc[p+2]*dt;
      this.pos[p]+=this.vel[p]*dt;this.pos[p+1]+=this.vel[p+1]*dt;this.pos[p+2]+=this.vel[p+2]*dt;
    }
    this._driveCollarOuter();
    const its=Math.max(2,Math.floor(this.runtimeBudget?.iterations??this.settings.iterations));
    for(let it=0;it<its;it++){
      this._solvePairs(this.edges,this.edgeRestAuthored||this.edgeRest,this.settings.stretch);
      if(this.settings.bend>0)this._solvePairs(this.bends,this.bendRestAuthored||this.bendRest,this.settings.bend);
      this._hardWeldShell(1);this._driveCollarOuter();this._solveCollarFold(.18,.10);
    }
    const promo=this.runtimeBudget?.promotionMask,extra=this.runtimeBudget?.promotionExtraIterations||0;
    for(let it=0;it<extra;it++){
      this._solvePairsMasked(this.edges,this.edgeRestAuthored||this.edgeRest,this.settings.stretch,promo);
      if(this.settings.bend>0)this._solvePairsMasked(this.bends,this.bendRestAuthored||this.bendRest,this.settings.bend,promo);
      this._hardWeldShell(1);this.diag.promotionIterations++;
    }
    this._solvePairs(this.edges,this.edgeRest,Math.max(.992,this.settings.stretch));
    this._hardWeldShell(2);
    this.diag.interior+=this._collideInterior();
    this._hardWeldShell(2);this._driveCollarOuter();this._solveCollarFold(.28,.16);
    if((this._stepIndex%Math.max(1,this.runtimeBudget?.selfCollisionEvery||4))===0)this.diag.selfContacts+=this._selfCollision();
    this._hardWeldShell(1);this._applyRetention();this._applySleeveOccupancy();this._driveCollarOuter();
    this.diag.contacts+=this._collideVertices(dt);
    const postIts=Math.max(0,Math.floor(this.settings.postContactIterations||0));
    for(let it=0;it<postIts;it++){
      this._solvePairs(this.edges,this.edgeRest,Math.max(.995,this.settings.stretch));
      if(this.settings.bend>0)this._solvePairs(this.bends,this.bendRest,this.settings.bend*.6);
      this._hardWeldShell(1);this._applySleeveOccupancy();this._driveCollarOuter();
      this.diag.contacts+=this._collideVertices(dt);
    }
    this._hardWeldShell(1);this.diag.contacts+=this._collideSeamGroups();this._driveCollarOuter();
    const polish=Math.max(0,Math.floor(this.settings.collisionPolishPasses||0));
    for(let pass=0;pass<polish;pass++){
      this.diag.contacts+=this._collideVertices(dt);
      this._hardWeldShell(1);this.diag.contacts+=this._collideSeamGroups();this._driveCollarOuter();
    }
    // Final M15 sleeve-topology polish. Collision work that follows the main
    // occupancy projection can otherwise leave a short sleeve on the wrong
    // side of the upper arm at the substep boundary. Re-apply the low-
    // dimensional sleeve guide, then immediately resolve both virtual triangle
    // contacts and vertex contacts so the guide cannot pull cloth through skin.
    this._applySleeveOccupancy();
    this.diag.interior+=this._collideInterior();
    this.diag.contacts+=this._collideVertices(dt);
    this._hardWeldShell(1);
    const damp=this.settings.damping,maxS=this.settings.maxSpeed;
    for(let i=0;i<this.vertexCount;i++){
      const p=i*3;
      if(i>=this.collar.outerStart&&i<this.collar.midStart){this.vel[p]=(this.pos[p]-this.prev[p])/dt;this.vel[p+1]=(this.pos[p+1]-this.prev[p+1])/dt;this.vel[p+2]=(this.pos[p+2]-this.prev[p+2])/dt;continue}
      this.vel[p]=(this.pos[p]-this.prev[p])/dt*damp;this.vel[p+1]=(this.pos[p+1]-this.prev[p+1])/dt*damp;this.vel[p+2]=(this.pos[p+2]-this.prev[p+2])/dt*damp;
      const s=Math.hypot(this.vel[p],this.vel[p+1],this.vel[p+2]);if(s>maxS){const q=maxS/s;this.vel[p]*=q;this.vel[p+1]*=q;this.vel[p+2]*=q}
    }
    this._applyContactVelocity(dt);this._stepIndex++;
  }
  stepFrame(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.05);this._accumulator+=dt;
    const h=this.settings.substep;let n=0;
    while(this._accumulator>=h&&n<this.settings.maxSubsteps){this._substep(h);this._accumulator-=h;n++}
    if(n===0&&this._accumulator>h*.45){this._substep(this._accumulator);this._accumulator=0;n=1}
    if(this.bodySafetyProxy&&this.settings.safetyProxy){
      const every=Math.max(1,Math.floor(this.settings.safetyFullEvery||8)),full=(this._frameIndex%every)===0;
      // Converge the closed-manifold safety projection. A correction to one
      // vertex (or welded group) can move a neighboring point across the
      // manifold after that neighbor was already tested in the same sweep.
      // Iterate only on full audits and stop as soon as a sweep is clean.
      let c=this._projectSafetyProxy(full);
      if(full)for(let pass=1;pass<4&&c;pass++)c=this._projectSafetyProxy(true);
    }
    this._frameIndex++;this.syncRender();
  }
  resetToCurrentPose(){
    this._updateCarrierTargets();
    for(let i=0;i<this.shellVertexCount;i++){const p=i*3;this.pos[p]=this.carrierTarget[p];this.pos[p+1]=this.carrierTarget[p+1];this.pos[p+2]=this.carrierTarget[p+2]}
    // Free rib rows begin from the sewn row plus the fitted fold vectors.
    this._driveCollarOuter();
    for(let j=0;j<this.collar.ringCount;j++){
      const o=(this.collar.outerStart+j)*3,m=(this.collar.midStart+j)*3,n=(this.collar.innerStart+j)*3,r=j*3;
      this.pos[m]=this.pos[o]+this.collarMidRel[r];this.pos[m+1]=this.pos[o+1]+this.collarMidRel[r+1];this.pos[m+2]=this.pos[o+2]+this.collarMidRel[r+2];
      this.pos[n]=this.pos[o]+this.collarInnerRel[r];this.pos[n+1]=this.pos[o+1]+this.collarInnerRel[r+1];this.pos[n+2]=this.pos[o+2]+this.collarInnerRel[r+2];
    }
    this.prev.set(this.pos);this.vel.fill(0);this._accumulator=0;this._simTime=0;this.syncRender();
  }
  reanchorToCurrentBody({safetyPasses=2}={}){
    // Clothing-only discontinuity recovery. Rebuild the garment from its
    // persistent Body carriers with zero momentum, then use the watertight
    // proxy as the deep-penetration authority. No character state is written.
    this.resetToCurrentPose();
    const passes=Math.max(0,Math.min(6,Math.floor(safetyPasses||0)));
    for(let pass=0;pass<passes;pass++){
      this._projectSafetyProxy(true);
      this._hardWeldShell(1);this._driveCollarOuter();
    }
    this.prev.set(this.pos);this.vel.fill(0);this._accumulator=0;
    this.clearCausalPrediction();this.syncRender();return this;
  }
  setSkinFriction(muStatic=.55,muDynamic=.40,{stickSpeedMps=null,depthGain=null}={}){
    const ms=clamp(Number(muStatic)||0,0,1.5),md=clamp(Number(muDynamic)||0,0,ms);
    this.settings.skinFrictionStatic=ms;this.settings.skinFrictionDynamic=md;
    if(Number.isFinite(stickSpeedMps))this.settings.skinStickSpeedMps=Math.max(0,stickSpeedMps);
    if(Number.isFinite(depthGain))this.settings.skinFrictionDepthGain=Math.max(0,depthGain);
    return{static:ms,dynamic:md,stickSpeedMps:this.settings.skinStickSpeedMps,depthGain:this.settings.skinFrictionDepthGain};
  }
  setWind(speed=0,yawDeg=0,pitchDeg=0){
    const y=yawDeg*Math.PI/180,p=pitchDeg*Math.PI/180,c=Math.cos(p);
    this.settings.wind=[Math.sin(y)*c*speed,Math.sin(p)*speed,Math.cos(y)*c*speed];
  }
  setWindProfile({speed=null,yawDeg=0,pitchDeg=0,gustMps=0,gustHz=.35,turbulenceMps=0,turbulenceScaleM=.45,turbulenceHz=.85,verticalShear=0,phase=0}={}){
    if(Number.isFinite(speed))this.setWind(speed,yawDeg,pitchDeg);
    this.settings.windProfile={
      enabled:Math.abs(gustMps)>1e-8||Math.abs(turbulenceMps)>1e-8||Math.abs(verticalShear)>1e-8,
      gustMps:Math.max(0,Number(gustMps)||0),gustHz:Math.max(.01,Number(gustHz)||.35),
      turbulenceMps:Math.max(0,Number(turbulenceMps)||0),turbulenceScaleM:Math.max(.08,Number(turbulenceScaleM)||.45),
      turbulenceHz:Math.max(.01,Number(turbulenceHz)||.85),verticalShear:Number(verticalShear)||0,phase:Number(phase)||0
    };
    return this.settings.windProfile;
  }
  clearWindProfile(){
    this.settings.windProfile={enabled:false,gustMps:0,gustHz:.35,turbulenceMps:0,turbulenceScaleM:.45,turbulenceHz:.85,verticalShear:0,phase:0};
  }
  sampleWindAt(x,y,z){return this._windAt(x,y,z)}
  computeNormals(){vertexNormals(this.pos,this.indices,this.renderNormals);return this.renderNormals}
  syncRender(){for(let i=0;i<this.pos.length;i++)this.renderPositions[i]=this.pos[i];this.computeNormals()}
  metrics(){
    const strains=[];
    for(let k=0;k<this.edges.length;k+=2){
      const ia=this.edges[k],ib=this.edges[k+1];if(ia>=this.shellVertexCount||ib>=this.shellVertexCount)continue;
      const rl=this.edgeRest[k/2];if(rl<.001)continue;
      const a=ia*3,b=ib*3,l=Math.hypot(this.pos[b]-this.pos[a],this.pos[b+1]-this.pos[a+1],this.pos[b+2]-this.pos[a+2]);strains.push(Math.abs(l/rl-1));
    }
    let seamMax=0,seamMean=0,seamN=0;
    for(let k=0;k<this.seams.length;k+=2){
      const ia=this.seams[k],ib=this.seams[k+1];if(ia>=this.shellVertexCount||ib>=this.shellVertexCount)continue;
      const a=ia*3,b=ib*3,d=Math.hypot(this.pos[b]-this.pos[a],this.pos[b+1]-this.pos[a+1],this.pos[b+2]-this.pos[a+2]);seamMean+=d;seamMax=Math.max(seamMax,d);seamN++;
    }
    const sleeveErr={left:[],right:[]};
    if(this.sleeveTarget)for(let i=0;i<this.shellVertexCount;i++){
      const cid=this.componentIds[i];if(cid!==0&&cid!==4)continue;
      const p=i*3,d=Math.hypot(this.pos[p]-this.sleeveTarget[p],this.pos[p+1]-this.sleeveTarget[p+1],this.pos[p+2]-this.sleeveTarget[p+2]);
      sleeveErr[cid===0?'left':'right'].push(d);
    }
    const sleeveDeviation={
      left:{p95M:percentile(sleeveErr.left,.95),maxM:sleeveErr.left.length?Math.max(...sleeveErr.left):0},
      right:{p95M:percentile(sleeveErr.right,.95),maxM:sleeveErr.right.length?Math.max(...sleeveErr.right):0}
    };
    let ribErr=[],maxSpeed=0,finite=true;
    for(let j=0;j<this.collar.ringCount;j++){
      const o=(this.collar.outerStart+j)*3,m=(this.collar.midStart+j)*3,n=(this.collar.innerStart+j)*3,r=j*3;
      ribErr.push(Math.hypot((this.pos[m]-this.pos[o])-this.collarMidRel[r],(this.pos[m+1]-this.pos[o+1])-this.collarMidRel[r+1],(this.pos[m+2]-this.pos[o+2])-this.collarMidRel[r+2]));
      ribErr.push(Math.hypot((this.pos[n]-this.pos[o])-this.collarInnerRel[r],(this.pos[n+1]-this.pos[o+1])-this.collarInnerRel[r+1],(this.pos[n+2]-this.pos[o+2])-this.collarInnerRel[r+2]));
    }
    for(let i=0;i<this.vertexCount;i++){const p=i*3,s=Math.hypot(this.vel[p],this.vel[p+1],this.vel[p+2]);maxSpeed=Math.max(maxSpeed,s);if(!Number.isFinite(this.pos[p]+this.pos[p+1]+this.pos[p+2]+s))finite=false}
    return{
      finite,shellP95Strain:percentile(strains,.95),shellP99Strain:percentile(strains,.99),
      seamMeanM:seamN?seamMean/seamN:0,seamMaxM:seamMax,
      ribFoldP95M:percentile(ribErr,.95),ribFoldMaxM:ribErr.length?Math.max(...ribErr):0,
      maxSpeedMps:maxSpeed,restAreaM2:this.restArea,
      contacts:this.diag.contacts,ccd:this.diag.ccd,interiorContacts:this.diag.interior,selfContacts:this.diag.selfContacts,retentionCorrections:this.diag.retentionCorrections,
      sleeveOccupancy:{corrections:this.diag.sleeveGuardCorrections,maxCarrierErrorM:this.diag.sleeveGuardMaxErrorM,deviation:sleeveDeviation},
      skinFriction:{staticContacts:this.diag.frictionStaticContacts,dynamicContacts:this.diag.frictionDynamicContacts,slipRemovedMps:this.diag.frictionSlipRemovedMps,muStatic:this.settings.skinFrictionStatic,muDynamic:this.settings.skinFrictionDynamic},
      prediction:{active:!!this.predictionResidual,confidence:this.predictionConfidence,source:this.predictionSource,substeps:this.diag.predictionSubsteps},
      adaptiveBudget:{...this.runtimeBudget,promotionMask:this.runtimeBudget?.promotionMask?`${this.runtimeBudget.promotionMask.reduce((a,b)=>a+(b?1:0),0)} vertices`:null,promotionIterations:this.diag.promotionIterations},
      safetyProxy:{enabled:!!this.bodySafetyProxy&&!!this.settings.safetyProxy,tests:this.diag.safetyTests,corrections:this.diag.safetyCorrections,maxDepthM:this.diag.safetyMaxDepthM,proxy:this.bodySafetyProxy?.stats?.()||null},
      bodyBVH:this.bodyBVH.stats()
    };
  }
}

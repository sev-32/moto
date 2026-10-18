import {DynamicTriangleBVH} from '../../../clothing-safe/m26/source/public/src/clothing/dynamicBvh.js';

/**
 * Physical-shell inter-garment contact for the additive Clothing Engine R1.
 *
 * Two separations are deliberately distinct:
 *   - soft gap: comfort/contact thickness used during ordinary coupled solve;
 *   - hard barrier: topology closure used at the frame boundary.  It only
 *     prevents the outer garment crossing behind the inner shell and therefore
 *     does not re-inject strain merely to recover a cosmetic millimetre gap.
 */
export class InterGarmentContact {
  constructor(innerSolver,outerSolver,{gapM=.0015,innerVisualEnvelopeM=0,hardBarrierM=.00005,maxDistanceM=.018,maxCorrectionM=.0060,passes=2,hardPasses=1,frictionStatic=.42,frictionDynamic=.30,enabled=true,label='layer-contact',localRings=2,materialReconcileIterations=1,closureCycles=3}={}){
    this.inner=innerSolver;this.outer=outerSolver;
    this.settings={gapM,innerVisualEnvelopeM,hardBarrierM,maxDistanceM,maxCorrectionM,passes,hardPasses,frictionStatic,frictionDynamic,enabled,label,localRings,materialReconcileIterations,closureCycles};
    this.bvh=new DynamicTriangleBVH(innerSolver.indices,innerSolver.renderPositions,{leafSize:10});
    this.candidateIds=this._buildCandidateIds();
    this.candidateMask=new Uint8Array(this.outer.shellVertexCount);for(const i of this.candidateIds)this.candidateMask[i]=1;
    this.candidateTriangles=this._buildCandidateTriangles();
    this.vertexSeed=new Int32Array(outerSolver.shellVertexCount);this.vertexSeed.fill(-1);
    this.virtualSeed=new Int32Array(this.candidateTriangles.length*4);this.virtualSeed.fill(-1);
    this.diag={frames:0,contacts:0,penetrations:0,virtualContacts:0,virtualBehind:0,maxCorrectionM:0,minSignedM:Infinity,frictionStatic:0,frictionDynamic:0,localQueries:0,globalQueries:0,seedFallbacks:0,softSolves:0,hardSolves:0};
    this.lastSolve=null;
    this._initializeSeeds();
  }
  _buildCandidateIds(){
    const P=this.inner.rest||this.inner.renderPositions,O=this.outer.rest||this.outer.renderPositions,pad=this.settings.maxDistanceM;
    let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<this.inner.shellVertexCount;i++){const p=i*3;for(let a=0;a<3;a++){mn[a]=Math.min(mn[a],P[p+a]);mx[a]=Math.max(mx[a],P[p+a]);}}
    const ids=[];for(let i=0;i<this.outer.shellVertexCount;i++){const p=i*3,x=O[p],y=O[p+1],z=O[p+2];if(x>=mn[0]-pad&&x<=mx[0]+pad&&y>=mn[1]-pad&&y<=mx[1]+pad&&z>=mn[2]-pad&&z<=mx[2]+pad)ids.push(i);}return Uint32Array.from(ids);
  }
  _buildCandidateTriangles(){const out=[],I=this.outer.indices,M=this.candidateMask;for(let k=0;k<I.length;k+=3){const a=I[k],b=I[k+1],c=I[k+2];if(a>=M.length||b>=M.length||c>=M.length)continue;if(M[a]||M[b]||M[c])out.push(k/3);}return Uint32Array.from(out);}
  _refit(dt){this.inner.computeNormals();this.bvh.refit(this.inner.renderPositions,this.inner.renderNormals,this.inner.prev,dt);}
  _querySeeded(x,y,z,seed,maxDist){
    let h=null;const rings=Math.max(0,Math.min(3,this.settings.localRings|0));
    if(seed>=0){this.diag.localQueries++;h=this.bvh.closestPointNeighborhood(x,y,z,seed,rings,maxDist);}
    if(!h){this.diag.globalQueries++;if(seed>=0)this.diag.seedFallbacks++;h=this.bvh.closestPoint(x,y,z,maxDist);}
    return h;
  }
  _initializeSeeds(){
    this.inner.syncRender();this._refit(1/120);const O=this.outer,S=this.settings,I=O.indices;
    for(const i of this.candidateIds){const p=i*3,h=this.bvh.closestPoint(O.pos[p],O.pos[p+1],O.pos[p+2],S.maxDistanceM);if(h)this.vertexSeed[i]=h.ti;}
    let qi=0;for(const ti of this.candidateTriangles){const k=ti*3,a=I[k],b=I[k+1],c=I[k+2],samples=[[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]];for(const [wa,wb,wc] of samples){const pa=a*3,pb=b*3,pc=c*3,x=O.pos[pa]*wa+O.pos[pb]*wb+O.pos[pc]*wc,y=O.pos[pa+1]*wa+O.pos[pb+1]*wb+O.pos[pc+1]*wc,z=O.pos[pa+2]*wa+O.pos[pb+2]*wb+O.pos[pc+2]*wc,h=this.bvh.closestPoint(x,y,z,S.maxDistanceM);if(h)this.virtualSeed[qi]=h.ti;qi++;}}
  }
  effectiveSoftGapM(){return Math.max(0,(this.settings.gapM||0)+(this.settings.innerVisualEnvelopeM||0));}
  _solveVirtualTriangles({targetGapM,maxCorrectionM,passes=1}){
    const O=this.outer,S=this.settings,I=O.indices;let totalContacts=0,totalBehind=0;
    for(let pass=0;pass<Math.max(1,passes|0);pass++){
      const acc=new Float32Array(O.shellVertexCount*3),hits=new Uint16Array(O.shellVertexCount);let contacts=0,behind=0,qi=0;
      const sample=(ia,ib,ic,wa,wb,wc,seedIndex)=>{const a=ia*3,b=ib*3,c=ic*3,x=O.pos[a]*wa+O.pos[b]*wb+O.pos[c]*wc,y=O.pos[a+1]*wa+O.pos[b+1]*wb+O.pos[c+1]*wc,z=O.pos[a+2]*wa+O.pos[b+2]*wb+O.pos[c+2]*wc,h=this._querySeeded(x,y,z,this.virtualSeed[seedIndex],S.maxDistanceM);if(!h)return;this.virtualSeed[seedIndex]=h.ti;if(h.signed>=targetGapM)return;if(h.signed<0)behind++;const depth=Math.min(maxCorrectionM,targetGapM-h.signed),den=wa*wa+wb*wb+wc*wc||1;const add=(i,w)=>{if(w<=0)return;const p=i*3,f=w/den;acc[p]+=h.nx*depth*f;acc[p+1]+=h.ny*depth*f;acc[p+2]+=h.nz*depth*f;hits[i]++;};add(ia,wa);add(ib,wb);add(ic,wc);contacts++;};
      for(const ti of this.candidateTriangles){const k=ti*3,a=I[k],b=I[k+1],c=I[k+2];sample(a,b,c,1/3,1/3,1/3,qi++);sample(a,b,c,.5,.5,0,qi++);sample(a,b,c,0,.5,.5,qi++);sample(a,b,c,.5,0,.5,qi++);}
      for(let i=0;i<O.shellVertexCount;i++){const n=hits[i];if(!n)continue;const p=i*3,dx=acc[p]/n,dy=acc[p+1]/n,dz=acc[p+2]/n,d=Math.hypot(dx,dy,dz),sc=d>maxCorrectionM?maxCorrectionM/d:1,ox=dx*sc,oy=dy*sc,oz=dz*sc;O.pos[p]+=ox;O.pos[p+1]+=oy;O.pos[p+2]+=oz;O.prev[p]+=ox;O.prev[p+1]+=oy;O.prev[p+2]+=oz;}
      totalContacts+=contacts;totalBehind+=behind;if(!contacts)break;
    }
    this.diag.virtualContacts+=totalContacts;this.diag.virtualBehind+=totalBehind;return{contacts:totalContacts,behind:totalBehind};
  }
  solve(dt,{targetGapM=null,mode='soft',passes=null,applyFriction=null,maxCorrectionM=null}={}){
    if(!this.settings.enabled)return 0;
    this.inner.syncRender();this._refit(dt);const O=this.outer,S=this.settings;
    const hard=mode==='hard';
    const target=Math.max(0,targetGapM??(hard?S.hardBarrierM:this.effectiveSoftGapM()));
    const passCount=Math.max(1,Math.floor(passes??(hard?S.hardPasses:S.passes)??1));
    const cap=Math.max(1e-5,Number(maxCorrectionM??S.maxCorrectionM));
    const friction=applyFriction??!hard;
    let frameContacts=0,frameBehind=0;
    for(let pass=0;pass<passCount;pass++){
      let passContacts=0;
      for(const i of this.candidateIds){const p=i*3,h=this._querySeeded(O.pos[p],O.pos[p+1],O.pos[p+2],this.vertexSeed[i],S.maxDistanceM);if(!h)continue;this.vertexSeed[i]=h.ti;this.diag.minSignedM=Math.min(this.diag.minSignedM,h.signed);if(h.signed>=target)continue;if(h.signed<0){frameBehind++;this.diag.penetrations++;}const depth=target-h.signed,c=Math.min(cap,depth),ox=h.nx*c,oy=h.ny*c,oz=h.nz*c;O.pos[p]+=ox;O.pos[p+1]+=oy;O.pos[p+2]+=oz;this.diag.maxCorrectionM=Math.max(this.diag.maxCorrectionM,c);frameContacts++;passContacts++;this.diag.contacts++;
        if(friction){let rx=O.vel[p]-h.vx,ry=O.vel[p+1]-h.vy,rz=O.vel[p+2]-h.vz;const vn=rx*h.nx+ry*h.ny+rz*h.nz;let tx=rx-vn*h.nx,ty=ry-vn*h.ny,tz=rz-vn*h.nz,vt=Math.hypot(tx,ty,tz);const jn=Math.max(0,-vn)+depth/Math.max(dt,1e-6)*.20,staticLimit=S.frictionStatic*jn;if(vt<=staticLimit+.012){tx=ty=tz=0;this.diag.frictionStatic++;}else if(vt>1e-9){const cut=Math.min(vt,S.frictionDynamic*jn),q=(vt-cut)/vt;tx*=q;ty*=q;tz*=q;this.diag.frictionDynamic++;}const vo=Math.max(0,vn);O.vel[p]=h.vx+h.nx*vo+tx;O.vel[p+1]=h.vy+h.ny*vo+ty;O.vel[p+2]=h.vz+h.nz*vo+tz;O.prev[p]=O.pos[p]-O.vel[p]*dt;O.prev[p+1]=O.pos[p+1]-O.vel[p+1]*dt;O.prev[p+2]=O.pos[p+2]-O.vel[p+2]*dt;}
        else{O.prev[p]+=ox;O.prev[p+1]+=oy;O.prev[p+2]+=oz;}
      }
      if(!passContacts)break;
      this.inner.syncRender();this._refit(dt);
    }
    const virt=this._solveVirtualTriangles({targetGapM:target,maxCorrectionM:cap,passes:passCount});
    if(frameContacts||virt.contacts){O._hardWeldShell?.(1);O.syncRender();}
    this.diag.frames++;if(hard)this.diag.hardSolves++;else this.diag.softSolves++;
    this.lastSolve={mode,targetGapM:target,physicalContacts:frameContacts,physicalBehind:frameBehind,virtualContacts:virt.contacts,virtualBehind:virt.behind};
    return frameContacts+virt.contacts;
  }
  audit({sampleAll=true,targetGapM=null,mode='soft'}={}){
    this.inner.syncRender();this._refit(1/120);const vals=[];let belowGap=0,behind=0,min=Infinity,stride=sampleAll?1:4;
    const hard=mode==='hard',target=Math.max(0,targetGapM??(hard?this.settings.hardBarrierM:this.effectiveSoftGapM()));
    for(let q=0;q<this.candidateIds.length;q+=stride){const i=this.candidateIds[q],p=i*3,h=this.bvh.closestPoint(this.outer.pos[p],this.outer.pos[p+1],this.outer.pos[p+2],this.settings.maxDistanceM);if(!h)continue;vals.push(h.signed);min=Math.min(min,h.signed);if(h.signed<target)belowGap++;if(h.signed<0)behind++;}
    vals.sort((a,b)=>a-b);const pct=q=>vals.length?vals[Math.min(vals.length-1,Math.floor((vals.length-1)*q))]:null;
    let virtualSamples=0,virtualBehind=0,virtualBelowGap=0,virtualMin=Infinity;const I=this.outer.indices,test=(ia,ib,ic,wa,wb,wc)=>{const a=ia*3,b=ib*3,c=ic*3,x=this.outer.pos[a]*wa+this.outer.pos[b]*wb+this.outer.pos[c]*wc,y=this.outer.pos[a+1]*wa+this.outer.pos[b+1]*wb+this.outer.pos[c+1]*wc,z=this.outer.pos[a+2]*wa+this.outer.pos[b+2]*wb+this.outer.pos[c+2]*wc,h=this.bvh.closestPoint(x,y,z,this.settings.maxDistanceM);if(!h)return;virtualSamples++;virtualMin=Math.min(virtualMin,h.signed);if(h.signed<0)virtualBehind++;if(h.signed<target)virtualBelowGap++;};for(const ti of this.candidateTriangles){const k=ti*3,a=I[k],b=I[k+1],c=I[k+2];test(a,b,c,1/3,1/3,1/3);test(a,b,c,.5,.5,0);test(a,b,c,0,.5,.5);test(a,b,c,.5,0,.5);}
    return {mode,samples:vals.length,belowGap,behind,minSignedM:Number.isFinite(min)?min:null,p05SignedM:pct(.05),medianSignedM:pct(.5),virtual:{samples:virtualSamples,belowGap:virtualBelowGap,behind:virtualBehind,minSignedM:Number.isFinite(virtualMin)?virtualMin:null},targetGapM:target,softGapM:this.effectiveSoftGapM(),hardBarrierM:this.settings.hardBarrierM};
  }
  barrierAudit(){return this.audit({mode:'hard',targetGapM:0});}
  metrics(){return {...this.diag,candidates:this.candidateIds.length,candidateTriangles:this.candidateTriangles.length,minSignedM:Number.isFinite(this.diag.minSignedM)?this.diag.minSignedM:null,lastSolve:this.lastSolve,settings:{...this.settings}};}
}

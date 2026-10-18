import {LucidClothSolver} from '../../../clothing-safe/m26/source/public/src/clothing/lucidClothSolver.js';
import {DynamicTriangleBVH} from '../../../clothing-safe/m26/source/public/src/clothing/dynamicBvh.js';
import {PantsSectionEnvelope} from './pantsSectionEnvelope.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const avg=(a,b)=>0.5*(a+b);
const wrapPi=x=>{while(x>Math.PI)x-=2*Math.PI;while(x<-Math.PI)x+=2*Math.PI;return x;};


// Small dense least-squares fit for periodic low-order control fields.
// Coefficients are [1, cos(t), sin(t), cos(2t), sin(2t), ...].
const fitFourier=(samples,order=3)=>{
  const m=1+2*Math.max(0,Math.floor(order)),A=Array.from({length:m},()=>new Float64Array(m)),b=new Float64Array(m);
  for(const sm of samples){const row=new Float64Array(m);row[0]=1;for(let k=1;k<=order;k++){row[2*k-1]=Math.cos(k*sm.a);row[2*k]=Math.sin(k*sm.a)}const w=sm.w??1;for(let i=0;i<m;i++){b[i]+=w*row[i]*sm.y;for(let j=0;j<m;j++)A[i][j]+=w*row[i]*row[j];}}
  let tr=0;for(let i=0;i<m;i++)tr+=A[i][i];const reg=Math.max(1e-10,tr*1e-8);for(let i=0;i<m;i++)A[i][i]+=reg;
  // Gauss-Jordan; tiny system (<= 11x11), deterministic and dependency-free.
  const M=A.map((r,i)=>Float64Array.from([...r,b[i]]));
  for(let c=0;c<m;c++){let piv=c;for(let r=c+1;r<m;r++)if(Math.abs(M[r][c])>Math.abs(M[piv][c]))piv=r;if(Math.abs(M[piv][c])<1e-12)continue;if(piv!==c){const t=M[c];M[c]=M[piv];M[piv]=t}const q=M[c][c];for(let j=c;j<=m;j++)M[c][j]/=q;for(let r=0;r<m;r++){if(r===c)continue;const f=M[r][c];if(Math.abs(f)<1e-16)continue;for(let j=c;j<=m;j++)M[r][j]-=f*M[c][j];}}
  return Float64Array.from({length:m},(_,i)=>M[i][m]);
};
const evalFourier=(coef,a)=>{if(!coef?.length)return 0;let y=coef[0];for(let k=1;k<=(coef.length-1)/2;k++)y+=coef[2*k-1]*Math.cos(k*a)+coef[2*k]*Math.sin(k*a);return y;};

/**
 * Clothing Engine R1 extension of the qualified M15-M17 solver.
 *
 * Design rule: the imported M26 source remains byte-preserved. Everything in
 * this file is an additive experimental/runtime overlay.
 *
 * R1 activates authored fabric fields that M17 stored but the upstream solver
 * did not directly consume, and adds a pants-specific topology guard. The
 * topology guard is deliberately not a skinning constraint: normal freedom is
 * retained for drape, while excessive tangential material drift relative to the
 * live body carrier is bounded so a moving leg cannot leave its trouser tube.
 */
export class LucidClothSolverV2 extends LucidClothSolver {
  constructor(garment, options={}){
    super(garment,options);
    // V1 capped absolute world velocity at 4 m/s.  Fast governed motions can
    // move the body surface itself well above that, which forces clothing to
    // lag and then rely on violent positional correction.  R1 raises the world
    // ceiling but enforces stability in the physically relevant carrier frame.
    this.qualifiedWorldMaxSpeedMps=this.settings.maxSpeed??4;
    if(this.settings.relativeVelocityCap===undefined)this.settings.relativeVelocityCap=true;
    if(this.settings.relativeMaxSpeedMps===undefined)this.settings.relativeMaxSpeedMps=4.0;
    if(this.settings.worldMaxSpeedMps===undefined)this.settings.worldMaxSpeedMps=18.0;
    if(this.settings.relativeVelocityCap!==false)this.settings.maxSpeed=Math.max(this.settings.maxSpeed??4,this.settings.worldMaxSpeedMps);
    this._relativeSpeedPeak=0;
    this.fabricFieldV2={
      enabled:true,
      anisotropyStrength:clamp(Number(garment.meta?.fabric?.anisotropyStrength??0.18),0,0.65),
      directionField:false,
      localDamping:false,
      directChannels:[],
      indirectChannels:[]
    };
    this._activateFabricFields();
    this._buildMicroEdgeConstraints();
    this._buildPantsOccupancyGuard();
    this._buildPantsTubeRings();
    this._buildPantsSectorManifold();
    this._buildPantsFourierManifold();
    this._buildPantsSectionEnvelope();
    this._buildPantsBodyContainment();
    this._buildPantsInnerContact();
    this._buildPantsLocalCcd();
    this._buildPantsBodySweepGuard();
  }

  setBodySurface(positions,normals=null,prevPositions=null,dt=1/60){
    // Own the previous-surface snapshot. DynamicTriangleBVH stores the array by
    // reference; callers commonly recycle/mutate their `prev` buffer after a
    // frame, which otherwise retroactively zeroes the body's sampled velocity.
    // That corrupts relative friction/velocity diagnostics and fast-motion caps.
    if(prevPositions){if(!this._ownedBodyPrev||this._ownedBodyPrev.length!==prevPositions.length)this._ownedBodyPrev=new Float32Array(prevPositions.length);this._ownedBodyPrev.set(prevPositions);}
    this._bodySurfaceSerial=(this._bodySurfaceSerial||0)+1;this._bodySurfaceDt=Math.max(1e-5,Number(dt)||1/60);
    return super.setBodySurface(positions,normals,this._ownedBodyPrev||prevPositions,dt);
  }

  _activateFabricFields(){
    const n=this.shellVertexCount;
    const vStretch=this.vertexStretchScale;
    const vBend=this.vertexBendScale;
    const dir=this.vertexDirectionAngle;
    const uvs=this.uvs;

    const edgeBase=this.edgeStiffnessScale?Float32Array.from(this.edgeStiffnessScale):new Float32Array(this.edges.length/2).fill(1);
    const bendBase=this.bendStiffnessScale?Float32Array.from(this.bendStiffnessScale):new Float32Array(this.bends.length/2).fill(1);
    const edgeOut=new Float32Array(edgeBase.length);
    const bendOut=new Float32Array(bendBase.length);
    let dirUsed=false;

    for(let k=0;k<this.edges.length;k+=2){
      const ia=this.edges[k],ib=this.edges[k+1];
      let s=edgeBase[k>>1];
      if(vStretch?.length)s*=avg(vStretch[ia]??1,vStretch[ib]??1);
      if(dir?.length&&uvs?.length&&ia<n&&ib<n){
        const du=uvs[ib*2]-uvs[ia*2],dv=uvs[ib*2+1]-uvs[ia*2+1];
        if(Math.abs(du)+Math.abs(dv)>1e-8){
          const edgeAngle=Math.atan2(dv,du),preferred=avg(dir[ia]??0,dir[ib]??0);
          const a=Math.cos(wrapPi(edgeAngle-preferred));
          s*=1+this.fabricFieldV2.anisotropyStrength*(2*a*a-1);
          dirUsed=true;
        }
      }
      edgeOut[k>>1]=clamp(s,.45,2.5);
    }
    for(let k=0;k<this.bends.length;k+=2){
      const ia=this.bends[k],ib=this.bends[k+1];
      let s=bendBase[k>>1];
      if(vBend?.length)s*=avg(vBend[ia]??1,vBend[ib]??1);
      bendOut[k>>1]=clamp(s,.35,3.0);
    }
    this.edgeStiffnessScale=edgeOut;
    this.bendStiffnessScale=bendOut;
    this.fabricFieldV2.directionField=dirUsed;
    this.fabricFieldV2.localDamping=!!this.vertexDampingScale?.length;
    if(this.vertexThicknessScale?.length)this.fabricFieldV2.directChannels.push('thickness');
    if(this.vertexSkinFrictionStatic?.length)this.fabricFieldV2.directChannels.push('skinFriction');
    if(vStretch?.length)this.fabricFieldV2.directChannels.push('stretchScale');
    if(vBend?.length)this.fabricFieldV2.directChannels.push('bendStiffness');
    if(dirUsed)this.fabricFieldV2.directChannels.push('directionAngle');
    if(this.vertexDampingScale?.length)this.fabricFieldV2.directChannels.push('damping');
    if(this.edgeRestScaleAuthored?.length||this.bendRestScaleAuthored?.length)this.fabricFieldV2.indirectChannels.push('creaseBias/restScale');
    if(this.vertexWrinkleAmplitude?.length)this.fabricFieldV2.indirectChannels.push('wrinkleAmplitude/renderOrFutureMicrofold');
  }


  _buildMicroEdgeConstraints(){
    const ids=[];for(let e=0;e<this.edgeRest.length;e++){const rl=this.edgeRestAuthored?.[e]??this.edgeRest[e];if(rl>=1e-5&&rl<.001)ids.push(e)}
    this.microEdges={ids:Uint32Array.from(ids),corrections:0,maxErrorM:0};
    if(this.settings.microEdgeConstraints===undefined)this.settings.microEdgeConstraints=false;
    if(this.settings.microEdgeStiffness===undefined)this.settings.microEdgeStiffness=.90;
    if(this.settings.microEdgeMaxPairCorrectionM===undefined)this.settings.microEdgeMaxPairCorrectionM=.0024;
  }

  _solveMicroEdges(rest,stiffness){
    const g=this.microEdges;if(!g?.ids?.length)return 0;const inv=this.invMass,ks=clamp(Number(this.settings.microEdgeStiffness??.90)*Math.max(.25,Math.min(1,stiffness||1)),0,1),cap=Math.max(.0002,Number(this.settings.microEdgeMaxPairCorrectionM??.0024));let n=0;
    for(const ei of g.ids){const ia=this.edges[ei*2],ib=this.edges[ei*2+1],rl=rest?.[ei]??this.edgeRestAuthored?.[ei]??this.edgeRest[ei],a=ia*3,b=ib*3,dx=this.pos[b]-this.pos[a],dy=this.pos[b+1]-this.pos[a+1],dz=this.pos[b+2]-this.pos[a+2],l=Math.hypot(dx,dy,dz);if(l<1e-10)continue;const err=l-rl;g.maxErrorM=Math.max(g.maxErrorM,Math.abs(err));if(Math.abs(err)<1e-7)continue;const wa=inv?inv[ia]:1,wb=inv?inv[ib]:1,den=wa+wb;if(den<=0)continue;const pairMove=clamp(err*ks,-cap,cap),q=pairMove/(l*den),cx=dx*q,cy=dy*q,cz=dz*q;this.pos[a]+=wa*cx;this.pos[a+1]+=wa*cy;this.pos[a+2]+=wa*cz;this.pos[b]-=wb*cx;this.pos[b+1]-=wb*cy;this.pos[b+2]-=wb*cz;n++;}
    g.corrections+=n;return n;
  }

  _solvePairs(pairs,rest,stiffness,skipKinematic=false){
    const out=super._solvePairs(pairs,rest,stiffness,skipKinematic);if(pairs===this.edges&&this.microEdges&&this.settings.microEdgeConstraints===true)this._solveMicroEdges(rest,stiffness);return out;
  }

  _buildPantsOccupancyGuard(){
    this.pantsOccupancy=null;
    if(this.meta?.garmentType!=='pants'||!this.shellVertexCount)return;
    let ymin=Infinity,ymax=-Infinity;
    for(let i=0;i<this.shellVertexCount;i++){
      const y=this.rest[i*3+1];ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
    }
    const span=Math.max(1e-6,ymax-ymin);
    // Leave the waistband/pelvis to the existing retention system. The guard is
    // targeted at the actual leg tubes, where topology loss was observed.
    const guardTop=ymax-span*.13;
    const ids=[],freeT=new Float32Array(this.shellVertexCount),normalInwardFree=new Float32Array(this.shellVertexCount),normalOutwardFree=new Float32Array(this.shellVertexCount),normalStrength=new Float32Array(this.shellVertexCount),strength=new Float32Array(this.shellVertexCount);
    for(let i=0;i<this.shellVertexCount;i++){
      const y=this.rest[i*3+1];if(y>=guardTop)continue;
      ids.push(i);
      const u=clamp((y-ymin)/(guardTop-ymin),0,1); // ankle 0 -> upper thigh 1
      // Cuffs/lower legs need the strongest material-coordinate lock because an
      // open hem lets the body otherwise exit without a penetration event.
      freeT[i]=.0105+.0065*u;
      // Material-tube envelope: the cloth may billow away from the limb, but
      // an open hem must not let the anatomical surface outrun the garment
      // patch it was cut around.  Lower legs are tighter than upper thighs.
      normalInwardFree[i]=.022+.020*u;
      normalOutwardFree[i]=.060+.020*u;
      normalStrength[i]=.78-.16*u;
      strength[i]=.90-.10*u;
    }
    const guardMask=new Uint8Array(this.shellVertexCount);for(const i of ids)guardMask[i]=1;
    const neighbors=Array.from({length:this.shellVertexCount},()=>[]);for(let k=0;k<this.edges.length;k+=2){const a=this.edges[k],b=this.edges[k+1];if(a<this.shellVertexCount&&b<this.shellVertexCount&&guardMask[a]&&guardMask[b]){neighbors[a].push(b);neighbors[b].push(a)}}
    this.pantsOccupancy={
      ids:Uint32Array.from(ids),guardMask,neighbors,freeT,normalInwardFree,normalOutwardFree,normalStrength,strength,guardTopY:guardTop,
      normalFreeM:.075,maxCorrectionM:.0105,
      corrections:0,lastCorrected:0,maxTangentialErrorM:0,maxNormalErrorM:0
    };
    if(this.settings.pantsOccupancy===undefined)this.settings.pantsOccupancy=true;
    if(this.settings.pantsOccupancyScale===undefined)this.settings.pantsOccupancyScale=1.0;
    if(this.settings.pantsOccupancyTangential===undefined)this.settings.pantsOccupancyTangential=true;
    if(this.settings.pantsOccupancyMode===undefined)this.settings.pantsOccupancyMode='hybrid';
    if(this.settings.pantsTubeNormalFollowRate===undefined)this.settings.pantsTubeNormalFollowRate=12;
    if(this.settings.pantsTubeTangentialFollowRate===undefined)this.settings.pantsTubeTangentialFollowRate=3.0;
    if(this.settings.pantsTubeMaxVelocityBoostMps===undefined)this.settings.pantsTubeMaxVelocityBoostMps=.85;
    if(this.settings.pantsTubeEmergencySlackM===undefined)this.settings.pantsTubeEmergencySlackM=.018;
    if(this.settings.pantsOccupancyNormalFreeM===undefined)this.settings.pantsOccupancyNormalFreeM=this.pantsOccupancy.normalFreeM;
    if(this.settings.pantsOccupancyMaxCorrectionM===undefined)this.settings.pantsOccupancyMaxCorrectionM=this.pantsOccupancy.maxCorrectionM;
    if(this.settings.pantsOccupancySmoothPasses===undefined)this.settings.pantsOccupancySmoothPasses=3;
    if(this.settings.pantsOccupancySmoothGradientM===undefined)this.settings.pantsOccupancySmoothGradientM=.0016;
    if(this.settings.pantsOccupancySmoothCadence===undefined)this.settings.pantsOccupancySmoothCadence='first-final';
    if(this.settings.pantsStrainClosure===undefined)this.settings.pantsStrainClosure=true;
    if(this.settings.pantsStrainClosureCycles===undefined)this.settings.pantsStrainClosureCycles=3;
    if(this.settings.pantsMaxStructuralStretch===undefined)this.settings.pantsMaxStructuralStretch=.22;
    if(this.settings.pantsStrainLimitMaxCorrectionM===undefined)this.settings.pantsStrainLimitMaxCorrectionM=.0025;
    if(this.settings.pantsStrainClosureFinalPasses===undefined)this.settings.pantsStrainClosureFinalPasses=1;
    if(this.settings.pantsStrainFinalTopologyPolish===undefined)this.settings.pantsStrainFinalTopologyPolish=false;
    if(this.settings.pantsStrainFinalTopologyCapM===undefined)this.settings.pantsStrainFinalTopologyCapM=.0010;
  }


  /**
   * Coherent open-tube controller for trousers.
   *
   * The legacy occupancy guard compares every denim vertex with one persistent
   * body carrier.  That is useful for slow motion but a fast kick can make a
   * handful of vertices receive large, mutually inconsistent rescue vectors.
   * The resulting patch is topologically rescued at the cost of extreme local
   * edge strain.  Rings instead treat a trouser leg as the object that matters:
   * a material band may translate with the limb, rotate collectively and slide
   * axially, while radial collapse and circumferential opening are bounded.
   */
  _buildPantsTubeRings(){
    this.pantsTubeRings=null;
    if(this.meta?.garmentType!=='pants'||!this.shellVertexCount)return;
    this._updateCarrierTargets();
    let ymin=Infinity,ymax=-Infinity;
    for(let i=0;i<this.shellVertexCount;i++){const y=this.rest[i*3+1];ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}
    const span=Math.max(1e-6,ymax-ymin),low=ymin+span*.025,high=ymin+span*.70;
    const ringCount=Math.max(6,Math.min(12,Math.floor(this.settings?.pantsTubeRingCount??9)));
    const rings=[];
    const makeBasis=(axis)=>{let ax=axis[0],ay=axis[1],az=axis[2],al=Math.hypot(ax,ay,az)||1;ax/=al;ay/=al;az/=al;let rx=0,ry=1,rz=0;if(Math.abs(ay)>.88){rx=1;ry=0;rz=0}let ux=ay*rz-az*ry,uy=az*rx-ax*rz,uz=ax*ry-ay*rx,ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;return [[ux,uy,uz],[ay*uz-az*uy,az*ux-ax*uz,ax*uy-ay*ux]]};
    for(const side of [-1,1]){
      const sideRings=[];
      for(let r=0;r<ringCount;r++){
        const y0=low+(high-low)*r/ringCount,y1=low+(high-low)*(r+1)/ringCount,ids=[];
        for(let i=0;i<this.shellVertexCount;i++){const p=i*3,x=this.rest[p],y=this.rest[p+1];if(y<y0||y>=y1)continue;if(side<0?x<-.012:x>.012)ids.push(i)}
        if(ids.length<8)continue;
        sideRings.push({side,index:r,y0,y1,ids:Uint32Array.from(ids),restAngles:null,restRadii:null,restCenter:null});
      }
      // Rest centers from driven cloth carriers.  Their circumferential average
      // approximates the anatomical leg axis while retaining the garment's fit.
      for(let ri=0;ri<sideRings.length;ri++){
        const g=sideRings[ri];let cx=0,cy=0,cz=0;
        for(const i of g.ids){const p=i*3;cx+=this.carrierTarget[p];cy+=this.carrierTarget[p+1];cz+=this.carrierTarget[p+2]}
        const n=g.ids.length;g.restCenter=[cx/n,cy/n,cz/n];
      }
      for(let ri=0;ri<sideRings.length;ri++){
        const g=sideRings[ri],a=sideRings[Math.max(0,ri-1)].restCenter,b=sideRings[Math.min(sideRings.length-1,ri+1)].restCenter;
        let axis=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];if(Math.hypot(...axis)<1e-7)axis=[0,1,0];const [u,v]=makeBasis(axis);
        const ang=new Float32Array(g.ids.length),rad=new Float32Array(g.ids.length);
        for(let q=0;q<g.ids.length;q++){const i=g.ids[q],p=i*3,dx=this.rest[p]-g.restCenter[0],dy=this.rest[p+1]-g.restCenter[1],dz=this.rest[p+2]-g.restCenter[2],du=dx*u[0]+dy*u[1]+dz*u[2],dv=dx*v[0]+dy*v[1]+dz*v[2];ang[q]=Math.atan2(dv,du);rad[q]=Math.hypot(du,dv)}
        g.restAngles=ang;g.restRadii=rad;rings.push(g);
      }
    }
    this.pantsTubeRings={rings,lowY:low,highY:high,ringCount,corrections:0,lastCorrections:0,maxRadialDeficitM:0,maxAngularErrorRad:0,maxBulkVelocityErrorMps:0};
    if(this.settings.pantsTubeRingRadialSlackM===undefined)this.settings.pantsTubeRingRadialSlackM=.014;
    if(this.settings.pantsTubeRingCenterSlackM===undefined)this.settings.pantsTubeRingCenterSlackM=.010;
    if(this.settings.pantsTubeRingAxialSlackM===undefined)this.settings.pantsTubeRingAxialSlackM=.022;
    if(this.settings.pantsTubeRingVertexAxialSlackM===undefined)this.settings.pantsTubeRingVertexAxialSlackM=.020;
    if(this.settings.pantsTubeRingVertexAxialStrength===undefined)this.settings.pantsTubeRingVertexAxialStrength=.28;
    if(this.settings.pantsTubeRingCenterStrength===undefined)this.settings.pantsTubeRingCenterStrength=.68;
    if(this.settings.pantsTubeRingAngularSlackRad===undefined)this.settings.pantsTubeRingAngularSlackRad=.38; // collective rotation remains free; individual bunching is bounded
    if(this.settings.pantsTubeRingMaxCorrectionM===undefined)this.settings.pantsTubeRingMaxCorrectionM=.0035;
    if(this.settings.pantsTubeRingRadialStrength===undefined)this.settings.pantsTubeRingRadialStrength=.55;
    if(this.settings.pantsTubeRingAngularStrength===undefined)this.settings.pantsTubeRingAngularStrength=.30;
    if(this.settings.pantsTubeRingBulkFollow===undefined)this.settings.pantsTubeRingBulkFollow=.78;
    if(this.settings.pantsTubeRingAngularFollow===undefined)this.settings.pantsTubeRingAngularFollow=.72;
    if(this.settings.pantsTubeRingVelocitySmooth===undefined)this.settings.pantsTubeRingVelocitySmooth=.18;
    if(this.settings.pantsTubeRingMaxVelocityBoostMps===undefined)this.settings.pantsTubeRingMaxVelocityBoostMps=2.6;
  }

  _tubeRingLiveFrame(ring,ri,sideRings){
    let cx=0,cy=0,cz=0,bvx=0,bvy=0,bvz=0,nv=0;
    const samples=[];
    for(const i of ring.ids){
      const p=i*3;cx+=this.carrierTarget[p];cy+=this.carrierTarget[p+1];cz+=this.carrierTarget[p+2];
      const ti=this.carrierTri?.[i]??-1;if(ti>=0){const q=this.bodyBVH.sampleTriangle(ti,this.carrierUVW[p],this.carrierUVW[p+1],this.carrierUVW[p+2]);bvx+=q.vx;bvy+=q.vy;bvz+=q.vz;nv++;samples.push([i,q.vx,q.vy,q.vz]);}
    }
    const n=ring.ids.length;cx/=n;cy/=n;cz/=n;if(nv){bvx/=nv;bvy/=nv;bvz/=nv}
    const center=[cx,cy,cz];
    const centerOf=(g)=>{let x=0,y=0,z=0;for(const i of g.ids){const p=i*3;x+=this.carrierTarget[p];y+=this.carrierTarget[p+1];z+=this.carrierTarget[p+2]}const m=g.ids.length;return[x/m,y/m,z/m]};
    const ca=centerOf(sideRings[Math.max(0,ri-1)]),cb=centerOf(sideRings[Math.min(sideRings.length-1,ri+1)]);let ax=cb[0]-ca[0],ay=cb[1]-ca[1],az=cb[2]-ca[2],al=Math.hypot(ax,ay,az)||1;ax/=al;ay/=al;az/=al;
    let rx=0,ry=1,rz=0;if(Math.abs(ay)>.88){rx=1;ry=0;rz=0}let ux=ay*rz-az*ry,uy=az*rx-ax*rz,uz=ax*ry-ay*rx,ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;const vx=ay*uz-az*uy,vy=az*ux-ax*uz,vz=ax*uy-ay*ux;
    // Least-squares rigid angular velocity. For each carrier sample:
    //   v_i - v_c ~= omega x r_i
    // Normal equation: sum((|r|^2 I - r r^T)) omega = sum(r x (v_i-v_c)).
    let A00=0,A01=0,A02=0,A11=0,A12=0,A22=0,B0=0,B1=0,B2=0;
    for(const sm of samples){const i=sm[0],p=i*3,x=this.carrierTarget[p]-cx,y=this.carrierTarget[p+1]-cy,z=this.carrierTarget[p+2]-cz,dvx=sm[1]-bvx,dvy=sm[2]-bvy,dvz=sm[3]-bvz,r2=x*x+y*y+z*z;A00+=r2-x*x;A01-=x*y;A02-=x*z;A11+=r2-y*y;A12-=y*z;A22+=r2-z*z;B0+=y*dvz-z*dvy;B1+=z*dvx-x*dvz;B2+=x*dvy-y*dvx;}
    // Symmetric 3x3 inverse with a tiny Tikhonov term for near-planar rings.
    const reg=Math.max(1e-9,(A00+A11+A22)*1e-7);A00+=reg;A11+=reg;A22+=reg;
    const c00=A11*A22-A12*A12,c01=A02*A12-A01*A22,c02=A01*A12-A02*A11,c11=A00*A22-A02*A02,c12=A01*A02-A00*A12,c22=A00*A11-A01*A01,det=A00*c00+A01*c01+A02*c02;
    let wx=0,wy=0,wz=0;if(Math.abs(det)>1e-14){const id=1/det;wx=(c00*B0+c01*B1+c02*B2)*id;wy=(c01*B0+c11*B1+c12*B2)*id;wz=(c02*B0+c12*B1+c22*B2)*id;}
    return {center,axis:[ax,ay,az],u:[ux,uy,uz],v:[vx,vy,vz],bodyVelocity:[bvx,bvy,bvz],angularVelocity:[wx,wy,wz]};
  }

  _prePantsTubeRingVelocity(dt){
    const tr=this.pantsTubeRings,mode=this.settings.pantsOccupancyMode;if(!tr||this.settings.pantsOccupancy===false||!['ring','bulk','rigid'].includes(mode))return 0;
    this._updateCarrierTargets();let boosted=0,maxErr=0;const maxBoost=Math.max(.1,Number(this.settings.pantsTubeRingMaxVelocityBoostMps??2.6)),follow=clamp(Number(this.settings.pantsTubeRingBulkFollow??.78),0,1),angularFollow=clamp(Number(this.settings.pantsTubeRingAngularFollow??follow),0,1),smooth=clamp(Number(this.settings.pantsTubeRingVelocitySmooth??.20),0,.45);
    for(const side of [-1,1]){
      const rs=tr.rings.filter(r=>r.side===side),frames=rs.map((g,ri)=>this._tubeRingLiveFrame(g,ri,rs));
      // Smooth only the low-dimensional rigid velocity parameters along the leg;
      // never average individual vertex corrections across material edges.
      if(smooth>0&&frames.length>2){const raw=frames.map(f=>({v:[...f.bodyVelocity],w:[...f.angularVelocity]}));for(let ri=1;ri<frames.length-1;ri++)for(let k=0;k<3;k++){frames[ri].bodyVelocity[k]=raw[ri].v[k]*(1-2*smooth)+(raw[ri-1].v[k]+raw[ri+1].v[k])*smooth;frames[ri].angularVelocity[k]=raw[ri].w[k]*(1-2*smooth)+(raw[ri-1].w[k]+raw[ri+1].w[k])*smooth;}}
      for(let ri=0;ri<rs.length;ri++){
        const g=rs[ri],f=frames[ri];
        if(mode==='bulk'){
          let vx=0,vy=0,vz=0;for(const i of g.ids){const p=i*3;vx+=this.vel[p];vy+=this.vel[p+1];vz+=this.vel[p+2]}vx/=g.ids.length;vy/=g.ids.length;vz/=g.ids.length;let dx=(f.bodyVelocity[0]-vx)*follow,dy=(f.bodyVelocity[1]-vy)*follow,dz=(f.bodyVelocity[2]-vz)*follow,d=Math.hypot(dx,dy,dz);maxErr=Math.max(maxErr,d);if(d>maxBoost){const q=maxBoost/d;dx*=q;dy*=q;dz*=q}if(d<1e-8)continue;for(const i of g.ids){const p=i*3;this.vel[p]+=dx;this.vel[p+1]+=dy;this.vel[p+2]+=dz}boosted+=g.ids.length;continue;
        }
        // Rigid velocity entrainment. Translation and rotation are fitted from
        // the live body carriers, so every material band receives a coherent
        // velocity field rather than independent skinning-like rescue vectors.
        const C=f.center,w=f.angularVelocity;for(const i of g.ids){const p=i*3,rx=this.pos[p]-C[0],ry=this.pos[p+1]-C[1],rz=this.pos[p+2]-C[2],rvx=w[1]*rz-w[2]*ry,rvy=w[2]*rx-w[0]*rz,rvz=w[0]*ry-w[1]*rx,tx=f.bodyVelocity[0]*follow+rvx*angularFollow,ty=f.bodyVelocity[1]*follow+rvy*angularFollow,tz=f.bodyVelocity[2]*follow+rvz*angularFollow,dx=tx-this.vel[p],dy=ty-this.vel[p+1],dz=tz-this.vel[p+2],d=Math.hypot(dx,dy,dz);maxErr=Math.max(maxErr,d);let sc=1;if(d>maxBoost)sc=maxBoost/d;this.vel[p]+=dx*sc;this.vel[p+1]+=dy*sc;this.vel[p+2]+=dz*sc;boosted++;}
      }
    }
    tr.maxBulkVelocityErrorMps=Math.max(tr.maxBulkVelocityErrorMps,maxErr);return boosted;
  }

  _applyPantsTubeRingConstraint(){
    const tr=this.pantsTubeRings;if(!tr||this.settings.pantsOccupancy===false||this.settings.pantsOccupancyMode!=='ring')return 0;
    this._updateCarrierTargets();const radialSlack=Math.max(.002,Number(this.settings.pantsTubeRingRadialSlackM??.014)),centerSlack=Math.max(.002,Number(this.settings.pantsTubeRingCenterSlackM??.010)),axialSlack=Math.max(.004,Number(this.settings.pantsTubeRingAxialSlackM??.022)),vertexAxialSlack=Math.max(.004,Number(this.settings.pantsTubeRingVertexAxialSlackM??.020)),vertexAxialStrength=clamp(Number(this.settings.pantsTubeRingVertexAxialStrength??.28),0,1),centerStrength=clamp(Number(this.settings.pantsTubeRingCenterStrength??.68),0,1),angSlack=Math.max(.10,Number(this.settings.pantsTubeRingAngularSlackRad??.38)),cap=Math.max(.0005,Number(this.settings.pantsTubeRingMaxCorrectionM??.0035)),rs=clamp(Number(this.settings.pantsTubeRingRadialStrength??.55),0,1),as=clamp(Number(this.settings.pantsTubeRingAngularStrength??.30),0,1);
    let corrected=0,maxDef=0,maxAng=0;
    for(const side of [-1,1]){const rings=tr.rings.filter(r=>r.side===side);for(let ri=0;ri<rings.length;ri++){
      const g=rings[ri],f=this._tubeRingLiveFrame(g,ri,rings),C=f.center,u=f.u,v=f.v,axis=f.axis,angles=new Float64Array(g.ids.length),radii=new Float64Array(g.ids.length),targetR=new Float64Array(g.ids.length),axialNow=new Float64Array(g.ids.length),axialTarget=new Float64Array(g.ids.length);let sx=0,sy=0;
      // First keep the material band near its live driven frame as a coherent
      // object. This is deliberately a group translation, not per-vertex
      // skinning: it preserves all intra-ring edge lengths exactly.
      let pcx=0,pcy=0,pcz=0;for(const i of g.ids){const p=i*3;pcx+=this.pos[p];pcy+=this.pos[p+1];pcz+=this.pos[p+2]}pcx/=g.ids.length;pcy/=g.ids.length;pcz/=g.ids.length;
      let ex=C[0]-pcx,ey=C[1]-pcy,ez=C[2]-pcz,ea=ex*axis[0]+ey*axis[1]+ez*axis[2],tx=ex-axis[0]*ea,ty=ey-axis[1]*ea,tz=ez-axis[2]*ea,td=Math.hypot(tx,ty,tz),gx=0,gy=0,gz=0;
      if(td>centerSlack){const d=Math.min(cap,(td-centerSlack)*centerStrength),q=d/(td||1);gx+=tx*q;gy+=ty*q;gz+=tz*q}
      if(Math.abs(ea)>axialSlack){const d=Math.min(cap*.75,(Math.abs(ea)-axialSlack)*centerStrength),sg=ea>0?1:-1;gx+=axis[0]*d*sg;gy+=axis[1]*d*sg;gz+=axis[2]*d*sg}
      let gd=Math.hypot(gx,gy,gz);if(gd>cap){const q=cap/gd;gx*=q;gy*=q;gz*=q}if(gd>1e-9){for(const i of g.ids){const p=i*3;this.pos[p]+=gx;this.pos[p+1]+=gy;this.pos[p+2]+=gz;this.prev[p]+=gx;this.prev[p+1]+=gy;this.prev[p+2]+=gz}corrected+=g.ids.length;}
      // Recompute material coordinates after the coherent frame correction.
      for(let q=0;q<g.ids.length;q++){const i=g.ids[q],p=i*3,dx=this.pos[p]-C[0],dy=this.pos[p+1]-C[1],dz=this.pos[p+2]-C[2],du=dx*u[0]+dy*u[1]+dz*u[2],dv=dx*v[0]+dy*v[1]+dz*v[2];angles[q]=Math.atan2(dv,du);radii[q]=Math.hypot(du,dv);axialNow[q]=dx*axis[0]+dy*axis[1]+dz*axis[2];const tx=this.carrierTarget[p]-C[0],ty=this.carrierTarget[p+1]-C[1],tz=this.carrierTarget[p+2]-C[2],tu=tx*u[0]+ty*u[1]+tz*u[2],tv=tx*v[0]+ty*v[1]+tz*v[2];targetR[q]=Math.hypot(tu,tv);axialTarget[q]=tx*axis[0]+ty*axis[1]+tz*axis[2];const da=wrapPi(angles[q]-g.restAngles[q]);sx+=Math.cos(da);sy+=Math.sin(da)}
      const collective=Math.atan2(sy,sx);
      for(let q=0;q<g.ids.length;q++){
        const i=g.ids[q],p=i*3,r=radii[q],a=angles[q];let dux=Math.cos(a)*u[0]+Math.sin(a)*v[0],duy=Math.cos(a)*u[1]+Math.sin(a)*v[1],duz=Math.cos(a)*u[2]+Math.sin(a)*v[2];let cx=0,cy=0,cz=0;
        const deficit=targetR[q]-radialSlack-r;maxDef=Math.max(maxDef,deficit);if(deficit>0){const d=Math.min(cap,deficit*rs);cx+=dux*d;cy+=duy*d;cz+=duz*d}
        const err=wrapPi(a-g.restAngles[q]-collective),ae=Math.abs(err);maxAng=Math.max(maxAng,ae);if(ae>angSlack&&r>.01){const arc=Math.min(cap*.70,(ae-angSlack)*r*as),sg=err>0?-1:1;const tx=-Math.sin(a)*u[0]+Math.cos(a)*v[0],ty=-Math.sin(a)*u[1]+Math.cos(a)*v[1],tz=-Math.sin(a)*u[2]+Math.cos(a)*v[2];cx+=tx*arc*sg;cy+=ty*arc*sg;cz+=tz*arc*sg}
        const axErr=axialTarget[q]-axialNow[q];if(Math.abs(axErr)>vertexAxialSlack){const d=Math.min(cap*.55,(Math.abs(axErr)-vertexAxialSlack)*vertexAxialStrength),sg=axErr>0?1:-1;cx+=axis[0]*d*sg;cy+=axis[1]*d*sg;cz+=axis[2]*d*sg}
        const d=Math.hypot(cx,cy,cz);if(d<1e-9)continue;const sc=d>cap?cap/d:1;cx*=sc;cy*=sc;cz*=sc;this.pos[p]+=cx;this.pos[p+1]+=cy;this.pos[p+2]+=cz;this.prev[p]+=cx;this.prev[p+1]+=cy;this.prev[p+2]+=cz;corrected++;
      }
    }}
    tr.corrections+=corrected;tr.lastCorrections=corrected;tr.maxRadialDeficitM=Math.max(tr.maxRadialDeficitM,maxDef);tr.maxAngularErrorRad=Math.max(tr.maxAngularErrorRad,maxAng);return corrected;
  }

  pantsTubeRingAudit(){
    const tr=this.pantsTubeRings;if(!tr)return null;return {enabled:this.settings.pantsOccupancyMode==='ring'&&this.settings.pantsOccupancy!==false,rings:tr.rings.length,corrections:tr.corrections,lastCorrections:tr.lastCorrections,maxRadialDeficitM:tr.maxRadialDeficitM,maxAngularErrorRad:tr.maxAngularErrorRad,maxBulkVelocityErrorMps:tr.maxBulkVelocityErrorMps,settings:{radialSlackM:this.settings.pantsTubeRingRadialSlackM,centerSlackM:this.settings.pantsTubeRingCenterSlackM,axialSlackM:this.settings.pantsTubeRingAxialSlackM,vertexAxialSlackM:this.settings.pantsTubeRingVertexAxialSlackM,angularSlackRad:this.settings.pantsTubeRingAngularSlackRad,maxCorrectionM:this.settings.pantsTubeRingMaxCorrectionM,bulkFollow:this.settings.pantsTubeRingBulkFollow,maxVelocityBoostMps:this.settings.pantsTubeRingMaxVelocityBoostMps}};
  }


  /**
   * Coherent waistband/pelvis retention.
   *
   * M16's original waistband retention moves every upper-jeans vertex toward
   * its own body carrier.  That is robust in slow poses but becomes a dense
   * skinning field under fast pelvis/leg motion and can inject large local
   * strain around fly/crotch edges.  R1 replaces that path with one weighted
   * low-dimensional rigid correction (translation + small rotation) tapered
   * down the upper jeans.  Intra-band cloth remains free; only the bulk pelvis
   * attachment is controlled.
   */
  _applyRetention(){
    if(this.meta?.garmentType!=='pants'||this.retentionMode!=='waistband'||!this.waistbandFollowWeight||this.settings.pantsCoherentWaist===false)return super._applyRetention();
    if(!this.settings.retention)return;
    const n=this.shellVertexCount,P=this.pos,T=this.carrierTarget,W=this.waistbandFollowWeight;
    let sw=0,px=0,py=0,pz=0,tx=0,ty=0,tz=0;
    for(let i=0;i<n;i++){const w=W[i];if(w<=1e-4)continue;const q=i*3;sw+=w;px+=P[q]*w;py+=P[q+1]*w;pz+=P[q+2]*w;tx+=T[q]*w;ty+=T[q+1]*w;tz+=T[q+2]*w;}
    if(sw<=1e-8)return;px/=sw;py/=sw;pz/=sw;tx/=sw;ty/=sw;tz/=sw;
    const dx=tx-px,dy=ty-py,dz=tz-pz;
    // Small-angle least-squares rigid rotation around the weighted pelvis center.
    let A00=0,A01=0,A02=0,A11=0,A12=0,A22=0,B0=0,B1=0,B2=0;
    for(let i=0;i<n;i++){const w=W[i];if(w<=1e-4)continue;const q=i*3,x=P[q]-px,y=P[q+1]-py,z=P[q+2]-pz,ex=T[q]-tx-x,ey=T[q+1]-ty-y,ez=T[q+2]-tz-z,r2=x*x+y*y+z*z;A00+=w*(r2-x*x);A01-=w*x*y;A02-=w*x*z;A11+=w*(r2-y*y);A12-=w*y*z;A22+=w*(r2-z*z);B0+=w*(y*ez-z*ey);B1+=w*(z*ex-x*ez);B2+=w*(x*ey-y*ex);}
    const reg=Math.max(1e-9,(A00+A11+A22)*1e-7);A00+=reg;A11+=reg;A22+=reg;
    const c00=A11*A22-A12*A12,c01=A02*A12-A01*A22,c02=A01*A12-A02*A11,c11=A00*A22-A02*A02,c12=A01*A02-A00*A12,c22=A00*A11-A01*A01,det=A00*c00+A01*c01+A02*c02;
    let wx=0,wy=0,wz=0;if(Math.abs(det)>1e-14){const id=1/det;wx=(c00*B0+c01*B1+c02*B2)*id;wy=(c01*B0+c11*B1+c12*B2)*id;wz=(c02*B0+c12*B1+c22*B2)*id;}
    const maxAng=Math.max(.005,Number(this.settings.pantsCoherentWaistMaxAngleRad??.12)),wl=Math.hypot(wx,wy,wz);if(wl>maxAng){const sc=maxAng/wl;wx*=sc;wy*=sc;wz*=sc;}
    const gain=clamp(Number(this.settings.pantsCoherentWaistGain??.78),0,1),cap=Math.max(.001,Number(this.settings.pantsCoherentWaistMaxCorrectionM??.012));let moved=0;
    for(let i=0;i<n;i++){const w=W[i];if(w<=1e-4)continue;const q=i*3,rx=P[q]-px,ry=P[q+1]-py,rz=P[q+2]-pz,rox=wy*rz-wz*ry,roy=wz*rx-wx*rz,roz=wx*ry-wy*rx;let ox=(dx+rox)*gain*w,oy=(dy+roy)*gain*w,oz=(dz+roz)*gain*w,d=Math.hypot(ox,oy,oz);if(d>cap){const sc=cap/d;ox*=sc;oy*=sc;oz*=sc;}P[q]+=ox;P[q+1]+=oy;P[q+2]+=oz;this.prev[q]+=ox;this.prev[q+1]+=oy;this.prev[q+2]+=oz;moved++;}
    if(moved)this.diag.retentionCorrections++;
  }

  /**
   * Low-order cross-sectional trouser manifold.
   *
   * Each material ring is partitioned into persistent angular sectors.  A
   * sector is controlled only by its centroid relative to the live anatomical
   * ring frame; all vertices in that sector receive the same correction.  This
   * preserves detailed wrinkle freedom while preventing a bent knee from
   * collapsing an entire angular portion of the enclosing tube.
   */
  _buildPantsSectorManifold(){
    this.pantsSectorManifold=null;const tr=this.pantsTubeRings;if(!tr)return;
    const sectors=Math.max(6,Math.min(16,Math.floor(this.settings?.pantsSectorCount??12))),cells=[];
    for(const ring of tr.rings){const buckets=Array.from({length:sectors},()=>[]),angles=Array.from({length:sectors},()=>[]);for(let q=0;q<ring.ids.length;q++){let a=ring.restAngles[q];const aw=a<0?a+2*Math.PI:a,si=Math.min(sectors-1,Math.floor(aw/(2*Math.PI)*sectors));buckets[si].push(ring.ids[q]);angles[si].push(a);}for(let si=0;si<sectors;si++)if(buckets[si].length>=2){let sx=0,sy=0;for(const a of angles[si]){sx+=Math.cos(a);sy+=Math.sin(a);}cells.push({side:ring.side,ringIndex:ring.index,sector:si,restAngle:Math.atan2(sy,sx),ids:Uint32Array.from(buckets[si])});}}
    this.pantsSectorManifold={sectors,cells,corrections:0,lastCorrections:0,maxRadialDeficitM:0,maxAngularErrorRad:0,activeCells:0};
    if(this.settings.pantsSectorManifold===undefined)this.settings.pantsSectorManifold=false;
    if(this.settings.pantsSectorRadialSlackM===undefined)this.settings.pantsSectorRadialSlackM=.006;
    if(this.settings.pantsSectorAngularSlackRad===undefined)this.settings.pantsSectorAngularSlackRad=.20;
    if(this.settings.pantsSectorRadialStrength===undefined)this.settings.pantsSectorRadialStrength=.72;
    if(this.settings.pantsSectorAngularStrength===undefined)this.settings.pantsSectorAngularStrength=.42;
    if(this.settings.pantsSectorMaxCorrectionM===undefined)this.settings.pantsSectorMaxCorrectionM=.0045;
    if(this.settings.pantsSectorArticulationThresholdRad===undefined)this.settings.pantsSectorArticulationThresholdRad=.65;
    if(this.settings.pantsSectorArticulationRadius===undefined)this.settings.pantsSectorArticulationRadius=0;
    if(this.settings.pantsSectorCircularSmooth===undefined)this.settings.pantsSectorCircularSmooth=.35;
    if(this.settings.pantsPostRingClosure===undefined)this.settings.pantsPostRingClosure=true;
  }

  _pantsRingArticulation(sideRings){
    const frames=sideRings.map((g,ri)=>this._tubeRingLiveFrame(g,ri,sideRings)),a=new Float64Array(frames.length);for(let i=0;i<frames.length-1;i++){const u=frames[i].axis,v=frames[i+1].axis,d=clamp(u[0]*v[0]+u[1]*v[1]+u[2]*v[2],-1,1),q=Math.acos(d);a[i]=Math.max(a[i],q);a[i+1]=Math.max(a[i+1],q);}return {frames,angles:a};
  }

  _applyPantsSectorManifold(){
    const g=this.pantsSectorManifold,tr=this.pantsTubeRings;if(!g||!tr||this.settings.pantsSectorManifold!==true||this.settings.pantsOccupancy===false)return 0;
    this._updateCarrierTargets();const radialSlack=Math.max(0,Number(this.settings.pantsSectorRadialSlackM??.006)),angSlack=Math.max(.03,Number(this.settings.pantsSectorAngularSlackRad??.20)),rs=clamp(Number(this.settings.pantsSectorRadialStrength??.72),0,1),as=clamp(Number(this.settings.pantsSectorAngularStrength??.42),0,1),cap=Math.max(.0005,Number(this.settings.pantsSectorMaxCorrectionM??.0045)),thr=Math.max(.1,Number(this.settings.pantsSectorArticulationThresholdRad??.65)),radius=Math.max(0,Math.floor(this.settings.pantsSectorArticulationRadius??0)),smooth=clamp(Number(this.settings.pantsSectorCircularSmooth??.35),0,.49);
    let total=0,maxDef=0,maxAng=0,active=0;
    for(const side of [-1,1]){
      const rings=tr.rings.filter(r=>r.side===side).sort((a,b)=>a.index-b.index),frames=rings.map((r,i)=>this._tubeRingLiveFrame(r,i,rings));if(rings.length<2)continue;
      // Find the single dominant live hinge.  This is deliberately local: a deep
      // knee bend should not turn the entire trouser leg into a controlled cage.
      let maxQ=0,hinge=-1;for(let i=0;i<frames.length-1;i++){const a=frames[i].axis,b=frames[i+1].axis,q=Math.acos(clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1));if(q>maxQ){maxQ=q;hinge=i;}}
      if(hinge<0||maxQ<thr)continue;const hot=new Set();for(let j=Math.max(0,hinge-radius);j<=Math.min(rings.length-1,hinge+1+radius);j++)hot.add(rings[j].index);
      for(let ri=0;ri<rings.length;ri++){
        const ring=rings[ri];if(!hot.has(ring.index))continue;const f=frames[ri],C=f.center,u=f.u,v=f.v,axis=f.axis,cells=g.cells.filter(c=>c.side===side&&c.ringIndex===ring.index).sort((a,b)=>a.sector-b.sector);if(cells.length<4)continue;active+=cells.length;
        const state=[];let sx=0,sy=0;
        for(const cell of cells){let px=0,py=0,pz=0,tx=0,ty=0,tz=0,n=0;for(const i of cell.ids){const p=i*3;px+=this.pos[p];py+=this.pos[p+1];pz+=this.pos[p+2];tx+=this.carrierTarget[p];ty+=this.carrierTarget[p+1];tz+=this.carrierTarget[p+2];n++;}px/=n;py/=n;pz/=n;tx/=n;ty/=n;tz/=n;const pdx=px-C[0],pdy=py-C[1],pdz=pz-C[2],tdx=tx-C[0],tdy=ty-C[1],tdz=tz-C[2],pu=pdx*u[0]+pdy*u[1]+pdz*u[2],pv=pdx*v[0]+pdy*v[1]+pdz*v[2],tu=tdx*u[0]+tdy*u[1]+tdz*u[2],tv=tdx*v[0]+tdy*v[1]+tdz*v[2],pr=Math.hypot(pu,pv),trr=Math.hypot(tu,tv),pa=Math.atan2(pv,pu),da=wrapPi(pa-cell.restAngle);sx+=Math.cos(da);sy+=Math.sin(da);state.push({cell,pr,trr,pa,raw:[0,0,0]});}
        const collective=Math.atan2(sy,sx);
        for(const st of state){const expected=wrapPi(st.cell.restAngle+collective),err=wrapPi(expected-st.pa),aae=Math.abs(err),deficit=st.trr-radialSlack-st.pr;maxDef=Math.max(maxDef,deficit);maxAng=Math.max(maxAng,aae);let cx=0,cy=0,cz=0;if(deficit>0){const d=Math.min(cap,deficit*rs),dirA=st.pa;cx+=(Math.cos(dirA)*u[0]+Math.sin(dirA)*v[0])*d;cy+=(Math.cos(dirA)*u[1]+Math.sin(dirA)*v[1])*d;cz+=(Math.cos(dirA)*u[2]+Math.sin(dirA)*v[2])*d;}if(aae>angSlack&&st.pr>.008&&as>0){const d=Math.min(cap*.65,(aae-angSlack)*st.pr*as),sg=err>0?1:-1,tx=(-Math.sin(st.pa)*u[0]+Math.cos(st.pa)*v[0])*sg,ty=(-Math.sin(st.pa)*u[1]+Math.cos(st.pa)*v[1])*sg,tz=(-Math.sin(st.pa)*u[2]+Math.cos(st.pa)*v[2])*sg;cx+=tx*d;cy+=ty*d;cz+=tz*d;}const cdot=cx*axis[0]+cy*axis[1]+cz*axis[2];st.raw=[cx-axis[0]*cdot,cy-axis[1]*cdot,cz-axis[2]*cdot];}
        // Circularly smooth only the low-order sector command, not the detailed
        // vertices. This prevents one corrected sector from opening a gap in its
        // neighbor while preserving wrinkles inside each sector.
        const bySector=new Map(state.map(st=>[st.cell.sector,st]));
        for(const st of state){let c=[...st.raw],w=1;if(smooth>0){for(const ds of [-1,1]){const nb=bySector.get((st.cell.sector+ds+g.sectors)%g.sectors);if(nb){c[0]+=nb.raw[0]*smooth;c[1]+=nb.raw[1]*smooth;c[2]+=nb.raw[2]*smooth;w+=smooth;}}c=c.map(x=>x/w);}let d=Math.hypot(...c);if(d<1e-9)continue;if(d>cap){const sc=cap/d;c=c.map(x=>x*sc);}for(const i of st.cell.ids){const p=i*3;this.pos[p]+=c[0];this.pos[p+1]+=c[1];this.pos[p+2]+=c[2];this.prev[p]+=c[0];this.prev[p+1]+=c[1];this.prev[p+2]+=c[2];}total+=st.cell.ids.length;}
      }
    }
    g.corrections+=total;g.lastCorrections=total;g.maxRadialDeficitM=Math.max(g.maxRadialDeficitM,maxDef);g.maxAngularErrorRad=Math.max(g.maxAngularErrorRad,maxAng);g.activeCells=active;return total;
  }

  pantsSectorManifoldAudit(){const g=this.pantsSectorManifold;if(!g)return null;return {enabled:this.settings.pantsSectorManifold===true,sectors:g.sectors,cells:g.cells.length,activeCells:g.activeCells,corrections:g.corrections,lastCorrections:g.lastCorrections,maxRadialDeficitM:g.maxRadialDeficitM,maxAngularErrorRad:g.maxAngularErrorRad,settings:{radialSlackM:this.settings.pantsSectorRadialSlackM,angularSlackRad:this.settings.pantsSectorAngularSlackRad,radialStrength:this.settings.pantsSectorRadialStrength,angularStrength:this.settings.pantsSectorAngularStrength,maxCorrectionM:this.settings.pantsSectorMaxCorrectionM,articulationThresholdRad:this.settings.pantsSectorArticulationThresholdRad,articulationRadius:this.settings.pantsSectorArticulationRadius,circularSmooth:this.settings.pantsSectorCircularSmooth}};}


  /**
   * Smooth cross-sectional envelope for deep trouser articulation.
   *
   * V1 angular sectors used fixed rest buckets.  At a bent knee those buckets
   * rotate through the live section and independent corrections can close one
   * gap while opening its neighbour.  This variant derives expected angle and
   * radius from the *live body carriers*, permits one collective ring rotation,
   * then fits only a low-order periodic correction field.  The detailed denim
   * is never skinned vertex-by-vertex; it receives a smooth m<=N envelope.
   */
  _buildPantsFourierManifold(){
    this.pantsFourierManifold=null;
    if(this.meta?.garmentType!=='pants'||!this.pantsTubeRings)return;
    this.pantsFourierManifold={corrections:0,lastCorrections:0,activeRings:0,maxRawRadialDeficitM:0,maxRawAngularErrorRad:0,maxAppliedM:0,hingeAngleRad:0};
    if(this.settings.pantsFourierManifold===undefined)this.settings.pantsFourierManifold=false;
    if(this.settings.pantsFourierOrder===undefined)this.settings.pantsFourierOrder=3;
    if(this.settings.pantsFourierGapM===undefined)this.settings.pantsFourierGapM=.0015;
    if(this.settings.pantsFourierRadialStrength===undefined)this.settings.pantsFourierRadialStrength=.75;
    if(this.settings.pantsFourierAngularSlackRad===undefined)this.settings.pantsFourierAngularSlackRad=.22;
    if(this.settings.pantsFourierAngularStrength===undefined)this.settings.pantsFourierAngularStrength=.45;
    if(this.settings.pantsFourierMaxCorrectionM===undefined)this.settings.pantsFourierMaxCorrectionM=.0040;
    if(this.settings.pantsFourierArticulationThresholdRad===undefined)this.settings.pantsFourierArticulationThresholdRad=.65;
    if(this.settings.pantsFourierArticulationRadius===undefined)this.settings.pantsFourierArticulationRadius=0;
  }

  _applyPantsFourierManifold(){
    const g=this.pantsFourierManifold,tr=this.pantsTubeRings;if(!g||!tr||this.settings.pantsFourierManifold!==true)return 0;
    this._updateCarrierTargets();
    const order=Math.max(1,Math.min(5,Math.floor(this.settings.pantsFourierOrder??3))),gap=Math.max(0,Number(this.settings.pantsFourierGapM??.0015)),rs=clamp(Number(this.settings.pantsFourierRadialStrength??.75),0,1),angSlack=Math.max(.03,Number(this.settings.pantsFourierAngularSlackRad??.22)),as=clamp(Number(this.settings.pantsFourierAngularStrength??.45),0,1),cap=Math.max(.00025,Number(this.settings.pantsFourierMaxCorrectionM??.004)),thr=Math.max(.1,Number(this.settings.pantsFourierArticulationThresholdRad??.65)),radius=Math.max(0,Math.floor(this.settings.pantsFourierArticulationRadius??0));
    let total=0,active=0,maxDef=0,maxAng=0,maxApplied=0,maxHinge=0;
    for(const side of [-1,1]){
      const rings=tr.rings.filter(r=>r.side===side).sort((a,b)=>a.index-b.index),frames=rings.map((r,i)=>this._tubeRingLiveFrame(r,i,rings));if(rings.length<2)continue;
      let hinge=-1,hq=0;for(let i=0;i<frames.length-1;i++){const a=frames[i].axis,b=frames[i+1].axis,q=Math.acos(clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1));if(q>hq){hq=q;hinge=i}}maxHinge=Math.max(maxHinge,hq);if(hinge<0||hq<thr)continue;
      const hot=new Set();for(let j=Math.max(0,hinge-radius);j<=Math.min(rings.length-1,hinge+1+radius);j++)hot.add(j);
      for(let ri=0;ri<rings.length;ri++){
        if(!hot.has(ri))continue;const ring=rings[ri],f=frames[ri],C=f.center,u=f.u,v=f.v,axis=f.axis;active++;
        const state=[];let sx=0,sy=0;
        for(const i of ring.ids){const p=i*3,tdx=this.carrierTarget[p]-C[0],tdy=this.carrierTarget[p+1]-C[1],tdz=this.carrierTarget[p+2]-C[2],tu=tdx*u[0]+tdy*u[1]+tdz*u[2],tv=tdx*v[0]+tdy*v[1]+tdz*v[2],ta=Math.atan2(tv,tu),trr=Math.hypot(tu,tv),dx=this.pos[p]-C[0],dy=this.pos[p+1]-C[1],dz=this.pos[p+2]-C[2],pu=dx*u[0]+dy*u[1]+dz*u[2],pv=dx*v[0]+dy*v[1]+dz*v[2],pa=Math.atan2(pv,pu),pr=Math.hypot(pu,pv),off=wrapPi(pa-ta);sx+=Math.cos(off);sy+=Math.sin(off);state.push({i,p,ta,trr,pa,pr});}
        const collective=Math.atan2(sy,sx),radSamples=[],angSamples=[];
        for(const st of state){const expected=wrapPi(st.ta+collective),ae=wrapPi(expected-st.pa),def=st.trr+gap-st.pr;maxDef=Math.max(maxDef,def);maxAng=Math.max(maxAng,Math.abs(ae));radSamples.push({a:st.ta,y:Math.max(0,def),w:1});const arc=Math.abs(ae)>angSlack?(Math.abs(ae)-angSlack)*Math.max(.008,st.pr)*Math.sign(ae):0;angSamples.push({a:st.ta,y:arc,w:1});}
        const rc=fitFourier(radSamples,order),ac=fitFourier(angSamples,order);
        for(const st of state){let rd=Math.max(0,evalFourier(rc,st.ta))*rs,ad=evalFourier(ac,st.ta)*as;rd=Math.min(cap,rd);ad=clamp(ad,-cap*.75,cap*.75);if(rd<=1e-9&&Math.abs(ad)<=1e-9)continue;const ca=Math.cos(st.ta+collective),sa=Math.sin(st.ta+collective),rx=ca*u[0]+sa*v[0],ry=ca*u[1]+sa*v[1],rz=ca*u[2]+sa*v[2],tx=-sa*u[0]+ca*v[0],ty=-sa*u[1]+ca*v[1],tz=-sa*u[2]+ca*v[2];let cx=rx*rd+tx*ad,cy=ry*rd+ty*ad,cz=rz*rd+tz*ad;const axial=cx*axis[0]+cy*axis[1]+cz*axis[2];cx-=axis[0]*axial;cy-=axis[1]*axial;cz-=axis[2]*axial;let d=Math.hypot(cx,cy,cz);if(d>cap){const q=cap/d;cx*=q;cy*=q;cz*=q;d=cap;}maxApplied=Math.max(maxApplied,d);this.pos[st.p]+=cx;this.pos[st.p+1]+=cy;this.pos[st.p+2]+=cz;this.prev[st.p]+=cx;this.prev[st.p+1]+=cy;this.prev[st.p+2]+=cz;total++;}
      }
    }
    g.corrections+=total;g.lastCorrections=total;g.activeRings=active;g.maxRawRadialDeficitM=Math.max(g.maxRawRadialDeficitM,maxDef);g.maxRawAngularErrorRad=Math.max(g.maxRawAngularErrorRad,maxAng);g.maxAppliedM=Math.max(g.maxAppliedM,maxApplied);g.hingeAngleRad=maxHinge;return total;
  }

  pantsFourierManifoldAudit(){const g=this.pantsFourierManifold;if(!g)return null;return {enabled:this.settings.pantsFourierManifold===true,corrections:g.corrections,lastCorrections:g.lastCorrections,activeRings:g.activeRings,maxRawRadialDeficitM:g.maxRawRadialDeficitM,maxRawAngularErrorRad:g.maxRawAngularErrorRad,maxAppliedM:g.maxAppliedM,hingeAngleRad:g.hingeAngleRad,settings:{order:this.settings.pantsFourierOrder,gapM:this.settings.pantsFourierGapM,radialStrength:this.settings.pantsFourierRadialStrength,angularSlackRad:this.settings.pantsFourierAngularSlackRad,angularStrength:this.settings.pantsFourierAngularStrength,maxCorrectionM:this.settings.pantsFourierMaxCorrectionM,articulationThresholdRad:this.settings.pantsFourierArticulationThresholdRad,articulationRadius:this.settings.pantsFourierArticulationRadius}};}


  _buildPantsSectionEnvelope(){
    this.pantsSectionEnvelope=null;if(this.meta?.garmentType!=='pants')return;
    this.pantsSectionEnvelope=new PantsSectionEnvelope({bodyBindPositions:this.bodyPositions,bodyIndices:this.bodyIndices,clothRestPositions:this.rest,clothIndices:this.indices,shellVertexCount:this.shellVertexCount,rays:48,fraction:.52});
    if(this.settings.pantsSectionEnvelope===undefined)this.settings.pantsSectionEnvelope=false;if(this.settings.pantsSectionEnvelopeGapM===undefined)this.settings.pantsSectionEnvelopeGapM=.001;if(this.settings.pantsSectionEnvelopeOrder===undefined)this.settings.pantsSectionEnvelopeOrder=4;if(this.settings.pantsSectionEnvelopeStrength===undefined)this.settings.pantsSectionEnvelopeStrength=.65;if(this.settings.pantsSectionEnvelopeCapM===undefined)this.settings.pantsSectionEnvelopeCapM=.0025;if(this.settings.pantsSectionEnvelopeAxialWidthM===undefined)this.settings.pantsSectionEnvelopeAxialWidthM=.055;if(this.settings.pantsSectionEnvelopeArticulationThresholdRad===undefined)this.settings.pantsSectionEnvelopeArticulationThresholdRad=.65;if(this.settings.pantsSectionEnvelopePasses===undefined)this.settings.pantsSectionEnvelopePasses=1;if(this.settings.pantsSectionEnvelopeDeficitWeight===undefined)this.settings.pantsSectionEnvelopeDeficitWeight=1;if(this.settings.pantsSectionBarrier===undefined)this.settings.pantsSectionBarrier=false;if(this.settings.pantsSectionBarrierTriggerM===undefined)this.settings.pantsSectionBarrierTriggerM=-.003;if(this.settings.pantsSectionBarrierTargetM===undefined)this.settings.pantsSectionBarrierTargetM=.0005;if(this.settings.pantsSectionBarrierStrength===undefined)this.settings.pantsSectionBarrierStrength=.35;if(this.settings.pantsSectionBarrierCapM===undefined)this.settings.pantsSectionBarrierCapM=.0015;if(this.settings.pantsSectionBarrierNeighborWeight===undefined)this.settings.pantsSectionBarrierNeighborWeight=.25;if(this.settings.pantsSectionBarrierRings===undefined)this.settings.pantsSectionBarrierRings=3;if(this.settings.pantsSectionBarrierFalloff===undefined)this.settings.pantsSectionBarrierFalloff=.68;
  }
  _applyPantsSectionEnvelope(){const e=this.pantsSectionEnvelope;if(!e||this.settings.pantsSectionEnvelope!==true)return 0;const h=this._pantsDominantHinge?.();if(h&&h.angle<Number(this.settings.pantsSectionEnvelopeArticulationThresholdRad??.65))return 0;this.syncRender();let total=0;const passes=Math.max(1,Math.min(4,Math.floor(this.settings.pantsSectionEnvelopePasses??1)));for(let pass=0;pass<passes;pass++){const n=e.apply(this.bodyPositions,this.pos,this.prev,{gapM:Number(this.settings.pantsSectionEnvelopeGapM??.001),order:Number(this.settings.pantsSectionEnvelopeOrder??4),strength:Number(this.settings.pantsSectionEnvelopeStrength??.65),capM:Number(this.settings.pantsSectionEnvelopeCapM??.0025),axialWidthM:Number(this.settings.pantsSectionEnvelopeAxialWidthM??.055),deficitWeight:Number(this.settings.pantsSectionEnvelopeDeficitWeight??1),barrier:this.settings.pantsSectionBarrier===true,barrierTriggerM:Number(this.settings.pantsSectionBarrierTriggerM??-.003),barrierTargetM:Number(this.settings.pantsSectionBarrierTargetM??.0005),barrierStrength:Number(this.settings.pantsSectionBarrierStrength??.35),barrierCapM:Number(this.settings.pantsSectionBarrierCapM??.0015),barrierNeighborWeight:Number(this.settings.pantsSectionBarrierNeighborWeight??.25),barrierRings:Number(this.settings.pantsSectionBarrierRings??3),barrierFalloff:Number(this.settings.pantsSectionBarrierFalloff??.68)});total+=n;if(!n)break;}if(total)this.syncRender();return total;}
  pantsSectionEnvelopeAudit(){const e=this.pantsSectionEnvelope;return e?{enabled:this.settings.pantsSectionEnvelope===true,...e.stats,settings:{gapM:this.settings.pantsSectionEnvelopeGapM,order:this.settings.pantsSectionEnvelopeOrder,strength:this.settings.pantsSectionEnvelopeStrength,capM:this.settings.pantsSectionEnvelopeCapM,axialWidthM:this.settings.pantsSectionEnvelopeAxialWidthM,articulationThresholdRad:this.settings.pantsSectionEnvelopeArticulationThresholdRad,passes:this.settings.pantsSectionEnvelopePasses,deficitWeight:this.settings.pantsSectionEnvelopeDeficitWeight}}:null;}


  _buildPantsBodyContainment(){
    this.pantsContainment=null;
    if(this.meta?.garmentType!=='pants'||!this.shellVertexCount)return;
    this.syncRender();this.computeNormals();
    const bvh=new DynamicTriangleBVH(this.indices,this.renderPositions,{leafSize:10});
    bvh.refit(this.renderPositions,this.renderNormals,this.renderPositions,1/120);
    let ymin=Infinity,ymax=-Infinity;for(let i=0;i<this.shellVertexCount;i++){const y=this.rest[i*3+1];ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}
    const low=ymin+.085,high=Math.min(ymax-.15,ymin+(ymax-ymin)*.78),probes=[];
    for(let i=0;i<this.bodyPositions.length/3;i++){
      const p=i*3,x=this.bodyPositions[p],y=this.bodyPositions[p+1],z=this.bodyPositions[p+2];
      if(y<low||y>high||Math.abs(x)<.025)continue;
      const h=bvh.closestPoint(x,y,z,.075);if(!h)continue;
      const dist=Math.sqrt(h.d2);
      if(dist<=.055&&h.signed<-.0045)probes.push({bodyVertex:i,seedTi:h.ti,restSigned:h.signed,restDistanceM:dist});
    }
    this.pantsContainment={
      probes,bvh,marginM:.0015,maxCorrectionM:.010,passes:3,strength:.88,rings:3,maxDistanceM:.12,
      frames:0,corrections:0,lastViolations:0,maxOutsideM:0,maxCorrectionAppliedM:0
    };
    if(this.settings.pantsContainment===undefined)this.settings.pantsContainment=false; // experimental signed-distance projector; topology authority is occupancy + tube audit
    if(this.settings.pantsContainmentMarginM===undefined)this.settings.pantsContainmentMarginM=this.pantsContainment.marginM;
    if(this.settings.pantsContainmentMaxCorrectionM===undefined)this.settings.pantsContainmentMaxCorrectionM=this.pantsContainment.maxCorrectionM;
    if(this.settings.pantsContainmentPasses===undefined)this.settings.pantsContainmentPasses=this.pantsContainment.passes;
    if(this.settings.pantsContainmentStrength===undefined)this.settings.pantsContainmentStrength=this.pantsContainment.strength;
  }

  _pantsContainmentRefit(dt){
    const g=this.pantsContainment;if(!g)return;
    this.syncRender();this.computeNormals();
    g.bvh.refit(this.renderPositions,this.renderNormals,this.prev,dt);
  }

  _solvePantsBodyContainment(dt){
    const g=this.pantsContainment;if(!g||this.settings.pantsContainment===false||!g.probes.length)return 0;
    const margin=Math.max(0,Number(this.settings.pantsContainmentMarginM??g.marginM)),cap=Math.max(.001,Number(this.settings.pantsContainmentMaxCorrectionM??g.maxCorrectionM)),passes=Math.max(1,Math.floor(this.settings.pantsContainmentPasses??g.passes)),strength=clamp(Number(this.settings.pantsContainmentStrength??g.strength),0,1);
    let total=0,lastViol=0,maxOutside=0,maxApplied=0;
    for(let pass=0;pass<passes;pass++){
      this._pantsContainmentRefit(dt);
      const acc=new Float64Array(this.shellVertexCount*3),hits=new Uint16Array(this.shellVertexCount);let viol=0;
      for(const pr of g.probes){
        const bp=pr.bodyVertex*3,x=this.bodyPositions[bp],y=this.bodyPositions[bp+1],z=this.bodyPositions[bp+2];
        let h=g.bvh.closestPointNeighborhood(x,y,z,pr.seedTi,g.rings,g.maxDistanceM);
        if(!h)h=g.bvh.closestPoint(x,y,z,g.maxDistanceM);if(!h)continue;
        maxOutside=Math.max(maxOutside,h.signed);
        if(h.signed<=-margin)continue;
        viol++;
        const correction=Math.min(cap,(h.signed+margin)*strength);maxApplied=Math.max(maxApplied,correction);
        // Preserve the material patch correspondence. Translating all three
        // vertices along the local outward normal moves the triangle closest
        // point coherently instead of pinching toward one barycentric corner.
        const k=h.ti*3;
        for(let q=0;q<3;q++){
          const vi=this.indices[k+q];if(vi>=this.shellVertexCount)continue;const p=vi*3;
          acc[p]+=h.nx*correction;acc[p+1]+=h.ny*correction;acc[p+2]+=h.nz*correction;hits[vi]++;
        }
      }
      for(let i=0;i<this.shellVertexCount;i++){
        if(!hits[i])continue;const p=i*3,inv=1/hits[i],dx=acc[p]*inv,dy=acc[p+1]*inv,dz=acc[p+2]*inv,d=Math.hypot(dx,dy,dz),sc=d>cap?cap/d:1,ox=dx*sc,oy=dy*sc,oz=dz*sc;
        this.pos[p]+=ox;this.pos[p+1]+=oy;this.pos[p+2]+=oz;this.prev[p]+=ox;this.prev[p+1]+=oy;this.prev[p+2]+=oz;
      }
      total+=viol;lastViol=viol;if(!viol)break;
    }
    g.frames++;g.corrections+=total;g.lastViolations=lastViol;g.maxOutsideM=Math.max(g.maxOutsideM,maxOutside);g.maxCorrectionAppliedM=Math.max(g.maxCorrectionAppliedM,maxApplied);
    this.syncRender();return total;
  }

  pantsContainmentAudit(){
    const g=this.pantsContainment;if(!g)return null;this._pantsContainmentRefit(1/120);
    const vals=[];let outside=0,violating=0,maxOutside=-Infinity;
    const margin=Math.max(0,Number(this.settings.pantsContainmentMarginM??g.marginM));
    for(const pr of g.probes){const p=pr.bodyVertex*3;let h=g.bvh.closestPointNeighborhood(this.bodyPositions[p],this.bodyPositions[p+1],this.bodyPositions[p+2],pr.seedTi,g.rings,g.maxDistanceM);if(!h)h=g.bvh.closestPoint(this.bodyPositions[p],this.bodyPositions[p+1],this.bodyPositions[p+2],g.maxDistanceM);if(!h)continue;vals.push(h.signed);if(h.signed>0)outside++;if(h.signed>-margin)violating++;maxOutside=Math.max(maxOutside,h.signed)}
    vals.sort((a,b)=>a-b);const pct=q=>vals.length?vals[Math.min(vals.length-1,Math.floor((vals.length-1)*q))]:null;
    return {probes:g.probes.length,sampled:vals.length,outside,violating,marginM:margin,p50SignedM:pct(.5),p95SignedM:pct(.95),p99SignedM:pct(.99),maxSignedM:Number.isFinite(maxOutside)?maxOutside:null};
  }

  _buildPantsInnerContact(){
    this.pantsInnerContact=null;if(this.meta?.garmentType!=='pants'||!this.pantsContainment?.probes?.length)return;
    // One probe per body vertex, preserving the closest bind-pose denim seed.
    const best=new Map();for(const p of this.pantsContainment.probes){const old=best.get(p.bodyVertex);if(!old||p.restDistanceM<old.restDistanceM)best.set(p.bodyVertex,{...p,insideSign:p.restSigned<=0?-1:1});}
    const neighbors=Array.from({length:this.shellVertexCount},()=>[]);for(let k=0;k<this.edges.length;k+=2){const a=this.edges[k],b=this.edges[k+1];if(a<this.shellVertexCount&&b<this.shellVertexCount){neighbors[a].push(b);neighbors[b].push(a)}}
    this.pantsInnerContact={probes:[...best.values()],neighbors,bvh:new DynamicTriangleBVH(this.indices,this.pos,{leafSize:10}),calls:0,corrections:0,lastViolations:0,maxViolationM:0,misses:0};
    if(this.settings.pantsInnerContact===undefined)this.settings.pantsInnerContact=true;
    if(this.settings.pantsInnerContactMarginM===undefined)this.settings.pantsInnerContactMarginM=.0012;
    if(this.settings.pantsInnerContactStrength===undefined)this.settings.pantsInnerContactStrength=.55;
    if(this.settings.pantsInnerContactMaxCorrectionM===undefined)this.settings.pantsInnerContactMaxCorrectionM=.0030;
    if(this.settings.pantsInnerContactNeighborWeight===undefined)this.settings.pantsInnerContactNeighborWeight=.30;
    if(this.settings.pantsInnerContactRings===undefined)this.settings.pantsInnerContactRings=3;
    if(this.settings.pantsInnerContactMaxDistanceM===undefined)this.settings.pantsInnerContactMaxDistanceM=.065;
  }

  _applyPantsInnerContact(){
    const g=this.pantsInnerContact;if(!g||this.settings.pantsInnerContact===false)return 0;
    const margin=Math.max(0,Number(this.settings.pantsInnerContactMarginM??.0012)),strength=clamp(Number(this.settings.pantsInnerContactStrength??.55),0,1),cap=Math.max(.0002,Number(this.settings.pantsInnerContactMaxCorrectionM??.003)),nw=clamp(Number(this.settings.pantsInnerContactNeighborWeight??.30),0,.75),rings=Math.max(1,Math.min(3,Math.floor(this.settings.pantsInnerContactRings??3))),maxD=Math.max(.02,Number(this.settings.pantsInnerContactMaxDistanceM??.065));
    // Neighborhood queries read this.pos directly; refit keeps triangle normals
    // and optional velocity metadata coherent without enabling global fallback.
    g.bvh.refit(this.pos,null,this.prev,this._bodySurfaceDt||1/120);
    const acc=new Float64Array(this.shellVertexCount*3),wgt=new Float64Array(this.shellVertexCount);let viol=0,miss=0,maxV=0;
    for(const pr of g.probes){const p=pr.bodyVertex*3,x=this.bodyPositions[p],y=this.bodyPositions[p+1],z=this.bodyPositions[p+2],h=g.bvh.closestPointNeighborhood(x,y,z,pr.seedTi,rings,maxD);if(!h){miss++;continue;}pr.seedTi=h.ti;
      // Bind-pose probes are all on the local garment interior side. Keep the
      // explicit sign anyway so this primitive generalizes to other garments.
      const oriented=pr.insideSign*h.signed; // positive means still on original side
      if(oriented>=margin)continue;const deficit=margin-oriented;maxV=Math.max(maxV,deficit);let c=Math.min(cap,deficit*strength);if(c<=1e-9)continue;
      // Moving the cloth along +normal makes signed distance more negative;
      // account for arbitrary stored insideSign.
      const sg=pr.insideSign<0?1:-1,cx=h.nx*c*sg,cy=h.ny*c*sg,cz=h.nz*c*sg,k=h.ti*3;
      for(let q=0;q<3;q++){const vi=this.indices[k+q];if(vi>=this.shellVertexCount)continue;const vp=vi*3,bw=q===0?h.u:(q===1?h.v:h.w),ww=.70+.30*bw;acc[vp]+=cx*ww;acc[vp+1]+=cy*ww;acc[vp+2]+=cz*ww;wgt[vi]+=ww;for(const nb of g.neighbors[vi]){const np=nb*3,wn=nw*ww;acc[np]+=cx*wn;acc[np+1]+=cy*wn;acc[np+2]+=cz*wn;wgt[nb]+=wn;}}
      viol++;
    }
    let moved=0;for(let i=0;i<this.shellVertexCount;i++){if(!wgt[i])continue;const p=i*3,inv=1/wgt[i],dx=acc[p]*inv,dy=acc[p+1]*inv,dz=acc[p+2]*inv,d=Math.hypot(dx,dy,dz),sc=d>cap?cap/d:1;this.pos[p]+=dx*sc;this.pos[p+1]+=dy*sc;this.pos[p+2]+=dz*sc;moved++;}
    if(moved)this._hardWeldShell(1);g.calls++;g.corrections+=moved;g.lastViolations=viol;g.maxViolationM=Math.max(g.maxViolationM,maxV);g.misses+=miss;return moved;
  }

  pantsInnerContactAudit(){const g=this.pantsInnerContact;if(!g)return null;return{enabled:this.settings.pantsInnerContact!==false,probes:g.probes.length,calls:g.calls,corrections:g.corrections,lastViolations:g.lastViolations,maxViolationM:g.maxViolationM,misses:g.misses,marginM:this.settings.pantsInnerContactMarginM,maxCorrectionM:this.settings.pantsInnerContactMaxCorrectionM};}

  _buildPantsLocalCcd(){
    this.pantsLocalCcd=null;if(this.meta?.garmentType!=='pants'||!this.pantsInnerContact?.probes?.length)return;
    const probes=[];for(const pr of this.pantsInnerContact.probes){const p=pr.bodyVertex*3;probes.push({bodyVertex:pr.bodyVertex,seedTi:pr.seedTi,restY:this.bodyPositions[p+1],restX:this.bodyPositions[p],insideSign:pr.insideSign??-1});}
    this.pantsLocalCcd={probes,bvh:new DynamicTriangleBVH(this.indices,this.pos,{leafSize:10}),lastSerial:-1,events:0,lastEvents:0,movedVertices:0,maxPenetrationM:0,maxAppliedM:0,activeProbes:0,hingeAngleRad:0};
    if(this.settings.pantsLocalCcd===undefined)this.settings.pantsLocalCcd=false;
    if(this.settings.pantsLocalCcdRings===undefined)this.settings.pantsLocalCcdRings=2;
    if(this.settings.pantsLocalCcdMarginM===undefined)this.settings.pantsLocalCcdMarginM=.0015;
    if(this.settings.pantsLocalCcdStrength===undefined)this.settings.pantsLocalCcdStrength=.85;
    if(this.settings.pantsLocalCcdMaxCorrectionM===undefined)this.settings.pantsLocalCcdMaxCorrectionM=.0060;
    if(this.settings.pantsLocalCcdNeighborWeight===undefined)this.settings.pantsLocalCcdNeighborWeight=.22;
    if(this.settings.pantsLocalCcdArticulationThresholdRad===undefined)this.settings.pantsLocalCcdArticulationThresholdRad=.55;
    if(this.settings.pantsLocalCcdRestPadM===undefined)this.settings.pantsLocalCcdRestPadM=.045;
    if(this.settings.pantsLocalCcdPhase===undefined)this.settings.pantsLocalCcdPhase='pre';
  }

  _pantsDominantHinge(){
    const tr=this.pantsTubeRings;if(!tr)return null;let best=null;
    for(const side of [-1,1]){const rings=tr.rings.filter(r=>r.side===side).sort((a,b)=>a.index-b.index),frames=rings.map((r,i)=>this._tubeRingLiveFrame(r,i,rings));for(let i=0;i<frames.length-1;i++){const a=frames[i].axis,b=frames[i+1].axis,q=Math.acos(clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1));if(!best||q>best.angle)best={side,angle:q,ringA:rings[i],ringB:rings[i+1],frameA:frames[i],frameB:frames[i+1]};}}
    return best;
  }

  _applyPantsLocalCcd(phase='pre'){
    const g=this.pantsLocalCcd,key=phase==='post'?'lastSerialPost':'lastSerial';if(!g||this.settings.pantsLocalCcd!==true||g[key]===this._bodySurfaceSerial)return 0;g[key]=this._bodySurfaceSerial;
    const P0=this.bodyPrevPositions,P1=this.bodyPositions,N=this.bodyNormals;if(!P0||!P1||!N)return 0;this._updateCarrierTargets();const hinge=this._pantsDominantHinge(),thr=Math.max(.1,Number(this.settings.pantsLocalCcdArticulationThresholdRad??.55));if(!hinge||hinge.angle<thr){g.lastEvents=0;g.activeProbes=0;return 0;}
    const y0=Math.min(hinge.ringA.y0,hinge.ringB.y0)-Math.max(0,Number(this.settings.pantsLocalCcdRestPadM??.045)),y1=Math.max(hinge.ringA.y1,hinge.ringB.y1)+Math.max(0,Number(this.settings.pantsLocalCcdRestPadM??.045)),rings=Math.max(1,Math.min(3,Math.floor(this.settings.pantsLocalCcdRings??2))),margin=Math.max(0,Number(this.settings.pantsLocalCcdMarginM??.0015)),strength=clamp(Number(this.settings.pantsLocalCcdStrength??.85),0,1),cap=Math.max(.0005,Number(this.settings.pantsLocalCcdMaxCorrectionM??.006)),nw=clamp(Number(this.settings.pantsLocalCcdNeighborWeight??.22),0,.6);
    g.bvh.refit(this.pos,null,this.prev,this._bodySurfaceDt||1/120);const acc=new Float64Array(this.shellVertexCount*3),wgt=new Float64Array(this.shellVertexCount);let events=0,maxPen=0,active=0;
    for(const pr of g.probes){if(pr.restY<y0||pr.restY>y1||(hinge.side<0?pr.restX>0:pr.restX<0))continue;active++;const p=pr.bodyVertex*3,x0=P0[p],y0p=P0[p+1],z0=P0[p+2],x1=P1[p],y1p=P1[p+1],z1=P1[p+2],travel=Math.hypot(x1-x0,y1p-y0p,z1-z0);if(travel<.00025)continue;let hit=null,bestT=1.000001;const tris=g.bvh.triangleNeighborhood(pr.seedTi,rings);for(let q=0;q<tris.length;q++){const h=g.bvh._segmentTriangle(x0,y0p,z0,x1,y1p,z1,tris[q]);if(h&&h.t<bestT){hit=h;bestT=h.t;}}if(!hit)continue;pr.seedTi=hit.ti;let nx=N[p],ny=N[p+1],nz=N[p+2],nl=Math.hypot(nx,ny,nz);if(nl<1e-8)continue;nx/=nl;ny/=nl;nz/=nl;const pen=(x1-hit.x)*nx+(y1p-hit.y)*ny+(z1-hit.z)*nz;if(pen<=-margin*.25)continue;const need=Math.min(cap,Math.max(margin,pen+margin)*strength);maxPen=Math.max(maxPen,Math.max(0,pen));const cx=nx*need,cy=ny*need,cz=nz*need,k=hit.ti*3;for(let j=0;j<3;j++){const vi=this.indices[k+j];if(vi>=this.shellVertexCount)continue;const vp=vi*3,bw=j===0?hit.u:(j===1?hit.v:hit.w),ww=.65+.35*bw;acc[vp]+=cx*ww;acc[vp+1]+=cy*ww;acc[vp+2]+=cz*ww;wgt[vi]+=ww;for(const nb of this.pantsInnerContact.neighbors[vi]){const np=nb*3,wn=nw*ww;acc[np]+=cx*wn;acc[np+1]+=cy*wn;acc[np+2]+=cz*wn;wgt[nb]+=wn;}}events++;}
    let moved=0,maxApplied=0;for(let i=0;i<this.shellVertexCount;i++){if(!wgt[i])continue;const p=i*3,inv=1/wgt[i],dx=acc[p]*inv,dy=acc[p+1]*inv,dz=acc[p+2]*inv,d=Math.hypot(dx,dy,dz),sc=d>cap?cap/d:1,ox=dx*sc,oy=dy*sc,oz=dz*sc;this.pos[p]+=ox;this.pos[p+1]+=oy;this.pos[p+2]+=oz;this.prev[p]+=ox;this.prev[p+1]+=oy;this.prev[p+2]+=oz;maxApplied=Math.max(maxApplied,Math.hypot(ox,oy,oz));moved++;}if(moved)this._hardWeldShell(1);g.events+=events;g.lastEvents=events;g.movedVertices+=moved;g.maxPenetrationM=Math.max(g.maxPenetrationM,maxPen);g.maxAppliedM=Math.max(g.maxAppliedM,maxApplied);g.activeProbes=active;g.hingeAngleRad=hinge.angle;return moved;
  }

  pantsLocalCcdAudit(){const g=this.pantsLocalCcd;if(!g)return null;return {enabled:this.settings.pantsLocalCcd===true,probes:g.probes.length,activeProbes:g.activeProbes,events:g.events,lastEvents:g.lastEvents,movedVertices:g.movedVertices,maxPenetrationM:g.maxPenetrationM,maxAppliedM:g.maxAppliedM,hingeAngleRad:g.hingeAngleRad,settings:{rings:this.settings.pantsLocalCcdRings,marginM:this.settings.pantsLocalCcdMarginM,strength:this.settings.pantsLocalCcdStrength,maxCorrectionM:this.settings.pantsLocalCcdMaxCorrectionM,neighborWeight:this.settings.pantsLocalCcdNeighborWeight,articulationThresholdRad:this.settings.pantsLocalCcdArticulationThresholdRad,restPadM:this.settings.pantsLocalCcdRestPadM,phase:this.settings.pantsLocalCcdPhase}};}


  _buildPantsBodySweepGuard(){
    this.pantsBodySweep=null;if(this.meta?.garmentType!=='pants'||!this.pantsContainment?.probes?.length)return;
    const probeIds=Uint32Array.from([...new Set(this.pantsContainment.probes.map(p=>p.bodyVertex))]);
    const neighbors=Array.from({length:this.shellVertexCount},()=>[]);for(let k=0;k<this.edges.length;k+=2){const a=this.edges[k],b=this.edges[k+1];if(a<this.shellVertexCount&&b<this.shellVertexCount){neighbors[a].push(b);neighbors[b].push(a)}}
    this.pantsBodySweep={probeIds,neighbors,bvh:new DynamicTriangleBVH(this.indices,this.pos,{leafSize:10}),lastSerial:-1,events:0,lastEvents:0,maxCrossingM:0,maxAppliedM:0};
    if(this.settings.pantsBodySweepGuard===undefined)this.settings.pantsBodySweepGuard=true;
    if(this.settings.pantsBodySweepMarginM===undefined)this.settings.pantsBodySweepMarginM=.0015;
    if(this.settings.pantsBodySweepMaxCorrectionM===undefined)this.settings.pantsBodySweepMaxCorrectionM=.018;
    if(this.settings.pantsBodySweepNeighborWeight===undefined)this.settings.pantsBodySweepNeighborWeight=.42;
    if(this.settings.pantsBodySweepMinTravelM===undefined)this.settings.pantsBodySweepMinTravelM=.0010;
  }

  _applyPantsBodySweepGuard(){
    const g=this.pantsBodySweep;if(!g||this.settings.pantsBodySweepGuard===false||g.lastSerial===this._bodySurfaceSerial)return 0;g.lastSerial=this._bodySurfaceSerial;
    const P0=this.bodyPrevPositions,P1=this.bodyPositions;if(!P0||!P1)return 0;
    g.bvh.refit(this.pos,null,this.prev,this._bodySurfaceDt||1/120);
    const margin=Math.max(0,Number(this.settings.pantsBodySweepMarginM??.0015)),cap=Math.max(.001,Number(this.settings.pantsBodySweepMaxCorrectionM??.018)),nw=clamp(Number(this.settings.pantsBodySweepNeighborWeight??.42),0,.8),minTravel=Math.max(0,Number(this.settings.pantsBodySweepMinTravelM??.001));
    const acc=new Float64Array(this.shellVertexCount*3),wgt=new Float64Array(this.shellVertexCount);let events=0,maxCross=0;
    for(const vi of g.probeIds){const p=vi*3,x0=P0[p],y0=P0[p+1],z0=P0[p+2],x1=P1[p],y1=P1[p+1],z1=P1[p+2],mx=x1-x0,my=y1-y0,mz=z1-z0,travel=Math.hypot(mx,my,mz);if(travel<minTravel)continue;
      const h=g.bvh.sweepSegment(x0,y0,z0,x1,y1,z1,{pad:margin});if(!h)continue;
      const s0=(x0-h.x)*h.nx+(y0-h.y)*h.ny+(z0-h.z)*h.nz,s1=(x1-h.x)*h.nx+(y1-h.y)*h.ny+(z1-h.z)*h.nz;if(s0*s1>0)continue;
      const target=(s0>=0?1:-1)*margin,need=s1-target;if(Math.abs(need)<1e-7)continue;let cx=h.nx*need,cy=h.ny*need,cz=h.nz*need,d=Math.hypot(cx,cy,cz);maxCross=Math.max(maxCross,Math.abs(s1));if(d>cap){const q=cap/d;cx*=q;cy*=q;cz*=q;d=cap}
      const tri=this.indices.subarray(h.ti*3,h.ti*3+3);for(let q=0;q<3;q++){const ci=tri[q];if(ci>=this.shellVertexCount)continue;const cp=ci*3,bw=q===0?h.u:(q===1?h.v:h.w),ww=.55+.45*bw;acc[cp]+=cx*ww;acc[cp+1]+=cy*ww;acc[cp+2]+=cz*ww;wgt[ci]+=ww;for(const nb of g.neighbors[ci]){const np=nb*3,wn=nw*ww;acc[np]+=cx*wn;acc[np+1]+=cy*wn;acc[np+2]+=cz*wn;wgt[nb]+=wn;}}
      events++;
    }
    let moved=0,maxApplied=0;for(let i=0;i<this.shellVertexCount;i++){if(!wgt[i])continue;const p=i*3,inv=1/wgt[i],dx=acc[p]*inv,dy=acc[p+1]*inv,dz=acc[p+2]*inv,d=Math.hypot(dx,dy,dz),sc=d>cap?cap/d:1,ox=dx*sc,oy=dy*sc,oz=dz*sc;this.pos[p]+=ox;this.pos[p+1]+=oy;this.pos[p+2]+=oz;maxApplied=Math.max(maxApplied,Math.hypot(ox,oy,oz));moved++;}
    if(moved)this._hardWeldShell(1);g.events+=events;g.lastEvents=events;g.maxCrossingM=Math.max(g.maxCrossingM,maxCross);g.maxAppliedM=Math.max(g.maxAppliedM,maxApplied);return moved;
  }

  pantsBodySweepAudit(){const g=this.pantsBodySweep;if(!g)return null;return{enabled:this.settings.pantsBodySweepGuard!==false,probes:g.probeIds.length,events:g.events,lastEvents:g.lastEvents,maxCrossingM:g.maxCrossingM,maxAppliedM:g.maxAppliedM,marginM:this.settings.pantsBodySweepMarginM,maxCorrectionM:this.settings.pantsBodySweepMaxCorrectionM};}

  _prePantsTubeVelocity(dt){
    const g=this.pantsOccupancy;if(!g||this.settings.pantsOccupancy===false||['legacy','ring','bulk','rigid'].includes(this.settings.pantsOccupancyMode)||!g.ids.length)return 0;
    // Refresh material carriers against the live governed body before advancing
    // cloth.  This is a velocity-level servo, not a positional skinning lock.
    this._updateCarrierTargets();
    const scale=clamp(Number(this.settings.pantsOccupancyScale??1),.25,2),rateN=Math.max(0,Number(this.settings.pantsTubeNormalFollowRate??12)),rateT=Math.max(0,Number(this.settings.pantsTubeTangentialFollowRate??3)),maxBoost=Math.max(.05,Number(this.settings.pantsTubeMaxVelocityBoostMps??.85));
    let boosted=0;
    for(const i of g.ids){
      const p=i*3,nx=this.carrierNormal[p],ny=this.carrierNormal[p+1],nz=this.carrierNormal[p+2],nl=Math.hypot(nx,ny,nz);if(nl<1e-8)continue;
      const ex=this.carrierTarget[p]-this.pos[p],ey=this.carrierTarget[p+1]-this.pos[p+1],ez=this.carrierTarget[p+2]-this.pos[p+2],en=ex*nx+ey*ny+ez*nz,tx=ex-nx*en,ty=ey-ny*en,tz=ez-nz*en,td=Math.hypot(tx,ty,tz);
      let bvx=0,bvy=0,bvz=0,ti=this.carrierTri?.[i]??-1;if(ti>=0){const q=this.bodyBVH.sampleTriangle(ti,this.carrierUVW[p],this.carrierUVW[p+1],this.carrierUVW[p+2]);bvx=q.vx;bvy=q.vy;bvz=q.vz;}
      let dvx=0,dvy=0,dvz=0;const ni=(g.normalInwardFree?.[i]||.025)*scale;
      if(en>ni){const desired=Math.min(maxBoost,(en-ni)*rateN),rn=(this.vel[p]-bvx)*nx+(this.vel[p+1]-bvy)*ny+(this.vel[p+2]-bvz)*nz,dv=clamp(desired-rn,0,maxBoost);dvx+=nx*dv;dvy+=ny*dv;dvz+=nz*dv;}
      if(this.settings.pantsOccupancyTangential!==false){const tf=g.freeT[i]*scale;if(td>tf&&td>1e-8){const ux=tx/td,uy=ty/td,uz=tz/td,desired=Math.min(maxBoost*.55,(td-tf)*rateT),rt=(this.vel[p]-bvx)*ux+(this.vel[p+1]-bvy)*uy+(this.vel[p+2]-bvz)*uz,dv=clamp(desired-rt,0,maxBoost*.55);dvx+=ux*dv;dvy+=uy*dv;dvz+=uz*dv;}}
      const d=Math.hypot(dvx,dvy,dvz);if(d>maxBoost){const q=maxBoost/d;dvx*=q;dvy*=q;dvz*=q;}if(Math.abs(dvx)+Math.abs(dvy)+Math.abs(dvz)>1e-9){this.vel[p]+=dvx;this.vel[p+1]+=dvy;this.vel[p+2]+=dvz;boosted++;}
    }
    return boosted;
  }

  _applyPantsOccupancy(){
    const g=this.pantsOccupancy;
    if(!g||this.settings.pantsOccupancy===false||!g.ids.length)return 0;
    if(['predictive','ring','bulk','rigid'].includes(this.settings.pantsOccupancyMode))return 0;
    const scale=clamp(Number(this.settings.pantsOccupancyScale??1),.25,2);
    const nf=Math.max(.025,Number(this.settings.pantsOccupancyNormalFreeM??g.normalFreeM));
    const maxC=Math.max(.001,Number(this.settings.pantsOccupancyMaxCorrectionM??g.maxCorrectionM));
    let corrected=0,maxT=0,maxN=0;
    const hybrid=(this.settings.pantsOccupancyMode==='hybrid'||this.settings.pantsOccupancyMode==='preproject'||this.settings.pantsOccupancyMode==='frameguard'||this.settings.pantsOccupancyMode==='smooth'),emergencySlack=Math.max(.004,Number(this.settings.pantsTubeEmergencySlackM??.018));
    const smooth=this.settings.pantsOccupancyMode==='smooth',corr=smooth?new Float64Array(this.shellVertexCount*3):null;
    for(const i of g.ids){
      const p=i*3,nx=this.carrierNormal[p],ny=this.carrierNormal[p+1],nz=this.carrierNormal[p+2];
      const nl=Math.hypot(nx,ny,nz);if(nl<1e-8)continue;
      // Error points from cloth toward its persistent material carrier.
      const ex=this.carrierTarget[p]-this.pos[p],ey=this.carrierTarget[p+1]-this.pos[p+1],ez=this.carrierTarget[p+2]-this.pos[p+2];
      const en=ex*nx+ey*ny+ez*nz;
      const tx=ex-nx*en,ty=ey-ny*en,tz=ez-nz*en,td=Math.hypot(tx,ty,tz);
      maxT=Math.max(maxT,td);maxN=Math.max(maxN,Math.abs(en));
      let cx=0,cy=0,cz=0;
      const tf=g.freeT[i]*scale,str=g.strength[i];
      const tLimit=tf+(hybrid?emergencySlack:0);
      if(this.settings.pantsOccupancyTangential!==false&&td>tLimit){
        const c=Math.min(hybrid?Math.min(maxC,.0035):maxC,(td-tLimit)*str*(hybrid?.45:1)),q=c/(td||1);
        cx+=tx*q;cy+=ty*q;cz+=tz*q;
      }
      const ni=(g.normalInwardFree?.[i]||nf)*scale,no=(g.normalOutwardFree?.[i]||nf)*scale,ns=g.normalStrength?.[i]??.60;
      const nLimit=ni+(hybrid?emergencySlack:0);
      if(en>nLimit){
        const c=Math.min(hybrid?Math.min(maxC,.0035):maxC,(en-nLimit)*ns*(hybrid?.55:1));cx+=nx*c;cy+=ny*c;cz+=nz*c;
      }else if(en<-no){
        const c=Math.min(maxC*.35,(-en-no)*.20);cx-=nx*c;cy-=ny*c;cz-=nz*c;
      }
      const d=Math.hypot(cx,cy,cz);if(d<=1e-9)continue;
      if(d>maxC){const q=maxC/d;cx*=q;cy*=q;cz*=q;}
      if(smooth){corr[p]=cx;corr[p+1]=cy;corr[p+2]=cz;}
      else{this.pos[p]+=cx;this.pos[p+1]+=cy;this.pos[p+2]+=cz;this.prev[p]+=cx;this.prev[p+1]+=cy;this.prev[p+2]+=cz;corrected++;}
    }
    if(smooth){
      // Limit the spatial gradient of the emergency correction over the denim
      // graph. Pairwise transfers conserve the correction field's vector sum,
      // but prevent adjacent material points from receiving sharply different
      // rescue vectors that would directly stretch short construction edges.
      const passes=Math.max(1,Math.min(8,Math.floor(this.settings.pantsOccupancySmoothPasses??3))),grad=Math.max(.00025,Number(this.settings.pantsOccupancySmoothGradientM??.0016));
      for(let pass=0;pass<passes;pass++)for(let k=0;k<this.edges.length;k+=2){const a=this.edges[k],b=this.edges[k+1];if(a>=this.shellVertexCount||b>=this.shellVertexCount||!g.guardMask[a]||!g.guardMask[b])continue;const pa=a*3,pb=b*3,dx=corr[pa]-corr[pb],dy=corr[pa+1]-corr[pb+1],dz=corr[pa+2]-corr[pb+2],d=Math.hypot(dx,dy,dz);if(d<=grad)continue;const transfer=.5*(1-grad/d),qx=dx*transfer,qy=dy*transfer,qz=dz*transfer;corr[pa]-=qx;corr[pa+1]-=qy;corr[pa+2]-=qz;corr[pb]+=qx;corr[pb+1]+=qy;corr[pb+2]+=qz;}
      for(const i of g.ids){const p=i*3;let cx=corr[p],cy=corr[p+1],cz=corr[p+2],d=Math.hypot(cx,cy,cz);if(d<=1e-9)continue;if(d>maxC){const q=maxC/d;cx*=q;cy*=q;cz*=q;}this.pos[p]+=cx;this.pos[p+1]+=cy;this.pos[p+2]+=cz;this.prev[p]+=cx;this.prev[p+1]+=cy;this.prev[p+2]+=cz;corrected++;}
    }
    g.corrections+=corrected;g.lastCorrected=corrected;
    g.maxTangentialErrorM=Math.max(g.maxTangentialErrorM,maxT);
    g.maxNormalErrorM=Math.max(g.maxNormalErrorM,maxN);
    return corrected;
  }

  // The upstream solver already invokes the sleeve topology guard at all the
  // right phases of the substep. Override that hook so pants occupancy receives
  // the same post-constraint/post-contact scheduling without editing M26 source.
  _applySleeveOccupancy(){
    const sleeve=super._applySleeveOccupancy();
    const inner=this._applyPantsInnerContact();
    const mode=this.settings.pantsOccupancyMode;
    if(mode==='preproject'||mode==='predictive'||mode==='frameguard'||mode==='ring'||mode==='bulk'||mode==='rigid')return sleeve+inner;
    if(mode==='smooth'){
      this._pantsOccupancyCallInSubstep=(this._pantsOccupancyCallInSubstep||0)+1;
      const cadence=String(this.settings.pantsOccupancySmoothCadence||'first-final'),finalCall=Math.max(2,Math.floor(this.settings.postContactIterations||0)+2),call=this._pantsOccupancyCallInSubstep;
      if(cadence==='first'&&call!==1)return sleeve+inner;
      if(cadence==='final'&&call!==finalCall)return sleeve+inner;
      if(cadence==='first-final'&&call!==1&&call!==finalCall)return sleeve+inner;
    }
    return sleeve+inner+this._applyPantsOccupancy();
  }

  pantsOccupancyAudit(){
    const g=this.pantsOccupancy;if(!g)return null;
    const tangent=[],normal=[],normalSigned=[];
    for(const i of g.ids){
      const p=i*3,nx=this.carrierNormal[p],ny=this.carrierNormal[p+1],nz=this.carrierNormal[p+2],nl=Math.hypot(nx,ny,nz);if(nl<1e-8)continue;
      const ex=this.carrierTarget[p]-this.pos[p],ey=this.carrierTarget[p+1]-this.pos[p+1],ez=this.carrierTarget[p+2]-this.pos[p+2],en=ex*nx+ey*ny+ez*nz;
      const tx=ex-nx*en,ty=ey-ny*en,tz=ez-nz*en;tangent.push(Math.hypot(tx,ty,tz));normal.push(Math.abs(en));normalSigned.push(en);
    }
    tangent.sort((a,b)=>a-b);normal.sort((a,b)=>a-b);normalSigned.sort((a,b)=>a-b);
    const pct=(a,q)=>a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*q))]:null;
    return {samples:tangent.length,tangential:{p50M:pct(tangent,.5),p95M:pct(tangent,.95),p99M:pct(tangent,.99),maxM:tangent.at(-1)??null},normal:{p50M:pct(normal,.5),p95M:pct(normal,.95),p99M:pct(normal,.99),maxM:normal.at(-1)??null},normalSigned:{p01M:pct(normalSigned,.01),p50M:pct(normalSigned,.5),p95M:pct(normalSigned,.95),p99M:pct(normalSigned,.99),maxInwardM:normalSigned.at(-1)??null}};
  }

  _applyLocalRelativeDamping(){
    const scale=this.vertexDampingScale;
    if(!scale?.length)return;
    const base=clamp(this.settings.damping??.99,.0,.999999),baseLoss=1-base;
    for(let i=0;i<this.shellVertexCount;i++){
      const p=i*3,ti=this.carrierTri?.[i]??-1;if(ti<0)continue;
      const s=this.bodyBVH.sampleTriangle(ti,this.carrierUVW[p],this.carrierUVW[p+1],this.carrierUVW[p+2]);
      const local=1-baseLoss*clamp(scale[i]??1,.25,3.0);
      const rx=this.vel[p]-s.vx,ry=this.vel[p+1]-s.vy,rz=this.vel[p+2]-s.vz;
      this.vel[p]=s.vx+rx*local;this.vel[p+1]=s.vy+ry*local;this.vel[p+2]=s.vz+rz*local;
    }
  }

  _capRelativeVelocity(){
    if(this.settings.relativeVelocityCap===false)return;const cap=Math.max(.25,Number(this.settings.relativeMaxSpeedMps??4));
    for(let i=0;i<this.shellVertexCount;i++){const p=i*3,ti=this.carrierTri?.[i]??-1;if(ti<0)continue;const q=this.bodyBVH.sampleTriangle(ti,this.carrierUVW[p],this.carrierUVW[p+1],this.carrierUVW[p+2]),rx=this.vel[p]-q.vx,ry=this.vel[p+1]-q.vy,rz=this.vel[p+2]-q.vz,r=Math.hypot(rx,ry,rz);this._relativeSpeedPeak=Math.max(this._relativeSpeedPeak,r);if(r>cap){const s=cap/r;this.vel[p]=q.vx+rx*s;this.vel[p+1]=q.vy+ry*s;this.vel[p+2]=q.vz+rz*s;}}
  }

  relativeSpeedAudit(){
    let max=0,sum=0,n=0;for(let i=0;i<this.shellVertexCount;i++){const p=i*3,ti=this.carrierTri?.[i]??-1;if(ti<0)continue;const q=this.bodyBVH.sampleTriangle(ti,this.carrierUVW[p],this.carrierUVW[p+1],this.carrierUVW[p+2]),r=Math.hypot(this.vel[p]-q.vx,this.vel[p+1]-q.vy,this.vel[p+2]-q.vz);max=Math.max(max,r);sum+=r*r;n++;}return{samples:n,maxMps:max,rmsMps:n?Math.sqrt(sum/n):0,peakPreCapMps:this._relativeSpeedPeak,capMps:this.settings.relativeMaxSpeedMps,worldCeilingMps:this.settings.maxSpeed};
  }

  _substep(dt){
    this._pantsOccupancyCallInSubstep=0;
    if(String(this.settings.pantsLocalCcdPhase||'pre')==='pre'||String(this.settings.pantsLocalCcdPhase||'pre')==='both')this._applyPantsLocalCcd('pre');
    this._applyPantsBodySweepGuard();
    this._prePantsTubeVelocity(dt);
    this._prePantsTubeRingVelocity(dt);
    if(this.settings.pantsOccupancyMode==='preproject'){this._updateCarrierTargets();this._applyPantsOccupancy();}
    if(this.settings.pantsOccupancyMode==='ring')this._applyPantsTubeRingConstraint();
    super._substep(dt);
    if(String(this.settings.pantsLocalCcdPhase||'pre')==='post'||String(this.settings.pantsLocalCcdPhase||'pre')==='both'){this._applyPantsLocalCcd('post');if(this.bodySafetyProxy&&this.settings.safetyProxy)this._projectSafetyProxy(true);}
    this._applyLocalRelativeDamping();
    this._capRelativeVelocity();
  }

  /**
   * Short PBD material reconciliation used by the wardrobe coupled closure.
   * Contact projectors move cloth to satisfy inequalities; this pass restores
   * local edge/bend shape without advancing time.  The positional correction is
   * mirrored into `prev` so closure work cannot inject artificial velocity.
   */
  reconcileMaterial({iterations=1,stretchScale=1,bendScale=.65,applyTopology=true}={}){
    const n=Math.max(0,Math.min(6,Math.floor(iterations||0)));if(!n)return 0;
    const before=Float32Array.from(this.pos);
    for(let it=0;it<n;it++){
      this._solvePairs(this.edges,this.edgeRestAuthored||this.edgeRest,clamp((this.settings.stretch??.9)*stretchScale,0,1));
      if(this.settings.bend>0)this._solvePairs(this.bends,this.bendRestAuthored||this.bendRest,clamp(this.settings.bend*bendScale,0,1));
      this._hardWeldShell(1);this._driveCollarOuter();this._solveCollarFold(.18,.10);
      if(applyTopology)this._applySleeveOccupancy();
    }
    let moved=0;for(let i=0;i<this.pos.length;i+=3){const dx=this.pos[i]-before[i],dy=this.pos[i+1]-before[i+1],dz=this.pos[i+2]-before[i+2];if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)>1e-12)moved++;this.prev[i]+=dx;this.prev[i+1]+=dy;this.prev[i+2]+=dz;}
    this.syncRender();return moved;
  }


  _limitPantsStructuralStretch(){
    if(this.meta?.garmentType!=='pants')return 0;const limit=Math.max(.05,Number(this.settings.pantsMaxStructuralStretch??.22)),cap=Math.max(.00025,Number(this.settings.pantsStrainLimitMaxCorrectionM??.0025)),inv=this.invMass,rest=this.edgeRestAuthored||this.edgeRest;let corrected=0,maxBefore=0;
    for(let k=0;k<this.edges.length;k+=2){const ei=k>>1,rl=rest[ei];if(!(rl>=.001))continue;const ia=this.edges[k],ib=this.edges[k+1],a=ia*3,b=ib*3,dx=this.pos[b]-this.pos[a],dy=this.pos[b+1]-this.pos[a+1],dz=this.pos[b+2]-this.pos[a+2],l=Math.hypot(dx,dy,dz);if(l<1e-10)continue;const strain=l/rl-1;maxBefore=Math.max(maxBefore,strain);if(strain<=limit)continue;const wa=inv?inv[ia]:1,wb=inv?inv[ib]:1,den=wa+wb;if(den<=0)continue;const excess=l-rl*(1+limit),pairMove=Math.min(cap,excess),q=pairMove/(l*den),cx=dx*q,cy=dy*q,cz=dz*q;this.pos[a]+=wa*cx;this.pos[a+1]+=wa*cy;this.pos[a+2]+=wa*cz;this.pos[b]-=wb*cx;this.pos[b+1]-=wb*cy;this.pos[b+2]-=wb*cz;corrected++;}
    this.pantsStrainClosureDiag=this.pantsStrainClosureDiag||{cycles:0,corrections:0,maxBefore:0};this.pantsStrainClosureDiag.corrections+=corrected;this.pantsStrainClosureDiag.maxBefore=Math.max(this.pantsStrainClosureDiag.maxBefore,maxBefore);return corrected;
  }

  _closePantsTopologyAndStrain(){
    if(this.meta?.garmentType!=='pants'||this.settings.pantsOccupancyMode!=='smooth'||this.settings.pantsStrainClosure===false)return;
    const cycles=Math.max(1,Math.min(6,Math.floor(this.settings.pantsStrainClosureCycles??3)));let ran=0,edge=0,occ=0,safety=0;
    for(let c=0;c<cycles;c++){ran++;const ec=this._limitPantsStructuralStretch();edge+=ec;this._hardWeldShell(1);this._updateCarrierTargets();const oc=this._applyPantsOccupancy();occ+=oc;let sc=0;if(this.bodySafetyProxy&&this.settings.safetyProxy){sc=this._projectSafetyProxy(true);for(let k=1;k<3&&sc;k++)sc=this._projectSafetyProxy(true);}safety+=sc;if(!ec&&!oc&&!sc)break;}
    let finalEdge=0;const fp=Math.max(0,Math.min(4,Math.floor(this.settings.pantsStrainClosureFinalPasses??1)));for(let q=0;q<fp;q++){finalEdge+=this._limitPantsStructuralStretch();this._hardWeldShell(1);}if(fp&&this.bodySafetyProxy&&this.settings.safetyProxy){let sc=this._projectSafetyProxy(true);safety+=sc;for(let k=1;k<3&&sc;k++){sc=this._projectSafetyProxy(true);safety+=sc;}}
    let finalTopo=0;if(this.settings.pantsStrainFinalTopologyPolish===true){const oldCap=this.settings.pantsOccupancyMaxCorrectionM;this.settings.pantsOccupancyMaxCorrectionM=Math.max(.0002,Number(this.settings.pantsStrainFinalTopologyCapM??.001));this._updateCarrierTargets();finalTopo=this._applyPantsOccupancy();this.settings.pantsOccupancyMaxCorrectionM=oldCap;if(this.bodySafetyProxy&&this.settings.safetyProxy){let sc=this._projectSafetyProxy(true);safety+=sc;for(let k=1;k<3&&sc;k++){sc=this._projectSafetyProxy(true);safety+=sc;}}}
    this.pantsStrainClosureDiag={...(this.pantsStrainClosureDiag||{}),cycles:ran,lastEdgeCorrections:edge,lastFinalEdgeCorrections:finalEdge,lastFinalTopologyCorrections:finalTopo,lastOccupancyCorrections:occ,lastSafetyCorrections:safety};
  }

  stepFrame(dt){
    super.stepFrame(dt);
    this._closePantsTopologyAndStrain();
    // Final low-dimensional trouser closure.  Physics/material solve runs first;
    // ring/sector topology gets the last bounded positional word, immediately
    // followed by the watertight body projection so neither can invalidate the
    // other at frame boundary.
    let postRing=0,sector=0,fourier=0,sectionEnvelope=0,postSafety=0;
    if(this.meta?.garmentType==='pants'){
      if(this.settings.pantsPostRingClosure!==false&&this.settings.pantsOccupancyMode==='ring')postRing=this._applyPantsTubeRingConstraint();
      sector=this._applyPantsSectorManifold();
      fourier=this._applyPantsFourierManifold();
      sectionEnvelope=this._applyPantsSectionEnvelope();
      if((postRing||sector||fourier||sectionEnvelope)&&this.bodySafetyProxy&&this.settings.safetyProxy){let c=this._projectSafetyProxy(true);postSafety+=c;for(let k=1;k<4&&c;k++){c=this._projectSafetyProxy(true);postSafety+=c;}}
      this.pantsPostClosure={postRingCorrections:postRing,sectorCorrections:sector,fourierCorrections:fourier,sectionEnvelopeCorrections:sectionEnvelope,safetyCorrections:postSafety};
    }
    const h=Math.min(Math.max(dt||1/120,1/1000),.05);
    let frameGuardCorrections=0;
    if(this.settings.pantsOccupancyMode==='frameguard'){
      this._updateCarrierTargets();frameGuardCorrections=this._applyPantsOccupancy();
      if(frameGuardCorrections&&this.bodySafetyProxy&&this.settings.safetyProxy){let c=this._projectSafetyProxy(true);for(let k=1;k<4&&c;k++)c=this._projectSafetyProxy(true);}
      this.pantsFrameGuard={corrections:frameGuardCorrections};
    }
    // Pants containment and the closed body manifold are mutually coupled
    // constraints.  Containment may translate an entire material patch to keep
    // a limb inside its assigned trouser tube; that coherent patch translation
    // can move a neighbouring physical vertex through the body even though the
    // upstream frame safety sweep was already clean.  Close the frame with a
    // small fixed-point solve so neither constraint is allowed to invalidate the
    // other after its final projection.
    let cycles=0,containmentCorrections=0,safetyCorrections=0;
    // The old signed-distance body-inside-trouser projector is retained only as
    // an opt-in experiment/diagnostic.  On open trouser tubes its nearest-patch
    // sign is not a reliable topology oracle and it fought the denim structural
    // constraints during large kicks.  Default runtime authority is the material
    // tube envelope + body safety; independent tube topology is qualified outside
    // this projector.
    if(this.pantsContainment&&this.settings.pantsContainment!==false){
      const maxCycles=Math.max(1,Math.min(4,Math.floor(this.settings.pantsContainmentCouplingPasses??2)));
      for(let pass=0;pass<maxCycles;pass++){
        cycles++;const cc=this._solvePantsBodyContainment(h);containmentCorrections+=cc;let sc=0;
        if(this.bodySafetyProxy&&this.settings.safetyProxy){sc=this._projectSafetyProxy(true);for(let k=1;k<4&&sc;k++){const more=this._projectSafetyProxy(true);safetyCorrections+=more;sc=more;}}
        safetyCorrections+=sc;if(!cc&&!sc)break;
      }
    }
    this.pantsContainmentCoupling={cycles,containmentCorrections,safetyCorrections,enabled:!!this.pantsContainment&&this.settings.pantsContainment!==false};
    this.syncRender();
  }


  materialStrainAudit(){
    const rest=this.edgeRestAuthored||this.edgeRest,vals=[],active=[],long=[],absExt=[],weighted=[],weighted2=[];
    for(let k=0;k<this.edges.length;k+=2){const ei=k>>1,rl=rest[ei],a=this.edges[k]*3,b=this.edges[k+1]*3,l=Math.hypot(this.pos[b]-this.pos[a],this.pos[b+1]-this.pos[a+1],this.pos[b+2]-this.pos[a+2]);if(!(rl>1e-8)||!Number.isFinite(l))continue;const strain=Math.abs(l/rl-1),ext=Math.abs(l-rl);vals.push(strain);if(rl>=.001){active.push(strain);absExt.push(ext);weighted.push([strain,rl]);weighted2.push([strain,rl*rl]);if(rl>=.020)long.push(strain);}}
    const pct=(a,q)=>{if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*q))]};
    const wpct=(pairs,q)=>{if(!pairs.length)return 0;const a=Array.from(pairs).sort((x,y)=>x[0]-y[0]);let total=0;for(const p of a)total+=p[1];const target=total*q;let c=0;for(const p of a){c+=p[1];if(c>=target)return p[0]}return a.at(-1)[0]};
    return {edgeCount:vals.length,inactiveSubMillimeterEdges:vals.length-active.length,raw:{p95:pct(vals,.95),p99:pct(vals,.99)},active:{p95:pct(active,.95),p99:pct(active,.99)},restLengthWeighted:{p95:wpct(weighted,.95),p99:wpct(weighted,.99)},restLengthSquaredWeighted:{p95:wpct(weighted2,.95),p99:wpct(weighted2,.99)},longStructural20mm:{count:long.length,p95:pct(long,.95),p99:pct(long,.99)},absoluteExtension:{p95M:pct(absExt,.95),p99M:pct(absExt,.99)}};
  }

  metrics(){
    const p=this.pantsOccupancy;
    const pantsOccupancy=p?{
      enabled:this.settings.pantsOccupancy!==false,guardVertices:p.ids.length,guardTopY:p.guardTopY,
      scale:this.settings.pantsOccupancyScale,normalFreeM:this.settings.pantsOccupancyNormalFreeM,smoothPasses:this.settings.pantsOccupancySmoothPasses,smoothGradientM:this.settings.pantsOccupancySmoothGradientM,smoothCadence:this.settings.pantsOccupancySmoothCadence,
      corrections:p.corrections,lastCorrected:p.lastCorrected,maxTangentialErrorM:p.maxTangentialErrorM,maxNormalErrorM:p.maxNormalErrorM,
      audit:this.pantsOccupancyAudit()
    }:null;
    const c=this.pantsContainment;const pantsContainment=c?{enabled:this.settings.pantsContainment!==false,probes:c.probes.length,frames:c.frames,corrections:c.corrections,lastViolations:c.lastViolations,maxOutsideM:c.maxOutsideM,maxCorrectionAppliedM:c.maxCorrectionAppliedM,audit:this.pantsContainmentAudit()}:null;
    return {...super.metrics(),materialStrain:this.materialStrainAudit(),fabricFieldV2:{...this.fabricFieldV2},microEdges:this.microEdges?{count:this.microEdges.ids.length,corrections:this.microEdges.corrections,maxErrorM:this.microEdges.maxErrorM,stiffness:this.settings.microEdgeStiffness,maxPairCorrectionM:this.settings.microEdgeMaxPairCorrectionM}:null,relativeVelocity:this.relativeSpeedAudit(),pantsOccupancy,pantsTubeRings:this.pantsTubeRingAudit(),pantsInnerContact:this.pantsInnerContactAudit(),pantsBodySweep:this.pantsBodySweepAudit(),pantsLocalCcd:this.pantsLocalCcdAudit(),pantsStrainClosure:this.pantsStrainClosureDiag||null,pantsSectorManifold:this.pantsSectorManifoldAudit(),pantsPostClosure:this.pantsPostClosure||null,pantsContainment};
  }
}

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const n=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/n,a[1]/n,a[2]/n]};
const meanPoints=(P,ids)=>{let x=0,y=0,z=0,n=0;for(const i of ids){const p=i*3;x+=P[p];y+=P[p+1];z+=P[p+2];n++;}return n?[x/n,y/n,z/n]:[0,0,0]};
const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0];

function planeBasis(n){
  const ref=Math.abs(n[1])<.90?[0,1,0]:[1,0,0];const u=norm(cross(n,ref)),v=norm(cross(n,u));return[u,v];
}
function triPlaneSegment(P,ia,ib,ic,c,n,eps=1e-7){
  const ids=[ia,ib,ic],pts=ids.map(i=>[P[i*3],P[i*3+1],P[i*3+2]]),d=pts.map(p=>dot(sub(p,c),n));
  const out=[];
  const push=p=>{for(const q of out)if(Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<1e-6)return;out.push(p)};
  for(let e=0;e<3;e++){
    const a=e,b=(e+1)%3,da=d[a],db=d[b],pa=pts[a],pb=pts[b];
    if(Math.abs(da)<=eps)push(pa);
    if((da< -eps&&db>eps)||(da>eps&&db< -eps)){const t=da/(da-db);push(add(pa,mul(sub(pb,pa),t)));}
  }
  if(out.length<2)return null;
  // Degenerate coplanar triangles are rare; keep the farthest pair.
  let best=[out[0],out[1]],bd=-1;for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){const q=sub(out[i],out[j]),dd=dot(q,q);if(dd>bd){bd=dd;best=[out[i],out[j]]}}
  return best;
}
function project2(p,c,u,v){const q=sub(p,c);return[dot(q,u),dot(q,v)]}
function raySegmentDistance(theta,a,b){
  const d=[Math.cos(theta),Math.sin(theta)],s=[b[0]-a[0],b[1]-a[1]],den=cross2(d,s);if(Math.abs(den)<1e-10)return null;
  const t=cross2(a,s)/den,u=cross2(a,d)/den;if(t>=0&&u>=-1e-7&&u<=1+1e-7)return t;return null;
}
function nearestRayHit(theta,segments){let best=Infinity;for(const [a,b] of segments){const t=raySegmentDistance(theta,a,b);if(t!==null&&t<best)best=t}return Number.isFinite(best)?best:null}

/**
 * Cross-sectional topology oracle for trousers.
 *
 * The runtime can be collision-clean while a limb escapes through an open hem.
 * This independent audit slices the live body and physical denim with planes
 * normal to the live leg axis and checks that denim remains radially outside the
 * corresponding anatomical surface around the full section.
 */
export class PantsTubeTopologyAudit {
  constructor({bodyBindPositions,bodyIndices,clothRestPositions,clothIndices,shellVertexCount=null,stationFractions=[.20,.36,.52,.66],bandHalfHeightM=.030,rays=48,minCoverage=.92,minClearanceM=-.003}={}){
    this.bodyBind=bodyBindPositions;this.bodyIndices=bodyIndices;this.clothRest=clothRestPositions;this.clothIndices=clothIndices;this.shellVertexCount=shellVertexCount??Math.floor(clothRestPositions.length/3);
    this.settings={stationFractions,bandHalfHeightM,rays,minCoverage,minClearanceM};
    let ymin=Infinity,ymax=-Infinity;for(let i=0;i<this.shellVertexCount;i++){const y=clothRestPositions[i*3+1];ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}
    // Avoid the open cuff itself and the crotch/waist branch surface. Stations
    // cover lower calf -> mid thigh where a true trouser tube is expected.
    const low=ymin+.055,high=ymin+(ymax-ymin)*.72;this.restRange={ymin,ymax,low,high};
    this.stations=[];
    for(const side of [-1,1])for(const f of stationFractions){const y=low+(high-low)*clamp(f,0,1);const ids=this._bodyBand(side,y,bandHalfHeightM),lo=this._bodyBand(side,y-bandHalfHeightM*1.4,bandHalfHeightM),hi=this._bodyBand(side,y+bandHalfHeightM*1.4,bandHalfHeightM);if(ids.length>=8&&lo.length>=8&&hi.length>=8)this.stations.push({side,f,y,ids,lo,hi,bodyTris:this._candidateBodyTriangles(side,y,.11),clothTris:this._candidateClothTriangles(side,y,.13)});}
  }
  _bodyBand(side,y,half){const ids=[];for(let i=0;i<this.bodyBind.length/3;i++){const p=i*3,x=this.bodyBind[p],yy=this.bodyBind[p+1];if((side<0?x<-.02:x>.02)&&Math.abs(yy-y)<=half)ids.push(i);}return ids;}
  _candidateBodyTriangles(side,y,pad){const out=[],I=this.bodyIndices,P=this.bodyBind;for(let k=0;k<I.length;k+=3){const a=I[k],b=I[k+1],c=I[k+2],cy=(P[a*3+1]+P[b*3+1]+P[c*3+1])/3,cx=(P[a*3]+P[b*3]+P[c*3])/3;if(Math.abs(cy-y)>pad)continue;if(side<0?cx<.035:cx>-.035)out.push(k/3);}return Uint32Array.from(out);}
  _candidateClothTriangles(side,y,pad){const out=[],I=this.clothIndices,P=this.clothRest;for(let k=0;k<I.length;k+=3){const a=I[k],b=I[k+1],c=I[k+2];if(a>=this.shellVertexCount||b>=this.shellVertexCount||c>=this.shellVertexCount)continue;const cy=(P[a*3+1]+P[b*3+1]+P[c*3+1])/3,cx=(P[a*3]+P[b*3]+P[c*3])/3;if(Math.abs(cy-y)>pad)continue;/* mixed crotch seam participates in both sides */if(side<0?cx<.06:cx>-.06)out.push(k/3);}return Uint32Array.from(out);}
  _segments(P,I,triIds,c,n,u,v){const out=[];for(const ti of triIds){const k=ti*3,s=triPlaneSegment(P,I[k],I[k+1],I[k+2],c,n);if(!s)continue;out.push([project2(s[0],c,u,v),project2(s[1],c,u,v)]);}return out;}
  audit(bodyPositions,clothPositions){
    const stations=[];let allPass=true,worstCoverage=1,worstClearance=Infinity,missingRays=0,negativeRays=0;
    for(const st of this.stations){const center=meanPoints(bodyPositions,st.ids),cl=meanPoints(bodyPositions,st.lo),ch=meanPoints(bodyPositions,st.hi),axis=norm(sub(ch,cl)),[u,v]=planeBasis(axis);
      const bodySeg=this._segments(bodyPositions,this.bodyIndices,st.bodyTris,center,axis,u,v),clothSeg=this._segments(clothPositions,this.clothIndices,st.clothTris,center,axis,u,v);
      let bodyRays=0,covered=0,missing=0,negative=0,minClear=Infinity,sumClear=0;const samples=[];
      for(let r=0;r<this.settings.rays;r++){const th=2*Math.PI*r/this.settings.rays,bt=nearestRayHit(th,bodySeg);if(bt===null)continue;bodyRays++;const ct=nearestRayHit(th,clothSeg);if(ct===null){missing++;samples.push({ray:r,bodyM:bt,clothM:null,clearanceM:null});continue;}const clr=ct-bt;minClear=Math.min(minClear,clr);sumClear+=clr;if(clr>=this.settings.minClearanceM)covered++;else negative++;samples.push({ray:r,bodyM:bt,clothM:ct,clearanceM:clr});}
      const coverage=bodyRays?covered/bodyRays:0,pass=bodyRays>=Math.floor(this.settings.rays*.75)&&coverage>=this.settings.minCoverage&&negative===0;
      allPass&&=pass;worstCoverage=Math.min(worstCoverage,coverage);if(Number.isFinite(minClear))worstClearance=Math.min(worstClearance,minClear);missingRays+=missing;negativeRays+=negative;
      stations.push({side:st.side<0?'left':'right',fraction:st.f,restY:st.y,bodyRays,covered,missing,negative,coverage,minClearanceM:Number.isFinite(minClear)?minClear:null,meanClearanceM:bodyRays-missing?sumClear/(bodyRays-missing):null,bodySegments:bodySeg.length,clothSegments:clothSeg.length,pass});
    }
    return {pass:allPass,stationCount:stations.length,worstCoverage,worstClearanceM:Number.isFinite(worstClearance)?worstClearance:null,missingRays,negativeRays,settings:{...this.settings},stations};
  }
}

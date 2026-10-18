import {DynamicTriangleBVH} from './dynamicBvh.js';

const DEFAULT_RAYS=[
  [.927173,.316981,.196241],
  [-.417221,.881203,.224719],
  [.241613,-.358271,.902083]
];

export async function loadWatertightBodyProxy(url='./data/clothing/body_watertight_proxy_alpha4.json'){
  const r=await fetch(url);if(!r.ok)throw new Error(`Watertight body proxy ${r.status}: ${url}`);
  const data=await r.json();return new WatertightBodyProxy(data);
}

export class WatertightBodyProxy{
  constructor(data){
    if(!data||data.schema!=='lucid.watertight-body-proxy.v1')throw new Error('Unsupported watertight body proxy');
    this.meta=data;
    this.vertexCount=data.proxyVertexCount|0;
    this.indices=Uint32Array.from(data.indices);
    this.sourceOffsets=Uint32Array.from(data.sourceOffsets);
    this.sourceIndices=Uint32Array.from(data.sourceIndices);
    if(this.sourceOffsets.length!==this.vertexCount+1)throw new Error('Proxy sourceOffsets length mismatch');
    if(this.indices.length!==(data.proxyTriangleCount|0)*3)throw new Error('Proxy index length mismatch');
    this.positions=new Float32Array(this.vertexCount*3);
    this.prevPositions=new Float32Array(this.positions.length);
    this.normals=new Float32Array(this.positions.length);
    this.bvh=null;this._initialized=false;
    this.statsState={updates:0,parityTests:0,insideHits:0,projected:0};
  }
  updateFromBody(bodyPositions,dt=1/60){
    if(!bodyPositions||bodyPositions.length<(this.meta.sourceBodyVertexCount|0)*3)throw new Error('Body position buffer is too small for proxy mapping');
    if(this._initialized)this.prevPositions.set(this.positions);
    const P=this.positions,O=this.sourceOffsets,S=this.sourceIndices;
    for(let i=0;i<this.vertexCount;i++){
      let x=0,y=0,z=0,n=0;
      for(let q=O[i];q<O[i+1];q++){const p=S[q]*3;x+=bodyPositions[p];y+=bodyPositions[p+1];z+=bodyPositions[p+2];n++}
      const d=n||1,p=i*3;P[p]=x/d;P[p+1]=y/d;P[p+2]=z/d;
    }
    this._computeNormals();
    if(!this._initialized){this.prevPositions.set(P);this.bvh=new DynamicTriangleBVH(this.indices,P,{leafSize:10});this._initialized=true}
    this.bvh.refit(P,this.normals,this.prevPositions,dt);
    this.statsState.updates++;return this;
  }
  _computeNormals(){
    const N=this.normals,P=this.positions,I=this.indices;N.fill(0);
    for(let k=0;k<I.length;k+=3){
      const a=I[k]*3,b=I[k+1]*3,c=I[k+2]*3;
      const abx=P[b]-P[a],aby=P[b+1]-P[a+1],abz=P[b+2]-P[a+2];
      const acx=P[c]-P[a],acy=P[c+1]-P[a+1],acz=P[c+2]-P[a+2];
      const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
      N[a]+=nx;N[a+1]+=ny;N[a+2]+=nz;N[b]+=nx;N[b+1]+=ny;N[b+2]+=nz;N[c]+=nx;N[c+1]+=ny;N[c+2]+=nz;
    }
    for(let i=0;i<N.length;i+=3){const l=Math.hypot(N[i],N[i+1],N[i+2])||1;N[i]/=l;N[i+1]/=l;N[i+2]/=l}
  }
  containsPoint(x,y,z,{majority=true}={}){
    if(!this.bvh)return false;
    this.statsState.parityTests++;
    const a=this.bvh.pointParity(x,y,z,0);
    if(!majority){if(a)this.statsState.insideHits++;return !!a}
    const b=this.bvh.pointParity(x,y,z,1);
    if(a===b){if(a)this.statsState.insideHits++;return !!a}
    const c=this.bvh.pointParity(x,y,z,2),inside=(a+b+c)>=2;
    if(inside)this.statsState.insideHits++;return inside;
  }
  closestPoint(x,y,z,maxDist=.25){return this.bvh?.closestPoint(x,y,z,maxDist)||null}
  projectPointOutside(x,y,z,margin=.001,maxDist=.25){
    if(!this.containsPoint(x,y,z))return null;
    const h=this.closestPoint(x,y,z,maxDist);if(!h)return null;
    let dx=h.qx-x,dy=h.qy-y,dz=h.qz-z,d=Math.hypot(dx,dy,dz);
    if(d<1e-9){dx=h.nx;dy=h.ny;dz=h.nz;d=Math.hypot(dx,dy,dz)||1}
    else{dx/=d;dy/=d;dz/=d}
    // h.q - p points from an interior sample toward its nearest boundary.
    // Continue through that boundary by the safety margin.
    this.statsState.projected++;
    return{x:h.qx+dx*margin,y:h.qy+dy*margin,z:h.qz+dz*margin,dx:(h.qx+dx*margin)-x,dy:(h.qy+dy*margin)-y,dz:(h.qz+dz*margin)-z,depth:d,hit:h};
  }
  auditPoints(positions,{start=0,end=positions.length/3,majority=true}={}){
    let inside=0,maxDepth=0;
    for(let i=start;i<end;i++){const p=i*3,x=positions[p],y=positions[p+1],z=positions[p+2];
      if(!this.containsPoint(x,y,z,{majority}))continue;
      inside++;const h=this.closestPoint(x,y,z,.25);if(h)maxDepth=Math.max(maxDepth,Math.sqrt(Math.max(0,h.d2||0)));
    }
    return{inside,maxDepthM:maxDepth,tested:Math.max(0,end-start)};
  }
  stats(){return{...this.statsState,vertexCount:this.vertexCount,triangleCount:this.indices.length/3,boundaryEdgeCount:this.meta.boundaryEdgeCount,nonManifoldEdgeCount:this.meta.nonManifoldEdgeCount,restSignedVolumeM3:this.meta.restSignedVolumeM3,bvh:this.bvh?.stats?.()||null}}
}

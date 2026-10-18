
const EPS=1e-12;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function pointAabbDist2(n,x,y,z){
  const dx=x<n.minx?n.minx-x:(x>n.maxx?x-n.maxx:0);
  const dy=y<n.miny?n.miny-y:(y>n.maxy?y-n.maxy:0);
  const dz=z<n.minz?n.minz-z:(z>n.maxz?z-n.maxz:0);
  return dx*dx+dy*dy+dz*dz;
}
function segmentAabb(p0x,p0y,p0z,p1x,p1y,p1z,n,pad=0){
  let t0=0,t1=1;
  for(let axis=0;axis<3;axis++){
    const a0=axis===0?p0x:(axis===1?p0y:p0z);
    const a1=axis===0?p1x:(axis===1?p1y:p1z);
    const mn=(axis===0?n.minx:(axis===1?n.miny:n.minz))-pad;
    const mx=(axis===0?n.maxx:(axis===1?n.maxy:n.maxz))+pad;
    const d=a1-a0;
    if(Math.abs(d)<1e-12){if(a0<mn||a0>mx)return false;continue}
    let lo=(mn-a0)/d,hi=(mx-a0)/d;if(lo>hi){const q=lo;lo=hi;hi=q}
    t0=Math.max(t0,lo);t1=Math.min(t1,hi);if(t0>t1)return false;
  }
  return true;
}

function rayAabb(ox,oy,oz,dx,dy,dz,n,maxT=Infinity){
  let t0=0,t1=maxT;
  for(let axis=0;axis<3;axis++){
    const o=axis===0?ox:(axis===1?oy:oz);
    const d=axis===0?dx:(axis===1?dy:dz);
    const mn=axis===0?n.minx:(axis===1?n.miny:n.minz);
    const mx=axis===0?n.maxx:(axis===1?n.maxy:n.maxz);
    if(Math.abs(d)<1e-15){if(o<mn||o>mx)return false;continue}
    let a=(mn-o)/d,b=(mx-o)/d;if(a>b){const q=a;a=b;b=q}
    t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)return false;
  }
  return t1>1e-9;
}

export class DynamicTriangleBVH{
  constructor(indices,positions,{leafSize=10}={}){
    this.indices=indices;
    this.positions=positions;
    this.normals=null;
    this.prevPositions=null;
    this.dt=1/60;
    this.leafSize=leafSize;
    this.nodeCount=0;this.maxDepth=0;
    this._vertexTriangles=null;this._neighborhoodCache=new Map();
    const n=Math.floor(indices.length/3);
    this.root=this._build(Array.from({length:n},(_,i)=>i),0);
    this.refit(positions);
  }
  _centroidAxis(ti,axis){
    const I=this.indices,P=this.positions;
    const a=I[ti*3]*3,b=I[ti*3+1]*3,c=I[ti*3+2]*3;
    return (P[a+axis]+P[b+axis]+P[c+axis])/3;
  }
  _build(ids,depth){
    this.nodeCount++;this.maxDepth=Math.max(this.maxDepth,depth);
    const n={minx:0,miny:0,minz:0,maxx:0,maxy:0,maxz:0,left:null,right:null,ids:null};
    if(ids.length<=this.leafSize){n.ids=ids;return n}
    let cmin=[Infinity,Infinity,Infinity],cmax=[-Infinity,-Infinity,-Infinity];
    const I=this.indices,P=this.positions;
    for(const ti of ids){
      const a=I[ti*3]*3,b=I[ti*3+1]*3,c=I[ti*3+2]*3;
      for(let axis=0;axis<3;axis++){
        const q=(P[a+axis]+P[b+axis]+P[c+axis])/3;
        cmin[axis]=Math.min(cmin[axis],q);cmax[axis]=Math.max(cmax[axis],q);
      }
    }
    const ex=cmax[0]-cmin[0],ey=cmax[1]-cmin[1],ez=cmax[2]-cmin[2];
    const axis=ex>=ey&&ex>=ez?0:(ey>=ez?1:2);
    ids.sort((u,v)=>this._centroidAxis(u,axis)-this._centroidAxis(v,axis));
    const mid=ids.length>>1;
    n.left=this._build(ids.slice(0,mid),depth+1);
    n.right=this._build(ids.slice(mid),depth+1);
    return n;
  }
  refit(positions=this.positions,normals=this.normals,prevPositions=this.prevPositions,dt=this.dt){
    this.positions=positions;this.normals=normals||null;this.prevPositions=prevPositions||null;this.dt=Math.max(1e-5,dt||1/60);
    const I=this.indices,P=this.positions;
    const visit=n=>{
      if(n.ids){
        let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
        for(const ti of n.ids){
          const o=ti*3;
          for(let k=0;k<3;k++){
            const p=I[o+k]*3,x=P[p],y=P[p+1],z=P[p+2];
            minx=Math.min(minx,x);miny=Math.min(miny,y);minz=Math.min(minz,z);
            maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);maxz=Math.max(maxz,z);
          }
        }
        const e=1e-6;n.minx=minx-e;n.miny=miny-e;n.minz=minz-e;n.maxx=maxx+e;n.maxy=maxy+e;n.maxz=maxz+e;
      }else{
        visit(n.left);visit(n.right);
        n.minx=Math.min(n.left.minx,n.right.minx);n.miny=Math.min(n.left.miny,n.right.miny);n.minz=Math.min(n.left.minz,n.right.minz);
        n.maxx=Math.max(n.left.maxx,n.right.maxx);n.maxy=Math.max(n.left.maxy,n.right.maxy);n.maxz=Math.max(n.left.maxz,n.right.maxz);
      }
    };
    visit(this.root);return this;
  }
  _normalVelocity(ti,u,v,w){
    const I=this.indices,N=this.normals,P=this.positions,PP=this.prevPositions,dt=this.dt;
    const ia=I[ti*3],ib=I[ti*3+1],ic=I[ti*3+2],a=ia*3,b=ib*3,c=ic*3;
    let nx,ny,nz;
    if(N){
      nx=N[a]*u+N[b]*v+N[c]*w;ny=N[a+1]*u+N[b+1]*v+N[c+1]*w;nz=N[a+2]*u+N[b+2]*v+N[c+2]*w;
    }else{
      const abx=P[b]-P[a],aby=P[b+1]-P[a+1],abz=P[b+2]-P[a+2];
      const acx=P[c]-P[a],acy=P[c+1]-P[a+1],acz=P[c+2]-P[a+2];
      nx=aby*acz-abz*acy;ny=abz*acx-abx*acz;nz=abx*acy-aby*acx;
    }
    let nl=Math.hypot(nx,ny,nz);if(nl<EPS){nx=0;ny=1;nz=0;nl=1}nx/=nl;ny/=nl;nz/=nl;
    let vx=0,vy=0,vz=0;
    if(PP){
      vx=((P[a]-PP[a])*u+(P[b]-PP[b])*v+(P[c]-PP[c])*w)/dt;
      vy=((P[a+1]-PP[a+1])*u+(P[b+1]-PP[b+1])*v+(P[c+1]-PP[c+1])*w)/dt;
      vz=((P[a+2]-PP[a+2])*u+(P[b+2]-PP[b+2])*v+(P[c+2]-PP[c+2])*w)/dt;
    }
    return{nx,ny,nz,vx,vy,vz};
  }
  _triangleDist2(px,py,pz,ti){
    const I=this.indices,P=this.positions;
    const ia=I[ti*3]*3,ib=I[ti*3+1]*3,ic=I[ti*3+2]*3;
    const ax=P[ia],ay=P[ia+1],az=P[ia+2],bx=P[ib],by=P[ib+1],bz=P[ib+2],cx=P[ic],cy=P[ic+1],cz=P[ic+2];
    const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az;
    const apx=px-ax,apy=py-ay,apz=pz-az;
    const d1=abx*apx+aby*apy+abz*apz,d2=acx*apx+acy*apy+acz*apz;
    let qx,qy,qz;
    if(d1<=0&&d2<=0){qx=ax;qy=ay;qz=az}
    else{
      const bpx=px-bx,bpy=py-by,bpz=pz-bz,d3=abx*bpx+aby*bpy+abz*bpz,d4=acx*bpx+acy*bpy+acz*bpz;
      if(d3>=0&&d4<=d3){qx=bx;qy=by;qz=bz}
      else{
        const vc=d1*d4-d3*d2;
        if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);qx=ax+v*abx;qy=ay+v*aby;qz=az+v*abz}
        else{
          const cpx=px-cx,cpy=py-cy,cpz=pz-cz,d5=abx*cpx+aby*cpy+abz*cpz,d6=acx*cpx+acy*cpy+acz*cpz;
          if(d6>=0&&d5<=d6){qx=cx;qy=cy;qz=cz}
          else{
            const vb=d5*d2-d1*d6;
            if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);qx=ax+w*acx;qy=ay+w*acy;qz=az+w*acz}
            else{
              const va=d3*d6-d5*d4;
              if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){
                const w=(d4-d3)/((d4-d3)+(d5-d6));qx=bx+w*(cx-bx);qy=by+w*(cy-by);qz=bz+w*(cz-bz);
              }else{
                const den=1/(va+vb+vc),v=vb*den,w=vc*den;qx=ax+abx*v+acx*w;qy=ay+aby*v+acy*w;qz=az+abz*v+acz*w;
              }
            }
          }
        }
      }
    }
    const dx=px-qx,dy=py-qy,dz=pz-qz;return dx*dx+dy*dy+dz*dz;
  }
  closestPointTriangle(px,py,pz,ti){
    const I=this.indices,P=this.positions;
    const ia=I[ti*3]*3,ib=I[ti*3+1]*3,ic=I[ti*3+2]*3;
    const ax=P[ia],ay=P[ia+1],az=P[ia+2],bx=P[ib],by=P[ib+1],bz=P[ib+2],cx=P[ic],cy=P[ic+1],cz=P[ic+2];
    const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az;
    const apx=px-ax,apy=py-ay,apz=pz-az;
    const d1=abx*apx+aby*apy+abz*apz,d2=acx*apx+acy*apy+acz*apz;
    let u=0,v=0,w=0,qx=0,qy=0,qz=0;
    if(d1<=0&&d2<=0){u=1;qx=ax;qy=ay;qz=az}
    else{
      const bpx=px-bx,bpy=py-by,bpz=pz-bz,d3=abx*bpx+aby*bpy+abz*bpz,d4=acx*bpx+acy*bpy+acz*bpz;
      if(d3>=0&&d4<=d3){v=1;qx=bx;qy=by;qz=bz}
      else{
        const vc=d1*d4-d3*d2;
        if(vc<=0&&d1>=0&&d3<=0){v=d1/(d1-d3);u=1-v;qx=ax+v*abx;qy=ay+v*aby;qz=az+v*abz}
        else{
          const cpx=px-cx,cpy=py-cy,cpz=pz-cz,d5=abx*cpx+aby*cpy+abz*cpz,d6=acx*cpx+acy*cpy+acz*cpz;
          if(d6>=0&&d5<=d6){w=1;qx=cx;qy=cy;qz=cz}
          else{
            const vb=d5*d2-d1*d6;
            if(vb<=0&&d2>=0&&d6<=0){w=d2/(d2-d6);u=1-w;qx=ax+w*acx;qy=ay+w*acy;qz=az+w*acz}
            else{
              const va=d3*d6-d5*d4;
              if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){
                w=(d4-d3)/((d4-d3)+(d5-d6));v=1-w;qx=bx+w*(cx-bx);qy=by+w*(cy-by);qz=bz+w*(cz-bz);
              }else{
                const den=1/(va+vb+vc);v=vb*den;w=vc*den;u=1-v-w;qx=ax+abx*v+acx*w;qy=ay+aby*v+acy*w;qz=az+abz*v+acz*w;
              }
            }
          }
        }
      }
    }
    const nv=this._normalVelocity(ti,u,v,w),dx=px-qx,dy=py-qy,dz=pz-qz;
    return{ti,u,v,w,qx,qy,qz,...nv,d2:dx*dx+dy*dy+dz*dz,signed:dx*nv.nx+dy*nv.ny+dz*nv.nz};
  }
  rayIntersectionCount(ox,oy,oz,dx,dy,dz,maxDist=Infinity){
    // BVH-accelerated Moller-Trumbore ray count. Intended for parity tests
    // against a closed manifold, not for visible-surface collision response.
    const dl=Math.hypot(dx,dy,dz);if(dl<1e-15)return 0;
    dx/=dl;dy/=dl;dz/=dl;
    const I=this.indices,P=this.positions,eps=1e-9;
    let count=0;
    const visit=n=>{
      if(!rayAabb(ox,oy,oz,dx,dy,dz,n,maxDist))return;
      if(n.ids){
        for(const ti of n.ids){
          const o=ti*3,ia=I[o]*3,ib=I[o+1]*3,ic=I[o+2]*3;
          const ax=P[ia],ay=P[ia+1],az=P[ia+2];
          const e1x=P[ib]-ax,e1y=P[ib+1]-ay,e1z=P[ib+2]-az;
          const e2x=P[ic]-ax,e2y=P[ic+1]-ay,e2z=P[ic+2]-az;
          const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x;
          const det=e1x*px+e1y*py+e1z*pz;if(Math.abs(det)<1e-12)continue;
          const inv=1/det,tx=ox-ax,ty=oy-ay,tz=oz-az;
          const u=(tx*px+ty*py+tz*pz)*inv;if(u<-eps||u>1+eps)continue;
          const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x;
          const v=(dx*qx+dy*qy+dz*qz)*inv;if(v<-eps||u+v>1+eps)continue;
          const t=(e2x*qx+e2y*qy+e2z*qz)*inv;
          if(t>1e-7&&t<=maxDist)count++;
        }
      }else{visit(n.left);visit(n.right)}
    };
    visit(this.root);return count;
  }
  pointParity(x,y,z,rayIndex=0){
    // Irrational-looking fixed directions make exact edge/vertex hits rare.
    const rays=[[.927173,.316981,.196241],[-.417221,.881203,.224719],[.241613,-.358271,.902083]];
    const r=rays[Math.abs(rayIndex|0)%rays.length];
    return this.rayIntersectionCount(x,y,z,r[0],r[1],r[2])&1;
  }
  _ensureAdjacency(){
    if(this._vertexTriangles)return;
    let maxV=0;for(let i=0;i<this.indices.length;i++)if(this.indices[i]>maxV)maxV=this.indices[i];
    const vt=Array.from({length:maxV+1},()=>[]);
    for(let ti=0;ti<this.indices.length/3;ti++){
      const o=ti*3;vt[this.indices[o]].push(ti);vt[this.indices[o+1]].push(ti);vt[this.indices[o+2]].push(ti);
    }
    this._vertexTriangles=vt;
  }
  triangleNeighborhood(ti,rings=2){
    rings=Math.max(0,Math.min(3,rings|0));const key=ti*4+rings,cached=this._neighborhoodCache.get(key);if(cached)return cached;
    this._ensureAdjacency();const I=this.indices,vt=this._vertexTriangles,seen=new Set([ti]);let frontier=[ti];
    for(let r=0;r<rings;r++){
      const next=[];
      for(const t of frontier){const o=t*3;
        for(let k=0;k<3;k++)for(const q of vt[I[o+k]])if(!seen.has(q)){seen.add(q);next.push(q)}
      }
      frontier=next;if(!frontier.length)break;
    }
    const out=Int32Array.from(seen);this._neighborhoodCache.set(key,out);return out;
  }
  closestPointNeighborhood(x,y,z,seedTi,rings=2,maxDist=Infinity){
    if(seedTi<0)return null;let bestTi=-1,best2=maxDist*maxDist;
    const ids=this.triangleNeighborhood(seedTi,rings);
    for(let q=0;q<ids.length;q++){const ti=ids[q],d2=this._triangleDist2(x,y,z,ti);if(d2<best2){bestTi=ti;best2=d2}}
    return bestTi>=0?this.closestPointTriangle(x,y,z,bestTi):null;
  }
  closestPoint(x,y,z,maxDist=Infinity){
    let bestTi=-1,best2=maxDist*maxDist;
    const stack=[this.root];
    while(stack.length){
      const n=stack.pop();if(pointAabbDist2(n,x,y,z)>best2)continue;
      if(n.ids){
        for(const ti of n.ids){const d2=this._triangleDist2(x,y,z,ti);if(d2<best2){bestTi=ti;best2=d2}}
      }else{
        const dl=pointAabbDist2(n.left,x,y,z),dr=pointAabbDist2(n.right,x,y,z);
        if(dl<dr){if(dr<=best2)stack.push(n.right);if(dl<=best2)stack.push(n.left)}
        else{if(dl<=best2)stack.push(n.left);if(dr<=best2)stack.push(n.right)}
      }
    }
    return bestTi>=0?this.closestPointTriangle(x,y,z,bestTi):null;
  }
  _segmentTriangle(p0x,p0y,p0z,p1x,p1y,p1z,ti){
    const I=this.indices,P=this.positions;
    const ia=I[ti*3]*3,ib=I[ti*3+1]*3,ic=I[ti*3+2]*3;
    const ax=P[ia],ay=P[ia+1],az=P[ia+2];
    const e1x=P[ib]-ax,e1y=P[ib+1]-ay,e1z=P[ib+2]-az;
    const e2x=P[ic]-ax,e2y=P[ic+1]-ay,e2z=P[ic+2]-az;
    const dx=p1x-p0x,dy=p1y-p0y,dz=p1z-p0z;
    const hx=dy*e2z-dz*e2y,hy=dz*e2x-dx*e2z,hz=dx*e2y-dy*e2x;
    const det=e1x*hx+e1y*hy+e1z*hz;if(Math.abs(det)<1e-10)return null;
    const inv=1/det,sx=p0x-ax,sy=p0y-ay,sz=p0z-az;
    const v=(sx*hx+sy*hy+sz*hz)*inv;if(v<0||v>1)return null; // bary at B
    const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x;
    const w=(dx*qx+dy*qy+dz*qz)*inv;if(w<0||v+w>1)return null; // bary at C
    const t=(e2x*qx+e2y*qy+e2z*qz)*inv;if(t<0||t>1)return null;
    const u=1-v-w,nv=this._normalVelocity(ti,u,v,w);
    return{ti,t,u,v,w,x:p0x+dx*t,y:p0y+dy*t,z:p0z+dz*t,...nv};
  }
  sweepSegment(p0x,p0y,p0z,p1x,p1y,p1z,{pad=0}={}){
    let best=null,bestT=1.0000001;
    const stack=[this.root];
    while(stack.length){
      const n=stack.pop();if(!segmentAabb(p0x,p0y,p0z,p1x,p1y,p1z,n,pad))continue;
      if(n.ids){
        for(const ti of n.ids){
          const h=this._segmentTriangle(p0x,p0y,p0z,p1x,p1y,p1z,ti);
          if(h&&h.t<bestT){best=h;bestT=h.t}
        }
      }else{stack.push(n.left,n.right)}
    }
    return best;
  }
  sampleTriangle(ti,u,v,w){
    const I=this.indices,P=this.positions;
    const ia=I[ti*3]*3,ib=I[ti*3+1]*3,ic=I[ti*3+2]*3;
    const qx=P[ia]*u+P[ib]*v+P[ic]*w,qy=P[ia+1]*u+P[ib+1]*v+P[ic+1]*w,qz=P[ia+2]*u+P[ib+2]*v+P[ic+2]*w;
    const nv=this._normalVelocity(ti,u,v,w);
    let tx=P[ib]-P[ia],ty=P[ib+1]-P[ia+1],tz=P[ib+2]-P[ia+2],tl=Math.hypot(tx,ty,tz);
    if(tl<1e-9){tx=1;ty=0;tz=0;tl=1}tx/=tl;ty/=tl;tz/=tl;
    // orthogonalize tangent to the interpolated normal
    const dn=tx*nv.nx+ty*nv.ny+tz*nv.nz;tx-=nv.nx*dn;ty-=nv.ny*dn;tz-=nv.nz*dn;tl=Math.hypot(tx,ty,tz)||1;tx/=tl;ty/=tl;tz/=tl;
    const bx=nv.ny*tz-nv.nz*ty,by=nv.nz*tx-nv.nx*tz,bz=nv.nx*ty-nv.ny*tx;
    return{qx,qy,qz,tx,ty,tz,bx,by,bz,...nv};
  }
  stats(){return{triangles:Math.floor(this.indices.length/3),nodes:this.nodeCount,depth:this.maxDepth,leafSize:this.leafSize}}
}

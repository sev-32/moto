const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n)};
const mean=(P,ids)=>{let x=0,y=0,z=0,n=0;for(const i of ids){const p=i*3;x+=P[p];y+=P[p+1];z+=P[p+2];n++;}return n?[x/n,y/n,z/n]:[0,0,0]};
const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0];
const basis=n=>{const ref=Math.abs(n[1])<.90?[0,1,0]:[1,0,0],u=norm(cross(n,ref)),v=norm(cross(n,u));return[u,v]};
function triPlaneSegment(P,ia,ib,ic,c,n,eps=1e-7){const ids=[ia,ib,ic],pts=ids.map(i=>[P[i*3],P[i*3+1],P[i*3+2]]),d=pts.map(p=>dot(sub(p,c),n)),out=[];const push=p=>{for(const q of out)if(Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<1e-6)return;out.push(p)};for(let e=0;e<3;e++){const a=e,b=(e+1)%3,da=d[a],db=d[b],pa=pts[a],pb=pts[b];if(Math.abs(da)<=eps)push(pa);if((da<-eps&&db>eps)||(da>eps&&db<-eps)){const t=da/(da-db);push(add(pa,mul(sub(pb,pa),t)));}}if(out.length<2)return null;let best=[out[0],out[1]],bd=-1;for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){const q=sub(out[i],out[j]),dd=dot(q,q);if(dd>bd){bd=dd;best=[out[i],out[j]]}}return best;}
const project2=(p,c,u,v)=>{const q=sub(p,c);return[dot(q,u),dot(q,v)]};
function raySegmentDistance(th,a,b){const d=[Math.cos(th),Math.sin(th)],s=[b[0]-a[0],b[1]-a[1]],den=cross2(d,s);if(Math.abs(den)<1e-10)return null;const t=cross2(a,s)/den,q=cross2(a,d)/den;return t>=0&&q>=-1e-7&&q<=1+1e-7?t:null;}
function nearestHit(th,segs){let best=null;for(const s of segs){const t=raySegmentDistance(th,s.a,s.b);if(t!==null&&(!best||t<best.t))best={t,seg:s}}return best;}
function nearest(th,segs){return nearestHit(th,segs)?.t??null;}
function fit(samples,order){const m=1+2*order,A=Array.from({length:m},()=>new Float64Array(m)),b=new Float64Array(m);for(const s of samples){const r=new Float64Array(m),w=Math.max(.01,Number(s.w??1));r[0]=1;for(let k=1;k<=order;k++){r[2*k-1]=Math.cos(k*s.a);r[2*k]=Math.sin(k*s.a)}for(let i=0;i<m;i++){b[i]+=w*r[i]*s.y;for(let j=0;j<m;j++)A[i][j]+=w*r[i]*r[j];}}let tr=0;for(let i=0;i<m;i++)tr+=A[i][i];const reg=Math.max(1e-10,tr*1e-8);for(let i=0;i<m;i++)A[i][i]+=reg;const M=A.map((r,i)=>Float64Array.from([...r,b[i]]));for(let c=0;c<m;c++){let p=c;for(let i=c+1;i<m;i++)if(Math.abs(M[i][c])>Math.abs(M[p][c]))p=i;if(Math.abs(M[p][c])<1e-12)continue;if(p!==c){const q=M[c];M[c]=M[p];M[p]=q}const z=M[c][c];for(let j=c;j<=m;j++)M[c][j]/=z;for(let i=0;i<m;i++){if(i===c)continue;const f=M[i][c];for(let j=c;j<=m;j++)M[i][j]-=f*M[c][j];}}return Float64Array.from({length:m},(_,i)=>M[i][m]);}
const evalF=(c,a)=>{let y=c[0]||0;for(let k=1;k<=(c.length-1)/2;k++)y+=c[2*k-1]*Math.cos(k*a)+c[2*k]*Math.sin(k*a);return y};

/** Low-order correction driven by the exact cross-section topology geometry. */
export class PantsSectionEnvelope{
  constructor({bodyBindPositions,bodyIndices,clothRestPositions,clothIndices,shellVertexCount,rays=48,fraction=.52,bandHalf=.030}={}){
    this.bodyBind=Float32Array.from(bodyBindPositions);this.bodyIndices=bodyIndices;this.clothRest=clothRestPositions;this.clothIndices=clothIndices;this.shellVertexCount=shellVertexCount;this.rays=rays;this.fraction=fraction;this.bandHalf=bandHalf;
    let ymin=Infinity,ymax=-Infinity;for(let i=0;i<shellVertexCount;i++){const y=clothRestPositions[i*3+1];ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}const low=ymin+.055,high=ymin+(ymax-ymin)*.72;this.restY=low+(high-low)*fraction;
    this.sides=[-1,1].map(side=>this._buildSide(side));this.vertexNeighbors=Array.from({length:shellVertexCount},()=>new Set());for(let k=0;k<clothIndices.length;k+=3){const a=clothIndices[k],b=clothIndices[k+1],c=clothIndices[k+2];if(a>=shellVertexCount||b>=shellVertexCount||c>=shellVertexCount)continue;this.vertexNeighbors[a].add(b).add(c);this.vertexNeighbors[b].add(a).add(c);this.vertexNeighbors[c].add(a).add(b);}this.stats={frames:0,corrections:0,lastCorrections:0,barrierCorrections:0,lastBarrierCorrections:0,maxRawDeficitM:0,maxAppliedM:0,lastCoverage:1,lastClearanceM:Infinity,activeSides:0};
  }
  _bodyBand(side,y,half){const a=[];for(let i=0;i<this.bodyBind.length/3;i++){const p=i*3,x=this.bodyBind[p],yy=this.bodyBind[p+1];if((side<0?x<-.02:x>.02)&&Math.abs(yy-y)<=half)a.push(i)}return a;}
  _bodyTris(side,y,pad){const a=[],I=this.bodyIndices,P=this.bodyBind;for(let k=0;k<I.length;k+=3){const i=I[k],j=I[k+1],l=I[k+2],cy=(P[i*3+1]+P[j*3+1]+P[l*3+1])/3,cx=(P[i*3]+P[j*3]+P[l*3])/3;if(Math.abs(cy-y)<=pad&&(side<0?cx<.035:cx>-.035))a.push(k/3)}return Uint32Array.from(a);}
  _clothTris(side,y,pad){const a=[],I=this.clothIndices,P=this.clothRest,verts=new Set();for(let k=0;k<I.length;k+=3){const i=I[k],j=I[k+1],l=I[k+2];if(i>=this.shellVertexCount||j>=this.shellVertexCount||l>=this.shellVertexCount)continue;const cy=(P[i*3+1]+P[j*3+1]+P[l*3+1])/3,cx=(P[i*3]+P[j*3]+P[l*3])/3;if(Math.abs(cy-y)<=pad&&(side<0?cx<.06:cx>-.06)){a.push(k/3);verts.add(i);verts.add(j);verts.add(l)}}return {tris:Uint32Array.from(a),verts:Uint32Array.from(verts)};}
  _buildSide(side){const y=this.restY,ids=this._bodyBand(side,y,this.bandHalf),lo=this._bodyBand(side,y-this.bandHalf*1.4,this.bandHalf),hi=this._bodyBand(side,y+this.bandHalf*1.4,this.bandHalf),ct=this._clothTris(side,y,.13);return{side,ids,lo,hi,bodyTris:this._bodyTris(side,y,.11),clothTris:ct.tris,clothVerts:ct.verts};}
  _segments(P,I,ids,C,n,u,v){const out=[];for(const ti of ids){const k=ti*3,s=triPlaneSegment(P,I[k],I[k+1],I[k+2],C,n);if(s)out.push({a:project2(s[0],C,u,v),b:project2(s[1],C,u,v),ti})}return out;}
  apply(bodyP,clothP,prevP,{gapM=.001,order=4,strength=.65,capM=.0025,axialWidthM=.055,deficitWeight=1,barrier=false,barrierTriggerM=-.003,barrierTargetM=.0005,barrierStrength=.35,barrierCapM=.0015,barrierNeighborWeight=.25,barrierRings=3,barrierFalloff=.68,minArticulation=true}={}){
    let corrections=0,maxRaw=0,maxApplied=0,worstCoverage=1,worstClear=Infinity,active=0;order=Math.max(1,Math.min(6,order|0));
    for(const st of this.sides){if(st.ids.length<8)continue;const C=mean(bodyP,st.ids),L=mean(bodyP,st.lo),H=mean(bodyP,st.hi),axis=norm(sub(H,L)),[u,v]=basis(axis),bs=this._segments(bodyP,this.bodyIndices,st.bodyTris,C,axis,u,v),cs=this._segments(clothP,this.clothIndices,st.clothTris,C,axis,u,v),samples=[];let bodyRays=0,covered=0,minClr=Infinity;
      const barrierEvents=[];for(let r=0;r<this.rays;r++){const a=2*Math.PI*r/this.rays,bh=nearestHit(a,bs);if(!bh)continue;const bt=bh.t;bodyRays++;const ch=nearestHit(a,cs);if(!ch){samples.push({a,y:0});continue;}const ct=ch.t,clr=ct-bt;minClr=Math.min(minClr,clr);if(clr>=0)covered++;const def=Math.max(0,bt+gapM-ct);maxRaw=Math.max(maxRaw,def);samples.push({a,y:def,w:def>1e-7?deficitWeight:1});if(barrier&&clr<barrierTriggerM)barrierEvents.push({a,need:Math.max(0,barrierTargetM-clr),ti:ch.seg.ti});}
      const coverage=bodyRays?covered/bodyRays:0;worstCoverage=Math.min(worstCoverage,coverage);if(Number.isFinite(minClr))worstClear=Math.min(worstClear,minClr);if(!samples.some(s=>s.y>1e-6))continue;active++;
      const coef=fit(samples,order);
      for(const i of st.clothVerts){const p=i*3,dx=clothP[p]-C[0],dy=clothP[p+1]-C[1],dz=clothP[p+2]-C[2],ax=dx*axis[0]+dy*axis[1]+dz*axis[2];if(Math.abs(ax)>axialWidthM*2)continue;const du=dx*u[0]+dy*u[1]+dz*u[2],dv=dx*v[0]+dy*v[1]+dz*v[2],a=Math.atan2(dv,du),w=Math.exp(-Math.pow(ax/axialWidthM,2)),raw=Math.max(0,evalF(coef,a)),d=Math.min(capM,raw*strength*w);if(d<=1e-8)continue;const rx=Math.cos(a)*u[0]+Math.sin(a)*v[0],ry=Math.cos(a)*u[1]+Math.sin(a)*v[1],rz=Math.cos(a)*u[2]+Math.sin(a)*v[2];clothP[p]+=rx*d;clothP[p+1]+=ry*d;clothP[p+2]+=rz*d;if(prevP){prevP[p]+=rx*d;prevP[p+1]+=ry*d;prevP[p+2]+=rz*d}corrections++;maxApplied=Math.max(maxApplied,d);}
      if(barrierEvents.length){
        const acc=new Float64Array(this.shellVertexCount*3),wt=new Float64Array(this.shellVertexCount);
        const rings=Math.max(0,Math.min(6,Math.floor(Number(barrierRings)||0))),fall=clamp(Number(barrierFalloff)||.68,.15,.98);
        for(const ev of barrierEvents){
          const k=ev.ti*3,rad=[Math.cos(ev.a)*u[0]+Math.sin(ev.a)*v[0],Math.cos(ev.a)*u[1]+Math.sin(ev.a)*v[1],Math.cos(ev.a)*u[2]+Math.sin(ev.a)*v[2]],d=Math.min(barrierCapM,ev.need*barrierStrength),seed=[this.clothIndices[k],this.clothIndices[k+1],this.clothIndices[k+2]];
          const level=new Map(),queue=[];for(const vi of seed){if(vi>=this.shellVertexCount)continue;level.set(vi,0);queue.push(vi)}
          for(let qi=0;qi<queue.length;qi++){const vi=queue[qi],lv=level.get(vi);if(lv>=rings)continue;for(const nb of this.vertexNeighbors[vi])if(nb<this.shellVertexCount&&!level.has(nb)){level.set(nb,lv+1);queue.push(nb)}}
          for(const [vi,lv] of level){
            // Translate the hit patch almost rigidly and taper only at its boundary.
            // This preserves the strain state inside the correcting patch instead of
            // stretching the three detecting vertices away from their neighbors.
            let w=lv===0?1:Math.pow(fall,Math.max(0,lv-1));if(lv===rings&&rings>0)w*=barrierNeighborWeight;
            const p=vi*3;acc[p]+=rad[0]*d*w;acc[p+1]+=rad[1]*d*w;acc[p+2]+=rad[2]*d*w;wt[vi]+=w;
          }
        }
        let bc=0;for(let i=0;i<this.shellVertexCount;i++){if(!wt[i])continue;const p=i*3,dx=acc[p]/wt[i],dy=acc[p+1]/wt[i],dz=acc[p+2]/wt[i],d=Math.hypot(dx,dy,dz);if(d<=1e-9)continue;clothP[p]+=dx;clothP[p+1]+=dy;clothP[p+2]+=dz;if(prevP){prevP[p]+=dx;prevP[p+1]+=dy;prevP[p+2]+=dz}bc++;maxApplied=Math.max(maxApplied,d);}this.stats.barrierCorrections+=bc;this.stats.lastBarrierCorrections=bc;
      }else this.stats.lastBarrierCorrections=0;
    }
    this.stats.frames++;this.stats.corrections+=corrections;this.stats.lastCorrections=corrections;this.stats.maxRawDeficitM=Math.max(this.stats.maxRawDeficitM,maxRaw);this.stats.maxAppliedM=Math.max(this.stats.maxAppliedM,maxApplied);this.stats.lastCoverage=worstCoverage;this.stats.lastClearanceM=worstClear;this.stats.activeSides=active;return corrections;
  }
}

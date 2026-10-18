
const TWO_PI=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function normalize3(a,o){
  const n=Math.hypot(a[o],a[o+1],a[o+2]);if(n>1e-12){a[o]/=n;a[o+1]/=n;a[o+2]/=n}
}
function vertexNormals(pos,idx,out){
  out.fill(0);
  for(let k=0;k<idx.length;k+=3){
    const ia=idx[k]*3,ib=idx[k+1]*3,ic=idx[k+2]*3;
    const abx=pos[ib]-pos[ia],aby=pos[ib+1]-pos[ia+1],abz=pos[ib+2]-pos[ia+2];
    const acx=pos[ic]-pos[ia],acy=pos[ic+1]-pos[ia+1],acz=pos[ic+2]-pos[ia+2];
    const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    for(const p of [ia,ib,ic]){out[p]+=nx;out[p+1]+=ny;out[p+2]+=nz}
  }
  for(let i=0;i<pos.length;i+=3)normalize3(out,i);return out;
}
function buildStage(vertexCount,indices){
  const edgeMap=new Map(),ea=[],eb=[];
  const mid=(a,b)=>{
    if(a>b){const t=a;a=b;b=t}const key=a+','+b;let m=edgeMap.get(key);
    if(m===undefined){m=vertexCount+ea.length;edgeMap.set(key,m);ea.push(a);eb.push(b)}return m;
  };
  const out=new Uint32Array(indices.length*4);let q=0;
  for(let k=0;k<indices.length;k+=3){
    const a=indices[k],b=indices[k+1],c=indices[k+2],ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
    for(const t of [a,ab,ca, ab,b,bc, ca,bc,c, ab,bc,ca])out[q++]=t;
  }
  return{inputVertexCount:vertexCount,vertexCount:vertexCount+ea.length,edgeA:Uint32Array.from(ea),edgeB:Uint32Array.from(eb),indices:out};
}
function subdivideVec3(input,stage,out){
  out.set(input);
  for(let e=0;e<stage.edgeA.length;e++){
    const a=stage.edgeA[e]*3,b=stage.edgeB[e]*3,p=(stage.inputVertexCount+e)*3;
    out[p]=(input[a]+input[b])*.5;out[p+1]=(input[a+1]+input[b+1])*.5;out[p+2]=(input[a+2]+input[b+2])*.5;
  }
}
function subdividePhong(input,normals,stage,out,strength=.55){
  out.set(input);
  const s=clamp(strength,0,1);
  for(let e=0;e<stage.edgeA.length;e++){
    const ai=stage.edgeA[e],bi=stage.edgeB[e],a=ai*3,b=bi*3,p=(stage.inputVertexCount+e)*3;
    const mx=(input[a]+input[b])*.5,my=(input[a+1]+input[b+1])*.5,mz=(input[a+2]+input[b+2])*.5;
    const dax=input[a]-mx,day=input[a+1]-my,daz=input[a+2]-mz;
    const dbx=input[b]-mx,dby=input[b+1]-my,dbz=input[b+2]-mz;
    const da=dax*normals[a]+day*normals[a+1]+daz*normals[a+2];
    const db=dbx*normals[b]+dby*normals[b+1]+dbz*normals[b+2];
    const px=mx+(normals[a]*da+normals[b]*db)*.5;
    const py=my+(normals[a+1]*da+normals[b+1]*db)*.5;
    const pz=mz+(normals[a+2]*da+normals[b+2]*db)*.5;
    out[p]=mx+(px-mx)*s;out[p+1]=my+(py-my)*s;out[p+2]=mz+(pz-mz)*s;
  }
}
function subdivideScalar(input,stage,out){
  out.set(input);for(let e=0;e<stage.edgeA.length;e++)out[stage.inputVertexCount+e]=(input[stage.edgeA[e]]+input[stage.edgeB[e]])*.5;
}
function subdivideColor(input,channels,stage,out){
  out.set(input);
  for(let e=0;e<stage.edgeA.length;e++){const a=stage.edgeA[e]*channels,b=stage.edgeB[e]*channels,p=(stage.inputVertexCount+e)*channels;for(let c=0;c<channels;c++)out[p+c]=(input[a+c]+input[b+c])*.5}
}
export class ClothRenderSupermesh{
  constructor({positions,normals,indices,colors=null,levels=2,shellVertexCount,edges=null,edgeRest=null}={}){
    this.levels=clamp(levels|0,0,2);this.shellVertexCount=shellVertexCount|0;this.edges=edges;this.edgeRest=edgeRest;
    this.baseVertexCount=positions.length/3;this.baseIndices=indices;
    this.stages=[];let n=this.baseVertexCount,idx=indices;
    for(let l=0;l<this.levels;l++){const s=buildStage(n,idx);this.stages.push(s);n=s.vertexCount;idx=s.indices}
    this.vertexCount=n;this.indices=this.stages.length?this.stages[this.stages.length-1].indices:new Uint32Array(indices);
    this.positions=new Float32Array(n*3);this.normals=new Float32Array(n*3);
    this._posLevels=[new Float32Array(positions)],this._normalLevels=[new Float32Array(normals)];
    for(const s of this.stages){this._posLevels.push(new Float32Array(s.vertexCount*3));this._normalLevels.push(new Float32Array(s.vertexCount*3))}
    this.restLevels=[new Float32Array(positions)];
    for(let l=0;l<this.stages.length;l++){const a=new Float32Array(this.stages[l].vertexCount*3);subdivideVec3(this.restLevels[l],this.stages[l],a);this.restLevels.push(a)}
    this.restPositions=this.restLevels[this.restLevels.length-1];

    this.colorChannels=colors?(colors.length/this.baseVertexCount|0):0;this.colors=null;
    if(colors&&this.colorChannels>=3&&this.colorChannels<=4){
      let prev=new Float32Array(colors);
      for(const s of this.stages){const next=new Float32Array(s.vertexCount*this.colorChannels);subdivideColor(prev,this.colorChannels,s,next);prev=next}
      this.colors=prev;
    }
    this.compressionMemory=new Float32Array(this.baseVertexCount);this._compBase=new Float32Array(this.baseVertexCount);
    this._dirBase=new Float32Array(this.baseVertexCount*3);for(let i=0;i<this.baseVertexCount;i++)this._dirBase[i*3]=1;
    this._tensorBase=new Float32Array(this.baseVertexCount*6);this._tensorScratch=new Float32Array(this.baseVertexCount*6);
    this._tensorCounts=new Uint16Array(this.baseVertexCount);this._edgeCompMax=new Float32Array(this.baseVertexCount);
    this._contactBase=new Float32Array(this.baseVertexCount);this._contactNormalBase=new Float32Array(this.baseVertexCount*3);
    this._neighbors=Array.from({length:this.baseVertexCount},()=>[]);
    if(this.edges)for(let k=0;k<this.edges.length;k+=2){const a=this.edges[k],b=this.edges[k+1];if(a<this.baseVertexCount&&b<this.baseVertexCount){this._neighbors[a].push(b);this._neighbors[b].push(a)}}
    this._compLevels=[this._compBase];this._dirLevels=[this._dirBase];this._contactLevels=[this._contactBase];this._contactNormalLevels=[this._contactNormalBase];
    for(const s of this.stages){this._compLevels.push(new Float32Array(s.vertexCount));this._dirLevels.push(new Float32Array(s.vertexCount*3));this._contactLevels.push(new Float32Array(s.vertexCount));this._contactNormalLevels.push(new Float32Array(s.vertexCount*3))}
    // M4: coherent mid-frequency detail. The physical shell owns large folds;
    // the render layer adds only sub-2 mm wrinkles and backs off near body contact.
    this.wrinkle={enabled:true,threshold:.012,maxAmplitudeM:.00145,gainMPerStrain:.011,wavelengthM:.046,attackHz:7.5,releaseHz:2.2,contactSuppression:.88,torsoGain:.82,sleeveGain:1.0,renderContactLiftM:.00085};
    this.subdivisionSmooth=.58;
    this.telemetry={levels:this.levels,vertices:this.vertexCount,triangles:this.indices.length/3,maxWrinkleM:0,meanCompression:0};
    this.update({renderPositions:positions,renderNormals:normals,pos:positions},1/60);
  }
  _updateCompression(solver,dt){
    const n=this.baseVertexCount,comp=this._compBase,dir=this._dirBase,T=this._tensorBase,S=this._tensorScratch,C=this._tensorCounts,E=this._edgeCompMax;
    T.fill(0);C.fill(0);E.fill(0);comp.fill(0);
    if(this.edges&&this.edgeRest&&solver?.pos){
      for(let k=0;k<this.edges.length;k+=2){
        const a=this.edges[k],b=this.edges[k+1];if(a>=this.shellVertexCount||b>=this.shellVertexCount)continue;
        const rl=this.edgeRest[k>>1];if(rl<.001)continue;
        const ap=a*3,bp=b*3,dx=solver.pos[bp]-solver.pos[ap],dy=solver.pos[bp+1]-solver.pos[ap+1],dz=solver.pos[bp+2]-solver.pos[ap+2],l=Math.hypot(dx,dy,dz);
        const c=clamp(1-l/rl,0,.40);if(c<=.0015)continue;const inv=l>1e-8?1/l:0,x=dx*inv,y=dy*inv,z=dz*inv;
        E[a]=Math.max(E[a],c);E[b]=Math.max(E[b],c);
        for(const v of [a,b]){const o=v*6;T[o]+=c*x*x;T[o+1]+=c*y*y;T[o+2]+=c*z*z;T[o+3]+=c*x*y;T[o+4]+=c*x*z;T[o+5]+=c*y*z;C[v]++}
      }
      for(let i=0;i<this.shellVertexCount;i++){const q=C[i]||1,o=i*6;for(let j=0;j<6;j++)T[o+j]/=q}
      // Smooth the sign-invariant compression tensor rather than edge directions.
      // This removes triangle-index jitter while retaining a principal material axis.
      for(let pass=0;pass<2;pass++){
        for(let i=0;i<this.shellVertexCount;i++){
          const nb=this._neighbors[i],o=i*6;if(!nb.length){for(let j=0;j<6;j++)S[o+j]=T[o+j];continue}
          for(let j=0;j<6;j++){let av=0;for(const v of nb)av+=T[v*6+j];av/=nb.length;S[o+j]=T[o+j]*.58+av*.42}
        }
        T.set(S.subarray(0,this.shellVertexCount*6),0);
      }
    }
    let sum=0;
    const contact=this._contactBase,contactN=this._contactNormalBase;contact.fill(0);contactN.fill(0);
    for(let i=0;i<this.shellVertexCount;i++){
      const o=i*6,p=i*3,m00=T[o],m11=T[o+1],m22=T[o+2],m01=T[o+3],m02=T[o+4],m12=T[o+5];
      let x=dir[p],y=dir[p+1],z=dir[p+2];if(Math.hypot(x,y,z)<.5){x=1;y=0;z=0}
      for(let q=0;q<4;q++){const nx=m00*x+m01*y+m02*z,ny=m01*x+m11*y+m12*z,nz=m02*x+m12*y+m22*z,l=Math.hypot(nx,ny,nz);if(l<1e-9)break;x=nx/l;y=ny/l;z=nz/l}
      dir[p]=x;dir[p+1]=y;dir[p+2]=z;
      const lambda=Math.max(0,x*(m00*x+m01*y+m02*z)+y*(m01*x+m11*y+m12*z)+z*(m02*x+m12*y+m22*z));
      const target=Math.max(0,lambda*.82+E[i]*.18),old=this.compressionMemory[i],hz=target>old?this.wrinkle.attackHz:this.wrinkle.releaseHz;
      const a=1-Math.exp(-Math.max(0,dt)*hz),v=old+(target-old)*a;this.compressionMemory[i]=v;comp[i]=v;sum+=v;
      const clr=solver?.clearance?.[i]??.08,flag=solver?.contactFlags?.[i]??0;
      contact[i]=flag?1:clamp((.014-clr)/.010,0,1);
      if(flag&&solver?.contactNormal){contactN[p]=solver.contactNormal[p];contactN[p+1]=solver.contactNormal[p+1];contactN[p+2]=solver.contactNormal[p+2]}
      else if(solver?.carrierNormal){contactN[p]=solver.carrierNormal[p];contactN[p+1]=solver.carrierNormal[p+1];contactN[p+2]=solver.carrierNormal[p+2]}
    }
    // Feather contact suppression one ring so wrinkle amplitude does not pop at
    // the exact collision-vertex boundary.
    S.fill(0,0,this.shellVertexCount);
    for(let i=0;i<this.shellVertexCount;i++){let v=contact[i];for(const j of this._neighbors[i])if(j<this.shellVertexCount)v=Math.max(v,contact[j]*.62);S[i]=v}
    for(let i=0;i<this.shellVertexCount;i++)contact[i]=S[i];
    for(let i=this.shellVertexCount;i<n;i++){
      comp[i]=0;contact[i]=1;
      const p=i*3,ti=solver?.contactTri?.[i]??-1;
      if(ti>=0&&solver?.bodyBVH&&solver?.pos){
        const h=solver.bodyBVH.closestPointTriangle(solver.pos[p],solver.pos[p+1],solver.pos[p+2],ti);
        if(h){contactN[p]=h.nx;contactN[p+1]=h.ny;contactN[p+2]=h.nz}
      }
    }
    this.telemetry.meanCompression=this.shellVertexCount?sum/this.shellVertexCount:0;
  }
  update(solver,dt=1/60){
    const basePos=solver.renderPositions||solver.pos,baseNor=solver.renderNormals||solver.normals;
    this._posLevels[0].set(basePos);this._normalLevels[0].set(baseNor);this._updateCompression(solver,dt);
    for(let l=0;l<this.stages.length;l++){
      const s=this.stages[l];subdividePhong(this._posLevels[l],this._normalLevels[l],s,this._posLevels[l+1],this.subdivisionSmooth);subdivideVec3(this._normalLevels[l],s,this._normalLevels[l+1]);
      subdivideScalar(this._compLevels[l],s,this._compLevels[l+1]);subdivideVec3(this._dirLevels[l],s,this._dirLevels[l+1]);subdivideScalar(this._contactLevels[l],s,this._contactLevels[l+1]);subdivideVec3(this._contactNormalLevels[l],s,this._contactNormalLevels[l+1]);
      const nn=this._normalLevels[l+1],dd=this._dirLevels[l+1],cn=this._contactNormalLevels[l+1];for(let i=0;i<s.vertexCount;i++){normalize3(nn,i*3);normalize3(dd,i*3);normalize3(cn,i*3)}
    }
    const finalPos=this._posLevels[this._posLevels.length-1],finalNor=this._normalLevels[this._normalLevels.length-1];
    this.positions.set(finalPos);this.normals.set(finalNor);let maxW=0,changed=false;
    const contact=this._contactLevels[this._contactLevels.length-1],contactN=this._contactNormalLevels[this._contactNormalLevels.length-1];
    if(this.wrinkle.enabled){
      const comp=this._compLevels[this._compLevels.length-1],dir=this._dirLevels[this._dirLevels.length-1],rest=this.restPositions;
      for(let i=0;i<this.vertexCount;i++){
        const c=comp[i];if(c<=this.wrinkle.threshold)continue;const p=i*3;
        const bodyContact=clamp(contact[i]||0,0,1),baseI=Math.min(i,this.baseVertexCount-1),component=this.baseVertexCount?solver?.componentIds?.[baseI]??2:2;
        const regionGain=(component===0||component===4)?this.wrinkle.sleeveGain:this.wrinkle.torsoGain;
        const amp=Math.min(this.wrinkle.maxAmplitudeM,(c-this.wrinkle.threshold)*this.wrinkle.gainMPerStrain)*regionGain*(1-bodyContact*this.wrinkle.contactSuppression);
        if(amp<1e-6)continue;
        const coord=rest[p]*dir[p]+rest[p+1]*dir[p+1]+rest[p+2]*dir[p+2];
        const phase=TWO_PI*coord/this.wrinkle.wavelengthM;
        const wave=Math.sin(phase)*.82+Math.sin(phase*.53+1.17)*.18,off=amp*wave;maxW=Math.max(maxW,Math.abs(off));
        this.positions[p]+=this.normals[p]*off;this.positions[p+1]+=this.normals[p+1]*off;this.positions[p+2]+=this.normals[p+2]*off;changed=true;
      }
    }
    // Cheap render-only contact safety: interpolate coarse contact normals to
    // the detail mesh and lift only the near-contact render surface. These
    // vertices gain no mass or physics state.
    const lift=this.wrinkle.renderContactLiftM||0;
    if(lift>0)for(let i=0;i<this.vertexCount;i++){
      const w=clamp(contact[i]||0,0,1);if(w<.12)continue;const p=i*3;let nx=contactN[p],ny=contactN[p+1],nz=contactN[p+2],nl=Math.hypot(nx,ny,nz);
      if(nl<.5)continue;nx/=nl;ny/=nl;nz/=nl;
      const q=lift*w;this.positions[p]+=nx*q;this.positions[p+1]+=ny*q;this.positions[p+2]+=nz*q;changed=true;
    }
    if(changed)vertexNormals(this.positions,this.indices,this.normals);
    this.telemetry.maxWrinkleM=maxW;return this;
  }
  stats(){return{...this.telemetry,wrinkleEnabled:this.wrinkle.enabled}}
}

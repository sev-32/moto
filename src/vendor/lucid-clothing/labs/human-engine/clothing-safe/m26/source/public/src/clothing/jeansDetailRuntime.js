
const decode=(s,C)=>{const raw=atob(s),b=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);return new C(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))};
export class JeansDetailRuntime{
  constructor(data,parentIndices){
    const a=data.arrays;this.meta=data;this.parentIndices=parentIndices;
    this.positions=decode(a.positions_f32_b64,Float32Array);
    this.normals=decode(a.normals_f32_b64,Float32Array);
    this.colors=decode(a.colors_f32_b64,Float32Array);
    this.indices=decode(a.indices_u32_b64,Uint32Array);
    this.carrierTri=decode(a.carrier_triangle_u32_b64,Uint32Array);
    this.carrierBary=decode(a.carrier_bary_f32_b64,Float32Array);
    this.carrierOffset=decode(a.carrier_normal_offset_f32_b64,Float32Array);
  }
  static async load(url,parentIndices){
    const r=await fetch(url);if(!r.ok)throw new Error(`Jeans detail asset ${r.status}: ${url}`);
    return new JeansDetailRuntime(await r.json(),parentIndices);
  }
  update(parentPositions){
    const P=parentPositions,I=this.parentIndices;
    for(let i=0;i<this.carrierTri.length;i++){
      const ti=this.carrierTri[i],to=ti*3,ia=I[to]*3,ib=I[to+1]*3,ic=I[to+2]*3,p=i*3;
      const u=this.carrierBary[p],v=this.carrierBary[p+1],w=this.carrierBary[p+2];
      const ax=P[ia],ay=P[ia+1],az=P[ia+2],bx=P[ib],by=P[ib+1],bz=P[ib+2],cx=P[ic],cy=P[ic+1],cz=P[ic+2];
      let nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      const L=Math.hypot(nx,ny,nz)||1;nx/=L;ny/=L;nz/=L;const d=this.carrierOffset[i];
      this.positions[p]=ax*u+bx*v+cx*w+nx*d;this.positions[p+1]=ay*u+by*v+cy*w+ny*d;this.positions[p+2]=az*u+bz*v+cz*w+nz*d;
      this.normals[p]=nx;this.normals[p+1]=ny;this.normals[p+2]=nz;
    }
    return this;
  }
}

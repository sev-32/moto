'use strict';
/* Equilibrium carrier worker with interactive solid coupling: resolved advection/combustion, hydrocarbon-vapor envelope, turbulence cascade, thermal transport, pressure projection, and moving solid coupling. No particle execution. */
let nx=32,ny=48,nz=32,N=nx*ny*nz;
let domain=[10,12,10],dx=domain[0]/nx,dy=domain[1]/ny,dz=domain[2]/nz;
let dt=0.028,running=true,initialized=false,steps=0,simTime=0,tick=0,publishEvery=3,solverHz=0,lastRateT=0,lastRateSteps=0;
let scene='steamGrate',seed=1337;
let config={
  physicsProfile:'steam',
  smokeLifetime:30, vaporLifetime:30, targetCarrierMean:.115, autoBalance:1, balanceResponse:.62, maxBalanceScale:4,
  wallPush:.72, wallBand:.28, wallDamping:3.2, centerReturn:.055, wallRecirculation:.34, balanceIntegralGain:.12,
  ambientC:20, buoyancy:0.0038, smokeWeight:0.42, vaporWeight:0.07,
  velocityDissipation:0.997, smokeDissipation:0.994, vaporDissipation:0.997,
  fuelDissipation:0.998, emissionDissipation:0.91, thermalCooling:0.035, scalarDiffusivity:0.045, thermalDiffusivity:0.065,
  vorticity:0.65, pressureIters:22, scalarQuality:1,
  ignitionC:360, burnRate:1.65, heatRelease:980, sootYield:0.24,
  oxygenUse:0.55, oxygenRecovery:0.055, fuelDisplacement:0.58,
  wind:[0,0,0], gust:0, gustHz:0.35, windShear:0, windVeer:0, turbulence:0.35, turbulenceScale:0.55, turbulenceOctaves:3, turbulenceCascade:0.58, swirl:0,
  combustionFlicker:0.32, publishEvery:3, maxSpeed:22, maxTempC:1850, minTempC:-120,
  hcDissipation:0.9992, hcVaporWeight:0.34, hcLEL:0.014, hcUEL:0.074, hcAutoignitionC:456,
  hcBurnRate:4.2, hcHeatRelease:1650, hcSootYield:0.18, hcOxygenUse:2.6, hcExpansion:0.55
};
let sources=[],obstacles=[],publishInFlight=false,sourceCaches=[];
let carrierMass=0,carrierMean=0,carrierStd=0,carrierUniformity=0,balanceScale=1,lastInjection=0,balanceIntegral=0,fluidCellCount=1,solidCellCount=0;
let u,v,w,u0,v0,w0,smoke,smoke0,vapor,vapor0,temp,temp0,fuel,fuel0,hc,hc0,oxygen,oxygen0,emit,emit0,flammability,reaction,pressure,pressure2,divergence,vort,velMag,detailDriver,gradX,gradY,gradZ,gradMag,solid,solidVX,solidVY,solidVZ,tmpA,tmpB;
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/Math.max(b-a,1e-9),0,1);return t*t*(3-2*t);};
const I=(x,y,z)=>x+nx*(y+ny*z);
function alloc(){
  const F=()=>new Float32Array(N),B=()=>new Uint8Array(N);
  u=F();v=F();w=F();u0=F();v0=F();w0=F();smoke=F();smoke0=F();vapor=F();vapor0=F();temp=F();temp0=F();fuel=F();fuel0=F();hc=F();hc0=F();oxygen=F();oxygen0=F();emit=F();emit0=F();flammability=F();reaction=F();pressure=F();pressure2=F();divergence=F();vort=F();velMag=F();detailDriver=F();gradX=F();gradY=F();gradZ=F();gradMag=F();solid=B();solidVX=F();solidVY=F();solidVZ=F();tmpA=F();tmpB=F();
  temp.fill(config.ambientC);oxygen.fill(1);
}
function updateSpacing(){dx=domain[0]/nx;dy=domain[1]/ny;dz=domain[2]/nz;}
function worldAt(x,y,z){return[(x+.5)*dx-domain[0]*.5,(y+.5)*dy,(z+.5)*dz-domain[2]*.5];}
function gridAt(p){return[(p[0]+domain[0]*.5)/dx-.5,p[1]/dy-.5,(p[2]+domain[2]*.5)/dz-.5];}
function sample(a,x,y,z){
  x=clamp(x,.5,nx-1.5);y=clamp(y,.5,ny-1.5);z=clamp(z,.5,nz-1.5);
  const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z),x1=x0+1,y1=y0+1,z1=z0+1,fx=x-x0,fy=y-y0,fz=z-z0;
  const c000=a[I(x0,y0,z0)],c100=a[I(x1,y0,z0)],c010=a[I(x0,y1,z0)],c110=a[I(x1,y1,z0)],c001=a[I(x0,y0,z1)],c101=a[I(x1,y0,z1)],c011=a[I(x0,y1,z1)],c111=a[I(x1,y1,z1)];
  const c00=c000+(c100-c000)*fx,c10=c010+(c110-c010)*fx,c01=c001+(c101-c001)*fx,c11=c011+(c111-c011)*fx,c0=c00+(c10-c00)*fy,c1=c01+(c11-c01)*fy;return c0+(c1-c0)*fz;
}
function localMinMax(a,x,y,z){
  const x0=clamp(Math.floor(x),0,nx-1),y0=clamp(Math.floor(y),0,ny-1),z0=clamp(Math.floor(z),0,nz-1);let mn=Infinity,mx=-Infinity;
  for(let dz0=-1;dz0<=1;dz0++)for(let dy0=-1;dy0<=1;dy0++)for(let dx0=-1;dx0<=1;dx0++){const xx=clamp(x0+dx0,0,nx-1),yy=clamp(y0+dy0,0,ny-1),zz=clamp(z0+dz0,0,nz-1),q=a[I(xx,yy,zz)];mn=Math.min(mn,q);mx=Math.max(mx,q);}return[mn,mx];
}
function advectSL(dst,src,U,V,W,decay=1,stepDt=dt){
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i]){dst[i]=0;continue;}const px=x-stepDt*U[i]/dx,py=y-stepDt*V[i]/dy,pz=z-stepDt*W[i]/dz;dst[i]=sample(src,px,py,pz)*decay;}
}
function advectScalar(dst,src,U,V,W,decay=1){
  if(config.scalarQuality<2){advectSL(dst,src,U,V,W,decay);return;}
  advectSL(tmpA,src,U,V,W,1,dt);advectSL(tmpB,tmpA,U,V,W,1,-dt);
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i]){dst[i]=0;continue;}const px=x-dt*U[i]/dx,py=y-dt*V[i]/dy,pz=z-dt*W[i]/dz,mm=localMinMax(src,px,py,pz),q=tmpA[i]+.5*(src[i]-tmpB[i]);dst[i]=clamp(q,mm[0],mm[1])*decay;}
}
function clearEdges(a,value=0){
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){a[I(0,y,z)]=value;a[I(nx-1,y,z)]=value;}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){a[I(x,0,z)]=value;a[I(x,ny-1,z)]=value;}
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){a[I(x,y,0)]=value;a[I(x,y,nz-1)]=value;}
}
function hash3(x,y,z){let h=(x*374761393+y*668265263+z*2147483647+seed*1274126177)|0;h=(h^(h>>>13))*1274126177;return((h^(h>>>16))>>>0)/4294967295;}
let noiseOutX=0,noiseOutY=0,noiseOutZ=0;
function noiseVector(x,y,z,t){
  // Allocation-free analytic curl-like multioctave forcing.
  let sx=0,sy=0,sz=0,amp=1,norm=0,freq=Math.max(config.turbulenceScale,.05),oct=clamp(config.turbulenceOctaves|0,1,4);
  const px=x*dx,py=y*dy,pz=z*dz;
  for(let o=0;o<oct;o++){
    const qx=px*freq,qy=py*freq,qz=pz*freq,tt=t*(.55+.31*o);
    const ay=1.31+o*.17,bz=.83+o*.11,cz=1.17+o*.13,dx0=.91+o*.19,ex=1.07+o*.23,fy=.79+o*.15;
    const cx=fy*Math.cos(ex*qx+fy*qy-tt*.57)-cz*Math.cos(cz*qz+dx0*qx+tt*.63);
    const cy=bz*Math.cos(ay*qy+bz*qz+tt*.77)-ex*Math.cos(ex*qx+fy*qy-tt*.57);
    const czv=dx0*Math.cos(cz*qz+dx0*qx+tt*.63)-ay*Math.cos(ay*qy+bz*qz+tt*.77);
    sx+=cx*amp;sy+=cy*amp;sz+=czv*amp;norm+=amp;freq*=2.03;amp*=clamp(config.turbulenceCascade,.18,.88);
  }
  const inv=1/Math.max(norm,1e-6);noiseOutX=sx*inv;noiseOutY=sy*inv;noiseOutZ=sz*inv;
}
function insideObstacle(o,p){
  if(o.type==='sphere'){const dx=p[0]-o.pos[0],dy=p[1]-o.pos[1],dz=p[2]-o.pos[2],r=o.radius||1;return dx*dx+dy*dy+dz*dz<=r*r;}
  const s=o.size||[1,1,1];return Math.abs(p[0]-o.pos[0])<=s[0]*.5&&Math.abs(p[1]-o.pos[1])<=s[1]*.5&&Math.abs(p[2]-o.pos[2])<=s[2]*.5;
}
function rebuildSolids(){
  solid.fill(0);solidVX.fill(0);solidVY.fill(0);solidVZ.fill(0);solidCellCount=0;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const px=(x+.5)*dx-domain[0]*.5,py=(y+.5)*dy,pz=(z+.5)*dz-domain[2]*.5,i=I(x,y,z);for(const o of obstacles){if(!o.enabled)continue;let inside=false;if(o.type==='sphere'){const ox=px-o.pos[0],oy=py-o.pos[1],oz=pz-o.pos[2],rr=o.radius||1;inside=ox*ox+oy*oy+oz*oz<=rr*rr;}else{const ss=o.size||[1,1,1];inside=Math.abs(px-o.pos[0])<=ss[0]*.5&&Math.abs(py-o.pos[1])<=ss[1]*.5&&Math.abs(pz-o.pos[2])<=ss[2]*.5;}if(inside){solid[i]=1;solidCellCount++;const vv=o.velocity||[0,0,0],cc=o.coupling==null?1:o.coupling;solidVX[i]=vv[0]*cc;solidVY[i]=vv[1]*cc;solidVZ[i]=vv[2]*cc;break;}}}
  fluidCellCount=Math.max((nx-2)*(ny-2)*(nz-2)-solidCellCount,1);
}
function enforceSolids(){
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i]){u[i]=solidVX[i];v[i]=solidVY[i];w[i]=solidVZ[i];smoke[i]=0;vapor[i]=0;temp[i]=config.ambientC;velMag[i]=Math.hypot(u[i],v[i],w[i]);continue;}let q;if(solid[q=I(x-1,y,z)]&&u[i]<solidVX[q])u[i]=solidVX[q];if(solid[q=I(x+1,y,z)]&&u[i]>solidVX[q])u[i]=solidVX[q];if(solid[q=I(x,y-1,z)]&&v[i]<solidVY[q])v[i]=solidVY[q];if(solid[q=I(x,y+1,z)]&&v[i]>solidVY[q])v[i]=solidVY[q];if(solid[q=I(x,y,z-1)]&&w[i]<solidVZ[q])w[i]=solidVZ[q];if(solid[q=I(x,y,z+1)]&&w[i]>solidVZ[q])w[i]=solidVZ[q];}
  clearEdges(u,0);clearEdges(v,0);clearEdges(w,0);
}
function sourceWeight(s,px,py,pz){
  const dx0=px-s.pos[0],dy0=py-s.pos[1],dz0=pz-s.pos[2];
  if(s.shape==='box'){const sz=s.size||[1,1,1],qx=Math.abs(dx0)/(sz[0]*.5),qy=Math.abs(dy0)/(sz[1]*.5),qz=Math.abs(dz0)/(sz[2]*.5),m=Math.max(qx,qy,qz);return m<1?Math.pow(1-m,1.5):0;}
  if(s.shape==='plenum'){
    const sz=s.size||[4,.5,4];if(Math.abs(dx0)>sz[0]*.5||Math.abs(dy0)>sz[1]*.5||Math.abs(dz0)>sz[2]*.5)return 0;
    const edge=Math.pow(clamp(1-Math.max(Math.abs(dx0)/(sz[0]*.5),Math.abs(dz0)/(sz[2]*.5)),0,1),.45),vertical=Math.pow(clamp(1-Math.abs(dy0)/(sz[1]*.5),0,1),.72),sx=sz[0],sz0=sz[2];
    const jet=(jx,jz,rr)=>Math.exp(-((dx0-jx)*(dx0-jx)+(dz0-jz)*(dz0-jz))/Math.max(rr*rr,1e-4));
    const ports=jet(-sx*.24,-sz0*.18,sx*.15)+jet(sx*.22,-sz0*.15,sx*.14)+jet(-sx*.18,sz0*.22,sx*.13)+jet(sx*.24,sz0*.20,sx*.15)+jet(0,0,sx*.18);
    return clamp(ports,0,1)*edge*vertical;
  }
  if(s.shape==='grate'){const sz=s.size||[4,.5,4];if(Math.abs(dx0)>sz[0]*.5||Math.abs(dy0)>sz[1]*.5||Math.abs(dz0)>sz[2]*.5)return 0;const holes=(Math.sin((px+.17)*7.4)*Math.sin((pz-.11)*7.4)),ex=Math.exp(-1.35*(dx0*dx0/(sz[0]*sz[0]*.20)+dz0*dz0/(sz[2]*sz[2]*.20)));return Math.pow(clamp((holes-.10)*1.9,0,1),1.15)*Math.pow(1-Math.abs(dy0)/(sz[1]*.5),.7)*ex;}
  const r=s.radius||1,dd=(dx0*dx0+dy0*dy0+dz0*dz0)/(r*r);return dd<4?Math.exp(-dd*2.5):0;
}
function rebuildSourceCaches(){
  sourceCaches=sources.map(s=>{
    const ids=[],weights=[],dirX=[],dirY=[],dirZ=[];
    const r=s.radius||Math.max(...(s.size||[1,1,1]))*.6,gc=gridAt(s.pos),rx=Math.ceil((r*2.2)/dx),ry=Math.ceil((r*2.2)/dy),rz=Math.ceil((r*2.2)/dz),x0=Math.max(1,Math.floor(gc[0]-rx)),x1=Math.min(nx-2,Math.ceil(gc[0]+rx)),y0=Math.max(1,Math.floor(gc[1]-ry)),y1=Math.min(ny-2,Math.ceil(gc[1]+ry)),z0=Math.max(1,Math.floor(gc[2]-rz)),z1=Math.min(nz-2,Math.ceil(gc[2]+rz));
    let weightSum=0;
    for(let z=z0;z<=z1;z++)for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const px=(x+.5)*dx-domain[0]*.5,py=(y+.5)*dy,pz=(z+.5)*dz-domain[2]*.5,g=sourceWeight(s,px,py,pz);if(g<1e-5)continue;
      const ox=px-s.pos[0],oy=py-s.pos[1],oz=pz-s.pos[2],ll=Math.hypot(ox,oy,oz)||1;
      ids.push(I(x,y,z));weights.push(g);dirX.push(ox/ll);dirY.push(oy/ll);dirZ.push(oz/ll);weightSum+=g;
    }
    return{ids:new Uint32Array(ids),weights:new Float32Array(weights),dirX:new Float32Array(dirX),dirY:new Float32Array(dirY),dirZ:new Float32Array(dirZ),weightSum};
  });
}
function decay95(seconds){return Math.exp(-2.995732273554*dt/Math.max(seconds,.05));}
function injectSources(){
  lastInjection=0;balanceScale=1;if(!config.autoBalance)balanceIntegral*=.96;
  for(let si=0;si<sources.length;si++){
    const s=sources[si];if(!s.enabled)continue;const cache=sourceCaches[si];if(!cache||cache.ids.length===0)continue;
    const rate=Math.max(0,s.carrierRate==null?4:s.carrierRate),rateScale=s.rateScale==null?1:s.rateScale,steamFraction=clamp(s.steamFraction==null?1:s.steamFraction,0,1);
    const smokeDecay=decay95(config.smokeLifetime),vaporDecay=decay95(config.vaporLifetime),effectiveDecay=(1-steamFraction)*smokeDecay+steamFraction*vaporDecay;
    if(config.autoBalance){
      const fluidCells=Math.max(fluidCellCount,1),targetMass=clamp(config.targetCarrierMean,0,2.2)*fluidCells;
      const error=targetMass-carrierMass;balanceIntegral=clamp(balanceIntegral+error*dt,-targetMass*4,targetMass*4);const maintenance=targetMass*(1-effectiveDecay),correction=error*dt*clamp(config.balanceResponse,0,3),integral=balanceIntegral*dt*clamp(config.balanceIntegralGain||.12,0,1),desired=Math.max(0,maintenance+correction+integral),nominal=Math.max(rate*rateScale*dt*cache.weightSum,1e-6);
      balanceScale=clamp(desired/nominal,0,clamp(config.maxBalanceScale,1,12));
    }
    const pulse=clamp(1+(s.pulse||0)*Math.sin(simTime*(s.pulseHz||1)*Math.PI*2+(s.phase||0)),0,3),dispersion=Math.max(0,s.dispersion||0),heat=s.heat||0,jet=s.jet||[0,0,0],jetOn=(jet[0]||jet[1]||jet[2])?1:0,fuelRate=Math.max(0,s.fuel||0);
    for(let k=0;k<cache.ids.length;k++){
      const i=cache.ids[k];if(solid[i])continue;const g=cache.weights[k],j=.90+.20*hash3(i+steps,17,31),a=g*pulse*j*dt*rateScale*balanceScale,add=rate*a;
      smoke[i]+=add*(1-steamFraction);vapor[i]+=add*steamFraction;temp[i]+=heat*a;if(fuelRate>0){fuel[i]=Math.min(1.5,fuel[i]+fuelRate*g*pulse*dt*rateScale);oxygen[i]=Math.min(1.2,oxygen[i]+0.2*dt);}lastInjection+=add;
      const va=g*pulse*dispersion*dt;u[i]+=cache.dirX[k]*va;v[i]+=cache.dirY[k]*va;w[i]+=cache.dirZ[k]*va;if(jetOn){const ja=g*pulse*dt;u[i]+=jet[0]*ja;v[i]+=jet[1]*ja;w[i]+=jet[2]*ja;}
    }
  }
}

function diffuseReactiveScalars(){
  const profile=config.physicsProfile||'all',doFuel=profile==='fire'||profile==='all',doHC=profile==='hydrocarbon'||profile==='all';
  const invSum=2*(1/(dx*dx)+1/(dy*dy)+1/(dz*dz)),stableD=.92/Math.max(dt*invSum,1e-9),Df=Math.min(Math.max(config.scalarDiffusivity||0,0),stableD),Dt=Math.min(Math.max(config.thermalDiffusivity||0,0),stableD);
  if(Df>0&&doFuel){
    tmpA.set(fuel);tmpB.set(oxygen);
    for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i])continue;const lapF=(tmpA[I(x-1,y,z)]-2*tmpA[i]+tmpA[I(x+1,y,z)])/(dx*dx)+(tmpA[I(x,y-1,z)]-2*tmpA[i]+tmpA[I(x,y+1,z)])/(dy*dy)+(tmpA[I(x,y,z-1)]-2*tmpA[i]+tmpA[I(x,y,z+1)])/(dz*dz),lapO=(tmpB[I(x-1,y,z)]-2*tmpB[i]+tmpB[I(x+1,y,z)])/(dx*dx)+(tmpB[I(x,y-1,z)]-2*tmpB[i]+tmpB[I(x,y+1,z)])/(dy*dy)+(tmpB[I(x,y,z-1)]-2*tmpB[i]+tmpB[I(x,y,z+1)])/(dz*dz);fuel[i]=Math.max(0,tmpA[i]+Df*dt*lapF);oxygen[i]=clamp(tmpB[i]+Df*dt*lapO,0,1.2);}
  }
  if(Df>0&&doHC){
    tmpA.set(hc);tmpB.set(oxygen);
    for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i])continue;const lapH=(tmpA[I(x-1,y,z)]-2*tmpA[i]+tmpA[I(x+1,y,z)])/(dx*dx)+(tmpA[I(x,y-1,z)]-2*tmpA[i]+tmpA[I(x,y+1,z)])/(dy*dy)+(tmpA[I(x,y,z-1)]-2*tmpA[i]+tmpA[I(x,y,z+1)])/(dz*dz);hc[i]=clamp(tmpA[i]+Df*dt*lapH,0,.12);if(!doFuel){const lapO=(tmpB[I(x-1,y,z)]-2*tmpB[i]+tmpB[I(x+1,y,z)])/(dx*dx)+(tmpB[I(x,y-1,z)]-2*tmpB[i]+tmpB[I(x,y+1,z)])/(dy*dy)+(tmpB[I(x,y,z-1)]-2*tmpB[i]+tmpB[I(x,y,z+1)])/(dz*dz);oxygen[i]=clamp(tmpB[i]+Df*dt*lapO,0,1.2);}}
    tmpA.set(reaction);
    for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i])continue;const lapR=(tmpA[I(x-1,y,z)]-2*tmpA[i]+tmpA[I(x+1,y,z)])/(dx*dx)+(tmpA[I(x,y-1,z)]-2*tmpA[i]+tmpA[I(x,y+1,z)])/(dy*dy)+(tmpA[I(x,y,z-1)]-2*tmpA[i]+tmpA[I(x,y,z+1)])/(dz*dz);reaction[i]=Math.max(0,tmpA[i]+Df*dt*.35*lapR);}
  }
  if(Dt>0){
    tmpA.set(temp);
    for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i])continue;const lap=(tmpA[I(x-1,y,z)]-2*tmpA[i]+tmpA[I(x+1,y,z)])/(dx*dx)+(tmpA[I(x,y-1,z)]-2*tmpA[i]+tmpA[I(x,y+1,z)])/(dy*dy)+(tmpA[I(x,y,z-1)]-2*tmpA[i]+tmpA[I(x,y,z+1)])/(dz*dz);temp[i]=clamp(tmpA[i]+Dt*dt*lap,config.minTempC,config.maxTempC);}
  }
}
function applyForces(){
  const gust=config.gust*Math.sin(simTime*Math.PI*2*config.gustHz),baseMag=Math.hypot(config.wind[0],config.wind[2]),baseDir=Math.atan2(config.wind[2],config.wind[0]);
  const band=clamp(config.wallBand,.04,.49),push=clamp(config.wallPush,0,4),damp=clamp(config.wallDamping,0,12),center=clamp(config.centerReturn,0,2),recirc=clamp(config.wallRecirculation,0,4),hx=domain[0]*.5,hy=domain[1]*.5,hz=domain[2]*.5;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
    const i=I(x,y,z);if(solid[i])continue;const px=(x+.5)*dx-hx,py=(y+.5)*dy-hy,pz=(z+.5)*dz-hz,cx=px/hx,cy=py/hy,cz=pz/hz,ax=Math.abs(cx),ay=Math.abs(cy),az=Math.abs(cz),wx=smoothstep(1-band,1,ax),wy=smoothstep(1-band,1,ay),wz=smoothstep(1-band,1,az),sx=cx<0?-1:1,sy=cy<0?-1:1,sz=cz<0?-1:1;
    const buoy=config.buoyancy*(temp[i]-config.ambientC)-config.smokeWeight*smoke[i]*.02-config.vaporWeight*vapor[i]*.02;v[i]+=dt*buoy;
    const yn=(y+.5)/ny-.5,layerMag=Math.max(0,baseMag+config.windShear*yn),layerDir=baseDir+(config.windVeer*Math.PI/180)*yn,targetX=Math.cos(layerDir)*layerMag*(1+gust),targetZ=Math.sin(layerDir)*layerMag*(1+gust),drag=.42;u[i]+=dt*drag*(targetX-u[i]);v[i]+=dt*.18*(config.wind[1]-v[i]);w[i]+=dt*drag*(targetZ-w[i]);
    u[i]+=dt*(-sx*push*wx-center*cx);v[i]+=dt*(-sy*push*wy-center*cy);w[i]+=dt*(-sz*push*wz-center*cz);
    const outX=u[i]*sx,outY=v[i]*sy,outZ=w[i]*sz;if(outX>0)u[i]-=dt*damp*wx*outX*sx;if(outY>0)v[i]-=dt*damp*wy*outY*sy;if(outZ>0)w[i]-=dt*damp*wz*outZ*sz;
    const wall=max3(wx,wy,wz),spin=recirc*wall;u[i]+=dt*spin*(-cy+.35*cz);v[i]+=dt*spin*(cx-.35*cz);w[i]+=dt*spin*(-cx+.35*cy);
    if(config.turbulence>0){const carrier=clamp((smoke[i]+vapor[i])*.32,0,1);if(carrier>.004){noiseVector(x,y,z,simTime);const amp=config.turbulence*(.16+.84*carrier);u[i]+=dt*amp*noiseOutX;v[i]+=dt*amp*noiseOutY;w[i]+=dt*amp*noiseOutZ;}}
    temp[i]+=(config.ambientC-temp[i])*clamp(config.thermalCooling,0,.5)*dt;
  }
}
function max3(a,b,c){return Math.max(a,Math.max(b,c));}
function enforceContainerBoundary(){
  const band=clamp(config.wallBand,.04,.49),damp=Math.exp(-clamp(config.wallDamping,0,12)*dt),hx=domain[0]*.5,hy=domain[1]*.5,hz=domain[2]*.5;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
    const i=I(x,y,z),cx=((x+.5)*dx-hx)/hx,cy=((y+.5)*dy-hy)/hy,cz=((z+.5)*dz-hz)/hz,wx=smoothstep(1-band,1,Math.abs(cx)),wy=smoothstep(1-band,1,Math.abs(cy)),wz=smoothstep(1-band,1,Math.abs(cz)),sx=cx<0?-1:1,sy=cy<0?-1:1,sz=cz<0?-1:1;
    if(u[i]*sx>0)u[i]*=1-wx*(1-damp);if(v[i]*sy>0)v[i]*=1-wy*(1-damp);if(w[i]*sz>0)w[i]*=1-wz*(1-damp);
  }
  enforceSolids();
}
function combustion(){
  const profile=config.physicsProfile||'all',doFuel=profile==='fire'||profile==='all',doHC=profile==='hydrocarbon'||profile==='all';if(!doFuel&&!doHC)return;
  tmpA.set(reaction);tmpB.set(temp);
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);
    if(solid[i])continue;
    reaction[i]*=.28;
    const neighborTemp=Math.max(tmpB[I(x-1,y,z)],tmpB[I(x+1,y,z)],tmpB[I(x,y-1,z)],tmpB[I(x,y+1,z)],tmpB[I(x,y,z-1)],tmpB[I(x,y,z+1)]),neighborReaction=Math.max(tmpA[I(x-1,y,z)],tmpA[I(x+1,y,z)],tmpA[I(x,y-1,z)],tmpA[I(x,y+1,z)],tmpA[I(x,y,z-1)],tmpA[I(x,y,z+1)]);
    const localActivation=clamp((temp[i]-config.ignitionC)/Math.max(config.ignitionC*.65,1),0,1),frontActivation=smoothstep(config.ignitionC-105,config.ignitionC+20,neighborTemp)*smoothstep(.002,.075,neighborReaction),activation=Math.max(localActivation,frontActivation*.84);
    if(doFuel){let burn=0;
    if(fuel[i]>1e-5&&activation>1e-4&&oxygen[i]>1e-5){const oBand=smoothstep(.035,.24,oxygen[i])*(1-smoothstep(.72,1.02,oxygen[i])),mixing=.12+.88*oBand,flicker=clamp(1+config.combustionFlicker*(.55*Math.sin(i*.017+simTime*9.7)+.35*Math.sin(i*.043-simTime*6.3)),.25,1.85),rate=config.burnRate*flicker*activation*mixing*fuel[i]*oxygen[i]*dt;burn=Math.min(fuel[i],oxygen[i]/Math.max(config.oxygenUse,1e-4),rate);}
    fuel[i]-=burn;oxygen[i]-=burn*config.oxygenUse;temp[i]+=burn*config.heatRelease;smoke[i]+=burn*config.sootYield;reaction[i]=Math.max(reaction[i],burn/Math.max(dt,1e-6)*.65);emit[i]=Math.max(emit[i]*Math.min(config.emissionDissipation,.88),burn*6.2+activation*Math.min(fuel[i],oxygen[i])*.0012);}

    if(doHC){
    // Safety-bounded gasoline-like vapor envelope. hc is gas-phase volume fraction (0..0.12).
    const h=hc[i],lel=Math.max(config.hcLEL,1e-5),uel=Math.max(config.hcUEL,lel+.001);
    const inEnvelope=h>=lel&&h<=uel;
    const lean=smoothstep(lel,lel*1.12,h),rich=1-smoothstep(uel*.88,uel,h),o2=smoothstep(.10,.32,oxygen[i]);
    const envelope=inEnvelope?clamp(lean*rich*o2,0,1):0;flammability[i]=envelope;
    const localIgnition=smoothstep(config.hcAutoignitionC-35,config.hcAutoignitionC+45,temp[i]),frontIgnition=smoothstep(config.hcAutoignitionC-125,config.hcAutoignitionC+15,neighborTemp)*smoothstep(.002,.08,neighborReaction);
    const thermal=Math.max(localIgnition,frontIgnition*.92);
    let hcBurn=0;
    if(envelope>1e-5&&thermal>1e-5&&h>1e-6){
      const center=(lel+uel)*.5,half=(uel-lel)*.5,mixtureShape=Math.exp(-Math.pow((h-center)/Math.max(half*.78,1e-5),2));
      const flicker=clamp(1+config.combustionFlicker*.28*Math.sin(i*.031+simTime*13.7),.55,1.45);
      const rate=config.hcBurnRate*flicker*thermal*envelope*(.35+.65*mixtureShape)*h*oxygen[i]*dt;
      hcBurn=Math.min(h,oxygen[i]/Math.max(config.hcOxygenUse,1e-4),rate);
      hc[i]-=hcBurn;oxygen[i]-=hcBurn*config.hcOxygenUse;temp[i]+=hcBurn*config.hcHeatRelease;smoke[i]+=hcBurn*config.hcSootYield;
      reaction[i]=Math.max(reaction[i],hcBurn/Math.max(dt,1e-6));emit[i]=Math.max(emit[i],hcBurn*18+thermal*envelope*.035);
    }}else{flammability[i]=0;}
    oxygen[i]+=dt*config.oxygenRecovery*(1-oxygen[i]);temp[i]+=(config.ambientC-temp[i])*config.thermalCooling*dt;
    smoke[i]=clamp(smoke[i],0,3.5);vapor[i]=clamp(vapor[i],0,3.5);fuel[i]=clamp(fuel[i],0,2.5);hc[i]=clamp(hc[i],0,.12);oxygen[i]=clamp(oxygen[i],0,1.2);temp[i]=clamp(temp[i],config.minTempC,config.maxTempC);emit[i]=clamp(emit[i],0,4);reaction[i]=clamp(reaction[i],0,2.5);
  }
}
function applyReactionExpansion(){
  if(config.hcExpansion<=0)return;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
    const i=I(x,y,z),r=reaction[i];if(solid[i]||r<1e-5)continue;
    const gx=(reaction[I(x+1,y,z)]-reaction[I(x-1,y,z)])/(2*dx),gy=(reaction[I(x,y+1,z)]-reaction[I(x,y-1,z)])/(2*dy),gz=(reaction[I(x,y,z+1)]-reaction[I(x,y,z-1)])/(2*dz),g=Math.hypot(gx,gy,gz)+1e-6;
    const a=config.hcExpansion*r*dt;u[i]-=gx/g*a;v[i]-=gy/g*a;w[i]-=gz/g*a;
  }
}
function computeVorticity(apply=false){let maxV=0;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i]){vort[i]=0;continue;}const cx=.5*((w[I(x,y+1,z)]-w[I(x,y-1,z)])/dy-(v[I(x,y,z+1)]-v[I(x,y,z-1)])/dz),cy=.5*((u[I(x,y,z+1)]-u[I(x,y,z-1)])/dz-(w[I(x+1,y,z)]-w[I(x-1,y,z)])/dx),cz=.5*((v[I(x+1,y,z)]-v[I(x-1,y,z)])/dx-(u[I(x,y+1,z)]-u[I(x,y-1,z)])/dy),m=Math.hypot(cx,cy,cz);vort[i]=m;maxV=Math.max(maxV,m);}
  if(!apply||config.vorticity<=0)return maxV;
  for(let z=2;z<nz-2;z++)for(let y=2;y<ny-2;y++)for(let x=2;x<nx-2;x++){const i=I(x,y,z);if(solid[i])continue;const gx=.5*(vort[I(x+1,y,z)]-vort[I(x-1,y,z)])/dx,gy=.5*(vort[I(x,y+1,z)]-vort[I(x,y-1,z)])/dy,gz=.5*(vort[I(x,y,z+1)]-vort[I(x,y,z-1)])/dz,l=Math.hypot(gx,gy,gz)+1e-6,nxg=gx/l,nyg=gy/l,nzg=gz/l,cx=.5*((w[I(x,y+1,z)]-w[I(x,y-1,z)])/dy-(v[I(x,y,z+1)]-v[I(x,y,z-1)])/dz),cy=.5*((u[I(x,y,z+1)]-u[I(x,y,z-1)])/dz-(w[I(x+1,y,z)]-w[I(x-1,y,z)])/dx),cz=.5*((v[I(x+1,y,z)]-v[I(x-1,y,z)])/dx-(u[I(x,y+1,z)]-u[I(x,y-1,z)])/dy);u[i]+=dt*config.vorticity*(nyg*cz-nzg*cy);v[i]+=dt*config.vorticity*(nzg*cx-nxg*cz);w[i]+=dt*config.vorticity*(nxg*cy-nyg*cx);}
  return maxV;
}
function divergenceNorm(){let s=0,m=0,n=0;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i]){divergence[i]=0;continue;}const d=(u[I(x+1,y,z)]-u[i])/dx+(v[I(x,y+1,z)]-v[i])/dy+(w[I(x,y,z+1)]-w[i])/dz;divergence[i]=d;s+=d*d;m=Math.max(m,Math.abs(d));n++;}return{rms:Math.sqrt(s/Math.max(n,1)),max:m};
}
function project(){
  const before=divergenceNorm();pressure.fill(0);pressure2.fill(0);const ax=1/(dx*dx),ay=1/(dy*dy),az=1/(dz*dz),den=2*(ax+ay+az);
  for(let it=0;it<config.pressureIters;it++){for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i]){pressure2[i]=0;continue;}const pL=solid[I(x-1,y,z)]?pressure[i]:pressure[I(x-1,y,z)],pR=solid[I(x+1,y,z)]?pressure[i]:pressure[I(x+1,y,z)],pD=solid[I(x,y-1,z)]?pressure[i]:pressure[I(x,y-1,z)],pU=solid[I(x,y+1,z)]?pressure[i]:pressure[I(x,y+1,z)],pB=solid[I(x,y,z-1)]?pressure[i]:pressure[I(x,y,z-1)],pF=solid[I(x,y,z+1)]?pressure[i]:pressure[I(x,y,z+1)];pressure2[i]=(ax*(pL+pR)+ay*(pD+pU)+az*(pB+pF)-divergence[i]/Math.max(dt,1e-6))/den;}const q=pressure;pressure=pressure2;pressure2=q;}
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i])continue;u[i]-=dt*(pressure[i]-pressure[I(x-1,y,z)])/dx;v[i]-=dt*(pressure[i]-pressure[I(x,y-1,z)])/dy;w[i]-=dt*(pressure[i]-pressure[I(x,y,z-1)])/dz;}
  enforceSolids();const after=divergenceNorm();return{before,after};
}
let lastProjection={before:{rms:0,max:0},after:{rms:0,max:0}},lastMaxV=0;
function advectAll(){
  u0.set(u);v0.set(v);w0.set(w);advectSL(u,u0,u0,v0,w0,config.velocityDissipation);advectSL(v,v0,u0,v0,w0,config.velocityDissipation);advectSL(w,w0,u0,v0,w0,config.velocityDissipation);
  temp0.set(temp);advectSL(temp,temp0,u,v,w,1);
  smoke0.set(smoke);advectScalar(smoke,smoke0,u,v,w,decay95(config.smokeLifetime));vapor.fill(0);
}
function clampVelocity(){
  let sum=0,sum2=0,count=0;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=I(x,y,z);if(solid[i]){smoke[i]=0;vapor[i]=0;velMag[i]=Math.hypot(solidVX[i],solidVY[i],solidVZ[i]);continue;}const speed=Math.hypot(u[i],v[i],w[i]);velMag[i]=speed;if(speed>config.maxSpeed){const k=config.maxSpeed/speed;u[i]*=k;v[i]*=k;w[i]*=k;velMag[i]=config.maxSpeed;}smoke[i]=clamp(smoke[i],0,2.2);vapor[i]=clamp(vapor[i],0,2.2);const c=smoke[i]+vapor[i];sum+=c;sum2+=c*c;count++;}
  carrierMass=sum;carrierMean=sum/Math.max(count,1);carrierStd=Math.sqrt(Math.max(0,sum2/Math.max(count,1)-carrierMean*carrierMean));carrierUniformity=clamp(1-carrierStd/(carrierMean+.08),0,1);fluidCellCount=Math.max(count,1);
}
function applyJetInlets(){for(let si=0;si<sources.length;si++){const s=sources[si];if(!s.enabled||!s.jetInlet)continue;const cache=sourceCaches[si];if(!cache||cache.ids.length===0)continue;const jet=s.jet||[0,0,0];if(!(jet[0]||jet[1]||jet[2]))continue;const strength=clamp(s.jetInlet===true?0.85:s.jetInlet,0,1),pulse=clamp(1+(s.pulse||0)*Math.sin(simTime*(s.pulseHz||1)*Math.PI*2+(s.phase||0)),0,3);for(let k=0;k<cache.ids.length;k++){const i=cache.ids[k];if(solid[i])continue;const g=cache.weights[k],b=clamp(strength*g,0,1);u[i]=u[i]*(1-b)+jet[0]*pulse*b;v[i]=v[i]*(1-b)+jet[1]*pulse*b;w[i]=w[i]*(1-b)+jet[2]*pulse*b;}}}
function step(){advectAll();applyForces();injectSources();combustion();enforceSolids();diffuseReactiveScalars();lastMaxV=computeVorticity(true);lastProjection=project();applyJetInlets();enforceContainerBoundary();clampVelocity();simTime+=dt;steps++;}
function computeDetailDriver(){
  detailDriver.fill(0);
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
    const i=I(x,y,z);if(solid[i]){detailDriver[i]=0;gradX[i]=gradY[i]=gradZ[i]=gradMag[i]=0;continue;}const l=I(x-1,y,z),r=I(x+1,y,z),d=I(x,y-1,z),up=I(x,y+1,z),b=I(x,y,z-1),f=I(x,y,z+1),dL=smoke[l]+vapor[l]*.82,dR=smoke[r]+vapor[r]*.82,dD=smoke[d]+vapor[d]*.82,dU=smoke[up]+vapor[up]*.82,dB=smoke[b]+vapor[b]*.82,dF=smoke[f]+vapor[f]*.82;
    const gx=(dR-dL)/(2*dx),gy=(dU-dD)/(2*dy),gz=(dF-dB)/(2*dz),gradD=Math.hypot(gx,gy,gz),inv=gradD>1e-8?1/gradD:0;gradX[i]=gx*inv;gradY[i]=gy*inv;gradZ[i]=gz*inv;gradMag[i]=clamp(gradD*.42,0,1);
    const carrier=clamp((smoke[i]+vapor[i])*.42,0,1);detailDriver[i]=clamp(vort[i]*.075+gradD*.26+carrier*.28,0,1);
  }
}
function q8(x,lo,hi){return clamp(Math.round((x-lo)*255/Math.max(hi-lo,1e-9)),0,255);}
function packedFields(){const A=new Uint8Array(N*4),B=new Uint8Array(N*4),C=new Uint8Array(N*4),V=new Uint8Array(N*4),G=new Uint8Array(N*4);for(let i=0,j=0;i<N;i++,j+=4){A[j]=q8(smoke[i],0,2.2);A[j+1]=q8(vapor[i],0,2.2);A[j+2]=q8(temp[i],config.minTempC,config.maxTempC);A[j+3]=q8(emit[i],0,3.5);B[j]=q8(fuel[i],0,1.5);B[j+1]=q8(hc[i],0,.10);B[j+2]=q8(flammability[i],0,1);B[j+3]=q8(reaction[i],0,.5);C[j]=q8(velMag[i],0,config.maxSpeed);C[j+1]=q8(vort[i],0,8);C[j+2]=q8(detailDriver[i],0,1);C[j+3]=q8(oxygen[i],0,1.2);V[j]=q8(u[i],-config.maxSpeed,config.maxSpeed);V[j+1]=q8(v[i],-config.maxSpeed,config.maxSpeed);V[j+2]=q8(w[i],-config.maxSpeed,config.maxSpeed);V[j+3]=solid[i]?255:0;G[j]=q8(gradX[i],-1,1);G[j+1]=q8(gradY[i],-1,1);G[j+2]=q8(gradZ[i],-1,1);G[j+3]=q8(gradMag[i],0,1);}return{A,B,C,V,G};}
function stats(){
  let smokeMass=0,vaporMass=0,heat=0,maxSpeed=0,maxTemp=-Infinity,minTemp=Infinity,maxSmoke=0,maxVapor=0,active=0,solidCount=0;
  for(let i=0;i<N;i++){if(solid[i]){solidCount++;maxSpeed=Math.max(maxSpeed,velMag[i]);continue;}smokeMass+=smoke[i];vaporMass+=vapor[i];heat+=temp[i]-config.ambientC;maxSpeed=Math.max(maxSpeed,velMag[i]);maxTemp=Math.max(maxTemp,temp[i]);minTemp=Math.min(minTemp,temp[i]);maxSmoke=Math.max(maxSmoke,smoke[i]);maxVapor=Math.max(maxVapor,vapor[i]);if(smoke[i]+vapor[i]>.025)active++;}
  const cellVolume=dx*dy*dz;
  return{scene,time:simTime,steps,grid:[nx,ny,nz],domain:domain.slice(),voxelSize:[dx,dy,dz],cellVolume,cellsPerMeter:[nx/domain[0],ny/domain[1],nz/domain[2]],solverHz,smokeMass,vaporMass,heatMass:heat,smokeIntegral:smokeMass*cellVolume,vaporIntegral:vaporMass*cellVolume,heatIntegral:heat*cellVolume,fuelIntegral:0,hcVolumeIntegral:0,emissionIntegral:0,reactionIntegral:0,activeVolume:active*cellVolume,maxSmoke,maxVapor,maxEmission:0,maxHcVolPct:0,maxReaction:0,flammableVoxels:0,ignitedVoxels:0,leanVoxels:0,richVoxels:0,deflagrationIndex:0,maxSpeed,maxTempC:Number.isFinite(maxTemp)?maxTemp:config.ambientC,minTempC:Number.isFinite(minTemp)?minTemp:config.ambientC,activeVoxels:active,solidVoxels:solidCount,fluidVoxels:fluidCellCount,sourceCount:sources.filter(x=>x.enabled).length,obstacleCount:obstacles.filter(x=>x.enabled).length,divergenceBefore:lastProjection.before.rms,divergenceAfter:lastProjection.after.rms,divergenceReduction:lastProjection.before.rms>0?1-lastProjection.after.rms/lastProjection.before.rms:0,maxVorticity:lastMaxV,pressureIters:config.pressureIters,scalarQuality:config.scalarQuality,carrierMass,carrierMean,carrierStd,carrierUniformity,carrierTargetAccuracy:clamp(1-Math.abs(carrierMean-config.targetCarrierMean)/Math.max(config.targetCarrierMean,.001),0,1),targetCarrierMean:config.targetCarrierMean,balanceScale,lastInjection,balanceIntegral,smokeLifetime:config.smokeLifetime,vaporLifetime:config.vaporLifetime,wallPush:config.wallPush,wallBand:config.wallBand,wallDamping:config.wallDamping,centerReturn:config.centerReturn,wallRecirculation:config.wallRecirculation,hcEnvelope:{lelPct:0,uelPct:0,autoignitionC:0}};
}
function publish(force=false){if(!initialized&&!force)return;if(publishInFlight&&!force)return;computeDetailDriver();const p=packedFields(),payload={type:'volume',fieldsA:p.A,fieldsB:p.B,fieldsC:p.C,velocitySolid:p.V,gradient:p.G,metrics:stats(),ranges:{fieldsA:{smoke:[0,2.2],vapor:[0,2.2],temperature:[config.minTempC,config.maxTempC],emission:[0,3.5]},fieldsB:{fuel:[0,1.5],hydrocarbon:[0,.10],flammability:[0,1],reaction:[0,.5]},fieldsC:{velocity:[0,config.maxSpeed],vorticity:[0,8],detail:[0,1],oxygen:[0,1.2]},velocityComponents:[-config.maxSpeed,config.maxSpeed],gradient:[-1,1]}};publishInFlight=true;postMessage(payload,[payload.fieldsA.buffer,payload.fieldsB.buffer,payload.fieldsC.buffer,payload.velocitySolid.buffer,payload.gradient.buffer]);}
function reset(){for(const a of [u,v,w,u0,v0,w0,smoke,smoke0,vapor,vapor0,fuel,fuel0,hc,hc0,emit,emit0,flammability,reaction,pressure,pressure2,divergence,vort,velMag,detailDriver,gradX,gradY,gradZ,gradMag])a.fill(0);temp.fill(config.ambientC);temp0.fill(config.ambientC);oxygen.fill(1);oxygen0.fill(1);steps=0;simTime=0;tick=0;lastRateSteps=0;lastRateT=performance.now();solverHz=0;carrierMass=carrierMean=carrierStd=0;carrierUniformity=0;balanceScale=1;lastInjection=0;balanceIntegral=0;rebuildSolids();rebuildSourceCaches();publish(true);}

function sampleOldGrid(a,x,y,z,onx,ony,onz){
  x=clamp(x,.5,onx-1.5);y=clamp(y,.5,ony-1.5);z=clamp(z,.5,onz-1.5);
  const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z),x1=x0+1,y1=y0+1,z1=z0+1,fx=x-x0,fy=y-y0,fz=z-z0,O=(xx,yy,zz)=>xx+onx*(yy+ony*zz);
  const c000=a[O(x0,y0,z0)],c100=a[O(x1,y0,z0)],c010=a[O(x0,y1,z0)],c110=a[O(x1,y1,z0)],c001=a[O(x0,y0,z1)],c101=a[O(x1,y0,z1)],c011=a[O(x0,y1,z1)],c111=a[O(x1,y1,z1)];
  const c00=c000+(c100-c000)*fx,c10=c010+(c110-c010)*fx,c01=c001+(c101-c001)*fx,c11=c011+(c111-c011)*fx,c0=c00+(c10-c00)*fy,c1=c01+(c11-c01)*fy;return c0+(c1-c0)*fz;
}
function resizeDomainPreserve(g,d){
  const onx=nx,ony=ny,onz=nz,od=domain.slice(),odx=dx,ody=dy,odz=dz,old={u,v,w,smoke,vapor,temp,oxygen};
  nx=g[0]|0;ny=g[1]|0;nz=g[2]|0;N=nx*ny*nz;domain=d.map(Number);updateSpacing();alloc();
  const ohx=od[0]*.5,ohz=od[2]*.5,centerShiftY=(domain[1]-od[1])*.5;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
    const i=I(x,y,z),p=worldAt(x,y,z),opx=p[0],opy=p[1]-centerShiftY,opz=p[2];if(opx<=-ohx||opx>=ohx||opy<=0||opy>=od[1]||opz<=-ohz||opz>=ohz)continue;
    const gx=(opx+ohx)/odx-.5,gy=opy/ody-.5,gz=(opz+ohz)/odz-.5;
    u[i]=sampleOldGrid(old.u,gx,gy,gz,onx,ony,onz);v[i]=sampleOldGrid(old.v,gx,gy,gz,onx,ony,onz);w[i]=sampleOldGrid(old.w,gx,gy,gz,onx,ony,onz);smoke[i]=sampleOldGrid(old.smoke,gx,gy,gz,onx,ony,onz);vapor[i]=sampleOldGrid(old.vapor,gx,gy,gz,onx,ony,onz);temp[i]=sampleOldGrid(old.temp,gx,gy,gz,onx,ony,onz);oxygen[i]=sampleOldGrid(old.oxygen,gx,gy,gz,onx,ony,onz);
  }
  pressure.fill(0);pressure2.fill(0);divergence.fill(0);rebuildSolids();rebuildSourceCaches();enforceSolids();lastProjection=project(Math.max(8,Math.min(config.pressureIters,18)));clampVelocity();publish(true);
}


function shiftXZ(sx,sz){
  sx=sx|0;sz=sz|0;if(!sx&&!sz)return;
  const specs=[[u,0],[v,0],[w,0],[smoke,0],[vapor,0],[temp,config.ambientC],[oxygen,1]];
  for(const spec of specs){const a=spec[0],fill=spec[1],old=a.slice();a.fill(fill);for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const ox=x+sx,oz=z+sz;if(ox<1||ox>=nx-1||oz<1||oz>=nz-1)continue;a[I(x,y,z)]=old[I(ox,y,oz)];}}
  pressure.fill(0);pressure2.fill(0);divergence.fill(0);rebuildSolids();rebuildSourceCaches();enforceSolids();clampVelocity();publish(true);
}
function reconfigureGrid(g,d){nx=g[0]|0;ny=g[1]|0;nz=g[2]|0;N=nx*ny*nz;domain=d&&d.length===3?d.map(Number):domain;updateSpacing();alloc();reset();}
function patchObject(target,patch){for(const k of Object.keys(patch||{})){const v0=patch[k];if(Array.isArray(v0))target[k]=v0.map(Number);else target[k]=v0;}}
function loop(now){if(initialized&&running){step();tick++;publishEvery=clamp(config.publishEvery|0,1,12);if(tick%publishEvery===0)publish();}if(now-lastRateT>=1000){solverHz=(steps-lastRateSteps)*1000/Math.max(now-lastRateT,1);lastRateSteps=steps;lastRateT=now;}setTimeout(()=>loop(performance.now()),16);}
onmessage=e=>{const m=e.data||{};
  if(m.type==='init'){if(Array.isArray(m.grid))reconfigureGrid(m.grid,m.domain);else{alloc();reset();}initialized=true;running=m.running!==false;scene=m.scene||scene;sources=Array.isArray(m.sources)?m.sources:[];obstacles=Array.isArray(m.obstacles)?m.obstacles:[];if(m.config)Object.assign(config,m.config);rebuildSolids();reset();postMessage({type:'ready',grid:[nx,ny,nz],domain:domain.slice(),dt,scene});}
  else if(m.type==='volumeAck')publishInFlight=false;
  else if(m.type==='run')running=!!m.value;
  else if(m.type==='reset')reset();
  else if(m.type==='advance'){running=false;const n=clamp(m.steps|0,0,4000);for(let i=0;i<n;i++)step();publish();}
  else if(m.type==='resizeDomain'&&Array.isArray(m.grid)&&Array.isArray(m.domain))resizeDomainPreserve(m.grid,m.domain);
  else if(m.type==='shiftXZ')shiftXZ(m.sx||0,m.sz||0);
  else if(m.type==='grid'&&Array.isArray(m.grid))reconfigureGrid(m.grid,m.domain||domain);
  else if(m.type==='scene'){scene=m.scene||scene;if(Array.isArray(m.domain)&&m.domain.length===3){domain=m.domain.map(Number);updateSpacing();}if(Array.isArray(m.sources))sources=m.sources;if(Array.isArray(m.obstacles))obstacles=m.obstacles;if(m.config)Object.assign(config,m.config);rebuildSolids();reset();}
  else if(m.type==='config'){const vals=m.values||m.config||{};Object.assign(config,vals);if(Number.isFinite(vals.dt))dt=clamp(vals.dt,.006,.08);config.pressureIters=clamp(config.pressureIters|0,6,60);config.scalarQuality=clamp(config.scalarQuality|0,1,2);config.vorticity=clamp(config.vorticity,0,3);config.buoyancy=clamp(config.buoyancy,0,.02);config.windShear=clamp(config.windShear||0,-12,12);config.windVeer=clamp(config.windVeer||0,-360,360);config.turbulenceOctaves=clamp(config.turbulenceOctaves|0,1,4);config.turbulenceCascade=clamp(config.turbulenceCascade,.18,.88);config.combustionFlicker=clamp(config.combustionFlicker,0,1.5);config.publishEvery=clamp(config.publishEvery|0,1,12);config.maxSpeed=clamp(config.maxSpeed,4,60);config.hcLEL=clamp(config.hcLEL,.002,.06);config.hcUEL=clamp(config.hcUEL,config.hcLEL+.002,.16);config.hcAutoignitionC=clamp(config.hcAutoignitionC,180,900);config.hcBurnRate=clamp(config.hcBurnRate,.1,12);config.hcExpansion=clamp(config.hcExpansion,0,3);config.hcVaporWeight=clamp(config.hcVaporWeight,0,2);config.scalarDiffusivity=clamp(config.scalarDiffusivity||0,0,.8);config.thermalDiffusivity=clamp(config.thermalDiffusivity||0,0,.8);config.smokeLifetime=clamp(config.smokeLifetime||30,.25,240);config.vaporLifetime=clamp(config.vaporLifetime||30,.25,240);config.targetCarrierMean=clamp(config.targetCarrierMean||.1,.001,2.2);config.balanceResponse=clamp(config.balanceResponse||0,0,3);config.maxBalanceScale=clamp(config.maxBalanceScale||4,1,48);config.wallPush=clamp(config.wallPush||0,0,4);config.wallBand=clamp(config.wallBand||.25,.04,.49);config.wallDamping=clamp(config.wallDamping||0,0,12);config.centerReturn=clamp(config.centerReturn||0,0,2);config.wallRecirculation=clamp(config.wallRecirculation||0,0,4);config.balanceIntegralGain=clamp(config.balanceIntegralGain||.12,0,1);}
  else if(m.type==='sources'&&Array.isArray(m.sources)){sources=m.sources;rebuildSourceCaches();}
  else if(m.type==='obstacles'&&Array.isArray(m.obstacles)){obstacles=m.obstacles;rebuildSolids();}
  else if(m.type==='sourcePatch'){const s=sources.find(x=>x.id===m.id);if(s){patchObject(s,m.patch||{});rebuildSourceCaches();}}
  else if(m.type==='obstaclePatch'){const o=obstacles.find(x=>x.id===m.id);if(o){patchObject(o,m.patch||{});rebuildSolids();}}
  else if(m.type==='burst'){const s=sources.find(x=>x.id===m.id)||sources[0];if(s){const oldPulse=s.pulse;s.pulse=2.5;for(let i=0;i<10;i++){injectSources();combustion();}s.pulse=oldPulse;publish();}}
  else if(m.type==='probe'&&Array.isArray(m.pos)){const g=gridAt(m.pos),x=clamp(Math.round(g[0]),0,nx-1),y=clamp(Math.round(g[1]),0,ny-1),z=clamp(Math.round(g[2]),0,nz-1),i=I(x,y,z);postMessage({type:'probe',pos:m.pos,cell:[x,y,z],values:{smoke:smoke[i],vapor:vapor[i],temperatureC:temp[i],fuel:fuel[i],hydrocarbonVolPct:hc[i]*100,flammability:flammability[i],reaction:reaction[i],oxygen:oxygen[i],emission:emit[i],velocity:[u[i],v[i],w[i]],vorticity:vort[i],divergence:divergence[i],solid:!!solid[i]}});}
};
lastRateT=performance.now();loop(lastRateT);

// LUCID MOTO core · NIMBUS volumetric tire smoke (port of "Ducati 916 NIMBUS VOLUMETRICS
// REBUILD R0" from the V85.10 "Burnout + Rider Contact" build)
// ------------------------------------------------------------------------------------------
// Consolidated from the VOLUMETRICS build (V84 physics / V85-V86 renderer lineage). The Eulerian
// carrier solver (src/core/nimbus/nimbus_worker.js) is carried over verbatim and runs in a Web
// Worker: 32 x 26 x 60 cells over a 4.8 x 3.5 x 10.2 m box that follows the rear wheel, with
// advection, buoyancy, vorticity confinement, turbulence cascade, thermal transport and pressure
// projection. The renderer raymarches that field through baked Perlin-Worley / Worley noise with
// flow-advected detail, Mie + Henyey-Greenstein phase, light-marched self shadowing, multiple
// scattering and powder terms, at reduced resolution, depth-terminated against a depth pre-pass
// of the bike, tires and rider, then composited into the frame.
//
// Host adaptation for this build (V5.6.7 multibody + RTT tire):
//   * sources come from the RTT contact: sliding power (W), slip, contact point and wheel frame,
//     and the V1.26 tread surface temperature -> flash-temperature / hot-coverage / rubber
//     precursor state (the V85 tire telemetry the original read does not exist here)
//   * burnout staging = stationary bike with a spinning rear wheel; rolling burnouts and
//     lock-ups use the contact jets; a hot tread keeps off-gassing radially after the slide
//   * scene shadow map / environment cube of the V86 pipeline are replaced by the world sky
//   * the solver is locked to simulation time: the host advances it in fixed 0.03 s steps of sim
//     time (worker "advance"), so the smoke pauses, slows and speeds up with the simulation, and a
//     scripted run can queue its whole history deterministically (simTick + sync)
// Only the rear tire is simulated (as in R0); the particle layer keeps front-tire smoke.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_NIMBUS__) return;
  const CORE = global.LUCID_CORE, gl = global.__LAB_GL__;
  if (!CORE || !gl || typeof free === "undefined" || typeof Worker === "undefined") {
    console.warn("LUCID NIMBUS: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_NIMBUS__ = true;
  const WORKER_SRC = /*@@NIMBUS_WORKER@@*/;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), sat = (x) => clamp(x, 0, 1);

  const N = (CORE.nimbus = {
    schema: "lucid.core.nimbus-tire-smoke.v1 (port of ducati916.nimbus-volumetrics-rebuild-r1-carrier-steer-calibrated)",
    enabled: true, ready: false, error: null, grid: [32, 26, 60], domain: [4.8, 3.5, 10.2], anchor: [0, 0], roadZ: 0,
    worker: null, workerReady: false, fieldReady: false, metrics: null, updates: 0, lastSourceSimT: -1e9, prevWheel: null,
    frame: 0, renderScale: 0.34, raySteps: 30, lightSteps: 5, depthCadence: 2, depthFrame: -1, maxSpeed: 12,
    solverDt: 0.03, acc: 0, pending: false, pendingT: 0, externalClock: false, probeCount: 0, lastProbe: null, stepsQueued: 0,
    // R0 look-dev values, except: smoke persistence 13 -> 24 s (95 % life; dense rubber smoke
    // lingers and fades by dilution), source gains x2.2 (R0's worker free-ran at ~1.4-1.8x real
    // time on a desktop; this one is sim-time locked) and treadDrag (rotation-driven carrier).
    settings: { smokeHalfLifeS: 24.0, diffusivityM2S: 0.0065, thermalCoolingPerS: 0.03, buoyancy: 0.0028, vorticity: 2.55, turbulenceAccel: 0.72, turbulenceScale: 0.72, contactGain: 2.2, offgasGain: 2.2, treadDrag: 0.11, extinction: 9.6, albedo: 0.92, dropletUm: 8.5, detail: 0.62, billow: 0.72, curl: 0.58, undercut: 0.22, ambient: 1.0, multiScatter: 0.82, coreDark: 0.68 },
    thermal: { hot: 0, coverage: 0, precursorKg: 0, flashK: 293 }, sourceMode: "none", sourceBreakdown: { contact: 0, offgas: 0 }, sourceMassProxy: 0,
    cpuMs: 0,
  });

  // ------------------------------------------------------------------ shaders (NIMBUS R0, adapted)
  const FS_VS = "#version 300 es\nout vec2 vUv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}";
  const NOISE_FS = `#version 300 es
precision highp float;
uniform float uSlice;uniform float uSize;uniform int uMode;out vec4 outColor;
vec3 hash33(vec3 p,float period){p=mod(p,vec3(period));p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yzz)*p.zyx);}
float pnoise(vec3 x,float period){vec3 i=floor(x),f=fract(x);vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
 vec3 g000=hash33(i+vec3(0,0,0),period)*2.0-1.0;vec3 g100=hash33(i+vec3(1,0,0),period)*2.0-1.0;vec3 g010=hash33(i+vec3(0,1,0),period)*2.0-1.0;vec3 g110=hash33(i+vec3(1,1,0),period)*2.0-1.0;
 vec3 g001=hash33(i+vec3(0,0,1),period)*2.0-1.0;vec3 g101=hash33(i+vec3(1,0,1),period)*2.0-1.0;vec3 g011=hash33(i+vec3(0,1,1),period)*2.0-1.0;vec3 g111=hash33(i+vec3(1,1,1),period)*2.0-1.0;
 float n000=dot(g000,f-vec3(0,0,0)),n100=dot(g100,f-vec3(1,0,0)),n010=dot(g010,f-vec3(0,1,0)),n110=dot(g110,f-vec3(1,1,0));
 float n001=dot(g001,f-vec3(0,0,1)),n101=dot(g101,f-vec3(1,0,1)),n011=dot(g011,f-vec3(0,1,1)),n111=dot(g111,f-vec3(1,1,1));
 float nx00=mix(n000,n100,u.x),nx10=mix(n010,n110,u.x),nx01=mix(n001,n101,u.x),nx11=mix(n011,n111,u.x);
 return mix(mix(nx00,nx10,u.y),mix(nx01,nx11,u.y),u.z)*0.5+0.5;}
float worley(vec3 p,float cells){p*=cells;vec3 ip=floor(p),fp=fract(p);float d=1e9;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 g=vec3(float(x),float(y),float(z));vec3 o=hash33(mod(ip+g,vec3(cells)),cells);vec3 r=g+o-fp;d=min(d,dot(r,r));}
 return 1.0-clamp(sqrt(d),0.0,1.0);}
float worleyFBM(vec3 p,float f){return worley(p,f)*0.625+worley(p,f*2.0)*0.25+worley(p,f*4.0)*0.125;}
float perlinFBM(vec3 p,float cells){float f=pnoise(p*cells,cells)*0.55;f+=pnoise(p*cells*2.0,cells*2.0)*0.30;f+=pnoise(p*cells*4.0,cells*4.0)*0.15;return f;}
float remap(float v,float a,float b,float c,float d){return c+(clamp(v,a,b)-a)*(d-c)/max(1e-5,(b-a));}
void main(){vec3 uvw=vec3(gl_FragCoord.xy/vec2(uSize),uSlice);
 if(uMode==0){float perlin=perlinFBM(uvw,4.0);float wLow=worleyFBM(uvw,4.0);float pw=remap(perlin,wLow-1.0,1.0,0.0,1.0);outColor=vec4(clamp(pw,0.0,1.0),worleyFBM(uvw,4.0),worleyFBM(uvw,6.0),worleyFBM(uvw,9.0));}
 else{outColor=vec4(worleyFBM(uvw,2.0),worley(uvw,5.0),worley(uvw,8.0),1.0);}}`;
  const VOL_FS = `#version 300 es
precision highp float;precision highp sampler3D;
in vec2 vUv;out vec4 o;
uniform sampler3D uField,uVel,uDriver,uGrad,uShape,uDetailTex;uniform sampler2D uDepth;
uniform mat4 uInvVP;uniform vec3 uCam,uSun,uSunColor,uAmbTop,uAmbBot,uCenterRoad,uDomain,uTireCenter,uSkyZen,uSkyHor;
uniform float uTime,uSigma,uAlb,uDroplet,uDetail,uBillow,uCurl,uUndercut,uAmbient,uMS,uCoreDark,uMaxSpeed;uniform int uRaySteps,uLightSteps;
const float PI=3.14159265359;float sat(float x){return clamp(x,0.,1.);}float remap(float v,float a,float b,float c,float d){return c+(clamp(v,a,b)-a)*(d-c)/max(1e-5,b-a);}
float hg(float mu,float g){float g2=g*g;return(1.-g2)/(4.*PI*pow(max(1e-4,1.+g2-2.*g*mu),1.5));}
float draine(float mu,float g,float a){float g2=g*g,den=pow(max(1e-3,1.+g2-2.*g*mu),1.5);return((1.-g2)*(1.+a*mu*mu))/(4.*PI*den*(1.+a*(1.+2.*g2)/3.));}
float mie(float mu,float d){float gh=exp(-.0990567/(d-1.67154)),gd=exp(-2.20679/(d+3.91029)-.428934),a=exp(3.62489-8.29288/(d+5.52825)),w=exp(-.599085/(d-.641583)-.665888);return(1.-w)*hg(mu,gh)+w*draine(mu,gd,a);}
float phaseCloud(float mu){float f=mie(mu,uDroplet),back=hg(mu,-.22)*.72,broad=pow(sat(mu*.5+.5),2.0)*.13;return f+back+broad;}
vec3 unproject(vec2 uv,float d){vec4 q=uInvVP*vec4(uv*2.-1.,d*2.-1.,1.);return q.xyz/max(q.w,1e-6);}
vec2 boxHit(vec3 ro,vec3 rd,vec3 mn,vec3 mx){vec3 a=(mn-ro)/rd,b=(mx-ro)/rd,lo=min(a,b),hi=max(a,b);return vec2(max(max(lo.x,lo.y),lo.z),min(min(hi.x,hi.y),hi.z));}
vec3 uvw(vec3 p){return vec3((p.x-uCenterRoad.x)/uDomain.x+.5,(p.z-uCenterRoad.z)/uDomain.y,(p.y-uCenterRoad.y)/uDomain.z+.5);}
float supportAt(vec3 p){vec3 q=uvw(p);if(any(lessThan(q,vec3(0)))||any(greaterThan(q,vec3(1))))return 0.;return texture(uField,q).r*2.2;}
vec3 velWorld(vec3 p){vec3 q=uvw(p),v=(texture(uVel,q).rgb*2.-1.)*uMaxSpeed;return vec3(v.x,v.z,v.y);}
vec4 gradAt(vec3 p){vec4 g=texture(uGrad,uvw(p));return vec4(g.rgb*2.-1.,g.a);}
vec3 envSample(vec3 d){d=normalize(d);float t=clamp(d.z,-.25,1.);vec3 c=mix(uSkyHor,uSkyZen,pow(max(t,0.),.55));return mix(c,uAmbBot*1.6,smoothstep(0.,-.25,t));}
float cloudD(vec3 p,bool cheap){float spt=supportAt(p);if(spt<.002)return 0.;vec3 vw=velWorld(p),rel=p-uTireCenter;float dist=length(rel),far=smoothstep(1.1,4.6,dist),mid=smoothstep(.35,2.2,dist)*(1.-far);
 float ageA=fract(uTime/1.47),ageB=fract(ageA+.5),wa=1.-abs(ageA*2.-1.),wb=1.-abs(ageB*2.-1.),ws=max(wa+wb,.001);vec3 pa=p-vw*(ageA*1.10),pb=p-vw*(ageB*1.10);
 float shapeScale=mix(1./.72,1./1.55,far),lod=mix(.35,2.15,far);vec4 A=textureLod(uShape,fract((pa-uTireCenter)*shapeScale+vec3(.17,.31,.09)),lod),B=textureLod(uShape,fract((pb-uTireCenter)*shapeScale+vec3(.63,.13,.47)),lod);
 vec4 sh=(A*wa+B*wb)/ws;float low=sh.g*.625+sh.b*.25+sh.a*.125,base=sat(remap(sh.r,low-1.,1.,0.,1.));float steer=sat(remap(spt,.010,.30,0.,1.));float cov=sat(steer*.70+sqrt(max(steer,0.))*.34);
 float d=sat(remap(base,1.-cov,1.,0.,1.));d*=smoothstep(.003,.018,spt)*mix(.72,1.18,steer);d=sat(d);float shell=smoothstep(.035,.25,d)*(1.-smoothstep(.62,.94,d));
 if(!cheap&&d>.001){float detScale=mix(1./.18,1./.62,far),dlod=mix(.15,2.3,far);vec3 da=fract((pa-uTireCenter)*detScale+vec3(.21,.53,.11)),db=fract((pb-uTireCenter)*detScale+vec3(.73,.19,.61));
  vec3 dt=(textureLod(uDetailTex,da,dlod).rgb*wa+textureLod(uDetailTex,db,dlod).rgb*wb)/ws;float cauli=dt.r*.52+dt.g*.30+dt.b*.18;vec4 gg=gradAt(p);float edge=sat(gg.a*2.8),drv=texture(uDriver,uvw(p)).b;
  float erosion=(1.-cauli)*uDetail*(.10+.27*edge+.07*drv);float bill=(sh.g-.5)*uBillow*(.12+.16*mid+.10*far);d=sat(d-erosion*shell+bill*shell);
  float under=1.-uUndercut*smoothstep(0.,.20,rel.z+.18)*(1.-smoothstep(.20,.58,rel.z+.18));d*=under;}
 return d;}
float lightOD(vec3 p,float ds){float od=0.;vec3 q=p;for(int i=0;i<7;i++){if(i>=uLightSteps)break;float g=1.+float(i)*.42;q+=uSun*ds*g;od+=cloudD(q,true)*ds*g;}return od*uSigma*.17;}
vec3 lighting(vec3 p,vec3 rd,float d,float sigma){float od=lightOD(p,max(.10,uDomain.x/42.)),sunT=exp(-od),mu=dot(rd,uSun),ph=phaseCloud(mu);vec4 gg=gradAt(p);
 vec3 gn=normalize(vec3(gg.x,gg.z,gg.y)+vec3(0,0,.04));float edge=sat(gg.a*2.3),powder=1.-exp(-d*4.8),deep=(1.-edge*.65)*d;sunT=pow(max(.002,sunT),1.+uCoreDark*deep*1.9);
 float skyFace=.35+.65*sat(gn.z*.5+.5),groundFace=.28+.72*sat(-gn.z*.5+.5);vec3 env=envSample(normalize(gn+vec3(0,0,.16)));
 vec3 sky=(uAmbTop*.82+env*.24)*skyFace*uAmbient,ground=uAmbBot*.58*groundFace*uAmbient;vec3 direct=uSunColor*sunT*(ph*.56+.012);
 vec3 multi=(sky+ground+direct*.07)*powder*uMS*(.10+.22*(1.-sunT));float silver=pow(sat(mu),6.)*sunT*edge;vec3 L=sky+ground+direct+multi+uSunColor*silver*.28;
 float cavity=(1.-sunT)*deep*.32*uCoreDark;return L*(1.-cavity);}
void main(){vec3 farW=unproject(vUv,1.),rd=normalize(farW-uCam),mn=vec3(uCenterRoad.x-uDomain.x*.5,uCenterRoad.y-uDomain.z*.5,uCenterRoad.z),mx=vec3(uCenterRoad.x+uDomain.x*.5,uCenterRoad.y+uDomain.z*.5,uCenterRoad.z+uDomain.y);
 vec2 bh=boxHit(uCam,rd,mn,mx);float t=max(0.,bh.x),end=bh.y;if(end<=t){o=vec4(0);return;}
 if(rd.z<-.0001){float tg=(uCenterRoad.z+.004-uCam.z)/rd.z;if(tg>0.)end=min(end,tg-.004);}
 float dz=texture(uDepth,vUv).r;if(dz<.999999){vec3 hp=unproject(vUv,dz);end=min(end,length(hp-uCam)-.010);}if(end<=t){o=vec4(0);return;}
 float stepL=max((end-t)/float(max(uRaySteps,1)),.025),T=1.;vec3 acc=vec3(0);
 for(int i=0;i<56;i++){if(i>=uRaySteps||t>=end||T<.012)break;vec3 p=uCam+rd*(t+stepL*.5);float s=supportAt(p);if(s<.0015){t+=stepL*2.0;continue;}
  float d=cloudD(p,false);if(d<.001){t+=stepL;continue;}float sigma=uSigma*d,alpha=1.-exp(-sigma*stepL);vec3 L=lighting(p,rd,d,sigma),aerosol=mix(vec3(.975,.978,.982),vec3(.84,.85,.865),sat(d*.30));
  acc+=T*aerosol*uAlb*L*alpha;T*=1.-alpha;t+=stepL;}
 // match the world's tone mapping (ACES + gamma) so the smoke sits in the same exposure
 vec3 c=acc/max(1.-T,1e-4);c=clamp((c*1.18*(2.51*c*1.18+.03))/(c*1.18*(2.43*c*1.18+.59)+.14),0.,1.);c=pow(c,vec3(1./2.2));
 o=vec4(c*(1.-T),1.-T);}`;
  const BLIT_FS = "#version 300 es\nprecision highp float;in vec2 vUv;out vec4 o;uniform sampler2D uT;void main(){o=texture(uT,vUv);}";
  const DEPTH_VS = "#version 300 es\nlayout(location=0) in vec3 p;uniform mat4 uVP,uModel;void main(){gl_Position=uVP*uModel*vec4(p,1.);}";
  const DEPTH_FS = "#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(1);}";

  // ------------------------------------------------------------------ GL helpers
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  function link(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    return p;
  }
  function tex3D(w, h, d) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, w, h, d, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
    return t;
  }
  function bakeNoise() {
    const p = link(FS_VS, NOISE_FS), vao = gl.createVertexArray();
    const bake = (size, mode) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.REPEAT], [gl.TEXTURE_WRAP_R, gl.REPEAT], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.viewport(0, 0, size, size);
      gl.useProgram(p);
      gl.bindVertexArray(vao);
      gl.uniform1f(gl.getUniformLocation(p, "uSize"), size);
      gl.uniform1i(gl.getUniformLocation(p, "uMode"), mode);
      const us = gl.getUniformLocation(p, "uSlice");
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      for (let z = 0; z < size; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, z);
        gl.uniform1f(us, (z + 0.5) / size);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.generateMipmap(gl.TEXTURE_3D);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(f);
      return t;
    };
    N.shape = bake(64, 0);
    N.detailTex = bake(32, 1);
    gl.deleteProgram(p);
    gl.deleteVertexArray(vao);
    gl.bindVertexArray(null);
  }
  function allocRender() {
    const c = gl.canvas, w = Math.max(4, Math.floor(c.width * N.renderScale)), h = Math.max(4, Math.floor(c.height * N.renderScale));
    if (N.rw === w && N.rh === h) return;
    N.rw = w;
    N.rh = h;
    if (!N.colorTex) N.colorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, N.colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (!N.fbo) N.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, N.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, N.colorTex, 0);
    if (!N.depthTex) N.depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, N.depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (!N.depthFbo) N.depthFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, N.depthFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, N.depthTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // depth pre-pass of the legacy scene objects (bike groups, deformed tires, skinned rider)
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let riderCount = 0;
  function renderDepth(vp) {
    if (N.depthFrame === N.frame) return;
    allocRender();
    gl.bindFramebuffer(gl.FRAMEBUFFER, N.depthFbo);
    gl.viewport(0, 0, N.rw, N.rh);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(N.depthProg);
    const uVP = gl.getUniformLocation(N.depthProg, "uVP"), uM = gl.getUniformLocation(N.depthProg, "uModel");
    gl.uniformMatrix4fv(uVP, false, vp);
    try {
      const V = typeof v5JointVisuals === "function" ? v5JointVisuals() : null;
      if (V && typeof drawables !== "undefined" && typeof groupModelFree === "function")
        for (const d0 of drawables) {
          gl.uniformMatrix4fv(uM, false, groupModelFree(d0.ni, V));
          gl.bindVertexArray(d0.vao);
          d0.indexed ? gl.drawElements(d0.mode, d0.count, d0.type, 0) : gl.drawArrays(d0.mode, 0, d0.count);
        }
      gl.uniformMatrix4fv(uM, false, IDENT);
      for (const tb of [typeof tBF !== "undefined" ? tBF : null, typeof tBR !== "undefined" ? tBR : null]) {
        if (!tb?.vao) continue;
        gl.bindVertexArray(tb.vao);
        gl.drawElements(gl.TRIANGLES, tb.count, gl.UNSIGNED_INT, 0);
      }
      // the physical LUCID rider (47_rider_render): her posed skin, world coordinates
      const RR = CORE.riderRender, BIO = CORE.riderBio;
      if (RR?.gpu && RR.visible && BIO?.active && BIO.placed) {
        gl.uniformMatrix4fv(uM, false, IDENT);
        gl.bindVertexArray(RR.gpu.vao);
        gl.drawElements(gl.TRIANGLES, RR.gpu.count, gl.UNSIGNED_INT, 0);
      }
      const rt = global.LUCID_RIDER_CONTROL_V12853?.runtime;
      if (rt?.vao && rt.visible !== false && V?.B) {
        gl.bindVertexArray(rt.vao);
        if (!riderCount) riderCount = (gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE) || 0) / 4;
        gl.uniformMatrix4fv(uM, false, V.B);
        if (riderCount) gl.drawElements(gl.TRIANGLES, riderCount, gl.UNSIGNED_INT, 0);
      }
    } catch (e) {
      N.depthError = String(e);
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    N.depthFrame = N.frame;
  }

  // ------------------------------------------------------------------ physics -> sources
  function tireFrame() {
    const F = free, RK = F.RK || F._rearKinematics(), fw = v5qrot(F.q, V5_Y), f = v5norm([fw[0], fw[1], 0]);
    return { c: RK.hubW.slice(), f, side: [-f[1], f[0], 0], rear: [-f[0], -f[1], 0], R: CORE.tires?.rear?.out?.effectiveRadiusM || 0.31 };
  }
  const worldToLocal = (p) => [p[0] - N.anchor[0], p[2] - N.roadZ, p[1] - N.anchor[1]];
  const velToLocal = (v) => [v[0], v[2], v[1]];
  const roadAt = (x, y) => CORE.realtime?.road?.height?.(x, y) || 0;
  function initAnchor(F) {
    N.roadZ = roadAt(F.c[0], F.c[1]);
    N.anchor = [F.c[0] + F.rear[0] * 2.25, F.c[1] + F.rear[1] * 2.25];
    N.prevWheel = F.c.slice();
  }
  function maybeRecenter(F) {
    if (!N.workerReady) return;
    const desired = [F.c[0] + F.rear[0] * 2.25, F.c[1] + F.rear[1] * 2.25], dx = N.domain[0] / N.grid[0], dz = N.domain[2] / N.grid[2];
    const ddx = desired[0] - N.anchor[0], ddz = desired[1] - N.anchor[1];
    if (Math.abs(ddx) < dx * 4 && Math.abs(ddz) < dz * 4) return;
    const sx = Math.round(ddx / dx), sz = Math.round(ddz / dz);
    if (!sx && !sz) return;
    N.anchor[0] += sx * dx;
    N.anchor[1] += sz * dz;
    N.roadZ = roadAt(N.anchor[0], N.anchor[1]);
    N.worker.postMessage({ type: "shiftXZ", sx, sz });
    N.prevWheel = F.c.slice();
  }
  // Tread thermal state for the rear tire from this build's physics (replaces V85 telemetry):
  // flash temperature ~ bulk surface temperature + sqrt(sliding power) term, rubber vapour
  // precursor from the sliding energy, hot tread coverage growing while it keeps spinning.
  function thermalUpdate(dt) {
    const o = CORE.tires?.rear?.out;
    if (!o) return;
    const power = Math.max(0, o.slidingPowerW || 0), fb = global.LUCID_BRAKE_TIRE_FEEDBACK?.state?.tires?.rear;
    const surfC = +(fb?.localSurfaceC ?? fb?.surfaceC ?? 30) || 30, flashK = surfC + 273.15 + 1.18 * Math.sqrt(power);
    const heatNow = sat((flashK - 330) / 430), fric = sat((power - 700) / 32000), burn = fric * 0.7 + heatNow * 0.3, T = N.thermal;
    T.hot = burn > T.hot ? burn : T.hot * Math.exp(-dt / 5.2);
    T.coverage = Math.max(T.coverage * Math.exp(-dt / 7.5), Math.min(1, T.coverage + dt * fric * 0.45));
    T.precursorKg = Math.min(0.006, T.precursorKg + power * 1e-8 * dt * 0.82) * Math.exp(-dt / (4.8 + 3.0 * (1 - T.hot)));
    T.flashK = flashK;
    T.power = power;
  }
  function sourceUpdate(F) {
    if (!N.workerReady) return;
    maybeRecenter(F);
    const t = free.time;
    if (t - N.lastSourceSimT < 0.075 && t >= N.lastSourceSimT) return;
    N.lastSourceSimT = t;
    const o = CORE.tires?.rear?.out || {}, power = Math.max(0, o.slidingPowerW || 0), fric = sat((power - 700) / 30000);
    // pyrolysis yield keeps rising past R0's 30 kW saturation (a 916 burnout slides ~40-45 kW)
    const yieldK = 1 + 0.6 * sat((power - 30000) / 40000);
    const fw = F.f, u = v5dot(free.v, [fw[0], fw[1], 0]), wheelV = (free.omegaR || 0) * F.R;
    const staged = Math.abs(u) < 1.3 && wheelV > 5 && (o.contact ?? true), moving = Math.abs(u) > 1.3, kap = o.kappa || 0;
    const hot = sat(0.55 * N.thermal.hot + 0.45 * N.thermal.coverage), src = [];
    let nc = 0, no = 0;
    const prev = N.prevWheel || F.c, dist = Math.hypot(F.c[0] - prev[0], F.c[1] - prev[1]), segN = clamp(Math.ceil(dist / 0.16) + 1, 1, 7), centers = [];
    for (let k = 0; k < segN; k++) {
      const a = segN === 1 ? 1 : k / (segN - 1);
      centers.push([prev[0] + (F.c[0] - prev[0]) * a, prev[1] + (F.c[1] - prev[1]) * a, prev[2] + (F.c[2] - prev[2]) * a]);
    }
    N.prevWheel = F.c.slice();
    const contactDrive = staged ? Math.max(0.24, fric) : fric;
    if (contactDrive > 0.025 && o.contact !== false) {
      const jetRear = 0.65 + 1.85 * contactDrive + (staged ? 0.45 : 0), jetUp = 0.1 + 0.16 * contactDrive;
      for (const c0 of centers)
        for (const ls of [-0.055, 0, 0.055]) {
          const p = [c0[0] + F.side[0] * ls, c0[1] + F.side[1] * ls, N.roadZ + 0.018], j = [F.rear[0] * jetRear, F.rear[1] * jetRear, jetUp];
          const rate = ((staged ? 4.6 : 3.2) * contactDrive * yieldK * N.settings.contactGain) / centers.length;
          src.push({ id: "c" + nc++, enabled: true, pos: worldToLocal(p), radius: 0.105, carrierRate: rate, rateScale: 1, steamFraction: 0, heat: 70 + 120 * contactDrive, jet: velToLocal(j), jetInlet: 0.36, pulse: 0.18, pulseHz: 2.1 + (nc % 3) * 0.31, phase: nc * 0.71, dispersion: 0.1 });
        }
    }
    const radialDrive = staged ? Math.max(0.18, hot) : moving && kap > 0.1 && fric > 0.08 ? hot * 0.48 : moving ? hot * 0.72 : hot * 0.22;
    if (radialDrive > 0.025 && N.thermal.precursorKg > 2e-7) {
      // the spinning tread drags its boundary layer round with it: forward over the top of the
      // tire (towards the swingarm and rider), rearward under it -> the smoke wraps the wheel
      const slots = 12, baseRate = (staged ? 1.75 : 1.15) * radialDrive * yieldK * N.settings.offgasGain;
      const vt = clamp((free.omegaR || 0) * F.R - u, -30, 30) * N.settings.treadDrag;
      for (let i = 0; i < slots; i++) {
        const th = (2 * Math.PI * i) / slots - Math.PI / 2, sn = Math.sin(th), cs = Math.cos(th), rad = [F.f[0] * cs, F.f[1] * cs, sn];
        const lower = 0.5 * (1 - sn), rear = 0.5 * (1 - cs), w = 0.24 + 0.32 * lower + 0.22 * rear + 0.28 * lower * rear;
        const p = [F.c[0] + rad[0] * (F.R + 0.008), F.c[1] + rad[1] * (F.R + 0.008), Math.max(N.roadZ + 0.016, F.c[2] + rad[2] * (F.R + 0.008))];
        const tg = [F.f[0] * sn, F.f[1] * sn, -cs]; // tread velocity direction at this slot (forward rotation)
        const j = [F.rear[0] * (0.08 + 0.08 * lower) + rad[0] * 0.055 + tg[0] * vt, F.rear[1] * (0.08 + 0.08 * lower) + rad[1] * 0.055 + tg[1] * vt, 0.055 + 0.09 * Math.max(0, sn) + 0.035 * lower + tg[2] * vt];
        src.push({ id: "r" + i, enabled: true, pos: worldToLocal(p), radius: 0.092, carrierRate: baseRate * w, rateScale: 1, steamFraction: 0, heat: 45 + 95 * radialDrive, jet: velToLocal(j), jetInlet: 0.12, pulse: 0.12, pulseHz: 0.75 + (i % 4) * 0.11, phase: i * 1.93, dispersion: 0.055 });
        no++;
      }
    }
    N.sourceMode = staged ? "burnoutHybrid" : contactDrive > 0.025 ? (kap > 0 ? "rollingBurnoutHybrid" : "contactPatch") : radialDrive > 0.025 ? "coolingRadial" : "none";
    N.sourceBreakdown = { contact: nc, offgas: no };
    N.sourceMassProxy = src.reduce((a, s) => a + s.carrierRate, 0);
    N.worker.postMessage({ type: "config", values: workerConfig() });
    N.worker.postMessage({ type: "sources", sources: src });
  }
  // Advance the solver by sim time. Live play keeps one advance in flight (the next goes out when
  // its field arrives); a scripted caller (queue) posts every step and syncs once at the end.
  function advance(dt, queue) {
    N.acc = Math.min(N.acc + dt, queue ? 1e9 : 0.3);
    if (!queue && N.pending && performance.now() - N.pendingT < 800) return;
    const n = Math.floor(N.acc / N.solverDt + 1e-9);
    if (n < 1) return;
    const steps = queue ? n : Math.min(n, 8);
    N.acc = queue ? N.acc - n * N.solverDt : 0;
    N.worker.postMessage({ type: "advance", steps });
    N.stepsQueued += steps;
    N.pending = true;
    N.pendingT = performance.now();
  }
  function workerConfig() {
    const S = N.settings;
    return {
      dt: N.solverDt, physicsProfile: "steam", smokeLifetime: S.smokeHalfLifeS, scalarDiffusivity: S.diffusivityM2S, thermalDiffusivity: 0.018, thermalCooling: S.thermalCoolingPerS,
      buoyancy: S.buoyancy, vorticity: S.vorticity, turbulence: S.turbulenceAccel, turbulenceScale: S.turbulenceScale, turbulenceOctaves: 3, turbulenceCascade: 0.62, pressureIters: 12,
      scalarQuality: 2, velocityDissipation: 0.996, smokeWeight: 0.018, vaporWeight: 0, wind: velToLocal(CORE.fx?.windMps || [0, 0, 0]), windShear: 0, windVeer: 0, gust: 0,
      wallPush: 0.18, wallBand: 0.18, wallDamping: 1.2, centerReturn: 0.008, wallRecirculation: 0.08, autoBalance: 0, publishEvery: 3, maxSpeed: N.maxSpeed, ambientC: 20, minTempC: -20, maxTempC: 850,
    };
  }

  // ------------------------------------------------------------------ lifecycle + render
  function init() {
    if (N.ready) return;
    initAnchor(tireFrame());
    N.field = tex3D(...N.grid);
    N.vel = tex3D(...N.grid);
    N.driver = tex3D(...N.grid);
    N.grad = tex3D(...N.grid);
    bakeNoise();
    N.prog = link(FS_VS, VOL_FS);
    N.blit = link(FS_VS, BLIT_FS);
    N.depthProg = link(DEPTH_VS, DEPTH_FS);
    N.vao = gl.createVertexArray();
    N.uni = {};
    const nu = gl.getProgramParameter(N.prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const a = gl.getActiveUniform(N.prog, i);
      N.uni[a.name] = gl.getUniformLocation(N.prog, a.name);
    }
    N.worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
    N.worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "ready") N.workerReady = true;
      else if (m.type === "probe") { N.lastProbe = m; N.probeCount++; }
      else if (m.type === "volume") {
        const g = N.grid, up = (tex, data) => { gl.bindTexture(gl.TEXTURE_3D, tex); gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, g[0], g[1], g[2], gl.RGBA, gl.UNSIGNED_BYTE, data); };
        up(N.field, m.fieldsA);
        up(N.driver, m.fieldsC);
        up(N.vel, m.velocitySolid);
        up(N.grad, m.gradient);
        gl.bindTexture(gl.TEXTURE_3D, null);
        N.metrics = m.metrics;
        N.lastFieldsA = m.fieldsA; // kept for diagnose()
        N.fieldReady = true;
        N.updates++;
        N.pending = false;
        N.worker.postMessage({ type: "volumeAck" });
      }
    };
    N.worker.onerror = (e) => { N.error = "worker: " + (e.message || e); };
    // running:false -> the worker never free-runs on wall time; the host advances it (see advance)
    N.worker.postMessage({ type: "init", grid: N.grid, domain: N.domain, running: false, scene: "ducatiTireSmoke", sources: [], obstacles: [], config: workerConfig() });
    N.ready = true;
  }
  const SUN = (() => { const v = [-0.55, -0.38, 0.74], l = Math.hypot(...v); return v.map((x) => x / l); })();
  function inv4(a) {
    const o = new Float32Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5];
    const b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12];
    const b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return o;
  }
  function renderVolume(F) {
    if (!N.ready || !N.fieldReady) return;
    const vp = global.__VP__, eye = global.__EYE__;
    if (!vp || !eye) return;
    allocRender();
    if (N.frame % N.depthCadence === 0) renderDepth(vp);
    const inv = inv4(vp);
    if (!inv) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, N.fbo);
    gl.viewport(0, 0, N.rw, N.rh);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(N.prog);
    gl.bindVertexArray(N.vao);
    const U = N.uni, S = N.settings;
    gl.uniformMatrix4fv(U.uInvVP, false, inv);
    gl.uniform3fv(U.uCam, eye);
    gl.uniform3fv(U.uSun, SUN);
    gl.uniform3f(U.uSunColor, 1.22, 1.15, 1.03);
    gl.uniform3f(U.uAmbTop, 0.4, 0.45, 0.55);
    gl.uniform3f(U.uAmbBot, 0.14, 0.145, 0.155);
    gl.uniform3f(U.uSkyZen, 0.19, 0.35, 0.62);
    gl.uniform3f(U.uSkyHor, 0.6, 0.68, 0.74);
    gl.uniform3f(U.uCenterRoad, N.anchor[0], N.anchor[1], N.roadZ);
    gl.uniform3fv(U.uDomain, N.domain);
    gl.uniform3fv(U.uTireCenter, F.c);
    gl.uniform1f(U.uTime, free.time);
    gl.uniform1f(U.uSigma, S.extinction);
    gl.uniform1f(U.uAlb, S.albedo);
    gl.uniform1f(U.uDroplet, S.dropletUm);
    gl.uniform1f(U.uDetail, S.detail);
    gl.uniform1f(U.uBillow, S.billow);
    gl.uniform1f(U.uCurl, S.curl);
    gl.uniform1f(U.uUndercut, S.undercut);
    gl.uniform1f(U.uAmbient, S.ambient);
    gl.uniform1f(U.uMS, S.multiScatter);
    gl.uniform1f(U.uCoreDark, S.coreDark);
    gl.uniform1f(U.uMaxSpeed, N.maxSpeed);
    gl.uniform1i(U.uRaySteps, N.raySteps);
    gl.uniform1i(U.uLightSteps, N.lightSteps);
    const bind = (unit, target, tex, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, tex);
      gl.uniform1i(U[name], unit);
    };
    bind(0, gl.TEXTURE_3D, N.field, "uField");
    bind(1, gl.TEXTURE_3D, N.vel, "uVel");
    bind(2, gl.TEXTURE_3D, N.driver, "uDriver");
    bind(3, gl.TEXTURE_3D, N.grad, "uGrad");
    bind(4, gl.TEXTURE_3D, N.shape, "uShape");
    bind(5, gl.TEXTURE_3D, N.detailTex, "uDetailTex");
    bind(6, gl.TEXTURE_2D, N.depthTex, "uDepth");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // composite (premultiplied) into the frame
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.useProgram(N.blit);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, N.colorTex);
    gl.uniform1i(gl.getUniformLocation(N.blit, "uT"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    for (let u = 6; u >= 0; u--) {
      gl.activeTexture(gl.TEXTURE0 + u);
      gl.bindTexture(u === 6 ? gl.TEXTURE_2D : gl.TEXTURE_3D, null);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
  let lastSimT = null;
  function frame() {
    if (!N.enabled) return;
    const t0 = performance.now();
    try {
      if (!N.ready) init();
      const F = tireFrame(), simT = free.time;
      let dt = lastSimT === null ? 0 : simT - lastSimT;
      lastSimT = simT;
      if (dt < 0) N.reset(); // bike reset
      if (!N.externalClock && dt > 0 && dt < 0.5 && N.workerReady) {
        thermalUpdate(dt);
        sourceUpdate(F);
        advance(dt, false);
      }
      renderVolume(F);
      N.frame++;
    } catch (e) {
      N.error = String((e && e.stack) || e);
      console.error("LUCID NIMBUS", e);
      N.enabled = false;
    } finally {
      N.cpuMs = performance.now() - t0;
    }
  }
  // Scripted (synchronous) stepping: call once per effects tick with the sim time elapsed, with
  // externalClock set so the render loop does not step as well; then sync() and wait for
  // probeCount to reach the returned value before rendering.
  N.simTick = (dt) => {
    if (!N.enabled) return false;
    if (!N.ready) init();
    if (!N.workerReady) return false;
    thermalUpdate(dt);
    sourceUpdate(tireFrame());
    advance(dt, true);
    return true;
  };
  N.sync = () => {
    if (!N.worker) return N.probeCount;
    N.worker.postMessage({ type: "volumeAck" }); // after every queued advance: publish the last state
    N.worker.postMessage({ type: "advance", steps: 0 });
    N.worker.postMessage({ type: "probe", pos: [0, 0.2, 0] });
    return N.probeCount + 1;
  };
  // Side-view optical depth of the published field (same coverage mapping as the raymarch,
  // without the noise erosion): area that reads opaque (tau > 1) / visible (tau > 0.2).
  N.diagnose = () => {
    const A = N.lastFieldsA;
    if (!A) return null;
    const [nx, ny, nz] = N.grid, dx = N.domain[0] / nx, dy = N.domain[1] / ny, dz = N.domain[2] / nz, sig = N.settings.extinction;
    let opaque = 0, visible = 0, top = 0, maxS = 0, sum = 0;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++) {
        let tau = 0;
        for (let x = 0; x < nx; x++) {
          const sm = (A[4 * (x + nx * (y + ny * z))] / 255) * 2.2;
          if (sm > maxS) maxS = sm;
          sum += sm;
          tau += sig * sat((sm - 0.01) / 0.29) * dx;
        }
        if (tau > 1) { opaque += dy * dz; top = Math.max(top, (y + 1) * dy); }
        if (tau > 0.2) visible += dy * dz;
      }
    const r = (x) => +x.toFixed(3);
    return { sideOpaqueM2: r(opaque), sideVisibleM2: r(visible), opaqueTopM: r(top), maxSmoke: r(maxS), meanSmoke: r(sum / (nx * ny * nz)) };
  };
  N.reset = () => {
    N.thermal = { hot: 0, coverage: 0, precursorKg: 0, flashK: 293 };
    N.prevWheel = null;
    N.lastSourceSimT = -1e9;
    N.acc = 0;
    if (N.worker) N.worker.postMessage({ type: "reset" });
    if (N.ready) initAnchor(tireFrame());
  };
  N.snapshot = () => ({ schema: N.schema, ready: N.ready, error: N.error, workerReady: N.workerReady, fieldReady: N.fieldReady, anchor: N.anchor.slice(), roadZ: N.roadZ, metrics: N.metrics, sourceMode: N.sourceMode, sourceBreakdown: { ...N.sourceBreakdown }, sourceMassProxy: N.sourceMassProxy, thermal: { ...N.thermal }, updates: N.updates, stepsQueued: N.stepsQueued, cpuMs: N.cpuMs });
  CORE.renderHooks = CORE.renderHooks || [];
  const at = CORE.renderHooks.findIndex((h) => h.id === "fx");
  CORE.renderHooks.splice(at >= 0 ? at : CORE.renderHooks.length, 0, { id: "nimbus", draw: frame });
  if (CORE.fx) CORE.fx.rearSmokeByNimbus = true; // the particle layer keeps the front tire only
  global.__LUCID_CORE_NIMBUS_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);

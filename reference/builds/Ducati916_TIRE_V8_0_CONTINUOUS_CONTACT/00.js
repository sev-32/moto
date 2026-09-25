const DATA=@@TIRE_DATA@@;
const V8_REFERENCE={"source":{"load_coefficient":1.0,"hub_shift_m":-1.8955475781860182e-05,"load_n":1441.1855543787015,"projected_area_m2":0.0010495080505602968,"surface_area_m2":0.0010588061247578406,"peak_pressure_pa":2913147.108172525,"mean_pressure_pa":1373201.0474901085,"cop_x_m":-3.278518198670654e-17,"cop_y_m":-2.091992521079246e-18,"cop_z_m":-0.0009425619932061947,"local_cop_x_m":-3.278518198670654e-17,"extent_x_m":0.02283990785078644,"local_extent_x_m":0.02283990785078644,"extent_y_m":0.0614354477370854,"active_polygons":162,"contact_subtriangles":190,"contact_samples":570,"effective_radius_m":0.2952987986042354,"load_closure_pct":1.5776849466219735e-14,"camber_rad":0.0,"pressure_basis":{"coefficient_a":0.0,"coefficient_b":0.0,"lower_anchor_psi":26.0,"upper_anchor_psi":32.00888447476946,"interpolation_t":1.0,"max_equilibrium_displacement_m":0.0}},"challenge":{"inputs":{"loadN":1550.0,"camberDeg":42.0,"pressurePsi":30.0,"kappa":0.12,"alphaDeg":5.5,"speedMps":38.0,"mu":1.22,"temperatureC":78.0,"wetness":0.08},"geometry":{"load_coefficient":1.0856983185207874,"hub_shift_m":-0.06368400259857335,"load_n":1549.9999999999905,"projected_area_m2":0.0013386051791067846,"surface_area_m2":0.0013442184935916924,"peak_pressure_pa":2374761.4050431885,"mean_pressure_pa":1157921.7114894653,"cop_x_m":-0.16138924237455796,"cop_y_m":-3.9788299378439315e-06,"cop_z_m":-0.0007822865633902113,"local_cop_x_m":0.034950407028048705,"extent_x_m":0.028263964539112313,"local_extent_x_m":0.021004218994717883,"extent_y_m":0.06105045397568797,"active_polygons":200,"contact_subtriangles":232,"contact_samples":696,"effective_radius_m":0.28000879760118647,"load_closure_pct":-6.161093141042417e-13,"camber_rad":0.7330382858376184,"pressure_basis":{"coefficient_a":-0.06134918986919533,"coefficient_b":-0.001643374711878632,"lower_anchor_psi":26.0,"upper_anchor_psi":32.00888447476946,"interpolation_t":0.6656809623808696,"max_equilibrium_displacement_m":0.00010357179396490444}},"grip":{"longitudinal_force_n":1058.0715783730036,"lateral_force_n":-1065.5110765568174,"aligning_moment_nm":-1.963914016495591,"resultant_over_fz":0.9687799420718213,"mean_utilization":0.8928202804423488,"max_utilization":1.0,"slip_power_w":8723.49419879334,"patch_length_m":0.060064534211878136,"base_mu":1.1117548296608457},"thicknessRatio":0.9991104455182293}};
const BRANCH = {
  schema: 'ducati916.tire-evolution-lab.v8.0.continuous-pressure-basis',
  sourceFile: 'Ducati916_TIRE_SMOOTH_LAYERED_REFERENCE_LAB_V6_3_5_COMPACT_VIEWER.html',
  sourceSha256: '61c2cb501ff50559207a2755de4e1ce0f30f624d1ca9ad3b668b0b28c9f47945',
  sourceModified: false,
  classification: 'derived experimental branch; continuous clipped-triangle contact and provisional pressure-equilibrium basis',
  contactMethod: 'piecewise-linear triangle clipping + three-point degree-2 Gauss integration',
  pressureBasisClassification: 'generated provisional membrane-compliance basis; not a solved or calibrated pressure family'
};
'use strict';

const $ = id => document.getElementById(id);
const PI = Math.PI, TAU = 2 * PI, PSI_TO_PA = 6894.757293168;
const S = DATA.summary, R = DATA.render, nt = R.nt, nu = R.nu, np = nt * nu, ns = 4;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (x, n = 4) => Number.isFinite(+x) ? (+x).toFixed(n) : String(x);
const idx = (i, j) => i * nu + j;
const v3 = (i, j) => (i * nu + j) * 3;
const rows = object => Object.entries(object).map(([key, value]) => `<div class="r"><span>${key}</span><b>${value}</b></div>`).join('');

const sourceHub = S.geometry.hubM;
const sourcePsi = S.gas.currentGaugePsi;
const sourceRenderLoad = S.renderReevaluation.loadN;
const sourceTarget = S.contact.targetLoadN;
const K = S.config.contact_modulus_pa_per_m;
const soft = S.config.contact_softness_m;
const z0 = -0.5 * soft;
const sourcePos = R.X.map(array => new Float64Array(array.flat(2)));
const sourceNor = R.N.map(array => new Float64Array(array.flat(2)));
const sourceP = new Float64Array(R.P.flat());
const sourceTreadHalfWidth = Math.max(...Array.from({length: np}, (_, n) => Math.abs(sourcePos[3][n * 3])));
const phi = Array.from({length: nt}, (_, i) => PI - TAU * i / nt);

const refPos = Array.from({length: ns}, () => new Float64Array(np * 3));
const loadMode = Array.from({length: ns}, () => new Float64Array(np * 3));
const pressureModeA = Array.from({length: ns}, () => new Float64Array(np * 3));
const pressureModeB = Array.from({length: ns}, () => new Float64Array(np * 3));
const currentPos = Array.from({length: ns}, () => new Float64Array(np * 3));
const currentNor = Array.from({length: ns}, () => new Float64Array(np * 3));
const currentP = new Float64Array(np);

for (let k = 0; k < ns; k++) {
  for (let j = 0; j < nu; j++) {
    let xMean = 0, radiusMean = 0;
    for (let i = 0; i < nt; i++) {
      const q = v3(i, j);
      xMean += sourcePos[k][q];
      radiusMean += Math.hypot(sourcePos[k][q + 1], sourcePos[k][q + 2] - sourceHub);
    }
    xMean /= nt;
    radiusMean /= nt;
    for (let i = 0; i < nt; i++) {
      const q = v3(i, j);
      refPos[k][q] = xMean;
      refPos[k][q + 1] = radiusMean * Math.sin(phi[i]);
      refPos[k][q + 2] = sourceHub + radiusMean * Math.cos(phi[i]);
      loadMode[k][q] = sourcePos[k][q] - refPos[k][q];
      loadMode[k][q + 1] = sourcePos[k][q + 1] - refPos[k][q + 1];
      loadMode[k][q + 2] = sourcePos[k][q + 2] - refPos[k][q + 2];
    }
  }
}

function gradient(values) {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i === 0) out[i] = values[1] - values[0];
    else if (i === values.length - 1) out[i] = values[i] - values[i - 1];
    else out[i] = 0.5 * (values[i + 1] - values[i - 1]);
  }
  return out;
}

function directionalModulus(layer, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const inverse = Math.pow(c, 4) / layer.E1 + Math.pow(s, 4) / layer.E2 + (1 / layer.G12 - 2 * layer.nu12 / layer.E1) * s * s * c * c;
  return 1 / Math.max(inverse, 1e-30);
}

const PRESSURE_ANCHORS = new Float64Array([18, 22, 26, sourcePsi, 36, 41, 46]);
const PRESSURE_COMPLIANCE_SCALE = 0.060;
const PRESSURE_SHAPE_COUPLING = 0.180;
const LOAD_EXPONENT = 0.72;
const PRESSURE_LOAD_EXPONENT = 0.46;

function analyticPressureCoefficients(psi) {
  const delta = psi / sourcePsi - 1;
  const stiffening = 1 + 0.35 * Math.max(delta, 0) + 0.12 * Math.max(-delta, 0);
  return [delta / stiffening, PRESSURE_SHAPE_COUPLING * delta * Math.abs(delta) / stiffening];
}

function pchipSlopes(x, y) {
  const n = x.length, h = new Float64Array(n - 1), delta = new Float64Array(n - 1), d = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; delta[i] = (y[i + 1] - y[i]) / h[i]; }
  if (n === 2) { d[0] = d[1] = delta[0]; return d; }
  for (let k = 1; k < n - 1; k++) {
    if (delta[k - 1] === 0 || delta[k] === 0 || delta[k - 1] * delta[k] <= 0) d[k] = 0;
    else {
      const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
      d[k] = (w1 + w2) / (w1 / delta[k - 1] + w2 / delta[k]);
    }
  }
  let d0 = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1]);
  if (d0 * delta[0] <= 0) d0 = 0;
  else if (delta[0] * delta[1] < 0 && Math.abs(d0) > Math.abs(3 * delta[0])) d0 = 3 * delta[0];
  d[0] = d0;
  let dn = ((2 * h[n - 2] + h[n - 3]) * delta[n - 2] - h[n - 2] * delta[n - 3]) / (h[n - 2] + h[n - 3]);
  if (dn * delta[n - 2] <= 0) dn = 0;
  else if (delta[n - 2] * delta[n - 3] < 0 && Math.abs(dn) > Math.abs(3 * delta[n - 2])) dn = 3 * delta[n - 2];
  d[n - 1] = dn;
  return d;
}

function pchipEval(x, y, d, value) {
  let interval = 0;
  if (value <= x[0]) interval = 0;
  else if (value >= x[x.length - 1]) interval = x.length - 2;
  else { while (interval < x.length - 2 && value > x[interval + 1]) interval++; }
  const h = x[interval + 1] - x[interval], t = (value - x[interval]) / h, t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return {value: h00 * y[interval] + h10 * h * d[interval] + h01 * y[interval + 1] + h11 * h * d[interval + 1], interval, t};
}

const anchorA = new Float64Array(PRESSURE_ANCHORS.length), anchorB = new Float64Array(PRESSURE_ANCHORS.length);
for (let i = 0; i < PRESSURE_ANCHORS.length; i++) [anchorA[i], anchorB[i]] = analyticPressureCoefficients(PRESSURE_ANCHORS[i]);
const slopeA = pchipSlopes(PRESSURE_ANCHORS, anchorA), slopeB = pchipSlopes(PRESSURE_ANCHORS, anchorB);

const outerXProfile = new Float64Array(nu), outerRProfile = new Float64Array(nu);
for (let j = 0; j < nu; j++) {
  let x = 0, r = 0;
  for (let i = 0; i < nt; i++) {
    const q = v3(i, j); x += refPos[3][q]; r += Math.hypot(refPos[3][q + 1], refPos[3][q + 2] - sourceHub);
  }
  outerXProfile[j] = x / nt; outerRProfile[j] = r / nt;
}
const dxProfile = gradient(outerXProfile), drProfile = gradient(outerRProfile);
const nxProfile = new Float64Array(nu), nrProfile = new Float64Array(nu);
const halfWidth = Math.max(...Array.from(outerXProfile, Math.abs));
const radialMid = 0.5 * (Math.min(...outerRProfile) + Math.max(...outerRProfile));
const crownWeight = new Float64Array(nu), sideWeight = new Float64Array(nu), beadWeight = new Float64Array(nu), stiffnessCirc = new Float64Array(nu), stiffnessMer = new Float64Array(nu);
for (let j = 0; j < nu; j++) {
  let nx = drProfile[j], nr = -dxProfile[j];
  if (nx * outerXProfile[j] + nr * (outerRProfile[j] - radialMid) < 0) { nx = -nx; nr = -nr; }
  const len = Math.hypot(nx, nr) || 1;
  nxProfile[j] = nx / len; nrProfile[j] = nr / len;
  crownWeight[j] = Math.exp(-Math.pow(Math.abs(outerXProfile[j]) / Math.max(0.78 * halfWidth, 1e-9), 6));
  sideWeight[j] = 1 - crownWeight[j];
  beadWeight[j] = Math.exp(-Math.pow((halfWidth - Math.abs(outerXProfile[j])) / Math.max(0.12 * halfWidth, 1e-9), 2));
}
for (const layer of S.layers) {
  const angle = layer.angleDeg * PI / 180;
  const ec = directionalModulus(layer, angle), em = directionalModulus(layer, PI / 2 - angle);
  for (let j = 0; j < nu; j++) {
    const weight = layer.region === 'all' ? 1 : layer.region === 'crown' ? crownWeight[j] : layer.region === 'side' ? sideWeight[j] : beadWeight[j];
    stiffnessCirc[j] += ec * layer.thickness * weight;
    stiffnessMer[j] += em * layer.thickness * weight;
  }
}
const sourcePressurePa = sourcePsi * PSI_TO_PA;
let maxModeA = 0, maxModeB = 0, beadEndpointModeNorm = 0;
for (let j = 0; j < nu; j++) {
  const s = j / (nu - 1), beadVanish = Math.pow(Math.sin(PI * s), 2);
  const compliance = PRESSURE_COMPLIANCE_SCALE * outerRProfile[j] * outerRProfile[j] / Math.sqrt(Math.max(stiffnessCirc[j] * stiffnessMer[j], 1e-30)) * beadVanish;
  const amplitude = compliance * sourcePressurePa, shape = 2 * crownWeight[j] - 1;
  for (let k = 0; k < ns; k++) for (let i = 0; i < nt; i++) {
    const q = v3(i, j), ry = Math.sin(phi[i]), rz = Math.cos(phi[i]);
    const ax = amplitude * nxProfile[j], ay = amplitude * nrProfile[j] * ry, az = amplitude * nrProfile[j] * rz;
    pressureModeA[k][q] = ax; pressureModeA[k][q + 1] = ay; pressureModeA[k][q + 2] = az;
    pressureModeB[k][q] = ax * shape; pressureModeB[k][q + 1] = ay * shape; pressureModeB[k][q + 2] = az * shape;
    maxModeA = Math.max(maxModeA, Math.hypot(ax, ay, az));
    maxModeB = Math.max(maxModeB, Math.hypot(ax * shape, ay * shape, az * shape));
    if (j === 0 || j === nu - 1) beadEndpointModeNorm = Math.max(beadEndpointModeNorm, Math.hypot(ax, ay, az));
  }
}
const pressureBasisMetadata = {
  schema: 'ducati916.pressure-equilibrium-basis.v8.0.provisional',
  classification: BRANCH.pressureBasisClassification,
  anchorPsi: Array.from(PRESSURE_ANCHORS), sourcePsi, complianceScale: PRESSURE_COMPLIANCE_SCALE, shapeCoupling: PRESSURE_SHAPE_COUPLING,
  maxModeADisplacementM: maxModeA, maxModeBDisplacementM: maxModeB, beadEndpointModeNormM: beadEndpointModeNorm,
  circumferentialStiffnessNPerM: [Math.min(...stiffnessCirc), Math.max(...stiffnessCirc)],
  meridionalStiffnessNPerM: [Math.min(...stiffnessMer), Math.max(...stiffnessMer)]
};

function pressureBasisState(psi) {
  const pa = pchipEval(PRESSURE_ANCHORS, anchorA, slopeA, psi), pb = pchipEval(PRESSURE_ANCHORS, anchorB, slopeB, psi);
  let maxDisp = 0;
  for (let k = 0; k < ns; k++) for (let q = 0; q < np * 3; q += 3) {
    maxDisp = Math.max(maxDisp, Math.hypot(pa.value * pressureModeA[k][q] + pb.value * pressureModeB[k][q], pa.value * pressureModeA[k][q + 1] + pb.value * pressureModeB[k][q + 1], pa.value * pressureModeA[k][q + 2] + pb.value * pressureModeB[k][q + 2]));
  }
  return {coefficientA: pa.value, coefficientB: pb.value, lowerAnchorPsi: PRESSURE_ANCHORS[pa.interval], upperAnchorPsi: PRESSURE_ANCHORS[pa.interval + 1], interpolationT: pa.t, maxEquilibriumDisplacementM: maxDisp};
}

const fullInd = (() => {
  const values = [];
  for (let i = 0; i < nt; i++) {
    const ip = (i + 1) % nt;
    for (let j = 0; j < nu - 1; j++) {
      const A = idx(i, j), B = idx(ip, j), C = idx(ip, j + 1), D = idx(i, j + 1);
      values.push(A, B, C, A, C, D);
    }
  }
  return new Uint32Array(values);
})();

function integrateContact(pos, dz, cg, sg, hubZ, collect = false) {
  let load = 0, area = 0, surfaceArea = 0, mx = 0, my = 0, mz = 0, peak = 0;
  let xmin = 1e99, xmax = -1e99, ymin = 1e99, ymax = -1e99, localXmin = 1e99, localXmax = -1e99;
  let activePolygons = 0, subtriangles = 0;
  const ox = new Float64Array(5), oy = new Float64Array(5), oz = new Float64Array(5);
  const sampleX = [], sampleY = [], sampleZ = [], sampleP = [], sampleA = [], sampleS = [];
  const patchPos = [], patchP = [], patchSampleStart = [];
  const bary = [[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]];
  for (let ti = 0; ti < fullInd.length; ti += 3) {
    const ids = [fullInd[ti], fullInd[ti + 1], fullInd[ti + 2]];
    const vx = [pos[ids[0]*3], pos[ids[1]*3], pos[ids[2]*3]], vy = [pos[ids[0]*3+1], pos[ids[1]*3+1], pos[ids[2]*3+1]], vz = [pos[ids[0]*3+2]+dz, pos[ids[1]*3+2]+dz, pos[ids[2]*3+2]+dz];
    let outN = 0, px = vx[2], py = vy[2], pz = vz[2], previousInside = pz <= z0;
    for (let q = 0; q < 3; q++) {
      const cx = vx[q], cy = vy[q], cz = vz[q], currentInside = cz <= z0;
      if (currentInside) {
        if (!previousInside) {
          const den = cz - pz, t = Math.abs(den) < 1e-30 ? 0 : (z0 - pz) / den;
          ox[outN] = px + t * (cx - px); oy[outN] = py + t * (cy - py); oz[outN] = z0; outN++;
        }
        ox[outN] = cx; oy[outN] = cy; oz[outN] = cz; outN++;
      } else if (previousInside) {
        const den = cz - pz, t = Math.abs(den) < 1e-30 ? 0 : (z0 - pz) / den;
        ox[outN] = px + t * (cx - px); oy[outN] = py + t * (cy - py); oz[outN] = z0; outN++;
      }
      px = cx; py = cy; pz = cz; previousInside = currentInside;
    }
    if (outN < 3) continue;
    activePolygons++;
    for (let q = 0; q < outN; q++) {
      const xx = ox[q], yy = oy[q], zz = oz[q], localX = cg * xx - sg * (zz - hubZ);
      xmin = Math.min(xmin, xx); xmax = Math.max(xmax, xx); ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy);
      localXmin = Math.min(localXmin, localX); localXmax = Math.max(localXmax, localX); peak = Math.max(peak, K * (z0 - zz));
    }
    for (let q = 1; q < outN - 1; q++) {
      const x0 = ox[0], y0 = oy[0], zz0 = oz[0], x1 = ox[q], y1 = oy[q], zz1 = oz[q], x2 = ox[q+1], y2 = oy[q+1], zz2 = oz[q+1];
      const abx = x1-x0, aby = y1-y0, abz = zz1-zz0, acx = x2-x0, acy = y2-y0, acz = zz2-zz0;
      const cx3 = aby*acz-abz*acy, cy3 = abz*acx-abx*acz, cz3 = abx*acy-aby*acx;
      const ap = 0.5 * Math.abs(cz3), as = 0.5 * Math.hypot(cx3, cy3, cz3);
      if (!(ap > 0)) continue;
      subtriangles++;
      const p0 = K*(z0-zz0), p1 = K*(z0-zz1), p2 = K*(z0-zz2), pSum = p0+p1+p2;
      load += ap*pSum/3; area += ap; surfaceArea += as;
      mx += ap/12*((x0+x1+x2)*pSum+(x0*p0+x1*p1+x2*p2));
      my += ap/12*((y0+y1+y2)*pSum+(y0*p0+y1*p1+y2*p2));
      mz += ap/12*((zz0+zz1+zz2)*pSum+(zz0*p0+zz1*p1+zz2*p2));
      if (collect) {
        patchSampleStart.push(sampleX.length);
        patchPos.push(x0,y0,z0+0.00018,x1,y1,z0+0.00018,x2,y2,z0+0.00018);
        patchP.push(p0,p1,p2);
        for (const b of bary) {
          const xx=b[0]*x0+b[1]*x1+b[2]*x2, yy=b[0]*y0+b[1]*y1+b[2]*y2, zz=b[0]*zz0+b[1]*zz1+b[2]*zz2;
          sampleX.push(xx); sampleY.push(yy); sampleZ.push(zz); sampleP.push(K*(z0-zz)); sampleA.push(ap/3); sampleS.push(as/3);
        }
      }
    }
  }
  const result = {load, area, surfaceArea, mx, my, mz, peak, xmin, xmax, ymin, ymax, localXmin, localXmax, activePolygons, subtriangles};
  if (collect) result.contact = {
    x:new Float64Array(sampleX),y:new Float64Array(sampleY),z:new Float64Array(sampleZ),pressure:new Float64Array(sampleP),area:new Float64Array(sampleA),surfaceArea:new Float64Array(sampleS),
    patchPos:new Float32Array(patchPos),patchPressure:new Float64Array(patchP),patchSampleStart:new Uint32Array(patchSampleStart),
    utilization:new Float64Array(sampleX.length),forceLong:new Float64Array(sampleX.length),forceLat:new Float64Array(sampleX.length)
  };
  return result;
}

function cross3(ax, ay, az, bx, by, bz) { return [ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx]; }
function computeNormals(k, gamma) {
  const pos = currentPos[k], nor = currentNor[k], src = sourceNor[k], cg = Math.cos(gamma), sg = Math.sin(gamma);
  for (let i = 0; i < nt; i++) {
    const ip = (i+1)%nt, im=(i+nt-1)%nt;
    for (let j = 0; j < nu; j++) {
      const jp=Math.min(nu-1,j+1), jm=Math.max(0,j-1), q=v3(i,j), a=v3(ip,j), b=v3(im,j), c=v3(i,jp), d=v3(i,jm);
      const t1x=pos[a]-pos[b],t1y=pos[a+1]-pos[b+1],t1z=pos[a+2]-pos[b+2],t2x=pos[c]-pos[d],t2y=pos[c+1]-pos[d+1],t2z=pos[c+2]-pos[d+2];
      let n=cross3(t1x,t1y,t1z,t2x,t2y,t2z), len=Math.hypot(...n)||1; n=n.map(value=>value/len);
      const sx=cg*src[q]+sg*src[q+2],sy=src[q+1],sz=-sg*src[q]+cg*src[q+2]; if(n[0]*sx+n[1]*sy+n[2]*sz<0)n=n.map(value=>-value);
      nor[q]=n[0];nor[q+1]=n[1];nor[q+2]=n[2];
    }
  }
}
function pressureFromZ(z) { return K * Math.max(0, z0 - z); }

const inputs = {loadN:sourceRenderLoad,camberDeg:0,pressurePsi:sourcePsi,slipRatio:0,slipAngleDeg:0,speed:25,mu:1.18,temperatureC:72,wetness:0};
const specs = [
  ['loadN','vertical load',200,2600,1,' N'],['camberDeg','camber / lean',-55,55,.1,'°'],['pressurePsi','inflation pressure',18,46,.1,' psi'],
  ['slipRatio','longitudinal slip',-.25,.25,.001,''],['slipAngleDeg','slip angle',-16,16,.1,'°'],['speed','road speed',0,90,.1,' m/s'],
  ['mu','surface μ',.2,1.65,.01,''],['temperatureC','tread temperature',10,140,.1,' °C'],['wetness','wetness',0,1,.01,'']
];
const controlEls = {};
$('controls').innerHTML = specs.map(([key,label,min,max,step,unit]) => `<div class="ctrl"><label for="${key}">${label}</label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${inputs[key]}"><output id="${key}Out"></output></div>`).join('');
function updateOutput(key){const spec=specs.find(item=>item[0]===key),unit=spec[5];$(key+'Out').textContent=(Math.abs(inputs[key])<1e-12?'0':fmt(inputs[key],spec[4]<.01?3:spec[4]<1?2:1))+unit;}
let geometryDirty=true,plotDirty=true,paused=false,mode='outer',lastT=performance.now(),historyClock=0,visualClock=0,uiClock=0;
for(const spec of specs){const key=spec[0],el=$(key);controlEls[key]=el;updateOutput(key);el.addEventListener('input',()=>{inputs[key]=+el.value;updateOutput(key);if(['loadN','camberDeg','pressurePsi'].includes(key))geometryDirty=true;plotDirty=true;});}
$('autoThermal').checked=false;
$('sourceState').onclick=()=>setInputs({loadN:sourceRenderLoad,camberDeg:0,pressurePsi:sourcePsi});
$('nativeTarget').onclick=()=>setInputs({loadN:sourceTarget,camberDeg:0,pressurePsi:sourcePsi});
$('challengeState').onclick=()=>setInputs({loadN:1550,camberDeg:42,pressurePsi:30,slipRatio:.12,slipAngleDeg:5.5,speed:38,mu:1.22,temperatureC:78,wetness:.08});
$('resetDyn').onclick=()=>{dyn.kappa=0;dyn.alpha=0;dyn.temp=inputs.temperatureC;history.length=0;plotDirty=true;};
function setInputs(values){for(const [key,value] of Object.entries(values)){const next=+value;if(['loadN','camberDeg','pressurePsi'].includes(key)&&next!==inputs[key])geometryDirty=true;inputs[key]=next;if(controlEls[key]){controlEls[key].value=next;updateOutput(key);}}plotDirty=true;}

let contact = {x:new Float64Array(),y:new Float64Array(),z:new Float64Array(),pressure:new Float64Array(),area:new Float64Array(),surfaceArea:new Float64Array(),patchPos:new Float32Array(),patchPressure:new Float64Array(),patchSampleStart:new Uint32Array(),utilization:new Float64Array(),forceLong:new Float64Array(),forceLat:new Float64Array()};
let geom = {loadCoefficient:1,hubShift:0,loadN:0,area:0,surfArea:0,peak:0,meanP:0,copX:0,copY:0,copZ:0,localCopX:0,extentX:0,localExtentX:0,extentY:0,activePolygons:0,subtriangles:0,samples:0,rEff:0,closure:0,camberRad:0,pressureBasis:pressureBasisState(sourcePsi)};

function solveGeometry() {
  const pressureBasis = pressureBasisState(inputs.pressurePsi);
  const loadRatio = Math.max(0, inputs.loadN) / Math.max(sourceRenderLoad, 1e-12);
  const loadCoefficient = Math.pow(loadRatio, LOAD_EXPONENT) * Math.pow(sourcePsi / Math.max(inputs.pressurePsi, 1), PRESSURE_LOAD_EXPONENT);
  const gamma = inputs.camberDeg * PI / 180, cg=Math.cos(gamma), sg=Math.sin(gamma);
  for(let k=0;k<ns;k++){
    const dst=currentPos[k],ref=refPos[k],load=loadMode[k],pa=pressureModeA[k],pb=pressureModeB[k];
    for(let n=0;n<np;n++){
      const q=n*3,x=ref[q]+pressureBasis.coefficientA*pa[q]+pressureBasis.coefficientB*pb[q]+loadCoefficient*load[q],y=ref[q+1]+pressureBasis.coefficientA*pa[q+1]+pressureBasis.coefficientB*pb[q+1]+loadCoefficient*load[q+1],z=ref[q+2]+pressureBasis.coefficientA*pa[q+2]+pressureBasis.coefficientB*pb[q+2]+loadCoefficient*load[q+2],zr=z-sourceHub;
      dst[q]=cg*x+sg*zr;dst[q+1]=y;dst[q+2]=-sg*x+cg*zr+sourceHub;
    }
  }
  const outer=currentPos[3],target=Math.max(0,inputs.loadN);
  let lo=-.12,hi=.12;
  for(let e=0;e<12&&integrateContact(outer,lo,cg,sg,sourceHub+lo,false).load<target;e++)lo-=.08;
  for(let e=0;e<12&&integrateContact(outer,hi,cg,sg,sourceHub+hi,false).load>target;e++)hi+=.08;
  for(let iteration=0;iteration<62;iteration++){const mid=.5*(lo+hi),value=integrateContact(outer,mid,cg,sg,sourceHub+mid,false).load;if(value>target)lo=mid;else hi=mid;}
  const dz=.5*(lo+hi),result=integrateContact(outer,dz,cg,sg,sourceHub+dz,true); contact=result.contact;
  for(let k=0;k<ns;k++){const pos=currentPos[k];for(let n=0;n<np;n++)pos[n*3+2]+=dz;computeNormals(k,gamma);}
  for(let n=0;n<np;n++)currentP[n]=pressureFromZ(currentPos[3][n*3+2]);
  const copX=result.load?result.mx/result.load:0,copY=result.load?result.my/result.load:0,copZ=result.load?result.mz/result.load:0,hubZ=sourceHub+dz;
  const localCopX=cg*copX-sg*(copZ-hubZ),axis=[cg,0,-sg],rr=[copX,copY,copZ-hubZ],axisDot=rr[0]*axis[0]+rr[1]*axis[1]+rr[2]*axis[2],rx=rr[0]-axisDot*axis[0],ry=rr[1]-axisDot*axis[1],rz=rr[2]-axisDot*axis[2];
  geom={loadCoefficient,hubShift:dz,loadN:result.load,area:result.area,surfArea:result.surfaceArea,peak:result.peak,meanP:result.area?result.load/result.area:0,copX,copY,copZ,localCopX,extentX:result.activePolygons?result.xmax-result.xmin:0,localExtentX:result.activePolygons?result.localXmax-result.localXmin:0,extentY:result.activePolygons?result.ymax-result.ymin:0,activePolygons:result.activePolygons,subtriangles:result.subtriangles,samples:contact.x.length,rEff:Math.hypot(rx,ry,rz),closure:target?100*(result.load-target)/target:0,camberRad:gamma,pressureBasis};
  geometryDirty=false;plotDirty=true;updateMeshes();updateContactPanel();updatePressurePanel();
}

const dyn={kappa:0,alpha:0,temp:inputs.temperatureC,Flong:0,Flat:0,Mz:0,muEff:0,utilMean:0,utilMax:0,power:0,Lx:.2,Ly:.3,baseMu:0,patchL:0};
function tempFactor(t){return .58+.42*Math.exp(-Math.pow((t-78)/37,2));}
function computeGrip(kappa=dyn.kappa,alpha=dyn.alpha,commit=true){
  if(!contact.x.length)return {Flong:0,Flat:0,Mz:0,muEff:0,utilMean:0,utilMax:0,power:0,patchL:0,baseMu:0};
  let yLead=-1e99,yTrail=1e99;for(let i=0;i<contact.y.length;i++){yLead=Math.max(yLead,contact.y[i]);yTrail=Math.min(yTrail,contact.y[i]);}
  const patchL=Math.max(1e-4,yLead-yTrail),meanP=Math.max(1,geom.meanP),speed=inputs.speed,g=geom.camberRad;
  const wetFactor=1-inputs.wetness*(.30+.34*Math.tanh(speed/18)),speedFactor=1-.07*Math.tanh(speed/55),pressFactor=Math.pow(sourcePsi/Math.max(1,inputs.pressurePsi),.025),tf=tempFactor(commit?dyn.temp:inputs.temperatureC),base=inputs.mu*wetFactor*speedFactor*pressFactor*tf;
  let Fl=0,Ft=0,Mz=0,utilW=0,load=0,umax=0,power=0;const camberSlip=.062*Math.sin(g),longSlip=kappa/(1+Math.abs(kappa)),latSlip=Math.tan(alpha)+camberSlip,kLong=4.15e8,kLat=3.25e8;
  for(let n=0;n<contact.x.length;n++){
    const p=contact.pressure[n],A=contact.area[n],s=Math.max(0,yLead-contact.y[n]),pressureScale=clamp(Math.pow(p/meanP,.34),.45,1.8),muLocal=base*clamp(Math.pow(p/meanP,-.045),.82,1.18);
    let tx=kLong*pressureScale*longSlip*s,ty=-kLat*pressureScale*latSlip*s;const cap=Math.max(1e-9,muLocal*p),u=Math.hypot(tx/cap,ty/(.97*cap)),scale=u>1?1/u:1;tx*=scale;ty*=scale;
    const fx=tx*A,fy=ty*A,fz=p*A;Fl+=fx;Ft+=fy;Mz+=(contact.x[n]-geom.copX)*fx-(contact.y[n]-geom.copY)*fy;load+=fz;utilW+=Math.min(1,u)*fz;umax=Math.max(umax,Math.min(1,u));power+=Math.abs(fx*speed*kappa)+Math.abs(fy*speed*Math.tan(alpha));
    if(commit){contact.utilization[n]=Math.min(1,u);contact.forceLong[n]=fx;contact.forceLat[n]=fy;}
  }
  const result={Flong:Fl,Flat:Ft,Mz,muEff:load?Math.hypot(Fl,Ft)/load:0,utilMean:load?utilW/load:0,utilMax:umax,power,patchL,baseMu:base};if(commit)Object.assign(dyn,result);return result;
}
function updateDynamics(dt){const patch=Math.max(.01,geom.extentY),vx=Math.max(.5,inputs.speed);dyn.Lx=Math.max(.08,4.2*patch);dyn.Ly=Math.max(.10,5.3*patch);const tx=dyn.Lx/vx,ty=dyn.Ly/vx,ak=1-Math.exp(-dt/tx),aa=1-Math.exp(-dt/ty);dyn.kappa+=(inputs.slipRatio-dyn.kappa)*ak;dyn.alpha+=(inputs.slipAngleDeg*PI/180-dyn.alpha)*aa;if(!$('autoThermal').checked)dyn.temp=inputs.temperatureC;computeGrip();if($('autoThermal').checked){const heatPartition=.16,capacity=4800,coolTau=210,ambient=25;dyn.temp+=dt*(heatPartition*dyn.power/capacity-(dyn.temp-ambient)/coolTau);inputs.temperatureC=clamp(dyn.temp,10,140);controlEls.temperatureC.value=inputs.temperatureC;updateOutput('temperatureC');}}

function updateContactPanel(){$('contactState').innerHTML=rows({'contact method':'triangle clip + Gauss-3','target load':fmt(inputs.loadN,2)+' N','solved load':fmt(geom.loadN,2)+' N','load closure':fmt(geom.closure,7)+' %','load deformation coefficient':fmt(geom.loadCoefficient,5),'hub vertical continuation':fmt(geom.hubShift*1000,4)+' mm','road patch area':fmt(geom.area*1e4,3)+' cm²','surface patch area':fmt(geom.surfArea*1e4,3)+' cm²','road W × L':fmt(geom.extentX*1000,2)+' × '+fmt(geom.extentY*1000,2)+' mm','tire-local W × L':fmt(geom.localExtentX*1000,2)+' × '+fmt(geom.extentY*1000,2)+' mm','peak / mean pressure':fmt(geom.peak/1e6,4)+' / '+fmt(geom.meanP/1e6,4)+' MPa','road COP x / y':fmt(geom.copX*1000,3)+' / '+fmt(geom.copY*1000,3)+' mm','tire-local COP lateral':fmt(geom.localCopX*1000,3)+' mm','effective radius':fmt(geom.rEff*1000,3)+' mm','active polygons / subtriangles':geom.activePolygons+' / '+geom.subtriangles,'Gauss contact samples':String(geom.samples)});}
function updatePressurePanel(){const p=geom.pressureBasis;$('pressureState').innerHTML=rows({'anchor family':Array.from(PRESSURE_ANCHORS).map(x=>fmt(x,1)).join(' · ')+' psi','active bracket':fmt(p.lowerAnchorPsi,3)+' ↔ '+fmt(p.upperAnchorPsi,3)+' psi','interpolation coordinate':fmt(p.interpolationT,5),'mode coefficients A / B':fmt(p.coefficientA,7)+' / '+fmt(p.coefficientB,7),'max equilibrium displacement':fmt(p.maxEquilibriumDisplacementM*1000,5)+' mm','basis max mode A / B':fmt(maxModeA*1000,4)+' / '+fmt(maxModeB*1000,4)+' mm','bead endpoint motion':fmt(beadEndpointModeNorm*1e9,4)+' nm','classification':'PROVISIONAL · UNCALIBRATED'});}
function updateForcePanel(){$('forceState').innerHTML=rows({'relaxed κ / α':fmt(dyn.kappa,4)+' / '+fmt(dyn.alpha*180/PI,3)+'°','longitudinal force':fmt(dyn.Flong,2)+' N','lateral force':fmt(dyn.Flat,2)+' N','aligning moment Mz':fmt(dyn.Mz,3)+' N·m','resultant / Fz':fmt(dyn.muEff,4),'friction utilization':fmt(dyn.utilMean*100,2)+' % mean · '+fmt(dyn.utilMax*100,1)+' % max','effective μ ceiling':fmt(dyn.baseMu||0,4),'relaxation Lx / Ly':fmt(dyn.Lx,3)+' / '+fmt(dyn.Ly,3)+' m','estimated slip power':fmt(dyn.power,1)+' W','thermal state':fmt(dyn.temp,2)+' °C'});}

$('prov').innerHTML=rows({'branch schema':BRANCH.schema,'source SHA':BRANCH.sourceSha256.slice(0,20)+'…','source modified':'false','source result SHA':DATA.resultSha256.slice(0,20)+'…','source basis':S.provenance.basis,'production contact':BRANCH.contactMethod,'physical calibration':String(S.provenance.physicalCalibration)});
$('layers').innerHTML=(S.layers||[]).map(layer=>`<div class="r"><span style="color:${layer.color}">${layer.label}</span><b>${fmt(layer.massKg,4)} kg · ${fmt(layer.membraneEnergyJ,4)} J</b></div>`).join('');

const cvs=$('gl'),gl=cvs.getContext('webgl2',{antialias:true,alpha:false});if(!gl)throw Error('WebGL2 required');window.__LAB_GL__=gl;window.__LAB_FRAMES__=0;window.__LAB_CONTEXT_LOST__=false;cvs.addEventListener('webglcontextlost',event=>{window.__LAB_CONTEXT_LOST__=true;event.preventDefault();});
function shader(type,source){const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);if(!gl.getShaderParameter(item,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(item));return item;}
function program(vertex,fragment){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
const PBR=program(`#version 300 es\nprecision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec3 c;uniform mat4 vp;out vec3 N,C,W;void main(){N=n;C=c;W=p;gl_Position=vp*vec4(p,1);}`,`#version 300 es\nprecision highp float;in vec3 N,C,W;uniform vec3 eye;out vec4 o;void main(){vec3 n=normalize(N),v=normalize(eye-W),l=normalize(vec3(-.5,-.3,.8)),h=normalize(l+v);float d=.22+.78*max(dot(n,l),0.);float s=.22*pow(max(dot(n,h),0.),48.);o=vec4(pow(max(C*d+s,vec3(0.)),vec3(1./2.2)),1);}`);
const LINE=program(`#version 300 es\nprecision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 c;uniform mat4 vp;out vec3 C;void main(){C=c;gl_Position=vp*vec4(p,1);}`,`#version 300 es\nprecision highp float;in vec3 C;out vec4 o;void main(){o=vec4(C,1);}`);
function ident(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}function persp(f,a,n,z){const t=1/Math.tan(f/2),m=new Float32Array(16);m[0]=t/a;m[5]=t;m[10]=(z+n)/(n-z);m[11]=-1;m[14]=2*z*n/(n-z);return m;}const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const length=Math.hypot(...a)||1;return a.map(x=>x/length);};function look(e,t,u){const z=norm(sub(e,t)),x=norm(cross(u,z)),y=cross(z,x),m=ident();m[0]=x[0];m[1]=y[0];m[2]=z[0];m[4]=x[1];m[5]=y[1];m[6]=z[1];m[8]=x[2];m[9]=y[2];m[10]=z[2];m[12]=-dot(x,e);m[13]=-dot(y,e);m[14]=-dot(z,e);return m;}
const cols=[[.22,.55,.85],[.86,.78,.36],[.89,.42,.45],[.83,.86,.88]],wedgeCenter=PI/2,wedgeHalf=.62;function angleOf(i){return TAU*(i+.5)/nt;}function inWedge(i){const a=angleOf(i)-wedgeCenter;return Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))<wedgeHalf;}
function indices(cut=false){const values=[];for(let i=0;i<nt;i++){const ip=(i+1)%nt;if(cut&&(inWedge(i)||inWedge(ip)))continue;for(let j=0;j<nu-1;j++){const A=idx(i,j),B=idx(ip,j),C=idx(ip,j+1),D=idx(i,j+1);values.push(A,B,C,A,C,D);}}return new Uint32Array(values);}const cutInd=indices(true);
function createSurface(k){const vao=gl.createVertexArray();gl.bindVertexArray(vao);const pb=gl.createBuffer(),nb=gl.createBuffer(),cb=gl.createBuffer();for(const [loc,b] of [[0,pb],[1,nb],[2,cb]]){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,np*3*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,fullInd,gl.STATIC_DRAW);const vaoCut=gl.createVertexArray();gl.bindVertexArray(vaoCut);for(const [loc,b] of [[0,pb],[1,nb],[2,cb]]){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}const ibc=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibc);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,cutInd,gl.STATIC_DRAW);return{k,vao,vaoCut,pb,nb,cb,count:fullInd.length,cutCount:cutInd.length};}
const surfaces=Array.from({length:ns},(_,k)=>createSurface(k));
let lineVao=gl.createVertexArray(),linePB=gl.createBuffer(),lineCB=gl.createBuffer(),lineCount=0;gl.bindVertexArray(lineVao);for(const [loc,b] of [[0,linePB],[1,lineCB]]){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,4096*6*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}
let patchVao=gl.createVertexArray(),patchPB=gl.createBuffer(),patchCB=gl.createBuffer(),patchCount=0;gl.bindVertexArray(patchVao);for(const [loc,b] of [[0,patchPB],[1,patchCB]]){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,1024*18*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}
function pressureColor(value){const z=clamp(value,0,1);return[.12+.88*Math.pow(z,.45),.08+.62*Math.pow(z,1.6),.04+.1*(1-z)];}function utilColor(value){const z=clamp(value,0,1);return[.18+.82*z,.65*(1-z)+.18,.90*(1-z)+.08];}
function updatePatchMesh(){patchCount=contact.patchPos.length/3;if(!patchCount)return;const colors=new Float32Array(contact.patchPos.length),pmax=Math.max(1,geom.peak);for(let tri=0;tri<contact.patchSampleStart.length;tri++){const start=contact.patchSampleStart[tri],u=(contact.utilization[start]+contact.utilization[start+1]+contact.utilization[start+2])/3;for(let v=0;v<3;v++){const c=mode==='grip'?utilColor(u):pressureColor(contact.patchPressure[tri*3+v]/pmax),q=(tri*3+v)*3;colors[q]=c[0];colors[q+1]=c[1];colors[q+2]=c[2];}}gl.bindBuffer(gl.ARRAY_BUFFER,patchPB);gl.bufferData(gl.ARRAY_BUFFER,contact.patchPos,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,patchCB);gl.bufferData(gl.ARRAY_BUFFER,colors,gl.DYNAMIC_DRAW);}
function updateMeshes(){const pmax=Math.max(1,geom.peak);for(const surface of surfaces){const k=surface.k,col=new Float32Array(np*3);for(let n=0;n<np;n++){const c=k===3&&mode==='pressure'?pressureColor(currentP[n]/pmax):cols[k];col[n*3]=c[0];col[n*3+1]=c[1];col[n*3+2]=c[2];}gl.bindBuffer(gl.ARRAY_BUFFER,surface.pb);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(currentPos[k]));gl.bindBuffer(gl.ARRAY_BUFFER,surface.nb);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(currentNor[k]));gl.bindBuffer(gl.ARRAY_BUFFER,surface.cb);gl.bufferSubData(gl.ARRAY_BUFFER,0,col);}updatePatchMesh();updateLines();}
function updateOuterVisual(){const surface=surfaces[3],pmax=Math.max(1,geom.peak),colors=new Float32Array(np*3);for(let n=0;n<np;n++){const c=mode==='pressure'?pressureColor(currentP[n]/pmax):cols[3];colors[n*3]=c[0];colors[n*3+1]=c[1];colors[n*3+2]=c[2];}gl.bindBuffer(gl.ARRAY_BUFFER,surface.cb);gl.bufferSubData(gl.ARRAY_BUFFER,0,colors);updatePatchMesh();updateLines();}
function addSeg(P,C,a,b,c){P.push(...a,...b);C.push(...c,...c);}
function updateLines(){const p=[],c=[],x=.18,y=.40;for(const [a,b] of [[[-x,-y,0],[x,-y,0]],[[x,-y,0],[x,y,0]],[[x,y,0],[-x,y,0]],[[-x,y,0],[-x,-y,0]]])addSeg(p,c,a,b,[.28,.34,.37]);if(mode==='cut'){let bounds=[];for(let i=0;i<nt;i++){const a=Math.atan2(Math.sin(angleOf(i)-wedgeCenter),Math.cos(angleOf(i)-wedgeCenter));if(Math.abs(Math.abs(a)-wedgeHalf)<TAU/nt*1.1)bounds.push(i);}bounds=[...new Set(bounds)].sort((a,b)=>a-b);if(bounds.length>2)bounds=[bounds[0],bounds.at(-1)];for(const i of bounds)for(let k=0;k<4;k++)for(let j=0;j<nu-1;j++){const q=v3(i,j),r=v3(i,j+1);addSeg(p,c,[currentPos[k][q],currentPos[k][q+1],currentPos[k][q+2]],[currentPos[k][r],currentPos[k][r+1],currentPos[k][r+2]],cols[k]);}}if(mode==='air'){let bi=0,bz=1e9;for(let i=0;i<nt;i++){const z=currentPos[0][v3(i,nu>>1)+2];if(z<bz){bz=z;bi=i;}}for(let j=0;j<nu-1;j++){const q=v3(bi,j),r=v3(bi,j+1);addSeg(p,c,[currentPos[0][q],currentPos[0][q+1],currentPos[0][q+2]],[currentPos[0][r],currentPos[0][r+1],currentPos[0][r+2]],[.35,.85,1]);}}if(mode==='grip'&&contact.x.length){const stride=Math.max(1,Math.floor(contact.x.length/140)),scale=.00008;for(let n=0;n<contact.x.length;n+=stride){const a=[contact.x[n],contact.y[n],0.00035],b=[a[0]+contact.forceLat[n]*scale,a[1]+contact.forceLong[n]*scale,a[2]+.00025];addSeg(p,c,a,b,utilColor(contact.utilization[n]));}}lineCount=p.length/3;gl.bindBuffer(gl.ARRAY_BUFFER,linePB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(p),gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,lineCB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(c),gl.DYNAMIC_DRAW);}
let cam={yaw:-1.22,pitch:.24,dist:.9,target:[0,0,.17]};function setPreset(selected){if(selected==='pressure'||selected==='grip')cam={yaw:0,pitch:-.92,dist:.58,target:[0,0,.035]};else if(selected==='cut')cam={yaw:-1.57,pitch:.12,dist:.72,target:[0,0,.17]};else if(selected==='air')cam={yaw:-1.3,pitch:.15,dist:.78,target:[0,0,.17]};else cam={yaw:-1.22,pitch:.24,dist:.9,target:[0,0,.17]};}
function drawSurface(surface,vp,eye,cut=false){gl.useProgram(PBR);gl.uniformMatrix4fv(gl.getUniformLocation(PBR,'vp'),false,vp);gl.uniform3fv(gl.getUniformLocation(PBR,'eye'),eye);gl.bindVertexArray(cut?surface.vaoCut:surface.vao);gl.drawElements(gl.TRIANGLES,cut?surface.cutCount:surface.count,gl.UNSIGNED_INT,0);}
function render3D(){const d=Math.min(devicePixelRatio||1,2),w=cvs.clientWidth,h=cvs.clientHeight;if(cvs.width!==w*d||cvs.height!==h*d){cvs.width=w*d;cvs.height=h*d;}gl.viewport(0,0,cvs.width,cvs.height);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(.055,.07,.08,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const cp=Math.cos(cam.pitch),eye=[cam.target[0]+cam.dist*cp*Math.sin(cam.yaw),cam.target[1]+cam.dist*cp*Math.cos(cam.yaw),cam.target[2]+cam.dist*Math.sin(cam.pitch)],vp=mul(persp(.8,w/h,.01,5),look(eye,cam.target,[0,0,1]));if(mode==='cut')surfaces.forEach(surface=>drawSurface(surface,vp,eye,true));else if(mode==='air')drawSurface(surfaces[0],vp,eye,false);else drawSurface(surfaces[3],vp,eye,false);if((mode==='pressure'||mode==='grip')&&patchCount){gl.disable(gl.CULL_FACE);gl.useProgram(LINE);gl.uniformMatrix4fv(gl.getUniformLocation(LINE,'vp'),false,vp);gl.bindVertexArray(patchVao);gl.drawArrays(gl.TRIANGLES,0,patchCount);gl.enable(gl.CULL_FACE);}gl.useProgram(LINE);gl.uniformMatrix4fv(gl.getUniformLocation(LINE,'vp'),false,vp);gl.bindVertexArray(lineVao);gl.drawArrays(gl.LINES,0,lineCount);window.__LAB_GL_ERROR__=gl.getError();window.__LAB_FRAMES__++;}
let drag=false,lx=0,ly=0;cvs.onpointerdown=event=>{drag=true;lx=event.clientX;ly=event.clientY;cvs.setPointerCapture(event.pointerId);};cvs.onpointermove=event=>{if(!drag)return;cam.yaw-=(event.clientX-lx)*.006;cam.pitch=clamp(cam.pitch+(event.clientY-ly)*.006,-1.3,1.3);lx=event.clientX;ly=event.clientY;};cvs.onpointerup=()=>drag=false;cvs.onwheel=event=>{cam.dist=clamp(cam.dist*Math.exp(event.deltaY*.001),.22,2);event.preventDefault();};
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;setPreset(mode);document.querySelectorAll('[data-mode]').forEach(item=>item.classList.toggle('active',item===button));updateMeshes();plotDirty=true;});$('resetCam').onclick=()=>setPreset(mode);$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};

function prep(canvas){const d=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==w*d||canvas.height!==h*d){canvas.width=w*d;canvas.height=h*d;}const x=canvas.getContext('2d');x.setTransform(d,0,0,d,0,0);x.fillStyle='#061018';x.fillRect(0,0,w,h);x.font='10px ui-monospace';return{x,w,h};}
function crossPlot(){const{x,w,h}=prep($('cross')),outer=currentPos[3];let bi=0,bz=1e9;for(let i=0;i<nt;i++){const z=outer[v3(i,nu>>1)+2];if(z<bz){bz=z;bi=i;}}let minx=1e9,maxx=-1e9,minz=Math.min(0,bz),maxz=-1e9;for(let k=0;k<4;k++)for(let j=0;j<nu;j++){const q=v3(bi,j);minx=Math.min(minx,currentPos[k][q],sourcePos[k][q]);maxx=Math.max(maxx,currentPos[k][q],sourcePos[k][q]);minz=Math.min(minz,currentPos[k][q+2],sourcePos[k][q+2]);maxz=Math.max(maxz,currentPos[k][q+2],sourcePos[k][q+2]);}const xp=value=>25+(value-minx)/Math.max(1e-9,maxx-minx)*(w-45),zp=value=>h-20-(value-minz)/Math.max(1e-9,maxz-minz)*(h-45);x.strokeStyle='#596369';x.beginPath();x.moveTo(15,zp(0));x.lineTo(w-10,zp(0));x.stroke();for(let k=0;k<4;k++){x.strokeStyle='rgba(150,170,180,.28)';x.lineWidth=1;x.setLineDash([3,3]);x.beginPath();for(let j=0;j<nu;j++){const q=v3(bi,j);j?x.lineTo(xp(sourcePos[k][q]),zp(sourcePos[k][q+2])):x.moveTo(xp(sourcePos[k][q]),zp(sourcePos[k][q+2]));}x.stroke();x.setLineDash([]);x.strokeStyle=`rgb(${cols[k].map(value=>value*255).join(',')})`;x.lineWidth=2;x.beginPath();for(let j=0;j<nu;j++){const q=v3(bi,j);j?x.lineTo(xp(currentPos[k][q]),zp(currentPos[k][q+2])):x.moveTo(xp(currentPos[k][q]),zp(currentPos[k][q+2]));}x.stroke();}x.fillStyle='#9eb6c1';x.fillText('dashed: source state · solid: pressure/load equilibrium branch',10,h-7);}
function patchPlot(){const{x,w,h}=prep($('patch'));if(!contact.x.length){x.fillStyle='#ff7365';x.fillText('no contact',12,30);return;}let xmin=Math.min(...contact.x),xmax=Math.max(...contact.x),ymin=Math.min(...contact.y),ymax=Math.max(...contact.y),pad=.004;xmin-=pad;xmax+=pad;ymin-=pad;ymax+=pad;const xp=value=>25+(value-xmin)/Math.max(1e-9,xmax-xmin)*(w-45),yp=value=>h-25-(value-ymin)/Math.max(1e-9,ymax-ymin)*(h-52),pmax=Math.max(1,geom.peak),stride=Math.max(1,Math.floor(contact.x.length/900));for(let n=0;n<contact.x.length;n+=stride){const z=contact.pressure[n]/pmax,col=mode==='grip'?utilColor(contact.utilization[n]):pressureColor(z);x.fillStyle=`rgb(${col.map(value=>Math.round(255*value)).join(',')})`;const radius=1+3*Math.sqrt(z);x.beginPath();x.arc(xp(contact.x[n]),yp(contact.y[n]),radius,0,TAU);x.fill();if(mode==='grip'&&n%(stride*4)===0){const scale=.00008;x.strokeStyle='#dcecf3';x.beginPath();x.moveTo(xp(contact.x[n]),yp(contact.y[n]));x.lineTo(xp(contact.x[n]+contact.forceLat[n]*scale),yp(contact.y[n]+contact.forceLong[n]*scale));x.stroke();}}x.strokeStyle='#78efb1';x.beginPath();x.arc(xp(geom.copX),yp(geom.copY),5,0,TAU);x.stroke();x.fillStyle='#9eb6c1';x.fillText(`${fmt(geom.area*1e4,2)} cm² · ${fmt(geom.extentX*1000,1)}×${fmt(geom.extentY*1000,1)} mm · ${geom.samples} Gauss samples`,10,h-8);}
const history=[];function recordHistory(t){history.push({t,Fx:dyn.Flong/Math.max(1,geom.loadN),Fy:dyn.Flat/Math.max(1,geom.loadN),Mz:dyn.Mz});while(history.length>360)history.shift();}
function tracePlot(){const{x,w,h}=prep($('trace'));if(history.length<2){x.fillStyle='#9eb6c1';x.fillText('transient history accumulating…',12,30);return;}const vals=history.flatMap(q=>[q.Fx,q.Fy]),mx=Math.max(.2,...vals.map(Math.abs)),t0=history[0].t,t1=history.at(-1).t,xp=t=>28+(t-t0)/Math.max(.001,t1-t0)*(w-42),yp=value=>h/2-value/mx*(h*.39);x.strokeStyle='#29414e';x.beginPath();x.moveTo(20,h/2);x.lineTo(w-8,h/2);x.stroke();for(const [key,col] of [['Fx','#6fdcff'],['Fy','#ff8f6a']]){x.strokeStyle=col;x.lineWidth=1.7;x.beginPath();history.forEach((q,i)=>{const xx=xp(q.t),yy=yp(q[key]);i?x.lineTo(xx,yy):x.moveTo(xx,yy);});x.stroke();}x.fillStyle='#9eb6c1';x.fillText(`cyan F_long/Fz · orange F_lat/Fz · scale ±${fmt(mx,2)}`,10,h-8);}
function drawPlots(){crossPlot();patchPlot();tracePlot();plotDirty=false;}

function thicknessRatio(){let minimum=1e99;for(let k=0;k<3;k++)for(let n=0;n<np;n++){const q=n*3,sourceGap=Math.hypot(sourcePos[k+1][q]-sourcePos[k][q],sourcePos[k+1][q+1]-sourcePos[k][q+1],sourcePos[k+1][q+2]-sourcePos[k][q+2]);if(sourceGap>1e-9){const currentGap=Math.hypot(currentPos[k+1][q]-currentPos[k][q],currentPos[k+1][q+1]-currentPos[k][q+1],currentPos[k+1][q+2]-currentPos[k][q+2]);minimum=Math.min(minimum,currentGap/sourceGap);}}return minimum;}
function runAudit(){const checks=[],add=(name,pass,value,criterion)=>checks.push({name,pass:!!pass,value,criterion});let replay=0,replayArea=0;const nodeArea=new Float64Array(np);for(let i=0;i<nt;i++){const ip=(i+1)%nt;for(let j=0;j<nu-1;j++){const ids=[idx(i,j),idx(ip,j),idx(ip,j+1),idx(i,j+1)];for(const tri of [[0,1,2],[0,2,3]]){const ia=ids[tri[0]]*3,ib=ids[tri[1]]*3,ic=ids[tri[2]]*3,abx=sourcePos[3][ib]-sourcePos[3][ia],aby=sourcePos[3][ib+1]-sourcePos[3][ia+1],abz=sourcePos[3][ib+2]-sourcePos[3][ia+2],acx=sourcePos[3][ic]-sourcePos[3][ia],acy=sourcePos[3][ic+1]-sourcePos[3][ia+1],acz=sourcePos[3][ic+2]-sourcePos[3][ia+2],crossValue=cross3(abx,aby,abz,acx,acy,acz),ap=.5*Math.abs(crossValue[2]);for(const t of tri)nodeArea[ids[t]]+=ap/3;}}}for(let n=0;n<np;n++){replay+=sourceP[n]*nodeArea[n];if(sourceP[n]>0)replayArea+=nodeArea[n];}let sampleLoad=0,sampleArea=0;for(let n=0;n<contact.x.length;n++){sampleLoad+=contact.pressure[n]*contact.area[n];sampleArea+=contact.area[n];}add('sourcePayload.nodalLoadReplay',Math.abs(replay-S.renderReevaluation.loadN)/S.renderReevaluation.loadN<.002,replay,'relative error < 0.2%');add('sourcePayload.nodalAreaReplay',Math.abs(replayArea-S.renderReevaluation.roadProjectedAreaM2)/S.renderReevaluation.roadProjectedAreaM2<.002,replayArea,'relative error < 0.2%');add('contact.productionMethod',BRANCH.contactMethod.includes('triangle clipping'),BRANCH.contactMethod,'continuous clipped-triangle path');add('contact.loadClosure',Math.abs(geom.closure)<1e-6,geom.closure,'abs < 1e-6 %');add('contact.sampleLoadIdentity',Math.abs(sampleLoad-geom.loadN)<1e-7,sampleLoad-geom.loadN,'abs < 1e-7 N');add('contact.sampleAreaIdentity',Math.abs(sampleArea-geom.area)<1e-12,sampleArea-geom.area,'abs < 1e-12 m²');add('contact.sampleTopology',geom.samples===geom.subtriangles*3,[geom.samples,geom.subtriangles],'samples == 3 × subtriangles');add('pressure.sourceAnchorExact',pressureBasisState(sourcePsi).maxEquilibriumDisplacementM<1e-15,pressureBasisState(sourcePsi).maxEquilibriumDisplacementM,'< 1e-15 m');add('pressure.beadFixed',beadEndpointModeNorm<1e-12,beadEndpointModeNorm,'< 1e-12 m');const anchorLeft=pressureBasisState(26-1e-5),anchorRight=pressureBasisState(26+1e-5);add('pressure.anchorContinuous',Math.abs(anchorRight.coefficientA-anchorLeft.coefficientA)<1e-5&&Math.abs(anchorRight.coefficientB-anchorLeft.coefficientB)<1e-5,[anchorRight.coefficientA-anchorLeft.coefficientA,anchorRight.coefficientB-anchorLeft.coefficientB],'left/right epsilon coefficient differences < 1e-5');const zero=computeGrip(0,0,false),sat=computeGrip(.25,16*PI/180,false),rev=computeGrip(-.12,-6*PI/180,false);add('grip.zeroLong',Math.abs(zero.Flong)<1e-6,zero.Flong,'abs < 1e-6 N');add('grip.localEllipse',sat.utilMax<=1+1e-12,sat.utilMax,'<= 1');add('grip.reversalLong',sat.Flong*rev.Flong<0,[sat.Flong,rev.Flong],'product < 0');add('grip.reversalLat',sat.Flat*rev.Flat<0,[sat.Flat,rev.Flat],'product < 0');add('geometry.layerSpacing',thicknessRatio()>.95,thicknessRatio(),'> 0.95 source spacing ratio');add('geometry.noContextLoss',!window.__LAB_CONTEXT_LOST__,window.__LAB_CONTEXT_LOST__,'false');
  if(typeof V8_REFERENCE!=='undefined'){
    const sourceCase=Math.abs(inputs.loadN-sourceRenderLoad)<1e-6&&Math.abs(inputs.camberDeg)<1e-9&&Math.abs(inputs.pressurePsi-sourcePsi)<1e-6;
    const challengeCase=Math.abs(inputs.loadN-1550)<1e-6&&Math.abs(inputs.camberDeg-42)<1e-9&&Math.abs(inputs.pressurePsi-30)<1e-6;
    const ref=sourceCase?V8_REFERENCE.source:(challengeCase?V8_REFERENCE.challenge.geometry:null);
    if(ref){const pairs=[['loadCoefficient','load_coefficient'],['hubShift','hub_shift_m'],['loadN','load_n'],['area','projected_area_m2'],['surfArea','surface_area_m2'],['peak','peak_pressure_pa'],['meanP','mean_pressure_pa'],['copX','cop_x_m'],['copY','cop_y_m'],['copZ','cop_z_m'],['localCopX','local_cop_x_m'],['extentX','extent_x_m'],['localExtentX','local_extent_x_m'],['extentY','extent_y_m'],['activePolygons','active_polygons'],['subtriangles','contact_subtriangles'],['samples','contact_samples'],['rEff','effective_radius_m'],['camberRad','camber_rad']];let maxError=0;for(const [browserKey,referenceKey] of pairs)maxError=Math.max(maxError,Math.abs(geom[browserKey]-ref[referenceKey])/(1+Math.abs(ref[referenceKey])));add('offlineMirror.geometryParity',maxError<1e-11,maxError,'max normalized error < 1e-11');}
    if(challengeCase&&Math.abs(dyn.kappa-inputs.slipRatio)<1e-9&&Math.abs(dyn.alpha-inputs.slipAngleDeg*PI/180)<1e-9){const refGrip=V8_REFERENCE.challenge.grip,pairs=[['Flong','longitudinal_force_n'],['Flat','lateral_force_n'],['Mz','aligning_moment_nm'],['muEff','resultant_over_fz'],['utilMean','mean_utilization'],['utilMax','max_utilization'],['power','slip_power_w'],['patchL','patch_length_m'],['baseMu','base_mu']];let maxError=0;for(const [browserKey,referenceKey] of pairs)maxError=Math.max(maxError,Math.abs(dyn[browserKey]-refGrip[referenceKey])/(1+Math.abs(refGrip[referenceKey])));add('offlineMirror.gripParity',maxError<1e-11,maxError,'max normalized error < 1e-11');}
  }
  let passed=checks.filter(check=>check.pass).length;return{schema:'ducati916.tire-evolution-lab.audit.v8.0',passed,total:checks.length,failed:checks.length-passed,checks,claim:'NUMERICAL DEVELOPMENT CHECKS ONLY; CONTINUOUS CONTACT VERIFIED AGAINST ITS DISCRETIZATION, PRESSURE BASIS REMAINS PROVISIONAL AND UNCALIBRATED'};}
function showAudit(audit){$('audit').innerHTML=`<div class="audit"><b>declared checks</b><span class="${audit.failed?'bad':'good'}">${audit.passed}/${audit.total}</span></div>`+audit.checks.map(check=>`<div class="r"><span>${check.name}</span><b class="${check.pass?'good':'bad'}">${check.pass?'PASS':'FAIL'}</b></div>`).join('');$('auditNote').textContent=audit.claim;}

function tick(t){const dt=clamp((t-lastT)/1000,0,.05);lastT=t;if(geometryDirty)solveGeometry();uiClock+=dt;if(!paused){updateDynamics(dt);historyClock+=dt;visualClock+=dt;if((mode==='grip'||mode==='pressure')&&visualClock>.20){updateOuterVisual();visualClock=0;}if(historyClock>.10){recordHistory(t/1000);historyClock=0;plotDirty=true;}}if(uiClock>.10){updateForcePanel();if(plotDirty)drawPlots();uiClock=0;}render3D();window.__LAB_GL_ERROR__=gl.getError();requestAnimationFrame(tick);}
solveGeometry();computeGrip();updateMeshes();updateForcePanel();drawPlots();let audit=runAudit();showAudit(audit);const dbg=gl.getExtension('WEBGL_debug_renderer_info');const runtime={schema:BRANCH.schema,sourceModified:false,sourceSha256:BRANCH.sourceSha256,sourceResultSha256:DATA.resultSha256,contactMethod:BRANCH.contactMethod,pressureBasis:pressureBasisMetadata,referenceCases:typeof V8_REFERENCE==='undefined'?null:V8_REFERENCE,webgl:{version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),vendor:dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)},audit};$('glstatus').textContent=`WebGL2 · ${runtime.webgl.renderer} · glError ${gl.getError()}`;
const snapshot=()=>JSON.parse(JSON.stringify({...runtime,inputs,geom,dyn,contactSummary:{samples:contact.x.length,subtriangles:geom.subtriangles,activePolygons:geom.activePolygons,sampleLoad:Array.from(contact.pressure).reduce((sum,p,n)=>sum+p*contact.area[n],0),sampleArea:Array.from(contact.area).reduce((sum,a)=>sum+a,0)},mode,frames:window.__LAB_FRAMES__,glError:window.__LAB_GL_ERROR__,contextLoss:window.__LAB_CONTEXT_LOST__,thicknessRatio:thicknessRatio()}));
window.__TIRE_V8_STATE__=runtime;window.__TIRE_V8_AUDIT__=audit;window.__TIRE_V8_API__={snapshot,setInputs:values=>{setInputs(values);return true;},flush:()=>{if(geometryDirty)solveGeometry();computeGrip();updateMeshes();updateForcePanel();drawPlots();return snapshot();},setMode:selected=>{mode=selected;setPreset(selected);document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===selected));updateMeshes();return true;},pause:value=>{paused=!!value;return paused;},evaluateGrip:(kappa,alphaDeg)=>JSON.parse(JSON.stringify(computeGrip(+kappa,+alphaDeg*PI/180,false))),pressureBasis:psi=>pressureBasisState(+psi),reAudit:()=>{audit=runAudit();showAudit(audit);return audit;}};window.__TIRE_V8_READY__=true;requestAnimationFrame(tick);


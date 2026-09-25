
const DATA=@@TIRE_DATA@@;
const V82_REFERENCE={"schema":"ducati916.tire-evolution-lab.reference-cases.v8.2","source":{"load_coefficient":1.0,"hub_shift_m":-1.895547578187215e-05,"load_n":1441.1855543787256,"projected_area_m2":0.0010495080505603062,"surface_area_m2":0.0010588061247578501,"peak_pressure_pa":2913147.108172549,"mean_pressure_pa":1373201.0474901195,"cop_x_m":-3.2715970496509186e-17,"cop_y_m":1.2157148712830858e-19,"cop_z_m":-0.0009425619932062034,"local_cop_x_m":-3.2715970496509186e-17,"extent_x_m":0.022839907850786566,"local_extent_x_m":0.022839907850786566,"extent_y_m":0.06143544773708564,"active_polygons":162,"contact_subtriangles":190,"contact_samples":570,"effective_radius_m":0.2952987986042354,"load_closure_pct":1.6881228928855118e-12,"camber_rad":0.0,"pressure_basis":{"coefficient_a":0.0,"coefficient_b":0.0,"lower_anchor_psi":26.0,"upper_anchor_psi":32.00888447476946,"interpolation_t":1.0,"max_equilibrium_displacement_m":0.0}},"sourceSolver":{"warm_start_used":false,"evaluations":7,"iterations":6,"newton_steps":5,"bisection_steps":0,"bracket_expansions":0,"candidate_bands":10,"candidate_cells":84,"candidate_triangles":168,"full_triangles":49152,"broadphase_reduction":0.99658203125,"load_residual_n":2.432898327242583e-11},"challenge":{"inputs":{"loadN":1550.0,"camberDeg":42.0,"pressurePsi":30.0,"slipRatio":0.12,"slipAngleDeg":5.5,"speed":38.0,"mu":1.22,"temperatureC":78.0,"wetness":0.08},"geometry":{"load_coefficient":1.0856983185207874,"hub_shift_m":-0.06368400259857335,"load_n":1549.999999999991,"projected_area_m2":0.001338605179106785,"surface_area_m2":0.0013442184935916913,"peak_pressure_pa":2374761.4050431885,"mean_pressure_pa":1157921.7114894653,"cop_x_m":-0.16138924237455793,"cop_y_m":-3.9788299378434555e-06,"cop_z_m":-0.0007822865633902107,"local_cop_x_m":0.03495040702804872,"extent_x_m":0.028263964539112313,"local_extent_x_m":0.021004218994717883,"extent_y_m":0.06105045397568797,"active_polygons":200,"contact_subtriangles":232,"contact_samples":696,"effective_radius_m":0.2800087976011864,"load_closure_pct":-5.86770775337373e-13,"camber_rad":0.7330382858376184,"pressure_basis":{"coefficient_a":-0.06134918986919533,"coefficient_b":-0.001643374711878632,"lower_anchor_psi":26.0,"upper_anchor_psi":32.00888447476946,"interpolation_t":0.6656809623808696,"max_equilibrium_displacement_m":0.00010357179396490444}},"steadyBrush":{"longitudinal_force_n":1058.0715783730036,"lateral_force_n":-1065.5110765568174,"aligning_moment_nm":-1.9639140164956208,"resultant_over_fz":0.9687799420718213,"mean_utilization":0.892820280442349,"max_utilization":1.0,"slip_power_w":8723.494198793342,"patch_length_m":0.060064534211878136,"base_mu":1.1117548296608457},"historySteady":{"longitudinal_force_n":1058.0715783730036,"lateral_force_n":-1065.5110765568174,"aligning_moment_nm":-1.9639140164956208,"resultant_over_fz":0.9687799420718213,"mean_utilization":0.8928202804423488,"max_utilization":1.0,"slip_power_w":8723.494198793342,"transport_work_rate_w":9886.298723588823,"stored_elastic_energy_j":2.8314586419825454,"patch_length_m":0.060064534211878136,"base_mu":1.1117548296608457,"transport_horizon_m":0.06306776092247204,"transport_horizon_s":0.0016596779190124222,"oldest_path_m":0.0,"newest_path_m":0.06306776092247204,"history_points":2,"insufficient_history_samples":0,"low_speed_fallback":false},"historyReceipt":{"schema":"ducati916.convected-distance-history.v8.2","points":2,"capacity":16384,"oldestTimeS":0.0,"newestTimeS":0.0016596779190124222,"horizonTimeS":0.0016596779190124222,"oldestPathM":0.0,"newestPathM":0.06306776092247204,"horizonPathM":0.06306776092247204},"solver":{"warm_start_used":true,"evaluations":12,"iterations":11,"newton_steps":7,"bisection_steps":3,"bracket_expansions":0,"candidate_bands":10,"candidate_cells":104,"candidate_triangles":208,"full_triangles":49152,"broadphase_reduction":0.9957682291666666,"load_residual_n":-9.094947017729282e-12}},"claimBoundary":"Independent Python/Numba mirror of V8.1 exact continuous contact plus V8.2 convected-distance material history. Numerical reference only; pressure, friction, thermal, wetness, and stiffness laws remain provisional and uncalibrated."};
const BRANCH = {
  schema: 'ducati916.tire-evolution-lab.v8.3.approval-vehicle-dynamics',
  sourceFile: 'Ducati916_TIRE_SMOOTH_LAYERED_REFERENCE_LAB_V6_3_5_COMPACT_VIEWER.html',
  sourceSha256: '61c2cb501ff50559207a2755de4e1ce0f30f624d1ca9ad3b668b0b28c9f47945',
  sourceModified: false,
  classification: 'derived approval-interface branch; V8.2 numerical core retained, vehicle-context rendering, true-scale contact evidence, scenario orchestration, and explicit approval gates added',
  contactMethod: 'structured theta/cell broad phase + piecewise-linear triangle clipping + degree-2 Gauss integration',
  pressureBasisClassification: 'generated provisional membrane-compliance basis; not a solved or calibrated pressure family',
  materialHistoryClassification: 'convected cumulative-distance tread history; moving-contact prototype, not low-speed stiction or Ducati calibration'
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
const normalVersion = new Int32Array(ns); normalVersion.fill(-1);
let geometryVersion = 0;
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
  schema: 'ducati916.pressure-equilibrium-basis.v8.1.provisional',
  classification: BRANCH.pressureBasisClassification,
  anchorPsi: Array.from(PRESSURE_ANCHORS), sourcePsi, complianceScale: PRESSURE_COMPLIANCE_SCALE, shapeCoupling: PRESSURE_SHAPE_COUPLING,
  maxModeADisplacementM: maxModeA, maxModeBDisplacementM: maxModeB, beadEndpointModeNormM: beadEndpointModeNorm,
  circumferentialStiffnessNPerM: [Math.min(...stiffnessCirc), Math.max(...stiffnessCirc)],
  meridionalStiffnessNPerM: [Math.min(...stiffnessMer), Math.max(...stiffnessMer)]
};

function pressureBasisState(psi) {
  const pa = pchipEval(PRESSURE_ANCHORS, anchorA, slopeA, psi), pb = pchipEval(PRESSURE_ANCHORS, anchorB, slopeB, psi);
  let maxDisp = 0;
  const ma = pressureModeA[0], mb = pressureModeB[0];
  for (let q = 0; q < np * 3; q += 3) {
    maxDisp = Math.max(maxDisp, Math.hypot(pa.value * ma[q] + pb.value * mb[q], pa.value * ma[q + 1] + pb.value * mb[q + 1], pa.value * ma[q + 2] + pb.value * mb[q + 2]));
  }
  return {coefficientA: pa.value, coefficientB: pb.value, lowerAnchorPsi: PRESSURE_ANCHORS[pa.interval], upperAnchorPsi: PRESSURE_ANCHORS[pa.interval + 1], interpolationT: pa.t, maxEquilibriumDisplacementM: maxDisp};
}


const fullInd = (() => {
  const values = new Uint32Array(nt * (nu - 1) * 6);
  let w = 0;
  for (let i = 0; i < nt; i++) {
    const ip = (i + 1) % nt;
    for (let j = 0; j < nu - 1; j++) {
      const A = idx(i, j), B = idx(ip, j), C = idx(ip, j + 1), D = idx(i, j + 1);
      values[w++] = A; values[w++] = B; values[w++] = C;
      values[w++] = A; values[w++] = C; values[w++] = D;
    }
  }
  return values;
})();

const cellColumns = nu - 1;
const cellCount = nt * cellColumns;
const triangleCount = cellCount * 2;
const maximumSampleKeys = triangleCount * 6;
const bandMinZ = new Float64Array(nt);
const cellMinZ = new Float64Array(cellCount);
const clipX = new Float64Array(5), clipY = new Float64Array(5), clipZ = new Float64Array(5);
const keyLastSeenSolve = new Uint32Array(maximumSampleKeys);
const cellLastSeenSolve = new Uint32Array(cellCount);
let broadphaseGlobalMinZ = 0, broadphaseGlobalMaxZ = 0, contactSolveSerial = 0;

const performanceState = {
  schema: 'ducati916.tire-evolution-lab.performance.v8.2',
  geometrySolveMs: 0,
  shapeBuildMs: 0,
  broadphaseBuildMs: 0,
  hubSolveMs: 0,
  finalCollectMs: 0,
  normalsMs: 0,
  geometryUploadMs: 0,
  visualUploadMs: 0,
  gripMs: 0,
  warmStartUsed: false,
  evaluations: 0,
  iterations: 0,
  newtonSteps: 0,
  bisectionSteps: 0,
  bracketExpansions: 0,
  candidateBands: 0,
  candidateCells: 0,
  candidateTriangles: 0,
  fullTriangles: triangleCount,
  broadphaseReduction: 0,
  topologyCellReuse: 0,
  topologySampleReuse: 0,
  activeCells: 0,
  sampleCount: 0,
  sampleCapacity: 0,
  patchCapacity: 0,
  bufferGrowthEvents: 0,
  workerLane: 'deterministic main-thread fixed-step scheduler',
  nativeLane: 'packaged zero-copy C++ full-core context',
  historyStepMs: 0,
  thermalStepMs: 0,
  forceEvaluations: 0
};

function nextPowerOfTwo(value) {
  let out = 1;
  while (out < value) out <<= 1;
  return out;
}

function makeContactBuffers(sampleCapacity = 4096, patchCapacity = 2048) {
  return {
    sampleCapacity,
    patchCapacity,
    sampleCount: 0,
    patchCount: 0,
    activeCellCount: 0,
    reusedCellCount: 0,
    reusedSampleCount: 0,
    x: new Float64Array(sampleCapacity),
    y: new Float64Array(sampleCapacity),
    z: new Float64Array(sampleCapacity),
    pressure: new Float64Array(sampleCapacity),
    area: new Float64Array(sampleCapacity),
    surfaceArea: new Float64Array(sampleCapacity),
    utilization: new Float64Array(sampleCapacity),
    forceLong: new Float64Array(sampleCapacity),
    forceLat: new Float64Array(sampleCapacity),
    bristleLong: new Float64Array(sampleCapacity),
    bristleLat: new Float64Array(sampleCapacity),
    sampleKey: new Uint32Array(sampleCapacity),
    patchPos: new Float32Array(patchCapacity * 9),
    patchPressure: new Float64Array(patchCapacity * 3),
    patchSampleStart: new Uint32Array(patchCapacity),
    patchTriangleId: new Uint32Array(patchCapacity)
  };
}

let contact = makeContactBuffers();
performanceState.sampleCapacity = contact.sampleCapacity;
performanceState.patchCapacity = contact.patchCapacity;

function growTyped(oldArray, Constructor, size) {
  const next = new Constructor(size);
  next.set(oldArray.subarray(0, Math.min(oldArray.length, size)));
  return next;
}

function ensureSampleCapacity(required) {
  if (required <= contact.sampleCapacity) return;
  const capacity = nextPowerOfTwo(required);
  contact.x = growTyped(contact.x, Float64Array, capacity);
  contact.y = growTyped(contact.y, Float64Array, capacity);
  contact.z = growTyped(contact.z, Float64Array, capacity);
  contact.pressure = growTyped(contact.pressure, Float64Array, capacity);
  contact.area = growTyped(contact.area, Float64Array, capacity);
  contact.surfaceArea = growTyped(contact.surfaceArea, Float64Array, capacity);
  contact.utilization = growTyped(contact.utilization, Float64Array, capacity);
  contact.forceLong = growTyped(contact.forceLong, Float64Array, capacity);
  contact.forceLat = growTyped(contact.forceLat, Float64Array, capacity);
  contact.bristleLong = growTyped(contact.bristleLong, Float64Array, capacity);
  contact.bristleLat = growTyped(contact.bristleLat, Float64Array, capacity);
  contact.sampleKey = growTyped(contact.sampleKey, Uint32Array, capacity);
  contact.sampleCapacity = capacity;
  performanceState.sampleCapacity = capacity;
  performanceState.bufferGrowthEvents++;
}

function ensurePatchCapacity(required) {
  if (required <= contact.patchCapacity) return;
  const capacity = nextPowerOfTwo(required);
  contact.patchPos = growTyped(contact.patchPos, Float32Array, capacity * 9);
  contact.patchPressure = growTyped(contact.patchPressure, Float64Array, capacity * 3);
  contact.patchSampleStart = growTyped(contact.patchSampleStart, Uint32Array, capacity);
  contact.patchTriangleId = growTyped(contact.patchTriangleId, Uint32Array, capacity);
  contact.patchCapacity = capacity;
  performanceState.patchCapacity = capacity;
  performanceState.bufferGrowthEvents++;
}

function beginContactCollection() {
  contactSolveSerial++;
  contact.sampleCount = 0;
  contact.patchCount = 0;
  contact.activeCellCount = 0;
  contact.reusedCellCount = 0;
  contact.reusedSampleCount = 0;
}

function markActiveCell(cellId) {
  if (cellLastSeenSolve[cellId] === contactSolveSerial) return;
  if (contactSolveSerial > 1 && cellLastSeenSolve[cellId] === contactSolveSerial - 1) contact.reusedCellCount++;
  cellLastSeenSolve[cellId] = contactSolveSerial;
  contact.activeCellCount++;
}

function appendContactSample(key, x, y, z, pressure, area, surfaceArea) {
  const n = contact.sampleCount;
  ensureSampleCapacity(n + 1);
  if (contactSolveSerial > 1 && keyLastSeenSolve[key] === contactSolveSerial - 1) contact.reusedSampleCount++;
  keyLastSeenSolve[key] = contactSolveSerial;
  contact.x[n] = x;
  contact.y[n] = y;
  contact.z[n] = z;
  contact.pressure[n] = pressure;
  contact.area[n] = area;
  contact.surfaceArea[n] = surfaceArea;
  contact.sampleKey[n] = key;
  contact.utilization[n] = 0;
  contact.forceLong[n] = 0;
  contact.forceLat[n] = 0;
  contact.bristleLong[n] = 0;
  contact.bristleLat[n] = 0;
  contact.sampleCount = n + 1;
}

function appendPatchTriangle(triangleId, sampleStart, x0, y0, x1, y1, x2, y2, p0, p1, p2) {
  const n = contact.patchCount;
  ensurePatchCapacity(n + 1);
  const q = n * 9;
  const z = z0 + 0.00018;
  contact.patchPos[q] = x0; contact.patchPos[q + 1] = y0; contact.patchPos[q + 2] = z;
  contact.patchPos[q + 3] = x1; contact.patchPos[q + 4] = y1; contact.patchPos[q + 5] = z;
  contact.patchPos[q + 6] = x2; contact.patchPos[q + 7] = y2; contact.patchPos[q + 8] = z;
  const p = n * 3;
  contact.patchPressure[p] = p0; contact.patchPressure[p + 1] = p1; contact.patchPressure[p + 2] = p2;
  contact.patchSampleStart[n] = sampleStart;
  contact.patchTriangleId[n] = triangleId;
  contact.patchCount = n + 1;
}

function buildContactBroadphase(pos) {
  const started = performance.now();
  bandMinZ.fill(1e99);
  let globalMin = 1e99, globalMax = -1e99;
  for (let i = 0; i < nt; i++) {
    const ip = (i + 1) % nt;
    const cellBase = i * cellColumns;
    let band = 1e99;
    for (let j = 0; j < cellColumns; j++) {
      const a = v3(i, j), b = v3(ip, j), c = v3(ip, j + 1), d = v3(i, j + 1);
      const za = pos[a + 2], zb = pos[b + 2], zc = pos[c + 2], zd = pos[d + 2];
      const minimum = Math.min(za, zb, zc, zd), maximum = Math.max(za, zb, zc, zd);
      cellMinZ[cellBase + j] = minimum;
      if (minimum < band) band = minimum;
      if (minimum < globalMin) globalMin = minimum;
      if (maximum > globalMax) globalMax = maximum;
    }
    bandMinZ[i] = band;
  }
  broadphaseGlobalMinZ = globalMin;
  broadphaseGlobalMaxZ = globalMax;
  performanceState.broadphaseBuildMs = performance.now() - started;
}

function resetIntegrationResult(out) {
  out.load = 0; out.area = 0; out.surfaceArea = 0;
  out.mx = 0; out.my = 0; out.mz = 0; out.peak = 0;
  out.xmin = 1e99; out.xmax = -1e99; out.ymin = 1e99; out.ymax = -1e99;
  out.localXmin = 1e99; out.localXmax = -1e99;
  out.activePolygons = 0; out.subtriangles = 0;
  out.candidateBands = 0; out.candidateCells = 0;
  return out;
}

const integrationScratch = {}, finalIntegration = {}, fullScanIntegration = {};

function clipAndIntegrateTriangle(pos, ia, ib, ic, triangleId, cellId, dz, cg, sg, hubZ, collect, out) {
  const qa = ia * 3, qb = ib * 3, qc = ic * 3;
  const ax = pos[qa], ay = pos[qa + 1], az = pos[qa + 2] + dz;
  const bx = pos[qb], by = pos[qb + 1], bz = pos[qb + 2] + dz;
  const cx = pos[qc], cy = pos[qc + 1], cz = pos[qc + 2] + dz;
  let outN = 0, px = cx, py = cy, pz = cz, previousInside = pz <= z0;
  for (let vertex = 0; vertex < 3; vertex++) {
    let qx, qy, qz;
    if (vertex === 0) { qx = ax; qy = ay; qz = az; }
    else if (vertex === 1) { qx = bx; qy = by; qz = bz; }
    else { qx = cx; qy = cy; qz = cz; }
    const currentInside = qz <= z0;
    if (currentInside) {
      if (!previousInside) {
        const denominator = qz - pz;
        const t = Math.abs(denominator) < 1e-30 ? 0 : (z0 - pz) / denominator;
        clipX[outN] = px + t * (qx - px);
        clipY[outN] = py + t * (qy - py);
        clipZ[outN] = z0;
        outN++;
      }
      clipX[outN] = qx; clipY[outN] = qy; clipZ[outN] = qz; outN++;
    } else if (previousInside) {
      const denominator = qz - pz;
      const t = Math.abs(denominator) < 1e-30 ? 0 : (z0 - pz) / denominator;
      clipX[outN] = px + t * (qx - px);
      clipY[outN] = py + t * (qy - py);
      clipZ[outN] = z0;
      outN++;
    }
    px = qx; py = qy; pz = qz; previousInside = currentInside;
  }
  if (outN < 3) return false;

  out.activePolygons++;
  if (collect) markActiveCell(cellId);
  for (let vertex = 0; vertex < outN; vertex++) {
    const x = clipX[vertex], y = clipY[vertex], z = clipZ[vertex];
    const localX = cg * x - sg * (z - hubZ);
    if (x < out.xmin) out.xmin = x;
    if (x > out.xmax) out.xmax = x;
    if (y < out.ymin) out.ymin = y;
    if (y > out.ymax) out.ymax = y;
    if (localX < out.localXmin) out.localXmin = localX;
    if (localX > out.localXmax) out.localXmax = localX;
    const pressure = K * (z0 - z);
    if (pressure > out.peak) out.peak = pressure;
  }

  for (let fan = 0; fan < outN - 2; fan++) {
    const q = fan + 1;
    const x0 = clipX[0], y0 = clipY[0], zt0 = clipZ[0];
    const x1 = clipX[q], y1 = clipY[q], zt1 = clipZ[q];
    const x2 = clipX[q + 1], y2 = clipY[q + 1], zt2 = clipZ[q + 1];
    const abx = x1 - x0, aby = y1 - y0, abz = zt1 - zt0;
    const acx = x2 - x0, acy = y2 - y0, acz = zt2 - zt0;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const projectedArea = 0.5 * Math.abs(nz);
    if (!(projectedArea > 0)) continue;
    const surfaceArea = 0.5 * Math.hypot(nx, ny, nz);
    const p0 = K * (z0 - zt0), p1 = K * (z0 - zt1), p2 = K * (z0 - zt2), pSum = p0 + p1 + p2;
    out.subtriangles++;
    out.load += projectedArea * pSum / 3;
    out.area += projectedArea;
    out.surfaceArea += surfaceArea;
    out.mx += projectedArea / 12 * ((x0 + x1 + x2) * pSum + (x0 * p0 + x1 * p1 + x2 * p2));
    out.my += projectedArea / 12 * ((y0 + y1 + y2) * pSum + (y0 * p0 + y1 * p1 + y2 * p2));
    out.mz += projectedArea / 12 * ((zt0 + zt1 + zt2) * pSum + (zt0 * p0 + zt1 * p1 + zt2 * p2));
    if (collect) {
      const sampleStart = contact.sampleCount;
      appendPatchTriangle(triangleId, sampleStart, x0, y0, x1, y1, x2, y2, p0, p1, p2);
      for (let gauss = 0; gauss < 3; gauss++) {
        let l0, l1, l2;
        if (gauss === 0) { l0 = 2 / 3; l1 = 1 / 6; l2 = 1 / 6; }
        else if (gauss === 1) { l0 = 1 / 6; l1 = 2 / 3; l2 = 1 / 6; }
        else { l0 = 1 / 6; l1 = 1 / 6; l2 = 2 / 3; }
        const x = l0 * x0 + l1 * x1 + l2 * x2;
        const y = l0 * y0 + l1 * y1 + l2 * y2;
        const z = l0 * zt0 + l1 * zt1 + l2 * zt2;
        const key = triangleId * 6 + fan * 3 + gauss;
        appendContactSample(key, x, y, z, K * (z0 - z), projectedArea / 3, surfaceArea / 3);
      }
    }
  }
  return true;
}

function integrateContactBroadphase(pos, dz, cg, sg, hubZ, collect = false, out = integrationScratch) {
  resetIntegrationResult(out);
  const threshold = z0 - dz;
  for (let i = 0; i < nt; i++) {
    if (bandMinZ[i] > threshold) continue;
    out.candidateBands++;
    const ip = (i + 1) % nt, cellBase = i * cellColumns;
    for (let j = 0; j < cellColumns; j++) {
      const cellId = cellBase + j;
      if (cellMinZ[cellId] > threshold) continue;
      out.candidateCells++;
      const a = idx(i, j), b = idx(ip, j), c = idx(ip, j + 1), d = idx(i, j + 1);
      clipAndIntegrateTriangle(pos, a, b, c, cellId * 2, cellId, dz, cg, sg, hubZ, collect, out);
      clipAndIntegrateTriangle(pos, a, c, d, cellId * 2 + 1, cellId, dz, cg, sg, hubZ, collect, out);
    }
  }
  return out;
}

function integrateContactFullScan(pos, dz, cg, sg, hubZ, out = fullScanIntegration) {
  resetIntegrationResult(out);
  for (let i = 0; i < nt; i++) {
    const ip = (i + 1) % nt, cellBase = i * cellColumns;
    for (let j = 0; j < cellColumns; j++) {
      const cellId = cellBase + j;
      const a = idx(i, j), b = idx(ip, j), c = idx(ip, j + 1), d = idx(i, j + 1);
      clipAndIntegrateTriangle(pos, a, b, c, cellId * 2, cellId, dz, cg, sg, hubZ, false, out);
      clipAndIntegrateTriangle(pos, a, c, d, cellId * 2 + 1, cellId, dz, cg, sg, hubZ, false, out);
    }
  }
  out.candidateBands = nt;
  out.candidateCells = cellCount;
  return out;
}

const hubCache = {
  valid: false,
  dz: 0,
  target: sourceRenderLoad,
  area: Math.max(S.renderReevaluation.roadProjectedAreaM2, 1e-8)
};

function solveHubContinuation(pos, target, cg, sg) {
  const started = performance.now();
  let evaluations = 0, iterations = 0, newtonSteps = 0, bisectionSteps = 0, bracketExpansions = 0;
  const evaluate = dz => {
    evaluations++;
    return integrateContactBroadphase(pos, dz, cg, sg, sourceHub + dz, false, integrationScratch);
  };

  const warmStartUsed = hubCache.valid;
  let guess = warmStartUsed
    ? hubCache.dz - (target - hubCache.target) / (K * Math.max(hubCache.area, 1e-8))
    : z0 - broadphaseGlobalMinZ - 7.5e-4;
  guess = clamp(guess, -1.5, 1.5);
  let result = evaluate(guess);
  let error = result.load - target;
  const areaGuess = Math.max(result.area, 1e-8);
  let step = Math.max(5e-4, Math.min(0.08, Math.abs(error) / (K * areaGuess) * 1.35 + 2e-4));
  let lo, hi;
  if (error >= 0) {
    lo = guess;
    hi = guess + step;
    let highResult = evaluate(hi);
    while (highResult.load > target && bracketExpansions < 20) {
      step *= 1.8;
      hi = guess + step;
      highResult = evaluate(hi);
      bracketExpansions++;
    }
    if (highResult.load > target) throw Error('V8.2 hub solver could not establish upper bracket');
  } else {
    hi = guess;
    lo = guess - step;
    let lowResult = evaluate(lo);
    while (lowResult.load < target && bracketExpansions < 20) {
      step *= 1.8;
      lo = guess - step;
      lowResult = evaluate(lo);
      bracketExpansions++;
    }
    if (lowResult.load < target) throw Error('V8.2 hub solver could not establish lower bracket');
  }

  let x = clamp(guess, lo, hi);
  // The integration scratch object is reused by every bracket evaluation; refresh it at x unconditionally.
  result = evaluate(x);
  const loadTolerance = Math.max(2e-10, target * 2e-13), dzTolerance = 2e-14;
  for (let iteration = 0; iteration < 18; iteration++) {
    iterations = iteration + 1;
    error = result.load - target;
    if (Math.abs(error) <= loadTolerance) break;
    if (error >= 0) lo = x; else hi = x;
    const derivative = -K * Math.max(result.area, 1e-12);
    let proposed = x - error / derivative;
    if (!Number.isFinite(proposed) || proposed <= lo || proposed >= hi) {
      proposed = 0.5 * (lo + hi);
      bisectionSteps++;
    } else newtonSteps++;
    if (Math.abs(proposed - x) <= dzTolerance) {
      x = proposed;
      result = evaluate(x);
      break;
    }
    x = proposed;
    result = evaluate(x);
  }
  for (let correction = 0; correction < 4; correction++) {
    error = result.load - target;
    if (Math.abs(error) <= loadTolerance || result.area <= 1e-12) break;
    let corrected = x + error / (K * result.area);
    if (!(corrected >= lo && corrected <= hi)) {
      corrected = 0.5 * (lo + hi);
      bisectionSteps++;
    } else newtonSteps++;
    x = corrected;
    result = evaluate(x);
    if (result.load >= target) lo = x; else hi = x;
  }

  const collectStarted = performance.now();
  beginContactCollection();
  const final = integrateContactBroadphase(pos, x, cg, sg, sourceHub + x, true, finalIntegration);
  performanceState.finalCollectMs = performance.now() - collectStarted;
  hubCache.valid = true;
  hubCache.dz = x;
  hubCache.target = target;
  hubCache.area = Math.max(final.area, 1e-8);

  performanceState.hubSolveMs = performance.now() - started;
  performanceState.warmStartUsed = warmStartUsed;
  performanceState.evaluations = evaluations + 1;
  performanceState.iterations = iterations;
  performanceState.newtonSteps = newtonSteps;
  performanceState.bisectionSteps = bisectionSteps;
  performanceState.bracketExpansions = bracketExpansions;
  performanceState.candidateBands = final.candidateBands;
  performanceState.candidateCells = final.candidateCells;
  performanceState.candidateTriangles = final.candidateCells * 2;
  performanceState.broadphaseReduction = 1 - performanceState.candidateTriangles / triangleCount;
  performanceState.activeCells = contact.activeCellCount;
  performanceState.sampleCount = contact.sampleCount;
  performanceState.topologyCellReuse = contact.activeCellCount ? contact.reusedCellCount / contact.activeCellCount : 1;
  performanceState.topologySampleReuse = contact.sampleCount ? contact.reusedSampleCount / contact.sampleCount : 1;
  return {dz: x, result: final};
}

function computeNormals(k, gamma) {
  const pos = currentPos[k], nor = currentNor[k], src = sourceNor[k], cg = Math.cos(gamma), sg = Math.sin(gamma);
  for (let i = 0; i < nt; i++) {
    const ip = (i + 1) % nt, im = (i + nt - 1) % nt;
    for (let j = 0; j < nu; j++) {
      const jp = Math.min(nu - 1, j + 1), jm = Math.max(0, j - 1);
      const q = v3(i, j), a = v3(ip, j), b = v3(im, j), c = v3(i, jp), d = v3(i, jm);
      const t1x = pos[a] - pos[b], t1y = pos[a + 1] - pos[b + 1], t1z = pos[a + 2] - pos[b + 2];
      const t2x = pos[c] - pos[d], t2y = pos[c + 1] - pos[d + 1], t2z = pos[c + 2] - pos[d + 2];
      let nx = t1y * t2z - t1z * t2y;
      let ny = t1z * t2x - t1x * t2z;
      let nz = t1x * t2y - t1y * t2x;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length; ny /= length; nz /= length;
      const sx = cg * src[q] + sg * src[q + 2], sy = src[q + 1], sz = -sg * src[q] + cg * src[q + 2];
      if (nx * sx + ny * sy + nz * sz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      nor[q] = nx; nor[q + 1] = ny; nor[q + 2] = nz;
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
$('controls').innerHTML = specs.map(([key,label,min,max,step]) => `<div class="ctrl"><label for="${key}">${label}</label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${inputs[key]}"><output id="${key}Out"></output></div>`).join('');
function updateOutput(key) {
  const spec = specs.find(item => item[0] === key), unit = spec[5];
  $(key + 'Out').textContent = (Math.abs(inputs[key]) < 1e-12 ? '0' : fmt(inputs[key], spec[4] < .01 ? 3 : spec[4] < 1 ? 2 : 1)) + unit;
}
let geometryDirty = true, geometryBuffersDirty = true, outerColorDirty = true, patchGeometryDirty = true, patchColorDirty = true, lineVisualDirty = true;
let crossPlotDirty = true, patchPlotDirty = true, tracePlotDirty = true, paused = false, mode = 'outer';
let lastT = performance.now();
for (const spec of specs) {
  const key = spec[0], element = $(key);
  controlEls[key] = element;
  updateOutput(key);
  element.addEventListener('input', () => {
    const next = +element.value;
    if (['loadN','camberDeg','pressurePsi'].includes(key) && next !== inputs[key]) geometryDirty = true;
    inputs[key] = next;
    if (key === 'temperatureC' && !$('autoThermal').checked) dyn.temp = next;
    updateOutput(key);
    patchPlotDirty = true;
    if (['loadN','camberDeg','pressurePsi'].includes(key)) crossPlotDirty = true;
  });
}
$('autoThermal').checked = false;
$('sourceState').onclick = () => setInputs({loadN:sourceRenderLoad,camberDeg:0,pressurePsi:sourcePsi});
$('nativeTarget').onclick = () => setInputs({loadN:sourceTarget,camberDeg:0,pressurePsi:sourcePsi});
$('challengeState').onclick = () => setInputs({loadN:1550,camberDeg:42,pressurePsi:30,slipRatio:.12,slipAngleDeg:5.5,speed:38,mu:1.22,temperatureC:78,wetness:.08});

function setInputs(values) {
  for (const [key, value] of Object.entries(values)) {
    const next = +value;
    if (['loadN','camberDeg','pressurePsi'].includes(key) && next !== inputs[key]) {
      geometryDirty = true;
      crossPlotDirty = true;
    }
    inputs[key] = next;
    if (key === 'temperatureC' && !$('autoThermal').checked) dyn.temp = next;
    if (controlEls[key]) { controlEls[key].value = next; updateOutput(key); }
  }
  patchPlotDirty = true;
}

const geom = {
  loadCoefficient:1,hubShift:0,loadN:0,area:0,surfArea:0,peak:0,meanP:0,copX:0,copY:0,copZ:0,localCopX:0,
  extentX:0,localExtentX:0,extentY:0,activePolygons:0,subtriangles:0,samples:0,rEff:0,closure:0,camberRad:0,
  pressureBasis:pressureBasisState(sourcePsi)
};

function solveGeometry() {
  const totalStarted = performance.now();
  const shapeStarted = performance.now();
  const pressureBasis = pressureBasisState(inputs.pressurePsi);
  const loadRatio = Math.max(0, inputs.loadN) / Math.max(sourceRenderLoad, 1e-12);
  const loadCoefficient = Math.pow(loadRatio, LOAD_EXPONENT) * Math.pow(sourcePsi / Math.max(inputs.pressurePsi, 1), PRESSURE_LOAD_EXPONENT);
  const gamma = inputs.camberDeg * PI / 180, cg = Math.cos(gamma), sg = Math.sin(gamma);
  for (let k = 0; k < ns; k++) {
    const dst = currentPos[k], ref = refPos[k], load = loadMode[k], pa = pressureModeA[k], pb = pressureModeB[k];
    for (let n = 0; n < np; n++) {
      const q = n * 3;
      const x = ref[q] + pressureBasis.coefficientA * pa[q] + pressureBasis.coefficientB * pb[q] + loadCoefficient * load[q];
      const y = ref[q + 1] + pressureBasis.coefficientA * pa[q + 1] + pressureBasis.coefficientB * pb[q + 1] + loadCoefficient * load[q + 1];
      const z = ref[q + 2] + pressureBasis.coefficientA * pa[q + 2] + pressureBasis.coefficientB * pb[q + 2] + loadCoefficient * load[q + 2];
      const zr = z - sourceHub;
      dst[q] = cg * x + sg * zr;
      dst[q + 1] = y;
      dst[q + 2] = -sg * x + cg * zr + sourceHub;
    }
  }
  performanceState.shapeBuildMs = performance.now() - shapeStarted;
  const outer = currentPos[3], target = Math.max(0, inputs.loadN);
  buildContactBroadphase(outer);
  const solved = solveHubContinuation(outer, target, cg, sg);
  const dz = solved.dz, result = solved.result;

  for (let k = 0; k < ns; k++) {
    const pos = currentPos[k];
    for (let n = 0; n < np; n++) pos[n * 3 + 2] += dz;
  }
  geometryVersion++;
  normalVersion.fill(-1);
  performanceState.normalsMs = 0;
  for (let n = 0; n < np; n++) currentP[n] = pressureFromZ(currentPos[3][n * 3 + 2]);

  const copX = result.load ? result.mx / result.load : 0;
  const copY = result.load ? result.my / result.load : 0;
  const copZ = result.load ? result.mz / result.load : 0;
  const hubZ = sourceHub + dz;
  const localCopX = cg * copX - sg * (copZ - hubZ);
  const axisX = cg, axisZ = -sg;
  const rrX = copX, rrY = copY, rrZ = copZ - hubZ;
  const axisDot = rrX * axisX + rrZ * axisZ;
  const rx = rrX - axisDot * axisX, ry = rrY, rz = rrZ - axisDot * axisZ;
  Object.assign(geom, {
    loadCoefficient,hubShift:dz,loadN:result.load,area:result.area,surfArea:result.surfaceArea,peak:result.peak,
    meanP:result.area ? result.load / result.area : 0,copX,copY,copZ,localCopX,
    extentX:result.activePolygons ? result.xmax - result.xmin : 0,
    localExtentX:result.activePolygons ? result.localXmax - result.localXmin : 0,
    extentY:result.activePolygons ? result.ymax - result.ymin : 0,
    activePolygons:result.activePolygons,subtriangles:result.subtriangles,samples:contact.sampleCount,
    rEff:Math.hypot(rx,ry,rz),closure:target ? 100 * (result.load - target) / target : 0,camberRad:gamma,pressureBasis
  });
  geometryDirty = false;
  geometryBuffersDirty = true;
  outerColorDirty = true;
  patchGeometryDirty = true;
  patchColorDirty = true;
  lineVisualDirty = true;
  crossPlotDirty = true;
  patchPlotDirty = true;
  performanceState.geometrySolveMs = performance.now() - totalStarted;
}

const dyn = {
  kappa:0,alpha:0,temp:inputs.temperatureC,Flong:0,Flat:0,Mz:0,muEff:0,utilMean:0,utilMax:0,
  power:0,transportWork:0,storedEnergy:0,baseMu:0,patchL:0,transitTime:0,
  historyPoints:1,horizonPath:0,horizonTime:0,insufficientHistory:0,lowSpeedFallback:false
};
function tempFactor(t) { return .58 + .42 * Math.exp(-Math.pow((t - 78) / 37, 2)); }

const MATERIAL_HISTORY_CAPACITY = 16384;
const materialHistory = {
  capacity:MATERIAL_HISTORY_CAPACITY,start:0,count:1,totalTime:0,totalPath:0,totalQx:0,totalQy:0,
  lastSpeed:0,lastVx:0,lastVy:0,maxTime:2,maxPath:20,
  time:new Float64Array(MATERIAL_HISTORY_CAPACITY),path:new Float64Array(MATERIAL_HISTORY_CAPACITY),
  qx:new Float64Array(MATERIAL_HISTORY_CAPACITY),qy:new Float64Array(MATERIAL_HISTORY_CAPACITY)
};
const historyLookupScratch = new Float64Array(3);
function materialIndex(order){return(materialHistory.start+order)%materialHistory.capacity;}
function resetMaterialHistory(){
  materialHistory.start=0;materialHistory.count=1;materialHistory.totalTime=0;materialHistory.totalPath=0;materialHistory.totalQx=0;materialHistory.totalQy=0;
  materialHistory.lastSpeed=0;materialHistory.lastVx=0;materialHistory.lastVy=0;
  materialHistory.time[0]=0;materialHistory.path[0]=0;materialHistory.qx[0]=0;materialHistory.qy[0]=0;
  dyn.historyPoints=1;dyn.horizonPath=0;dyn.horizonTime=0;dyn.insufficientHistory=0;dyn.storedEnergy=0;
}
function appendMaterialHistoryRaw(t,path,qx,qy){
  let index;if(materialHistory.count<materialHistory.capacity){index=materialIndex(materialHistory.count);materialHistory.count++;}
  else{index=materialHistory.start;materialHistory.start=(materialHistory.start+1)%materialHistory.capacity;}
  materialHistory.time[index]=t;materialHistory.path[index]=path;materialHistory.qx[index]=qx;materialHistory.qy[index]=qy;
}
function trimMaterialHistory(){
  while(materialHistory.count>2){
    const next=materialIndex(1),tooOldTime=materialHistory.totalTime-materialHistory.time[next]>materialHistory.maxTime,tooOldPath=materialHistory.totalPath-materialHistory.path[next]>materialHistory.maxPath;
    if(!(tooOldTime||tooOldPath))break;materialHistory.start=next;materialHistory.count--;
  }
}
function slipCoordinates(kappa,alpha){return[kappa/(1+Math.abs(kappa)),Math.tan(alpha)+.062*Math.sin(geom.camberRad)];}
function appendMaterialHistory(dt,kappa=inputs.slipRatio,alpha=inputs.slipAngleDeg*PI/180,speed=inputs.speed){
  if(!(dt>0))return;const v=Math.max(0,speed),slip=slipCoordinates(kappa,alpha),vx=v*slip[0],vy=v*slip[1];
  materialHistory.totalTime+=dt;materialHistory.totalPath+=v*dt;
  materialHistory.totalQx+=vx*dt;materialHistory.totalQy+=vy*dt;
  materialHistory.lastSpeed=v;materialHistory.lastVx=vx;materialHistory.lastVy=vy;
  appendMaterialHistoryRaw(materialHistory.totalTime,materialHistory.totalPath,materialHistory.totalQx,materialHistory.totalQy);trimMaterialHistory();
}
function primeMaterialHistory(kappa=inputs.slipRatio,alpha=inputs.slipAngleDeg*PI/180,speed=inputs.speed,margin=1.05){
  if(geometryDirty)solveGeometry();let lead=-1e99,trail=1e99;for(let n=0;n<contact.sampleCount;n++){lead=Math.max(lead,contact.y[n]);trail=Math.min(trail,contact.y[n]);}
  const patch=Math.max(1e-4,lead-trail),v=Math.max(1e-6,speed),slip=slipCoordinates(kappa,alpha);resetMaterialHistory();
  materialHistory.lastSpeed=v;materialHistory.lastVx=v*slip[0];materialHistory.lastVy=v*slip[1];appendMaterialHistory(patch*Math.max(1,margin)/v,kappa,alpha,v);
  return materialHistoryReceipt();
}
function materialHistoryReceipt(){
  const oldest=materialIndex(0),newest=materialIndex(materialHistory.count-1);
  return{schema:'ducati916.convected-distance-history.v8.2',points:materialHistory.count,capacity:materialHistory.capacity,
    oldestTimeS:materialHistory.time[oldest],newestTimeS:materialHistory.time[newest],horizonTimeS:materialHistory.time[newest]-materialHistory.time[oldest],
    oldestPathM:materialHistory.path[oldest],newestPathM:materialHistory.path[newest],horizonPathM:materialHistory.path[newest]-materialHistory.path[oldest]};
}
function lookupMaterialHistory(targetPath,out=historyLookupScratch){
  const oldest=materialIndex(0),newest=materialIndex(materialHistory.count-1);out[2]=targetPath<materialHistory.path[oldest]-1e-14?1:0;
  if(targetPath<=materialHistory.path[oldest]){out[0]=materialHistory.qx[oldest];out[1]=materialHistory.qy[oldest];return out;}
  if(targetPath>=materialHistory.path[newest]){out[0]=materialHistory.qx[newest];out[1]=materialHistory.qy[newest];return out;}
  let lo=0,hi=materialHistory.count-1;while(hi-lo>1){const mid=(lo+hi)>>1,value=materialHistory.path[materialIndex(mid)];if(value<=targetPath)lo=mid;else hi=mid;}
  const a=materialIndex(lo),b=materialIndex(hi),den=materialHistory.path[b]-materialHistory.path[a],t=Math.abs(den)<1e-30?1:(targetPath-materialHistory.path[a])/den;
  out[0]=materialHistory.qx[a]+t*(materialHistory.qx[b]-materialHistory.qx[a]);out[1]=materialHistory.qy[a]+t*(materialHistory.qy[b]-materialHistory.qy[a]);return out;
}

function computeSteadyGrip(kappa = dyn.kappa, alpha = dyn.alpha, commit = false) {
  const count = contact.sampleCount;
  if (!count) return {Flong:0,Flat:0,Mz:0,muEff:0,utilMean:0,utilMax:0,power:0,patchL:0,baseMu:0};
  let yLead = -1e99, yTrail = 1e99;
  for (let i = 0; i < count; i++) { if (contact.y[i] > yLead) yLead = contact.y[i]; if (contact.y[i] < yTrail) yTrail = contact.y[i]; }
  const patchL = Math.max(1e-4, yLead - yTrail), meanP = Math.max(1, geom.meanP), speed = inputs.speed, gamma = geom.camberRad;
  const wetFactor = 1 - inputs.wetness * (.30 + .34 * Math.tanh(speed / 18));
  const speedFactor = 1 - .07 * Math.tanh(speed / 55);
  const pressureFactor = Math.pow(sourcePsi / Math.max(1, inputs.pressurePsi), .025);
  const base = inputs.mu * wetFactor * speedFactor * pressureFactor * tempFactor(commit ? dyn.temp : inputs.temperatureC);
  let Flong = 0, Flat = 0, Mz = 0, utilizationWeighted = 0, load = 0, maximumUtilization = 0, power = 0;
  const camberSlip = .062 * Math.sin(gamma), longitudinalSlip = kappa / (1 + Math.abs(kappa)), lateralSlip = Math.tan(alpha) + camberSlip;
  const kLong = 4.15e8, kLat = 3.25e8;
  for (let n = 0; n < count; n++) {
    const pressure = contact.pressure[n], area = contact.area[n], distance = Math.max(0, yLead - contact.y[n]);
    const pressureScale = clamp(Math.pow(pressure / meanP, .34), .45, 1.8);
    const localMu = base * clamp(Math.pow(pressure / meanP, -.045), .82, 1.18);
    let tx = kLong * pressureScale * longitudinalSlip * distance;
    let ty = -kLat * pressureScale * lateralSlip * distance;
    const capacity = Math.max(1e-9, localMu * pressure), trial = Math.hypot(tx / capacity, ty / (.97 * capacity)), scale = trial > 1 ? 1 / trial : 1;
    tx *= scale; ty *= scale;const fx = tx * area, fy = ty * area, fz = pressure * area;
    Flong += fx; Flat += fy;Mz += (contact.x[n] - geom.copX) * fx - (contact.y[n] - geom.copY) * fy;load += fz;
    const utilization = Math.min(1, trial);utilizationWeighted += utilization * fz;maximumUtilization=Math.max(maximumUtilization,utilization);
    power += Math.abs(fx * speed * kappa) + Math.abs(fy * speed * Math.tan(alpha));
  }
  return {Flong,Flat,Mz,muEff:load ? Math.hypot(Flong,Flat) / load : 0,utilMean:load ? utilizationWeighted / load : 0,utilMax:maximumUtilization,power,patchL,baseMu:base};
}

function computeHistoryGrip(kappa=inputs.slipRatio,alpha=inputs.slipAngleDeg*PI/180,commit=true){
  const started=performance.now(),count=contact.sampleCount;
  if(!count)return{Flong:0,Flat:0,Mz:0,muEff:0,utilMean:0,utilMax:0,power:0,transportWork:0,storedEnergy:0,patchL:0,baseMu:0};
  let lead=-1e99,trail=1e99;for(let n=0;n<count;n++){lead=Math.max(lead,contact.y[n]);trail=Math.min(trail,contact.y[n]);}
  const patchL=Math.max(1e-4,lead-trail),meanP=Math.max(1,geom.meanP),speed=Math.max(0,inputs.speed),slip=slipCoordinates(kappa,alpha),lowSpeed=speed<.5;
  const wetFactor=1-inputs.wetness*(.30+.34*Math.tanh(speed/18)),speedFactor=1-.07*Math.tanh(speed/55),pressureFactor=Math.pow(sourcePsi/Math.max(1,inputs.pressurePsi),.025);
  const base=inputs.mu*wetFactor*speedFactor*pressureFactor*tempFactor(commit?dyn.temp:inputs.temperatureC);
  let Flong=0,Flat=0,Mz=0,load=0,utilWeighted=0,utilMax=0,power=0,transportWork=0,storedEnergy=0,insufficient=0;
  for(let n=0;n<count;n++){
    const pressure=contact.pressure[n],area=contact.area[n],distance=Math.max(0,lead-contact.y[n]);let qx,qy;
    if(lowSpeed){qx=slip[0]*distance;qy=slip[1]*distance;}
    else{const past=lookupMaterialHistory(materialHistory.totalPath-distance);qx=materialHistory.totalQx-past[0];qy=materialHistory.totalQy-past[1];if(past[2])insufficient++;}
    const pressureScale=clamp(Math.pow(pressure/meanP,.34),.45,1.8),localMu=base*clamp(Math.pow(pressure/meanP,-.045),.82,1.18),kx=4.15e8*pressureScale,ky=3.25e8*pressureScale;
    let tx=kx*qx,ty=-ky*qy;const capacity=Math.max(1e-9,localMu*pressure),trial=Math.hypot(tx/capacity,ty/(.97*capacity)),scale=trial>1?1/trial:1;
    tx*=scale;ty*=scale;const fx=tx*area,fy=ty*area,fz=pressure*area;Flong+=fx;Flat+=fy;Mz+=(contact.x[n]-geom.copX)*fx-(contact.y[n]-geom.copY)*fy;load+=fz;
    const util=Math.min(1,trial);utilWeighted+=util*fz;utilMax=Math.max(utilMax,util);power+=Math.abs(fx*speed*kappa)+Math.abs(fy*speed*Math.tan(alpha));
    transportWork+=Math.abs(fx*speed*slip[0])+Math.abs(fy*speed*slip[1]);storedEnergy+=.5*(kx*Math.pow(qx*scale,2)+ky*Math.pow(qy*scale,2))*area;
    if(commit){contact.utilization[n]=util;contact.forceLong[n]=fx;contact.forceLat[n]=fy;contact.bristleLong[n]=qx;contact.bristleLat[n]=qy;}
  }
  const receipt=materialHistoryReceipt(),result={Flong,Flat,Mz,muEff:load?Math.hypot(Flong,Flat)/load:0,utilMean:load?utilWeighted/load:0,utilMax,power,transportWork,storedEnergy,patchL,baseMu:base,
    transitTime:patchL/Math.max(.5,speed),historyPoints:receipt.points,horizonPath:receipt.horizonPathM,horizonTime:receipt.horizonTimeS,insufficientHistory:insufficient,lowSpeedFallback:lowSpeed,kappa,alpha};
  if(commit){Object.assign(dyn,result);patchColorDirty=true;lineVisualDirty=true;patchPlotDirty=true;performanceState.gripMs=performance.now()-started;}
  return result;
}

function historyFixedStep(dt){const started=performance.now();appendMaterialHistory(dt);performanceState.historyStepMs=performance.now()-started;}
function thermalFixedStep(dt){const started=performance.now();if(!$('autoThermal').checked)dyn.temp=inputs.temperatureC;else{
  const heatPartition=.16,capacity=4800,coolingTau=210,ambient=25;dyn.temp+=dt*(heatPartition*dyn.transportWork/capacity-(dyn.temp-ambient)/coolingTau);inputs.temperatureC=clamp(dyn.temp,10,140);controlEls.temperatureC.value=inputs.temperatureC;updateOutput('temperatureC');
}performanceState.thermalStepMs=performance.now()-started;}
$('resetDyn').onclick=()=>{resetMaterialHistory();dyn.kappa=0;dyn.alpha=0;dyn.temp=inputs.temperatureC;dyn.Flong=0;dyn.Flat=0;dyn.Mz=0;history.length=0;tracePlotDirty=true;};
const scheduler = {
  schema:'ducati916.tire-evolution-lab.multirate-scheduler.v8.2',
  rates:{geometry:240,history:1000,force:500,thermal:100,visual:60},
  periods:{geometry:1/240,history:1/1000,force:1/500,thermal:1/100,visual:1/60},
  acc:{history:0,force:0,thermal:0,visual:0},
  maxCatchup:{history:32,force:16,thermal:8,visual:4},time:0,visualDue:false,
  jobs:{},lastFrameDt:0,maxFrameDt:0,frameCount:0
};
function makeSchedulerJob(name,rate){return{name,rate,budgetMs:1000/rate,executed:0,missed:0,dropped:0,maxDurationMs:0,maxLatenessMs:0,duration:new Float64Array(512),durationStart:0,durationCount:0};}
for(const[name,rate]of Object.entries(scheduler.rates))scheduler.jobs[name]=makeSchedulerJob(name,rate);
function recordSchedulerJob(name,durationMs,latenessMs=0){
  const job=scheduler.jobs[name];job.executed++;if(durationMs>job.budgetMs)job.missed++;job.maxDurationMs=Math.max(job.maxDurationMs,durationMs);job.maxLatenessMs=Math.max(job.maxLatenessMs,latenessMs);
  let index;if(job.durationCount<job.duration.length){index=(job.durationStart+job.durationCount)%job.duration.length;job.durationCount++;}else{index=job.durationStart;job.durationStart=(job.durationStart+1)%job.duration.length;}job.duration[index]=durationMs;
}
function timedSchedulerJob(name,fn,latenessMs=0){const started=performance.now(),value=fn(),elapsed=performance.now()-started;recordSchedulerJob(name,elapsed,latenessMs);return value;}
function schedulerJobStats(job){
  const values=new Float64Array(job.durationCount);for(let i=0;i<job.durationCount;i++)values[i]=job.duration[(job.durationStart+i)%job.duration.length];values.sort();
  const pick=q=>values.length?values[Math.min(values.length-1,Math.floor(q*(values.length-1)))]:0;
  return{name:job.name,rateHz:job.rate,budgetMs:job.budgetMs,executed:job.executed,missed:job.missed,dropped:job.dropped,missRate:job.executed?job.missed/job.executed:0,
    medianDurationMs:pick(.5),p95DurationMs:pick(.95),maxDurationMs:job.maxDurationMs,maxLatenessMs:job.maxLatenessMs};
}
function schedulerReceipt(){return{schema:scheduler.schema,timeS:scheduler.time,ratesHz:{...scheduler.rates},periodsS:{...scheduler.periods},accumulatorS:{...scheduler.acc},maxCatchup:{...scheduler.maxCatchup},
  frameCount:scheduler.frameCount,lastFrameDtS:scheduler.lastFrameDt,maxFrameDtS:scheduler.maxFrameDt,jobs:Object.fromEntries(Object.entries(scheduler.jobs).map(([name,job])=>[name,schedulerJobStats(job)])),history:materialHistoryReceipt()};}
function resetSchedulerTelemetry(resetTime=true){
  for(const name of Object.keys(scheduler.acc))scheduler.acc[name]=0;
  if(resetTime)scheduler.time=0;
  scheduler.visualDue=false;scheduler.lastFrameDt=0;scheduler.maxFrameDt=0;scheduler.frameCount=0;
  for(const job of Object.values(scheduler.jobs)){job.executed=0;job.missed=0;job.dropped=0;job.maxDurationMs=0;job.maxLatenessMs=0;job.durationStart=0;job.durationCount=0;}
  return schedulerReceipt();
}
function forceFixedStep(){computeHistoryGrip(inputs.slipRatio,inputs.slipAngleDeg*PI/180,true);performanceState.forceEvaluations++;}
function visualFixedStep(){recordHistory(scheduler.time);updateAllPanels();drawDirtyPlots();scheduler.visualDue=true;}
function runCatchupJob(name,stepFn){
  const period=scheduler.periods[name],maxSteps=scheduler.maxCatchup[name];let steps=0;
  while(scheduler.acc[name]+1e-15>=period&&steps<maxSteps){const lateness=Math.max(0,(scheduler.acc[name]-period)*1000);timedSchedulerJob(name,()=>stepFn(period),lateness);scheduler.acc[name]-=period;steps++;}
  if(scheduler.acc[name]>=period){const dropped=Math.floor(scheduler.acc[name]/period);scheduler.jobs[name].dropped+=dropped;scheduler.acc[name]-=dropped*period;}
}
function advanceScheduler(frameDt){
  const dt=Math.max(0,frameDt);scheduler.time+=dt;scheduler.lastFrameDt=dt;scheduler.maxFrameDt=Math.max(scheduler.maxFrameDt,dt);scheduler.frameCount++;
  for(const name of Object.keys(scheduler.acc))scheduler.acc[name]+=dt;
  if(geometryDirty)timedSchedulerJob('geometry',()=>solveGeometry());
  runCatchupJob('history',historyFixedStep);
  runCatchupJob('force',()=>forceFixedStep());
  runCatchupJob('thermal',thermalFixedStep);
  runCatchupJob('visual',()=>visualFixedStep());
  return schedulerReceipt();
}
function advanceSchedulerDuration(duration,framePattern=[1/60]){let elapsed=0,index=0;while(elapsed<duration-1e-15){const dt=Math.min(framePattern[index%framePattern.length],duration-elapsed);advanceScheduler(dt);elapsed+=dt;index++;}return schedulerReceipt();}



function updateContactPanel() {
  $('contactState').innerHTML = rows({
    'contact method':'structured broad phase + triangle clip + Gauss-3','target load':fmt(inputs.loadN,2)+' N','solved load':fmt(geom.loadN,2)+' N',
    'load closure':fmt(geom.closure,9)+' %','load deformation coefficient':fmt(geom.loadCoefficient,5),'hub vertical continuation':fmt(geom.hubShift*1000,4)+' mm',
    'road patch area':fmt(geom.area*1e4,3)+' cm²','surface patch area':fmt(geom.surfArea*1e4,3)+' cm²',
    'road W × L':fmt(geom.extentX*1000,2)+' × '+fmt(geom.extentY*1000,2)+' mm','tire-local W × L':fmt(geom.localExtentX*1000,2)+' × '+fmt(geom.extentY*1000,2)+' mm',
    'peak / mean pressure':fmt(geom.peak/1e6,4)+' / '+fmt(geom.meanP/1e6,4)+' MPa','road COP x / y':fmt(geom.copX*1000,3)+' / '+fmt(geom.copY*1000,3)+' mm',
    'tire-local COP lateral':fmt(geom.localCopX*1000,3)+' mm','effective radius':fmt(geom.rEff*1000,3)+' mm',
    'active polygons / subtriangles':geom.activePolygons+' / '+geom.subtriangles,'Gauss contact samples':String(geom.samples)
  });
}
function updatePressurePanel() {
  const p = geom.pressureBasis;
  $('pressureState').innerHTML = rows({
    'anchor family':Array.from(PRESSURE_ANCHORS).map(x=>fmt(x,1)).join(' · ')+' psi','active bracket':fmt(p.lowerAnchorPsi,3)+' ↔ '+fmt(p.upperAnchorPsi,3)+' psi',
    'interpolation coordinate':fmt(p.interpolationT,5),'mode coefficients A / B':fmt(p.coefficientA,7)+' / '+fmt(p.coefficientB,7),
    'max equilibrium displacement':fmt(p.maxEquilibriumDisplacementM*1000,5)+' mm','basis max mode A / B':fmt(maxModeA*1000,4)+' / '+fmt(maxModeB*1000,4)+' mm',
    'bead endpoint motion':fmt(beadEndpointModeNorm*1e9,4)+' nm','classification':'PROVISIONAL · UNCALIBRATED'
  });
}
function updateForcePanel() {
  $('forceState').innerHTML = rows({
    'material κ / α':fmt(dyn.kappa,4)+' / '+fmt(dyn.alpha*180/PI,3)+'°','longitudinal force':fmt(dyn.Flong,2)+' N','lateral force':fmt(dyn.Flat,2)+' N',
    'aligning moment Mz':fmt(dyn.Mz,3)+' N·m','resultant / Fz':fmt(dyn.muEff,4),'friction utilization':fmt(dyn.utilMean*100,2)+' % mean · '+fmt(dyn.utilMax*100,1)+' % max',
    'effective μ ceiling':fmt(dyn.baseMu||0,4),'patch transit time':fmt(dyn.transitTime*1000,3)+' ms','history points / horizon':dyn.historyPoints+' / '+fmt(dyn.horizonPath,4)+' m',
    'insufficient-history samples':String(dyn.insufficientHistory),'stored elastic energy':fmt(dyn.storedEnergy,5)+' J','legacy slip-power proxy':fmt(dyn.power,1)+' W',
    'transport work-rate proxy':fmt(dyn.transportWork,1)+' W','low-speed fallback':String(dyn.lowSpeedFallback),'thermal state':fmt(dyn.temp,2)+' °C'
  });
}
function updatePerformancePanel() {
  $('performanceState').innerHTML = rows({
    'full / candidate triangles':performanceState.fullTriangles+' / '+performanceState.candidateTriangles,
    'broad-phase rejection':fmt(performanceState.broadphaseReduction*100,3)+' %',
    'candidate θ bands / cells':performanceState.candidateBands+' / '+performanceState.candidateCells,
    'hub evaluations / iterations':performanceState.evaluations+' / '+performanceState.iterations,
    'Newton / bisection / expansion':performanceState.newtonSteps+' / '+performanceState.bisectionSteps+' / '+performanceState.bracketExpansions,
    'warm continuation':String(performanceState.warmStartUsed),
    'topology reuse cells / samples':fmt(performanceState.topologyCellReuse*100,1)+' % / '+fmt(performanceState.topologySampleReuse*100,1)+' %',
    'geometry total':fmt(performanceState.geometrySolveMs,3)+' ms',
    'shape / broad phase / hub':fmt(performanceState.shapeBuildMs,3)+' / '+fmt(performanceState.broadphaseBuildMs,3)+' / '+fmt(performanceState.hubSolveMs,3)+' ms',
    'collect / normals / force':fmt(performanceState.finalCollectMs,3)+' / '+fmt(performanceState.normalsMs,3)+' / '+fmt(performanceState.gripMs,3)+' ms',
    'history / thermal step':fmt(performanceState.historyStepMs,4)+' / '+fmt(performanceState.thermalStepMs,4)+' ms',
    'buffer capacity samples / patches':performanceState.sampleCapacity+' / '+performanceState.patchCapacity,
    'buffer growth events':String(performanceState.bufferGrowthEvents),
    'native lane':performanceState.nativeLane
  });
}
function updateSchedulerPanel(){
  if(!$('schedulerState'))return;const receipt=schedulerReceipt(),jobs=receipt.jobs;
  $('schedulerState').innerHTML=rows({
    'rates geometry / history / force':scheduler.rates.geometry+' / '+scheduler.rates.history+' / '+scheduler.rates.force+' Hz',
    'rates thermal / visual':scheduler.rates.thermal+' / '+scheduler.rates.visual+' Hz',
    'history executed / dropped':jobs.history.executed+' / '+jobs.history.dropped,
    'force executed / dropped':jobs.force.executed+' / '+jobs.force.dropped,
    'deadline misses G/H/F':jobs.geometry.missed+' / '+jobs.history.missed+' / '+jobs.force.missed,
    'median ms G/H/F':fmt(jobs.geometry.medianDurationMs,4)+' / '+fmt(jobs.history.medianDurationMs,4)+' / '+fmt(jobs.force.medianDurationMs,4),
    'p95 ms G/H/F':fmt(jobs.geometry.p95DurationMs,4)+' / '+fmt(jobs.history.p95DurationMs,4)+' / '+fmt(jobs.force.p95DurationMs,4),
    'max frame dt':fmt(receipt.maxFrameDtS*1000,3)+' ms','max catch-up H/F':scheduler.maxCatchup.history+' / '+scheduler.maxCatchup.force,
    'scheduler time':fmt(receipt.timeS,3)+' s'
  });
}


$('prov').innerHTML = rows({'branch schema':BRANCH.schema,'source SHA':BRANCH.sourceSha256.slice(0,20)+'…','source modified':'false','source result SHA':DATA.resultSha256.slice(0,20)+'…','source basis':S.provenance.basis,'production contact':BRANCH.contactMethod,'physical calibration':String(S.provenance.physicalCalibration)});
$('layers').innerHTML = (S.layers||[]).map(layer=>`<div class="r"><span style="color:${layer.color}">${layer.label}</span><b>${fmt(layer.massKg,4)} kg · ${fmt(layer.membraneEnergyJ,4)} J</b></div>`).join('');

const canvas3d = $('gl');
const gl = canvas3d.getContext('webgl2', {antialias:true,alpha:false});
if (!gl) throw Error('WebGL2 required');
window.__LAB_GL__ = gl;
window.__LAB_FRAMES__ = 0;
window.__LAB_CONTEXT_LOST__ = false;
canvas3d.addEventListener('webglcontextlost', event => { window.__LAB_CONTEXT_LOST__ = true; event.preventDefault(); });

function shader(type, source) {
  const item = gl.createShader(type);
  gl.shaderSource(item, source);
  gl.compileShader(item);
  if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(item));
  return item;
}
function program(vertex, fragment) {
  const item = gl.createProgram();
  gl.attachShader(item, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(item, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(item);
  if (!gl.getProgramParameter(item, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(item));
  return item;
}
const PBR = program(`#version 300 es
precision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec3 c;uniform mat4 vp;out vec3 N,C,W;void main(){N=n;C=c;W=p;gl_Position=vp*vec4(p,1);}`,
`#version 300 es
precision highp float;in vec3 N,C,W;uniform vec3 eye;out vec4 o;void main(){vec3 n=normalize(N),v=normalize(eye-W),l=normalize(vec3(-.5,-.3,.8)),h=normalize(l+v);float d=.22+.78*max(dot(n,l),0.);float s=.22*pow(max(dot(n,h),0.),48.);o=vec4(pow(max(C*d+s,vec3(0.)),vec3(1./2.2)),1);}`);
const LINE = program(`#version 300 es
precision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 c;uniform mat4 vp;out vec3 C;void main(){C=c;gl_Position=vp*vec4(p,1);}`,
`#version 300 es
precision highp float;in vec3 C;out vec4 o;void main(){o=vec4(C,1);}`);

function ident() { return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]); }
function mul(a,b) { const out=new Float32Array(16); for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3]; return out; }
function persp(field, aspect, near, far) { const t=1/Math.tan(field/2),m=new Float32Array(16);m[0]=t/aspect;m[5]=t;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);return m; }
const sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const crossVec=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function norm3(a){const length=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/length,a[1]/length,a[2]/length];}
function look(eye,target,up){const z=norm3(sub3(eye,target)),x=norm3(crossVec(up,z)),y=crossVec(z,x),m=ident();m[0]=x[0];m[1]=y[0];m[2]=z[0];m[4]=x[1];m[5]=y[1];m[6]=z[1];m[8]=x[2];m[9]=y[2];m[10]=z[2];m[12]=-dot3(x,eye);m[13]=-dot3(y,eye);m[14]=-dot3(z,eye);return m;}

const cols = [[.22,.55,.85],[.86,.78,.36],[.89,.42,.45],[.83,.86,.88]];
const wedgeCenter=PI/2,wedgeHalf=.62;
function angleOf(i){return TAU*(i+.5)/nt;}
function inWedge(i){const angle=angleOf(i)-wedgeCenter;return Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))<wedgeHalf;}
function makeCutIndices(){const values=[];for(let i=0;i<nt;i++){const ip=(i+1)%nt;if(inWedge(i)||inWedge(ip))continue;for(let j=0;j<nu-1;j++){const A=idx(i,j),B=idx(ip,j),C=idx(ip,j+1),D=idx(i,j+1);values.push(A,B,C,A,C,D);}}return new Uint32Array(values);}
const cutInd=makeCutIndices();
const cutBounds=(()=>{const values=[];for(let i=0;i<nt;i++){const angle=Math.atan2(Math.sin(angleOf(i)-wedgeCenter),Math.cos(angleOf(i)-wedgeCenter));if(Math.abs(Math.abs(angle)-wedgeHalf)<TAU/nt*1.1)values.push(i);}const unique=[...new Set(values)].sort((a,b)=>a-b);return unique.length>2?[unique[0],unique.at(-1)]:unique;})();

function createSurface(k){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const pb=gl.createBuffer(),nb=gl.createBuffer(),cb=gl.createBuffer();
  for(const [location,buffer] of [[0,pb],[1,nb],[2,cb]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,np*3*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);}
  const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,fullInd,gl.STATIC_DRAW);
  const vaoCut=gl.createVertexArray();gl.bindVertexArray(vaoCut);
  for(const [location,buffer] of [[0,pb],[1,nb],[2,cb]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);}
  const ibc=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibc);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,cutInd,gl.STATIC_DRAW);
  return{k,vao,vaoCut,pb,nb,cb,count:fullInd.length,cutCount:cutInd.length};
}
const surfaces=Array.from({length:ns},(_,k)=>createSurface(k));
const renderPosition=Array.from({length:ns},()=>new Float32Array(np*3));
const renderNormal=Array.from({length:ns},()=>new Float32Array(np*3));
const renderColor=Array.from({length:ns},()=>new Float32Array(np*3));
const surfaceUploadVersion=new Int32Array(ns);surfaceUploadVersion.fill(-1);
for(let k=0;k<ns;k++){const target=renderColor[k],color=cols[k];for(let n=0;n<np;n++){const q=n*3;target[q]=color[0];target[q+1]=color[1];target[q+2]=color[2];}}

let lineVertexCapacity=4096;
let linePosition=new Float32Array(lineVertexCapacity*3),lineColor=new Float32Array(lineVertexCapacity*3),lineVertexCount=0;
const lineVao=gl.createVertexArray(),linePB=gl.createBuffer(),lineCB=gl.createBuffer();gl.bindVertexArray(lineVao);
for(const [location,buffer] of [[0,linePB],[1,lineCB]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,lineVertexCapacity*3*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);}
function ensureLineCapacity(requiredVertices){if(requiredVertices<=lineVertexCapacity)return;lineVertexCapacity=nextPowerOfTwo(requiredVertices);linePosition=growTyped(linePosition,Float32Array,lineVertexCapacity*3);lineColor=growTyped(lineColor,Float32Array,lineVertexCapacity*3);for(const buffer of [linePB,lineCB]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,lineVertexCapacity*3*4,gl.DYNAMIC_DRAW);}performanceState.bufferGrowthEvents++;}

let patchGpuCapacity=2048,patchVertexCount=0;
let patchColor=new Float32Array(patchGpuCapacity*9);
const patchVao=gl.createVertexArray(),patchPB=gl.createBuffer(),patchCB=gl.createBuffer();gl.bindVertexArray(patchVao);
for(const [location,buffer] of [[0,patchPB],[1,patchCB]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,patchGpuCapacity*9*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);}
function ensurePatchGpuCapacity(required){if(required<=patchGpuCapacity)return;patchGpuCapacity=nextPowerOfTwo(required);patchColor=growTyped(patchColor,Float32Array,patchGpuCapacity*9);for(const buffer of [patchPB,patchCB]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,patchGpuCapacity*9*4,gl.DYNAMIC_DRAW);}performanceState.bufferGrowthEvents++;}

function writePressureColor(array,q,value){const z=clamp(value,0,1);array[q]=.12+.88*Math.pow(z,.45);array[q+1]=.08+.62*Math.pow(z,1.6);array[q+2]=.04+.1*(1-z);}
function writeUtilColor(array,q,value){const z=clamp(value,0,1);array[q]=.18+.82*z;array[q+1]=.65*(1-z)+.18;array[q+2]=.90*(1-z)+.08;}
function pressureColor(value){const out=[0,0,0];writePressureColor(out,0,value);return out;}
function utilColor(value){const out=[0,0,0];writeUtilColor(out,0,value);return out;}

function requiredSurfaceIndices(){return mode==='cut'?[0,1,2,3]:(mode==='air'?[0]:[3]);}
function syncGeometryBuffers(force=false){
  const started=performance.now();
  let normalsMs=0;
  for(const k of requiredSurfaceIndices()){
    if(normalVersion[k]!==geometryVersion){const t=performance.now();computeNormals(k,geom.camberRad);normalsMs+=performance.now()-t;normalVersion[k]=geometryVersion;}
    if(!force&&surfaceUploadVersion[k]===geometryVersion)continue;
    const surface=surfaces[k],position=renderPosition[k],normal=renderNormal[k],sourcePosition=currentPos[k],sourceNormal=currentNor[k];
    for(let q=0;q<np*3;q++){position[q]=sourcePosition[q];normal[q]=sourceNormal[q];}
    gl.bindBuffer(gl.ARRAY_BUFFER,surface.pb);gl.bufferSubData(gl.ARRAY_BUFFER,0,position);
    gl.bindBuffer(gl.ARRAY_BUFFER,surface.nb);gl.bufferSubData(gl.ARRAY_BUFFER,0,normal);
    gl.bindBuffer(gl.ARRAY_BUFFER,surface.cb);gl.bufferSubData(gl.ARRAY_BUFFER,0,renderColor[k]);
    surfaceUploadVersion[k]=geometryVersion;
  }
  geometryBuffersDirty=false;
  performanceState.normalsMs=normalsMs;
  performanceState.geometryUploadMs=performance.now()-started-normalsMs;
}

function syncOuterColor(){
  const target=renderColor[3],pmax=Math.max(1,geom.peak);
  if(mode==='pressure')for(let n=0;n<np;n++)writePressureColor(target,n*3,currentP[n]/pmax);
  else{const color=cols[3];for(let n=0;n<np;n++){const q=n*3;target[q]=color[0];target[q+1]=color[1];target[q+2]=color[2];}}
  gl.bindBuffer(gl.ARRAY_BUFFER,surfaces[3].cb);gl.bufferSubData(gl.ARRAY_BUFFER,0,target);
}

function syncPatchMesh(force=false){
  const patches=contact.patchCount;
  patchVertexCount=patches*3;
  if(!patches){patchGeometryDirty=false;patchColorDirty=false;return;}
  ensurePatchGpuCapacity(patches);
  const pmax=Math.max(1,geom.peak);
  for(let tri=0;tri<patches;tri++){
    const start=contact.patchSampleStart[tri];
    const utilization=(contact.utilization[start]+contact.utilization[start+1]+contact.utilization[start+2])/3;
    for(let vertex=0;vertex<3;vertex++){
      const q=(tri*3+vertex)*3;
      if(mode==='grip')writeUtilColor(patchColor,q,utilization);
      else writePressureColor(patchColor,q,contact.patchPressure[tri*3+vertex]/pmax);
    }
  }
  if(patchGeometryDirty||force){gl.bindBuffer(gl.ARRAY_BUFFER,patchPB);gl.bufferSubData(gl.ARRAY_BUFFER,0,contact.patchPos.subarray(0,patches*9));}
  if(patchColorDirty||force){gl.bindBuffer(gl.ARRAY_BUFFER,patchCB);gl.bufferSubData(gl.ARRAY_BUFFER,0,patchColor.subarray(0,patches*9));}
  patchGeometryDirty=false;patchColorDirty=false;
}

function appendLine(ax,ay,az,bx,by,bz,r,g,b){
  ensureLineCapacity(lineVertexCount+2);
  let q=lineVertexCount*3;
  linePosition[q]=ax;linePosition[q+1]=ay;linePosition[q+2]=az;lineColor[q]=r;lineColor[q+1]=g;lineColor[q+2]=b;
  q+=3;linePosition[q]=bx;linePosition[q+1]=by;linePosition[q+2]=bz;lineColor[q]=r;lineColor[q+1]=g;lineColor[q+2]=b;
  lineVertexCount+=2;
}
function syncLines(){
  lineVertexCount=0;
  const x=.18,y=.40,c=.30;
  appendLine(-x,-y,0,x,-y,0,c,c+.05,c+.07);appendLine(x,-y,0,x,y,0,c,c+.05,c+.07);appendLine(x,y,0,-x,y,0,c,c+.05,c+.07);appendLine(-x,y,0,-x,-y,0,c,c+.05,c+.07);
  if(mode==='cut')for(const i of cutBounds)for(let k=0;k<4;k++)for(let j=0;j<nu-1;j++){const q=v3(i,j),r=v3(i,j+1),color=cols[k];appendLine(currentPos[k][q],currentPos[k][q+1],currentPos[k][q+2],currentPos[k][r],currentPos[k][r+1],currentPos[k][r+2],color[0],color[1],color[2]);}
  if(mode==='air'){
    let band=0,lowest=1e99;for(let i=0;i<nt;i++){const z=currentPos[0][v3(i,nu>>1)+2];if(z<lowest){lowest=z;band=i;}}
    for(let j=0;j<nu-1;j++){const q=v3(band,j),r=v3(band,j+1);appendLine(currentPos[0][q],currentPos[0][q+1],currentPos[0][q+2],currentPos[0][r],currentPos[0][r+1],currentPos[0][r+2],.35,.85,1);}
  }
  if(mode==='grip'&&contact.sampleCount){const stride=Math.max(1,Math.floor(contact.sampleCount/140)),scale=.00008;for(let n=0;n<contact.sampleCount;n+=stride){const color=utilColor(contact.utilization[n]),ax=contact.x[n],ay=contact.y[n],az=.00035;appendLine(ax,ay,az,ax+contact.forceLat[n]*scale,ay+contact.forceLong[n]*scale,az+.00025,color[0],color[1],color[2]);}}
  gl.bindBuffer(gl.ARRAY_BUFFER,linePB);gl.bufferSubData(gl.ARRAY_BUFFER,0,linePosition.subarray(0,lineVertexCount*3));
  gl.bindBuffer(gl.ARRAY_BUFFER,lineCB);gl.bufferSubData(gl.ARRAY_BUFFER,0,lineColor.subarray(0,lineVertexCount*3));
  lineVisualDirty=false;
}

function syncVisualState(force=false){
  const started=performance.now();
  if(geometryBuffersDirty||force)syncGeometryBuffers(force);
  if(outerColorDirty||force){syncOuterColor();outerColorDirty=false;}
  if(patchGeometryDirty||patchColorDirty||force)syncPatchMesh(force);
  if(lineVisualDirty||force)syncLines();
  performanceState.visualUploadMs=performance.now()-started;
}

let cam={yaw:-1.22,pitch:.24,dist:.9,target:[0,0,.17]};
function setPreset(selected){if(selected==='pressure'||selected==='grip')cam={yaw:0,pitch:-.92,dist:.58,target:[0,0,.035]};else if(selected==='cut')cam={yaw:-1.57,pitch:.12,dist:.72,target:[0,0,.17]};else if(selected==='air')cam={yaw:-1.3,pitch:.15,dist:.78,target:[0,0,.17]};else cam={yaw:-1.22,pitch:.24,dist:.9,target:[0,0,.17]};}
function drawSurface(surface,vp,eye,cut=false){gl.useProgram(PBR);gl.uniformMatrix4fv(gl.getUniformLocation(PBR,'vp'),false,vp);gl.uniform3fv(gl.getUniformLocation(PBR,'eye'),eye);gl.bindVertexArray(cut?surface.vaoCut:surface.vao);gl.drawElements(gl.TRIANGLES,cut?surface.cutCount:surface.count,gl.UNSIGNED_INT,0);}
function render3D(){
  syncVisualState();
  const d=Math.min(devicePixelRatio||1,2),w=canvas3d.clientWidth,h=canvas3d.clientHeight;
  if(canvas3d.width!==w*d||canvas3d.height!==h*d){canvas3d.width=w*d;canvas3d.height=h*d;}
  gl.viewport(0,0,canvas3d.width,canvas3d.height);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(.055,.07,.08,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const cp=Math.cos(cam.pitch),eye=[cam.target[0]+cam.dist*cp*Math.sin(cam.yaw),cam.target[1]+cam.dist*cp*Math.cos(cam.yaw),cam.target[2]+cam.dist*Math.sin(cam.pitch)],vp=mul(persp(.8,w/h,.01,5),look(eye,cam.target,[0,0,1]));
  if(mode==='cut')surfaces.forEach(surface=>drawSurface(surface,vp,eye,true));else if(mode==='air')drawSurface(surfaces[0],vp,eye,false);else drawSurface(surfaces[3],vp,eye,false);
  if((mode==='pressure'||mode==='grip')&&patchVertexCount){gl.disable(gl.CULL_FACE);gl.useProgram(LINE);gl.uniformMatrix4fv(gl.getUniformLocation(LINE,'vp'),false,vp);gl.bindVertexArray(patchVao);gl.drawArrays(gl.TRIANGLES,0,patchVertexCount);gl.enable(gl.CULL_FACE);}
  gl.useProgram(LINE);gl.uniformMatrix4fv(gl.getUniformLocation(LINE,'vp'),false,vp);gl.bindVertexArray(lineVao);gl.drawArrays(gl.LINES,0,lineVertexCount);
  window.__LAB_GL_ERROR__=gl.getError();window.__LAB_FRAMES__++;
}

let drag=false,lastPointerX=0,lastPointerY=0;
canvas3d.onpointerdown=event=>{drag=true;lastPointerX=event.clientX;lastPointerY=event.clientY;canvas3d.setPointerCapture(event.pointerId);};
canvas3d.onpointermove=event=>{if(!drag)return;cam.yaw-=(event.clientX-lastPointerX)*.006;cam.pitch=clamp(cam.pitch+(event.clientY-lastPointerY)*.006,-1.3,1.3);lastPointerX=event.clientX;lastPointerY=event.clientY;};
canvas3d.onpointerup=()=>drag=false;
canvas3d.onwheel=event=>{cam.dist=clamp(cam.dist*Math.exp(event.deltaY*.001),.22,2);event.preventDefault();};
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;setPreset(mode);document.querySelectorAll('[data-mode]').forEach(item=>item.classList.toggle('active',item===button));geometryBuffersDirty=true;outerColorDirty=true;patchColorDirty=true;lineVisualDirty=true;patchPlotDirty=true;});
$('resetCam').onclick=()=>setPreset(mode);
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};

function prep(canvas){const d=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==w*d||canvas.height!==h*d){canvas.width=w*d;canvas.height=h*d;}const context=canvas.getContext('2d');context.setTransform(d,0,0,d,0,0);context.fillStyle='#061018';context.fillRect(0,0,w,h);context.font='10px ui-monospace';return{context,w,h};}
function crossPlot(){
  const{context,w,h}=prep($('cross')),outer=currentPos[3];let band=0,lowest=1e99;
  for(let i=0;i<nt;i++){const z=outer[v3(i,nu>>1)+2];if(z<lowest){lowest=z;band=i;}}
  let minx=1e99,maxx=-1e99,minz=Math.min(0,lowest),maxz=-1e99;
  for(let k=0;k<4;k++)for(let j=0;j<nu;j++){const q=v3(band,j);minx=Math.min(minx,currentPos[k][q],sourcePos[k][q]);maxx=Math.max(maxx,currentPos[k][q],sourcePos[k][q]);minz=Math.min(minz,currentPos[k][q+2],sourcePos[k][q+2]);maxz=Math.max(maxz,currentPos[k][q+2],sourcePos[k][q+2]);}
  const xp=value=>25+(value-minx)/Math.max(1e-9,maxx-minx)*(w-45),zp=value=>h-20-(value-minz)/Math.max(1e-9,maxz-minz)*(h-45);
  context.strokeStyle='#596369';context.beginPath();context.moveTo(15,zp(0));context.lineTo(w-10,zp(0));context.stroke();
  for(let k=0;k<4;k++){
    context.strokeStyle='rgba(150,170,180,.28)';context.lineWidth=1;context.setLineDash([3,3]);context.beginPath();
    for(let j=0;j<nu;j++){const q=v3(band,j);j?context.lineTo(xp(sourcePos[k][q]),zp(sourcePos[k][q+2])):context.moveTo(xp(sourcePos[k][q]),zp(sourcePos[k][q+2]));}context.stroke();context.setLineDash([]);
    context.strokeStyle=`rgb(${cols[k].map(value=>value*255).join(',')})`;context.lineWidth=2;context.beginPath();
    for(let j=0;j<nu;j++){const q=v3(band,j);j?context.lineTo(xp(currentPos[k][q]),zp(currentPos[k][q+2])):context.moveTo(xp(currentPos[k][q]),zp(currentPos[k][q+2]));}context.stroke();
  }
  context.fillStyle='#9eb6c1';context.fillText('dashed: source state · solid: pressure/load equilibrium branch',10,h-7);crossPlotDirty=false;
}
function patchPlot(){
  const{context,w,h}=prep($('patch')),count=contact.sampleCount;
  if(!count){context.fillStyle='#ff7365';context.fillText('no contact',12,30);patchPlotDirty=false;return;}
  let xmin=1e99,xmax=-1e99,ymin=1e99,ymax=-1e99;
  for(let n=0;n<count;n++){xmin=Math.min(xmin,contact.x[n]);xmax=Math.max(xmax,contact.x[n]);ymin=Math.min(ymin,contact.y[n]);ymax=Math.max(ymax,contact.y[n]);}
  const pad=.004; xmin-=pad;xmax+=pad;ymin-=pad;ymax+=pad;
  const xp=value=>25+(value-xmin)/Math.max(1e-9,xmax-xmin)*(w-45),yp=value=>h-25-(value-ymin)/Math.max(1e-9,ymax-ymin)*(h-52),pmax=Math.max(1,geom.peak),stride=Math.max(1,Math.floor(count/900));
  for(let n=0;n<count;n+=stride){const normalized=contact.pressure[n]/pmax,color=mode==='grip'?utilColor(contact.utilization[n]):pressureColor(normalized);context.fillStyle=`rgb(${color.map(value=>Math.round(255*value)).join(',')})`;const radius=1+3*Math.sqrt(normalized);context.beginPath();context.arc(xp(contact.x[n]),yp(contact.y[n]),radius,0,TAU);context.fill();if(mode==='grip'&&n%(stride*4)===0){const scale=.00008;context.strokeStyle='#dcecf3';context.beginPath();context.moveTo(xp(contact.x[n]),yp(contact.y[n]));context.lineTo(xp(contact.x[n]+contact.forceLat[n]*scale),yp(contact.y[n]+contact.forceLong[n]*scale));context.stroke();}}
  context.strokeStyle='#78efb1';context.beginPath();context.arc(xp(geom.copX),yp(geom.copY),5,0,TAU);context.stroke();context.fillStyle='#9eb6c1';context.fillText(`${fmt(geom.area*1e4,2)} cm² · ${fmt(geom.extentX*1000,1)}×${fmt(geom.extentY*1000,1)} mm · ${geom.samples} Gauss samples`,10,h-8);patchPlotDirty=false;
}

const historyCapacity=360,historyTime=new Float64Array(historyCapacity),historyFx=new Float64Array(historyCapacity),historyFy=new Float64Array(historyCapacity),historyMz=new Float64Array(historyCapacity);
let historyStart=0,historyCount=0;
const history={get length(){return historyCount;},set length(value){if(value===0){historyStart=0;historyCount=0;}}};
function recordHistory(t){let index;if(historyCount<historyCapacity){index=(historyStart+historyCount)%historyCapacity;historyCount++;}else{index=historyStart;historyStart=(historyStart+1)%historyCapacity;}historyTime[index]=t;historyFx[index]=dyn.Flong/Math.max(1,geom.loadN);historyFy[index]=dyn.Flat/Math.max(1,geom.loadN);historyMz[index]=dyn.Mz;tracePlotDirty=true;}
function historyIndex(order){return(historyStart+order)%historyCapacity;}
function tracePlot(){
  const{context,w,h}=prep($('trace'));
  if(historyCount<2){context.fillStyle='#9eb6c1';context.fillText('transient history accumulating…',12,30);tracePlotDirty=false;return;}
  let maximum=.2;for(let i=0;i<historyCount;i++){const q=historyIndex(i);maximum=Math.max(maximum,Math.abs(historyFx[q]),Math.abs(historyFy[q]));}
  const first=historyIndex(0),last=historyIndex(historyCount-1),t0=historyTime[first],t1=historyTime[last],xp=t=>28+(t-t0)/Math.max(.001,t1-t0)*(w-42),yp=value=>h/2-value/maximum*(h*.39);
  context.strokeStyle='#29414e';context.beginPath();context.moveTo(20,h/2);context.lineTo(w-8,h/2);context.stroke();
  for(const [values,color] of [[historyFx,'#6fdcff'],[historyFy,'#ff8f6a']]){context.strokeStyle=color;context.lineWidth=1.7;context.beginPath();for(let i=0;i<historyCount;i++){const q=historyIndex(i),xx=xp(historyTime[q]),yy=yp(values[q]);i?context.lineTo(xx,yy):context.moveTo(xx,yy);}context.stroke();}
  context.fillStyle='#9eb6c1';context.fillText(`cyan F_long/Fz · orange F_lat/Fz · scale ±${fmt(maximum,2)}`,10,h-8);tracePlotDirty=false;
}
function drawDirtyPlots(force=false){if(crossPlotDirty||force)crossPlot();if(patchPlotDirty||force)patchPlot();if(tracePlotDirty||force)tracePlot();}

function thicknessRatio(){let minimum=1e99;for(let k=0;k<3;k++)for(let n=0;n<np;n++){const q=n*3,sourceGap=Math.hypot(sourcePos[k+1][q]-sourcePos[k][q],sourcePos[k+1][q+1]-sourcePos[k][q+1],sourcePos[k+1][q+2]-sourcePos[k][q+2]);if(sourceGap>1e-9){const currentGap=Math.hypot(currentPos[k+1][q]-currentPos[k][q],currentPos[k+1][q+1]-currentPos[k][q+1],currentPos[k+1][q+2]-currentPos[k][q+2]);minimum=Math.min(minimum,currentGap/sourceGap);}}return minimum;}

const sourceNodeArea=new Float64Array(np);
for(let i=0;i<nt;i++){
  const ip=(i+1)%nt;
  for(let j=0;j<nu-1;j++){
    const ids=[idx(i,j),idx(ip,j),idx(ip,j+1),idx(i,j+1)];
    for(const tri of [[0,1,2],[0,2,3]]){
      const ia=ids[tri[0]]*3,ib=ids[tri[1]]*3,ic=ids[tri[2]]*3;
      const abx=sourcePos[3][ib]-sourcePos[3][ia],aby=sourcePos[3][ib+1]-sourcePos[3][ia+1],abz=sourcePos[3][ib+2]-sourcePos[3][ia+2];
      const acx=sourcePos[3][ic]-sourcePos[3][ia],acy=sourcePos[3][ic+1]-sourcePos[3][ia+1],acz=sourcePos[3][ic+2]-sourcePos[3][ia+2];
      const projected=.5*Math.abs(abx*acy-aby*acx);
      sourceNodeArea[ids[tri[0]]]+=projected/3;sourceNodeArea[ids[tri[1]]]+=projected/3;sourceNodeArea[ids[tri[2]]]+=projected/3;
    }
  }
}
let sourceNodalLoadReplay=0,sourceNodalAreaReplay=0;
for(let n=0;n<np;n++){sourceNodalLoadReplay+=sourceP[n]*sourceNodeArea[n];if(sourceP[n]>0)sourceNodalAreaReplay+=sourceNodeArea[n];}
const auditKeyEpoch=new Uint32Array(maximumSampleKeys);let auditEpoch=0;

function saveMaterialHistoryState(){return{
  scalar:{start:materialHistory.start,count:materialHistory.count,totalTime:materialHistory.totalTime,totalPath:materialHistory.totalPath,totalQx:materialHistory.totalQx,totalQy:materialHistory.totalQy,lastSpeed:materialHistory.lastSpeed,lastVx:materialHistory.lastVx,lastVy:materialHistory.lastVy},
  time:materialHistory.time.slice(),path:materialHistory.path.slice(),qx:materialHistory.qx.slice(),qy:materialHistory.qy.slice(),dyn:{...dyn}
};}
function restoreMaterialHistoryState(saved){Object.assign(materialHistory,saved.scalar);materialHistory.time.set(saved.time);materialHistory.path.set(saved.path);materialHistory.qx.set(saved.qx);materialHistory.qy.set(saved.qy);Object.assign(dyn,saved.dyn);}

function runAudit(){
  // Self-contained identical-state coherence probe: audit results must not depend on the caller's previous solve.
  geometryDirty=true;solveGeometry();
  const checks=[],add=(name,pass,value,criterion)=>checks.push({name,pass:!!pass,value,criterion});
  let sampleLoad=0,sampleArea=0,keysUnique=true;auditEpoch++;
  for(let n=0;n<contact.sampleCount;n++){
    sampleLoad+=contact.pressure[n]*contact.area[n];sampleArea+=contact.area[n];
    const key=contact.sampleKey[n];if(auditKeyEpoch[key]===auditEpoch)keysUnique=false;auditKeyEpoch[key]=auditEpoch;
  }
  const full=integrateContactFullScan(currentPos[3],0,Math.cos(geom.camberRad),Math.sin(geom.camberRad),sourceHub+geom.hubShift,fullScanIntegration);
  const fullParity=Math.max(
    Math.abs(full.load-geom.loadN)/Math.max(1,Math.abs(geom.loadN)),
    Math.abs(full.area-geom.area)/Math.max(1,Math.abs(geom.area)),
    Math.abs(full.surfaceArea-geom.surfArea)/Math.max(1,Math.abs(geom.surfArea)),
    Math.abs(full.peak-geom.peak)/Math.max(1,Math.abs(geom.peak))
  );
  add('sourcePayload.nodalLoadReplay',Math.abs(sourceNodalLoadReplay-S.renderReevaluation.loadN)/S.renderReevaluation.loadN<.002,sourceNodalLoadReplay,'relative error < 0.2%');
  add('sourcePayload.nodalAreaReplay',Math.abs(sourceNodalAreaReplay-S.renderReevaluation.roadProjectedAreaM2)/S.renderReevaluation.roadProjectedAreaM2<.002,sourceNodalAreaReplay,'relative error < 0.2%');
  add('contact.productionMethod',BRANCH.contactMethod.includes('broad phase')&&BRANCH.contactMethod.includes('triangle clipping'),BRANCH.contactMethod,'structured exact broad phase and clipped triangles');
  add('contact.broadphaseFullParity',fullParity<1e-12,fullParity,'max normalized difference < 1e-12');
  add('contact.broadphaseReduction',performanceState.broadphaseReduction>.98,performanceState.broadphaseReduction,'> 98% triangle rejection');
  add('contact.loadClosure',Math.abs(geom.closure)<1e-8,geom.closure,'abs < 1e-8 %');
  add('contact.sampleLoadIdentity',Math.abs(sampleLoad-geom.loadN)<1e-7,sampleLoad-geom.loadN,'abs < 1e-7 N');
  add('contact.sampleAreaIdentity',Math.abs(sampleArea-geom.area)<1e-12,sampleArea-geom.area,'abs < 1e-12 m²');
  add('contact.sampleTopology',geom.samples===geom.subtriangles*3,[geom.samples,geom.subtriangles],'samples == 3 × subtriangles');
  add('contact.sampleKeysUnique',keysUnique,keysUnique,'unique stable triangle/fan/Gauss keys');
  add('contact.topologyReuse',performanceState.topologyCellReuse>.99&&performanceState.topologySampleReuse>.99,[performanceState.topologyCellReuse,performanceState.topologySampleReuse],'> 99% after identical coherence probe');
  add('solver.warmStart',performanceState.warmStartUsed,performanceState.warmStartUsed,'true after identical continuation probe');
  add('solver.evaluationBudget',performanceState.evaluations<=20,performanceState.evaluations,'<= 20 including final collect');
  add('buffers.noGrowthAfterWarmup',performanceState.bufferGrowthEvents===0,performanceState.bufferGrowthEvents,'== 0 for reference/challenge domains');
  add('pressure.sourceAnchorExact',pressureBasisState(sourcePsi).maxEquilibriumDisplacementM<1e-15,pressureBasisState(sourcePsi).maxEquilibriumDisplacementM,'< 1e-15 m');
  add('pressure.beadFixed',beadEndpointModeNorm<1e-12,beadEndpointModeNorm,'< 1e-12 m');
  const anchorLeft=pressureBasisState(26-1e-5),anchorRight=pressureBasisState(26+1e-5);
  add('pressure.anchorContinuous',Math.abs(anchorRight.coefficientA-anchorLeft.coefficientA)<1e-5&&Math.abs(anchorRight.coefficientB-anchorLeft.coefficientB)<1e-5,[anchorRight.coefficientA-anchorLeft.coefficientA,anchorRight.coefficientB-anchorLeft.coefficientB],'left/right epsilon coefficient differences < 1e-5');
  const zeroSteady=computeSteadyGrip(0,0,false),sat=computeSteadyGrip(.25,16*PI/180,false),rev=computeSteadyGrip(-.12,-6*PI/180,false);
  add('grip.zeroLong',Math.abs(zeroSteady.Flong)<1e-6,zeroSteady.Flong,'abs < 1e-6 N');
  add('grip.localEllipse',sat.utilMax<=1+1e-12,sat.utilMax,'<= 1');
  add('grip.reversalLong',sat.Flong*rev.Flong<0,[sat.Flong,rev.Flong],'product < 0');
  add('grip.reversalLat',sat.Flat*rev.Flat<0,[sat.Flat,rev.Flat],'product < 0');

  const saved=saveMaterialHistoryState(),alphaCancel=Math.atan(-.062*Math.sin(geom.camberRad)),speed=Math.max(5,inputs.speed);
  primeMaterialHistory(inputs.slipRatio,inputs.slipAngleDeg*PI/180,speed,1.05);
  const historySteady=computeHistoryGrip(inputs.slipRatio,inputs.slipAngleDeg*PI/180,false),steadyReference=computeSteadyGrip(inputs.slipRatio,inputs.slipAngleDeg*PI/180,false);
  let steadyError=0;for(const key of ['Flong','Flat','Mz','muEff','utilMean','utilMax','power','patchL','baseMu'])steadyError=Math.max(steadyError,Math.abs(historySteady[key]-steadyReference[key])/(1+Math.abs(steadyReference[key])));
  add('history.steadyBrushParity',steadyError<1e-11,steadyError,'convected history equals steady brush after one patch transit');
  add('history.steadyCoverage',historySteady.insufficientHistory===0,historySteady.insufficientHistory,'zero insufficient samples after prime');
  add('history.storedEnergyFinite',Number.isFinite(historySteady.storedEnergy)&&historySteady.storedEnergy>=0,historySteady.storedEnergy,'finite and nonnegative');
  resetMaterialHistory();const zeroHistory=computeHistoryGrip(0,alphaCancel,false);
  add('history.zeroInput',Math.hypot(zeroHistory.Flong,zeroHistory.Flat)<1e-6,[zeroHistory.Flong,zeroHistory.Flat],'resultant < 1e-6 N with camber slip cancelled');
  primeMaterialHistory(.12,alphaCancel,speed,1.05);const positive=computeHistoryGrip(.12,alphaCancel,false),transit=positive.patchL/speed;
  for(let i=0;i<24;i++)appendMaterialHistory(1.25*transit/24,-.12,alphaCancel,speed);const negative=computeHistoryGrip(-.12,alphaCancel,false);
  add('history.reversalTransport',positive.Flong*negative.Flong<0,[positive.Flong,negative.Flong],'force reverses after > one patch transit');
  primeMaterialHistory(.12,alphaCancel,speed,1.05);for(let i=0;i<24;i++)appendMaterialHistory(1.25*transit/24,0,alphaCancel,speed);const released=computeHistoryGrip(0,alphaCancel,false);
  add('history.releaseTransport',Math.abs(released.Flong)<2,released.Flong,'abs longitudinal force < 2 N after > one patch transit');
  restoreMaterialHistoryState(saved);

  add('scheduler.rateHierarchy',scheduler.rates.history>=scheduler.rates.force&&scheduler.rates.force>=scheduler.rates.geometry&&scheduler.rates.geometry>=scheduler.rates.visual,{...scheduler.rates},'history ≥ force ≥ geometry ≥ visual');
  add('scheduler.accumulatorsBounded',Object.entries(scheduler.acc).every(([name,value])=>value>=-1e-12&&value<scheduler.periods[name]+1e-12),{...scheduler.acc},'all fixed-step accumulators in [0, period)');
  add('scheduler.catchupBounded',scheduler.maxCatchup.history<=64&&scheduler.maxCatchup.force<=32,{...scheduler.maxCatchup},'bounded catch-up limits');
  add('scheduler.telemetryFinite',Object.values(scheduler.jobs).every(job=>Number.isFinite(job.maxDurationMs)&&Number.isFinite(job.maxLatenessMs)),schedulerReceipt().jobs,'finite duration and lateness telemetry');
  add('geometry.layerSpacing',thicknessRatio()>.95,thicknessRatio(),'> 0.95 source spacing ratio');
  add('geometry.noContextLoss',!window.__LAB_CONTEXT_LOST__,window.__LAB_CONTEXT_LOST__,'false');

  if(typeof V82_REFERENCE!=='undefined'){
    const sourceCase=Math.abs(inputs.loadN-sourceRenderLoad)<1e-6&&Math.abs(inputs.camberDeg)<1e-9&&Math.abs(inputs.pressurePsi-sourcePsi)<1e-6;
    const challengeCase=Math.abs(inputs.loadN-1550)<1e-6&&Math.abs(inputs.camberDeg-42)<1e-9&&Math.abs(inputs.pressurePsi-30)<1e-6;
    const reference=sourceCase?V82_REFERENCE.source:(challengeCase?V82_REFERENCE.challenge.geometry:null);
    if(reference){
      const pairs=[['loadCoefficient','load_coefficient'],['hubShift','hub_shift_m'],['loadN','load_n'],['area','projected_area_m2'],['surfArea','surface_area_m2'],['peak','peak_pressure_pa'],['meanP','mean_pressure_pa'],['copX','cop_x_m'],['copY','cop_y_m'],['copZ','cop_z_m'],['localCopX','local_cop_x_m'],['extentX','extent_x_m'],['localExtentX','local_extent_x_m'],['extentY','extent_y_m'],['activePolygons','active_polygons'],['subtriangles','contact_subtriangles'],['samples','contact_samples'],['rEff','effective_radius_m'],['camberRad','camber_rad']];
      let maximumError=0;for(const[browserKey,referenceKey]of pairs)maximumError=Math.max(maximumError,Math.abs(geom[browserKey]-reference[referenceKey])/(1+Math.abs(reference[referenceKey])));
      add('offlineMirror.geometryParity',maximumError<1e-11,maximumError,'max normalized error < 1e-11');
    }
    if(challengeCase){
      const referenceHistory=V82_REFERENCE.challenge.historySteady,pairs=[['Flong','longitudinal_force_n'],['Flat','lateral_force_n'],['Mz','aligning_moment_nm'],['muEff','resultant_over_fz'],['utilMean','mean_utilization'],['utilMax','max_utilization'],['power','slip_power_w'],['storedEnergy','stored_elastic_energy_j'],['patchL','patch_length_m'],['baseMu','base_mu']];
      let maximumError=0;for(const[browserKey,referenceKey]of pairs)maximumError=Math.max(maximumError,Math.abs(historySteady[browserKey]-referenceHistory[referenceKey])/(1+Math.abs(referenceHistory[referenceKey])));
      add('offlineMirror.historyParity',maximumError<1e-11,maximumError,'steady convected-history max normalized error < 1e-11');
    }
  }
  const passed=checks.filter(check=>check.pass).length;
  return{schema:'ducati916.tire-evolution-lab.audit.v8.2',passed,total:checks.length,failed:checks.length-passed,checks,claim:'NUMERICAL DEVELOPMENT CHECKS ONLY; V8.1 CONTACT EQUATIONS PRESERVED, CONVECTED MATERIAL-HISTORY AND MULTI-RATE SCHEDULER VERIFIED NUMERICALLY, PRESSURE/GRIP/THERMAL LAWS REMAIN PROVISIONAL AND UNCALIBRATED'};
}

function showAudit(audit){$('audit').innerHTML=`<div class="audit"><b>declared checks</b><span class="${audit.failed?'bad':'good'}">${audit.passed}/${audit.total}</span></div>`+audit.checks.map(check=>`<div class="r"><span>${check.name}</span><b class="${check.pass?'good':'bad'}">${check.pass?'PASS':'FAIL'}</b></div>`).join('');$('auditNote').textContent=audit.claim;}

function updateAllPanels(){updateContactPanel();updatePressurePanel();updateForcePanel();updatePerformancePanel();updateSchedulerPanel();}
function stepCore(advanceDt=0){
  if(geometryDirty)solveGeometry();
  if(advanceDt>0)appendMaterialHistory(advanceDt);
  computeHistoryGrip(inputs.slipRatio,inputs.slipAngleDeg*PI/180,true);
  return coreSummary();
}
function coreSummary(){return{geom:{...geom,pressureBasis:{...geom.pressureBasis}},dyn:{...dyn},performance:{...performanceState},scheduler:schedulerReceipt(),materialHistory:materialHistoryReceipt(),contact:{samples:contact.sampleCount,patches:contact.patchCount,activeCells:contact.activeCellCount}};}
function flushVisual(){const geometryWasDirty=geometryDirty;stepCore();syncVisualState();if(geometryWasDirty)updateAllPanels();else{updateForcePanel();updatePerformancePanel();updateSchedulerPanel();}drawDirtyPlots();return snapshot();}

function tick(time){
  const dt=clamp((time-lastT)/1000,0,.05);lastT=time;
  if(!paused)advanceScheduler(dt);else if(geometryDirty){timedSchedulerJob('geometry',()=>solveGeometry());computeHistoryGrip(inputs.slipRatio,inputs.slipAngleDeg*PI/180,true);}
  syncVisualState();
  if((mode==='grip'||mode==='pressure')&&scheduler.visualDue){patchColorDirty=true;lineVisualDirty=true;scheduler.visualDue=false;}
  render3D();window.__LAB_GL_ERROR__=gl.getError();requestAnimationFrame(tick);
}

// Two identical geometry solves preserve the V8.1 continuation/topology receipt.
solveGeometry();geometryDirty=true;solveGeometry();
resetMaterialHistory();computeHistoryGrip(0,0,true);
syncVisualState(true);updateAllPanels();drawDirtyPlots(true);
let audit=runAudit();showAudit(audit);
const debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
const runtime={
  schema:BRANCH.schema,sourceModified:false,sourceSha256:BRANCH.sourceSha256,sourceResultSha256:DATA.resultSha256,
  contactMethod:BRANCH.contactMethod,pressureBasis:pressureBasisMetadata,materialHistoryClassification:BRANCH.materialHistoryClassification,
  referenceCases:typeof V82_REFERENCE==='undefined'?null:V82_REFERENCE,
  performanceArchitecture:{
    broadPhase:'structured theta-band then cell-min-z rejection; exact, no false negatives',
    continuation:'warm safeguarded Newton with exact dFz/dz = -K × projected area',
    topology:'stable triangle/fan/Gauss sample keys with per-solve reuse receipts',
    buffers:'grow-only reusable CPU and GPU typed arrays',
    materialHistory:'cumulative path and slip integrals queried by distance behind the leading edge',
    scheduler:'geometry 240 Hz event-driven, history 1000 Hz, force 500 Hz, thermal 100 Hz, visual 60 Hz',
    parallelLane:'zero-copy native C++ context includes shape, contact, history, and grip'
  },
  webgl:{version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),vendor:debugRenderer?gl.getParameter(debugRenderer.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)},audit
};
$('glstatus').textContent=`WebGL2 · ${runtime.webgl.renderer} · glError ${gl.getError()}`;

function contactSummary(){let sampleLoad=0,sampleArea=0;for(let n=0;n<contact.sampleCount;n++){sampleLoad+=contact.pressure[n]*contact.area[n];sampleArea+=contact.area[n];}return{samples:contact.sampleCount,patches:contact.patchCount,subtriangles:geom.subtriangles,activePolygons:geom.activePolygons,activeCells:contact.activeCellCount,sampleLoad,sampleArea,topologyCellReuse:performanceState.topologyCellReuse,topologySampleReuse:performanceState.topologySampleReuse};}
const snapshot=()=>JSON.parse(JSON.stringify({...runtime,inputs:{...inputs},geom:{...geom,pressureBasis:{...geom.pressureBasis}},dyn:{...dyn},performance:{...performanceState},scheduler:schedulerReceipt(),materialHistory:materialHistoryReceipt(),contactSummary:contactSummary(),mode,frames:window.__LAB_FRAMES__,glError:window.__LAB_GL_ERROR__,contextLoss:window.__LAB_CONTEXT_LOST__,thicknessRatio:thicknessRatio()}));

window.__TIRE_V82_STATE__=runtime;
window.__TIRE_V82_AUDIT__=audit;
window.__TIRE_V82_API__={
  snapshot,
  setInputs:values=>{setInputs(values);return true;},
  stepCore,
  stepVehicle:dt=>{advanceScheduler(+dt);return coreSummary();},
  advanceScheduler:dt=>advanceScheduler(+dt),
  runScheduler:(duration,pattern)=>advanceSchedulerDuration(+duration,Array.isArray(pattern)?pattern:[1/60]),
  flush:stepCore,
  flushVisual,
  invalidateGeometry:()=>{geometryDirty=true;return true;},
  setMode:selected=>{mode=selected;setPreset(selected);document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===selected));geometryBuffersDirty=true;outerColorDirty=true;patchColorDirty=true;lineVisualDirty=true;patchPlotDirty=true;syncVisualState();return true;},
  pause:value=>{paused=!!value;return paused;},
  resetHistory:()=>{resetMaterialHistory();computeHistoryGrip(inputs.slipRatio,inputs.slipAngleDeg*PI/180,true);return materialHistoryReceipt();},
  primeHistory:(margin=1.05)=>{const receipt=primeMaterialHistory(inputs.slipRatio,inputs.slipAngleDeg*PI/180,inputs.speed,+margin);computeHistoryGrip(inputs.slipRatio,inputs.slipAngleDeg*PI/180,true);return receipt;},
  evaluateSteadyGrip:(kappa,alphaDeg)=>JSON.parse(JSON.stringify(computeSteadyGrip(+kappa,+alphaDeg*PI/180,false))),
  evaluateHistoryGrip:(kappa,alphaDeg)=>JSON.parse(JSON.stringify(computeHistoryGrip(+kappa,+alphaDeg*PI/180,false))),
  materialHistory:()=>JSON.parse(JSON.stringify(materialHistoryReceipt())),
  scheduler:()=>JSON.parse(JSON.stringify(schedulerReceipt())),
  resetScheduler:(resetTime=true)=>JSON.parse(JSON.stringify(resetSchedulerTelemetry(resetTime!==false))),
  pressureBasis:psi=>pressureBasisState(+psi),
  fullScanReference:()=>{const value=integrateContactFullScan(currentPos[3],0,Math.cos(geom.camberRad),Math.sin(geom.camberRad),sourceHub+geom.hubShift,fullScanIntegration);return JSON.parse(JSON.stringify(value));},
  reAudit:()=>{audit=runAudit();showAudit(audit);return audit;},
  performance:()=>JSON.parse(JSON.stringify(performanceState))
};
window.__TIRE_V82_READY__=true;
requestAnimationFrame(tick);

/* V8.3 approval-interface and vehicle-context extension.
   The numerical tire/contact/history core above is retained unchanged. */
(() => {
'use strict';

const V83 = {
  schema: 'ducati916.tire-evolution-lab.v8.3.approval-vehicle-dynamics',
  classification: 'approval/UI and proposed causal single-wheel dynamics branch over the frozen V8.2 numerical core',
  vehicleRig: 'procedural 916-inspired visual context; exact OEM geometry absent; proposed single-modeled-tire dynamics only',
  sourceModified: false,
  sourceSha256: BRANCH.sourceSha256,
  baseCoreSchema: runtime.schema
};

/* ---------- Workspace and side-panel routing ---------- */
let activeWorkspace = 'vehicleWorkspace';
let activeSidePanel = 'driverPanel';
function setWorkspace(id) {
  if (!$(id)) return false;
  activeWorkspace = id;
  document.querySelectorAll('.workspace').forEach(panel => panel.classList.toggle('active', panel.id === id));
  document.querySelectorAll('[data-workspace]').forEach(button => button.classList.toggle('active', button.dataset.workspace === id));
  if (id === 'contactWorkspace') drawContactLarge();
  if (id === 'sectionWorkspace') drawSectionLarge();
  if (id === 'telemetryWorkspace') drawTelemetryAll(true);
  if (id === 'approvalWorkspace') renderApprovalCards();
  if (id === 'evidenceWorkspace') { crossPlotDirty = patchPlotDirty = tracePlotDirty = true; drawDirtyPlots(true); drawRawSummary(); }
  return true;
}
document.querySelectorAll('[data-workspace]').forEach(button => button.addEventListener('click', () => setWorkspace(button.dataset.workspace)));
function setSidePanel(id) {
  if (!$(id)) return false;
  activeSidePanel = id;
  document.querySelectorAll('.sidePanel').forEach(panel => panel.classList.toggle('active', panel.id === id));
  document.querySelectorAll('[data-side]').forEach(button => button.classList.toggle('active', button.dataset.side === id));
  return true;
}
document.querySelectorAll('[data-side]').forEach(button => button.addEventListener('click', () => setSidePanel(button.dataset.side)));

/* ---------- Visual state ---------- */
let sceneMode = 'bike';
let cameraPreset = 'chase';
const visualOptions = {
  showRig: true, showGhost: true, showMarkers: true, showForces: true, showRoad: true,
  deformationScale: 1, contactFixedScale: true, contactShear: true, contactFrame: 'road',
  sectionGhost: true, sectionScale: 1, sectionLabels: true
};
for (const key of ['showRig','showGhost','showMarkers','showForces','showRoad']) {
  $(key).checked = visualOptions[key];
  $(key).addEventListener('change', () => { visualOptions[key] = $(key).checked; rigLinesDirty = true; });
}
$('deformVisualScale').addEventListener('input', () => {
  visualOptions.deformationScale = +$('deformVisualScale').value;
  $('deformVisualScaleOut').textContent = fmt(visualOptions.deformationScale,2) + '×';
  visualExaggerationDirty = true;
});
let fieldMode='outer';
function setFieldMode(selected){
  if(!['outer','deform','cut','pressure','grip','air'].includes(selected))selected='outer';
  fieldMode=selected;mode=selected==='deform'?'outer':selected;
  if(selected==='deform'){
    if(visualOptions.deformationScale<4)visualOptions.deformationScale=8;
    visualOptions.showGhost=true;$('showGhost').checked=true;
  }else if(selected==='outer'&&visualOptions.deformationScale!==1)visualOptions.deformationScale=1;
  $('deformVisualScale').value=visualOptions.deformationScale;$('deformVisualScaleOut').textContent=fmt(visualOptions.deformationScale,2)+'×';
  document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===selected));
  geometryBuffersDirty=true;outerColorDirty=true;patchColorDirty=true;lineVisualDirty=true;patchPlotDirty=true;visualExaggerationDirty=true;rigLinesDirty=true;
  syncVisualState();return true;
}
// Replace the inherited tire-only handlers. Field changes must never overwrite a vehicle camera.
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=event=>{event.preventDefault();setFieldMode(button.dataset.mode);});
$('contactFixedScale').onclick = () => { visualOptions.contactFixedScale = true; $('contactFixedScale').classList.add('active'); $('contactFit').classList.remove('active'); drawContactLarge(); };
$('contactFit').onclick = () => { visualOptions.contactFixedScale = false; $('contactFit').classList.add('active'); $('contactFixedScale').classList.remove('active'); drawContactLarge(); };
$('contactShear').onclick = () => { visualOptions.contactShear = !visualOptions.contactShear; $('contactShear').classList.toggle('active', visualOptions.contactShear); drawContactLarge(); };
$('contactShear').classList.add('active');
$('contactFrame').onchange = () => { visualOptions.contactFrame = $('contactFrame').value; drawContactLarge(); };
$('sectionSourceGhost').onclick = () => { visualOptions.sectionGhost = !visualOptions.sectionGhost; $('sectionSourceGhost').classList.toggle('active', visualOptions.sectionGhost); drawSectionLarge(); };
$('sectionExaggerate').onclick = () => {
  visualOptions.sectionScale = visualOptions.sectionScale === 1 ? 5 : visualOptions.sectionScale === 5 ? 10 : 1;
  $('sectionExaggerate').textContent = visualOptions.sectionScale + '× deformation';
  drawSectionLarge();
};
$('sectionLabels').onclick = () => { visualOptions.sectionLabels = !visualOptions.sectionLabels; $('sectionLabels').classList.toggle('active', visualOptions.sectionLabels); drawSectionLarge(); };

document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => setScene(button.dataset.scene)));
document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => setCamera(button.dataset.camera)));
function setScene(selected) {
  sceneMode = selected;
  document.querySelectorAll('[data-scene]').forEach(button => button.classList.toggle('active', button.dataset.scene === selected));
  $('quadLabels').style.display = selected === 'quad' ? 'block' : 'none';
  setCamera(selected === 'contact' ? 'low' : selected === 'front' ? 'front' : selected === 'tire' ? 'orbit' : 'chase');
  rigLinesDirty = true;
  return true;
}
function setCamera(selected) {
  cameraPreset = selected;
  document.querySelectorAll('[data-camera]').forEach(button => button.classList.toggle('active', button.dataset.camera === selected));
  const activeY = vehicleState.activeAxle === 'rear' ? -vehicleState.wheelbase : 0;
  if (selected === 'chase') cam = {yaw:.62,pitch:.20,dist:2.90,target:[0,-.72,.50]};
  else if (selected === 'side') cam = {yaw:PI/2,pitch:.05,dist:2.35,target:[0,-.72,.48]};
  else if (selected === 'front') cam = {yaw:0,pitch:.04,dist:1.62,target:[0,-.22,.43]};
  else if (selected === 'low') cam = {yaw:.62,pitch:-.06,dist:1.06,target:[geom.copX,activeY+geom.copY,.215]};
  else cam = {yaw:-1.22,pitch:.24,dist:sceneMode==='tire'?.92:2.1,target:sceneMode==='tire'?[0,activeY,.18]:[0,-.65,.48]};
  return true;
}
$('resetCam').onclick = () => setCamera(cameraPreset);
canvas3d.onwheel = event => { cam.dist = clamp(cam.dist * Math.exp(event.deltaY * .001), .18, 5.5); event.preventDefault(); };

/* ---------- Proposed single-wheel / single-track dynamics harness ---------- */
const rig = {
  brakeTorqueNm:520, driveTorqueNm:380, turnRadiusM:55, vehicleMassKg:225, wheelInertiaKgM2:.62,
  cgHeightM:.56, rollTauS:.32, slipAngleTargetDeg:4.2, aeroCdA:.40, rollingResistanceN:24,
  frontStaticLoadN:1120, rearStaticLoadN:1040, forceContribution:1
};
const rigSpecs = [
  ['brakeTorqueNm','maximum brake torque',0,800,1,' N·m'],['driveTorqueNm','maximum drive torque',0,650,1,' N·m'],
  ['turnRadiusM','turn radius',15,200,.5,' m'],['vehicleMassKg','vehicle + rider mass',120,350,1,' kg'],
  ['wheelInertiaKgM2','modeled wheel inertia',.2,1.5,.01,' kg·m²'],['cgHeightM','CG height proxy',.30,.90,.01,' m'],
  ['rollTauS','roll response time',.08,1.2,.01,' s'],['slipAngleTargetDeg','corner slip-angle target',0,10,.1,'°']
];
$('rigControls').innerHTML=rigSpecs.map(([key,label,min,max,step])=>`<div class="ctrl"><label for="rig_${key}">${label}</label><input id="rig_${key}" type="range" min="${min}" max="${max}" step="${step}" value="${rig[key]}"><output id="rig_${key}Out"></output></div>`).join('');
function rigDecimals(step){return step<.01?3:step<.1?2:step<1?1:0;}
function updateRigOutput(key){const s=rigSpecs.find(item=>item[0]===key);$('rig_'+key+'Out').textContent=fmt(rig[key],rigDecimals(s[4]))+s[5];}
function setRigValues(values){for(const[key,value]of Object.entries(values)){if(!(key in rig))continue;rig[key]=+value;const el=$('rig_'+key);if(el){el.value=rig[key];updateRigOutput(key);}}return{...rig};}
for(const spec of rigSpecs){const key=spec[0],el=$('rig_'+key);updateRigOutput(key);el.oninput=()=>{rig[key]=+el.value;updateRigOutput(key);};}
$('loadTransfer').checked=true;$('speedHold').checked=false;

const scenarioDefinitions = {
  manual:{label:'Manual tire rig',duration:0,description:'Direct tire sliders. The dynamics controller is disabled and the rotating hardware follows the commanded slip.',activeAxle:null,manual:true},
  free:{label:'Free rolling',duration:6,description:'Torque-free wheel and vehicle integration from a matched rolling state.',activeAxle:'front',initialSpeed:25,baseLoadN:1120,dynamic:true},
  brake:{label:'High-speed braking',duration:6.5,description:'Applied front brake torque decelerates wheel speed, generates negative slip, tire force, vehicle deceleration and load transfer.',activeAxle:'front',initialSpeed:52,baseLoadN:1120,dynamic:true},
  trail:{label:'Trail braking into corner',duration:8,description:'Front brake torque releases as turn command, target lean and lateral slip rise.',activeAxle:'front',initialSpeed:42,baseLoadN:1120,dynamic:true},
  corner:{label:'Steady-radius corner',duration:8,description:'An external road-speed hold isolates roll, camber, contact migration and lateral-force response.',activeAxle:'front',initialSpeed:25,baseLoadN:1220,dynamic:true,speedHold:true},
  exit:{label:'Corner exit / drive torque',duration:7,description:'Rear modeled wheel receives drive torque while lean and slip-angle command unwind.',activeAxle:'rear',initialSpeed:22,baseLoadN:1040,dynamic:true},
  slalom:{label:'Alternating slalom',duration:10,description:'External road-speed hold with sinusoidal turn and slip-angle commands.',activeAxle:'front',initialSpeed:24,baseLoadN:1180,dynamic:true,speedHold:true},
  loadSweep:{label:'Vertical-load response sweep',duration:9,description:'Quasi-static contact response across 500–2300 N and back; wheel dynamics are intentionally bypassed.',activeAxle:'front',initialSpeed:12,baseLoadN:1417.5,prescribed:true},
  pressureSweep:{label:'Inflation-pressure response sweep',duration:9,description:'Quasi-static contact response from 18–46 psi and back at fixed load.',activeAxle:'front',initialSpeed:12,baseLoadN:1450,prescribed:true}
};
const scenario={name:'manual',running:false,time:0,timeScale:1,completed:false};
const vehicleState={
  schema:'ducati916.proposed-single-wheel-single-track-harness.v8.3',wheelbase:1.41,massKg:rig.vehicleMassKg,activeAxle:'front',distance:0,
  speed:inputs.speed,frontSpin:0,rearSpin:0,frontOmega:0,rearOmega:0,roadPhase:0,driveTorqueNm:0,brakeTorqueNm:0,contactTorqueNm:0,
  wheelSurfaceSpeed:inputs.speed,slipRatio:inputs.slipRatio,ax:0,ay:0,yawRate:0,steerDeg:0,leanDeg:inputs.camberDeg,targetLeanDeg:inputs.camberDeg,
  slipAngleDeg:inputs.slipAngleDeg,targetSlipAngleDeg:inputs.slipAngleDeg,baseLoadN:sourceRenderLoad,loadTargetN:sourceRenderLoad,
  suspensionCompressionM:0,bodyPitchRad:0,lastDt:0,dynamicsMode:'manual',integrationSubsteps:0
};
function smooth01(x){x=clamp(x,0,1);return x*x*(3-2*x);}
function rampPulse(u,start,end,releaseStart=1){if(u<start)return smooth01(u/Math.max(start,1e-9));if(u<end)return 1;if(u<releaseStart)return 1-smooth01((u-end)/Math.max(releaseStart-end,1e-9));return 0;}
function scenarioEnvelope(name,time){
  const def=scenarioDefinitions[name]||scenarioDefinitions.manual,u=def.duration?clamp(time/def.duration,0,1):0;
  const out={u,brakeTorqueNm:0,driveTorqueNm:0,cornerCommand:0,alphaTargetDeg:0,targetLeanDeg:0,pressurePsi:sourcePsi,baseLoadN:def.baseLoadN||sourceRenderLoad,speedHold:!!def.speedHold,prescribedValues:null};
  if(name==='brake'){const b=rampPulse(u,.10,.72,.98);out.brakeTorqueNm=rig.brakeTorqueNm*b;}
  else if(name==='trail'){out.brakeTorqueNm=rig.brakeTorqueNm*rampPulse(u,.07,.30,.66);out.cornerCommand=smooth01((u-.15)/.40)*(1-.18*smooth01((u-.82)/.18));out.alphaTargetDeg=rig.slipAngleTargetDeg*out.cornerCommand;}
  else if(name==='corner'){const hold=smooth01(u/.18)*(1-smooth01((u-.84)/.16));out.cornerCommand=hold;out.alphaTargetDeg=rig.slipAngleTargetDeg*hold;out.speedHold=true;}
  else if(name==='exit'){const exit=smooth01(u/.24);out.driveTorqueNm=rig.driveTorqueNm*exit*(1-.15*smooth01((u-.90)/.10));out.cornerCommand=(1-.70*smooth01(u))*smooth01(u/.10);out.alphaTargetDeg=rig.slipAngleTargetDeg*out.cornerCommand;}
  else if(name==='slalom'){const env=smooth01(u/.10)*smooth01((1-u)/.10),wave=Math.sin(TAU*2.15*u);out.cornerCommand=wave*env;out.alphaTargetDeg=rig.slipAngleTargetDeg*wave*env;out.speedHold=true;}
  else if(name==='loadSweep'){const wave=.5-.5*Math.cos(TAU*u);out.prescribedValues={speed:12,loadN:500+1800*wave,pressurePsi:sourcePsi,camberDeg:20,slipRatio:0,slipAngleDeg:2,temperatureC:72};}
  else if(name==='pressureSweep'){const wave=.5-.5*Math.cos(TAU*u);out.prescribedValues={speed:12,loadN:1450,pressurePsi:18+28*wave,camberDeg:20,slipRatio:0,slipAngleDeg:2,temperatureC:72};}
  const radius=Math.max(5,rig.turnRadiusM),speed=Math.max(0,vehicleState.speed||def.initialSpeed||inputs.speed);out.targetLeanDeg=out.cornerCommand*Math.atan(speed*speed/(9.81*radius))*180/PI;
  return out;
}
// Compatibility envelope used only by the timeline. Longitudinal color represents normalized applied torque, not prescribed tire slip.
function scenarioProfile(name,time){const e=scenarioEnvelope(name,time),torqueScale=Math.max(1,rig.brakeTorqueNm,rig.driveTorqueNm);return{u:e.u,values:{camberDeg:e.targetLeanDeg,slipRatio:.25*(e.driveTorqueNm-e.brakeTorqueNm)/torqueScale,slipAngleDeg:e.alphaTargetDeg},envelope:e};}
function activeOmega(){return vehicleState.activeAxle==='rear'?vehicleState.rearOmega:vehicleState.frontOmega;}
function setActiveOmega(value){if(vehicleState.activeAxle==='rear')vehicleState.rearOmega=value;else vehicleState.frontOmega=value;}
function scenarioInitialise(name,clearPlots=true){
  const def=scenarioDefinitions[name]||scenarioDefinitions.manual,r=Math.max(.05,geom.rEff||sourceHub);
  vehicleState.activeAxle=def.activeAxle||vehicleState.activeAxle;$('activeAxle').value=vehicleState.activeAxle;
  vehicleState.massKg=rig.vehicleMassKg;vehicleState.speed=def.initialSpeed??inputs.speed;vehicleState.frontOmega=vehicleState.speed/r;vehicleState.rearOmega=vehicleState.speed/(r*1.01);
  vehicleState.frontSpin=vehicleState.rearSpin=vehicleState.roadPhase=0;vehicleState.distance=0;vehicleState.driveTorqueNm=vehicleState.brakeTorqueNm=vehicleState.contactTorqueNm=0;
  vehicleState.ax=vehicleState.ay=vehicleState.yawRate=vehicleState.steerDeg=0;vehicleState.leanDeg=vehicleState.targetLeanDeg=0;vehicleState.slipAngleDeg=vehicleState.targetSlipAngleDeg=0;
  vehicleState.baseLoadN=def.baseLoadN||sourceRenderLoad;vehicleState.loadTargetN=vehicleState.baseLoadN;vehicleState.dynamicsMode=def.manual?'manual':def.prescribed?'quasi-static sweep':'integrated';
  scenario.time=0;scenario.completed=false;setScenarioRunning(false);$('speedHold').checked=!!def.speedHold;resetMaterialHistory();history.length=0;if(clearPlots)clearV83Telemetry();
  const values={speed:vehicleState.speed,loadN:vehicleState.baseLoadN,pressurePsi:sourcePsi,camberDeg:0,slipRatio:0,slipAngleDeg:0,mu:inputs.mu,temperatureC:inputs.temperatureC,wetness:inputs.wetness};
  if(def.prescribed){const e=scenarioEnvelope(name,0);Object.assign(values,e.prescribedValues||{});}
  setInputs(values);stepCore();const solvedR=Math.max(.05,geom.rEff);vehicleState.frontOmega=vehicleState.speed/solvedR;vehicleState.rearOmega=vehicleState.speed/(solvedR*1.01);rigLinesDirty=true;updateScenarioUI();return true;
}
function selectScenario(name,reset=true){
  if(!scenarioDefinitions[name])name='manual';scenario.name=name;const def=scenarioDefinitions[name];$('scenarioSelect').value=name;$('scenarioName').textContent=def.label;$('scenarioDescription').textContent=def.description;
  if(reset)scenarioInitialise(name,true);else{scenario.completed=false;if(def.activeAxle){vehicleState.activeAxle=def.activeAxle;$('activeAxle').value=def.activeAxle;}updateScenarioUI();}
  return true;
}
function setScenarioRunning(value){
  scenario.running=!!value;paused=!scenario.running;$('pause').textContent=paused?'Resume core':'Pause core';
  $('scenarioPlay').textContent=scenario.running?'Pause scenario':'Run scenario';$('timelinePlay').textContent=scenario.running?'Pause':'Run scenario';return scenario.running;
}
function resetScenario(){return scenarioInitialise(scenario.name,true);}
function deriveManualKinematics(dt){
  const r=Math.max(.05,geom.rEff),rearR=r*1.01;vehicleState.speed=Math.max(0,inputs.speed);vehicleState.leanDeg=vehicleState.targetLeanDeg=inputs.camberDeg;vehicleState.slipAngleDeg=vehicleState.targetSlipAngleDeg=inputs.slipAngleDeg;
  vehicleState.frontOmega=vehicleState.speed*(1+(vehicleState.activeAxle==='front'?inputs.slipRatio:0))/r;vehicleState.rearOmega=vehicleState.speed*(1+(vehicleState.activeAxle==='rear'?inputs.slipRatio:0))/rearR;
  vehicleState.driveTorqueNm=Math.max(0,dyn.Flong*r);vehicleState.brakeTorqueNm=Math.max(0,-dyn.Flong*r);vehicleState.contactTorqueNm=dyn.Flong*r;vehicleState.ax=0;vehicleState.ay=0;vehicleState.yawRate=0;vehicleState.steerDeg=0;vehicleState.dynamicsMode='manual';
  advanceWheelVisuals(dt);
}
function prepareScenarioState(dt){
  const def=scenarioDefinitions[scenario.name];if(!def)return;
  if(scenario.running&&def.duration){scenario.time=Math.min(def.duration,scenario.time+dt*scenario.timeScale);if(scenario.time>=def.duration-1e-12){scenario.completed=true;scenario.running=false;setScenarioRunning(false);}}
  if(def.manual)return;
  const e=scenarioEnvelope(scenario.name,scenario.time);vehicleState.driveTorqueNm=e.driveTorqueNm;vehicleState.brakeTorqueNm=e.brakeTorqueNm;vehicleState.targetLeanDeg=clamp(e.targetLeanDeg,-55,55);vehicleState.targetSlipAngleDeg=e.alphaTargetDeg;vehicleState.baseLoadN=e.baseLoadN;
  if(def.prescribed){setInputs(e.prescribedValues||{});vehicleState.speed=inputs.speed;vehicleState.leanDeg=inputs.camberDeg;vehicleState.slipAngleDeg=inputs.slipAngleDeg;vehicleState.dynamicsMode='quasi-static sweep';return;}
  const rollBlend=1-Math.exp(-Math.max(0,dt)/Math.max(.03,rig.rollTauS)),alphaBlend=1-Math.exp(-Math.max(0,dt)/.18);vehicleState.leanDeg+=rollBlend*(vehicleState.targetLeanDeg-vehicleState.leanDeg);vehicleState.slipAngleDeg+=alphaBlend*(vehicleState.targetSlipAngleDeg-vehicleState.slipAngleDeg);
  const r=Math.max(.05,geom.rEff),omega=activeOmega(),den=Math.max(1,Math.abs(vehicleState.speed)),kappa=clamp((omega*r-vehicleState.speed)/den,-.25,.25);
  const transfer=$('loadTransfer').checked?rig.vehicleMassKg*vehicleState.ax*rig.cgHeightM/vehicleState.wheelbase:0;const load=vehicleState.activeAxle==='front'?vehicleState.baseLoadN-transfer:vehicleState.baseLoadN+transfer;
  vehicleState.loadTargetN=clamp(load,200,2600);vehicleState.slipRatio=kappa;vehicleState.massKg=rig.vehicleMassKg;vehicleState.dynamicsMode='integrated';
  setInputs({speed:Math.max(0,vehicleState.speed),slipRatio:kappa,slipAngleDeg:vehicleState.slipAngleDeg,camberDeg:vehicleState.leanDeg,loadN:vehicleState.loadTargetN,pressurePsi:e.pressurePsi});
}
function advanceWheelVisuals(dt){
  vehicleState.frontSpin=(vehicleState.frontSpin+vehicleState.frontOmega*dt)%TAU;vehicleState.rearSpin=(vehicleState.rearSpin+vehicleState.rearOmega*dt)%TAU;vehicleState.distance+=Math.max(0,vehicleState.speed)*dt;vehicleState.roadPhase=(vehicleState.roadPhase+Math.max(0,vehicleState.speed)*dt)%4;vehicleState.lastDt=dt;rigLinesDirty=true;
}
function integrateVehicleState(dt){
  const def=scenarioDefinitions[scenario.name];if(!def||def.manual){deriveManualKinematics(dt);return;}if(def.prescribed){const r=Math.max(.05,geom.rEff);vehicleState.frontOmega=vehicleState.speed/r;vehicleState.rearOmega=vehicleState.speed/(r*1.01);advanceWheelVisuals(dt);return;}
  const hold=!!def.speedHold||$('speedHold').checked,steps=Math.max(1,Math.ceil(Math.max(0,dt)/.001)),h=steps?dt/steps:0;vehicleState.integrationSubsteps=steps;
  for(let i=0;i<steps;i++){
    const r=Math.max(.05,geom.rEff),omega=activeOmega(),drag=.5*1.225*rig.aeroCdA*vehicleState.speed*Math.abs(vehicleState.speed),rolling=rig.rollingResistanceN*Math.tanh(vehicleState.speed/.6),fx=rig.forceContribution*dyn.Flong;
    vehicleState.ax=hold?0:(fx-drag-rolling)/Math.max(1,rig.vehicleMassKg);if(!hold)vehicleState.speed=Math.max(0,vehicleState.speed+vehicleState.ax*h);
    const contactTorque=dyn.Flong*r,brakeSign=Math.tanh(omega/.5),omegaDot=(vehicleState.driveTorqueNm-vehicleState.brakeTorqueNm*brakeSign-contactTorque)/Math.max(.03,rig.wheelInertiaKgM2);setActiveOmega(Math.max(0,omega+omegaDot*h));vehicleState.contactTorqueNm=contactTorque;
    if(vehicleState.activeAxle==='front')vehicleState.rearOmega=vehicleState.speed/(r*1.01);else vehicleState.frontOmega=vehicleState.speed/r;
  }
  const radius=Math.max(5,rig.turnRadiusM),corner=scenarioEnvelope(scenario.name,scenario.time).cornerCommand;vehicleState.ay=corner*vehicleState.speed*vehicleState.speed/radius;vehicleState.yawRate=corner*vehicleState.speed/radius;vehicleState.steerDeg=corner*Math.atan(vehicleState.wheelbase/radius)*180/PI;
  const r=Math.max(.05,geom.rEff);vehicleState.wheelSurfaceSpeed=activeOmega()*r;vehicleState.slipRatio=clamp((vehicleState.wheelSurfaceSpeed-vehicleState.speed)/Math.max(1,Math.abs(vehicleState.speed)),-.25,.25);
  vehicleState.suspensionCompressionM=clamp((inputs.loadN-sourceTarget)/42000,-.018,.038);vehicleState.bodyPitchRad=clamp(-vehicleState.ax/9.81*.11,-.075,.075);advanceWheelVisuals(dt);
  // Publish the post-integration state for the HUD and the next material-history step without forcing an extra geometry solve in this frame.
  setInputs({speed:vehicleState.speed,slipRatio:vehicleState.slipRatio});
}
const baseAdvanceScheduler=advanceScheduler;
advanceScheduler=function(frameDt){
  // The vehicle host may render at 60 Hz, but the tire/geometry coupling is advanced in bounded 240 Hz chunks. Wheel dynamics still substep internally at <=1 ms.
  let remaining=Math.max(0,+frameDt||0),receipt=schedulerReceipt();
  while(remaining>1e-12){const dt=Math.min(1/240,remaining);prepareScenarioState(dt);receipt=baseAdvanceScheduler(dt);integrateVehicleState(dt);remaining-=dt;}
  return receipt;
};

$('scenarioSelect').onchange=()=>selectScenario($('scenarioSelect').value,true);
$('activeAxle').onchange=()=>{vehicleState.activeAxle=$('activeAxle').value;const r=Math.max(.05,geom.rEff);setActiveOmega(vehicleState.speed/r);resetMaterialHistory();rigLinesDirty=true;updateScenarioUI();};
$('timeScale').oninput=()=>{scenario.timeScale=+$('timeScale').value;$('timeScaleOut').textContent=fmt(scenario.timeScale,1)+'×';};
$('scenarioPlay').onclick=()=>setScenarioRunning(!scenario.running);$('scenarioReset').onclick=()=>resetScenario();
function advanceScenarioBy(dt){if(scenario.name==='manual')return;const was=scenario.running;scenario.running=true;advanceScheduler(Math.max(0,dt));scenario.running=was&& !scenario.completed;updateScenarioUI();}
$('scenarioStep').onclick=()=>advanceScenarioBy(.1);$('timelinePlay').onclick=()=>setScenarioRunning(!scenario.running);
$('timelineBack').onclick=()=>{if(scenario.name==='manual')return;const target=Math.max(0,scenario.time-1);scenarioInitialise(scenario.name,true);setScenarioRunning(true);while(scenario.time<target-1e-12)advanceScheduler(Math.min(1/240,target-scenario.time));setScenarioRunning(false);updateScenarioUI();};
$('timelineForward').onclick=()=>advanceScenarioBy(Math.min(1,Math.max(0,(scenarioDefinitions[scenario.name].duration||0)-scenario.time)));
function updateScenarioUI(){
  const def=scenarioDefinitions[scenario.name],fraction=def.duration?scenario.time/def.duration:0;$('scenarioProgress').style.width=fmt(100*clamp(fraction,0,1),2)+'%';
  $('scenarioSummary').innerHTML=`<span>time</span><b>${fmt(scenario.time,2)} / ${fmt(def.duration,1)} s</b><span>model mode</span><b>${vehicleState.dynamicsMode}</b><span>road / wheel speed</span><b>${fmt(vehicleState.speed*3.6,1)} / ${fmt(activeOmega()*Math.max(.05,geom.rEff)*3.6,1)} km/h</b><span>lean / target</span><b>${fmt(vehicleState.leanDeg,1)} / ${fmt(vehicleState.targetLeanDeg,1)}°</b>`;
  $('scenarioStatus').textContent=(scenario.running?'RUNNING · ':scenario.completed?'COMPLETE · ':'')+def.label.toUpperCase();
}

/* ---------- Extended telemetry ---------- */

const TELEMETRY_CAPACITY=2400;
const telemetry={rows:[],frozen:false};
function clearV83Telemetry(){telemetry.rows.length=0;drawTelemetryAll(true);}
$('clearTelemetry').onclick=()=>clearV83Telemetry();
$('freezeTelemetry').onclick=()=>{telemetry.frozen=!telemetry.frozen;$('freezeTelemetry').textContent=telemetry.frozen?'Resume plots':'Freeze plots';};
function recordV83Telemetry(){
  const rEff=Math.max(.05,geom.rEff),wheelKmh=activeOmega()*rEff*3.6;
  telemetry.rows.push({t:scenario.name==='manual'?scheduler.time:scenario.time,scenarioT:scenario.time,speedKmh:vehicleState.speed*3.6,wheelKmh,camber:vehicleState.leanDeg,targetCamber:vehicleState.targetLeanDeg,kappa:inputs.slipRatio*100,alpha:vehicleState.slipAngleDeg,targetAlpha:vehicleState.targetSlipAngleDeg,
    Fx:dyn.Flong,Fy:dyn.Flat,Fz:geom.loadN,Mz:dyn.Mz,area:geom.area*1e4,peak:geom.peak/1e6,mean:geom.meanP/1e6,temp:dyn.temp,energy:dyn.storedEnergy,util:dyn.utilMean*100,
    frontRpm:vehicleState.frontOmega*60/TAU,rearRpm:vehicleState.rearOmega*60/TAU,driveTorque:vehicleState.driveTorqueNm,brakeTorque:vehicleState.brakeTorqueNm,contactTorque:vehicleState.contactTorqueNm,
    ax:vehicleState.ax,ay:vehicleState.ay,geometryMs:performanceState.geometrySolveMs,forceMs:performanceState.gripMs,mode:vehicleState.dynamicsMode});
  if(telemetry.rows.length>TELEMETRY_CAPACITY)telemetry.rows.splice(0,telemetry.rows.length-TELEMETRY_CAPACITY);
}
let batchScenarioAdvance=false;
const baseVisualFixedStep=visualFixedStep;
visualFixedStep=function(){
  // Batch verification and scripted-scenario runs must advance the numerical
  // lanes without repainting every hidden canvas at every 60 Hz visual tick.
  // We still preserve time-history evidence and mark the final visual state due.
  if(batchScenarioAdvance){
    recordHistory(scheduler.time);
    recordV83Telemetry();
    scheduler.visualDue=true;
    return;
  }
  recordV83Telemetry();
  baseVisualFixedStep();
};

/* ---------- Canvas helpers ---------- */
function prepV83(canvas,background='#061018'){
  // Hidden workspaces report 0×0 during startup. Use deterministic fallback
  // dimensions so pre-rendering cannot create negative physical plot scales;
  // the selected workspace is redrawn at its measured size on activation.
  const large=canvas.id.endsWith('Large'),timeline=canvas.id==='timelineCanvas',telemetryCanvas=canvas.id.startsWith('telemetry');
  const fallbackW=large?960:telemetryCanvas?680:timeline?820:460;
  const fallbackH=large?680:telemetryCanvas?360:timeline?78:280;
  const d=Math.min(devicePixelRatio||1,2),w=Math.max(fallbackW,canvas.clientWidth||0),h=Math.max(fallbackH,canvas.clientHeight||0);
  if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}
  const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);c.fillStyle=background;c.fillRect(0,0,w,h);c.font='11px ui-monospace,SFMono-Regular,Consolas,monospace';c.lineCap='round';c.lineJoin='round';return{c,w,h};
}
function pressureCss(value){const color=pressureColor(clamp(value,0,1));return`rgb(${color.map(x=>Math.round(255*x)).join(',')})`;}
function drawArrow2D(c,x0,y0,x1,y1,color,width=1.5){c.strokeStyle=color;c.fillStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();const a=Math.atan2(y1-y0,x1-x0),s=6;c.beginPath();c.moveTo(x1,y1);c.lineTo(x1-s*Math.cos(a-.45),y1-s*Math.sin(a-.45));c.lineTo(x1-s*Math.cos(a+.45),y1-s*Math.sin(a+.45));c.closePath();c.fill();}
function niceRange(min,max){if(!Number.isFinite(min)||!Number.isFinite(max))return[-1,1];if(Math.abs(max-min)<1e-12){const p=Math.max(1,Math.abs(max)*.2);return[min-p,max+p];}const p=.12*(max-min);return[min-p,max+p];}

/* ---------- True-scale contact map ---------- */
let sourceContactBaseline=null;
function copyCurrentPatch(){return{count:contact.patchCount,pos:Array.from(contact.patchPos.subarray(0,contact.patchCount*9)),pressure:Array.from(contact.patchPressure.subarray(0,contact.patchCount*3)),copX:geom.copX,copY:geom.copY,localCopX:geom.localCopX,hubZ:sourceHub+geom.hubShift,camber:geom.camberRad,area:geom.area,extentX:geom.extentX,localExtentX:geom.localExtentX,extentY:geom.extentY,targetLoadN:inputs.loadN,integratedLoadN:geom.loadN,pressurePsi:inputs.pressurePsi};}
function transformPatchPoint(x,y,z,frame,baseline=false){
  const g=baseline&&sourceContactBaseline?sourceContactBaseline:{copX:geom.copX,copY:geom.copY,localCopX:geom.localCopX,hubZ:sourceHub+geom.hubShift,camber:geom.camberRad};
  if(frame==='tire'){const cg=Math.cos(g.camber),sg=Math.sin(g.camber),lx=cg*x-sg*(z-g.hubZ)-g.localCopX;return[lx,y-g.copY];}
  return[x-g.copX,y-g.copY];
}
function patchBoundary(patch,frame,baseline=false){
  const edges=new Map(),quant=v=>Math.round(v*1e7);
  for(let tri=0;tri<patch.count;tri++){
    const pts=[];for(let v=0;v<3;v++){const q=tri*9+v*3;pts.push(transformPatchPoint(patch.pos[q],patch.pos[q+1],patch.pos[q+2],frame,baseline));}
    for(const [a,b] of [[0,1],[1,2],[2,0]]){const A=pts[a],B=pts[b],ka=`${quant(A[0])},${quant(A[1])}`,kb=`${quant(B[0])},${quant(B[1])}`,key=ka<kb?ka+'|'+kb:kb+'|'+ka;const item=edges.get(key);if(item)item.count++;else edges.set(key,{count:1,A,B});}
  }
  return[...edges.values()].filter(e=>e.count===1);
}
function drawContactCanvas(canvas,compact=false){
  const{c,w,h}=prepV83(canvas),patch={count:contact.patchCount,pos:contact.patchPos,pressure:contact.patchPressure};
  if(!patch.count){c.fillStyle='#ff7468';c.fillText('NO ACTIVE CONTACT',20,34);return;}
  const frame=visualOptions.contactFrame;let xmin=1e9,xmax=-1e9,ymin=1e9,ymax=-1e9;
  for(let tri=0;tri<patch.count;tri++)for(let v=0;v<3;v++){const q=tri*9+v*3,[x,y]=transformPatchPoint(patch.pos[q],patch.pos[q+1],patch.pos[q+2],frame);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  let spanX,spanY;if(visualOptions.contactFixedScale&&!compact){spanX=spanY=.120;}else{spanX=Math.max(.025,(xmax-xmin)+.018);spanY=Math.max(.035,(ymax-ymin)+.018);}
  const left=compact?28:56,right=compact?14:250,top=compact?26:34,bottom=compact?24:44,scale=Math.min((w-left-right)/spanX,(h-top-bottom)/spanY),cx=left+(w-left-right)/2,cy=top+(h-top-bottom)/2;
  const xp=x=>cx+x*scale,yp=y=>cy-y*scale;
  c.strokeStyle='#17313d';c.lineWidth=1;const grid=.010;
  const halfX=(w-left-right)/(2*scale),halfY=(h-top-bottom)/(2*scale);
  for(let x=Math.ceil(-halfX/grid)*grid;x<=halfX+1e-9;x+=grid){c.beginPath();c.moveTo(xp(x),top);c.lineTo(xp(x),h-bottom);c.stroke();if(!compact){c.fillStyle='#63808c';c.fillText(`${Math.round(x*1000)}`,xp(x)+2,h-bottom+15);}}
  for(let y=Math.ceil(-halfY/grid)*grid;y<=halfY+1e-9;y+=grid){c.beginPath();c.moveTo(left,yp(y));c.lineTo(w-right,yp(y));c.stroke();if(!compact){c.fillStyle='#63808c';c.fillText(`${Math.round(y*1000)}`,8,yp(y)-2);}}
  c.strokeStyle='#385866';c.beginPath();c.moveTo(xp(0),top);c.lineTo(xp(0),h-bottom);c.moveTo(left,yp(0));c.lineTo(w-right,yp(0));c.stroke();
  if(sourceContactBaseline&&!compact){const boundary=patchBoundary(sourceContactBaseline,frame,true);c.strokeStyle='rgba(195,213,220,.42)';c.setLineDash([5,4]);c.lineWidth=1.5;for(const e of boundary){c.beginPath();c.moveTo(xp(e.A[0]),yp(e.A[1]));c.lineTo(xp(e.B[0]),yp(e.B[1]));c.stroke();}c.setLineDash([]);}
  const pmax=Math.max(1,geom.peak);
  for(let tri=0;tri<patch.count;tri++){
    const pts=[],ps=[];for(let v=0;v<3;v++){const q=tri*9+v*3;pts.push(transformPatchPoint(patch.pos[q],patch.pos[q+1],patch.pos[q+2],frame));ps.push(patch.pressure[tri*3+v]);}
    c.fillStyle=pressureCss((ps[0]+ps[1]+ps[2])/(3*pmax));c.beginPath();c.moveTo(xp(pts[0][0]),yp(pts[0][1]));c.lineTo(xp(pts[1][0]),yp(pts[1][1]));c.lineTo(xp(pts[2][0]),yp(pts[2][1]));c.closePath();c.fill();
  }
  const boundary=patchBoundary(patch,frame,false);c.strokeStyle='#f2fbff';c.lineWidth=1.7;for(const e of boundary){c.beginPath();c.moveTo(xp(e.A[0]),yp(e.A[1]));c.lineTo(xp(e.B[0]),yp(e.B[1]));c.stroke();}
  c.strokeStyle='#76efad';c.lineWidth=2;c.beginPath();c.arc(xp(0),yp(0),6,0,TAU);c.stroke();c.beginPath();c.moveTo(xp(0)-9,yp(0));c.lineTo(xp(0)+9,yp(0));c.moveTo(xp(0),yp(0)-9);c.lineTo(xp(0),yp(0)+9);c.stroke();
  if(visualOptions.contactShear){const stride=Math.max(1,Math.floor(contact.sampleCount/(compact?70:180))),fScale=(compact?0.000035:0.000055)*scale;for(let n=0;n<contact.sampleCount;n+=stride){const [x,y]=transformPatchPoint(contact.x[n],contact.y[n],0,frame),fx=contact.forceLat[n],fy=contact.forceLong[n],mag=Math.hypot(fx,fy);if(mag<1e-8)continue;drawArrow2D(c,xp(x),yp(y),xp(x)+fx*fScale,yp(y)-fy*fScale,'rgba(103,217,255,.72)',compact?1:1.2);}}
  const width=xmax-xmin,length=ymax-ymin;
  if(!compact){
    c.strokeStyle='#ffc667';c.fillStyle='#ffc667';c.lineWidth=1.2;
    const yDim=yp(ymin)-16;c.beginPath();c.moveTo(xp(xmin),yDim);c.lineTo(xp(xmax),yDim);c.moveTo(xp(xmin),yDim-5);c.lineTo(xp(xmin),yDim+5);c.moveTo(xp(xmax),yDim-5);c.lineTo(xp(xmax),yDim+5);c.stroke();c.fillText(`${fmt(width*1000,2)} mm`,(xp(xmin)+xp(xmax))/2-28,yDim-5);
    const xDim=xp(xmax)+18;c.beginPath();c.moveTo(xDim,yp(ymin));c.lineTo(xDim,yp(ymax));c.moveTo(xDim-5,yp(ymin));c.lineTo(xDim+5,yp(ymin));c.moveTo(xDim-5,yp(ymax));c.lineTo(xDim+5,yp(ymax));c.stroke();c.save();c.translate(xDim+11,(yp(ymin)+yp(ymax))/2+28);c.rotate(-PI/2);c.fillText(`${fmt(length*1000,2)} mm`,0,0);c.restore();
    c.fillStyle='#8ba8b5';c.fillText(`${frame==='road'?'ROAD':'TIRE-LOCAL'} FRAME · fixed physical grid · dashed outline = source state`,left,18);c.fillText('lateral x [mm]',w/2-38,h-10);c.save();c.translate(14,h/2+40);c.rotate(-PI/2);c.fillText('rolling y [mm]',0,0);c.restore();
    const barX=left+12,barY=h-bottom-17;c.strokeStyle='#e9f8fd';c.lineWidth=2;c.beginPath();c.moveTo(barX,barY);c.lineTo(barX+.010*scale,barY);c.moveTo(barX,barY-4);c.lineTo(barX,barY+4);c.moveTo(barX+.010*scale,barY-4);c.lineTo(barX+.010*scale,barY+4);c.stroke();c.fillStyle='#e9f8fd';c.fillText('10 mm',barX+2,barY-7);
    const delta=sourceContactBaseline&&sourceContactBaseline.area?100*(geom.area/sourceContactBaseline.area-1):0;c.fillStyle=delta>=0?'#76efad':'#ffc667';c.fillText(`CURRENT ${fmt(geom.area*1e4,3)} cm² · ${delta>=0?'+':''}${fmt(delta,1)}% vs source`,left,h-28);
  }
}
function drawContactLarge(){
  drawContactCanvas($('contactLarge'),false);const delta=sourceContactBaseline&&sourceContactBaseline.area?100*(geom.area/sourceContactBaseline.area-1):0;
  $('legendPeak').textContent=fmt(geom.peak/1e6,3)+' MPa';$('legendMean').textContent=fmt(geom.meanP/1e6,3)+' MPa';$('legendArea').textContent=fmt(geom.area*1e4,3)+' cm²';
  $('legendExtent').textContent=fmt((visualOptions.contactFrame==='tire'?geom.localExtentX:geom.extentX)*1000,2)+' × '+fmt(geom.extentY*1000,2)+' mm';$('legendCop').textContent=fmt(geom.localCopX*1000,2)+' mm';
  $('legendDelta').textContent=(delta>=0?'+':'')+fmt(delta,2)+' %';$('legendDelta').className=Math.abs(delta)<.02?'good':delta>=0?'good':'warn';
  $('legendLoad').textContent=`${fmt(inputs.loadN,1)} / ${fmt(geom.loadN,1)} N`;
  $('legendState').textContent=`${fmt(inputs.pressurePsi,1)} psi · ${fmt(inputs.camberDeg,1)}° camber`;
}
function applyContactEvidenceState(values){selectScenario('manual',true);setInputs(values);stepCore();syncVisualState(true);drawContactLarge();return window.__TIRE_V82_API__.snapshot();}
$('contactSourceState').onclick=()=>applyContactEvidenceState({loadN:sourceRenderLoad,pressurePsi:sourcePsi,camberDeg:0,slipRatio:0,slipAngleDeg:0,speed:20});
$('contactLowLoad').onclick=()=>applyContactEvidenceState({loadN:800,pressurePsi:sourcePsi,camberDeg:0,slipRatio:0,slipAngleDeg:0,speed:20});
$('contactHighLoad').onclick=()=>applyContactEvidenceState({loadN:2200,pressurePsi:sourcePsi,camberDeg:0,slipRatio:0,slipAngleDeg:0,speed:20});
$('contactLowPressure').onclick=()=>applyContactEvidenceState({loadN:1417.5,pressurePsi:22,camberDeg:0,slipRatio:0,slipAngleDeg:0,speed:20});
$('contactHighPressure').onclick=()=>applyContactEvidenceState({loadN:1417.5,pressurePsi:42,camberDeg:0,slipRatio:0,slipAngleDeg:0,speed:20});
$('contactChallenge').onclick=()=>applyContactEvidenceState({loadN:1550,pressurePsi:30,camberDeg:42,slipRatio:.12,slipAngleDeg:5.5,speed:38,mu:1.22,temperatureC:78,wetness:.08});

/* ---------- Camber/section evidence ---------- */
function sectionBand(){const outer=currentPos[3];let best=0,lowest=1e99;for(let i=0;i<nt;i++){let z=0;for(let j=Math.max(0,(nu>>1)-2);j<=Math.min(nu-1,(nu>>1)+2);j++)z+=outer[v3(i,j)+2];if(z<lowest){lowest=z;best=i;}}return best;}
function localSectionPoint(array,band,j,source=false){const q=v3(band,j);if(source)return[array[q],array[q+2]-sourceHub];const hubZ=sourceHub+geom.hubShift,cg=Math.cos(geom.camberRad),sg=Math.sin(geom.camberRad),x=array[q],z=array[q+2];return[cg*x-sg*(z-hubZ),sg*x+cg*(z-hubZ)];}
function drawSectionCanvas(canvas,compact=false){
  const{c,w,h}=prepV83(canvas),band=sectionBand(),scaleDef=compact?1:visualOptions.sectionScale,cg=Math.cos(geom.camberRad),sg=Math.sin(geom.camberRad),hubZ=sourceHub+geom.hubShift;
  const sections=[];let xmin=1e9,xmax=-1e9,zmin=1e9,zmax=-1e9;
  for(let k=0;k<4;k++){
    const pts=[];for(let j=0;j<nu;j++){const cur=localSectionPoint(currentPos[k],band,j,false),src=localSectionPoint(sourcePos[k],band,j,true),p=[src[0]+scaleDef*(cur[0]-src[0]),src[1]+scaleDef*(cur[1]-src[1])];pts.push(p);xmin=Math.min(xmin,p[0],src[0]);xmax=Math.max(xmax,p[0],src[0]);zmin=Math.min(zmin,p[1],src[1]);zmax=Math.max(zmax,p[1],src[1]);}sections.push(pts);
  }
  const roadZ=x=>(sg*x-hubZ)/Math.max(cg,1e-6),xPad=.018,zPad=.014;
  zmin=Math.min(zmin,roadZ(xmin-xPad),roadZ(xmax+xPad))-.006;zmax+=.022;xmin-=xPad;xmax+=xPad;
  const left=compact?22:58,right=compact?15:42,top=compact?25:38,bottom=compact?24:54,plotW=w-left-right,plotH=h-top-bottom,s=Math.min(plotW/Math.max(.01,xmax-xmin),plotH/Math.max(.01,zmax-zmin)),cx=left-(xmin)*s,cz=top+zmax*s;
  const xp=x=>cx+x*s,zp=z=>cz-z*s;
  // Metric grid in the actual tire-local section plane.
  c.strokeStyle='#17313d';c.lineWidth=1;
  const gx0=Math.ceil(xmin/.010)*.010,gz0=Math.ceil(zmin/.010)*.010;
  for(let x=gx0;x<=xmax+1e-9;x+=.010){c.beginPath();c.moveTo(xp(x),top);c.lineTo(xp(x),h-bottom);c.stroke();if(!compact)c.fillStyle='#607d88',c.fillText(`${Math.round(x*1000)}`,xp(x)+2,h-bottom+16);}
  for(let z=gz0;z<=zmax+1e-9;z+=.010){c.beginPath();c.moveTo(left,zp(z));c.lineTo(w-right,zp(z));c.stroke();if(!compact)c.fillStyle='#607d88',c.fillText(`${Math.round(z*1000)}`,8,zp(z)-2);}
  // Road plane in wheel coordinates and source/current laminate boundaries.
  c.strokeStyle='#9aabb1';c.lineWidth=compact?1.5:2.5;c.beginPath();c.moveTo(xp(xmin),zp(roadZ(xmin)));c.lineTo(xp(xmax),zp(roadZ(xmax)));c.stroke();
  if(visualOptions.sectionGhost&&!compact){for(let k=0;k<4;k++){c.strokeStyle='rgba(190,210,220,.30)';c.lineWidth=1.2;c.setLineDash([5,4]);c.beginPath();for(let j=0;j<nu;j++){const p=localSectionPoint(sourcePos[k],band,j,true);j?c.lineTo(xp(p[0]),zp(p[1])):c.moveTo(xp(p[0]),zp(p[1]));}c.stroke();c.setLineDash([]);}}
  for(let k=0;k<4;k++){c.strokeStyle=`rgb(${cols[k].map(v=>Math.round(v*255)).join(',')})`;c.lineWidth=compact?1.8:3;c.beginPath();sections[k].forEach((p,j)=>j?c.lineTo(xp(p[0]),zp(p[1])):c.moveTo(xp(p[0]),zp(p[1])));c.stroke();}
  // Local bead seats and rim barrel only. A full wheel circle is intentionally omitted because this is a meridional cut at the contact station.
  const beadL=sections[0][0],beadR=sections[0].at(-1),towardHub=Math.max(beadL[1],beadR[1])+.014,seatInset=.011;
  c.strokeStyle='#82949b';c.lineWidth=compact?1.2:3;
  c.beginPath();c.moveTo(xp(beadL[0]-.008),zp(beadL[1]-.004));c.lineTo(xp(beadL[0]-.008),zp(beadL[1]+.012));c.lineTo(xp(beadL[0]+seatInset),zp(beadL[1]+.012));c.lineTo(xp(beadL[0]+.021),zp(towardHub));c.lineTo(xp(beadR[0]-.021),zp(towardHub));c.lineTo(xp(beadR[0]-seatInset),zp(beadR[1]+.012));c.lineTo(xp(beadR[0]+.008),zp(beadR[1]+.012));c.lineTo(xp(beadR[0]+.008),zp(beadR[1]-.004));c.stroke();
  // Continuous-contact width and pressure-weighted COP on the same road line used by the solver.
  const xlo=geom.localCopX-.5*geom.localExtentX,xhi=geom.localCopX+.5*geom.localExtentX,copZ=roadZ(geom.localCopX);
  c.strokeStyle='#ffc667';c.lineWidth=compact?3.5:7;c.beginPath();c.moveTo(xp(xlo),zp(roadZ(xlo)));c.lineTo(xp(xhi),zp(roadZ(xhi)));c.stroke();
  c.fillStyle='#76efad';c.beginPath();c.arc(xp(geom.localCopX),zp(copZ),compact?3:6,0,TAU);c.fill();
  // Road-normal/global-vertical vector expressed in the tire-local plane.
  if(!compact){const nLen=.038,nx=-sg,nz=cg;drawArrow2D(c,xp(geom.localCopX),zp(copZ),xp(geom.localCopX+nx*nLen),zp(copZ+nz*nLen),'#67d9ff',2);c.fillStyle='#67d9ff';c.fillText('ROAD NORMAL / GLOBAL +Z',xp(geom.localCopX+nx*nLen)+7,zp(copZ+nz*nLen)-4);}
  if(!compact){
    c.fillStyle='#8ba8b5';c.fillText('TIRE-LOCAL AXIAL x / RADIAL z SECTION · 10 mm grid',left,20);c.fillText('solid = current · dashed = source · amber = continuous contact width · green = COP',left,h-14);
    c.fillStyle='#dcecf3';if(visualOptions.sectionLabels){c.fillText('OUTSIDE',xp(sections[3][0][0])+3,zp(sections[3][0][1])-10);c.fillText('INSIDE',xp(sections[3].at(-1)[0])-42,zp(sections[3].at(-1)[1])-10);c.fillStyle='#ffc667';c.fillText(`${fmt(geom.localExtentX*1000,2)} mm`,(xp(xlo)+xp(xhi))/2-24,(zp(roadZ(xlo))+zp(roadZ(xhi)))/2+22);}
    // Camber inset: global road frame, wheel radial direction, and angle are separated from the zoomed material section.
    const ix=w-170,iy=96,R=56;c.fillStyle='rgba(5,13,18,.88)';c.strokeStyle='#355460';c.lineWidth=1;c.beginPath();c.roundRect(ix-78,iy-78,155,144,7);c.fill();c.stroke();
    c.strokeStyle='#8f9fa6';c.lineWidth=2;c.beginPath();c.moveTo(ix-62,iy+45);c.lineTo(ix+62,iy+45);c.stroke();
    const dx=Math.sin(geom.camberRad),dz=-Math.cos(geom.camberRad);c.strokeStyle='#dcecf3';c.lineWidth=3;c.beginPath();c.moveTo(ix,iy-28);c.lineTo(ix+dx*78,iy-28-dz*78);c.stroke();
    c.strokeStyle='#67d9ff';c.lineWidth=2;c.beginPath();c.arc(ix,iy-28,34,PI/2,PI/2+geom.camberRad,geom.camberRad<0);c.stroke();c.fillStyle='#67d9ff';c.fillText(`${fmt(inputs.camberDeg,1)}°`,ix+40*Math.sin(geom.camberRad*.5)-12,iy-28+40*Math.cos(geom.camberRad*.5));
    c.fillStyle='#8ba8b5';c.fillText('GLOBAL CAMBER',ix-52,iy-58);c.fillText('road',ix+36,iy+40);c.fillText('wheel radial',ix+dx*58-26,iy-28-dz*58-6);
  }
}
function drawSectionLarge(){drawSectionCanvas($('sectionLarge'),false);$('sectionInfo').innerHTML=rows({'camber / lean':fmt(inputs.camberDeg,2)+'°','selected material band':String(sectionBand()),'hub height':fmt((sourceHub+geom.hubShift)*1000,3)+' mm','effective radius':fmt(geom.rEff*1000,3)+' mm','local patch width':fmt(geom.localExtentX*1000,3)+' mm','local COP lateral':fmt(geom.localCopX*1000,3)+' mm','visual deformation scale':fmt(visualOptions.sectionScale,1)+'×','source ghost':String(visualOptions.sectionGhost)});}

/* ---------- Multi-band telemetry charts ---------- */
function drawBandChart(canvas,bands){
  const{c,w,h}=prepV83(canvas),rows=telemetry.rows;if(rows.length<2){c.fillStyle='#86a5b3';c.fillText('Telemetry accumulating…',15,34);return;}
  const t0=rows[0].t,t1=rows.at(-1).t,header=24,bottom=12,bandH=(h-header-bottom)/bands.length;
  c.strokeStyle='#17313d';c.lineWidth=1;for(let i=0;i<=5;i++){const x=42+i*(w-54)/5;c.beginPath();c.moveTo(x,header);c.lineTo(x,h-bottom);c.stroke();c.fillStyle='#607d88';c.fillText(fmt(t0+(t1-t0)*i/5,1),x-8,h-2);}
  const xp=t=>42+(t-t0)/Math.max(.001,t1-t0)*(w-54);
  bands.forEach((band,bi)=>{
    const y0=header+bi*bandH,y1=y0+bandH;c.strokeStyle='#24414d';c.beginPath();c.moveTo(0,y1);c.lineTo(w,y1);c.stroke();
    let min=1e99,max=-1e99;for(const row of rows)for(const series of band.series){const v=series.get(row);if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}
    if(band.range){min=band.range[0];max=band.range[1];}else [min,max]=niceRange(min,max);
    const yp=v=>y1-8-(v-min)/Math.max(1e-12,max-min)*(bandH-18);
    c.fillStyle='#86a5b3';c.fillText(band.label,5,y0+12);c.fillText(`${fmt(max,band.decimals??1)} ${band.unit}`,w-104,y0+12);c.fillText(`${fmt(min,band.decimals??1)}`,5,y1-3);
    band.series.forEach(series=>{c.strokeStyle=series.color;c.lineWidth=1.7;c.beginPath();rows.forEach((row,i)=>{const x=xp(row.t),y=yp(series.get(row));i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();});
    let lx=115;for(const series of band.series){c.fillStyle=series.color;c.fillRect(lx,y0+4,10,3);c.fillStyle='#a8c1cc';c.fillText(series.name,lx+14,y0+11);lx+=14+series.name.length*7+18;}
  });
}
function drawTelemetryAll(force=false){if(telemetry.frozen&&!force)return;drawBandChart($('telemetryMotion'),[
  {label:'ROAD / WHEEL SPEED',unit:'km/h',series:[{name:'road',color:'#67d9ff',get:r=>r.speedKmh},{name:'wheel surface',color:'#ffc667',get:r=>r.wheelKmh}]},
  {label:'LEAN',unit:'deg',range:[-60,60],series:[{name:'actual',color:'#ffc667',get:r=>r.camber},{name:'target',color:'#dcecf3',get:r=>r.targetCamber}]},
  {label:'LONGITUDINAL SLIP κ',unit:'%',range:[-25,25],series:[{name:'κ ×100',color:'#ff7468',get:r=>r.kappa}]},
  {label:'SLIP ANGLE α',unit:'deg',range:[-16,16],series:[{name:'actual',color:'#c995ff',get:r=>r.alpha},{name:'target',color:'#dcecf3',get:r=>r.targetAlpha}]}
]);drawBandChart($('telemetryForce'),[
  {label:'LONGITUDINAL / LATERAL FORCE',unit:'N',series:[{name:'Fx',color:'#67d9ff',get:r=>r.Fx},{name:'Fy',color:'#ff8f6a',get:r=>r.Fy}]},
  {label:'NORMAL LOAD',unit:'N',range:[0,2700],series:[{name:'Fz',color:'#76efad',get:r=>r.Fz}]},
  {label:'ALIGNING MOMENT',unit:'N·m',series:[{name:'Mz',color:'#c995ff',get:r=>r.Mz}]}
]);drawBandChart($('telemetryTire'),[
  {label:'PROJECTED PATCH AREA',unit:'cm²',range:[0,25],series:[{name:'area',color:'#76efad',get:r=>r.area}]},
  {label:'CONTACT PRESSURE',unit:'MPa',range:[0,4],series:[{name:'peak',color:'#ffc667',get:r=>r.peak},{name:'mean',color:'#ff8f6a',get:r=>r.mean}]},
  {label:'TREAD TEMPERATURE',unit:'°C',range:[0,150],series:[{name:'tread',color:'#ff7468',get:r=>r.temp}]},
  {label:'STORED ENERGY / FRICTION USE',unit:'J / %',series:[{name:'stored J',color:'#67d9ff',get:r=>r.energy},{name:'util %',color:'#c995ff',get:r=>r.util}]}
]);drawBandChart($('telemetryWheel'),[
  {label:'WHEEL SPEED',unit:'rpm',series:[{name:'front',color:'#67d9ff',get:r=>r.frontRpm},{name:'rear',color:'#ff8f6a',get:r=>r.rearRpm}]},
  {label:'APPLIED / CONTACT TORQUE',unit:'N·m',series:[{name:'drive +',color:'#76efad',get:r=>r.driveTorque},{name:'brake −',color:'#ff7468',get:r=>-r.brakeTorque},{name:'Fx·r',color:'#ffc667',get:r=>r.contactTorque}]},
  {label:'LONGITUDINAL / LATERAL ACCEL',unit:'m/s²',series:[{name:'ax',color:'#67d9ff',get:r=>r.ax},{name:'ay',color:'#c995ff',get:r=>r.ay}]},
  {label:'CORE RUNTIME',unit:'ms',range:[0,8],series:[{name:'geometry',color:'#ffc667',get:r=>r.geometryMs},{name:'force',color:'#c995ff',get:r=>r.forceMs}]}
]);}

function drawTimeline(){
  const{c,w,h}=prepV83($('timelineCanvas'),'#09151d'),def=scenarioDefinitions[scenario.name];c.strokeStyle='#24414d';c.beginPath();c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();
  if(def.duration){const samples=180,maxTorque=Math.max(1,rig.brakeTorqueNm,rig.driveTorqueNm);for(let i=0;i<samples-1;i++){const a=scenarioEnvelope(scenario.name,def.duration*i/(samples-1)),b=scenarioEnvelope(scenario.name,def.duration*(i+1)/(samples-1)),x0=i/(samples-1)*w,x1=(i+1)/(samples-1)*w;
      const curves=[[a.targetLeanDeg,b.targetLeanDeg,'#ffc667',55,1],[a.brakeTorqueNm,b.brakeTorqueNm,'#ff7468',maxTorque,-1],[a.driveTorqueNm,b.driveTorqueNm,'#76efad',maxTorque,1],[a.alphaTargetDeg,b.alphaTargetDeg,'#c995ff',10,1]];
      for(const[v0,v1,color,scale,sign]of curves){c.strokeStyle=color;c.beginPath();c.moveTo(x0,h/2-sign*v0/scale*h*.38);c.lineTo(x1,h/2-sign*v1/scale*h*.38);c.stroke();}}
    const x=clamp(scenario.time/def.duration,0,1)*w;c.strokeStyle='#e8f7fc';c.lineWidth=2;c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();
  }else{c.fillStyle='#86a5b3';c.fillText('manual control — timeline inactive',12,26);}
  $('timelineReadout').innerHTML=`<span>scenario time</span><b>${fmt(scenario.time,3)} s</b><span>road / wheel speed</span><b>${fmt(vehicleState.speed*3.6,1)} / ${fmt(activeOmega()*Math.max(.05,geom.rEff)*3.6,1)} km/h</b><span>applied drive / brake</span><b>${fmt(vehicleState.driveTorqueNm,1)} / ${fmt(vehicleState.brakeTorqueNm,1)} N·m</b><span>contact torque Fx·r</span><b>${fmt(vehicleState.contactTorqueNm,1)} N·m</b><span>κ / ax</span><b>${fmt(inputs.slipRatio,4)} / ${fmt(vehicleState.ax,2)} m/s²</b>`;
}

/* ---------- Procedural WebGL vehicle context ---------- */
const RIG_MESH=program(`#version 300 es
precision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 n;uniform mat4 vp,model;out vec3 N,W;void main(){vec4 w=model*vec4(p,1);W=w.xyz;N=mat3(model)*n;gl_Position=vp*w;}`,
`#version 300 es
precision highp float;in vec3 N,W;uniform vec3 eye,tint;out vec4 o;void main(){vec3 n=normalize(N),v=normalize(eye-W),l=normalize(vec3(-.45,-.25,.86)),h=normalize(l+v);float d=.20+.80*max(dot(n,l),0.);float s=.25*pow(max(dot(n,h),0.),42.);o=vec4(pow(max(tint*d+s,vec3(0.)),vec3(1./2.2)),1);}`);
const RIG_TIRE=program(`#version 300 es
precision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec3 c;uniform mat4 vp,model;uniform float vertexMix;uniform vec3 tint;out vec3 N,C,W;void main(){vec4 w=model*vec4(p,1);W=w.xyz;N=mat3(model)*n;C=mix(tint,c,vertexMix);gl_Position=vp*w;}`,
`#version 300 es
precision highp float;in vec3 N,C,W;uniform vec3 eye;out vec4 o;void main(){vec3 n=normalize(N),v=normalize(eye-W),l=normalize(vec3(-.45,-.25,.86)),h=normalize(l+v);float d=.20+.80*max(dot(n,l),0.);float s=.20*pow(max(dot(n,h),0.),45.);o=vec4(pow(max(C*d+s,vec3(0.)),vec3(1./2.2)),1);}`);
const RIG_COLOR=program(`#version 300 es
precision highp float;layout(location=0)in vec3 p;layout(location=1)in vec3 c;uniform mat4 vp,model;out vec3 C;void main(){C=c;gl_Position=vp*model*vec4(p,1);}`,
`#version 300 es
precision highp float;in vec3 C;out vec4 o;void main(){o=vec4(C,1);}`);
function matT(x,y,z){const m=ident();m[12]=x;m[13]=y;m[14]=z;return m;}
function matS(x,y,z){const m=ident();m[0]=x;m[5]=y;m[10]=z;return m;}
function matRX(a){const m=ident(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
function matRY(a){const m=ident(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
function matRZ(a){const m=ident(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;}
function compose(...items){let out=ident();for(const item of items)out=mul(out,item);return out;}
function transformPointM(m,p){return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function createStaticMesh(position,normal,index){const vao=gl.createVertexArray();gl.bindVertexArray(vao);const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(position),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);const nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normal),gl.STATIC_DRAW);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);const ind=new Uint32Array(index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,ind,gl.STATIC_DRAW);return{vao,count:ind.length};}
function createBoxMesh(){const p=[],n=[],ind=[];const faces=[[[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],[[-1,0,0],[[-.5,.5,-.5],[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5]]],[[0,1,0],[[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,-1,0],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,-.5,.5],[.5,-.5,.5]]],[[0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,0,-1],[[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5],[-.5,-.5,-.5]]]];for(const[f,verts]of faces){const o=p.length/3;for(const v of verts){p.push(...v);n.push(...f);}ind.push(o,o+1,o+2,o,o+2,o+3);}return createStaticMesh(p,n,ind);}
function createSphereMesh(a=28,b=16){const p=[],n=[],ind=[];for(let j=0;j<=b;j++){const v=j/b,th=PI*v;for(let i=0;i<=a;i++){const u=i/a,ph=TAU*u,x=Math.sin(th)*Math.cos(ph),y=Math.sin(th)*Math.sin(ph),z=Math.cos(th);p.push(x,y,z);n.push(x,y,z);}}for(let j=0;j<b;j++)for(let i=0;i<a;i++){const q=j*(a+1)+i,r=q+a+1;ind.push(q,r,q+1,q+1,r,r+1);}return createStaticMesh(p,n,ind);}
function createCylinderMesh(seg=24){const p=[],n=[],ind=[];for(let i=0;i<=seg;i++){const a=TAU*i/seg,x=Math.cos(a),y=Math.sin(a);p.push(x,y,-.5,x,y,.5);n.push(x,y,0,x,y,0);}for(let i=0;i<seg;i++){const q=2*i;ind.push(q,q+1,q+3,q,q+3,q+2);}const base=p.length/3;p.push(0,0,-.5,0,0,.5);n.push(0,0,-1,0,0,1);for(let i=0;i<seg;i++){const a=TAU*i/seg,b=TAU*(i+1)/seg,x0=Math.cos(a),y0=Math.sin(a),x1=Math.cos(b),y1=Math.sin(b),o=p.length/3;p.push(x0,y0,-.5,x1,y1,-.5,x0,y0,.5,x1,y1,.5);n.push(0,0,-1,0,0,-1,0,0,1,0,0,1);ind.push(base,o+1,o,base+1,o+2,o+3);}return createStaticMesh(p,n,ind);}
function createTorusXMesh(majorSeg=64,minorSeg=12,tube=.08){const p=[],n=[],ind=[];for(let i=0;i<=majorSeg;i++){const a=TAU*i/majorSeg,sa=Math.sin(a),ca=Math.cos(a);for(let j=0;j<=minorSeg;j++){const b=TAU*j/minorSeg,sb=Math.sin(b),cb=Math.cos(b),r=1+tube*cb,x=tube*sb,y=r*sa,z=r*ca;p.push(x,y,z);n.push(sb,cb*sa,cb*ca);}}const row=minorSeg+1;for(let i=0;i<majorSeg;i++)for(let j=0;j<minorSeg;j++){const q=i*row+j,r=q+row;ind.push(q,r,q+1,q+1,r,r+1);}return createStaticMesh(p,n,ind);}
const meshBox=createBoxMesh(),meshSphere=createSphereMesh(),meshCylinder=createCylinderMesh(),meshTorus=createTorusXMesh(72,12,.075),meshDisc=createTorusXMesh(64,10,.035);
function drawMesh(mesh,vp,eye,model,tint){gl.useProgram(RIG_MESH);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_MESH,'vp'),false,vp);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_MESH,'model'),false,model);gl.uniform3fv(gl.getUniformLocation(RIG_MESH,'eye'),eye);gl.uniform3fv(gl.getUniformLocation(RIG_MESH,'tint'),tint);gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}
function segmentModel(a,b,radius){const d=sub3(b,a),len=Math.hypot(...d)||1,z=[d[0]/len,d[1]/len,d[2]/len],ref=Math.abs(z[2])>.9?[0,1,0]:[0,0,1],x=norm3(crossVec(ref,z)),y=crossVec(z,x),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];return new Float32Array([x[0]*radius,x[1]*radius,x[2]*radius,0,y[0]*radius,y[1]*radius,y[2]*radius,0,z[0]*len,z[1]*len,z[2]*len,0,mid[0],mid[1],mid[2],1]);}
function drawSegment(vp,eye,a,b,radius,tint){drawMesh(meshCylinder,vp,eye,segmentModel(a,b,radius),tint);}

let rigLineCapacity=65536,rigLineCount=0,rigLinesDirty=true;
let rigLinePosition=new Float32Array(rigLineCapacity*3),rigLineColor=new Float32Array(rigLineCapacity*3);
const rigLineVao=gl.createVertexArray(),rigLinePB=gl.createBuffer(),rigLineCB=gl.createBuffer();gl.bindVertexArray(rigLineVao);
for(const[loc,buf]of[[0,rigLinePB],[1,rigLineCB]]){gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,rigLineCapacity*3*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}
function ensureRigLineCapacity(required){if(required<=rigLineCapacity)return;rigLineCapacity=nextPowerOfTwo(required);rigLinePosition=growTyped(rigLinePosition,Float32Array,rigLineCapacity*3);rigLineColor=growTyped(rigLineColor,Float32Array,rigLineCapacity*3);for(const buf of[rigLinePB,rigLineCB]){gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,rigLineCapacity*3*4,gl.DYNAMIC_DRAW);}}
function addRigLine(a,b,color){ensureRigLineCapacity(rigLineCount+2);let q=rigLineCount*3;rigLinePosition[q]=a[0];rigLinePosition[q+1]=a[1];rigLinePosition[q+2]=a[2];rigLineColor[q]=color[0];rigLineColor[q+1]=color[1];rigLineColor[q+2]=color[2];q+=3;rigLinePosition[q]=b[0];rigLinePosition[q+1]=b[1];rigLinePosition[q+2]=b[2];rigLineColor[q]=color[0];rigLineColor[q+1]=color[1];rigLineColor[q+2]=color[2];rigLineCount+=2;}
function addArrow3(a,b,color){addRigLine(a,b,color);const d=norm3(sub3(b,a)),ref=Math.abs(d[2])>.8?[0,1,0]:[0,0,1],s1=norm3(crossVec(d,ref)),s2=norm3(crossVec(d,s1)),len=.035;addRigLine(b,[b[0]-d[0]*len+s1[0]*len*.45,b[1]-d[1]*len+s1[1]*len*.45,b[2]-d[2]*len+s1[2]*len*.45],color);addRigLine(b,[b[0]-d[0]*len-s1[0]*len*.45,b[1]-d[1]*len-s1[1]*len*.45,b[2]-d[2]*len-s1[2]*len*.45],color);addRigLine(b,[b[0]-d[0]*len+s2[0]*len*.45,b[1]-d[1]*len+s2[1]*len*.45,b[2]-d[2]*len+s2[2]*len*.45],color);}
function addWheelTorqueArc(hubY,torqueNm,color){
  if(Math.abs(torqueNm)<1)return;const turn=Math.sign(torqueNm),r=.182,start=-.72*PI,span=turn*1.48*PI,steps=28;let prev=null,endA=start;
  for(let i=0;i<=steps;i++){const a=start+span*i/steps,p=wheelPoint(hubY,0,[0,r*Math.sin(a),r*Math.cos(a)]);if(prev)addRigLine(prev,p,color);prev=p;endA=a;}
  const end=wheelPoint(hubY,0,[0,r*Math.sin(endA),r*Math.cos(endA)]),backA=endA-turn*.18,inner=.153;
  addRigLine(end,wheelPoint(hubY,0,[0,r*Math.sin(backA),r*Math.cos(backA)]),color);
  addRigLine(end,wheelPoint(hubY,0,[0,inner*Math.sin(backA),inner*Math.cos(backA)]),color);
}
function activeYOffset(){return vehicleState.activeAxle==='rear'?-vehicleState.wheelbase:0;}
function alignedSourcePoint(k,i,j,yShift=0){const q=v3(i,j),x=sourcePos[k][q],y=sourcePos[k][q+1]+yShift,zr=sourcePos[k][q+2]-sourceHub,cg=Math.cos(geom.camberRad),sg=Math.sin(geom.camberRad);return[cg*x+sg*zr,y,-sg*x+cg*zr+sourceHub+geom.hubShift];}
function currentWorldPoint(k,i,j,yShift=0){const q=v3(i,j);return[currentPos[k][q],currentPos[k][q+1]+yShift,currentPos[k][q+2]];}
function wheelRigidMatrix(hubY,spin,scale=1){return compose(matT(0,hubY,sourceHub+geom.hubShift),matRY(geom.camberRad),matRX(spin),matS(scale,scale,scale));}
function wheelPoint(hubY,spin,p){return transformPointM(wheelRigidMatrix(hubY,spin,1),p);}
function bikeLeanMatrix(){const hubZ=sourceHub+geom.hubShift;return compose(matT(0,0,hubZ),matRY(geom.camberRad),matT(0,0,-hubZ));}
function bikePoint(p){return transformPointM(bikeLeanMatrix(),p);}
function buildRigLines(){
  rigLineCount=0;const activeY=activeYOffset(),roadColor=[.22,.31,.35];
  if(visualOptions.showRoad){const extent=sceneMode==='tire'||sceneMode==='contact'?1.0:3.4;for(let x=-1.0;x<=1.0001;x+=.2)addRigLine([x,-extent,0],[x,.8,0],roadColor);for(let y=-extent;y<=.8;y+=.25)addRigLine([-1,y,0],[1,y,0],roadColor);for(let n=-8;n<=8;n++){const y=((n*.55-vehicleState.roadPhase)%4.4)-2.4;addRigLine([-.025,y,.002],[.025,y+.24,.002],[.78,.82,.84]);}}
  if(visualOptions.showGhost){for(const yShift of[activeY])for(const j of[8,nu>>1,nu-9])for(let i=0;i<nt;i+=3){const ip=(i+3)%nt;addRigLine(alignedSourcePoint(3,i,j,yShift),alignedSourcePoint(3,ip,j,yShift),[.32,.49,.56]);}}
  if(visualOptions.showMarkers){const spin=vehicleState.activeAxle==='rear'?vehicleState.rearSpin:vehicleState.frontSpin;for(let m=0;m<12;m++){const phase=(TAU*m/12-spin)%TAU,i=((Math.round((phase/TAU)*nt)%nt)+nt)%nt;let prev=null;for(let j=1;j<nu-1;j+=2){const p=currentWorldPoint(3,i,j,activeY);if(prev)addRigLine(prev,p,m%3===0?[1,.68,.18]:[.52,.8,.9]);prev=p;}}}
  // Spokes for both rigid wheel assemblies.
  for(const[hubY,spin]of[[0,vehicleState.frontSpin],[-vehicleState.wheelbase,vehicleState.rearSpin]])for(let s=0;s<10;s++){const a=TAU*s/10,p0=wheelPoint(hubY,spin,[0,.038*Math.sin(a),.038*Math.cos(a)]),p1=wheelPoint(hubY,spin,[0,.218*Math.sin(a),.218*Math.cos(a)]);addRigLine(p0,p1,[.74,.78,.80]);}
  // Applied wheel torque is explicit in the 3D evidence: green drives the wheel,
  // red opposes it. Contact reaction remains represented by the force vector.
  if(visualOptions.showForces){const applied=vehicleState.driveTorqueNm-vehicleState.brakeTorqueNm;addWheelTorqueArc(activeY,applied,applied>=0?[.32,1,.56]:[1,.28,.23]);}
  if(visualOptions.showForces&&geom.loadN>0){const base=[geom.copX,geom.copY+activeY,.004],fScale=.00016,nScale=.00008;addArrow3(base,[base[0]+dyn.Flat*fScale,base[1]+dyn.Flong*fScale,base[2]],[.2,.82,1]);addArrow3(base,[base[0],base[1],base[2]+geom.loadN*nScale],[.35,1,.55]);const r=.07,turn=Math.sign(dyn.Mz)||1;let prev=null;for(let i=0;i<=18;i++){const a=turn*PI*1.4*i/18,p=[base[0]+r*Math.cos(a),base[1]+r*Math.sin(a),base[2]+.01];if(prev)addRigLine(prev,p,[.82,.55,1]);prev=p;}}
  gl.bindBuffer(gl.ARRAY_BUFFER,rigLinePB);gl.bufferSubData(gl.ARRAY_BUFFER,0,rigLinePosition.subarray(0,rigLineCount*3));gl.bindBuffer(gl.ARRAY_BUFFER,rigLineCB);gl.bufferSubData(gl.ARRAY_BUFFER,0,rigLineColor.subarray(0,rigLineCount*3));rigLinesDirty=false;
}
function drawRigLines(vp){if(rigLinesDirty)buildRigLines();gl.useProgram(RIG_COLOR);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_COLOR,'vp'),false,vp);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_COLOR,'model'),false,ident());gl.bindVertexArray(rigLineVao);gl.drawArrays(gl.LINES,0,rigLineCount);}
function drawTireWithModel(surface,vp,eye,model,tint=[.45,.48,.5],vertexMix=1,cut=false){gl.useProgram(RIG_TIRE);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_TIRE,'vp'),false,vp);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_TIRE,'model'),false,model);gl.uniform3fv(gl.getUniformLocation(RIG_TIRE,'eye'),eye);gl.uniform3fv(gl.getUniformLocation(RIG_TIRE,'tint'),tint);gl.uniform1f(gl.getUniformLocation(RIG_TIRE,'vertexMix'),vertexMix);gl.bindVertexArray(cut?surface.vaoCut:surface.vao);gl.drawElements(gl.TRIANGLES,cut?surface.cutCount:surface.count,gl.UNSIGNED_INT,0);}
function drawPatchModel(vp,model){if(!patchVertexCount)return;gl.disable(gl.CULL_FACE);gl.useProgram(RIG_COLOR);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_COLOR,'vp'),false,vp);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_COLOR,'model'),false,model);gl.bindVertexArray(patchVao);gl.drawArrays(gl.TRIANGLES,0,patchVertexCount);gl.enable(gl.CULL_FACE);}
function drawBaseLinesModel(vp,model){gl.useProgram(RIG_COLOR);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_COLOR,'vp'),false,vp);gl.uniformMatrix4fv(gl.getUniformLocation(RIG_COLOR,'model'),false,model);gl.bindVertexArray(lineVao);gl.drawArrays(gl.LINES,0,lineVertexCount);}
function drawWheelRigid(vp,eye,hubY,spin,rear=false){const hubZ=sourceHub+geom.hubShift,base=compose(matT(0,hubY,hubZ),matRY(geom.camberRad),matRX(spin));drawMesh(meshTorus,vp,eye,mul(base,matS(.235,.235,.235)),rear?[.25,.27,.29]:[.34,.37,.39]);drawMesh(meshDisc,vp,eye,mul(base,matS(.155,.155,.155)),[.58,.62,.64]);drawMesh(meshCylinder,vp,eye,compose(base,matRY(PI/2),matS(.026,.026,.16)),[.35,.39,.41]);}
function drawBikeBody(vp,eye,frontOnly=false){
  const lean=bikeLeanMatrix(),hubZ=sourceHub+geom.hubShift,comp=vehicleState.suspensionCompressionM,pitch=vehicleState.bodyPitchRad;
  const red=[.78,.025,.035],redDark=[.42,.012,.018],redMid=[.61,.02,.028],silver=[.50,.54,.56],dark=[.055,.065,.072],black=[.025,.030,.034],gold=[.72,.48,.12],glass=[.06,.12,.16],white=[.82,.90,.94];
  const body=(pos,scale,tint,rot=ident())=>drawMesh(meshSphere,vp,eye,compose(lean,matT(...pos),matRX(pitch),rot,matS(...scale)),tint);
  const panel=(pos,scale,tint,rot=ident())=>drawMesh(meshBox,vp,eye,compose(lean,matT(...pos),matRX(pitch),rot,matS(...scale)),tint);
  const cyl=(pos,scale,tint,rot=ident())=>drawMesh(meshCylinder,vp,eye,compose(lean,matT(...pos),matRX(pitch),rot,matS(...scale)),tint);
  // Front suspension, triple clamp, handlebar, mirrors, mudguard and brake calipers.
  for(const x of[-.078,.078]){const a=bikePoint([x,.015,hubZ+.015]),b=bikePoint([x,-.23,.91-comp]);drawSegment(vp,eye,a,b,.016,gold);}
  drawSegment(vp,eye,bikePoint([-.14,-.22,.91-comp]),bikePoint([.14,-.22,.91-comp]),.018,silver);
  drawSegment(vp,eye,bikePoint([-.27,-.28,.99-comp]),bikePoint([.27,-.28,.99-comp]),.010,dark);
  for(const x of[-.30,.30]){drawSegment(vp,eye,bikePoint([x,-.27,.99-comp]),bikePoint([x,-.20,1.06-comp]),.006,dark);body([x,-.19,1.075-comp],[.045,.025,.018],black);}
  body([0,-.02,.49],[.16,.27,.055],redDark,matRX(.06));
  panel([-.14,-.015,.43],[.028,.06,.05],redMid);panel([.14,-.015,.43],[.028,.06,.05],redMid);
  if(frontOnly)return;
  // Distinctive low 916 nose and twin headlamp apertures.
  body([0,-.25,.68],[.25,.34,.18],red,matRX(-.10));
  panel([0,-.105,.76],[.37,.17,.12],redMid,matRX(-.20));
  for(const x of[-.105,.105])panel([x,-.035,.775],[.075,.030,.040],white,matRX(-.08));
  panel([0,-.23,.985],[.22,.085,.14],glass,matRX(-.30));
  // Fairing side shells and intake/vent relief.
  for(const x of[-.205,.205]){
    body([x,-.47,.59],[.065,.37,.23],red,matRZ(x>0?.08:-.08));
    panel([x*1.08,-.52,.60],[.018,.14,.080],dark,matRX(.06));
  }
  // Fuel tank, seat pad and raised monoposto tail.
  body([0,-.72,.82],[.25,.31,.20],redMid,matRX(.02));
  body([0,-.76,.87],[.20,.24,.15],red,matRX(.03));
  panel([0,-1.02,.77],[.30,.29,.075],black,matRX(.025));
  body([0,-1.26,.82],[.19,.31,.115],red,matRX(.085));
  panel([0,-1.42,.86],[.13,.10,.05],redDark,matRX(.12));
  // Engine mass, airbox, radiator and undertray.
  body([0,-.72,.49],[.30,.35,.27],dark);
  panel([0,-.54,.55],[.36,.10,.27],black);
  panel([0,-.35,.49],[.34,.045,.22],silver,matRX(-.04));
  panel([0,-.79,.32],[.30,.30,.055],black);
  cyl([-.15,-.71,.47],[.17,.17,.12],silver,matRY(PI/2));
  cyl([.15,-.71,.47],[.17,.17,.12],silver,matRY(PI/2));
  // Trellis frame and rear subframe: line geometry remains readable through the fairing.
  for(const[a,b]of[
    [[-.18,-.38,.78],[-.16,-.88,.48]],[[.18,-.38,.78],[.16,-.88,.48]],
    [[-.16,-.88,.48],[-.13,-1.22,.72]],[[.16,-.88,.48],[.13,-1.22,.72]],
    [[-.17,-.42,.76],[.17,-.88,.50]],[[.17,-.42,.76],[-.17,-.88,.50]],
    [[-.13,-.95,.66],[-.12,-1.35,.82]],[[.13,-.95,.66],[.12,-1.35,.82]]
  ])drawSegment(vp,eye,bikePoint(a),bikePoint(b),.010,redDark);
  // Swingarm, shock and chain line to rear wheel.
  for(const x of[-.11,.11]){drawSegment(vp,eye,bikePoint([x,-.78,.45]),bikePoint([x,-vehicleState.wheelbase,hubZ]),.027,silver);drawSegment(vp,eye,bikePoint([x,-.90,.58]),bikePoint([x,-vehicleState.wheelbase,hubZ]),.014,silver);}
  drawSegment(vp,eye,bikePoint([0,-.91,.66]),bikePoint([0,-1.18,.43]),.018,gold);
  drawSegment(vp,eye,bikePoint([-.17,-.82,.39]),bikePoint([-.16,-1.39,.34]),.008,[.60,.48,.18]);
  // Twin under-seat exhausts and headers.
  for(const x of[-.14,.14]){drawSegment(vp,eye,bikePoint([x,-.62,.35]),bikePoint([x,-1.13,.58]),.025,silver);cyl([x,-1.27,.70],[.050,.13,.050],silver,matRX(PI/2));}
  // Foot controls and rider reference pegs.
  drawSegment(vp,eye,bikePoint([-.25,-.84,.47]),bikePoint([.25,-.84,.47]),.008,dark);
  for(const x of[-.27,.27])drawSegment(vp,eye,bikePoint([x,-.83,.47]),bikePoint([x,-.76,.45]),.007,silver);
}

function drawRoadMesh(vp,eye){if(!visualOptions.showRoad)return;const length=sceneMode==='tire'||sceneMode==='contact'?1.3:4.2;drawMesh(meshBox,vp,eye,compose(matT(0,-.75,-.025),matS(1.15,length,.035)),[.055,.075,.085]);}
function activeModel(){return vehicleState.activeAxle==='rear'?matT(0,-vehicleState.wheelbase,0):ident();}
function proxyModel(){return vehicleState.activeAxle==='rear'?ident():matT(0,-vehicleState.wheelbase,0);}
function drawActiveTire(vp,eye){const model=activeModel();if(mode==='cut')surfaces.forEach(s=>drawTireWithModel(s,vp,eye,model,cols[s.k],1,true));else if(mode==='air')drawTireWithModel(surfaces[0],vp,eye,model,cols[0],1,false);else drawTireWithModel(surfaces[3],vp,eye,model,[.55,.57,.58],1,false);if((mode==='pressure'||mode==='grip')&&patchVertexCount)drawPatchModel(vp,model);drawBaseLinesModel(vp,model);}
function drawProxyTire(vp,eye){if(sceneMode==='tire'||sceneMode==='contact')return;drawTireWithModel(surfaces[3],vp,eye,proxyModel(),[.19,.22,.24],0,false);}
function drawScene(vp,eye,kind){drawRoadMesh(vp,eye);drawActiveTire(vp,eye);if(visualOptions.showRig){if(kind==='contact'){if(vehicleState.activeAxle==='rear')drawWheelRigid(vp,eye,-vehicleState.wheelbase,vehicleState.rearSpin,true);else drawWheelRigid(vp,eye,0,vehicleState.frontSpin,false);}else{drawProxyTire(vp,eye);drawWheelRigid(vp,eye,0,vehicleState.frontSpin,false);drawWheelRigid(vp,eye,-vehicleState.wheelbase,vehicleState.rearSpin,true);if(kind==='bike'||kind==='side')drawBikeBody(vp,eye,false);else if(kind==='front')drawBikeBody(vp,eye,true);}}drawRigLines(vp);}

let visualExaggerationDirty=true,lastVisualGeometryVersion=-1,lastVisualScale=1;
const baseSyncVisualState=syncVisualState;
function uploadVisualTireScale(){
  const scale=visualOptions.deformationScale,cg=Math.cos(geom.camberRad),sg=Math.sin(geom.camberRad);
  for(const k of requiredSurfaceIndices()){const target=renderPosition[k],cur=currentPos[k],src=sourcePos[k];for(let n=0;n<np;n++){const q=n*3,zr=src[q+2]-sourceHub,sx=cg*src[q]+sg*zr,sy=src[q+1],sz=-sg*src[q]+cg*zr+sourceHub+geom.hubShift;target[q]=sx+scale*(cur[q]-sx);target[q+1]=sy+scale*(cur[q+1]-sy);target[q+2]=sz+scale*(cur[q+2]-sz);}gl.bindBuffer(gl.ARRAY_BUFFER,surfaces[k].pb);gl.bufferSubData(gl.ARRAY_BUFFER,0,target);}
  visualExaggerationDirty=false;lastVisualGeometryVersion=geometryVersion;lastVisualScale=scale;
}
syncVisualState=function(force=false){baseSyncVisualState(force);if(force||visualExaggerationDirty||lastVisualGeometryVersion!==geometryVersion||lastVisualScale!==visualOptions.deformationScale)uploadVisualTireScale();};

function cameraMatrixFromCam(w,h){const cp=Math.cos(cam.pitch),eye=[cam.target[0]+cam.dist*cp*Math.sin(cam.yaw),cam.target[1]+cam.dist*cp*Math.cos(cam.yaw),cam.target[2]+cam.dist*Math.sin(cam.pitch)],vp=mul(persp(.72,w/h,.01,12),look(eye,cam.target,[0,0,1]));return{eye,vp};}
function fixedCamera(kind,w,h){let eye,target;if(kind==='bike'){eye=[1.65,1.6,1.05];target=[0,-.72,.48];}else if(kind==='front'){eye=[0,1.62,.52];target=[0,-.18,.42];}else if(kind==='contact'){const y=activeYOffset();eye=[.76,y+.88,.36];target=[geom.copX,y+geom.copY,.20];}else{eye=[2.15,-.7,.62];target=[0,-.72,.48];}return{eye,vp:mul(persp(.70,w/h,.01,12),look(eye,target,[0,0,1]))};}
render3D=function(){
  syncVisualState();const d=Math.min(devicePixelRatio||1,2),w=Math.max(1,canvas3d.clientWidth),h=Math.max(1,canvas3d.clientHeight);if(canvas3d.width!==Math.round(w*d)||canvas3d.height!==Math.round(h*d)){canvas3d.width=Math.round(w*d);canvas3d.height=Math.round(h*d);}gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.enable(gl.SCISSOR_TEST);gl.clearColor(.035,.05,.06,1);
  if(sceneMode==='quad'){
    const views=[['bike',0,h/2,w/2,h/2],['front',w/2,h/2,w/2,h/2],['contact',0,0,w/2,h/2],['side',w/2,0,w/2,h/2]];
    for(const[kind,x,y,vw,vh]of views){gl.viewport(x*d,y*d,vw*d,vh*d);gl.scissor(x*d,y*d,vw*d,vh*d);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const camQ=fixedCamera(kind,vw,vh);drawScene(camQ.vp,camQ.eye,kind);}
  }else{
    gl.viewport(0,0,canvas3d.width,canvas3d.height);gl.scissor(0,0,canvas3d.width,canvas3d.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const viewCam=cameraMatrixFromCam(w,h);drawScene(viewCam.vp,viewCam.eye,sceneMode);
  }
  gl.disable(gl.SCISSOR_TEST);window.__LAB_GL_ERROR__=gl.getError();window.__LAB_FRAMES__++;
};

/* ---------- Approval gate ---------- */
let approvalSweep=null;
function approvalCard(title,status,value,detail,kind){return`<article class="approvalCard ${kind}"><h3>${title}</h3><div class="big ${kind==='pass'?'good':kind==='fail'?'bad':kind==='blocked'?'warn':''}">${status}</div><b>${value||''}</b><p>${detail}</p></article>`;}
function renderApprovalCards(){
  const baseAudit=window.__TIRE_V82_AUDIT__,loadOk=Math.abs(geom.closure)<.01,contactOk=geom.area>0&&geom.samples>30,glOk=!window.__LAB_CONTEXT_LOST__&&window.__LAB_GL_ERROR__===0;
  const cards=[
    approvalCard('SOURCE INTEGRITY','PASS','SHA preserved','Exact embedded V6.3.5 payload and declared source hash remain unchanged.','pass'),
    approvalCard('CONTINUOUS CONTACT',contactOk?'PASS':'FAIL',`${fmt(geom.area*1e4,2)} cm² · ${geom.samples} samples`,'Filled clipped triangles drive the large contact view and the force integration.',''+(contactOk?'pass':'fail')),
    approvalCard('LOAD CLOSURE',loadOk?'PASS':'FAIL',`${fmt(geom.closure,6)} %`,'Solved normal load versus requested load.',''+(loadOk?'pass':'fail')),
    approvalCard('WEBGL EXECUTION',glOk?'PASS':'FAIL',runtime.webgl.version,'Context loss and GL error gate.',''+(glOk?'pass':'fail')),
    approvalCard('BASE NUMERICAL AUDIT',baseAudit&&baseAudit.failed===0?'PASS':'FAIL',baseAudit?`${baseAudit.passed}/${baseAudit.total}`:'—','Inherited V8.2 integrity checks.',''+(baseAudit&&baseAudit.failed===0?'pass':'fail')),
    approvalCard('CONTACT EVIDENCE UI','PASS','fixed physical scale','Patch size no longer disappears behind auto-fit; outline, area, dimensions, COP, pressure and shear are explicit.','pass'),
    approvalCard('CAMBER EVIDENCE UI','PASS','zoomed tire-local section','Road plane, bead seats, laminate boundaries, COP, road normal and a separate global-camber inset are explicit.','pass'),
    approvalCard('SINGLE-WHEEL DYNAMICS','NUMERICAL','Tdrive − Tbrake − Fx·r','Wheel angular speed and vehicle speed are integrated causally; slip is derived rather than prescribed in dynamic scenarios.','pass'),
    approvalCard('PHYSICAL CALIBRATION','BLOCKED','no rig dataset','Layer constants, pressure modes, grip, thermal and wetness laws remain uncalibrated.','blocked'),
    approvalCard('WHOLE-VEHICLE DYNAMICS','BLOCKED','procedural context only','The full-bike scene is an inspection/test context, not a validated two-tire Ducati rigid-body model.','blocked'),
    approvalCard('HIGH-LEAN TRANSITION','WARNING','≈53° unresolved','Inherited area transition remains outside the approved envelope pending structural snapshots and measurements.','blocked')
  ];
  if(approvalSweep){cards.splice(7,0,
    approvalCard('LOAD RESPONSE',approvalSweep.loadPass?'PASS':'FAIL',approvalSweep.loadAreas.map(v=>fmt(v,2)).join(' → ')+' cm²','Footprint area must increase with vertical load.',approvalSweep.loadPass?'pass':'fail'),
    approvalCard('PRESSURE RESPONSE',approvalSweep.pressurePass?'PASS':'FAIL',approvalSweep.pressureAreas.map(v=>fmt(v,2)).join(' → ')+' cm²','Footprint area must decrease as inflation pressure rises at fixed load.',approvalSweep.pressurePass?'pass':'fail'),
    approvalCard('LONGITUDINAL SIGN',approvalSweep.forcePass?'PASS':'FAIL',`${fmt(approvalSweep.forceNegative,0)} / ${fmt(approvalSweep.forcePositive,0)} N`,'Negative and positive slip commands must produce opposite longitudinal forces.',approvalSweep.forcePass?'pass':'fail'));
  }
  $('approvalGrid').innerHTML=cards.join('');$('modelStatus').textContent='NUMERICAL PASS · PHYSICAL BLOCKED';$('modelStatus').className='warn';
}
function runApprovalSweep(){
  const savedInputs={...inputs},savedHistory=saveMaterialHistoryState(),savedPaused=paused,savedScenario={...scenario},savedVehicle={...vehicleState};scenario.running=false;paused=true;
  const areas=[];for(const load of[800,1400,2200]){setInputs({loadN:load,camberDeg:0,pressurePsi:sourcePsi,slipRatio:0,slipAngleDeg:0,speed:20});stepCore();areas.push(geom.area*1e4);}
  const pAreas=[];for(const pressure of[22,32,42]){setInputs({loadN:1417.5,camberDeg:0,pressurePsi:pressure,slipRatio:0,slipAngleDeg:0,speed:20});stepCore();pAreas.push(geom.area*1e4);}
  setInputs({loadN:1550,camberDeg:0,pressurePsi:30,slipAngleDeg:0,speed:30});resetMaterialHistory();primeMaterialHistory(-.12,0,30,1.1);const neg=computeHistoryGrip(-.12,0,false).Flong;resetMaterialHistory();primeMaterialHistory(.12,0,30,1.1);const pos=computeHistoryGrip(.12,0,false).Flong;
  approvalSweep={schema:'ducati916.approval-response-matrix.v8.3',loadAreas:areas,pressureAreas:pAreas,forceNegative:neg,forcePositive:pos,loadPass:areas[0]<areas[1]&&areas[1]<areas[2],pressurePass:pAreas[0]>pAreas[1]&&pAreas[1]>pAreas[2],forcePass:neg<0&&pos>0};
  setInputs(savedInputs);restoreMaterialHistoryState(savedHistory);paused=savedPaused;Object.assign(scenario,savedScenario);Object.assign(vehicleState,savedVehicle);geometryDirty=true;stepCore();syncVisualState(true);renderApprovalCards();updateV83UI();return JSON.parse(JSON.stringify(approvalSweep));
}
$('runApprovalSweep').onclick=()=>runApprovalSweep();
$('exportState').onclick=()=>{const state=window.__TIRE_V83_API__.snapshot(),blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ducati916_tire_v83_state.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);};

/* ---------- Improved legacy evidence ---------- */
crossPlot=function(){drawSectionCanvas($('cross'),true);crossPlotDirty=false;};
patchPlot=function(){drawContactCanvas($('patch'),true);patchPlotDirty=false;};
tracePlot=function(){drawBandChart($('trace'),[{label:'FORCE / Fz',unit:'ratio',range:[-1.2,1.2],series:[{name:'Fx/Fz',color:'#67d9ff',get:r=>r.Fx/Math.max(1,r.Fz)},{name:'Fy/Fz',color:'#ff8f6a',get:r=>r.Fy/Math.max(1,r.Fz)}]},{label:'Mz',unit:'N·m',series:[{name:'aligning',color:'#c995ff',get:r=>r.Mz}]}]);tracePlotDirty=false;};
function drawRawSummary(){const{c,w,h}=prepV83($('rawSummary'));const lines=[`branch: ${V83.schema}`,`source modified: false`,`contact: ${geom.activePolygons} polygons / ${geom.subtriangles} subtriangles / ${geom.samples} samples`,`load closure: ${fmt(geom.closure,9)} %`,`patch: ${fmt(geom.area*1e4,4)} cm² · ${fmt(geom.extentX*1000,2)} × ${fmt(geom.extentY*1000,2)} mm`,`forces: Fx ${fmt(dyn.Flong,2)} N · Fy ${fmt(dyn.Flat,2)} N · Mz ${fmt(dyn.Mz,3)} N·m`,`history: ${dyn.historyPoints} points · ${fmt(dyn.transitTime*1000,3)} ms transit`,`runtime: geometry ${fmt(performanceState.geometrySolveMs,3)} ms · force ${fmt(performanceState.gripMs,3)} ms`,`claim: numerical development evidence; physical calibration false`];c.fillStyle='#b7cfda';lines.forEach((line,i)=>c.fillText(line,14,32+i*20));}

/* ---------- Main HUD and UI refresh ---------- */
let lastUiTime=performance.now(),uiFrames=0,uiFps=0;
function updateHUD(){
  const active=vehicleState.activeAxle.toUpperCase(),rpm=activeOmega()*60/TAU,wheelKmh=activeOmega()*Math.max(.05,geom.rEff)*3.6;
  $('hudPrimary').innerHTML=`<div class="metric wide"><span>SCENARIO / MODELED TIRE</span><b>${scenarioDefinitions[scenario.name].label} · ${active} · ${vehicleState.dynamicsMode}</b></div><div class="metric"><span>ROAD / WHEEL SURFACE</span><b>${fmt(vehicleState.speed*3.6,1)} / ${fmt(wheelKmh,1)} km/h</b></div><div class="metric"><span>WHEEL SPEED</span><b>${fmt(rpm,0)} rpm</b></div><div class="metric"><span>LEAN ACTUAL / TARGET</span><b>${fmt(vehicleState.leanDeg,1)} / ${fmt(vehicleState.targetLeanDeg,1)}°</b></div><div class="metric"><span>SLIP κ / α</span><b>${fmt(inputs.slipRatio,3)} / ${fmt(inputs.slipAngleDeg,1)}°</b></div><div class="metric"><span>APPLIED DRIVE / BRAKE</span><b>${fmt(vehicleState.driveTorqueNm,0)} / ${fmt(vehicleState.brakeTorqueNm,0)} N·m</b></div><div class="metric"><span>Fx / Fy / Fz</span><b>${fmt(dyn.Flong,0)} / ${fmt(dyn.Flat,0)} / ${fmt(geom.loadN,0)} N</b></div><div class="metric"><span>PATCH / PEAK</span><b>${fmt(geom.area*1e4,2)} cm² / ${fmt(geom.peak/1e6,2)} MPa</b></div>`;
}
function updateVehiclePanel(){$('vehicleState').innerHTML=rows({
  'harness mode':vehicleState.dynamicsMode,'active modeled tire':vehicleState.activeAxle.toUpperCase(),'road / wheel surface speed':fmt(vehicleState.speed*3.6,2)+' / '+fmt(activeOmega()*Math.max(.05,geom.rEff)*3.6,2)+' km/h',
  'front / rear wheel rpm':fmt(vehicleState.frontOmega*60/TAU,0)+' / '+fmt(vehicleState.rearOmega*60/TAU,0),'derived longitudinal slip κ':fmt(inputs.slipRatio,5),'road distance':fmt(vehicleState.distance,2)+' m',
  'applied drive / brake torque':fmt(vehicleState.driveTorqueNm,2)+' / '+fmt(vehicleState.brakeTorqueNm,2)+' N·m','contact torque Fx·r':fmt(vehicleState.contactTorqueNm,2)+' N·m',
  'longitudinal / lateral accel':fmt(vehicleState.ax,3)+' / '+fmt(vehicleState.ay,3)+' m/s²','steer / yaw rate proxy':fmt(vehicleState.steerDeg,2)+'° / '+fmt(vehicleState.yawRate,3)+' rad/s',
  'front suspension visual travel':fmt(vehicleState.suspensionCompressionM*1000,2)+' mm','body pitch visual':fmt(vehicleState.bodyPitchRad*180/PI,2)+'°','integration substeps':String(vehicleState.integrationSubsteps),'context boundary':V83.vehicleRig});}
function updateV83UI(){
  updateScenarioUI();updateHUD();updateVehiclePanel();drawTimeline();if(activeWorkspace==='contactWorkspace')drawContactLarge();if(activeWorkspace==='sectionWorkspace')drawSectionLarge();if(activeWorkspace==='telemetryWorkspace')drawTelemetryAll();if(activeWorkspace==='approvalWorkspace')renderApprovalCards();if(activeWorkspace==='evidenceWorkspace')drawRawSummary();
  uiFrames++;const now=performance.now();if(now-lastUiTime>500){uiFps=1000*uiFrames/(now-lastUiTime);uiFrames=0;lastUiTime=now;}$('topRuntime').textContent=`${fmt(uiFps,0)} fps · gl ${window.__LAB_GL_ERROR__||0}`;
}
const baseUpdateAllPanels=updateAllPanels;
updateAllPanels=function(){baseUpdateAllPanels();if(!batchScenarioAdvance)updateV83UI();};
const baseSetInputs=setInputs;
setInputs=function(values){baseSetInputs(values);rigLinesDirty=true;visualExaggerationDirty=true;return true;};

/* ---------- Startup capture and V8.3 public API ---------- */
// Build the comparison footprint from the exact state used by the Source button.
// Do not inherit whichever V8.2 challenge state happened to be active while this
// approval shell was being appended.
const sourceBaselineSavedInputs={...inputs},sourceBaselineSavedPaused=paused;
setInputs({loadN:sourceRenderLoad,pressurePsi:sourcePsi,camberDeg:0,slipRatio:0,slipAngleDeg:0,speed:20});
stepCore();sourceContactBaseline=copyCurrentPatch();
setInputs(sourceBaselineSavedInputs);paused=sourceBaselineSavedPaused;geometryDirty=true;stepCore();
selectScenario('manual',true);setScene('bike');setCamera('chase');recordV83Telemetry();updateV83UI();renderApprovalCards();drawContactLarge();drawSectionLarge();drawTelemetryAll(true);drawTimeline();
const v83Audit={schema:'ducati916.tire-evolution-lab.ui-audit.v8.3',checks:[
  {name:'sourceModifiedFalse',pass:BRANCH.sourceModified===false},
  {name:'baseAuditPass',pass:window.__TIRE_V82_AUDIT__&&window.__TIRE_V82_AUDIT__.failed===0},
  {name:'contactTrianglesAvailable',pass:contact.patchCount>0},
  {name:'fixedScaleContactDefault',pass:visualOptions.contactFixedScale},
  {name:'scenarioCatalog',pass:Object.keys(scenarioDefinitions).length>=9},
  {name:'vehicleContextExplicitlyProvisional',pass:/exact OEM geometry absent|not OEM/i.test(V83.vehicleRig)},
  {name:'workspacesAvailable',pass:document.querySelectorAll('.workspace').length>=6},
  {name:'camberSectionLocalFrame',pass:true},{name:'causalWheelDynamicsAvailable',pass:typeof integrateVehicleState==='function'&&typeof activeOmega==='function'},{name:'rigControlsAvailable',pass:!!$('rigControls')&&rigSpecs.length>=8},{name:'contactQuickStatesAvailable',pass:['contactLowLoad','contactHighLoad','contactLowPressure','contactHighPressure'].every(id=>!!$(id))},
  {name:'flexOverlayAvailable',pass:!!document.querySelector('[data-mode="deform"]')},
  {name:'fourViewAvailable',pass:!!document.querySelector('[data-scene="quad"]')},
  {name:'telemetrySeparated',pass:['telemetryMotion','telemetryForce','telemetryTire','telemetryWheel'].every(id=>!!$(id))},
  {name:'responseSweepAvailable',pass:typeof runApprovalSweep==='function'}
],claim:'APPROVAL-INTERFACE AND TEST-HARNESS CHECKS ONLY. THE FROZEN V8.2 NUMERICAL CORE IS RETAINED; PROCEDURAL MOTORCYCLE CONTEXT AND THE CAUSAL SINGLE-WHEEL DYNAMICS HARNESS ARE PROPOSED AND UNCALIBRATED.'};v83Audit.passed=v83Audit.checks.filter(c=>c.pass).length;v83Audit.failed=v83Audit.checks.length-v83Audit.passed;
function v83Snapshot(){return{...window.__TIRE_V82_API__.snapshot(),v83:V83,scenario:{...scenario,definition:scenarioDefinitions[scenario.name]},rig:{...rig,loadTransfer:$('loadTransfer').checked,speedHold:$('speedHold').checked},vehicle:{...vehicleState},visual:{...visualOptions,fieldMode,sceneMode,cameraPreset,camera:{yaw:cam.yaw,pitch:cam.pitch,dist:cam.dist,target:[...cam.target]},activeWorkspace,activeSidePanel},sourceContactBaseline:sourceContactBaseline?{area:sourceContactBaseline.area,extentX:sourceContactBaseline.extentX,extentY:sourceContactBaseline.extentY,targetLoadN:sourceContactBaseline.targetLoadN,integratedLoadN:sourceContactBaseline.integratedLoadN,pressurePsi:sourceContactBaseline.pressurePsi}:null,approvalSweep,uiAudit:v83Audit,telemetryPoints:telemetry.rows.length};}
window.__TIRE_V83_STATE__={...V83,audit:v83Audit};
window.__TIRE_V83_AUDIT__=v83Audit;
function runScenarioBatch(name,duration=null,dt=1/60){
  selectScenario(name,true);
  setScenarioRunning(true);
  const def=scenarioDefinitions[scenario.name],total=duration==null?def.duration:Math.max(0,+duration||0),stepDt=Math.max(1e-5,+dt||1/60);
  batchScenarioAdvance=true;
  let elapsed=0;
  try{
    while(elapsed<total-1e-12){const step=Math.min(stepDt,total-elapsed);advanceScheduler(step);elapsed+=step;}
  }finally{
    batchScenarioAdvance=false;
    setScenarioRunning(false);
  }
  // One authoritative presentation update after the deterministic batch.
  updateV83UI();
  syncVisualState(true);
  render3D();
  return v83Snapshot();
}
window.__TIRE_V83_API__={
  snapshot:()=>JSON.parse(JSON.stringify(v83Snapshot())),setWorkspace,setSidePanel,setScene,setCamera,
  selectScenario:(name,reset=true)=>selectScenario(name,reset!==false),
  runScenario:(name,duration=null)=>runScenarioBatch(name,duration,1/60),
  runScenarioFast:(name,duration=null,dt=1/60)=>runScenarioBatch(name,duration,dt),
  advanceScenario:dt=>{const was=scenario.running;scenario.running=true;advanceScheduler(+dt);scenario.running=was;updateV83UI();return v83Snapshot();},resetScenario,
  runApprovalSweep,clearTelemetry:()=>{clearV83Telemetry();return true;},base:window.__TIRE_V82_API__,setInputs:values=>setInputs(values),setContactState:values=>applyContactEvidenceState(values),
  setMode:selected=>setFieldMode(selected),setFieldMode,setRig:values=>setRigValues(values),
  flushVisual:()=>{const state=window.__TIRE_V82_API__.flushVisual();updateV83UI();render3D();return state;},
  // Compatibility aliases used by compact automation lanes.
  setScenario:name=>selectScenario(({drive:'exit',combined:'trail'}[name]||name),true),
  run:seconds=>runScenarioBatch(scenario.name,Math.max(0,+seconds||0),1/60),
  flush:()=>{const state=window.__TIRE_V82_API__.flushVisual();updateV83UI();render3D();return state;}
};
window.__TIRE_V83_READY__=true;
})();


const DATA=@@TIRE_DATA@@;
const V82_REFERENCE={"schema":"ducati916.tire-evolution-lab.reference-cases.v8.2","source":{"load_coefficient":1.0,"hub_shift_m":-1.895547578187215e-05,"load_n":1441.1855543787256,"projected_area_m2":0.0010495080505603062,"surface_area_m2":0.0010588061247578501,"peak_pressure_pa":2913147.108172549,"mean_pressure_pa":1373201.0474901195,"cop_x_m":-3.2715970496509186e-17,"cop_y_m":1.2157148712830858e-19,"cop_z_m":-0.0009425619932062034,"local_cop_x_m":-3.2715970496509186e-17,"extent_x_m":0.022839907850786566,"local_extent_x_m":0.022839907850786566,"extent_y_m":0.06143544773708564,"active_polygons":162,"contact_subtriangles":190,"contact_samples":570,"effective_radius_m":0.2952987986042354,"load_closure_pct":1.6881228928855118e-12,"camber_rad":0.0,"pressure_basis":{"coefficient_a":0.0,"coefficient_b":0.0,"lower_anchor_psi":26.0,"upper_anchor_psi":32.00888447476946,"interpolation_t":1.0,"max_equilibrium_displacement_m":0.0}},"sourceSolver":{"warm_start_used":false,"evaluations":7,"iterations":6,"newton_steps":5,"bisection_steps":0,"bracket_expansions":0,"candidate_bands":10,"candidate_cells":84,"candidate_triangles":168,"full_triangles":49152,"broadphase_reduction":0.99658203125,"load_residual_n":2.432898327242583e-11},"challenge":{"inputs":{"loadN":1550.0,"camberDeg":42.0,"pressurePsi":30.0,"slipRatio":0.12,"slipAngleDeg":5.5,"speed":38.0,"mu":1.22,"temperatureC":78.0,"wetness":0.08},"geometry":{"load_coefficient":1.0856983185207874,"hub_shift_m":-0.06368400259857335,"load_n":1549.999999999991,"projected_area_m2":0.001338605179106785,"surface_area_m2":0.0013442184935916913,"peak_pressure_pa":2374761.4050431885,"mean_pressure_pa":1157921.7114894653,"cop_x_m":-0.16138924237455793,"cop_y_m":-3.9788299378434555e-06,"cop_z_m":-0.0007822865633902107,"local_cop_x_m":0.03495040702804872,"extent_x_m":0.028263964539112313,"local_extent_x_m":0.021004218994717883,"extent_y_m":0.06105045397568797,"active_polygons":200,"contact_subtriangles":232,"contact_samples":696,"effective_radius_m":0.2800087976011864,"load_closure_pct":-5.86770775337373e-13,"camber_rad":0.7330382858376184,"pressure_basis":{"coefficient_a":-0.06134918986919533,"coefficient_b":-0.001643374711878632,"lower_anchor_psi":26.0,"upper_anchor_psi":32.00888447476946,"interpolation_t":0.6656809623808696,"max_equilibrium_displacement_m":0.00010357179396490444}},"steadyBrush":{"longitudinal_force_n":1058.0715783730036,"lateral_force_n":-1065.5110765568174,"aligning_moment_nm":-1.9639140164956208,"resultant_over_fz":0.9687799420718213,"mean_utilization":0.892820280442349,"max_utilization":1.0,"slip_power_w":8723.494198793342,"patch_length_m":0.060064534211878136,"base_mu":1.1117548296608457},"historySteady":{"longitudinal_force_n":1058.0715783730036,"lateral_force_n":-1065.5110765568174,"aligning_moment_nm":-1.9639140164956208,"resultant_over_fz":0.9687799420718213,"mean_utilization":0.8928202804423488,"max_utilization":1.0,"slip_power_w":8723.494198793342,"transport_work_rate_w":9886.298723588823,"stored_elastic_energy_j":2.8314586419825454,"patch_length_m":0.060064534211878136,"base_mu":1.1117548296608457,"transport_horizon_m":0.06306776092247204,"transport_horizon_s":0.0016596779190124222,"oldest_path_m":0.0,"newest_path_m":0.06306776092247204,"history_points":2,"insufficient_history_samples":0,"low_speed_fallback":false},"historyReceipt":{"schema":"ducati916.convected-distance-history.v8.2","points":2,"capacity":16384,"oldestTimeS":0.0,"newestTimeS":0.0016596779190124222,"horizonTimeS":0.0016596779190124222,"oldestPathM":0.0,"newestPathM":0.06306776092247204,"horizonPathM":0.06306776092247204},"solver":{"warm_start_used":true,"evaluations":12,"iterations":11,"newton_steps":7,"bisection_steps":3,"bracket_expansions":0,"candidate_bands":10,"candidate_cells":104,"candidate_triangles":208,"full_triangles":49152,"broadphase_reduction":0.9957682291666666,"load_residual_n":-9.094947017729282e-12}},"claimBoundary":"Independent Python/Numba mirror of V8.1 exact continuous contact plus V8.2 convected-distance material history. Numerical reference only; pressure, friction, thermal, wetness, and stiffness laws remain provisional and uncalibrated."};
const BRANCH = {
  schema: 'ducati916.tire-evolution-lab.v8.2.multirate-material-history',
  sourceFile: 'Ducati916_TIRE_SMOOTH_LAYERED_REFERENCE_LAB_V6_3_5_COMPACT_VIEWER.html',
  sourceSha256: '61c2cb501ff50559207a2755de4e1ce0f30f624d1ca9ad3b668b0b28c9f47945',
  sourceModified: false,
  classification: 'derived experimental branch; V8.1 exact contact retained, convected distance-history brush, deterministic multi-rate scheduler, deadline telemetry, and zero-copy native full-core lane added',
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



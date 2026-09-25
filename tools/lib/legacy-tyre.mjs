// Load the legacy FiniteThicknessTyreSolverV5 (src/legacy/01_tyre_solver_v5.js) into Node.
// Used by calibration and regression tooling; the browser build loads the same file verbatim.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const PSI = 6894.757293168;
// Studio STANDARD quality profile (src/legacy/08_tire_quality_v119.js + 03 v119TyreOptions)
export const STANDARD = { rings: 22, iterations: 9, bendScale: 1, brushScale: 1, contactAngularSamples: 110 };
export const VEHICLE = { muF: 25, muR: 22, frontTyreMass: 4.4, rearTyreMass: 5.8, frontPsi: 32, rearPsi: 34.8 };

let loaded = null;
export function loadLegacyTyre() {
  if (loaded) return loaded;
  const ctx = { Math, Object, Array, Set, Map, Number, Error, JSON, Infinity, NaN, isFinite, console, Float64Array, Float32Array, Uint32Array };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src/legacy/01_tyre_solver_v5.js"), "utf8"), ctx, { filename: "01_tyre_solver_v5.js" });
  const front = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/tires/front_asset.json"), "utf8"));
  const rear = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/tires/rear_asset.json"), "utf8"));
  loaded = { Solver: ctx.FiniteThicknessTyreSolverV5, assets: { front, rear } };
  return loaded;
}

export function makeLegacyTyre(which, { psi, dt = 1 / 540, profile = STANDARD } = {}) {
  const { Solver, assets } = loadLegacyTyre();
  const isF = which === "front";
  const tm = isF ? VEHICLE.frontTyreMass : VEHICLE.rearTyreMass;
  const um = isF ? VEHICLE.muF : VEHICLE.muR;
  return new Solver(isF ? assets.front : assets.rear, {
    Ntheta: profile.rings, dt, constraintIterations: profile.iterations, tyreMassKg: tm, rimHubMassKg: um - tm, axlePayloadKg: 0,
    pressurePa: (psi ?? (isF ? VEHICLE.frontPsi : VEHICLE.rearPsi)) * PSI, gravity: 9.81, materialLossScale: 1, mu: isF ? 1.18 : 1.27,
    kShear: 120, contactAngularSamples: profile.contactAngularSamples, runtimeProfileBendScale: profile.bendScale,
    resolutionBrushScale: profile.brushScale, resolutionNormalizationId: "v119-standard_22",
  });
}

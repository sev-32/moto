// Shared helpers for exercising the real-time tire in Node (loaded natively: the module
// registers globalThis.LucidRealtimeTire exactly as it registers window.LucidRealtimeTire).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
await import(path.join(ROOT, "src/core/10_rtt_tire.js"));
const api = globalThis.LucidRealtimeTire;
api.assets = {
  front: JSON.parse(fs.readFileSync(path.join(ROOT, "assets/tires/front_asset.json"), "utf8")),
  rear: JSON.parse(fs.readFileSync(path.join(ROOT, "assets/tires/rear_asset.json"), "utf8")),
};
export function loadRTT() {
  return api;
}

export function makeTire(which = "front", override = {}) {
  const geo = new api.TireGeometry(api.assets[which]);
  return new api.RealtimeTire(geo, { ...api.PRESETS[which], ...override });
}

// Drive a tire with constant kinematics until steady; returns the last output (copied).
export function steady(tire, { load = 1400, gamma = 0, V = 20, alphaDeg = 0, kappa = 0, yawRate = 0, T = 0.8, dt = 1 / 540, mu, pressurePa } = {}) {
  tire.reset();
  const h = tire.hubHeightForLoad(load, gamma, pressurePa);
  const Vy = -V * Math.tan((alphaDeg * Math.PI) / 180);
  let Re = tire.g.touchHeight(gamma);
  let o;
  const n = Math.max(2, Math.round(T / dt));
  for (let i = 0; i < n; i++) {
    const omega = (V * (1 + kappa)) / Re;
    o = tire.step({ dt, h, hDot: 0, gamma, Vx: V, Vy, yawRate, omega, pressurePa, mu });
    if (o.effectiveRadiusM > 0.1) Re = o.effectiveRadiusM;
  }
  return { ...o, h };
}

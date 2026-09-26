#!/usr/bin/env node
// Design check + SVG preview of the proving-ground layout.
import fs from "node:fs";
import { buildCenterline, selfClearance } from "./track-lib.mjs";
const spec = JSON.parse(fs.readFileSync(new URL("../../src/core/world/track.json", import.meta.url)));
const t = buildCenterline(spec.control, 1);
let minR = 1e9, at = 0;
for (let i = 0; i < t.N; i++) { const r = 1 / Math.max(1e-6, Math.abs(t.K[i])); if (r < minR) { minR = r; at = i; } }
const cl = selfClearance(t);
console.log(`length ${t.length.toFixed(0)} m, min radius ${minR.toFixed(1)} m at s=${at} (${t.X[at].toFixed(0)},${t.Y[at].toFixed(0)}), self clearance ${cl.min.toFixed(1)} m`);
const xs = [...t.X], ys = [...t.Y], pad = spec.pad, x0 = Math.min(...xs, pad.x0) - 60, x1 = Math.max(...xs, pad.x1) + 60, y0 = Math.min(...ys, pad.y0) - 60, y1 = Math.max(...ys, pad.y1) + 60;
const W = x1 - x0, H = y1 - y0, sc = 900 / Math.max(W, H), px = (x) => ((x - x0) * sc).toFixed(1), py = (y) => ((y1 - y) * sc).toFixed(1);
let path = "";
for (let i = 0; i < t.N; i += 2) path += (i ? "L" : "M") + px(t.X[i]) + "," + py(t.Y[i]);
path += "Z";
let kerbs = "";
for (let i = 0; i < t.N; i += 3) if (Math.abs(t.K[i]) > spec.kerbCurvature) kerbs += `<circle cx="${px(t.X[i] - t.TY[i] * Math.sign(t.K[i]) * spec.width * 0.5)}" cy="${py(t.Y[i] + t.TX[i] * Math.sign(t.K[i]) * spec.width * 0.5)}" r="1.6" fill="#e33"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * sc).toFixed(0)}" height="${(H * sc).toFixed(0)}" style="background:#355c2a">
<rect x="${px(pad.x0)}" y="${py(pad.y1)}" width="${((pad.x1 - pad.x0) * sc).toFixed(1)}" height="${((pad.y1 - pad.y0) * sc).toFixed(1)}" fill="#555"/>
<path d="${path}" fill="none" stroke="#777" stroke-width="${(spec.width * sc).toFixed(1)}" stroke-linejoin="round"/>
<path d="${path}" fill="none" stroke="#fff" stroke-width="0.6" stroke-dasharray="4 6"/>${kerbs}
<circle cx="${px(0)}" cy="${py(0)}" r="4" fill="#ff0"/><text x="${px(8)}" y="${py(-4)}" fill="#ff0" font-size="12">spawn (+y)</text>
<text x="10" y="18" fill="#fff" font-size="13">length ${t.length.toFixed(0)} m - min radius ${minR.toFixed(0)} m</text></svg>`;
const out = process.argv[2] || "tmp/track.svg";
fs.mkdirSync(new URL("../../tmp/", import.meta.url).pathname, { recursive: true });
fs.writeFileSync(out, svg);
console.log("wrote", out);

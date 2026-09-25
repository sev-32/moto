#!/usr/bin/env node
// Decompose a monolithic LUCID MOTO / Ducati 916 studio HTML into the source tree.
//
//   node tools/extract-legacy.mjs <studio.html>
//
// Output (all byte-exact, verified by `node tools/build.mjs --target legacy --verify`):
//   src/legacy/shell.html            HTML skeleton with @@SCRIPT_NN@@ placeholders
//   src/legacy/NN_<label>.js         every inline <script> body, verbatim
//   src/legacy/00_assets.template.js script 0 with the large literals replaced by tokens
//   assets/models/ducati916.glb      the embedded GLB (decoded from base64)
//   assets/tires/front_asset.json    window.__FRONT_ASSET__ JSON text, verbatim
//   assets/tires/rear_asset.json     window.__REAR_ASSET__ JSON text, verbatim
//   src/legacy/manifest.json         per-script sha256 + labels + source sha256
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = process.argv[2];
if (!src) {
  console.error("usage: node tools/extract-legacy.mjs <studio.html>");
  process.exit(2);
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const html = fs.readFileSync(src, "utf8");

// Human-readable labels for the V5.6.7 + V1.31.0 studio script order.
const LABELS = [
  "assets", "tyre_solver_v5", "vehicle_lab_v4", "vehicle_v5_6_7_main", "chain_parametric_v2",
  "sim_overlay", "dyno_pitch_repair", "tire_bottoming_repair", "tire_quality_v119",
  "powertrain_v121", "acoustic_studio_v122", "ui_shell_v123", "free_ride_v124",
  "orchestration_thermal_v125", "brake_tire_feedback_v126", "thermal_materials_v127",
  "thermofluid_v128", "recovery_v1281", "usability_v1282", "stability_rigs_v1283",
  "rider_skin_v12841", "rider_contacts_v12851", "rider_mass_coupling_v12852",
  "rider_live_control_v12853", "rider_graph_studio_v12854", "rider_viewport_studio_v12855a",
  "rider_bodymap_v12855b", "rider_positions_v12856", "rider_corner_balance_v12862",
  "rider_dynamics_bridge_v1287", "rider_constraint_solver_v1288", "rider_collision_registry_v1289",
  "rider_hand_grip_v1290", "rider_comfort_v1291", "rider_wrist_grip_v12962",
  "rider_peg_foot_v1295", "rider_operational_v1297", "rider_operations_studio_v1300",
  "rider_artist_studio_v1310",
];

const scripts = [];
let shell = "";
let last = 0;
const re = /<script([^>]*)>/g;
let m;
while ((m = re.exec(html))) {
  const bodyStart = m.index + m[0].length;
  const end = html.indexOf("</script>", bodyStart);
  if (end < 0) throw Error("unterminated <script>");
  const i = scripts.length;
  shell += html.slice(last, bodyStart) + `@@SCRIPT_${String(i).padStart(2, "0")}@@`;
  scripts.push({ attrs: m[1], body: html.slice(bodyStart, end) });
  last = end;
  re.lastIndex = end;
}
shell += html.slice(last);
if (scripts.length !== LABELS.length)
  console.warn(`warning: ${scripts.length} scripts found, ${LABELS.length} labels known; extra scripts get generic labels`);

const legacyDir = path.join(ROOT, "src/legacy");
fs.mkdirSync(legacyDir, { recursive: true });
fs.mkdirSync(path.join(ROOT, "assets/models"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "assets/tires"), { recursive: true });

// ---- script 0: split the large literals out into real asset files ----
const s0 = scripts[0].body;
const fa = s0.indexOf("window.__FRONT_ASSET__=");
const ra = s0.indexOf("window.__REAR_ASSET__=");
const ga = s0.indexOf("window.__DUCATI_GLB_B64__=");
if (fa !== 0 || ra < 0 || ga < 0) throw Error("script 0 layout not recognised");
const quote = s0[ga + "window.__DUCATI_GLB_B64__=".length]; // lab builds use ', the studio uses "
if (quote !== "'" && quote !== '"') throw Error("GLB literal quote not recognised");
const frontText = s0.slice(fa + "window.__FRONT_ASSET__=".length, s0.lastIndexOf(";", ra));
const sepFR = s0.slice(fa + "window.__FRONT_ASSET__=".length + frontText.length, ra);
const rearText = s0.slice(ra + "window.__REAR_ASSET__=".length, s0.lastIndexOf(";", ga));
const sepRG = s0.slice(ra + "window.__REAR_ASSET__=".length + rearText.length, ga);
const b64Start = ga + "window.__DUCATI_GLB_B64__=".length + 1;
const b64End = s0.indexOf(quote, b64Start);
const b64 = s0.slice(b64Start, b64End);
const tail = s0.slice(b64End + 1);
JSON.parse(frontText);
JSON.parse(rearText); // sanity: both must be valid JSON
const glb = Buffer.from(b64, "base64");
if (glb.toString("base64") !== b64) throw Error("GLB base64 does not round-trip canonically");
fs.writeFileSync(path.join(ROOT, "assets/tires/front_asset.json"), frontText);
fs.writeFileSync(path.join(ROOT, "assets/tires/rear_asset.json"), rearText);
fs.writeFileSync(path.join(ROOT, "assets/models/ducati916.glb"), glb);
const template =
  "window.__FRONT_ASSET__=@@FRONT_ASSET@@" + sepFR + "window.__REAR_ASSET__=@@REAR_ASSET@@" + sepRG +
  "window.__DUCATI_GLB_B64__=" + quote + "@@GLB_B64@@" + quote + tail;
fs.writeFileSync(path.join(legacyDir, "00_assets.template.js"), template);

// ---- scripts 1..N verbatim ----
const manifest = {
  schema: "lucid-moto.legacy-manifest.v1",
  source: path.basename(src),
  sourceSha256: sha(Buffer.from(html, "utf8")),
  sourceBytes: Buffer.byteLength(html, "utf8"),
  shell: "shell.html",
  assets: {
    glb: { file: "assets/models/ducati916.glb", sha256: sha(glb), bytes: glb.length },
    frontTire: { file: "assets/tires/front_asset.json", sha256: sha(frontText) },
    rearTire: { file: "assets/tires/rear_asset.json", sha256: sha(rearText) },
  },
  scripts: [],
};
scripts.forEach((s, i) => {
  const label = LABELS[i] || `script_${i}`;
  const file = i === 0 ? "00_assets.template.js" : `${String(i).padStart(2, "0")}_${label}.js`;
  if (i > 0) fs.writeFileSync(path.join(legacyDir, file), s.body);
  manifest.scripts.push({ index: i, label, file, attrs: s.attrs, sha256: sha(s.body), bytes: Buffer.byteLength(s.body) });
});
fs.writeFileSync(path.join(legacyDir, "shell.html"), shell);
fs.writeFileSync(path.join(legacyDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`extracted ${scripts.length} scripts, GLB ${glb.length} bytes, source sha256 ${manifest.sourceSha256}`);

#!/usr/bin/env node
// Regenerate archived historical builds byte-exactly.
//
//   node tools/build-reference.mjs --list
//   node tools/build-reference.mjs <id|file> [--verify]
//   node tools/build-reference.mjs --all --verify
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "reference/index.json"), "utf8"));
let cache = {};
const asset = (k) =>
  (cache[k] ??= {
    "@@GLB_B64@@": () => fs.readFileSync(path.join(ROOT, "assets/models/ducati916.glb")).toString("base64"),
    "@@FRONT_ASSET@@": () => fs.readFileSync(path.join(ROOT, "assets/tires/front_asset.json"), "utf8"),
    "@@REAR_ASSET@@": () => fs.readFileSync(path.join(ROOT, "assets/tires/rear_asset.json"), "utf8"),
    "@@TIRE_DATA@@": () =>
      zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "reference/data/tire_layered_reference_v633.json.gz"))).toString("utf8"),
  }[k]());

function build(entry) {
  const dir = path.join(ROOT, "reference/builds", entry.id);
  const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  let html = fs.readFileSync(path.join(dir, "shell.html"), "utf8");
  for (const s of man.scripts) {
    const raw = fs.readFileSync(path.join(dir, s.file));
    let body = (s.gzip ? zlib.gunzipSync(raw) : raw).toString("utf8");
    if (sha(body) !== s.sha256) throw Error(`${entry.id}/${s.file} modified`);
    for (const t of ["@@GLB_B64@@", "@@FRONT_ASSET@@", "@@REAR_ASSET@@", "@@TIRE_DATA@@"])
      if (body.includes(t)) body = body.replace(t, () => asset(t));
    for (const v of man.vfs || []) {
      if (!body.includes(v.token)) continue;
      const bytes = zlib.gunzipSync(fs.readFileSync(path.join(dir, v.file)));
      if (sha(bytes) !== v.sha256) throw Error(`${entry.id}/${v.file} modified`);
      body = body.replace(v.token, () => bytes.toString("base64"));
    }
    html = html.replace(`@@SCRIPT_${String(s.index).padStart(2, "0")}@@`, () => body);
  }
  const out = path.join(ROOT, "dist/reference", entry.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  const ok = sha(Buffer.from(html, "utf8")) === entry.sha256;
  console.log(`${ok ? "OK  " : "FAIL"} ${entry.id} -> ${path.relative(ROOT, out)}`);
  return ok;
}

if (args.includes("--list")) {
  for (const b of index.builds) console.log(`${b.id}${b.aliases.length ? "  (aliases: " + b.aliases.join(", ") + ")" : ""}`);
  process.exit(0);
}
const pick = args.includes("--all")
  ? index.builds
  : index.builds.filter((b) => args.some((a) => a === b.id || a === b.file || b.aliases.includes(a)));
if (!pick.length) {
  console.error("no matching build; use --list");
  process.exit(2);
}
let fail = 0;
for (const b of pick) if (!build(b)) fail++;
if (args.includes("--verify") && fail) process.exit(1);

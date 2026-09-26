#!/usr/bin/env node
// Assemble the single-file LUCID MOTO build.
//
//   node tools/build.mjs                      -> dist/LucidMoto_<version>.html (legacy runtime + core layers)
//   node tools/build.mjs --target legacy      -> dist/legacy/<original name> (byte-exact original studio)
//   node tools/build.mjs --target legacy --verify   also checks the sha256 against src/legacy/manifest.json
//   node tools/build.mjs --out <file>         override the output path
//
// The legacy runtime is the decomposed V5.6.7 + V1.31.0 studio (src/legacy). Core layers
// (src/core, ordered by src/core/layers.json) are appended after the last legacy script so
// every legacy API they extend already exists when they install.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(name);
const target = opt("--target", "next");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// afterScript: { [legacyScriptIndex]: html } is inserted right after that legacy script's
// closing tag (used for boot-order guards that must run before later legacy scripts boot).
export function assembleLegacy(afterScript = {}) {
  const manifest = JSON.parse(read("src/legacy/manifest.json"));
  let html = read("src/legacy/shell.html");
  for (const [idx, snippet] of Object.entries(afterScript)) {
    const token = `@@SCRIPT_${String(idx).padStart(2, "0")}@@`, at = html.indexOf(token);
    if (at < 0) throw Error(`no legacy script ${idx} to inject after`);
    const close = html.indexOf("</script>", at);
    if (close < 0) throw Error(`legacy script ${idx} has no closing tag`);
    const end = close + "</script>".length;
    html = html.slice(0, end) + "\n" + snippet + html.slice(end);
  }
  for (const s of manifest.scripts) {
    let body;
    if (s.index === 0) {
      body = read("src/legacy/" + s.file)
        .replace("@@FRONT_ASSET@@", () => read(manifest.assets.frontTire.file))
        .replace("@@REAR_ASSET@@", () => read(manifest.assets.rearTire.file))
        .replace("@@GLB_B64@@", () => fs.readFileSync(path.join(ROOT, manifest.assets.glb.file)).toString("base64"));
    } else body = read("src/legacy/" + s.file);
    if (sha(body) !== s.sha256) throw Error(`legacy script ${s.index} (${s.file}) sha256 mismatch - source tree modified?`);
    html = html.replace(`@@SCRIPT_${String(s.index).padStart(2, "0")}@@`, () => body);
  }
  return { html, manifest };
}

function coreLayers() {
  const spec = JSON.parse(read("src/core/layers.json"));
  return spec.layers.map((l) => {
    let code = read("src/core/" + l.file);
    // "inline": { "TOKEN": "relative/path.json" } substitutes data files into the layer source
    for (const [token, file] of Object.entries(l.inline || {})) {
      if (!code.includes(token)) throw Error(`layer ${l.id}: inline token ${token} not found`);
      code = code.split(token).join(read("src/core/" + file).trim());
    }
    // "inlineString": { "TOKEN": "path" } substitutes a file as a JS string literal (worker sources)
    for (const [token, file] of Object.entries(l.inlineString || {})) {
      if (!code.includes(token)) throw Error(`layer ${l.id}: inline token ${token} not found`);
      code = code.split(token).join(JSON.stringify(read("src/core/" + file)).replace(/<\/script/gi, "<\\/script"));
    }
    return { ...l, code };
  });
}

const layerTag = (l) => `<script data-lucid-layer="${l.id}">\n${l.code.replace(/<\/script/gi, "<\\/script")}\n</script>`;

function main() {
  const layers = target === "legacy" ? [] : coreLayers();
  const early = {};
  for (const l of layers.filter((l) => Number.isInteger(l.afterLegacyScript))) early[l.afterLegacyScript] = (early[l.afterLegacyScript] ? early[l.afterLegacyScript] + "\n" : "") + layerTag(l);
  const { html: legacy, manifest } = assembleLegacy(early);
  if (target === "legacy") {
    const out = opt("--out", path.join(ROOT, "dist/legacy", manifest.source.replace(/^[0-9a-f]{8}-/, "")));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, legacy);
    const got = sha(Buffer.from(legacy, "utf8"));
    console.log(`legacy build -> ${path.relative(ROOT, out)} (${Buffer.byteLength(legacy)} bytes, sha256 ${got})`);
    if (flag("--verify")) {
      if (got !== manifest.sourceSha256) {
        console.error(`VERIFY FAILED: expected ${manifest.sourceSha256}`);
        process.exit(1);
      }
      console.log("VERIFY OK: byte-identical to the uploaded studio build");
    }
    return;
  }
  const spec = JSON.parse(read("src/core/layers.json"));
  const inject = layers
    .filter((l) => !Number.isInteger(l.afterLegacyScript))
    .map(layerTag)
    .join("\n");
  const at = legacy.lastIndexOf("</body>");
  if (at < 0) throw Error("legacy shell has no </body>");
  const html = legacy.slice(0, at) + `\n<!-- ===== LUCID MOTO ${spec.version} CORE LAYERS ===== -->\n` + inject + "\n" + legacy.slice(at);
  const out = opt("--out", path.join(ROOT, "dist", `LucidMoto_${spec.version.replace(/[^0-9A-Za-z.]+/g, "_")}.html`));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`build ${spec.version} -> ${path.relative(ROOT, out)} (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MiB, ${layers.length} core layers)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();

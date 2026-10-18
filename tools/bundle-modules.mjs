// A minimal ES-module bundler for vendored sources that must run inside the single-file build
// (a classic <script>, or a Worker made from a string): every module of the import graph, in
// dependency order, becomes a function scope that receives its imports and returns its exports.
// The module sources themselves are not edited: the only rewrites are the import statements
// (to a lookup of the dependency's exports) and the `export` keyword in front of a declaration.
// Supports exactly the forms used by the vendored code - `import {a, b as c} from './x.js'` and
// `export class|function|async function|const|let X` - and refuses anything else.
import fs from "node:fs";
import path from "node:path";

const IMPORT = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm;
const EXPORT_DECL = /^(\s*)export\s+((?:async\s+)?function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const OTHER = /^\s*(import\b(?!\s*\{[^}]*\}\s*from)|export\s+(default|\{|\*))/m;

export function bundleModules(root, entries) {
  const order = [], seen = new Map();
  function visit(rel, chain = []) {
    if (seen.has(rel)) { if (seen.get(rel) === "visiting") throw Error(`import cycle: ${[...chain, rel].join(" -> ")}`); return; }
    seen.set(rel, "visiting");
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    if (OTHER.test(src)) throw Error(`${rel}: unsupported import/export form`);
    const deps = [];
    for (const m of src.matchAll(IMPORT)) {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[2]));
      deps.push({ names: m[1], dep });
      visit(dep, [...chain, rel]);
    }
    seen.set(rel, "done");
    order.push({ rel, src, deps });
  }
  for (const e of entries) visit(e);
  const parts = ["const __M = Object.create(null);"];
  for (const { rel, src } of order) {
    const exported = [];
    let body = src.replace(IMPORT, (_, names, spec) => {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      const binds = names.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const [a, b] = s.split(/\s+as\s+/); return b ? `${a.trim()}: ${b.trim()}` : a.trim(); });
      return `const {${binds.join(", ")}} = __M[${JSON.stringify(dep)}];`;
    });
    body = body.replace(EXPORT_DECL, (_, ws, kind, name) => { exported.push(name); return `${ws}${kind} ${name}`; });
    parts.push(`__M[${JSON.stringify(rel)}] = (function () {\n"use strict";\n${body}\nreturn { ${exported.join(", ")} };\n})();`);
  }
  parts.push("return __M;");
  return { code: `(function () {\n${parts.join("\n")}\n})()`, modules: order.map((o) => o.rel) };
}

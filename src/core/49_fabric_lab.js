// LUCID MOTO core · FABRIC LAB: heatmaps painted on her jeans
// ------------------------------------------------------------------------------------------
// The clothing engine reads a garment's fabric as fields over it (its per-vertex, per-edge and
// per-bend arrays: the lab's "fabric field V2"). This lab paints them, as the lab's own authoring
// schema has it (lucid.fabric.authoring.v1: paint on the garment's panels, bake to arrays), on the
// jeans' flats - their front and back, square on, as a designer draws a pair of jeans:
//   * heatmaps, per point of the jeans: tension (cut tighter or looser), stretch stiffness,
//     thickness, bend stiffness, skin friction, damping, the drawn wrinkles' amplitude - blue below
//     the default, red above;
//   * creases, strokes drawn on the flats with a width and a depth: denim's set creases (whiskers,
//     honeycombs, stacking). In the cloth they pre-fold the hinges along them; drawn, the shader
//     fades and raises them.
// APPLY bakes the map (src/core/clothing/fabricmap.js) into the jeans and rebuilds the engine on
// them; the map is saved and loaded as JSON (lucid-moto.fabric-map.v1). The character's files are
// not touched. LUCID_CORE.fabricLab: open(), close(), map(), load(json), apply(), exportMap().
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE) return;
  const D = global.document;
  const LAB = (CORE.fabricLab = { isOpen: false, edits: 0 });
  const WDR = () => CORE.wardrobe;
  let kit = null, geo = null, sides = null, map = null, defaults = null;

  // ---- the jeans and their map
  function ready() {
    if (kit) return true;
    const k = WDR()?.fabricKit?.();
    if (!k) return false;
    kit = k; geo = k.F.garmentGeometry(k.asset); sides = k.F.vertexSides(geo);
    defaults = k.defaultMap ? k.F.decodeMap(k.defaultMap, k.asset) : k.F.blankMap(k.asset, "jeans");
    map = clone(WDR().fabricMap || defaults);
    return true;
  }
  function clone(m) { return { ...m, channels: Object.fromEntries(Object.entries(m.channels).map(([c, a]) => [c, Float32Array.from(a)])), creases: m.creases.map((c) => ({ ...c, xy: c.xy.map((p) => p.slice()) })) }; }

  // ---- the flats on a canvas: x, y of the jeans' rest frame; the front as seen from the front (her
  // left on the right), the back from behind
  const VIEW = { W: 200, pad: 8 };
  function viewOf(side) {
    const [x0, x1, y0, y1] = kit.F.flatBounds(geo), sc = (VIEW.W - 2 * VIEW.pad) / (x1 - x0), H = Math.ceil((y1 - y0) * sc) + 2 * VIEW.pad;
    return { sc, H, toPx: (x, y) => [side > 0 ? VIEW.pad + (x - x0) * sc : VIEW.pad + (x1 - x) * sc, VIEW.pad + (y1 - y) * sc], toXY: (px, py) => [side > 0 ? x0 + (px - VIEW.pad) / sc : x1 - (px - VIEW.pad) / sc, y1 - (py - VIEW.pad) / sc] };
  }
  function heat(t) { const c = Math.max(-1, Math.min(1, t)), lo = [38, 89, 242], mid = [140, 140, 140], hi = [242, 64, 38], e = c < 0 ? lo : hi, a = Math.abs(c); return mid.map((m, k) => Math.round(m + (e[k] - m) * a)); }
  function paintView(cv, side) {
    const g = cv.getContext("2d"), V = viewOf(side), { P, tris } = geo, ch = ui.channel.value, spec = kit.F.CHANNELS[ch], C = ch === "creases" ? null : map.channels[ch];
    cv.height = V.H; g.fillStyle = "#0a141b"; g.fillRect(0, 0, cv.width, cv.height);
    // (nearest the viewer last)
    const order = []; for (let f = 0; f < tris.length; f += 3) order.push([f, (P[3 * tris[f] + 2] + P[3 * tris[f + 1] + 2] + P[3 * tris[f + 2] + 2]) * side]);
    order.sort((a, b) => a[1] - b[1]);
    for (const [f] of order) {
      const vs = [tris[f], tris[f + 1], tris[f + 2]], q = vs.map((v) => V.toPx(P[3 * v], P[3 * v + 1]));
      const a = 3 * vs[0], b = 3 * vs[1], c = 3 * vs[2], nz = ((P[b] - P[a]) * (P[c + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[c] - P[a])) * side;
      const nl = Math.hypot((P[b + 1] - P[a + 1]) * (P[c + 2] - P[a + 2]) - (P[b + 2] - P[a + 2]) * (P[c + 1] - P[a + 1]), (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]), nz) || 1, lit = 0.55 + 0.45 * Math.abs(nz / nl);
      let col = [120, 128, 140];
      if (C) { const m = (C[vs[0]] + C[vs[1]] + C[vs[2]]) / 3, t = m >= spec.def ? (m - spec.def) / (spec.max - spec.def || 1) : -(spec.def - m) / (spec.def - spec.min || 1); col = heat(t); }
      g.fillStyle = `rgb(${col.map((x) => Math.round(x * lit)).join(",")})`;
      g.beginPath(); g.moveTo(...q[0]); g.lineTo(...q[1]); g.lineTo(...q[2]); g.closePath(); g.fill();
    }
    // the creases on this flat (the one being drawn brighter)
    for (const cr of map.creases) {
      if (cr.side !== side) continue;
      g.strokeStyle = cr === stroke ? "#fff7b0" : `rgba(250,225,90,${C ? 0.45 : 0.95})`; g.lineWidth = 1 + 3 * cr.depth; g.lineCap = "round";
      g.beginPath(); cr.xy.forEach(([x, y], i) => { const [px, py] = V.toPx(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
    }
    if (hover && hover.side === side) { g.strokeStyle = "#7ce7ff"; g.lineWidth = 1; g.beginPath(); g.arc(hover.px, hover.py, ui.radius.value / 100 * V.sc, 0, 2 * Math.PI); g.stroke(); }
  }
  function repaint() { if (!ui.root || !LAB.isOpen) return; paintView(ui.front, 1); paintView(ui.back, -1); }

  // ---- brushes
  let stroke = null, hover = null, dragging = false;
  function brush(side, x, y, dt) {
    const ch = ui.channel.value, r = ui.radius.value / 100, k = ui.strength.value * dt * 4, mode = ui.mode.value, P = geo.P, spec = kit.F.CHANNELS[ch], C = map.channels[ch];
    const hits = [];
    for (let v = 0; v < geo.n; v++) { if (sides[v] !== side) continue; const d = Math.hypot(P[3 * v] - x, P[3 * v + 1] - y); if (d < r) hits.push([v, 1 - (d / r) ** 2]); }
    if (!hits.length) return;
    if (mode === "smooth") { const m = hits.reduce((s, [v, w]) => s + C[v] * w, 0) / hits.reduce((s, [, w]) => s + w, 0); for (const [v, w] of hits) C[v] += (m - C[v]) * Math.min(1, k * w); }
    else for (const [v, w] of hits) {
      const want = mode === "raise" ? spec.max : mode === "lower" ? spec.min : mode === "reset" ? spec.def : +ui.value.value;
      C[v] += (want - C[v]) * Math.min(1, k * w * (mode === "set" || mode === "reset" ? 2 : 0.25));
    }
    LAB.edits++;
  }
  function onPointer(cv, side, ev) {
    if (!ready()) return;
    const rc = cv.getBoundingClientRect(), px = (ev.clientX - rc.left) * (cv.width / rc.width), py = (ev.clientY - rc.top) * (cv.height / rc.height), V = viewOf(side), [x, y] = V.toXY(px, py);
    hover = { side, px, py };
    const creasing = ui.channel.value === "creases";
    if (ev.type === "pointerdown") {
      dragging = true; cv.setPointerCapture?.(ev.pointerId);
      if (creasing && ui.mode.value === "erase") { eraseNear(side, x, y); }
      else if (creasing) { stroke = { name: `crease ${map.creases.length + 1}`, side, xy: [[x, y]], widthM: ui.width.value / 1000, depth: +ui.depth.value }; map.creases.push(stroke); }
      else brush(side, x, y, 1 / 30);
    } else if (ev.type === "pointermove" && dragging) {
      if (creasing && ui.mode.value === "erase") eraseNear(side, x, y);
      else if (creasing && stroke) { const l = stroke.xy[stroke.xy.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 0.012) stroke.xy.push([x, y]); }
      else if (!creasing) brush(side, x, y, 1 / 60);
    } else if (ev.type === "pointerup" || ev.type === "pointercancel") {
      dragging = false;
      if (stroke && stroke.xy.length < 2) map.creases.splice(map.creases.indexOf(stroke), 1);
      if (stroke) { LAB.edits++; flash(`${map.creases.length} creases`); }
      stroke = null;
    }
    repaint();
  }
  function eraseNear(side, x, y) {
    const r = ui.radius.value / 100, before = map.creases.length;
    map.creases = map.creases.filter((c) => c.side !== side || !c.xy.some((p, i) => { const q = c.xy[i + 1] || p, dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2)); return Math.hypot(x - p[0] - dx * t, y - p[1] - dy * t) < r; }));
    if (map.creases.length !== before) LAB.edits++;
  }

  // ---- applying, files
  function apply() {
    if (!ready()) return false;
    WDR().wearFabric(clone(map));
    pendingSettle = 2;
    flash("applied: the jeans rebuilt on the map, settling");
    return true;
  }
  let pendingSettle = 0;
  function exportMap() { return ready() ? kit.F.encodeMap(map, { name: ui.nameIn?.value || "lucid-jeans-fabric", notes: "painted in the LUCID MOTO fabric lab" }) : null; }
  function load(json) { if (!ready()) return false; map = kit.F.decodeMap(json, kit.asset); LAB.edits++; repaint(); return true; }
  function download(name, text) {
    const a = D.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name;
    D.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---- the panel
  const ui = {};
  function el(tag, attrs = {}, kids = []) {
    const e = D.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === "style") e.style.cssText = v; else if (k.startsWith("on")) e[k] = v; else e.setAttribute(k, v); }
    for (const k of [].concat(kids)) if (k != null) e.appendChild(typeof k === "string" ? D.createTextNode(k) : k);
    return e;
  }
  function slider(label, min, max, step, value, unit) {
    const inp = el("input", { type: "range", min, max, step, value }), num = el("span", { class: "live" }, [String(value)]);
    inp.addEventListener("input", () => { num.textContent = (+inp.value).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0) + (unit ? " " + unit : ""); });
    num.textContent = (+value).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0) + (unit ? " " + unit : "");
    return { row: el("div", { class: "flRow" }, [el("span", {}, [label]), inp, num]), inp };
  }
  function buildPanel() {
    if (ui.root || !D?.body) return;
    D.head.appendChild(el("style", {}, [`
#lucidFabricLab{position:fixed;left:10px;top:64px;bottom:64px;width:452px;z-index:400;display:none;flex-direction:column;background:#071018f0;border:1px solid #3a5a68;border-radius:8px;color:#d8ecf4;font:11px/1.35 ui-monospace,Consolas,monospace}
#lucidFabricLab header{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid #284450}
#lucidFabricLab header b{color:#7ce7ff;letter-spacing:.08em;flex:1}
#lucidFabricLab button{font:inherit;color:#d8ecf4;background:#12303c;border:1px solid #3a5a68;border-radius:4px;padding:3px 7px;cursor:pointer}
#lucidFabricLab .body{overflow:auto;padding:6px 9px 10px;flex:1}
#lucidFabricLab .flats{display:flex;gap:6px;justify-content:center}
#lucidFabricLab .flats div{text-align:center;color:#86a9b6}
#lucidFabricLab canvas{width:200px;border:1px solid #284450;border-radius:4px;cursor:crosshair;touch-action:none}
#lucidFabricLab .flRow{display:grid;grid-template-columns:150px 1fr 70px;gap:4px;align-items:center;margin:2px 0}
#lucidFabricLab select{font:inherit;background:#0b1d26;color:#d8ecf4;border:1px solid #284450;width:100%;min-width:0}
#lucidFabricLab .acts{display:flex;flex-wrap:wrap;gap:5px;padding:7px 9px;border-top:1px solid #284450}
#lucidFabricLab .note{color:#86a9b6;padding:3px 0}
#lucidFabricLab .live{color:#6f8f9b}
#lucidFabricChip{position:absolute;right:205px;bottom:12px;z-index:130;font:10px ui-monospace,monospace;color:#bff3ff;background:rgba(5,20,28,.8);border:1px solid #3a6a7a;border-radius:5px;padding:4px 8px;cursor:pointer}`]));
    const root = (ui.root = el("div", { id: "lucidFabricLab" }));
    root.appendChild(el("header", {}, [el("b", {}, ["FABRIC LAB · her jeans"]), el("button", { onclick: () => toggle(false) }, ["×"])]));
    const body = el("div", { class: "body" });
    // what is painted, and how
    ui.channel = el("select");
    ui.channel.appendChild(el("option", { value: "creases" }, ["creases (strokes)"]));
    for (const [k, c] of Object.entries(kit.F.CHANNELS)) ui.channel.appendChild(el("option", { value: k }, [c.label]));
    ui.mode = el("select");
    for (const [v, t] of [["raise", "raise"], ["lower", "lower"], ["set", "set to the value"], ["smooth", "smooth"], ["reset", "back to default"], ["erase", "erase creases"]]) ui.mode.appendChild(el("option", { value: v }, [t]));
    const sync = () => { const cr = ui.channel.value === "creases"; ui.valRow.style.display = !cr ? "grid" : "none"; ui.crRows.forEach((r) => (r.style.display = cr ? "grid" : "none")); const s = kit.F.CHANNELS[ui.channel.value]; if (s) { ui.value.min = s.min; ui.value.max = s.max; ui.value.step = 0.01; } repaint(); };
    ui.channel.onchange = sync;
    body.appendChild(el("div", { class: "flRow", style: "grid-template-columns:150px 1fr" }, [el("span", {}, ["paint"]), ui.channel]));
    body.appendChild(el("div", { class: "flRow", style: "grid-template-columns:150px 1fr" }, [el("span", {}, ["brush"]), ui.mode]));
    const rad = slider("brush radius", 1, 15, 0.5, 4, "cm"), str = slider("strength", 0.05, 1, 0.05, 0.4), val = slider("value", 0.5, 1.5, 0.01, 1), wid = slider("crease width", 2, 15, 0.5, 5, "mm"), dep = slider("crease depth", 0.1, 1, 0.05, 0.7);
    ui.radius = rad.inp; ui.strength = str.inp; ui.value = val.inp; ui.width = wid.inp; ui.depth = dep.inp; ui.valRow = val.row; ui.crRows = [wid.row, dep.row];
    for (const r of [rad.row, str.row, val.row, wid.row, dep.row]) body.appendChild(r);
    // the flats
    ui.front = el("canvas", { width: VIEW.W, height: 420 }); ui.back = el("canvas", { width: VIEW.W, height: 420 });
    for (const [cv, side] of [[ui.front, 1], [ui.back, -1]]) for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) cv.addEventListener(t, (ev) => { ev.preventDefault(); onPointer(cv, side, ev); });
    for (const cv of [ui.front, ui.back]) cv.addEventListener("pointerleave", () => { hover = null; repaint(); });
    body.appendChild(el("div", { class: "flats" }, [el("div", {}, [ui.front, el("div", {}, ["front"])]), el("div", {}, [ui.back, el("div", {}, ["back (seen from behind)"])])]));
    body.appendChild(el("div", { class: "note" }, ["Heatmaps: blue below a channel's default, red above. Tension < 1 cuts the fabric tighter there; creases are drawn as strokes - in the cloth they pre-fold its hinges along them, drawn they fade and rise. APPLY rebuilds her jeans on the map (the clothing engine's fabric fields) and lets them settle."]));
    root.appendChild(body);
    const fileIn = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    fileIn.onchange = async () => { const f = fileIn.files?.[0]; if (!f) return; try { load(await f.text()); flash(`loaded ${f.name}`); } catch (e) { flash("not a fabric map: " + (e?.message || e)); } fileIn.value = ""; };
    ui.nameIn = el("input", { type: "text", placeholder: "map name", style: "flex:1;min-width:110px;font:inherit;background:#0b1d26;color:#d8ecf4;border:1px solid #284450" });
    ui.msg = el("div", { class: "note", style: "padding:0 9px 6px" });
    root.appendChild(el("div", { class: "acts" }, [
      el("button", { title: "bake the map into her jeans and rebuild them on it", onclick: apply }, ["APPLY"]),
      ui.nameIn,
      el("button", { title: "download this map (JSON)", onclick: () => download((ui.nameIn.value || "lucid-jeans-fabric").replace(/[^A-Za-z0-9_.-]+/g, "_") + ".json", JSON.stringify(exportMap())) }, ["EXPORT"]),
      el("button", { title: "load a map (JSON)", onclick: () => fileIn.click() }, ["IMPORT"]),
      el("button", { title: "this channel back to its default everywhere (creases: all strokes removed)", onclick: () => { const ch = ui.channel.value; if (ch === "creases") map.creases = []; else map.channels[ch].fill(kit.F.CHANNELS[ch].def); LAB.edits++; repaint(); } }, ["CLEAR"]),
      el("button", { title: "the build's own map (worn denim's creases)", onclick: () => { map = clone(defaults); LAB.edits++; repaint(); flash("the build's map"); } }, ["DEFAULT"]),
      fileIn,
    ]));
    root.appendChild(ui.msg);
    D.body.appendChild(root);
    ui.chip = el("button", { id: "lucidFabricChip", title: "fabric lab: paint tension, stretch, thickness and creases into her jeans", onclick: () => toggle() }, ["FABRIC LAB"]);
    (D.getElementById("gl")?.parentElement || D.body).appendChild(ui.chip);
    sync();
  }
  function flash(t) { if (ui.msg) ui.msg.textContent = t; }
  function toggle(on = !LAB.isOpen) {
    if (!ready()) return false;
    buildPanel();
    LAB.isOpen = !!on;
    ui.root.style.display = LAB.isOpen ? "flex" : "none";
    repaint();
    return LAB.isOpen;
  }
  // (the chip shows on the ride page while she is dressed; after APPLY, the rebuilt cloth settles)
  let acc = 0;
  (CORE.renderHooks = CORE.renderHooks || []).push({
    id: "fabricLab",
    draw: () => {
      if (pendingSettle && WDR()?.engine?.()) { if (--pendingSettle === 0) { WDR().settle(24, { still: true }); flash(`applied: ${JSON.stringify(WDR().stats.fabric || {})}`); } }
      if (++acc % 15) return;
      if (!ui.chip && WDR()?.enabled && D?.body && ready()) buildPanel();
      if (ui.chip) ui.chip.style.display = String(global.__LUCID_ACTIVE_PAGE__ || "RIDE").toUpperCase() === "RIDE" && WDR()?.enabled && WDR()?.mode !== "bound" ? "block" : "none";
    },
  });
  Object.assign(LAB, { open: () => toggle(true), close: () => toggle(false), map: () => map, load, apply, exportMap });
})(typeof window !== "undefined" ? window : globalThis);

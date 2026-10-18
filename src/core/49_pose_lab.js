// LUCID MOTO core · POSE LAB: the animator's hands on the riding rider
// ------------------------------------------------------------------------------------------
// The physical rider (46_rider_biomech.js) decides her riding pose in two layers, and this lab
// edits both, live or frozen, and saves / loads them as a pose set (JSON, `lucid.rider.pose-set.v1`):
//   * posture shapes - where her pelvis sits on the seat, how far her trunk leans, her head's
//     pitch, her knees on the tank, and how each posture (tucked, sat up braking, hung off,
//     standing) changes them: the planner's declared priors (R.plan.*), per posture;
//   * joint style - the IK's preferred angle and weight for every joint (R.pref): what decides her
//     pose wherever her contacts (hands on the grips, feet on the pegs, pelvis on the seat, knees
//     on the tank) leave it free. A low weight is a preference, a high one pins the joint where
//     the contacts allow.
// Her contacts and her physics stay hers: a pose set is the intent her muscles then carry (riding
// on muscles: what they cannot make is not made). Frozen, the ride pauses and the lab shows the
// IK's pose for the targets as they are - edits re-solve at once; live, she rides with them.
// Export / import: a pose set (JSON), the current pose as BVH (Semantic51 skeleton: for a DCC),
// the posed skin as OBJ. LUCID_CORE.poseLab: apply(set), current(), exportSet(), open(), freeze().
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE) return;
  const D = global.document;
  const DEG = Math.PI / 180;
  const LAB = (CORE.poseLab = { isOpen: false, frozen: false, defaults: null, ready: false, edits: 0 });

  // ---- the posture shapes the lab exposes: [key, label, unit, min, max, step] per posture
  const SHAPES = [
    ["Seated (every posture's base)", [
      ["seatY", "pelvis on the seat: fore / aft (+ forward)", "m", -0.46, -0.24, 0.005],
      ["seatZ", "pelvis height over the seat reference", "m", 0.2, 0.36, 0.002],
      ["pelvisPitchDeg", "pelvis pitch (+ rolled forward)", "deg", -5, 40, 1],
      ["leanDeg", "trunk lean from vertical", "deg", 15, 80, 1],
      ["headPitchDeg", "head up (+) against the trunk", "deg", -15, 40, 1],
      ["elbowPrefDeg", "elbow bend she keeps (her trunk leans to give it: use this, not the elbow's joint style)", "deg", 0, 70, 1],
      ["kneeY", "knees on the tank: fore / aft", "m", -0.12, 0.06, 0.005],
      ["kneeZ", "knees on the tank: height", "m", -0.06, 0.1, 0.005],
    ]],
    ["Tuck (tuck +1)", [
      ["tuckLeanDeg", "trunk further down to the tank", "deg", 0, 30, 1],
      ["tuckPelvisPitchDeg", "pelvis rolled further forward", "deg", -5, 20, 1],
      ["tuckHeadPitchDeg", "head up to see over the screen", "deg", -5, 25, 1],
      ["tuckElbowDeg", "elbows bend further (trunk lowers to keep the grips)", "deg", 0, 80, 1],
    ]],
    ["Sit up / braking (tuck -1, braced)", [
      ["sitUpLeanDeg", "trunk this much more upright", "deg", 0, 40, 1],
      ["braceForwardM", "braced: pelvis forward against the tank", "m", 0, 0.08, 0.002],
      ["braceForwardPitchDeg", "braced: pelvis rolled forward", "deg", 0, 15, 1],
    ]],
    ["Hang-off (hang +-1)", [
      ["hangOffsetM", "pelvis across the seat", "m", 0, 0.18, 0.005],
      ["hangDropM", "pelvis lower on the seat", "m", 0, 0.05, 0.002],
      ["hangPelvisRollDeg", "pelvis rolled to the inside", "deg", 0, 30, 1],
      ["hangPelvisYawDeg", "pelvis turned to the inside", "deg", 0, 35, 1],
      ["hangChestRollDeg", "chest rolled further in", "deg", 0, 35, 1],
      ["hangChestYawDeg", "chest turned to the inside", "deg", 0, 30, 1],
      ["hangTuckDeg", "trunk lower (tucked into the corner)", "deg", 0, 25, 1],
      ["hangHeadYawDeg", "head turned into the corner", "deg", 0, 35, 1],
      ["hangHeadRollDeg", "head rolled in", "deg", 0, 20, 1],
      ["hangKneeOutM", "inside knee out", "m", 0, 0.25, 0.005],
      ["hangKneeDownM", "inside knee down", "m", 0, 0.15, 0.005],
    ]],
    ["Standing on the pegs (stand 1)", [
      ["standRiseM", "pelvis up off the seat", "m", 0.05, 0.3, 0.005],
      ["standFwdM", "pelvis forward", "m", -0.05, 0.15, 0.005],
      ["standLeanDeg", "trunk more upright", "deg", 0, 45, 1],
      ["standPelvisPitchDeg", "pelvis rolled back", "deg", 0, 30, 1],
      ["standHeadPitchDeg", "head down", "deg", -10, 20, 1],
      ["standKneeY", "knees forward", "m", -0.05, 0.1, 0.005],
      ["standKneeZ", "knees lower", "m", 0, 0.2, 0.005],
    ]],
  ];
  const SHAPE_KEYS = SHAPES.flatMap(([, rows]) => rows.map((r) => r[0]));
  // joint-style weights: off (no preference), a preference, a firm one, pinned (contacts permitting)
  const WEIGHTS = [["off", 0], ["soft", 0.02], ["prefer", 0.1], ["firm", 0.5], ["pin", 3]];
  const GROUPS = [
    ["Spine", /^spine/], ["Neck / head", /^(neck|head)/], ["Left arm", /^left(Clavicle|Shoulder|Elbow|Forearm|Wrist)/], ["Right arm", /^right(Clavicle|Shoulder|Elbow|Forearm|Wrist)/],
    ["Left leg", /^left(Hip|Knee|Ankle|Toe)/], ["Right leg", /^right(Hip|Knee|Ankle|Toe)/],
  ];

  const bio = () => (CORE.riderBio?.active ? CORE.riderBio : null);
  const rider = () => bio()?.rider || null;
  // (her hinges: id, link, limits)
  function hinges() { const R = rider(); return R ? R.internal.H : []; }
  function hingeIdx() { return rider()?.internal.hingeIndex || {}; }

  // ---- defaults (what the build ships), captured once she exists
  function captureDefaults() {
    const R = rider();
    if (!R || LAB.defaults) return !!LAB.defaults;
    // (as current() reads them, rounded alike: a value is changed only if it reads differently)
    LAB.defaults = current();
    LAB.rider = R;
    LAB.ready = true;
    return true;
  }

  // ---- the model: read, apply, export
  function current() {
    const R = rider();
    if (!R) return null;
    const shapes = {}, style = {}, H = hinges();
    for (const k of SHAPE_KEYS) if (Number.isFinite(R.plan[k])) shapes[k] = +R.plan[k].toFixed(5);
    for (const [i, v] of Object.entries(R.pref)) style[H[i].id] = [+(v[0] / DEG).toFixed(2), +v[1].toFixed(4)];
    return { shapes, style };
  }
  // a pose set holds what differs from the defaults (and says so: "changes"), plus the full set
  function exportSet(meta = {}) {
    const cur = current(), d = LAB.defaults;
    if (!cur || !d) return null;
    const changed = { shapes: {}, style: {} };
    for (const [k, v] of Object.entries(cur.shapes)) if (v !== d.shapes[k]) changed.shapes[k] = v;
    for (const [k, v] of Object.entries(cur.style)) { const o = d.style[k]; if (!o || v[0] !== o[0] || v[1] !== o[1]) changed.style[k] = v; }
    for (const k of Object.keys(d.style)) if (!cur.style[k]) changed.style[k] = null;
    return {
      schema: "lucid.rider.pose-set.v1",
      name: meta.name || "pose set", author: meta.author || "", notes: meta.notes || "", created: new Date().toISOString(),
      build: global.__LUCID_BUILD_VERSION__ || "V2.0.0-dev",
      units: { shapes: "m / deg as named (deg suffix = degrees)", style: "[preferred angle deg, weight] per Semantic51 joint DOF; weight 0 = no preference, 3 = pinned where the contacts allow" },
      changes: changed,
      shapes: cur.shapes, style: cur.style,
    };
  }
  // apply a pose set: its full shapes / style, or only its changes over the defaults
  function apply(set, { onlyChanges = false } = {}) {
    const R = rider();
    if (!R || !LAB.defaults) throw Error("rider not ready");
    if (typeof set === "string") set = JSON.parse(set);
    if (!set || set.schema !== "lucid.rider.pose-set.v1") throw Error("not a lucid.rider.pose-set.v1");
    const src = onlyChanges || !set.shapes ? set.changes || {} : { shapes: set.shapes, style: set.style };
    const report = { shapes: 0, style: 0, unknown: [] };
    for (const [k, v] of Object.entries(src.shapes || {})) {
      if (!SHAPE_KEYS.includes(k) || !Number.isFinite(+v)) { report.unknown.push(k); continue; }
      R.plan[k] = +v; report.shapes++;
    }
    const HI = hingeIdx(), H = hinges();
    for (const [id, v] of Object.entries(src.style || {})) {
      const i = HI[id];
      if (i == null) { report.unknown.push(id); continue; }
      if (v == null || !(v[1] > 0)) delete R.pref[i];
      else R.pref[i] = [Math.min(H[i].hi, Math.max(H[i].lo, v[0] * DEG)), +v[1]];
      report.style++;
    }
    LAB.edits++;
    refresh();
    return report;
  }
  function resetAll() {
    if (!LAB.defaults) return;
    const R = rider();
    for (const k of Object.keys(R.pref)) delete R.pref[k];
    apply({ schema: "lucid.rider.pose-set.v1", shapes: LAB.defaults.shapes, style: LAB.defaults.style });
  }

  // ---- frozen: the ride paused, the IK's pose for her targets shown in place of her body
  const PREVIEW = { cmds: null };
  function solvePreview() {
    const R = rider();
    if (!R) return;
    // (the bike where it is now: the planner's own copy is as old as its last step)
    const bk = CORE.riderBio?.bikeState?.() || null;
    // (her reach as riding settles it: the trunk leans until her elbows keep the bend the posture
    // asks - iterated here to where the planner would converge)
    const bike = bk || R.plan.targets?.bike;
    for (let it = 0; it < 14; it++) { R.solvePosture(R.planTargets(bike), it ? 1 : 3); R.reach(1 / 20); }
    for (let pass = 0; pass < 2; pass++) R.solvePosture(R.planTargets(bike), 1);
    PREVIEW.cmds = R.commands(R.internal.ikb);
  }
  function setPaused(v) { try { paused = !!v; } catch (_) { /* (no legacy loop) */ } }
  function freeze(on = !LAB.frozen) {
    LAB.frozen = !!on;
    setPaused(LAB.frozen);
    if (CORE.riderRender) CORE.riderRender.override = LAB.frozen ? () => PREVIEW.cmds : null;
    if (LAB.frozen) solvePreview();
    redraw();
    ui.sync?.();
    return LAB.frozen;
  }
  function refresh() { if (LAB.frozen) { solvePreview(); redraw(); } ui.sync?.(); }
  function redraw() { try { if (typeof renderFree === "function") renderFree(); } catch (_) {} }

  // ---- exports for a DCC: the current pose as BVH (Semantic51 joints as channels), the skin as OBJ
  // (her shown pose: the preview frozen, her body live)
  function shownPose() { const R = rider(); return LAB.frozen && PREVIEW.cmds ? PREVIEW.cmds : R.commands(); }
  function exportOBJ() {
    const ch = CORE.character, R = rider();
    if (!ch || !R) return null;
    const cmds = shownPose(), pose = ch.compile(cmds.commands, { validate: false, placement: cmds.placement });
    const X = ch.lbs(ch.clusterTransforms(pose)), F = ch.faces;
    const lines = ["# LUCID rider, posed (" + new Date().toISOString() + "); world metres, z up"];
    for (let i = 0; i < X.length; i += 3) lines.push(`v ${X[i].toFixed(5)} ${X[i + 1].toFixed(5)} ${X[i + 2].toFixed(5)}`);
    for (let f = 0; f < F.length; f += 3) lines.push(`f ${F[f] + 1} ${F[f + 1] + 1} ${F[f + 2] + 1}`);
    return lines.join("\n");
  }
  // BVH: one joint per Semantic51 DOF-owning bone is the DCC's view; here, plainly, the rider's
  // hinge chain - each Semantic51 DOF a rotation channel (degrees) on its own bone in order - plus
  // the root's placement. Read back by importBVHFrame (same skeleton), so a pose round-trips.
  function exportBVH() {
    const R = rider();
    if (!R) return null;
    const cmds = shownPose(), ids = Object.keys(cmds.commands), vals = ids.map((k) => cmds.commands[k]);
    const Rr = cmds.placement.R, t = cmds.placement.t;
    // root yaw / pitch / roll (Z, X, Y order, degrees) from the placement's rotation (row-major)
    const ry = Math.atan2(Rr[1] * -1, Rr[4]) / DEG, rx = Math.asin(Math.max(-1, Math.min(1, Rr[7]))) / DEG, rz = Math.atan2(-Rr[6], Rr[8]) / DEG;
    const out = ["HIERARCHY", "ROOT LucidHip", "{", "  OFFSET 0 0 0", "  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation"];
    ids.forEach((id, i) => { out.push(`${"  ".repeat(i + 1)}JOINT ${id.replace(/[^A-Za-z0-9_]/g, "_")}`, `${"  ".repeat(i + 1)}{`, `${"  ".repeat(i + 2)}OFFSET 0 0 0`, `${"  ".repeat(i + 2)}CHANNELS 1 Xrotation`); });
    out.push(`${"  ".repeat(ids.length + 1)}End Site`, `${"  ".repeat(ids.length + 1)}{`, `${"  ".repeat(ids.length + 2)}OFFSET 0 0 0`, `${"  ".repeat(ids.length + 1)}}`);
    for (let i = ids.length; i >= 0; i--) out.push(`${"  ".repeat(i)}}`);
    out.push("MOTION", "Frames: 1", "Frame Time: 0.0333333");
    out.push([t[0], t[1], t[2], ry, rx, rz, ...vals].map((v) => (+v).toFixed(5)).join(" "));
    return { bvh: out.join("\n"), note: "channel-per-DOF BVH (LUCID Semantic51): joint names are the DOF ids; values in degrees; ROOT position in metres (z up)" };
  }

  // ---- files
  function download(name, text, type = "application/json") {
    const a = D.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    D.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---- the panel
  const ui = {};
  function el(tag, attrs = {}, kids = []) {
    const e = D.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === "style") e.style.cssText = v; else if (k.startsWith("on")) e[k] = v; else e.setAttribute(k, v); }
    for (const k of [].concat(kids)) if (k != null) e.appendChild(typeof k === "string" ? D.createTextNode(k) : k);
    return e;
  }
  function buildPanel() {
    if (ui.root || !D?.body) return;
    const css = el("style", {}, [`
#lucidPoseLab{position:fixed;right:10px;top:64px;bottom:64px;width:380px;z-index:400;display:none;flex-direction:column;background:#071018f0;border:1px solid #3a5a68;border-radius:8px;color:#d8ecf4;font:11px/1.35 ui-monospace,Consolas,monospace;box-shadow:0 8px 30px #000a}
#lucidPoseLab header{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid #284450}
#lucidPoseLab header b{color:#7ce7ff;letter-spacing:.08em;flex:1}
#lucidPoseLab button{font:inherit;color:#d8ecf4;background:#12303c;border:1px solid #3a5a68;border-radius:4px;padding:3px 7px;cursor:pointer}
#lucidPoseLab button.on{background:#1f6a7a;border-color:#7ce7ff}
#lucidPoseLab .body{overflow:auto;padding:4px 9px 10px;flex:1}
#lucidPoseLab details{border-bottom:1px solid #1d3540;padding:4px 0}
#lucidPoseLab summary{cursor:pointer;color:#9fd8ea;padding:2px 0}
#lucidPoseLab .plRow{display:grid;grid-template-columns:1fr 92px 54px;gap:4px;align-items:center;margin:2px 0}
#lucidPoseLab .plRow.plJ{grid-template-columns:1fr 84px 52px 50px}
#lucidPoseLab .plRow span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lucidPoseLab input[type=range]{width:100%}
#lucidPoseLab input[type=number]{width:52px;font:inherit;background:#0b1d26;color:#d8ecf4;border:1px solid #284450}
#lucidPoseLab select{font:inherit;background:#0b1d26;color:#d8ecf4;border:1px solid #284450}
#lucidPoseLab .acts{display:flex;flex-wrap:wrap;gap:5px;padding:7px 9px;border-top:1px solid #284450}
#lucidPoseLab .note{color:#86a9b6;padding:3px 0}
#lucidPoseLab .live{color:#6f8f9b}
#lucidPoseChip{position:absolute;right:120px;bottom:12px;z-index:130;font:10px ui-monospace,monospace;color:#bff3ff;background:rgba(5,20,28,.8);border:1px solid #3a6a7a;border-radius:5px;padding:4px 8px;cursor:pointer}`]);
    D.head.appendChild(css);
    const root = (ui.root = el("div", { id: "lucidPoseLab" }));
    const freezeBtn = (ui.freezeBtn = el("button", { title: "pause the ride and show the IK pose for her targets", onclick: () => freeze() }, ["FREEZE"]));
    root.appendChild(el("header", {}, [el("b", {}, ["POSE LAB"]), freezeBtn, el("button", { onclick: () => toggle(false) }, ["×"])]));
    const body = (ui.body = el("div", { class: "body" }));
    root.appendChild(body);
    // posture being looked at: her intent held (hang / tuck / stand / foreAft), or her own (auto)
    const post = el("details", { open: "" }, [el("summary", {}, ["Posture shown"])]);
    ui.posture = {};
    for (const [k, lo, hi] of [["hang", -1, 1], ["tuck", -1, 1], ["stand", 0, 1], ["foreAft", -1, 1]]) {
      const inp = el("input", { type: "range", min: lo, max: hi, step: 0.05, value: 0 }), num = el("span", { class: "live" }, ["0"]);
      inp.oninput = () => { num.textContent = (+inp.value).toFixed(2); holdPosture(); };
      ui.posture[k] = inp;
      post.appendChild(el("div", { class: "plRow" }, [el("span", {}, [k]), inp, num]));
    }
    const autoBox = (ui.auto = el("input", { type: "checkbox" }));
    autoBox.onchange = () => holdPosture();
    post.appendChild(el("div", { class: "plRow" }, [el("span", {}, ["her own (auto rider)"]), autoBox, el("span")]));
    post.appendChild(el("div", { class: "note" }, ["Held here, her intent stays at these values; the shapes below are what each posture does to her at full intent."]));
    body.appendChild(post);
    // posture shapes
    ui.shape = {};
    for (const [title, rows] of SHAPES) {
      const det = el("details", {}, [el("summary", {}, [title])]);
      for (const [k, label, unit, lo, hi, step] of rows) {
        const inp = el("input", { type: "range", min: lo, max: hi, step }), num = el("input", { type: "number", step });
        const set = (v) => { const R = rider(); if (!R) return; R.plan[k] = +v; LAB.edits++; refresh(); };
        inp.oninput = () => { num.value = inp.value; set(inp.value); };
        num.onchange = () => { inp.value = num.value; set(num.value); };
        ui.shape[k] = { inp, num };
        det.appendChild(el("div", { class: "plRow", title: k }, [el("span", {}, [`${label} (${unit})`]), inp, num]));
      }
      body.appendChild(det);
    }
    // joint style
    const H = hinges(), wsel = () => { const s = el("select"); for (const [n, w] of WEIGHTS) s.appendChild(el("option", { value: w }, [n])); return s; };
    ui.joint = {};
    for (const [title, re] of GROUPS) {
      const det = el("details", {}, [el("summary", {}, ["Joint style: " + title])]);
      det.appendChild(el("div", { class: "plRow plJ" }, [el("span", { class: "live" }, ["DOF"]), el("span", { class: "live" }, ["preferred (deg)"]), el("span", { class: "live" }, ["weight"]), el("span", { class: "live" }, ["now"])]));
      H.forEach((h, i) => {
        if (!re.test(h.id)) return;
        const inp = el("input", { type: "range", min: (h.lo / DEG).toFixed(1), max: (h.hi / DEG).toFixed(1), step: 0.5 }), sel = wsel(), now = el("span", { class: "live" }, ["-"]);
        const set = () => {
          const R = rider(), w = +sel.value;
          if (!(w > 0)) delete R.pref[i]; else R.pref[i] = [+inp.value * DEG, w];
          LAB.edits++; refresh();
        };
        inp.oninput = () => { if (!(+sel.value > 0)) sel.value = "0.5"; set(); };
        sel.onchange = set;
        ui.joint[i] = { inp, sel, now };
        det.appendChild(el("div", { class: "plRow plJ", title: h.id }, [el("span", {}, [h.id.replace(/([a-z])([A-Z])/g, "$1 $2")]), inp, sel, now]));
      });
      body.appendChild(det);
    }
    body.appendChild(el("div", { class: "note" }, ["Joint style: the IK keeps her contacts and, wherever they leave a joint free, comes as close to your angle as its weight asks ('pin' holds it). Frozen, each change re-solves at once; live, her muscles carry it out - what they cannot make is not made."]));
    // actions
    const fileIn = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    fileIn.onchange = async () => { const f = fileIn.files?.[0]; if (!f) return; try { const r = apply(await f.text()); flash(`loaded ${f.name}: ${r.shapes} shapes, ${r.style} joints${r.unknown.length ? ", unknown: " + r.unknown.join(" ") : ""}`); } catch (e) { flash("load failed: " + e.message); } fileIn.value = ""; };
    const name = () => (ui.nameIn.value || "lucid-pose-set").replace(/[^A-Za-z0-9_.-]+/g, "_");
    ui.nameIn = el("input", { type: "text", placeholder: "set name", style: "flex:1;min-width:120px;font:inherit;background:#0b1d26;color:#d8ecf4;border:1px solid #284450" });
    ui.msg = el("div", { class: "note", style: "padding:0 9px 6px" });
    root.appendChild(el("div", { class: "acts" }, [
      ui.nameIn,
      el("button", { title: "download this pose set (JSON)", onclick: () => download(name() + ".json", JSON.stringify(exportSet({ name: ui.nameIn.value }), null, 1)) }, ["EXPORT"]),
      el("button", { title: "load a pose set (JSON)", onclick: () => fileIn.click() }, ["IMPORT"]),
      el("button", { title: "copy this pose set (JSON) to the clipboard", onclick: () => { navigator.clipboard?.writeText(JSON.stringify(exportSet({ name: ui.nameIn.value }), null, 1)).then(() => flash("copied"), () => flash("clipboard refused")); } }, ["COPY"]),
      el("button", { title: "the pose shown, as BVH (one channel per Semantic51 DOF)", onclick: () => download(name() + ".bvh", exportBVH().bvh, "text/plain") }, ["BVH"]),
      el("button", { title: "her skin in the pose shown, as OBJ (world metres, z up)", onclick: () => download(name() + ".obj", exportOBJ(), "text/plain") }, ["OBJ"]),
      el("button", { title: "back to the build's defaults", onclick: () => { resetAll(); flash("defaults restored"); } }, ["RESET"]),
      fileIn,
    ]));
    root.appendChild(ui.msg);
    D.body.appendChild(root);
    // the chip that opens it (bottom right, by the rider-ops chip)
    const chip = (ui.chip = el("button", { id: "lucidPoseChip", title: "pose lab: her riding postures and joint style, saved as JSON", onclick: () => toggle() }, ["POSE LAB"]));
    (D.getElementById("gl")?.parentElement || D.body).appendChild(chip);
    ui.sync = sync;
  }
  function flash(t) { if (ui.msg) ui.msg.textContent = t; }
  function holdPosture() {
    const B = bio();
    if (!B) return;
    if (ui.auto.checked) { B.auto = true; B.setPosture({ hang: null, tuck: null, stand: null, foreAft: null }); }
    else { B.auto = false; B.setPosture({ hang: +ui.posture.hang.value, tuck: +ui.posture.tuck.value, stand: +ui.posture.stand.value, foreAft: +ui.posture.foreAft.value }); }
    // (frozen: her intent becomes her posture at once - the planner eases it in at its rates riding)
    if (LAB.frozen) { const R = rider(); for (const k of ["hang", "tuck", "stand", "foreAft"]) R.plan.posture[k] = ui.auto.checked ? R.plan.posture[k] : +ui.posture[k].value; }
    refresh();
  }
  // the panel's values from the model (and the live joint angles)
  function sync() {
    const R = rider();
    if (!R || !ui.root) return;
    for (const [k, c] of Object.entries(ui.shape)) if (D.activeElement !== c.inp && D.activeElement !== c.num) { c.inp.value = R.plan[k]; c.num.value = (+R.plan[k]).toFixed(c.inp.step < 0.01 ? 3 : 1); }
    const H = hinges(), q = LAB.frozen ? R.internal.ikb.q : R.body.q;
    for (const [i, c] of Object.entries(ui.joint)) {
      const p = R.pref[i];
      if (D.activeElement !== c.inp) c.inp.value = p ? (p[0] / DEG).toFixed(1) : (q[H[i].link] / DEG).toFixed(1);
      if (D.activeElement !== c.sel) { const w = p ? p[1] : 0; let best = WEIGHTS[0][1]; for (const [, ww] of WEIGHTS) if (Math.abs(Math.log((ww || 1e-4) / (w || 1e-4))) < Math.abs(Math.log((best || 1e-4) / (w || 1e-4)))) best = ww; c.sel.value = String(best); }
      c.now.textContent = (q[H[i].link] / DEG).toFixed(1);
    }
    ui.freezeBtn.classList.toggle("on", LAB.frozen);
    ui.freezeBtn.textContent = LAB.frozen ? "FROZEN" : "FREEZE";
  }
  function toggle(on = !LAB.isOpen) {
    if (!captureDefaults()) return false;
    buildPanel();
    LAB.isOpen = !!on;
    ui.root.style.display = LAB.isOpen ? "flex" : "none";
    if (!LAB.isOpen && LAB.frozen) freeze(false);
    sync();
    return LAB.isOpen;
  }
  // (the chip shows on the ride page once she is riding; the live readouts tick a few times a second)
  let acc = 0;
  (CORE.renderHooks = CORE.renderHooks || []).push({
    id: "poseLab",
    draw: () => {
      if (++acc % 12) return;
      if (!LAB.defaults) captureDefaults();
      if (LAB.defaults && !ui.chip && D?.body) buildPanel();
      if (ui.chip) ui.chip.style.display = String(global.__LUCID_ACTIVE_PAGE__ || "RIDE").toUpperCase() === "RIDE" && bio() ? "block" : "none";
      if (LAB.isOpen) sync();
    },
  });
  Object.assign(LAB, { apply, current, exportSet, resetAll, freeze, open: () => toggle(true), close: () => toggle(false), exportBVH, exportOBJ, shapes: SHAPES, weights: WEIGHTS, refresh });
})(typeof window !== "undefined" ? window : globalThis);

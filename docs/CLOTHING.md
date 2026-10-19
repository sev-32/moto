# Her clothes: the LUCID Clothing Engine on the rider

She wears the Human Engine M26 garments, the fitted T-shirt and the five-pocket jeans (with their
pocket, stitch, belt-loop and button details), simulated by the **LUCID Clothing Engine**: the M26
cloth solver with the Clothing Engine R1 overlay (wardrobe, shirt-over-jeans contact, trouser
topology guards). The engine is used as it was handed over; this document is how it is attached
to her and what is measured. Everything here is **CANDIDATE**.

## Where things are

| What | Where |
| --- | --- |
| The engine's sources, byte for byte | `src/vendor/lucid-clothing/` (their own relative layout; `MANIFEST.json` holds each file's sha256 from the handoff's manifest) |
| The garments and the watertight body proxy, byte for byte | `assets/character/clothing/` |
| How her body drives the engine | `assets/character/clothing/lucid_body_adapter_v1.json` |
| The riding cut | `assets/character/clothing/lucid_riding_cut_v1.json` |
| Her T-shirt: the lab's T-shirt template at her size | `assets/character/clothing/lucid_moto_tshirt_v1.json` (made by `tools/clothing/tshirt-template.mjs`; the lab's shirt is kept as handed over) |
| Her skin her clothes cover (left undrawn) | `assets/character/clothing/lucid_skin_cover_v1.json` (`tools/clothing/skin-cover.mjs`) |
| Her jeans' fabric map (worn denim's creases) | `assets/character/clothing/lucid_moto_jeans_fabric_v1.json` (`tools/clothing/fabric-map.mjs`; painted further in the game's fabric lab, `src/core/49_fabric_lab.js`) |
| How the shirt hangs; her bra as her clothes feel it; stretch denim; the jeans' open edges for the layer contact; fabric maps | `src/core/clothing/hangers.js`, `bra.js`, `stretch.js`, `layeredge.js`, `fabricmap.js` - ours, shared by the game (bundled) and the Node tools, each installed on an engine instance (its source unchanged) |
| The game layer | `src/core/47_rider_wardrobe.js` (the engine bundled in at build time by `tools/bundle-modules.mjs`) |
| Importing a handoff | `python3 -I tools/character/extract_clothing.py <handoff root>` (checks every file against the handoff's own manifest) |

The engine's ES modules become one script at build time: each module a function scope that
receives its imports and returns its exports. Only the `import` lines and the `export` keyword
are rewritten; nothing else in their code is touched.

## Her body is the engine's body

The engine simulates against the Human Engine body (`public/model/base.gltf`, mesh *Body*: 15,602
vertices with its UV seams split, 28,092 triangles, 78 skin joints). Measured: that body is her
Skin78 turned half a turn about +Y - every vertex lies on one of hers after
(x, y, z) -> (-x, y, -z) to within 6e-8 m - and its triangles are hers, in the same order. So
each frame her skin, as it is drawn (Semantic51 -> body.articulate.v2 -> Skin78 LBS), is gathered
into the engine's 15,602-vertex layout and turned into its frame. The garments were made on that
body, so they fit her without refitting. Nothing writes back to her: the clothes are downstream.

## The frame the cloth lives in

Origin at the bike, axes fixed (world z up -> the engine's y up). The cloth therefore feels what
she feels:
- gravity less the bike's acceleration - braking, cornering, bumps (filtered over ~40 ms);
- the still air seen from the bike, a wind from ahead at the bike's speed (`windScale`), sampled
  per triangle through the engine's own wind hook: sheltered below the screen's top (~1.06 m above
  the road: `windScreen` 0.3 of it below, `windFairing` 0.2 lower down) and turbulent in proportion
  to the speed (`windTurbulence`) - a height model, not a flow solution (CANDIDATE).

Using a moving frame (rather than world coordinates) keeps the engine within its own speed
limits. It caps cloth at 4 m/s relative to her and 18 m/s absolute, and the bike does 30 m/s.

## Modes (`LUCID_CORE.wardrobe.setMode(...)`)

| Mode | What | Cost |
| --- | --- | --- |
| `bound` (default) | each garment on its carriers - where the engine anchors it to her skin - no dynamics | a few ms a frame |
| `live` | the engine with a reduced budget (fewer iterations and passes, the watertight audit every 8th frame, 60 Hz) - **not yet measured** | - |
| `quality` | the engine's own outfit qualification settings (`verifyOutfitMotionR1.mjs`) at 120 Hz | ~1 s of compute per 1/60 s - for renders on the virtual clock |

`wardrobe.settle(n)` lets the cloth hang for n engine steps without time passing for the ride
(paused, posing, stills), in the bike's motion as it stands; `settle(n, { still: true })` in a frame
at rest - no wind, no surge (the fitting room). `wardrobe.reanchor()` remakes the garments on her
current pose. `wardrobe.audit()` reports strain, cloth inside her body and the layer contact.

While the ride is paused and her body moves (the pose lab), the garments go back onto their
carriers; `settle()` lets them hang again.

## The riding cut

On the 916 her knees bend about 120° and her hips about 75°. Hung off, the inside knee reaches
125° and the hip 83°. The jeans are a body-derived slim-straight shell made on her standing body.
On her seated body they stretch to 61% at p95, against the engine's 18% gate. The stretch is at
the knee, front and back (p95 about 100%), and at the seat and back waist (p95 about 90%).

The engine's own findings are that runtime forces cannot manufacture missing material, and that
pattern and runtime control are separate levers. Its 10–20 mm knee bellows and darts were sized
for 80–100° knees. Here they move p95 by about 2 points.

Riding jeans answer this in the pattern, with pre-curved knees and a higher back.
`tools/clothing/riding-cut.mjs` gives every edge and bend the length her riding postures ask of it:
- the length is the longest it reaches on her skin over seated, tucked, hung off left and right,
  alert, and riding live (the garment on its carriers), less 18% of stretch - the jeans are stretch
  denim (the engine's stretch stiffness 0.9 for them, CANDIDATE);
- it is never shorter than the engine's own pattern, and at most 1.35× it;
- edges under 1 mm, the welds, keep their length.

The cut lengthens 1,040 of the 4,328 jeans edges; 370 hit the cap.

### Worn as stretch denim (`src/core/clothing/stretch.js`)

Applied as the jeans' pattern (both of the engine's rest metrics: the baked one, which its final
stretch pass and strain metric use, and the authored one), the cut made them that long when she
stood too: standing, they slid 2 cm down her hips and stood 12-17 mm off her waist at the sides and
back (without it 7-9 mm), and her T-shirt bulged over them. Stretch denim is cut to her standing and
stretches where she bends. As the game wears the cut (`wardrobe.ridingCut = true`; `"pattern"` for
the cut as the pattern):
- each edge's and bend's rest length is the pattern's, lengthened towards what her pose asks of it
  now - its length on its carriers (the engine's carrier targets, refreshed for her body as it is),
  less the same 18% - never beyond the cut; yielding at 6 Hz as she bends, recovering at 1 Hz;
- **the waistband** (within 4 cm of the jeans' top edge along the cloth: 147 points, 328 edges)
  takes no part - a jeans waistband is interfaced - and is cut 3% under the pattern: it grips her
  waist and hips, and the jeans hang from it.

Standing, the waistband's girth ease is 4.3-4.6 cm (6-6.7 with the cut as the pattern; 5.3 as the
lab cut it), 4-8 mm off her, and it stays at her waist. Seated, the edges her pose stretches reach
their cut lengths; the gates below are with the cut worn this way. The garment is a different cut,
not a relaxed gate.

## Her T-shirt: the lab's template at her size (`tools/clothing/tshirt-template.mjs`)

The lab's shirt (`lucid_human_native_tshirt_v1.json`) is a Human Engine M26 "body-native" garment,
and records how it was made: a continuous shell extracted from the body's own topology inside
bounds, offset from it by an ease, faired ("carrier-normal minimum-clearance constrained
Laplacian"), with a three-row rib collar sewn to its neckline. The generator is not in the handoff;
`tools/clothing/tshirt-template.mjs` is it, reconstructed from the asset and measured against it.
Her shirt is sized by changing the template, not by reshaping a mesh.

**The reconstruction** (the template's `lab` size, the lab's own bounds and ease):
- the extraction: a body triangle is in the shirt when its three vertices are inside the bounds;
  welded by position, that is the lab's 4,944 triangles and 2,546 vertices;
- edges are the triangles' edges, bends the vertices facing each other across interior edges (each
  pair once): the lab's 7,758 and 7,472 exactly; the collar 38 points a ring, its rows 1, 4.8 and
  8.6 mm in from the neckline (and 0, 1.5, 2.5 mm up), as the lab's;
- the ease by region, as measured on the lab's shirt vertex by vertex: `torso` everywhere on the
  body, `frontChest` on her front from 1.04 to 1.315 m, `hem` growing from her waist (1.07 m) to 6
  cm above the hem, `base` on the sleeves;
- the fairing: 12 umbrella steps, never closer to her than the ease along the carrier normal (the
  closest point of her body and her normal there, as the engine finds a garment point's carrier;
  0.95 of it on the sleeves), after a ball of 40 cm rolled over her front (a morphological closing):
  the cloth spans under her bust and between her breasts rather than following her skin into them.

Rebuilt, it lies on the lab's shirt to 0.9 mm (median), 4.8 mm (90th percentile) and 1.1 cm (99th),
surface to surface.

**Her size** (the template's `fitted` size):

| | The lab's | Hers |
| --- | --- | --- |
| Ease (mm): torso / front chest / hem / sleeves | 14 / 20 / 20 / 12 | 7.5 / 12 / 11 / 8.5 |
| Ease on her shoulders (above 1.33 m) | - | 5.5 |
| Over her jeans | - | their clearance + 16 mm, ramping over the waistband at 0.3 |
| Hem | 0.84 m | 0.875 m, her high hip |
| Sleeves | cut at 0.39 m out | 12 cm down her arm from the shoulder joint, square to it |
| Front closing ball | 40 cm | 20 cm (it comes in at her waist) |
| Made on | her bare skin | her bust as her bra shapes it |

Girth ease as cut (her tape over her hull; the lab's in brackets): bust 5.6-7.9 cm (13-14), waist
7.5 (11.4), high hip over her jeans 15.4. The engine's contact margins set a floor: its cloth stays
4.5 mm off her skin (6 mm on the sleeves), so no girth comes closer than 2.8 cm over hers (3.8 round
an arm). Her shoulders' ease is that margin plus 1 mm: cut 7.5 mm off them, the whole shirt dropped
5 mm as it settled and bunched over her jeans' waistband. Over the jeans, the shirt clears the
layer contact's 8 mm by another 8 mm standing, and hangs free of it.

## How the shirt hangs (`src/core/clothing/hangers.js`)

Position-based cloth with a few iterations per step cannot carry its own weight down long chains of
edges: the shirt sagged 5-10% and its neckline, pulled down by the shirt's weight and pushed open by
her body, slid 2.3 cm down her shoulders (the engine's neckline guard lets it drift 3.2 cm before
acting). Installed on the solver instance, inside every substep right after the engine's own
neckline guard and before its collision passes (the engine's source unchanged):
- **long-range attachments** (Kim, Chentanez and Mueller-Fischer 2012): no point of the cloth
  farther from the neckline than its rest distance along the cloth, times 1.02 - unilateral, so the
  cloth still folds and bunches; the hem's last 8 cm hang free of them (seated, they lie over the
  jeans' waistband, and an attachment drawing them straight at the neckline pulled them through it);
- **the neckline's ring**: its points no farther apart, across and a quarter round, than at rest
  (+1%);
- **the neckline on her neck's base**: each of its points held to its place on her (the engine's
  carrier target) beyond 4 mm of free play;
- **a strain limit**: no edge running away from the neckline longer than its rest length + 1%,
  swept once a substep from the neckline down, each edge's far point drawn to its near point
  (follow-the-leader, in order of distance along the cloth). The engine's 13 iterations carry the
  weight down an edge or so an iteration: over the first 0.1 s her shirt's front fell 2-3 cm,
  stretching 20% at the 95th percentile, and the long-range attachments did not catch it (over her
  bust the straight line from the neckline is far shorter than the cloth). Edges across the cloth,
  and the free hem (where the layer contact holds the shirt off the jeans), are left to the engine.

## Her bra, as her clothes feel it (`src/core/clothing/bra.js`)

The cloth drapes over her bust as over a bra's smooth cups: within 4.5 cm of each nipple tip (fully
within 2.5 cm) the contact surface handed to the engine is her posed skin smoothed (24 umbrella
steps, every frame); each tip comes 12 mm in, her breast's tip rounded as a moulded cup rounds it.
Her shirt is made on the same surface. The skin drawn is hers and is hidden under the shirt there; Skin78, its weights and
its deformer are untouched. A declared garment-side assumption (CANDIDATE).

## Her shirt over her jeans

The engine's layer contact holds the shirt a soft gap off the jeans: its own gap (3 mm) plus the
jeans' visual envelope - here **5 mm, not the qualification's 11.5** (declared): the jeans' rendered
details (waistband, loops, pocket edges, rivets) stand 3.3 mm off them at the median, 4.7 at the
90th percentile and 6.7 at the 99th; only the button reaches 10.3. Held 14.5 mm off the jeans' shell,
her shirt stood out round her hips. Its gate - no shirt behind the jeans - is unchanged.

**The jeans' open edges, rounded** (`src/core/clothing/layeredge.js`): the contact measures a shirt
point's gap along the jeans' normal at its closest point. Where that point is on the jeans' top
edge and the shirt is beside or above it, the measure reads near zero however far away the shirt
is: the contact pushed the shirt out to the full gap up to its reach (35 mm) above the waistband, a
roll round her waist. Such a point is measured from a rounded edge instead - its true distance to
the edge - and only when it is in front of the jeans there: wherever the engine's own measure says
"behind", it is left exactly as the engine finds it (tested).

## Her jeans' fabric: maps and the fabric lab

The engine reads a garment's fabric as fields over it: per vertex its thickness, skin friction,
wrinkle amplitude, crease bias, bend and stretch scales, damping and grain direction; per edge its
stiffness and rest scale; per bend its stiffness and rest scale. The lab's jeans carry them baked
(`authoring.fabricMaps`, `lucid.fabric.authoring.v1`: "paint on 2D garment panels, bake to
per-vertex / per-edge arrays, the runtime samples the baked arrays without touching the character
files"); the painted maps are not in the handoff. `src/core/clothing/fabricmap.js` paints and bakes
our own on top (multiplying the lab's):

| Channel | Baked to |
| --- | --- |
| tension (cut tighter < 1, looser > 1) | each edge's rest scale (its ends' mean) |
| stretch, thickness, bend, skin friction, damping | the vertex scales of the same names |
| wrinkle (drawn) | the wrinkle amplitude channel |
| creases (strokes, each a width and a depth) | the bends whose hinge runs along a stroke, near it: rest length shorter by up to `creaseDepth` (8%: pre-folded, as a set crease is) and bend stiffness halved at full depth (a worn hinge); the crease bias channel |

Maps are painted on the jeans' **flats** - their front and back square on (x, y of their rest
frame), as a designer draws a pair of jeans - not on their UV layout, whose panels overlap at the
crotch. The jeans are coarse (1,474 points, 2-3 cm triangles): in the cloth a crease is a fold line;
drawn, the shader takes the strokes themselves (up to 64 pieces, measured on the flat each was drawn
on): faded on the ridge, the ridge raised and its sides sunk, tapering out at the stroke's ends.

**The default** (`lucid_moto_jeans_fabric_v1.json`, `tools/clothing/fabric-map.mjs`): worn denim's
set creases, placed from her joints - five whiskers each side fanning across the lap from the crotch
to the hip, three honeycomb V's behind each knee, a crease across each knee, stacking above the hems
front and back (26 strokes; 1,221 bends folded). Other channels at their defaults.

**The fabric lab** (`FABRIC LAB`, bottom right on the ride; `LUCID_CORE.fabricLab`): the two flats,
the channel painted as a heatmap (blue below its default, red above), brushes (raise, lower, set,
smooth, back to default; radius and strength), crease strokes drawn with a width and a depth (and
erased); APPLY bakes the map and rebuilds her jeans on it, then lets them settle; maps export and
import as JSON (`lucid-moto.fabric-map.v1`). `fabricLab.load(json)`, `apply()`, `exportMap()`.

## Drawn

- **Fabric** in the scene's own lights: a cloth shader evaluated where it lies on the garment (its
  rest shape) - denim 3/1 twill, slubs and wear; cotton single jersey; the rib neckband; topstitch
  thread and the button; fold occlusion; features finer than a pixel faded out.
- **Hems**: each opening's edge smoothed along itself every frame, and the turned-up allowance drawn
  on the cloth's inside, from the edge to three rings in (it lies on the cloth, so it never stands
  off a flaring cuff); twin-needle stitches at 14 and 20 mm (the shirt), gold chain stitch at 12 mm
  (the jeans). The hem's bends are 2.5× stiffer within 1.5 cm of an opening (the engine's per-bend
  stiffness field).
- **The neckband**: the engine's three collar rows lie flat (a 0.8 cm ring pointing at her neck,
  held by fixed world offsets) and are not drawn; drawn is a 2 cm doubled rib band from the shirt's
  neckline (its seam, as the cloth moves) up the base of her neck, carried on her skin (the engine's
  own body sampling), smoothed along itself, its top edge folded.
- **Her skin under her clothes** is left undrawn well inside their openings (where her LBS skin
  bulges between the cloth's vertices it would show through).
- **Lift**: cloth lying on her is drawn lifted 1 mm (the shirt) or 2.5 mm (the jeans: a bent knee's
  skin bulges between their vertices); the engine's own is 0.85 mm. Lifted more, the shirt showed
  puckers where it touched her in patches.

## Measured (`tools/clothing/ride-cloth.mjs`, engine frame, quality settings, 120 Hz)

Her T-shirt from its template, the jeans with the riding cut worn as stretch denim, their fabric map
baked in, the layer contact as above:

| Case | Jeans p95 / p99 strain | Shirt p95 / p99 | Cloth inside her | Shirt behind jeans (every check) |
| --- | --- | --- | --- | --- |
| Seated (5 checks over 1 s) | 0.31 / 0.91 | 0.31 / 0.62 | 0 | 0 |
| Seated -> tucked -> hung off right -> seated (24 checks) | 0.34 / 1.00 | 0.34 / 0.70 | 0 | 0 |
| Seated, 25 m/s air from still (a step) | 0.51 / 1.20 | **1.07 / 1.99** | 0 | **6 at 0.25 s**, then 0 |

The jeans' engine pattern alone, seated: 0.61 / 1.34 (the riding cut's reason). With the cut as the
pattern (before this round): seated 0.27 / 1.07, the sequence 0.27 / 1.08 with 2 shirt points behind.

Open issues, as measured:
- **The knee pit at 120°.** Her LBS skin folds through itself behind a deeply bent knee. The
  jeans' carriers there separate onto the thigh and the calf. About 5% of jeans edges, all in the
  knee pit and crotch, stay stretched about 2× (p99). This is the engine's documented open case
  (deep knee flexion), deeper here.
- **Wind at riding speed.** The engine was validated with up to 2.5 m/s of wind. At 25 m/s the
  drag is about 100× that, and the shirt's material solve cannot hold its length: p95 strain is
  over 100% in a step from still, and 6 of its points cross behind the jeans at the gust's onset.
  Shelter behind the screen and a stronger material solve are both open (in the game the air builds
  with the bike's speed, not in a step).
- **The waistband.** Standing, a soft dip and ripple remain in the shirt at her centre front above
  the jeans' fly.
- **Rider tests.** Four rider-dynamics tests (the floating trunk, creeping, getting off, getting on)
  fail on this branch before and after this work: the getting-on/off work in progress.
- **Cost.** Quality mode takes ~1 s per frame (the watertight safety projection and the repeated
  collision passes dominate). Live play uses `bound` until a real-time path exists. The engine
  already has a hook for one: a cached body-relative residual (`exportCausalResidual` /
  `setCausalPrediction`), which could be baked per riding posture with quality settings and
  blended live.

## Tools

- `node tools/clothing/fitting.mjs [--rigs front,side,back,torso,waist,bust,neck,sleeve,sleeveBack,hem]
  [--set JSON] [--settings JSON]` - the fitting room: her standing in her rest pose beside the bike,
  the ride's clock stopped, the cloth settled still; a sheet of views and close-ups (`--settings`:
  the engine's settings by mode, merged before it is built).
- `node tools/clothing/tshirt-template.mjs [--size fitted|lab] [--set JSON] [--out FILE] [--lab]` -
  her T-shirt from its template (under a second); `--lab` compares the result with the lab's shirt.
- `node tools/clothing/fabric-map.mjs [--png FILE --channel tension] [--bake] [--map FILE]` - the
  jeans' default fabric map; a picture of a map on the flats; what a bake changes.
- `node tools/clothing/measure.mjs [--garment FILE] [--settled]` - the tape: her girths and the
  garment's, by height and along her arms.
- `node tools/clothing/skin-cover.mjs` - her skin the clothes cover (after any change to the cut).
- `node tools/clothing/capture-poses.mjs` - her riding postures as the game makes them, to
  `tests/fixtures/rider_poses.json`.
- `node tools/clothing/riding-cut.mjs [--eps 0.18] [--cap 1.35]` - the riding cut.
- `node tools/clothing/ride-cloth.mjs --sequence seated,tuck,hangR,seated --cut [--wind 25]` - the
  engine on her postures, its gates and cost (and the last frame dumped for inspection).
- `node tools/pose-board.mjs --wardrobe quality --settle 24` - dressed posture sheets from the game.
- `tests/rider_wardrobe.test.mjs` - vendored bytes, the body map, the bundles, the seated settle
  (finite, outside her body, strain bounds as measured), the bra, the shirt hanging and its fit, the
  template (its lab size rebuilds the lab's shirt; her shirt is its fitted size), stretch denim and
  the rounded edges.

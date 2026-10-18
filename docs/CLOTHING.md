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
- the still air seen from the bike, a wind from ahead at the bike's speed (`windScale` - the
  screen and her tuck shelter her in reality; not modelled yet).

Using a moving frame (rather than world coordinates) keeps the engine within its own speed
limits. It caps cloth at 4 m/s relative to her and 18 m/s absolute, and the bike does 30 m/s.

## Modes (`LUCID_CORE.wardrobe.setMode(...)`)

| Mode | What | Cost |
| --- | --- | --- |
| `bound` (default) | each garment on its carriers - where the engine anchors it to her skin - no dynamics | a few ms a frame |
| `live` | the engine with a reduced budget (fewer iterations and passes, the watertight audit every 8th frame, 60 Hz) - **not yet measured** | - |
| `quality` | the engine's own outfit qualification settings (`verifyOutfitMotionR1.mjs`) at 120 Hz | ~1 s of compute per 1/60 s - for renders on the virtual clock |

`wardrobe.settle(n)` lets the cloth hang for n engine steps without time passing for the ride
(paused, posing, stills). `wardrobe.reanchor()` remakes the garments on her current pose.
`wardrobe.audit()` reports strain, cloth inside her body and the layer contact.

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
  alert, and riding live (the garment on its carriers), less 4% of stretch;
- it is never shorter than the engine's own pattern, and at most 1.8× it;
- edges under 1 mm, the welds, keep their length.

The cut lengthens 1,937 of the 4,328 jeans edges; 241 hit the 1.8× cap. It is applied to both of
the engine's rest metrics: the baked one, which its final stretch pass and strain metric use, and
the authored one. The garment is a different cut, not a relaxed gate. The T-shirt keeps its own
pattern.

## Measured (`tools/clothing/ride-cloth.mjs`, engine frame, quality settings, 120 Hz)

| Case | Jeans p95 / p99 strain | Shirt p95 / p99 | Cloth inside her | Shirt behind jeans |
| --- | --- | --- | --- | --- |
| Seated, the engine's pattern | 0.61 / 1.34 | 0.23 / 0.49 | 0 | 0 |
| Seated, riding cut | 0.27 / 1.07 | 0.24 / 0.51 | 0 | 0 |
| Seated -> tucked -> hung off right -> seated, riding cut | 0.27 / 1.08 | 0.21 / 0.44 | 0 | 0 |
| Seated, riding cut, 25 m/s air | 0.36 / 1.24 | **0.88 / 1.76** | 0 | 0 |

Open issues, as measured:
- **The knee pit at 120°.** Her LBS skin folds through itself behind a deeply bent knee. The
  jeans' carriers there separate onto the thigh and the calf. About 5% of jeans edges, all in the
  knee pit and crotch, stay stretched about 2× (p99). This is the engine's documented open case
  (deep knee flexion), deeper here.
- **Wind at riding speed.** The engine was validated with up to 2.5 m/s of wind. At 25 m/s the
  drag is about 100× that, and the shirt's material solve cannot hold its length: p95 strain is
  88%. Shelter behind the screen and a stronger material solve are both open.
- **Cost.** Quality mode takes ~1 s per frame (the watertight safety projection and the repeated
  collision passes dominate). Live play uses `bound` until a real-time path exists. The engine
  already has a hook for one: a cached body-relative residual (`exportCausalResidual` /
  `setCausalPrediction`), which could be baked per riding posture with quality settings and
  blended live.

## Tools

- `node tools/clothing/capture-poses.mjs` - her riding postures as the game makes them, to
  `tests/fixtures/rider_poses.json`.
- `node tools/clothing/riding-cut.mjs [--eps 0.04] [--cap 1.8]` - the riding cut.
- `node tools/clothing/ride-cloth.mjs --sequence seated,tuck,hangR,seated --cut [--wind 25]` - the
  engine on her postures, its gates and cost (and the last frame dumped for inspection).
- `node tools/pose-board.mjs --wardrobe quality --settle 24` - dressed posture sheets from the game.
- `tests/rider_wardrobe.test.mjs` - vendored bytes, the body map, the bundle, and the seated
  settle (finite, outside her body, strain bounds as measured).

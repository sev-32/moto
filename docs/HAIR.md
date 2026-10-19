# Her hair

Her hair is the DDHF V25 hair engine's clump charts (the "twist-optical rank" prototype handed over
as `DDHF_Hair_Engine_Twist_Optical_Rank_V25_Core`) grown into a groom on her head, simulated as
strands in the bike's frame and lit by the scene's lights. Everything here is **CANDIDATE**: the
drag, the shape memory, the colour and the strand pattern are declared, not measured.

## Where things are

| What | Where |
| --- | --- |
| The groom: 369 clumps, 12 nodes root to tip | `assets/character/hair/lucid_hair_guides_v1.json` |
| How it was made | `python3 -I tools/character/extract_hair.py <clothing handoff root>` |
| The game layer | `src/core/47_rider_hair.js` (`LUCID_CORE.hair`), drawn right after her clothes |

## The groom

The Human Engine model she was made with carries her original hair as cards: mesh *hair*, 123
strips skinned (98%) to the Head joint, each with its UV v running from the root (v = 0, at the
scalp) to the tip. Their textures are not in the handoff, so the cards cannot be drawn as cards;
their shape is the style, a bob to the nape. Per card: its centreline root to tip (the mean of its
vertices in 12 equal steps of v), its width, its facing. Each card becomes three clumps side by side
across its width. The model's files are checked against the handoff's own manifest.

## The strands

Each clump is a strand of 12 nodes, its root carried by her head:
- **inextensible**, by follow-the-leader projection (the DDHF engine's balanced inextensibility);
- a **shape memory** towards its styled shape in her head's frame, held over the first 30% of the
  strand (hair near the scalp lies on her head, held there by the hair around it) and decaying to
  the free tip (0.85 to 0.015 per iteration, 4 iterations a substep);
- **collisions** with her skull (a sphere fitted to her rest skin) and capsules on her neck, upper
  back and shoulders;
- **gravity less the bike's acceleration**, filtered over ~40 ms, as her clothes feel it;
- **the air**: the still air seen from the bike, sheltered below the screen's top (`windScreen`),
  with turbulence growing with the speed. Drag a = dragK |w| w with dragK = 0.4 per metre - for a
  clump of about 1,000 hairs (6.5 ug/cm each, so ~6.5 g/m), an effective width of 5 mm and a drag
  coefficient of 1, 0.5 x 1.225 x 1 x 0.005 / 0.0065 ~ 0.47 per metre. At 100 km/h that is 13 g:
  the lengths stream back, the bob stays on her head.

At 120 Hz, up to 4 substeps a frame. `hair.settle(n, { still })` lets it hang without time passing
for the ride (still: no wind, no surge); paused, if her head moves the hair goes back to its styled
shape.

## Drawn

- Each clump is a ribbon along its Catmull-Rom curve (24 segments), its side vector carried along
  the curve, tapering to the tip.
- The **V25 twist chart**: three signed coefficients per clump, packed in an RGB8 texture, with
  theta(u) = c0 + c1 u + c2 sin(pi u). Its second azimuthal harmonic, m2 = (cos 2 theta, sin 2 theta),
  shapes the secondary highlight.
- **Lighting** (the scene's four directional lights and hemisphere ambient):
  - R, the first reflection off the cuticle, in the light's colour and narrow;
  - TRT, through the fibre and back, in the hair's colour and wider, shaped by the twist;
  - the two shifted apart along the fibre by the cuticle's tilt;
  - a Kajiya-Kay diffuse.
- **Strand groups** of about 1 mm across each clump, thinning towards its edges and tip; alpha to
  coverage.
- **The scalp**: her skin's triangles within 1.5 cm of the clumps' first 40% are drawn in the
  hair's colour along the hair's direction there, 1.2 mm above her skin. Where strands part, in the
  wind, hair shows rather than bald skin.
- **Colour**: a natural dark brown, lighter to the tips (linear albedo 0.026/0.016/0.011 at the root,
  0.105/0.064/0.038 at the tip). The model's own colour is not known.

## Open

- No strand-strand contact; the clumps pass through one another.
- No contact with her clothes (the collar).
- No helmet yet.

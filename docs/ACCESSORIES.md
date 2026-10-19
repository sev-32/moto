# Her accessories

What she wears besides her clothes and her hair: her sunglasses and her shoes. Each one is a model
someone made and published, used under its licence with its attribution kept in the asset, and
fitted to her body by a tool here rather than by hand. Everything here is **CANDIDATE**.

## Where things are

| What | Where |
| --- | --- |
| Reading a GLB (its meshes, materials, textures) as plain JSON | `python3 -I tools/character/extract_glb.py <model.glb> <raw.json> [--skip NODE ...]` |
| Her sunglasses, fitted | `assets/character/accessories/lucid_sunglasses_v1.json` (`tools/character/fit-glasses.mjs`) |
| The game layer | `src/core/47_rider_glasses.js` (`LUCID_CORE.glasses`), drawn after her hair |
| Her shoes, fitted | `assets/character/accessories/lucid_vans_v1.json` (`tools/character/fit-shoes.mjs`) |
| How the shoes are worn: the flex, the vamp's canvas, the bow | `src/core/clothing/shoes.js` (shared by the game, bundled, and the Node tools and tests) |
| The game layer | `src/core/47_rider_shoes.js` (`LUCID_CORE.shoes`), drawn after her glasses |

## Her sunglasses

"Sunglasses" by martn00 (Sketchfab, CC-BY-4.0:
https://sketchfab.com/3d-models/sunglasses-57185ae95254443c937b69de5c22af97). Changes: converted
to plain arrays, the model's backdrop plane and light left out, scaled, placed on her face and the
temples opened and lengthened to her head.

### The fit (`tools/character/fit-glasses.mjs`)

Her landmarks are taken from her rest skin (her master frame: +y up, -z her front):
- the **bridge of her nose** (nasion): on her midline profile (the most forward point of her face
  at each height), the deepest point between the tip of her nose and her brow - y 1.515 m;
- her **eyes**: 4 mm below it;
- her **ears**: her skin standing out past her cranium (|x| > 8.2 cm); the top of each ear and the
  front of its top;
- her **head's half-width** where a temple passes: her cranium's, not her ear's.

The frame is scaled by 0.0208 (the lens span to her face), turned into her axes, tilted 8°
(the lower rims towards her cheeks, as glasses sit), its lens centre at her eyes 6 mm before the
bridge of her nose. Each temple is opened at its hinge and lengthened (x1.48 and x1.52) so that its
end rests on her head where her ear joins it - 2.5 mm off her head, 3 mm above the ear's top - and
its curved tip is carried rigidly from the bar's end, so it keeps its shape and hooks down behind
her ear. The nearest any part comes to her skin is 2.4 mm (the metal, at the bridge).

### Worn and drawn

Rigid: the fitted positions are offsets from her rest Head joint, carried each frame by her head's
position and rotation, the way her hair's roots are. Drawn after her hair in the scene's four
lights:
- the **frame**, rose-gold metal: its colour as its reflectance, the sky reflected off it;
- the **lenses**, red-tinted glass, seen through (at least 78% covering, more at grazing angles,
  where the sky reflects off them);
- the **nose pads and temple tips**, clear plastic.

Opaque parts first, then the see-through ones without writing depth.

## Her shoes

"Vans shoe" by JW (CrossFireJW) (Sketchfab, CC-BY-4.0:
https://sketchfab.com/3d-models/vans-shoe-1585e5837d034631a748d1a86a846782) - an Old Skool, black
canvas and suede with the grey side stripe, white laces, a gum waffle tread. Changes: converted to
plain arrays and its textures re-encoded as JPEG (`extract_glb.py --jpeg 90`); scaled to her foot,
mirrored for her left foot and put on her rest feet; the model's two lace ends replaced by a bow
tied in the game; the vamp over the flex cut finer for its canvas to crease on.

### The fit (`tools/character/fit-shoes.mjs`)

The model is a right shoe (its arch's waist and the forward end of its ball on its +x side); her
left shoe is it mirrored. Her feet are mirror images (to 0.3 mm), so the fit is made on her left
and mirrored. Her foot, from her rest skin: 21.8 cm from the back of her heel to the tip of her
longest toe.

- **One size for the pair**, as a shoe size is: the model scaled by 0.065 - 25.2 cm long.
- **The sole under her**: 12 mm of outsole and insole between her sole and the tread (declared:
  the model's inside is only modelled at the heel, and its toe box is lower than her forefoot -
  with the model's own heel insole, 2.2 cm up, her toes would stand 1.1 cm through the toe box).
- **Placed**: the model's inside measured as voxels (its solid, and the heel cup it is modelled
  with: open at the collar, enclosed on its other five sides), the shoe turned about the vertical
  and moved along and across her foot to the fewest, shallowest places where her skin would come
  through it, her heel in the cup (pressing its padding no more than 2.5 mm) and at least 8 mm before
  her toes. Found: turned 1.5° out with her foot's line, **16.6 mm of toe room**.
- **Her skin through the shoe**: up to 5.5 mm, at the sides of her forefoot (it is a little wider
  than the shoe's inside there - its canvas would give). The shoe is drawn as it is made; her skin
  the shoes cover is left out of her body's draw: her toes (whatever they do, they are in the toe
  box), and each triangle whose corners all have the shoe within 25 mm outside them (the toe room)
  or within 6 mm inside.

### The flex: the sole bends with her toes

Each shoe is carried by her Foot joint. Her toes' angle each frame is their joint's (ToeBase)
rotation relative to her foot, about the joint's own axis; the shoe's forefoot turns by it about a
line along that axis through the sole under the joint - 4 mm above the tread, in the outsole
(declared) - the turn spread over 5 cm along her foot (smoothstep; declared). The rubber sole bends
there as a beam does: the tread stretches, the upper shortens.

### The vamp's canvas creases

Over the flex - from 3 cm behind the flex line to 2.5 cm in front of it, more than 2 cm above her
sole - the upper's triangles are cut 3 x 3 into a patch of 841 points (welded across the model's UV
seams: the canvas is one sheet), pinned where it meets the rest of the shoe. Whenever her toes move
(by more than 0.23°) the sheet is solved (12 projections, warm from its last shape):

- it keeps its length in tension, and gives in compression (4% of a projection - canvas resists
  being shortened only a little before it buckles);
- it resists bending (18%, across each pair of triangles);
- it cannot go inside the shoe's bent shape (her foot is under it), nor stand off it more than
  1.2 cm.

Where the bend shortens the vamp it buckles outwards: at her toes 35°, two creases across the vamp
behind the toe cap.

### Her bow

Two loops and two tails of flat lace, 8.2 mm wide (the model's own laces) and 1.5 mm thick
(declared), tied over the top crossing: the tails as long as the model's own lace ends (5.8 and 6.6
cm), each loop 9.5 cm of lace (declared). Each is a chain of points every 6 mm:

- inextensible; resisting bending away from the bow's tied shape (each point and the one after
  next, 22% of a projection); held in that shape at the knot, the hold fading along the lace over
  1.2 cm (as a knot holds a bow);
- under gravity less the bike's acceleration (filtered over 40 ms, as her clothes' and hair's) and
  the still air seen from the bike, sheltered by the fairing (her clothes' `windFairing`, 0.2), with
  flutter; a flat lace's drag, a = 3.5 |w| w (declared);
- kept outside the shoe (its shape as a distance field in the model's frame: 2.6 mm cells, 0.5 mm
  steps, the heel cup counted as inside), off the ground and off her ankle (a 3 cm capsule up her
  leg from her ankle joint);
- 180 steps a second, 6 projections each. Paused, the bow stays as it lies on the shoe; if her foot
  is put somewhere else at once (on or off the bike, a reset), it is tied again and hung.

A flat lace bends across its thickness more easily than across its width: where a lace curves,
its width leans half way towards the curve's binormal (a loop stands up as a ring of ribbon);
where it runs straight, the width is carried along from the knot. Drawn as a flat tube, smooth
(three points per simulated segment, a Catmull-Rom spline), with a small knot.

### Drawn

The model's own textures: base colour (sRGB), roughness and metal (the glTF metallic-roughness
map: G and B), the normal map in each vertex's tangent frame (the model's tangents, turned with
the bend; mirrored for the left shoe), in the scene's four lights, the laces in the colour of the
texture under the model's laces.

### In her body (`46_rider_biomech.js`, `48_rider_onfoot.js`)

What her shoes do to her mechanics comes from the fit (`lucid_vans_v1_contact.json`, written by
`fit-shoes.mjs` with the shoes; inlined into her body's layer). `?shoes=0`: barefoot, body and draw.

- **Her pads on the tread.** Her sole's pads stay where her bones bear (heel, the two balls, the
  outer border, the toes - chosen on her bare sole as before), each standing on the shoe's tread
  below it, 14-18 mm down: her heel's, her balls' and her arch's outer pads then bottom out within
  1 mm of each other (the sole is under her arch: that pad bears with the rest), her toes' about
  3 mm higher (the toe spring). Her pads' soft tissue is as before (the sole is far stiffer than it; in
  series it changes little - declared).
- **Her toes turn with the shoe's forefoot**, about its flex line in the sole (26 mm below her toe
  joint), against her toes' own tissue and hold and the rubber's bending stiffness there:
  E w t^3 / (12 L) = 0.35 N m/rad (a plate: E 5 MPa, the outsole 8 mm thick - both declared - the
  tread 8.1 cm wide at the flex line, the flex zone 5 cm). Where her toe pads are, and the moment
  the ground's push on them makes about the toe joint, follow from that line.
- **The shoes' mass on her feet**: 0.21 kg each, from their materials (each region's area on the
  model x a declared thickness and density: the rubber outsole 8 mm and foxing 2 mm at 1150 kg/m3,
  the canvas and suede upper 1.5 mm at 650, the lining and insole 3 mm at 200; the laces 1.5 g/m),
  at the shoe's centre with its inertia as a shell, combined with her foot's. She weighs 75.42 kg.
- **Standing in them she is 14.6 mm taller** (her body's: her soles' lowest point to the tread's
  lowest below them; the draw's fit, to the shoe's lowest point, 14.2). Her standing heights are
  over her soles: her pelvis standing and walking, and the standing poses of her motions at the
  bike - beside it, the leg-overs (she stands on her left foot through them), lifting it - are
  that much higher over the ground; seated, her pelvis is on the bike's seat.
- **A swung foot is held as heavy as it is**: the swung ankle's tone in the leg-overs is scaled by
  her foot's moment of inertia about the ankle in the shoe over barefoot - 1.31 (left), 1.32
  (right) - so she holds the heavier foot as she holds her own, its swing as quick.

Measured (Node, the rider suites with her body in her shoes: `LUCID_SHOES=1`): 60 of 64 pass. Of
the four that fail, three fail barefoot too (the floating trunk, creeping at 0.3 m/s, getting off
stopped); getting on with the bike free to roll, which fails barefoot, passes in her shoes. The
fourth, her look through a steady 0.8 g turn, is measured as her neck's axial turns (on, less off):
4.0 deg in her shoes, 22.6 barefoot - but where her head points on the bike, her look turns it
12.9 deg further into the turn in her shoes, 6.3 barefoot: both her feet on their pegs (barefoot her
outside foot is off its peg in the turn), her chest square to the bike, her head tilted to the
horizon - the neck's axial turns no longer measure her look there. Left failing, as found. The
suites run barefoot by default (`npm test`: unchanged by her shoes).

### Cost (Node, per shoe)

0.4 ms carried as they are, 1.7 ms with the bow simulated, 3.3 ms when her toes move (the vamp
solved each frame); the bow's drawn laces 0.6 ms more.

## Checked (`tests/rider_accessories.test.mjs`)

Sunglasses:
- the attribution is carried (author, licence, source);
- the parts are the metal, the lenses and the plastic, and their indices are in range;
- every part is more than 1 mm off her skin;
- each temple's end is within 1 cm of the top and front of her ear.

Shoes:
- the attribution; the toe room 8-25 mm; the shoe 2-5 cm longer than her foot; her skin no more
  than 6 mm through it; the right shoe the left mirrored; the tread the sole's stack below her sole;
  her skin left out only below her ankles, her toes included;
- at rest the shoe is as fitted; her toes at 35°: behind the flex nothing moves, in front of it a
  rotation about the flex line, the vamp creased and nowhere inside the bent shape;
- the bow after hanging 2 s, each shoe: inextensible to 1.5 mm, both loops open more than 1 cm,
  both tails below the knot, every point off the ground and outside the shoe.

## Open

- The glasses do not move on her face (no slip with her head's acceleration) and nothing pushes
  them: the hair does not collide with the temples.
- The lens tint and the reflections are declared, not measured against the model's own material.
- In her body, her sole's grip on the road is still the prior it had (`mu.sole` 0.8), not a
  rubber outsole's measured; her pads' stiffness is her soft tissue's alone.
- The sole's bending stiffness (0.35 N m/rad = 0.006 N m/deg) is the rubber outsole alone as a plate:
  a lower bound. Shoes measured whole bend far stiffer - American football cleats 0.10-0.35 N m/deg
  dynamically over 30-90° and 0.27-0.8 linearized; carbon-plated running shoes 0.31-0.48 N m/deg
  (their upper, insole board and plates included) - and no measurement of a vulcanised canvas shoe
  was found. Not changed until one is.
- Her look through a turn in her shoes: the test's measure (her neck's axial turns) fails - see
  "In her body" above.
- The laces do not collide with each other, the other shoe or the bike; her jeans' hems do not
  collide with the shoes.
- Her toes turn about her toe joint, the shoe's forefoot about the line in the sole below it: in a
  shoe her foot would slide (her heel lifting in the cup). Her skin inside is not drawn.

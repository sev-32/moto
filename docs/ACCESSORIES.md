# Her accessories

What she wears besides her clothes and her hair: her sunglasses. Each one is a model someone made
and published, used under its licence with its attribution kept in the asset, and fitted to her
body by a tool here rather than by hand. Everything here is **CANDIDATE**.

## Where things are

| What | Where |
| --- | --- |
| Reading a GLB (its meshes, materials, textures) as plain JSON | `python3 -I tools/character/extract_glb.py <model.glb> <raw.json> [--skip NODE ...]` |
| Her sunglasses, fitted | `assets/character/accessories/lucid_sunglasses_v1.json` (`tools/character/fit-glasses.mjs`) |
| The game layer | `src/core/47_rider_glasses.js` (`LUCID_CORE.glasses`), drawn after her hair |

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

## Checked (`tests/rider_accessories.test.mjs`)

- the attribution is carried (author, licence, source);
- the parts are the metal, the lenses and the plastic, and their indices are in range;
- every part is more than 1 mm off her skin;
- each temple's end is within 1 cm of the top and front of her ear.

## Open

- The glasses do not move on her face (no slip with her head's acceleration) and nothing pushes
  them: the hair does not collide with the temples.
- The lens tint and the reflections are declared, not measured against the model's own material.

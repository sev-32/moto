# LUCID MOTO — Ducati 916 hyper-real motorcycle simulation

Consolidated source tree for the Ducati 916 / LUCID MOTO single-file studio builds.

* `src/legacy/` — the V5.6.7 + V1.31.0 *Artist-in-the-Loop Studio* decomposed into its 39 original
  scripts. Unmodified; `npm run build:legacy` regenerates the uploaded HTML byte-for-byte.
* `src/core/` — new consolidated layers (installed on top of the legacy runtime, see `layers.json`).
* `assets/` — shared assets extracted from the builds (Ducati 916 GLB, tire profile assets).
* `reference/` — every earlier uploaded build (V5.0 → V5.6.7 vehicle labs, V6.3.5 → V8.3 tire labs),
  regenerable byte-for-byte with `npm run build:reference`.
* `tools/` — extraction / build tooling (Node ≥ 20, no dependencies).

```
npm run build            # dist/LucidMoto_<version>.html  (legacy runtime + core layers)
npm run build:legacy     # dist/legacy/…  byte-identical to the uploaded studio (sha256 verified)
npm run build:reference  # dist/reference/… every historical build (sha256 verified)
```

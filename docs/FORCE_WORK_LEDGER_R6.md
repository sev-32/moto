# LUCID MOTO — R6 generalized-force provenance and work audit

**Date:** 2026-10-20. **Branch:** `experiment-20261020-force-work-ledger-r6` (parent R5). **Canonical folder:** `/mnt/data/LUCID_MOTO_PROJECT`.

## Change scope

**Instrumentation only.** The existing 9-DOF solver equations, mass matrix, forces, collision pipeline, event timing, visual renderer, NIMBUS smoke, physical rider, clothing, bike geometry and reference model were not recalibrated or replaced. R6 adds `probeWork: true` to the maneuver runner; it enables an opt-in 23-category ledger for `Q` assembled by the existing chassis solver. Each category measures the incremental difference to the nine-component generalized force vector immediately after an original assembly operation, so nothing is re-evaluated or separately approximated. Three broad internal groups are split by source: gravity, wheel/tire/contact and aligners, suspension, assists, rotor, gyro, and each registered chassis wrench. The two distinct `riderWrench` functions are qualified by registration index 6 (legacy rider body) and 7 (articulated biomechanical rider); merging them is demonstrably incorrect provenance even when the first contributes zero.

The ledger's generalized velocity is **world translational velocity, body angular velocity, steering, fork and rear-swingarm rates**, in exactly the coordinate convention used by the assembled mass matrix and force vector. We record per-step `qdot · Q_component` power and signed work `qdot · Q_component * dt`, plus source-specific positive/negative integrals and per-step peak. This is a **generalized work ledger**, not complete system energy: it does not include direct wheel-spin power, engine/chain fuel work, rider internal/body energy, spring potentials, altitude, thermal/viscous dissipation, or collision contact impulses after the generalized force solve. The solver bias `C` is separately reported and not misclassified as an external force. Taking a sum of this ledger alone and comparing with body kinetic energy would be invalid.

## Executed real browser experiments

Rebuilt original HTML booted in native Chromium 144/ANGLE SwiftShader with WebGL2 context intact, `gl.getError() = 0`. Four cases were evaluated through the actual 540Hz maneuver integrator and 20Hz sampled display trace:

| Case | Solver samples | Integrated signed generalized work | Max force reconstruction norm | Max power reconstruction error |
|---|---:|---:|---:|---:|
| Panic brake, original guard | 437 | −34,646.070 J | 1.61e−13 | 1.31e−10 W |
| 16-bar firm brake | 2,431 | −65,969.805 J | 6.36e−14 | 3.64e−11 W |
| 35° controlled corner | 3,781 | −1,687.298 J | 5.73e−14 | 4.50e−12 W |
| Panic brake, bounded 2.5 s extension | 1,351 | −42,011.427 J | 1.61e−13 | 1.31e−10 W |

Selected work contributions (J), **generalized work on chassis coordinates, not dissipated friction heat**:

| Component | Firm brake | Panic early | 35° corner |
|---|---:|---:|---:|
| Front tire force | −82,784.8 | −38,112.9 | −2,677.3 |
| Rear tire force | −2,410.4 | −2,125.2 | +17,079.2 |
| Aerodynamic wrench | −4,243.1 | −2,344.0 | −17,110.1 |
| Biomechanical rider reaction (wrench 7) | +23,581.6 | +9,301.4 | +798.1 |
| Legacy rider servo wrench (wrench 6) | 0 | 0 | 0 |

The biomechanical rider reaction term acts on the *bike*, not on an isolated rider. A positive signed work term from the bike's perspective is not perpetual energy production. Next verify the equal/opposite work and constraint/contact reaction with the articulated rider body's energy and motion; a strong nonzero term may be real transfer or hidden modeling asymmetry.

**Outcome parity:** 16-bar firm stop at **4.05 s**, 35° corner **34.716° max roll**, panic early termination **near_vertical_pitch_attitude**, first fairing ground collision in bounded 2.5s continuation **2.007 s**. A 15Hz pilot incorrectly appeared to shift `stopT` to 4.067s; this was the timestamp of the first telemetry sample below the stopping threshold, not a physics change. Restored 20Hz acceptance sampling and retested.

## Tests and evidence

- Native fresh R6 WebGL2 screenshot: `evidence/R6/R6_native_active_motorcycle.png`; real source, dressed rider, Ducati, highway scene, approximately 71 km/h, WebGL error 0, context intact. **No shader/geometry modifications** and no inferred physical-GPU FPS.
- Actual CDP suite: `evidence/R6/R6_work_browser_results.json`, `run_r6.py`, `run_r6.log`: four scenarios **passed**, no page errors, no retained work probe after uninstrumented run. Target scripts are archival, not changes to physics.
- Independently checked saved output from Python: `tools/verify_r6_work.py` (executed, 4/4 cases); confirms unique category identities, vector/power closure, signed work sums, first event provenance, and unchanged outcome bands. JSON receipt `evidence/R6/R6_independent_work_audit.json`.
- `node --check` both source files: pass. `npm run build`: pass, 26 ordered layers. `node --test tests/exhaust_audio_patch.test.mjs tests/lucid_character.test.mjs tests/rtt_tire.test.mjs`: **29/29 pass**.
- Standalone `tests/browser/work-ledger-r6.mjs`: added and syntax-checked; **not executed through Node Playwright** in this environment (uninstalled); equivalent Chromium/CDP scenario executed. Full `npm test`, dt convergence, audio on iPhone, physical GPU FPS and physical telemetry **not verified** here.
- Original R5 pre-edit source files backed up to `checkpoints/R5` and previous project checkpoints unchanged. Baseline WebGL capture in `evidence/R6/R6_original_R5_baseline.png` was taken before source changes, but shows a late ride with scene geometry overlapping the bike; retained as evidence, not visual acceptance. Fresh correct R6 active-ride shot taken after changes.

## Next experiment (proposed)

1. Construct a **two-sided** bike/rider interface ledger, accounting for biomechanical rider reactions and equal/opposite forces in the articulated-body solver at identical timestamps. Audit apparent +23.6kJ biomechanical rider term during firm braking, with full rider kinetic, potential, joint actuator and contact work; do not clamp it or change physics to make the sign convenient.
2. Build explicit wheel-spin kinetic energy and brake/friction heat terms and track gravitational/aero work. Compare tracked energy transfers across the 540Hz run before any claim of global conservation.
3. Separate road collision impulses from the 9-DOF joint-limit impulses and check impact energy loss vs contact normal and penetration, including body/helmet/rider surfaces.
4. Perform dt halving and phase-resolved normal/contact stiffness sensitivity once the full energy measurement is available.

Preserve all past source, evidence, renders, logs and ZIPs in the canonical project directory and GitHub branch before further edits.

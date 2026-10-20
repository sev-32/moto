# LUCID MOTO R7 — Two-sided rider/bike interface energy experiment

Date: 2026-10-20. Parent: R6 `experiment-20261020-force-work-ledger-r6`. Work branch: `experiment-20261020-rider-interface-energy-r7`. Scope: diagnostic-only; original V1.31 assets/geometry, 9-DOF chassis integrator, tire/road forces, ABA rider forces, collision pipeline, shaders and native rendering preserved.

## Question and resolution

R6 showed the articulated rider's reaction on the Ducati chassis accumulating **+23,581.58 J of generalized work** during a 4.05s, 16-bar brake maneuver. Could this indicate fictitious energy production or duplicate rider forces? R7 independently calculates work from the motorcycle and rider sides of every seat/tank/fairing, footpeg, grip force and hand torque contact at their actual world-space velocities. It also samples the rider's articulated kinetic energy, gravitational potential, joint-drive work and ground contact work.

**Finding: in the simulator the rider loses approximately 23.6 kJ of mechanical energy as she slows from ~25 m/s to a stop, while providing approximately 23.58 kJ to the motorcycle.** The same independent bike contact-point calculation matches the R6 biomechanical-wrench generalized work to approximately 1e-13 J. This establishes an internally coherent energy-transfer explanation for the sign; it does not validate physiological fidelity, energy conservation of the entire simulator, or the realism of crash loads.

| Variable (integrated over scenario) | Firm braking | 35° corner | Panic grab to attitude guard |
|---|---:|---:|---:|
| Rider mass (kg) | 75.424 | 75.424 | 75.424 |
| Bike work by rider contacts (J) | +23,581.340 | +797.946 | +9,301.162 |
| Rider work from same contacts (J) | −23,674.017 | −784.790 | −9,436.287 |
| Pair relative contact work (J) | −92.677 | +13.156 | −135.124 |
| Rider kinetic-energy change (J) | −23,565.067 | −666.746 | −9,594.483 |
| Rider gravitational potential change (J) | −30.909 | −117.546 | +302.841 |
| Internal joint-drive signed work (J) | +43.477 | −4.617 | −71.657 |
| Ground contact work on rider (J) | 0 | 0 | 0 |
| Rider mechanical-energy residual (J) | +34.564 | +5.115 | +216.301 |
| Rider interface sample steps | 2,430 | 3,780 | 436 |
| Uninstrumented first-step omissions | 1 | 1 | 1 |

The rider's initial kinetic energy in the firm brake is **23,565.923 J**; final kinetic energy is **0.856 J**. The small +34.6 J remainder is approximately 0.15% of the rider's energy change, and the +216 J panic case remainder is about 2.3%. The residual includes numerical time stepping, unmodeled contact compliance potential, joint limits, soft-tissue damping and other work approximations; do not call it a proven energy error without discriminating experiments. A **positive** pair contact-work value in the corner is compatible with temporary elastic storage/release and must not be categorized as negative heat.

## Engineering implementation

- `src/core/46_rider_biomech.js`: under `R.__interfaceProbe` only, attach link IDs and rider-side contact points to already-created reaction records. Contact reactions and forces are **not recomputed or modified**. Compute the bike-side contact-point velocity (including steer-bar angular velocity), the rider-link point velocity, and the rider's link angular velocity for hand torque couples. Explicitly distinguish force contacts against frame, footpegs and each grip from rotational grip torque. Snapshot articulated kinetic energy with `R.totals()` before rider integration, and after the existing ABA+integrate; potential uses `mass * 9.81 * COM_z`. Joint work uses `sum(tau_i * qd_i) * dt` with the existing articulated joint torques. Ground forces are separate external work, not rider↔bike contact pairs.
- `src/core/90_maneuvers.js`: new optional `probeInterface` flag and compact integrated event totals, six contact categories, kinetic/potential deltas, residual, and discrepancy against the independent R6 `wrench_7_riderWrench` power. Like R6 `probeWork`, the flag is cleared even if a physics step throws. The first settling simulation step has no rider-integrate energy pair and is explicitly counted as one missing observation; all following normal-step samples are complete.
- The previous physical rider and motorbike solver algorithms and render pipeline remain unchanged. With the new mode off, no interface probe object remains attached after a subsequent normal maneuver.

## Verification receipts

- Original R6 source rebuilt and native Chromium/WebGL2 baseline captured **before any R7 edits**: `evidence/R7/R7_unmodified_R6_baseline.png` and `.json`, SHA256 of baseline HTML `9dd44345622c3945206e42e7285b526ab5cd53d9043132ace39cea33ee759efe`.
- R7 26-layer HTML compiled and captured using isolated Chromium/ANGLE SwiftShader: `evidence/R7/R7_native_active_motorcycle.png` and `.json`, actual native side-view of clothed rider on original Ducati ~71 km/h; `gl.getError()=0`, no lost context. R7 compiled HTML SHA256 `0e9ad5ecda244592c8f2fa2430cc73649cf5e59adde7381d1fb90dac6e103036`.
- Three actual Chromium/CDP runs, raw results in `evidence/R7/R7_interface_browser_results.json`. Original outcomes unchanged: firm stop 4.05 s, 35° corner 34.716° max roll, panic grab `near_vertical_pitch_attitude`. A clean, unprobed `lean35` followed and retained neither the new probe nor its flag.
- Independent Python verification of saved telemetry: `project/tools/verify_r7_interface.py`, three passed checks; receipt `evidence/R7/R7_independent_interface_audit.json`. Checks contact-source summations, left/right/torque separation, pair work balance, kinetic+potential closure and original maneuver gates.
- Node unit tests: 29 selected tire/character/audio passed; 17 independent rider biomechanics/multibody tests passed. **46 total passing selected tests, zero failures**. The full suite and Node Playwright browser test are NOT claimed run; browser equivalence was measured through CDP.

## Open technical work / R8

1. Determine the source of the panic-braking +216 J rider budget remainder by halving rider and chassis time steps or comparing pre/post force work quadratures (without changing production physics); include soft-contact elastic potential and velocity projection consistently.
2. Separate rider muscle mechanical work from servo/tendon/passive joint work; the present `tau·qd` is a total joint-work proxy, not measured metabolic expenditure.
3. Extend the ledger to wheel-spin kinetic energy, tire frictional heat, brake hydraulic work, aerodynamic drag and fuel-to-drivetrain energy with coherent frames and timestamps. Then examine global energy differences and true impact impulses.
4. Preserve UI, shaders, source visual fidelity and historical baselines. Every visual change must be shown as a **fresh native** WebGL2 render before approval.

## Reproduction

```bash
npm run build
node --check src/core/46_rider_biomech.js
node --check src/core/90_maneuvers.js
node --test tests/exhaust_audio_patch.test.mjs tests/lucid_character.test.mjs tests/rtt_tire.test.mjs tests/rider_biomech.test.mjs tests/rider_multibody.test.mjs
python ../project/tools/verify_r7_interface.py
node tests/browser/rider-interface-r7.mjs # Requires Node Playwright; not run in this sandbox
```

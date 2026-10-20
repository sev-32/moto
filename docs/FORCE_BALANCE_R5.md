# LUCID MOTO R5 — Full nine-coordinate equation and joint-limit impulse audit

Date: 2026-10-20. Parent checkpoint: R4 `experiment-20261020-pitch-balance-r4`.
This is an **observability experiment**, not a new vehicle dynamics algorithm or a claim of physically validated crash behavior.

## Source and instrumentation

- `src/core/30_chassis_dynamics.js`: opt-in `F.__motoBalanceProbe`, enabled only while a scripted maneuver explicitly requests `probeBalance: true`. Retains the *exact* 9×9 mass matrix, right-hand side and generalized acceleration used by the current coupled solver; evaluates `r = M a - (Q-C)`; computes its relative Euclidean residual; and partitions pitch equation into `M[3][3]*a[3]` and the other eight coupled terms.
- Before the pre-existing generalized joint-limit impulse solver, captures the nine-coordinate velocity. Afterwards computes `M*(uAfter-uBefore)-Σ e[k]*lambda`, checks residual norms and records quadratic kinetic delta across that velocity-only impulse map. This quadratic is **not** a full-world energy-conservation measure, and the impulse residual is **not** the later bodywork collision impulse.
- `src/core/90_maneuvers.js`: opt-in metrics, phase snapshots (front lock, rear lift, vertical pitch, first bike proxy contact) and low-rate trace fields. When not requested, `balance` is null and `coupled.balanceProbe` is absent. The original numerical branch, forces, accelerations and contact integration remain unchanged.
- `tests/browser/nine-dof-balance-r5.mjs`: reproducible browser regression. Syntax checked; Node/Playwright runner was not executed in this environment (Playwright not installed). Equivalent real Chromium/CDP maneuvers were executed and their raw numeric receipts retained in `evidence/R5`.

## Actual measured results, Chromium/ANGLE SwiftShader

| Observable | 40-bar panic brake (0–0.807 s) | Firm braking (normal stop) | 40-bar extended overturn (0–2.5 s) |
|---|---:|---:|---:|
| Coupled solver samples | 437 | 2431 | 1351 |
| Peak relative equation residual | 5.252×10⁻¹⁶ | 5.713×10⁻¹⁶ | 5.855×10⁻¹⁶ |
| Peak absolute equation residual | 1.897×10⁻¹² | 3.775×10⁻¹³ | 2.528×10⁻¹¹ |
| Peak absolute pitch cross coupling (N·m) | 958.25 | 425.87 | 43824.19 |
| Peak absolute pitch diagonal inertia term (N·m) | 2759.56 | 1403.81 | 40736.50 |
| Joint-impulse frames | 0 | 0 | 814 |
| Peak relative joint-impulse residual | 0 | 0 | 6.096×10⁻¹³ |
| Max absolute generalized quadratic kinetic delta per joint-impulse step (J) | 0 | 0 | 39.69 |

**Phase-resolved pitch equation** `M[3,:]a + C[3] = Q[3]`, in simulator-generalized frame:

| Event | Time (s) | Diagonal (N·m) | Off-diagonal (N·m) | Bias (N·m) | Generalized force (N·m) |
|---|---:|---:|---:|---:|---:|
| First front lock | 0.3481 | −490.1 | −61.3 | +20.5 | −530.9 |
| First rear lift >20 mm | 0.4056 | +31.0 | −276.4 | +17.3 | −228.1 |
| Nose pitch exceeds 75° | 0.7741 | +707.2 | +328.5 | −232.6 | +803.1 |
| First fairing ground proxy contact | 2.0093* | −1083.3 | −707.5 | +52.0 | −1738.8 |

*The sampled solver snapshot occurs after the first discrete collision event; the collision event itself was detected at 2.007 s. A rendered body's collision can be handled in separate integration stages and cannot be equated with generalized joint-limit impulses.*

The rear-lift snapshot is a clear warning against a diagonal pitch approximation: here the off-diagonal acceleration contribution dominates the diagonal term and has opposite sign.

## Regression and visual gate

`brakeFirm` stops in **4.05 s**, `brakeGrab` retains original **0.807 s** near-vertical attitude termination, extended crash retains **2.007 s** first `fairing_left` contact and **no true ground stop** by 2.5 s. Uninstrumented `lean35` reproduces **34.716°**, **−15.125°/s** and **136.3 m** with no retained probe object. Selected tire/character/audio tests: **29/29 passed**.

The broad `npm test` run was started; **51 passing cases were observed**, then the run exceeded the allowed time. It is an incomplete run, not 51/51 or a full-suite pass.

A new native Chromium WebGL2 chase-view screenshot was captured from the rebuilt original Ducati and dressed physical rider, with actual advancing ride loop at 70.7 km/h, WebGL error 0 and intact context. Source/telemetry: `evidence/R5/R5_native_active_motorcycle.{png,json}`.

## Scientific limitations and open work

Very small linear-solve residuals establish only **internal algebraic correctness of the assembled generalized equations**. They cannot validate the physical tire loads, contact geometry, gyroscopic modeling, rider COM, body/rotor inertia, aero, material response, gravity frame, collision impulse consistency, or energy/angular-momentum conservation. The calculation is post-assembly, not an independent derivation. The 43.8 kN·m cross-coupling peak is from the **whole extended overturn including impact and constraint impulses**, not from 40-bar braking alone. The quadratic energy reported during a joint-limit projection is not the global mechanical energy of the motorcycle and is not itself a physical dissipation law.

Next steps: audit individual force/wrench contributors before assembly, explicit frame transforms, kinetic/potential/tire dissipation and external work over time; run dt halving in a controlled reference configuration; separately measure road-contact collision impulses and their kinetic energy changes. The rider's ground impact is not established from bike proxy contacts. Do not alter the integrator or add artificial crash behavior until those tests discriminate a genuine defect.

## Verification commands

```bash
npm run build
node --check src/core/30_chassis_dynamics.js
node --check src/core/90_maneuvers.js
node --check tests/browser/nine-dof-balance-r5.mjs
node --test tests/exhaust_audio_patch.test.mjs tests/lucid_character.test.mjs tests/rtt_tire.test.mjs
node tests/browser/nine-dof-balance-r5.mjs  # requires Node Playwright + Chromium; not run in this sandbox
```

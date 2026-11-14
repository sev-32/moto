# LUCID MOTO R2 — panic braking, wheel lock and contact provenance

Date: 2026-10-20. This work extends the preserved R1 posture state-cleanup branch, **without modifying tire forces, chassis dynamics, collision impulses, the original attitude stop condition, rider visuals or the original studio**.

## Independently verified
The untouched R1 HTML (SHA256 `dcac03d2bf2134293da28281a938be35493bf805b127c0cde46258578bb3f6ec`) booted and rendered the original motorcycle and rider in isolated Chromium/Xvfb/ANGLE SwiftShader/WebGL2. R2 rebuilt (SHA256 `16f4d37c88598fdbac8f1624539f1512842a019542aaab06db3ee075f57cc42a`) booted with GL error 0, context intact, and drew the clothed, seated original rider in a live side-camera ride with time advanced beyond 0.67s. One earlier screenshot showing an upright untextured rider is invalid as a visual regression: that test forgot to resume the simulation after a synchronous maneuver reset. The active-ride capture corrected that setup.

## The physics signal (original reference solver)
An upright bike at 25 m/s with 40-bar no-ABS front brake does NOT intrinsically entail a low-side. Its measured sequence is front-wheel lock, rear lift, then violent forward rotation:

| Time (s) | Front slip kappa | Pitch (deg) | Rear lift (mm) | Front normal N |
|---:|---:|---:|---:|---:|
| 0.30 | -0.001 | +0.50 | 0 | 1465 |
| 0.35 | -0.975 | -1.56 | 5 | 2437 |
| 0.40 | -1.000 | -4.33 | 20 | 2989 |
| 0.50 | -0.617 | -9.47 | 93 | 6402 |
| 0.65 | -0.076 | -29.40 | 557 | 5285 |
| 0.75 | -1.000 | -65.62 | 1233 | 0 |
| 0.80 | -1.000 | -87.15 | 1531 | 0 |

At 0.50s the front longitudinal force was approximately -7133 N, ratio to front normal load 1.114. Across the trajectory, maximum loaded front resultant force ratio 1.344. Those are simulation outputs, not independent physical calibration.

**Important source flaw in interpretation, not necessarily in physics:** the prior `crashT=0.807s` is triggered by the Euler roll threshold `abs(v5bodyAngles(q).rollRad)>1.45` as pitch approaches the ±90° singularity. The terminating attitude was pitch **-89.273°**, Euler roll **-120.791°**. No proxy-ground body collision was registered in this run. Calling 0.807s an impact timestamp or a measured low-side is incorrect. First front lock at 0.348s; rear lift >20 mm at 0.404s. The subsequent real-world fidelity remains unverified.

## R2 changes and regression
- `src/core/90_maneuvers.js`: `frontLockT`, `rearLiftT`, `firstBodyContactT`, `firstBodyContactName`, `maxLoadedFrontForceRatio`, `terminationReason`, `terminationPitchDeg`, `terminationRollDeg`. Separates actual collision from extreme-attitude termination. Integrator and prior acceptance metrics unchanged.
- `tests/browser/maneuvers.mjs`: mechanical evidence and consistency checks for the panic-grab result replace the weak bounded-load-only assumption.
- `tests/browser/incident-classification.mjs`: executable browser regression for the observed lock-before-lift, near-vertical pitch termination without proxy impact, and unchanged non-locking firm stop. Syntax checked; Playwright test entrypoint not executed in sandbox because Node Playwright unavailable, but the equivalent actual scenario was executed using CDP.

Actual rebuilt browser scenario results: panic grab retained -87.155° sampled pitch and 0.807s stop; brakeFirm retained 0.808g and 4.05s stop; lean35 retained 34.716° max roll and -15.125°/s yaw with 136.3m traveled; stoppie retained 178mm rear lift. Targeted Node tests of tire, character and exhaust audio passed **29/29**. No full-suite claim. Native graphics still render correctly in WebGL2.

Evidence files are separately archived with the conversation: `R2_braking_diagnostics_small.json`, `R2_verified_diagnostics.json`, `R2_native_visual_telemetry.json`, `R2_baseline_native_ride.png`, `R2_native_side_active_rider.png`.

## Next engineering gate
Safely continue the overturned trajectory beyond the Euler threshold in an isolated bounded experiment; determine actual first body contact and impulse budget, and check tire force, angular momentum, rider COM and fork stops through the locked-brake phase. Then compare wet/dry/grip/speed/posture sensitivity with physical observations. **Do not patch steering or make the bike artificially stable to satisfy the old low-side expectation.** Original studio, assets and visual renderers should remain untouched pending evidence and approval.

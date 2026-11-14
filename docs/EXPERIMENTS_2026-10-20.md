# LUCID MOTO — independent experimental audit (2026-10-20)

## Scope and provenance
Authoritative input: `moto_project.zip` (315 entries, ~22 MB compressed, 40.96 MB extracted). Original V5.6.7/V1.31 studio kept in `src/legacy` untouched; current V2.0-dev adds 26 ordered simulation and rendering layers under `src/core/layers.json`. The standalone original build was assembled without source changes (SHA256 `dcac03d2bf2134293da28281a938be35493bf805b127c0cde46258578bb3f6ec`). The legacy studio and ten historical tire, vehicle and NIMBUS builds were independently regenerated and hash-verified, 11/11.

## Independent browser baseline
Original unmodified full HTML was loaded in isolated Chromium 144/Xvfb/ANGLE SwiftShader, through CDP Page.setDocumentContent on about:blank because local/localhost navigation was blocked in this sandbox. Native screenshots captured original Ducati 916 and physical rider from chase/side/front cameras, plus staged tire smoke at 2.5 and 5 seconds. WebGL2 ES3 initialized; `getError()=0`, context not lost; 12 render hooks sampled without error; finite simulated motion observed. The revised build was also captured after normal ride time resumed: original clothed rider and original Ducati model visible. SwiftShader displayed about one visual frame/s; no GPU FPS claim can be inferred.

## Simulation and coupling topology
- Vehicle: V5 coupled multibody chassis, RTT brush tires, 540Hz fixed-step loop, chain reaction, wheel and suspension travel, braking/ABS, powertrain and exhaust thermals.
- Rider: canonical skinned character, articulated ABA body/Featherstone solver, 84/88 muscle proxies and whole-body contact control, wardrobe and hair coupled to bike motion.
- World: common elevation and signed-distance fields for tire physics and rendering; rubber marking from tire slip work and skid system.
- Effects: exhaust afterfire + sound from common causal event; NIMBUS volumetric tire smoke on sim-time clock, with smoke parameters driven by tire sliding power.
- Preserved research is not equivalent to integrated features: the archived v2.3 tire registry and v2.6 pressure/shim-stack damper family remain not fully merged. Existing project audit reports ~22mm vs 32mm target rear sag and ~15cm rider COM representation disagreement.

## Maneuver measurements (real simulation runs)
The maneuver API exposed 15 scenarios. All 14 with numerical bands in `tests/browser/maneuvers.mjs` passed those *authored acceptance rules*; `rollOn` had finite output but no authored band.

| Maneuver | Observed direct metrics |
|---|---|
| coast | max roll 0.345°, max decel 0.131g |
| coastSlow | 24.067° roll over 5s |
| standstill | 3.836° roll, 0m travel |
| brakeFirm | 0.808g, stop 4.05s |
| brakeMax | 0.969g over 4s; no stop time established |
| brakeGrab | collision at 0.807s; pitch -87.155°, rear lift 1.531m |
| brakeAbs | decel peak 1.514g; stop 3.65s |
| stoppie | rear lift 178mm, pitch -11.428° |
| launch | accel peak 1.140g; max roll 12.316° |
| rollOn | accel peak 0.452g; 124.5m in 6s |
| wheelie | front lift 594mm, pitch 26.254° |
| lean35 | max roll 34.716°, yaw -15.125°/s |
| radius60 | steady roll 37.88°, yaw -19.194°/s |
| slalom | max roll 16.504° |
| burnout | total displacement 0.1m in 5s |

**Important coverage deficiency:** `brakeGrab` intends front-wheel lock and low-side. Its actual outcome is almost an end-over-end forward rotation. The current test only bounds max front normal load and thus accepts this questionable crash mode. Frame-resolved collision topology, wheel lock and slip, inertial moment and peak force/acceleration budgets must be checked before claiming measured physical fidelity. The 1.514g transient ABS decel should likewise be audited at higher sampling.

## Controlled tire grip A/B
Front/rear friction coefficients were scaled from (1.40,1.38); all coefficients were restored afterward. This is **parameter sensitivity only**, not a wet-road simulation:

| Multiplier | Firm braking | 35° corner |
|---|---|---|
| 1.00 | stop 4.05s, stable | roll 34.716°, stable |
| 0.80 | stop 4.05s, stable | roll 35.205°, stable |
| 0.65 | stop 4.05s, stable | crash at 5.5s |
| 0.55 | crash at 1.35s | crash at 3.4s |

The near-identical brake times under moderately reduced friction need force/slip budget inspection. Do not interpret these multipliers as a physical water-film model.

## NIMBUS burnout / sim clock
Manual integration over 540Hz vehicle steps, ~60Hz FX/NIMBUS steps, and original NIMBUS diagnostics. At 2.5s: ~8262rpm, opaque side area 0.320m², visible area 0.641m², plume height 0.808m. At 5s: ~8460rpm, opaque area 1.899m², visible area 2.746m², plume height 1.615m. Peak sliding power ~46.28kW. Side and chase screenshots show volumetric occlusion, but opacity near the rider becomes quite high. Smoke wind/temperature/optical-depth LOD parity not validated.

## Reproducible transition defect and minimal repair
Baseline: active burnout sets `riderBio.manual={foreAft:1,tuck:0.6}`. `maneuvers.simulate` saved this state *before* `F.reset`, which stopped burnout and cleared the pose; the maneuver later restored the saved temporary state. Subsequent 35° corner produced roll 33.444° and yaw -13.553°/s instead of clean roll 34.716° and yaw -15.125°/s. Under matched state, outputs repeated exactly.

Fix in `src/core/90_maneuvers.js`: when rig is active, call `burnoutRig.stop()` **before** snapshotting rider pose. Mirrors pre-existing live `play()` behavior; no changes to the original studio, shaders, tire physics or NIMBUS. An independent live CDP regression demonstrated burnout active, temporary pose present, automatic deactivation and posture clear, and exactly the same roll 34.716°, yaw -15.125°/s and 136.3m as clean baseline. Rebuilt native scene was also visually checked. `tests/browser/posture-transition.mjs` persists the transition scenario; syntax checked, but this Node/Playwright entry point itself was not executable in this sandbox because Node Playwright was unavailable. Equivalent CDP regression **was executed** and passed. Existing burnout rig stop() may intentionally/incidentally clear arbitrary previous manual pose overrides; that broader UX contract is still open.

Postpatch: 56 targeted Node unit tests passed, 0 failed. The original full `npm test` was not completed due high-cost rider unit tests; a subset success is not a full test-suite claim.

## Priority continuation (proposed, not implemented)
1. Trace panic brake/ABS at high-rate from full force/slip/attitude/contact geometry; classify failure by mechanism rather than scalar bounds.
2. Create a reset/transition contract matrix across rigs, riding, on-foot, paused clocks, thermal resets, assists and saved rider inputs; regression A→B→A.
3. Integrate archived tire and damper parameter families only after force and time-step calibration. Resolve documented sag/COM mismatches.
4. Couple pavement pore/water/rubber/deposit fields to tire effective adhesion, visuals and causal sound; coordinate with existing road Textures and terrain work after independently inspecting those repositories.
5. Couple smoke with weather wind fields and explore Aether-style simulation-informed LOD/emulation with preservation of plume optical depth and near-field responsiveness. No such cross-project integration verified in this upload.
6. Audit physical rider contact, skin, clothing and hair against measured reference poses; improve the comparatively simplified landscape/road material system.
7. Benchmark on a physical GPU and verify native audio and real-world telemetry against measured references. Headless SwiftShader is insufficient for those conclusions.

## Reproduction
```bash
npm run build
npm run build:legacy
npm run build:reference
node --check src/core/90_maneuvers.js
node --check tests/browser/posture-transition.mjs
node tests/browser/posture-transition.mjs # requires Node Playwright+Chromium
```

Full JSON telemetry, scenario results, snapshots, before/after screenshot checks and the longer independent report are retained in the conversation evidence artifact bundle.

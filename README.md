# LUCID MOTO — Ducati 916 hyper-real motorcycle simulation

Consolidated source tree for the Ducati 916 / LUCID MOTO builds. The V5.6.7 + V1.31.0
*Artist-in-the-Loop Studio* runs unmodified underneath; consolidated core layers add a real-time
tire model, chassis and rider physics, a proving-ground world, physically driven smoke / exhaust /
rubber marks, tire and wind audio, and test tooling.

```
npm run build            # dist/LucidMoto_V2.0.0_dev.html — open it in Chrome / Edge (WebGL2)
npm run build:legacy     # dist/legacy/…  byte-identical to the uploaded studio (sha256 verified)
npm run build:reference  # dist/reference/… the ten archived builds (sha256 verified)
npm test                 # unit tests (tire model, audio patch)
npm run test:browser     # headless smoke test of the consolidated build
npm run test:maneuvers   # 14 rider-in-the-loop maneuvers with acceptance bands
```

Node ≥ 20, no dependencies (browser tests use the Playwright + Chromium of the environment).

## Riding

FREE RIDE → START ROLLING RIDE (or STANDING START). Enable audio with the AUDIO button / M.

| Key | Action |
| --- | --- |
| W / ↑ | throttle |
| S / ↓ | front brake (max pressure in RIDE SETUP) |
| Space | rear brake |
| A D / ← → | steering torque (counter-steer to lean) |
| C / Shift | clutch lever |
| Q / E | gear down / up |
| J / L (hold) | hang off left / right |
| I (hold) | tuck behind the screen |
| K (hold) | sit up, weight back |
| U (hold) | stand on the pegs |
| O | auto rider posture on / off |
| 1-7 | cameras: chase, side, front, tail, high, cinema, helmet |
| T | feel HUD (friction circles, loads, slip, suspension, posture, inputs) |
| \` | clean ride view (hide / show the studio's developer panels) |
| P / R / H | pause / reset / help |

Gamepad (V1.24): triggers throttle / front brake, B rear brake, A clutch, bumpers gears, left
stick steering; d-pad left/right hang-off, up/down tuck / sit up.

**BURNOUT RIG** (chip bottom-left, stationary bike): chocks the front axle, holds the front brake,
revs, feeds the clutch and holds ~9000 rpm with the rear spinning — NIMBUS volumetric smoke,
rubber laid on the road, tire scream.

## What is where

* `src/legacy/` — the studio, 39 original scripts, never edited.
* `src/core/` — the consolidated layers (`layers.json`): tire, real-time loop, chassis, rider,
  world, rubber marks, particles, exhaust gas dynamics, NIMBUS smoke, tire/wind audio, feel HUD,
  maneuvers. Console access: `LUCID_CORE`.
* `assets/` — the Ducati 916 GLB and tire profile assets shared by every build.
* `reference/` — every other uploaded build (vehicle labs V5.0-V5.6.7, tire labs V6.3.5-V8.3,
  VOLUMETRICS V85.10), regenerable byte-for-byte.
* `docs/AUDIT.md` — what each build contributes, defects found, consolidation decisions, next steps.
* `docs/ARCHITECTURE.md` — build, runtime layering, extension points, sim-time rules, tools.
* `docs/PHYSICS.md` — models, parameters, calibration checks and current maneuver results.

## Useful console calls

```js
LUCID_CORE.maneuvers.simulate("stoppie")           // run a maneuver, returns metrics + trace
LUCID_CORE.burnoutRig.toggle()                     // burnout pit on / off
LUCID_CORE.rider.setPosture({ hang: 1, tuck: 1 })  // manual posture (null = auto)
LUCID_CORE.realtime.timeScale = 0.25               // slow motion (everything stays in sync)
LUCID_CORE.exhaust.snapshot()                      // EGT, flow, misfires, bangs, flames
LUCID_CORE.nimbus.diagnose()                       // smoke optical-depth summary
LUCID_CORE.chassis.suspension.friction.enabled = false  // A/B a physics term
```

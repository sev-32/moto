# Architecture

## Repository

```
src/legacy/        the V5.6.7 + V1.31.0 studio, 39 scripts, byte-exact (never edited)
src/core/          consolidated layers, installed on top of the legacy runtime (layers.json)
  world/track.json   proving-ground centreline, widths, kerbs, apron
  nimbus/            NIMBUS smoke worker (verbatim from the VOLUMETRICS build)
assets/            shared GLB + tire profile assets (stored once for every build)
reference/         every other uploaded build, regenerable byte-for-byte
tools/             build, archive, extraction, track and screenshot tooling (Node >= 20, no deps)
tests/             unit tests (node --test) and headless-Chromium browser tests
docs/              AUDIT (what was handed over and decided), PHYSICS, this file
```

## Build

`npm run build` → `dist/LucidMoto_V2.0.0_dev.html`, one self-contained file:

1. `tools/build.mjs` reassembles the studio from `src/legacy/manifest.json` + `shell.html`
   (`npm run build:legacy --verify` proves it is byte-identical to the uploaded file).
2. Core layers from `src/core/layers.json` are injected in order before `</body>`, or right after
   a given legacy script (`afterLegacyScript`, used by the boot-order guard).
3. Layer tokens: `inline` pastes a file raw (the track JSON), `inlineString` pastes it as a JSON
   string literal (the NIMBUS worker source, started from a Blob).

`npm run build:reference` regenerates the ten archived builds (verified by sha256). The archiver
(`tools/archive-reference.mjs`) replaces shared literals by tokens (GLB, tire assets, the tire
research dataset), stores V8x virtual-file-system entries decoded + gzipped, and gzips large
scripts.

## Runtime model

The legacy scripts define globals (`free`, `dyn`, `renderFree`, `DUCATI_V5_API`,
`DUCATI_ADVANCED_POWERTRAIN`, `DUCATI_SOUND_STUDIO`, `LUCID_COMPONENT_ORCHESTRATOR`, …). Core layers
publish under `window.LUCID_CORE` and extend the legacy by wrapping prototype methods of the
free-road vehicle (`FP = Object.getPrototypeOf(free)`) and a few functions, always calling the
wrapped original.

| Layer | `LUCID_CORE.` | Role |
| --- | --- | --- |
| 05 boot-order guards | – | hides two rider APIs until their boots finish (V1.30 boot race) |
| 10 rtt-tire | `tires` | real-time pneumatic brush tire (geometric contact, 3×10 brush, carcass, thermal grip ratio) |
| 20 realtime-integration | `realtime` | RTT inside the V5 free-road step, terrain road frame and collisions, fixed-step real-time loop (540 Hz), lite telemetry, settle |
| 30 chassis-dynamics | `chassis` | implicit wheel spin, reverse-spin guard, suspension end-of-travel + friction, chain force routing, aero, feet-down support, steering damper, rear-lift mitigation, chock, impulse joint limits |
| 40 rider-body | `rider` | compliant rider (pelvis/torso servos), reactions at the rider masses, posture (hang-off, fore-aft, tuck, stand), auto rider, drives the legacy rider pose |
| 50 world | `world` | proving ground: shared height / signed-distance / grip fields for physics and GPU, terrain + sky, shadows, minimap, lap timer, clean ride view |
| 55 skidmarks | `skid` | toroidal rubber-deposit map stamped from tire frictional energy, sampled by the terrain |
| 60 fx | `fx` | GPU particles (smoke, vapour, flames, heat haze with refraction, dirt), external emitters |
| 62 exhaust | `exhaust` | crank-phased exhaust gas model: pulses, misfire/limiter parcels, ignition, afterfire flames + DSP pops |
| 65 nimbus | `nimbus` | NIMBUS volumetric rear-tire smoke (worker solver + raymarcher), sim-time locked |
| 68 audio-env | `audioEnv` | tire squeal, road roar, wind, mixed into the V1.22 graph |
| 70 feel-hud | `feelHud` | friction circles, loads, slip, suspension, posture, inputs (T) |
| 90 maneuvers | `maneuvers`, `burnoutRig` | rider-in-the-loop maneuver library, burnout rig |

### Extension points

* **Render hooks** (`LUCID_CORE.renderHooks`): the world layer wraps `renderFree`; after the legacy
  frame each hook's `draw()` runs in order (`skid` → `world` → `nimbus` → `fx` → HUDs). A throwing
  hook is recorded (`h.err`) and never breaks the frame.
* **Chassis wrenches** (`chassis.wrenches`): functions `(free, Q)` adding generalized forces in the
  coupled integration (chain, rotor share, aero, feet-down, chock). `chassis.addBodyForce/Moment`
  and `free._addExternalForce` map world forces onto the nine coordinates.
* **Chassis hooks**: `massMatrix` (rider layer provides the bike-only matrix + rigid rider
  points), `postIntegrate` callbacks, `onReset` callbacks.
* **FX emitters** (`fx.emitters`): `(dt)` functions stepped with the particle system.
* **Audio**: the exhaust layer extends the V1.22 worklet module at `addModule` time (a `pop`
  message and an `extPops` switch); the audio-env layer adds nodes to the existing graph.

### Time

Everything steps on **simulation time**: the physics (fixed 1/540 s), particles, NIMBUS (the host
posts `advance` steps of 0.03 s), skid stamps, the exhaust crank phase, the rigs. Pause, slow
motion (`LUCID_CORE.realtime.timeScale`) and scripted runs therefore stay consistent. Scripted
(synchronous) capture sets `timeScale = 0`, steps `free.step()` itself and calls `fx.tick`,
`nimbus.simTick` / `nimbus.sync` and `skid.tick` (see `tests/browser/fx-shot.mjs`).

## Tests and tools

| Command | What |
| --- | --- |
| `npm test` | unit tests: RTT tire regression (16), V1.22 worklet pop patch against the real worklet source (4) |
| `npm run test:browser` | smoke: boot flags, core APIs, live loop, hooks healthy, finite state, no page errors |
| `npm run test:maneuvers` | 14 rider-in-the-loop maneuvers with acceptance bands (coast, capsize, standstill, braking, panic grab, ABS, stoppie, launch, wheelie, lean, radius, burnout, slalom) |
| `node tests/browser/fx-shot.mjs <burnout\|lockup\|overrun\|limiter> <prefix> <view> <t,...>` | deterministic effects capture with NIMBUS optical-depth and exhaust diagnostics |
| `node tests/browser/screenshot.mjs out.png [ms] [js]` | live ride screenshot |
| `node tests/browser/probe-core.mjs` | settle state, per-stage step cost, straight run |
| `node tools/crop.mjs in.png x y w h scale out.png` | zoom a screenshot region |
| `node tools/world/preview-track.mjs` | track design checks and preview |

Headless Chromium renders with SwiftShader (CPU), so the live loop runs at a few percent of real
time there; physics-only runs are ~0.6 ms per 540 Hz step. AudioWorklets do not run headless (the
studio falls back to its compatibility DSP), which is why the pop patch is verified by a unit test.

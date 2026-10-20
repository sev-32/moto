# R3 — Controlled post-overturn contact and ground-speed audit (2026-10-20)

Continuation of [R1 posture](./EXPERIMENTS_2026-10-20.md) and [R2 incident audit](./INCIDENT_AUDIT_R2.md). **Source and renderer are preserved; the normal ride/maneuver path is numerically unchanged.**

## What actually occurred
From an original-scripted 40-bar front-brake grab on the Ducati 916, starting upright at 25 m/s:

| Event | First simulator time | Evidence |
| --- | ---: | --- |
| Front tire locks | 0.348s | `kappa <= -0.9` at NF > 100N |
| Rear wheel clears 20mm | 0.404s | Rear hub clearance above tire contact |
| Legacy attitude termination | 0.807s | Pitch −89.273°, Euler roll −120.791° |
| **Heading velocity reverses** | 0.850s | Bike inverted; signed body-forward speed −16.56 m/s, world ground speed +16.5 m/s |
| **First motorcycle collision proxy contacts ground** | **2.007s** | `fairing_left` |
| 2.5s diagnostic window ends | 2.500s | Still moving >10m/s; 43.8m distance from start |

The original `crashT=0.807` is *not* impact. Likewise `stopT=0.85` in the extended run is *not* a real vehicle stop. The old stop function measures a signed projection of velocity onto the bike's forward axis, which changes sign as the motorcycle rotates. The new `groundStopT` checks the ground-plane world velocity norm and is **null** throughout the 2.5s extension. `headingVelocityReversalT=0.85` explicitly identifies the artifact.

In the extended run, `F.crashStats` reported 400 proxy contacts (solver iterations / frame contacts; **not** independent crashes), max penetration 0.00558m, max impulse 747N·s, collision energy loss 17.21kJ, numerical state finite. These are **model-internal values, not validated biomechanics**. Head/rider ground impact is NOT established by bike collision proxies. `crashT` can lag the first contact because it only samples every ~50ms and may miss transient contacts. `firstBodyContactT` observes the physics collider every step.

## Changes
- `src/core/90_maneuvers.js`: add `groundStopT`, `headingVelocityReversalT` and `groundV` trace series. Preserve old `stopT` for compatibility but explicitly distinguish it from stopping.
- Provide `opts.probeContinuePastAttitude` in `maneuvers.simulate()`. **Off by default.** When true, skips only the maneuver runner's Euler roll termination, allowing the same physics integrator to advance until the bounded requested horizon. `T > 3s` is rejected to prevent unbounded reconstruction tests.
- `tests/browser/overturn-contact.mjs`: run both ordinary and extended modes; verify first fairing impact, non-stop during heading reversal, duration guard and original ordinary stop. Syntax-checked; test via Node Playwright not executed here, as Node Playwright was not present. The same extended 2.5s scenario was **executed in actual Chromium WebGL2 through CDP** and saved as JSON.
- The powertrain, tire forces, suspension, rider, clothing, shaders, NIMBUS and original V1.31 studio were **not changed**.

## Verification receipts
Chromium 144 ANGLE SwiftShader WebGL2: GL error 0, no lost context or page errors. Fresh native side view with clothed seated rider and original Ducati at ~70km/h (active simulation time >0.47s). Rebuilt self-contained R3 HTML SHA256: `8683ec4ebc27a335ae3766662ebc10bcbd8907c33e9de93b83119a2e3c0a5dae`. Selected Node tire, character and audio unit tests 29/29 passed. Full suite and Playwright CLI remain outstanding.

The numeric on-road braking cases in R2 match the untouched R1 baseline: `brakeFirm` 0.808g and stop 4.05s, `lean35` max roll 34.716°/yaw −15.125°/s, `stoppie` rear lift 0.178m. The R3 default path only adds diagnostics and a disabled-by-default option; it does not modify these algorithms.

## Priorities
1. Resolve why the 40-bar grip/COM/steering dynamic produces the simulated angular acceleration; cross-check angular momentum and wheel/ground contact geometry against physical reference data before making physical corrections.
2. Develop a separate physics-consistent crash/impact status from the present Euler heading/roll representation, preserving quaternions and body/world frames. Explicit first rider/body collision proxies are currently insufficient for human injury/impact modeling.
3. Quantify severe collision impulse/penetration convergence across smaller dt and collider resolution; verify contact energy budgets.
4. Extend low-grip, wet-film, water/drainage, tire compound/temperature, rider posture and intervention coverage after reference source audit.
5. Avoid visual changes until the user reviews native renders.

### Reproduction
```
npm run build
node --check src/core/90_maneuvers.js
node --check tests/browser/overturn-contact.mjs
node --test tests/exhaust_audio_patch.test.mjs tests/lucid_character.test.mjs tests/rtt_tire.test.mjs
node tests/browser/overturn-contact.mjs   # requires Playwright
```
The actual Chromium/CDP JSON and PNG receipts accompany the R3 source and evidence ZIP archives.

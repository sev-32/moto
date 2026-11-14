# LUCID MOTO R4 — Coupled pitch-load observability, 2026-10-20

**Provenance:** Extension of R3 `experiment-20261020-overturn-groundspeed-r3`. All original V1.31 studio code, geometry, tire and chassis integrators, shaders, powertrain, NIMBUS and riders remain untouched. Git experiment branch: `experiment-20261020-pitch-balance-r4`. Full project is at `/mnt/data/LUCID_MOTO_PROJECT/project`; evidence at `../evidence/R4`.

## Change set
- `src/core/90_maneuvers.js`: Optional `opts.probeDynamics` records per-step coupled solver pitch acceleration (`angularAccelBody[0]`), generalized body pitch force (`generalizedForce[3]`), generalized bias, wheel rotor momentum-rate contribution, mass-matrix symmetry and condition proxy, and generalized joint-limit impulses. Event snapshots are recorded for front lock, rear lift, near-vertical nose-over and first bike proxy-ground collision. Existing physics and visual rendering are untouched; the option is off by default.
- Rejects invalid `probeContinuePastAttitude` time horizons (>3 seconds, nonfinite, <=0) BEFORE switching domains, pausing, changing controls or resetting the motorcycle. The previous R3 guard was located after those mutations, causing a rejected request to reset a live ride.
- `tests/browser/pitch-balance-r4.mjs` is the enduring API regression, syntactically checked but not executed through Node Playwright in this runtime; the equivalent tests were independently executed in real Chromium using CDP with serialized results.

## Native runtime receipts
Self-contained rebuilt V2.0-dev HTML SHA256: `fec73df3c8cc7bfed807e31cc96ef1e6bd1a5848afa49e6e1ffcca532fd83c0c`. Source SHA256 of `src/core/90_maneuvers.js`: `c6fff5e575d7a70b26c7f27ad8fdb1cde8235b77289ab0a58476265dbd1f8a39`.

Chromium 144 on isolated `DISPLAY=:99` / ANGLE Vulkan SwiftShader ES WebGL2: correct original Ducati and fully dressed articulated rider rendered at approximately 66.5 km/h (chase). Actual 1279×654 screenshot `R4_native_side_active_rider.png` (the script's filename names its intended camera; the actual displayed camera was **CHASE**, as verified from the PNG). GL error 0, context not lost. Recorded rider placement and >1s simulation time. An initial lengthy multi-frame capture harness stalled on software rendering; short direct CDP screenshot succeeded. The failed and successful harness receipts are preserved.

## Dynamics probes (actual browser simulation)

| Test | Result |
| --- | --- |
| Invalid 4-second overturn probe | Rejected; exact position, velocity, clock, gear and burnout activation unchanged |
| 40-bar brake grab, ordinary stop | front lock 0.348s, near-vertical attitude termination 0.807s; no body proxy contact |
| Extended 40-bar brake grab to 2.5s | first `fairing_left` contact 2.007s; world ground stop not reached |
| Firm stop | 4.05s, true ground stop equals projected stop, no front lock |
| 35° turn | 34.716° maximum roll, unchanged |

Measured *absolute peak* pitch acceleration (body generalized angular acceleration, rad/s²): firm brake **26.223**, default panic scenario (only through 0.807s) **51.738**, extended panic through impact **766.791**.

Peak *absolute* generalized pitch force (not independent rigid-body torque): firm brake **1042.681 N·m**, default grab **3226.218 N·m**, extended grab **34459.397 N·m**.

Peak absolute rotor generalized pitch contribution: firm **291.681 N·m**, default grab **1187.821 N·m**, extended **12702.948 N·m**. Maximum mass-matrix symmetry error zero; solve-condition proxy up to 502.316. Generalized joint-limit impulses observed on 814 integration frames of the extended scenario; **zero** in ordinary early grab (0.807s), zero in firm braking.

### Physically important interpretation
These are outputs from a nine-coordinate coupled system with off-diagonal mass terms, velocity-dependent biases and implicit joint constraints. The generalized pitch force Q[3] alone is *not* the external pitch moment, and a diagonal inertia multiplied by pitch acceleration alone cannot close a rigorous angular-momentum balance. Additionally, the extreme acceleration peak of the extended case includes later joint-limit and impact events; comparing it directly to initial tire-brake acceleration is invalid. We have not proven energy or angular-momentum conservation across collisions yet. The next gate must inspect full matrix `M`, bias `C`, gyroscopic H_dot, impulse moment and frame transforms in a controlled phase-resolved residual check. If possible, compare across halved time step and alternative collider iteration counts.

The front normal is already near zero by the first detected lock and the rear hub reaches 20mm clearance slightly later: wheel-force unload and geometric hub clearance are different events; do not infer lift solely from normal load or vice versa. First bike-body contact is not first rider/helmet contact.

## Tests, classification, limitations
- `node --check src/core/90_maneuvers.js`: pass.
- `node --check tests/browser/pitch-balance-r4.mjs`: pass.
- `npm run build`: pass, 30.65MiB self-contained application, original 26 ordered core layers.
- `node --test tests/exhaust_audio_patch.test.mjs tests/lucid_character.test.mjs tests/rtt_tire.test.mjs`: 29 passed / 0 failed.
- Actual Chromium CDP: all four physics cases passed assertions; invalid-probe state preservation passed.
- Full test suite and direct Node Playwright script are **not verified** in this checkpoint.
- No real-GPU framerate, physical impact biomechanics or telemetry calibration claim is made.

**Continuation:** Preserve this working branch and folder. Next do full-matrix generalized-acceleration residual and frame-consistent tire/braking moment budget through 0–0.8s, then impact energy consistency after 2.0s. Do not change rider physics or visual rendering without independent baseline and fresh WebGL2 images for approval.

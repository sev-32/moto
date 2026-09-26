# Build audit and consolidation decisions

This is the lead-dev audit of every build that was handed over, what each one contributes, what
was wrong with it, and what the consolidated V2.0 build does with it. All inputs are preserved in
the repository and regenerate byte-for-byte (`npm run build:legacy`, `npm run build:reference`).

## 1. What was handed over

| Lineage | Builds | Kept in |
| --- | --- | --- |
| Vehicle labs | V5.0 free road → V5.3.2 bead steering → V5.4 assist/camera/telemetry → V5.6.7 tire-rim/brake reaction | `reference/builds/Ducati916_VEHICLE_*` |
| Tire labs | V6.3.5 smooth layered → V7.0 lean contact grip → V8.0 continuous contact → V8.2 multirate → V8.3 experimental approval UI | `reference/builds/Ducati916_TIRE_*` (+ the 12 MB layered research dataset, stored once, gzipped) |
| Studio (primary base) | V5.6.7 + V1.31.0 *Artist-in-the-Loop Studio*: 39 scripts from the V5.6.7 multibody through the V1.21 powertrain, V1.22 acoustic studio, V1.23/1.24 ride UI, V1.25 thermal orchestration, V1.26 brake/tire feedback, V1.27 thermal materials, V1.28 thermofluid, V1.28.x recovery/usability/stability rigs and the V1.28.4 → V1.31 rider series | `src/legacy/` (unmodified, byte-exact) |
| VOLUMETRICS | V84 physics + V85.10 volumetrics + V86.x renderer ("Burnout + Rider Contact"), with a virtual file system holding the tire profile registry v2.3, the suspension reconstruction v2.6, the V84 simulator and the V74 sound authority | `reference/builds/Ducati916_VOLUMETRICS` (35 MB → 5.9 MB: the GLB is the shared one, VFS files decoded + gzipped) |

The Ducati 916 GLB embedded in every build is the same file (sha256 `91141c45…`); it is stored
once in `assets/models/`.

## 2. Intent, as read from the builds

A fully free, articulated machine: nine generalized coordinates (6-DOF body, steer, fork,
swingarm) with a coupled mass matrix and gyroscopic rotor terms; a researched tire lineage
(layered carcass, lean contact, continuous contact, multirate); a detailed powertrain (dry clutch,
compliant driveline, 270° L-twin), a physically-driven engine sound (pulses through header /
collector / muffler resonators whose sound speed follows the exhaust thermal network); a rider
whose mass, contacts (seat, pegs, grips) and posture couple into the bike; and effects (tire smoke,
exhaust heat and afterfire, burnout volumetrics) that read the physics rather than faking it.

## 3. What is excellent and kept as-is

* **V5.6.7 multibody**: coupled mass matrix, steering geometry and self-steer, collision
  impulses, generalized-force API. Self-stability, counter-steer and weave behaviour come out of
  the geometry, not from assists.
* **V1.21 powertrain**: torque curve, engine braking, dry-clutch capacity model, compliant
  gearbox/final drive, ABS/TC channels, launch assist.
* **V1.22 acoustic studio**: an AudioWorklet synthesizer driven by crank phase (0/270° firing),
  per-pipe resonators, Helmholtz airbox/muffler, mechanical/driveline channels. Untouched; the
  V1.28 thermofluid bridge keeps its gas temperatures live.
* **V1.25 thermal network**, **V1.26 brake/tire temperatures**, **V1.27 materials**: exhaust,
  brake and tire heat that the new effects now read.
* **V1.28.4 → V1.31 rider series**: skinned rider, contact registry, grip/peg/seat constraints,
  operational states (stops, dabs), the artist studio.
* **VOLUMETRICS**: the NIMBUS Eulerian smoke solver (worker) and its raymarcher, the V84 skid-mark
  idea, the V85 crank-phased afterfire idea, the burnout staging, and two data sets of real value
  (tire registry v2.3 with literature benchmarks, suspension reconstruction v2.6).

## 4. Defects found, and what was done

| # | Where | Defect | Consolidated fix |
| --- | --- | --- | --- |
| 1 | Studio runtime | Free-road physics ran at ~5 % of real time (tire solver + full telemetry every step) | `20_realtime_integration`: real-time pneumatic brush tire (RTT), fixed-step loop, lite telemetry; ~0.6 ms per 540 Hz step |
| 2 | V1.30 boot | Intermittent crash (`shoulderMetric` null) from a boot-order race between V1.29.6.2/V1.29.7/V1.30 | `05_boot_order_guards`: publish those APIs only once their boots finish |
| 3 | V5.6.7 suspension | Fork bump-stop term with a unit error, kinematic travel clamps, explicit wheel spin → blow-ups under hard braking and stoppies | `30_chassis_dynamics`: air spring / hydraulic lock / elastomer + metal stop / top-out spring, impulse joint limits, implicit wheel spin |
| 4 | Tire friction | μ 1.18 (peak Fx/Fz 1.09 < the ~1.2 g a stoppie needs): endos were impossible | RTT sport-tire calibration μ 1.40 / 1.38 (peak Fx/Fz ≈ 1.27), thermal grip ratio kept from V1.26 |
| 5 | V1.21 ABS | Full-lever ABS stop could still endo | rear-lift mitigation in the chassis layer |
| 6 | Rider coupling | Hang-off had no effect: rider reactions were applied at the seat site | `40_rider_body`: compliant rider (pelvis + torso servos), reactions at the rider mass positions plus the spine couple |
| 7 | V1.21 driveline | Final-drive damper fed with \|ω_rear\| (the driveline cannot turn backwards): a rear wheel turning backwards was pushed further back, a runaway (~8000 rad/s²) that flipped the bike and dragged the engine to 30 000 rpm | reverse-spin guard in the chassis wheel step |
| 8 | V5.x drive reaction | The legacy tire-moment mapping reacts drive torque on the swingarm (like a shaft drive) | chain force routing (tight run between the sprockets); swingarm motion under a full-throttle launch 1.91° → 0.43° |
| 9 | Suspension | No seal/bushing friction | fork 49 N Coulomb / 76 N breakaway (+ load and bending terms), shock 30/42 N, from the v2.6 reconstruction |
| 10 | V1.22 pops | Random overrun pops, unrelated to any visual afterfire | `62_exhaust`: one physical afterfire model drives both the flames and the DSP pops |
| 11 | V1.27/V1.28 effects | 2D canvas smoke drawn over everything (no occlusion); refraction on a second WebGL context | `60_fx`: in-frame, depth-tested particles and heat haze |
| 12 | Ride view | Studio overlays (chain HUD, rider-ops panel, rider-studio gaze ray, labels) drawn over the ride | clean ride view (\` toggles) |
| 13 | V85 NIMBUS host | Solver free-ran on wall time (0.03 s of smoke per ~16 ms timer tick: up to ~1.9× real time), smoke did not pause with the sim | host-driven, sim-time-locked solver steps |

Fix 8 initially shipped inactive (the V1.21 wrapper restores `controls.rearDriveTorqueNm`
before the chassis step, so the chain wrench read 0); it now reads the torque the wheel
integrator applied. All maneuver bands were re-validated after each of these changes.

## 5. Consolidation decisions

* **Hybrid, not rewrite.** The studio is the richest, most-validated runtime; it stays byte-exact
  in `src/legacy/`, and every improvement is a core layer (`src/core/`) that wraps or extends it.
  Nothing regresses below the studio because the studio is still there underneath.
* **One owner per phenomenon.** Tire forces: RTT. Rear-tire smoke: NIMBUS (the particle layer
  keeps the front). Exhaust flames *and* pops: the exhaust model. Rubber marks: the skid layer.
* **Everything on simulation time.** Particles, NIMBUS, skid stamps, the exhaust crank phase and
  the rigs all step on sim time, so pause / slow motion / scripted capture stay consistent.
* **Data from the user's own research first.** Suspension friction and the checks in PHYSICS.md
  use the v2.6 reconstruction; the tire registry v2.3 is archived for the next step.

## 6. Not yet consolidated (candidates for the next rounds)

* **Tire registry v2.3** (period 916 reference, WSBK / MotoGP / Moto2 / Moto3 research profiles,
  Pirelli / Bridgestone, test overlays, Mottola & Massaro 2022 camber-reduction and Massaro 2023
  rigid-ring benchmarks): map its multipliers onto the RTT parameters as selectable tire profiles.
* **Suspension v2.6 damper model**: pressure-based shim stacks with bleeds, clicker positions and
  oil-temperature viscosity; the legacy linear-with-knee damper is still in use. Rear static sag is
  22 mm here vs 32 mm in the reconstruction.
* **V8x rider controls**: gamepad body control (left stick tuck/sit-up, right stick body
  left/right/fore/aft, L3/R3 toggles). The core rider layer has keyboard + d-pad posture control.
* **V80 pavement test world, Termignoni cans, textured helmeted rider, V86 render pipeline**:
  superseded by the incoming character/rig and bike model; kept in the archive.
* **Rider COM**: the V1.28.5.2 segment table and the skinned mesh disagree by ~15 cm; the rider
  layer uses the segment table (consistent with the contact sites) until the new rig provides
  measured segment frames.

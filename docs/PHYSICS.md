# Physics notes

Numbers below are the values in the code; "test" marks what a unit or maneuver test locks.

## Vehicle (V5.6.7 multibody, kept)

Nine generalized velocities: body translation (3) and rotation (3), steer, fork travel, swingarm
angle, with a coupled mass matrix, rotor (gyroscopic) terms and generalized external forces. Total
mass with rider 286 kg (static loads 1355 N front / 1451 N rear at a standstill), wheel radii
0.2999 / 0.3109 m (120/70 ZR17, 190/50 ZR17), wheel inertias 0.5 / 0.7 kg m². The physics steps
at a fixed 540 Hz.

## Tire: RTT (`10_rtt_tire.js`)

* **Vertical**: exact intersection of the 916 tread profiles (GLB tire assets) with the road plane
  at the current camber. Load = (inflation gauge + carcass support 36 / 42 kPa) × contact area,
  so patch size and shape, camber stiffness and the lateral migration of the contact point come
  from the geometry. Test: vertical stiffness 130-320 kN/m, patch 40-75 cm², mean pressure 2-3.2 bar.
* **Horizontal**: 3 lanes × 10 stations brush patch, bristle deflections advected
  semi-Lagrangianly (stable from standstill to top speed), driven by longitudinal slip, lateral
  slip, turn slip and camber spin; friction ellipse with velocity-dependent μ
  (front μ 1.40, rear 1.38, kinetic ratio 0.78 / 0.76). Test: cornering stiffness 11-15 /Fz per
  rad, camber stiffness 0.75-1.1 /Fz, slip stiffness 14-24 /Fz, pneumatic trail 10-35 mm, braking
  peak Fx/Fz 0.8-1.02 μ, locked/peak 0.7-0.95, relaxation length 0.08-0.3 m.
* **Transient**: lateral carcass compliance in series with the brush (1.25 / 1.55 × 10⁵ N/m).
* **Wheel spin**: implicit (effective inertia I + dt·lever·∂Fx/∂ω from the adhered bristles), rim
  stop damping; the V1.26 thermal model scales μ by its grip ratio.

## Chassis (`30_chassis_dynamics.js`)

| Item | Model |
| --- | --- |
| Fork end of travel | two-leg air spring referenced to static sag (Showa 43 mm, polytropic 1.25), hydraulic lock cone over the last 22 mm (compression only), elastomer + metal stop over 8 mm, top-out spring over 12 mm |
| Rear end of travel | bump rubber from 100 mm wheel travel (progressive, damped) |
| Seal / bushing friction | fork 49 N Coulomb, 76 N breakaway, + 2 % of the spring force, + 1.2 % / 0.75 % of the front tire's Fx / Fy (bushing binding); shock 30 / 42 N at the shaft ÷ motion ratio 1.9. From the v2.6 reconstruction; regularised over 10 mm/s (explicit-step safe: no chatter, standstill fork-rate RMS 0.12 mm/s) |
| Joint limits | fork, swingarm and steer limits enforced as generalized impulses (velocities consistent, no position teleports) |
| Chain | the tight run between the countershaft and rear sprocket tangent points carries Td/r2; the pull acts on the swingarm at the tooth and reacts on the engine cases. It replaces the legacy tire-moment mapping that reacted drive torque on the swingarm (shaft-drive-like jacking). Full-throttle launch: swingarm motion 1.91° → 0.43° |
| Reverse-spin guard | the V1.21 driveline feeds its final-drive damper with \|ω_rear\|; for a wheel turning backwards that torque is replaced by a resisting one scaled by clutch engagement |
| Aero | CdA 0.46 upright → 0.30 tucked, lift 0.05 / 0.03 m², centre of pressure moving with posture and hang-off |
| Steering damper | 7 N m s/rad (the 916 carries a hydraulic damper; the legacy had head-bearing damping only) |
| Feet down | below 0.8 m/s the rider's feet hold roll (4000 N m/rad, 900 N m s/rad, ≤ 450 N m), fading out by 2 m/s |
| Rear-lift mitigation | with ABS on, trims the front pressure while the rear is unloaded (IMU-less RLM) |
| Chock | burnout-pit front-axle restraint (3 × 10⁵ N/m, 8000 N s/m, ≤ 12 kN), re-anchored on reset |

Suspension rates vs the v2.6 reconstruction (VOLUMETRICS build, `data/v2_6`):

| | here (V5.6.7) | v2.6 reconstruction |
| --- | --- | --- |
| fork spring | 17.6 kN/m | 18.0 kN/m |
| fork travel / static sag | 127 mm / 33 mm | 127 mm / 32 mm |
| rear wheel rate | 28.4 kN/m (+ progression) | 95 kN/m shock ÷ MR² (1.55-2.3) ≈ 26 kN/m at sag |
| rear travel / static sag | 130 mm / 22 mm | 130 mm / 32 mm |
| total mass | 286 kg | 286 kg |
| damping | linear with high-speed knee | pressure-based shim stacks + bleeds + clickers (not yet ported) |

## Physical rider (`45_rider_multibody.js`, `46_rider_biomech.js`, `47_rider_render.js`)

The default rider is the LUCID character itself as an articulated body: the floating pelvis plus
46 revolute hinges that are the Semantic51 DOFs of the canonical rig (same joints, axes, order and
hard ranges; toes not simulated). Mass: the R1.5 17-body profile (75 kg). It is a **joint-torque
(motor-driven) body, not the R1.5 muscle-driven body**: stable-PD servos with torque limits (lower
body: the R1.5 capacity ledger; trunk/neck: physbody stance gains; arms and all contact
parameters: declared engineering priors in `PRIORS`), plus the R1.5 passive tissue priors as soft
joint stops. Her state is Semantic51 commands + a placement, drawn every frame through the
canonical skin path (nothing writes bones or skin).

* **Contacts** (soft-tissue spheres fitted inside her skin, anchored Coulomb friction): the 916's
  envelope (a signed-distance field built from the GLB's visual hull), footpeg cylinders, a
  strength-limited bilateral grip per hand, the ground. Rider-specific spheres from her rest-pose
  skin: the sitting band under the pelvis and the pelvis front (lower abdomen / pubic region,
  softer), which rests against the tank's steep rear face; without it her belly caught the tank's
  top edge and she climbed over it under braking.
* **Planner (60 Hz)**: the trunk and head are referenced to the felt vertical (gravity plus the
  sustained turning acceleration), so the bike rocks under a floating upper body; hang-off, tuck,
  sit-up, fore/aft and stand intents; the trunk leans until the elbows keep some bend (reach
  loop); damped-least-squares IK with clearance against the envelope. Per-step controllers keep
  their targets in the bike frame.
* **Lower body** (virtual-model control, nothing moves the pelvis directly): the hips hold the
  pelvis orientation against the thighs; knee flexion and ankle relax when seated (the legs do not
  prop her off the seat); knee squeeze (adduction), stronger braced and as a clamp reflex when the
  bike rolls quickly under her; sideways pelvis force by differential knee squeeze, fore/aft
  within the knees' and pegs' friction; to move over on the seat (hang-off) she unweights it with
  her legs and slides across, eased in and out so it does not pump the suspension.
* **Hands**: she leans on the clip-ons (planned bar reaction in the gravity/inertia feed-forward);
  braced, the arms act as struts along the arm line (a 916's clip-ons are a long reach for her
  0.54 m arm: seated, her elbows stay nearly straight). A quiet-hands loop keeps her own torque
  about the steering axis near zero: the steering intent reaches the bars through the chassis
  steer input.
* **Coupling**: her contact forces enter the V5 generalized forces (the grips also load the
  steering axis), her body integrates after the bike with the same forces (momentum exchanged
  exactly); the V5 mass matrix and gravity become bike-only (the V5 values lump a 75.337 kg rider).
* **Checks** (`tests/rider_biomech.test.mjs`, stub bike): weight on the bike within 2 %, static
  drift < 5 mm, trunk and head nearer the vertical than a bike rocking ±8° at 0.5 Hz, seated
  through a 1 g stop (< 8 cm forward, < 5 cm up, back in place after), 0.8 g drive, 0.8 g turn;
  plus the 14 maneuvers in the coupled simulation. Cost: ~0.45 ms per 540 Hz step (forces,
  integration, amortized IK) and ~2 ms per frame for skinning (headless CPU).
* **Not yet**: feet down / walking the bike at a standstill (the chassis feet-down support still
  holds the bike), a foot dab in slides, crashes as a ragdoll, standing wheelie control; hang-off
  is slow to build (she reaches ~half of the planned 9 cm on the 60 m radius).

## Legacy rider (`40_rider_body.js`, `?rider=legacy`)

75.3 kg in four groups: pelvis + thighs 27.3 kg (sprung on the seat), torso + head + upper arms
34.8 kg (sprung on the spine), feet 9.7 kg and hands 3.5 kg (rigid to pegs / grips). Posture
servos [lateral, longitudinal, vertical]: pelvis 14/18/40 kN/m, spine 7/8/20 kN/m, arms 1.5/5/2.5
kN/m. Reactions go back into the bike at the rider mass positions plus the spine couple, so
angular momentum is conserved and hang-off really moves the combined centre of mass. Posture
targets: hang-off 0.17 m with 24° lean-in, fore/aft 0.08 m, tuck 28° / sit-up 18°, stand 0.18 m;
the auto rider commits from 1.2 s-filtered lateral g (reacting to instantaneous yaw rate pumps the
weave mode) and tucks from 33 m/s. Test: `radius60` — the hang-off decides the lean on a 60 m
radius at 0.68 g.

## World (`50_world.js`)

3.05 km circuit (spline centreline, 12 m asphalt, painted edges, 1.1 m raised kerbs rising to
22 mm, 22 m runoff) plus a test apron with a 30 m skid-pad ring and a bump strip. One 2 m grid of
height / signed distance / grip serves both the tire physics (road frame, normals, collisions) and
the GPU terrain. Grip: asphalt 1.0, paint 0.9, kerb 0.85, grass 0.5 (soft edge). Maneuver tests run
on the flat reference road unless they ask for the world.

## Effects that read the physics

* **NIMBUS rear-tire smoke** (`65_…`): the verbatim NIMBUS Eulerian solver (32 × 26 × 60 cells over
  4.8 × 3.5 × 10.2 m following the rear wheel: advection, buoyancy, vorticity confinement,
  turbulence cascade, thermal transport, pressure projection) advanced by the host in 0.03 s steps
  of simulation time. Sources: contact-patch jets from RTT sliding power (yield keeps rising past
  30 kW), radial off-gassing of the hot tread with its boundary layer dragged round by the
  spinning wheel (forward over the top, rearward underneath), flash temperature from the V1.26
  surface temperature + √(sliding power). Smoke persists 24 s (95 %), gains ×2.2 over R0 (R0's
  worker free-ran faster than real time). Diagnostic: side-view area with optical depth > 1 —
  stationary burnout 0.25 m² at 3 s, 1.8 m² at 6 s, 3.8 m² at 9 s.
* **Particles** (`60_fx.js`): front-tire smoke (sliding power × tread temperature), exhaust
  shimmer/vapour, brake-disc heat shimmer, dirt on grass; depth-tested, lit, heat haze refracts a
  resolved copy of the frame.
* **Exhaust gas dynamics** (`62_exhaust.js`): per cylinder m_air = ρ V_cyl VE(rpm, throttle), AFR
  12.8 at WOT / 13.9 part / 12.6 on overrun, richer after a throttle chop (manifold wall film,
  τ 0.6 s); 720° crank phase from the V1.21 crank, 0/270° firing, EVO 125° after TDC. Overrun
  misfires (probability from the sound profile's overrunPops: ~5-7 pops/s at 7-8 krpm with a hot
  exhaust for the default 0.12) and soft-limiter spark cuts send unburnt charge down the pipes at
  the mean gas velocity ṁ/(ρ(T) A); it lights on a hot pulse (> ~520 °C) or on hot walls from the
  V1.25 network (a cold exhaust barely pops), inside (sound only) or at the outlet (flame).
  E = m_unburnt × 43 MJ/kg × 0.9: a typical overrun misfire ~150 J, a limiter cut at WOT ~1.4 kJ;
  flame length 0.08 + 0.1·(E/120 J)^⅓ m, 1300-2150 K (blackbody-shaded). The DSP pop amplitude
  follows √E; the V1.22 worklet's own random pops are switched off while the model runs. Exit
  flow leaves the GLB silencer end caps along their 21.5°-up axis; water vapour (1.35 kg per kg
  fuel) is visible while the silencers are below ~95 °C.
* **Rubber marks** (`55_skidmarks.js`): deposit = 1 − exp(−E/E0), E = sliding power × dt / swept
  patch area, E0 = 8 kJ/m² (tread abradability ~2 × 10⁻⁹ m³/J → ~15 µm of rubber), × surface and
  tread-temperature factors. Locked rear at 20 m/s ≈ 0.65-0.7 per pass (black streak), ABS stop
  ≈ 0.15, cornering at the limit ≈ 0.02, burnout saturates under the tire.
* **Tire and wind audio** (`68_audio_env.js`): squeal loudness ∝ (sliding power)^0.7 gated by the
  sliding fraction, pitch 640 Hz + 55 Hz per m/s of sliding speed (plus a 2.13× partial, stick-slip
  AM); rolling roar ∝ v^1.5 by surface; wind ∝ v², brighter with speed, −45 % tucked.

## Maneuver suite (`npm run test:maneuvers`)

| Maneuver | Current result |
| --- | --- |
| coast 20 m/s hands off | self-stable (|roll| < 0.2°), 0.13 g engine braking + drag |
| coastSlow 6 m/s | capsizes (below the self-stable band: physical) |
| brakeFirm 16 / 5 bar | 0.81 g, stops in 4.05 s |
| brakeMax (front slip -6…-9 %) | 1.07 g, 43.7 m |
| brakeGrab 40 bar step, no ABS | front lock and a low-side — no numeric explosion |
| brakeAbs 55 bar | 1.69 g peak, rear lift ≤ 59 mm, stops |
| stoppie | rear lifted ~16 cm and set down |
| launch / wheelie | 1.14 g launch; clutch-up wheelie held at ~25° |
| lean35, radius60, slalom | steady 35° lean; 40° at 0.68 g on a 60 m radius with hang-off; slalom reaches ±17.5° of the ±22° target every 1.2 s |
| burnout | stationary, rear spinning at ~8700 rpm, 40+ kW sliding |

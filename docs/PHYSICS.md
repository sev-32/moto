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
| Feet down | below 0.8 m/s the rider's feet hold roll (4000 N m/rad, 900 N m s/rad, ≤ 450 N m), fading out by 2 m/s, and only near upright (full to 25° of lean, none past 40°: a bike lying on its side is not levered back up). With the physical rider off the bike it holds the bike only parked on its side stand (leaning 10° left, declared) or while she holds it |
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
hard ranges; the toes a quasi-static flap on each foot - see *her feet*). Mass: the R1.5 17-body
profile (75 kg). Her state is Semantic51
commands + a placement, drawn every frame through the canonical skin path (nothing writes bones or
skin). The R1.5 passive tissue priors act on every hinge as soft joint stops.

**Riding, her muscles move her** (`46_rider_muscles.js`; `R.muscles.active`, telemetry). Nothing
but muscle force and passive tissue acts on her joints while she rides:

* **The muscles** are the R1.5 musculotendon proxies of `lucid_bcr.muscles` on her own skeleton:
  each a polyline carried by her joints, fitted to her mesh in the package (84), with lengths and
  virtual-work moment arms about every hinge they span, MuJoCo's muscle model as the package
  compiles it (`PhysicsBody(muscles=True)`: force = a Fmax FL(l) FV(v), fibre calibration of
  `physbody._calibrate_lengthrange`, rest pose = optimal fibre length) and MuJoCo's activation
  dynamics (10 ms × (0.5 + 1.5a) rising, 40 ms / (0.5 + 1.5a) falling, actearly). Parity with the
  package: `tests/rider_muscles.test.mjs` - paths, lengths and moment arms within 1e-8 mm of the
  proxies at 13 lawful poses (4234 muscle-hinge pairs), MuJoCo's gain / bias / activation
  functions to 1e-10. Asset and fixture: `tools/character/extract_muscles.py` (writes nothing into
  the package).
* **CANDIDATE refinement (declared, not R1.5): the triceps.** R1.5 has one triceps along the long
  head's path (scapular origin; 2047 N = the Holzbaur 2005 sum of TRIlong 798.5 + TRIlat 624.3 +
  TRImed 624.3 N) with no wrap at the elbow. Measured on her: its elbow moment arm falls from
  1.7 cm straight to 0.2 cm at 90° and turns flexor past ~110°, and with the shoulder flexed 110°
  (riding) the whole muscle sits at 0.5-0.6 of its force-length peak - her elbow extension was
  22 N m straight and 1 N m at 90°: she could not brace on the bars (1 g braking folded her arms
  from 12° to 83°). The runtime splits it into the three Holzbaur heads (lateral and medial from the
  humerus) sharing an olecranon point that turns with half the elbow flexion - the package's own
  patella device - placed by the package's `MuscleSystem.place` on her mesh; the point's depth is
  fitted to a ~2 cm moment arm (Murray, Delp & Buchanan 1995: 1.5-2.3 cm): 2.04 / 2.11 / 1.88 /
  1.65 cm at 0 / 45 / 90 / 120°. 88 muscles; the other 82 are R1.5 verbatim. Owner decision.
* **Intent → muscles** (the servos are her intent, "the feeling"; the muscles hold it): each step
  the joint torque her servo law asks for (PD on the IK posture targets + gravity / contact
  feed-forward + the virtual-model forces) is allocated to activations - least squares on the
  torque error per hinge (in units of the hinge's servo capacity) plus 0.001 Σa² - inside the box
  one step of the activation dynamics can reach, by warm-started projected Gauss-Seidel (12 sweeps,
  ~0.1 ms per step); the excitation that reaches the planned activation is sent (as
  `lucid_bcr.neuro`). The muscles' force-velocity damping enters the step implicitly (MuJoCo
  implicitfast does the same). What the muscles cannot make is not made.
* **What her muscles showed about the motor-era intent** (each measured, each fixed in the
  intent, not in the muscles):
  - *rigid-lock gains*: the servo gains about light segments were 190-520 rad/s (ankle, knee and
    shoulder axial rotation; damping ratios up to 17) - a command the muscles cannot follow; its
    chatter through the gastrocnemius opened her knees 30° and lifted her 5.7 cm off the seat. Her
    intent's stiffness is now capped at a neural bandwidth for the inertia each hinge moves
    (articulated inertia; 30 rad/s, hands 80 rad/s, critically damped).
  - *a slumped posture*: seated at the old 8° pelvis pitch her lumbar extensors were at 1.27 of
    optimal length (force-length 0.6) and 0.94 activation just to sit; the static muscle effort
    Σa² over pelvis pitch is 3.0 at 8°, 1.5 at 15-20°, 3.4 at 25°, 8.0 at 35°: she now sits at 18°.
  - *zig-zag spine demands*: joint servos on lumbar and thoracic segments asked them to bend
    opposite ways (the package's R1.4 note: long trunk muscles cannot make that); her trunk and head
    are now orientation tasks (a moment on the chest carried by every spine hinge, on the head by
    every neck hinge; weak joint posture terms), as the package's whole-body controller does.
  - *reaching for a grip*: the joint targets of a reach lag a trunk still settling; a reaching
    hand is now pulled to its grip (400 N/m, ~2 Hz for the arm) - roughly: see *feel* below.
  - *impossible demands*: a demand past what the muscles can make in that direction had the
    allocation recruit every muscle with any arm that way, whatever it did elsewhere (a lumbar
    side-bend demand past its strength drove the hip adductors to -90 N m and turned the inside hip's
    torques against their own intent - her inside foot rolled off its peg in a hang-off). The trunk and
    neck demands are now kept within the directional strength of the muscles spanning them.
  - *legs as rigid struts*: the servos held her pelvis to her thighs; on muscles her pelvis rolled on
    the seat with the bike and more. Her pelvis's roll on the seat is now held by pressing one foot
    harder on its peg than the other (1500 N m/rad, up to 150 N m; eased while she moves over on the
    seat): at 400 N m/rad the bike and her body rolled against each other on a launch - a slow mode
    the steering could not hold at 3-7 m/s - and the bike went down.
  - *hands fixed between plans*: her arms' joint targets stood still between plans while the bars
    turned under her hands, their damping resisting the steering; a hand on its grip now follows the
    bar (its arm's targets move at the rates that carry it with the grip).
* **Her feet** (`46_rider_biomech.js`: the sole's pads, `R.feel`, `footToes`, `footFeelTorques`;
  `tests/rider_feet.test.mjs`). Each foot stands on an anatomical tripod on her own sole: pads where
  the package's plantar contact region (`contactRegions.leftFoot` / `rightFoot`, her skin in the rest
  pose) is lowest - the heel (under the calcaneus), the balls of the big and little toes (1st and
  5th metatarsal heads, 4.6 cm apart; the little toe's 0.5 cm further back), the outer border of the
  midfoot (the lateral arch, 4 mm up: it bears when the foot rolls out or sinks in), and the big toe
  and lesser toes. What stands on a peg is the line between the two metatarsal heads (it was the
  toe joint, 2.3 cm further forward).
  - *soft but strong pads* (declared priors): each pad's stiffness and damping build up from nothing
    over its first mm (heel 4 mm, balls 3, toes 2) and it is firm beyond (heel 60 kN/m, balls 50,
    outer border 30, toes 20): it takes the foot softly and bears it firmly (standing, the heel pad
    sinks ~5 mm).
  - *the toes* are a flap hinged at her toe joint on the asset's toe DOF (`leftToe.flexionExtension`,
    -35..70°): the R1.5 physical body folds the toes into the foot and their ~50 g are negligible, so
    each step the flap turns to where the ground's push on the toe pads balances the toe joint - its
    R1.5 passive tissue, its elastic hold (below) and the press of her toe flexors as she feels her
    weight move out over the balls (toe capacity: the asset's 28 N m). The skin shows the angle (the
    asset's toe rule). Standing on her forefoot the ball is the rocker, the toes flat on the ground.
    (Declared: the lumped toe flexor / extensor pair is not among the R1.5 muscles.)
  - *what her soles feel* (`R.feel.feet`): per foot, the load on each pad, the centre of pressure in
    the foot's own frame, the forefoot's share and the outer edge's, and the ground's normal under
    it - felt through the skin's delay (30 ms first order, declared).
  - *the tripod balanced by feel*: a foot bearing on the ground has its ankle's roll (inversion /
    eversion: peroneals against tibialis posterior) worked from what its sole feels - a torque built
    up from the load × the centre of pressure's offset from the middle of the tripod across the foot
    (at the pressure's place along it), over 80 ms, at most 40 N m. Rolled onto its outer edge it
    everts until the big toe's ball bears. The angle servo cannot do this riding: on her muscles its
    neural bandwidth is that of the light foot alone (1.3 N m/rad at the ankle's roll, measured).
  - *lying flat on the ground she feels or sees*: a planted foot's posture aims its sole square to
    the ground under it (felt through the sole when it bears, else seen - the ground's normal there);
    on foot, the leg solves' flat-sole tasks do the same (they aimed at world up).
  - measured standing on level ground (`tests/rider_feet.test.mjs`): each foot bears ~340 N - the
    heel 57 %, the big toe's ball 19 %, the little toe's 17 %, a little on the outer border and the big
    toe; the centre of pressure centred across the foot and 4.5-5 cm ahead of the ankle (quiet
    standing puts it a few cm ahead); soles within 2° of the ground, toes resting 3° flexed. Across a
    10° slope both feet lie on it (soles within ~2°) on heel and both balls.
* **Neural elastic holds** (riding on her muscles; `PRIORS.hold...`): her muscles are not all driven
  like motors. Each keeps a tone (2 % activation; a planted foot's ankle muscles 6 % - the tripod held
  while she balances on it, co-contraction), and each stretched past its length at the posture it has
  settled into (following it over 0.4 s) is recruited - soft near it, firmer the further it is pushed:
  activation 1.5 × d × (1 + d / 0.05), d = the stretch past 0.4 % of its optimal fibre length, in those
  units (a spinal stretch reflex about a threshold length - Feldman's λ model). A muscle over several
  joints holds its whole length, not each joint. The holds resist quick disturbances and give
  stability while her intent's muscles move her; they do not drag her to a posture. Their torque is
  part of what the muscles are to make, and the muscles they recruit are at least that active (added
  after the allocation instead, the allocation undid them with the antagonists: a planted foot rolled
  in 23° had peroneals and tibialis anterior both at 100 %). Her trunk and neck are not held so - they
  are held in space by the chest and head orientation tasks (held to their joint angles, the chest
  followed a rocking pelvis: 32° against 21°); her arms on the bars are held at 0.4 of the gain (a
  rider's arms stay loose for the steering: stiff, the street launch weaved down). Declared priors.
  Her toes hold their relaxed angle the same way: 3 N m/rad at the pose, doubling every 15° of bend
  and growing with the forefoot's load (× (1 + load / 200 N): the plantar fascia's windlass, the stance
  reflexes). With only the R1.5 passive toe (1.5 N m/rad) her toes folded up under her forefoot and
  lifting the bike off its right side she lost it.
* **Feel drives the movement** (her senses, not millimetre targets):
  - *taking a grip*: the hand puts the palm roughly on the bar, feels where it landed and narrows in
    as the fingers close round it (it eases onto its place on the grip over 0.12 s). It closes when her
    palm feels the bar (its contact sphere on the grip's rubber) or when the open hand is over the bar
    (the bar within 8 cm of the palm point - her curling fingers' reach - along the rubber, and not
    behind the back of the hand). The old rule, a palm point within 6 cm of one point on the grip, had
    her hovering 6.1 cm away. (Holding on where the palm landed along the bar instead, getting on and
    off a bike free to roll her body pressed it with 483 N and it went over after she got off.)
  - *stepping with a foot down*: the planted foot comes up only once she feels it light (under 60 N):
    a foot her weight or the bike's still bears on is unloaded first, not dragged.
  - *feeling for the ground*: a planted foot that does not feel the ground bear on it (under 60 N)
    reaches on down for it - ankle and knee - 5 cm at most, and, reached that far and still not
    feeling it, she slides her hips over towards it (4 cm at most); once it bears the reach eases back.
    (After getting on, her left foot had hovered 2-6 cm over the ground, stepping for it.)
  - *a strut that gives*: in a motion at the bike, a foot she stands on with her leg locked straight
    (knee under 6° - a short rider's leg reaching down from a tall bike) that feels itself pushing
    200 N and more past what the motion means it to eases its target up (0.1 m/s, 3 cm at most) until
    the push is what was meant - not while lifting the bike (48: `yield...`). Getting off a bike free to
    roll, her locked leg pushed 400-590 N as the motion began and shoved the bike over. (Taken as hip
    to ball over 0.8 m instead, it also caught her standing with soft knees and slowed her after a
    lift.)
  - *starting relaxed*: placed on the bike (a reset, taking over from the motors) she starts with
    the activations that hold the posture she is in, not at resting tone.
* **Limits of the package's muscles seen riding** (reported, not changed): lumbar side-bend is
  weak when leaning to the bars (quadratus lumborum is small by design, < 10 N m per part; the
  stretched extensors lose force); the shoulder girdle has only pectoralis major, latissimus and
  upper trapezius (no serratus anterior - protraction is weak and the trapezius's elevation drags it
  back); wrist muscles cross the wrist with ~2 mm arms (2-4 N m); no pronator / supinator.
* **Her posture uses her strength** (planner priors): pelvis pitch 18°; when the bike rolls under her
  her pelvis and her chest level by half towards the felt vertical together - her upper body rolls
  over her hips as one block, and her lumbar spine is not asked to bend between them (in a balanced
  turn the felt vertical is the bike's and nothing changes); her head firmer (40 N m/rad: at 22 the
  other neck and shoulder muscles tilted it 1.5°).
* **The lumbar side-bend limit** (measured, riding posture): leaning to the bars her trunk is an
  inverted pendulum sideways (gravity ~2 N m per degree about the lumbar spine: 12 N m at 6°,
  20 N m at 10°). The restoring muscles sum to 70-80 N m at full activation, but used without side
  effects elsewhere (the allocation, the other joints held) they make +15 of +20 N m asked, +23 of 40,
  +29 of 60 - an effective 20-25 N m; the stretched side weakens further as she bends. So a bike rocked
  ±8° at 0.5 Hz under her swings her trunk ±15-25° (the motor-driven rider used 35 N m there).
* **Measured, muscle-driven** (`tests/rider_biomech.test.mjs`, bands kept from the motor era): 10 of
  11 pass - pre-settled, static, 1 g braking, 0.8 g acceleration, 0.8 g steady turn, creeping with a
  foot down (the planted foot stays put and steps as the bike rolls on - it had slipped 0.5-1 m/s),
  low-side dab, a slide ridden through, foot down left and right. Open: the bike rocking ±8° at 0.5 Hz
  under her (chest ±21°: the lumbar side-bend limit above).
* **Off the bike she is still motor-driven** (`R.muscles.onFoot` off): standing, walking, getting
  up, getting on / off and lifting the bike use the servos as joint motors - those controllers
  are not yet converted; her feet (pads, toes, feel, the tripod balanced by feel) are the same in
  both. The hand-over is clean both ways (all 16 at-the-bike tests pass).
* `?muscles=0` in the browser (and `--motors` in the maneuver suite) runs the pre-muscle rider
  (servos as joint motors while riding too), for comparison.

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
  their targets in the bike frame. The felt vertical and the feed-forward's apparent gravity are
  low-pass filtered in the frame of her heading (0.6 s / 0.25 s): filtered in the world frame, a
  steady turn's acceleration - which turns with her - lagged her heading and read as a push along
  the bike (0.37 g of false drive at 1 g and 0.65 rad/s of yaw, measured on the stub bike: it slid
  her back on the seat and lifted her feet off the pegs when she hung off).
* **Hanging off, and what carries it** (Node, the stub bike in a steady turn at 15 m/s, leaned
  where bike and rider together balance - her centre of mass off its plane stands it up 2.6-4.6°;
  joint effort = the servos' active torque as a share of capacity, mean over 1 s, telemetry
  `riderBio.effort` while riding): seated, riding straight: hips 19-20 %, knees 2-8 %, ankles
  9-13 %, spine 31 %, arms 16-18 %. Fully hung off to the inside riding straight - no G to carry
  it - her outside hip 75 %, knee 73 %, ankle 56 %, spine 66 %; the same in a 1 g turn: 43 / 51 /
  32 / 52 %, at 1.2 g 36 / 39 / 17 / 38 %, and she is further off the seat (0.09 m straight, 0.14 m
  at 1 g, 0.17 m at 1.2 g): the turn's load carries the pose. Not held yet: she goes past the
  pelvis target (0.09 m across) and sinks down the seat's inside edge (5 cm at 1 g, 11 cm at
  1.2 g, 17 cm at 0.6 g), her outside knee comes off the tank (nothing hooks it there), and her
  outside arm's clavicle - a declared 40 N m, the arm chain's root - is at its capacity
  throughout. Deeper targets (the pelvis 0.15 m across, the inside knee 0.2 m out) and a pull on
  the inside elbow down and out made her slide off the seat: the posture stays at the values
  above until something holds her at the seat's edge. Tried and left off (CANDIDATE,
  `PL.rideLoadPath`): the whole-body load path while riding (the seat, pegs and grips loaded to
  carry her felt weight with the least joint effort) - in the same turns it left the outside leg
  and arms working as hard (knee 62-64 %, arms 75-100 %) and its contacts squeezing her (seat and
  pegs 1.6 × her felt weight).
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
* **Stopped** (below 1.2 m/s; back on the pegs above 2.2 m/s or as she pulls away): one foot goes
  down on the side the bike leans to (left if upright). The 916 is tall for her (both feet would
  not reach; on one she is on the ball of the foot at the end of her reach), so she slides and
  rolls her pelvis towards it and the bike rests about 1.5° onto that leg; the other foot hovers
  just above its peg. She holds the lean through the seat (pelvis kept over the upright bike),
  the planted leg's knee against the bike and a sideways push on the bars, on a spring-damper
  plus the bike's weight moment, and she stands on the planted foot with the load that balances
  her and the bike about the tyre contact line (at most 350 N). A tip the other way brings the
  other foot down. Pulling away she first pushes the bike upright with that foot (push-off), then
  lifts it, bringing it up in front of the peg.
* **Creeping, walking the bike**: below 0.6 m/s (or while she walks it) the foot on the ground is
  planted — it stays where it is while the bike rolls on (its leg's joint targets move at the
  rates that cancel the seat's motion at the ball of the foot) — and steps: before the shin would
  wrap behind the peg, or if it has not found the ground within 0.25 s, she unweights it, lifts it
  and sets it down ahead by the bike's travel. Faster, the foot skims just above the ground on a
  compliant leg and comes down onto it as the bike leans onto that side. Walking the bike (G / B
  keys, left stick): standing on the planted foot (≥ 250 N) she pushes her pelvis 180 N forward or
  back through it, easing off at 0.35 m/s; only stopped or the way it already rolls.
* **Foot dab** (a reflex): the bike going down under her at speed — a tyre sliding (rear slip angle
  over 6°, front over 8°, fed from the tyre model: what she feels through the seat) while the bike
  rolls further into its lean faster than 30°/s — puts the inside foot out after a 0.15 s reaction
  time, 0.4 m ahead of the peg (flat-track style), pressed into the ground with up to 400 N while
  she pushes the bars towards upright; the boot slides with the sole's friction. The foot comes
  back when the cue has been gone 0.3 s, or at once if the bike snaps back up (a foot left down
  would lever it over the other way). A slide the bike rides through (its lean held) leaves her
  feet on the pegs: put out on the slide alone, her leg swinging out upset the recovery when the
  tyre gripped again (see below). Reaction time, reach and push are declared priors.
* **Support**: the chassis' virtual standstill roll support (below 0.8 m/s, fading out by 2 m/s)
  gives way to her down to a 40 % share (`riderBio.config.balanceAssist`, declared) only as far as
  her foot on the ground actually carries load (150 N, filtered over 0.3 s), aimed at the lean onto
  her foot; stepping, skimming or with the foot still coming down it stays at full strength.
* Servo saturation: a joint at its torque limit keeps its implicit damping (a saturated muscle
  still resists fast stretch; without it a foot held at its limit against a stiff contact rang
  step to step). Leg IK starts from at least 10° of knee bend (a knee locked straight is the
  leg's singularity: the foot would never be brought back up).
* **Coupling**: her contact forces enter the V5 generalized forces (the grips also load the
  steering axis), her body integrates after the bike with the same forces (momentum exchanged
  exactly); the V5 mass matrix and gravity become bike-only (the V5 values lump a 75.337 kg rider).
* **Checks** (`tests/rider_biomech.test.mjs`, stub bike; the falling-bike rig mirrors the browser
  support coupling): weight on the bike within 2 %, static drift < 5 mm, trunk and head nearer the
  vertical than a bike rocking ±8° at 0.5 Hz, seated through a 1 g stop (< 8 cm forward, < 5 cm
  up, back in place after), 0.8 g drive, 0.8 g turn; stopped on a bike free to fall (foot down on
  the side it leans to, bike within 6°, measured 2.6-2.7°; her foot carries 93 N on the left,
  30 N on the right, averaged over the last second — the virtual support the rest); creeping at
  0.3 m/s (9 steps in 6 s, the planted foot moving at 0.018 m/s on the ground); a low-side at
  8 m/s with the rear sliding (the bike let go at 25° and falling under gravity: her foot is on
  the ground 0.37 s later, past 45°, and takes up to ~0.9 kN; 60° is reached in 0.450 s with the
  dab, 0.448 s without — her leg cannot hold a falling 211 kg bike at that lean, and from 10-20°
  it also lands past 45°); the same slide with the lean held leaves her feet on the pegs — plus
  the 14 maneuvers in the coupled simulation. Cost: ~0.45 ms
  per 540 Hz step (forces, integration, amortized IK) and ~2 ms per frame for skinning (headless
  CPU).
* **Measured in the browser** (V5 bike, flat road): stopped she holds it at ~3° with her foot on
  the ground most of the time (~130 N mean on the left); rolling at 0.3-1 m/s with the clutch in
  and no walking the bike stays up (≤ 5.4° of lean over 6 s); walking it from rest reaches
  0.31 m/s in 4.8 s. The dab reflex does not fire in any of the 14 maneuvers (in `brakeGrab` the
  front-lock low-side is over before her reaction time). Rear tyre over a low-grip patch at
  12 m/s and 25° of lean (the maneuver lean controller steering), dab on vs off: patches of
  μ 0.3-0.35 for 0.35-0.5 s — 4 of 8 ridden through, the same 4 with and without the dab, crash
  times within 0.01 s (with the foot put out on the slide alone it was 5 crashes vs 4: none
  prevented, one caused); μ 0.2-0.25 for 0.5-0.7 s — all 5 crash either way, her foot takes
  1.6-2.3 kN and the crash comes later in 2 (3.50 vs 3.15 s, 3.56 vs 3.40 s); in one of those,
  held up on her foot, the bike was flicked over the other way when the rear gripped again.
* **Coming off** (a crash): the bike leaning past 70°, past 45° with its bodywork (fairing, bars,
  frame, tail, belly) on the ground, or both her grips torn open: she lets go of the bars and her
  muscles drop to a quarter of their riding gains on the posture she was in, with no gravity
  feed-forward (her limbs lie where they fall), fading to 3 % over 1 s; she slides, tumbles and
  comes to rest on her own contacts (ground friction 0.55 × the surface grip - 0.5 on grass). What
  she does next is the off-the-bike layer (below). Rear-patch low-side at 12 m/s: she comes off at
  56° as the fairing touches down and stops 2.5 m from the bike; a flick when the rear grips
  again tears her grips open and throws her over it.
* **Not yet / known**: standing wheelie control; hang-off builds slowly
  (lift-and-shift across the seat). After she has walked the bike, her planted leg can keep
  nudging it along (0.35 → 0.47 m/s over 2 s): the leg's posture targets assume the planned
  pelvis orientation, and re-orienting the pelvis through a planted foot pushes the ground back
  (measured: the servo part of the leg's torques is equivalent to a 300-400 N backward push).
  The dab takes a share of a fall, it does not save one (measured above).
* Auto rider: hangs off with 1.2 s-filtered lateral g from the heading rate (style 0.9), tucks
  from 33 m/s, sits up braking hard at speed; `radius60` holds 38° of lean at 0.68 g.

## Off the bike (`48_rider_onfoot.js`)

The same body, contacts and joint-torque servos (motor-driven, not muscle-driven: her muscles
drive her only while she rides - see above); this layer plans for them while she is off the bike. Everything here is CANDIDATE: gains and timings are
declared priors, and three declared assists (below) carry part of her balance - measured and
reported, not hidden.

* **Standing**: her centre of mass over the middle of her feet (she leans a few degrees at the
  ankles, as people do); the legs carry her weight as forces through the feet (τ = Jᵀ F), each
  foot pushing at a centre of pressure under the controller's choice and the ground's push
  pointing at her centre of mass (an inverted pendulum: no moment about it); the capture point
  is steered to the middle of the feet. Stance ankles are soft (12 % of their servo gain): their
  torque is what places the centre of pressure. Soles have width off the bike (inner/outer edge
  spheres at heel and ball; riding, the centre row is her contact as before).
* **Walking / turning**: she lifts a foot once her capture point is just inside the other one,
  and sets it down where the capture point will be at touchdown, less the steady-gait offset for
  the speed she is told (l / (e^ωT − 1)), out to its side (W / (e^ωT + 1)), with speed feedback
  along her heading; the swinging foot follows its path through the joint servos fed with the
  planned joint rates. Turning is stepping: the pelvis faces at most 40° from the foot it stands
  on, each step turns the foot at most 70°, her velocity turns no faster than 2 m/s² sideways
  allows, reversals slow down first, and on the spot she turns at 1 rad/s.
* **Declared assists**: (1) a pelvis torque towards upright and her heading (≤ 120 N m);
  (2) a catch: once her capture point is further from the foot she stands on than
  0.3 m + 0.12 s × her speed, a force through her centre of mass holds it there (m ω² per metre,
  ≤ 500 N) - a spotter's hand; (3) getting up, a force (≤ 150 N) and torque (≤ 200 N m) on the
  pelvis towards each phase's pose.
* **Getting up**: at rest on the ground (her centre of mass < 0.25 m/s for 0.6 s, then 1.5 s
  more) she rolls face down, pushes up onto hands and knees (hands under the shoulders, knees
  under the hips, pelvis at 0.5 m), plants her toes and lifts her knees so the hips go back and
  up over her feet with the hands still down (a deep squat), then rises over 1.2 s, trunk and
  pelvis pitching back to upright, arms forward, the on-foot balance holding her.
* **Going down**: after her reaction time (0.15 s), while she still moves faster than 0.5 m/s,
  protective reactions at 35 % of her gains: arms out towards where she falls (forward: both,
  elbows soft; sideways: that arm; backwards: tucked across the chest), chin tucked, legs
  gathered; sliding on the ground, arms in by her chest. At rest she lies for a daze that grows
  with how hard her head and trunk hit the ground (0.8 s + 0.6 s per kN, at most 4 s), then gets
  up.
* **Walking herself somewhere** (to get on, to lift the bike): a path round the bike, not through
  it (its footprint with her half-width as a box, the way through its corners where it must), the
  last 0.55 m sidestepped facing the way she will stand, turning on the spot at 1.5 rad/s; the
  stick takes over at any time.
* **Motions at the bike** (getting on and off, lifting): keyframes in the bike's frame (at its tyre
  line, sheared with its lean so what is placed by the bike - over its seat, beside its tail -
  leans with it while the ground stays the ground; frozen once it goes onto its stand or while it
  is lifted) - pelvis position, pitch, side tilt and twist, the chest level across, feet and knees
  through via points, hands on the grips or points of the bike. A keyframe ends when its pose is
  reached (pelvis and a swung knee or foot within 6-12 cm, a hand sent to a grip holding it, the
  bike steady where it is held); a leg that cannot get over is put back down beside the standing
  foot (getting off: back onto its peg, and she sits again), the hands let go and she stands. A
  motion is over when her pelvis stays 0.25 m under its plan for 0.3 s - she has fallen: she lets
  go, lies, and gets up - or, lifting, when a hand stays 0.3 m off its point of the bike for 0.5 s
  (she lets go and stands up). The posture is solved by IK from the planned pelvis at 135 Hz
  (joint targets held between), the trunk from where her pelvis is and the arms from where her
  trunk is, legs in the air kept 1.5 cm clear of the bike (a swung leg 3 cm, looked for 8 cm
  deep), the trunk 1.2 cm. A hand that reaches its grip closes on it and turns to it (the bar
  across the palm); the grip's hold point starts where the hand is and slides to the bar over
  0.12 s (closing from up to 6 cm away no longer snaps it in: a 1.3 kN spike before). Her weight
  and the bike are carried through her contacts by the load path (next); a declared assist - force
  ≤ 300 N and torque ≤ 150 N m at her centre of mass - carries only what the plan could not give
  her contacts (its shortfall on the net force and moment), reported (`motionN`).
* **The whole-body load path** (46 `loadPlan` / `loadFeedForward`, 45 `contactForcePlan` /
  `boundedLSQ`), used in the motions at the bike: the forces at her contacts that give her the
  net force and moment her balance asks for, with the least joint effort - a bounded least-squares
  problem over non-negative weights of each contact's force directions (feet: the sole spheres in
  contact, each a friction pyramid n ± μ′t with μ′ = 0.9 μ/√2; a held grip: six axis directions,
  each ≤ 0.7 × its strength; a palm on the bike; a foot on its peg). What else rests on the bike
  or the ground (a hip against the seat, a thigh, the chest) is measured, not chosen: a known load.
  Rows: the net force and moment about her centre of mass (weight 10⁵ per body weight and per
  body weight × 0.1 m), what her contacts must do to the bike about its tyre line (below; 25 per
  20 N m), and each joint's torque as a share of its capacity (squared), with
  τ = τ₀ − Σ Jᵀ f (τ₀: inverse dynamics with the pelvis held, of gravity and the measured
  contacts, less the passive tissue torque); a joint over 85 % of its cap is weighted up by its
  overshoot to the 4th power (two passes). The feed-forward is that inverse dynamics with the
  planned forces added. Her balance asks for her centre of mass to go to where her planned
  posture has it (25 1/s², 10 1/s, ≤ 2.5 m/s² across; 36, 12, ≤ 3 m/s² up and down) and for the
  pelvis's orientation (8 kg m² × (36 e − 12 ω)). The posture follows the load: holding the bike
  she leans her pelvis into it by what the bike needs over her weight (M / m g, ≤ 0.2 m, 3 1/s)
  with 70 % of her feet's pressure towards the outer foot; her centre of mass is kept over where
  her feet press (5 cm dead band, ≤ 0.15 m) - fore and aft, and across the bike when she is not
  holding it up - except over the leg-over keys, whose paths are balanced as found. Planned at
  135 Hz; the whole motion step costs 0.35 ms in Node. Joint-servo torques, not muscle forces.
* **The leg over**: the hip and the pelvis's side tilt do it. The swung leg's three hip joints are
  solved to point the thigh at a knee target and turn it so the lower leg trails towards a foot
  hint; the knee is folded to an easy angle at 35 % of its servo gains, the ankle loose near
  neutral at 15 %. The paths are data (48: `G.swingPaths` - four keys getting on, three getting
  off: the pelvis, the swung knee and foot and the chest at each, the pose each starts from and
  where it ends), found offline by hill-climbing (`node tools/swing-path.mjs search
  mount|dismount`) with this leg's own hip reach and ranges (hip-only IK, the knee at its easy
  angle) against the 916's envelope, scored on the swung knee, calf and foot's clearance (to
  3 cm), the knee reaching its targets, the standing leg reaching its foot, and - getting on -
  her centre of mass over it and her left hand on its grip. `node tools/swing-path.mjs check`
  re-measures the paths the game runs (kinematic, standing still: the dynamics add their own
  error): getting on, the bike at −2°: knee, calf and foot ≥ 2.9 cm clear, the thigh 0.6 cm, the
  knee within 3.0 cm of its targets, the standing foot within 0.5 cm, her centre of mass at most
  2.7 cm past its allowance (5 cm either way of a point 5 cm towards the bike from the standing
  foot's middle), her hand within 0.2 cm of its grip; getting off, over the bike on its stand at
  −10°: 1.1 cm (where the knee starts, against the tank; her seat stays on the seat's edge), the
  knee within 3.6 cm. Getting on, the path: leaning over the tank, the knee back and out, up
  behind her beside the tail, across over the seat's middle as the pelvis tilts right side up,
  on past its far edge, then down onto the seat.
* **Holding the bike up** while getting on: she keeps it leaning 2° onto her side (−2°, her
  standing leg's) - nearly balanced. What it needs about its tyre line - its weight's moment at
  that lean and her own hold on the lean error (3000 N m/rad, 400 N m s/rad) - is a row of the
  load path: her hands on the bar and the tank, braced through her arms, trunk and hips into her
  legs, carry it with the least joint effort. What her contacts do not give it, a declared
  residual - a roll moment on the bike towards the lean, ≤ 450 N m, reported (`holdNm`) - holds.
  She stands on one foot to swing only once the bike is within 2.5° of that lean and steady
  (≤ 6°/s); if it tips 8° away during the swing she puts the leg back down. Tipping towards her
  past what her hands hold (3° beyond that lean, fully by 7°), she braces her hip against it: her
  pelvis goes over into it (up to 0.14 m further) until her hip rests on its flank, and her legs
  take it through her hip (a measured contact on the load path). Past saving - 20° beyond - she
  lets it go and steps away from it. (Node, the bike free to roll, shoved towards her for 0.5 s:
  600 N m - it tipped to 16°, her hip on it with up to 986 N, back to −2° and she got on; without
  the brace's extra reach, 18.4°. 900 N m - past 20° at some 50°/s, she let it go; braced on it,
  the falling bike can knock her down.) As her weight lands on
  the seat the riding controller (46) takes her on and balances the bike with her left foot down.
  Stopped and parked, the bars are at full lock with the left grip against the tank: with her hand
  at the grip she turns them straight - rate-controlled against the standing tyre's scrub,
  ≤ 60 N m about the steering axis.
* **Getting off** (stopped, seated, left foot down): the side stand first - she lets the bike lean
  over onto it and waits until it rests there (within 2° of −10°, ≤ 6°/s); then her right hand from
  its grip to the tank, up off the seat onto her left leg as her right leg goes back over the tail
  and down behind her left foot, her hands off the bike, and the walking controller steps her
  clear. A leg caught on its way over goes back onto its peg and she sits again.
* **Lifting it off its side**: she walks round to its upper side and faces it, squats and holds its
  tank's and seat's top edges (on its side away from the ground), rises as it comes up to 35°,
  steps in twice, pushes it upright and over to lean on its side stand (on its left, at −10°) -
  lying on its right it goes over away from her: she lets go as it passes upright and stands back
  into balance (leaning on it, she followed it down); from its left it comes towards her and she
  eases it onto the stand - and stands. The bike is raised by a declared lift assist - a
  roll moment on it about its heading towards the roll she asks for (≤ 1200 N m) - not by her
  hands' own forces (as a force square to the bike at her hands it carried much of the bike's
  weight off its tyres and pushed it sideways: part way up it slid out of her hands). Off
  the bike its rear brake is held, standing in for a bike left in gear with its engine stopped:
  after a crash the rear wheel kept the spin it had (70 rad/s measured), and when she lifted the
  bike onto its tyres it drove it 1.4 m out of her hands.
* **Joint effort and range** (telemetry `riderBio.onFoot.effort` / `lastMotion`): per joint group
  (hips, knees, ankles, spine, neck, arms) the servo's active torque as a share of that joint's
  capacity (the R1.5 torque ledger) and whether a joint is in the stiff end of its range (within
  its passive stop's width of a limit), live and per motion and keyframe - an awkward motion (a
  muscle near capacity, a joint in its end stop) shows here. Caveat: the shoulder's
  abduction/adduction reads "at its limit" when the arm simply hangs (its passive rest is -55°, its
  range starts at -40°).
* **Bike** (F / pad X): stopped, F gets her off; by a fallen bike F lifts it; by one standing F gets
  her on (she walks there first). Off the bike its throttle is shut, clutch in, front brake held
  while she holds it or it stands.
* **Camera and controls**: off the bike the camera follows her (drag or right stick to orbit,
  wheel to zoom; walking she draws it round behind her); WASD / arrows / left stick move her
  relative to the camera, Shift / right trigger run.
* **Checks** (`tests/rider_onfoot.test.mjs`, flat ground): standing 5 s without a step, trunk
  within 2.5°, balance torque under 15 N m rms; told 1 m/s ahead, 8 s and over 3.5 m without a
  fall; turning on the spot to face the other way; a seeded 30 s random-stick player without a
  fall; down on her back, front and side she is standing again within 12 s, the get-up assist's
  mean force under a quarter of her weight; getting on the stub bike from its stand (bars straight
  and at full lock) - seated within 16 s, riding with both grips and her left foot down, the motion
  assist's mean under a fifth of her weight, over the leg-over the swung ankle's mean effort under
  15 % and never in its end stop, the knee under 30 %, no abort; getting off and walking away
  (there the stub bike is kinematic: it follows the lean she keeps it at - `holdStub`). With the
  stub bike free to roll (`rollStub`: its weight, roll inertia and damping about its tyre line,
  her contacts' reactions on it, a one-sided side stand at −10°, lying on its side at 86°, and the
  same declared residual and lift assist as the browser): getting on she holds it up - her own
  mean moment on it over 5 N m, the residual's mean under 120 N m and never at its cap, the lean
  within 6° - and nothing but her hands presses it with 300 N or more before she sits; getting off,
  the side stand first and the bike on it, still, at the end, she on her feet and walking away;
  lifting it off either side, onto its stand with her standing, her own mean moment on it while it
  rises under 120 N m back down, and, off its right side, then getting on; shoved towards her
  (600 N m for 0.5 s) while she holds it up, her hip on it with over 300 N, the tip under 20° and
  she gets on; shoved harder (900 N m), she lets it go.
* **Measured** (Node, flat ground). Getting on (from 1.3 m away, the bike on its stand, bars
  straight / at full lock, the kinematic stub): seated after 10.9 s (6.6 s at the bike); getting
  off 5.8-5.9 s; the motion assist 94 N mean (≤ 300 N). Over the leg-over (2.6 s getting on, 2.5 s
  getting off) the swung leg's mean effort: hip 26-28 % / 23-24 %, knee 11 % / 8 %, ankle 5-6 % /
  1 % (never in its end stop); getting on, the standing leg's hip 36-38 %, knee 40-48 %, ankle
  37-47 %, getting off its ankle 68-76 %; the arms 96-97 % (left, on the bar: its clavicle, the
  arm chain's root, at its declared 40 N m capacity) and 72 % (right, on the tank) getting on,
  76-78 % and 70-71 % getting off. The bike free to roll: getting on, seated after 11.5 s, the lean
  within 3.0° of −2° (0.4° mean), her own moment on it 20-27 N m mean against the residual's
  59-60 N m (max 354-357 N m of its 450). Standing it up off its stand needs 195 N m (mean over that keyframe):
  she gives 33 N m, the residual 144 N m; over the steps and the leg-over (40-55 N m needed) her
  share is −15 … +38 N m. Her contacts hold it by lifting the left grip (about 74 N) and pressing
  the tank (about 105 N), her left clavicle at 94-95 % of its capacity. Getting off, 6.0 s from the
  stand going down to her on her feet. Lifting it, from 2 m away: on its stand 8.4 s (off its left
  side) / 9.9 s (right) after she is told, her own mean moment on it while it rises 76 / 85 N m
  back down (200-450 N m before its hand points were put on its upper side), the lift assist at its
  1200 N m cap through most of the rise. Walking and getting up (measured at commit 0988565, not
  since): told 0.6 / 1.0 / 1.4 m/s she walks at 0.44 / 0.72 / 0.96 m/s (balance torque 32-52 N m
  rms); 12 of 13 scripted scenarios pass; random stick input, 8 × 30 s walking: 1 fall, the catch
  acting 24 % of the time at 95 N rms; with running mixed in, 6 × 30 s: 4 falls (these counts move
  with small changes to the controller - a fall is chaotic); getting up after a push from 5
  directions: 3.3-3.7 s from rest to the squat, the get-up assist averaging 140 N and 150-165 N m.
  Before the hip-driven leg-over (the whole leg solved to a foot target) the swung ankle sat in its
  dorsiflexion end stop 97-100 % of the time at up to its full capacity.
* **Browser** (the 916's chassis, headless; `node tests/browser/at-the-bike.mjs`; outcomes vary
  from run to run). Getting off and on (4 runs): every run got her off - the stand down, off and
  standing 7.8-8.3 s after F - and, walked away and back, on again and riding off, seated
  12.3-17.7 s after F; in 2 of them she fell once on her feet on the way (once walking into the
  bike as the test first walked her, once on the way to get on) and got up. The residual 83-117 N m
  mean, at most 327-450 N m (at its cap once). After a low-side crash at 12 m/s (3 runs with the
  lift as it now ends): in 2 she got up, walked to the bike, lifted it onto its stand (16.2 / 25.0 s
  after F; the lift assist 467-470 N m mean, at most 1000-1066 N m) and got on (19.7 / 18.5 s after
  F) and rode off; in 1 her hands lost the bike while she stepped in with it at 40° - she let go and
  it fell back. The runs before these found the rear wheel's spin, the hand points and the lift's
  push. The stand holds the parked bike at −12 … −14°, not −10° (below).
* **Not yet / known**: running is a fast walk (no flight phase) - told 3 m/s she falls; the
  swinging foot lands 5-8 cm from its aim. Holding the bike up, the declared residual does about
  three times what her own contacts do (standing it up off its stand, four times), and her left
  arm - its clavicle, at a declared 40 N m - is at its capacity doing it: the load reaches her
  trunk and legs, but through an arm root far weaker than a real shoulder girdle. The hip brace
  and letting go are measured in Node only. In the browser the side stand is the
  chassis's virtual support aimed at −10° (a spring, 4000 N m/rad, from either side: it sags to
  −12 … −14° under the bike's weight); in Node it is a hard one-sided stop. The lift is the
  declared assist's, not hers: her hands only press (palm contacts), they do not pull. At the end
  of getting off the motion assist is at its cap for 1-2 s as her right foot comes down behind the
  left. The catch assist does real work and is the first thing to reduce.

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

Riding muscle-driven (default) against the pre-muscle rider (`--motors`: servos as joint motors),
the same build, headless:

| Maneuver | Her muscles | Joint motors |
| --- | --- | --- |
| coast 20 m/s hands off | self-stable (|roll| 0.4°), 0.13 g engine braking + drag | |roll| 0.2°, 0.13 g |
| coastSlow 6 m/s | capsizes (below the self-stable band: physical) | capsizes |
| standstill | foot down, bike at 4.2° | 2.8° |
| brakeFirm 16 / 5 bar | 0.81 g, stops in 4.05 s | 0.81 g, 4.05 s |
| brakeMax (front slip -6…-9 %, eased as the rear goes light) | 0.93 g, 49.9 m, rear down | 0.97 g, 49.9 m |
| brakeGrab 40 bar step, no ABS | front lock, over the bars — no numeric explosion | the same |
| brakeAbs 55 bar | 1.73 g peak, rear lift ≤ 58 mm, stops in 3.65 s | 1.73 g, 57 mm, 3.55 s |
| stoppie | rear lifted ~17 cm and set down | ~17 cm |
| launch | 1.14 g; the bike rolls to 13.3° under her (motors 3.6°) | 1.15 g |
| wheelie | held at ~26° | ~27° |
| lean35 | steady 35° lean | 35.8° |
| radius60 (0.68 g, hang-off) | 39.6°, steady (it weaved and fell at 8.5-9.9 s before her feet and holds) | 39.9°, steady |
| slalom ±22° / 1.2 s | ±17.6° | ±16.8° |
| burnout | stationary, rear spinning | the same |

14 of 14 within bands on her muscles (feet as tripods, neural elastic holds).

(brakeMax: threshold braking with her pelvis at the muscle-efficient 18° pitch put her weight far
enough forward that braking on front slip alone went over the bars - motors too; the maneuver's
rider now also eases the lever as the rear goes light, as a rider does and rear-lift mitigation
does.) Muscle-driven riding costs ~45 % more simulation time (~0.1 ms per rider step for the muscles).

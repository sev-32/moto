# Her movement: the whole picture

What makes a person's movement look alive is not any one controller: it is a body with real
mass, strength and give, moved by muscles that hold as much as they push, steered by senses that
lag and blur, by what she knows of her body and her surroundings, and by how tired she is. This is
the map of those fundamentals for the LUCID rider - what the engine has, what it only
approximates, and what it does not have yet - and the order they are being built in. The
measured detail of each piece is in `PHYSICS.md`.

## Principles

1. **Intent is a feeling, muscles hold it.** Her planned postures and tasks (the servo law, IK,
   orientation tasks) are the neural intent; riding, her muscles make it, within their strength.
   What the muscles cannot make is not made.
2. **Not every muscle is a motor.** Most of her muscles hold: a tone, and a recruitment that grows
   the further they are stretched past the posture they have settled into - soft near it, firmer
   beyond (an elastic hold, Feldman's λ model). The prime movers do the task on top; the holding
   muscles give balance and stability.
3. **Feel drives the automated parts of movement.** A hand does not go to a point within a
   millimetre: it puts the palm roughly on the bar, feels where it landed, and narrows in while the
   fingers close. A foot comes up once it feels light, reaches down until it feels the ground, rolls
   until the pressure under it sits in the middle of its tripod. A leg that feels itself pushing far
   harder than meant gives.
4. **A foot is a tripod, not a peg.** Heel, big toe's ball, little toe's ball - soft pads that
   stiffen as they load - with the toes a flap that holds a relaxed angle and stiffens as it is
   bent, and an ankle whose roll the sole's feel works. Ankle, metatarsals and toes act together.
5. **She knows her own strength** and asks her body for no more than it has; tired, she has less
   (her muscles and grips tire and recover: `R.fatigue`).
6. **Senses are delayed and partial.** Touch takes tens of milliseconds, sight a couple of hundred;
   she sees where she looks, not everywhere. (Largely not yet modelled - see below.)
7. **Gaze leads action.** People look where they are going to go or reach before they move there:
   through a turn before leaning into it, at a grip before reaching for it, at the ground before a
   foot goes down. (Her gaze and head lead; her body does not yet wait for her eyes, and she still
   knows what she has not looked at.)
8. **Everything is declared.** Priors are stated as priors, assists are declared and measured, the
   package's canonical data is not rewritten, and anything beyond it is a candidate until the owner
   approves.

## The layers

### Body (the plant)

| Piece | State | Where |
| --- | --- | --- |
| Skeleton, masses, joint axes and ranges | R1.5 17-body profile on the Semantic51 rig (46 hinges) | 45, 46 `buildModel` |
| Passive tissue (joint stiffness, soft end stops) | R1.5 priors on every hinge | 46 `passiveTau` |
| Muscles | R1.5 84 musculotendon proxies, MuJoCo muscle model; triceps split (candidate) | 46_rider_muscles |
| Soft tissue contact | spheres fitted in her skin; sitting band, pelvis front, knees | 46 contacts |
| Feet | anatomical tripod from the package's plantar region, soft-to-firm pads, toe flap on the asset's toe DOF | 46 `foot`, `footToes` |
| Hands | strength-limited bilateral grip; finger poses by synergy (render) | 46 grips |
| Short-range muscle stiffness | **missing** (MuJoCo's Hill model has none; tone gives no instant stiffness) | - |
| Arch compliance (midfoot) | **missing** (the foot is rigid heel to metatarsal heads) | - |

### Senses

| Sense | State | Where |
| --- | --- | --- |
| Touch - soles | load per pad, centre of pressure, ground normal; 30 ms skin delay | 46 `R.feel` |
| Touch - palms | palm on the grip's rubber (closing the hand) | 46 `canCloseGrip` |
| Touch - seat, knees, pegs | forces exist per contact; not yet read as feel (the "seat of the pants": the bike's slide and lean felt through the seat) | partial |
| Proprioception (joint angles, speeds, muscle lengths) | read exactly and instantly | **no delay, no noise** |
| Vestibular (head rotation, gravito-inertial acceleration) | the felt vertical (gravity + sustained turning acceleration, filtered) sets her posture; the head is held in space | 46 `gFilt`, head task |
| Vision - gaze | she fixes points in the world (saccades between them); her head carries its share, leading her body | 46 `R.gaze`, 48 |
| Vision - what she sees | **missing**: no field of view; she knows the ground and the bike exactly, looked at or not | - |
| Effort | muscle activation per region, Σa², share of intent made (telemetry, HUD) | 46 telemetry |

### Knowledge (body schema, spatial knowledge)

| Knowledge | State |
| --- | --- |
| Her body: limb lengths, reach, joint ranges | exact (the IK uses her true model) |
| Her strength | her intent is kept within the directional strength of the muscles spanning the trunk and neck; servo torque limits from the R1.5 capacity ledger |
| The bike: grips, pegs, seat, tank, its lean and speed | exact, read directly |
| The ground: height, slope, grip | exact where the foot goes (read from the world) - she should know it where she has looked, and feel it once there |
| Where she is going | the player's intent / scripted motions |

### Control

| Layer | State |
| --- | --- |
| Intent: IK postures, servo law, trunk / head orientation tasks, reach task | riding on muscles; off the bike joint motors (declared) |
| Feel loops: grip capture, foot lift when light, reaching for the ground, the tripod's roll, a strut that gives | done (see principle 3) |
| Elastic holds: tone + stretch recruitment | riding on muscles; toes always |
| Reflexes: dab when the bike goes down, protective reactions (0.15 s), bracing, clamp on a shaking bike | done (declared timings) |
| Anticipation | braking brace, felt vertical; few forward models |
| Gaze-led action | partial: her head leads (the road through the turn, the path, the bike she walks to, the grip she reaches for); her body does not yet wait for her eyes |

### Physiology

| Piece | State |
| --- | --- |
| Strength | per muscle (R1.5 Fmax), force-length-velocity |
| Fatigue | per muscle and per grip, three-compartment motor units (3CC-r): fatigued units make no force, rest recovers them; her intent knows what is left (CANDIDATE rates) |
| Recovery, effort preference | resting tone; the allocation minimises activation |
| Arousal, attention, reaction time | a fixed 0.15 s reaction for protective movements; a daze after a head / trunk impact |

## Order of work

1. ~~Feet as tripods, plantar feel, toes that hold, neural elastic holds~~ (done; `PHYSICS.md`).
2. ~~**Gaze**: where she looks, per activity, the head leading and the body following~~ (done:
   `PHYSICS.md`, *where she looks*; the ground where a foot is going is not yet a gaze target).
3. ~~**Fatigue**: per muscle, the three-compartment model, recovery at rest, her intent's strength
   following it~~ (done, CANDIDATE rates: `PHYSICS.md`, *her fatigue*; off the bike her motor-driven
   joints leave her muscles resting).
4. **Senses with delay and a view**: proprioceptive and vestibular delays in the feedback loops
   that can bear them; vision limited to where she looks (the ground known where she has looked);
   the seat and bars read as feel of the bike (a slide felt through the seat before it is seen).
5. **Short-range stiffness** in the muscles (instant, tone-proportional give-resistance) and the
   arch's give.
6. **Off the bike on muscles**: standing, walking and the motions at the bike driven by her muscles,
   with the same holds and feel.

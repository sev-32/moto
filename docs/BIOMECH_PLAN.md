# The causal body: horizon view and execution plan

Written 2026-11-13 from a read of `sev-32/moto` (this branch, at `ed251a0`) and the `sev-32/BioRig`
research branches (R574-R591 seated MuJoCo bench, R26-R30 walking audits, the semantic atlas and the
R584 forensic report). It is a plan, not a result: every hypothesis below names the cheapest
experiment that would confirm or kill it. Everything proposed is CANDIDATE until the owner approves.

Two roles execute it. **Lead** = the deep-reasoning model (control design, diagnosis, decisions).
**Builder** = the fast model (instruments, tools, tests, merges, docs). A third, most expensive
reviewer is only needed at the three decision gates (D1-D3), and each gate is fed by a one-page
report so that review stays cheap.

## 1. Where the project actually is

One body, two implementations, one goal: movement that is caused by anatomy, muscle capacity,
passive tissue, contact and delayed feedback - never imposed.

| | JS body (`moto/src/core/44-48`) | MuJoCo body (`lucid_bcr`, BioRig R5xx) |
| --- | --- | --- |
| Runs in a cloud session today | **yes** - 102 of 103 unit tests pass in 96 s | no - frozen ZIPs are not in git |
| Plant | own Featherstone ABA, 46 hinges + floating pelvis, 84/88 muscles (MuJoCo muscle model, parity-tested), soft plantar soles | 84-muscle MuJoCo 3.15 free-root model, near-rigid contacts |
| Works on muscles alone | riding (14/14 maneuvers), quiet stance, 24/24 pushes, one-foot hold 9/10 | supported sitting 24 s after the R585 neck repair (provisional) |
| Fails | every step: forward falls in swing, side falls after 2nd landing, reactive falls at landing; DCM walk 2-5 landings | whole-body balance never accepted (R584) |
| Still on motors / assists | everything off the bike in the game (`48_rider_onfoot`), three declared assists | - |

Known baseline defect: `tests/rider_onfoot.test.mjs:196` (getting on the bike free to roll) fails
with "pressed it with 400 N". The last code commit (`efeb968`) says its tests and docs were not
updated.

## 2. Diagnosis: five causes behind most of the lost time

1. **Actuator authority gaps are found late, by falling.** The same defect class was discovered
   three separate times after controller tuning had failed: no muscle can nod the head forward
   (R585), the hip has no internal rotators so a newly loaded stance foot twists outward
   (`efeb968`), neck extensor moment arms flip sign at 55 deg of side bend (`PHYSICS.md`). Also
   declared: no deep neck flexors, no toe flexors, no pronator/supinator, 2 mm wrist arms, weak
   lumbar side-bend, hamstrings too short for a deep hang-off. No controller can fix a missing
   moment arm.
2. **The plan and the plant disagree about the ground.** The whole-body QP (`46_rider_wbc.js`,
   100 Hz) chooses ground forces as free variables on a rigid floor; the plant stands on
   exponential pads where force is a *state* that only changes as the foot moves. `PHYSICS.md`
   says it outright: "the plan takes the ground to be rigid and does not see a planted foot roll".
   The mismatch is small in quiet stance and largest at touchdown and weight transfer - exactly
   where every step fails. `forceCap` / `land_ramp_s` are a hand-made patch for this.
3. **Results are single trajectories of a marginally stable loop.** The same controller survives
   at 270 Hz and falls at 540 Hz (BioRig R27). One deterministic run is therefore not evidence of
   stability, and parameters fitted on MuJoCo's rigid feet (`neuro_stance_v2.json`) are being
   reused on soft soles.
4. **The acceptance contract narrows silently.** R584: a pelvis-only "settled" gate passed while
   the head hung at 83 deg. In moto each test has its own ad-hoc bands and the "not yet / known"
   list lives in prose, not in executable tests.
5. **There is no single executable truth.** The newest walking candidates
   (`46_rider_wbc_r25.js`, R29, R30 - 145 KB against the committed 79 KB) and the whole MuJoCo
   lineage exist only in ZIPs outside git. Sandboxes without the assets produced retrospective
   trace audits (R26, R27, R29, R30) instead of fresh physics. The instrumentation experiments
   (`experiment-20261020-*-r2..r7`: balance probe, work ledger, two-sided rider/bike energy) were
   never merged.

## 3. Strategy

Instruments before controllers. Plant before plan. A step before a walk. Zero delay before delay.
Model-based before learned. The JS body is the product runtime and, for now, also the lab, because
it is the one that runs everywhere; MuJoCo becomes the high-throughput lab once parity fixtures
exist (Phase 5).

## 4. Work packages

Each package ends with a commit, updated tests, and a report of at most one page in
`docs/lab/REPORT_<id>.md` (what was changed, measured numbers, what did not work).

### Phase 0 - one executable truth (Builder, about one session)

- **P0.1 Baseline receipt.** Run `npm test`, `npm run build`, `npm run test:browser`,
  `npm run test:maneuvers`; record pass counts, wall time and commit in `docs/lab/BASELINE.md`.
- **P0.2 Fix or declare the failing mount test.** Bisect `tests/rider_onfoot.test.mjs:196` over
  the last four code commits (suspects: `4552eb5` plantar soles, `efeb968` WIP stepping). Fix the
  regression if it is one; never widen a band to get green.
- **P0.3 Land the probes.** Merge `origin/experiment-20261020-rider-interface-energy-r7` (the
  superset of r2-r7; instrumentation only, opt-in flags). Keep the README of this branch. Move the
  `CHECKPOINT_R*.md` files under `docs/experiments/`. Acceptance: maneuver numbers unchanged with
  probes off.
- **P0.4 Make the frontier executable.** For each "not yet" item in `PHYSICS.md` (*On her own
  muscles, standing*) add a `{ todo: true }` test in `tests/rider_wbc.test.mjs` that states the
  target: step forward / side / back and recover, reactive step after a 150 N push, walk 10 steps
  and stop. Update `PHYSICS.md` for what `efeb968` changed.
- **P0.5 (needs the owner) Recover the out-of-git frontier.** If the owner supplies
  `LUCID_BioRig_R25_CODE_AND_EVIDENCE_20261021.zip` (SHA-256 `2453e61e...87a73`, recorded in BioRig
  R26) and the R29 / R30 packages: verify the hash, diff `46_rider_wbc_r25.js` against the committed
  controller, land the differences behind opt-in flags, and run them **fresh**. If they are not
  supplied, continue from `efeb968`; nothing below depends on them.

### Phase 1 - instruments (Builder builds, Lead reviews the definitions)

- **P1.1 Whole-body gate** (`tests/lib/gate.mjs`). One definition of a valid episode, used by every
  muscle-driven test, restoring the R541 coverage that R562 lost. Candidate thresholds: head to
  thorax <= 15 deg in quiet tasks (<= 30 deg transient, back under 10 deg within 1 s); pelvis
  <= 10 deg, chest <= 25 deg; no ground contact except the soles; sole slip <= 10 mm per stance;
  no unplanned contact on/off chatter; zero assists and zero motors; finite state; ends settled
  (centre-of-mass speed < 0.05 m/s, capture point >= 1 cm inside the support for the last 1 s).
  It reports the first violated criterion and its time, not just pass/fail.
- **P1.2 Episode recorder and ensemble runner** (`tools/lab/ensemble.mjs`, `worker_threads`).
  Scenario x perturbation seeds (joint angles +-0.5 deg, small velocities, push timing and size
  +-10 %, friction 0.6 / 0.8 / 1.0, physics rate 270 / 540 / 1080 Hz). Output: survival fraction
  with a Wilson 95 % interval, margin distributions, time-to-fail and first-violation histograms,
  as `lab/out/scoreboard.json` plus a Markdown table. From here on a capability "passes" when the
  lower bound of its interval is >= 0.8 over at least 32 seeds; single runs are anecdotes.
- **P1.3 The capability ladder** (scenarios for P1.2):
  S0 quiet stance 10 s · S1 pushes 60-100 N, four directions · S2 one-foot hold, both feet, onsets
  0.8-2.0 s · S3 step and recover (forward 0.15 / 0.30 m, side, back) · S4 reactive step, 150 N
  push · S5 walk 10 steps and stop, then 20 steps at 0.8 m/s · S6 turn, strafe, start / stop ·
  S7 seated on a stool 24 s plus a 120 N hip push (the R587 / R590 protocol on the JS body, which
  unifies the two lineages without the archives) · S8 S0-S5 again under 20 / 40 ms sensing delay.
- **P1.4 Fall forensics** (`tools/lab/why.mjs`). From a failing trace, the ordered chain of what
  hit a limit first: muscle activation bounds, centre of pressure at the polygon edge, friction
  cone, joint range, the largest QP task residuals by row group, and planned versus realised
  ground force per foot. Twenty lines of output, not a data dump.
- **P1.5 Actuation authority atlas** (`tools/character/authority_atlas.mjs`, output
  `docs/AUTHORITY_ATLAS.md`). For every hinge, both directions, over the lawful poses and over
  postures sampled from stance, one-foot, step, seated and riding traces: the largest isometric
  torque the muscles can make, against gravity demand at that posture and against literature
  strength for a 75 kg adult (declared priors). Flags: single-signed degrees of freedom, sign flips
  inside the range, arms under 5 mm, capacity under 1.5 x demand. Plus a whole-body static
  feasibility solve (least maximum activation that balances gravity) at one-foot stance, mid-swing,
  touchdown and deep hang-off. A unit test pins the flag list so the asset cannot regress unseen.
- **P1.6 Rate and replay study** (`tools/lab/replay.mjs`). Record the excitations of a 540 Hz
  one-foot run and replay them open-loop at 270 / 540 / 1080 / 2160 Hz. If the open-loop
  trajectories agree, the rate sensitivity is closed-loop marginal stability (go to P2.2 / P2.3); if
  they diverge, it is the integration of the pads (fix that first).
- **P1.7 Matched skinned review** (`tools/lab/render-trace.mjs`). Replay a recorded trace through
  the built page with Playwright and write a contact sheet of the skinned body from the same states
  the metrics came from. Required for every ladder milestone; the owner approves pictures, not
  numbers.

**Gate D1** (review of `REPORT_P1.md`): do the atlas, the forensics and the replay study confirm
causes 1-3? Reorder Phase 2 by what the scoreboard says is losing the most episodes.

### Phase 2 - the plant and the plan-plant contract (Lead)

- **P2.1 Musculature candidates** (like `scmNodAntagonist`: opt-in, R1.5 stays verbatim by
  default). In the order the atlas ranks them; expected first: hip internal rotators (wire
  `tools/character/hip_rotators_experiment.mjs`, Rajagopal 2016 - it already took the walk from 2 to
  5 landings), deep neck flexors and a wrap that stops the extensor arms flipping, a lumped toe
  flexor / extensor pair. Each with its source, an A/B on the scoreboard, and owner approval.
- **P2.2 A contact-consistent plan.** (a) Bound each sole's planned force by what its pads can
  reach within one control tick from the measured force - the same idea the controller already
  uses for activations (`excitationInterval`) - replacing `forceCap` / `land_ramp_s`. (b) Feed the
  capture-point law the measured centre of pressure (`R.feel`), not the planned one. (c) Give the
  contact rows the pads' linearised roll / pitch compliance so the plan sees a planted foot roll.
  (d) In double support weight each foot's share of the support by its measured load (BioRig R30's
  idea, now in fresh dynamics). Acceptance: planned-versus-realised ground force error in the first
  100 ms after touchdown at least halved; S3 survival up; spread across physics rates down.
- **P2.3 Stabilisers between control ticks** (physiology candidates, one at a time): short-range
  muscle stiffness (activation-proportional, instantaneous - item 5 of `MOVEMENT.md` pulled
  forward) and the riding layer's stretch holds on the stance ankle and hip abductors. These are
  what make a landing robust now and sensing delays bearable later.

### Phase 3 - locomotion (Lead)

- **P3.1 The step is the unit.** S3 and S4 to the pass criterion, gate-clean, both feet, before
  any walking work.
- **P3.2 Online step adaptation.** Check `walkStep` first: the walk tracks a pre-planned footstep
  and capture-point path. Replace it with placement and timing chosen each tick from the capture
  point's offset (Khadiv et al. 2016 / 2020), step width from the lateral state at mid-stance
  (Bruijn & van Dieen 2018), touchdown triggered by what the sole feels, not by the clock.
- **P3.3 Walk, stop, turn** (S5, S6), then refit the controller's parameters on this body with
  CMA-ES over the ensemble objective (survival, margins, head stability, effort) into a declared
  candidate file - the package's values were fitted on rigid feet.

**Gate D2** (after P3.2, budget three Lead sessions): if a 10-step straight walk is still under
50 % survival, switch the stance leg to a reflex controller (Geyer & Herr 2010; Song & Geyer 2015:
load-triggered phases, positive force feedback, placement from centre-of-mass state) and keep the QP
for standing and transitions. Reflex control tolerates delay and soft ground by construction and is
the closest published match to "movement emerges from the body".

### Phase 4 - into the product

- **P4.1 Wire it into the game** (Builder, Lead reviews): standing first, replacing 48's motor
  stand and its assists, then walking. Run the planner in a Web Worker; its one-tick latency is
  then the modelled neural delay rather than a cost.
- **P4.2 Senses with delay** (Lead): delay lines on proprioception and the vestibular sense
  (the R575 0 / 20 / 40 ms protocol), a forward predictor, and S8 as a survival-versus-delay curve.
- **P4.3 The motions at the bike on muscles** (Lead): getting on and off, lifting it, getting up;
  the deep hang-off once the atlas says which muscle limits it.

**Gate D3**: owner review of the skinned contact sheets and the scoreboard before 48's motors are
retired by default.

### Phase 5 - lab and horizon (not blocking)

- **P5.1 Parity fixtures JS <-> MuJoCo** (needs the R1.5 package from the owner): accelerations and
  short contact-free rollouts from identical states and activations. This is what lets MuJoCo serve
  as the fast lab for optimisation and, later, learning.
- **P5.2 One body, many worlds**: extract layers 44-48, the character assets and their tests into a
  standalone package in `BioRig` that `moto` consumes; they are already pure JS.
- **P5.3 Learned layers** only on top of a robust model-based walker (as teacher and prior): the
  R574 intent selector, the AMASS calibration line (R31-R42) as a naturalness metric, not as
  motion to track.

### Riding backlog (Builder, independent of everything above)

The low-speed weave on muscles (+-16 deg after the stoppie against 1.5 deg on motors, unbanded);
`brakeGrab` ending end-over-end where a low-side was intended; rear sag 22 mm against a 32 mm
target; the 15 cm rider centre-of-mass disagreement; `rollOn` has no band; the one-foot hold asked
at 0.8 s on the left (the one failure in ten).

## 5. House rules for whoever executes

1. `src/legacy/` is never edited. Canonical R1.5 data is never rewritten; additions are opt-in
   candidates with a named source.
2. No external forces, joint motors or pose overrides in anything called "on her muscles". Assists
   are declared and counted by the gate.
3. Fresh physics only. A retrospective audit of old traces is not progress and is not reported as
   a result.
4. One variable per experiment, A/B on the ensemble, same seeds. Three failed variants of one idea:
   stop, write the negative result in `docs/lab/LEDGER.md`, move on.
5. Never tune on one seed, one rate or one foot. Never widen a band to pass.
6. Every claim in `PHYSICS.md` cites a test or a scoreboard row. "Not yet" items are `todo` tests.
7. Economy: do not read `46_rider_biomech.js` (231 KB) or `PHYSICS.md` whole - grep by function or
   heading. Run the targeted test file while iterating (`node --test tests/rider_wbc.test.mjs`,
   about 15 s) and the full suite (about 100 s) once before committing. Write traces to
   `lab/out/` (git-ignored) and summarise in twenty lines.

## 6. What only the owner can do

1. Supply the archives (R25 / R29 / R30 code-and-evidence ZIPs; the R1.5 `lucid_bcr` package or the
   R574 ZIP) somewhere a cloud session can fetch them, for P0.5 and P5.1.
2. Approve or reject at D1-D3: the gate thresholds, each musculature candidate, short-range
   stiffness, retiring the motors.
3. Confirm the split proposed here: JS body = product runtime and day-to-day lab; MuJoCo = fast
   lab once parity exists; BioRig = eventual home of the standalone body.

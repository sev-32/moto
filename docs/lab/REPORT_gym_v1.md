# Gym v1: first claim-grade scoreboard

`node gym/run.mjs --seeds 32 --md docs/lab/SCOREBOARD.md` at `f6671fc`: 2 methods, 23 events, 32 seeds
each, 1088 episodes (8,022 simulated seconds, 47 CPU-minutes, 11.8 minutes on 4 cores). Every
episode jitters the start (joints +-0.3 deg), the commands' timing (+-20 ms), the pushes and the grip
(1.0 / 0.8 / 0.6, cycling with the seed). The table is `SCOREBOARD.md`; this is what it says.

| | muscles alone (`wbc`) | joint motors + declared assists (`motors`) |
| --- | --- | --- |
| level 1 Stand (5 events) | **cleared**, 5 of 5 PASS (32 of 32 each) | **cleared**, 5 of 5 PASS |
| level 2 Shift and hold | 2 of 6: shoves fwd / back PASS, left / right UNSURE (27, 29 of 32), **one-foot hold FAIL (1 of 32 left, 0 of 32 right)** | 4 of 4 applicable PASS (no one-foot command: 2 N/A) |
| level 3 Step | **0 of 7**: steps 0-2 of 32, reactive step 16 of 32 | the reactive shove PASS, with **0 steps** (6 step events N/A) |
| level 4 Walk | walk **0 of 32** | turn 31 of 32 PASS; walk 30 of 32 UNSURE (the lower bound is 80 %) |
| level 7 Recover | N/A | get up from back / front / side: 31, 32, 32 of 32 PASS |
| grade / D points | **1** / 11.0 of 70.5 | **1** / 43.5 of 70.5 (level 2 stops at its N/A events) |

## What it says that the tests did not

1. **By the whole-body gate the muscles clear level 1 and not level 2.** The unit test that "passes"
   a one-foot hold passes at one exact timing: with the command's tick moved by 9 ms the right foot's
   head ends at 46 deg instead of 2.8 (measured while validating the adaptor), and across 32 jittered
   starts the head reaches a 90th-percentile 118-151 deg (the docs' 54-78 deg is the unperturbed run).
   The pelvis-and-chest bands of `tests/rider_wbc.test.mjs` said "held".
2. **The 100 N shove is on the edge for left and right.** Of the 8 failures, 4 are at 30.1-31.6 deg
   (the head limit is a declared prior, 30), the other 4 are real collapses (66-165 deg). Forward and
   back (31, 32 of 32) are inside the limit.
3. **Every step event fails by the head**, whichever foot and direction, including the step out that the
   unit-test probe showed landing and standing (the head swings out to 40+ deg on the way).
   `stand.push150.reactive`: 16 of 32, with no clear grip trend (grip 1.0: 3 of 10; 0.8: 8 of 11; 0.6: 5 of 11).
4. **The motor walker passes a 150 N "reactive step" without stepping.** 32 of 32, 0.0 steps, 5.6 N m rms of
   its declared pelvis balance torque: the assist holds her. The table's last column is there for this: a
   pass with a spotter is a different thing from a pass alone, and the muscles declare none. Its get-ups
   use up to 50 N of get-up force and 65-99 N m rms of balance torque.
5. **The game's walker falls at the start of a walk on low grip**: both failures (2 of 32) are grip 0.6, the
   pelvis down at 2.3 s, 0.1 m from the start. Not yet looked at; it is what the next gym run should
   be pointed at (and what P1.4's forensics is for).

## Things found while building it (fixed)

* `walkTo` made the motors' gaze look at the stub bike, which the tests park 100 m *above* the ground:
  head 50 deg, a false failure. The stub is now 700 m away on the ground.
* A command's timing is an ensemble axis (+-20 ms) because of 1 above.
* The gym's muscle adaptor reproduces `tests/lib/wbc-harness.mjs` exactly (same FSM times to the
  millisecond, same head angles; `tests/gym.test.mjs`).

## What is soft

* The gate's thresholds (head 30 deg, 10 deg at the end, 0.05 m/s settled, 0.6 / 0.8 m pelvis) are
  priors of mine. A walker looking down at the ground legitimately dips its head; the current events
  do not exercise that (the motors' walk peaks at 16 deg). They need the owner's approval (plan, D1).
* The grip axis cycles with the seed, so it is confounded with it; per-grip pass rates are n = 10-11.
* 32 seeds is the minimum for a PASS; a claim about the 80 % line needs more where a rate sits near
  it (the motors' walk, the muscles' left / right shove).
* One body, flat ground, no sensing delay: docs/GYM.md, *What it is not (yet)*.

## Next rungs

1. Terrain (slope, stairs, a beam) and the stool-and-shove event: levels 5 and the S7 seated line.
2. The ensemble axes the plan calls for: sensing delay, physics rate, payload, fatigue.
3. `gym/why.mjs`: from a failing trace, the order in which things hit a limit (P1.4), aimed first at
   the muscles' one-foot hold and the motors' low-grip start.
4. A third method: the reflex stance controller (plan gate D2) enters as an adaptor and a column.

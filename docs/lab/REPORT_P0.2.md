# P0.2 - the failing "getting on the bike free to roll" test

Test: `tests/rider_onfoot.test.mjs:196`, assertion `maxPressN < 300` ("her legs and body brush it at
most - under 300 N - until she sits"). Failed with `pressed it with 400 N` at `ed251a0`.

## Bisect (first bad commit)

The single test was run in a clean worktree at each commit (`--test-name-pattern`, about 5 s each).

| commit | result |
| --- | --- |
| `79f3d8d`, `efb1ee7` | pass (251 N) |
| `6725892` "Where she looks, her fatigue, a side stand that holds, and runs that repeat" | **fail (400 N)** |
| every later commit to `efeb968` | fail (400 N) |

The test file did not change in `6725892`; the source did (gaze and fatigue in `46_rider_biomech.js`,
the gaze targets in `48_rider_onfoot.js`, the side stand in `30_chassis_dynamics.js`).

## Cause: a marginal leg-over, not a model fault

* The 400 N is the peak of a smooth ~100 ms graze of the **right calf** against the bike while the
  right leg swings over the tail (mount key 8, t = 11.34-11.45 s). It rises 243 -> 398 -> 22 N; it is
  not a one-step spike and not a force cap.
* The peak is hypersensitive. Same scenario, one change at a time (current keys):

  | variant | peak press |
  | --- | --- |
  | as committed | 400 N |
  | `fatigue.on = false` (grip strength 0.7 % higher at that moment) | 255 N |
  | gaze yaw limits 0 | 240 N |
  | gaze head / pitch share 0 | 170 N |
  | fatigue rates x2 | 218 N |

  `6725892` did not break the motion; it nudged a path that clears the bike by too little. The
  kinematic check (`node tools/swing-path.mjs check mount`) shows why: the search scores clearance
  only up to 3 cm (`Math.min(r.low, 0.03)`), the knee is 3 cm off its target kinematically, and the
  dynamic leg is not the kinematic one.

## Fix

1. `tools/swing-path.mjs`: new `--clear <cm>` (default 3: behaviour unchanged) sets the clearance the
   hill-climb aims for.
2. `node tools/swing-path.mjs search mount --seed 1..6 --iters 900 --clear 6`; kept seed 4 (the best
   of the two seeds that reached >= 6 cm and the only one whose default-run press stayed low).
3. `src/core/48_rider_onfoot.js`: the four mount keys replaced by seed 4's (`SWING_ON.keys`);
   `start`, `stance`, `final` and every dismount key untouched.

| | before | after |
| --- | --- | --- |
| kinematic clearance, knee / calf / foot, worst | 3.1 cm | 6.2 cm |
| balance past its allowance at worst | 1.9 cm | 0.4 cm |
| standing foot off its spot / sole tilt at worst | 0.4 cm / 0.1 deg | 1.5 cm / 2.0 deg (limit ~3 deg) |
| thigh clearance at worst | 0.6 cm | -0.1 cm (1 mm into the envelope, as before: it slides over the seat) |
| dynamic peak press, 5 perturbed runs (above) | 400 / 255 / 240 / 170 / 218 N | 237 / 184 / 175 / 128 / 223 N |
| `tests/rider_onfoot.test.mjs` | 15 of 16 | **16 of 16** |

Seed 6 (6.4 cm) was tried and rejected: its thigh presses 380 N in the default run.

## Limits

Five perturbed runs are a probe, not an ensemble; the peak now moves from the calf to the spine / thigh
at the end of the leg-over (175-237 N). The bound was **not** widened. P1.2's ensemble should take over
this measurement (`maxPressN` over perturbed starts, friction and physics rate), and the mount keys
should be re-searched under it.

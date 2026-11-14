# The gym: a training camp for the body

An agility course, from standing still to the things a gymnast does, on which **every way of moving
her** - muscles, joint motors, a reflex controller, whatever comes next - is judged by the same
events, the same whole-body gate and the same statistics. It is where a claim about the body becomes
a number, and where a controller is trained and found out.

Why it exists (`docs/BIOMECH_PLAN.md`, section 2): the project kept losing time to single runs of a
marginally stable loop (the same walker survives at 270 Hz and falls at 540 Hz), to acceptance
gates that looked at the pelvis and not the head (R584), and to controllers compared on different
tests. A gymnast is not judged on one attempt, on one judge's glance, or against a different
apparatus each time.

```bash
node gym/run.mjs --list                                   # the events
node gym/run.mjs --seeds 8 --md docs/lab/SCOREBOARD.md    # everything, every method, 8 seeds each (a few minutes, 4 cores)
node gym/run.mjs --methods wbc --level 1-3 --seeds 32     # one method, easy levels, a claim-grade sample
node gym/run.mjs --events hold. --seeds 4 --no-vary --mods '{"jointStdDeg":0}'   # no perturbation: the unit tests' physics
```

First results: [`docs/lab/SCOREBOARD.md`](lab/SCOREBOARD.md) and [`docs/lab/REPORT_gym_v1.md`](lab/REPORT_gym_v1.md).

## What a run is

* **Event** (`gym/events/`): data. A level and a difficulty value `D`, a length `T`, a script of
  intents (`stand`, `hold`, `step`, `walkTo`, `turn`, `ragdoll`, ...), disturbances (a push on a named
  link), the gate's thresholds and an optional `check` for what the gate does not say.
* **Method** (`gym/methods/`): an adaptor that turns the intents into whatever that controller
  does, and reports what it can observe and what it spent: `supports` (the intents it has - an event
  needing one it lacks is **N/A**, never a failure), `command`, `step`, `observe`, `metrics`
  (steps taken, muscle effort, **declared assists used**). v1: `wbc` (her muscles alone, 46) and
  `motors` (joint motors with their declared assists, 48).
* **Episode** (`gym/core/episode.mjs`): one method on one event for one seed. Deterministic: the same
  `(method, event, seed, mods)` gives the same record anywhere. The seed jitters the start (every joint
  +-0.3 deg), the commands' timing (+-20 ms), the pushes (time, size, direction) and the ground's grip
  (1.0 / 0.8 / 0.6).
* **Gate** (`gym/core/gate.mjs`): the one definition of a sound episode - finite; the pelvis never
  down; the **head within 30 deg of upright at every instant** and 10 deg at the end; nothing but the
  soles bearing on the ground; back on two feet and the centre of mass at rest at the end. It names the
  rule that broke first, and when. An event may override a threshold or turn the transient rules off
  (falling and getting up: only the end counts).
* **Ensemble** (`gym/core/ensemble.mjs`): the seeds, in parallel worker threads. A success rate is
  judged by its Wilson 95 % interval: **PASS** if the lower bound is at least 80 %, **FAIL** if the
  upper bound is under it, **UNSURE** otherwise (more seeds). Eight clean runs are UNSURE, not PASS.
* **Scoreboard** (`gym/core/report.mjs`): per method, the level ladder (CLEARED / PARTIAL / NOT
  CLEARED / N/A), the **grade** (levels cleared in a row from 1), the **D points** earned of those
  possible, and per event how it fails and what assists it leaned on. `docs/lab/SCOREBOARD.md`.

A method that passes with a spotter's hand is not the same as one that passes alone: the table shows
the assists each pass used, and a muscles-only method declares none.

## The ladder

Difficulty is what the body must do, not how long it takes. "Built" = events exist now.

| level | name | what it asks | built |
| ---: | --- | --- | --- |
| 1 | Stand | hold still; a 60 N shove at the chest, four directions, without a step | yes |
| 2 | Shift and hold | a 100 N shove; shift onto one foot and hold the other up | yes |
| 3 | Step | place a foot out / forward / back; answer a 150 N shove with whatever steps it needs | yes |
| 4 | Walk | walk 2.5 m and stop; turn on the spot through 180 deg | yes |
| 5 | Move | change speed; walk backwards and sideways; slopes, stairs, a step over an obstacle; tandem and a narrow beam | needs terrain |
| 6 | Agile | cuts and pivots at speed; hop on one foot; jump in place, broad jump; drop landings from 0.3 / 0.6 m | needs flight phases |
| 7 | Recover | get up from the ground (done); a trip mid-stride; a slip (grip drops); a shove during a step; a controlled fall and roll | partly |
| 8 | Skill | carry a load; reach a shelf; throw and catch; get on and off the 916, lift it, hold its lean | the 916 events exist in `90_maneuvers` / `48` |
| 9 | Elite | jog, run; the same events with 20 / 40 ms of sensing delay and with fatigue | needs delay lines (P4.2) |
| 10 | Gymnast | bars, rings, a handstand, a cartwheel, a vault | far |

Modifiers make any event harder without a new event, like a gymnast's start value: sensing delay,
a payload, fatigue (`R.fatigue` already exists), a lower grip, a slope, a stiffer or softer floor, a
physics rate of 270 / 540 / 1080 Hz. An event is a base `D` plus its modifiers'.

## Adding things

* **An event**: `add({ id, level, D, T, script, disturbances, gate, check })` in `gym/events/index.mjs`.
  Write the intent in method-agnostic terms ("walk 2.5 m"), not in one controller's ("request 10 steps").
* **A method**: a module in `gym/methods/` with `id`, `title`, `drive`, `assists`, `supports` and
  `create({ world, rng, mods })` returning `{ command(c), step(dt, pushes), observe(), metrics() }`; register
  it in `gym/methods/index.mjs`. Its first scoreboard is the answer to "does it beat the others".
* **An intent**: name it, give it to the methods that can do it. The others turn N/A on its events.

## What it is not (yet)

* The ground is flat (grip varies). Slopes, stairs, a beam, a moving platform are the next apparatus.
* One body: the JS rider. A second plant (MuJoCo, P5.1) would run the same events through its own adaptor.
* No sensing delay or vision limits (P4.2) and no physics-rate axis (P1.6).
* Traces are kept for the first two episodes of each event; replaying them through the skin renderer for
  the matched visual review (P1.7) is not built.
* It judges; it does not yet train. `runEpisode` is deterministic and cheap enough (about 0.4 s of CPU per
  simulated second for muscles) to be the objective of a CMA-ES over a controller's parameters (P3.3).

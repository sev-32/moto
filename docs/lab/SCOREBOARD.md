# Gym scoreboard

Generated 2026-11-14 at `f6671fc` by `node gym/run.mjs`: 32 seeds per event, grip scale cycling 1.0 / 0.8 / 0.6, 708 s wall.
PASS = the lower 95 % bound of the success rate is at least 80 %; FAIL = the upper bound is under it; UNSURE = more seeds are needed. N/A = the method has no such command (not a failure). A success is an episode with no violation of the whole-body gate (`gym/core/gate.mjs`) and of the event's own check.

## Joint motors + declared assists (48_rider_onfoot)

Drive: motors. Declared assists: pelvis balance torque, capture-point catch, get-up force.

**Grade 1** (levels cleared in a row from 1) · **43.5 of 70.5** D points

| level | status | events passed |
| ---: | --- | --- |
| 1 | CLEARED | 5 of 5 |
| 2 | PARTIAL | 4 of 4 (2 N/A) |
| 3 | PARTIAL | 1 of 1 (6 N/A) |
| 4 | PARTIAL | 1 of 2 |
| 7 | CLEARED | 3 of 3 |

| level | event | D | n | passed | 95 % interval | verdict | how it fails | head max p90 | steps | assists used |
| ---: | --- | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | --- |
| 1 | stand.push60.back | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 3.2° | 0.0 | 4.7 N m rms |
| 1 | stand.push60.fwd | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 2.9° | 0.0 | 3.7 N m rms |
| 1 | stand.push60.left | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 2.8° | 0.0 | 4.0 N m rms |
| 1 | stand.push60.right | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 2.8° | 0.0 | 4.4 N m rms |
| 1 | stand.quiet | 1 | 32 | 32 | 89%-100% | **PASS** |  | 2.9° | 0.0 | 2.8 N m rms |
| 2 | hold.L | 2.5 | - | - | - | N/A | | | | |
| 2 | hold.R | 2.5 | - | - | - | N/A | | | | |
| 2 | stand.push100.back | 2 | 32 | 32 | 89%-100% | **PASS** |  | 3.8° | 0.0 | 7.7 N m rms |
| 2 | stand.push100.fwd | 2 | 32 | 32 | 89%-100% | **PASS** |  | 3.3° | 0.0 | 4.8 N m rms |
| 2 | stand.push100.left | 2 | 32 | 32 | 89%-100% | **PASS** |  | 3.3° | 0.0 | 5.8 N m rms |
| 2 | stand.push100.right | 2 | 32 | 32 | 89%-100% | **PASS** |  | 3.4° | 0.0 | 6.2 N m rms |
| 3 | stand.push150.reactive | 3.5 | 32 | 32 | 89%-100% | **PASS** |  | 3.9° | 0.0 | 5.6 N m rms |
| 3 | step.back.L | 3 | - | - | - | N/A | | | | |
| 3 | step.back.R | 3 | - | - | - | N/A | | | | |
| 3 | step.fwd.L | 3 | - | - | - | N/A | | | | |
| 3 | step.fwd.R | 3 | - | - | - | N/A | | | | |
| 3 | step.out.L | 3 | - | - | - | N/A | | | | |
| 3 | step.out.R | 3 | - | - | - | N/A | | | | |
| 4 | turn.180 | 4 | 32 | 31 | 84%-99% | **PASS** | settled x1 | 12.6° | 7.8 | 64.2 N m rms, catch 28 N |
| 4 | walk.2m5 | 4 | 32 | 30 | 80%-98% | **UNSURE** | up x2 | 16.2° | 17.5 | 30.6 N m rms |
| 7 | recover.getup.back | 7 | 32 | 31 | 84%-99% | **PASS** | end-up x1 | 129.4° | 1.9 | 78.6 N m rms, catch 47 N, get-up 50 N |
| 7 | recover.getup.front | 7 | 32 | 32 | 89%-100% | **PASS** |  | 130.8° | 1.0 | 98.8 N m rms, catch 20 N, get-up 27 N |
| 7 | recover.getup.side | 7 | 32 | 32 | 89%-100% | **PASS** |  | 156.2° | 1.8 | 64.9 N m rms, catch 11 N, get-up 44 N |

## Muscles: whole-body QP (46_rider_wbc)

Drive: muscles. Declared assists: none.

**Grade 1** (levels cleared in a row from 1) · **11.0 of 70.5** D points

| level | status | events passed |
| ---: | --- | --- |
| 1 | CLEARED | 5 of 5 |
| 2 | PARTIAL | 2 of 6 |
| 3 | NOT CLEARED | 0 of 7 |
| 4 | NOT CLEARED | 0 of 1 (1 N/A) |
| 7 | N/A | 0 of 0 (3 N/A) |

| level | event | D | n | passed | 95 % interval | verdict | how it fails | head max p90 | steps |
| ---: | --- | ---: | ---: | ---: | --- | --- | --- | ---: | ---: |
| 1 | stand.push60.back | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 6.4° | 0.0 |
| 1 | stand.push60.fwd | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 6.1° | 0.0 |
| 1 | stand.push60.left | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 6.3° | 0.0 |
| 1 | stand.push60.right | 1.5 | 32 | 32 | 89%-100% | **PASS** |  | 6.3° | 0.0 |
| 1 | stand.quiet | 1 | 32 | 32 | 89%-100% | **PASS** |  | 6.2° | 0.0 |
| 2 | hold.L | 2.5 | 32 | 1 | 1%-16% | **FAIL** | head x31 | 150.7° | 1.0 |
| 2 | hold.R | 2.5 | 32 | 0 | 0%-11% | **FAIL** | head x32 | 117.6° | 1.0 |
| 2 | stand.push100.back | 2 | 32 | 31 | 84%-99% | **PASS** | head x1 | 6.5° | 0.0 |
| 2 | stand.push100.fwd | 2 | 32 | 32 | 89%-100% | **PASS** |  | 7.8° | 0.0 |
| 2 | stand.push100.left | 2 | 32 | 27 | 68%-93% | **UNSURE** | head x5 | 31.6° | 0.2 |
| 2 | stand.push100.right | 2 | 32 | 29 | 76%-97% | **UNSURE** | head x3 | 28.5° | 0.1 |
| 3 | stand.push150.reactive | 3.5 | 32 | 16 | 34%-66% | **FAIL** | head x16 | 150.9° | 1.3 |
| 3 | step.back.L | 3 | 32 | 0 | 0%-11% | **FAIL** | head x32 | 167.8° | 3.1 |
| 3 | step.back.R | 3 | 32 | 0 | 0%-11% | **FAIL** | head x32 | 165.0° | 3.2 |
| 3 | step.fwd.L | 3 | 32 | 2 | 2%-20% | **FAIL** | head x29, head-end x1 | 154.3° | 2.3 |
| 3 | step.fwd.R | 3 | 32 | 0 | 0%-11% | **FAIL** | head x30, head-end x2 | 162.4° | 2.5 |
| 3 | step.out.L | 3 | 32 | 0 | 0%-11% | **FAIL** | head x32 | 143.2° | 1.9 |
| 3 | step.out.R | 3 | 32 | 0 | 0%-11% | **FAIL** | head x32 | 149.4° | 1.9 |
| 4 | turn.180 | 4 | - | - | - | N/A | | | |
| 4 | walk.2m5 | 4 | 32 | 0 | 0%-11% | **FAIL** | head x32 | 156.7° | 3.8 |
| 7 | recover.getup.back | 7 | - | - | - | N/A | | | |
| 7 | recover.getup.front | 7 | - | - | - | N/A | | | |
| 7 | recover.getup.side | 7 | - | - | - | N/A | | | |

## Events

| id | level | D | what |
| --- | ---: | ---: | --- |
| stand.quiet | 1 | 1 | Quiet stance for 10 s |
| stand.push60.fwd | 1 | 1.5 | 60 N shove at the chest, fwd, hold your ground |
| stand.push60.back | 1 | 1.5 | 60 N shove at the chest, back, hold your ground |
| stand.push60.left | 1 | 1.5 | 60 N shove at the chest, left, hold your ground |
| stand.push60.right | 1 | 1.5 | 60 N shove at the chest, right, hold your ground |
| stand.push100.fwd | 2 | 2 | 100 N shove at the chest, fwd, hold your ground |
| stand.push100.back | 2 | 2 | 100 N shove at the chest, back, hold your ground |
| stand.push100.left | 2 | 2 | 100 N shove at the chest, left, hold your ground |
| stand.push100.right | 2 | 2 | 100 N shove at the chest, right, hold your ground |
| hold.L | 2 | 2.5 | Shift onto the left foot and hold the other up |
| hold.R | 2 | 2.5 | Shift onto the right foot and hold the other up |
| step.out.L | 3 | 3 | Step the left foot out 0.12 m, then stand |
| step.out.R | 3 | 3 | Step the right foot out 0.12 m, then stand |
| step.fwd.L | 3 | 3 | Step the left foot forward 0.15 m, then stand |
| step.fwd.R | 3 | 3 | Step the right foot forward 0.15 m, then stand |
| step.back.L | 3 | 3 | Step the left foot back 0.12 m, then stand |
| step.back.R | 3 | 3 | Step the right foot back 0.12 m, then stand |
| stand.push150.reactive | 3 | 3.5 | 150 N shove at the chest: take whatever steps it needs, then stand |
| walk.2m5 | 4 | 4 | Walk 2.5 m straight ahead and stop |
| turn.180 | 4 | 4 | Turn on the spot through 180 deg and stand |
| recover.getup.back | 7 | 7 | Limp, shoved back, down on the ground: get up and stand |
| recover.getup.front | 7 | 7 | Limp, shoved front, down on the ground: get up and stand |
| recover.getup.side | 7 | 7 | Limp, shoved side, down on the ground: get up and stand |

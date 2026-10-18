# Pose lab: shaping how she rides

The rider is physical: her muscles move her, her contacts (hands on the grips, the balls of her
feet on the pegs, her pelvis on the seat, her knees on the tank) carry her, and a planner decides
the pose she is reaching for. The **pose lab** puts that pose in an animator's hands while
leaving the physics hers: you set the intent, the IK keeps her contacts, her muscles carry it out
(and what they cannot make is not made - that is information, not a bug).

Open it on the ride page with the **POSE LAB** chip (bottom right).

## The two layers you edit

**Posture shapes** - where things go in each riding posture (the planner's priors, `R.plan.*`).
Her posture is an intent mixed from four controls - *tuck* (-1 sat up, alert ... +1 tucked for
speed), *hang* (-1 left ... +1 right), *stand* (0..1) and *foreAft* (-1..1) - and each shape says
what that posture does at full intent:

| Group | Controls |
| --- | --- |
| Seated (every posture's base) | pelvis on the seat fore/aft and height, pelvis pitch, trunk lean, head up, the elbow bend she keeps (her trunk leans until her elbows have it), knees on the tank |
| Tuck (tuck +1) | trunk further down, pelvis rolled forward, head up over the screen, **elbows bent further** |
| Sit up / braking | trunk more upright; braced under braking: pelvis forward / rolled forward |
| Hang-off (hang ±1) | pelvis across the seat and lower, pelvis rolled / turned in, chest rolled / turned in, trunk lower, head turned / rolled into the corner, inside knee out and down |
| Standing on the pegs | pelvis up and forward, trunk upright, pelvis rolled back, head down, knees forward and lower |

**Joint style** - the IK's preferred angle and weight for every joint (`R.pref`). Wherever her
contacts leave a joint free, the IK comes as close to your angle as the weight asks: *soft* and
*prefer* are tendencies, *firm* is strong, *pin* holds it where the contacts allow. (For the
elbows use the Seated / Tuck *elbow bend* shapes instead: those move her trunk so the bend is
possible with her hands still on the 916's long-reach clip-ons.)

## Live or frozen

- **Live**: she keeps riding; your edits apply at once and her muscles carry them out.
- **FREEZE**: the ride pauses and the lab shows the IK's pose for her targets as they are (her
  reach settled as riding would settle it). Every edit re-solves immediately - this is the posing
  mode. The *Posture shown* sliders hold her intent (hang / tuck / stand / foreAft) so you can
  pose each posture in turn; tick *her own* to give it back to the auto rider.

## Saving, loading, sending to me

| Button | What |
| --- | --- |
| EXPORT | the pose set as JSON (`lucid.rider.pose-set.v1`) |
| IMPORT | load a pose set |
| COPY | the pose set to the clipboard |
| BVH | the pose shown, one channel per Semantic51 joint DOF (degrees; root position in metres, z up) |
| OBJ | her skin in the pose shown (world metres, z up) |
| RESET | back to the build's defaults |

A pose set records both its **changes** (what differs from the build's defaults) and the full
**shapes** / **style**, so it applies to future builds as intent, not as a frozen snapshot.
Send me the JSON (paste it, or commit it to a repo): I apply it with
`LUCID_CORE.poseLab.apply(json)` and render it with the tools below.

```json
{
  "schema": "lucid.rider.pose-set.v1",
  "name": "tuck, elbows in", "author": "", "notes": "",
  "changes": {
    "shapes": { "tuckElbowDeg": 55, "headPitchDeg": 22 },
    "style": { "leftClavicle.elevationDepression": [-8, 1], "rightClavicle.elevationDepression": [-8, 1] }
  },
  "shapes": { "...": "every shape value" },
  "style": { "<Semantic51 DOF id>": ["preferred angle, deg", "weight: 0 off .. 3 pinned"] }
}
```

## Renders (what I send you)

- `node tools/pose-board.mjs [--pose-set FILE.json] [--cams side,front34,rear34]` - a labelled
  sheet of her postures (alert, seated, tucked, hung off, standing), frozen, from studio cameras.
- `node tools/capture-ride.mjs --maneuver radius60 --cams front34,rear [--pose-set FILE.json]` -
  a scripted ride (`LUCID_CORE.maneuvers.names()`) recorded frame by frame on a virtual clock
  (exactly 1/fps of ride per frame however slow the renderer), to MP4 and GIF. In the game,
  `LUCID_CORE.maneuvers.play("radius60")` plays the same ride live (`stop()` hands back the
  controls); maneuvers run on the flat reference road, as the tests run them.

Both need a build (`npm run build`) and ffmpeg for video (`FFMPEG=/path/to/ffmpeg`).

## What is CANDIDATE

Every shape and style value is a declared prior, not a measurement. The tuck's elbow bend (40°)
comes from your riding note - slowing down and alert: shoulders up, arms near straight; for speed:
arms bent, tucked - and is the first value set that way.

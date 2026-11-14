# Baseline receipt

What the project measures about itself today, so that later work is compared with numbers and not
with memory. Everything here was run in a cloud session (Linux, 4 cores, Node 22.23, the
pre-installed Chromium with SwiftShader - no GPU), from a clean checkout of
`claude/focused-darwin-1ymzxd`.

| | at `b528f31` (before P0) | at the P0 head |
| --- | --- | --- |
| `npm run build` | ok, 3 s, `dist/LucidMoto_V2.0.0_dev.html` 30.64 MiB, 26 core layers | ok, 2 s |
| `npm test` (unit, `node --test`) | 103 tests: **102 pass, 1 fail** (`rider_onfoot.test.mjs:196`), 96 s | 110 tests: **103 pass, 0 fail, 7 todo** (the frontier, below), 82 s |
| `npm run test:browser` (smoke) | 10 of 10 checks, 84 s | 10 of 10, 81 s |
| `npm run test:maneuvers` (muscle-driven rider) | 15 of 15 within bands, 72 s | 15 of 15, identical numbers (table below), 58 s |

The failing test is explained, bisected and fixed in `REPORT_P0.2.md`. The 7 `todo` tests
(`tests/rider_wbc_frontier.test.mjs`) are the muscle controller's frontier - steps, a reactive step and
a walk, each judged by a whole-body gate - and all 7 fail today, by design; `PHYSICS.md` (*Stepping and
the walk*) has what each does.

## Commands

```bash
npm run build
npm test                      # about 90 s on 4 cores; the full suite, not a selection
npm run test:browser          # headless Chromium; about 85 s
npm run test:maneuvers        # about 70 s
node --test tests/rider_wbc.test.mjs      # while iterating on the muscle controller, about 15 s
```

`/usr/bin/time` is not installed in the cloud image; use the shell's `time` or `date +%s`.

## Maneuvers (`npm run test:maneuvers`, physical rider on her muscles)

The same numbers before and after the R2-R7 probes were merged (P0.3: probes off).

| maneuver | sim s | max roll deg | decel g | accel g | lift F / R mm | stop s | crash s | dist m |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| coast | 5 | 0.379 | 0.131 | 0 | 0 / 0 | null | null | 86.6 |
| coastSlow | 5 | 28.677 | 0.131 | 0 | 0 / 0 | null | null | 25.3 |
| standstill | 4 | 3.822 | 0.025 | 0.026 | 0 / 0 | null | null | 0.1 |
| brakeFirm | 4.5 | 1.801 | 0.807 | 0.076 | 0 / 0 | 4.05 | null | 50.6 |
| brakeMax | 4 | 0.612 | 0.967 | 0 | 0 / 0 | null | null | 52.4 |
| brakeGrab | 0.8 | 12.673 | 2.574 | 0.001 | 143 / 1532 | null | 0.807 | 17.9 |
| brakeAbs | 4 | 1.046 | 1.514 | 0.086 | 0 / 25 | 3.65 | null | 46.7 |
| stoppie | 4 | 8.226 | 1.664 | 1.772 | 1 / 178 | null | null | 34.5 |
| launch | 4 | 11.765 | 0.021 | 1.14 | 22 / 0 | null | null | 18.6 |
| rollOn | 6 | 0.151 | 0.017 | 0.452 | 0 / 0 | null | null | 124.5 |
| wheelie | 6.5 | 0.575 | 0.245 | 2.298 | 595 / 0 | null | null | 136.6 |
| lean35 | 7 | 34.699 | 0.041 | 0.011 | 0 / 0 | null | null | 136.3 |
| radius60 | 10 | 38.143 | 0.014 | 0.022 | 0 / 0 | null | null | 143.5 |
| burnout | 5 | 2.919 | 0.141 | 0.134 | 0 / 0 | null | null | 0.1 |
| slalom | 8 | 16.499 | 0.032 | 0.018 | 0 / 0 | null | null | 138.9 |

`docs/PHYSICS.md`'s maneuver table was written before the later commits and differs slightly from
this one (for instance lean35 34.7 deg here against 35.2, slalom 16.5 against 17.1, brakeAbs
1.51 g against 1.53 g, brakeMax 0.97 g against 0.95 g). This table is the current baseline.

## Not covered by this receipt

Physics-rate (270 / 540 / 1080 Hz) behaviour, perturbed starts and any GPU timing are not measured
yet (P1.2, P1.6). The seven browser scripts from the R2-R7 experiments (`tests/browser/*-r*.mjs`,
`incident-classification`, `overturn-contact`, `posture-transition`) run on their own, about 25 s
each, and all pass (`docs/experiments/README.md`); they are not part of `npm test`.

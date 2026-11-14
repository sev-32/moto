# Experiments R1-R7 (2026-10-20): instrumentation, not physics

Seven GitHub branches (`experiment-20261020-*`: posture-regression, brake-incident-r2,
overturn-groundspeed-r3, pitch-balance-r4, nine-dof-balance-r5, force-work-ledger-r6,
rider-interface-energy-r7) were each one snapshot commit of a project archive, with no history in
common with this repository. R7 is a strict superset of the other six (checked: every file the others
differ in is in R7's difference), so only its diff against this branch was applied (P0.3 of
`docs/BIOMECH_PLAN.md`); the branches themselves are left as they are.

What came in:

| | where |
| --- | --- |
| notes per experiment | `docs/EXPERIMENTS_2026-10-20.md`, `INCIDENT_AUDIT_R2.md`, `OVERTURN_GROUNDSPEED_R3.md`, `PITCH_BALANCE_R4.md`, `FORCE_BALANCE_R5.md`, `MATRIX_EIGENSPECTRUM_R5.md`, `FORCE_WORK_LEDGER_R6.md`, `RIDER_INTERFACE_ENERGY_R7.md` |
| the analysts' continuity notes | `docs/experiments/CHECKPOINT_R4..R7.md` |
| opt-in probes | `30_chassis_dynamics.js` (`__motoBalanceProbe`, the work ledger), `46_rider_biomech.js` (`R.__interfaceProbe`), `90_maneuvers.js` (`probeBalance`, `probeWork`, `probeInterface`, termination reasons, event provenance) |
| browser scripts | `tests/browser/{incident-classification,nine-dof-balance-r5,overturn-contact,pitch-balance-r4,posture-transition,work-ledger-r6,rider-interface-r7}.mjs` |
| independent checks | `tools/verify_r5_matrices.py`, `verify_r6_work.py`, `verify_r7_interface.py` (need the evidence JSON, below) |

Verified here, with the probes off (their default): `npm test` 103 of 103, the browser smoke test, and
`npm run test:maneuvers` 15 of 15 with **numbers identical to the pre-merge baseline**
(`docs/lab/BASELINE.md`). `maneuvers.mjs` gained consistency checks for `brakeGrab` (front lock seen,
termination reason consistent with the attitude, no "body contact" without a proxy collision).

The seven browser scripts were run here for the first time (the analysts' environment had no
Playwright): all pass, 21-29 s each. Two (`nine-dof-balance-r5`, `work-ledger-r6`) pinned `lean35`'s
roll to the analysts' snapshot (34.716 deg; this repository's baseline is 34.699, a 0.017 deg
difference of base, not of the probes) and were repointed to 34.699 and given the stronger check
that the probe changes nothing (probe-on and probe-off roll equal to 1e-9).

Not in git: the `evidence/R2..R7` folders the notes cite (raw JSON, screenshots, logs) lived in the
analysts' sandbox. The verify scripts and the numbers in the notes are therefore not reproducible from
this repository until they are regenerated; the browser scripts regenerate the scenarios.

What the experiments found that matters for the rider (the rest is about the bike): in firm braking the
physical rider hands the bike +23.58 kJ while losing 23.67 kJ herself, so the interface is energetically
coherent (R7); a panic grab ends end-over-end rather than in the intended low-side (R3-R5, `brakeGrab`);
a diagonal pitch approximation would be wrong when the rear lifts (R5: the off-diagonal term dominates).

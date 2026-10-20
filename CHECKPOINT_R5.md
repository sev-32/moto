# LUCID MOTO R5 — persistent continuation checkpoint

Date: 2026-10-20. Full canonical project in `LUCID_MOTO_PROJECT/project`, raw measurements/logs/screenshots in `LUCID_MOTO_PROJECT/evidence/R5`, preserved R4 originals in `LUCID_MOTO_PROJECT/checkpoints/R4` and the R3 archive in `checkpoints/R3`.

**Git branch:** `experiment-20261020-nine-dof-balance-r5`, branching from R4 `experiment-20261020-pitch-balance-r4`. R1–R4 historical changes are retained. Existing GitHub default branch is not to be changed without approval.

**Implemented:** Explicitly opt-in full nine-coordinate solver and generalized joint-limit impulse numerical residual audit; phase snapshots and telemetry. There are *no simulation force or visual shader adjustments* in R5.

**Receipts:** `evidence/R5/R5_balance_results.json`, `R5_extended_results.json`, `R5_no_probe_regression.json`, `R5_native_active_motorcycle.png`, `R5_native_active_motorcycle.json`, selected unit test log, build and browser logs. Actual CDP numerical pass: 437 normal-grab, 2431 firm, 1351 extended-grab samples; all max relative equation residuals <6×10⁻¹⁶, extended joint-limit impulse residual <7×10⁻¹³. Bike fairing collision first 2.007s. Original 35° corner remains exactly 34.716° roll / −15.125°/s yaw / 136.3m. Native WebGL2 fresh image verified with seated dressed rider and original Ducati. Source changes limited to `30_chassis_dynamics.js`, `90_maneuvers.js`; one new browser test, documentation and checkpoint.

**Outstanding:** Full unit suite timeout after 51 observed passing cases; direct Node Playwright browser script not executed; calibration against real instrumented data not done; dt convergence, full external-work energy ledger, bodywork/rider impact semantics, and physical GPU FPS not established.

**Next recommended:** expose force-contribution ledger (tires, gravity, brakes, chain, aero, rider) by frame at 0.34–0.8s; conservation-inspired independent work/energy balance, then step-size convergence. Begin with diagnostics, not physics edits. Continue retaining all project files and updating folder manifest, GitHub, ZIP deliverables, and native visual proof each release.

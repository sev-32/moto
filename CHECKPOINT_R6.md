# R6 checkpoint · 2026-10-20

Parent R5 branch `experiment-20261020-nine-dof-balance-r5`. Current R6 branch `experiment-20261020-force-work-ledger-r6`.

Complete project: `/mnt/data/LUCID_MOTO_PROJECT/project`; previous source backup: `checkpoints/R5/`; current evidence: `evidence/R6/`. Originals, history, and accumulated evidence remain in the same canonical folder. R6 changes are opt-in diagnostics in `src/core/30_chassis_dynamics.js` and `src/core/90_maneuvers.js`; one new browser regression and Python independent verifier. No physical or visual edits.

Verified: WebGL2 fresh render, 23 independent generalized force contributors, four browser maneuver scenarios with algebraic reconstruction errors <2e-13, uninstrumented corner parity, 29/29 targeted Node tests, 4/4 Python output verification. Unverified: full test suite, direct Playwright script, physical energy conservation, rider internal work, GPU performance and road-contact injury biomechanics. See `docs/FORCE_WORK_LEDGER_R6.md` and `evidence/R6` for exact receipts.

**Continue at R7:** link the biomechanical rider-body reaction ledger with its internal energy/actuator/contact work before changing any dynamics. Baseline and R6 images are native captures, not mockups. Maintain a versioned full project and updated manifest and GitHub branch per release.

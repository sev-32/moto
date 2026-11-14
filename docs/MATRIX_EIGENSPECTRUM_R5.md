# R5 independent mass-matrix snapshot verification

Seven recorded nine-coordinate mass-matrix snapshots were verified outside the WebGL/JavaScript solver with **NumPy symmetric eigensolver, full SVD condition estimate, and independent matrix-vector multiplication**. This is additional independent numerical checking; it does **not** independently derive the forces or establish real-world fidelity.

The stored `M` is 9×9 and has exact symmetry at each sampled phase. All sampled symmetric eigenvalues were strictly positive, with smallest eigenvalue approximately 0.42006 and largest approximately 214.85–214.89. The 2-norm condition number varied from 511.48 to 511.56 in the simulator's current mixed-unit generalized coordinates. Therefore a numerical change in coordinate units would change that numerical condition number; it is **not dimensionless physical conditioning**.

Independent `M @ acceleration − rhs` residual Euclidean norms were approximately 4.0×10⁻¹⁴ to 7.3×10⁻¹³, consistent with the earlier browser-side machine-precision observations.

Snapshots covered first front lock at t=0.3481s, first rear lift at t=0.4056s, first near-vertical pitch at t=0.7741s, and first fairing-proxy impact recorded in the solver at t=2.0093s. Only the extended-turnover scenario contains the fairing sample. Repeated phases in the short and extended maneuvers had matching sampled matrices. The fairing event itself was first seen at 2.007s by the collision subsystem, so the 2.0093s solver snapshot is not a collision timestamp.

Reproduction from the full project root: `python project/tools/verify_r5_matrices.py` (requires NumPy and the packaged `evidence/R5` JSON records). Actual JSON results: `evidence/R5/R5_independent_matrix_audit.json`.

Still unverified: conservation of mechanical energy and angular momentum, all external torques and contact impulses, rider impact, dt convergence and real-world calibration. The test only checks matrix properties and algebra at the available snapshots.

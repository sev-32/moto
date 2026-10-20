# LUCID MOTO R4 — 2026-10-20 persistent checkpoint

Complete working source: `/mnt/data/LUCID_MOTO_PROJECT/project` (archived as `LUCID_MOTO_PROJECT_R4_source.zip`). Compiled WebGL2 runtime and raw browser evidence: `/mnt/data/LUCID_MOTO_PROJECT/evidence/R4` (archived with the runtime as `LUCID_MOTO_PROJECT_R4_runtime_evidence.zip`). Historical R3 full source is separately preserved in `LUCID_MOTO_PROJECT/checkpoints/R3`.

**Git ancestry:** R1 posture fix → R2 incident event provenance → R3 bounded overturn and world ground speed → R4 opt-in coupled pitch-force diagnostics, plus side-effect-free probe validation. This branch is intentionally independent of the existing default branch.

**R4 verified:** compiled 26-layer V2.0 application, 29/29 targeted Node tests, source/browser test syntax; actual native Chromium 144 ANGLE/SwiftShader WebGL2 rider/bike chase rendering; measured default grab, bounded 2.5 s grab, firm braking, 35° corner and invalid-duration state-preservation test through real CDP. The standalone Node Playwright browser test and full suite are not claimed run.

**Key observations:** front lock 0.348 s; near-vertical pitch by 0.774 s; Euler attitude guard at 0.807 s is not a ground impact; left fairing proxy first contact at 2.007 s; extended 2.5 s still travelling in world ground frame; ordinary 16-bar firm stop at 4.05 s. Extended angular acceleration/rotor peaks include joint-limit and impact transients. Do not interpret generalized torque Q[3] as independent external moment, or claim angular-momentum conservation based on a diagonal inertia alone.

**Reference hashes:** R4 `src/core/90_maneuvers.js` Git blob `4311cd945c84943f6348ccfc770ccfcaba2a0d15`; compiled dist SHA256 `fec73df3c8cc7bfed807e31cc96ef1e6bd1a5848afa49e6e1ffcca532fd83c0c`.

**Next:** instrument full `M * a - (Q - C)` residual with full nine-coordinate mass matrix, separate gyroscopic angular momentum from generalized forces, and audit source tire contact impulse under step-size convergence, first for 0.3–0.8s then after impact. Keep full project and fresh native renders at each output. Full methodology and limitations in [R4 audit](docs/PITCH_BALANCE_R4.md).

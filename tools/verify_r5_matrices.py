"""Independent NumPy verification of R5 browser-recorded 9x9 mass matrices.

Run: python project/tools/verify_r5_matrices.py
Requires numpy. This verifies recorded solver algebra, symmetry and positive
quadratic forms at sampled states; it is NOT physical model validation.
"""
import json
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
evidence = root / 'evidence' / 'R5'
short = json.loads((evidence / 'R5_balance_results.json').read_text())
extended = json.loads((evidence / 'R5_extended_results.json').read_text())
cases = [('panic_short', short['runs']['brakeGrab']['metrics']),
         ('firm_stop', short['runs']['brakeFirm']['metrics']),
         ('overturn', extended['metrics'])]
rows = []
for case, metrics in cases:
    for stage in ('firstFrontLock', 'firstRearLift', 'firstVertical', 'firstImpact'):
        sample = metrics['balance'].get(stage)
        if sample is None:
            continue
        M = np.asarray(sample['matrix'], dtype=float)
        qdd = np.asarray(sample['acceleration'], dtype=float)
        rhs = np.asarray(sample['rhs'], dtype=float)
        assert M.shape == (9, 9) and qdd.shape == (9,) and rhs.shape == (9,)
        eigen = np.linalg.eigvalsh((M + M.T) / 2)
        residual = M @ qdd - rhs
        record = {
            'case': case, 'stage': stage, 't': sample['t'],
            'massEigenMin': float(eigen.min()), 'massEigenMax': float(eigen.max()),
            'massCond2': float(np.linalg.cond(M)),
            'symmetryErrorMax': float(np.max(np.abs(M - M.T))),
            'pitchIndependentResidualNm': float(residual[3]),
            'normResidual': float(np.linalg.norm(residual)),
            'spectrumPositive': bool(eigen.min() > 0),
        }
        assert record['spectrumPositive']
        assert record['symmetryErrorMax'] < 1e-10
        assert record['normResidual'] < 1e-8
        rows.append(record)
assert len(rows) >= 4
report = {'method': 'Independent NumPy eigenvalue, SVD condition and matrix-vector validation of recorded solver snapshots',
          'limitations': 'Coordinate-scaled matrix condition and internal equation check; not energy conservation or physical calibration',
          'samples': rows}
(evidence / 'R5_independent_matrix_audit.json').write_text(json.dumps(report, indent=2))
print('PASS independent 9x9 matrix audit:', len(rows), 'event snapshots')
for row in rows:
    print(row['case'], row['stage'], 'min_eig=', f"{row['massEigenMin']:.6f}",
          'cond2=', f"{row['massCond2']:.3f}", 'res=', f"{row['normResidual']:.3g}")

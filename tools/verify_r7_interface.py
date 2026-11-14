"""Independently check saved R7 rider/bike point-velocity energy transfers.

Checks internal time-integration, signed action/reaction power at distinct
contact-side velocities, rider kinetic + potential delta, source-specific
bike-side compatibility with R6, and preserved scenario outcomes. Does not
prove full energy conservation or validate contacts against measurements.
"""
import json, math
from pathlib import Path
root=Path(__file__).resolve().parents[2]
evidence=root/'evidence'/'R7'
data=json.loads((evidence/'R7_interface_browser_results.json').read_text())
res=[]
for key,run in data['runs'].items():
 m=run['metrics']; r=m['interface']; w=m['work']; sources=r['sourcePairs']
 assert len(sources)==6,(key,len(sources))
 assert r['samples']>400 and r['missingSamples']<=1
 sums={x:sum(k[x] for k in sources.values()) for x in ('bikeWorkJ','riderWorkJ','slipWorkJ')}
 for metric,field in [('bikeWorkJ','bikeWorkJ'),('riderContactWorkJ','riderWorkJ'),('pairSlipWorkJ','slipWorkJ')]:
  assert math.isclose(r[metric],sums[field],rel_tol=1e-11,abs_tol=1e-7),(key,metric,r[metric],sums[field])
 assert math.isclose(r['bikeWorkJ']+r['riderContactWorkJ'],r['pairSlipWorkJ'],rel_tol=1e-10,abs_tol=1e-7)
 assert math.isclose(r['riderKineticDeltaJ']+r['riderPotentialDeltaJ'],r['riderEnergyDeltaJ'],rel_tol=1e-11,abs_tol=1e-7)
 assert math.isclose(r['initialRiderKineticJ']+r['riderKineticDeltaJ'],r['finalRiderKineticJ'],rel_tol=1e-11,abs_tol=1e-7)
 assert abs(r['bikeLedgerMismatchJ'])<1e-7,(key,r['bikeLedgerMismatchJ'])
 assert r['peakAbsBikeLedgerPowerMismatchW']<1e-6
 budget=r['riderEnergyDeltaJ']-r['riderContactWorkJ']-r['groundWorkJ']-r['jointWorkJ']
 assert math.isclose(budget,r['residualJ'],rel_tol=1e-10,abs_tol=1e-7)
 assert 75<r['riderMassKg']<76
 assert w['maxForceClosure']<1e-8 and w['maxPowerClosureW']<1e-7
 if key=='brakeFirm':assert abs(m['groundStopT']-4.05)<.01
 if key=='lean35':assert abs(m['maxAbsRollDeg']-34.716)<.03
 if key=='brakeGrab':assert m['terminationReason']=='near_vertical_pitch_attitude'
 rec={'case':key,'riderMassKg':r['riderMassKg'],'bikeWorkJ':r['bikeWorkJ'],
      'riderWorkJ':r['riderContactWorkJ'],'relativeContactWorkJ':r['pairSlipWorkJ'],
      'riderKineticDeltaJ':r['riderKineticDeltaJ'],'riderPotentialDeltaJ':r['riderPotentialDeltaJ'],
      'riderMechanicalDeltaJ':r['riderEnergyDeltaJ'],'riderJointWorkJ':r['jointWorkJ'],
      'riderGroundWorkJ':r['groundWorkJ'],'budgetResidualJ':r['residualJ'],
      'netMechanicalClosureRatio':abs(r['residualJ'])/max(1,abs(r['riderEnergyDeltaJ'])),
      'unmatchedFirstStep':r['missingSamples'],'contactCategories':len(sources)}
 res.append(rec)
 print('PASS',key, 'contact bike J',round(r['bikeWorkJ'],2),'rider dK J',round(r['riderKineticDeltaJ'],2),'budget residual J',round(r['residualJ'],2))
assert len(res)==3 and not data['exceptions']
assert abs(data['postProbe']['roll']-34.716)<.03
assert data['postProbe']['interface'] is None and not data['postProbe']['retained'] and not data['postProbe']['flag']
(evidence/'R7_independent_interface_audit.json').write_text(json.dumps({'status':'PASS','limitations':'Contact power sampled at pre-step velocities; numerical residual includes integration/elastic/actuator effects. Not a whole-system conservation result.','cases':res},indent=2))

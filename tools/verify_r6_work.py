"""Independent source-sum and phase-provenance checks for R6 browser telemetry.

Does NOT prove physical energy conservation: validates the serialized generalized
force/work ledger, signed works, provenance labels and scenario invariants.
"""
import json, math
from pathlib import Path

root=Path(__file__).resolve().parents[2]
evidence=root/'evidence'/'R6'
record=json.loads((evidence/'R6_work_browser_results.json').read_text())
results=[]
for name,info in record['runs'].items():
    m=info['metrics']; w=m['work']; cats=w['categories']
    assert len(cats)==23 and len(set(cats))==23, (name,len(cats))
    assert any('wrench_6_riderWrench'==x for x in cats)
    assert any('wrench_7_riderWrench'==x for x in cats)
    assert w['maxForceClosure']<1e-9 and w['maxPowerClosureW']<1e-7
    assert w['maxPitchClosureNm']<1e-9
    total=sum(c['signedWorkJ'] for c in cats.values())
    assert math.isclose(total,w['totalGeneralizedWorkJ'],rel_tol=1e-11,abs_tol=1e-7),(name,total,w['totalGeneralizedWorkJ'])
    for key,c in cats.items():
        assert math.isclose(c['signedWorkJ'],c['positiveWorkJ']+c['negativeWorkJ'],rel_tol=1e-11,abs_tol=1e-7),key
    snapshots={}
    for key in ['preBrake','firstFrontLock','firstRearLift','firstVertical','firstImpact']:
        e=w.get(key)
        if not e:continue
        assert len(e['sources'])==23
        q=[sum(x['general'][i] for x in e['sources']) for i in range(9)]
        assert math.isclose(q[3],e['pitchGeneralizedNm'],rel_tol=1e-10,abs_tol=1e-7), (name,key)
        assert math.isclose(sum(x['powerW'] for x in e['sources']),e['totalPowerW'],rel_tol=1e-10,abs_tol=1e-7), (name,key)
        snapshots[key]={'t':e['t'],'pitch_Nm':q[3],'power_W':e['totalPowerW']}
    results.append({'maneuver':name,'samples':w['samples'],'categories':len(cats),
                    'signedGeneralizedWorkJ':w['totalGeneralizedWorkJ'],
                    'workResumErrorJ':total-w['totalGeneralizedWorkJ'],
                    'maxForceClosure':w['maxForceClosure'],
                    'maxPowerClosureW':w['maxPowerClosureW'],
                    'biomechRiderWorkJ':cats['wrench_7_riderWrench']['signedWorkJ'],
                    'oldRiderServoWorkJ':cats['wrench_6_riderWrench']['signedWorkJ'],
                    'events':snapshots})
assert len(results)==4
assert abs(record['runs']['brakeFirm']['metrics']['groundStopT']-4.05)<0.01
assert abs(record['runs']['lean35']['metrics']['maxAbsRollDeg']-34.716)<0.01
assert record['runs']['brakeGrabExtended']['metrics']['firstBodyContactT']==2.007
assert not record['postProbe']['work'] and not record['postProbe']['flag']
(evidence/'R6_independent_work_audit.json').write_text(json.dumps({'status':'PASS','limitations':'Internal provenance and power closure only, not mechanical energy conservation', 'results':results},indent=2))
for v in results:print('PASS',v['maneuver'],v['samples'],'steps,',v['categories'],'sources, signed-work J',round(v['signedGeneralizedWorkJ'],3),'events',list(v['events']))

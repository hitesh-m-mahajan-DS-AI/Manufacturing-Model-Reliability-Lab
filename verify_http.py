"""Exercise the running localhost app; releases/restores demo versions explicitly."""
import json
from statistics import median
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from backend.data import ROOT
from backend.training import now

BASE = 'http://127.0.0.1:8534/api/'


def call(path, body=None):
    request = Request(BASE+path,data=None if body is None else json.dumps(body).encode(),
                      headers={'Content-Type':'application/json'},method='GET' if body is None else 'POST')
    try:
        with urlopen(request,timeout=60) as response:
            return response.status,json.loads(response.read())
    except HTTPError as error:
        return error.code,json.loads(error.read())


def verify():
    status,snapshot=call('lab');assert status==200
    models={m['kind']:m for m in snapshot['experiment']['models']}
    inputs={'targeted_productivity':.8,'smv':26,'no_of_workers':56,'department':'sewing'}
    state=snapshot['state']
    if state['active']!=models['ridge']['version']:
        status,state=call('release',{'version':models['ridge']['version'],'expected_generation':state['generation']});assert status==200
    status,before=call('predict',inputs);assert status==200
    invalid={}
    for name,body in [('negative_smv',{**inputs,'smv':-1}),('extra_target',{**inputs,'actual_productivity':.8}),('unknown_department',{**inputs,'department':'unknown'})]:
        code,result=call('predict',body);assert code==422
        invalid[name]={'status':code,'response':result}
    stale_code,stale=call('release',{'version':models['forest']['version'],'expected_generation':state['generation']+100})
    assert stale_code==409
    status,released=call('release',{'version':models['forest']['version'],'expected_generation':state['generation']});assert status==200
    samples=[];responses=[]
    for _ in range(10):
        start=time.perf_counter();status,prediction=call('predict',inputs)
        samples.append((time.perf_counter()-start)*1000);responses.append(prediction)
        assert status==200 and prediction['model_version']==models['forest']['version']
    status,replay=call('replay',{'shifted':False,'labels':True});assert status==200
    status,shifted=call('replay',{'shifted':True,'labels':True});assert status==200 and shifted['metrics'] is None
    status,restored=call('rollback',{'expected_generation':released['generation']});assert status==200
    status,after=call('predict',inputs);assert status==200
    assert after['model_version']==before['model_version'] and after['prediction']==before['prediction']
    report={'checked_at':now(),'frozen_experiment':snapshot['experiment']['id'],'inputs':inputs,
            'before_release':before,'candidate_response':responses[0],'after_rollback':after,
            'rollback_prediction_and_version_exactly_restored':True,'invalid_requests':invalid,
            'stale_release':{'status':stale_code,'response':stale},
            'timing':{'samples':10,'round_trip_ms':samples,'median_round_trip_ms':median(samples),
                      'median_backend_ms':median(r['duration_ms'] for r in responses),
                      'scope':'Sequential warm localhost HTTP requests, including artifact verification/load. Not a concurrency/load test.'}}
    for name,value in [('api_verification.json',report),('http_historical_replay.json',replay),('http_synthetic_replay.json',shifted)]:
        (ROOT/'outputs'/name).write_text(json.dumps(value,indent=2),encoding='utf-8')
    print(json.dumps({'restored':report['rollback_prediction_and_version_exactly_restored'],'timing':report['timing']},indent=2))


if __name__=='__main__':
    verify()

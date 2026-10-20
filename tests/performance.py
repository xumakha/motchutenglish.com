"""Measured local benchmark, not a staging capacity claim."""
import json,os,statistics,subprocess,time,urllib.request,urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sessions=json.loads(subprocess.check_output(['php','tests/product_fixture.php','performance'],text=True,encoding='utf-8'))
def submit(s):
    start=time.perf_counter();error=None
    try:
        body=json.dumps(dict(revision=0,exerciseId='hello',response='greeting')).encode()
        req=urllib.request.Request('http://127.0.0.1:8089/api/v1/attempts/'+s['attempt']+'/submit',body,{'Content-Type':'application/json','X-CSRF-Token':s['csrf'],'Cookie':s['cookie']})
        with urllib.request.urlopen(req,timeout=30) as response:
            data=json.load(response);assert response.status==200 and data['data']['items'][0]['feedback']['isCorrect'] is True
    except Exception as e:error=type(e).__name__
    return dict(ms=round((time.perf_counter()-start)*1000,2),error=error)
for s in sessions[:5]:assert submit(s)['error'] is None,'Warmup failed'
start=time.perf_counter()
with ThreadPoolExecutor(max_workers=50) as pool:results=list(pool.map(submit,sessions[5:]))
times=sorted(r['ms'] for r in results);errors=sum(r['error'] is not None for r in results)
report=dict(environment='Local Windows, '+('threaded CGI process per request' if os.environ.get('THREADED_TESTS')=='1' else 'PHP built-in single worker')+', XAMPP MariaDB 10.4.32; not staging',concurrency=50,samples=50,operation='authenticated server submit + grading + attempt read',p50_ms=statistics.median(times),p95_ms=times[47],max_ms=max(times),errors=errors,error_rate=errors/50,seconds=round(time.perf_counter()-start,3),target_p95_ms=800,target_error_rate=.01,target_met=times[47]<800 and errors/50<.01,results=results)
Path('docs/artifacts').mkdir(parents=True,exist_ok=True);Path('docs/artifacts/performance.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('MEASURED: 50 sessions, p95='+str(report['p95_ms'])+'ms, errors='+str(errors)+'/50, local target met='+str(report['target_met']))
assert errors==0,'Request failures must be resolved'

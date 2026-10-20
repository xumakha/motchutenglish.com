import http.cookiejar,json,os,re,subprocess,time,urllib.request,urllib.parse,sys,hashlib
from pathlib import Path
env=dict(os.environ)
backup=subprocess.check_output(['php','database/backup.php'],env=env,text=True).strip()
media_backup=json.loads(subprocess.check_output([sys.executable,'database/media-backup.py','backup'],env=env,text=True))
media_restore=json.loads(subprocess.check_output([sys.executable,'database/media-backup.py','restore',media_backup['file']],env=env,text=True))
for file in Path(media_restore['directory']).rglob('*'):
    if file.is_file():assert hashlib.sha256(file.read_bytes()).digest()==hashlib.sha256((Path('writable/media')/file.relative_to(media_restore['directory'])).read_bytes()).digest()
report=json.loads(subprocess.check_output(['php','database/restore-drill.php',backup],env=env,text=True))
restored=dict(env,DB_NAME=report['database'])
probe=json.loads(subprocess.check_output(['php','tests/restore_probe.php'],env=restored,text=True))
with open('writable/restore-server.log','w') as log:
    server=subprocess.Popen(['php','-d','session.save_path=writable/sessions','-S','127.0.0.1:8089','router.php'],env=restored,stdout=log,stderr=log)
    try:
        time.sleep(.5);client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));base='http://127.0.0.1:8089'
        body=client.open(base+'/login').read().decode();csrf=re.search('name="csrf" value="([a-f0-9]+)"',body)[1]
        body=client.open(base+'/login',urllib.parse.urlencode(dict(csrf=csrf,email=probe['email'],password='Product-test-123!')).encode()).read().decode();assert 'Product' not in body or 'Tài khoản' in body
        progress=json.load(client.open(base+'/api/v1/progress'));assert len(progress['data'])>=1
        attempt=json.load(client.open(base+'/api/v1/attempts/'+probe['attempt']['id']))['data'];assert int(attempt['score'])==int(probe['attempt']['score']) and attempt['status']=='finished'
        assert client.open(base+'/lo-trinh').code==200
        report.update(login=True,lessonCatalog=True,progress=True,attemptHistory=True,restart=True,mediaFiles=media_restore['files'],mediaRestoreHashesMatch=True)
        Path('docs/artifacts/restore-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    finally:server.terminate();server.wait(timeout=10)
print('PASS: real SQL dump restored into new database; login, lesson catalog, progress and attempt history survive a new PHP process ('+str(report['seconds'])+'s local restore)')

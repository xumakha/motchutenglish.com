"""Run with: python tests/run_auth.py (local MySQL CREATE DATABASE permission required)."""
import os, secrets, subprocess, time, sys, json, datetime, atexit
from pathlib import Path

root=Path(__file__).resolve().parents[1]
results=[]
original_run=subprocess.run
def checked_run(command,**kwargs):
    started=time.perf_counter()
    try:
        result=original_run(command,**kwargs)
        results.append(dict(check=next((str(x) for x in command if str(x).endswith(('.php','.py','.mjs'))),'command'),status='passed' if result.returncode==0 else 'failed',seconds=round(time.perf_counter()-started,3)))
        return result
    except Exception:
        results.append(dict(check=next((str(x) for x in command if str(x).endswith(('.php','.py','.mjs'))),'command'),status='failed',seconds=round(time.perf_counter()-started,3)))
        raise
subprocess.run=checked_run
def write_report():
    directory=root/'docs/artifacts';directory.mkdir(parents=True,exist_ok=True)
    (directory/'test-report.json').write_text(json.dumps(dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),environment='isolated local database; external mail/analytics disabled',checks=results,all_passed=bool(results) and all(r['status']=='passed' for r in results)),indent=2),encoding='utf-8')
atexit.register(write_report)
os.chdir(root)
name='mce_auth_test_'+secrets.token_hex(6)
env=dict(os.environ,DB_NAME=name,SESSION_SECURE='0',APP_ENV='test',MAIL_DRIVER='disabled',GA4_MEASUREMENT_ID='',GA4_API_SECRET='')
modules=subprocess.check_output(['php','-m'],text=True).lower().splitlines()
ini_dir=root/'writable/test-ini'
ini_dir.mkdir(parents=True,exist_ok=True)
(ini_dir/'required.ini').write_text(''.join('extension='+module+'\n' for module in ['intl','fileinfo'] if module not in modules))
env['PHP_INI_SCAN_DIR']=str(ini_dir)
(root/'writable/sessions').mkdir(parents=True,exist_ok=True)
subprocess.run(['php','database/setup-local.php'],env=env,check=True)
with (root/'writable/auth-test-server.log').open('w') as log:
    command=[sys.executable,'tests/dev_server.py','8089'] if os.environ.get('THREADED_TESTS')=='1' else ['php','-d','session.save_path='+str(root/'writable/sessions'),'-S','127.0.0.1:8089','router.php']
    server=subprocess.Popen(command,env=env,stdout=log,stderr=log)
    try:
        time.sleep(0.5)
        if server.poll() is not None:
            raise RuntimeError('Test server could not start; check writable/auth-test-server.log')
        subprocess.run(['php','tests/product_unit.php'],env=env,check=True)
        subprocess.run(['php','tests/jobs_recovery.php'],env=env,check=True)
        subprocess.run(['php','tests/timezone.php'],env=env,check=True)
        subprocess.run([sys.executable,'tests/timezone_http.py'],env=env,check=True)
        subprocess.run([sys.executable,'tests/product_http.py'],env=env,check=True)
        subprocess.run(['php','tests/progress_history.php'],env=env,check=True)
        subprocess.run(['php','tests/marketing.php'],env=env,check=True)
        subprocess.run(['php','tests/imports.php'],env=env,check=True)
        subprocess.run(['php','tests/motivation.php'],env=env,check=True)
        if os.environ.get('BROWSER_TESTS')=='1':subprocess.run(['node','tests/browser.mjs'],env=env,check=True,timeout=90)
        if os.environ.get('PERFORMANCE_TESTS')=='1':subprocess.run([sys.executable,'tests/performance.py'],env=env,check=True,timeout=90)
        subprocess.run([sys.executable,'tests/learning_http.py'],env=env,check=True)
        subprocess.run(['php','tests/product_fixture.php','authclear'],env=env,check=True)
        subprocess.run([sys.executable,'tests/auth_http.py'],env=env,check=True)
        subprocess.run(['php','tests/auth_hash.php'],env=env,check=True)
        subprocess.run([sys.executable,'tests/site_http.py'],env=env,check=True)
    finally:
        server.terminate()
        server.wait(timeout=10)
mail_env=dict(env,MAIL_DRIVER='log',APP_ENV='test')
with (root/'writable/account-test-server.log').open('w') as log:
    server=subprocess.Popen(command,env=mail_env,stdout=log,stderr=log)
    try:
        time.sleep(0.5)
        subprocess.run([sys.executable,'tests/account_http.py'],env=mail_env,check=True)
    finally:
        server.terminate();server.wait(timeout=10)
if os.environ.get('RESTORE_TESTS')=='1':subprocess.run([sys.executable,'tests/restore.py'],env=env,check=True)
print('Isolated test database retained: '+name)

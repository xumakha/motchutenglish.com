"""Run with: python tests/run_auth.py (local MySQL CREATE DATABASE permission required)."""
import os, secrets, subprocess, time
from pathlib import Path

root=Path(__file__).resolve().parents[1]
os.chdir(root)
name='mce_auth_test_'+secrets.token_hex(6)
env=dict(os.environ,DB_NAME=name,SESSION_SECURE='0')
(root/'writable/sessions').mkdir(parents=True,exist_ok=True)
subprocess.run(['php','database/setup-local.php'],env=env,check=True)
with (root/'writable/auth-test-server.log').open('w') as log:
    server=subprocess.Popen(['php','-d','session.save_path='+str(root/'writable/sessions'),'-S','127.0.0.1:8089','router.php'],env=env,stdout=log,stderr=log)
    try:
        time.sleep(0.5)
        if server.poll() is not None:
            raise RuntimeError('Test server could not start; check writable/auth-test-server.log')
        subprocess.run(['python','tests/auth_http.py'],env=env,check=True)
        subprocess.run(['php','tests/auth_hash.php'],env=env,check=True)
        subprocess.run(['python','tests/site_http.py'],env=env,check=True)
    finally:
        server.terminate()
        server.wait(timeout=10)
print('Isolated test database retained: '+name)

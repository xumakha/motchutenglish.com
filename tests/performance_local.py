"""Fresh isolated database + real HTTP load; never a staging capacity claim."""
import argparse, os, secrets, socket, subprocess, sys, time, urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.chdir(root)
parser=argparse.ArgumentParser()
parser.add_argument('--apache', action='store_true', help='Isolated Apache localhost + supported PHP FastCGI')
args=parser.parse_args()
# Refuse to benchmark another server already using the fixed fixture port.
if not args.apache:
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 8089))
name = 'mce_auth_test_' + secrets.token_hex(6)
env = dict(os.environ, DB_NAME=name, APP_ENV='test', SESSION_SECURE='0',
           MAIL_DRIVER='disabled', GA4_MEASUREMENT_ID='', GA4_API_SECRET='', THREADED_TESTS='1')
ini = root / 'writable/test-ini'
ini.mkdir(parents=True, exist_ok=True)
modules = subprocess.check_output(['php', '-m'], text=True).lower().splitlines()
(ini / 'required.ini').write_text(''.join('extension=' + m + '\n' for m in ['intl', 'fileinfo'] if m not in modules))
env['PHP_INI_SCAN_DIR'] = str(ini)
subprocess.run(['php', 'database/setup-local.php'], env=env, check=True)
subprocess.run(['php', 'database/create-admin.php', 'benchmark@example.com', 'Benchmark admin'],
               input=secrets.token_urlsafe(32), text=True, env=env, check=True, capture_output=True)
subprocess.run(['php', 'database/seed-product.php', '--publish-reviewed-samples'], env=env, check=True)
if args.apache:
    from apache_benchmark import apache_server
    with apache_server(root, env) as apache_env:
        subprocess.run([sys.executable, 'tests/performance.py'], env=apache_env, check=True, timeout=90)
    print('Isolated Apache benchmark database retained: ' + name)
    sys.exit(0)
with (root / 'writable/performance-server.log').open('w') as log:
    server = subprocess.Popen([sys.executable, 'tests/dev_server.py', '8089'], env=env, stdout=log, stderr=log)
    try:
        for _ in range(40):
            if server.poll() is not None:
                raise RuntimeError('Benchmark server failed to start; port 8089 must be free')
            try:
                urllib.request.urlopen('http://127.0.0.1:8089/health', timeout=1).close()
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Benchmark server not ready')
        subprocess.run([sys.executable, 'tests/performance.py'], env=env, check=True, timeout=90)
    finally:
        server.terminate()
        server.wait(timeout=10)
print('Isolated benchmark database retained: ' + name)

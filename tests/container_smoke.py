"""Check the packaged image against a disposable MariaDB; Docker required.

Does not build/push/deploy images or touch existing containers/Compose volumes.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

root = Path(__file__).resolve().parents[1]
image = sys.argv[1] if len(sys.argv) > 1 else 'mce-runtime-check'
if not shutil.which('docker'):
    raise SystemExit('Docker CLI required; no container checks were run')
checks, containers = [], []
network = None
label = 'Docker availability'
token = secrets.token_hex(6)
env = dict(os.environ, MARIADB_DATABASE='motchutenglish', MARIADB_USER='mce',
           MARIADB_PASSWORD=secrets.token_urlsafe(30), MARIADB_ROOT_PASSWORD=secrets.token_urlsafe(30))
report = dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              image=image, environment='disposable Docker network, MariaDB 10.11, packaged Apache/PHP; not staging',
              passed=False, checks=checks)

def run(args, *, input=None):
    return subprocess.run(['docker', *args], env=env, input=input, text=True,
                          capture_output=True, check=True, timeout=180).stdout.strip()

def cli(*args, input=None):
    return run(['exec', '-i', '--user', 'www-data', web, *args], input=input)

def http(path, expected):
    try:
        response = urllib.request.urlopen(base + path, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == expected, (path, response.status)
        return response.read().decode(), response.headers

try:
    run(['info'])
    label = 'create isolated database and network'
    network = run(['network', 'create', 'mce-smoke-' + token])
    database = run(['run', '-d', '--network', network, '--network-alias', 'db',
                    '-e', 'MARIADB_DATABASE', '-e', 'MARIADB_USER', '-e', 'MARIADB_PASSWORD',
                    '-e', 'MARIADB_ROOT_PASSWORD', '--health-cmd', 'healthcheck.sh --connect --innodb_initialized',
                    '--health-interval', '1s', '--health-timeout', '3s', '--health-retries', '60', 'mariadb:10.11'])
    containers.append(database)
    for _ in range(60):
        if run(['inspect', '--format', '{{.State.Health.Status}}', database]) == 'healthy':
            break
        time.sleep(1)
    else:
        raise RuntimeError('Database not healthy')
    checks.append(label)
    label = 'start production image with private HTTP binding'
    env['DB_PASSWORD'] = env['MARIADB_PASSWORD']
    web = run(['run', '-d', '--network', network, '-p', '127.0.0.1::80',
               '-e', 'DB_HOST=db', '-e', 'DB_NAME=motchutenglish', '-e', 'DB_USER=mce', '-e', 'DB_PASSWORD',
               '-e', 'APP_URL=https://container-smoke.invalid', image])
    containers.append(web)
    port = json.loads(run(['inspect', '--format', '{{json .NetworkSettings.Ports}}', web]))['80/tcp'][0]['HostPort']
    base = 'http://127.0.0.1:' + port
    for _ in range(40):
        try:
            body, headers = http('/health', 200)
            assert body == 'ok'
            break
        except (OSError, AssertionError):
            time.sleep(.25)
    else:
        raise RuntimeError('Web not ready')
    checks.append(label)
    label = 'packaged runtime, extensions, production settings and no private build files'
    runtime = json.loads(cli('php', '-r', '''echo json_encode([
        'php'=>PHP_VERSION,'python'=>trim(shell_exec('python3 --version')),
        'extensions'=>array_map('extension_loaded',['pdo_mysql','intl','mbstring','fileinfo','openssl']),
        'secure'=>ini_get('session.cookie_secure'),'displayErrors'=>ini_get('display_errors'),
        'writable'=>is_writable('writable/media')&&is_writable('writable/sessions')&&is_writable('writable/backups'),
        'privateFilesAbsent'=>!file_exists('application/config/database.php')&&!file_exists('config.php')&&!file_exists('.env')&&!file_exists('tests')&&!file_exists('docs')
    ]);'''))
    assert all(runtime['extensions']) and runtime['writable'] and runtime['privateFilesAbsent']
    assert runtime['secure'] == '1' and runtime['displayErrors'] in ('', '0', 'Off')
    assert (8, 3) <= tuple(map(int, runtime['php'].split('.')[:2])) < (8, 6)
    report['runtime'] = runtime
    checks.append(label)
    label = 'migration, repeated migration and schema check as www-data'
    cli('php', 'database/migrate.php')
    cli('php', 'database/migrate.php')
    cli('php', 'database/check.php')
    checks.append(label)
    label = 'stdin admin creation, duplicate protection and published sample seed'
    password = secrets.token_urlsafe(30)
    cli('php', 'database/create-admin.php', 'container@example.com', 'Container admin', input=password)
    try:
        cli('php', 'database/create-admin.php', 'container@example.com', 'Duplicate', input=secrets.token_urlsafe(30))
        raise AssertionError('Duplicate admin unexpectedly accepted')
    except subprocess.CalledProcessError:
        pass
    verified = cli('php', '-r', '''require 'application/core/bootstrap.php';
        $u=User_model::findByEmail('container@example.com');
        if(!$u||!password_verify(stream_get_contents(STDIN),$u['password_hash'])||learning_role(db(),(int)$u['id'])!=='admin')exit(1);echo 'ok';''', input=password)
    assert verified == 'ok'
    cli('php', 'database/seed-product.php', '--publish-reviewed-samples')
    checks.append(label)
    label = 'production HTTP public routes, secure session and private-file denial'
    for path in ['/', '/lo-trinh', '/login', '/assets/css/redesign.css']:
        http(path, 200)
    _, headers = http('/login', 200)
    cookies = ';'.join(headers.get_all('Set-Cookie', []))
    assert 'secure' in cookies.lower() and 'httponly' in cookies.lower() and 'samesite=lax' in cookies.lower()
    for path in ['/application/config/database.php', '/database/migrate.php', '/writable/', '/.env', '/tests/']:
        http(path, 403)
    checks.append(label)
    label = 'worker and SQL backup as www-data'
    cli('php', 'database/worker.php', 'tick')
    cli('php', 'database/worker.php', 'run', '5')
    dump = cli('php', 'database/backup.php')
    assert dump.startswith('/var/www/html/writable/backups/')
    checks.append(label)
    label = 'nonempty packaged media backup and restore hashes as www-data'
    payload = 'Owned container media fixture'
    cli('php', '-r', "file_put_contents('writable/media/fixture.bin', '" + payload + "');")
    archive = json.loads(cli('python3', 'database/media-backup.py', 'backup'))
    restored = json.loads(cli('python3', 'database/media-backup.py', 'restore', archive['file']))
    assert archive['files'] == 1 and restored['originalMediaUnchanged']
    digest = cli('php', '-r', "echo hash_file('sha256',$argv[1].'/fixture.bin');", restored['directory'])
    assert digest == hashlib.sha256(payload.encode()).hexdigest()
    checks.append(label)
    report['passed'] = True
except Exception:
    report['failedCheck'] = label
    raise RuntimeError('Container smoke failed at: ' + label + '; credentials/output omitted') from None
finally:
    # Only exact IDs returned by this run are removed; never prune existing resources.
    cleanup = []
    for container in reversed(containers):
        result = subprocess.run(['docker', 'rm', '-f', '-v', container], capture_output=True)
        cleanup.append(result.returncode == 0)
    if network:
        cleanup.append(subprocess.run(['docker', 'network', 'rm', network], capture_output=True).returncode == 0)
    report['cleanupPassed'] = all(cleanup)
    destination = root / 'docs/artifacts/container-smoke-report.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
    if report['passed'] and not report['cleanupPassed']:
        raise RuntimeError('Container smoke passed but cleanup failed; inspect resources for this run')
print('PASS: packaged runtime, production HTTP, migration/admin/seed, worker, SQL backup and media restore')

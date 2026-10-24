"""Run the black-box HTTP suites against the Next.js app in web/ (PHP: tests/run_auth.py).

    python3 tests/run_next.py

Creates an isolated database (mce_next_http_<hex>) on the server named by DATABASE_URL (from the
environment or web/.env.local; the user needs CREATE DATABASE), migrates and seeds it, builds and
starts the app (`pnpm build`, `pnpm start` on NEXT_HTTP_PORT, default 3201) and runs the suites
with HTTP_TARGET=next, so they use the TypeScript fixture CLI (web/scripts/fixture.ts) and worker.
Writes docs/artifacts/next-http-report.json. The database is dropped after a green run and kept
after a failure (KEEP_TEST_DB=1 always keeps it).

    NEXT_HTTP_SKIP_BUILD=1   reuse the existing web/.next build (it must come from this checkout)
"""
import atexit, datetime, json, os, secrets, shutil, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[2]
web = root
results = []


def step(name, command, env, cwd=root, timeout=900):
    started = time.perf_counter()
    status = 'failed'
    try:
        subprocess.run(command, cwd=cwd, env=env, check=True, timeout=timeout)
        status = 'passed'
    finally:
        results.append(dict(check=name, status=status, seconds=round(time.perf_counter() - started, 3)))


def write_report():
    directory = root / 'docs/artifacts'
    directory.mkdir(parents=True, exist_ok=True)
    report = dict(
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        target='next', environment='isolated local database; external mail/analytics disabled',
        checks=results, all_passed=bool(results) and all(r['status'] == 'passed' for r in results),
    )
    (directory / 'next-http-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


atexit.register(write_report)


def env_local():
    values = {}
    file = web / '.env.local'
    if file.exists():
        for line in file.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


local = env_local()
source_url = os.environ.get('DATABASE_URL') or local.get('DATABASE_URL')
if not source_url:
    sys.exit('DATABASE_URL is not set (environment or web/.env.local)')
name = 'mce_next_http_' + secrets.token_hex(6)
parts = urllib.parse.urlsplit(source_url)
database_url = urllib.parse.urlunsplit(parts._replace(path='/' + name))
port = int(os.environ.get('NEXT_HTTP_PORT', '3201'))
base = f'http://127.0.0.1:{port}'
writable = web / 'writable' / 'http-tests' / name
writable.mkdir(parents=True, exist_ok=True)

env = dict(
    os.environ,
    DATABASE_URL=database_url,
    APP_ENV='test',
    APP_URL=base,
    BETTER_AUTH_SECRET=os.environ.get('BETTER_AUTH_SECRET') or local.get('BETTER_AUTH_SECRET') or secrets.token_hex(32),
    # Absolute, because `pnpm start` runs the standalone server from .next/standalone.
    WRITABLE_DIR=str(writable),
    MAIL_DRIVER='disabled',
    GA4_MEASUREMENT_ID='', GA4_API_SECRET='',
    HTTP_TARGET='next', HTTP_BASE=base,
    NEXT_TELEMETRY_DISABLED='1',
    PYTHONDONTWRITEBYTECODE='1',
)


def pnpm(*args):
    return ['pnpm', '--silent', *args]


def port_free():
    try:
        urllib.request.urlopen(base + '/health', timeout=1)
    except urllib.error.HTTPError:
        return False
    except OSError:
        return True
    return False


def start_server(server_env, log_name):
    if not port_free():
        raise RuntimeError(f'Port {port} is already in use; set NEXT_HTTP_PORT')
    log = (writable / log_name).open('w')
    server = subprocess.Popen(pnpm('start'), cwd=web, env=dict(server_env, PORT=str(port), HOSTNAME='127.0.0.1'),
                              stdout=log, stderr=log, start_new_session=True)
    deadline = time.time() + 60
    while time.time() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f'Next.js server exited; see {writable / log_name}')
        try:
            with urllib.request.urlopen(base + '/health', timeout=2) as response:
                if response.status == 200:
                    return server, log
        except OSError:
            time.sleep(0.5)
    stop_server(server, log)
    raise RuntimeError(f'Next.js server did not become healthy; see {writable / log_name}')


def stop_server(server, log):
    try:
        os.killpg(server.pid, 15)
        server.wait(timeout=15)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        os.killpg(server.pid, 9)
    log.close()


def suite(file, suite_env):
    step(file, [sys.executable, f'tests/http/{file}'], suite_env, timeout=600)


def fixture(*args, suite_env=env):
    tsx = str(web / 'node_modules/.bin/tsx')
    step('fixture ' + ' '.join(args), [tsx, '--import', './scripts/worker-hooks.mjs', 'scripts/fixture.ts', *args], suite_env, cwd=web)


ok = False
try:
    step('db:reset', pnpm('db:reset'), env, cwd=web)
    step('admin create', pnpm('admin', 'create', f'seed-admin-{secrets.token_hex(4)}@example.test', 'HTTP seed', '--local'), env, cwd=web)
    step('seed', pnpm('seed', '--publish-reviewed-samples'), env, cwd=web)
    if os.environ.get('NEXT_HTTP_SKIP_BUILD') != '1':
        step('build', pnpm('build'), env, cwd=web)

    server, log = start_server(env, 'server.log')
    try:
        suite('timezone_http.py', env)
        suite('product_http.py', env)
        suite('learning_http.py', env)
        fixture('product', 'authclear')
        suite('auth_http.py', env)
        suite('site_http.py', env)
    finally:
        stop_server(server, log)

    # Account flows need the development mail sink (JSON files in WRITABLE_DIR/mail).
    mail_env = dict(env, MAIL_DRIVER='log')
    server, log = start_server(mail_env, 'account-server.log')
    try:
        suite('account_http.py', mail_env)
    finally:
        stop_server(server, log)
    ok = True
finally:
    keep = os.environ.get('KEEP_TEST_DB') == '1' or not ok
    if keep:
        print(f'Isolated test database retained: {name} (files: {writable})')
    else:
        drop = "import mysql from 'mysql2/promise';const u=new URL(process.env.DATABASE_URL);const n=u.pathname.slice(1);u.pathname='/';const c=await mysql.createConnection({uri:u.toString()});await c.query('DROP DATABASE IF EXISTS `'+n+'`');await c.end();"
        subprocess.run(['node', '--input-type=module', '-e', drop], cwd=web, env=env, check=False)
        shutil.rmtree(writable, ignore_errors=True)
        print(f'All Next.js HTTP suites passed; dropped {name}')

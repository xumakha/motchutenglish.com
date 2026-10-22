"""Exercise documented fresh-install/admin/backup commands in an isolated local database."""
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile

root = Path(__file__).resolve().parents[1]
os.chdir(root)
if sys.version_info < (3, 12):
    raise SystemExit('Python >= 3.12 required')
name = 'mce_auth_test_' + secrets.token_hex(6)
env = dict(os.environ, DB_NAME=name, APP_ENV='test', MAIL_DRIVER='disabled', SESSION_SECURE='0',
           GA4_MEASUREMENT_ID='', GA4_API_SECRET='')
checks = []
credentials = None
sql_file = None
restore_artifact = root / 'docs/artifacts/restore-report.json'
previous_restore_report = restore_artifact.read_bytes() if restore_artifact.exists() else None

def run(label, args, *, input=None, expected=0):
    result = subprocess.run(args, input=input, text=True, encoding='utf-8', env=env, capture_output=True)
    if result.returncode != expected:
        log = root / 'writable/install-smoke.log'
        log.write_text(result.stdout + result.stderr, encoding='utf-8')
        log.chmod(0o600)
        raise RuntimeError(label + ' failed; details in writable/install-smoke.log')
    checks.append(label)
    return result.stdout

try:
    with tempfile.TemporaryDirectory(prefix='install-smoke-', dir=root / 'writable') as directory:
        fixture = Path(directory).resolve()
        assert fixture.is_relative_to((root / 'writable').resolve())
        ini = fixture / 'ini'
        ini.mkdir()
        modules = subprocess.check_output(['php', '-m'], text=True).lower().splitlines()
        (ini / 'extensions.ini').write_text(''.join('extension=' + module + '\n' for module in ['intl', 'fileinfo'] if module not in modules))
        env['PHP_INI_SCAN_DIR'] = str(ini)
        for variable, binary, windows in [('MYSQLDUMP_BIN', 'mariadb-dump', 'mysqldump.exe'), ('MYSQL_BIN', 'mariadb', 'mysql.exe')]:
            candidate = Path('C:/xampp/mysql/bin') / windows
            env[variable] = env.get(variable) or (str(candidate) if candidate.is_file() else shutil.which(binary) or shutil.which(windows.removesuffix('.exe')) or binary)
        run('fresh setup', ['php', 'database/setup-local.php'])
        run('repeat additive migration', ['php', 'database/migrate.php'])
        run('schema and extensions check', ['php', 'database/check.php'])
        run('missing admin arguments rejected', ['php', 'database/create-admin.php', '--local'], expected=1)
        email = 'install-' + secrets.token_hex(6) + '@example.com'
        command = ['php', 'database/create-admin.php', email, 'Local install admin', '--local']
        if os.name == 'nt':
            command = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(root / 'php-local.ps1'),
                       'database/create-admin.php', email, 'Local install admin', '--local']
        output = run('documented local admin arguments and launcher', command)
        credentials = Path(output.split('Local credentials saved privately: ', 1)[1].strip()).resolve()
        assert credentials.parent == (root / 'writable').resolve() and credentials.is_file()
        duplicate = subprocess.run(['php', 'database/create-admin.php', email, 'Duplicate', '--local'], env=env, capture_output=True, text=True)
        assert duplicate.returncode != 0 and 'Account exists' in duplicate.stderr
        checks.append('existing admin is not overwritten')
        stdin_email = 'stdin-' + secrets.token_hex(6) + '@example.com'
        run('admin password through stdin', ['php', 'database/create-admin.php', stdin_email, 'STDIN install admin'], input=secrets.token_hex(16))
        run('reviewed sample seed', ['php', 'database/seed-product.php', '--publish-reviewed-samples'])
        run('worker tick', ['php', 'database/worker.php', 'tick'])
        run('worker run', ['php', 'database/worker.php', 'run', '5'])
        sql_file = Path(run('SQL backup', ['php', 'database/backup.php']).strip()).resolve()
        assert sql_file.is_relative_to((root / 'writable/backups').resolve()) and sql_file.stat().st_size > 0
        restored = json.loads(run('SQL restore into a new database', ['php', 'database/restore-drill.php', str(sql_file)]))
        assert restored['originalDatabaseUnchanged'] and restored['counts']['users'] == 2
        tool = fixture / 'database/media-backup.py'
        tool.parent.mkdir()
        shutil.copyfile(root / 'database/media-backup.py', tool)
        media = fixture / 'writable/media'
        (media / 'nested').mkdir(parents=True)
        (media / 'sample.bin').write_bytes(b'owned fixture media\0\1')
        (media / 'nested/second.bin').write_bytes(b'second media fixture')
        before = {str(f.relative_to(media)): hashlib.sha256(f.read_bytes()).hexdigest() for f in media.rglob('*') if f.is_file()}
        archive = json.loads(run('media backup CLI', [sys.executable, str(tool), 'backup']))
        unpacked = json.loads(run('media restore CLI', [sys.executable, str(tool), 'restore', archive['file']]))
        after = {str(f.relative_to(unpacked['directory'])): hashlib.sha256(f.read_bytes()).hexdigest() for f in Path(unpacked['directory']).rglob('*') if f.is_file()}
        assert before == after and archive['files'] == 2 and unpacked['originalMediaUnchanged']
        malicious = fixture / 'writable/backups/unsafe.tar.gz'
        with tarfile.open(malicious, 'w:gz') as tar:
            entry = tarfile.TarInfo('../escape.txt')
            entry.size = 1
            tar.addfile(entry, io.BytesIO(b'x'))
        run('media restore rejects traversal', [sys.executable, str(tool), 'restore', str(malicious)], expected=1)
        assert not (fixture / 'writable/escape.txt').exists()
    report = dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(), database=name,
                  restoreDatabase=restored['database'], passed=True, checks=checks,
                  dockerBuild='not run locally; Docker unavailable; CI container job added')
    (root / 'docs/artifacts/a12-install-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('PASS: fresh install, explicit admin arguments, stdin password, SQL backup/restore and isolated media backup/restore')
    print('Isolated install database retained: ' + name)
finally:
    if credentials and credentials.parent == (root / 'writable').resolve() and credentials.is_file():
        credentials.unlink()
    if sql_file and sql_file.is_relative_to((root / 'writable/backups').resolve()) and sql_file.is_file():
        sql_file.unlink()
    if previous_restore_report is not None:
        restore_artifact.write_bytes(previous_restore_report)

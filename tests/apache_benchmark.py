"""Private localhost Apache + existing supported PHP FastCGI, no XAMPP config edits."""
from contextlib import contextmanager
import json, os, secrets, shutil, socket, subprocess, time, urllib.request, urllib.error
from pathlib import Path

@contextmanager
def apache_server(root, env):
    if os.name != 'nt':
        raise RuntimeError('This isolated Apache runner targets Windows/XAMPP; use staging tooling on other platforms')
    apache = Path(os.environ.get('APACHE_HTTPD', 'C:/xampp/apache/bin/httpd.exe')).resolve()
    if not apache.is_file():
        raise RuntimeError('Set APACHE_HTTPD to the installed Apache executable')
    for port in (8090, 8091):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    private = root / 'writable/apache-benchmark'
    private.mkdir(parents=True, exist_ok=True)
    token = secrets.token_hex(16)
    guard = private / 'guard.php'
    guard.write_text('<?php\nif(PHP_SAPI!=="cli"){\n'
        'if(getenv("DB_NAME")!==' + json.dumps(env['DB_NAME']) + '){http_response_code(503);exit;}\n'
        'header("X-Benchmark-Instance: ' + token + '");\n'
        'header("X-Benchmark-Runtime: ".PHP_VERSION." ".PHP_SAPI);\n'
        'header("X-Benchmark-Worker: ".getmypid());\n}\n', encoding='utf-8')
    (private / 'runtime.ini').write_text(
        'auto_prepend_file="' + guard.as_posix() + '"\n'
        'session.save_path="' + (root / 'writable/sessions').as_posix() + '"\n'
        'cgi.force_redirect=0\nexpose_php=0\ndisplay_errors=0\nlog_errors=1\n', encoding='utf-8')
    env = dict(env, PHP_INI_SCAN_DIR=env['PHP_INI_SCAN_DIR'] + os.pathsep + str(private),
               PHP_FCGI_MAX_REQUESTS='1000')
    server_root = apache.parent.parent.as_posix()
    config = private / 'httpd.conf'
    modules = ['authz_core', 'authz_host', 'dir', 'mime', 'rewrite', 'proxy', 'proxy_fcgi']
    config.write_text('ServerRoot "' + server_root + '"\n'
        + ''.join('LoadModule ' + m + '_module modules/mod_' + m + '.so\n' for m in modules)
        + 'Listen 127.0.0.1:8090\nServerName 127.0.0.1:8090\n'
        + 'PidFile "' + (private / 'httpd.pid').as_posix() + '"\n'
        + 'ErrorLog "' + (private / 'error.log').as_posix() + '"\nLogLevel warn\n'
        + 'ThreadsPerChild 64\nServerTokens Prod\nServerSignature Off\n'
        + 'TypesConfig "' + server_root + '/conf/mime.types"\n'
        + 'DocumentRoot "' + root.as_posix() + '"\n'
        + '<Directory "' + root.as_posix() + '">\nAllowOverride All\nOptions FollowSymLinks\nRequire all granted\n</Directory>\n'
        + '<FilesMatch "\\.php$">\nSetHandler "proxy:fcgi://127.0.0.1:8091/"\n'
        + 'ProxyFCGIBackendType GENERIC\n'
        + 'ProxyFCGISetEnvIf "true" SCRIPT_FILENAME "' + (root / 'index.php').as_posix() + '"\n</FilesMatch>\n'
        + 'ProxyRequests Off\nProxyTimeout 30\n', encoding='utf-8')
    subprocess.run([str(apache), '-t', '-f', str(config)], env=env, check=True, capture_output=True)
    cgi = Path(shutil.which('php')).with_name('php-cgi.exe')
    processes = []
    with (private / 'process.log').open('w') as log:
        try:
            for command in ([str(cgi), '-b', '127.0.0.1:8091'], [str(apache), '-X', '-f', str(config)]):
                processes.append(subprocess.Popen(command, env=env, stdout=log, stderr=log,
                                                   creationflags=subprocess.CREATE_NO_WINDOW))
            for _ in range(60):
                if any(p.poll() is not None for p in processes):
                    raise RuntimeError('Isolated Apache/FastCGI exited; inspect writable/apache-benchmark logs')
                try:
                    with urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=1) as response:
                        assert response.headers.get('X-Benchmark-Instance') == token, 'Wrong benchmark server'
                        runtime = response.headers['X-Benchmark-Runtime']
                        assert runtime.endswith('cgi-fcgi'), runtime
                        assert (8, 3) <= tuple(map(int, runtime.split()[0].split('.')[:2])) < (8, 6), runtime
                        worker = response.headers['X-Benchmark-Worker']
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Isolated Apache did not become ready')
            # The same process must serve successive requests: verify persistence rather than label it.
            with urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=2) as response:
                assert response.headers['X-Benchmark-Worker'] == worker
            checks=[]
            for path, expected in [('/',200),('/lo-trinh',200),('/assets/css/redesign.css',200),
                    ('/application/config/database.php',403),('/writable/apache-benchmark/guard.php',403),
                    ('/tests/performance_profile.php',403),('/.env',403)]:
                try:
                    response=urllib.request.urlopen('http://127.0.0.1:8090'+path, timeout=5)
                except urllib.error.HTTPError as error:
                    response=error
                with response:
                    assert response.status==expected,(path,response.status)
                checks.append(dict(path=path,status=expected))
            yield dict(env, PERFORMANCE_BASE_URL='http://127.0.0.1:8090',
                PERFORMANCE_ENVIRONMENT='Local Windows, Apache 64 request threads + one persistent PHP FastCGI worker; not staging',
                PERFORMANCE_HTTP_RUNTIME=json.dumps(dict(php=runtime, persistentWorkerVerified=True,
                    phpWorkers=1, routingChecks=checks,
                    apache=subprocess.check_output([str(apache), '-v'], text=True).splitlines()[0])))
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                process.wait(timeout=10)

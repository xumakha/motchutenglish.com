"""Local PHP CGI dev server. Never expose publicly; production uses Apache/PHP-FPM.
Avoids Windows PHP built-in server's single-worker preconnection stalls in browser tests.
"""
import http.server,mimetypes,os,shutil,subprocess,sys,urllib.parse,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PHP=Path(shutil.which('php'))
CGI=os.environ.get('PHP_CGI_BIN') or str(PHP.with_name('php-cgi.exe' if os.name=='nt' else 'php-cgi'))
INI=ROOT/'writable/dev-ini';INI.mkdir(parents=True,exist_ok=True)
modules=subprocess.check_output([str(PHP),'-m'],text=True).lower().splitlines()
settings=''.join('extension='+module+'\n' for module in ['intl','fileinfo'] if module not in modules)
settings+='session.save_path="'+str(ROOT/'writable/sessions').replace('\\','/')+'"\ncgi.force_redirect=0\nexpose_php=0\nupload_max_filesize=10M\npost_max_size=12M\n'
(INI/'runtime.ini').write_text(settings,encoding='utf-8')
STATIC={'/assets/css/style.css','/assets/css/product.css','/assets/js/app.js','/assets/js/product.js','/assets/json/courses.json','/assets/images/logo.png','/favicon.ico','/favicon-16x16.png','/favicon-32x32.png','/apple-touch-icon.png','/android-chrome-192x192.png','/android-chrome-512x512.png','/site.webmanifest'}
class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.0'
    disable_nagle_algorithm=True
    def handle(self):
        try:super().handle()
        except (BrokenPipeError,ConnectionResetError):pass
    def log_message(self,*args):pass  # URLs can contain legacy tokens; don't log queries or cookies.
    def handle_request(self):
        path=urllib.parse.urlsplit(self.path).path
        aliases={'/assets/style.css':'/assets/css/style.css','/assets/app.js':'/assets/js/app.js','/assets/courses.json':'/assets/json/courses.json'}
        if path in aliases:
            self.send_response(301);self.send_header('Location',aliases[path]);self.send_header('Content-Length','0');self.end_headers();return
        if path in STATIC:
            content=(ROOT/path.lstrip('/')).read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(path)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(content)));self.end_headers()
            if self.command!='HEAD':self.wfile.write(content)
            return
        started=time.perf_counter()
        if os.environ.get('DEV_TIMING')=='1':print('cgi-request-accepted',flush=True)
        length=int(self.headers.get('Content-Length','0'))
        if length>12*1024*1024:self.send_error(413);return
        body=self.rfile.read(length) if length else b''
        env=dict(os.environ,REDIRECT_STATUS='200',GATEWAY_INTERFACE='CGI/1.1',SERVER_PROTOCOL='HTTP/1.1',SERVER_NAME='127.0.0.1',SERVER_PORT=str(self.server.server_port),DOCUMENT_ROOT=str(ROOT),SCRIPT_FILENAME=str(ROOT/'index.php'),SCRIPT_NAME='/index.php',REQUEST_URI=self.path,QUERY_STRING=urllib.parse.urlsplit(self.path).query,REQUEST_METHOD=self.command,CONTENT_LENGTH=str(length),CONTENT_TYPE=self.headers.get('Content-Type',''),REMOTE_ADDR='127.0.0.1')
        env['PHP_INI_SCAN_DIR']=os.environ.get('PHP_INI_SCAN_DIR','')+os.pathsep+str(INI)
        for key,value in self.headers.items():
            if key.lower() not in ['content-type','content-length']:env['HTTP_'+key.upper().replace('-','_')]=value
        process=subprocess.run([CGI],input=body,capture_output=True,env=env,cwd=ROOT,timeout=30,creationflags=0x08000000 if os.name=='nt' else 0)
        head,sep,content=process.stdout.partition(b'\r\n\r\n')
        if not sep:head,sep,content=process.stdout.partition(b'\n\n')
        if not sep:self.send_error(503,'PHP CGI unavailable');return
        status=200;headers=[]
        for line in head.decode('latin1').splitlines():
            key,colon,value=line.partition(':')
            if key.lower()=='status':status=int(value.strip().split()[0])
            elif colon and key.lower() not in ['content-length','connection']:headers.append((key,value.strip()))
        if os.environ.get('DEV_TIMING')=='1':print('cgi-response',status,round(time.perf_counter()-started,3),flush=True)
        self.send_response(status)
        for key,value in headers:self.send_header(key,value)
        self.send_header('Content-Length',str(len(content)));self.send_header('Connection','close');self.end_headers()
        if self.command!='HEAD':self.wfile.write(content)
    do_GET=do_POST=do_PUT=do_PATCH=do_DELETE=do_HEAD=handle_request
class LocalServer(http.server.ThreadingHTTPServer):
    request_queue_size=128
    daemon_threads=True

if __name__=='__main__':
    (ROOT/'writable/sessions').mkdir(parents=True,exist_ok=True)
    print('Local PHP CGI server on http://127.0.0.1:'+str(sys.argv[1] if len(sys.argv)>1 else 8080),flush=True)
    LocalServer(('127.0.0.1',int(sys.argv[1]) if len(sys.argv)>1 else 8080),Handler).serve_forever()

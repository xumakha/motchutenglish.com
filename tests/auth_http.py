"""End-to-end checks against an isolated MySQL database and PHP server.
Start the PHP server with DB_NAME pointing to a dedicated test database.
"""
import urllib.request, urllib.error, urllib.parse, http.cookiejar, re, secrets

BASE='http://127.0.0.1:8089'
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def request(path, fields=None):
    payload=urllib.parse.urlencode(fields).encode() if fields is not None else None
    try:
        response=client.open(BASE+path, payload)
    except urllib.error.HTTPError as error:
        response=error
    return response.code, response.read().decode(), response.geturl(), response.headers

def token(body):
    match=re.search(r'name="csrf" value="([a-f0-9]+)"',body)
    assert match, 'Missing CSRF token'
    return match[1]

def sid():
    return next(c.value for c in jar if c.name=='mce_session')

email='test-'+secrets.token_hex(6)+'@example.com'
password='Test-password-123!'
status,body,location,_=request('/account')
assert status==200 and location.endswith('/login')
csrf=token(body)
status,_,_,_=request('/register',{'name':'Test','email':email,'password':password,'password_confirm':password})
assert status==403, 'CSRF protection'
status,_,_,_=request('/register',{'csrf':csrf,'name':'Test','email':'invalid','password':'short','password_confirm':'other'})
assert status==422, 'Registration validation'
old_sid=sid()
status,body,location,_=request('/register',{'csrf':csrf,'name':'<script>alert(1)</script>','email':email,'password':password,'password_confirm':password})
assert status==200 and location.endswith('/account') and email in body
assert '<script>alert(1)</script>' not in body and '&lt;script&gt;' in body
assert sid()!=old_sid, 'Session fixation protection'
csrf=token(body)
status,_,_,_=request('/logout')
assert status==405, 'Logout must require POST'
status,_,_,_=request('/logout',{'csrf':'wrong'})
assert status==403
status,body,location,_=request('/logout',{'csrf':csrf})
assert status==200 and location.endswith('/login')
status,_,location,_=request('/account')
assert location.endswith('/login'), 'Session cleared'
csrf=token(body)
status,_,_,_=request('/register',{'csrf':csrf,'name':'Duplicate','email':email.upper(),'password':password,'password_confirm':password})
assert status==422, 'Unique normalized email'
status,_,_,_=request('/login',{'csrf':csrf,'email':email,'password':'wrong-password'})
assert status==422
status,_,_,_=request('/login',{'csrf':csrf,'email':"x' OR '1'='1@example.com",'password':'wrong-password'})
assert status==422, 'SQL injection rejected'
old_sid=sid()
status,body,location,_=request('/login',{'csrf':csrf,'email':email.upper(),'password':password})
assert status==200 and location.endswith('/account') and sid()!=old_sid
status,body,location,_=request('/logout',{'csrf':token(body)})
csrf=token(body)
for _ in range(16):
    status,_,_,headers=request('/login',{'csrf':csrf,'email':email,'password':'wrong-password'})
assert status==429 and headers.get('Retry-After')=='900', 'Login rate limit'
status,body,_,headers=request('/')
assert status==200 and headers.get('Cache-Control')=='no-store, private'
assert 'href="/courses"' in body and 'href="/login"' in body and 'href="/register"' in body
assert not re.search(r'(?:href|action)="[^"]*index\.php',body)
for path in ['/courses','/courses/beginner/hello','/listening/coffee','/placement','/dashboard','/toeic']:
    status,body,_,_=request(path)
    assert status==200 and 'Warning:' not in body and 'Fatal error' not in body,path
for path in ['/config.php','/database/schema.sql','/includes/auth.php','/tests/auth_http.py']:
    status,_,_,_=request(path)
    assert status==404, 'Internal files not exposed by development router'
print('PASS: registration, duplicate email, login, session rotation, logout, CSRF, validation, escaping, rate limiting, clean links, protected routes and public pages')

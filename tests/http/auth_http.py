"""End-to-end checks against an isolated MySQL database and a running app (tests/http/run_next.py)."""
import urllib.request, urllib.parse, http.cookiejar, re, secrets
from http_target import assert_rejected, login, logout, open_request, register

jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def request(path, fields=None, origin=...):
    payload=urllib.parse.urlencode(fields).encode() if fields is not None else None
    kwargs={} if origin is ... else dict(origin=origin)
    return open_request(client, path, payload, **kwargs)[:4]

# Better Auth's session token cookie.
SESSION_COOKIE='mce.session_token'
def sid():
    return next((c.value for c in jar if c.name==SESSION_COOKIE),None)

email='test-'+secrets.token_hex(6)+'@example.com'
password='Test-password-123!'
status,body,location,_=request('/account')
assert status==200 and location.endswith('/login')
# No CSRF token: a write without a same-origin Origin header is refused by proxy.ts.
status,_,_,_=request('/register',{'name':'Test','email':email,'password':password,'password_confirm':password},origin=None)
assert status==403, 'CSRF protection'
assert_rejected(register(client,'Test','invalid','short','other'),422,label='Registration validation')
old_sid=sid()
status,body,location,_=register(client,'<script>alert(1)</script>',email,password)
assert status==200 and location.endswith('/account') and email in body
assert '<script>alert(1)</script>' not in body and '&lt;script&gt;' in body
assert sid() and sid()!=old_sid, 'Session fixation protection'
status,_,_,_=request('/logout')
assert status==405, 'Logout must require POST'
status,_,_,_=logout(client,origin='https://evil.example')
assert status==403
status,body,location,_=logout(client)
assert status==200 and location.endswith('/login')
status,_,location,_=request('/account')
assert location.endswith('/login'), 'Session cleared'
assert_rejected(register(client,'Duplicate',email.upper(),password),422,'Email này đã được đăng ký','Unique normalized email')
assert_rejected(login(client,email,'wrong-password'),422,'Email hoặc mật khẩu chưa đúng')
assert_rejected(login(client,"x' OR '1'='1@example.com",'wrong-password'),422,label='SQL injection rejected')
old_sid=sid()
status,body,location,_=login(client,email.upper(),password)
assert status==200 and location.endswith('/account') and sid() and sid()!=old_sid
status,body,location,_=logout(client)
for _ in range(16):
    result=login(client,email,'wrong-password')
# Fix 8: failed sign-ins only, 15 per IP + email. A Server Action cannot set the status or a
# Retry-After header, so the lockout shows as the form error (and the right password fails too).
assert_rejected(result,429,'Bạn đã thử quá nhiều lần',label='Login rate limit')
status,_,location,_=login(client,email,password)
assert not location.endswith('/account') and not sid(), 'Locked-out account must not sign in'
status,body,_,headers=request('/')
assert status==200
assert 'href="/courses"' in body and 'href="/login"' in body and 'href="/register"' in body
assert not re.search(r'(?:href|action)="[^"]*index\.php',body)
for path in ['/courses','/courses/beginner/hello','/listening/coffee','/placement','/dashboard','/toeic']:
    status,body,_,_=request(path)
    assert status==200 and 'Warning:' not in body and 'Fatal error' not in body,path
for path in ['/config.php','/database/schema.sql','/includes/auth.php','/tests/auth_http.py']:
    status,_,_,_=request(path)
    assert status==404, 'Internal files not exposed by development router'
print('PASS: registration, duplicate email, login, session rotation, logout, CSRF, validation, escaping, rate limiting, clean links, protected routes and public pages')

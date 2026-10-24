"""Run on the same isolated DB, with MAIL_DRIVER=log and APP_ENV=test."""
import json,secrets,http.cookiejar,urllib.request,urllib.parse
from http_target import api_headers, assert_rejected, fixture as target_fixture, login, open_request, worker as target_worker
def fixture(*args):return target_fixture('product',*args)
def worker():target_worker('run','50')
class Client:
    def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def req(self,path,data=None,api=False):
        payload=(json.dumps(data).encode() if api else urllib.parse.urlencode(data).encode()) if data is not None else None
        code,body,_,_=open_request(self.opener,path,payload,api_headers() if api else {})
        assert 'Fatal error' not in body and 'Warning:' not in body,(path,body);return code,body
    def login(self,email,password='Product-test-123!',expected=200):
        result=login(self.opener,email,password)
        if expected!=200:return assert_rejected(result,expected,label=email)
        code,body,url,_=result;assert code==200 and url.endswith('/account'),(code,url)
    def api(self,route,data=None,expected=200):
        code,body=self.req('/api/v1/'+route,data,data is not None);assert code==expected,(route,code,body);return json.loads(body)
fixture('authclear');users=json.loads(fixture('setup'));email=users['learner']['email'];uid=users['learner']['id']
a,b=Client(),Client();a.login(email);b.login(email)
a.api('email/verify',{})
worker();token=fixture('mail-token',email,'Xác minh').strip()
a.api('email/consume',dict(token=token,purpose='verify'));a.api('email/consume',dict(token=token,purpose='verify'),422)
valid=a.api('password/reset-request',dict(email=email))['data'];unknown=a.api('password/reset-request',dict(email='missing-'+secrets.token_hex(5)+'@example.com'))['data'];assert valid==unknown
worker();token=fixture('mail-token',email,'Đặt lại').strip()
new_password='Reset-password-456!'
a.api('password/reset',dict(token=token,password=new_password));a.api('password/reset',dict(token=token,password=new_password),422)
b.api('progress',expected=401)
a=Client();a.login(email,'Product-test-123!',422);a.login(email,new_password)
new_email='changed-'+secrets.token_hex(6)+'@example.com';a.api('email/verify',dict(email=new_email))
assert json.loads(fixture('user',uid))['email']==email,'Changed email before verification'
worker();token=fixture('mail-token',new_email,'Xác minh').strip();a.api('email/consume',dict(token=token,purpose='verify'))
a=Client();a.login(new_email,new_password)
a.api('reminders',dict(enabled=True,hour=0))
for _ in range(2):target_worker('tick')
worker();unsubscribe=fixture('mail-token',new_email,'Một chút English hôm nay').strip();a.api('email/consume',dict(token=unsubscribe,purpose='unsubscribe'))
new_password2='Changed-password-789!';a.api('password/change',dict(current=new_password,password=new_password2));a.api('progress',expected=401)
a=Client();a.login(new_email,new_password2)
assert a.req('/du-lieu/export')[0]==200
export_key=secrets.token_hex(16)
a.api('exports/request',dict(kind='personal',requestKey=export_key));a.api('exports/request',dict(kind='personal',requestKey=export_key));worker()
code,exported=a.req('/du-lieu/export-file/'+export_key);assert code==200,(code,exported)
export_doc=json.loads(exported);assert export_doc['kind']=='personal' and export_doc['user'][0]['email']==new_email
assert 'password_hash' not in exported and 'presented_order' not in exported
# Password hashes live in Better Auth's auth_accounts; the export must not include them.
assert '"password"' not in exported and 'auth_accounts' not in exported
anonymous=Client();assert anonymous.req('/du-lieu/export-file/'+export_key)[0] in [401,403]

# Create private learner data before controlled deletion.
catalog=json.loads(fixture('catalog'));a.api('vocabulary/save',dict(senseId=catalog['vocabulary'][0]['id'],notes='Private erasure test',review=True))
a.api('account/delete',dict(password=new_password2));a.api('progress',expected=401);worker()
print(fixture('privacy-check',uid).strip())
print('PASS: real development mail sink, verification, one-use reset, session revocation, safe email change, opt-in reminders, unsubscribe, password change, export and queued deletion')

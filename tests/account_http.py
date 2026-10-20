"""Run on the same isolated DB, with MAIL_DRIVER=log and APP_ENV=test."""
import json,re,secrets,subprocess,http.cookiejar,urllib.request,urllib.error,urllib.parse
BASE='http://127.0.0.1:8089'
def fixture(*args):return subprocess.check_output(['php','tests/product_fixture.php',*map(str,args)],text=True,encoding='utf-8')
def worker():subprocess.run(['php','database/worker.php','run','50'],check=True,capture_output=True)
class Client:
    def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=''
    def req(self,path,data=None,api=False):
        payload=(json.dumps(data).encode() if api else urllib.parse.urlencode(data).encode()) if data is not None else None
        headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf} if api else {}
        try:r=self.opener.open(urllib.request.Request(BASE+path,payload,headers))
        except urllib.error.HTTPError as e:r=e
        body=r.read().decode();assert 'Fatal error' not in body and 'Warning:' not in body,(path,body);return r.code,body
    def login(self,email,password='Product-test-123!',expected=200):
        _,body=self.req('/login');self.csrf=re.search('name="csrf" value="([a-f0-9]+)"',body)[1]
        code,body=self.req('/login',dict(csrf=self.csrf,email=email,password=password));assert code==expected,(code,body)
        if code==200:self.csrf=re.search('name="csrf" value="([a-f0-9]+)"',body)[1]
    def api(self,route,data=None,expected=200):
        code,body=self.req('/api/v1/'+route,data,data is not None);assert code==expected,(route,code,body);return json.loads(body)
fixture('authclear');users=json.loads(fixture('setup'));email=users['learner']['email'];uid=users['learner']['id']
a,b=Client(),Client();a.login(email);b.login(email)
a.api('email/verify',{})
worker();token=fixture('mail-token',email,'Xác minh')
a.api('email/consume',dict(token=token,purpose='verify'));a.api('email/consume',dict(token=token,purpose='verify'),422)
valid=a.api('password/reset-request',dict(email=email))['data'];unknown=a.api('password/reset-request',dict(email='missing-'+secrets.token_hex(5)+'@example.com'))['data'];assert valid==unknown
worker();token=fixture('mail-token',email,'Đặt lại')
new_password='Reset-password-456!'
a.api('password/reset',dict(token=token,password=new_password));a.api('password/reset',dict(token=token,password=new_password),422)
b.api('progress',expected=401)
a=Client();a.login(email,'Product-test-123!',422);a.login(email,new_password)
new_email='changed-'+secrets.token_hex(6)+'@example.com';a.api('email/verify',dict(email=new_email))
assert json.loads(fixture('user',uid))['email']==email,'Changed email before verification'
worker();token=fixture('mail-token',new_email,'Xác minh');a.api('email/consume',dict(token=token,purpose='verify'))
a=Client();a.login(new_email,new_password)
a.api('reminders',dict(enabled=True,hour=0))
for _ in range(2):subprocess.run(['php','database/worker.php','tick'],check=True,capture_output=True)
worker();unsubscribe=fixture('mail-token',new_email,'Một chút English hôm nay');a.api('email/consume',dict(token=unsubscribe,purpose='unsubscribe'))
new_password2='Changed-password-789!';a.api('password/change',dict(current=new_password,password=new_password2));a.api('progress',expected=401)
a=Client();a.login(new_email,new_password2)
assert a.req('/du-lieu/export')[0]==200
# Create private learner data before controlled deletion.
catalog=json.loads(fixture('catalog'));a.api('vocabulary/save',dict(senseId=catalog['vocabulary'][0]['id'],notes='Private erasure test',review=True))
a.api('account/delete',dict(password=new_password2));a.api('progress',expected=401);worker()
print(fixture('privacy-check',uid).strip())
print('PASS: real development mail sink, verification, one-use reset, session revocation, safe email change, opt-in reminders, unsubscribe, password change, export and queued deletion')

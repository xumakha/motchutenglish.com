"""Real API and SSR must apply the same pending timezone before the daily cap."""
import http.cookiejar,json,re,subprocess,urllib.parse,urllib.request

def fixture(*args):
    return json.loads(subprocess.check_output(['php','tests/timezone_fixture.php',*map(str,args)],text=True,encoding='utf-8'))

user=fixture('setup')
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
base='http://127.0.0.1:8089'
with client.open(base+'/login') as r:page=r.read().decode()
csrf=re.search(r'name="csrf" value="([a-f0-9]+)"',page)[1]
with client.open(base+'/login',urllib.parse.urlencode(dict(csrf=csrf,email=user['email'],password='Timezone-http-test-123!')).encode()) as r:
    assert r.geturl().endswith('/account'),'Fixture login failed'
with client.open(base+'/api/v1/review/queue') as r:cards=json.load(r)['data']
assert len(cards)==user['queueCount'],('API daily cap used old timezone',len(cards),user['queueCount'])
assert fixture('state',user['id'])==dict(timezone='Pacific/Kiritimati',pending=0)
with client.open(base+'/on-tap') as r:page=r.read().decode()
assert 'Đã ôn '+str(user['used'])+'/1' in page,'SSR daily count differs from API'
assert ('Timezone HTTP due' in page)==bool(user['queueCount']),'SSR cards differ from API'
with client.open(base+'/api/v1/review/queue?more=1') as r:extra=json.load(r)['data']
assert len(extra)==1 and int(extra[0]['id'])==user['dueId'],'Explicit extra study changed'
with client.open(base+'/api/v1/me/quests') as r:quests=json.load(r)['data']
assert quests and all(q['timezone']=='Pacific/Kiritimati' for q in quests),'Quest API used stale profile'
print('PASS: real review API/HTML pending-timezone parity, daily cap, opt-in extra queue and quest API timezone')

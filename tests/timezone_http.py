"""Real API and SSR must apply the same pending timezone before the daily cap."""
import http.cookiejar,json,urllib.request
from http_target import BASE, fixture as target_fixture, login, text

def fixture(*args):
    return json.loads(target_fixture('timezone',*args))

user=fixture('setup')
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
base=BASE
_,_,url,_=login(client,user['email'],'Timezone-http-test-123!')
assert url.endswith('/account'),'Fixture login failed'
with client.open(base+'/api/v1/review/queue') as r:cards=json.load(r)['data']
assert len(cards)==user['queueCount'],('API daily cap used old timezone',len(cards),user['queueCount'])
assert fixture('state',user['id'])==dict(timezone='Pacific/Kiritimati',pending=0)
with client.open(base+'/on-tap') as r:page=text(r.read())
assert 'Đã ôn '+str(user['used'])+'/1' in page,'SSR daily count differs from API'
assert ('Timezone HTTP due' in page)==bool(user['queueCount']),'SSR cards differ from API'
with client.open(base+'/api/v1/review/queue?more=1') as r:extra=json.load(r)['data']
assert len(extra)==1 and int(extra[0]['id'])==user['dueId'],'Explicit extra study changed'
with client.open(base+'/api/v1/me/quests') as r:quests=json.load(r)['data']
assert quests and all(q['timezone']=='Pacific/Kiritimati' for q in quests),'Quest API used stale profile'
print('PASS: real review API/HTML pending-timezone parity, daily cap, opt-in extra queue and quest API timezone')

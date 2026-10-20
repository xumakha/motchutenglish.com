import http.cookiejar, json, re, secrets, subprocess, urllib.request, urllib.error, urllib.parse, io, wave
from concurrent.futures import ThreadPoolExecutor
BASE='http://127.0.0.1:8089'
def fixture(*args):return subprocess.check_output(['php','tests/product_fixture.php',*map(str,args)],text=True,encoding='utf-8')
class Client:
    def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=''
    def req(self,path,data=None,json_data=False):
        payload=(json.dumps(data).encode() if json_data else urllib.parse.urlencode(data).encode()) if data is not None else None
        headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf} if json_data else {}
        try:r=self.opener.open(urllib.request.Request(BASE+path,payload,headers))
        except urllib.error.HTTPError as e:r=e
        body=r.read().decode();assert 'Fatal error' not in body and 'Warning:' not in body,(path,body)
        return r.code,body,r.geturl()
    def login(self,email):
        _,body,_=self.req('/login');token=re.search(r'name="csrf" value="([a-f0-9]+)"',body)[1]
        status,body,url=self.req('/login',dict(csrf=token,email=email,password='Product-test-123!'));assert status==200 and url.endswith('/account')
        self.csrf=re.search(r'name="csrf" value="([a-f0-9]+)"',body)[1]
    def api(self,route,data=None,status=200):
        code,body,_=self.req('/api/v1/'+route,data,data is not None);assert code==status,(route,code,body);j=json.loads(body);return j.get('data',j.get('error'))
    def upload(self,filename,content,expected=200):
        boundary='mce'+secrets.token_hex(12);parts=[]
        for key,value in dict(alt='Test-generated asset',source='Generated inside isolated test suite',license='Test fixture owned by this project').items():parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+value+'\r\n').encode())
        parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+filename+'"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+content+b'\r\n');parts.append(('--'+boundary+'--\r\n').encode())
        req=urllib.request.Request(BASE+'/api/v1/admin/upload',b''.join(parts),{'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':self.csrf})
        try:r=self.opener.open(req)
        except urllib.error.HTTPError as e:r=e
        body=r.read().decode();assert r.code==expected,(r.code,body);j=json.loads(body);return j.get('data',j.get('error'))
users=json.loads(fixture('setup'))
for _ in range(2):subprocess.run(['php','database/seed-product.php','--publish-reviewed-samples'],check=True,capture_output=True)
catalog=json.loads(fixture('catalog'));assert len(catalog['paths'])==2 and len(catalog['lessons'])==16 and len(catalog['vocabulary'])==40
clients={r:Client() for r in users}
for role,c in clients.items():c.login(users[role]['email'])
admin,editor,learner,other=(clients[r] for r in ['admin','editor','learner','other'])
assert sum(l['subtype']=='checkpoint' for l in catalog['lessons'])==4
for path in ['/du-lieu/template-paths','/du-lieu/template-units','/du-lieu/template-articles','/du-lieu/template-vocabulary_sets','/chien-dich/'+catalog['paths'][0]['slug']+'?utm_source=test','/tu-vung?page=2','/lo-trinh','/tu-vung','/kien-thuc','/tim-kiem?q=hello','/hoc','/bat-dau','/so-tu-vung','/on-tap','/tien-do','/tai-khoan','/reward-shop','/admin/lessons','/admin/paths','/admin/operations']:
    client=admin if path.startswith(('/admin/','/du-lieu/template-')) else learner
    code,body,url=client.req(path);assert code==200 and not url.endswith('/login'),(path,code,url)
assert learner.req('/admin/lessons')[0]==403
editor.api('admin/role',dict(userId=users['learner']['id'],role='admin'),403)
lesson=next(l for l in catalog['lessons'] if l['slug']=='chao-hoi-tung-buoc')
key=secrets.token_hex(16)
learner.api('attempts/start',dict(lessonId=lesson['id'],requestKey=key))
state=learner.api('attempts/'+key)
original_doc=json.loads(lesson['document']);changed_doc=json.loads(lesson['document']);changed_doc['exercises'][0]['payload']['answerId']='night';changed_doc['exercises'][0]['explanation']='NEW_VERSION_EXPLANATION'
new_version=editor.api('admin/version',dict(lessonId=lesson['id'],slug=lesson['slug'],title='Updated draft',document=changed_doc))['versionId']
editor.api('admin/workflow',dict(versionId=new_version,action='review'));admin.api('admin/workflow',dict(versionId=new_version,action='publish'))
assert learner.api('attempts/'+key)['versionId']==lesson['version_id'],'Published update changed an active snapshot'
other.api('attempts/'+key,status=404)
assert all(i['feedback'] is None for i in state['items'])
assert 'answerId' not in json.dumps(state) and 'acceptedOrders' not in json.dumps(state)
learner.api('attempts/'+key+'/finish',dict(revision=state['revision']),422)
def mutate(action,**kwargs):
    global state
    state=learner.api('attempts/'+key+'/'+action,dict(revision=state['revision'],**kwargs));return state
for b in state['blocks']:mutate('view',block=b['id'])
mutate('navigate',position=2);assert learner.api('attempts/'+key)['position']==2
mutate('navigate',position=0)
answers={'hello':'greeting','name':True,'am':{'verb':' am. '},'order':['my','name','is','linh']}
for item in list(state['items']):
    e=item['exercise'];eid=e['id'];response=answers.get(eid)
    if e['type']=='match':response={left:next(k for k,v in e['payload']['right'].items() if v=={'hello':'Xin chào','thanks':'Cảm ơn'}[left]) for left in e['payload']['left']}
    old_revision=state['revision'];mutate('draft',exerciseId=eid,response=response)
    learner.api('attempts/'+key+'/draft',dict(revision=old_revision,exerciseId=eid,response=response))
    learner.api('attempts/'+key+'/draft',dict(revision=old_revision,exerciseId=eid,response=None),409)
    mutate('submit',exerciseId=eid,response=response)
    learner.api('attempts/'+key+'/submit',dict(revision=old_revision,exerciseId=eid,response=response))
mutate('finish');assert int(state['score'])==6 and int(state['maxScore'])==6
assert 'NEW_VERSION_EXPLANATION' not in json.dumps(state)
learner.api('attempts/'+key+'/finish',dict(revision=0))
restore_version=editor.api('admin/version',dict(lessonId=lesson['id'],slug=lesson['slug'],title=lesson['title'],document=original_doc))['versionId']
editor.api('admin/workflow',dict(versionId=restore_version,action='review'));admin.api('admin/workflow',dict(versionId=restore_version,action='publish'))
# Private notes and due review are durable and protected.
v=catalog['vocabulary'][0]
learner.api('vocabulary/save',dict(senseId=v['id'],notes='<script>private-note</script>',review=True))
assert '&lt;script&gt;private-note&lt;/script&gt;' in learner.req('/so-tu-vung')[1]
assert 'private-note' not in other.req('/so-tu-vung')[1]
queue=learner.api('review/queue');assert len(queue)==1
card=queue[0];reviewkey=secrets.token_hex(16);rating=dict(cardId=card['id'],revision=int(card['revision']),requestKey=reviewkey,rating='good')
other.api('review/rate',rating,404)
learner.api('review/rate',rating);learner.api('review/rate',rating)
assert learner.api('review/queue')==[]
# Concurrent purchases with separate DB connections cannot overspend or duplicate ownership.
fixture('coins',users['learner']['id']);purchasekey=secrets.token_hex(16)
with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:fixture('purchase',users['learner']['id'],'mint',purchasekey),range(2)))
assert all('ok' in r for r in results)
learner.api('avatar',dict(itemId='mint'))
learner.api('avatar',dict(itemId='sun'),403)
# Atomic import dry run + retry commit.
document=json.loads(lesson['document']);batch={'schemaVersion':1,'namespace':'http-test','lessons':[dict(externalId='one',unitId=lesson['unit_id'],slug='imported-'+secrets.token_hex(4),title='Imported sample',document=document)]}
preview=editor.api('admin/import-preview',dict(raw=json.dumps(batch)));assert not preview['errors']
for _ in range(2):editor.api('admin/import-commit',dict(importId=preview['id']))
bad=json.loads(json.dumps(batch));bad['lessons'][0]['document']['exercises'][0]['payload']['answerId']='missing'
assert editor.api('admin/import-preview',dict(raw=json.dumps(bad)))['errors']
learner.api('reports',dict(versionId=lesson['version_id'],position='hello',category='typo',description='Please review this example.'))
assert 'Please review' in editor.req('/admin/reports')[1]
# SMTP absent is explicit, not a false success.
learner.api('password/reset-request',dict(email=users['learner']['email']),503)
# Placement hides all feedback until finish and presents exactly 20 fixed questions.
placement=next(l for l in catalog['lessons'] if l['subtype']=='placement');pk=secrets.token_hex(16)
learner.api('attempts/start',dict(lessonId=placement['id'],requestKey=pk,mode='test'))
ps=learner.api('attempts/'+pk);assert len(ps['items'])==20
placement_answer=json.loads(placement['document'])['exercises'][0]['payload']['answerId']
ps=learner.api('attempts/'+pk+'/submit',dict(revision=ps['revision'],exerciseId=ps['items'][0]['exercise']['id'],response=placement_answer))
assert ps['items'][0]['feedback'] is None
print(fixture('verify',users['learner']['id'],key).strip())
# MIME validation and licensed media references, using generated non-speech audio only in this isolated DB.
learner.upload('x.wav',b'not audio',403)
editor.upload('bad.png',b'<?php echo "unsafe";',422)
editor.upload('bad.svg',b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',422)
audio=io.BytesIO()
with wave.open(audio,'wb') as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0\0'*800)
aid=editor.upload('fixture.wav',audio.getvalue())['id']
audio_doc=json.loads(json.dumps(document));audio_doc['blocks']=[dict(id='audio',type='audio',audioId=aid,transcript='TEST_TRANSCRIPT_AUDIO',required=True)]
base_ex=dict(schemaVersion=1,contentVersion=1,explanation='Test audio engine.',skillTags=['listening'],level='A1')
audio_doc['exercises']=[dict(base_ex,id='listen-choice',type='listening_choice',payload=dict(prompt='Test listening choice',audioId=aid,transcript='TEST_TRANSCRIPT_AUDIO',choices={'a':'Tea','b':'Coffee'},answerId='a')),dict(base_ex,id='listen-fill',type='listening_fill',payload=dict(prompt='Test listening fill',audioId=aid,transcript='TEST_TRANSCRIPT_AUDIO',blanks={'word':['tea']}))]
vid=editor.api('admin/version',dict(unitId=lesson['unit_id'],slug='audio-test-'+secrets.token_hex(4),title='Isolated audio test',document=audio_doc))['versionId']
editor.api('admin/workflow',dict(versionId=vid,action='review'));editor.api('admin/workflow',dict(versionId=vid,action='publish'),403);admin.api('admin/workflow',dict(versionId=vid,action='publish'))
audio_lesson=next(l for l in json.loads(fixture('catalog'))['lessons'] if l['version_id']==vid);ak=secrets.token_hex(16)
other.api('attempts/start',dict(lessonId=audio_lesson['id'],requestKey=ak,mode='test'));ast=other.api('attempts/'+ak);assert 'TEST_TRANSCRIPT_AUDIO' not in json.dumps(ast)
ast=other.api('attempts/'+ak+'/view',dict(revision=ast['revision'],block='audio'))
ast=other.api('attempts/'+ak+'/submit',dict(revision=ast['revision'],exerciseId='listen-choice',response='a'));assert ast['items'][0]['feedback'] is None
ast=other.api('attempts/'+ak+'/audio_error',dict(revision=ast['revision'],exerciseId='listen-fill'))
ast=other.api('attempts/'+ak+'/finish',dict(revision=ast['revision']));assert ast['audioUnavailable'] and int(ast['maxScore'])==1
admin.api('admin/workflow',dict(versionId=vid,action='archive'));assert other.api('attempts/'+ak)['status']=='finished'
with other.opener.open(BASE+'/media/'+str(aid)) as media:assert media.status==200 and media.headers['Content-Type'].startswith('audio/') and media.read().startswith(b'RIFF')
# CSV dry-run/commit preserves ownership and creates drafts only.
csv='schemaVersion,externalId,slug,lemma,ipa,part_of_speech,topic,meaning,example,translation,level\n1,csv-one,csv-private-example,example,,noun,tests,vi du,An example.,Mot vi du.,A1\n'
csv_preview=editor.api('admin/import-preview',dict(raw=csv));assert not csv_preview['errors']
editor.api('admin/import-commit',dict(importId=csv_preview['id']));editor.api('admin/import-commit',dict(importId=csv_preview['id']))
# Large commits really enter the DB queue; no network email/analytics is enabled in this test environment.
rows=[dict(externalId='bulk-'+str(n),slug='bulk-example-'+str(n),lemma='example '+str(n),ipa='',part_of_speech='noun',topic='tests',meaning='sample',example='An example.',translation='Vi du.',level='A1') for n in range(101)]
bulk=editor.api('admin/import-preview',dict(raw=json.dumps(dict(schemaVersion=1,namespace='large-test',vocabulary=rows))));assert not bulk['errors']
editor.api('admin/import-commit',dict(importId=bulk['id']));subprocess.run(['php','database/worker.php','run','50'],check=True,capture_output=True)
assert 'committed' in editor.req('/admin/imports')[1]
print('PASS: versioned learning, all product pages, optimistic conflicts, idempotent submit/finish, notes ownership, review, concurrent shop, atomic import and test-mode redaction')

# Every metadata import template passes the same validator as CMS and commits once.
from pathlib import Path
for kind in ['paths','units','articles','vocabulary_sets']:
    batch=json.loads(Path('database/templates/'+kind+'.json').read_text(encoding='utf-8'))
    batch['namespace']='template-'+kind.replace('_','-')
    if kind=='units':batch[kind][0]['path_id']=catalog['paths'][0]['id']
    preview=admin.api('admin/import-preview',dict(raw=json.dumps(batch)));assert preview['errors']==[],(kind,preview)
    admin.api('admin/import-commit',dict(importId=preview['id']));admin.api('admin/import-commit',dict(importId=preview['id']))
    assert admin.api('admin/import-preview',dict(raw=json.dumps(batch)))['errors']
set_id=editor.api('admin/entity',dict(kind='vocabulary_sets',slug='integration-set',title='Integration set',description='Owned fixture',status='draft',sort_order=2))['id']
editor.api('admin/set-items',dict(setId=set_id,ids=[v['id']]))
admin.api('admin/entity',dict(kind='vocabulary_sets',id=set_id,slug='integration-set',title='Integration set',description='Owned fixture',status='published',sort_order=2))
assert learner.req('/tu-vung/chu-de/integration-set')[0]==200
# Daily limit applies server-side and explicit extra study is voluntary.
learner.api('profile',dict(goal='foundation',selfLevel='beginner',minutes=10,timezone='Asia/Ho_Chi_Minh',reviewLimit=1,gamification=False,animations=False))
learner.api('vocabulary/save',dict(senseId=catalog['vocabulary'][1]['id'],notes='',review=True))
assert learner.api('review/queue')==[]
card=learner.api('review/queue?more=1')[0]
rating=dict(cardId=card['id'],revision=int(card['revision']),requestKey=secrets.token_hex(16),rating='easy')
learner.api('review/rate',rating,422);rating['extra']=True;learner.api('review/rate',rating);learner.api('review/rate',rating)
assert learner.req('/on-tap?manage=1')[0]==200
print('PASS: metadata templates, vocabulary-set membership, daily review limit, explicit extra and gamification-disabled review')

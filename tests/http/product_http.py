import hashlib
import http.cookiejar, json, re, secrets, urllib.request, urllib.parse, io, wave
from concurrent.futures import ThreadPoolExecutor
from http_target import BASE, ROOT, api_headers, assert_denied, settle_cache, call_action, find_form, fixture as target_fixture, login, open_request, register, seed, worker
def fixture(*args):return target_fixture('product',*args)
class Client:
    def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def req(self,path,data=None,json_data=False):
        payload=(json.dumps(data).encode() if json_data else urllib.parse.urlencode(data).encode()) if data is not None else None
        code,body,url,_=open_request(self.opener,path,payload,api_headers() if json_data else {})
        assert 'Fatal error' not in body and 'Warning:' not in body,(path,body)
        return code,body,url
    def login(self,email):
        status,body,url,_=login(self.opener,email,'Product-test-123!');assert status==200 and url.endswith('/account')
    def api(self,route,data=None,status=200):
        code,body,_=self.req('/api/v1/'+route,data,data is not None);assert code==status,(route,code,body);settle_cache(route,code);j=json.loads(body);return j.get('data',j.get('error'))
    def upload(self,filename,content,expected=200):
        boundary='mce'+secrets.token_hex(12);parts=[]
        for key,value in dict(alt='Test-generated asset',source='Generated inside isolated test suite',license='Test fixture owned by this project').items():parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+value+'\r\n').encode())
        parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+filename+'"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+content+b'\r\n');parts.append(('--'+boundary+'--\r\n').encode())
        headers={'Content-Type':'multipart/form-data; boundary='+boundary}
        code,body,_,_=open_request(self.opener,'/api/v1/admin/upload',b''.join(parts),headers)
        assert code==expected,(code,body);j=json.loads(body);return j.get('data',j.get('error'))
users=json.loads(fixture('setup'))
for _ in range(2):seed('product')
catalog=json.loads(fixture('catalog'));assert len(catalog['paths'])==2 and len(catalog['lessons'])==16 and len(catalog['vocabulary'])==40
clients={r:Client() for r in users}
for role,c in clients.items():c.login(users[role]['email'])
admin,editor,learner,other=(clients[r] for r in ['admin','editor','learner','other'])
assert sum(l['subtype']=='checkpoint' for l in catalog['lessons'])==4
for path in ['/du-lieu/template-paths','/du-lieu/template-units','/du-lieu/template-articles','/du-lieu/template-vocabulary_sets','/chien-dich/'+catalog['paths'][0]['slug']+'?utm_source=test','/tu-vung?page=2','/lo-trinh','/tu-vung','/kien-thuc','/tim-kiem?q=hello','/hoc','/bat-dau','/so-tu-vung','/on-tap','/tien-do','/tai-khoan','/reward-shop','/admin/lessons','/admin/paths','/admin/operations']:
    client=admin if path.startswith(('/admin/','/du-lieu/template-')) else learner
    code,body,url=client.req(path);assert code==200 and not url.endswith('/login'),(path,code,url)
assert_denied(learner.req('/admin/lessons'),403,'Learner on /admin/lessons')
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
# Match sides are ordered [{id|key, text}] lists (plan §3, decision 5).
def by_id(side,key):return {x[key]:x['text'] for x in side}
for item in list(state['items']):
    e=item['exercise'];eid=e['id'];response=answers.get(eid)
    if e['type']=='match':response={left:next(k for k,v in by_id(e['payload']['right'],'key').items() if v=={'hello':'Xin chào','thanks':'Cảm ơn'}[left]) for left in by_id(e['payload']['left'],'id')}
    old_revision=state['revision'];mutate('draft',exerciseId=eid,response=response)
    learner.api('attempts/'+key+'/draft',dict(revision=old_revision,exerciseId=eid,response=response))
    learner.api('attempts/'+key+'/draft',dict(revision=old_revision,exerciseId=eid,response=None),409)
    mutate('submit',exerciseId=eid,response=response)
    learner.api('attempts/'+key+'/submit',dict(revision=old_revision,exerciseId=eid,response=response))
mutate('finish');assert int(state['score'])==6 and int(state['maxScore'])==6,[(i['exercise']['id'],i['exercise']['type'],i.get('feedback')) for i in state['items']]
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
sense=int(fixture('review-audio',users['learner']['id'],aid))
learner.api('vocabulary/save',dict(senseId=sense,notes='',review=True))
snapshot=json.loads(json.loads(fixture('review-audio-state',users['learner']['id'],sense))['snapshot'])
assert snapshot['partOfSpeech']=='noun' and int(snapshot['audioId'])==int(aid)
fixture('review-audio-state',users['learner']['id'],sense,'archive')
with learner.opener.open(BASE+'/media/'+str(aid)) as response:assert response.status==200 and response.read().startswith(b'RIFF')
assert other.req('/media/'+str(aid))[0]==404
html=learner.req('/on-tap?more=1')[1]
assert 'data-native-retry' in html and 'Phát âm từ trên thẻ ôn' in html and 'noun' in html
assert json.loads(json.loads(fixture('review-audio-state',users['learner']['id'],sense))['snapshot'])==snapshot
print('PASS: A06 vocabulary snapshot POS/audio, archived-source owner access and unchanged saved snapshot')

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
# Fix 13: a CSV batch names its namespace.
csv_preview=editor.api('admin/import-preview',dict(raw=csv,namespace='csv-http-test'));assert not csv_preview['errors']
editor.api('admin/import-commit',dict(importId=csv_preview['id']));editor.api('admin/import-commit',dict(importId=csv_preview['id']))
# Large commits really enter the DB queue; no network email/analytics is enabled in this test environment.
rows=[dict(externalId='bulk-'+str(n),slug='bulk-example-'+str(n),lemma='example '+str(n),ipa='',part_of_speech='noun',topic='tests',meaning='sample',example='An example.',translation='Vi du.',level='A1') for n in range(101)]
bulk=editor.api('admin/import-preview',dict(raw=json.dumps(dict(schemaVersion=1,namespace='large-test',vocabulary=rows))));assert not bulk['errors']
editor.api('admin/import-commit',dict(importId=bulk['id']));worker('run','50')
assert 'committed' in editor.req('/admin/imports')[1] and 'data-import-progress' in editor.req('/admin/imports')[1]
status=editor.api('admin/import-status/'+bulk['id']);assert status['processed']==101 and status['total']==101 and status['committed']==101
learner.api('admin/import-status/'+bulk['id'],status=403)
assert admin.api('admin/import-status/'+bulk['id'])['status']=='committed'
print('PASS: versioned learning, all product pages, optimistic conflicts, idempotent submit/finish, notes ownership, review, concurrent shop, atomic import and test-mode redaction')

# Every metadata import template passes the same validator as CMS and commits once.
for kind in ['paths','units','articles','vocabulary_sets']:
    # The import templates ship with the app (templates/).
    batch=json.loads((ROOT/'templates'/(kind+'.json')).read_text(encoding='utf-8'))
    batch['namespace']='template-'+kind.replace('_','-')
    if kind=='units':batch[kind][0]['path_id']=catalog['paths'][0]['id']
    preview=admin.api('admin/import-preview',dict(raw=json.dumps(batch)));assert preview['errors']==[],(kind,preview)
    admin.api('admin/import-commit',dict(importId=preview['id']));admin.api('admin/import-commit',dict(importId=preview['id']))
    assert admin.api('admin/import-preview',dict(raw=json.dumps(batch)))['errors']
set_id=editor.api('admin/entity',dict(kind='vocabulary_sets',slug='integration-set',title='Integration set',description='Owned fixture',status='draft',sort_order=2))['id']
editor.api('admin/set-items',dict(setId=set_id,ids=[v['id']]))
set_data=dict(kind='vocabulary_sets',id=set_id,slug='integration-set',title='Integration set',description='Owned fixture',status='published',sort_order=2)
admin.api('admin/entity',set_data,409)
editor.api('admin/entity',dict(set_data,status='in_review'))
state=lambda kind,id:json.loads(fixture('cms-state',kind,id))
# The page offers the exact-draft editor: a Server Action form carrying the draft id and its
# stale-edit hash.
def draft_form(html,draft_id):
    return 'name="draftId" value="'+str(draft_id)+'"' in html and 'name="expected"' in html
draft=state('vocabulary_sets',set_id)['draft']['id']
editor.api('admin/entity-workflow',dict(draftId=draft,action='publish'),403)
admin.api('admin/entity-workflow',dict(draftId=draft,action='publish'))
# Both staff roles propose changes; public membership remains untouched until approval.
old_items=state('vocabulary_sets',set_id)['items']
new_ids=[catalog['vocabulary'][1]['id']]
editor.api('admin/set-items',dict(setId=set_id,ids=new_ids))
proposal=state('vocabulary_sets',set_id)['draft']['id']
assert state('vocabulary_sets',set_id)['items']==old_items
admin.api('admin/entity-workflow',dict(draftId=proposal,action='publish'),409)
editor.api('admin/entity-workflow',dict(draftId=proposal,action='review'))
admin.api('admin/set-items',dict(setId=set_id,ids=[catalog['vocabulary'][2]['id']]))
stale=state('vocabulary_sets',set_id)['draft']['id']
editor.api('admin/entity-workflow',dict(draftId=stale,action='review'))
admin.api('admin/entity-workflow',dict(draftId=proposal,action='publish'))
assert [int(x['sense_id']) for x in state('vocabulary_sets',set_id)['items']]==new_ids
admin.api('admin/entity-workflow',dict(draftId=proposal,action='publish'))
admin.api('admin/entity-workflow',dict(draftId=stale,action='publish'),409)
admin.api('admin/set-items',dict(setId=set_id,ids=['1x']),422)
learner.api('admin/set-items',dict(setId=set_id,ids=new_ids),403)
# Initial publication of every metadata type must use a submitted snapshot.
for kind,fields in [
    ('paths',dict(title='Workflow path',description='Fixture',level='A1',objectives='Learn',prerequisites='',sort_order=0)),
    ('articles',dict(title='Workflow article',body='Fixture body')),
    ('vocabulary',dict(lemma='fixture',ipa='',part_of_speech='noun',topic='workflow',meaning='Fixture meaning',example='A fixture.',translation='Fixture.',level='A1')),
]:
    data=dict(fields,kind=kind,slug='workflow-'+kind,status='published')
    admin.api('admin/entity',data,409)
    data['status']='draft';entity=editor.api('admin/entity',data)['id'];data['id']=entity
    admin.api('admin/entity',dict(data,status='published'),409)
    editor.api('admin/entity',dict(data,status='in_review'))
    snap=state(kind,entity);version=snap['article' if kind=='articles' else 'draft']['id']
    endpoint='admin/article-workflow' if kind=='articles' else 'admin/entity-workflow'
    action=dict(action='publish',**{('versionId' if kind=='articles' else 'draftId'):version})
    editor.api(endpoint,action,403)
    draft_type='article' if kind=='articles' else 'entity'
    record=snap['article' if kind=='articles' else 'draft']
    document=json.loads(record['document'])
    save=dict(type=draft_type,draftId=version,expected=hashlib.sha256(record['document'].encode()).hexdigest(),document=document)
    editor.api('admin/draft-save',save,409)
    returned=dict(action,action='return',reason='Please clarify the example')
    editor.api(endpoint,returned,403)
    admin.api(endpoint,dict(returned,reason=''),422)
    admin.api(endpoint,returned)
    admin.api(endpoint,returned,409)
    record=state(kind,entity)['article' if kind=='articles' else 'draft']
    document=json.loads(record['document']);document['status']='draft'
    document['body' if kind=='articles' else ('meaning' if kind=='vocabulary' else 'description')]='Revised in the same draft'
    save=dict(type=draft_type,draftId=version,expected=hashlib.sha256(record['document'].encode()).hexdigest(),document=document)
    learner.api('admin/draft-save',save,403)
    editor.api('admin/draft-save',dict(save,document=dict(document,status='published')),422)
    editor.api('admin/draft-save',save)
    editor.api('admin/draft-save',save,409)
    revised=state(kind,entity)
    assert revised['row']==snap['row']
    assert int(revised['article' if kind=='articles' else 'draft']['id'])==int(version)
    section='articles' if kind=='articles' else kind.replace('_','-')
    code,html,_=editor.req('/admin/'+section+'?draft='+str(version))
    assert code==200 and draft_form(html,version) and 'Please clarify the example' in html
    editor.api(endpoint,dict(action,action='review'))
    admin.api(endpoint,action)
    editor.api('admin/draft-save',save,409)
    assert state(kind,entity)['row']['status']=='published'
    published=state(kind,entity)['row']
    editor.api('admin/entity',dict(data,status='draft'))
    proposal=state(kind,entity)['article' if kind=='articles' else 'draft']
    proposal_doc=json.loads(proposal['document']);proposal_doc['status']='draft'
    proposal_doc['body' if kind=='articles' else ('meaning' if kind=='vocabulary' else 'description')]='Second revision while public stays unchanged'
    editor.api('admin/draft-save',dict(type=draft_type,draftId=proposal['id'],expected=hashlib.sha256(proposal['document'].encode()).hexdigest(),document=proposal_doc))
    assert state(kind,entity)['row']==published
# Membership-only drafts use the same edit/return loop without changing the live set.
admin.api('admin/entity-workflow',dict(draftId=stale,action='return',reason='Recheck membership'))
member=state('vocabulary_sets',set_id)['draft'];member_doc=json.loads(member['document'])
member_doc['senseIds']=[catalog['vocabulary'][3]['id']];member_doc['status']='draft'
items_before=state('vocabulary_sets',set_id)['items']
editor.api('admin/draft-save',dict(type='entity',draftId=stale,expected=hashlib.sha256(member['document'].encode()).hexdigest(),document=member_doc))
assert state('vocabulary_sets',set_id)['items']==items_before
code,html,_=editor.req('/admin/vocabulary-sets?draft='+str(stale));assert code==200 and draft_form(html,stale)

print('PASS: A03/A04 reviewed snapshots, return reasons, exact draft editing, conflicts, role checks and unchanged projection')
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

# A05: every private item remains reachable beyond 100, without overlap or leakage.
fixture('pagination',users['learner']['id'])
seen=[]
for page in range(1,6):
    code,html,_=learner.req('/so-tu-vung?q=Paging&filter=all&page='+str(page))
    assert code==200
    ids=re.findall(r'name="senseId" value="([0-9]+)"',html)
    ids=list(dict.fromkeys(ids));assert len(ids)==(30 if page<5 else 1)
    assert not set(ids)&set(seen);seen+=ids
    if page<5:assert 'rel="next"' in html and 'q=Paging&amp;filter=all&amp;page=' in html
assert len(seen)==121
assert 'PRIVATE-PAGING-' not in other.req('/so-tu-vung?q=Paging')[1]
for filter_name,count in [('hidden',61),('review',60)]:
    html=learner.req('/so-tu-vung?q=Paging&filter='+filter_name)[1]
    assert str(count)+' mục' in html and 'value="'+filter_name+'" selected' in html
assert len(set(re.findall(r'name="senseId" value="([0-9]+)"',learner.req('/so-tu-vung?q=Paging&page=999')[1])))==1
assert learner.req('/so-tu-vung?page[]=bad')[0]==200
cards_seen=[]
for page in range(1,6):
    code,html,_=learner.req('/on-tap?manage=1&page='+str(page));assert code==200
    ids=list(dict.fromkeys(re.findall(r'name="cardId" value="([0-9]+)"',html)))
    assert len(ids)<=30 and not set(ids)&set(cards_seen);cards_seen+=ids
assert len(cards_seen)>121
# The word form's action reports to the page flash from the client, so React cannot submit it
# without JavaScript; post it as the browser script does. The action re-renders the same URL.
code,result,url=call_action(learner.opener,'/so-tu-vung?q=Paging&filter=hidden&page=2','src/actions/routes.ts','saveVocabulary',dict(senseId=seen[0],notes='Updated private note'))
assert result and result['status']=='success',result
assert 'Updated private note' in learner.req('/so-tu-vung?q=Paging&filter=all&page=1')[1],'Word form did not save'
assert code==200 and 'page=2' in url and 'filter=hidden' in url
print('PASS: A05 121+ private items, stable pages, filters/counts, owner isolation and post redirect context')

code,html,_=learner.req('/tien-do?week=1&page=999')
assert code==200 and '/hoc/luot/'+key in html and 'week=2' in html
assert learner.req('/tien-do?week[]=bad&page[]=bad')[0]==200
assert '/hoc/luot/'+key not in other.req('/tien-do')[1]
print('PASS: A07 history links in HTML, week navigation, invalid queries and owner isolation')

# A08: real anonymous opt-in -> trial -> registration carries only the consented journey.
campaign=Client();route='/chien-dich/'+catalog['paths'][0]['slug']
code,html,_=campaign.req(route+'?utm_source=newsletter&utm_medium=email&utm_campaign='+catalog['paths'][0]['slug'])
# The consent form is a Server Action.
assert code==200 and 'name="enabled"' in html
campaign.api('analytics/consent',dict(enabled='yes',campaignSlug=catalog['paths'][0]['slug'],utm_source='newsletter',utm_medium='email',utm_campaign=catalog['paths'][0]['slug']))
trial=next(l for l in catalog['lessons'] if json.loads(l['document']).get('preview') and l['subtype']!='placement')
campaign.api('attempts/start',dict(lessonId=trial['id'],requestKey=secrets.token_hex(16)))
email='campaign-'+secrets.token_hex(6)+'@example.com'
code,html,url,_=register(campaign.opener,'Campaign learner',email,'Product-test-123!')
assert code==200 and url.endswith('/account')
journey=json.loads(fixture('marketing-state',email));assert len(journey)==1 and journey[0]['guest_trial_at'] and journey[0]['signup_at'] and journey[0]['source']=='newsletter'
campaign.api('consent',dict(analytics=False));assert json.loads(fixture('marketing-state',email))==[]
assert 'Hành trình chiến dịch' in admin.req('/admin/operations')[1]
assert_denied(editor.req('/admin/operations'),403,'Editor on /admin/operations')
print('PASS: A08 HTTP campaign opt-in, guest trial, registration link, revoke and admin-only report')

# A09: shared SSR metadata, permissions, validation, entity review snapshots and reset.
seo=dict(path='/',title='SEO home & quote " title',description='SEO description & "quoted" value')
editor.api('admin/seo',seo,403);learner.api('admin/seo',seo,403)
for bad in ['/login','/hoc','/admin/settings','https://evil.example/','/lo-trinh?q=secret','/gioi-thieu/invalid','/bai-hoc/example']:
    admin.api('admin/seo',dict(seo,path=bad),422)
admin.api('admin/seo',dict(seo,title='<script>bad</script>'),422)
admin.api('admin/seo',dict(seo,title='x'*161),422)
admin.api('admin/seo',seo)
html=learner.req('/')[1]
assert 'SEO home &amp; quote &quot; title' in html and 'SEO description &amp; &quot;quoted&quot; value' in html
assert '<meta property="og:title" content="SEO home' in html
assert 'noindex' in learner.req('/tai-khoan')[1]
admin.api('admin/seo',dict(path='/',title='',description=''))
assert 'SEO home' not in learner.req('/')[1]
for kind,prefix in [('paths','lo-trinh'),('vocabulary','tu-vung'),('vocabulary_sets','tu-vung/chu-de'),('articles','kien-thuc')]:
    source=json.loads(fixture('seo-source',kind));entity_id=source['id'];route='/'+prefix+'/'+source['slug']
    data=dict(source,kind=kind,status='draft',seo_title='SEO published '+kind,seo_description='Description '+kind)
    editor.api('admin/entity',dict(data,seo_title='z'*161),422)
    editor.api('admin/entity',data)
    snap=state(kind,entity_id);record=snap['article' if kind=='articles' else 'draft']
    assert data['seo_title'] not in learner.req(route)[1]
    endpoint='admin/article-workflow' if kind=='articles' else 'admin/entity-workflow'
    command={('versionId' if kind=='articles' else 'draftId'):record['id']}
    editor.api(endpoint,dict(command,action='review'));admin.api(endpoint,dict(command,action='publish'))
    code,html,_=learner.req(route);assert code==200 and '<title>'+data['seo_title'] in html,(kind,code,re.findall(r'<title>(.*?)</title>',html))
    assert '<meta name="description" content="'+data['seo_description']+'"' in html
    assert '<meta property="og:description" content="'+data['seo_description']+'"' in html
    assert re.search(r'<link rel="canonical" href="[^"]*'+re.escape(route)+'"',html)
    editor.api('admin/entity',dict(data,seo_title='Unpublished SEO '+kind))
    html=learner.req(route)[1];assert 'Unpublished SEO '+kind not in html and '<title>'+data['seo_title'] in html
settings_page=admin.req('/admin/settings')[1]
find_form(settings_page,'name="path"','name="title"','name="description"')  # the page SEO form (a Server Action)
print('PASS: A09 SSR title/meta/OG, safe text validation, private noindex, canonical preservation, publish isolation and clear override')

# A10: validation contract and safe SSR error state.
error=learner.api('profile',dict(goal='invalid',selfLevel='invalid',minutes=99,timezone='invalid',reviewLimit=999),422)
assert set(error['fieldErrors'])=={'goal','selfLevel','minutes','timezone','reviewLimit'}
error=learner.api('vocabulary/save',dict(senseId=catalog['vocabulary'][0]['id'],notes='x'*2001),422)
assert 'notes' in error['fieldErrors']
# The CMS form (JavaScript-submitted, see call_action) gets a scoped state from its Server Action:
# field errors plus the non-secret input to keep (an action answers 200).
code,state,_=call_action(admin.opener,'/admin/settings','src/actions/routes.ts','savePageSeoAction',dict(path='/',title='x'*161,description='Preserve this value'))
assert code==200 and state['status']=='error' and 'title' in state['fieldErrors'],state
assert state['values']['description']=='Preserve this value' and not any('$ACTION' in k for k in state['values'])
print('PASS: A10 named field errors, safe scoped SSR state and preserved non-secret input')

# Preview/guest sessions cannot write real account review cards through the concept endpoint.
def finish_skipped(client, attempt):
    state=client.api('attempts/'+attempt)
    for block in state['blocks']:
        state=client.api('attempts/'+attempt+'/view',dict(revision=state['revision'],block=block['id']))
    for item in state['items']:
        state=client.api('attempts/'+attempt+'/skip',dict(revision=state['revision'],exerciseId=item['exercise']['id']))
    return client.api('attempts/'+attempt+'/finish',dict(revision=state['revision']))

before=int(fixture('review-card-count',users['editor']['id']))
_,html,_=editor.req('/admin/lesson-preview/'+str(restore_version))
preview_id=re.search(r'/hoc/luot/([a-f0-9]{32})',html)[1]  # the page redirects to its preview attempt in the player
preview_state=finish_skipped(editor,preview_id)
assert not preview_state['canSaveConcepts']
editor.api('review/concept',dict(attemptId=preview_state['id'],exerciseId='hello'),422)
assert int(fixture('review-card-count',users['editor']['id']))==before
guest=Client()
guest_id=secrets.token_hex(16);guest.api('attempts/start',dict(lessonId=lesson['id'],requestKey=guest_id))
assert not finish_skipped(guest,guest_id)['canSaveConcepts']
code,html,url,_=register(guest.opener,'Unclaimed trial','claim-'+secrets.token_hex(6)+'@example.com','Product-test-123!')
assert code==200 and url.endswith('/account')
assert not guest.api('attempts/'+guest_id)['canSaveConcepts']
guest.api('review/concept',dict(attemptId=guest_id,exerciseId='hello'),422)
assert guest.api('review/queue')==[]
guest.api('guest/claim',dict(attemptId=guest_id,confirm='yes'))
claimed=guest.api('attempts/'+guest_id)
claimed=guest.api('attempts/'+guest_id+'/finish',dict(revision=claimed['revision']))
assert claimed['canSaveConcepts']
guest.api('review/concept',dict(attemptId=guest_id,exerciseId='hello'))
guest.api('review/concept',dict(attemptId=guest_id,exerciseId='hello'))
assert len(guest.api('review/queue'))==1
other.api('review/concept',dict(attemptId=guest_id,exerciseId='hello'),404)
print('PASS: preview and unclaimed trial cannot create account review; confirmed owner can save idempotently, other owner denied')

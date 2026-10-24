"""Check every learning route and public asset after reorganizing the application."""
import json, urllib.request, urllib.error
from pathlib import Path
from html.parser import HTMLParser
from http_target import BASE
class Resources(HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag=='link' and dict(attrs).get('rel')=='canonical':return
        # Server Action forms render action="" (post back to the same page URL).
        self.urls.extend(value for key,value in attrs if key in ('href','src','action') and not (key=='action' and value==''))
data=json.loads((Path(__file__).resolve().parents[2]/'public/assets/json/courses.json').read_text(encoding='utf-8'))
paths=['/','/courses','/listening','/toeic','/placement','/dashboard','/login','/register']
for course in data['courses']:
    paths.append('/courses/'+course['id'])
    paths.extend('/courses/'+course['id']+'/'+lesson['id'] for lesson in course['lessons'])
paths.extend('/listening/'+item['id'] for item in data['listening'])
assets=set()
for path in paths:
    with urllib.request.urlopen(BASE+path) as response:
        body=response.read().decode('utf-8')
        assert response.status==200 and 'Warning:' not in body and 'Fatal error' not in body,path
        parser=Resources();parser.feed(body)
        assert all(url.startswith(('/', '#')) and 'index.php' not in url for url in parser.urls),(path,parser.urls)
        for anchor in (u[1:] for u in parser.urls if u.startswith('#')):
            assert ('id="'+anchor+'"') in body,(path,'Missing in-page link target',anchor)
        assets.update(url for url in parser.urls if url.startswith('/assets/') or url.endswith(('.png','.ico','.webmanifest')))
for path in assets:
    with urllib.request.urlopen(BASE+path) as response:
        body=response.read()
        assert response.status==200 and body and b'<!doctype html>' not in body,path
with urllib.request.urlopen(BASE+'/site.webmanifest') as response:
    manifest=json.load(response)
for icon in manifest['icons']:
    with urllib.request.urlopen(BASE+icon['src']) as response:assert response.status==200
for old,new in [('/assets/style.css','/assets/css/style.css'),('/assets/app.js','/assets/js/app.js'),('/assets/courses.json','/assets/json/courses.json'),('/index.php?page=courses/beginner/hello','/courses/beginner/hello'),('/courses/','/courses')]:
    with urllib.request.urlopen(BASE+old) as response:assert response.url==BASE+new,(old,response.url)
for path in ['/.env.example','/docs/operations.md','/application/config/database.php','/application/views/home/index.php','/config-example/database.php','/writable/sessions','/legacy/nextjs/package.json','/database/schema.sql','/courses/missing','/courses/beginner/missing','/listening/coffee/extra','/bad%20path']:
    try: urllib.request.urlopen(BASE+path);raise AssertionError(path)
    except urllib.error.HTTPError as error:assert error.code==404,(path,error.code)
print(f'PASS: {len(paths)} public routes, clean links, {len(assets)} assets, manifest icons, legacy redirects and private/missing paths')

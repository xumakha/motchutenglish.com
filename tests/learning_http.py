"""Real HTTP + MySQL checks; invoked by run_auth.py on an isolated database."""
import http.cookiejar
import json
import re
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'http://127.0.0.1:8089'

def fixture(*args):
    return subprocess.check_output(['php', 'tests/learning_fixture.php', *map(str, args)], text=True)

def token(body):
    match = re.search(r'name="csrf" value="([a-f0-9]+)"', body)
    assert match, 'CSRF token missing'
    return match[1]

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, path, data=None):
        payload = urllib.parse.urlencode(data).encode() if data is not None else None
        try:
            response = self.opener.open(BASE + path, payload)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read().decode('utf-8')
        assert 'Fatal error' not in body and 'Warning:' not in body, body
        return response.code, body, response.geturl()

    def login(self, email):
        _, body, _ = self.request('/login')
        status, body, url = self.request('/login', {'csrf': token(body), 'email': email, 'password': 'Learning-test-123!'})
        assert status == 200 and url.endswith('/account'), (status, body)
        self.csrf = token(body)

users = json.loads(fixture('setup'))
for _ in range(2):
    subprocess.run(['php', 'database/seed-learning.php'], check=True, capture_output=True)
clients = {role: Client() for role in users}
for role, client in clients.items():
    client.login(users[role]['email'])
admin, editor, learner, other = (clients[r] for r in ['admin', 'editor', 'learner', 'other'])
assert Client().request('/hoc')[2].endswith('/login')
assert learner.request('/admin')[0] == 403
assert admin.request('/admin', {'title': 'Missing CSRF'})[0] == 403
content = dict(csrf=editor.csrf, title='Integration lesson', body='<script>unsafe()</script> Hello means xin chao.',
               question='Which greeting?', one='Hello', two='Goodbye', answer='one', explanation='UNIQUE_EXPLANATION_8274')
assert editor.request('/admin', content)[0] == 200
_, body, _ = admin.request('/admin')
lesson = re.findall(r'/admin/preview/(\d+)', body)[-1]
status, preview, _ = editor.request('/admin/preview/' + lesson)
assert status == 200 and '&lt;script&gt;' in preview and '<script>unsafe()' not in preview
status, preview, _ = editor.request('/admin/preview/' + lesson, dict(csrf=editor.csrf, response='one'))
assert status == 200 and 'UNIQUE_EXPLANATION_8274' in preview
edited = dict(content, action='edit', lesson_id=lesson, body=content['body'] + ' Updated draft.')
assert editor.request('/admin', edited)[0] == 200
assert 'Updated draft.' in editor.request('/admin/preview/' + lesson)[1]
assert learner.request('/admin/preview/' + lesson)[0] == 403
assert 'Integration lesson' not in learner.request('/hoc')[1], 'Draft visible to learner'
assert editor.request('/admin', dict(csrf=editor.csrf, action='publish', lesson_id=lesson))[0] == 403
for _ in range(2):
    assert admin.request('/admin', dict(csrf=admin.csrf, action='publish', lesson_id=lesson))[0] == 200
assert editor.request('/admin', edited)[0] == 422, 'Published content must be immutable'
assert 'Integration lesson' in learner.request('/hoc')[1]
key = secrets.token_hex(16)
assert learner.request('/hoc/bai/' + lesson)[0] == 405
assert learner.request('/hoc/bai/' + lesson, {'request_key': key})[0] == 403
start = dict(csrf=learner.csrf, request_key=key)
for _ in range(2):
    status, body, url = learner.request('/hoc/bai/' + lesson, start)
    assert status == 200 and url.endswith('/ket-qua/' + key), (status, body)
    assert 'UNIQUE_EXPLANATION_8274' not in body and 'answer_id' not in body, 'Answer leaked before submission'
assert other.request('/ket-qua/' + key)[0] == 404
assert other.request('/ket-qua/' + key, dict(csrf=other.csrf, response='one'))[0] == 404
assert other.request('/hoc/bai/' + lesson, dict(csrf=other.csrf, request_key=key))[0] == 409
assert learner.request('/ket-qua/' + key, dict(csrf=learner.csrf, response='invalid'))[0] == 422
fixture('change-content', lesson)
for _ in range(2):
    status, body, _ = learner.request('/ket-qua/' + key, dict(csrf=learner.csrf, response='one', score='9999'))
    assert status == 200 and 'UNIQUE_EXPLANATION_8274' in body and '100%' in body, (status, body)
assert learner.request('/ket-qua/' + key, dict(csrf=learner.csrf, response='two'))[0] == 409
# A second attempt uses the new snapshot but cannot farm first-completion/pass XP.
key2 = secrets.token_hex(16)
assert learner.request('/hoc/bai/' + lesson, dict(csrf=learner.csrf, request_key=key2))[0] == 200
assert learner.request('/ket-qua/' + key2, dict(csrf=learner.csrf, response='two'))[0] == 200
key3 = secrets.token_hex(16)
assert learner.request('/hoc/bai/' + lesson, dict(csrf=learner.csrf, request_key=key3))[0] == 200
# Separate PHP processes and PDO connections exercise actual InnoDB row locking.
with ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(lambda _: fixture('submit', key3, users['learner']['id'], 'two'), range(2)))
assert all('Submitted' in result for result in results)
print(fixture('verify', users['learner']['id'], lesson).strip())
print('PASS: draft -> preview -> publish -> learn -> persisted result; roles, CSRF, IDOR, hidden answers, snapshots, retries, conflicts and repeat rewards')

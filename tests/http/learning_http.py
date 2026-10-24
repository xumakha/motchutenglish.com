"""Real HTTP + MySQL checks of the legacy lessons (/admin, /hoc/bai, /ket-qua) on an isolated
database; invoked by run_auth.py (PHP) or run_next.py (Next.js, HTTP_TARGET=next)."""
import http.cookiejar
import json
import re
import secrets
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http_target import NEXT, PHP, assert_denied, assert_rejected, csrf_token as token, fixture as target_fixture, login, open_request, seed, submit_form

def fixture(*args):
    return target_fixture('learning', *args)

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None

    def request(self, path, data=None, origin=...):
        payload = urllib.parse.urlencode(data).encode() if data is not None else None
        status, body, url, _ = open_request(self.opener, path, payload, **({} if origin is ... else dict(origin=origin)))
        assert 'Fatal error' not in body and 'Warning:' not in body, body
        return status, body, url

    def form(self, path, data, *needles, page=None):
        """Post one of the page's forms (PHP: with the CSRF token; Next.js: its Server Action)."""
        status, body, url, _ = submit_form(self.opener, path, data, *needles, page=page, csrf=self.csrf)
        assert 'Fatal error' not in body and 'Warning:' not in body, body
        return status, body, url

    def login(self, email):
        status, body, url, _ = login(self.opener, email, 'Learning-test-123!')
        assert status == 200 and url.endswith('/account'), (status, body)
        if PHP:
            self.csrf = token(body)

users = json.loads(fixture('setup'))
for _ in range(2):
    seed('learning')
clients = {role: Client() for role in users}
for role, client in clients.items():
    client.login(users[role]['email'])
admin, editor, learner, other = (clients[r] for r in ['admin', 'editor', 'learner', 'other'])
SAVE = 'Lưu bản nháp'  # the draft form on /admin (Next.js: its Server Action)
assert Client().request('/hoc')[2].endswith('/login')
assert_denied(learner.request('/admin'), 403, 'Learner on /admin')
# PHP: a post without the CSRF token. Next.js: a post without a same-origin Origin header.
assert admin.request('/admin', {'title': 'Missing CSRF'}, **({} if PHP else dict(origin=None)))[0] == 403
content = dict(title='Integration lesson', body='<script>unsafe()</script> Hello means xin chao.',
               question='Which greeting?', one='Hello', two='Goodbye', answer='one', explanation='UNIQUE_EXPLANATION_8274')
assert editor.form('/admin', content, SAVE)[0] == 200
_, body, _ = admin.request('/admin')
lesson = re.findall(r'/admin/preview/(\d+)', body)[-1]
status, preview, _ = editor.request('/admin/preview/' + lesson)
assert status == 200 and '&lt;script&gt;' in preview and '<script>unsafe()' not in preview
status, preview, _ = editor.form('/admin/preview/' + lesson, dict(response='one'), 'name="response"', page=preview if NEXT else None)
assert status == 200 and 'UNIQUE_EXPLANATION_8274' in preview
edited = dict(content, action='edit', lesson_id=lesson, body=content['body'] + ' Updated draft.')
assert editor.form('/admin', edited, SAVE)[0] == 200
assert 'Updated draft.' in editor.request('/admin/preview/' + lesson)[1]
denied = learner.request('/admin/preview/' + lesson)
assert_denied(denied, 403, 'Learner preview')
assert 'Updated draft.' not in denied[1]
assert 'Integration lesson' not in learner.request('/hoc')[1], 'Draft visible to learner'
# Editors see no publish button; post the admin form's action with the editor's session.
publish = dict(action='publish', lesson_id=lesson)
admin_page = admin.request('/admin')[1]
assert_rejected(editor.form('/admin', publish, 'value="publish"', page=admin_page if NEXT else None), 403, 'Chỉ quản trị viên')
for _ in range(2):
    assert admin.form('/admin', publish, 'value="publish"', page=admin_page if NEXT else None)[0] == 200
assert_rejected(editor.form('/admin', edited, SAVE), 422, label='Published content must be immutable')
assert 'Integration lesson' in learner.request('/hoc')[1]
key = secrets.token_hex(16)
assert learner.request('/hoc/bai/' + lesson)[0] == 405
# /hoc/bai/{id} is a plain HTML form post in both apps (no Server Action).
assert learner.request('/hoc/bai/' + lesson, {'request_key': key}, **({} if PHP else dict(origin=None)))[0] == 403
start = dict(request_key=key, **({'csrf': learner.csrf} if PHP else {}))
for _ in range(2):
    status, body, url = learner.request('/hoc/bai/' + lesson, start)
    assert status == 200 and url.endswith('/ket-qua/' + key), (status, body)
    assert 'UNIQUE_EXPLANATION_8274' not in body and 'answer_id' not in body, 'Answer leaked before submission'
attempt_page = body
def answer(client, attempt, response, **extra):
    fields = dict(response=response, **extra)
    if NEXT:
        # The answer form (a Server Action) is only on the owner's unanswered page; any visitor
        # can still post that action, naming the attempt in its hidden field.
        fields['attempt_id'] = attempt
    return client.form('/ket-qua/' + attempt, fields, 'name="response"', page=attempt_page if NEXT else None)
denied = other.request('/ket-qua/' + key)
assert_denied(denied, 404, 'Another learner\'s attempt')
assert 'Which greeting?' not in denied[1]
assert_denied(answer(other, key, 'one'), 404, 'Answer another learner\'s attempt')
assert other.request('/hoc/bai/' + lesson, dict(request_key=key, **({'csrf': other.csrf} if PHP else {})))[0] == 409
assert_rejected(answer(learner, key, 'invalid'), 422, label='Invalid choice')
fixture('change-content', lesson)
for _ in range(2):
    status, body, _ = answer(learner, key, 'one', score='9999')
    assert status == 200 and 'UNIQUE_EXPLANATION_8274' in body and '100%' in body, (status, body)
assert_rejected(answer(learner, key, 'two'), 409, label='First answer is final')
# A second attempt uses the new snapshot but cannot farm first-completion/pass XP.
key2 = secrets.token_hex(16)
assert learner.request('/hoc/bai/' + lesson, dict(start, request_key=key2))[0] == 200
assert answer(learner, key2, 'two')[0] == 200
key3 = secrets.token_hex(16)
assert learner.request('/hoc/bai/' + lesson, dict(start, request_key=key3))[0] == 200
# Separate processes and database connections exercise actual InnoDB row locking.
with ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(lambda _: fixture('submit', key3, users['learner']['id'], 'two'), range(2)))
assert all('Submitted' in result for result in results)
print(fixture('verify', users['learner']['id'], lesson).strip())
print('PASS: draft -> preview -> publish -> learn -> persisted result; roles, CSRF, IDOR, hidden answers, snapshots, retries, conflicts and repeat rewards')

"""Which app the black-box HTTP suites talk to, and how to reach its fixtures.

HTTP_TARGET=php (default): the PHP app on 127.0.0.1:8089 with the PHP fixture CLIs (tests/run_auth.py).
HTTP_TARGET=next: the Next.js app in web/ with the TypeScript fixture CLI web/scripts/fixture.ts
(tests/run_next.py). HTTP_BASE overrides the URL.

The suites keep one set of checks. Where the two apps differ by design (Better Auth instead of the
PHP session + CSRF token, Server Action forms instead of plain POST forms, the §1.4 fixes in
docs/migration/nextjs-typescript-plan.md), the helpers below hide the transport and the suites
branch on NEXT with a comment naming the reason.
"""
import html as _html
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = os.environ.get('HTTP_TARGET', 'next')
NEXT = TARGET == 'next'
PHP = not NEXT
BASE = os.environ.get('HTTP_BASE', 'http://127.0.0.1:3201' if NEXT else 'http://127.0.0.1:8089')
WEB = ROOT
_TSX = [str(WEB / 'node_modules/.bin/tsx')]


def fixture(suite, *args):
    """Run one fixture operation and return its stdout. suite: product | learning | timezone."""
    if NEXT:
        command = [*_TSX, '--import', './scripts/worker-hooks.mjs', 'scripts/fixture.ts', suite, *map(str, args)]
        return subprocess.check_output(command, cwd=WEB, text=True, encoding='utf-8')
    return subprocess.check_output(['php', f'tests/{suite}_fixture.php', *map(str, args)], cwd=ROOT, text=True, encoding='utf-8')


def worker(*args):
    """Run the job worker once: run [limit] | tick | cleanup | reconcile."""
    if NEXT:
        command = [*_TSX, '--import', './scripts/worker-hooks.mjs', 'src/worker/cli.ts', *map(str, args)]
        subprocess.run(command, cwd=WEB, check=True, capture_output=True)
    else:
        subprocess.run(['php', 'database/worker.php', *map(str, args)], cwd=ROOT, check=True, capture_output=True)


def seed(kind):
    """Load sample content: 'product' (published samples) or 'learning' (legacy sample draft)."""
    if NEXT:
        flag = '--publish-reviewed-samples' if kind == 'product' else '--legacy-sample'
        subprocess.run([*_TSX, '--conditions=react-server', 'scripts/seed.ts', flag], cwd=WEB, check=True, capture_output=True)
    else:
        script = 'database/seed-product.php' if kind == 'product' else 'database/seed-learning.php'
        args = ['--publish-reviewed-samples'] if kind == 'product' else []
        subprocess.run(['php', script, *args], cwd=ROOT, check=True, capture_output=True)


# ---- Requests -------------------------------------------------------------------------------

def client_ip(opener):
    """A stable fake client address per visitor. Next.js rate limits trust the rightmost
    X-Forwarded-For entry (it runs behind a proxy), so each simulated visitor gets its own; PHP
    ignores forwarded headers."""
    if not hasattr(opener, 'mce_ip'):
        opener.mce_ip = '10.%d.%d.%d' % tuple(b % 254 + 1 for b in os.urandom(3))
    return opener.mce_ip


def text(raw):
    """Response body as text. React separates adjacent text nodes with <!-- --> markers in HTML;
    drop them so checks match the visible text ("Đã ôn 0/1"), as with the PHP views."""
    body = raw.decode('utf-8') if isinstance(raw, bytes) else raw
    return body.replace('<!-- -->', '') if NEXT else body


def open_request(opener, path, data=None, headers=None, method=None, origin=BASE):
    """(status, body text, final url, headers); HTTP errors are returned, not raised.
    `origin` goes on unsafe requests (Next.js's proxy.ts rejects cross-origin writes; PHP ignores
    it). Pass None to omit it, or another origin to simulate a cross-site post."""
    request = urllib.request.Request(BASE + path, data, dict(headers or {}), method=method)
    request.add_header('X-Forwarded-For', client_ip(opener))
    if origin and (data is not None or (method or 'GET') not in ('GET', 'HEAD')):
        request.add_header('Origin', origin)
    try:
        response = opener.open(request)
    except urllib.error.HTTPError as error:
        response = error
    return response.code, text(response.read()), response.geturl(), response.headers


def settle_cache(route, code):
    """Next.js applies a route handler's cache-tag expiry as background work after the response
    (next/dist/server/route-modules/app-route: pendingWaitUntil), so a page read sent the same
    instant can still see the old catalog. The CMS forms are Server Actions (updateTag), which
    are read-your-own-writes; only direct /api/v1 admin writes are eventually consistent."""
    if NEXT and code < 400 and route.startswith('admin/'):
        time.sleep(0.2)


def api_headers(csrf=''):
    """JSON API headers: PHP wants its CSRF token, Next.js relies on the Origin check."""
    return {'Content-Type': 'application/json', **({'X-CSRF-Token': csrf} if PHP else {})}


# ---- Forms ----------------------------------------------------------------------------------
# PHP forms carry a csrf hidden field. Next.js forms are Server Actions; without JavaScript the
# browser posts them as multipart/form-data with React's hidden $ACTION_* fields to the page URL,
# and Next.js runs the action and renders the page with its result (progressive enhancement).
# submit_form replays exactly what a browser without JavaScript sends.

_FORM = re.compile(r'<form\b([^>]*)>(.*?)</form>', re.S)
_INPUT = re.compile(r'<input\b([^>]*)/?>')
_ATTR = re.compile(r'([a-zA-Z_:$][-a-zA-Z0-9_:.$]*)(?:="([^"]*)")?')


def _attrs(markup):
    return {k: _html.unescape(v or '') for k, v in _ATTR.findall(markup)}


def forms(body):
    """[(form attributes, [(hidden name, value)], inner html)] for every form on the page."""
    found = []
    for match in _FORM.finditer(body):
        hidden = []
        for tag in _INPUT.findall(match[2]):
            a = _attrs(tag)
            if a.get('type') == 'hidden' and 'name' in a:
                hidden.append((a['name'], a.get('value', '')))
        found.append((_attrs(match[1]), hidden, match[2]))
    return found


def find_form(body, *needles):
    """The first form whose markup contains every needle (field names, button labels, values)."""
    for form in forms(body):
        if all(n in form[2] for n in needles):
            return form
    raise AssertionError(('No form with', needles))


def multipart(fields):
    boundary = 'mce' + uuid.uuid4().hex
    parts = []
    for key, value in fields:
        parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"\r\n\r\n').encode() + str(value).encode() + b'\r\n')
    parts.append(('--' + boundary + '--\r\n').encode())
    return b''.join(parts), 'multipart/form-data; boundary=' + boundary


def submit_form(opener, path, fields, *needles, page=None, csrf=None, origin=BASE):
    """Post a page's form like a browser without JavaScript. Returns (status, body, url, headers).

    PHP: urlencoded fields plus the csrf token. Next.js: the Server Action form on `path` (or the
    already fetched `page`) whose markup contains every needle, with its hidden fields; the given
    fields replace hidden fields of the same name.
    """
    fields = list(fields.items()) if isinstance(fields, dict) else list(fields)
    if PHP:
        if csrf is not None:
            fields = [('csrf', csrf)] + fields
        return open_request(opener, path, urllib.parse.urlencode(fields).encode(), origin=origin)
    if page is None:
        page = open_request(opener, path)[1]
    _, hidden, _ = find_form(page, *needles)
    names = {k for k, _ in fields}
    data, content_type = multipart([h for h in hidden if h[0] not in names] + fields)
    return open_request(opener, path, data, {'Content-Type': content_type}, origin=origin)


_FORM_STATE = re.compile(r'self\.__next_f\.push\(\[2,(.*?)\]\)</script>', re.S)


def form_state(body):
    """The Server Action's result after a form post (the useActionState value), or None.

    Partially prerendered pages resume their static shell without the form state, so Next.js
    ships it to the browser as an inline `self.__next_f.push([2, [state, key, actionId, n]])`
    script that hydration applies. This reads it the way the browser does.
    """
    match = _FORM_STATE.search(body)
    if not match:
        return None
    state = json.loads(match[1])[0]
    return state if isinstance(state, dict) else None


def call_action(opener, path, module, export, fields, prev=None):
    """Call a useActionState Server Action the way the browser's JavaScript does (Next.js only).

    Needed for forms whose action is wrapped on the client (the learner forms report to the page
    flash), which React cannot submit without JavaScript. The id comes from the build's
    server-reference manifest; the body is React's reply encoding of (prevState, formData):
    FormData fields as `_1_<name>` before the root `0` that references them as "$K1".
    Returns (status, action result, page url).
    """
    manifest = json.loads((WEB / '.next/server/server-reference-manifest.json').read_text(encoding='utf-8'))['node']
    action_id = next(k for k, v in manifest.items() if v['filename'] == module and v['exportedName'] == export)
    items = list(fields.items()) if isinstance(fields, dict) else list(fields)
    root = json.dumps([prev or {'status': 'idle'}, '$K1'])
    data, content_type = multipart([('_1_' + k, v) for k, v in items] + [('0', root)])
    code, body, url, _ = open_request(opener, path, data, {'Content-Type': content_type, 'Next-Action': action_id, 'Accept': 'text/x-component'})
    rows = dict(re.findall(r'^([0-9a-f]+):(.*)$', body, re.M))
    head = json.loads(rows.get('0', '{}'))
    ref = str(head.get('a', ''))
    result = json.loads(rows[ref[2:]]) if ref.startswith('$@') and ref[2:] in rows else None
    return code, result, url


def form_error(body):
    """Message of the form's error summary after a post (#form-error or the inline form state)."""
    match = re.search(r'<div[^>]*id="form-error"[^>]*><p>(.*?)</p>', body, re.S)
    if match:
        return _html.unescape(re.sub(r'<[^>]+>', '', match[1])).strip()
    state = form_state(body) or {}
    return state.get('message', '') if state.get('status') == 'error' else ''


def form_message(body):
    """Success message of a Server Action form after a post ('' if none)."""
    state = form_state(body) or {}
    return state.get('message', '') if state.get('status') == 'success' else ''


def assert_rejected(result, status, message=None, label=''):
    """A form post was refused. PHP answers with the HTTP status. A Server Action cannot set the
    status, so Next.js answers 200 and renders the error summary; check its message instead."""
    code, body = result[0], result[1]
    if PHP:
        assert code == status, (label, code)
        return
    error = form_error(body)
    assert code == 200 and error, (label, code, 'no form error shown')
    if message is not None:
        assert message in error, (label, error)


# Next.js injects this tag when forbidden()/notFound() interrupts a page that is already
# streaming (the page's own metadata says "noindex, nofollow").
_INTERRUPTED = '<meta name="robots" content="noindex"/>'


def assert_denied(result, status, label=''):
    """A page refused the visitor (403 staff-only / 404 not the owner). On Next.js, proxy.ts
    decides the status before rendering (server/private-access.ts); callers check that the
    protected data is absent."""
    code = result[0]
    assert code == status, (label, code)


def csrf_token(body):
    match = re.search(r'name="csrf" value="([a-f0-9]+)"', body)
    assert match, 'Missing CSRF token'
    return match[1]


# ---- Accounts -------------------------------------------------------------------------------

def login(opener, email, password, page=None, csrf=None):
    """Sign in through the real login form. Returns (status, body, url, headers)."""
    fields = dict(email=email, password=password)
    if PHP:
        page = page or open_request(opener, '/login')[1]
        return submit_form(opener, '/login', fields, csrf=csrf or csrf_token(page))
    return submit_form(opener, '/login', fields, 'name="email"', 'name="password"', page=page)


def register(opener, name, email, password, confirm=None, page=None, csrf=None):
    """Create an account through the real registration form. Returns (status, body, url, headers)."""
    fields = dict(name=name, email=email, password=password, password_confirm=password if confirm is None else confirm)
    if PHP:
        page = page or open_request(opener, '/register')[1]
        return submit_form(opener, '/register', fields, csrf=csrf or csrf_token(page))
    return submit_form(opener, '/register', fields, 'name="password_confirm"', page=page)


def logout(opener, csrf=None, origin=BASE):
    """POST /logout: a plain form post in both apps (Next.js checks the origin, not a token)."""
    data = urllib.parse.urlencode({'csrf': csrf} if PHP else {}).encode()
    return open_request(opener, '/logout', data, origin=origin)

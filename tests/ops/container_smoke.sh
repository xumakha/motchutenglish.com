#!/usr/bin/env bash
# Fresh install of the production compose stack on an empty database, then the operations a
# deploy relies on: migrate, health and pages, admin + seed CLIs, worker run/tick/cleanup, SQL
# backup + restore drill, media backup, non-root runtime. Uses throwaway passwords and volumes,
# and removes them at the end. Needs Docker with the compose plugin.
set -euo pipefail
cd "$(dirname "$0")/../.."
export COMPOSE_PROJECT_NAME="mce-smoke-$RANDOM"
export APP_URL=https://smoke.example.test
export MCE_DB_PASSWORD="smoke-$(openssl rand -hex 12)"
export MCE_DB_ROOT_PASSWORD="smoke-root-$(openssl rand -hex 12)"
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
compose() { docker compose "$@"; }
cleanup() { compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
run() { compose run --rm --no-deps -T "$@"; }
step() { printf '\n== %s\n' "$*"; }

step "compose config"
compose config --quiet

step "build and start (db, migrate, web, worker)"
compose up -d --build
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q web)" 2>/dev/null)" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q web)")" = healthy ] || { compose logs; exit 1; }
[ "$(docker inspect -f '{{.State.ExitCode}}' "$(compose ps -aq migrate)")" = 0 ]

step "runtime user is not root and only writable/ is writable"
[ "$(compose exec -T web id -u)" != "0" ]
compose exec -T web sh -c 'test -w writable && ! test -w server.js && ! test -w dist'

step "health and pages over HTTP"
compose exec -T web node --input-type=module -e '
const get = async (p) => { const r = await fetch("http://127.0.0.1:3000" + p, { redirect: "manual" }); return [r.status, await r.text(), r.headers]; };
const [h] = await get("/health"); if (h !== 200) throw new Error("health " + h);
const [s, body, headers] = await get("/"); if (s !== 200 || !body.includes("<html lang=\"vi\"")) throw new Error("home " + s);
if (!headers.get("content-security-policy")) throw new Error("no CSP");
const [l] = await get("/lo-trinh/khong-ton-tai"); if (l !== 404) throw new Error("missing path " + l);
const [a] = await get("/admin"); if (a !== 303) throw new Error("admin redirect " + a);
console.log("pages ok");'

step "admin CLI and seed on the empty database"
run web node dist/admin.mjs create smoke-admin@example.test "Smoke admin" <<<"smoke-$(openssl rand -hex 8)"
run web node dist/admin.mjs check
run web node dist/seed.mjs --publish-reviewed-samples

step "worker"
run web node dist/worker.mjs tick
run web node dist/worker.mjs run 10
run web node dist/worker.mjs cleanup
run web node dist/worker.mjs reconcile

step "SQL backup and restore drill (restore needs CREATE DATABASE: run it as root)"
backup=$(run web node dist/worker.mjs backup | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).file))')
run -e DATABASE_URL="mysql://root:${MCE_DB_ROOT_PASSWORD}@db:3306/motchutenglish" web node dist/worker.mjs restore-drill "$backup"

step "media backup"
run web python3 ops/media-backup.py backup

step "worker container keeps running"
sleep 5
[ "$(compose ps --status running --services | grep -c '^worker$')" = 1 ]

echo
echo "PASS: fresh compose install, pages, CLIs, worker, SQL backup + restore drill, media backup, non-root runtime"

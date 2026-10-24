#!/bin/sh
# Scheduler for the worker container (no cron daemon needed). Every minute: process due jobs.
# Every 5 minutes: tick (streak days, reminders). Once a day after 03:15 UTC: cleanup, then an
# SQL and a media backup into writable/backups (kept 30 days by cleanup).
# Copy the backups off the machine as well; this only protects against application mistakes.
set -u
last_daily=""
minute=0
while true; do
  node dist/worker.mjs run 50 || echo "worker run failed" >&2
  if [ $((minute % 5)) -eq 0 ]; then
    node dist/worker.mjs tick || echo "worker tick failed" >&2
  fi
  today=$(date -u +%F)
  if [ "$(date -u +%H%M)" -ge 0315 ] && [ "$last_daily" != "$today" ]; then
    node dist/worker.mjs cleanup || echo "cleanup failed" >&2
    node dist/worker.mjs backup || echo "SQL backup failed" >&2
    python3 ops/media-backup.py backup || echo "media backup failed" >&2
    last_daily=$today
  fi
  minute=$((minute + 1))
  sleep 60
done

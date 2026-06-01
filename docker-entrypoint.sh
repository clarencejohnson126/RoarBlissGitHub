#!/bin/sh
# Roar Bliss container entrypoint
# Ensures the persistent disk subdirs exist before we boot Next.js + worker.

set -e

# The Render persistent disk is mounted at /var/data. Inside it we lay out:
#   /var/data/jobs     — SQLite queue + worker.lock
#   /var/data/uploads  — incoming user uploads
#   /var/data/output   — generated MP3s (served by Next via /output/*)
mkdir -p /var/data/jobs /var/data/uploads /var/data/output

# Sanity check the symlinks are pointing where we expect
ls -la /app/web/data /app/web/public/uploads /app/web/public/output

echo "[entrypoint] starting worker (background) + Next.js (foreground)..."
cd /app/web
node scripts/worker.mjs &
WORKER_PID=$!
echo "[entrypoint] worker PID=$WORKER_PID"

# trap SIGTERM and forward to children so Render restarts cleanly
trap "kill -TERM $WORKER_PID 2>/dev/null; exit 0" TERM INT

# Run Next.js in foreground. PORT is injected by Render, default 3000 locally.
npm run start

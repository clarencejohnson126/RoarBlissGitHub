#!/bin/sh
# Roar Bliss container entrypoint
# Ensures the persistent disk subdirs exist before we boot Next.js + worker.

set -e

# The Render persistent disk is mounted at /var/data. Inside it we lay out:
#   /var/data/jobs     — SQLite queue + worker.lock
#   /var/data/uploads  — incoming user uploads
#   /var/data/output   — generated MP3s (served by Next via /output/*)
#   /var/data/hf       — HuggingFace cache (HF_HOME) for the gated pyannote model
mkdir -p /var/data/jobs /var/data/uploads /var/data/output /var/data/hf

# Clear any stale worker lock left on the persistent disk by a previous container.
# Each container runs exactly one worker (started below), so a lock file surviving on
# /var/data from a prior boot is always stale — but its PID can collide with a live PID
# in the new container, which would make the worker think a peer is running and refuse to
# start (jobs then hang forever in 'queued'). Deleting it here is safe and correct.
rm -f /var/data/jobs/worker.lock

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

# Roar Bliss — single-container deployment for Render
# Combines Next.js web server + queue worker + Python orchestrator (Demucs / Whisper /
# pyannote / Haiku planner) in one image. TTS calls go out to Replicate (no GPU needed
# in this container).
#
# Memory: peaks ~2.5GB during Demucs+Whisper concurrent load. Requires Render Standard
# plan (2GB) at minimum, Pro (4GB) recommended for comfort.

FROM node:20-slim

# ── System deps: Python 3.11, ffmpeg, build tools for native node modules ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3-pip \
    ffmpeg \
    build-essential \
    libsndfile1 \
    git \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

WORKDIR /app

# ── Install Python deps first (slow layer, cached when poc/requirements.txt unchanged) ──
COPY poc/requirements.txt /app/poc/requirements.txt
RUN pip install --no-cache-dir --break-system-packages -r /app/poc/requirements.txt

# ── Install Node deps (cached when web/package*.json unchanged) ──
COPY web/package.json web/package-lock.json /app/web/
WORKDIR /app/web
RUN npm install --no-audit --no-fund --omit=optional

# ── Copy the rest of the code ──
WORKDIR /app
COPY poc/orchestrator /app/poc/orchestrator
COPY web /app/web

# ── Build Next.js for production ──
WORKDIR /app/web
RUN npm run build

# ── Wire persistent storage ─────────────────────────────────────────────
# Render mounts a persistent disk at /var/data (configured in render.yaml).
# We replace the in-image data / uploads / output dirs with symlinks into
# /var/data so:
#   - the SQLite queue survives container restarts and deploys
#   - uploaded audio files persist between the web receiving them and the worker picking them up
#   - generated MP3s remain downloadable across deploys
RUN rm -rf /app/web/data /app/web/public/uploads /app/web/public/output \
 && ln -s /var/data/jobs    /app/web/data \
 && ln -s /var/data/uploads /app/web/public/uploads \
 && ln -s /var/data/output  /app/web/public/output

# entrypoint script ensures the persistent-disk subdirs exist before we start
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# ── Expose Next.js port (Render injects $PORT) ──
EXPOSE 3000

# Startup is handled by docker-entrypoint.sh (defined above).

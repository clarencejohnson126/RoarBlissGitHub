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

# ── Runtime defaults baked into the image (overridable via Render env vars) ──
#   WHISPER_MODEL=base   — "medium" OOMs a 2-4GB box; "base" is plenty for speech
#   TTS_PROVIDER=replicate — no GPU in this container; voice cloning runs on Replicate
#   HF_HOME=/var/data/hf — gated pyannote model downloads once onto the persistent disk
ENV PYTHONUNBUFFERED=1 \
    WHISPER_MODEL=base \
    TTS_PROVIDER=replicate \
    HF_HOME=/var/data/hf

WORKDIR /app

# ── Install Python deps first (slow layer, cached when poc/requirements.txt unchanged) ──
# openai-whisper ships only an sdist whose setup.py does `import pkg_resources`. setuptools
# >=81 dropped the auto-importable pkg_resources, so the PEP-517 isolated build crashes.
# Pin setuptools<81 via a pip constraint (honoured inside the build-isolation overlay too)
# to keep pkg_resources available while whisper builds. Runtime keeps Debian's setuptools.
COPY poc/requirements.txt /app/poc/requirements.txt
RUN pip install --no-cache-dir --break-system-packages --upgrade pip wheel \
 && printf 'setuptools<81\n' > /tmp/pip-constraints.txt \
 && PIP_CONSTRAINT=/tmp/pip-constraints.txt \
    pip install --no-cache-dir --break-system-packages -r /app/poc/requirements.txt

# ── Pre-bake the ungated ML weights so the FIRST cloud job doesn't stall on a download ──
#   Whisper "base" (~140MB) and Demucs htdemucs (~80MB) land in /root/.cache, inside the
#   image. (pyannote is gated → it downloads at runtime to HF_HOME on the persistent disk.)
RUN python -c "import whisper; whisper.load_model('base')" \
 && python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

# ── Install Node deps (cached when web/package*.json unchanged) ──
# NOTE: do NOT pass --omit=optional. Next 16 / Tailwind v4 (Turbopack) pull lightningcss,
# whose per-platform native binaries (e.g. lightningcss.linux-x64-gnu.node on Render,
# linux-arm64-gnu locally) ship as OPTIONAL deps. Omitting them breaks `next build`.
# Plain `npm install` lets npm fetch the binary matching the build platform automatically.
COPY web/package.json web/package-lock.json /app/web/
WORKDIR /app/web
RUN npm install --no-audit --no-fund

# ── Copy the rest of the code ──
WORKDIR /app
COPY poc/orchestrator /app/poc/orchestrator
COPY web /app/web

# Ship one demo speech so the default "Preloaded Motivational Speech" option works with
# zero upload. The /api/process route looks for this exact file one level above web/.
# (.dockerignore excludes *.mp3 in general; this one is un-ignored there.)
COPY ["I CAN DO THIS - Powerful Motivational Speech.mp3", "/app/I CAN DO THIS - Powerful Motivational Speech.mp3"]

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

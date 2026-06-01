# Render Deployment — Roar Bliss (verified)

One **single Docker container** runs everything: the Next.js site, the queue worker, and the
Python pipeline (Demucs → Whisper → pyannote → Claude Haiku planner). Voice cloning is the only
GPU step and it runs on **Replicate** (F5-TTS) over HTTP — so the container needs **no GPU and no
Apple-Silicon MLX**. This was built and run end-to-end in the exact container that deploys here.

> The old version of this guide described a Qwen3-MLX + Cloudflare-tunnel setup. That is obsolete.
> TTS now goes to Replicate; ignore any tunnel/`QWEN_URL` instructions you may have seen.

## What was verified locally (in the deployable image)

- Image builds clean: `roar-bliss:local`, ~5.1 GB.
- Full pipeline runs inside a **4 GB, no-swap** container (simulating Render Pro) and produces a
  real personalized MP3 from the bundled demo speech **and** from fresh inputs. 21/21 and 28/28
  slots synthesized via live Replicate F5-TTS.
- **Peak memory ~2.5 GB** with Whisper(base) + Demucs + pyannote all exercised → the **2 GB
  Standard plan OOM-kills mid-job; the 4 GB Pro plan is the right size.**
- Demucs separation ≈ 90 s, Whisper(base) ≈ 25 s on a 6-min track.
- The real entrypoint boots: worker attaches to the SQLite queue, Next.js serves `/` (200) and the
  generated MP3s from the persistent disk (`/output/*.mp3`, 206).

## Deploy via Blueprint (recommended — one click)

1. Push this repo to GitHub (`main`). `render.yaml` at the root is the Blueprint.
2. Render dashboard → **New +** → **Blueprint** → pick this repo.
3. Render reads `render.yaml` and provisions:
   - one **Docker web service** (`roar-bliss`, plan **pro / 4 GB**, region **frankfurt**, port from `$PORT`)
   - one **10 GB persistent disk** mounted at `/var/data` (SQLite queue + uploads + outputs + HF cache)
4. Set the secret env vars (everything marked `sync: false`). Values are in `web/.env.local`:

   | Key | Value source |
   |---|---|
   | `ANTHROPIC_API_KEY` | Claude Haiku — planner/classifier/emotion tagger |
   | `HF_TOKEN` | HuggingFace — pyannote diarization model download |
   | `REPLICATE_API_TOKEN` | Replicate — F5-TTS voice cloning |
   | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | completion emails |
   | `NEXT_PUBLIC_APP_URL` | `https://roar-bliss.onrender.com` (your final URL — used in email links) |
   | Stripe / Supabase keys | present but **not yet wired** (Sprint 7, deferred) |

   `TTS_PROVIDER=replicate` and `WHISPER_MODEL=base` are already set in `render.yaml`/`Dockerfile` —
   leave them.
5. **Accept the pyannote model terms once** on the HuggingFace account that owns `HF_TOKEN`:
   - https://hf.co/pyannote/speaker-diarization-3.1
   - https://hf.co/pyannote/segmentation-3.0
   Otherwise diarization gracefully degrades to a single-speaker assumption (fine for solo
   speeches, weaker for multi-speaker source audio).
6. Click **Apply**. First build takes ~10–15 min (Torch/Demucs/Whisper/pyannote install + model
   bake + Next build). Subsequent deploys are faster (layer cache).

## How a job flows in production

1. User submits the form → `POST /api/process` saves the upload to `/var/data/uploads`, enqueues a
   job in SQLite, returns a `sessionId`.
2. The worker (started by the entrypoint) drains the queue one job at a time and spawns
   `run_pipeline_for_web.py`: Demucs split → Whisper → pyannote → Haiku planner → Replicate F5-TTS
   per slot → ffmpeg mix → writes `{sessionId}_full.mp3` / `_preview.mp3` to `/var/data/output`.
3. The page polls `/api/logs` for the `[SUCCESS]` line, then plays `/output/{sessionId}_preview.mp3`
   (30 s) and unlocks `_full.mp3`. If an email was given, Resend sends the download link.

Jobs run **serially** (one worker) — correct for beta. Throughput ≈ one ~5–8 min job at a time.

## Cost

| Item | Cost |
|---|---|
| Render web service (Pro, 4 GB) | ~$85/mo |
| Render persistent disk (10 GB) | ~$1/mo |
| Replicate F5-TTS | ~$0.05–0.15 / personalization |
| Anthropic Haiku | ~$0.02 / personalization |
| Resend (3k emails/mo free) | $0 |

### Want $25/mo instead of $85? The one clean lever

Memory peaks during **Demucs**. Offload Demucs to a Replicate model (same `htdemucs`, equivalent
stems) the way TTS already is — then the container holds only Whisper(base)+pyannote (~1.5–2 GB
peak) and fits the **2 GB Standard plan ($25)**. It's an isolated swap in `run_pipeline_for_web.py`
behind a `DEMUCS_PROVIDER` flag; the rest of the pipeline is untouched. Do this after launch, not
before — local Demucs is proven and shipping today matters more than $60/mo.

## Local parity test (reproduce the verification)

```bash
DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker   # docker isn't on PATH on this Mac
PATH="$(dirname $DOCKER):$PATH" docker build -t roar-bliss:local .
# Full pipeline against the bundled demo, capped at 4 GB like Render Pro:
docker run --rm --memory=4g --memory-swap=4g \
  --env-file web/.env.local -v /tmp/rb:/var/data -w /app --entrypoint python \
  roar-bliss:local poc/orchestrator/run_pipeline_for_web.py \
  --input "/app/I CAN DO THIS - Powerful Motivational Speech.mp3" \
  --name Clarence --battlefield "Building an Empire" --struggle "doubt" \
  --family "Lean and Elanese" --location "Mannheim" --champion "Eric Thomas" \
  --output-dir /var/data/output --session-id test --window-ms 120000
# → /tmp/rb/output/test_full.mp3
```

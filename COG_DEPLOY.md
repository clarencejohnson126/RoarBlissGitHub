# Deploying the Roar Bliss pipeline to Replicate (pay-per-use, $0 idle)

The whole pipeline is packaged as a **Replicate Cog** (`cog.yaml` + `predict.py`). One API call runs
Demucs → Whisper → pyannote → Sonnet planner → TTS → ffmpeg mix, on a GPU that **scales to zero** when
idle. You already have a Replicate account — no new platform.

## One-time deploy
```bash
# from the repo root, on a machine with Docker
pip install cog            # the Replicate build tool
cog login                  # uses your Replicate API token

# build + push the model (first build ~15–25 min: torch/demucs/whisper/pyannote)
cog push r8.im/<your-replicate-username>/roar-bliss
```

## Set the secrets (in the Replicate model's Settings → Environment, NOT in git)
- `ANTHROPIC_API_KEY` — the planner (Sonnet writes, Haiku does the mechanical calls)
- `HF_TOKEN` — pyannote diarization model (accept terms once at hf.co/pyannote/speaker-diarization-3.1)
- `REPLICATE_API_TOKEN` — F5-TTS voice cloning (v1)

## Call it (the web app does this; here's the shape)
```bash
curl -s -X POST https://api.replicate.com/v1/predictions \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "version": "<model-version-id>",
    "input": {
      "audio": "https://.../your-audio.mp3",
      "name": "Clarence Johnson",
      "battlefield": "Founder building his own house alone",
      "struggle": "Months of rejection, building alone, a father of two",
      "family": "Lean and Elanese",
      "location": "Mannheim",
      "paid": false
    },
    "webhook": "https://<your-web-app>/api/replicate-callback"
  }'
```
- `paid: false` → free tier, capped at 60s. `paid: true` → up to 6 min (set by the billing layer).
- The model returns the personalized MP3. The web app gets the `webhook` callback when done and
  notifies the user.

## Cost
- **$0 when idle** (scale-to-zero). ~**$0.10–0.20 per generation** (GPU seconds) + the LLM (~$0.05–0.10
  with Sonnet) + TTS. Protect with a **monthly budget cap** in Replicate + the per-user free limit.

## Next optimizations (post-launch)
- Host F5-TTS **inside** the cog (GPU) instead of the per-call Replicate F5 API → cheaper TTS.
- Bake the pyannote weights at build time (build secret) so the first call doesn't download them.
- Source-audio caching (content hash) so popular uploads skip Demucs/Whisper/pyannote.

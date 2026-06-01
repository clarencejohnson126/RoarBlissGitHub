# Render Deployment Walkthrough

This is a step-by-step guide for deploying Roar Bliss to Render. Read all the way through before clicking — there's an architectural constraint (Qwen3-TTS) that changes the deployment plan.

## ⚠️ Critical reality check first

Roar Bliss has 4 heavy runtime components. Three of them deploy cleanly to Render. **One does not, today.**

| Component | Runs on Render? | Why / Why not |
|---|---|---|
| Next.js web app (UI, queue API, status API) | ✅ yes | Render's web service handles this perfectly |
| SQLite queue + Resend emails + Stripe webhooks | ✅ yes | runs inside the web service, persistent disk for the DB |
| Demucs, Whisper, pyannote, ffmpeg (Python pipeline) | ✅ yes (cpu-heavy but works) | Render's background worker service or a separate service |
| **Qwen3-TTS via local MLX** | ❌ **NO** | MLX is Apple-Silicon-only. Render servers are Linux x86_64 / NVIDIA GPUs. MLX won't run there. |

**This means a vanilla Render deployment will work end-to-end EXCEPT the actual voice cloning step — which is the core of the product.** Three honest options to handle this:

### Option 1 (recommended for beta): tunnel from your Mac
- Deploy web + worker to Render (free/cheap)
- Keep Qwen3-TTS server running on your Mac
- Use ngrok / Cloudflare Tunnel to expose your Mac's Qwen3 server to Render
- Set `QWEN_URL=https://abc123.ngrok.io/api/v1/base/clone` in Render env
- Cost: Render ~$7/mo for web service + $0 for tunnel (free tier) + your Mac stays on
- Trade-off: your Mac must be online during jobs; can't scale beyond 1 concurrent job
- **Right move for beta: validates the product without infrastructure investment**

### Option 2: swap to cloud TTS (ElevenLabs)
- Replace Qwen3 in `auto_synthesizer.py` with ElevenLabs API calls
- Quality is comparable (some argue better)
- Cost: ~$0.30 per personalization (vs $0 with local Qwen3)
- Render-friendly: pure HTTP calls, no infra
- Time: ~1 day to swap the synthesizer module
- **Right move for revenue-funded scaling**

### Option 3: deploy Qwen3 on GPU cloud (Modal, Replicate, RunPod)
- Get Qwen3 PyTorch weights (not the MLX flavor — there's a HF version)
- Deploy to Modal/Replicate as a containerized HTTP service
- Cost: ~$0.10/personalization
- Time: 2-3 days
- **Right move once Option 1 validates demand and you're ready to scale**

---

## Pick your path before continuing

If you're going with **Option 1 (tunnel)** — keep reading. Steps below apply.

If you're going with **Option 2 or 3** — pause and do that swap first; then come back for the Render setup (which is identical, just with different `QWEN_URL`).

---

## Option 1: Render web + worker, tunneled Qwen3

### Step 1 — Create the Cloudflare Tunnel for your Mac's Qwen3 server

This exposes `http://127.0.0.1:7860` (your local Qwen3) on a public HTTPS URL.

```bash
# Install cloudflared (one time)
brew install cloudflared

# Authenticate (opens browser)
cloudflared tunnel login

# Run a quick tunnel (gives you a free trycloudflare.com URL — good for beta)
cloudflared tunnel --url http://127.0.0.1:7860
```

You'll see output like:
```
https://random-words-1234.trycloudflare.com
```

Copy that URL. It's your public Qwen3 endpoint.

For production, set up a named tunnel that persists across restarts:
```bash
cloudflared tunnel create roar-bliss-qwen
cloudflared tunnel route dns roar-bliss-qwen qwen.your-domain.com
cloudflared tunnel run roar-bliss-qwen
```

### Step 2 — Create a Render account + connect GitHub

1. Go to https://render.com/register
2. Sign up with your GitHub account
3. Authorize Render to read your repos

### Step 3 — Deploy the Next.js web service

1. In Render dashboard → **New +** → **Web Service**
2. Connect repository: `clarencejohnson126/RoarBlissGitHub`
3. Configure:
   - **Name:** `roar-bliss-web`
   - **Region:** Frankfurt (closest to you in Mannheim)
   - **Branch:** `main`
   - **Root Directory:** `web`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Plan:** Starter ($7/mo) — needed for persistent disk
4. **Environment variables** (paste all of these — values are in your `web/.env.local`):
   - `ANTHROPIC_API_KEY` = sk-ant-...
   - `HF_TOKEN` = hf_...
   - `RESEND_API_KEY` = re_...
   - `RESEND_FROM_EMAIL` = `Roar Bliss <noreply@your-domain.com>` (or `onboarding@resend.dev` for testing)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = pk_test_...
   - `STRIPE_SECRET_KEY` = sk_test_...
   - `NEXT_PUBLIC_SUPABASE_URL` = https://eoahpwciwttfavzpqfnz.supabase.co
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = sb_publishable_...
   - `SUPABASE_SERVICE_ROLE_KEY` = sb_secret_...
   - `QWEN_URL` = `https://your-trycloudflare-url.trycloudflare.com/api/v1/base/clone` (from Step 1)
   - `NEXT_PUBLIC_APP_URL` = `https://roar-bliss-web.onrender.com` (will fill in after deploy)
5. **Add Persistent Disk** (for the SQLite job queue + uploaded audios):
   - Mount path: `/opt/render/project/src/web/data` AND `/opt/render/project/src/web/public/output`
   - Size: 10 GB (plenty for early beta)
6. Click **Create Web Service**

Render will pull from GitHub, install deps, build, and start. First deploy takes ~5 min.

### Step 4 — Deploy the background worker

The worker drains the SQLite job queue. It needs to share the same disk as the web service.

Render has two ways to do this:

**Option A (simpler): combine web + worker into one service**

Change the web service start command to:
```bash
npm run worker & npm run start
```

This runs both processes in the same container, sharing the disk. Good for beta (low traffic).

**Option B (cleaner for scaling): separate Background Worker service**

1. **New +** → **Background Worker**
2. Same repo, same root, same env vars
3. Build Command: `npm install && npm run build`
4. Start Command: `npm run worker`
5. Attach the SAME persistent disk used by the web service (Render allows this)

I'd recommend **Option A for beta**, **Option B for production** when you scale to multiple workers.

### Step 5 — Deploy the Python pipeline service

The worker spawns `poc/orchestrator/run_pipeline_for_web.py` which needs Python + Demucs + Whisper + pyannote. Two paths:

**Path 1 (simpler): bundle Python into the web service**

Add a `render-build.sh` script at the repo root:
```bash
#!/bin/bash
set -e
cd web && npm install && npm run build
cd ..
pip install -r poc/requirements.txt  # need to create this from your venv
```

Set Build Command to `bash render-build.sh`. Now Python + Node coexist in the container.

Trade-off: container is bigger, build slower, but simpler.

**Path 2 (cleaner): separate Python service that the worker shells out to over HTTP**

This is bigger refactor work — defer to a future sprint.

For beta: use **Path 1**.

You'll need a `poc/requirements.txt`. Generate it now:
```bash
cd "/Users/clarence/Desktop/Roar Bliss App/poc"
source venv/bin/activate
pip freeze > requirements.txt
```

Commit + push:
```bash
git add poc/requirements.txt
git commit -m "Add Python requirements for Render"
git push
```

### Step 6 — Connect a custom domain (optional)

In Render → web service → Settings → Custom Domain. Add e.g. `roarbliss.app`. Render gives you DNS records to paste into your domain registrar (Namecheap, Cloudflare, etc.). HTTPS is auto-issued via Let's Encrypt.

### Step 7 — Verify the full flow

1. Open `https://roar-bliss-web.onrender.com`
2. Submit a test job through the form
3. Watch logs in Render dashboard (web service + worker service)
4. Confirm Resend email arrives in your inbox
5. Listen to the output MP3

If something fails: Render dashboard → Logs tab. The first deploy often needs a tweak (missing dep, wrong path, env var typo) — Render makes redeploy easy.

---

## Cost summary for Option 1 (beta)

| Item | Cost |
|---|---|
| Render web service (Starter plan, includes 100GB bandwidth) | $7/mo |
| Render persistent disk (10 GB) | $1/mo |
| Cloudflare Tunnel (free tier) | $0/mo |
| Resend (3000 emails/mo free) | $0/mo |
| Anthropic API (Haiku 4.5 at $0.02/personalization × 100 personalizations) | $2/mo |
| Domain (optional) | ~$1/mo |
| **TOTAL** | **~$11/mo** for up to 100 personalizations/mo |

At Beta tier ($30 one-time × 50 users): ~$1,500 revenue, ~$50 cost — healthy validation of unit economics before infra scaling.

---

## When to upgrade beyond Option 1

You'll feel the pain at one of these thresholds:
- **Your Mac goes offline mid-day** and Qwen3 dies → time to move to Option 3 (cloud Qwen3)
- **Concurrent jobs are queued for >5 min** → time for multiple workers + cloud TTS
- **MRR hits $1K** → time for proper cloud infra (CDN, multi-region, monitoring)

Until then, Option 1 is the right move per the Five Pillars: prove tokconomics level 3 before investing.

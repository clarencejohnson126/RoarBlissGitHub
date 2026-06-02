# Roar Bliss — Production Blueprint (the committed plan)

This is the single source of truth for where Roar Bliss is going and how it ships. We build against
this. No more strategy pivots — changes to this doc are deliberate decisions, not drift.

## North star
> Any user uploads any motivational / cinematic audio and gets, one-shot, a seamless personalized
> version in which **they become the hero** — in the cloud, scalable, profitable.

Two principles that decide everything else:
1. **Quality lives in the SYSTEM** (the production prompt + the pipeline safety nets), not in the
   model tier. → we run on **Sonnet**, not Opus.
2. **Everything runs serverless/GPU in the cloud, never a laptop.** → scales to 10k+ users,
   costs ~nothing when idle.

(The local Mac + Docker + Cloudflare tunnel was only the $0 test bridge while we built the output
engine. It is NOT production.)

## Production architecture — LAUNCH on Render (already set up), optimize later
We ship on **Render** with the single Docker container we already built and proved end-to-end
(`Dockerfile` + `render.yaml`). No new platform. The container runs everything:
```
User → Render Web Service (Docker)    Next.js UI/API + queue worker + the full Python pipeline
          │   per job:
          │   Demucs · Whisper · pyannote · Planner(LLM) · TTS · ffmpeg mix
          ▼
      Render Persistent Disk           SQLite queue + finished MP3 + 30s preview (served via /api/output)
          ▼
      Resend email → user
```
- **LLM:** Anthropic. `WRITER_MODEL=claude-sonnet-4-6` writes the lines; Haiku does the mechanical
  calls (parse / classify / emotion-tag / shorten). `WRITER_MODEL=claude-opus-4-8` = optional
  "premium" tier. (Verified: Sonnet ≈ Opus quality here; Haiku is visibly rougher — not for paid.)
- **TTS for launch:** Replicate F5-TTS (`TTS_PROVIDER=replicate`) — proven, zero infra, runs from
  inside the Render container (no GPU/MLX needed in the box).
- **Plan:** Render **Pro 4GB (~$85/mo)** runs the full pipeline (measured peak ~2.5GB). It is
  always-on, so the trade-off is a fixed monthly cost; recovered by ~25 paid tracks.

### Future cost-optimizations (AFTER launch + revenue — NOT now, do not pivot early)
- Drop to Render **Standard 2GB ($25/mo)** by offloading **Demucs** to Replicate + skipping pyannote
  for single-speaker (frees the RAM). ~1–2h work.
- Or move the pipeline to a **usage-based serverless-GPU** host (e.g. Modal) to kill idle cost and
  self-host TTS cheaply. Only worth it once volume/idle-cost justifies it.

## Tiers
- **Free:** up to **60s** per track. Cheapest config (cached sources, conditional QA). ~$0.02–0.04 each.
- **Paid:** up to **6 min**. Credit-based (a track = a few $ of credits). Sonnet/Opus.
- The `paid` flag flows from the (future) auth/billing layer into `/api/process`.

## Unit economics (Sonnet standard, optimized) — estimates, confirm vs current pricing
| Case | Cost / generation |
|---|---|
| Popular/cached source (the bulk of volume) | **~$0.03–0.08** |
| Short video (1–3 min) | ~$0.03–0.06 |
| Fresh 6-min (worst case) | ~$0.12–0.16 |

At a $3–5 charge per paid track → **>95% margin**. Free tier capped at 60s → ~$0.02–0.04 each, so
1,000 free generations ≈ $30 (acquisition-affordable). **The cost lever is GPU/TTS + caching, NOT
cheaper models** — once on Sonnet, the LLM (~$0.05–0.08/6-min) ≈ the GPU, and going cheaper than
Sonnet costs visible quality for pennies of saving.

## Cost levers (in priority order)
1. **[DONE] Sonnet writer + Haiku mechanical** — ~5× cheaper than Opus, quality holds.
2. **[DONE] Conditional QA** — a deterministic check; the 2nd (expensive) LLM call runs only when the
   draft is flawed. Clean drafts skip it.
3. **[DONE] Synthesis-time length control** — re-generate a line shorter if the clone renders long
   (kills time-compression / "sped-up" lines) instead of paying for a perfect first guess.
4. **[OPEN] Source-audio caching (content-hashed, on persistent storage)** — Demucs/Whisper/pyannote
   are deterministic per audio. Popular uploads → compute once, reuse across users → ML ≈ $0.
   *Biggest remaining GPU lever.*
5. **[OPEN] Skip pyannote for single-speaker** audio (the heaviest ML step) + warm-batched TTS.

## Output engine (the hard part — DONE, generalizes to any genre)
- A genre-adaptive production system prompt (designed via a multi-agent draft→judge→synthesize pass):
  detects the source's world (epic / sermon / boxing / rap / anime / founder …) and translates the
  user's real life into that costume — **original lines only**, never reproducing the source.
- Safety nets in code: per-slot **pace** match, **exact-loudness** match (seamless), **peak**
  transformation (the chant becomes the user's), **no >20s gaps**, length control.

## Go-live steps (ordered) — on Render, no new platform
1. **[DONE]** Output engine + cost split + tiers + the Docker container (built + proven e2e).
2. **[NEXT]** Deploy the Render Blueprint (`render.yaml` → Render **Pro 4GB**). Env vars: Anthropic,
   HF_TOKEN, Replicate, Resend, `WRITER_MODEL=claude-sonnet-4-6`, `TTS_PROVIDER=replicate`. First
   build ~10–15 min. (Render account already exists; redeploy via dashboard or the Render API key.)
3. **[OPEN]** Verify the live flow on the Render URL: form → queue → worker → pipeline → MP3 → email.
4. **[OPEN — Sprint 7]** Auth + Stripe → activates the paid tier + the `paid` flag (the 60s-free /
   6-min-paid gate is already coded).
5. **Launch:** first users; monitor; iterate on real uploads.
6. **[LATER, post-revenue ONLY]** Cost optimizations — Standard $25 via Demucs offload + single-speaker
   pyannote skip, or a usage-based serverless-GPU host; source-audio caching. Do NOT do these before launch.

## What's needed from the founder to go live
- The **Render** account is already set up (previous session, billing on file). Re-deploy the Blueprint
  on **Pro 4GB** (dashboard, or I redeploy via the Render API key with your OK on the ~$85/mo).
- (Later, Sprint 7) Stripe + an auth provider for the paid tier.
Everything else is code we control.

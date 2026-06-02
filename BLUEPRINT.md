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

## Production architecture
```
User → Next.js (Vercel)            stateless UI + form + status API
          │ enqueue job
          ▼
      Modal (serverless GPU)        the engine, Python-native, autoscale, scale-to-zero
          │   per job on one warm GPU:
          │   Demucs · Whisper · pyannote · Planner(LLM) · TTS · ffmpeg mix
          ▼
      Cloudflare R2 (or S3)         finished MP3 + 30s preview (R2 = $0 egress)
          │
          ▼
      Email/Webhook → user
```
- **LLM:** Anthropic. `WRITER_MODEL=claude-sonnet-4-6` writes the lines; Haiku does the mechanical
  calls (parse / classify / emotion-tag / shorten). `WRITER_MODEL=claude-opus-4-8` = optional
  "premium" tier. (Verified: Sonnet ≈ Opus quality here; Haiku is visibly rougher — not for paid.)
- **TTS:** self-host the cloning model on the Modal GPU. NOT MLX (Mac-only), NOT Replicate-per-call.
  Replicate was a stopgap; at scale our per-slot architecture (40–50 TTS calls/6-min job) makes
  per-call pricing expensive, so we keep the model warm on our own GPU.
- **Queue/retries/concurrency:** Modal provides them. The SQLite worker was for the single-box bridge.

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

## Go-live steps (ordered)
1. **[DONE]** Output engine + cost split + tiers.
2. **[OPEN — needs your Modal account]** Migrate the pipeline to a Modal app (wraps the existing
   `poc/orchestrator` functions), host TTS on the Modal GPU, write outputs to R2.
3. **[OPEN]** Point the Next.js app (Vercel) at Modal; outputs served from R2.
4. **[OPEN]** Source-audio caching + single-speaker skip (cost polish).
5. **[OPEN — Sprint 7]** Auth + Stripe billing → activates the paid tier and the `paid` flag.
6. **Launch:** first paying users, monitoring, iterate on real uploads.

## What's needed from the founder to go live in the cloud
- A **Modal** account (serverless GPU host) — the one gate to get off the laptop cheaply.
- A **Cloudflare R2** (or S3) bucket for outputs.
- (Later) Stripe + an auth provider for the paid tier.
Everything else is code we control.

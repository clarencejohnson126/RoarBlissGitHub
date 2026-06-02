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

## Production architecture — LOCKED (pay-per-use, $0 idle)
The founder rejected any fixed monthly box for a pre-revenue app (rightly — you'd pay for idle).
So hosting is **usage-based / scale-to-zero**, on the account we already have (**Replicate**):
```
User → Web shell (Cloudflare Pages / Vercel, free)    UI + form + status; calls the Replicate API
          │ start prediction (audio + user story)
          ▼
      Replicate Cog (GPU, scale-to-zero)              the WHOLE pipeline, one model, pay-per-run:
          │   Demucs · Whisper · pyannote · Sonnet planner · TTS · ffmpeg mix   [cog.yaml + predict.py]
          ▼
      webhook → web shell → R2 (output) + Resend email → user
```
- **$0 when idle.** ~$0.10–0.20 GPU/run + LLM (~$0.05–0.10 Sonnet). Protect with a Replicate
  **monthly budget cap** + a **per-user free limit** (1 free job / signed-up user, 60s).
- **LLM:** `WRITER_MODEL=claude-sonnet-4-6` writes; Haiku does parse/classify/emotion-tag/shorten;
  `claude-opus-4-8` = optional premium. (Verified: Sonnet ≈ Opus; Haiku visibly rougher — not paid.)
- **TTS:** v1 = F5-TTS via Replicate API from inside the cog; optimize to F5 hosted in-cog later.
- **Why not Render:** every Render plan is a FIXED $25–85/mo whether used or not, and a single box
  would choke on a burst of users (serial). Usage-based wins for pre-revenue. (A fixed/reserved box
  may win again only at sustained high volume — a post-revenue problem.)

### Post-launch cost optimizations (NOT now)
- Host F5-TTS inside the cog (kill the per-call F5 markup); bake pyannote weights at build.
- Source-audio caching (content hash) → popular uploads skip Demucs/Whisper/pyannote (ML ≈ $0).

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

## LIVE (2026-06-02)
- **Web shell:** https://roar-bliss.vercel.app (Vercel project `clarences-projects-143b15aa/roar-bliss`,
  root dir = `web/`, deploy with `vercel deploy --prod --yes` from `web/`).
- **Model:** `clarencejohnson126/roar-bliss` on Replicate (private, CPU, scale-to-zero), built+pushed
  via GitHub Actions (`.github/workflows/deploy-cog.yml`). Predictions use the **version-based**
  `/v1/predictions` endpoint (the `/models/.../predictions` shortcut is official-models-only → 404).
- **Secrets:** Replicate has NO model-level env vars → the 3 pipeline secrets (ANTHROPIC_API_KEY,
  HF_TOKEN, REPLICATE_API_TOKEN) are Cog **Secret inputs**, forwarded per-prediction from Vercel env.
- **Storage:** Vercel **Blob** (`roar-bliss-audio` store) — browser uploads direct (bypasses the
  4.5MB function-body limit); the webhook persists the output for a durable email link.

## Go-live steps (ordered) — usage-based, no new platform
1. **[DONE]** Output engine + cost split + tiers + the **Replicate Cog** (`cog.yaml` + `predict.py`).
2. **[DONE]** Cog built + pushed to Replicate via GitHub Actions (cloud build, no laptop). Secrets are
   passed as Cog Secret inputs, not model env vars.
3. **[DONE]** Web shell **live on Vercel**: form → version-based Replicate prediction → status proxy +
   same-origin audio stream → webhook persists to Blob + Resend email. **TODO:** Replicate **budget cap**
   + per-user free limit (needs auth, Sprint 7).
4. **[OPEN — Sprint 7]** Auth + Stripe → activates the paid tier + the `paid` input (free 60s /
   paid 6-min gate already coded in the cog and `/api/process`).
5. **Launch:** first users; monitor; iterate on real uploads.
6. **[LATER, post-revenue ONLY]** F5-TTS in-cog, bake pyannote (kills the runtime HF_TOKEN need),
   source-audio caching. Not before launch.

### Deploy gotchas (learned the hard way 2026-06-02)
- `vercel blob create-store` / other `vercel` commands run an **env pull** that **overwrites
  `web/.env.local`** with only the project's vars — it wiped local ANTHROPIC_API_KEY/HF_TOKEN/Stripe/
  Supabase. Back `.env.local` up before running `vercel` storage commands.
- Hammering `api.replicate.com` from the laptop with `python-urllib` trips **Cloudflare error 1010**
  (IP/signature ban). Test through the Vercel deployment instead (different IP), or use a real UA.
- The Replicate **model must exist before the first `cog push`** (create via API/dashboard) or the
  registry push fails with `unauthorized: authentication required`.

## What's needed from the founder to go live
- **Replicate** account (already have it) — run `cog push` to deploy the pipeline. No new platform.
- A free **Cloudflare Pages** (or Vercel) site for the web shell + an **R2** bucket for outputs.
- (Later, Sprint 7) Stripe + an auth provider for the paid tier.
Everything else is code we control.

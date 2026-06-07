# Work Session Summary — 2026-06-07 (autonomous)

Clarence asked me to build everything (re-pin → UI → template/prompt → matrix test) while away.
Here's what's done, what's deployed, and the ONE thing left for you to trigger.

## ✅ Done & deployed

**Replicate Cog — final version `94c1272470270df4344823d5748ec9f1ecfa0e58d5f270f7f162320fd44e93f2`**
(model `clarencejohnson126/roar-bliss`, built via the GitHub Action). It now has:
- **Deterministic voice sourcing** — `clone_source_voices` input. The user NEVER gets a voice they
  didn't choose. `true` (default) clones the source's real speakers (the core "keep the voices" flow);
  `false` = only `extra_voice_ids` over the upload-as-bed (instrumental + your chosen voice).
- **Loudness-normalized** voices (no more "one too loud, one too quiet").
- **Cinematic "Stimmenklang"** VO chain (body/presence/air + glue comp).
- **Sidechain music mix** (loud music AND clear voice) with **`music_gain_db` / `duck_db`** knobs —
  tunable per run, no rebuild.
- **Full-length music bed** (`bed_len_ms`) — the track runs the full instrumental length with a music
  outro, no cut-off.
- **`voice_speed`** knob (slightly slower = 0.93, pitch preserved).
- **`prompt` (free-form) + `tone` (one-click template)** inputs feeding the planner — EITHER/OR.

**Web app (Next.js) — committed to branch `claude/desktop-strips-integration-potential-5pNww`:**
- OnboardingForm: **tone/template chips** (Fighter/Reflective/Confident/Grief/Triumphant) + a
  **free-form prompt textarea** (overrides the structured fields).
- Threaded `prompt`+`tone` through `page.tsx → TeaserPreview → /api/process → PredictionInput`.
  `PredictionInput` also exposes the advanced knobs for later. **`tsc --noEmit` clean.**

**Re-pinned** `REPLICATE_MODEL_VERSION → 94c1272…` in `web/.env.local` AND Vercel production env.
(Env changes are INERT until the next deploy — so production still serves the old version until you
deploy. This is intentional: the go-live is your call, see below.)

## ✅ Matrix test — core product verified on the new version
4 real runs against the "I CAN DO THIS" speech (Mode B, cloning):
| Case | Result |
|---|---|
| Clone 50% (EN) | ✅ 42 sentence-overrides, 38/42 slots, speaker cloned ("House Johnson") |
| Translate → German | ✅ 44 overrides, `language=German` honored |
| Free prompt | ✅ prompt drove the script (kids/promise/rebuilding-after-loss) |
| full_voice 100% (clone) | ✅ succeeded |
Test outputs in repo root: `RoarBliss_MATRIX_*.mp3` — **please listen** (esp. the German one + prompt one).

## ⚠️ The ONE thing left for YOU: go-live deploy
Production still runs the OLD version until a deploy. To go live with everything above:
```
cd web && vercel --prod        # deploys the branch UI + activates the re-pinned version
```
I did NOT do this autonomously — it puts the new UI in front of real/paying users (a launch decision,
tied to Stripe). Review the UI + the German/prompt test MP3s first, then deploy.

## Honest open items (next session)
1. **Latency / 2 lanes.** Instrumental + chosen voice = **~72s** (fast lane). Mode-B cloning on a
   long source = **~600s (~10 min)** (heavy lane). For long uploads, ship async UX: instant 15–30s
   preview + email/notify when done (TeaserPreview already half-built). Also cold-start ~110s (warm
   instance or no-GPU fast lane for the clone-free path).
2. **Slot failures:** 4–7 of ~44 slots fail per Mode-B run (pipeline places the rest). Add retry-with-
   seed-variation (see memory feedback_qwen3_retry_sanity).
3. **full_voice on single-speaker source** over-detects speakers (found 3 in a 1-speaker file). Fine
   for real multi-speaker compilations; consider a max-speakers cap for solo sources.
4. **Stripe** wiring for paid credits (your roadmap).
5. **Cleanup** (optional): the Mac `scripts/roar_render.py` is the recipe blueprint, not production.

## Approved reference outputs (the quality bar)
- `RoarBliss_Clarence_FULL_OUTRO.mp3` — 2:09, Jon, full outro, slightly slower. You said "perfect."

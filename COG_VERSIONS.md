# Cog version provenance — git commit ↔ Replicate cog version

**Why this file exists:** the production cog version is pinned in `web/.env.local`
(`REPLICATE_MODEL_VERSION`, gitignored) and the GitHub Action `deploy-cog.yml` builds from
whatever git state it runs on — so historically there was **no record of which commit produced
which deployed cog version**. That made it impossible to prove, from the repo, that the live
engine contains a given fix. This file fixes that. **Every `deploy-cog` run gets one row here,
committed alongside the predict.py change it builds.**

## How to record a build
1. Note the git commit you're building from (`git rev-parse --short HEAD`).
2. Trigger `deploy-cog.yml`; when it finishes, copy the new Replicate version id.
3. Add a row below (date, commit, version, summary, whether it's promoted to live).
4. When you re-pin prod, update `REPLICATE_MODEL_VERSION` AND mark the row `live: yes`.

## Ledger

| Date | git commit | Replicate cog version | What's in it | Live? |
|------|-----------|----------------------|--------------|-------|
| (pre-2026-06-17) | UNKNOWN — not tracked | `4e4b0fe3…` (per web/.env.local at recon time) | RoFormer separator + overlap-revert + tier-fix/watchdog (the version the founder validated "hört sich gut an") | was live |
| 2026-06-17 | `1279955` | `06c36be0733672a5e03adb82f8178c633452d7ed0b2b7ff40c6a337c65cd965c` | Phase 1: EL-routing (instrumental EL-voice auto-forces full_voice) + clipping −1.5 dBFS true-peak headroom + V3-emotion toggle (`el_model` v2/eleven_v3, writer embeds per-section tags) | superseded |
| 2026-06-18 | `bebfaa7` | `874bb203b95b…` | Translation double-voice fix (is_translation excluded from bed_only → source vocal stripped) + inaudible-snippet fix (CLONE_FLOOR_DBFS=−23) | superseded |
| 2026-06-18 | `407f035` | `ae28125082df…` | + trailing dead-air tail-trim on re-voiced dry/translated speech (last line + 1.5s breath, only when the bed is silent → music tracks never cut short) | superseded |
| 2026-06-18 | `54f27d5` | `91cd2b4a7309481976e7e247a5a8e3a676f2b9e30a11deac4d49b96bdffb46e4` | + no_dead_air FALSE-BLOCK fix: derive from robust ffmpeg `silencedetect` (absolute-RMS), not the constrained-build ebur128/dropout battery that mis-reads integrated=0.0 and flags the speaking voice as a 30s hole. E2E-verified: TRANSLATE_DE + PERSONALIZE75 both deliver (blockers=[]) | superseded |
| 2026-06-19 | `0d895c9` | `71e52de26d9f…` | bed-presence (lift separated stem to source <200Hz music level, +12dB cap, separated beds only) + first float-WAV clip attempt | superseded (clip still 0.0: pydub clips f32 on read) |
| 2026-06-19 | `087dd9e` | `d3ec159523ec61d2578c54e217515e977851b9630bf6c5a969ef07aa17944711` | + REAL clip fix: astats float-peak measure → constant float-domain trim → s16 (pydub-safe). E2E: TRANSLATE_DE bed_lift +4.2dB, clip_peak −1.6 (was 0.0), Flat factor 0, music-below-mix 7.1dB; INSTRUMENTAL bed_lift=None (RULE #1 untouched). Founder ear-gate on Al-Pacino pending | superseded (double-voice in the "voiced upload + chosen voice" EL path) |
| 2026-06-19 | `9687fc7` | `f81d533f5facc53a896f9db05171a13ab8dd36488d5a61e5e0e9234ee422fdc5` | DOUBLE-VOICE fix for good: the chosen-voice path now ALWAYS separates and STRIPS the source voice when the upload contains speech (`_source_has_voice`), so a "voiced upload + chosen EL voice" no longer plays the original speaker under the chosen voice. Fix-A verified on this version (pred `znqq0sbm`: log "source voice STRIPPED (no double-voice)", 1 EL voice, gate tier=100 PASS). Paired with the web layer: composePayload makes a partial tier (25/50/75) NEVER emit EL (server-truth), UI greys the voice picker below 100%, and stale sourceMode/libraryVoiceId is no longer restored from localStorage | **LIVE 2026-06-19 PM** (re-pinned in Vercel; prod run pending confirm) |

> Rows above the line are reconstructed best-effort; the commit→version map did not exist before
> 2026-06-17, so the live version's exact source commit is unverifiable. Everything from the next
> build on is tracked deterministically.

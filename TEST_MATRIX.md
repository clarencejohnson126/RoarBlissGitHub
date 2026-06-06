# Roar Bliss — Cloud Stress-Test Matrix

Goal: imagine every kind of audio a real user could upload, and run each through the
cloud pipeline to find where it breaks. Pass = output sounds intentional, voice is
clear, no artifacts, timing makes sense, cost/latency acceptable.

## Two pipelines (test them separately)

- **Mode A — Score:** input is an INSTRUMENTAL (no speech). We generate ALL narration
  and lay it on the music. (Engine: `scripts/roar_render.py render()`.)
- **Mode B — Edit/Personalize:** input ALREADY has speech. We clone the speaker's
  voice and REPLACE *some* lines with personalized ones. Hard rule: generated snippets
  REPLACE original speech, never get inserted into pauses/silence. Loudness-match each
  clone to the slot it replaces.

---

## A. Upload archetypes

| # | Upload | Mode | What the pipeline must do | Stress factor / likely failure | Pass criteria |
|---|--------|------|---------------------------|-------------------------------|---------------|
| A1 | Clean instrumental + chosen voice + script | A | full money-shot render | peak detection, ducking, length fit | the approved baseline |
| A2 | Instrumental SHORTER than the script needs | A | compress pacing or trim lines | script overflows the track tail | no speech over dead silence |
| A3 | Instrumental much LONGER (5–10 min) | A | distribute narration, long gaps | huge dead-music stretches | feels intentional, not empty |
| A4 | Instrumental with a flat / no clear peak | A | graceful climax fallback | peak detector picks noise | climax line still lands sensibly |
| A5 | Very DENSE / loud instrumental (wall of sound) | A | duck harder | voice still buried after ducking | every word intelligible |
| A6 | Instrumental that already has choir/vocals/lyrics | A | detect + warn, or duck vocals | our voice clashes with sung vocals | no muddy voice-on-voice |
| A7 | Very quiet / sparse ambient track | A | lift music or lower voice gain | voice way too loud vs bed | balanced, not jarring |
| B1 | Single clean speaker, motivational (Tate-style) | B | clone voice, replace some lines | clone quality, seam at edits | personalized lines indistinguishable |
| B2 | Speech WITH music under it (mixed) | B | swap voice, keep the music bed | can't isolate voice to clone; seams | bed intact, no audible splice |
| B3 | Multi-speaker compilation (ET + Goggins + …) | B | clone correct speaker per segment | wrong-voice swap, identity bleed | each swap matches its speaker |
| B4 | Podcast / 2-person interview | B | personalize one speaker's lines | cross-talk, overlap at edits | no clipped other-speaker words |
| B5 | Spiritual / meditation (slow, breathy, long pauses) | B | keep calm pacing, gentle clone | clone adds energy / breaks calm | tone preserved, no pace jump |
| B6 | Sports hype / locker-room (fast, crowd noise) | B | clone over noise, keep energy | crowd noise corrupts clone | energy + names land clean |
| B7 | Spoken word over SILENCE (no music) | B | replace lines, match room tone | dead-air seams around clones | seamless, consistent room tone |

## B. Personalization correctness (both modes)

| # | Test | Why |
|---|------|-----|
| P1 | Names / unusual spellings (Lenise→"Ella-Niece", Lian→"Lee-an") | mispronunciation is the #1 immersion-breaker |
| P2 | Non-English upload (DE/ES/FR) + keep the original voice | core feature: translate, keep voice identity |
| P3 | Personalize first 10s for retention (hook) | proven retention principle |
| P4 | Clone length ≤ ~3× the slot it replaces | runaway/garbage TTS guard |
| P5 | Loudness-match clone to the SLOT, not a window with silence | volume jumps at edits |

## C. Robustness / input hygiene

| # | Test | Expected behavior |
|---|------|-------------------|
| R1 | Corrupt / truncated file | clean error, no crash |
| R2 | Wrong format (video, DRM, .m4a, FLAC, mono, 8kHz) | transcode or reject with message |
| R3 | Clipped / over-compressed loud master | normalize before processing |
| R4 | Noisy phone recording (Mode B clone source) | clone still usable or graceful warn |
| R5 | Music WITH lyrics uploaded as "instrumental" (Mode A) | detect vocals, warn user |
| R6 | Copyrighted track (e.g. GoT OST) | legal gate: private/demo only, block public |
| R7 | Extreme lengths: 15s and 30 min | min/max guards, chunking + cost cap |
| R8 | TTS returns ~90s of garbage | sanity check + retry with seed variation |

## D. Scale / economics (the cloud part)

| # | Test | Why |
|---|------|-----|
| S1 | 10 concurrent renders | queueing, GPU/compute contention |
| S2 | Cost per minute of output (ElevenLabs + compute) | unit economics per tier |
| S3 | End-to-end latency (upload → finished mp3) | UX expectation |
| S4 | Free-tier guards (≤45s, 75%, 1/device+IP) still hold | abuse protection |
| S5 | ElevenLabs reachable from the cloud env | the api.elevenlabs.io allowlist gotcha |

---

## Suggested cloud run order
1. **A1** (baseline, already approved) → confirm cloud == local.
2. **B1** (Tate single speaker) → proves Mode B clone+replace end-to-end.
3. **A5 / B2** (dense mix / speech+music) → the hardest mixing cases.
4. **B3** (multi-speaker) → hardest identity case.
5. **R-series** (one bad file each) → no crashes.
6. **S-series** (concurrency + cost) → ready for users.

# Roar Bliss — Consolidated `TODO(gap)` list (the founder's roadmap)

Acceptance criteria from the use-case specs that have **no executable check yet** — they rely on the
founder's ear today. Each becomes a candidate new check + a permanent `eval/corpus.json` entry (the
calibration loop, Constitution §5). **None implemented here** (gate code is ear-calibrated + founder-gated).

## ⛔ TRANSLATION — BLOCKED: cloud garbles German (founder wants it as a Warrior feature, but prod can't deliver yet)
Founder approved the LOCAL German render (02_DE, MPS): "hervorragend, einzigartig". Target = a Warrior-tier
feature. BUT the CLOUD cog does NOT reproduce it — must-fix before shipping:
1. **⛔ CLOUD-vs-LOCAL German gap (NEW, 2026-06-14, top blocker).** Two cloud runs (cog `370162ac36d7…`) both
   garble German ("Sturmgeschremen", "trägsteten"); the local render of the same source is clean. Pipeline ran
   correctly (3 speakers, good German script, gate PASSED) → fault = OmniVoice cross-lingual RENDERING on
   CUDA/fp16 vs MPS. Prime suspect: numerics (try bf16/fp32, verify attn_implementation). English/same-language
   cloud is fine — cross-lingual only.
2. **Gate is GARBLE-BLIND.** `output_language` runs langdetect on the SCRIPT TEXT, not the audio → falsely
   PASSED garbled German. Add an audio-intelligibility scorer (Whisper round-trip on the OUTPUT, not the script;
   note Whisper is accent-blind — words-correct ≠ native-sounding → founder's ear stays the calibrator).
3. **Script must span the full audio length** — full_voice can size the script to the voice, not the source →
   music-only dead-speech tail (~1 min observed). `no_dead_air` is the proxy guard.
4. **DEAD LEVER: dropping `ref_text` made German WORSE (tested 2026-06-14) — do NOT retry.** EL stays fully out.

## Coverage gaps (no end-to-end corpus proof)
- **solo-monologue has no corpus entry.** Find a REAL dry single-speaker source with clonable speech and add
  a `solo_monologue_*` entry to `eval/corpus.json`. *(solo-monologue.md)*

## Robustness / crashes
- **No-clonable-speech crashes.** A source too short to clone yields 0 candidates → crash. Make it a
  graceful, user-facing error (refund, §2.7 charge-on-delivery). *(solo-monologue.md)*
- **`validators.py:143` latent `NameError`.** The `full_replacement` guard `tier>=100 or want != "en"`
  references an undefined `want`. Safe in prod only because translation is forced to 100 % (short-circuit);
  a partial-tier translation would crash. Define `want` from `target_language` at the top of
  `validate_plan`. *(translation.md)*

## Missing automatic checks (founder's ear only)
- **American-accent on the translated language** — no native-likeness scorer. *(translation.md)*
- **Intelligibility of target-language words** — Whisper round-trip reliability on cross-lingual clones
  unverified. *(translation.md)*
- **First-10s personalization & no >20s untouched gap (§2.5)** — no plan-level timeline check.
  *(speech-over-music.md)*
- **Beat-matched iconic/anthem lines (§2.3)** — no check that a transformed war-cry lands on the same beat.
  *(cinematic-multivoice.md)*
- **Voice consistency across lines** — `Gates.voice_consistency_min` is defined but no `score` check wires
  per-line pairwise pyannote similarity. *(cinematic-multivoice.md)*
- **Library-voice identity** — no check that the chosen library voice is the one heard (no source ref for
  `clone_fidelity`). *(instrumental-template.md)*

## Engine-unification roadmap — NOW FIRM (founder 2026-06-14: ElevenLabs fully out, 100% OmniVoice)
- **Migrate library voices off ElevenLabs.** The instrumental flow still uses an EL voice id; move to stored
  OmniVoice references so the engine is uniformly OmniVoice. No longer a "tolerated exception" — it's the
  last EL dependency to remove. *(instrumental-template.md, Constitution §3)*
- **Drop ELEVENLABS_API_KEY from the runtime path** once the instrumental flow is migrated (web app + cog
  input + Vercel/Replicate env). EL is no longer part of any feature.

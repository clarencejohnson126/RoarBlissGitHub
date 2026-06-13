# Roar Bliss — Consolidated `TODO(gap)` list (the founder's roadmap)

Acceptance criteria from the use-case specs that have **no executable check yet** — they rely on the
founder's ear today. Each becomes a candidate new check + a permanent `eval/corpus.json` entry (the
calibration loop, Constitution §5). **None implemented here** (gate code is ear-calibrated + founder-gated).

## ⛔ TRANSLATION — DEFERRED TO v2 (founder decision 2026-06-13, "wir lassen das so und gehen live")
Translation is **NOT launch-quality** and is HIDDEN from the v1 UI (no user may hit it). Three known defects,
all to fix in v2:
1. **Script does not span the full audio length — BIG NO-GO (founder).** The target-language script is
   shorter than the source, so the spoken part STOPS ~1 minute before the music ends → a long music-only
   (dead-speech) tail. Root: full_voice generates a script sized to the voice, not paced to FILL the source
   duration. v2 fix: generate/pace the translation script to span the whole track (or trim the music to end
   with the speech). Measured proxy today: `no_dead_air` caught a 19s trailing hole — the real gap is ~1 min.
2. **Strong American accent on the target language.** OmniVoice cross-lingual keeps the source phonetics
   (`num_step=80` reduced garbling but not the accent). v2 levers: drop the source-language `ref_text` from
   the clone prompt; or a SCALABLE self-hostable multilingual cloner. **EL is OUT — its per-clone slot cap
   does not scale** (100 simultaneous translations = impossible).
3. **Intelligibility unverified** — no automatic native-likeness/intelligibility scorer for cross-lingual.

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

## Engine-unification roadmap (not a bug)
- **Migrate library voices off ElevenLabs.** The instrumental flow still uses an EL voice id — the one
  tolerated exception (§3). Move to stored OmniVoice references so the engine is uniformly OmniVoice.
  *(instrumental-template.md)*

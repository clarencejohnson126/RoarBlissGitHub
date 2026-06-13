# Roar Bliss — Consolidated `TODO(gap)` list (the founder's roadmap)

Acceptance criteria from the use-case specs that have **no executable check yet** — they rely on the
founder's ear today. Each becomes a candidate new check + a permanent `eval/corpus.json` entry (the
calibration loop, Constitution §5). **None implemented here** (gate code is ear-calibrated + founder-gated).

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

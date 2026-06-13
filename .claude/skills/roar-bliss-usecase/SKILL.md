---
name: roar-bliss-usecase
description: >
  Use when working on ANY Roar Bliss audio-personalization use case — instrumental-template,
  cinematic-multivoice, speech-over-music, solo-monologue, or translation. Auto-equips the agent with the
  product Constitution + the matching use-case spec so it evaluates the INPUT against the Input Contract and
  enforces the OUTPUT against the named executable checks (eval/validators.py + eval/metrics.py +
  eval/corpus.json). Trigger on: personalizing an audio file, a tier (25/50/75/100), cloning a voice,
  translating a track, debugging the gate, or any change to predict.py / poc/orchestrator / eval.
---

# Roar Bliss — use-case enforcement skill

You are working on Roar Bliss audio personalization. The **written source of truth** is the spec book; the
**executable acceptance layer** is the gate. This skill points you at both — it does NOT duplicate them.

## Always load first
1. `specs/constitution.md` — the immutable product rules + engineering doctrine. **Meta-rule:** a numeric
   green is necessary, never sufficient; the founder's ear is the final calibrator.
2. The matching use-case spec in `specs/use-cases/`:
   - instrumental (upload has no voice, user picks a library voice) → `instrumental-template.md`
   - multi-voice cinematic clip, keep its orchestra → `cinematic-multivoice.md`
   - a speech with a music bed under it → `speech-over-music.md`
   - a dry single-speaker memo (no bed) → `solo-monologue.md`
   - re-spoken in another language → `translation.md`

## Then do exactly this
1. **Evaluate the input against §1 Input Contract.** Reject invalid sources BEFORE spending GPU. Hard rule
   (Constitution §6): the source must be REAL, separable audio — **never a previously-generated RoarBliss
   output** (glued voice+music = fake rollercoaster = bad test data, not a bug).
2. **Confirm the path & engine (§2).** Cloning ⇒ OmniVoice, always (§3). Library voice ⇒ instrumentals
   only. Translation ⇒ forced `full_voice`, 100 %, OmniVoice cross-lingual (never an engine swap).
3. **Enforce the Acceptance Criteria (§4)** by name against the gate:
   - `eval/validators.py` — `validate_plan` (pre, log-only) + `validate_output` (post).
   - `eval/metrics.py` — `score` (signal, source-relative).
   - `eval/run.py` folds the watchdog: HARD failures are
     `plan:{no_repetition, full_replacement, density_matches_tier}` and
     `out:{output_language, content_present, no_dead_air}`.
   - The corpus entry id in the spec is the end-to-end proof.
4. **If a criterion has no executable check**, it carries a `TODO(gap):` in the spec — treat it as
   "founder's ear only" and surface it; do NOT invent a check or relax a threshold (they are ear-calibrated).

## Hard boundaries
- Do NOT relax any gate threshold. Do NOT trigger a cog build or GPU corpus run (founder-gated, costs money).
- Validate inputs before believing a failure. A green gate without the founder's ear is not "done".
- New flaw the ear catches that the gate passed → new check + new permanent `corpus.json` entry. That loop
  is the product.

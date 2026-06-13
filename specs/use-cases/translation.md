# Use case: translation

**Corpus entry id:** `translation_icandothis_de_100` (`eval/corpus.json`).
**One-line:** The whole track re-spoken in a different language (e.g. German) — same voice, native
target-language pronunciation, **ZERO** source-language remnant.
**Status:** Core flow. `_de_100` locks German output with no English remnant on a real separable source.

## 1. Input Contract
- **Source = a real speech/clip** in some source language (Constitution §6: separable). The corpus entry
  uses the same "I CAN DO THIS" speech, target = German.
- Duration: free ≤45 s / paid ≤6 min.
- Required `predict.py` inputs:
  - `language` = a non-English target (e.g. `"German"`).
  - `tts_provider: omnivoice`, `clone_source_voices: true`.
  - `personalization` is effectively forced to 100 (see Path): translation is ALWAYS 100 %.
  - a `prompt` written natively in the target language.
- **Rejected:** a request to translate "partially" / a two-language mix — **forbidden** (Constitution §2.2,
  jarring). Translation is whole-track or nothing.

## 2. Path & Engine
- **Path:** **`full_voice`** — forced. `predict.py` (~L794) detects `target ≠ source` and sets
  `use_full_voice = True` so the ENTIRE track is re-voiced continuously and **no source-language line
  survives** (the `auto_synthesize`/density path once left ~9 % original = the English remnant).
- **Engine:** **OmniVoice cross-lingual** — the ONE engine, no ElevenLabs (Constitution §3). Native
  pronunciation is a **CONFIG matter, not an engine swap**: `num_step=80, guidance=3.0` for non-English in
  `tts.synthesize_omnivoice`, and if still accented, drop the source-language `ref_text` from the clone
  prompt. `TTS_LANGUAGE` is threaded down so German text isn't English-phonemized.

## 3. Rules
- **Translation = ALWAYS 100 %, never a two-language mix** (§2.2). Same cloned voice, native target accent.
- **Music never ducked/pumped** (§2.1) — the bed is kept; only the spoken layer changes language.
- **ZERO source-language remnant** — every line replaced (§2.3 / §1: 100 % = no original words).
- Output = full source length (§2.6).

## 4. Acceptance Criteria
| Criterion | Check | Where | Hard? |
|---|---|---|---|
| Output is in the TARGET language (no mishmash) | `output_language` | `validate_output` (whole transcript, >35 % long-sentence rule) → `run.py` | **HARD** |
| No source-language line survives | `full_replacement` | `validate_plan` (`source_texts`, triggered for target≠en) → `run.py` | **HARD** |
| Full density (≥88 %) | `density_matches_tier` | `validate_plan` → `run.py` | **HARD** |
| No repetition / filler | `no_repetition` | `validate_plan` → `run.py` | **HARD** |
| Output content present | `content_present` | `validate_output` | **HARD** |
| No dead air | `no_dead_air` / `no_dropouts` | `validate_output` + `metrics.score` | **HARD** |
| Output language (signal cross-check) | `language_match` | `metrics.score` (Whisper `output_language`) | soft (signal) |
| Music steady vs source | `music_stability` | `metrics.score` | soft backstop |
| No clipping | `no_clipping` | `metrics.score` | soft (signal) |
| Clone fidelity (timbre kept across languages) | `clone_fidelity` | `metrics.score` | soft (signal) |

**Corpus proof:** `translation_icandothis_de_100` — German output, zero English, on a valid separable
source (replaces the old glued-output entry, §6).

### Gaps
- `TODO(gap): American-accent on the target language` — no automatic check that German sounds German (not
  American-accented). Only the founder's ear (§ Constitution meta-rule). Proposed: an accent/native-likeness
  scorer, or an LLM-judge prompt extension grading pronunciation.
- `TODO(gap): intelligibility of target-language words` — `intelligibility`/`no_swallowed_line` use Whisper
  round-trip; reliability on cross-lingual clones is unverified. Only the founder's ear today.
- `TODO(gap): validate_plan full_replacement crash for target≠en` — `validators.py:143` references an
  undefined `want` in the `tier>=100 or want != "en"` guard. At tier 100 short-circuit avoids it, but a
  **partial-tier translation would `NameError`**. Translation is forced to 100 % so prod is safe, but this
  is a latent bug. Proposed: define `want` from `target_language` at the top of `validate_plan`. **Do not
  fix here (out of scope: gate code is ear-calibrated/founder-gated) — flag only.**

# Use case: instrumental-template

**Corpus entry id:** `instrumental_jon_100` (`eval/corpus.json`).
**One-line:** The user uploads an **instrumental** (no voice to clone), picks a **library voice**, and gives
a new script — the Suno-template flow. The bed IS the untouched original; new spoken lines ride over it.
**Status:** FOUNDER-APPROVED.

## 1. Input Contract
- **Source = a real instrumental** (music only, no spoken voice). Constitution §6: real, original audio.
  An instrumental has nothing to separate, so the upload is used **directly as the bed** — no demucs, no
  pyannote, no cloning.
- Duration: free ≤45 s / paid ≤6 min (Constitution §2.6/§2.7).
- Required `predict.py` inputs:
  - `clone_source_voices: false` — never diarize/clone the source (it has no voice to clone, and the user
    must never get a voice they didn't choose).
  - `extra_voice_ids` = at least one **library voice id** (e.g. the GoT-Jon EL id `TCuusGciH6HRSOGrYg31`).
    **Hard requirement:** `clone_source_voices=false` with empty `extra_voice_ids` is rejected with
    `RuntimeError("clone_source_voices=False requires at least one voice in extra_voice_ids")`
    (`predict.py` ~L808).
  - `personalization: 100` (template flow writes the whole script) and a `prompt`.
- **Rejected:** a source that actually contains speech (that is speech-over-music or solo-monologue, not an
  instrumental); empty `extra_voice_ids`.

## 2. Path & Engine
- **Path:** `full_voice` via `predict.py::_full_voice`, in **`bed_only`** mode
  (`use_full_voice and not clone_source_voices` → `vocals=None, accomp=upload`). The upload is the bed; the
  chosen voice(s) speak over it. No canvas rebuild, no `_detect_music_bed` separation step.
- **Engine:** **library voice = the ONLY engine exception, and only here** (Constitution §3). The library
  voice MAY remain an external EL voice id for now (this flow), because a permanent/shared voice consumes no
  per-user clone slot → no scale problem. It may migrate to a stored OmniVoice reference later; not urgent.
  This is the "side project", not the rule.

## 3. Rules
- **Music never ducked/pumped** (Constitution §2.1). Here it is structurally guaranteed: the bed is the
  untouched original instrumental, never separated → **it cannot wobble.**
- **100 % = a completely new script** (Constitution §1, §2.3): the whole spoken layer is generated; there
  was no original speech to keep.
- Snippets replace/sit over the bed, never inserted to "fill" silence in a way that fights the music
  (§2.4 spirit).
- Output = full source length (§2.6).

## 4. Acceptance Criteria
| Criterion | Check | Where | Hard? |
|---|---|---|---|
| Every slot carries a real line | `nonempty_lines` | `validators.validate_plan` | soft (plan log-only) |
| No degenerate repetition | `no_repetition` | `validators.validate_plan` → folded by `run.py` | **HARD** |
| Full new script at 100 % (n/a — no source text to keep) | `full_replacement` | `validate_plan` (only with `source_texts`; none here) | n/a |
| Output content present (not near-empty) | `content_present` | `validators.validate_output` | **HARD** |
| Output language correct (English) | `output_language` | `validators.validate_output` | **HARD** |
| No dead air | `no_dead_air` / `no_dropouts` | `validate_output` + `metrics.score` (`source_explained_holes`, longest-hole) | **HARD** |
| Loudness in window / vs source | `loudness_target` | `metrics.score` | soft (signal) |
| No clipping | `no_clipping` | `metrics.score` | soft (signal) |
| Music stays steady (trivially true — bed untouched) | `music_stability`, `music_level` | `metrics.score` (source-relative) | soft backstop |
| Not cut short | `not_cut_short` | `metrics.score` (`expected_ms`) | soft (signal) |

**Corpus proof:** `instrumental_jon_100` runs through `eval/run.py` against the real GoT instrumental + the
permanent Jon voice; green here means the template flow is safe to ship.

### Gaps
- `TODO(gap): library-voice identity` — no automatic check that the *chosen* library voice is actually the
  one heard (clone_fidelity needs a source ref the instrumental doesn't have). Only the founder's ear.
  Proposed: store a reference clip per library voice and run `metrics.clone_fidelity(output, library_ref)`.
- `TODO(gap): library voice on EL` — this flow still uses an ElevenLabs voice id, the one tolerated
  exception (§3). Proposed roadmap: migrate library voices to stored OmniVoice references so the engine is
  uniformly OmniVoice.

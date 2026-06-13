# Use case: cinematic-multivoice

**Corpus entry id:** `cinematic_multivoice_got_75` (`eval/corpus.json`).
**One-line:** A multi-voice cinematic source (e.g. a Targaryen soundtrack montage) — **keep its own
orchestra**, clone EACH distinct voice consistently, replace 75 % of the spoken timeline.
**Status:** FOUNDER-APPROVED — **the golden bar.** Treat any change that regresses this as a release blocker.

## 1. Input Contract
- **Source = a real cinematic clip** with music + multiple speakers, **separable** (Constitution §6).
- Duration: free ≤45 s / paid ≤6 min. A longer source may be cloned-from but rendered shorter via
  `output_seconds` (clone 5 characters from a 3-min montage, render 2 min).
- Required `predict.py` inputs:
  - `clone_source_voices: true` — clone the distinct speakers found in the upload.
  - `tts_provider: omnivoice`.
  - `personalization: 75` (the approved tier here; the path supports 25/50/75/100).
  - `min_voices` hint (e.g. 2) for dense multi-character sources so pyannote finds enough speakers.
- **Rejected:** a source too short to yield clonable speech per speaker (→ see solo-monologue gap: today
  this can crash with 0 candidates; it must become a graceful error).

## 2. Path & Engine
- **Path:** `auto_synthesize` (`poc/orchestrator/auto_synthesizer.py`) — the partial/canvas path.
  `_detect_music_bed` routes to the **music path** → `_rebuild_slot` (frame-EXACT splices, constant
  `_bleed_comp_db`, `_ramp_edge` seams). Kept regions stay **bit-identical** original mix (Constitution §4).
- **Engine:** **OmniVoice cloning** — the rule (Constitution §3). One locked clone prompt per speaker for
  voice consistency; reference cleaning HPF80 + LPF14k + loudnorm, **no `afftdn`** (§4).

## 3. Rules
- **Music never ducked/pumped; one constant level** (§2.1). The orchestra is the source's own; only
  replaced slots are reconstructed = accomp + constant bleed comp + clone.
- **Bit-identical kept regions; zero drift** (§4) — the music grid never shifts.
- **Tier % is a HARD budget** (§2.3): ~75 % of the spoken *time*. Iconic war-cries ("King in the North!")
  may repeat 2–3× as the anthem motif — this is legitimate, NOT degeneracy (§5 `no_repetition`).
- **Voice consistency across lines** — the fix for "too many different voices" (§4).

## 4. Acceptance Criteria
| Criterion | Check | Where | Hard? |
|---|---|---|---|
| Density ≈ requested 75 % | `density_matches_tier` | `validate_plan` → `run.py` | **HARD** |
| Anthem repeat OK, spam not | `no_repetition` | `validate_plan` → `run.py` | **HARD** |
| Output content present | `content_present` | `validate_output` | **HARD** |
| Output language (English) | `output_language` | `validate_output` | **HARD** |
| No dead air (real cut, longest-hole) | `no_dead_air` / `no_dropouts` | `validate_output` + `metrics.score` | **HARD** |
| Music steady vs source (isolated <200 Hz σ) | `music_stability` | `metrics.score` (source-relative) | soft backstop |
| Music not quieter than source | `music_level` | `metrics.score` | soft backstop |
| Loudness range ≤ source + margin | `loudness_range` | `metrics.score` | soft (signal) |
| No clipping | `no_clipping` | `metrics.score` | soft (signal) |
| Worst line intelligible | `no_swallowed_line` | `metrics.score` (Whisper, in cog) | soft (signal) |
| Speaking rate two-sided | `speaking_rate` | `metrics.score` | soft (signal) |
| Clone fidelity per voice | `clone_fidelity` | `metrics.score` (pyannote, in cog) | soft (signal) |
| Tier fidelity (<100) | `tier_fidelity` | `metrics.score` (`personalized_fraction`) | soft (signal) |

Regression invariants for the canvas rebuild are locked by `eval/test_canvas_rebuild.py::test_music`
(zero drift, kept bit-identical, no slot wobble) and `test_music_bed_detection` (faint bed = music).

**Corpus proof:** `cinematic_multivoice_got_75`. This is the golden bar — green here is the bar all other
changes must not break.

### Gaps
- `TODO(gap): voice consistency` — `metrics.voice_consistency_min` is defined in `Gates` but no `score`
  check wires per-line pairwise similarity. Proposed: add `voice_consistency` to `score` using pyannote
  embeddings across generated lines.
- `TODO(gap): beat-matched iconic lines` — no automatic check that a transformed war-cry lands on the same
  thunder/beat (§2.3). Only the founder's ear.

# Use case: solo-monologue

**Corpus entry id:** *(none yet — see Gaps).*
**One-line:** A single speaker, **dry** (no music bed) — a voice memo or a clip whose only audio is one
person talking. Clone the speaker, replace the chosen share, **close the gaps** (no music to stay in sync
with).
**Status:** NO clean corpus entry yet. The GoT clip tried earlier was too short to clone (0 candidates →
crash). This spec defines the contract and flags the gaps.

## 1. Input Contract
- **Source = a real dry monologue** (Constitution §6): one speaker, **genuinely silent accomp**
  (< -40 dB — a true dry voice memo). A faint bed (~-23 dB) is NOT dry → that is speech-over-music.
- The speech must be **long/clean enough to clone** (enough speaker audio for a reference). Too short →
  must be a **graceful error**, not a crash.
- Duration: free ≤45 s / paid ≤6 min.
- Required `predict.py` inputs: `clone_source_voices: true`, `tts_provider: omnivoice`, a tier + `prompt`.

## 2. Path & Engine
- **Path:** `auto_synthesize` → `_detect_music_bed` returns **no bed** → **no-music path**
  `_assemble_no_music` (concatenative gap-closing). The timeline **intentionally compresses** — correct
  only when there is no music to stay locked to (Constitution §4). Kept original chunks stay frame-exact.
- **Engine:** **OmniVoice cloning** (Constitution §3).

## 3. Rules
- **No dead air** (§5): the no-music assembly must close the long silence a short clone leaves in a long
  slot (the 9.8 s dead-air trap). It must NOT leave any hole ≥600 ms.
- **Snippets replace speech, never fill pauses** (§2.4).
- Shorter output is EXPECTED here (gap-closing compresses) — `not_cut_short` uses the relaxed `0.4` factor
  when `has_music_bed=False`; only a near-total collapse (most clones failed) is flagged (§5 / `metrics.py`).
- No music metrics apply (there is no bed to measure) — the dead-air guard still does.

## 4. Acceptance Criteria
| Criterion | Check | Where | Hard? |
|---|---|---|---|
| Gaps closed / no dead air | `no_dead_air` / `no_dropouts` | `validate_output` + `metrics.score` (`source_explained_holes`, longest-hole) | **HARD** |
| Density ≈ requested tier | `density_matches_tier` | `validate_plan` → `run.py` | **HARD** |
| No repetition / filler | `no_repetition` | `validate_plan` → `run.py` | **HARD** |
| Output content present | `content_present` | `validate_output` | **HARD** |
| Output language | `output_language` | `validate_output` | **HARD** |
| Retained chunk bit-identical | (regression) | `eval/test_canvas_rebuild.py::test_no_music` | locked by test |
| Not collapsed (relaxed) | `not_cut_short` (factor 0.4) | `metrics.score` (`has_music_bed=False`) | soft (signal) |
| Worst line intelligible | `no_swallowed_line` | `metrics.score` | soft (signal) |
| Clone fidelity | `clone_fidelity` | `metrics.score` | soft (signal) |

The no-music behavior is locked by `eval/test_canvas_rebuild.py::test_no_music` (gaps closed, no hole
≥600 ms, retained chunk verbatim) and `test_dropout_calibration` (real dead air fails, mirrored-quiet
passes) — these run without GPU.

### Gaps
- `TODO(gap): no clean corpus entry` — find a REAL solo-speech source with clonable speech and add a
  `solo_monologue_*` entry to `eval/corpus.json`. Until then this case has no end-to-end corpus proof.
- `TODO(gap): no-clonable-speech must not crash` — a too-short source yields 0 clone candidates and
  crashes. Make it a **graceful error** (refund + clear message), per §2.7 charge-on-delivery. Proposed:
  detect 0 candidates in the planner/clone stage and raise a typed, user-facing error.

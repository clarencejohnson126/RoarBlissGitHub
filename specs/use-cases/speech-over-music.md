# Use case: speech-over-music

**Corpus entry ids:** `speech_over_music_icandothis_50` and `speech_over_music_icandothis_100`
(`eval/corpus.json`).
**One-line:** A real motivational speech with a music bed under it — clone the speaker, replace the chosen
share of the spoken timeline, keep the bed continuous. `_100` tests TRUE 100 % (zero original words left).
**Status:** Core flow. The two entries lock the partial tier (50 %) and the full-replacement tier (100 %).

## 1. Input Contract
- **Source = a real speech with a music bed** (Constitution §6: separable). The bed may be **faint** — a
  ~-23 dB accomp is STILL music and must stay on the music path (§4; the -22 dB threshold bug).
- Duration: free ≤45 s / paid ≤6 min.
- Required `predict.py` inputs:
  - `clone_source_voices: true`, `tts_provider: omnivoice`.
  - `personalization: 50` (partial) or `100` (full new script).
  - a `prompt` weaving in the listener.
- **Rejected:** a glued RoarBliss output (its voice+music can't be un-mixed → fake rollercoaster, §6);
  a genuinely dry voice memo belongs to **solo-monologue** (no bed → no-music path).

## 2. Path & Engine
- **Path:** `auto_synthesize` canvas path. `_detect_music_bed` → **music path** → `_rebuild_slot`
  (frame-exact, constant `_bleed_comp_db`, `_ramp_edge`). Kept regions bit-identical (§4).
  - At **100 %**, the breath between lines is capped (`min(breath_ms, 250)` in `predict.py`) so a thin bed
    isn't perforated (§4); 100 % uses the in-place swap mechanic, not a bed rebuild.
- **Engine:** **OmniVoice cloning** (Constitution §3). Locked clone prompt, clean reference (no `afftdn`).

## 3. Rules
- **Music never ducked/pumped; one constant level** (§2.1).
- **50 %** = ~half the spoken *time* replaced; **100 %** = ZERO original words remain (§1, §2.3).
- **Personalize in the first ~10 s; no >~20 s untouched gap** (§2.5).
- **Snippets replace original speech, never fill pauses** (§2.4).
- Output = full source length (§2.6).

## 4. Acceptance Criteria
| Criterion | Check | Where | Hard? | Applies to |
|---|---|---|---|---|
| Density ≈ requested tier | `density_matches_tier` | `validate_plan` → `run.py` | **HARD** | both (50 two-sided, 100 ≥88 %) |
| No repetition / filler | `no_repetition` | `validate_plan` → `run.py` | **HARD** | both |
| No original line survives 100 % | `full_replacement` | `validate_plan` (with `source_texts`) → `run.py` | **HARD** | `_100` |
| Output content present | `content_present` | `validate_output` | **HARD** | both |
| Output language (English) | `output_language` | `validate_output` | **HARD** | both |
| No dead air | `no_dead_air` / `no_dropouts` | `validate_output` + `metrics.score` | **HARD** | both |
| Music steady vs source | `music_stability` | `metrics.score` | soft backstop | both |
| Music not quieter than source | `music_level` | `metrics.score` | soft backstop | both |
| No clipping | `no_clipping` | `metrics.score` | soft (signal) | both |
| Worst line intelligible | `no_swallowed_line` | `metrics.score` | soft (signal) | both |
| Speaking rate two-sided | `speaking_rate` | `metrics.score` | soft (signal) | both |
| Clone fidelity | `clone_fidelity` | `metrics.score` | soft (signal) | both |
| IP boundary at 100 % | `ip_boundary` | `metrics.score` (LLM judge, `ip_overlap_max`) | soft (judge) | `_100` |
| Tier fidelity (<100) | `tier_fidelity` | `metrics.score` | soft (signal) | `_50` |

**Corpus proof:** `speech_over_music_icandothis_50` (partial tier honored, bed continuous) and
`speech_over_music_icandothis_100` (zero original remnant on a valid separable source — replaces the old
glued-output entry, §6).

### Gaps
- `TODO(gap): first-10s personalization & >20s-gap rule (§2.5)` — no automatic check that the listener is
  woven in early and never absent too long. Only the founder's ear. Proposed: a plan-level timeline check
  that the first replaced slot starts ≤10 s and no untouched run exceeds ~20 s.
- `TODO(gap): faint-bed wobble` — `music_continuity` is unreliable on a faint bed (kept soft by design,
  §5). The real fix is routing (`_detect_music_bed`), locked by `test_music_bed_detection`, not the metric.

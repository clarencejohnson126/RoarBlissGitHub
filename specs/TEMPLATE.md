# Use-Case Spec TEMPLATE

> Copy this shape for every file in `specs/use-cases/`. A use-case spec is a **contract**: it names a valid
> input, the code path that handles it, the invariants that must hold, and — crucially — the **executable
> checks** that prove it. Keep it DRY: cite the Constitution by section, don't re-explain it. Every
> acceptance criterion must point to a real `eval/validators.py` check, `eval/metrics.py` gate, and/or the
> `eval/corpus.json` entry id — OR carry a `TODO(gap):` line if no executable check exists yet.

---

# Use case: `<name>`

**Corpus entry id(s):** `<id>` — link to `eval/corpus.json`.
**One-line:** what this case is, in the founder's words.
**Status:** FOUNDER-APPROVED golden bar / candidate / no clean corpus entry yet.

## 1. Input Contract
What is a **valid source** for this case and what is **rejected**.
- Format / channels / sample rate expectations.
- Duration caps (free 45 s, paid ≤6 min — Constitution §2.6/§2.7).
- **The REAL-audio rule (Constitution §6):** voice and music must be separable; never a glued RoarBliss
  output.
- The required/forbidden `predict.py` inputs for this case (e.g. `clone_source_voices`, `tts_provider`,
  `extra_voice_ids`, `language`, `personalization`).
- Inputs that are invalid → what should happen (reject / graceful error, not a crash).

## 2. Path & Engine
Which **code path** handles it and which **TTS engine** — and WHY (cite the Constitution).
- Path: `full_voice` (`predict.py::_full_voice`) vs `auto_synthesize` canvas-rebuild
  (`poc/orchestrator/auto_synthesizer.py`) vs `_assemble_no_music`.
- Music routing: `_detect_music_bed` → music path (`_rebuild_slot`) vs no-music path.
- Engine: OmniVoice (clone, the rule) vs library voice (instrumental-only exception). Cite §3.

## 3. Rules
The invariants that MUST hold for this case, drawn from the Constitution. Cite section numbers; do not
re-derive. Call out anything case-specific (e.g. translation = 100 % only, instrumental bed cannot wobble).

## 4. Acceptance Criteria
The **executable** checks that enforce §1–§3. For each criterion, name:
- the `eval/validators.py` check (`validate_plan` / `validate_output` key, e.g. `full_replacement`),
- the `eval/metrics.py` gate (`score` check key, e.g. `music_stability`, or a `Gates` field),
- the `eval/corpus.json` entry id that exercises it,
- and whether `eval/run.py` treats it as HARD (critical) or soft.

For any criterion with **no executable check yet**, write:
`TODO(gap): <criterion> — only the founder's ear / no automatic check. Proposed: <what would check it>.`
Do NOT implement it here; flag it so it becomes roadmap.

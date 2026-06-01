# Resume Prompt — Roar Bliss / Steven x Theon Session

If this Claude Code context dies, paste the prompt below into a fresh session in `/Users/clarence/Desktop/Roar Bliss App`.

---

## Copy-paste prompt for the next Claude

> Read my memory files first: `MEMORY.md`, then in priority order `project_active_steven_session.md`, `project_scale_vision.md`, `project_seamless_quality_bar.md`, the `feedback_*` files. We've iterated v1 through v8 of the Steven x Theon personalization pipeline. v6 is the canonical architecture (the user called it "sellable"). v7/v8 are content-only variations on v6's tested pipeline.
>
> Current state (last update 2026-05-28):
> - **v6 = sellable baseline** at `poc/output_steven_v6/steven_theon_personalized_v6.mp3` (22/25 OK, scrambled-audio bug eliminated by retry+sanity wrapper)
> - **v7** added storyline arc + name distribution (4 "Steven" mentions instead of 8) + emotion variety + clone-into-original continuity
> - **v8** densified to 40 slots / ~49% personalization (user asked for 60% to feel out the right default density)
> - **Pending:** user listens to v8 and tells us if 49% is right / too much / push to 60%
>
> Resume by:
> 1. Verify Qwen3 server is up with a REAL clone call (not just HTTP probe — see `project_output_regression.md` for why). Restart command if down: `cd /Users/clarence/Desktop/qwen3-tts-mlx && ./.venv/bin/python server.py &`.
> 2. Ask user what they thought of v8 OR continue from where this session left off based on the most recent transcript message.
> 3. To make v9: copy `poc/poc_steven_theon_v8.py` to `v9`, change OUT_DIR, point CACHE_DIR at v8's tts_cache to reuse unchanged slots, edit the OVERRIDES list, run.
>
> Operating principles (all encoded in memories — read them):
> - 5 seamless conditions must hold (voice clone clean, snippet duration matches slot, melody/tone preserved, emotion+tempo match, style/energy unchanged)
> - Never insert clone in pauses — always replace original speech
> - Loudness-match clone to original slot's own dBFS (not surrounding window)
> - Speed locked at 1.0; never time-stretch >1.1x; text length is the only fitting lever
> - Wrap every TTS call in retry+sanity (3x slot duration cap)
> - Name said max once per 30s; alternate with pronouns
> - First 10s must contain personalization (retention/bond)
> - Prefer slots followed by same-speaker original continuation (v6 Jon Snow magic)
> - Cut-to-fit if clone shorter than slot, within 3s silence cap (or 5s with SFX cover)
> - The hardcoded `poc/poc_steven_theon_v*.py` slot lists are PROTOTYPES — the real product (per Pillar 2 of Five Pillars doctrine in `~/.claude/CLAUDE.md`) is the LLM-driven auto-orchestrator that produces personalizations for any uploaded speaker + any user context. We're at the rule-discovery stage. Read `project_scale_vision.md` for the production architecture.

---

## Quick state cheatsheet (for the human)

- **Latest pipeline:** `poc/poc_steven_theon_v8.py` (40 slots, ~49% personalization)
- **Canon pipeline:** `poc/poc_steven_theon_v6.py` (architectural reference)
- **Latest output:** `poc/output_steven_v8/steven_theon_personalized_v8.mp3`
- **All outputs preserved:** `poc/output_steven_v{1..8}/`
- **Source vocals (Demucs):** `poc/output/vocals.wav` (341s)
- **Source music (Demucs):** `poc/output/accompaniment.wav` (341s)
- **Source MP3:** `Ascend The Starless Sky No Choir.mp3` (the Theon Greyjoy Tribute backing track)
- **Qwen3 server:** `/Users/clarence/Desktop/qwen3-tts-mlx/server.py`, port 7860
- **Start:** `cd /Users/clarence/Desktop/qwen3-tts-mlx && ./.venv/bin/python server.py &`
- **Kill if hung:** `lsof -ti :7860 | xargs kill -9`
- **Verify Qwen3 healthy (REAL test):** send a clone call with valid ref + ref_text and check for audio bytes back (HTTP 307 on `/` is meaningless — model worker can be dead while FastAPI stays up)

## Iteration history at a glance

| Version | Change | Result |
|---|---|---|
| v1 | initial pipeline, 28 slots | all synth failed — Qwen3 worker subprocess was dead |
| v2 | emotion refs + per-emotion speed | 5/28 OK, all clones flat-timed |
| v3 | speed-calibration to fit | speed param is unstable >1.4, two slots produced 50x+ garbage |
| v4 | 180s cap, 25 slots, natural pace 1.0, cut-to-fit | 19/25 OK |
| v5 | volume fix (slot dBFS, not surround) + tighter text | 21/25 BUT slot 11 corrupted by Qwen3 90s garbage |
| v6 | retry+sanity wrapper (3x slot cap) | 22/25, **sellable baseline** |
| v7 | storyline beats + name distribution (4 mentions) + emotion variety + continuity | 21/25 |
| v8 | density push 40 slots / ~49% personalization | 30/40, awaiting user feedback |

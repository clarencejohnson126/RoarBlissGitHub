# Sprint 2 — Per-Speaker Emotion-Tagged Reference Library Auto-Builder

**Date completed:** 2026-05-31
**Goal:** Replace the hand-crafted `SPEAKERS = {...}` dict in `poc/poc_steven_theon_v*.py` with a function that automatically builds a per-speaker emotion-tagged reference library for ANY uploaded audio.

## Outcome

Working `reference_library_builder.py` produces structured per-speaker reference libraries from raw audio. Reuses Sprint 1's Whisper transcripts + pyannote diarization (cached). Tags emotions via Ollama qwen2.5:7b across a fixed 7-emotion palette.

## Architecture

```
audio.mp3
  │
  ├─→ feature_extractor.py    (Sprint 1, cached)
  │     ↓
  │   Whisper segments + pyannote turns
  │     ↓
  ├─→ _join_whisper_with_diarization
  │     ↓
  │   for each Whisper segment, find dominant speaker
  │   filter: ≥1.5s duration, ≥80% one-speaker dominance
  │     ↓
  ├─→ per speaker:
  │     ├─→ _guess_speaker_name (LLM, optional)
  │     ├─→ _llm_tag_emotions (LLM batch tag)
  │     └─→ _select_best_per_emotion (longest + cleanest clip per emotion)
  │     ↓
  └─→ reference library dict {speakers: {SPEAKER_NN: {name_guess, references: [{emotion, start, end, text}, ...]}}}
```

## Emotion palette (7 emotions)

- `calm-contemplative` — slow, reflective, inner
- `strong-defiant` — forceful, confident
- `broken-whispered` — vulnerable, intimate
- `menacing-intimidating` — threatening, cold
- `wise-teaching` — instructional, parental
- `excited-intense` — high-energy, ramping
- `neutral-narrator` — baseline, descriptive

## Test results

### Theon tribute (Ascend The Starless Sky, 341s, Type C cinematic)
- Pyannote detected 6 speakers
- 3 retained after quality filter (others had <2 clean segments)
- SPEAKER_00 (name guess: Theon Greyjoy): 47s, 21 segments, 6 emotion refs
- SPEAKER_02 (unknown): 14s, 5 segments, 5 emotion refs
- SPEAKER_04 (name guess: Theon Greyjoy, actually Ramsay): 19s, 8 segments, 4 emotion refs

### Jocko "GOOD" speech (Type A solo monologue)
- 1 speaker detected
- 2 references built (limited by music interference reducing clean-segment count)
- Emotions: strong-defiant, neutral-narrator

## Known limitations

1. **Speaker name guessing is unreliable** when audio has multiple characters with similar voices — SPEAKER_04 (Ramsay's torture-scene voice) was misidentified as Theon. Name is a nice-to-have; the orchestrator uses abstract speaker IDs.
2. **Brief speakers get filtered out** (less than 2 clean segments). For Type C tributes with many character cameos, only main characters get references. For Type A/D/E (1-2 speakers) this is no problem.
3. **Whisper timestamps are coarser on raw MP3 with loud music** (1-second granularity vs sub-second). Real-time precision isn't needed for reference selection but matters for slot picking — Sprint 3 should consider Demucs pre-separation.
4. **Emotion tags are LLM judgment** — not 100% accurate but reasonable. Slot picker (Sprint 3) can score multiple candidate refs against a target emotion and pick the closest.

## Files added

| File | Purpose |
|---|---|
| `reference_library_builder.py` | Main function `build_reference_library(audio_path)` |
| `cache/*reflib.json` | Per-audio cached reference libraries |

## How to use

```python
from reference_library_builder import build_reference_library

lib = build_reference_library("/path/to/audio.mp3")
# lib["speakers"] = {"SPEAKER_00": {"name_guess": "...", "references": [...]}, ...}

# Pick reference by speaker + emotion (Sprint 3 will do this automatically)
theon_refs = lib["speakers"]["SPEAKER_00"]["references"]
defiant_ref = next(r for r in theon_refs if r["emotion"] == "strong-defiant")
# defiant_ref has start, end, text → feed to Qwen3-TTS as cloning reference
```

## What this proves

- We can replace the hand-crafted `SPEAKERS = {...}` dict for ANY uploaded audio
- The orchestrator no longer needs human curation of references — it bootstraps from diarization + LLM tagging
- Cache locality is good: re-running is instant (Whisper + pyannote + reflib all cached per-audio)
- Network effect: once an audio is processed, its library persists. If a SECOND user uploads the same Theon tribute, no recomputation needed (audio fingerprint match).

## What Sprint 3 should fix / build

1. **LLM-driven slot picker + override-text generator** (the main Sprint 3 goal): given an audio + its reference library + user context, the LLM proposes the slot list with personalized text per slot. This replaces the hardcoded `OVERRIDES = [...]` in `poc/poc_steven_theon_v*.py`.
2. **Speaker-to-slot mapping**: when the slot picker decides "personalize this 22s moment," it needs to know which speaker is talking at 22s (use pyannote turns to look up).
3. **Optional**: improve speaker name guessing with multi-pass LLM (first pass gathers context across all speakers, second pass assigns names with cross-speaker disambiguation).
4. **Optional**: pre-Demucs-separate on upload so Whisper produces sub-second timestamps. This costs ~3 min per audio but gives much better slot precision.

## Resume / re-run instructions

```bash
# Prerequisites (Sprint 1)
ollama serve &
export HF_TOKEN="hf_..."  # for pyannote

# Build reflib for any audio
cd "/Users/clarence/Desktop/Roar Bliss App/poc/orchestrator"
source ../venv/bin/activate
python reference_library_builder.py "/path/to/audio.mp3"
```

## Costs (this Sprint)

Dev time: ~1 hour (algorithm was clear after Sprint 1 plumbing).
Runtime cost per audio (cold cache): ~$0 (all local — Whisper, pyannote, Ollama).
First-time processing per audio: ~2 min (Whisper + pyannote + 2-3 LLM batch calls).
Warm cache: instant.

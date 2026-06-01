#!/usr/bin/env python3
"""
Reference Library Builder — Sprint 2
=====================================
For any audio, automatically build a per-speaker emotion-tagged reference
library. Replaces the hand-crafted SPEAKERS = {...} dict in
poc/poc_steven_theon_v*.py.

Pipeline:
  1. Use cached Whisper transcript + pyannote diarization (from Sprint 1)
  2. Join: for each Whisper segment, find its dominant pyannote speaker
  3. Quality-filter: segments must be >= 1.5s with >= 80% one-speaker dominance
  4. Per speaker, batch-LLM-tag each segment with an emotion from EMOTION_PALETTE
  5. For each (speaker, emotion), pick the best segment (longest clean clip)
  6. Output a library dict that the orchestrator can feed into Qwen3-TTS

Output schema:
  {
    "audio_path": str,
    "total_speakers_detected": int,
    "speakers": {
      "SPEAKER_00": {
        "total_speech_s": float,
        "segment_count": int,
        "name_guess": str,         # LLM's guess (optional, may be "unknown")
        "references": [
          {"emotion": "...", "start": float, "end": float, "text": str,
           "duration_s": float, "quality_score": float}
        ]
      },
      ...
    }
  }
"""

import os, sys, json, hashlib, warnings
from collections import defaultdict
from pathlib import Path
warnings.filterwarnings("ignore")

# Reuse Sprint 1 plumbing
sys.path.insert(0, str(Path(__file__).parent))
from feature_extractor import extract_features, _cache_path
from diarization import diarize

CACHE_DIR = Path(__file__).parent / "cache"

# The canonical emotion palette. ~7 distinct emotions cover the seamless range
# from intimate-whispered to forceful-defiant. Names map to TTS reference selection.
EMOTION_PALETTE = [
    "calm-contemplative",   # slow, reflective, inner
    "strong-defiant",       # forceful, confident, claim
    "broken-whispered",     # vulnerable, intimate, broken
    "menacing-intimidating",# threatening, cold, mocking
    "wise-teaching",        # instructional, parental, patient
    "excited-intense",      # high-energy, ramping, climactic
    "neutral-narrator",     # baseline, descriptive
]

# Quality thresholds
MIN_SEGMENT_DURATION_S = 1.5    # need ≥ 1.5s of audio for a usable reference
MAX_REFS_PER_EMOTION = 3        # keep top-3 clips per (speaker, emotion) so the synthesizer can concatenate for longer reference audio (better voice clone)
MIN_SPEAKER_DOMINANCE = 0.80    # segment must be ≥ 80% one speaker

def _join_whisper_with_diarization(whisper_segments: list, diar_turns: list) -> list:
    """For each Whisper segment, find the speaker who said the most of it.
    Returns enriched segments with speaker + dominance fields, filtered for quality."""
    enriched = []
    for seg in whisper_segments:
        s_start, s_end = seg["start"], seg["end"]
        duration = s_end - s_start
        if duration < MIN_SEGMENT_DURATION_S:
            continue

        # Sum overlap per speaker
        speaker_overlap = defaultdict(float)
        for turn in diar_turns:
            o_start = max(s_start, turn["start"])
            o_end   = min(s_end,   turn["end"])
            if o_end > o_start:
                speaker_overlap[turn["speaker"]] += (o_end - o_start)

        if not speaker_overlap:
            continue
        dominant = max(speaker_overlap, key=speaker_overlap.get)
        dominance = speaker_overlap[dominant] / duration
        if dominance < MIN_SPEAKER_DOMINANCE:
            continue  # too mixed, skip

        enriched.append({
            "speaker": dominant,
            "start": round(s_start, 2),
            "end": round(s_end, 2),
            "duration_s": round(duration, 2),
            "text": seg["text"].strip(),
            "dominance": round(dominance, 3),
        })
    return enriched

def _llm_tag_emotions(speaker_id: str, segments: list, name_guess: str = None) -> list:
    """Send all of one speaker's segments to LLM, get back emotion tags.
    Returns list of emotion strings, parallel to input segments."""
    import ollama
    palette_list = "\n".join(f"  - {e}" for e in EMOTION_PALETTE)

    seg_lines = []
    for i, s in enumerate(segments):
        seg_lines.append(f'{i}. ({s["duration_s"]}s) "{s["text"]}"')
    segs_text = "\n".join(seg_lines)

    speaker_context = f" (speaker may be: {name_guess})" if name_guess else ""
    user_msg = f"""You are tagging emotions of speech segments from one consistent speaker{speaker_context}.

Tag each segment below with EXACTLY ONE emotion from this palette:
{palette_list}

Segments:
{segs_text}

Use audio cues from the text style:
- short emphatic statements / direct address → strong-defiant
- whispered / hesitant / "i" "my name" identity claims → broken-whispered
- threatening / mocking / "you will" / "if you think" → menacing-intimidating
- explanatory / patient / "you must understand" → wise-teaching
- exclamations / "FIGHT!" / rapid rhythm → excited-intense
- slow / reflective / "I always wondered" / questions → calm-contemplative
- descriptive narration without strong emotion → neutral-narrator

Return JSON array of objects matching the input segment indices:
[{{"i": 0, "emotion": "..."}}, {{"i": 1, "emotion": "..."}}, ...]

No prose outside the JSON array."""

    response = ollama.chat(
        model='qwen2.5:7b',
        messages=[{'role': 'user', 'content': user_msg}],
        options={'temperature': 0.1, 'num_predict': 1500},
    )
    raw = response['message']['content']

    import re
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    if not m:
        # fallback: tag all as neutral-narrator
        return ["neutral-narrator"] * len(segments)
    try:
        parsed = json.loads(m.group(0))
        # Build emotion list parallel to input
        idx_to_emotion = {item["i"]: item["emotion"] for item in parsed if "i" in item and "emotion" in item}
        result = []
        for i in range(len(segments)):
            emo = idx_to_emotion.get(i, "neutral-narrator")
            if emo not in EMOTION_PALETTE:
                emo = "neutral-narrator"
            result.append(emo)
        return result
    except Exception:
        return ["neutral-narrator"] * len(segments)

def _guess_speaker_name(segments: list) -> str:
    """Try to guess the speaker's name from their transcript content.
    Returns short label like 'Theon', 'narrator', or 'unknown'."""
    import ollama
    sample = "\n".join(f'- "{s["text"]}"' for s in segments[:8])
    user_msg = f"""Here are 8 transcript segments spoken by one consistent speaker:

{sample}

Who is this speaker? If they refer to themselves by name OR if the segments are obviously dialogue from a well-known fictional/real person, name them. If unclear, say "unknown".

Output JSON: {{"name": "..."}}. Examples: {{"name": "Theon Greyjoy"}}, {{"name": "Tony Robbins"}}, {{"name": "narrator"}}, {{"name": "unknown"}}.
No prose outside the JSON."""

    response = ollama.chat(
        model='qwen2.5:7b',
        messages=[{'role': 'user', 'content': user_msg}],
        options={'temperature': 0.1, 'num_predict': 60},
    )
    raw = response['message']['content']
    import re
    m = re.search(r'\{[^{}]*"name"[^{}]*\}', raw, re.DOTALL)
    if not m:
        return "unknown"
    try:
        return json.loads(m.group(0)).get("name", "unknown")
    except Exception:
        return "unknown"

def _select_best_per_emotion(segments: list, emotion_tags: list) -> list:
    """For each emotion, pick the TOP-N best segments (so synthesizer can concatenate).
    Returns one entry per emotion; each has a `clips` list with up to MAX_REFS_PER_EMOTION segments."""
    by_emotion = defaultdict(list)
    for seg, emo in zip(segments, emotion_tags):
        seg_with_emotion = {**seg, "emotion": emo}
        by_emotion[emo].append(seg_with_emotion)

    import math
    refs = []
    for emotion, candidates in by_emotion.items():
        scored = sorted(candidates,
                        key=lambda s: s["dominance"] * math.log(s["duration_s"] + 1),
                        reverse=True)
        top = scored[:MAX_REFS_PER_EMOTION]
        clips = [{"start": s["start"], "end": s["end"], "text": s["text"], "duration_s": s["duration_s"]} for s in top]
        # Best single clip stays as the primary (back-compat with auto_synthesizer)
        best = top[0]
        refs.append({
            "emotion": emotion,
            "start": best["start"],
            "end": best["end"],
            "text": best["text"],
            "duration_s": best["duration_s"],
            "quality_score": round(best["dominance"] * math.log(best["duration_s"] + 1), 3),
            "clips": clips,  # NEW: list of top-3 for concatenation
            "total_clip_duration_s": round(sum(c["duration_s"] for c in clips), 2),
        })
    refs.sort(key=lambda r: EMOTION_PALETTE.index(r["emotion"]) if r["emotion"] in EMOTION_PALETTE else 999)
    return refs

def build_reference_library(audio_path: str, guess_names: bool = True, verbose: bool = True) -> dict:
    cache_file = CACHE_DIR / f"{Path(audio_path).stem[:40].replace(' ', '_')}_{hashlib.md5(audio_path.encode()).hexdigest()[:12]}.reflib.json"
    if cache_file.exists():
        if verbose:
            print(f"  reflib cache hit: {Path(audio_path).name}")
        return json.loads(cache_file.read_text())

    if verbose:
        print(f"  Building reference library for: {Path(audio_path).name}")

    # Load Whisper transcript (cached from Sprint 1)
    whisper_cache = _cache_path(audio_path, "whisper.json")
    if not whisper_cache.exists():
        # First-time audio — extract features to populate cache
        if verbose:
            print("    no whisper cache; extracting features first...")
        extract_features(audio_path, verbose=False)
    transcript = json.loads(whisper_cache.read_text())
    whisper_segments = transcript["segments"]

    # Load diarization (cached from Sprint 1)
    diar = diarize(audio_path, verbose=verbose)
    if verbose:
        print(f"    {diar['speaker_count']} speakers detected, {diar['turn_count']} turns, {len(whisper_segments)} whisper segments")

    # Join Whisper segments with speakers
    enriched = _join_whisper_with_diarization(whisper_segments, diar["turns"])
    if verbose:
        print(f"    {len(enriched)} segments passed quality filter (≥{MIN_SEGMENT_DURATION_S}s, ≥{MIN_SPEAKER_DOMINANCE} dominance)")

    # Group by speaker
    by_speaker = defaultdict(list)
    for e in enriched:
        by_speaker[e["speaker"]].append(e)

    # Build library
    library = {
        "audio_path": audio_path,
        "total_speakers_detected": diar["speaker_count"],
        "speakers": {},
    }
    for speaker_id in sorted(by_speaker.keys()):
        segments = by_speaker[speaker_id]
        if len(segments) < 2:
            if verbose:
                print(f"    skipping {speaker_id} (only {len(segments)} clean segment)")
            continue

        total_s = round(sum(s["duration_s"] for s in segments), 2)
        if verbose:
            print(f"    {speaker_id}: {len(segments)} segments, {total_s}s total speech")

        name_guess = _guess_speaker_name(segments) if guess_names else "unknown"
        if verbose:
            print(f"      name guess: {name_guess}")

        emotion_tags = _llm_tag_emotions(speaker_id, segments, name_guess if name_guess != "unknown" else None)
        refs = _select_best_per_emotion(segments, emotion_tags)
        if verbose:
            print(f"      tagged emotions: {sorted(set(emotion_tags))}")
            print(f"      → {len(refs)} reference clips after best-per-emotion selection")

        library["speakers"][speaker_id] = {
            "name_guess": name_guess,
            "total_speech_s": total_s,
            "segment_count": len(segments),
            "references": refs,
        }

    cache_file.write_text(json.dumps(library, indent=2))
    if verbose:
        print(f"  saved: {cache_file.name}")
    return library

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: reference_library_builder.py <audio_path>")
        sys.exit(1)
    lib = build_reference_library(sys.argv[1])
    print()
    print(json.dumps(lib, indent=2))

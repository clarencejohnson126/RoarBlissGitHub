#!/usr/bin/env python3
"""
Speaker diarization using pyannote.audio with HuggingFace token.
Drop-in replacement for the pitch-based speaker_estimate in feature_extractor.py.

Cached per-audio so it only runs once per file.
"""

import os
import json
import hashlib
import tempfile
import subprocess
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True, parents=True)

_pipeline = None

def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        token = os.environ.get("HF_TOKEN")
        if not token:
            raise RuntimeError(
                "HF_TOKEN env var not set. Add `export HF_TOKEN=hf_...` to ~/.zshrc, "
                "then `source ~/.zshrc`. Also accept model terms at "
                "https://hf.co/pyannote/speaker-diarization-3.1 and "
                "https://hf.co/pyannote/segmentation-3.0"
            )
        print("  loading pyannote diarization pipeline (one-time, ~30s)...")
        from pyannote.audio import Pipeline
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=token,
        )
    return _pipeline

def _cache_path(audio_path: str) -> Path:
    h = hashlib.md5(audio_path.encode()).hexdigest()[:12]
    name = Path(audio_path).stem[:40].replace(' ', '_')
    return CACHE_DIR / f"{name}_{h}.diar.json"

def diarize(audio_path: str, verbose: bool = True) -> dict:
    """Returns {
        'speaker_count': int,        # distinct speakers detected
        'turn_count': int,           # number of speaker changes
        'turns': [{start, end, speaker}, ...],
        'speaker_durations_s': {speaker_id: total_seconds}
    }"""
    cache_file = _cache_path(audio_path)
    if cache_file.exists():
        if verbose:
            print(f"  diarization cache hit: {Path(audio_path).name}")
        return json.loads(cache_file.read_text())

    if verbose:
        print(f"  diarizing: {Path(audio_path).name} (this takes ~30-60s per audio)")

    pipeline = _get_pipeline()

    # pyannote 4.x has a known bug with MP3 inputs (sample count mismatch on chunks).
    # Always pre-convert to 16kHz mono WAV via ffmpeg for stable diarization.
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", audio_path,
             "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", tmp_path],
            check=True
        )
        output = pipeline(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    # pyannote 4.x returns DiarizeOutput; the Annotation is at .speaker_diarization
    diarization = output.speaker_diarization if hasattr(output, 'speaker_diarization') else output

    turns = []
    speaker_durs = {}
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        turns.append({
            "start": round(turn.start, 2),
            "end": round(turn.end, 2),
            "speaker": speaker,
        })
        speaker_durs[speaker] = speaker_durs.get(speaker, 0.0) + (turn.end - turn.start)

    result = {
        "speaker_count": len(speaker_durs),
        "turn_count": len(turns),
        "turns": turns,
        "speaker_durations_s": {k: round(v, 2) for k, v in speaker_durs.items()},
    }
    cache_file.write_text(json.dumps(result))
    return result

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: diarization.py <audio_path>")
        sys.exit(1)
    r = diarize(sys.argv[1])
    print(json.dumps(r, indent=2))

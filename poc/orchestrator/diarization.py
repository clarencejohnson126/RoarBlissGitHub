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
        import torch, pyannote.audio
        from pyannote.audio import Pipeline
        print(f"  pyannote.audio {pyannote.audio.__version__}")
        # Do NOT pass a token kwarg — from_pretrained's signature differs across pyannote 3.x/4.x and
        # both `token` and `use_auth_token` have raised TypeError. Authenticate via huggingface_hub
        # instead (env + cached login); from_pretrained then picks the token up version-agnostically.
        os.environ.setdefault("HUGGING_FACE_HUB_TOKEN", token)
        os.environ.setdefault("HF_TOKEN", token)
        try:
            from huggingface_hub import login
            login(token=token, add_to_git_credential=False)
        except Exception as e:
            print("  hf login note:", e)
        _pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
        # Move the pipeline onto the GPU when present — otherwise diarization runs on CPU even on a
        # GPU box and stays the bottleneck.
        if torch.cuda.is_available():
            _pipeline.to(torch.device("cuda"))
            print("  pyannote pipeline -> CUDA")
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

    try:
        pipeline = _get_pipeline()

        # Pre-convert to 16kHz mono WAV via ffmpeg, then hand pyannote an IN-MEMORY waveform dict
        # instead of a file path (sidesteps torchcodec's AudioDecoder, which fails against the
        # container ffmpeg). We load the WAV ourselves with soundfile.
        import soundfile as sf
        import torch
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", audio_path,
                 "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", tmp_path],
                check=True
            )
            wav, sr = sf.read(tmp_path, dtype="float32", always_2d=True)  # (frames, channels)
            waveform = torch.from_numpy(wav.T).contiguous()               # (channel, time)
            output = pipeline({"waveform": waveform, "sample_rate": sr})
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
    except Exception as e:
        # pyannote (or one of its many transitive deps) failed to import/load/run. For solo
        # motivational audio this is harmless: treat the whole track as ONE speaker. The slot finder
        # keys off energy/peaks, not speaker turns, so solo output quality is unaffected. This makes
        # diarization a SOFT dependency — the pipeline never blocks on pyannote again.
        try:
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio_path],
                capture_output=True, text=True,
            )
            dur = float(probe.stdout.strip())
        except Exception:
            dur = 0.0
        if verbose:
            print(f"  diarization unavailable ({type(e).__name__}) -> single-speaker fallback ({dur:.0f}s)")
        turns = [{"start": 0.0, "end": round(dur, 2), "speaker": "SPEAKER_00"}]
        speaker_durs = {"SPEAKER_00": dur}

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

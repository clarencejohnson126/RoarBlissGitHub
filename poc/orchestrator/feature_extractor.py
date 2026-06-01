#!/usr/bin/env python3
"""
Feature Extractor — Sprint 1
============================
Per audio file, extract:
  - duration (s)
  - speech_ratio (% of total time that is detected speech)
  - speaker_estimate (1, 2, or 3+ — heuristic via pitch variance clustering)
  - avg_utterance_s (mean Whisper segment duration)
  - utterance_count
  - music_dominance (0-1 score; high = music drowns speech)
  - energy_burstiness (std of RMS / mean of RMS; high = explosive moments)
  - tempo (BPM)
  - transcript_excerpt (first 300 chars)
  - language (detected by Whisper)

Caches per-audio results to avoid recomputation.
"""

import os, json, hashlib, warnings
from pathlib import Path
warnings.filterwarnings("ignore")

import numpy as np
import librosa
import whisper

# Optional pyannote diarization
try:
    from diarization import diarize as pyannote_diarize
    _PYANNOTE_AVAILABLE = os.environ.get("HF_TOKEN") is not None
except Exception:
    _PYANNOTE_AVAILABLE = False

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True, parents=True)

_whisper_model = None
def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        print("  loading Whisper medium model...")
        _whisper_model = whisper.load_model("medium")
    return _whisper_model

def _cache_path(audio_path: str, suffix: str) -> Path:
    h = hashlib.md5(audio_path.encode()).hexdigest()[:12]
    name = Path(audio_path).stem[:40].replace(' ', '_')
    return CACHE_DIR / f"{name}_{h}.{suffix}"

def extract_speaker_estimate(y: np.ndarray, sr: int, speech_segments: list) -> int:
    """Heuristic speaker count via pitch (f0) distribution clusters.
    Returns 1, 2, or 3+ as a coarse estimate. Not as accurate as pyannote
    but no HF token needed."""
    if not speech_segments or len(y) < sr * 2:
        return 1
    # Sample f0 across speech segments
    pitches = []
    for seg in speech_segments[:30]:  # sample first 30 segments
        s_idx = int(seg["start"] * sr)
        e_idx = int(seg["end"] * sr)
        if e_idx - s_idx < sr * 0.3:
            continue
        chunk = y[s_idx:e_idx]
        f0, voiced, _ = librosa.pyin(chunk, fmin=65, fmax=400, sr=sr,
                                      frame_length=2048, hop_length=512)
        valid = f0[voiced & ~np.isnan(f0)]
        if len(valid) > 5:
            pitches.append(np.median(valid))
    if len(pitches) < 3:
        return 1
    pitches = np.array(pitches)
    # Count distinct pitch clusters using simple binning
    # Speakers usually differ by > 40 Hz median f0
    sorted_p = np.sort(pitches)
    cluster_breaks = np.where(np.diff(sorted_p) > 40)[0]
    n_clusters = len(cluster_breaks) + 1
    if n_clusters >= 3:
        return 3
    return n_clusters

def extract_features(audio_path: str, verbose: bool = True) -> dict:
    """Extract all features for one audio. Caches result."""
    cache_file = _cache_path(audio_path, "features.json")
    if cache_file.exists():
        if verbose:
            print(f"  cache hit: {Path(audio_path).name}")
        return json.loads(cache_file.read_text())

    if verbose:
        print(f"  processing: {Path(audio_path).name}")

    # --- Whisper transcription with timestamps ---
    transcript_cache = _cache_path(audio_path, "whisper.json")
    if transcript_cache.exists():
        result = json.loads(transcript_cache.read_text())
    else:
        if verbose:
            print(f"    whisper transcribing...")
        result = get_whisper().transcribe(audio_path, word_timestamps=False, verbose=False)
        # Save (only fields we need to keep cache small)
        slim = {
            "language": result.get("language", "unknown"),
            "text": result.get("text", "")[:5000],
            "segments": [{"start": s["start"], "end": s["end"], "text": s["text"]}
                         for s in result.get("segments", [])]
        }
        transcript_cache.write_text(json.dumps(slim))
        result = slim

    segments = result["segments"]
    full_text = result["text"]

    # --- librosa audio analysis ---
    if verbose:
        print(f"    librosa analyzing...")
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = len(y) / sr

    # speech_ratio
    speech_time = sum(s["end"] - s["start"] for s in segments)
    speech_ratio = speech_time / duration if duration > 0 else 0.0

    # avg_utterance + count
    utterance_durations = [s["end"] - s["start"] for s in segments]
    avg_utterance_s = float(np.mean(utterance_durations)) if utterance_durations else 0.0
    utterance_count = len(segments)

    # Speaker estimate — prefer pyannote (real diarization) over pitch heuristic
    speaker_estimate_raw = extract_speaker_estimate(y, sr, segments)
    speaker_effective = speaker_estimate_raw
    turn_count = utterance_count
    longest_speaker_ratio = 1.0  # fraction of speech time the dominant speaker holds
    if _PYANNOTE_AVAILABLE:
        try:
            diar = pyannote_diarize(audio_path, verbose=False)
            speaker_durs = diar["speaker_durations_s"]
            total_diar = sum(speaker_durs.values()) or 1
            # "effective" speakers = those with at least 5% of total speech time AND >= 3s absolute
            effective = [(k, v) for k, v in speaker_durs.items()
                          if v >= 3.0 and v / total_diar >= 0.05]
            speaker_effective = max(1, len(effective))
            turn_count = diar["turn_count"]
            longest_speaker_ratio = max(speaker_durs.values()) / total_diar if speaker_durs else 1.0
        except Exception as ex:
            print(f"    diarization failed ({ex}); falling back to pitch heuristic")

    # Music dominance heuristic: compute RMS in speech vs non-speech regions.
    # If non-speech RMS is comparable to or louder than speech RMS, music dominates.
    frame_length = int(sr * 0.05)
    hop_length = int(sr * 0.025)
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)

    speech_mask = np.zeros(len(rms), dtype=bool)
    for s in segments:
        speech_mask |= (times >= s["start"]) & (times <= s["end"])
    if speech_mask.sum() > 5 and (~speech_mask).sum() > 5:
        speech_rms = float(np.mean(rms[speech_mask]))
        nonspeech_rms = float(np.mean(rms[~speech_mask]))
        # dominance = ratio of non-speech to speech energy (clipped 0-1)
        if speech_rms > 0:
            music_dominance = min(1.0, nonspeech_rms / speech_rms)
        else:
            music_dominance = 1.0
    else:
        speech_rms = float(np.mean(rms))
        nonspeech_rms = 0.0
        music_dominance = 0.0

    # Energy burstiness
    energy_burstiness = float(np.std(rms) / np.mean(rms)) if np.mean(rms) > 0 else 0.0

    # Tempo
    try:
        tempo_arr, _ = librosa.beat.beat_track(y=y, sr=sr)
        # librosa newer versions return numpy array; older return float
        tempo = float(tempo_arr.item() if hasattr(tempo_arr, 'item') else tempo_arr)
    except Exception:
        tempo = 0.0

    features = {
        "audio_path": audio_path,
        "duration_s": round(duration, 2),
        "language": result.get("language", "unknown"),
        "speech_ratio": round(speech_ratio, 3),
        "speaker_estimate": speaker_effective,                # NEW: effective count (pyannote-filtered)
        "speaker_estimate_raw": speaker_estimate_raw,         # pitch-heuristic count (kept for comparison)
        "longest_speaker_ratio": round(longest_speaker_ratio, 3),  # NEW: dominance of top speaker
        "turn_count": turn_count,                             # NEW: speaker changes (high = D dialogue)
        "diarization_source": "pyannote" if _PYANNOTE_AVAILABLE else "pitch-heuristic",
        "avg_utterance_s": round(avg_utterance_s, 2),
        "utterance_count": utterance_count,
        "music_dominance": round(music_dominance, 3),
        "energy_burstiness": round(energy_burstiness, 3),
        "tempo_bpm": round(tempo, 1),
        "speech_rms": round(speech_rms, 5),
        "nonspeech_rms": round(nonspeech_rms, 5),
        "transcript_excerpt": full_text[:300],
        "transcript_full": full_text,
    }

    cache_file.write_text(json.dumps(features, indent=2))
    return features

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: feature_extractor.py <audio_path>")
        sys.exit(1)
    f = extract_features(sys.argv[1])
    print(json.dumps(f, indent=2))

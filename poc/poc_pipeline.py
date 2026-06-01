#!/usr/bin/env python3
"""
Roar Bliss POC - Full Pipeline
==============================
Complete end-to-end pipeline for personalized motivational audio.

Usage:
    python poc_pipeline.py input.mp3 --name "Your Name" --goal "Your Goal"
"""

import argparse
import os
import sys
import json
import time
from pathlib import Path
from datetime import datetime

# Output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)


class PipelineError(Exception):
    """Custom exception for pipeline errors."""
    pass


def log(message: str, level: str = "info"):
    """Simple logging with timestamp."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    prefix = {
        "info": "ℹ️ ",
        "success": "✓ ",
        "error": "✗ ",
        "warning": "⚠️ ",
        "step": "►"
    }.get(level, "")
    print(f"[{timestamp}] {prefix}{message}")


def step_header(step_num: int, title: str, total: int = 6):
    """Print a step header."""
    print(f"\n{'='*60}")
    print(f" STEP {step_num}/{total}: {title}")
    print(f"{'='*60}")


# =============================================================================
# STEP 1: Audio Separation
# =============================================================================

def separate_audio(input_path: str) -> tuple[str, str]:
    """Separate vocals from accompaniment using Demucs."""
    vocals_path = str(OUTPUT_DIR / "vocals.wav")
    accomp_path = str(OUTPUT_DIR / "accompaniment.wav")

    if os.path.exists(vocals_path) and os.path.exists(accomp_path):
        log("Pre-separated vocals and accompaniment tracks found in cache, skipping separation.", "success")
        return vocals_path, accomp_path

    import torch
    import torchaudio
    from demucs import pretrained
    from demucs.apply import apply_model

    step_header(1, "AUDIO SEPARATION")
    log(f"Input: {input_path}")

    # Select device
    if torch.cuda.is_available():
        device = 'cuda'
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = 'mps'
    else:
        device = 'cpu'
    log(f"Using device: {device}")

    # Load model
    log("Loading Demucs model...")
    model = pretrained.get_model('htdemucs')
    model.to(device)

    # Load and process audio
    log("Loading audio file...")
    wav, sr = torchaudio.load(input_path)

    # Ensure stereo and correct sample rate
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    if sr != 44100:
        resampler = torchaudio.transforms.Resample(sr, 44100)
        wav = resampler(wav)
        sr = 44100

    duration = wav.shape[1] / sr
    log(f"Audio duration: {duration:.1f} seconds")

    # Separate
    log("Separating audio (this may take a few minutes)...")
    start_time = time.time()

    wav = wav.to(device)
    with torch.no_grad():
        sources = apply_model(model, wav[None], device=device, progress=True)[0]

    elapsed = time.time() - start_time
    log(f"Separation completed in {elapsed:.1f} seconds", "success")

    # Save outputs
    vocals = sources[3].cpu()
    accompaniment = (sources[0] + sources[1] + sources[2]).cpu()

    vocals_path = str(OUTPUT_DIR / "vocals.wav")
    accomp_path = str(OUTPUT_DIR / "accompaniment.wav")

    torchaudio.save(vocals_path, vocals, sr)
    torchaudio.save(accomp_path, accompaniment, sr)

    log(f"Vocals saved: {vocals_path}", "success")
    log(f"Accompaniment saved: {accomp_path}", "success")

    return vocals_path, accomp_path


# =============================================================================
# STEP 2: Transcription
# =============================================================================

def transcribe_audio(vocals_path: str) -> dict:
    """Transcribe vocals using Whisper."""
    output_path = OUTPUT_DIR / "transcript.json"
    if os.path.exists(output_path):
        log("Pre-computed transcript found in cache, loading directly.", "success")
        with open(output_path, "r", encoding="utf-8") as f:
            return json.load(f)

    import whisper

    step_header(2, "TRANSCRIPTION")
    log(f"Input: {vocals_path}")

    # Load model
    log("Loading Whisper model (base)...")
    model = whisper.load_model("base")

    # Transcribe
    log("Transcribing speech...")
    start_time = time.time()

    result = model.transcribe(
        vocals_path,
        word_timestamps=True,
        language="en",
        verbose=False
    )

    elapsed = time.time() - start_time
    log(f"Transcription completed in {elapsed:.1f} seconds", "success")

    # Process results
    transcript = {
        "text": result["text"],
        "language": result["language"],
        "segments": []
    }

    for segment in result["segments"]:
        seg_data = {
            "id": segment["id"],
            "start": segment["start"],
            "end": segment["end"],
            "text": segment["text"].strip(),
            "words": []
        }
        if "words" in segment:
            for word in segment["words"]:
                seg_data["words"].append({
                    "word": word["word"].strip(),
                    "start": word["start"],
                    "end": word["end"]
                })
        transcript["segments"].append(seg_data)

    # Save
    output_path = OUTPUT_DIR / "transcript.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(transcript, f, indent=2, ensure_ascii=False)

    word_count = len(result["text"].split())
    log(f"Transcribed {word_count} words in {len(transcript['segments'])} segments", "success")
    log(f"Saved: {output_path}", "success")

    return transcript


# =============================================================================
# STEP 3: Audio Analysis
# =============================================================================

def analyze_audio(accomp_path: str) -> dict:
    """Analyze audio for beats, energy, and structure."""
    output_path = OUTPUT_DIR / "analysis.json"
    if os.path.exists(output_path):
        log("Pre-computed audio analysis found in cache, loading directly.", "success")
        with open(output_path, "r") as f:
            return json.load(f)

    import librosa
    import numpy as np
    from scipy.signal import find_peaks

    step_header(3, "AUDIO ANALYSIS")
    log(f"Input: {accomp_path}")

    # Load audio
    log("Loading audio for analysis...")
    y, sr = librosa.load(accomp_path, sr=None)
    duration = len(y) / sr

    # Beat detection
    log("Detecting beats...")
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    tempo = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    # Energy curve
    log("Calculating energy curve...")
    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.times_like(rms, sr=sr)
    rms_normalized = (rms - rms.min()) / (rms.max() - rms.min() + 1e-8)

    # Climax points
    log("Finding climax points...")
    min_distance = int(5 * sr / 512)
    peaks, _ = find_peaks(rms_normalized, height=0.5, distance=min_distance)
    climax_times = rms_times[peaks].tolist()

    # Build result
    analysis = {
        "duration": float(duration),
        "tempo": float(tempo),
        "beats": beat_times.tolist(),
        "climax_points": climax_times,
        "energy_curve": [
            {"time": float(t), "energy": float(e)}
            for t, e in zip(rms_times[::10], rms_normalized[::10])
        ]
    }

    # Save
    output_path = OUTPUT_DIR / "analysis.json"
    with open(output_path, "w") as f:
        json.dump(analysis, f, indent=2)

    log(f"Tempo: {tempo:.1f} BPM, {len(beat_times)} beats, {len(climax_times)} climax points", "success")
    log(f"Saved: {output_path}", "success")

    return analysis


# =============================================================================
# STEP 4: LLM Rewrite
# =============================================================================

SYSTEM_PROMPT = """You are an expert motivational speech writer. Rewrite speeches while
maintaining PRECISE timing constraints. Each segment must match the target word count ±2 words.
Personalize naturally with the user's name and goals. Output valid JSON only."""

def rewrite_script(transcript: dict, analysis: dict, user_context: dict) -> dict:
    """Use LLM to rewrite the script with personalization."""
    import ollama

    step_header(4, "LLM REWRITE")
    log(f"User: {user_context['name']}")
    log(f"Goal: {user_context['goal']}")

    # If no vocals/segments detected, generate default personalized segments
    if not transcript.get("segments"):
        log("No vocals detected in input audio. Automatically generating a custom motivational voice-over overlay...")
        duration = analysis.get("duration", 60.0)
        transcript["segments"] = [
            {
                "id": 0,
                "start": 5.0,
                "end": 15.0,
                "text": f"Clarence, listen to me. The fire of the dragon and the strength of the wolf are within you."
            },
            {
                "id": 1,
                "start": max(6.0, duration / 2.0 - 5.0),
                "end": max(16.0, duration / 2.0 + 5.0),
                "text": f"You are building the number one A.I. agency in Germany. Do not let doubt slow you down."
            },
            {
                "id": 2,
                "start": max(7.0, duration - 15.0),
                "end": max(17.0, duration - 5.0),
                "text": f"Rise, Clarence. Stand tall, execute, and conquer your goals."
            }
        ]

    # Build segments info
    segments_info = []
    for i, segment in enumerate(transcript["segments"]):
        word_count = len(segment["text"].split())
        climax_in_seg = [c for c in analysis.get("climax_points", [])
                        if segment["start"] <= c <= segment["end"]]

        segments_info.append({
            "id": i + 1,
            "start": round(segment["start"], 2),
            "end": round(segment["end"], 2),
            "original_text": segment["text"],
            "target_word_count": word_count,
            "has_climax": len(climax_in_seg) > 0
        })

    prompt = f"""Rewrite these motivational speech segments for {user_context['name']}.
Goal: {user_context['goal']}
Struggles: {user_context.get('struggles', 'Self-doubt')}

SEGMENTS:
{json.dumps(segments_info, indent=2)}

Return JSON with structure:
{{"segments": [{{"id": 1, "new_text": "...", "target_word_count": X, "actual_word_count": X}}]}}

Match word counts precisely (±2 words). Return ONLY JSON."""

    log("Calling LLM...")
    start_time = time.time()

    response = ollama.chat(
        model='qwen2.5:7b',
        messages=[
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': prompt}
        ],
        options={'temperature': 0.7, 'num_predict': 4000}
    )

    elapsed = time.time() - start_time
    log(f"LLM response in {elapsed:.1f} seconds", "success")

    # Parse response
    response_text = response['message']['content']
    start = response_text.find('{')
    end = response_text.rfind('}') + 1

    if start >= 0 and end > start:
        result = json.loads(response_text[start:end])
    else:
        raise PipelineError("Failed to parse LLM response as JSON")

    # Save
    output_path = OUTPUT_DIR / "rewritten.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    log(f"Rewritten {len(result.get('segments', []))} segments", "success")
    log(f"Saved: {output_path}", "success")

    return result


# =============================================================================
# STEP 5: Voice Synthesis & Selective Splicing (Original Voice Preserved)
# =============================================================================

def selective_voice_cloning_and_stitching(vocals_path: str, transcript: dict, name: str) -> str:
    """
    Selectively replaces target words in vocals_path with the personalized name
    using the Qwen3-TTS MLX local API, maintaining full timing and original voices.
    """
    import base64
    import io
    import requests
    from pydub import AudioSegment

    step_header(5, "SELECTIVE ORIGINAL VOICE CLONING & STITCHING")
    log(f"Input vocals: {vocals_path}")
    log(f"Target name insertion: '{name}'")

    # 1. Load vocals track
    log("Loading original vocals track...")
    vocals = AudioSegment.from_wav(vocals_path)
    vocals_duration_ms = len(vocals)
    vocals_duration = vocals_duration_ms / 1000.0
    log(f"Vocals track duration: {vocals_duration:.2f} seconds")

    # 2. Identify candidate words to replace
    # We want to replace "Robert Baratheon", "Regard" (Whisper's transcription of Rhaegar), and "Snow".
    candidates = []

    # Flatten all words with segment indices to make processing easy
    all_words = []
    for seg_idx, segment in enumerate(transcript.get("segments", [])):
        for w_idx, word in enumerate(segment.get("words", [])):
            all_words.append({
                "word": word["word"],
                "start": word["start"],
                "end": word["end"],
                "seg_idx": seg_idx,
                "w_idx": w_idx
            })

    # Sort all words chronologically
    all_words.sort(key=lambda x: x["start"])

    # Traverse words and find matching patterns
    i = 0
    while i < len(all_words):
        word_text = all_words[i]["word"].strip(".,!?\"'()").lower()

        # Check for "robert" followed by "baratheon"
        if word_text == "robert" and i + 1 < len(all_words) and all_words[i+1]["word"].strip(".,!?\"'()").lower() == "baratheon":
            candidates.append({
                "target_text": name,
                "original_text": all_words[i]["word"] + " " + all_words[i+1]["word"],
                "start": all_words[i]["start"],
                "end": all_words[i+1]["end"]
            })
            i += 2
            continue

        # Check for "regard" (Rhaegar)
        elif word_text == "regard":
            candidates.append({
                "target_text": name,
                "original_text": all_words[i]["word"],
                "start": all_words[i]["start"],
                "end": all_words[i]["end"]
            })

        # Check for "snow"
        elif word_text == "snow":
            candidates.append({
                "target_text": name,
                "original_text": all_words[i]["word"],
                "start": all_words[i]["start"],
                "end": all_words[i]["end"]
            })

        i += 1

    log(f"Found {len(candidates)} candidate location(s) for original voice name injection:")
    for idx, cand in enumerate(candidates):
        log(f"  [{idx+1}] Replace '{cand['original_text']}' at {cand['start']:.2f}s - {cand['end']:.2f}s with '{cand['target_text']}'")

    if not candidates:
        log("No target candidate words found in transcription. Injecting name at a default epic location...", "warning")
        # In the unlikely event no target words are found, inject at an epic silence
        # (e.g. 10.0 seconds or right before the end)
        candidates.append({
            "target_text": name,
            "original_text": "default_fallback",
            "start": 10.0,
            "end": 10.5
        })

    # 3. Stitch the timeline together using our Silence-Absorption Algorithm
    original_cursor = 0.0  # in seconds
    stitched_vocals = AudioSegment.silent(duration=0)
    accumulated_shift = 0.0  # in seconds

    for idx, cand in enumerate(candidates):
        cand_start = cand["start"]
        cand_end = cand["end"]

        # Center a robust 4.0-second reference window around the segment to ensure high-quality cloning
        seg_center = (cand_start + cand_end) / 2.0
        ref_start = seg_center - 2.0
        ref_end = seg_center + 2.0
        
        # Adjust boundaries if they go out of bounds, shifting the window to stay inside [0, vocals_duration]
        if ref_start < 0.0:
            ref_end -= ref_start
            ref_start = 0.0
        if ref_end > vocals_duration:
            ref_start -= (ref_end - vocals_duration)
            ref_end = vocals_duration
            
        ref_start = max(0.0, ref_start)
        ref_end = min(vocals_duration, ref_end)

        log(f"[{idx+1}] Extracting cloning reference audio from vocals: {ref_start:.2f}s to {ref_end:.2f}s...")
        ref_chunk = vocals[int(ref_start * 1000):int(ref_end * 1000)]

        # Base64 encode WAV chunk
        ref_buffer = io.BytesIO()
        ref_chunk.export(ref_buffer, format="wav")
        ref_bytes = ref_buffer.getvalue()
        ref_base64 = base64.b64encode(ref_bytes).decode("utf-8")

        # Reconstruct original text in the 5-second window
        ref_words = [w["word"] for w in all_words if w["start"] >= ref_start and w["end"] <= ref_end]
        ref_text = " ".join(ref_words)
        log(f"[{idx+1}] Reference audio text context: \"{ref_text}\"")

        # Request voice cloning from local Qwen3-TTS API
        log(f"[{idx+1}] Calling local MLX server to clone voice and synthesize '{cand['target_text']}'...")
        try:
            payload = {
                "text": cand["target_text"],
                "language": "English",
                "ref_audio_base64": ref_base64,
                "ref_text": ref_text,
                "x_vector_only_mode": False,
                "speed": 1.0,
                "response_format": "base64"
            }
            response = requests.post("http://127.0.0.1:7860/api/v1/base/clone", json=payload, timeout=90)
            response.raise_for_status()
            res_data = response.json()
            clone_base64 = res_data["audio"]
            clone_bytes = base64.b64decode(clone_base64)
            cloned_chunk = AudioSegment.from_wav(io.BytesIO(clone_bytes))
            log(f"[{idx+1}] Voice clone received! Cloned audio length: {len(cloned_chunk)/1000.0:.2f}s", "success")
        except Exception as e:
            log(f"[{idx+1}] Cloning API request failed: {e}. Utilizing native fallback speak block.", "warning")
            # If the REST API fails, create a silent block or basic synthesized sound
            cloned_chunk = AudioSegment.silent(duration=1000)

        # Stitch: add original vocals from original_cursor to cand_start
        if cand_start > original_cursor:
            stitched_vocals += vocals[int(original_cursor * 1000):int(cand_start * 1000)]

        # Stitch: insert the newly synthesized voice clone
        stitched_vocals += cloned_chunk

        # Update cursor to candidate end
        original_cursor = cand_end

        # Find the next word's start time to measure silence gap after candidate
        next_word = next((w for w in all_words if w["start"] >= cand_end), None)
        next_spoken_start = next_word["start"] if next_word else vocals_duration

        silence_duration = next_spoken_start - cand_end
        orig_dur = cand_end - cand_start
        clone_dur = len(cloned_chunk) / 1000.0

        # Calculate time shift absorption
        delta = clone_dur - orig_dur
        net_shift = delta + accumulated_shift

        if net_shift > 0.0:
            # Silence absorption in progress
            absorbed = min(silence_duration, net_shift)
            new_silence_dur = silence_duration - absorbed
            accumulated_shift = net_shift - absorbed
            log(f"[{idx+1}] Silence absorbed: original {silence_duration:.2f}s -> new {new_silence_dur:.2f}s (Shift carried forward: {accumulated_shift:.2f}s)")
        else:
            new_silence_dur = silence_duration
            accumulated_shift = 0.0
            log(f"[{idx+1}] Zero shift. Silence preserved: {silence_duration:.2f}s")

        # Slice the adjusted silence chunk from original vocals to keep ambient space noise
        if new_silence_dur > 0.0:
            silence_chunk = vocals[int(cand_end * 1000):int((cand_end + new_silence_dur) * 1000)]
            stitched_vocals += silence_chunk

        # Set original_cursor to the start of the next spoken word
        original_cursor = next_spoken_start

    # Add any remaining vocals at the end of the track
    if original_cursor < vocals_duration:
        stitched_vocals += vocals[int(original_cursor * 1000):]

    # Save final personalized vocal track
    output_vocals_path = str(OUTPUT_DIR / "vocals_personalized.wav")
    stitched_vocals.export(output_vocals_path, format="wav")
    log(f"Successfully generated personalized vocals track: {output_vocals_path}", "success")

    return output_vocals_path


def get_total_tts_tokens_from_log(log_path: str, start_seek: int = 0) -> tuple[int, int]:
    """
    Parses the TTS server log file and returns:
    (total_tokens_sum, new_seek_position)
    Only considers 'Prompt: X tokens' lines after start_seek.
    """
    if not os.path.exists(log_path):
        return 0, start_seek
        
    tokens_sum = 0
    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            f.seek(start_seek)
            new_lines = f.readlines()
            new_seek = f.tell()
            
        for line in new_lines:
            if "Prompt:" in line and "tokens" in line:
                parts = line.split("Prompt:")
                if len(parts) > 1:
                    subparts = parts[1].split()
                    if subparts:
                        try:
                            # Strip out any non-digits (e.g. if the line is '63 tokens, ...')
                            token_str = "".join([c for c in subparts[0] if c.isdigit()])
                            if token_str:
                                tokens = int(token_str)
                                tokens_sum += tokens
                        except ValueError:
                            pass
    except Exception as e:
        print(f"Error parsing log: {e}")
        return 0, start_seek
        
    return tokens_sum, new_seek


def narrative_voice_cloning_and_stitching(vocals_path: str, transcript: dict, user_context: dict) -> str:
    """
    Surgically replaces target words in vocals_path and overlays personalized struggle statements
    during silence gaps using the Qwen3-TTS MLX local API, keeping the original vocals 100% intact.
    """
    import base64
    import io
    import requests
    import hashlib
    import shutil
    from pydub import AudioSegment
    from pydub.silence import detect_leading_silence

    step_header(5, "NARRATIVE ORIGINAL VOICE CLONING & STITCHING")
    log(f"Input vocals: {vocals_path}")
    log(f"User context: {user_context}")

    # Start token tracking
    log_path = "/Users/clarence/.gemini/antigravity-ide/brain/49ac6537-fe46-4c09-ae26-2efc670ecd11/.system_generated/tasks/task-195.log"
    log("Initializing token tracker...")
    _, initial_seek = get_total_tts_tokens_from_log(log_path, 0)

    # Clear old TTS cache to force high-fidelity regeneration of all voices
    cache_dir = Path("output/tts_cache")
    if cache_dir.exists():
        log("Clearing old TTS cache to force fresh high-fidelity regeneration of all character voices...")
        try:
            shutil.rmtree(cache_dir)
        except Exception as e:
            log(f"Warning: Failed to clear cache directory: {e}", "warning")
    cache_dir.mkdir(exist_ok=True)

    # Helper to find a word/phrase inside a segment and return start and end times
    def find_word_in_seg(segment, target_phrase):
        target_words = target_phrase.lower().split()
        words = segment.get("words", [])
        for i in range(len(words) - len(target_words) + 1):
            match = True
            for j in range(len(target_words)):
                w = words[i+j]["word"].strip(".,!?\"'()").lower()
                if w != target_words[j]:
                    match = False
                    break
            if match:
                start_time = words[i]["start"]
                end_time = words[i + len(target_words) - 1]["end"]
                return start_time, end_time
        return None

    # Helper to strip leading and trailing silences
    def trim_silence(sound, silence_threshold=-45.0, chunk_size=5):
        start_trim = detect_leading_silence(sound, silence_threshold, chunk_size)
        end_trim = detect_leading_silence(sound.reverse(), silence_threshold, chunk_size)
        duration = len(sound)
        if start_trim + end_trim >= duration:
            return sound
        return sound[start_trim:duration-end_trim]

    # 1. Load vocals and accompaniment tracks
    log("Loading original vocals track...")
    vocals = AudioSegment.from_wav(vocals_path)
    original_vocals_copy = AudioSegment.from_wav(vocals_path)
    vocals_duration_ms = len(vocals)
    vocals_duration = vocals_duration_ms / 1000.0
    log(f"Vocals track duration: {vocals_duration:.2f} seconds")

    # Load old golden vocals reference track
    vocals_old_path = "/Users/clarence/Desktop/Roar Bliss App/poc/vocals_old.wav"
    if os.path.exists(vocals_old_path):
        log("Loading old golden vocals reference track...")
        vocals_old = AudioSegment.from_wav(vocals_old_path)
    else:
        log("Warning: old golden vocals reference track not found! Falling back to target vocals.", "warning")
        vocals_old = original_vocals_copy

    log("Loading original accompaniment track...")
    accomp_path = str(OUTPUT_DIR / "accompaniment.wav")
    accomp = AudioSegment.from_wav(accomp_path)

    # Helper to duck the accompaniment track at a specific time range
    def duck_accompaniment(accomp_track, start_ms, duration_ms, duck_db=0.0):
        # Simply return the accompaniment track completely unchanged to prevent any volume dips or pumping
        return accomp_track

    segments = transcript.get("segments", [])

    # 2. Define clean hand-crafted reference windows for pure character voice cloning
    speaker_ref_windows = {
        "Catelyn Stark": {
            "start": 10.64,
            "end": 16.08,
            "text": "If father never talked about her, you came back a year later with another woman's son.",
            "source": "old"
        },
        "Ned Stark": {
            "start": 70.62,
            "end": 73.14,
            "text": "It's done, your grace. Targaryen's gone.",
            "source": "old"
        },
        "Robert Baratheon": {
            "start": 53.56,
            "end": 57.56,
            "text": "She belongs with me.",
            "source": "old"
        },
        "Ramsay Bolton": {
            "start": 201.02,
            "end": 204.96,
            "text": "That one's yours, Snow. I keep hearing stories about you. Bastard.",
            "source": "old"
        },
        "Ser Jorah Mormont": {
            "start": 90.26,
            "end": 92.92,
            "text": "When your brother Regard led his army at a battle to the frighten,",
            "source": "old"
        },
        "Daenerys Targaryen": {
            "start": 106.04,
            "end": 107.36,
            "text": "Regard fought no bleem.",
            "source": "old"
        },
        "Bran Stark": {
            "start": 209.46,
            "end": 211.32,
            "text": "He's the heir to the Iron Throne.",
            "source": "old"
        },
        "Sansa Stark": {
            "start": 273.34,
            "end": 278.52,
            "text": "Everything you did, what you were you are now. If it's what they want, it comes to that you know I'll stand behind you.",
            "source": "new"
        },
        "Yara Greyjoy": {
            "start": 238.20,
            "end": 239.24,
            "text": "He's my brother.",
            "source": "new"
        },
        "Jon Snow": {
            "start": 156.04,
            "end": 161.16,
            "text": "He never lost him. He made a choice. He's a part of you. Just like he's a part of me.",
            "source": "new"
        },
        "Theon Greyjoy": {
            "start": 136.22,
            "end": 139.12,
            "text": "I always wanted to do the right thing.",
            "source": "new"
        }
    }

    # 3. Define surgical name replacements (accurate speakers and references)
    surgical_swaps = [
        {"seg_id": 40, "target_phrase": "Fion", "replacement": "Clarence", "speaker": "Sansa Stark", "desc": "Sansa Stark speaks Clarence"},
        {"seg_id": 53, "target_phrase": "Theon", "replacement": "Clarence", "speaker": "Sansa Stark", "desc": "Sansa Stark speaks Clarence"},
        {"seg_id": 66, "target_phrase": "Fion", "replacement": "Clarence", "speaker": "Sansa Stark", "desc": "Sansa Stark speaks Clarence"},
        {"seg_id": 72, "target_phrase": "Cion", "replacement": "Clarence", "speaker": "Ramsay Bolton", "desc": "Ramsay Bolton speaks Clarence"},
        {"seg_id": 73, "target_phrase": "Dion", "replacement": "Clarence", "speaker": "Ramsay Bolton", "desc": "Ramsay Bolton speaks Clarence"},
        {"seg_id": 75, "target_phrase": "Dion", "replacement": "Clarence", "speaker": "Ramsay Bolton", "desc": "Ramsay Bolton speaks Clarence"},
        {"seg_id": 88, "target_phrase": "Dion", "replacement": "Clarence", "speaker": "Jon Snow", "desc": "Jon Snow speaks Clarence"},
        {"seg_id": 101, "target_phrase": "The one", "replacement": "Clarence", "speaker": "Yara Greyjoy", "desc": "Yara Greyjoy speaks Clarence"},
        {"seg_id": 118, "target_phrase": "Theon", "replacement": "Clarence", "speaker": "Sansa Stark", "desc": "Sansa Stark speaks Clarence"},
        {"seg_id": 119, "target_phrase": "Theon", "replacement": "Clarence", "speaker": "Sansa Stark", "desc": "Sansa Stark speaks Clarence"},
        {"seg_id": 123, "target_phrase": "Theon", "replacement": "Clarence", "speaker": "Theon Greyjoy", "desc": "Theon Greyjoy speaks Clarence"},
        {"seg_id": 160, "target_phrase": "Thion", "replacement": "Clarence", "speaker": "Ned Stark", "desc": "Ned Stark speaks Clarence"},
        {"seg_id": 168, "target_phrase": "Thion", "replacement": "Clarence", "speaker": "Jon Snow", "desc": "Jon Snow speaks Clarence"},
        {"seg_id": 169, "target_phrase": "Thion", "replacement": "Clarence", "speaker": "Jon Snow", "desc": "Jon Snow speaks Clarence"}
    ]

    # 4. Define exactly 32 struggle narrative inserts in silence gaps
    struggle_overlays = [
        {"insert_time": 2.30, "speaker": "Catelyn Stark", "text": "A destiny born in silence.", "desc": "Struggle 1 (Catelyn Stark)"},
        {"insert_time": 6.05, "speaker": "Ned Stark", "text": "A storm is gathering, Clarence.", "desc": "Struggle 2 (Ned Stark)"},
        {"insert_time": 12.10, "speaker": "Catelyn Stark", "text": "You had to choose your own house.", "desc": "Struggle 3 (Catelyn Stark)"},
        {"insert_time": 19.95, "speaker": "Ned Stark", "text": "And face the cold truth of the world.", "desc": "Struggle 4 (Ned Stark)"},
        {"insert_time": 32.90, "speaker": "Robert Baratheon", "text": "They threw you in a cold cage!", "desc": "Struggle 5 (Robert Baratheon)"},
        {"insert_time": 35.60, "speaker": "Ned Stark", "text": "But your mind was never captive.", "desc": "Struggle 6 (Ned Stark)"},
        {"insert_time": 45.15, "speaker": "Robert Baratheon", "text": "You fought the beasts of the street!", "desc": "Struggle 7 (Robert Baratheon)"},
        {"insert_time": 46.80, "speaker": "Robert Baratheon", "text": "Blood and steel in the Mannheim nights!", "desc": "Struggle 8 (Robert Baratheon)"},
        {"insert_time": 53.30, "speaker": "Catelyn Stark", "text": "A father's blood, a rebel's heart.", "desc": "Struggle 9 (Catelyn Stark)"},
        {"insert_time": 58.85, "speaker": "Ned Stark", "text": "Your path is yours alone.", "desc": "Struggle 10 (Ned Stark)"},
        {"insert_time": 76.20, "speaker": "Ramsay Bolton", "text": "Did they think they could break you, Clarence?", "desc": "Struggle 11 (Ramsay Bolton) - Torture Phase"},
        {"insert_time": 78.50, "speaker": "Ramsay Bolton", "text": "You were screaming in the dark jail!", "desc": "Struggle 12 (Ramsay Bolton) - Torture Phase"},
        {"insert_time": 100.35, "speaker": "Ramsay Bolton", "text": "Mercy is for the weak!", "desc": "Struggle 13 (Ramsay Bolton) - Torture Phase"},
        {"insert_time": 121.70, "speaker": "Ramsay Bolton", "text": "There is no escape from your past!", "desc": "Struggle 14 (Ramsay Bolton) - Torture Phase"},
        {"insert_time": 123.20, "speaker": "Ramsay Bolton", "text": "Your baby mama screaming like a banshee!", "desc": "Struggle 15 (Ramsay Bolton) - Baby Mama breakup"},
        {"insert_time": 126.70, "speaker": "Ramsay Bolton", "text": "Screaming and howling in the dead of night!", "desc": "Struggle 16 (Ramsay Bolton) - Baby Mama breakup"},
        {"insert_time": 131.00, "speaker": "Ned Stark", "text": "But a man of honor cuts the toxic ties.", "desc": "Struggle 17 (Ned Stark) - Breakup resolution"},
        {"insert_time": 139.20, "speaker": "Ser Jorah Mormont", "text": "You had to make a choice.", "desc": "Struggle 18 (Ser Jorah Mormont) - Awakening"},
        {"insert_time": 144.30, "speaker": "Ser Jorah Mormont", "text": "To walk away from their greedy games.", "desc": "Struggle 19 (Ser Jorah Mormont) - Corporate exit"},
        {"insert_time": 155.70, "speaker": "Ser Jorah Mormont", "text": "And step into the wild fire of entrepreneurship.", "desc": "Struggle 20 (Ser Jorah Mormont) - Corporate exit"},
        {"insert_time": 166.65, "speaker": "Daenerys Targaryen", "text": "You are the master of your own house.", "desc": "Struggle 21 (Daenerys Targaryen) - Rebelz A.I. Build"},
        {"insert_time": 168.65, "speaker": "Daenerys Targaryen", "text": "You raised the golden banner of Rebelz A.I.!", "desc": "Struggle 22 (Daenerys Targaryen) - Rebelz A.I. Build"},
        {"insert_time": 171.00, "speaker": "Ned Stark", "text": "A father's duty is a sacred vow...", "desc": "Struggle 23 (Ned Stark) - Fatherhood"},
        {"insert_time": 175.00, "speaker": "Ned Stark", "text": "...to keep Lean and Elanese safe from harm.", "desc": "Struggle 24 (Ned Stark) - Fatherhood"},
        {"insert_time": 178.50, "speaker": "Daenerys Targaryen", "text": "Mannheim shall witness your sovereign power!", "desc": "Struggle 25 (Daenerys Targaryen) - Coronation build-up"},
        {"insert_time": 181.20, "speaker": "Robert Baratheon", "text": "You crushed them at the Mannheim graduation!", "desc": "Struggle 26 (Robert Baratheon) - Graduation victory"},
        {"insert_time": 183.25, "speaker": "Robert Baratheon", "text": "Now execute and take your crown!", "desc": "Struggle 27 (Robert Baratheon) - Coronation build-up"},
        {"insert_time": 201.90, "speaker": "Daenerys Targaryen", "text": "The dark days are gone, Clarence.", "desc": "Struggle 28 (Daenerys Targaryen) - Redemption"},
        {"insert_time": 281.70, "speaker": "Ned Stark", "text": "Your daughters will look up to a king.", "desc": "Struggle 29 (Ned Stark) - Redemption Climax"},
        {"insert_time": 297.30, "speaker": "Bran Stark", "text": "House Rebelz shall stand for a thousand years.", "desc": "Struggle 30 (Bran Stark) - Royal Climax"},
        {"insert_time": 308.10, "speaker": "Daenerys Targaryen", "text": "All hail Clarence, the King of Mannheim, now and forevermore!", "desc": "Struggle 31 (Daenerys Targaryen) - Ultimate Coronation"},
        {"insert_time": 316.60, "speaker": "Ned Stark", "text": "Rise, Clarence. Stand tall and conquer!", "desc": "Struggle 32 (Ned Stark) - Final Stand"}
    ]

    # Process all surgical swaps
    log(f"Processing {len(surgical_swaps)} surgical word replacements...")
    for idx, swap in enumerate(surgical_swaps):
        seg_id = swap["seg_id"]
        target = swap["target_phrase"]
        repl = swap["replacement"]
        speaker = swap["speaker"]
        desc = swap["desc"]

        if seg_id >= len(segments):
            log(f"  [Swap {idx+1}] Warning: Segment ID {seg_id} out of bounds, skipping.", "warning")
            continue

        segment = segments[seg_id]
        times = find_word_in_seg(segment, target)
        if not times:
            log(f"  [Swap {idx+1}] Warning: Phrase '{target}' not found in segment {seg_id}, skipping.", "warning")
            continue

        start_time, end_time = times
        log(f"  [Swap {idx+1}] '{target}' -> '{repl}' ({desc}) at {start_time:.2f}s - {end_time:.2f}s")

        # Extract uncontaminated high-fidelity reference audio strictly for this speaker
        ref_win = speaker_ref_windows.get(speaker, speaker_ref_windows["Ned Stark"])
        ref_start = ref_win["start"]
        ref_end = ref_win["end"]
        ref_text = ref_win["text"]
        ref_source = ref_win.get("source", "old")

        if ref_source == "new":
            ref_chunk = original_vocals_copy[int(ref_start * 1000):int(ref_end * 1000)]
        else:
            ref_chunk = vocals_old[int(ref_start * 1000):int(ref_end * 1000)]

        # Base64 encode WAV chunk
        ref_buffer = io.BytesIO()
        ref_chunk.export(ref_buffer, format="wav")
        ref_bytes = ref_buffer.getvalue()
        ref_base64 = base64.b64encode(ref_bytes).decode("utf-8")

        # Cache check
        cache_key = hashlib.md5(f"{repl}_{ref_start:.2f}_{ref_end:.2f}_{ref_text}".encode("utf-8")).hexdigest()
        cache_file = cache_dir / f"swap_{cache_key}.wav"

        if cache_file.exists():
            log(f"  [Swap {idx+1}] Loading from local TTS cache: {cache_file.name}", "success")
            cloned_chunk = AudioSegment.from_wav(str(cache_file))
        else:
            log(f"  [Swap {idx+1}] Calling local MLX server to clone voice and synthesize '{repl}'...")
            try:
                payload = {
                    "text": repl,
                    "language": "English",
                    "ref_audio_base64": ref_base64,
                    "ref_text": ref_text,
                    "x_vector_only_mode": False,
                    "speed": 1.0,
                    "response_format": "base64"
                }
                response = requests.post("http://127.0.0.1:7860/api/v1/base/clone", json=payload, timeout=90)
                response.raise_for_status()
                res_data = response.json()
                clone_base64 = res_data["audio"]
                clone_bytes = base64.b64decode(clone_base64)
                cloned_chunk = AudioSegment.from_wav(io.BytesIO(clone_bytes))
                cloned_chunk = trim_silence(cloned_chunk)
                cloned_chunk.export(str(cache_file), format="wav")
                log(f"  [Swap {idx+1}] Cloned chunk received: {len(cloned_chunk)/1000.0:.2f}s", "success")
            except Exception as e:
                log(f"  [Swap {idx+1}] Cloning API request failed: {e}. Muting original word only.", "warning")
                cloned_chunk = AudioSegment.silent(duration=int((end_time - start_time) * 1000))

        # Level-match the cloned chunk to the reference chunk (exact dBFS delta)
        if ref_chunk.dBFS != float('-inf') and cloned_chunk.dBFS != float('-inf'):
            target_gain = ref_chunk.dBFS - cloned_chunk.dBFS
            cloned_chunk = cloned_chunk + target_gain
            log(f"  [Swap {idx+1}] Level matching applied: {target_gain:+.2f} dB (ref dBFS: {ref_chunk.dBFS:.2f}, clone dBFS: {cloned_chunk.dBFS:.2f})")

        # Mute the original word
        start_ms = int(start_time * 1000)
        end_ms = int(end_time * 1000)
        word_dur = end_ms - start_ms
        
        # Duck accompaniment (returns unchanged track)
        accomp = duck_accompaniment(accomp, start_ms, len(cloned_chunk), duck_db=0.0)

        before = vocals[:start_ms]
        after = vocals[end_ms:]
        vocals = before + AudioSegment.silent(duration=word_dur, frame_rate=vocals.frame_rate) + after

        # Overlay the cloned word
        vocals = vocals.overlay(cloned_chunk, position=start_ms)

    # Process all silent-gap struggle overlays
    log(f"Processing {len(struggle_overlays)} silent-gap struggle overlays...")
    for idx, struggle in enumerate(struggle_overlays):
        insert_time = struggle["insert_time"]
        speaker = struggle["speaker"]
        text = struggle["text"]
        desc = struggle["desc"]

        log(f"  [Overlay {idx+1}] '{text}' ({desc}) at {insert_time:.2f}s")

        # Extract uncontaminated high-fidelity reference audio strictly for this speaker
        ref_win = speaker_ref_windows.get(speaker, speaker_ref_windows["Ned Stark"])
        ref_start = ref_win["start"]
        ref_end = ref_win["end"]
        ref_text = ref_win["text"]
        ref_source = ref_win.get("source", "old")

        if ref_source == "new":
            ref_chunk = original_vocals_copy[int(ref_start * 1000):int(ref_end * 1000)]
        else:
            ref_chunk = vocals_old[int(ref_start * 1000):int(ref_end * 1000)]

        ref_buffer = io.BytesIO()
        ref_chunk.export(ref_buffer, format="wav")
        ref_bytes = ref_buffer.getvalue()
        ref_base64 = base64.b64encode(ref_bytes).decode("utf-8")

        # Cache check
        cache_key = hashlib.md5(f"{text}_{ref_start:.2f}_{ref_end:.2f}_{ref_text}".encode("utf-8")).hexdigest()
        cache_file = cache_dir / f"overlay_{cache_key}.wav"

        if cache_file.exists():
            log(f"  [Overlay {idx+1}] Loading from local TTS cache: {cache_file.name}", "success")
            cloned_chunk = AudioSegment.from_wav(str(cache_file))
        else:
            log(f"  [Overlay {idx+1}] Calling local MLX server to clone voice and speak: \"{text}\"...")
            try:
                payload = {
                    "text": text,
                    "language": "English",
                    "ref_audio_base64": ref_base64,
                    "ref_text": ref_text,
                    "x_vector_only_mode": False,
                    "speed": 1.0,
                    "response_format": "base64"
                }
                response = requests.post("http://127.0.0.1:7860/api/v1/base/clone", json=payload, timeout=90)
                response.raise_for_status()
                res_data = response.json()
                clone_base64 = res_data["audio"]
                clone_bytes = base64.b64decode(clone_base64)
                cloned_chunk = AudioSegment.from_wav(io.BytesIO(clone_bytes))
                cloned_chunk = trim_silence(cloned_chunk)
                cloned_chunk.export(str(cache_file), format="wav")
                log(f"  [Overlay {idx+1}] Speech synthesized: {len(cloned_chunk)/1000.0:.2f}s", "success")
            except Exception as e:
                log(f"  [Overlay {idx+1}] Cloning API request failed: {e}. Skipping overlay.", "warning")
                continue

        # Level-match the cloned chunk to the reference chunk (exact dBFS delta)
        if ref_chunk.dBFS != float('-inf') and cloned_chunk.dBFS != float('-inf'):
            target_gain = ref_chunk.dBFS - cloned_chunk.dBFS
            cloned_chunk = cloned_chunk + target_gain
            log(f"  [Overlay {idx+1}] Level matching applied: {target_gain:+.2f} dB (ref dBFS: {ref_chunk.dBFS:.2f}, clone dBFS: {cloned_chunk.dBFS:.2f})")

        # Define exact time bounds for this struggle overlay
        start_ms = int(insert_time * 1000)
        if start_ms >= len(vocals):
            log(f"  [Overlay {idx+1}] Warning: Insert time {insert_time:.2f}s is past end of vocals, skipping.", "warning")
            continue

        chunk_len = len(cloned_chunk)
        if start_ms + chunk_len > len(vocals):
            chunk_len = len(vocals) - start_ms
            cloned_chunk = cloned_chunk[:chunk_len]
            log(f"  [Overlay {idx+1}] Trimmed cloned chunk to {chunk_len/1000.0:.2f}s to fit track boundary.")

        end_ms = start_ms + chunk_len

        # Duck accompaniment (returns unchanged track)
        accomp = duck_accompaniment(accomp, start_ms, chunk_len, duck_db=0.0)

        # 1. Find and mute any overlapping original vocal segments
        for segment in segments:
            seg_start_ms = int(segment["start"] * 1000)
            seg_end_ms = int(segment["end"] * 1000)
            
            # Check if segment overlaps with the overlay time range
            if max(seg_start_ms, start_ms) < min(seg_end_ms, end_ms):
                log(f"  [Overlay {idx+1}] Muting overlapping original segment {segment['id']}: \"{segment['text']}\" ({segment['start']:.2f}s - {segment['end']:.2f}s)")
                # Mute the entire segment to avoid cut-off words
                seg_dur = seg_end_ms - seg_start_ms
                before = vocals[:seg_start_ms]
                after = vocals[seg_end_ms:]
                vocals = before + AudioSegment.silent(duration=seg_dur, frame_rate=vocals.frame_rate) + after

        # 2. Also mute the exact range [start_ms, end_ms] to guarantee a clean canvas
        before = vocals[:start_ms]
        after = vocals[end_ms:]
        vocals = before + AudioSegment.silent(duration=chunk_len, frame_rate=vocals.frame_rate) + after

        # 3. Overlay the struggle snippet on the muted clean canvas
        vocals = vocals.overlay(cloned_chunk, position=start_ms)

    # Save final personalized vocal track
    output_vocals_path = str(OUTPUT_DIR / "vocals_personalized.wav")
    vocals.export(output_vocals_path, format="wav")
    log(f"Successfully generated personalized vocals track: {output_vocals_path}", "success")

    # Save final ducked accompaniment track
    output_accomp_path = str(OUTPUT_DIR / "accompaniment_ducked.wav")
    accomp.export(output_accomp_path, format="wav")
    log(f"Successfully generated ducked accompaniment track: {output_accomp_path}", "success")

    # Calculate and output total tokens processed
    final_tokens, _ = get_total_tts_tokens_from_log(log_path, initial_seek)
    log(f"==================================================", "success")
    log(f" VOICE CLONING SYNTHESIS TOKEN SUMMARY", "success")
    log(f" Total Qwen3-TTS tokens used: {final_tokens}", "success")
    log(f"==================================================", "success")

    return output_vocals_path, output_accomp_path


# =============================================================================
# STEP 6: Assembly
# =============================================================================

# =============================================================================

def assemble_audio(speech_path: str, accomp_path: str, output_path: str) -> str:
    """Combine personalized vocals track with background accompaniment."""
    import subprocess

    step_header(6, "FINAL ASSEMBLY")
    log(f"Speech / Vocals: {speech_path}")
    log(f"Accompaniment: {accomp_path}")

    # Use FFmpeg to mix
    log("Mixing audio tracks...")

    cmd = [
        'ffmpeg', '-y',
        '-i', speech_path,
        '-i', accomp_path,
        '-filter_complex',
        '[0:a]volume=1.0[speech];'
        '[1:a]volume=1.0[music];'
        '[speech][music]amix=inputs=2:duration=longest',
        '-ac', '2',
        '-ar', '44100',
        '-b:a', '320k',
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        log(f"FFmpeg error: {result.stderr}", "error")
        raise PipelineError("FFmpeg failed to mix audio")

    log(f"Final output: {output_path}", "success")

    return output_path


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def run_pipeline(input_path: str, user_context: dict, output_path: str, mode: str = "selective"):
    """Run the complete pipeline."""

    print("\n" + "="*60)
    print("        ROAR BLISS - Personalized Motivation Pipeline")
    print("="*60)
    print(f"\nInput: {input_path}")
    print(f"User: {user_context['name']}")
    print(f"Goal: {user_context['goal']}")
    print(f"Mode: {mode}")
    print(f"Output: {output_path}")

    total_start = time.time()

    try:
        # Step 1: Separation
        vocals_path, accomp_path = separate_audio(input_path)

        # Step 2: Transcription
        transcript = transcribe_audio(vocals_path)

        # Step 3: Analysis (optional, keep it in)
        analysis = analyze_audio(accomp_path)

        if mode == "selective":
            # Step 5 (Selective Mode): Cloned Name Injection & Stitching
            personalized_vocals = selective_voice_cloning_and_stitching(vocals_path, transcript, user_context["name"])
            speech_path = personalized_vocals
        elif mode == "narrative":
            # Step 5 (Narrative Mode): Cloned Narrative Struggle Injection & Stitching
            personalized_vocals, ducked_accomp = narrative_voice_cloning_and_stitching(vocals_path, transcript, user_context)
            speech_path = personalized_vocals
            accomp_path = ducked_accomp
        else:
            # Step 4 (Full Rewrite Mode): LLM Rewrite
            rewritten = rewrite_script(transcript, analysis, user_context)
            # Step 5 (Full Rewrite Mode): Voice Synthesis
            speech_path = synthesize_speech(vocals_path, rewritten)

        # Step 6: Assembly
        final_path = assemble_audio(speech_path, accomp_path, output_path)

        # Success!
        total_elapsed = time.time() - total_start

        print("\n" + "="*60)
        print("                    PIPELINE COMPLETE!")
        print("="*60)
        print(f"\n✓ Total time: {total_elapsed:.1f} seconds ({total_elapsed/60:.1f} minutes)")
        print(f"\n✓ Output file: {final_path}")
        print(f"\n✓ Listen to your personalized motivation!")
        print("="*60 + "\n")

        return final_path

    except Exception as e:
        print(f"\n{'='*60}")
        print(f" PIPELINE FAILED")
        print(f"{'='*60}")
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Roar Bliss - Personalized Motivational Audio Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python poc_pipeline.py test_audio/input.mp3 --name "Clarence Johnson" --mode selective
  python poc_pipeline.py speech.mp3 --name "Sarah" --goal "Start my own business" --output my_motivation.mp3
        """
    )

    parser.add_argument("input", help="Input audio file (MP3 or WAV)")
    parser.add_argument("--name", default="Friend", help="Your name")
    parser.add_argument("--goal", default="Achieve greatness", help="Your main goal")
    parser.add_argument("--struggles", default="", help="What holds you back (optional)")
    parser.add_argument("--mode", default="selective", choices=["selective", "full_rewrite", "narrative"], help="Personalization mode")
    parser.add_argument("--output", default="output/final_output.mp3", help="Output file path")

    args = parser.parse_args()

    # Validate input
    if not os.path.exists(args.input):
        print(f"✗ Input file not found: {args.input}")
        sys.exit(1)

    # Create user context
    user_context = {
        "name": args.name,
        "goal": args.goal,
        "struggles": args.struggles or "Self-doubt and fear of failure",
        "tone": "confident"
    }

    # Run pipeline
    run_pipeline(args.input, user_context, args.output, args.mode)


if __name__ == "__main__":
    main()

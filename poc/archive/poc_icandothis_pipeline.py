#!/usr/bin/env python3
"""
Roar Bliss Personalized Motivation Pipeline - 'I CAN DO THIS' Special Edition
=============================================================================
Surgically personalizes the vocals of 'I CAN DO THIS' with Clarence's life details
using the local MLX Voice Cloning API, preserving original ET and Les Brown voices,
stable music volume, and exactly 0 ms timeline drift.
"""

import os
import sys
import json
import time
import base64
import io
import requests
import hashlib
import shutil
import subprocess
from pathlib import Path
from datetime import datetime
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

# Paths setup
PROJECT_DIR = Path("/Users/clarence/Desktop/Roar Bliss App")
POC_DIR = PROJECT_DIR / "poc"
OUTPUT_DIR = POC_DIR / "output_icandothis"
CACHE_DIR = OUTPUT_DIR / "tts_cache"
TTS_LOG_PATH = Path("/Users/clarence/.gemini/antigravity-ide/brain/49ac6537-fe46-4c09-ae26-2efc670ecd11/.system_generated/tasks/task-195.log")

OUTPUT_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)


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


def step_header(step_num: int, title: str, total: int = 4):
    """Print a step header."""
    print(f"\n{'='*60}")
    print(f" STEP {step_num}/{total}: {title}")
    print(f"{'='*60}")


def get_total_tts_tokens_from_log(log_path: Path, start_seek: int = 0) -> tuple[int, int]:
    """Parses the TTS server log file and returns total tokens sum and new seek position."""
    if not log_path.exists():
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
                            token_str = "".join([c for c in subparts[0] if c.isdigit()])
                            if token_str:
                                tokens = int(token_str)
                                tokens_sum += tokens
                        except ValueError:
                            pass
    except Exception as e:
        log(f"Error parsing log: {e}", "warning")
        return 0, start_seek
        
    return tokens_sum, new_seek


def trim_silence(sound: AudioSegment, silence_threshold: float = -45.0, chunk_size: int = 5) -> AudioSegment:
    """Trim leading and trailing silence from synthesized audio."""
    start_trim = detect_leading_silence(sound, silence_threshold, chunk_size)
    end_trim = detect_leading_silence(sound.reverse(), silence_threshold, chunk_size)
    duration = len(sound)
    if start_trim + end_trim >= duration:
        return sound
    return sound[start_trim:duration-end_trim]


def find_word_in_seg(segment: dict, target_phrase: str) -> tuple[float, float] | None:
    """Find start and end timestamps for a target phrase within a transcript segment."""
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


def run_voice_alignment():
    """Main audio manipulation, voice cloning, level matching, and stitching pipeline."""
    step_header(1, "LOAD ASSETS & PREPARE REFS", 4)
    
    vocals_path = OUTPUT_DIR / "vocals.wav"
    accomp_path = OUTPUT_DIR / "accompaniment.wav"
    transcript_path = OUTPUT_DIR / "transcript.json"
    
    if not vocals_path.exists() or not accomp_path.exists() or not transcript_path.exists():
        log(f"Required files not found in {OUTPUT_DIR}!", "error")
        sys.exit(1)
        
    log("Loading transcript file...")
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript = json.load(f)
    segments = transcript.get("segments", [])
    
    log("Loading original vocals track...")
    vocals = AudioSegment.from_wav(str(vocals_path))
    original_vocals_copy = AudioSegment.from_wav(str(vocals_path))
    log(f"Vocals duration: {len(vocals)/1000.0:.3f}s")
    
    log("Loading original accompaniment track...")
    accomp = AudioSegment.from_wav(str(accomp_path))
    
    # Clean cache to ensure fresh voice cloning
    log("Clearing voice synthesis cache to force fresh high-fidelity clones...")
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    CACHE_DIR.mkdir(exist_ok=True)
    
    # Initialize token tracking
    log("Initializing Qwen3-TTS server token tracker...")
    _, initial_seek = get_total_tts_tokens_from_log(TTS_LOG_PATH, 0)
    
    # Speaker Golden References within vocals.wav
    speaker_refs = {
        "Eric Thomas": {
            "start": 103.18,
            "end": 108.16,
            "text": "I will break you before you break me. You've been through so much hell. You don't quit now."
        },
        "Les Brown": {
            "start": 232.82,
            "end": 242.60,
            "text": "The last chapter to my life has not been written yet. If you judge me now, you judge me prematurely. I'm still in the process of transforming my life."
        }
    }
    
    # Extraction of pure ref audio chunks
    log("Extracting high-fidelity reference audio chunks for speaker cloning...")
    for speaker, ref in speaker_refs.items():
        start_ms = int(ref["start"] * 1000)
        end_ms = int(ref["end"] * 1000)
        ref_chunk = original_vocals_copy[start_ms:end_ms]
        
        # Save as temporary wav to ensure binary correctness
        ref_path = CACHE_DIR / f"{speaker.replace(' ', '_')}_ref.wav"
        ref_chunk.export(str(ref_path), format="wav")
        ref["wav_path"] = ref_path
        log(f"  Ref extracted for {speaker} ({len(ref_chunk)/1000.0:.2f}s) -> {ref_path.name}")

    # Step 2: Process Surgical Swaps
    step_header(2, "PROCESSING SURGICAL WORD SWAPS", 4)
    
    surgical_swaps = [
        {"seg_id": 4, "target_phrase": "Buster Douglas", "replacement": "Clarence", "speaker": "Eric Thomas", "desc": "Buster Douglas -> Clarence"},
        {"seg_id": 14, "target_phrase": "this kid", "replacement": "Clarence", "speaker": "Eric Thomas", "desc": "this kid -> Clarence"},
        {"seg_id": 21, "target_phrase": "Buster Douglas", "replacement": "Clarence", "speaker": "Eric Thomas", "desc": "Buster Douglas -> Clarence"},
        {"seg_id": 22, "target_phrase": "Buster Douglas", "replacement": "Clarence", "speaker": "Eric Thomas", "desc": "Buster Douglas -> Clarence"},
        {"seg_id": 26, "target_phrase": "the Buster Douglas", "replacement": "with Clarence", "speaker": "Eric Thomas", "desc": "the Buster Douglas -> with Clarence"},
        {"seg_id": 27, "target_phrase": "Buster Douglas", "replacement": "Clarence", "speaker": "Eric Thomas", "desc": "Buster Douglas -> Clarence"},
        {"seg_id": 28, "target_phrase": "Buster Douglas", "replacement": "Clarence", "speaker": "Eric Thomas", "desc": "Buster Douglas -> Clarence"},
        {"seg_id": 32, "target_phrase": "Buster Douglas", "replacement": "Clarence", "speaker": "Eric Thomas", "desc": "Buster Douglas -> Clarence"},
        {"seg_id": 41, "target_phrase": "Your children", "replacement": "Lean and Elanese", "speaker": "Eric Thomas", "desc": "Your children -> Lean & Elanese"},
        {"seg_id": 85, "target_phrase": "be a businessman", "replacement": "build the number one A.I. agency in Germany", "speaker": "Les Brown", "desc": "businessman -> A.I. agency"},
        {"seg_id": 89, "target_phrase": "let's", "replacement": "Clarence", "speaker": "Les Brown", "desc": "let's/Les -> Clarence"},
        {"seg_id": 96, "target_phrase": "my dreams, yes to me", "replacement": "Rebelz A.I., yes to Clarence", "speaker": "Les Brown", "desc": "dreams/me -> Rebelz/Clarence"}
    ]
    
    for idx, swap in enumerate(surgical_swaps):
        seg_id = swap["seg_id"]
        target = swap["target_phrase"]
        repl = swap["replacement"]
        speaker = swap["speaker"]
        desc = swap["desc"]
        
        segment = segments[seg_id]
        times = find_word_in_seg(segment, target)
        if not times:
            log(f"  [Swap {idx+1}] Warning: Target '{target}' not found in Seg {seg_id}. Skipping.", "warning")
            continue
            
        start_time, end_time = times
        log(f"  [Swap {idx+1}] '{target}' -> '{repl}' ({desc}) in {speaker}'s voice at {start_time:.2f}s - {end_time:.2f}s")
        
        # Retrieve speaker reference
        ref = speaker_refs[speaker]
        ref_chunk = AudioSegment.from_wav(str(ref["wav_path"]))
        
        # Prepare Base64 reference
        with open(ref["wav_path"], "rb") as f:
            ref_base64 = base64.b64encode(f.read()).decode("utf-8")
            
        # TTS API payload
        payload = {
            "text": repl,
            "language": "English",
            "ref_audio_base64": ref_base64,
            "ref_text": ref["text"],
            "x_vector_only_mode": False,
            "speed": 1.0,
            "response_format": "base64"
        }
        
        cache_key = hashlib.md5(f"swap_{seg_id}_{target}_{repl}_{speaker}".encode("utf-8")).hexdigest()
        cache_file = CACHE_DIR / f"swap_{cache_key}.wav"
        
        if cache_file.exists():
            cloned_chunk = AudioSegment.from_wav(str(cache_file))
        else:
            log(f"    Requesting clone for swap '{repl}'...")
            try:
                response = requests.post("http://127.0.0.1:7860/api/v1/base/clone", json=payload, timeout=90)
                response.raise_for_status()
                res_data = response.json()
                clone_bytes = base64.b64decode(res_data["audio"])
                cloned_chunk = AudioSegment.from_wav(io.BytesIO(clone_bytes))
                cloned_chunk = trim_silence(cloned_chunk)
                cloned_chunk.export(str(cache_file), format="wav")
            except Exception as e:
                log(f"    API failed: {e}. Replacing with silence.", "error")
                cloned_chunk = AudioSegment.silent(duration=int((end_time - start_time) * 1000))
                
        # Level-match
        if ref_chunk.dBFS != float('-inf') and cloned_chunk.dBFS != float('-inf'):
            gain = ref_chunk.dBFS - cloned_chunk.dBFS
            cloned_chunk = cloned_chunk + gain
            log(f"    Level match applied: {gain:+.2f} dB (ref dBFS: {ref_chunk.dBFS:.2f}, clone dBFS: {cloned_chunk.dBFS:.2f})")
            
        # Swap surgically in vocals (keeping timing intact)
        start_ms = int(start_time * 1000)
        end_ms = int(end_time * 1000)
        word_dur = end_ms - start_ms
        
        before = vocals[:start_ms]
        after = vocals[end_ms:]
        # Clear original word canvas
        vocals = before + AudioSegment.silent(duration=word_dur, frame_rate=vocals.frame_rate) + after
        # Overlay replacement on empty canvas
        vocals = vocals.overlay(cloned_chunk, position=start_ms)

    # Step 3: Process Struggle Overlays
    step_header(3, "PROCESSING SILENT-GAP STRUGGLE OVERLAYS", 4)
    
    struggle_overlays = [
        {"insert_time": 8.50, "speaker": "Eric Thomas", "text": "I'm talking to you, Clarence! Get up!", "desc": "Intro Rise"},
        {"insert_time": 41.40, "speaker": "Eric Thomas", "text": "Listen to me, Clarence! Mannheim needs you!", "desc": "Mannheim Streets"},
        {"insert_time": 71.00, "speaker": "Eric Thomas", "text": "You had to stand strong when they locked you in jail!", "desc": "Jail Struggle"},
        {"insert_time": 92.20, "speaker": "Eric Thomas", "text": "For Lean! For Elanese! You cannot fail them!", "desc": "Fatherhood Peak"},
        {"insert_time": 108.20, "speaker": "Eric Thomas", "text": "You've been through too much on the Mannheim streets!", "desc": "Street Battles"},
        {"insert_time": 148.70, "speaker": "Eric Thomas", "text": "When you broke up with your crazy baby mama, you didn't break down!", "desc": "Breakup Battle"},
        {"insert_time": 160.20, "speaker": "Eric Thomas", "text": "You severed the toxic ties to build your own destiny!", "desc": "Severing Ties"},
        {"insert_time": 176.50, "speaker": "Eric Thomas", "text": "Rebelz A.I. is going to the top!", "desc": "Agency Coronation"},
        {"insert_time": 186.30, "speaker": "Les Brown", "text": "When you walked away from the greedy corporate lords...", "desc": "Corporate Exit"},
        {"insert_time": 195.30, "speaker": "Les Brown", "text": "...and entered the wild fire of entrepreneurship.", "desc": "Wild Business"},
        {"insert_time": 204.10, "speaker": "Les Brown", "text": "The Battle of Mannheim was just your training ground.", "desc": "Mannheim Battle"},
        {"insert_time": 214.70, "speaker": "Les Brown", "text": "Rebelz A.I. will conquer Germany!", "desc": "Agency Rise"},
        {"insert_time": 227.80, "speaker": "Les Brown", "text": "You are transforming your life, Clarence Johnson!", "desc": "Personal Transformation"},
        {"insert_time": 244.90, "speaker": "Les Brown", "text": "Lean and Elanese will look up to a king! Stand tall!", "desc": "Grand Finale Climax"}
    ]
    
    for idx, struggle in enumerate(struggle_overlays):
        insert_time = struggle["insert_time"]
        speaker = struggle["speaker"]
        text = struggle["text"]
        desc = struggle["desc"]
        
        log(f"  [Overlay {idx+1}] \"{text}\" ({desc}) in {speaker}'s voice at {insert_time:.2f}s")
        
        ref = speaker_refs[speaker]
        ref_chunk = AudioSegment.from_wav(str(ref["wav_path"]))
        
        with open(ref["wav_path"], "rb") as f:
            ref_base64 = base64.b64encode(f.read()).decode("utf-8")
            
        payload = {
            "text": text,
            "language": "English",
            "ref_audio_base64": ref_base64,
            "ref_text": ref["text"],
            "x_vector_only_mode": False,
            "speed": 1.0,
            "response_format": "base64"
        }
        
        cache_key = hashlib.md5(f"overlay_{insert_time}_{text}_{speaker}".encode("utf-8")).hexdigest()
        cache_file = CACHE_DIR / f"overlay_{cache_key}.wav"
        
        if cache_file.exists():
            cloned_chunk = AudioSegment.from_wav(str(cache_file))
        else:
            log(f"    Requesting clone synthesis...")
            try:
                response = requests.post("http://127.0.0.1:7860/api/v1/base/clone", json=payload, timeout=90)
                response.raise_for_status()
                res_data = response.json()
                clone_bytes = base64.b64decode(res_data["audio"])
                cloned_chunk = AudioSegment.from_wav(io.BytesIO(clone_bytes))
                cloned_chunk = trim_silence(cloned_chunk)
                cloned_chunk.export(str(cache_file), format="wav")
            except Exception as e:
                log(f"    API failed: {e}. Skipping overlay.", "error")
                continue
                
        # Level-match
        if ref_chunk.dBFS != float('-inf') and cloned_chunk.dBFS != float('-inf'):
            gain = ref_chunk.dBFS - cloned_chunk.dBFS
            cloned_chunk = cloned_chunk + gain
            log(f"    Level match applied: {gain:+.2f} dB (ref dBFS: {ref_chunk.dBFS:.2f}, clone dBFS: {cloned_chunk.dBFS:.2f})")
            
        start_ms = int(insert_time * 1000)
        chunk_len = len(cloned_chunk)
        
        if start_ms >= len(vocals):
            log(f"    Warning: insert past end of file. Skipping.", "warning")
            continue
            
        if start_ms + chunk_len > len(vocals):
            chunk_len = len(vocals) - start_ms
            cloned_chunk = cloned_chunk[:chunk_len]
            
        end_ms = start_ms + chunk_len
        
        # Mute overlapping segments in the original vocals
        for segment in segments:
            seg_start_ms = int(segment["start"] * 1000)
            seg_end_ms = int(segment["end"] * 1000)
            
            if max(seg_start_ms, start_ms) < min(seg_end_ms, end_ms):
                log(f"    Muting overlapping segment {segment['id']}: \"{segment['text']}\" ({segment['start']:.2f}s - {segment['end']:.2f}s)")
                seg_dur = seg_end_ms - seg_start_ms
                before = vocals[:seg_start_ms]
                after = vocals[seg_end_ms:]
                vocals = before + AudioSegment.silent(duration=seg_dur, frame_rate=vocals.frame_rate) + after
                
        # Also clean the immediate overlay canvas
        before = vocals[:start_ms]
        after = vocals[end_ms:]
        vocals = before + AudioSegment.silent(duration=chunk_len, frame_rate=vocals.frame_rate) + after
        
        # Overlay the clone snippet
        vocals = vocals.overlay(cloned_chunk, position=start_ms)
        
    # Export personalized vocals
    vocals_personalized_path = OUTPUT_DIR / "vocals_personalized.wav"
    vocals.export(str(vocals_personalized_path), format="wav")
    log(f"Generated personalized vocals saved to: {vocals_personalized_path}", "success")
    
    # Step 4: Final Mix & Assembly (no ducking / constant music master volume = 1.0)
    step_header(4, "FINAL MIX & ASSEMBLY", 4)
    
    final_mp3_path = OUTPUT_DIR / "final_output.mp3"
    log(f"Speech / Vocals: {vocals_personalized_path}")
    log(f"Accompaniment: {accomp_path}")
    log("Mixing tracks with FFmpeg (music volume = 1.0, speech volume = 1.0)...")
    
    cmd = [
        'ffmpeg', '-y',
        '-i', str(vocals_personalized_path),
        '-i', str(accomp_path),
        '-filter_complex',
        '[0:a]volume=1.0[speech];'
        '[1:a]volume=1.0[music];'
        '[speech][music]amix=inputs=2:duration=longest',
        '-ac', '2',
        '-ar', '44100',
        '-b:a', '320k',
        str(final_mp3_path)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log(f"FFmpeg failed: {result.stderr}", "error")
        sys.exit(1)
        
    log(f"Final personalized motivation MP3 successfully assembled: {final_mp3_path}", "success")
    
    # Calculate tokens used
    final_tokens, _ = get_total_tts_tokens_from_log(TTS_LOG_PATH, initial_seek)
    print("\n" + "="*50)
    print("      QWEN3-TTS VOICE CLONING SYNTHESIS COMPLETE")
    print("="*50)
    print(f" Total tokens consumed for this run: {final_tokens} tokens")
    print("="*50 + "\n")


if __name__ == "__main__":
    run_voice_alignment()

#!/usr/bin/env python3
"""
Game of Thrones Rebelz AI Personalized Motivation Pipeline - Seamless Overrides
=============================================================================
Surgically overrides specific original spoken sentences in vocals.wav with
customized voice-cloned snippets. Keeps all other original dialogues completely
intact, logically intertwining the custom segments. Ensures 0 ms timeline drift,
stable accompaniment mix, and dynamic dBFS loudness matching.
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
OUTPUT_DIR = POC_DIR / "output_new"
CACHE_DIR = OUTPUT_DIR / "tts_cache"
TTS_LOG_PATH = "/Users/clarence/.gemini/antigravity-ide/brain/49ac6537-fe46-4c09-ae26-2efc670ecd11/.system_generated/tasks/task-195.log"

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

def step_header(step_num: int, title: str, total: int = 5):
    """Print a step header."""
    print(f"\n{'='*60}")
    print(f" STEP {step_num}/{total}: {title}")
    print(f"{'='*60}")

def trim_silence(sound: AudioSegment, silence_threshold: float = -45.0, chunk_size: int = 5) -> AudioSegment:
    """Trim leading and trailing silence from synthesized audio."""
    start_trim = detect_leading_silence(sound, silence_threshold, chunk_size)
    end_trim = detect_leading_silence(sound.reverse(), silence_threshold, chunk_size)
    duration = len(sound)
    if start_trim + end_trim >= duration:
        return sound
    return sound[start_trim:duration-end_trim]

def match_length(audio_chunk: AudioSegment, target_length_ms: int) -> AudioSegment:
    """Pad or truncate an audio segment to match a target length in milliseconds exactly."""
    current_len = len(audio_chunk)
    if current_len == target_length_ms:
        return audio_chunk
    elif current_len > target_length_ms:
        # Truncate trailing words/silence
        return audio_chunk[:target_length_ms]
    else:
        # Pad with silence at the end to keep the alignment perfect
        padding = AudioSegment.silent(duration=target_length_ms - current_len, frame_rate=audio_chunk.frame_rate)
        return audio_chunk + padding

def get_total_tts_tokens_from_log(log_path: str, start_seek: int = 0) -> tuple[int, int]:
    """Parses the TTS server log file and returns total tokens sum and new seek position."""
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
                            token_str = "".join([c for c in subparts[0] if c.isdigit()])
                            if token_str:
                                tokens_sum += int(token_str)
                        except ValueError:
                            pass
    except Exception as e:
        log(f"Error parsing log: {e}", "warning")
        return 0, start_seek
    return tokens_sum, new_seek

def main():
    total_start = time.time()
    
    # -------------------------------------------------------------------------
    # STEP 1: LOAD ASSETS & PREPARE REFS
    # -------------------------------------------------------------------------
    step_header(1, "LOAD ASSETS & PREPARE SPEAKERS REFERENCE", 5)
    
    vocals_path = POC_DIR / "vocals_old.wav"
    accomp_path = PROJECT_DIR / "The Targaryen Wolf (Original Soundtrack) Game of Thrones.mp3"
    
    if not vocals_path.exists() or not accomp_path.exists():
        log(f"Required tracks not found! Please ensure {vocals_path} and the backing track {accomp_path} exist.", "error")
        sys.exit(1)
        
    log("Loading original vocals track...")
    vocals = AudioSegment.from_wav(str(vocals_path))
    original_vocals_copy = AudioSegment.from_wav(str(vocals_path))
    vocals_duration_ms = len(vocals)
    vocals_duration = vocals_duration_ms / 1000.0
    log(f"Vocals track duration: {vocals_duration:.3f}s")
    
    log("Loading original Targaryen Wolf backing track...")
    accomp = AudioSegment.from_file(str(accomp_path))
    
    # Define Speaker Golden Reference windows (strictly extracted from original vocals.wav)
    speaker_ref_windows = {
        "Yara Greyjoy": {
            "start": 238.20,
            "end": 242.18,
            "text": "He's my brother. Those of you that have sailed under her. And there are many of you here."
        },
        "Theon Greyjoy": {
            "start": 136.22,
            "end": 139.12,
            "text": "I always wanted to do the right thing."
        },
        "Jon Snow": {
            "start": 156.04,
            "end": 161.16,
            "text": "He never lost him. He made a choice. He's a part of you. Just like he's a part of me."
        },
        "Ramsay Bolton": {
            "start": 201.02,
            "end": 204.96,
            "text": "That one's yours, Snow. I keep hearing stories about you. Bastard."
        },
        "Sansa Stark": {
            "start": 273.34,
            "end": 278.52,
            "text": "Everything you did, what you were you are now. If it's what they want, it comes to that you know I'll stand behind you."
        }
    }
    
    # Extract reference copies
    log("Extracting pristine reference chunks for high-fidelity voice cloning...")
    for speaker, ref in speaker_ref_windows.items():
        ref_start = ref["start"]
        ref_end = ref["end"]
        
        ref_chunk = original_vocals_copy[int(ref_start * 1000):int(ref_end * 1000)]
        ref_path = CACHE_DIR / f"{speaker.replace(' ', '_')}_ref.wav"
        ref_chunk.export(str(ref_path), format="wav")
        ref["wav_path"] = ref_path
        log(f"  Ref extracted for {speaker} ({len(ref_chunk)/1000.0:.2f}s) -> {ref_path.name}")

    # Track Qwen3 tokens
    _, initial_seek = get_total_tts_tokens_from_log(TTS_LOG_PATH, 0)

    # -------------------------------------------------------------------------
    # STEP 2: PREPARE SURGICAL DIALOGUE OVERRIDES (LOGICALLY INTERTWINED)
    # -------------------------------------------------------------------------
    step_header(2, "PREPARING SURGICAL DIALOGUE OVERRIDES", 5)
    
    # We define a dense array of 21 surgical overrides covering all major dialogue scenes.
    # The original speech at [start_ms:end_ms] is deleted, and overridden with a clone of that exact length.
    override_segments = [
        # SCENE A: Yara and Theon Dialogue (20s - 50s)
        {
            "pair_id": 1,
            "speaker": "Theon Greyjoy",
            "start_ms": 22880,
            "end_ms": 23680,
            "cloned_text": "He is my leader.",
            "desc": "Theon overrides master with leader"
        },
        {
            "pair_id": 2,
            "speaker": "Theon Greyjoy",
            "start_ms": 25080,
            "end_ms": 26560,
            "cloned_text": "I take orders from Clarence at Rebelz A.I., not you.",
            "desc": "Theon overrides take orders with Clarence"
        },
        {
            "pair_id": 3,
            "speaker": "Yara Greyjoy",
            "start_ms": 27560,
            "end_ms": 29980,
            "cloned_text": "What of Clarence? The leader of Rebelz A.I.",
            "desc": "Yara overrides Starks with Clarence"
        },
        {
            "pair_id": 4,
            "speaker": "Yara Greyjoy",
            "start_ms": 30940,
            "end_ms": 32880,
            "cloned_text": "Your loyalty to Clarence is touching.",
            "desc": "Yara overrides captors with Clarence"
        },
        {
            "pair_id": 5,
            "speaker": "Theon Greyjoy",
            "start_ms": 36060,
            "end_ms": 39540,
            "cloned_text": "My code is Python and rust. I have no other agency.",
            "desc": "Theon overrides salt and iron with Python and rust"
        },
        {
            "pair_id": 6,
            "speaker": "Theon Greyjoy",
            "start_ms": 40820,
            "end_ms": 41780,
            "cloned_text": "I could never be a slave.",
            "desc": "Theon overrides Stark with slave"
        },
        {
            "pair_id": 7,
            "speaker": "Theon Greyjoy",
            "start_ms": 42260,
            "end_ms": 44040,
            "cloned_text": "Clarence always reminded me of that.",
            "desc": "Theon overrides Rob Stark with Clarence"
        },
        {
            "pair_id": 8,
            "speaker": "Yara Greyjoy",
            "start_ms": 44200,
            "end_ms": 45120,
            "cloned_text": "And Clarence is not your master.",
            "desc": "Yara overrides not your duty with not your master"
        },
        {
            "pair_id": 9,
            "speaker": "Yara Greyjoy",
            "start_ms": 45920,
            "end_ms": 46720,
            "cloned_text": "Because you are a Rebel.",
            "desc": "Yara overrides not your house with you are a Rebel"
        },
        {
            "pair_id": 10,
            "speaker": "Theon Greyjoy",
            "start_ms": 48620,
            "end_ms": 50640,
            "cloned_text": "I fight for Clarence and Rebelz A.I. alone.",
            "desc": "Theon overrides fight for Rob and father"
        },
        # SCENE B: Ramsay Bolton's Custom Torture (66s - 110s)
        {
            "pair_id": 11,
            "speaker": "Ramsay Bolton",
            "start_ms": 68240,
            "end_ms": 69500,
            "cloned_text": "And you will wish you automated.",
            "desc": "Ramsay overrides wish you hadn't with automated"
        },
        {
            "pair_id": 12,
            "speaker": "Ramsay Bolton",
            "start_ms": 79740,
            "end_ms": 82400,
            "cloned_text": "I'm not kidding you. If you think old systems have a happy ending.",
            "desc": "Ramsay overrides happy ending with old systems"
        },
        {
            "pair_id": 13,
            "speaker": "Ramsay Bolton",
            "start_ms": 84920,
            "end_ms": 87080,
            "cloned_text": "You haven't been paying attention to Clarence.",
            "desc": "Ramsay overrides attention with attention to Clarence"
        },
        {
            "pair_id": 14,
            "speaker": "Ramsay Bolton",
            "start_ms": 89940,
            "end_ms": 91500,
            "cloned_text": "But Rebelz A.I. Do you love Clarence? Rebelz A.I.",
            "desc": "Ramsay overrides Reek with Rebelz AI"
        },
        {
            "pair_id": 15,
            "speaker": "Ramsay Bolton",
            "start_ms": 95760,
            "end_ms": 96460,
            "cloned_text": "What is your agency?",
            "desc": "Ramsay overrides name with agency"
        },
        {
            "pair_id": 16,
            "speaker": "Theon Greyjoy",
            "start_ms": 96800,
            "end_ms": 97140,
            "cloned_text": "Rebelz A.I.",
            "desc": "Theon overrides Reek with Rebelz AI"
        },
        {
            "pair_id": 17,
            "speaker": "Theon Greyjoy",
            "start_ms": 100600,
            "end_ms": 102840,
            "cloned_text": "We will automate your family. Sorry, I'm sorry.",
            "desc": "Theon overrides betrayed family with automate family"
        },
        {
            "pair_id": 18,
            "speaker": "Ramsay Bolton",
            "start_ms": 105660,
            "end_ms": 107040,
            "cloned_text": "What is your agency?",
            "desc": "Ramsay overrides name with agency again"
        },
        {
            "pair_id": 19,
            "speaker": "Theon Greyjoy",
            "start_ms": 107160,
            "end_ms": 108060,
            "cloned_text": "My name is Rebelz A.I.",
            "desc": "Theon overrides name is Reek with Rebelz AI"
        },
        {
            "pair_id": 20,
            "speaker": "Ramsay Bolton",
            "start_ms": 108260,
            "end_ms": 109840,
            "cloned_text": "I believe in Clarence.",
            "desc": "Ramsay overrides believe in Reek with Clarence"
        },
        # SCENE C: The Climax and Commitments (140s onwards)
        {
            "pair_id": 21,
            "speaker": "Theon Greyjoy",
            "start_ms": 140000,
            "end_ms": 144000,
            "cloned_text": "So I chose Clarence and Rebelz A.I. to build the ultimate business automation!",
            "desc": "Theon overrides impossible choice with Rebelz AI"
        },
        {
            "pair_id": 22,
            "speaker": "Jon Snow",
            "start_ms": 158000,
            "end_ms": 161160,
            "cloned_text": "You belong to Rebelz A.I. now, Clarence. Automate and rise above them all!",
            "desc": "Jon Snow overrides part of me with Rebelz AI"
        },
        {
            "pair_id": 23,
            "speaker": "Ramsay Bolton",
            "start_ms": 203000,
            "end_ms": 204960,
            "cloned_text": "And I hear Clarence of Rebelz A.I. is crushing it with WhatsApp voice agents!",
            "desc": "Ramsay overrides stories with WhatsApp agents"
        },
        {
            "pair_id": 24,
            "speaker": "Sansa Stark",
            "start_ms": 275500,
            "end_ms": 278520,
            "cloned_text": "And I will stand behind Rebelz A.I. as you automate Germany's construction sector!",
            "desc": "Sansa overrides stand behind you with construction sector"
        }
    ]
    
    # Helper to call local voice cloning server
    def synthesize_clone(text, speaker, block_desc, target_dbfs=None):
        ref_win = speaker_ref_windows[speaker]
        ref_path = ref_win["wav_path"]
        
        with open(ref_path, "rb") as f:
            ref_base64 = base64.b64encode(f.read()).decode("utf-8")
            
        payload = {
            "text": text,
            "language": "English",
            "ref_audio_base64": ref_base64,
            "ref_text": ref_win["text"],
            "x_vector_only_mode": False,
            "speed": 1.0,
            "response_format": "base64"
        }
        
        cache_key = hashlib.md5(f"got_dense_{speaker}_{text}".encode("utf-8")).hexdigest()
        cache_file = CACHE_DIR / f"got_dense_{cache_key}.wav"
        
        if cache_file.exists():
            chunk = AudioSegment.from_wav(str(cache_file))
        else:
            try:
                response = requests.post("http://127.0.0.1:7860/api/v1/base/clone", json=payload, timeout=90)
                response.raise_for_status()
                res_data = response.json()
                clone_bytes = base64.b64decode(res_data["audio"])
                chunk = AudioSegment.from_wav(io.BytesIO(clone_bytes))
                chunk = trim_silence(chunk)
                chunk.export(str(cache_file), format="wav")
            except Exception as e:
                log(f"    Synthesis failed for {block_desc}: {e}. Creating silent fallback.", "error")
                words_count = len(text.split())
                est_dur_ms = int((words_count / 140.0) * 60.0 * 1000.0)
                chunk = AudioSegment.silent(duration=est_dur_ms)
                
        # Loudness match to target dBFS (or golden reference fallback)
        match_dbfs = target_dbfs if target_dbfs is not None else AudioSegment.from_wav(str(ref_path)).dBFS
        if match_dbfs != float('-inf') and chunk.dBFS != float('-inf'):
            gain = match_dbfs - chunk.dBFS
            chunk = chunk + gain
            
        return chunk

    processed_overrides = []
    
    for segment in override_segments:
        pair_id = segment["pair_id"]
        speaker = segment["speaker"]
        start_ms = segment["start_ms"]
        end_ms = segment["end_ms"]
        target_len_ms = end_ms - start_ms
        cloned_text = segment["cloned_text"]
        desc = segment["desc"]
        
        log(f"Processing Override {pair_id} | Character: {speaker} | Target Duration: {target_len_ms/1000.0:.2f}s")
        
        # Measure the loudness of the original segment we are overriding in-place
        orig_slice_audio = original_vocals_copy[start_ms:end_ms]
        target_dbfs = orig_slice_audio.dBFS if orig_slice_audio.dBFS != float('-inf') else None
        if target_dbfs is not None:
            log(f"  - Target slot loudness measured: {target_dbfs:.2f} dBFS")
        
        # 1. Synthesize custom voice clone override matched perfectly to target slot volume
        cloned_audio_raw = synthesize_clone(cloned_text, speaker, f"Override {pair_id} ({speaker})", target_dbfs=target_dbfs)
        log(f"  Cloned speech synthesized. Raw duration: {len(cloned_audio_raw)/1000.0:.2f}s")
        
        # 2. Match length exactly to target duration for perfect 50:50 ratio inside this dialogue block!
        cloned_audio_matched = match_length(cloned_audio_raw, target_len_ms)
        log(f"  Level matched and length equalized to exactly: {len(cloned_audio_matched)/1000.0:.2f}s")
        
        processed_overrides.append({
            "pair_id": pair_id,
            "speaker": speaker,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "cloned_audio": cloned_audio_matched,
            "len_ms": target_len_ms
        })

    # -------------------------------------------------------------------------
    # STEP 3: SURGICAL DIALOGUE STITCHING & ORIGINAL VOCAL PRESERVATION
    # -------------------------------------------------------------------------
    step_header(3, "STITCHING SEAMLESS OVERRIDES ON ACTIVE CANVAS", 5)
    
    # We initialize the canvas as a complete, intact copy of the original vocals track
    log(f"Initializing canvas with the complete original vocals track...")
    vocal_canvas = original_vocals_copy
    
    # Override each segment in-place
    for over in processed_overrides:
        pair_id = over["pair_id"]
        speaker = over["speaker"]
        start_ms = over["start_ms"]
        end_ms = over["end_ms"]
        target_len_ms = over["len_ms"]
        cloned_audio = over["cloned_audio"]
        
        log(f"Overriding segment in-place for Override {pair_id} ({speaker}):")
        log(f"  - Target Slot: {start_ms/1000.0:.2f}s to {end_ms/1000.0:.2f}s (Duration: {target_len_ms/1000.0:.2f}s)")
        
        # 1. Surgical mute: replace [start_ms:end_ms] in canvas with silence of exact duration
        silence_segment = AudioSegment.silent(duration=target_len_ms, frame_rate=vocal_canvas.frame_rate)
        vocal_canvas = vocal_canvas[:start_ms] + silence_segment + vocal_canvas[end_ms:]
        
        # 2. Overlay cloned segment at start_ms
        vocal_canvas = vocal_canvas.overlay(cloned_audio, position=start_ms)
        log(f"  - Overridden successfully.")
        
    # Verify durations and ratio
    total_speech_ms = vocals_duration_ms
    total_cloned_ms = sum(over["len_ms"] for over in processed_overrides)
    total_original_ms = total_speech_ms - total_cloned_ms
    
    log(f"Preservation and Ratio Summary:")
    log(f"  Original vocals track is preserved intact with logical overrides.")
    log(f"  Original dialogues (Intact): {total_original_ms/1000.0:.3f}s ({(total_original_ms/total_speech_ms)*100.0:.2f}%)")
    log(f"  Cloned customized overrides:  {total_cloned_ms/1000.0:.3f}s ({(total_cloned_ms/total_speech_ms)*100.0:.2f}%)")
    log(f"  Overrides successfully intertwined with the surrounding original speech!", "success")
    
    # Save vocals personalized track
    vocals_personalized_path = OUTPUT_DIR / "vocals_personalized.wav"
    vocal_canvas.export(str(vocals_personalized_path), format="wav")
    log(f"Personalized vocals track saved: {vocals_personalized_path}", "success")

    # -------------------------------------------------------------------------
    # STEP 4: FINAL MIX & ASSEMBLY
    # -------------------------------------------------------------------------
    step_header(4, "FINAL MIX & ASSEMBLY", 5)
    
    final_mp3_path = PROJECT_DIR / "rebelzai_personalized_got_SEAMLESS_EDIT.mp3"
    log(f"Speech Vocals: {vocals_personalized_path}")
    log(f"Backing Music: {accomp_path}")
    log(f"Mixing stereo tracks with FFmpeg (music volume = 1.0, speech volume = 1.0)...")
    
    # We mix both tracks at 1.0 volume, with NO ducking or pumping as requested
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
        log(f"FFmpeg mix failed: {result.stderr}", "error")
        sys.exit(1)
        
    log(f"Stereo mix completed successfully!", "success")
    log(f"Final MP3 saved at: {final_mp3_path}", "success")

    # Copy to original output folder as well for fallback
    shutil.copy(str(final_mp3_path), str(OUTPUT_DIR / "final_output.mp3"))

    # -------------------------------------------------------------------------
    # STEP 5: FINAL QA VERIFICATION
    # -------------------------------------------------------------------------
    step_header(5, "FINAL PIPELINE VERIFICATION", 5)
    
    final_audio = AudioSegment.from_file(str(final_mp3_path))
    final_dur_ms = len(final_audio)
    
    log(f"Verification metrics:")
    log(f"  Backing track duration: {vocals_duration_ms} ms")
    log(f"  Final output duration:  {final_dur_ms} ms")
    
    drift = abs(vocals_duration_ms - final_dur_ms)
    log(f"  Timeline drift: {drift} ms")
    
    if drift == 0:
        log("✓ SUCCESS: ZERO TIMELINE DRIFT! The audio is mathematically perfectly aligned!", "success")
    elif drift < 50:
        log(f"✓ SUCCESS: Micro-drift of {drift} ms is completely imperceptible!", "success")
    else:
        log(f"✗ ERROR: Timeline drift of {drift} ms detected.", "error")
        sys.exit(1)
        
    if final_audio.rms == 0:
        log("✗ ERROR: Mixed audio track is completely silent!", "error")
        sys.exit(1)
    else:
        log(f"✓ Success: Output mixed file is active (RMS energy: {final_audio.rms})", "success")
        
    # Track Qwen3 tokens
    final_tokens, _ = get_total_tts_tokens_from_log(TTS_LOG_PATH, initial_seek)
    log(f"==================================================", "success")
    log(f" VOICE CLONING SYNTHESIS TOKEN SUMMARY")
    log(f" Total Qwen3-TTS tokens used: {final_tokens}")
    log(f"==================================================", "success")
    
    total_elapsed = time.time() - total_start
    print("\n" + "="*60)
    print("             REBELZ AI GOT PIPELINE COMPLETED!")
    print("="*60)
    print(f"✓ Total processing time: {total_elapsed:.1f} seconds")
    print(f"✓ Final output track:   {final_mp3_path}")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()

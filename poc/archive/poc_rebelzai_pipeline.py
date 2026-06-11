#!/usr/bin/env python3
"""
Roar Bliss Personalized Motivation Pipeline - Rebelz AI Edition
===============================================================
Surgically generates a personalized motivational track for Clarence and Rebelz AI.
Interleaves original speech segments of Eric Thomas and Les Brown with high-fidelity
cloned voice snippets talking about Rebelz AI services, results, and Clarence's daughters.
Syncs with the energy profile of 'Ascend The Starless Sky No Choir.mp3'.
Maintains zero timeline drift and stable master mix volume.
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
OUTPUT_DIR = POC_DIR / "output_rebelzai"
CACHE_DIR = OUTPUT_DIR / "tts_cache"
BACKING_TRACK_PATH = Path("/Users/clarence/Music/Music/Media.localized/Music/Twelve Titans Music (2)/Binary/Ascend The Starless Sky No Choir.mp3")
VOCALS_SOURCE_PATH = POC_DIR / "output_icandothis" / "vocals.wav"

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

def main():
    total_start = time.time()
    
    # -------------------------------------------------------------------------
    # STEP 1: INITIALIZATION & VALIDATION
    # -------------------------------------------------------------------------
    step_header(1, "LOAD ASSETS & INITIALIZE TIMELINE", 5)
    
    if not BACKING_TRACK_PATH.exists():
        log(f"Backing track not found: {BACKING_TRACK_PATH}", "error")
        sys.exit(1)
        
    if not VOCALS_SOURCE_PATH.exists():
        log(f"Vocals source file not found: {VOCALS_SOURCE_PATH}", "error")
        sys.exit(1)
        
    log("Loading backing music track...")
    backing_music = AudioSegment.from_file(str(BACKING_TRACK_PATH))
    music_duration_ms = len(backing_music)
    log(f"Backing music duration: {music_duration_ms / 1000.0:.3f}s ({music_duration_ms} ms)")
    
    log("Loading original vocals track...")
    original_vocals = AudioSegment.from_wav(str(VOCALS_SOURCE_PATH))
    log(f"Original vocals duration: {len(original_vocals) / 1000.0:.3f}s")
    
    # Clean cache
    log("Initializing voice synthesis cache...")
    
    # Speaker references (from vocals.wav)
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
    
    # Extract reference chunks for cloning
    log("Extracting pure speaker references for high-fidelity voice cloning...")
    for speaker, ref in speaker_refs.items():
        start_ms = int(ref["start"] * 1000)
        end_ms = int(ref["end"] * 1000)
        ref_chunk = original_vocals[start_ms:end_ms]
        
        ref_path = CACHE_DIR / f"{speaker.replace(' ', '_')}_ref.wav"
        ref_chunk.export(str(ref_path), format="wav")
        ref["wav_path"] = ref_path
        log(f"  Ref extracted for {speaker} ({len(ref_chunk)/1000.0:.2f}s) -> {ref_path.name}")

    # -------------------------------------------------------------------------
    # STEP 2: PREPARE SPEECH BLOCKS (ORIGINAL & CLONED)
    # -------------------------------------------------------------------------
    step_header(2, "PREPARING SPEECH BLOCKS", 5)
    
    # We define the 10 speech blocks alternating original and cloned segments
    speech_timeline = [
        # BLOCK 1: Original ET (1.22s - 13.82s in vocals.wav)
        {
            "block_id": 1,
            "type": "original",
            "speaker": "Eric Thomas",
            "insert_time": 10.0,
            "text": "You can write everything down if you want to be brave enough to write every one of your goals down, but I'm going to tell you some life's going to hit you in your mouth and your why has to be greater than that knocked out!",
            "audio_slices": [(1220, 13820)]
        },
        # BLOCK 2: Cloned ET (Personalized Rebelz AI Mannheim introduction)
        {
            "block_id": 2,
            "type": "cloned",
            "speaker": "Eric Thomas",
            "insert_time": 24.0,
            "text": "Clarence, you built Rebelz A.I. right here in Mannheim to conquer that very chaos! When German, Austrian, and Swiss construction companies are drowning in folders, paperwork, and claims, you step in with systems that dominate!",
        },
        # BLOCK 3: Original LB (178.26s - 189.58s in vocals.wav)
        {
            "block_id": 3,
            "type": "original",
            "speaker": "Les Brown",
            "insert_time": 50.0,
            "text": "When I start trying to convince myself, I can be a businessman after flopping and failing and losing thousands of dollars and feeling stupid and dumb. I had to talk to myself because people were saying to me that I was dumb.",
            "audio_slices": [(178260, 189580)]
        },
        # BLOCK 4: Cloned LB (Rebelz AI DACH region services)
        {
            "block_id": 4,
            "type": "cloned",
            "speaker": "Les Brown",
            "insert_time": 64.0,
            "text": "But Clarence, you proved them all wrong! Across the DACH region, you are the pioneer, automating small teams with WhatsApp Automatisierung and custom Voice Agents, saving them eight hours of pure grind every single week!",
        },
        # BLOCK 5: Original ET (92.56s - 102.36s and 111.02s - 116.34s in vocals.wav)
        {
            "block_id": 5,
            "type": "original",
            "speaker": "Eric Thomas",
            "insert_time": 86.0,
            "text": "When you want to quit and give up, your why's going to give you that lift that you need. When that thing tells you to quit, you look at it in his eye and say, I ain't going! It's not about skill, it's about stamina!",
            "audio_slices": [(92560, 102360), (111020, 116340)]
        },
        # BLOCK 6: Cloned ET (Dragon stamina, Baustellen-Dokumentenmanagement shield)
        {
            "block_id": 6,
            "type": "cloned",
            "speaker": "Eric Thomas",
            "insert_time": 103.0,
            "text": "You have the stamina of the dragon, Clarence! You structured the chaos of the building site into pure profit! Baustellen-Dokumentenmanagement is your shield, automatically sorting photos and plans by trade, and automated lead capture is your sword!",
        },
        # BLOCK 7: Original LB (200.96s - 204.06s and 207.58s - 214.62s in vocals.wav)
        {
            "block_id": 7,
            "type": "original",
            "speaker": "Les Brown",
            "insert_time": 140.0,
            "text": "This is a tuition you have to pay for what you don't know. You got to say yes, yes to my dreams, yes to me, I can make it!",
            "audio_slices": [(200960, 204060), (207580, 214620)]
        },
        # BLOCK 8: Cloned LB (One-person powerhouse, real construction experience)
        {
            "block_id": 8,
            "type": "cloned",
            "speaker": "Les Brown",
            "insert_time": 152.0,
            "text": "Rebelz A.I. is not just another agency, it is a revolution! A one-person powerhouse that combines your real-world construction experience with custom KI-Agenten-Systeme, lifting small teams to heights they never dreamed of!",
        },
        # BLOCK 9: Original LB (232.82s - 242.60s in vocals.wav)
        {
            "block_id": 9,
            "type": "original",
            "speaker": "Les Brown",
            "insert_time": 245.0,
            "text": "The last chapter to my life has not been written yet. If you judge me now, you judge me prematurely. I'm still in the process of transforming my life.",
            "audio_slices": [(232820, 242600)]
        },
        # BLOCK 10: Cloned LB (Daughters Lean and Elanese, final coronation peak)
        {
            "block_id": 10,
            "type": "cloned",
            "speaker": "Les Brown",
            "insert_time": 256.0,
            "text": "Lean and Elanese will look up to a father who conquered the digital arena of Mannheim! Rebelz A.I. is destined for total market dominance! Rise, Clarence, and build the number one A.I. agency in Germany!",
        }
    ]
    
    # Process speech clips
    processed_blocks = []
    
    for block in speech_timeline:
        block_id = block["block_id"]
        speaker = block["speaker"]
        b_type = block["type"]
        insert_time = block["insert_time"]
        
        log(f"Processing Block {block_id} ({b_type.upper()}) | Speaker: {speaker} | Insert at {insert_time:.1f}s")
        
        ref = speaker_refs[speaker]
        ref_chunk = AudioSegment.from_wav(str(ref["wav_path"]))
        
        if b_type == "original":
            # Extract slices and stitch them
            slices = []
            for start, end in block["audio_slices"]:
                slices.append(original_vocals[start:end])
            block_audio = AudioSegment.silent(duration=0)
            for sl in slices:
                block_audio += sl
            log(f"  Extracted original speech slices. Duration: {len(block_audio)/1000.0:.2f}s")
        
        else:
            # Voice Cloning Synthesis via Local API
            text = block["text"]
            
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
            
            cache_key = hashlib.md5(f"rebelzai_block_{block_id}_{text}".encode("utf-8")).hexdigest()
            cache_file = CACHE_DIR / f"block_{cache_key}.wav"
            
            if cache_file.exists():
                log(f"  Loading cloned speech from cache: {cache_file.name}", "success")
                block_audio = AudioSegment.from_wav(str(cache_file))
            else:
                log(f"  Requesting cloning synthesis from local MLX API for: \"{text[:45]}...\"")
                try:
                    response = requests.post("http://127.0.0.1:7860/api/v1/base/clone", json=payload, timeout=90)
                    response.raise_for_status()
                    res_data = response.json()
                    clone_bytes = base64.b64decode(res_data["audio"])
                    block_audio = AudioSegment.from_wav(io.BytesIO(clone_bytes))
                    block_audio = trim_silence(block_audio)
                    block_audio.export(str(cache_file), format="wav")
                    log(f"  Cloned speech synthesized successfully. Duration: {len(block_audio)/1000.0:.2f}s", "success")
                except Exception as e:
                    log(f"  Local cloning API failed: {e}. Generating silent fallback block.", "error")
                    # Make a reasonable silent block based on words count (approx 130 words per minute)
                    words_count = len(text.split())
                    est_dur_ms = int((words_count / 130.0) * 60.0 * 1000.0)
                    block_audio = AudioSegment.silent(duration=est_dur_ms)
                    
        # Apply automatic loudness matching to reference chunk dBFS
        if ref_chunk.dBFS != float('-inf') and block_audio.dBFS != float('-inf'):
            gain = ref_chunk.dBFS - block_audio.dBFS
            block_audio = block_audio + gain
            log(f"  Loudness matched to speaker reference: {gain:+.2f} dB (Target dBFS: {ref_chunk.dBFS:.2f})")
            
        processed_blocks.append({
            "block_id": block_id,
            "type": b_type,
            "speaker": speaker,
            "insert_time": insert_time,
            "audio": block_audio,
            "text": block["text"]
        })

    # -------------------------------------------------------------------------
    # STEP 3: CONSOLIDATED TIMELINE ASSEMBLY
    # -------------------------------------------------------------------------
    step_header(3, "STITCHING CONSOLIDATED SPEECH TRACK", 5)
    
    # Create empty silent vocal track matching backing track length EXACTLY
    log(f"Creating pristine empty vocal canvas of EXACTLY {music_duration_ms} ms...")
    vocal_canvas = AudioSegment.silent(duration=music_duration_ms, frame_rate=original_vocals.frame_rate)
    
    orig_sum_ms = 0
    clone_sum_ms = 0
    
    for block in processed_blocks:
        pos_ms = int(block["insert_time"] * 1000)
        dur_ms = len(block["audio"])
        
        log(f"Stitching Block {block['block_id']} ({block['type'].upper()}) at {block['insert_time']:.1f}s | Duration: {dur_ms/1000.0:.2f}s")
        
        # Overlay on canvas
        vocal_canvas = vocal_canvas.overlay(block["audio"], position=pos_ms)
        
        if block["type"] == "original":
            orig_sum_ms += dur_ms
        else:
            clone_sum_ms += dur_ms
            
    # Verify final durations and ratio
    total_speech_ms = orig_sum_ms + clone_sum_ms
    orig_ratio = (orig_sum_ms / total_speech_ms) * 100.0 if total_speech_ms > 0 else 0
    clone_ratio = (clone_sum_ms / total_speech_ms) * 100.0 if total_speech_ms > 0 else 0
    
    log(f"Speech ratio summary:")
    log(f"  Original Speeches: {orig_sum_ms/1000.0:.2f}s ({orig_ratio:.1f}%)")
    log(f"  Cloned Voice Snippets: {clone_sum_ms/1000.0:.2f}s ({clone_ratio:.1f}%)")
    log(f"  Speech Ratio: {orig_ratio:.1f} : {clone_ratio:.1f}")
    
    # Save vocals personalized track
    vocals_personalized_path = OUTPUT_DIR / "vocals_personalized.wav"
    vocal_canvas.export(str(vocals_personalized_path), format="wav")
    log(f"Personalized vocals track saved: {vocals_personalized_path}", "success")

    # -------------------------------------------------------------------------
    # STEP 4: FINAL STEREO MASTER MIX
    # -------------------------------------------------------------------------
    step_header(4, "FINAL MIX & ASSEMBLY", 5)
    
    final_output_path = OUTPUT_DIR / "rebelzai_personalized.mp3"
    log(f"Speech Vocals: {vocals_personalized_path}")
    log(f"Backing Music: {BACKING_TRACK_PATH}")
    log(f"Mixing stereo tracks with FFmpeg (music volume = 1.0, speech volume = 1.0)...")
    
    # We mix both tracks at 1.0 volume, with NO ducking or pumping as requested
    cmd = [
        'ffmpeg', '-y',
        '-i', str(vocals_personalized_path),
        '-i', str(BACKING_TRACK_PATH),
        '-filter_complex',
        '[0:a]volume=1.0[speech];'
        '[1:a]volume=1.0[music];'
        '[speech][music]amix=inputs=2:duration=longest',
        '-ac', '2',
        '-ar', '44100',
        '-b:a', '320k',
        str(final_output_path)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log(f"FFmpeg mix failed: {result.stderr}", "error")
        sys.exit(1)
        
    log(f"Stereo mix completed successfully!", "success")
    log(f"Final MP3 saved at: {final_output_path}", "success")

    # -------------------------------------------------------------------------
    # STEP 5: VERIFICATION
    # -------------------------------------------------------------------------
    step_header(5, "FINAL PIPELINE VERIFICATION", 5)
    
    if not final_output_path.exists():
        log("Final output file was not created!", "error")
        sys.exit(1)
        
    final_audio = AudioSegment.from_file(str(final_output_path))
    final_dur_ms = len(final_audio)
    
    log(f"Verification metrics:")
    log(f"  Backing track duration: {music_duration_ms} ms")
    log(f"  Final output duration:  {final_dur_ms} ms")
    
    drift = abs(music_duration_ms - final_dur_ms)
    log(f"  Timeline drift: {drift} ms")
    
    if drift == 0:
        log("✓ SUCCESS: ZERO TIMELINE DRIFT! The audio is perfectly aligned!", "success")
    elif drift < 50:
        log(f"✓ SUCCESS: Micro-drift of {drift} ms is completely imperceptible!", "success")
    else:
        log(f"⚠️ Warning: Timeline drift of {drift} ms detected.", "warning")
        
    if final_audio.rms == 0:
        log("✗ ERROR: The mixed audio file is completely silent!", "error")
        sys.exit(1)
    else:
        log(f"✓ Success: Output mixed file is active (RMS energy: {final_audio.rms})", "success")
        
    total_elapsed = time.time() - total_start
    print("\n" + "="*60)
    print("             REBELZ AI PIPELINE RUN COMPLETE!")
    print("="*60)
    print(f"✓ Total processing time: {total_elapsed:.1f} seconds")
    print(f"✓ Final output track:   {final_output_path}")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()

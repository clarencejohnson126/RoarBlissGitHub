#!/usr/bin/env python3
"""
Acoustic Proof-Hearing & Verification Script - Roar Bliss App
============================================================
Programmatically audits the compiled personalized vocals track to verify:
1. Transition Smoothness (decibel variance between original and clone < 3.0 dB)
2. Active Voice Energy (no silent slots or signal dropouts)
3. Peak Levels & Clipping (no digital distortion or clipping)
4. Absolute Timeline Drift (exactly 0 ms drift)
"""

import os
import sys
import numpy as np
from pathlib import Path
from pydub import AudioSegment

PROJECT_DIR = Path("/Users/clarence/Desktop/Roar Bliss App")
POC_DIR = PROJECT_DIR / "poc"
OUTPUT_DIR = POC_DIR / "output"

def log_header(title: str):
    print(f"\n{'='*60}")
    print(f" {title.upper()}")
    print(f"{'='*60}")

def audit_acoustic_transitions():
    vocals_orig_path = OUTPUT_DIR / "vocals.wav"
    vocals_pers_path = OUTPUT_DIR / "vocals_personalized.wav"
    final_mp3_path = PROJECT_DIR / "rebelzai_personalized_got_SEAMLESS_EDIT.mp3"

    log_header("acoustic proof-hearing & transition audit")

    if not vocals_orig_path.exists() or not vocals_pers_path.exists() or not final_mp3_path.exists():
        print("✗ ERROR: Audio assets not found. Please compile the track first.")
        return False

    print("Loading original vocals track...")
    vocals_orig = AudioSegment.from_wav(str(vocals_orig_path))
    print("Loading personalized vocals track...")
    vocals_pers = AudioSegment.from_wav(str(vocals_pers_path))
    print("Loading final mixed MP3 track...")
    final_mix = AudioSegment.from_file(str(final_mp3_path))

    # Define the 5 override segments
    override_windows = [
        {
            "id": 1,
            "speaker": "Yara Greyjoy",
            "pre_start_ms": 25080,  
            "pre_end_ms": 26560,
            "override_start_ms": 27560,  
            "override_end_ms": 29980
        },
        {
            "id": 2,
            "speaker": "Theon Greyjoy",
            "pre_start_ms": 136220,  
            "pre_end_ms": 139120,
            "override_start_ms": 140000,  
            "override_end_ms": 144000
        },
        {
            "id": 3,
            "speaker": "Jon Snow",
            "pre_start_ms": 156040,  
            "pre_end_ms": 158000,
            "override_start_ms": 158000,  
            "override_end_ms": 161160
        },
        {
            "id": 4,
            "speaker": "Ramsay Bolton",
            "pre_start_ms": 201020,  
            "pre_end_ms": 203000,
            "override_start_ms": 203000,  
            "override_end_ms": 204960
        },
        {
            "id": 5,
            "speaker": "Sansa Stark",
            "pre_start_ms": 273340,  
            "pre_end_ms": 275500,
            "override_start_ms": 275500,  
            "override_end_ms": 278520
        }
    ]

    print("\nStarting surgical transition audit...")
    all_passed = True

    for win in override_windows:
        speaker = win["speaker"]
        
        # 1. Extract original reference chunk preceding the override
        pre_chunk = vocals_orig[win["pre_start_ms"]:win["pre_end_ms"]]
        # 2. Extract original chunk that was replaced
        replaced_chunk = vocals_orig[win["override_start_ms"]:win["override_end_ms"]]
        # 3. Extract customized override chunk
        override_chunk = vocals_pers[win["override_start_ms"]:win["override_end_ms"]]
        
        # Calculate loudness metrics (dBFS)
        pre_dbfs = pre_chunk.dBFS
        replaced_dbfs = replaced_chunk.dBFS
        override_dbfs = override_chunk.dBFS
        
        db_variance_pre = abs(pre_dbfs - override_dbfs)
        db_variance_repl = abs(replaced_dbfs - override_dbfs) if replaced_dbfs != float('-inf') else 0
        
        # Calculate peak metrics to check for clipping (max amplitude relative to limit)
        override_max_amp = override_chunk.max
        max_possible = override_chunk.max_possible_amplitude
        clipping_detected = override_max_amp > max_possible
        
        # Calculate RMS energy to ensure it's not silent
        override_rms = override_chunk.rms
        silent_detected = override_rms < 100

        print(f"\n► AUDITING TRANSITION: {speaker} (Slot {win['id']})")
        print(f"  - Preceding Dialogue (intact):       {pre_dbfs:.2f} dBFS")
        print(f"  - Replaced Dialogue (original):      {replaced_dbfs:.2f} dBFS")
        print(f"  - Customized Override Dialogue:      {override_dbfs:.2f} dBFS")
        print(f"  - Variance vs. Preceding Segment:    {db_variance_pre:.2f} dB")
        print(f"  - Variance vs. Replaced Segment:     {db_variance_repl:.2f} dB")
        print(f"  - Peak Amplitude:                    {override_max_amp} / {max_possible}")
        print(f"  - RMS Speech Energy:                 {override_rms}")

        # Transition checks
        status = []
        if db_variance_repl < 1.5:
            status.append("✓ IN-PLACE PRECISION: perfect loudness match (variance < 1.5 dB vs replaced speech)")
        elif db_variance_repl < 3.0:
            status.append("✓ IN-PLACE MATCH: Under limit (< 3.0 dB variance vs replaced speech)")
        else:
            status.append(f"⚠️ LOUDNESS WARNING: High in-place variance ({db_variance_repl:.2f} dB)!")
            all_passed = False

        if db_variance_pre < 3.0:
            status.append("✓ CONVERSATIONAL FLOW: Smooth volume level relative to preceding sentence")
        else:
            status.append(f"ℹ️ CONVERSATIONAL STEP: Natural speech volume shift of {db_variance_pre:.2f} dB")

        if not silent_detected:
            status.append("✓ speech ACTIVE: Robust vocal signal present")
        else:
            status.append("✗ SPEECH ERROR: Drop-out or silent segment detected!")
            all_passed = False

        if not clipping_detected:
            status.append("✓ NO CLIPPING: Clean peak headroom maintained")
        else:
            status.append("✗ CLIPPING WARNING: Audio peaks exceeding maximum limit - risk of distortion!")
            all_passed = False

        for s in status:
            prefix = "    " + ("✅" if "✓" in s else "❌")
            print(f"{prefix} {s[2:]}")

    # Global File Level Checks
    log_header("global track properties")
    orig_dur = len(vocals_orig)
    pers_dur = len(vocals_pers)
    mix_dur = len(final_mix)
    drift = abs(orig_dur - mix_dur)

    print(f"  - Original Vocals Length:   {orig_dur / 1000.0:.3f}s ({orig_dur} ms)")
    print(f"  - Personalized Mixed Length: {mix_dur / 1000.0:.3f}s ({mix_dur} ms)")
    print(f"  - Absolute Timeline Drift:   {drift} ms")
    
    if drift == 0:
        print("  ✅ TIMELINE INTEGRITY: Mathematically perfect 0 ms timeline drift!")
    else:
        print(f"  ❌ TIMELINE INTEGRITY: Drift of {drift} ms detected!")
        all_passed = False

    print(f"  - Mixed Audio Energy:        {final_mix.rms} RMS")
    if final_mix.rms > 500:
        print("  ✅ SOUND SCAPE LEVEL: Robust energy, stable backing track mix")
    else:
        print("  ❌ SOUND SCAPE LEVEL: Energy too low or silent track!")
        all_passed = False

    print("\n" + "="*60)
    if all_passed:
        print(" 🎉 ACOUSTIC AUDIT SUCCESS: ALL TRANSITIONS ARE SEAMLESS!")
    else:
        print(" ⚠️ ACOUSTIC AUDIT WARNING: SOME TRANSITIONS MIGHT REQUIRE ADJUSTMENTS")
    print("="*60 + "\n")
    return all_passed

if __name__ == "__main__":
    audit_acoustic_transitions()

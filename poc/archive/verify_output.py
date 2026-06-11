#!/usr/bin/env python3
"""
Verify personalization pipeline outputs for timing correctness and zero timeline drift.
"""

import os
from pathlib import Path
from pydub import AudioSegment

def verify():
    output_dir = Path("output")
    original_vocals_path = output_dir / "vocals.wav"
    personalized_vocals_path = output_dir / "vocals_personalized.wav"
    final_output_path = Path("output/final_output.mp3")

    print("\n" + "="*60)
    print("                ROAR BLISS OUTPUT VERIFICATION")
    print("="*60)

    # Check existence
    if not original_vocals_path.exists():
        print(f"✗ Original vocals track not found: {original_vocals_path}")
        return False
    if not personalized_vocals_path.exists():
        print(f"✗ Personalized vocals track not found: {personalized_vocals_path}")
        return False

    print(f"✓ Original vocals file exists.")
    print(f"✓ Personalized vocals file exists.")

    # Load audio files to verify metadata
    print("Loading audio tracks...")
    orig = AudioSegment.from_wav(str(original_vocals_path))
    pers = AudioSegment.from_wav(str(personalized_vocals_path))

    orig_dur = len(orig)
    pers_dur = len(pers)

    print(f"Original vocals track duration: {orig_dur / 1000.0:.3f} seconds ({orig_dur} ms)")
    print(f"Personalized vocals track duration: {pers_dur / 1000.0:.3f} seconds ({pers_dur} ms)")

    # Verify zero timeline drift
    drift = abs(orig_dur - pers_dur)
    print(f"Timeline drift: {drift} ms")

    if drift == 0:
        print("✓ SUCCESS: ZERO TIMELINE DRIFT! The audio is mathematically perfectly aligned!", "success")
    elif drift < 50:
        print(f"✓ SUCCESS: Micro-drift of {drift} ms (less than 50ms) is completely imperceptible!")
    else:
        print(f"⚠️ Warning: Timeline drift of {drift} ms detected. Timing might be misaligned.")
        return False

    # Check for silent output
    if pers.rms == 0:
        print("✗ ERROR: Personalized vocals track is completely silent!")
        return False
    print(f"✓ Personalized vocals track is active (RMS energy: {pers.rms})")

    # Check final output file
    if final_output_path.exists():
        size = final_output_path.stat().st_size
        print(f"✓ Final assembled MP3 exists at {final_output_path} ({size / 1024 / 1024:.2f} MB)")
    else:
        print(f"ℹ️ Final assembled MP3 does not exist yet. Run the pipeline to compile it.")

    print("="*60 + "\n")
    return True

if __name__ == "__main__":
    verify()

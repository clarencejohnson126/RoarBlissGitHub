#!/usr/bin/env python3
"""
Test 05: Voice Cloning with Chatterbox
======================================
Tests if we can clone a voice and generate new speech.

Success Criteria:
- Voice clone captures speaker characteristics
- Generated speech is intelligible
- Output sounds similar to original speaker

Note: Chatterbox may not be available yet. This script includes
fallback options for testing with other TTS systems.
"""

import os
import sys
import json
from pathlib import Path

OUTPUT_DIR = Path("output")


def check_chatterbox():
    """Check if Chatterbox is available."""
    try:
        from chatterbox import ChatterboxTTS
        print("✓ Chatterbox is installed")
        return "chatterbox"
    except ImportError:
        print("✗ Chatterbox not installed")
        return None


def check_coqui():
    """Check if Coqui TTS is available (alternative)."""
    try:
        from TTS.api import TTS
        print("✓ Coqui TTS is installed (alternative)")
        return "coqui"
    except ImportError:
        print("✗ Coqui TTS not installed")
        return None


def check_dependencies():
    """Check available voice cloning options."""
    print("\nChecking voice cloning options...")

    engine = check_chatterbox()
    if engine:
        return engine

    engine = check_coqui()
    if engine:
        return engine

    print("\n" + "="*60)
    print("NO VOICE CLONING ENGINE FOUND")
    print("="*60)
    print("\nInstall one of these:")
    print("\n1. Chatterbox (recommended):")
    print("   pip install chatterbox-tts")
    print("   # or from source:")
    print("   pip install git+https://github.com/resemble-ai/chatterbox.git")
    print("\n2. Coqui TTS (alternative):")
    print("   pip install TTS")

    return None


def clone_voice_chatterbox(vocals_path: str, text: str, output_path: str):
    """Clone voice using Chatterbox."""
    from chatterbox import ChatterboxTTS

    print("\nInitializing Chatterbox...")
    tts = ChatterboxTTS()

    print(f"Cloning voice from: {vocals_path}")
    tts.clone_voice(
        audio_path=vocals_path,
        voice_name="original_speaker"
    )

    print(f"Generating speech: \"{text[:50]}...\"")
    audio = tts.generate(
        text=text,
        voice="original_speaker"
    )

    audio.save(output_path)
    print(f"✓ Saved to: {output_path}")

    return True


def clone_voice_coqui(vocals_path: str, text: str, output_path: str):
    """Clone voice using Coqui TTS (XTTS)."""
    from TTS.api import TTS

    print("\nInitializing Coqui TTS (XTTS-v2)...")
    print("(First run will download ~1.5GB model)")

    # Use XTTS-v2 for voice cloning
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")

    print(f"Cloning voice from: {vocals_path}")
    print(f"Generating speech: \"{text[:50]}...\"")

    tts.tts_to_file(
        text=text,
        speaker_wav=vocals_path,
        language="en",
        file_path=output_path
    )

    print(f"✓ Saved to: {output_path}")

    return True


def test_voice_cloning(engine: str, vocals_path: str, rewritten: dict) -> bool:
    """Test voice cloning with the available engine."""

    print(f"\n{'='*60}")
    print(f"VOICE CLONING TEST ({engine.upper()})")
    print(f"{'='*60}")

    # Get text to synthesize
    if rewritten and "segments" in rewritten:
        # Use first segment from LLM rewrite
        text = rewritten["segments"][0].get("new_text", "")
        if not text:
            text = "This is a test of the voice cloning system. Your motivation will be personalized."
    else:
        text = "This is a test of the voice cloning system. Your motivation will be personalized."

    output_path = str(OUTPUT_DIR / "new_speech.wav")

    print(f"\nVocals source: {vocals_path}")
    print(f"Text to synthesize ({len(text.split())} words):")
    print(f"  \"{text[:100]}...\"" if len(text) > 100 else f"  \"{text}\"")

    try:
        if engine == "chatterbox":
            clone_voice_chatterbox(vocals_path, text, output_path)
        elif engine == "coqui":
            clone_voice_coqui(vocals_path, text, output_path)
        else:
            print(f"✗ Unknown engine: {engine}")
            return False

        return True

    except Exception as e:
        print(f"\n✗ Voice cloning failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def analyze_output(output_path: str):
    """Basic analysis of generated audio."""

    print(f"\n{'='*60}")
    print("OUTPUT ANALYSIS")
    print(f"{'='*60}")

    if not os.path.exists(output_path):
        print(f"✗ Output file not found: {output_path}")
        return

    import soundfile as sf

    data, sr = sf.read(output_path)
    duration = len(data) / sr

    print(f"\nGenerated audio:")
    print(f"  Duration: {duration:.1f} seconds")
    print(f"  Sample rate: {sr} Hz")
    print(f"  File size: {os.path.getsize(output_path) / 1024:.1f} KB")

    print(f"\n{'='*60}")
    print("MANUAL EVALUATION REQUIRED")
    print(f"{'='*60}")
    print(f"\n1. Listen to the original vocals:")
    print(f"   {OUTPUT_DIR / 'vocals.wav'}")
    print(f"\n2. Listen to the generated speech:")
    print(f"   {output_path}")
    print(f"\n3. Evaluate:")
    print("   - Does it sound like the same speaker? (similarity)")
    print("   - Is the speech clear and natural? (quality)")
    print("   - Are the emotions appropriate? (expression)")


def create_mock_test():
    """Create a mock test when no engine is available."""

    print(f"\n{'='*60}")
    print("MOCK TEST (No voice cloning engine)")
    print(f"{'='*60}")

    print("\nWithout a voice cloning engine, we can still test:")
    print("1. ✓ Audio separation (Test 01)")
    print("2. ✓ Transcription (Test 02)")
    print("3. ✓ Audio analysis (Test 03)")
    print("4. ✓ LLM constraints (Test 04)")
    print("5. ⏸ Voice cloning (skipped)")
    print("6. ⏸ Final assembly (skipped)")

    print("\n" + "-"*60)
    print("RECOMMENDATION:")
    print("-"*60)
    print("\nInstall Coqui TTS for testing:")
    print("  pip install TTS")
    print("\nThis will allow you to test voice cloning locally.")
    print("Chatterbox may offer better quality once available.")

    return False


def main():
    print("\n" + "="*60)
    print(" ROAR BLISS POC - Test 05: Voice Cloning")
    print("="*60)

    # Check for vocals file
    vocals_path = OUTPUT_DIR / "vocals.wav"
    if not vocals_path.exists():
        print(f"\n✗ Vocals file not found: {vocals_path}")
        print("  Please run 01_test_separation.py first")
        sys.exit(1)

    # Load rewritten script if available
    rewritten_path = OUTPUT_DIR / "rewritten.json"
    rewritten = None
    if rewritten_path.exists():
        with open(rewritten_path) as f:
            rewritten = json.load(f)
        print(f"✓ Loaded rewritten script from {rewritten_path}")
    else:
        print(f"⚠️  No rewritten script found, using test text")

    # Check dependencies
    engine = check_dependencies()

    if not engine:
        create_mock_test()
        sys.exit(1)

    # Run voice cloning test
    success = test_voice_cloning(engine, str(vocals_path), rewritten)

    if success:
        analyze_output(str(OUTPUT_DIR / "new_speech.wav"))

        print("\n" + "="*60)
        print(" TEST 05 COMPLETE")
        print("="*60)
        print("\n✓ Voice cloning test completed")
        print("\nNext step: Run poc_pipeline.py for full integration test")
    else:
        print("\n✗ Voice cloning test failed")
        sys.exit(1)


if __name__ == "__main__":
    main()

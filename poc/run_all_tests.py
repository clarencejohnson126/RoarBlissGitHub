#!/usr/bin/env python3
"""
Run All Component Tests
=======================
Runs all POC tests in sequence and reports results.
"""

import subprocess
import sys
from pathlib import Path

TESTS = [
    ("01_test_separation.py", "Audio Separation (Demucs)"),
    ("02_test_transcription.py", "Transcription (Whisper)"),
    ("03_test_analysis.py", "Audio Analysis (librosa)"),
    ("04_test_llm.py", "LLM Constraints (Ollama)"),
    ("05_test_voice_clone.py", "Voice Cloning"),
]


def run_test(script: str, name: str) -> bool:
    """Run a test script and return success status."""
    print(f"\n{'='*60}")
    print(f" Running: {name}")
    print(f"{'='*60}")

    result = subprocess.run(
        [sys.executable, script],
        capture_output=False
    )

    return result.returncode == 0


def main():
    print("\n" + "="*60)
    print("      ROAR BLISS POC - Component Test Suite")
    print("="*60)

    # Check for test audio
    test_audio = Path("test_audio")
    audio_files = list(test_audio.glob("*.mp3")) + list(test_audio.glob("*.wav"))

    if not audio_files:
        print(f"\n✗ No test audio found in {test_audio}/")
        print("  Please add an MP3 or WAV file before running tests.")
        print("  Example: test_audio/input.mp3")
        sys.exit(1)

    print(f"\nTest audio: {audio_files[0]}")

    # Run tests
    results = {}

    for script, name in TESTS:
        if not Path(script).exists():
            print(f"\n⚠️  Test script not found: {script}")
            results[name] = None
            continue

        success = run_test(script, name)
        results[name] = success

        if not success:
            print(f"\n⚠️  Test failed: {name}")
            print("    Continuing with remaining tests...")

    # Summary
    print("\n" + "="*60)
    print("                    TEST SUMMARY")
    print("="*60)

    passed = 0
    failed = 0
    skipped = 0

    for name, success in results.items():
        if success is None:
            status = "⏸ SKIPPED"
            skipped += 1
        elif success:
            status = "✓ PASSED"
            passed += 1
        else:
            status = "✗ FAILED"
            failed += 1

        print(f"  {status}: {name}")

    print(f"\n{'='*60}")
    print(f"  TOTAL: {passed} passed, {failed} failed, {skipped} skipped")
    print(f"{'='*60}")

    if failed == 0 and passed > 0:
        print("\n✓ All tests passed! You can run the full pipeline:")
        print("  python poc_pipeline.py test_audio/input.mp3 --name 'Your Name' --goal 'Your Goal'")
    elif passed > 0:
        print("\n⚠️  Some tests failed. Review the output above.")
        print("    You may still be able to run the pipeline with limitations.")
    else:
        print("\n✗ All tests failed. Please check dependencies and setup.")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()

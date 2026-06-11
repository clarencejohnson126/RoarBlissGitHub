#!/usr/bin/env python3
"""
Test 02: Transcription with Whisper
===================================
Tests if we can accurately transcribe speech with word-level timestamps.

Success Criteria:
- Transcription is accurate (>90%)
- Word-level timestamps are present
- Timestamps are reasonably accurate (±0.3 seconds)
"""

import os
import sys
import json
from pathlib import Path

OUTPUT_DIR = Path("output")


def check_dependencies():
    """Check if required packages are installed."""
    try:
        import whisper
        print(f"✓ Whisper installed")
        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("  Install with: pip install openai-whisper")
        return False


def transcribe_audio(audio_path: str, output_dir: str = "output") -> dict:
    """
    Transcribe audio using Whisper with word-level timestamps.

    Args:
        audio_path: Path to audio file (preferably separated vocals)
        output_dir: Directory to save output files

    Returns:
        Transcription result dictionary
    """
    import whisper

    print(f"\n{'='*60}")
    print("TRANSCRIPTION TEST")
    print(f"{'='*60}")
    print(f"Input: {audio_path}")

    # Load model
    print("\nLoading Whisper model (base)...")
    print("(First run will download ~140MB model)")
    model = whisper.load_model("base")

    # Transcribe with word timestamps
    print("\nTranscribing (this may take a minute)...")
    result = model.transcribe(
        audio_path,
        word_timestamps=True,
        language="en",
        verbose=False
    )

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

    # Save to file
    output_path = os.path.join(output_dir, "transcript.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(transcript, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Saved transcript to: {output_path}")

    return transcript


def analyze_transcription(transcript: dict):
    """Analyze and display transcription results."""

    print(f"\n{'='*60}")
    print("TRANSCRIPTION RESULTS")
    print(f"{'='*60}")

    # Full text
    print(f"\nFull text ({len(transcript['text'].split())} words):")
    print("-"*60)
    # Show first 500 characters
    text = transcript["text"][:500]
    if len(transcript["text"]) > 500:
        text += "..."
    print(text)
    print("-"*60)

    # Segment info
    print(f"\nSegments: {len(transcript['segments'])}")

    # Word timestamp sample
    print("\nWord timestamp sample (first segment):")
    if transcript["segments"] and transcript["segments"][0].get("words"):
        first_seg = transcript["segments"][0]
        print(f"  Segment: \"{first_seg['text'][:50]}...\"")
        print(f"  Time: {first_seg['start']:.2f}s - {first_seg['end']:.2f}s")
        print("\n  Word timings:")
        for word in first_seg["words"][:5]:
            print(f"    [{word['start']:.2f}s - {word['end']:.2f}s] \"{word['word']}\"")
        if len(first_seg["words"]) > 5:
            print(f"    ... and {len(first_seg['words']) - 5} more words")

    # Calculate statistics
    total_words = sum(
        len(seg.get("words", []))
        for seg in transcript["segments"]
    )
    total_duration = transcript["segments"][-1]["end"] if transcript["segments"] else 0

    print(f"\n{'='*60}")
    print("STATISTICS")
    print(f"{'='*60}")
    print(f"Total words with timestamps: {total_words}")
    print(f"Total duration: {total_duration:.1f} seconds")
    print(f"Average words per second: {total_words / total_duration:.1f}" if total_duration > 0 else "N/A")

    # Quality check
    print(f"\n{'='*60}")
    print("QUALITY CHECK")
    print(f"{'='*60}")
    has_word_timestamps = total_words > 0
    print(f"Word-level timestamps present: {'✓ Yes' if has_word_timestamps else '✗ No'}")

    if not has_word_timestamps:
        print("\n⚠️  WARNING: Word timestamps not found!")
        print("    This may affect timing alignment.")
        print("    Try using a different Whisper model or audio quality.")

    return has_word_timestamps


def main():
    print("\n" + "="*60)
    print(" ROAR BLISS POC - Test 02: Transcription")
    print("="*60)

    # Check dependencies
    if not check_dependencies():
        sys.exit(1)

    # Check for vocals file from previous test
    vocals_path = OUTPUT_DIR / "vocals.wav"

    if not vocals_path.exists():
        print(f"\n✗ Vocals file not found: {vocals_path}")
        print("  Please run 01_test_separation.py first")
        sys.exit(1)

    print(f"\nUsing separated vocals: {vocals_path}")

    # Run transcription
    try:
        transcript = transcribe_audio(str(vocals_path))
        success = analyze_transcription(transcript)

        print("\n" + "="*60)
        print(" TEST 02 COMPLETE")
        print("="*60)

        if success:
            print("\n✓ Transcription successful with word timestamps")
            print("\nNext step: Run 03_test_analysis.py")
        else:
            print("\n⚠️  Transcription completed but missing word timestamps")
            print("    The pipeline may still work but timing will be less precise")

    except Exception as e:
        print(f"\n✗ Error during transcription: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

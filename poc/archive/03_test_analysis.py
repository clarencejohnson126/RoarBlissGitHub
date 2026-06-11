#!/usr/bin/env python3
"""
Test 03: Audio Analysis with librosa/madmom
===========================================
Tests if we can detect beats, energy peaks, and climax points.

Success Criteria:
- Beats detected with reasonable accuracy
- Energy curve extracted
- Climax points identified
"""

import os
import sys
import json
from pathlib import Path

OUTPUT_DIR = Path("output")


def check_dependencies():
    """Check if required packages are installed."""
    try:
        import librosa
        import numpy as np
        print(f"✓ librosa version: {librosa.__version__}")
        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        return False


def analyze_audio(audio_path: str, output_dir: str = "output") -> dict:
    """
    Analyze audio for beats, energy, and structure.

    Args:
        audio_path: Path to audio file (accompaniment for music analysis)
        output_dir: Directory to save output files

    Returns:
        Analysis result dictionary
    """
    import librosa
    import numpy as np
    from scipy.signal import find_peaks

    print(f"\n{'='*60}")
    print("AUDIO ANALYSIS TEST")
    print(f"{'='*60}")
    print(f"Input: {audio_path}")

    # Load audio
    print("\nLoading audio...")
    y, sr = librosa.load(audio_path, sr=None)
    duration = len(y) / sr
    print(f"Duration: {duration:.1f} seconds")
    print(f"Sample rate: {sr} Hz")

    # 1. BEAT DETECTION
    print("\nDetecting beats...")
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    tempo = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    print(f"Tempo: {tempo:.1f} BPM")
    print(f"Beats detected: {len(beat_times)}")

    # 2. ENERGY CURVE (RMS)
    print("\nCalculating energy curve...")
    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.times_like(rms, sr=sr)

    # Normalize RMS
    rms_normalized = (rms - rms.min()) / (rms.max() - rms.min() + 1e-8)

    # 3. CLIMAX POINTS (energy peaks)
    print("\nFinding climax points...")
    # Find peaks in RMS with minimum distance of 5 seconds
    min_distance = int(5 * sr / 512)  # Convert 5 seconds to frames
    peaks, properties = find_peaks(
        rms_normalized,
        height=0.5,  # At least 50% of max energy
        distance=min_distance
    )
    climax_times = rms_times[peaks].tolist()
    print(f"Climax points found: {len(climax_times)}")

    # 4. ONSET DETECTION (sound events)
    print("\nDetecting sound onsets...")
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    print(f"Onsets detected: {len(onset_times)}")

    # 5. SPECTRAL CENTROID (brightness)
    print("\nCalculating spectral features...")
    spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

    # Build analysis result
    analysis = {
        "duration": float(duration),
        "sample_rate": int(sr),
        "tempo": float(tempo),
        "beats": beat_times.tolist(),
        "beat_count": len(beat_times),
        "climax_points": climax_times,
        "energy_curve": [
            {"time": float(t), "energy": float(e)}
            for t, e in zip(rms_times[::10], rms_normalized[::10])  # Sample every 10 frames
        ],
        "onset_times": onset_times[:100].tolist(),  # First 100 onsets
        "onset_count": len(onset_times)
    }

    # Save to file
    output_path = os.path.join(output_dir, "analysis.json")
    with open(output_path, "w") as f:
        json.dump(analysis, f, indent=2)

    print(f"\n✓ Saved analysis to: {output_path}")

    return analysis


def display_analysis(analysis: dict):
    """Display analysis results in a readable format."""

    print(f"\n{'='*60}")
    print("ANALYSIS RESULTS")
    print(f"{'='*60}")

    print(f"\nDuration: {analysis['duration']:.1f} seconds")
    print(f"Tempo: {analysis['tempo']:.1f} BPM")

    # Beat distribution
    print(f"\n--- BEATS ({analysis['beat_count']} total) ---")
    beats = analysis['beats']
    if beats:
        print(f"First 10 beats: {[f'{b:.2f}s' for b in beats[:10]]}")
        avg_interval = sum(beats[i+1] - beats[i] for i in range(min(10, len(beats)-1))) / min(10, len(beats)-1)
        print(f"Average beat interval: {avg_interval:.3f}s ({60/avg_interval:.1f} BPM)")

    # Climax points
    print(f"\n--- CLIMAX POINTS ({len(analysis['climax_points'])} total) ---")
    for i, climax in enumerate(analysis['climax_points'][:5]):
        mins = int(climax // 60)
        secs = climax % 60
        print(f"  Climax {i+1}: {mins}:{secs:05.2f}")

    # Energy curve visualization (ASCII)
    print(f"\n--- ENERGY CURVE (simplified) ---")
    energy_data = analysis['energy_curve']
    if energy_data:
        # Sample to 50 points
        step = max(1, len(energy_data) // 50)
        sampled = energy_data[::step][:50]

        # ASCII visualization
        max_height = 10
        for row in range(max_height, 0, -1):
            threshold = row / max_height
            line = ""
            for point in sampled:
                if point['energy'] >= threshold:
                    line += "█"
                else:
                    line += " "
            print(f"  {line}")
        print(f"  {'─' * len(sampled)}")
        print(f"  0s{' ' * (len(sampled) - 10)}{analysis['duration']:.0f}s")

    # Quality assessment
    print(f"\n{'='*60}")
    print("QUALITY ASSESSMENT")
    print(f"{'='*60}")

    checks = [
        ("Beats detected", analysis['beat_count'] > 10),
        ("Tempo reasonable (60-180 BPM)", 60 <= analysis['tempo'] <= 180),
        ("Climax points found", len(analysis['climax_points']) > 0),
        ("Energy curve extracted", len(analysis['energy_curve']) > 0),
    ]

    all_passed = True
    for check_name, passed in checks:
        status = "✓" if passed else "✗"
        print(f"{status} {check_name}")
        if not passed:
            all_passed = False

    return all_passed


def main():
    print("\n" + "="*60)
    print(" ROAR BLISS POC - Test 03: Audio Analysis")
    print("="*60)

    # Check dependencies
    if not check_dependencies():
        sys.exit(1)

    # Check for accompaniment file
    accomp_path = OUTPUT_DIR / "accompaniment.wav"

    if not accomp_path.exists():
        print(f"\n✗ Accompaniment file not found: {accomp_path}")
        print("  Please run 01_test_separation.py first")
        sys.exit(1)

    print(f"\nUsing accompaniment: {accomp_path}")

    # Run analysis
    try:
        analysis = analyze_audio(str(accomp_path))
        success = display_analysis(analysis)

        print("\n" + "="*60)
        print(" TEST 03 COMPLETE")
        print("="*60)

        if success:
            print("\n✓ Audio analysis successful")
            print("\nNext step: Run 04_test_llm.py")
        else:
            print("\n⚠️  Some analysis checks failed")
            print("    Results may still be usable")

    except Exception as e:
        print(f"\n✗ Error during analysis: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

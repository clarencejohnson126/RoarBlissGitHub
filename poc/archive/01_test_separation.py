#!/usr/bin/env python3
"""
Test 01: Audio Separation with Demucs
=====================================
Tests if we can cleanly separate vocals from music/sounds.

Success Criteria:
- vocals.wav contains mostly speech, minimal music bleed
- accompaniment.wav contains music and sound effects
"""

import os
import sys
from pathlib import Path

# Create output directory
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

TEST_AUDIO_DIR = Path("test_audio")
TEST_AUDIO_DIR.mkdir(exist_ok=True)


def check_dependencies():
    """Check if required packages are installed."""
    try:
        import torch
        import torchaudio
        print(f"✓ PyTorch version: {torch.__version__}")
        print(f"✓ CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"  GPU: {torch.cuda.get_device_name(0)}")
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            print(f"  Apple Silicon MPS available")
        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        return False


def separate_audio(input_path: str, output_dir: str = "output") -> tuple[str, str]:
    """
    Separate audio into vocals and accompaniment using Demucs.

    Args:
        input_path: Path to input audio file
        output_dir: Directory to save output files

    Returns:
        Tuple of (vocals_path, accompaniment_path)
    """
    import torch
    import torchaudio
    from demucs import pretrained
    from demucs.apply import apply_model

    print(f"\n{'='*60}")
    print("AUDIO SEPARATION TEST")
    print(f"{'='*60}")
    print(f"Input: {input_path}")

    # Select device
    if torch.cuda.is_available():
        device = 'cuda'
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = 'mps'
    else:
        device = 'cpu'
    print(f"Device: {device}")

    # Load model
    print("\nLoading Demucs model (htdemucs)...")
    print("(First run will download ~1.5GB model)")
    model = pretrained.get_model('htdemucs')
    model.to(device)

    # Load audio
    print(f"\nLoading audio file...")
    wav, sr = torchaudio.load(input_path)
    print(f"Sample rate: {sr} Hz")
    print(f"Duration: {wav.shape[1] / sr:.1f} seconds")
    print(f"Channels: {wav.shape[0]}")

    # Ensure stereo
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)

    # Resample if needed (Demucs expects 44100 Hz)
    if sr != 44100:
        print(f"Resampling from {sr} to 44100 Hz...")
        resampler = torchaudio.transforms.Resample(sr, 44100)
        wav = resampler(wav)
        sr = 44100

    # Apply model
    print("\nSeparating audio (this may take a few minutes)...")
    wav = wav.to(device)

    with torch.no_grad():
        sources = apply_model(model, wav[None], device=device, progress=True)[0]

    # Sources order: drums, bass, other, vocals
    # Combine drums + bass + other as accompaniment
    vocals = sources[3].cpu()
    accompaniment = (sources[0] + sources[1] + sources[2]).cpu()

    # Save outputs
    vocals_path = os.path.join(output_dir, "vocals.wav")
    accomp_path = os.path.join(output_dir, "accompaniment.wav")

    torchaudio.save(vocals_path, vocals, sr)
    torchaudio.save(accomp_path, accompaniment, sr)

    print(f"\n✓ Saved vocals to: {vocals_path}")
    print(f"✓ Saved accompaniment to: {accomp_path}")

    return vocals_path, accomp_path


def analyze_separation_quality(vocals_path: str, accomp_path: str):
    """Basic quality analysis of separation."""
    import torchaudio

    print(f"\n{'='*60}")
    print("SEPARATION QUALITY CHECK")
    print(f"{'='*60}")

    vocals, sr = torchaudio.load(vocals_path)
    accomp, _ = torchaudio.load(accomp_path)

    # Calculate RMS energy
    vocals_rms = vocals.pow(2).mean().sqrt().item()
    accomp_rms = accomp.pow(2).mean().sqrt().item()

    print(f"\nVocals RMS energy: {vocals_rms:.4f}")
    print(f"Accompaniment RMS energy: {accomp_rms:.4f}")
    print(f"Ratio (vocals/accomp): {vocals_rms/accomp_rms:.2f}")

    print("\n" + "-"*60)
    print("MANUAL CHECK REQUIRED:")
    print("-"*60)
    print(f"1. Listen to: {vocals_path}")
    print("   → Should hear mostly speech, minimal music")
    print(f"\n2. Listen to: {accomp_path}")
    print("   → Should hear music and sound effects, minimal speech")
    print("-"*60)

    return True


def main():
    print("\n" + "="*60)
    print(" ROAR BLISS POC - Test 01: Audio Separation")
    print("="*60)

    # Check dependencies
    if not check_dependencies():
        print("\n✗ Please install dependencies first:")
        print("  pip install -r requirements.txt")
        sys.exit(1)

    # Find test audio
    test_files = list(TEST_AUDIO_DIR.glob("*.mp3")) + list(TEST_AUDIO_DIR.glob("*.wav"))

    if not test_files:
        print(f"\n✗ No test audio found in {TEST_AUDIO_DIR}/")
        print("  Please add an MP3 or WAV file to test_audio/")
        print("  Example: test_audio/input.mp3")
        sys.exit(1)

    input_path = str(test_files[0])
    print(f"\nUsing test file: {input_path}")

    # Run separation
    try:
        vocals_path, accomp_path = separate_audio(input_path)
        analyze_separation_quality(vocals_path, accomp_path)

        print("\n" + "="*60)
        print(" TEST 01 COMPLETE")
        print("="*60)
        print("\nNext step: Run 02_test_transcription.py")

    except Exception as e:
        print(f"\n✗ Error during separation: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

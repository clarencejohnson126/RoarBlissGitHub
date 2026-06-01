#!/usr/bin/env python3
import os
import wave
import math
import struct
from pathlib import Path

# Create test_audio directory
test_audio_dir = Path("test_audio")
test_audio_dir.mkdir(exist_ok=True)

output_path = test_audio_dir / "input.wav"

# Generate a 10-second stereo audio containing:
# Left channel: Voice (a sequence of beep patterns simulating speech)
# Right channel: Music (a rhythmic beat pattern)
sample_rate = 44100
duration = 10.0 # seconds
num_samples = int(sample_rate * duration)

print("Generating synthetic stereo audio...")
print(f"Duration: {duration} seconds")
print(f"Sample Rate: {sample_rate} Hz")

with wave.open(str(output_path), "w") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(sample_rate)
    
    for i in range(num_samples):
        t = i / sample_rate
        
        # Left channel: simulated vocals (sine wave modulated by a slow frequency)
        # Speak periods: 1.0s to 4.0s, and 5.0s to 9.0s
        vocal_signal = 0.0
        if (1.0 <= t <= 4.0) or (5.0 <= t <= 9.0):
            # Slow envelope modulation (3Hz) to simulate word pacing
            envelope = 0.5 + 0.5 * math.sin(2 * math.pi * 3.0 * t)
            # Carrier frequency (220Hz - low male pitch tone)
            carrier = math.sin(2 * math.pi * 220.0 * t)
            vocal_signal = envelope * carrier * 0.4
            
        # Right channel: simulated music (a rapid decay drum beat)
        # Beat occurs every 0.5 seconds (120 BPM)
        beat_t = t % 0.5
        beat_envelope = math.exp(-10.0 * beat_t) # rapid decay
        music_signal = beat_envelope * math.sin(2 * math.pi * 100.0 * t) * 0.5
        
        # Quantize to 16-bit PCM (-32768 to 32767)
        left_val = int(vocal_signal * 32767)
        right_val = int(music_signal * 32767)
        
        data = struct.pack("<hh", left_val, right_val)
        w.writeframesraw(data)

print(f"✓ Generated synthetic test audio successfully at: {output_path}")

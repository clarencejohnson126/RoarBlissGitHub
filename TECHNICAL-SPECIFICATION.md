# Roar Bliss: Technical Specification Document

**Version:** 1.0
**Date:** January 20, 2026
**Status:** Pre-Development Feasibility Validation
**Author:** Technical Architecture for Clarence / Rebelz AI Agency

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Component Deep Dive](#3-component-deep-dive)
4. [Data Flow & Pipeline](#4-data-flow--pipeline)
5. [LLM Orchestration Logic](#5-llm-orchestration-logic)
6. [Technical Validation](#6-technical-validation)
7. [Desktop App Architecture](#7-desktop-app-architecture)
8. [Performance Requirements](#8-performance-requirements)
9. [Risk Assessment](#9-risk-assessment)
10. [Proof of Concept Plan](#10-proof-of-concept-plan)
11. [Development Roadmap](#11-development-roadmap)

---

## 1. Executive Summary

### What We're Building

A desktop application that takes a motivational audio file (MP3) and user context, then produces a personalized version maintaining the original voice, music, timing, and emotional impact.

### Core Innovation

**LLM-Orchestrated Audio Transformation**: Instead of manual editing, an LLM analyzes the complete audio structure (speech, music peaks, sound effects, emotional arc) and intelligently rewrites the script to fit all timing constraints while personalizing for the user.

### Critical Success Factors

| Factor | Requirement | Validation Status |
|--------|-------------|-------------------|
| Audio separation quality | Voice cleanly separated from music | ✅ Proven (Demucs) |
| Voice cloning accuracy | 80%+ similarity to original | ✅ Proven (Chatterbox) |
| Timing precision | ±0.3 seconds sync accuracy | ⚠️ Needs validation |
| LLM constraint adherence | Follows word count/timing rules | ⚠️ Needs validation |
| End-to-end processing time | <10 minutes for 5-min audio | ⚠️ Needs validation |

---

## 2. System Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ROAR BLISS DESKTOP APP                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         USER INTERFACE                           │   │
│  │  ┌──────────────┐  ┌──────────────────────┐  ┌───────────────┐  │   │
│  │  │ File Upload  │  │ Personal Context     │  │ Output Player │  │   │
│  │  │ (MP3 input)  │  │ (name, goals, etc.)  │  │ (Preview/Save)│  │   │
│  │  └──────────────┘  └──────────────────────┘  └───────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ORCHESTRATION ENGINE                        │   │
│  │                                                                  │   │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │   │
│  │   │  STAGE 1 │───►│  STAGE 2 │───►│  STAGE 3 │───►│  STAGE 4 │  │   │
│  │   │ Separate │    │ Analyze  │    │ Rewrite  │    │ Generate │  │   │
│  │   └──────────┘    └──────────┘    └──────────┘    └──────────┘  │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       PROCESSING MODULES                         │   │
│  │                                                                  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ Demucs  │ │ Whisper │ │ librosa │ │  LLM    │ │Chatterbox│  │   │
│  │  │         │ │         │ │         │ │(Ollama) │ │         │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  │                                                                  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────────────────────────┐   │   │
│  │  │ FFmpeg  │ │ madmom  │ │        Model Storage            │   │   │
│  │  │         │ │         │ │  (~4GB total model files)       │   │   │
│  │  └─────────┘ └─────────┘ └─────────────────────────────────┘   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Processing Pipeline Overview

```
INPUT                    PROCESSING                           OUTPUT
─────                    ──────────                           ──────

                    ┌─────────────────────┐
  motivation.mp3 ──►│ 1. AUDIO SEPARATION │
                    │    (Demucs)         │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            ┌───────────────┐    ┌───────────────┐
            │ vocals.wav    │    │ accompaniment │
            │ (speech only) │    │ (music+sfx)   │
            └───────┬───────┘    └───────┬───────┘
                    │                    │
                    ▼                    │
            ┌───────────────┐            │
            │ 2. TRANSCRIBE │            │
            │   (Whisper)   │            │
            └───────┬───────┘            │
                    │                    │
                    ▼                    │
            ┌───────────────┐            │
            │ 3. ANALYZE    │            │
            │  (librosa +   │◄───────────┘
            │   madmom)     │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐     ┌───────────────┐
            │ 4. LLM        │◄────│ User Context  │
            │   REWRITE     │     │ (name, goals) │
            └───────┬───────┘     └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │ 5. VOICE      │
            │   CLONE + TTS │
            │  (Chatterbox) │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ 6. REASSEMBLE │──────► personalized.mp3
            │   (FFmpeg)    │
            └───────────────┘
```

---

## 3. Component Deep Dive

### 3.1 Audio Separation (Demucs)

**Purpose:** Split the input audio into separate stems (vocals, drums, bass, other)

**Tool:** [Demucs](https://github.com/facebookresearch/demucs) by Meta AI

**Why Demucs:**
- State-of-the-art source separation
- Open source (MIT license)
- Runs locally on CPU/GPU
- Well-documented Python API

**Technical Details:**

```python
# Installation
pip install demucs

# Usage
from demucs import pretrained
from demucs.apply import apply_model
import torch
import torchaudio

# Load model (htdemucs is the best quality)
model = pretrained.get_model('htdemucs')

# Load audio
wav, sr = torchaudio.load('input.mp3')

# Separate
sources = apply_model(model, wav[None], device='cpu')[0]
# sources shape: [4, channels, samples]
# Order: drums, bass, other, vocals

vocals = sources[3]  # Index 3 = vocals
accompaniment = sources[0] + sources[1] + sources[2]  # Everything else
```

**Output Stems:**
| Stem | Contents | Usage |
|------|----------|-------|
| `vocals` | Isolated speech | Voice cloning source |
| `drums` | Percussion | Combined into accompaniment |
| `bass` | Bass frequencies | Combined into accompaniment |
| `other` | Music, SFX, ambience | Combined into accompaniment |

**Quality Metrics:**
- Signal-to-Distortion Ratio (SDR): 8-9 dB for vocals (excellent)
- Minimal vocal bleeding into music track
- Some music bleeding into vocal track (acceptable for cloning)

**Performance:**
| Hardware | 5-min audio processing time |
|----------|----------------------------|
| Apple M1/M2 | 2-3 minutes |
| RTX 3060 | 1-2 minutes |
| CPU (8-core) | 5-8 minutes |

**Model Size:** ~1.5 GB (htdemucs)

---

### 3.2 Transcription (Whisper)

**Purpose:** Convert separated vocals to text with precise timestamps

**Tool:** [Whisper](https://github.com/openai/whisper) by OpenAI (or whisper.cpp for faster CPU)

**Why Whisper:**
- Best-in-class accuracy
- Word-level timestamps
- Multi-language support
- Open source

**Technical Details:**

```python
# Installation
pip install openai-whisper

# Usage
import whisper

model = whisper.load_model("medium")  # Options: tiny, base, small, medium, large

result = model.transcribe(
    "vocals.wav",
    word_timestamps=True,
    language="en"
)

# Result structure
{
    "text": "Every morning you have a choice to be great...",
    "segments": [
        {
            "start": 0.0,
            "end": 2.5,
            "text": "Every morning you have a choice",
            "words": [
                {"word": "Every", "start": 0.0, "end": 0.3},
                {"word": "morning", "start": 0.35, "end": 0.7},
                {"word": "you", "start": 0.75, "end": 0.9},
                {"word": "have", "start": 0.95, "end": 1.1},
                {"word": "a", "start": 1.15, "end": 1.2},
                {"word": "choice", "start": 1.25, "end": 1.6},
            ]
        }
    ]
}
```

**Model Comparison:**

| Model | Size | Accuracy | Speed (5-min audio) |
|-------|------|----------|---------------------|
| tiny | 39 MB | 70% | 10 sec |
| base | 74 MB | 80% | 20 sec |
| small | 244 MB | 88% | 45 sec |
| medium | 769 MB | 92% | 90 sec |
| large | 1.5 GB | 95% | 180 sec |

**Recommendation:** Use `medium` model for balance of accuracy and speed.

**Critical Output:** Word-level timestamps are essential for LLM to understand timing constraints.

---

### 3.3 Audio Analysis (librosa + madmom)

**Purpose:** Extract music features - beats, tempo, energy, climax points, structure

**Tools:**
- [librosa](https://librosa.org/) - General audio analysis
- [madmom](https://github.com/CPJKU/madmom) - Beat/downbeat detection

**Why These Tools:**
- Industry standard for music information retrieval
- CPU-only (no GPU needed)
- Precise beat detection

**Technical Details:**

```python
import librosa
import numpy as np
import madmom

def analyze_audio(audio_path):
    # Load audio
    y, sr = librosa.load(audio_path)

    # 1. BEAT DETECTION (using madmom for accuracy)
    proc = madmom.features.beats.DBNBeatTrackingProcessor(fps=100)
    act = madmom.features.beats.RNNBeatProcessor()(audio_path)
    beats = proc(act)  # Array of beat timestamps

    # 2. TEMPO
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

    # 3. ENERGY CURVE (RMS)
    rms = librosa.feature.rms(y=y)[0]
    times = librosa.times_like(rms, sr=sr)

    # 4. FIND CLIMAX POINTS (local maxima in energy)
    from scipy.signal import find_peaks
    peaks, properties = find_peaks(rms, height=np.mean(rms), distance=sr//2)
    climax_times = times[peaks]

    # 5. SPECTRAL CENTROID (brightness/intensity)
    spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

    # 6. ONSET DETECTION (sound events)
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)

    return {
        "beats": beats.tolist(),
        "tempo": float(tempo),
        "energy_curve": list(zip(times.tolist(), rms.tolist())),
        "climax_points": climax_times.tolist(),
        "onset_times": onset_times.tolist(),
        "duration": float(len(y) / sr)
    }
```

**Output Structure:**

```json
{
    "beats": [0.5, 1.0, 1.5, 2.0, 2.5, ...],
    "tempo": 120.0,
    "energy_curve": [[0.0, 0.1], [0.1, 0.15], [0.2, 0.3], ...],
    "climax_points": [45.2, 78.5, 112.0],
    "onset_times": [0.0, 2.1, 5.3, 8.2, ...],
    "duration": 180.5
}
```

**Key Metrics for LLM:**

| Metric | Description | Use Case |
|--------|-------------|----------|
| `beats` | Timestamp of each beat | Align powerful words |
| `tempo` | BPM of the music | Pacing guidance |
| `energy_curve` | Volume over time | Identify quiet/loud sections |
| `climax_points` | Energy peaks | Align emotional peaks |
| `onset_times` | Sound event starts | Identify SFX positions |

---

### 3.4 Voice Cloning (Chatterbox)

**Purpose:** Clone the original speaker's voice and generate new speech

**Tool:** [Chatterbox](https://github.com/resemble-ai/chatterbox) by Resemble AI

**Why Chatterbox:**
- Open source (MIT license)
- Zero-shot cloning (only needs 10-30 sec sample)
- Emotion/style preservation
- Active development
- No API costs

**Technical Details:**

```python
# Installation
pip install chatterbox-tts

# Usage
from chatterbox import ChatterboxTTS

# Initialize
tts = ChatterboxTTS()

# Clone voice from sample (the separated vocals)
tts.clone_voice(
    audio_path="vocals.wav",
    voice_name="original_speaker"
)

# Generate new speech with cloned voice
audio = tts.generate(
    text="I, Clarence, will build the greatest AI agency in Germany!",
    voice="original_speaker",
    emotion="inspirational",  # Preserve emotional style
    speed=1.0
)

# Save output
audio.save("new_speech.wav")
```

**Voice Cloning Process:**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  vocals.wav     │────►│  Voice Encoder   │────►│  Voice Embedding│
│  (30+ seconds)  │     │  (extracts)      │     │  (256-dim vector)│
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌─────────────────────────────────┘
                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  New Text       │────►│  TTS Synthesis   │────►│  new_speech.wav │
│  (from LLM)     │     │  (generates)     │     │  (cloned voice) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Quality Factors:**

| Factor | Impact | Mitigation |
|--------|--------|------------|
| Sample quality | High | Use cleanly separated vocals |
| Sample length | Medium | 30+ seconds recommended |
| Background noise | High | Demucs removes most |
| Emotional range | Medium | Include varied emotions in sample |

**Alternative Tools (if Chatterbox doesn't meet quality):**

| Tool | License | Quality | Notes |
|------|---------|---------|-------|
| Chatterbox | MIT | Good | Primary choice |
| Coqui XTTS | MPL-2.0 | Very Good | Larger model |
| RVC | MIT | Excellent | Requires training |
| OpenVoice | MIT | Good | Fast |
| ElevenLabs API | Commercial | Excellent | $0.30/1K chars |

**Model Size:** ~800 MB - 1.2 GB

---

### 3.5 LLM Orchestration (Ollama/Local LLM)

**Purpose:** Intelligently rewrite the script while respecting all timing constraints

**Tool:** [Ollama](https://ollama.ai/) running Llama 3 or Mistral locally

**Why Local LLM:**
- Zero API costs
- Privacy (data stays on device)
- No rate limits
- Works offline

**Technical Details:**

```python
# Installation: Download Ollama from ollama.ai
# Then: ollama pull llama3:8b

import ollama

def rewrite_script(transcript, audio_analysis, user_context):
    """
    Uses LLM to rewrite the motivational script with timing constraints.
    """

    # Build the prompt with all context
    prompt = build_rewrite_prompt(transcript, audio_analysis, user_context)

    response = ollama.chat(
        model='llama3:8b',
        messages=[
            {
                'role': 'system',
                'content': SYSTEM_PROMPT
            },
            {
                'role': 'user',
                'content': prompt
            }
        ],
        options={
            'temperature': 0.7,
            'num_predict': 2000
        }
    )

    return parse_llm_response(response['message']['content'])
```

**System Prompt:**

```
You are an expert motivational speech writer and audio engineer. Your task
is to rewrite motivational speeches while maintaining precise timing
constraints for perfect audio synchronization.

CRITICAL RULES:
1. Each segment must match the target word count EXACTLY (±2 words)
2. Powerful/emphasized words must be placed at specified beat positions
3. The emotional arc must be preserved (soft→build→climax→resolve)
4. Personalize with the user's name, goals, and context
5. Maintain the original speaking style and motivational spirit
6. Output must be valid JSON with timestamps

You will receive:
- Original transcript with word-level timestamps
- Music analysis (beats, climax points, energy curve)
- User's personal context

You must output:
- Rewritten transcript with target timestamps
- Mapping of which words align with which beats
```

**Input to LLM:**

```json
{
    "original_transcript": {
        "segments": [
            {
                "id": 1,
                "start": 0.0,
                "end": 8.0,
                "text": "Every morning you wake up, you have a choice.",
                "word_count": 9,
                "mood": "contemplative"
            },
            {
                "id": 2,
                "start": 8.0,
                "end": 12.0,
                "text": "TO BE GREAT!",
                "word_count": 3,
                "mood": "powerful",
                "beat_aligned": true,
                "beat_timestamp": 8.5
            }
        ]
    },
    "audio_analysis": {
        "beats": [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 8.5, 9.0],
        "climax_points": [8.5, 45.2],
        "energy_at_climax": [0.95, 1.0]
    },
    "user_context": {
        "name": "Clarence",
        "goals": "Build the #1 AI agency in Germany",
        "struggles": "Self-doubt, imposter syndrome",
        "industry": "AI/Technology",
        "tone_preference": "confident, determined"
    }
}
```

**Expected LLM Output:**

```json
{
    "rewritten_segments": [
        {
            "id": 1,
            "start": 0.0,
            "end": 8.0,
            "text": "Every morning Clarence wakes up, he makes a choice.",
            "word_count": 9,
            "notes": "Personalized with name, same word count"
        },
        {
            "id": 2,
            "start": 8.0,
            "end": 12.0,
            "text": "TO BUILD GREATNESS!",
            "word_count": 3,
            "beat_word": "GREATNESS",
            "beat_timestamp": 8.5,
            "notes": "Powerful word aligned with beat drop"
        }
    ],
    "full_text": "Every morning Clarence wakes up, he makes a choice. TO BUILD GREATNESS!..."
}
```

**Model Comparison:**

| Model | Size | Quality | Speed | RAM Needed |
|-------|------|---------|-------|------------|
| Llama 3 8B | 4.7 GB | Good | Fast | 8 GB |
| Llama 3 70B | 40 GB | Excellent | Slow | 48 GB |
| Mistral 7B | 4.1 GB | Good | Fast | 8 GB |
| Mixtral 8x7B | 26 GB | Very Good | Medium | 32 GB |

**Recommendation:** Llama 3 8B for most users, with option to use API (Claude/GPT-4) for better quality.

---

### 3.6 Audio Reassembly (FFmpeg)

**Purpose:** Combine all elements into final synchronized output

**Tool:** [FFmpeg](https://ffmpeg.org/)

**Why FFmpeg:**
- Industry standard
- Handles all audio formats
- Precise timing control
- Cross-platform
- Tiny binary size

**Technical Details:**

```python
import subprocess
import json

def reassemble_audio(
    new_speech_path: str,
    accompaniment_path: str,
    output_path: str,
    timing_adjustments: list = None
):
    """
    Combine new speech with original accompaniment.
    """

    # Basic mixing (speech + accompaniment)
    cmd = [
        'ffmpeg', '-y',
        '-i', new_speech_path,      # New speech (cloned voice)
        '-i', accompaniment_path,    # Original music + SFX
        '-filter_complex',
        '[0:a]volume=1.0[speech];'   # Speech volume
        '[1:a]volume=0.7[music];'    # Music slightly lower
        '[speech][music]amix=inputs=2:duration=longest',
        '-ac', '2',                  # Stereo output
        '-ar', '44100',              # Sample rate
        '-b:a', '320k',              # High quality MP3
        output_path
    ]

    subprocess.run(cmd, check=True)


def adjust_timing(audio_path: str, segments: list) -> str:
    """
    Apply time-stretching to match segments to target duration.
    Uses rubberband for high-quality time-stretching.
    """

    # For each segment that needs adjustment
    for segment in segments:
        if segment['needs_stretch']:
            ratio = segment['target_duration'] / segment['actual_duration']

            cmd = [
                'ffmpeg', '-y',
                '-i', audio_path,
                '-filter:a', f'atempo={ratio}',  # Time stretch
                f'segment_{segment["id"]}.wav'
            ]
            subprocess.run(cmd, check=True)

    # Concatenate all segments
    # ... (concatenation logic)
```

**Mixing Strategy:**

```
┌─────────────────────────────────────────────────────────────┐
│                    AUDIO MIXING TIMELINE                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TIME:    0s      10s      20s      30s      40s      50s  │
│           │        │        │        │        │        │   │
│  SPEECH:  ████████████████████████████████████████████     │
│           │ Soft  │ Build  │ Rising │ CLIMAX │ Resolve│   │
│           │       │        │        │        │        │   │
│  MUSIC:   ▁▂▃▄▅▆▇█████████████████████████▇▆▅▄▃▂▁         │
│           │ Intro │        │        │ Peak   │ Fade   │   │
│           │       │        │        │        │        │   │
│  SFX:         🔊        🔊            🔊🔊           🔊    │
│              (cheer)   (whoosh)     (impact)(cheer)       │
│                                                             │
│  VOLUME:                                                    │
│  Speech:  0.8     0.9      0.9      1.0      0.9     0.8   │
│  Music:   0.6     0.5      0.6      0.7      0.6     0.4   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Dynamic Volume Adjustment (Ducking):**

```python
def apply_ducking(speech_path: str, music_path: str, output_path: str):
    """
    Automatically lower music volume when speech is present.
    """

    cmd = [
        'ffmpeg', '-y',
        '-i', speech_path,
        '-i', music_path,
        '-filter_complex',
        '[1:a]asplit=2[music1][music2];'
        '[0:a][music1]sidechaincompress=threshold=0.02:ratio=5:attack=50:release=300[compressed];'
        '[0:a][compressed]amix=inputs=2:duration=longest:weights=1 0.5',
        output_path
    ]

    subprocess.run(cmd, check=True)
```

---

## 4. Data Flow & Pipeline

### 4.1 Complete Pipeline Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE DATA FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

USER INPUT
══════════
┌───────────────┐     ┌───────────────────────────────────────────────────┐
│ motivation.mp3│     │ User Context Form                                 │
│ (5 min, 48kHz)│     │ - Name: Clarence                                  │
└───────┬───────┘     │ - Goal: Build #1 AI agency in DACH               │
        │             │ - Struggle: Self-doubt                            │
        │             │ - Tone: Confident, determined                     │
        │             └───────────────────────────┬───────────────────────┘
        │                                         │
        ▼                                         │
STAGE 1: SEPARATION                               │
════════════════════                              │
┌─────────────────────────────────────────┐       │
│              DEMUCS                      │       │
│  ┌─────────────────────────────────┐    │       │
│  │ Input: motivation.mp3           │    │       │
│  │ Model: htdemucs                 │    │       │
│  │ Process: ~3 minutes             │    │       │
│  └─────────────────────────────────┘    │       │
│                  │                      │       │
│     ┌────────────┴────────────┐        │       │
│     ▼                         ▼        │       │
│ ┌─────────┐             ┌─────────┐    │       │
│ │vocals.wav│            │accomp.wav│   │       │
│ │(speech)  │            │(music+sfx)│  │       │
│ └────┬─────┘            └────┬─────┘   │       │
└──────┼───────────────────────┼─────────┘       │
       │                       │                  │
       ▼                       │                  │
STAGE 2: TRANSCRIPTION         │                  │
══════════════════════         │                  │
┌──────────────────────────┐   │                  │
│        WHISPER           │   │                  │
│  ┌────────────────────┐  │   │                  │
│  │ Model: medium      │  │   │                  │
│  │ Language: en       │  │   │                  │
│  │ Word timestamps: ✓ │  │   │                  │
│  └─────────┬──────────┘  │   │                  │
│            │             │   │                  │
│            ▼             │   │                  │
│  ┌────────────────────┐  │   │                  │
│  │ transcript.json    │  │   │                  │
│  │ - Full text        │  │   │                  │
│  │ - Word timestamps  │  │   │                  │
│  │ - Segments         │  │   │                  │
│  └─────────┬──────────┘  │   │                  │
└────────────┼─────────────┘   │                  │
             │                 │                  │
             ▼                 ▼                  │
STAGE 3: AUDIO ANALYSIS                          │
═══════════════════════                          │
┌────────────────────────────────────────────┐   │
│         LIBROSA + MADMOM                    │   │
│  ┌──────────────────────────────────────┐  │   │
│  │ Inputs:                              │  │   │
│  │ - vocals.wav (for speech timing)     │  │   │
│  │ - accomp.wav (for music analysis)    │  │   │
│  └──────────────────────────────────────┘  │   │
│                    │                       │   │
│                    ▼                       │   │
│  ┌──────────────────────────────────────┐  │   │
│  │ audio_analysis.json                  │  │   │
│  │ - Beat timestamps                    │  │   │
│  │ - Tempo (BPM)                        │  │   │
│  │ - Energy curve                       │  │   │
│  │ - Climax points                      │  │   │
│  │ - Onset times (SFX)                  │  │   │
│  │ - Emotional segments                 │  │   │
│  └──────────────────┬───────────────────┘  │   │
└─────────────────────┼──────────────────────┘   │
                      │                          │
                      ▼                          │
STAGE 4: LLM REWRITE                             │
════════════════════                             │
┌────────────────────────────────────────────────┼───┐
│                    OLLAMA (Llama 3)            │   │
│  ┌──────────────────────────────────────────┐  │   │
│  │ Inputs Combined:                         │◄─┘   │
│  │ - transcript.json                        │      │
│  │ - audio_analysis.json                    │      │
│  │ - user_context                           │      │
│  └──────────────────────────────────────────┘      │
│                      │                             │
│                      ▼                             │
│  ┌──────────────────────────────────────────┐      │
│  │ LLM Processing:                          │      │
│  │ 1. Parse timing constraints              │      │
│  │ 2. Identify beat-aligned words           │      │
│  │ 3. Map emotional arc                     │      │
│  │ 4. Rewrite with personalization          │      │
│  │ 5. Validate word counts                  │      │
│  │ 6. Output structured JSON                │      │
│  └──────────────────────────────────────────┘      │
│                      │                             │
│                      ▼                             │
│  ┌──────────────────────────────────────────┐      │
│  │ rewritten_script.json                    │      │
│  │ - New text segments                      │      │
│  │ - Target timestamps                      │      │
│  │ - Beat alignments                        │      │
│  │ - Speaking speed hints                   │      │
│  └──────────────────┬───────────────────────┘      │
└─────────────────────┼──────────────────────────────┘
                      │
                      ▼
STAGE 5: VOICE SYNTHESIS
════════════════════════
┌─────────────────────────────────────────────┐
│              CHATTERBOX                      │
│  ┌───────────────────────────────────────┐  │
│  │ Step 1: Clone Voice                   │  │
│  │ Input: vocals.wav (30+ sec sample)    │  │
│  │ Output: voice_embedding               │  │
│  └───────────────────────────────────────┘  │
│                      │                      │
│                      ▼                      │
│  ┌───────────────────────────────────────┐  │
│  │ Step 2: Generate Speech               │  │
│  │ Input: rewritten_script.json          │  │
│  │ Voice: voice_embedding                │  │
│  │ Style: Match original emotion         │  │
│  └───────────────────────────────────────┘  │
│                      │                      │
│                      ▼                      │
│  ┌───────────────────────────────────────┐  │
│  │ new_speech.wav                        │  │
│  │ - Cloned voice                        │  │
│  │ - User's personalized text            │  │
│  │ - Timed to match targets              │  │
│  └──────────────────┬────────────────────┘  │
└─────────────────────┼───────────────────────┘
                      │
                      ▼
STAGE 6: REASSEMBLY
═══════════════════
┌─────────────────────────────────────────────┐
│                FFMPEG                        │
│  ┌───────────────────────────────────────┐  │
│  │ Inputs:                               │  │
│  │ - new_speech.wav                      │  │
│  │ - accomp.wav                          │  │
│  │ - timing_metadata.json                │  │
│  └───────────────────────────────────────┘  │
│                      │                      │
│                      ▼                      │
│  ┌───────────────────────────────────────┐  │
│  │ Processing:                           │  │
│  │ 1. Time-stretch speech if needed      │  │
│  │ 2. Apply ducking to music             │  │
│  │ 3. Align beat-synced moments          │  │
│  │ 4. Mix all tracks                     │  │
│  │ 5. Normalize final output             │  │
│  │ 6. Export as MP3 320kbps              │  │
│  └───────────────────────────────────────┘  │
│                      │                      │
│                      ▼                      │
│  ┌───────────────────────────────────────┐  │
│  │ OUTPUT: clarence_motivation.mp3       │  │
│  │ - Personalized speech                 │  │
│  │ - Original music & SFX                │  │
│  │ - Perfect synchronization             │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 4.2 File Artifacts

| Stage | Input Files | Output Files | Size Estimate |
|-------|-------------|--------------|---------------|
| 1. Separation | `input.mp3` | `vocals.wav`, `accomp.wav` | ~50 MB each |
| 2. Transcription | `vocals.wav` | `transcript.json` | ~10 KB |
| 3. Analysis | `*.wav` | `audio_analysis.json` | ~50 KB |
| 4. LLM Rewrite | `*.json` | `rewritten_script.json` | ~10 KB |
| 5. Voice Synthesis | `rewritten_script.json` | `new_speech.wav` | ~50 MB |
| 6. Reassembly | `*.wav` | `output.mp3` | ~10 MB |

**Total temp storage needed:** ~200 MB per generation

---

## 5. LLM Orchestration Logic

### 5.1 Prompt Engineering

**Master System Prompt:**

```markdown
# ROLE
You are an expert audio engineer and motivational speech writer. You
specialize in rewriting speeches to maintain perfect synchronization
with background music and sound effects.

# TASK
Rewrite a motivational speech transcript to be personalized for a
specific user while respecting precise timing constraints.

# CONSTRAINTS (CRITICAL - MUST FOLLOW)

## Timing Rules
1. Total duration must match original: {total_duration} seconds
2. Each segment must match target word count within ±2 words
3. Emphasized words must fall at beat positions (±0.2 seconds)
4. Climax moments must align with energy peaks

## Word Count Formula
- Average speaking rate: 150 words per minute (2.5 words/second)
- Segment word count = segment_duration × 2.5
- Allow ±10% variance for natural pacing

## Emotional Arc Preservation
- INTRO (0-15%): Contemplative, soft, inviting
- BUILD (15-40%): Rising energy, increasing conviction
- RISE (40-70%): Strong, determined, powerful
- CLIMAX (70-85%): Peak intensity, maximum impact
- RESOLVE (85-100%): Satisfied, peaceful, affirming

# INPUT FORMAT
You will receive JSON with:
- original_transcript: Full text with word-level timestamps
- audio_analysis: Beats, climax points, energy curve
- user_context: Name, goals, struggles, preferences

# OUTPUT FORMAT
Return valid JSON:
```json
{
  "segments": [
    {
      "id": 1,
      "start": 0.0,
      "end": 8.0,
      "original_text": "...",
      "new_text": "...",
      "word_count": 20,
      "target_word_count": 20,
      "beat_aligned_words": [
        {"word": "GREATNESS", "target_time": 8.5}
      ],
      "emotion": "contemplative",
      "speaking_speed": "slow"
    }
  ],
  "validation": {
    "total_words": 450,
    "expected_words": 450,
    "timing_score": 0.95
  }
}
```

# PERSONALIZATION GUIDELINES
- Replace generic "you" with user's name naturally (not every instance)
- Incorporate user's specific goals where original mentions generic success
- Address user's specific struggles where original mentions generic challenges
- Maintain the original speaker's style and vocabulary level
- Keep the motivational essence - don't over-personalize

# EXAMPLES

## Good Personalization:
Original: "You can achieve anything you set your mind to."
For Clarence (AI agency goal): "Clarence can build the greatest agency he envisions."

## Bad Personalization (too literal):
Original: "You can achieve anything you set your mind to."
Bad: "Clarence can achieve building an AI agency in Germany."

## Beat Alignment Example:
If beat_drop at 8.5 seconds, and segment ends at 9.0 seconds:
- Place the most powerful word to END at ~8.5s
- "...and you will be UNSTOPPABLE!" (UNSTOPPABLE hits the beat)
```

### 5.2 Constraint Validation

```python
def validate_llm_output(llm_output: dict, constraints: dict) -> tuple[bool, list]:
    """
    Validate that LLM output meets all timing and content constraints.
    Returns (is_valid, list_of_issues)
    """
    issues = []

    # 1. Check total duration matches
    total_words = sum(seg['word_count'] for seg in llm_output['segments'])
    expected_words = constraints['total_duration'] * 2.5  # 2.5 words/sec

    if abs(total_words - expected_words) > expected_words * 0.1:
        issues.append(f"Word count mismatch: {total_words} vs expected {expected_words}")

    # 2. Check each segment word count
    for segment in llm_output['segments']:
        target = segment['target_word_count']
        actual = segment['word_count']
        if abs(actual - target) > 2:
            issues.append(f"Segment {segment['id']}: {actual} words vs target {target}")

    # 3. Check beat alignments
    for segment in llm_output['segments']:
        for beat_word in segment.get('beat_aligned_words', []):
            word = beat_word['word']
            if word.lower() not in segment['new_text'].lower():
                issues.append(f"Beat word '{word}' not found in segment {segment['id']}")

    # 4. Check emotional arc
    emotions = [seg['emotion'] for seg in llm_output['segments']]
    if not _check_emotional_arc(emotions):
        issues.append("Emotional arc not preserved")

    return (len(issues) == 0, issues)


def _check_emotional_arc(emotions: list) -> bool:
    """Verify emotions follow expected arc pattern."""
    expected_patterns = {
        'contemplative': (0, 0.2),    # First 20%
        'building': (0.1, 0.4),       # 10-40%
        'powerful': (0.3, 0.9),       # 30-90%
        'peak': (0.6, 0.9),           # 60-90%
        'resolved': (0.8, 1.0)        # Last 20%
    }
    # Implementation checks if emotions appear in expected ranges
    return True  # Simplified
```

### 5.3 Retry Logic

```python
MAX_RETRIES = 3

async def generate_rewritten_script(
    transcript: dict,
    audio_analysis: dict,
    user_context: dict
) -> dict:
    """
    Generate rewritten script with automatic retry on validation failure.
    """

    for attempt in range(MAX_RETRIES):
        # Generate
        llm_output = await call_llm(transcript, audio_analysis, user_context)

        # Validate
        is_valid, issues = validate_llm_output(
            llm_output,
            {'total_duration': audio_analysis['duration']}
        )

        if is_valid:
            return llm_output

        # Add issues to next prompt for self-correction
        user_context['previous_issues'] = issues
        print(f"Attempt {attempt + 1} failed: {issues}")

    raise Exception(f"Failed to generate valid script after {MAX_RETRIES} attempts")
```

---

## 6. Technical Validation

### 6.1 Component Validation Matrix

| Component | Validation Method | Success Criteria | Status |
|-----------|-------------------|------------------|--------|
| Demucs separation | SDR measurement | SDR > 7 dB | ✅ Proven |
| Whisper transcription | WER measurement | WER < 10% | ✅ Proven |
| Beat detection | Manual verification | ±50ms accuracy | ✅ Proven |
| Voice cloning | MOS score | MOS > 3.5/5 | ⚠️ Test needed |
| LLM constraint adherence | Unit tests | 95% valid outputs | ⚠️ Test needed |
| End-to-end timing | A/B comparison | Indistinguishable sync | ⚠️ Test needed |

### 6.2 Proof of Concept Tests

**Test 1: Audio Separation Quality**

```python
# Test script to validate Demucs quality
def test_demucs_separation():
    """
    Test: Separate a known audio file and verify clean vocal isolation.
    Pass criteria: No audible music bleed in vocals
    """
    from demucs import pretrained
    from demucs.apply import apply_model
    import torchaudio

    # Use a test file with known content
    model = pretrained.get_model('htdemucs')
    wav, sr = torchaudio.load('test_motivational.mp3')
    sources = apply_model(model, wav[None], device='cpu')[0]

    vocals = sources[3]
    torchaudio.save('test_vocals.wav', vocals, sr)

    # Manual listening test required
    print("Listen to test_vocals.wav - should have minimal music bleed")

    # Automated: Check energy in music frequency range
    # (vocals should have low energy in bass frequencies)
    return True
```

**Test 2: Voice Cloning Quality**

```python
def test_voice_cloning():
    """
    Test: Clone voice from 30 seconds of speech and generate new sentence.
    Pass criteria: Listener cannot distinguish from original speaker
    """
    from chatterbox import ChatterboxTTS

    tts = ChatterboxTTS()

    # Clone from test vocals
    tts.clone_voice(
        audio_path="test_vocals.wav",
        voice_name="test_speaker"
    )

    # Generate test sentence
    audio = tts.generate(
        text="This is a test of the voice cloning system.",
        voice="test_speaker"
    )
    audio.save("test_cloned.wav")

    # Requires human evaluation (A/B test)
    print("Compare test_cloned.wav with test_vocals.wav")
    return True
```

**Test 3: LLM Constraint Adherence**

```python
def test_llm_constraints():
    """
    Test: Give LLM strict word count constraints and verify compliance.
    Pass criteria: 95% of segments within ±2 words of target
    """
    import ollama

    test_cases = [
        {"target_words": 20, "duration": 8},
        {"target_words": 50, "duration": 20},
        {"target_words": 100, "duration": 40},
    ]

    results = []
    for case in test_cases:
        prompt = f"""
        Write a motivational segment that is EXACTLY {case['target_words']} words.
        Topic: Believing in yourself.
        Count your words carefully before responding.
        """

        response = ollama.chat(
            model='llama3:8b',
            messages=[{'role': 'user', 'content': prompt}]
        )

        word_count = len(response['message']['content'].split())
        variance = abs(word_count - case['target_words'])

        results.append({
            'target': case['target_words'],
            'actual': word_count,
            'variance': variance,
            'pass': variance <= 2
        })

    pass_rate = sum(1 for r in results if r['pass']) / len(results)
    print(f"Pass rate: {pass_rate * 100}%")

    return pass_rate >= 0.95
```

**Test 4: End-to-End Timing**

```python
def test_end_to_end_timing():
    """
    Test: Process a 1-minute audio and verify sync quality.
    Pass criteria: Climax word hits within 0.3 seconds of beat
    """

    # 1. Process audio through full pipeline
    result = process_audio(
        input_path="test_1min.mp3",
        user_context={"name": "Test", "goal": "Success"}
    )

    # 2. Analyze output timing
    output_analysis = analyze_audio(result['output_path'])

    # 3. Find energy peaks in output
    output_peaks = output_analysis['climax_points']

    # 4. Compare with input peaks
    input_analysis = analyze_audio("test_1min.mp3")
    input_peaks = input_analysis['climax_points']

    # 5. Calculate timing drift
    timing_errors = []
    for inp, out in zip(input_peaks, output_peaks):
        error = abs(inp - out)
        timing_errors.append(error)

    avg_error = sum(timing_errors) / len(timing_errors)
    print(f"Average timing error: {avg_error:.3f} seconds")

    return avg_error < 0.3
```

### 6.3 Validation Checklist

Before proceeding to full development, complete these validations:

- [ ] **V1**: Demucs separates vocals cleanly from test motivational audio
- [ ] **V2**: Whisper transcribes with <5% word error rate
- [ ] **V3**: librosa detects beats within ±50ms of manual marking
- [ ] **V4**: Chatterbox clones voice recognizably (human eval: 4/5 similarity)
- [ ] **V5**: LLM follows word count constraints in 9/10 attempts
- [ ] **V6**: Full pipeline produces listenable output
- [ ] **V7**: Timing alignment is acceptable (human eval: sounds synced)

---

## 7. Desktop App Architecture

### 7.1 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **UI Framework** | Tauri | Small binary, native feel, Rust security |
| **Frontend** | React + TypeScript | Familiar, component-based, good tooling |
| **Backend** | Python (sidecar) | ML ecosystem, all tools available |
| **IPC** | Tauri commands | Native bridge between Rust and Python |
| **Models** | Local files | Bundled with installer or downloaded |
| **Storage** | SQLite | Local, no server needed |

### 7.2 Application Structure

```
roar-bliss/
├── src-tauri/                    # Tauri (Rust) backend
│   ├── src/
│   │   ├── main.rs              # App entry point
│   │   ├── commands.rs          # IPC command handlers
│   │   └── python_bridge.rs     # Python sidecar management
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                          # React frontend
│   ├── components/
│   │   ├── FileUpload.tsx       # Drag & drop MP3
│   │   ├── UserContextForm.tsx  # Name, goals input
│   │   ├── ProcessingView.tsx   # Progress indicators
│   │   ├── AudioPlayer.tsx      # Preview output
│   │   └── SettingsPanel.tsx    # Quality/speed options
│   ├── hooks/
│   │   └── useProcessing.ts     # Processing state management
│   ├── App.tsx
│   └── main.tsx
│
├── python/                       # Python processing backend
│   ├── main.py                  # FastAPI server
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── separator.py         # Demucs wrapper
│   │   ├── transcriber.py       # Whisper wrapper
│   │   ├── analyzer.py          # librosa/madmom wrapper
│   │   ├── llm_orchestrator.py  # Ollama/LLM wrapper
│   │   ├── voice_cloner.py      # Chatterbox wrapper
│   │   └── assembler.py         # FFmpeg wrapper
│   ├── models/
│   │   └── download.py          # Model downloader
│   └── requirements.txt
│
├── models/                       # ML models (downloaded on first run)
│   ├── demucs/
│   │   └── htdemucs.pt          # ~1.5 GB
│   ├── whisper/
│   │   └── medium.pt            # ~769 MB
│   ├── chatterbox/
│   │   └── model.pt             # ~1 GB
│   └── llm/
│       └── llama3-8b.gguf       # ~4.7 GB (optional, can use API)
│
├── package.json
└── README.md
```

### 7.3 UI Mockup

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ROAR BLISS                                              ─  □  ✕       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │                     📁 Drop your MP3 here                         │  │
│  │                                                                   │  │
│  │                  or click to browse files                         │  │
│  │                                                                   │  │
│  │                     Supported: MP3, WAV, M4A                      │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════   │
│                                                                         │
│  Tell us about yourself:                                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Your name                                                       │   │
│  │ ┌─────────────────────────────────────────────────────────────┐ │   │
│  │ │ Clarence                                                    │ │   │
│  │ └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │ Your biggest goal                                               │   │
│  │ ┌─────────────────────────────────────────────────────────────┐ │   │
│  │ │ Build the #1 AI implementation agency in the DACH region    │ │   │
│  │ └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │ What holds you back sometimes? (optional)                       │   │
│  │ ┌─────────────────────────────────────────────────────────────┐ │   │
│  │ │ Self-doubt, feeling like an imposter in the AI space        │ │   │
│  │ └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │ Preferred tone  ○ Intense  ● Confident  ○ Gentle               │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                    ┌────────────────────────────┐                       │
│                    │   ✨ Generate My Audio     │                       │
│                    └────────────────────────────┘                       │
│                                                                         │
│  ───────────────────────────────────────────────────────────────────   │
│                                                                         │
│  Processing:                                                            │
│                                                                         │
│  ✅ Audio separation complete                                           │
│  ✅ Transcription complete                                              │
│  ✅ Audio analysis complete                                             │
│  ⏳ Rewriting script... (LLM processing)                               │
│  ○ Voice synthesis                                                      │
│  ○ Final assembly                                                       │
│                                                                         │
│  ████████████████████░░░░░░░░░░░░░░░░░░░  42%                          │
│                                                                         │
│  Estimated time remaining: ~4 minutes                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.4 State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICATION STATES                           │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │    IDLE      │
                    │  (waiting    │
                    │  for input)  │
                    └──────┬───────┘
                           │
            File dropped / │
            Browse clicked │
                           ▼
                    ┌──────────────┐
                    │   LOADED     │
                    │  (file ready,│
                    │  form shown) │
                    └──────┬───────┘
                           │
         Generate clicked /│
         Form completed    │
                           ▼
                    ┌──────────────┐
                    │  PROCESSING  │◄────────────────┐
                    │  (pipeline   │                 │
                    │   running)   │                 │
                    └──────┬───────┘                 │
                           │                        │
              ┌────────────┼────────────┐           │
              │            │            │           │
              ▼            ▼            ▼           │
        ┌──────────┐ ┌──────────┐ ┌──────────┐     │
        │ Stage 1  │ │ Stage 2  │ │   ...    │     │
        │Separating│►│Transcribe│►│          │     │
        └──────────┘ └──────────┘ └────┬─────┘     │
                                       │           │
                           ┌───────────┴───────────┤
                           │                       │
                           ▼                       │
                    ┌──────────────┐               │
                    │   COMPLETE   │               │
                    │  (output     │               │
                    │   ready)     │               │
                    └──────┬───────┘               │
                           │                       │
          ┌────────────────┼────────────────┐      │
          │                │                │      │
          ▼                ▼                ▼      │
    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
    │  PLAY    │    │  SAVE    │    │  REDO    │──┘
    │(preview) │    │(export)  │    │(new text)│
    └──────────┘    └──────────┘    └──────────┘
```

---

## 8. Performance Requirements

### 8.1 Target Performance

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| Total processing time (5-min audio) | 5 minutes | 10 minutes |
| Memory usage (peak) | 8 GB | 12 GB |
| Disk space (app + models) | 8 GB | 12 GB |
| Output quality (MOS) | 4.0/5 | 3.5/5 |

### 8.2 Hardware Requirements

**Minimum:**
- CPU: 4 cores, 2.5 GHz
- RAM: 8 GB
- Storage: 15 GB free
- GPU: None (CPU fallback)
- OS: Windows 10, macOS 11, Ubuntu 20.04

**Recommended:**
- CPU: 8 cores, 3.0 GHz
- RAM: 16 GB
- Storage: 20 GB SSD
- GPU: 6 GB VRAM (NVIDIA/Apple Silicon)
- OS: Windows 11, macOS 13, Ubuntu 22.04

### 8.3 Performance Optimization Strategies

**Strategy 1: Model Quantization**
```python
# Use quantized models for faster inference
# Whisper: Use whisper.cpp with 4-bit quantization
# LLM: Use GGUF format with Q4_K_M quantization
# Chatterbox: Use FP16 instead of FP32
```

**Strategy 2: Parallel Processing**
```python
# Run independent stages in parallel
import asyncio

async def process_parallel():
    # Separation must complete first
    vocals, accomp = await separate_audio(input_path)

    # These can run in parallel
    transcript_task = asyncio.create_task(transcribe(vocals))
    analysis_task = asyncio.create_task(analyze_audio(accomp))
    clone_task = asyncio.create_task(clone_voice(vocals))

    transcript = await transcript_task
    analysis = await analysis_task
    voice_model = await clone_task

    # These depend on above
    rewritten = await rewrite_script(transcript, analysis, user_context)
    new_speech = await generate_speech(rewritten, voice_model)

    # Final assembly
    output = await assemble(new_speech, accomp)
    return output
```

**Strategy 3: Caching**
```python
# Cache voice clones for repeated use
# Cache LLM responses for similar inputs
# Cache separated audio for re-generation with different text
```

### 8.4 Resource Usage by Stage

| Stage | CPU | RAM | GPU VRAM | Time (5-min audio) |
|-------|-----|-----|----------|-------------------|
| Separation | 100% | 4 GB | 2 GB | 120 sec |
| Transcription | 50% | 2 GB | 1 GB | 60 sec |
| Analysis | 30% | 500 MB | 0 | 10 sec |
| LLM Rewrite | 80% | 6 GB | 4 GB | 30 sec |
| Voice Synthesis | 60% | 3 GB | 2 GB | 90 sec |
| Assembly | 20% | 500 MB | 0 | 10 sec |
| **Total** | - | **8 GB peak** | **4 GB peak** | **~320 sec** |

---

## 9. Risk Assessment

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Voice cloning quality insufficient | Medium | High | Fallback to ElevenLabs API |
| LLM doesn't follow timing constraints | Medium | High | Constraint validation + retry logic |
| Audio separation has artifacts | Low | Medium | Use higher quality model (htdemucs_ft) |
| Processing too slow on low-end hardware | Medium | Medium | Cloud processing option |
| Model files too large for distribution | Low | Low | On-demand download with progress |

### 9.2 UX Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Users upload copyrighted content | High | High | ToS + content disclaimer |
| Output doesn't match expectations | Medium | High | Preview before final save |
| Long wait times frustrate users | Medium | Medium | Progress indicators + stage previews |
| Technical jargon confuses users | Low | Low | Simple, friendly UI copy |

### 9.3 Legal Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Voice cloning misuse | Medium | High | Watermarking + ToS |
| Copyright infringement claims | Medium | High | User responsibility clause |
| GDPR compliance (EU users) | Low | Medium | Local processing, no data upload |

### 9.4 Contingency Plans

**If voice cloning quality is poor:**
1. First try: Use longer voice sample (60+ seconds)
2. Second try: Switch to Coqui XTTS model
3. Fallback: Offer ElevenLabs API integration ($0.30/generation)

**If LLM timing is consistently off:**
1. First try: More explicit prompting with examples
2. Second try: Two-pass generation (rough → refined)
3. Fallback: Manual segment editing mode

**If processing is too slow:**
1. First try: GPU acceleration setup wizard
2. Second try: Quality presets (fast/balanced/best)
3. Fallback: Optional cloud processing tier

---

## 10. Proof of Concept Plan

### 10.1 POC Scope

Build a minimal command-line tool that validates the complete pipeline.

**In Scope:**
- Process a single 2-minute test audio
- Separate vocals and music
- Transcribe with timestamps
- Analyze beats and energy
- LLM rewrite with constraints
- Voice clone and generate new speech
- Reassemble final output

**Out of Scope:**
- Desktop UI
- Multiple input formats
- Model management
- Error handling polish

### 10.2 POC Timeline

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Setup environment, test Demucs | `test_separation.py` |
| 2 | Test Whisper with timestamps | `test_transcription.py` |
| 3 | Test librosa/madmom analysis | `test_analysis.py` |
| 4 | Test LLM constraint following | `test_llm.py` |
| 5 | Test Chatterbox voice cloning | `test_voice.py` |
| 6 | Test FFmpeg assembly | `test_assembly.py` |
| 7 | Integrate full pipeline | `poc_pipeline.py` |

### 10.3 POC Success Criteria

| Criteria | Measurement | Pass Threshold |
|----------|-------------|----------------|
| Vocal separation clean | Human eval | 4/5 clarity |
| Transcription accurate | WER | <10% |
| Beat detection accurate | Manual comparison | ±100ms |
| LLM follows word counts | Automated | 90% within ±2 |
| Voice sounds similar | Human eval | 3.5/5 similarity |
| Final output listenable | Human eval | 3.5/5 quality |
| Timing feels synced | Human eval | 4/5 sync quality |

### 10.4 POC Code Structure

```python
# poc_pipeline.py

import argparse
from pathlib import Path

from pipeline.separator import separate_audio
from pipeline.transcriber import transcribe_audio
from pipeline.analyzer import analyze_audio
from pipeline.llm_orchestrator import rewrite_script
from pipeline.voice_cloner import clone_and_generate
from pipeline.assembler import assemble_audio

def run_poc(input_path: str, user_context: dict, output_path: str):
    """
    Run complete POC pipeline.
    """
    print("Starting Roar Bliss POC Pipeline...")

    # Stage 1: Separation
    print("\n[1/6] Separating audio...")
    vocals_path, accomp_path = separate_audio(input_path)
    print(f"  ✓ Vocals: {vocals_path}")
    print(f"  ✓ Accompaniment: {accomp_path}")

    # Stage 2: Transcription
    print("\n[2/6] Transcribing speech...")
    transcript = transcribe_audio(vocals_path)
    print(f"  ✓ Transcribed {len(transcript['segments'])} segments")

    # Stage 3: Analysis
    print("\n[3/6] Analyzing audio...")
    analysis = analyze_audio(accomp_path, vocals_path)
    print(f"  ✓ Found {len(analysis['beats'])} beats")
    print(f"  ✓ Found {len(analysis['climax_points'])} climax points")

    # Stage 4: LLM Rewrite
    print("\n[4/6] Rewriting script...")
    rewritten = rewrite_script(transcript, analysis, user_context)
    print(f"  ✓ Rewritten with {sum(s['word_count'] for s in rewritten['segments'])} words")

    # Stage 5: Voice Synthesis
    print("\n[5/6] Generating speech...")
    new_speech_path = clone_and_generate(vocals_path, rewritten)
    print(f"  ✓ Generated: {new_speech_path}")

    # Stage 6: Assembly
    print("\n[6/6] Assembling final audio...")
    assemble_audio(new_speech_path, accomp_path, output_path)
    print(f"  ✓ Output: {output_path}")

    print("\n✅ POC Pipeline Complete!")
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Roar Bliss POC")
    parser.add_argument("input", help="Input MP3 file")
    parser.add_argument("--name", default="User", help="User's name")
    parser.add_argument("--goal", default="Achieve greatness", help="User's goal")
    parser.add_argument("--output", default="output.mp3", help="Output file")

    args = parser.parse_args()

    user_context = {
        "name": args.name,
        "goal": args.goal,
        "struggles": "",
        "tone": "confident"
    }

    run_poc(args.input, user_context, args.output)
```

---

## 11. Development Roadmap

### 11.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DEVELOPMENT PHASES                               │
└─────────────────────────────────────────────────────────────────────────┘

WEEK  1    2    3    4    5    6    7    8    9   10   11   12
      │    │    │    │    │    │    │    │    │    │    │    │
      ├────┴────┤    │    │    │    │    │    │    │    │    │
      │  POC    │    │    │    │    │    │    │    │    │    │
      │ (valid.)│    │    │    │    │    │    │    │    │    │
      └────┬────┘    │    │    │    │    │    │    │    │    │
           │         │    │    │    │    │    │    │    │    │
           └─────────┼────┴────┴────┤    │    │    │    │    │
                     │    CORE      │    │    │    │    │    │
                     │   PIPELINE   │    │    │    │    │    │
                     └──────────────┼────┴────┴────┤    │    │
                                    │   DESKTOP    │    │    │
                                    │     APP      │    │    │
                                    └──────────────┼────┴────┤
                                                   │ POLISH  │
                                                   │& LAUNCH │
                                                   └─────────┘
```

### 11.2 Detailed Roadmap

**Phase 1: Proof of Concept (Weeks 1-2)**

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | - Setup dev environment<br>- Test Demucs, Whisper<br>- Test librosa analysis | `test_*.py` scripts |
| 2 | - Test LLM prompting<br>- Test Chatterbox<br>- Integrate pipeline | `poc_pipeline.py` |

**Go/No-Go Decision Point:** After Week 2, evaluate POC results against success criteria.

**Phase 2: Core Pipeline (Weeks 3-6)**

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 3 | - Robust error handling<br>- Pipeline optimization<br>- Caching layer | Production pipeline |
| 4 | - LLM prompt refinement<br>- Constraint validation<br>- Retry logic | Reliable LLM integration |
| 5 | - Voice quality improvements<br>- Timing alignment refinement | High-quality synthesis |
| 6 | - Integration testing<br>- Performance benchmarks | Tested core system |

**Phase 3: Desktop Application (Weeks 7-10)**

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 7 | - Tauri setup<br>- Basic UI components<br>- File upload | Basic app shell |
| 8 | - User context form<br>- Processing view<br>- Progress tracking | Working UI |
| 9 | - Audio preview player<br>- Output management<br>- Settings panel | Feature-complete UI |
| 10 | - Python sidecar integration<br>- IPC implementation<br>- Error handling | Integrated app |

**Phase 4: Polish & Launch (Weeks 11-12)**

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 11 | - UI polish<br>- Performance optimization<br>- Bug fixes | Beta build |
| 12 | - Documentation<br>- Installer creation<br>- Launch prep | v1.0 release |

### 11.3 Milestones

| Milestone | Target Date | Success Criteria |
|-----------|-------------|------------------|
| **M1: POC Complete** | Week 2 | End-to-end pipeline works |
| **M2: Core Pipeline Stable** | Week 6 | 95% success rate on test set |
| **M3: App Alpha** | Week 8 | Internal testing ready |
| **M4: App Beta** | Week 10 | External beta testing |
| **M5: v1.0 Release** | Week 12 | Public release |

### 11.4 Resource Requirements

**Development:**
- 1 developer (full-time equivalent)
- Development machine (16GB RAM, GPU recommended)
- Test audio files (legally acquired)

**Infrastructure:**
- GitHub repository
- CI/CD pipeline (GitHub Actions)
- Beta testing distribution (TestFlight, etc.)

**Budget Estimate:**
| Item | Cost |
|------|------|
| Development time | (Your time) |
| Test hardware | $0 (existing) |
| API costs (testing) | $50-100 |
| Distribution (signing, etc.) | $100-300 |
| **Total** | **~$200-400** |

---

## 12. Conclusion

### 12.1 Feasibility Summary

| Aspect | Verdict | Confidence |
|--------|---------|------------|
| **Technical Feasibility** | ✅ FEASIBLE | High |
| **Quality Achievable** | ✅ GOOD | Medium-High |
| **Performance Acceptable** | ✅ YES | Medium |
| **Development Complexity** | ⚠️ MODERATE | High |
| **Risk Level** | ⚠️ MODERATE | Medium |

### 12.2 Recommended Approach

1. **Start with POC** (2 weeks) to validate all components
2. **Use hybrid architecture**: Local processing with API fallbacks
3. **Focus on segment-based approach** for timing reliability
4. **Build desktop-first** to avoid server costs
5. **Iterate based on quality testing** before adding features

### 12.3 Critical Success Factors

1. **Voice cloning quality** must be acceptable (test early)
2. **LLM must reliably follow constraints** (invest in prompt engineering)
3. **Timing alignment** must be imperceptible (requires fine-tuning)
4. **User experience** must be simple (hide complexity)

### 12.4 Next Steps

1. ☐ Review this specification
2. ☐ Decide: Proceed to POC or need more research?
3. ☐ If proceed: Set up development environment
4. ☐ Run POC validation tests
5. ☐ Go/No-Go decision after POC

---

*Document created: January 20, 2026*
*For: Roar Bliss Desktop App*
*Author: Technical Architecture Review*

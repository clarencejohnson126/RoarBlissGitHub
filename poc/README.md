# Roar Bliss - Proof of Concept

This POC validates each component of the Roar Bliss pipeline before building the full desktop app.

## Quick Start

### 1. Setup Environment

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Ollama (for local LLM)
# macOS: brew install ollama
# Linux: curl -fsSL https://ollama.com/install.sh | sh
# Windows: Download from https://ollama.com

# Pull LLM model
ollama pull llama3:8b
```

### 2. Get a Test Audio File

Place a motivational speech MP3 in this folder:
- `test_audio/input.mp3` (2-5 minutes, single speaker)

Good test files:
- A short motivational speech from YouTube (download as MP3)
- Any speech with background music

### 3. Run Component Tests

```bash
# Test each component individually
python 01_test_separation.py
python 02_test_transcription.py
python 03_test_analysis.py
python 04_test_llm.py
python 05_test_voice_clone.py

# Or run all tests
python run_all_tests.py
```

### 4. Run Full Pipeline

```bash
python poc_pipeline.py test_audio/input.mp3 \
    --name "Clarence" \
    --goal "Build the #1 AI agency in Germany" \
    --output output/my_motivation.mp3
```

## Component Test Results

After running tests, check these criteria:

| Test | Pass Criteria | Your Result |
|------|---------------|-------------|
| 01_separation | Vocals clearly separated from music | [ ] Pass / [ ] Fail |
| 02_transcription | Text accurate, timestamps present | [ ] Pass / [ ] Fail |
| 03_analysis | Beats detected, climax points found | [ ] Pass / [ ] Fail |
| 04_llm | Word counts match constraints | [ ] Pass / [ ] Fail |
| 05_voice_clone | Voice sounds similar to original | [ ] Pass / [ ] Fail |

## Troubleshooting

### "CUDA out of memory"
Use CPU mode: Set `device='cpu'` in the scripts

### "Ollama connection refused"
Start Ollama: `ollama serve`

### Voice clone sounds robotic
Need more sample audio (30+ seconds of clean speech)

### Timing is off
Check that LLM is respecting word count constraints

## File Structure

```
poc/
├── README.md                 # This file
├── requirements.txt          # Python dependencies
├── 01_test_separation.py     # Test Demucs
├── 02_test_transcription.py  # Test Whisper
├── 03_test_analysis.py       # Test librosa/madmom
├── 04_test_llm.py            # Test LLM constraints
├── 05_test_voice_clone.py    # Test Chatterbox
├── poc_pipeline.py           # Full pipeline
├── run_all_tests.py          # Run all component tests
├── test_audio/               # Put test files here
│   └── input.mp3
└── output/                   # Generated files go here
    ├── vocals.wav
    ├── accompaniment.wav
    ├── transcript.json
    ├── analysis.json
    ├── rewritten.json
    ├── new_speech.wav
    └── final_output.mp3
```

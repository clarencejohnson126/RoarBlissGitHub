# Instructions for Claude Code: High-Fidelity Voice Cloning & Stable Master Mix Replication

Welcome, Claude Code! Your goal is to reproduce a cinema-standard, personalized motivation track based on the Game of Thrones soundtrack. 

This folder contains the complete technical specifications, mathematical parameters, and logic rules to compile the track with **high-fidelity voice cloning**, **exactly 24 custom struggle narrative inserts**, **perfectly stable backing music**, and **exactly 0 ms timeline drift**.

---

## 🎯 Project Target & Success Criteria

You are modifying and compiling the pipeline in `/Users/clarence/Desktop/Roar Bliss App/poc/poc_pipeline.py`. Your completed run must meet these strict criteria:
1. **Perfect Timing Alignment**: The final vocal stem (`vocals_personalized.wav`) must have **exactly 0 ms timeline drift** relative to the original vocal track (`vocals.wav`).
2. **Stable Accompliment Music**: The backing soundtrack must play at a **perfectly constant 100% volume** throughout. There must be **absolutely no dynamic volume pumping or ducking/fading** when custom voices speak.
3. **Automatic dBFS Level-Matching**: Voice clones must not be artificially boosted. Instead, calculate the average loudness (`dBFS`) of the original actor's speech in their clean reference clip, and adjust the cloned segment's gain to match it exactly.
4. **No Smushed Dialogue**: Mute any overlapping original spoken dialogue on the vocal track precisely under the struggle overlays to prevent overlapping voices, while keeping the rest of the dialogue intact.
5. **Report Qwen3-TTS Tokens**: Track and log the total number of synthesis tokens used from the MLX TTS server.

---

## 📂 Instruction Directory Structure

*   `INSTRUCTIONS.md`: This comprehensive specification file.
*   `clarence_struggles.json`: High-fidelity JSON database containing the clean reference windows, 9 surgical word swaps, and 24 chronological struggle narrative inserts.

---

## 🛠️ Step-by-Step Implementation Guide

### Step 1: Environment Setup
Verify that your Python environment is set up and the virtual environment is active:
```bash
cd "/Users/clarence/Desktop/Roar Bliss App/poc"
source venv/bin/activate
pip install -r requirements.txt
```

Verify that the local Qwen3-TTS MLX base server is active and running on port `7860`:
```bash
# Check health of local TTS server
curl http://127.0.0.1:7860/health
```

### Step 2: Speaker Voice Reference Extraction
You must define clean speaker references to feed into the voice-cloning endpoint `http://127.0.0.1:7860/api/v1/base/clone`. Use the hand-crafted windows defined in `clarence_struggles.json`:
*   **Catelyn Stark**: `10.64s` to `16.08s`
*   **Ned Stark**: `70.62s` to `73.14s`
*   **Robert Baratheon**: `53.56s` to `57.56s`
*   **Ramsay Bolton**: `201.02s` to `204.96s`
*   **Ser Jorah Mormont**: `90.26s` to `92.92s`
*   **Daenerys Targaryen**: `106.04s` to `107.36s`
*   **Bran Stark**: `209.46s` to `211.32s`

> [!CRITICAL]
> **Reference Copy extraction rule:**
> To prevent the TTS server from failing with a `ZeroDivisionError: division by zero` when resamplers hit empty buffers, you **must extract the speaker references from a pristine, unmutated copy of the original vocals track**. 
> Do **NOT** extract references from the live `vocals` track that is actively being modified/muted in successive loops.

### Step 3: Implement Stable Accompaniment (No Ducking)
Surgically edit the accompaniment logic in `poc_pipeline.py` or your wrapper. The backing track (`accompaniment.wav`) must remain entirely untouched.
```python
def duck_accompaniment(accomp_track, start_ms, duration_ms, duck_db=0.0):
    # Abide by soundtracks best practices: do not decrease fader volume!
    return accomp_track
```

### Step 4: Implement Automatic dBFS Level-Matching
To create a high-fidelity blend where cloned speech matches the original movie dialogue volumes naturally, calculate and apply the relative gain difference:
```python
# Gain balancing equation:
gain_delta = reference_audio.dBFS - cloned_audio.dBFS
balanced_clone = cloned_audio + gain_delta
```
This mathematically locks the synthesized speech to the exact average loudness of that character's actual voice profile in the movie.

### Step 5: Surgical Muting & Precise Stitching (0 ms Drift)
For both surgical swaps and the 24 narrative overlays:
1. Locate the exact millisecond start and end time.
2. If there are overlapping spoken words in the backing track, mute that exact window on the vocals stem (`vocals_personalized.wav`).
3. Overlay the generated, level-matched clone clip exactly onto that silent window.
4. **Never shift adjacent frames or insert blank space that changes the overall track duration.** The final duration must remain exactly `236449` ms.

---

## 🚀 Execution & Compilation

Once your pipeline script conforms to the parameters above, trigger the generation run:
```bash
./venv/bin/python3 poc_pipeline.py \
  "/Users/clarence/Desktop/Roar Bliss App/The Targaryen Wolf (Original Soundtrack) Game of Thrones.mp3" \
  --name "Clarence" \
  --mode narrative \
  --output "output/final_output.mp3"
```

---

## 🧪 Verification & QA Checklist

After your run completes, execute the output verification script:
```bash
./venv/bin/python3 verify_output.py
```

### Expected Success Output:
```text
============================================================
                ROAR BLISS OUTPUT VERIFICATION
============================================================
✓ Original vocals file exists.
✓ Personalized vocals file exists.
Loading audio tracks...
Original vocals track duration: 236.449 seconds (236449 ms)
Personalized vocals track duration: 236.449 seconds (236449 ms)
Timeline drift: 0 ms
✓ SUCCESS: ZERO TIMELINE DRIFT! The audio is mathematically perfectly aligned!
============================================================
```

If the duration matches exactly and there is **0 ms timeline drift**, you have succeeded in replicating the high-fidelity motivation master soundtrack!

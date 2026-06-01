#!/usr/bin/env python3
"""
Steven x Theon Greyjoy Tribute — Seamless Override Pipeline v1
==============================================================
Applies the 5-phase framework:
  Phase 1: Slots = continuous-speech windows from transcript (no pauses)
  Phase 2: Override text syllable-matched to original (~±10%)
  Phase 3: Voice clone per speaker via Qwen3-TTS @ 127.0.0.1:7860
  Phase 4: Loudness-match to surrounding 3s; time-stretch to fit slot (no silence padding)
  Phase 5: Audit per-slot + global on the way out
"""

import os, sys, json, time, base64, io, requests, hashlib, subprocess, tempfile
from pathlib import Path
from datetime import datetime
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

PROJECT_DIR = Path("/Users/clarence/Desktop/Roar Bliss App")
POC_DIR = PROJECT_DIR / "poc"
SRC_VOCALS = POC_DIR / "output" / "vocals.wav"          # 341s separated vocals (canvas + references)
SRC_ACCOMP = POC_DIR / "output" / "accompaniment.wav"   # 341s separated music+sfx
OUT_DIR = POC_DIR / "output_steven"
CACHE_DIR = OUT_DIR / "tts_cache"
OUT_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

QWEN_URL = "http://127.0.0.1:7860/api/v1/base/clone"

def log(msg, level="info"):
    p = {"info":"  ", "ok":"✓ ", "err":"✗ ", "warn":"⚠ ", "step":"► "}.get(level, "")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {p}{msg}")

# ---------------------------------------------------------------------------
# SPEAKER REFERENCES (clean continuous speech per speaker, from vocals.wav)
# ---------------------------------------------------------------------------
SPEAKERS = {
    "Theon":  {"start": 145.42, "end": 149.74,
               "text": "It always seemed like there was, like there was an impossible choice I had to make."},
    "Yara":   {"start": 238.20, "end": 242.18,
               "text": "He's my brother. Those of you that have sailed under her. And there are many of you here."},
    "Ramsay": {"start":  79.74, "end":  82.40,
               "text": "I'm not kidding you. If you think this has a happy ending."},
    "Jon":    {"start": 205.04, "end": 212.78,
               "text": "If you're so broken that there's no coming back, take a knife and cut your wrists. But if you're staying, Theon, I need you."},
    "Sansa":  {"start": 273.34, "end": 278.52,
               "text": "Everything you did, what you were you are now. If it's what they want, it comes to that you know I'll stand behind you."},
}

# ---------------------------------------------------------------------------
# 28 OVERRIDE SLOTS — Steven's personalization
# ---------------------------------------------------------------------------
OVERRIDES = [
    # ── Opening Arc: Identity, Career, Work (22-50s) ──────────────────────
    {"id":  1, "speaker":"Theon",  "start_ms": 22880, "end_ms": 23680, "text":"The site is not my home.",                              "theme":"career"},
    {"id":  2, "speaker":"Theon",  "start_ms": 25080, "end_ms": 26560, "text":"I take my orders from no one but me.",                  "theme":"work"},
    {"id":  3, "speaker":"Yara",   "start_ms": 30940, "end_ms": 32880, "text":"Their cold words at work cannot keep you down.",        "theme":"work"},
    {"id":  4, "speaker":"Yara",   "start_ms": 33860, "end_ms": 35540, "text":"Your past has made you who you are.",                   "theme":"breakup"},
    {"id":  5, "speaker":"Theon",  "start_ms": 36060, "end_ms": 37480, "text":"I am Steven, strong and true.",                         "theme":"identity"},
    {"id":  6, "speaker":"Theon",  "start_ms": 37580, "end_ms": 39540, "text":"I will build my own future.",                           "theme":"career"},
    {"id":  7, "speaker":"Theon",  "start_ms": 40820, "end_ms": 41780, "text":"I cannot stay where I was.",                            "theme":"career"},
    {"id":  8, "speaker":"Theon",  "start_ms": 42260, "end_ms": 44040, "text":"Construction always reminded me of that.",              "theme":"career"},
    {"id":  9, "speaker":"Theon",  "start_ms": 47460, "end_ms": 48100, "text":"I am Steven.",                                          "theme":"name"},
    {"id": 10, "speaker":"Theon",  "start_ms": 48620, "end_ms": 50640, "text":"I cannot stay in two worlds at once.",                  "theme":"crossroads"},

    # ── Ramsay Arc: Fear, Rebirth, Name (66-110s) ─────────────────────────
    {"id": 11, "speaker":"Ramsay", "start_ms": 68240, "end_ms": 69500, "text":"And you will rise stronger now.",                       "theme":"strength"},
    {"id": 12, "speaker":"Ramsay", "start_ms": 80840, "end_ms": 82400, "text":"If you think your fear will keep you down.",            "theme":"thailand"},
    {"id": 13, "speaker":"Ramsay", "start_ms": 84920, "end_ms": 87080, "text":"You have not yet found your strength.",                 "theme":"gym"},
    {"id": 14, "speaker":"Theon",  "start_ms":107160, "end_ms":108060, "text":"My name is Steven.",                                    "theme":"name"},
    {"id": 15, "speaker":"Ramsay", "start_ms":108260, "end_ms":109840, "text":"I believe in Steven.",                                  "theme":"name"},

    # ── Middle Arc: Crossroads, Choice (136-160s) ─────────────────────────
    {"id": 16, "speaker":"Theon",  "start_ms":136220, "end_ms":139120, "text":"I always wanted to find my own path.",                  "theme":"career"},
    {"id": 17, "speaker":"Theon",  "start_ms":147480, "end_ms":149740, "text":"like there was a path that I was too scared to take.", "theme":"crossroads"},
    {"id": 18, "speaker":"Theon",  "start_ms":151840, "end_ms":152800, "text":"Past or future?",                                       "theme":"crossroads"},
    {"id": 19, "speaker":"Jon",    "start_ms":157700, "end_ms":158340, "text":"You make the choice.",                                  "theme":"crossroads"},
    {"id": 20, "speaker":"Jon",    "start_ms":159960, "end_ms":161160, "text":"Just like she's a part of you.",                        "theme":"breakup"},

    # ── Jon Snow Arc: Identity, Breakup, Gym (176-215s) ───────────────────
    {"id": 21, "speaker":"Jon",    "start_ms":176120, "end_ms":178480, "text":"You're not the man your old job made you.",             "theme":"career"},
    {"id": 22, "speaker":"Jon",    "start_ms":205040, "end_ms":207440, "text":"If she broke you and there's no way to come back,",    "theme":"breakup"},
    {"id": 23, "speaker":"Jon",    "start_ms":207940, "end_ms":209560, "text":"hit the gym and find your strength.",                   "theme":"gym"},
    {"id": 24, "speaker":"Jon",    "start_ms":210180, "end_ms":212780, "text":"But if you're staying, Steven, be true.",               "theme":"resolve"},

    # ── Final Arc: Thailand, Commitment, New Life (221-270s) ──────────────
    {"id": 25, "speaker":"Theon",  "start_ms":221440, "end_ms":222720, "text":"I am Steven, the bold.",                                "theme":"identity"},
    {"id": 26, "speaker":"Sansa",  "start_ms":250600, "end_ms":251680, "text":"You want to fly to Thailand alone.",                    "theme":"thailand"},
    {"id": 27, "speaker":"Theon",  "start_ms":254520, "end_ms":256420, "text":"I will fly to Thailand alone, on my own.",              "theme":"thailand"},
    {"id": 28, "speaker":"Theon",  "start_ms":267300, "end_ms":270340, "text":"From this day Steven owns his life.",                   "theme":"vow"},
]

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def trim_silence(seg, thresh=-45.0, chunk=5):
    s = detect_leading_silence(seg, thresh, chunk)
    e = detect_leading_silence(seg.reverse(), thresh, chunk)
    if s + e >= len(seg): return seg
    return seg[s:len(seg)-e]

def time_stretch_to_target(seg, target_ms):
    """ffmpeg atempo to stretch/compress audio to exact target_ms. Pitch preserved."""
    cur = len(seg)
    if cur == target_ms or cur == 0:
        return seg
    ratio = cur / target_ms  # >1 = audio too long, need speedup (atempo>1)
    if not (0.5 <= ratio <= 2.0):
        log(f"  atempo ratio {ratio:.3f} out of safe range — clipping", "warn")
        ratio = max(0.5, min(2.0, ratio))
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as inp, \
         tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as outp:
        seg.export(inp.name, format="wav")
        cmd = ["ffmpeg","-y","-loglevel","error","-i",inp.name,"-filter:a",f"atempo={ratio:.6f}",outp.name]
        subprocess.run(cmd, check=True)
        stretched = AudioSegment.from_wav(outp.name)
        os.unlink(inp.name); os.unlink(outp.name)
    # Final exact trim/pad (sub-millisecond rounding only)
    delta = len(stretched) - target_ms
    if abs(delta) <= 5:
        return stretched[:target_ms] if delta > 0 else stretched
    return stretched[:target_ms]

def measure_surrounding_dbfs(canvas, start_ms, end_ms, pad_ms=1500):
    """Measure loudness of speech surrounding (not inside) the slot, ±pad_ms."""
    before = canvas[max(0, start_ms-pad_ms):start_ms]
    after  = canvas[end_ms:min(len(canvas), end_ms+pad_ms)]
    combined = before + after
    return combined.dBFS if combined.dBFS != float('-inf') else None

def synthesize_clone(text, speaker_key, ref_path, ref_text):
    cache_key = hashlib.md5(f"steven_v1_{speaker_key}_{text}".encode()).hexdigest()
    cache_file = CACHE_DIR / f"{cache_key}.wav"
    if cache_file.exists():
        return AudioSegment.from_wav(str(cache_file))
    with open(ref_path, "rb") as f:
        ref_b64 = base64.b64encode(f.read()).decode("utf-8")
    payload = {
        "text": text, "language":"English",
        "ref_audio_base64": ref_b64, "ref_text": ref_text,
        "x_vector_only_mode": False, "speed": 1.0, "response_format":"base64"
    }
    r = requests.post(QWEN_URL, json=payload, timeout=120)
    r.raise_for_status()
    clone = AudioSegment.from_wav(io.BytesIO(base64.b64decode(r.json()["audio"])))
    clone = trim_silence(clone)
    clone.export(str(cache_file), format="wav")
    return clone

# ---------------------------------------------------------------------------
# MAIN PIPELINE
# ---------------------------------------------------------------------------
def main():
    t0 = time.time()
    print("="*70); print(" STEVEN x THEON SEAMLESS OVERRIDE PIPELINE v1"); print("="*70)

    # PHASE 0: load
    log("Loading source vocals (341s)...", "step")
    vocals = AudioSegment.from_wav(str(SRC_VOCALS))
    canvas = AudioSegment.from_wav(str(SRC_VOCALS))
    log(f"Source vocals: {len(vocals)/1000:.2f}s @ {vocals.frame_rate}Hz")

    # Extract speaker references
    log("Extracting speaker references...", "step")
    for spk, info in SPEAKERS.items():
        chunk = vocals[int(info["start"]*1000):int(info["end"]*1000)]
        path = CACHE_DIR / f"ref_{spk}.wav"
        chunk.export(str(path), format="wav")
        info["wav_path"] = path
        log(f"  {spk:8s} ref: {len(chunk)/1000:.2f}s -> {path.name}")

    # PHASES 2-4: synthesize, fit, place each slot
    audit_per_slot = []
    for ov in OVERRIDES:
        sid, spk, s_ms, e_ms, txt = ov["id"], ov["speaker"], ov["start_ms"], ov["end_ms"], ov["text"]
        slot_ms = e_ms - s_ms
        spk_info = SPEAKERS[spk]

        log(f"Slot {sid:2d} [{spk:6s}] {s_ms/1000:6.2f}s-{e_ms/1000:6.2f}s ({slot_ms}ms): \"{txt}\"", "step")

        # Synthesize
        try:
            clone = synthesize_clone(txt, spk, spk_info["wav_path"], spk_info["text"])
        except Exception as ex:
            log(f"  SYNTH FAILED: {ex}", "err")
            audit_per_slot.append({"id":sid, "status":"synth_failed", "error":str(ex)})
            continue

        raw_ms = len(clone)
        ratio = raw_ms / slot_ms
        log(f"  Clone raw: {raw_ms}ms (ratio {ratio:.2f}x of slot)")

        # Fit by time-stretch (Phase 4)
        if abs(ratio - 1.0) > 0.10:
            log(f"  Stretch needed: {ratio:.2f}x → 1.00x (out of ±10% range, flag for v2)", "warn")
        fitted = time_stretch_to_target(clone, slot_ms)

        # Loudness match to surrounding 3s of speech
        surround_db = measure_surrounding_dbfs(vocals, s_ms, e_ms, pad_ms=1500)
        if surround_db is not None and fitted.dBFS != float('-inf'):
            gain = surround_db - fitted.dBFS
            fitted = fitted + gain
            log(f"  Loudness matched: surround {surround_db:.2f} dBFS, clone gain {gain:+.2f} dB")

        # Place: REPLACE the slot — silence the original window, overlay clone
        # Rule: clone must EXACTLY fill the slot (no padding silence; time-stretch already enforced)
        silence = AudioSegment.silent(duration=slot_ms, frame_rate=canvas.frame_rate)
        canvas = canvas[:s_ms] + silence + canvas[e_ms:]
        canvas = canvas.overlay(fitted, position=s_ms)

        audit_per_slot.append({
            "id": sid, "speaker": spk, "theme": ov["theme"],
            "slot_ms": slot_ms, "clone_raw_ms": raw_ms, "stretch_ratio": ratio,
            "surround_dbfs": surround_db, "clone_dbfs_final": fitted.dBFS,
            "status": "ok" if abs(ratio-1.0) <= 0.10 else "fit_warning"
        })

    # Sanity: canvas length must equal vocals length
    drift_ms = len(canvas) - len(vocals)
    log(f"Canvas drift vs source vocals: {drift_ms} ms", "ok" if drift_ms == 0 else "err")

    # Save personalized vocals
    pv_path = OUT_DIR / "vocals_personalized.wav"
    canvas.export(str(pv_path), format="wav")
    log(f"Personalized vocals saved: {pv_path}", "ok")

    # Final mix: personalized vocals + accompaniment (NOT the full original MP3)
    log("Mixing personalized vocals + accompaniment via ffmpeg...", "step")
    final_path = OUT_DIR / "steven_theon_personalized.mp3"
    cmd = [
        "ffmpeg","-y","-loglevel","error",
        "-i", str(pv_path),
        "-i", str(SRC_ACCOMP),
        "-filter_complex","[0:a]volume=1.0[s];[1:a]volume=1.0[m];[s][m]amix=inputs=2:duration=longest:normalize=0",
        "-ac","2","-ar","44100","-b:a","320k",
        str(final_path)
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg mix failed: {r.stderr}", "err"); sys.exit(1)
    log(f"Final mix saved: {final_path}", "ok")

    # PHASE 5: audit
    print("\n" + "="*70); print(" AUDIT"); print("="*70)
    final = AudioSegment.from_file(str(final_path))
    audit = {
        "source_vocals_ms": len(vocals),
        "canvas_ms": len(canvas),
        "final_mix_ms": len(final),
        "total_drift_ms": abs(len(vocals) - len(final)),
        "slot_count": len(OVERRIDES),
        "slots_ok": sum(1 for s in audit_per_slot if s.get("status") == "ok"),
        "slots_with_fit_warning": sum(1 for s in audit_per_slot if s.get("status") == "fit_warning"),
        "slots_failed": sum(1 for s in audit_per_slot if s.get("status") == "synth_failed"),
        "slots": audit_per_slot,
    }
    with open(OUT_DIR / "audit.json", "w") as f:
        json.dump(audit, f, indent=2)

    print(f"  Source vocals: {audit['source_vocals_ms']} ms")
    print(f"  Final mix:     {audit['final_mix_ms']} ms")
    print(f"  Drift:         {audit['total_drift_ms']} ms  {'✓' if audit['total_drift_ms']<200 else '✗'}")
    print(f"  Slots OK:      {audit['slots_ok']} / {len(OVERRIDES)}")
    print(f"  Fit warnings:  {audit['slots_with_fit_warning']}")
    print(f"  Synth failed:  {audit['slots_failed']}")
    print(f"\n  Full report:   {OUT_DIR / 'audit.json'}")
    print(f"  Listen to:     {final_path}")
    print(f"\n  Elapsed:       {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()

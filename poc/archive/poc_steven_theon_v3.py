#!/usr/bin/env python3
"""
Steven x Theon v3 — Speed-Calibrated from v2 ratios
====================================================
Reads v2's audit.json to get the measured (clone_duration / slot_duration) ratio
per slot, then re-runs with per-slot Qwen3 speed = original_emotion_speed * v2_ratio.
That bakes the empirical Qwen3 pacing into the request so clones land at slot length.

Cap: speed clamped to [0.7, 1.95]. Slots that would exceed need text rewrites in v4.
"""

import os, sys, json, time, base64, io, requests, hashlib, subprocess, tempfile
from pathlib import Path
from datetime import datetime
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

# Re-use v2's config + overrides + speakers via import
sys.path.insert(0, str(Path(__file__).parent))
from poc_steven_theon_v2 import (
    SPEAKERS, OVERRIDES, SPEED_MAP, QWEN_URL,
    MAX_VOCAL_SILENCE_MS, MAX_VOCAL_SILENCE_SFX_MS, SFX_DBFS_THRESHOLD,
    trim_silence, time_stretch, measure_surrounding_dbfs, detect_sfx_cover,
)

PROJECT_DIR = Path("/Users/clarence/Desktop/Roar Bliss App")
POC_DIR = PROJECT_DIR / "poc"
SRC_VOCALS = POC_DIR / "output" / "vocals.wav"
SRC_ACCOMP = POC_DIR / "output" / "accompaniment.wav"
V2_AUDIT = POC_DIR / "output_steven_v2" / "audit.json"
OUT_DIR = POC_DIR / "output_steven_v3"
CACHE_DIR = OUT_DIR / "tts_cache"
OUT_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

SPEED_MIN, SPEED_MAX = 0.70, 1.95

def log(msg, level="info"):
    p = {"info":"  ", "ok":"✓ ", "err":"✗ ", "warn":"⚠ ", "step":"► "}.get(level, "")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {p}{msg}")

def load_v2_ratios():
    a = json.load(open(V2_AUDIT))
    return {s["id"]: s["ratio"] for s in a["slots"] if "ratio" in s}

def calibrated_speed(emotion, v2_ratio):
    """speed s.t. new_clone_dur = old_clone_dur / (s/old_s) = old_clone_dur * old_s / s → fits when s = old_s * v2_ratio"""
    base = SPEED_MAP.get(emotion, 1.0)
    target = base * v2_ratio
    if target > SPEED_MAX:
        return SPEED_MAX, True   # capped — needs text rewrite
    if target < SPEED_MIN:
        return SPEED_MIN, True
    return round(target, 3), False

def pick_reference_v3(speaker, emotion):
    refs = SPEAKERS[speaker]
    best = next((r for r in refs if r["emotion"] == emotion), refs[0])
    # Use v2's cache directory for refs — they're already extracted there
    ref_path = POC_DIR / "output_steven_v2" / "tts_cache" / f"ref_{speaker}_{best['emotion']}.wav"
    if not ref_path.exists():
        # extract fresh into our cache
        vocals_for_ref = AudioSegment.from_wav(str(SRC_VOCALS))
        chunk = vocals_for_ref[int(best["start"]*1000):int(best["end"]*1000)]
        ref_path = CACHE_DIR / f"ref_{speaker}_{best['emotion']}.wav"
        chunk.export(str(ref_path), format="wav")
    return best, ref_path

def synthesize_clone_v3(text, speaker, emotion, speed):
    ref, ref_path = pick_reference_v3(speaker, emotion)
    cache_key = hashlib.md5(f"v3_{speaker}_{emotion}_{speed}_{text}".encode()).hexdigest()
    cache_file = CACHE_DIR / f"clone_{cache_key}.wav"
    if cache_file.exists():
        return AudioSegment.from_wav(str(cache_file)), ref["emotion"]
    with open(ref_path, "rb") as f:
        ref_b64 = base64.b64encode(f.read()).decode()
    payload = {
        "text": text, "language":"English",
        "ref_audio_base64": ref_b64, "ref_text": ref["text"],
        "x_vector_only_mode": False, "speed": speed, "response_format":"base64"
    }
    r = requests.post(QWEN_URL, json=payload, timeout=120)
    r.raise_for_status()
    clone = AudioSegment.from_wav(io.BytesIO(base64.b64decode(r.json()["audio"])))
    clone = trim_silence(clone)
    clone.export(str(cache_file), format="wav")
    return clone, ref["emotion"]

def main():
    t0 = time.time()
    print("="*70); print(" STEVEN x THEON v3 — SPEED-CALIBRATED FROM v2 RATIOS"); print("="*70)

    log("Loading v2 ratios + source audio...", "step")
    v2_ratios = load_v2_ratios()
    vocals = AudioSegment.from_wav(str(SRC_VOCALS))
    accomp = AudioSegment.from_wav(str(SRC_ACCOMP))
    canvas = AudioSegment.from_wav(str(SRC_VOCALS))
    log(f"v2 ratios loaded for {len(v2_ratios)} slots")

    audit_slots = []
    speed_caps = 0
    for ov in OVERRIDES:
        sid, spk, emo, s_ms, e_ms, txt = ov["id"], ov["speaker"], ov["emotion"], ov["start_ms"], ov["end_ms"], ov["text"]
        slot_ms = e_ms - s_ms
        v2_ratio = v2_ratios.get(sid, 1.0)
        speed, was_capped = calibrated_speed(emo, v2_ratio)
        if was_capped: speed_caps += 1
        base_speed = SPEED_MAP.get(emo, 1.0)

        log(f"Slot {sid:2d} [{spk:6s}|{emo:18s}] ({slot_ms}ms): v2_ratio={v2_ratio:.2f}  base_spd={base_speed}  new_spd={speed}{' (CAPPED)' if was_capped else ''}", "step")

        try:
            clone, used_emo = synthesize_clone_v3(txt, spk, emo, speed)
        except Exception as ex:
            log(f"  SYNTH FAILED: {ex}", "err")
            audit_slots.append({"id":sid, "status":"synth_failed", "error":str(ex)})
            continue

        raw_ms = len(clone)
        new_ratio = raw_ms / slot_ms
        log(f"  Clone raw: {raw_ms}ms (new ratio {new_ratio:.2f}x)")

        # Fit decision (v2 logic)
        if abs(new_ratio - 1.0) <= 0.10:
            fitted = time_stretch(clone, slot_ms); silence_after = 0; decision = "exact-fit"
        elif new_ratio < 0.90:
            silence_after = slot_ms - raw_ms
            sfx = detect_sfx_cover(accomp, s_ms + raw_ms, e_ms)
            cap = MAX_VOCAL_SILENCE_SFX_MS if sfx else MAX_VOCAL_SILENCE_MS
            if silence_after <= cap:
                fitted = clone; decision = f"cut-to-fit (silence {silence_after}ms, sfx={sfx})"
            else:
                fitted = time_stretch(clone, slot_ms); silence_after = 0; decision = f"stretch-fallback (silence {silence_after}ms > cap)"
        else:
            fitted = time_stretch(clone, slot_ms); silence_after = 0; decision = f"stretch-compress (ratio {new_ratio:.2f})"
        log(f"  Fit: {decision}")

        # Loudness match
        surround_db = measure_surrounding_dbfs(vocals, s_ms, e_ms, pad_ms=1500)
        if surround_db is not None and fitted.dBFS != float('-inf'):
            gain = surround_db - fitted.dBFS
            fitted = fitted + gain

        silence_block = AudioSegment.silent(duration=slot_ms, frame_rate=canvas.frame_rate)
        canvas = canvas[:s_ms] + silence_block + canvas[e_ms:]
        canvas = canvas.overlay(fitted, position=s_ms)

        audit_slots.append({
            "id": sid, "speaker": spk, "emotion": emo, "theme": ov["theme"],
            "slot_ms": slot_ms, "v2_ratio": round(v2_ratio,3), "v3_speed": speed,
            "v3_ratio": round(new_ratio,3), "decision": decision,
            "silence_after_ms": silence_after, "was_capped": was_capped,
            "status": "ok" if ("exact-fit" in decision or "cut-to-fit" in decision) else "fit_warning",
        })

    drift_ms = len(canvas) - len(vocals)
    log(f"Canvas drift: {drift_ms} ms", "ok" if drift_ms == 0 else "err")

    pv_path = OUT_DIR / "vocals_personalized.wav"
    canvas.export(str(pv_path), format="wav")
    log(f"Personalized vocals: {pv_path}", "ok")

    log("Mixing...", "step")
    final_path = OUT_DIR / "steven_theon_personalized_v3.mp3"
    cmd = ["ffmpeg","-y","-loglevel","error","-i",str(pv_path),"-i",str(SRC_ACCOMP),
           "-filter_complex","[0:a]volume=1.0[s];[1:a]volume=1.0[m];[s][m]amix=inputs=2:duration=longest:normalize=0",
           "-ac","2","-ar","44100","-b:a","320k", str(final_path)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg failed: {r.stderr}", "err"); sys.exit(1)
    log(f"Final: {final_path}", "ok")

    print("\n" + "="*70); print(" AUDIT v3"); print("="*70)
    decision_counts = {}
    for s in audit_slots:
        d = s.get("decision","?").split(" ")[0]
        decision_counts[d] = decision_counts.get(d, 0) + 1
    audit = {
        "drift_ms": drift_ms, "slot_count": len(OVERRIDES),
        "slots_ok": sum(1 for s in audit_slots if s.get("status") == "ok"),
        "slots_fit_warning": sum(1 for s in audit_slots if s.get("status") == "fit_warning"),
        "speed_caps": speed_caps, "fit_decisions": decision_counts,
        "slots": audit_slots,
    }
    with open(OUT_DIR / "audit.json", "w") as f:
        json.dump(audit, f, indent=2)

    print(f"  Drift:           {drift_ms} ms")
    print(f"  Slots OK:        {audit['slots_ok']} / {len(OVERRIDES)}  (v2 was 5/28)")
    print(f"  Fit warnings:    {audit['slots_fit_warning']}  (v2 was 23)")
    print(f"  Speed-capped:    {speed_caps}  (these need text rewrite in v4)")
    print(f"  Fit decisions:   {decision_counts}")
    print(f"\n  Listen:          {final_path}")
    print(f"  Audit:           {OUT_DIR / 'audit.json'}")
    print(f"  Elapsed:         {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()

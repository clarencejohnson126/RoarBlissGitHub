#!/usr/bin/env python3
"""
Steven x Theon Greyjoy Tribute — Seamless Override Pipeline v2
==============================================================
v2 additions over v1:
  - Emotion-tagged reference library per speaker (Qwen3 has no instruct param for cloning,
    so we encode emotion by picking the matching reference)
  - Per-slot emotion + speed (sad/contemplative slow down, excited speed up)
  - Phase 4 fit logic v2: cut-to-fit (trim original slot to clone length, max 3s silence cap)
    instead of always time-stretching
  - SFX detection in accompaniment to relax the 3s silence cap during dense music
  - Per-slot audit decisions logged
"""

import os, sys, json, time, base64, io, requests, hashlib, subprocess, tempfile
from pathlib import Path
from datetime import datetime
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

PROJECT_DIR = Path("/Users/clarence/Desktop/Roar Bliss App")
POC_DIR = PROJECT_DIR / "poc"
SRC_VOCALS = POC_DIR / "output" / "vocals.wav"
SRC_ACCOMP = POC_DIR / "output" / "accompaniment.wav"
OUT_DIR = POC_DIR / "output_steven_v2"
CACHE_DIR = OUT_DIR / "tts_cache"
OUT_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

QWEN_URL = "http://127.0.0.1:7860/api/v1/base/clone"

def log(msg, level="info"):
    p = {"info":"  ", "ok":"✓ ", "err":"✗ ", "warn":"⚠ ", "step":"► "}.get(level, "")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {p}{msg}")

# ---------------------------------------------------------------------------
# EMOTION-TAGGED REFERENCE LIBRARY
# Each speaker has multiple references; each tagged with an emotion label.
# At synth time, the slot's emotion picks the matching reference.
# ---------------------------------------------------------------------------
SPEAKERS = {
    "Theon": [
        {"emotion":"defiant",        "start":36.06, "end":39.54, "text":"My blood is salt and iron. I have no other family."},
        {"emotion":"contemplative",  "start":136.22,"end":139.12,"text":"I always wanted to do the right thing."},
        {"emotion":"calm-measured",  "start":145.42,"end":149.74,"text":"It always seemed like there was, like there was an impossible choice I had to make."},
        {"emotion":"broken-whisper", "start":107.16,"end":109.84,"text":"My name is Reek. I believe in Reek."},
        {"emotion":"resolute-strong","start":221.44,"end":225.12,"text":"I am Theon Greyjoy. Stay down. Or I'll kill you."},
        {"emotion":"pledged-solemn", "start":267.30,"end":270.34,"text":"From this day until my last day."},
    ],
    "Yara": [
        {"emotion":"provoking",      "start":30.94, "end":35.54, "text":"Your loyalty to your captors is touching. The Starks have made you theirs."},
    ],
    "Ramsay": [
        {"emotion":"menacing-playful","start":79.74,"end":82.40, "text":"I'm not kidding you. If you think this has a happy ending."},
        {"emotion":"hard-instructional","start":84.92,"end":87.08,"text":"You haven't been paying attention."},
    ],
    "Jon": [
        {"emotion":"wise-teaching",  "start":156.04,"end":161.16,"text":"He never lost him. He made a choice. He's a part of you. Just like he's a part of me."},
        {"emotion":"challenging",    "start":176.12,"end":178.48,"text":"You're not the man you're pretending to be."},
        {"emotion":"concerned",      "start":205.04,"end":207.44,"text":"If you're so broken that there's no coming back,"},
        {"emotion":"firm-tough",     "start":210.18,"end":212.78,"text":"But if you're staying, Theon, I need you."},
    ],
    "Sansa": [
        {"emotion":"solemn-devoted", "start":273.34,"end":278.52,"text":"Everything you did, what you were you are now. If it's what they want, it comes to that you know I'll stand behind you."},
    ],
}

# Speed map per emotion family (multiplier passed to Qwen3)
SPEED_MAP = {
    "broken-whisper": 0.85, "contemplative": 0.92, "calm-measured": 0.95, "solemn-devoted": 0.92,
    "pledged-solemn": 0.95, "concerned": 0.95, "wise-teaching": 0.97,
    "defiant": 1.0, "resolute-strong": 1.0, "challenging": 1.0, "questioning": 1.0,
    "menacing-playful": 0.98, "hard-instructional": 1.0, "provoking": 1.0,
    "firm-tough": 1.0, "conflicted": 0.95,
}

# ---------------------------------------------------------------------------
# 28 OVERRIDE SLOTS — Steven's personalization (with emotion tags)
# ---------------------------------------------------------------------------
OVERRIDES = [
    {"id": 1,"speaker":"Theon", "emotion":"defiant",          "start_ms": 22880,"end_ms": 23680,"text":"The site is not my home.",                              "theme":"career"},
    {"id": 2,"speaker":"Theon", "emotion":"defiant",          "start_ms": 25080,"end_ms": 26560,"text":"I take my orders from no one but me.",                  "theme":"work"},
    {"id": 3,"speaker":"Yara",  "emotion":"provoking",        "start_ms": 30940,"end_ms": 32880,"text":"Their cold words at work cannot keep you down.",        "theme":"work"},
    {"id": 4,"speaker":"Yara",  "emotion":"provoking",        "start_ms": 33860,"end_ms": 35540,"text":"Your past has made you who you are.",                   "theme":"breakup"},
    {"id": 5,"speaker":"Theon", "emotion":"resolute-strong",  "start_ms": 36060,"end_ms": 37480,"text":"I am Steven, strong and true.",                         "theme":"identity"},
    {"id": 6,"speaker":"Theon", "emotion":"defiant",          "start_ms": 37580,"end_ms": 39540,"text":"I will build my own future from scratch.",              "theme":"career"},
    {"id": 7,"speaker":"Theon", "emotion":"defiant",          "start_ms": 40820,"end_ms": 41780,"text":"I cannot stay where I was.",                            "theme":"career"},
    {"id": 8,"speaker":"Theon", "emotion":"contemplative",    "start_ms": 42260,"end_ms": 44040,"text":"Construction always reminded me of that.",              "theme":"career"},
    {"id": 9,"speaker":"Theon", "emotion":"resolute-strong",  "start_ms": 47460,"end_ms": 48100,"text":"I am Steven.",                                          "theme":"name"},
    {"id":10,"speaker":"Theon", "emotion":"calm-measured",    "start_ms": 48620,"end_ms": 50640,"text":"I cannot stay in two worlds at the same time anymore.", "theme":"crossroads"},
    {"id":11,"speaker":"Ramsay","emotion":"menacing-playful", "start_ms": 68240,"end_ms": 69500,"text":"And you will rise stronger now.",                       "theme":"strength"},
    {"id":12,"speaker":"Ramsay","emotion":"menacing-playful", "start_ms": 80840,"end_ms": 82400,"text":"If you think your fear will keep you down.",            "theme":"thailand"},
    {"id":13,"speaker":"Ramsay","emotion":"hard-instructional","start_ms":84920,"end_ms": 87080,"text":"You have not yet found your true strength inside.",     "theme":"gym"},
    {"id":14,"speaker":"Theon", "emotion":"broken-whisper",   "start_ms":107160,"end_ms":108060,"text":"My name is Steven.",                                    "theme":"name"},
    {"id":15,"speaker":"Ramsay","emotion":"hard-instructional","start_ms":108260,"end_ms":109840,"text":"I believe in Steven.",                                 "theme":"name"},
    {"id":16,"speaker":"Theon", "emotion":"contemplative",    "start_ms":136220,"end_ms":139120,"text":"I always wanted to find my own true path in this life.","theme":"career"},
    {"id":17,"speaker":"Theon", "emotion":"calm-measured",    "start_ms":147480,"end_ms":149740,"text":"like there was a path that I was too scared to take.", "theme":"crossroads"},
    {"id":18,"speaker":"Theon", "emotion":"calm-measured",    "start_ms":151840,"end_ms":152800,"text":"Past or future?",                                       "theme":"crossroads"},
    {"id":19,"speaker":"Jon",   "emotion":"wise-teaching",    "start_ms":157700,"end_ms":158340,"text":"You choose.",                                           "theme":"crossroads"},
    {"id":20,"speaker":"Jon",   "emotion":"wise-teaching",    "start_ms":159960,"end_ms":161160,"text":"Just like she's a part of you.",                        "theme":"breakup"},
    {"id":21,"speaker":"Jon",   "emotion":"challenging",      "start_ms":176120,"end_ms":178480,"text":"You're not the man your old job made you to be.",       "theme":"career"},
    {"id":22,"speaker":"Jon",   "emotion":"concerned",        "start_ms":205040,"end_ms":207440,"text":"If she broke you and there's no way to come back,",    "theme":"breakup"},
    {"id":23,"speaker":"Jon",   "emotion":"firm-tough",       "start_ms":207940,"end_ms":209560,"text":"hit the gym and find your strength.",                   "theme":"gym"},
    {"id":24,"speaker":"Jon",   "emotion":"firm-tough",       "start_ms":210180,"end_ms":212780,"text":"But if you're staying, Steven, I need you to be true.", "theme":"resolve"},
    {"id":25,"speaker":"Theon", "emotion":"resolute-strong",  "start_ms":221440,"end_ms":222720,"text":"I am Steven, the bold.",                                "theme":"identity"},
    {"id":26,"speaker":"Sansa", "emotion":"solemn-devoted",   "start_ms":250600,"end_ms":251680,"text":"You want Thailand alone.",                              "theme":"thailand"},
    {"id":27,"speaker":"Theon", "emotion":"resolute-strong",  "start_ms":254520,"end_ms":256420,"text":"I will fly to Thailand on my own.",                     "theme":"thailand"},
    {"id":28,"speaker":"Theon", "emotion":"pledged-solemn",   "start_ms":267300,"end_ms":270340,"text":"From this day forward Steven owns his life path.",     "theme":"vow"},
]

# Fit-cap rules
MAX_VOCAL_SILENCE_MS = 3000       # default 3s cap when no SFX cover
MAX_VOCAL_SILENCE_SFX_MS = 5000   # relaxed cap when accompaniment has SFX cover
SFX_DBFS_THRESHOLD = -22.0        # accompaniment RMS above this = SFX present

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def trim_silence(seg, thresh=-45.0, chunk=5):
    s = detect_leading_silence(seg, thresh, chunk)
    e = detect_leading_silence(seg.reverse(), thresh, chunk)
    if s + e >= len(seg): return seg
    return seg[s:len(seg)-e]

def time_stretch(seg, target_ms):
    cur = len(seg)
    if cur == target_ms or cur == 0:
        return seg
    ratio = cur / target_ms
    if not (0.5 <= ratio <= 2.0):
        ratio = max(0.5, min(2.0, ratio))
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as inp, \
         tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as outp:
        seg.export(inp.name, format="wav")
        subprocess.run(["ffmpeg","-y","-loglevel","error","-i",inp.name,"-filter:a",f"atempo={ratio:.6f}",outp.name], check=True)
        out = AudioSegment.from_wav(outp.name)
        os.unlink(inp.name); os.unlink(outp.name)
    return out[:target_ms] if len(out) > target_ms else out

def measure_surrounding_dbfs(canvas, start_ms, end_ms, pad_ms=1500):
    seg = canvas[max(0,start_ms-pad_ms):start_ms] + canvas[end_ms:min(len(canvas),end_ms+pad_ms)]
    return seg.dBFS if seg.dBFS != float('-inf') else None

def detect_sfx_cover(accomp, start_ms, end_ms):
    """True if accompaniment in [start_ms,end_ms] has SFX (loud transients)."""
    region = accomp[start_ms:end_ms]
    if len(region) == 0: return False
    return region.dBFS > SFX_DBFS_THRESHOLD

def pick_reference(speaker, emotion):
    """Pick the best emotion-matching reference for the speaker, with caching."""
    refs = SPEAKERS[speaker]
    best = next((r for r in refs if r["emotion"] == emotion), refs[0])
    ref_path = CACHE_DIR / f"ref_{speaker}_{best['emotion']}.wav"
    return best, ref_path

def synthesize_clone(text, speaker, emotion, speed):
    ref, ref_path = pick_reference(speaker, emotion)
    cache_key = hashlib.md5(f"v2_{speaker}_{emotion}_{speed}_{text}".encode()).hexdigest()
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

# ---------------------------------------------------------------------------
# MAIN PIPELINE
# ---------------------------------------------------------------------------
def main():
    t0 = time.time()
    print("="*70); print(" STEVEN x THEON SEAMLESS OVERRIDE PIPELINE v2"); print("="*70)

    log("Loading source vocals + accompaniment...", "step")
    vocals = AudioSegment.from_wav(str(SRC_VOCALS))
    accomp = AudioSegment.from_wav(str(SRC_ACCOMP))
    canvas = AudioSegment.from_wav(str(SRC_VOCALS))
    log(f"Vocals: {len(vocals)/1000:.2f}s  Accompaniment: {len(accomp)/1000:.2f}s")

    # Extract emotion-tagged reference clips per speaker
    log("Extracting emotion-tagged reference library...", "step")
    for spk, refs in SPEAKERS.items():
        for r in refs:
            path = CACHE_DIR / f"ref_{spk}_{r['emotion']}.wav"
            chunk = vocals[int(r["start"]*1000):int(r["end"]*1000)]
            chunk.export(str(path), format="wav")
        log(f"  {spk:7s}: {len(refs)} emotion ref(s)")

    audit_slots = []
    for ov in OVERRIDES:
        sid, spk, emo, s_ms, e_ms, txt = ov["id"], ov["speaker"], ov["emotion"], ov["start_ms"], ov["end_ms"], ov["text"]
        slot_ms = e_ms - s_ms
        speed = SPEED_MAP.get(emo, 1.0)

        log(f"Slot {sid:2d} [{spk:6s}|{emo:18s}|spd{speed:.2f}] {s_ms/1000:6.2f}-{e_ms/1000:6.2f}s ({slot_ms}ms): \"{txt}\"", "step")
        try:
            clone, used_emo = synthesize_clone(txt, spk, emo, speed)
        except Exception as ex:
            log(f"  SYNTH FAILED: {ex}", "err")
            audit_slots.append({"id":sid,"status":"synth_failed","error":str(ex)})
            continue

        raw_ms = len(clone)
        ratio = raw_ms / slot_ms
        log(f"  Clone raw: {raw_ms}ms (ratio {ratio:.2f}x)  emotion_ref={used_emo}")

        # ── PHASE 4 v2: fit decision ───────────────────────────────────────
        decision = None
        if abs(ratio - 1.0) <= 0.10:
            # Tactic A: within ±10%, just stretch to exact
            fitted = time_stretch(clone, slot_ms)
            silence_after_ms = 0
            decision = "exact-fit"
        elif ratio < 0.90:
            # Tactic B: clone shorter than slot — cut original slot, fill freed time with silence
            silence_after_ms = slot_ms - raw_ms
            sfx_cover = detect_sfx_cover(accomp, s_ms + raw_ms, e_ms)
            cap = MAX_VOCAL_SILENCE_SFX_MS if sfx_cover else MAX_VOCAL_SILENCE_MS
            if silence_after_ms <= cap:
                fitted = clone
                decision = f"cut-to-fit (silence {silence_after_ms}ms, cap {cap}ms, sfx_cover={sfx_cover})"
            else:
                # Silence would exceed cap — micro-stretch clone slower (capped at 0.90x compression of original-already-too-short)
                # Use stretch as fallback but warn
                fitted = time_stretch(clone, slot_ms)
                silence_after_ms = 0
                decision = f"stretch-fallback (silence {slot_ms-raw_ms}ms > cap {cap}ms, sfx_cover={sfx_cover})"
        else:
            # ratio > 1.10: clone longer than slot — stretch faster (capped, lossy)
            fitted = time_stretch(clone, slot_ms)
            silence_after_ms = 0
            decision = f"stretch-compress (ratio {ratio:.2f}, text should be shortened in v3)"
        log(f"  Fit decision: {decision}")

        # Loudness match to surrounding speech
        surround_db = measure_surrounding_dbfs(vocals, s_ms, e_ms, pad_ms=1500)
        if surround_db is not None and fitted.dBFS != float('-inf'):
            gain = surround_db - fitted.dBFS
            fitted = fitted + gain
            log(f"  Loudness matched: surround {surround_db:.2f} dBFS, gain {gain:+.2f} dB")

        # Place: silence the slot, overlay clone at start (silence after clone = silence_after_ms)
        silence_block = AudioSegment.silent(duration=slot_ms, frame_rate=canvas.frame_rate)
        canvas = canvas[:s_ms] + silence_block + canvas[e_ms:]
        canvas = canvas.overlay(fitted, position=s_ms)

        audit_slots.append({
            "id": sid, "speaker": spk, "emotion": emo, "theme": ov["theme"],
            "slot_ms": slot_ms, "clone_raw_ms": raw_ms, "ratio": round(ratio,3),
            "decision": decision, "silence_after_ms": silence_after_ms,
            "surround_dbfs": round(surround_db,2) if surround_db else None,
            "clone_dbfs_final": round(fitted.dBFS,2) if fitted.dBFS != float('-inf') else None,
            "status": "ok" if "exact-fit" in decision or "cut-to-fit" in decision else "fit_warning",
        })

    drift_ms = len(canvas) - len(vocals)
    log(f"Canvas drift vs source: {drift_ms} ms", "ok" if drift_ms == 0 else "err")

    pv_path = OUT_DIR / "vocals_personalized.wav"
    canvas.export(str(pv_path), format="wav")
    log(f"Personalized vocals: {pv_path}", "ok")

    log("Mixing personalized vocals + accompaniment...", "step")
    final_path = OUT_DIR / "steven_theon_personalized_v2.mp3"
    cmd = ["ffmpeg","-y","-loglevel","error",
           "-i", str(pv_path), "-i", str(SRC_ACCOMP),
           "-filter_complex","[0:a]volume=1.0[s];[1:a]volume=1.0[m];[s][m]amix=inputs=2:duration=longest:normalize=0",
           "-ac","2","-ar","44100","-b:a","320k", str(final_path)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg mix failed: {r.stderr}", "err"); sys.exit(1)
    log(f"Final mix: {final_path}", "ok")

    print("\n" + "="*70); print(" AUDIT v2"); print("="*70)
    final = AudioSegment.from_file(str(final_path))
    decision_counts = {}
    for s in audit_slots:
        d = s.get("decision","?").split(" ")[0]
        decision_counts[d] = decision_counts.get(d, 0) + 1
    audit = {
        "source_vocals_ms": len(vocals), "final_mix_ms": len(final),
        "drift_ms": abs(len(vocals) - len(final)),
        "slot_count": len(OVERRIDES),
        "slots_ok": sum(1 for s in audit_slots if s.get("status") == "ok"),
        "slots_fit_warning": sum(1 for s in audit_slots if s.get("status") == "fit_warning"),
        "slots_failed": sum(1 for s in audit_slots if s.get("status") == "synth_failed"),
        "fit_decisions": decision_counts,
        "slots": audit_slots,
    }
    with open(OUT_DIR / "audit.json", "w") as f:
        json.dump(audit, f, indent=2)

    print(f"  Drift:               {audit['drift_ms']} ms  {'✓' if audit['drift_ms']<200 else '✗'}")
    print(f"  Slots OK:            {audit['slots_ok']} / {len(OVERRIDES)}")
    print(f"  Fit warnings:        {audit['slots_fit_warning']}")
    print(f"  Synth failures:      {audit['slots_failed']}")
    print(f"  Fit decisions:       {audit['fit_decisions']}")
    print(f"\n  Listen:              {final_path}")
    print(f"  Audit:               {OUT_DIR / 'audit.json'}")
    print(f"  Elapsed:             {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()

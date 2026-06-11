#!/usr/bin/env python3
"""
Steven x Theon v7 — storyline arc + name distribution + continuity + emotion variety
====================================================================================
Architecture unchanged from v6 (cut-to-fit, retry+sanity, slot-dBFS loudness).
This pass is purely content craft on the OVERRIDES table:
  - STORYLINE: 25 slots structured as a 7-beat arc (setup → rejection → identity
    claim → break → name reclamation → contemplation → resolution)
  - NAME DISTRIBUTION: "Steven" said in only 4 slots (1, 9, 16, 21) = once per
    ~35s. Other slots use "him/he/his" or no reference — kills the repetition.
  - CONTINUITY: each clone's text written to flow tonally and where possible
    semantically into the original speech that follows
  - EMOTION VARIETY: 6 distinct emotions across the 25 slots (vs 4-5 in v6)
  - Slot 21 changed to single word "Steven" in broken-whisper voice — Theon's
    "My name is Reek" reclamation moment becomes Steven's identity peak
"""

import os, sys, json, time, base64, io, requests, hashlib, subprocess, tempfile
from pathlib import Path
from datetime import datetime
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

PROJECT_DIR = Path("/Users/clarence/Desktop/Roar Bliss App")
POC_DIR = PROJECT_DIR / "poc"
SRC_VOCALS_FULL = POC_DIR / "output" / "vocals.wav"          # 341s, used for reference extraction
SRC_ACCOMP_FULL = POC_DIR / "output" / "accompaniment.wav"   # 341s
OUT_DIR = POC_DIR / "output_steven_v7"
CACHE_DIR = OUT_DIR / "tts_cache"  # v7 has all-new text, fresh synth needed
OUT_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

QWEN_URL = "http://127.0.0.1:7860/api/v1/base/clone"
WINDOW_MS = 180_000  # 3 min cap
MAX_VOCAL_SILENCE_MS = 3000
MAX_VOCAL_SILENCE_SFX_MS = 5000
SFX_DBFS_THRESHOLD = -22.0

def log(msg, level="info"):
    p = {"info":"  ", "ok":"✓ ", "err":"✗ ", "warn":"⚠ ", "step":"► "}.get(level, "")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {p}{msg}")

# ---------------------------------------------------------------------------
# REFERENCES (within 0-180s where possible)
# ---------------------------------------------------------------------------
SPEAKERS = {
    "Narrator": [{"emotion":"neutral", "start":12.54,"end":15.34, "text":"And failed rebellions. And the Greyjoy."}],
    "Theon": [
        {"emotion":"defiant",        "start":36.06,"end":39.54, "text":"My blood is salt and iron. I have no other family."},
        {"emotion":"contemplative",  "start":136.22,"end":139.12,"text":"I always wanted to do the right thing."},
        {"emotion":"calm-measured",  "start":145.42,"end":149.74,"text":"It always seemed like there was, like there was an impossible choice I had to make."},
        {"emotion":"broken-whisper", "start":107.16,"end":109.84,"text":"My name is Reek. I believe in Reek."},
        {"emotion":"resolute-strong","start":47.46, "end":50.64, "text":"I'm a Greyjoy. I can't fight for Rob and my father both."},
    ],
    "Yara": [{"emotion":"provoking", "start":30.94,"end":35.54, "text":"Your loyalty to your captors is touching. The Starks have made you theirs."}],
    "Ramsay": [
        {"emotion":"menacing-playful","start":79.74,"end":82.40,"text":"I'm not kidding you. If you think this has a happy ending."},
        {"emotion":"hard-instructional","start":84.92,"end":87.08,"text":"You haven't been paying attention."},
    ],
}

# ---------------------------------------------------------------------------
# 25 OVERRIDES — first 180s, text short (~3 syl/sec target)
# ---------------------------------------------------------------------------
OVERRIDES = [
    # ── BEAT 1: SETUP (0-15s) — meet the hero, plant the name early ───────
    {"id": 1,"speaker":"Narrator","emotion":"neutral",         "start_ms":  1040,"end_ms":  2260,"text":"Meet Steven.",                       "theme":"name"},        # NAME #1
    {"id": 2,"speaker":"Narrator","emotion":"neutral",         "start_ms":  2800,"end_ms":  4020,"text":"At his crossroads.",                 "theme":"crossroads"},
    {"id": 3,"speaker":"Narrator","emotion":"neutral",         "start_ms":  7480,"end_ms":  8240,"text":"The dreamer.",                       "theme":"identity"},
    {"id": 4,"speaker":"Narrator","emotion":"neutral",         "start_ms":  8600,"end_ms": 10240,"text":"Famous for big dreams.",             "theme":"career"},

    # ── BEAT 2: REJECTION (22-50s) — saying NO to the old life ────────────
    {"id": 5,"speaker":"Theon",   "emotion":"defiant",         "start_ms": 22880,"end_ms": 23680,"text":"Not my world.",                      "theme":"career"},      # primes "Put away your blade"
    {"id": 6,"speaker":"Theon",   "emotion":"defiant",         "start_ms": 25080,"end_ms": 26560,"text":"I answer to no one.",                "theme":"work"},        # primes "Of course not"
    {"id": 7,"speaker":"Yara",    "emotion":"provoking",       "start_ms": 30940,"end_ms": 32880,"text":"Their cold words cannot hold him.",  "theme":"work"},        # third person to break "you" monotony
    {"id": 8,"speaker":"Yara",    "emotion":"provoking",       "start_ms": 33860,"end_ms": 35540,"text":"His past has made him bold.",        "theme":"breakup"},
    {"id": 9,"speaker":"Theon",   "emotion":"resolute-strong", "start_ms": 36060,"end_ms": 37480,"text":"I am Steven now.",                   "theme":"identity"},    # NAME #2 — identity claim
    {"id":10,"speaker":"Theon",   "emotion":"defiant",         "start_ms": 40820,"end_ms": 41780,"text":"Done with the past.",                "theme":"career"},
    {"id":11,"speaker":"Theon",   "emotion":"contemplative",   "start_ms": 42260,"end_ms": 44040,"text":"The old life weighed on him.",       "theme":"career"},
    {"id":12,"speaker":"Theon",   "emotion":"resolute-strong", "start_ms": 47460,"end_ms": 48100,"text":"It's him.",                          "theme":"identity"},    # no name needed — implicit
    {"id":13,"speaker":"Theon",   "emotion":"calm-measured",   "start_ms": 48620,"end_ms": 50640,"text":"He can not live two lives.",         "theme":"crossroads"},

    # ── BEAT 3: IDENTITY REBIRTH (50-66s) — naming who he wants to be ─────
    {"id":14,"speaker":"Theon",   "emotion":"resolute-strong", "start_ms": 50920,"end_ms": 51860,"text":"He's reborn.",                       "theme":"identity"},
    {"id":15,"speaker":"Theon",   "emotion":"resolute-strong", "start_ms": 52540,"end_ms": 53280,"text":"He is free.",                        "theme":"identity"},
    {"id":16,"speaker":"Theon",   "emotion":"defiant",         "start_ms": 56080,"end_ms": 58800,"text":"A.I. is what Steven was born for.",  "theme":"career"},      # NAME #3 — career conviction
    {"id":17,"speaker":"Theon",   "emotion":"resolute-strong", "start_ms": 64060,"end_ms": 65880,"text":"He'll build his own empire now.",    "theme":"vow"},

    # ── BEAT 4: THE BREAK (66-110s) — fear, rebirth via Ramsay arc ────────
    {"id":18,"speaker":"Ramsay",  "emotion":"menacing-playful","start_ms": 68240,"end_ms": 69500,"text":"Rise up now.",                       "theme":"strength"},
    {"id":19,"speaker":"Ramsay",  "emotion":"menacing-playful","start_ms": 80840,"end_ms": 82400,"text":"If fear stops you cold.",            "theme":"thailand"},
    {"id":20,"speaker":"Ramsay",  "emotion":"hard-instructional","start_ms":84920,"end_ms": 87080,"text":"Find your strength deep within.",   "theme":"gym"},

    # ── BEAT 5: NAME RECLAMATION (107-110s) — peak emotional moment ───────
    {"id":21,"speaker":"Theon",   "emotion":"broken-whisper",  "start_ms":107160,"end_ms":108060,"text":"Steven.",                            "theme":"name"},        # NAME #4 — single word, broken whisper

    # ── BEAT 6: CONTEMPLATION (135-160s) — what does he really want? ──────
    {"id":22,"speaker":"Theon",   "emotion":"contemplative",   "start_ms":136220,"end_ms":139120,"text":"Thailand has always called him home.","theme":"thailand"},
    {"id":23,"speaker":"Theon",   "emotion":"calm-measured",   "start_ms":147480,"end_ms":149740,"text":"A road he was too scared to walk.",  "theme":"crossroads"},
    {"id":24,"speaker":"Theon",   "emotion":"calm-measured",   "start_ms":151840,"end_ms":152800,"text":"Stay or go?",                        "theme":"crossroads"},

    # ── BEAT 7: RESOLUTION (160-180s) — wisdom on the past, moving forward ─
    {"id":25,"speaker":"Theon",   "emotion":"contemplative",   "start_ms":159960,"end_ms":161160,"text":"She is part of him.",                "theme":"breakup"},
]

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def trim_silence(seg, thresh=-45.0, chunk=5):
    s = detect_leading_silence(seg, thresh, chunk)
    e = detect_leading_silence(seg.reverse(), thresh, chunk)
    if s + e >= len(seg): return seg
    return seg[s:len(seg)-e]

def light_stretch(seg, target_ms):
    """Only stretch within ±10%. Beyond that, return seg as-is and flag."""
    cur = len(seg)
    if cur == 0 or cur == target_ms:
        return seg, False
    ratio = cur / target_ms
    if not (0.91 <= ratio <= 1.10):
        return seg, True  # too far — don't stretch, flag instead
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as inp, \
         tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as outp:
        seg.export(inp.name, format="wav")
        subprocess.run(["ffmpeg","-y","-loglevel","error","-i",inp.name,"-filter:a",f"atempo={ratio:.6f}",outp.name], check=True)
        out = AudioSegment.from_wav(outp.name)
        os.unlink(inp.name); os.unlink(outp.name)
    return (out[:target_ms] if len(out) > target_ms else out), False

def measure_slot_dbfs(canvas, start_ms, end_ms):
    """Measure dBFS of the original speech in the slot itself.
    This is the correct loudness target — the actual speech we're replacing.
    Filters out leading/trailing silence so partial-silence slots still get a
    real speech-volume reading."""
    slot = canvas[start_ms:end_ms]
    # Strip leading/trailing silence so we measure the actual speech
    s = detect_leading_silence(slot, -45.0, 5)
    e = detect_leading_silence(slot.reverse(), -45.0, 5)
    if s + e < len(slot):
        slot = slot[s:len(slot)-e]
    return slot.dBFS if slot.dBFS != float('-inf') else None

def detect_sfx_cover(accomp, start_ms, end_ms):
    region = accomp[start_ms:end_ms]
    if len(region) == 0: return False
    return region.dBFS > SFX_DBFS_THRESHOLD

def synthesize_clone(text, speaker, emotion, full_vocals, slot_ms):
    """Synthesize with sanity check + retry. Qwen3 occasionally returns
    90s+ garbage for short inputs — we detect and retry."""
    refs = SPEAKERS[speaker]
    best = next((r for r in refs if r["emotion"] == emotion), refs[0])
    ref_path = CACHE_DIR / f"ref_{speaker}_{best['emotion']}.wav"
    if not ref_path.exists():
        chunk = full_vocals[int(best["start"]*1000):int(best["end"]*1000)]
        chunk.export(str(ref_path), format="wav")

    base_cache_key = hashlib.md5(f"v4_{speaker}_{emotion}_{text}".encode()).hexdigest()
    primary_cache = CACHE_DIR / f"clone_{base_cache_key}.wav"

    # Hit cache only if it passes sanity check (defend against pre-existing rot)
    sane_max_ms = max(slot_ms * 3, 20_000)
    if primary_cache.exists():
        cached = AudioSegment.from_wav(str(primary_cache))
        if len(cached) <= sane_max_ms:
            return cached, best["emotion"]
        # Cached file is rot — delete and re-synth
        os.unlink(primary_cache)

    with open(ref_path, "rb") as f:
        ref_b64 = base64.b64encode(f.read()).decode()

    # Retry loop with cache-busting via trailing space variations (text-equivalent
    # but produces a different seed in Qwen3's sampler)
    text_variants = [text, text + " ", " " + text]
    for attempt, txt_v in enumerate(text_variants, 1):
        payload = {"text": txt_v, "language":"English", "ref_audio_base64": ref_b64,
                   "ref_text": best["text"], "x_vector_only_mode": False,
                   "speed": 1.0, "response_format":"base64"}
        try:
            r = requests.post(QWEN_URL, json=payload, timeout=60 if attempt > 1 else 90)
            r.raise_for_status()
            clone = AudioSegment.from_wav(io.BytesIO(base64.b64decode(r.json()["audio"])))
            clone = trim_silence(clone)
            if len(clone) <= sane_max_ms:
                # Good output — cache and return
                clone.export(str(primary_cache), format="wav")
                if attempt > 1:
                    print(f"    [retry {attempt} succeeded with text variant]")
                return clone, best["emotion"]
            else:
                print(f"    [attempt {attempt}: clone {len(clone)}ms > sane_max {sane_max_ms}ms — retrying]")
        except Exception as ex:
            print(f"    [attempt {attempt}: {type(ex).__name__}: {str(ex)[:80]} — retrying]")
    raise RuntimeError(f"Qwen3 failed sanity check after {len(text_variants)} attempts for: \"{text}\"")

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    t0 = time.time()
    print("="*70); print(" STEVEN x THEON v7 — storyline + name spread + emotion variety"); print("="*70)

    log("Loading full source (for reference extraction)...", "step")
    full_vocals = AudioSegment.from_wav(str(SRC_VOCALS_FULL))
    full_accomp = AudioSegment.from_wav(str(SRC_ACCOMP_FULL))

    log(f"Trimming to first {WINDOW_MS}ms ({WINDOW_MS/1000}s)...", "step")
    vocals = full_vocals[:WINDOW_MS]
    accomp = full_accomp[:WINDOW_MS]
    canvas = full_vocals[:WINDOW_MS]
    log(f"Trimmed canvas: {len(vocals)/1000:.2f}s")

    audit_slots = []
    for ov in OVERRIDES:
        sid, spk, emo, s_ms, e_ms, txt = ov["id"], ov["speaker"], ov["emotion"], ov["start_ms"], ov["end_ms"], ov["text"]
        slot_ms = e_ms - s_ms

        log(f"Slot {sid:2d} [{spk:8s}|{emo:18s}] {s_ms/1000:6.2f}-{e_ms/1000:6.2f}s ({slot_ms}ms): \"{txt}\"", "step")
        try:
            clone, used_emo = synthesize_clone(txt, spk, emo, full_vocals, slot_ms)
        except Exception as ex:
            log(f"  SYNTH FAILED: {ex}", "err")
            audit_slots.append({"id":sid,"status":"synth_failed","error":str(ex)})
            continue

        raw_ms = len(clone)
        ratio = raw_ms / slot_ms
        log(f"  Clone raw: {raw_ms}ms (ratio {ratio:.2f}x)")

        # PHASE 4 v4: prefer cut-to-fit; fall back to light stretch within ±10%
        if abs(ratio - 1.0) <= 0.10:
            fitted, flagged = light_stretch(clone, slot_ms)
            decision = "exact-fit"
            silence_after = 0
        elif ratio < 0.90:
            silence_after = slot_ms - raw_ms
            sfx = detect_sfx_cover(accomp, s_ms + raw_ms, e_ms)
            cap = MAX_VOCAL_SILENCE_SFX_MS if sfx else MAX_VOCAL_SILENCE_MS
            if silence_after <= cap:
                fitted = clone
                decision = f"cut-to-fit (silence {silence_after}ms, sfx={sfx})"
                flagged = False
            else:
                fitted, flagged = light_stretch(clone, slot_ms)
                silence_after = 0
                decision = f"oversilence (would be {silence_after}ms > {cap}ms; left as-is)"
        else:
            # Clone too long — try light stretch first (only works if ratio ≤ 1.10)
            fitted, flagged = light_stretch(clone, slot_ms)
            decision = "stretch-fit (≤1.10x)" if not flagged else f"text-too-long (ratio {ratio:.2f}, no stretch applied, slot bleeds)"
            silence_after = 0
        log(f"  Fit: {decision}{' ⚠' if flagged else ''}")

        slot_db = measure_slot_dbfs(vocals, s_ms, e_ms)
        if slot_db is not None and fitted.dBFS != float('-inf'):
            gain = slot_db - fitted.dBFS
            fitted = fitted + gain
            log(f"  Loudness: slot {slot_db:.2f} dBFS, clone gain {gain:+.2f} dB → final {fitted.dBFS:.2f} dBFS")

        # Place
        if flagged:
            # Clone is too long for the slot AND can't be safely stretched.
            # Best we can do: drop the clone, leave the original speech intact (user hears original)
            # OR overlay clone and let it bleed. Default: overlay so personalization happens.
            silence_block = AudioSegment.silent(duration=max(slot_ms, len(fitted)), frame_rate=canvas.frame_rate)
            canvas = canvas[:s_ms] + silence_block + canvas[s_ms + len(silence_block):]
            canvas = canvas.overlay(fitted, position=s_ms)
        else:
            silence_block = AudioSegment.silent(duration=slot_ms, frame_rate=canvas.frame_rate)
            canvas = canvas[:s_ms] + silence_block + canvas[e_ms:]
            canvas = canvas.overlay(fitted, position=s_ms)

        audit_slots.append({
            "id": sid, "speaker": spk, "emotion": emo, "theme": ov["theme"],
            "slot_ms": slot_ms, "clone_raw_ms": raw_ms, "ratio": round(ratio,3),
            "decision": decision, "silence_after_ms": silence_after, "flagged": flagged,
            "slot_dbfs": round(slot_db,2) if slot_db else None, "clone_final_dbfs": round(fitted.dBFS,2) if fitted.dBFS != float('-inf') else None,
            "status": "ok" if not flagged and ("exact-fit" in decision or "cut-to-fit" in decision or "stretch-fit" in decision) else "fit_warning",
        })

    drift_ms = abs(len(canvas) - WINDOW_MS)
    if drift_ms > 0:
        log(f"Canvas drift {drift_ms}ms — trimming back to {WINDOW_MS}ms", "warn")
        canvas = canvas[:WINDOW_MS]

    pv_path = OUT_DIR / "vocals_personalized.wav"
    canvas.export(str(pv_path), format="wav")
    log(f"Personalized vocals: {pv_path}", "ok")

    log("Mixing personalized vocals + 180s accompaniment...", "step")
    accomp_trimmed = OUT_DIR / "accompaniment_180s.wav"
    accomp.export(str(accomp_trimmed), format="wav")
    final_path = OUT_DIR / "steven_theon_personalized_v7.mp3"
    cmd = ["ffmpeg","-y","-loglevel","error","-i",str(pv_path),"-i",str(accomp_trimmed),
           "-filter_complex","[0:a]volume=1.0[s];[1:a]volume=1.0[m];[s][m]amix=inputs=2:duration=longest:normalize=0",
           "-ac","2","-ar","44100","-b:a","320k", str(final_path)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg failed: {r.stderr}", "err"); sys.exit(1)
    log(f"Final: {final_path}", "ok")

    print("\n" + "="*70); print(" AUDIT v7"); print("="*70)
    final = AudioSegment.from_file(str(final_path))
    decision_counts = {}
    for s in audit_slots:
        d = s.get("decision","?").split(" ")[0]
        decision_counts[d] = decision_counts.get(d, 0) + 1
    audit = {
        "window_ms": WINDOW_MS, "final_mix_ms": len(final),
        "drift_ms": abs(len(final) - WINDOW_MS),
        "slot_count": len(OVERRIDES),
        "slots_ok": sum(1 for s in audit_slots if s.get("status") == "ok"),
        "slots_fit_warning": sum(1 for s in audit_slots if s.get("status") == "fit_warning"),
        "fit_decisions": decision_counts,
        "slots": audit_slots,
    }
    with open(OUT_DIR / "audit.json", "w") as f:
        json.dump(audit, f, indent=2)

    print(f"  Window:         {WINDOW_MS} ms ({WINDOW_MS/1000}s)")
    print(f"  Final mix:      {len(final)} ms")
    print(f"  Drift:          {audit['drift_ms']} ms  {'✓' if audit['drift_ms']<200 else '✗'}")
    print(f"  Slots OK:       {audit['slots_ok']} / {len(OVERRIDES)}")
    print(f"  Fit warnings:   {audit['slots_fit_warning']}")
    print(f"  Fit decisions:  {decision_counts}")
    print(f"\n  Listen:         {final_path}")
    print(f"  Audit:          {OUT_DIR / 'audit.json'}")
    print(f"  Elapsed:        {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()

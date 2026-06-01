#!/usr/bin/env python3
"""
Auto Synthesizer — Sprint 4 (end-to-end)
=========================================
Takes (audio_path, user_context_prompt) and produces a personalized MP3
using the FULL pipeline:

  Sprint 1 (classify) + Sprint 2 (reference library) + Sprint 3 (planner)
    + v6 synthesizer logic (retry+sanity, cut-to-fit, slot-dBFS match)
    = personalized output, zero human curation.

Adapter responsibilities:
  - Resolve SPEAKER_NN abstract IDs → reference audio clips
  - Map orchestrator emotion → reference library entry → reference WAV path
  - Run v6's per-slot synthesis loop, but with auto-generated inputs
  - Mix vocals_personalized + accompaniment via ffmpeg
"""

import os, sys, json, base64, hashlib, io, subprocess, tempfile, time, warnings
from pathlib import Path
from datetime import datetime
warnings.filterwarnings("ignore")

import requests
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

sys.path.insert(0, str(Path(__file__).parent))
from personalization_planner import generate_personalization
from reference_library_builder import build_reference_library
from tts import synthesize_clone as tts_synthesize_clone, current_provider_label

QWEN_URL = "http://127.0.0.1:7860/api/v1/base/clone"  # legacy, retained for backwards compat

# Synthesizer constants (mirroring v6)
MAX_VOCAL_SILENCE_MS = 3000
MAX_VOCAL_SILENCE_SFX_MS = 5000
SFX_DBFS_THRESHOLD = -22.0

def log(msg, level="info"):
    p = {"info":"  ", "ok":"✓ ", "err":"✗ ", "warn":"⚠ ", "step":"► "}.get(level, "")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {p}{msg}")

# ──────────────────────────────────────────────────────────────────────────────
# v6 audio helpers (copied so we don't depend on the v6 prototype file path)
# ──────────────────────────────────────────────────────────────────────────────
def trim_silence(seg, thresh=-45.0, chunk=5):
    s = detect_leading_silence(seg, thresh, chunk)
    e = detect_leading_silence(seg.reverse(), thresh, chunk)
    if s + e >= len(seg): return seg
    return seg[s:len(seg)-e]

def time_stretch(seg, target_ms):
    cur = len(seg)
    if cur == 0 or cur == target_ms:
        return seg
    ratio = cur / target_ms
    if not (0.5 <= ratio <= 2.0):
        ratio = max(0.5, min(2.0, ratio))
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as inp, \
         tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as outp:
        seg.export(inp.name, format="wav")
        subprocess.run(["ffmpeg","-y","-loglevel","error","-i",inp.name,
                          "-filter:a",f"atempo={ratio:.6f}",outp.name], check=True)
        out = AudioSegment.from_wav(outp.name)
        os.unlink(inp.name); os.unlink(outp.name)
    return out[:target_ms] if len(out) > target_ms else out

def measure_slot_dbfs(vocals_canvas, start_ms, end_ms):
    """Measure dBFS of the original speech in the slot, stripping leading/trailing silence."""
    slot = vocals_canvas[start_ms:end_ms]
    s = detect_leading_silence(slot, -45.0, 5)
    e = detect_leading_silence(slot.reverse(), -45.0, 5)
    if s + e < len(slot):
        slot = slot[s:len(slot)-e]
    return slot.dBFS if slot.dBFS != float('-inf') else None

def detect_sfx_cover(accomp, start_ms, end_ms):
    region = accomp[start_ms:end_ms]
    if len(region) == 0: return False
    return region.dBFS > SFX_DBFS_THRESHOLD

# ──────────────────────────────────────────────────────────────────────────────
# Reference resolution — orchestrator output → reference audio file
# ──────────────────────────────────────────────────────────────────────────────
REF_MIN_DBFS = -32.0   # reject reference clips quieter than this (likely silence/breath)
REF_TARGET_DUR_S = 6.0  # aim for ~6s of reference audio (concatenate clips if needed)

def _build_concatenated_ref(clips: list, vocals_source: AudioSegment) -> AudioSegment:
    """Concatenate up to N reference clips (from same speaker+emotion) into one longer
    reference WAV, separated by 200ms silence so Qwen3 sees them as one voice sample."""
    out = AudioSegment.empty()
    silence = AudioSegment.silent(duration=200, frame_rate=vocals_source.frame_rate)
    total_s = 0
    for clip in clips:
        chunk = vocals_source[int(clip["start"] * 1000):int(clip["end"] * 1000)]
        out = out + chunk + silence
        total_s += clip["duration_s"]
        if total_s >= REF_TARGET_DUR_S:
            break
    # Trim trailing silence
    if len(out) > 200:
        out = out[:-200]
    return out

def resolve_reference_clip(ref_library: dict, speaker_id: str, emotion: str,
                             vocals_source: AudioSegment, cache_dir: Path) -> tuple:
    """Given (speaker, emotion), build a 5-8s reference WAV by concatenating top-3 clips
    of that speaker+emotion. Returns (wav_path, ref_text) or (None, None) if unavailable.

    Falls back through emotions if the chosen one's refs are too quiet/short to use."""
    speaker_data = ref_library["speakers"].get(speaker_id)
    if not speaker_data:
        return None, None
    refs = speaker_data["references"]
    if not refs:
        return None, None

    # Try chosen emotion first, then fall back through other emotions for the same speaker
    chosen = next((r for r in refs if r["emotion"] == emotion), None)
    fallback_order = [chosen] if chosen else []
    fallback_order += [r for r in refs if r is not chosen]

    for r in fallback_order:
        if not r:
            continue
        clips = r.get("clips") or [{"start": r["start"], "end": r["end"], "text": r["text"], "duration_s": r["duration_s"]}]
        cache_file = cache_dir / f"ref_{speaker_id}_{r['emotion']}_top{len(clips)}.wav"
        if not cache_file.exists():
            concatenated = _build_concatenated_ref(clips, vocals_source)
            concatenated.export(str(cache_file), format="wav")
        # Quality gate: ref must be loud enough (not silence/breath only)
        ref_seg = AudioSegment.from_wav(str(cache_file))
        if ref_seg.dBFS < REF_MIN_DBFS:
            log(f"  ref {speaker_id}/{r['emotion']} too quiet ({ref_seg.dBFS:.1f}dBFS); trying fallback", "warn")
            continue
        # Build the reference text from concatenated clips' transcripts
        ref_text = " ".join(c["text"] for c in clips[:len(clips)])
        return cache_file, ref_text

    return None, None

# ──────────────────────────────────────────────────────────────────────────────
# TTS synthesis — delegates to the provider chosen via TTS_PROVIDER env var
# (qwen3_mlx for local Mac, replicate for cloud F5-TTS). See tts.py.
# ──────────────────────────────────────────────────────────────────────────────
def synthesize_clone(text: str, ref_path: Path, ref_text: str, slot_ms: int,
                      cache_dir: Path) -> AudioSegment:
    return tts_synthesize_clone(text, ref_path, ref_text, slot_ms, cache_dir)

# ──────────────────────────────────────────────────────────────────────────────
# Main entrypoint
# ──────────────────────────────────────────────────────────────────────────────
def auto_synthesize(audio_path: str, user_context: str,
                      vocals_path: str, accomp_path: str,
                      window_ms: int = 180_000,
                      out_dir: Path = None,
                      verbose: bool = True) -> dict:
    t0 = time.time()
    if out_dir is None:
        out_dir = Path(__file__).parent / "outputs" / f"auto_{int(time.time())}"
    out_dir = Path(out_dir); out_dir.mkdir(exist_ok=True, parents=True)
    cache_dir = out_dir / "tts_cache"
    cache_dir.mkdir(exist_ok=True)

    if verbose:
        print("=" * 70)
        print(" AUTO SYNTHESIZER — end-to-end (Sprint 4)")
        print("=" * 70)

    # ── Stage A: run the orchestrator to get OVERRIDES + reference library ──
    if verbose: log("Stage A: orchestrator (audio understanding → OVERRIDES)...", "step")
    plan = generate_personalization(audio_path, user_context, window_ms=window_ms, verbose=verbose)
    overrides = plan["overrides"]
    ref_library = build_reference_library(audio_path, verbose=False)
    if verbose: log(f"orchestrator produced {len(overrides)} slots", "ok")

    if not overrides:
        log("No slots to synthesize. Aborting.", "err")
        return {"status": "no_slots", "elapsed_s": time.time() - t0}

    # ── Stage B: load source vocals + accompaniment ──────────────────────
    if verbose: log(f"Stage B: load vocals ({vocals_path}) and accompaniment ({accomp_path})...", "step")
    vocals = AudioSegment.from_wav(str(vocals_path))
    accomp = AudioSegment.from_wav(str(accomp_path))
    canvas = AudioSegment.from_wav(str(vocals_path))
    # Trim to window
    vocals = vocals[:window_ms]
    accomp = accomp[:window_ms]
    canvas = canvas[:window_ms]
    if verbose: log(f"canvas: {len(canvas)/1000:.2f}s @ {canvas.frame_rate}Hz", "ok")

    # ── Stage C: per-slot synthesis ───────────────────────────────────────
    if verbose: log(f"Stage C: synthesize {len(overrides)} clones via TTS provider '{current_provider_label()}'...", "step")
    audit_slots = []
    for ov in overrides:
        sid, spk, emo = ov["id"], ov["speaker"], ov["emotion"]
        s_ms, e_ms = ov["start_ms"], ov["end_ms"]
        slot_ms = e_ms - s_ms
        text = ov["text"]

        log(f"Slot {sid:2d} [{spk}|{emo}] {s_ms/1000:6.2f}-{e_ms/1000:6.2f}s ({slot_ms}ms): \"{text}\"", "step")

        # Resolve reference
        ref_path, ref_text = resolve_reference_clip(ref_library, spk, emo, vocals, cache_dir)
        if not ref_path:
            log(f"  no reference for {spk}/{emo}; skipping", "warn")
            audit_slots.append({"id": sid, "status": "no_reference"})
            continue

        # Synth with retry+sanity
        try:
            clone = synthesize_clone(text, ref_path, ref_text, slot_ms, cache_dir)
        except Exception as ex:
            log(f"  SYNTH FAILED: {ex}", "err")
            audit_slots.append({"id": sid, "status": "synth_failed", "error": str(ex)})
            continue

        raw_ms = len(clone)
        ratio = raw_ms / slot_ms
        log(f"  clone raw: {raw_ms}ms (ratio {ratio:.2f}x)")

        # v6 Phase 4 fit logic
        if abs(ratio - 1.0) <= 0.10:
            fitted = time_stretch(clone, slot_ms)
            silence_after = 0
            decision = "exact-fit"
        elif ratio < 0.90:
            silence_after = slot_ms - raw_ms
            sfx = detect_sfx_cover(accomp, s_ms + raw_ms, e_ms)
            cap = MAX_VOCAL_SILENCE_SFX_MS if sfx else MAX_VOCAL_SILENCE_MS
            if silence_after <= cap:
                fitted = clone
                decision = f"cut-to-fit (silence {silence_after}ms, sfx={sfx})"
            else:
                fitted = time_stretch(clone, slot_ms)
                silence_after = 0
                decision = "stretch-fallback (silence > cap)"
        else:
            fitted = time_stretch(clone, slot_ms)
            silence_after = 0
            decision = f"stretch-compress (ratio {ratio:.2f})"
        log(f"  fit: {decision}")

        # Loudness match to slot dBFS
        slot_db = measure_slot_dbfs(vocals, s_ms, e_ms)
        if slot_db is not None and fitted.dBFS != float('-inf'):
            gain = slot_db - fitted.dBFS
            fitted = fitted + gain
            log(f"  loudness: slot {slot_db:.2f}dBFS, clone gain {gain:+.2f}dB → final {fitted.dBFS:.2f}dBFS")

        # Place in canvas — silence the slot, overlay clone
        silence_block = AudioSegment.silent(duration=slot_ms, frame_rate=canvas.frame_rate)
        canvas = canvas[:s_ms] + silence_block + canvas[e_ms:]
        canvas = canvas.overlay(fitted, position=s_ms)

        audit_slots.append({
            "id": sid, "speaker": spk, "emotion": emo,
            "text": text, "slot_ms": slot_ms, "clone_raw_ms": raw_ms,
            "ratio": round(ratio, 3), "decision": decision,
            "silence_after_ms": silence_after,
            "slot_dbfs": round(slot_db, 2) if slot_db else None,
            "clone_dbfs_final": round(fitted.dBFS, 2) if fitted.dBFS != float('-inf') else None,
            "status": "ok"
        })

    # ── Stage D: drift check + save vocals_personalized ──────────────────
    drift_ms = abs(len(canvas) - window_ms)
    if drift_ms > 0:
        log(f"canvas drift {drift_ms}ms — trimming to {window_ms}ms", "warn")
        canvas = canvas[:window_ms]
    pv_path = out_dir / "vocals_personalized.wav"
    canvas.export(str(pv_path), format="wav")
    if verbose: log(f"personalized vocals saved: {pv_path}", "ok")

    # ── Stage E: mix vocals + accompaniment ──────────────────────────────
    if verbose: log("Stage E: mix vocals + accompaniment via ffmpeg...", "step")
    accomp_trimmed = out_dir / "accompaniment_window.wav"
    accomp.export(str(accomp_trimmed), format="wav")
    final_path = out_dir / "personalized_output.mp3"
    cmd = ["ffmpeg","-y","-loglevel","error","-i",str(pv_path),"-i",str(accomp_trimmed),
             "-filter_complex","[0:a]volume=1.0[s];[1:a]volume=1.0[m];[s][m]amix=inputs=2:duration=longest:normalize=0",
             "-ac","2","-ar","44100","-b:a","320k", str(final_path)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg mix failed: {r.stderr}", "err")
        return {"status": "mix_failed", "elapsed_s": time.time() - t0}
    if verbose: log(f"final mix: {final_path}", "ok")

    # ── Stage F: audit ────────────────────────────────────────────────────
    final = AudioSegment.from_file(str(final_path))
    audit = {
        "audio_path": audio_path,
        "user_context": user_context,
        "audio_type": plan["type"],
        "audio_type_label": plan["type_label"],
        "user_brief": plan["brief"],
        "window_ms": window_ms,
        "final_mix_ms": len(final),
        "drift_ms": abs(len(final) - window_ms),
        "slot_count": len(overrides),
        "slots_ok": sum(1 for s in audit_slots if s.get("status") == "ok"),
        "slots_failed": sum(1 for s in audit_slots if s.get("status") != "ok"),
        "slots": audit_slots,
    }
    audit_path = out_dir / "audit.json"
    audit_path.write_text(json.dumps(audit, indent=2))

    print()
    print("=" * 70); print(" RESULTS"); print("=" * 70)
    print(f"  Type:            {plan['type']} ({plan['type_label']})")
    print(f"  Window:          {window_ms/1000}s")
    print(f"  Final mix:       {len(final)} ms (drift {audit['drift_ms']}ms)")
    print(f"  Slots OK:        {audit['slots_ok']} / {len(overrides)}")
    print(f"  Slots failed:    {audit['slots_failed']}")
    print(f"\n  Listen:          {final_path}")
    print(f"  Audit:           {audit_path}")
    print(f"  Elapsed:         {time.time() - t0:.1f}s")

    return {"status": "ok", "final_path": str(final_path), "audit_path": str(audit_path),
              **audit, "elapsed_s": time.time() - t0}

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("usage: auto_synthesizer.py <raw_audio> '<user_context>' <vocals_wav> <accomp_wav> [window_ms] [out_dir]")
        sys.exit(1)
    audio = sys.argv[1]
    ctx = sys.argv[2]
    vocals = sys.argv[3]
    accomp = sys.argv[4]
    win = int(sys.argv[5]) if len(sys.argv) > 5 else 180_000
    out = sys.argv[6] if len(sys.argv) > 6 else None
    auto_synthesize(audio, ctx, vocals, accomp, window_ms=win, out_dir=out)

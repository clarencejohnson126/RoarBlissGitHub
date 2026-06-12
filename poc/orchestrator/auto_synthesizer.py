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

# Breathing room at every snippet↔original seam: a deliberate pause BEFORE + AFTER each cloned snippet
# so it never glues straight onto the surrounding original sentence (which sounds rushed, choppy, fake).
# The ducked continuity bed fills these with muffled room tone → natural breaths, not dead air. The
# pause length is a per-run input (breath_ms = trail breath; lead = a third of it, capped) → tune by ear.

# Loudness: match the ORIGINAL slot's level EXACTLY — no boost, no floor. The cloned line must
# sit at the same dB the original speaker did there, or the seam becomes audible (a clone that is
# louder OR quieter than the surrounding original breaks the illusion). The music is never touched.

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

def _size_breath(vocals, s_ms, e_ms, breath_ms):
    """Return (trail_ms, lead_ms) sized to the ORIGINAL's OWN rhythm, capped by breath_ms.
    A flat 1000ms pause drags + breaks the source flow; real inter-sentence gaps are ~150-450ms. We
    reuse the silence the original itself leaves at the slot head/tail so the snippet breathes like the
    source did. Music is never touched here."""
    if breath_ms <= 0:
        return 0, 0
    head = detect_leading_silence(vocals[s_ms:e_ms], -40.0, 5)
    tail = detect_leading_silence(vocals[s_ms:e_ms].reverse(), -40.0, 5)
    natural = max(head, tail, 150)                  # floor 150ms so it never glues
    trail = min(int(breath_ms), max(natural, 200))  # breath_ms is a CAP, not a floor
    trail = min(trail, 450)                          # hard cap: no single pause drags past 450ms
    lead = max(80, trail // 4)
    return trail, lead

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
REF_TARGET_DUR_S = 12.0  # aim for ~12s of reference (longer = far better clone identity; concatenate clips)

def _build_concatenated_ref(clips: list, vocals_source: AudioSegment):
    """Concatenate reference clips (same speaker+emotion) up to REF_TARGET_DUR_S into ONE continuous
    WAV. Returns (audio, used_clips) so the caller can build a ref_text that EXACTLY matches the
    audio. This matters: F5-TTS produces repeated-syllable gibberish ("stop stop stop") when ref_text
    describes more speech than ref_audio actually contains. We also drop the inter-clip silence —
    ref_text has no marker for it, so it throws off F5's text↔audio alignment."""
    out = AudioSegment.empty()
    used = []
    total_s = 0.0
    for clip in clips:
        chunk = vocals_source[int(clip["start"] * 1000):int(clip["end"] * 1000)]
        out = out + chunk
        used.append(clip)
        total_s += clip["duration_s"]
        if total_s >= REF_TARGET_DUR_S:
            break
    return out, used

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
        # F5 clones best from ONE clean, CONTINUOUS clip + its EXACT transcript. Stitching several
        # clips together (different context, hard joins) is what made the clone sound garbled and
        # "backwards". Use the single longest clip that's loud enough, paired with its own transcript.
        for clip in sorted(clips, key=lambda c: c.get("duration_s", 0.0), reverse=True):
            seg = vocals_source[int(clip["start"] * 1000):int(clip["end"] * 1000)]
            if len(seg) < 1200:          # too short to seed a clean voice clone
                continue
            if seg.dBFS < REF_MIN_DBFS:  # silence / breath only
                continue
            cache_file = cache_dir / f"ref_{speaker_id}_{r['emotion']}_{int(clip['start']*1000)}.wav"
            seg.export(str(cache_file), format="wav")
            return cache_file, clip["text"].strip()

    return None, None


def _build_clone_reference(ref_library: dict, speaker_id: str, vocals_source: AudioSegment,
                           cache_dir: Path, target_s: float = 45.0):
    """Build a LONGER (~45s) continuous-feeling reference for the speaker by concatenating their
    cleanest clips across emotions. ElevenLabs voice cloning needs more audio than F5 for a faithful
    timbre. Returns a wav Path, or None if there isn't enough usable audio."""
    sd = ref_library["speakers"].get(speaker_id)
    if not sd or not sd.get("references"):
        return None
    clips = []
    for r in sd["references"]:
        clips += r.get("clips") or [{"start": r["start"], "end": r["end"], "duration_s": r["duration_s"]}]
    clips.sort(key=lambda c: c.get("duration_s", 0.0), reverse=True)
    out = AudioSegment.empty()
    total = 0.0
    seen = set()
    for c in clips:
        key = (round(c["start"], 2), round(c["end"], 2))
        if key in seen:
            continue
        seen.add(key)
        out += vocals_source[int(c["start"] * 1000):int(c["end"] * 1000)]
        total += c.get("duration_s", 0.0)
        if total >= target_s:
            break
    if len(out) < 3000:
        return None
    p = cache_dir / f"clone_ref_{speaker_id}.wav"
    out.export(str(p), format="wav")
    return p

# ──────────────────────────────────────────────────────────────────────────────
# TTS synthesis — delegates to the provider chosen via TTS_PROVIDER env var
# (qwen3_mlx for local Mac, replicate for cloud F5-TTS). See tts.py.
# ──────────────────────────────────────────────────────────────────────────────
def _shorten_line(text: str, max_words: int) -> str:
    """Rewrite a spoken line to <= max_words while keeping a complete, in-tone phrase."""
    try:
        from llm import llm_chat
        sysmsg = ("You compress a single spoken motivational line to fit a tight time budget. "
                  "Keep it a COMPLETE, punchy phrase in the same tone and world. Never end on a "
                  "function word. Return ONLY the shortened line as plain text, nothing else.")
        out = llm_chat(sysmsg, f'Rewrite in AT MOST {max_words} words, same meaning and tone:\n"{text}"',
                       max_tokens=40, temperature=0.2)
        out = out.strip().strip('"').splitlines()[0].strip()
        return out if out else " ".join(text.split()[:max_words])
    except Exception:
        return " ".join(text.split()[:max_words])

def synthesize_clone(text: str, ref_path: Path, ref_text: str, slot_ms: int,
                      cache_dir: Path, voice_id: str = None) -> AudioSegment:
    # Forward voice_id so the ElevenLabs path reuses the once-per-speaker clone (best timbre, and it
    # avoids re-cloning — and hitting the account voice limit — on every slot). Other providers ignore it.
    return tts_synthesize_clone(text, ref_path, ref_text, slot_ms, cache_dir, voice_id=voice_id)

# ──────────────────────────────────────────────────────────────────────────────
# Main entrypoint
# ──────────────────────────────────────────────────────────────────────────────
def auto_synthesize(audio_path: str, user_context: str,
                      vocals_path: str, accomp_path: str,
                      window_ms: int = 180_000,
                      out_dir: Path = None,
                      verbose: bool = True,
                      language: str = "English",
                      density: float = 0.55,
                      breath_ms: int = 700) -> dict:
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
    plan = generate_personalization(audio_path, user_context, window_ms=window_ms, verbose=verbose,
                                    language=language, density=density)
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

    # ElevenLabs: clone each speaker's voice ONCE from a longer reference (best timbre, one API voice
    # per speaker, reused for every line) instead of re-cloning per slot. Deleted after the run.
    el_voices = {}
    if current_provider_label() == "elevenlabs":
        from tts import elevenlabs_clone
        for spk in sorted({ov["speaker"] for ov in overrides}):
            try:
                cref = _build_clone_reference(ref_library, spk, vocals, cache_dir)
                if cref:
                    el_voices[spk] = elevenlabs_clone(cref, name=f"rb_{spk}")
                    if verbose: log(f"cloned voice for {spk} (id {el_voices[spk][:8]}…)", "ok")
            except Exception as ex:
                log(f"  voice clone failed for {spk}: {ex}", "warn")

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
            clone = synthesize_clone(text, ref_path, ref_text, slot_ms, cache_dir, voice_id=el_voices.get(spk))
        except Exception as ex:
            log(f"  SYNTH FAILED: {ex}", "err")
            audit_slots.append({"id": sid, "status": "synth_failed", "error": str(ex)})
            continue

        # Synthesis-time length control: a clone that renders long for the slot would be
        # time-compressed (fast/robotic). Instead rewrite the line SHORTER and re-synthesize
        # until it fits at a natural pace.
        sl_attempts = 0
        while len(clone) / slot_ms > 1.5 and sl_attempts < 2:
            sl_attempts += 1
            cur_words = max(1, len(text.split()))
            new_max = max(1, int(cur_words / (len(clone) / slot_ms) * 0.95))
            if new_max >= cur_words:
                break
            shorter = _shorten_line(text, new_max)
            if not shorter or shorter.lower() == text.lower():
                break
            try:
                c2 = synthesize_clone(shorter, ref_path, ref_text, slot_ms, cache_dir, voice_id=el_voices.get(spk))
            except Exception:
                break
            log(f"  reshaped (too long): \"{text}\" -> \"{shorter}\" ({len(clone)}ms -> {len(c2)}ms)")
            if len(c2) < len(clone):
                clone, text = c2, shorter
            else:
                break

        raw_ms = len(clone)
        ratio = raw_ms / slot_ms
        log(f"  clone raw: {raw_ms}ms (ratio {ratio:.2f}x)")

        # If the clone lands well short of the slot (Chatterbox/ElevenLabs deliberate pace), gently speed it
        # up to fill — capped at 1.12x so it never sounds rushed/robotic. Voice-only; the music stem is mixed
        # later and never stretched. Over 1.12x: leave the remainder as a (sized) breath instead.
        if raw_ms < slot_ms * 0.85:
            gentle = min(1.12, (slot_ms * 0.95) / raw_ms)
            if gentle > 1.02:
                clone = time_stretch(clone, int(raw_ms / gentle))
                raw_ms = len(clone)
                log(f"  pace: tightened {gentle:.3f}x -> {raw_ms}ms")

        # NATURAL PACE — never time-compress/stretch the clone. Time-compression (squeezing a clone
        # into a shorter slot) is exactly what made the voice sound fast and "drunk". The clone plays
        # at F5's own deliberate rate. If it slightly overruns the slot we trim the TAIL (no speed-up);
        # if it underruns, the gap stays silent and the music carries it. Intelligible > perfectly
        # filled. The slot length is preserved, so the music underneath stays in sync (0 drift).
        # Complete phrase at natural pace — no compression, no tail-trim. The clone plays in FULL; if
        # it runs past the slot it just overwrites that much more of the FOLLOWING original vocal
        # (we're replacing a whole sentence — that's intended). The music stem is separate, so timing
        # stays in sync. A clone shorter than the slot leaves natural breathing silence after it.
        fitted = clone
        silence_after = max(0, slot_ms - raw_ms)
        decision = f"natural-full ({raw_ms}ms)"
        log(f"  fit: {decision}")

        # Loudness match to slot dBFS — but NEVER push the clone into clipping. F5 output already
        # peaks near 0 dBFS, so the +gain match can slam it past full scale into hard-clipping
        # distortion. Apply the match, then pull the PEAK back just under full scale.
        slot_db = measure_slot_dbfs(vocals, s_ms, e_ms)
        if fitted.dBFS != float('-inf') and slot_db is not None:
            gain = slot_db - fitted.dBFS   # match the ORIGINAL slot loudness (seamless)
            # Clamp the gain BEFORE applying it. pydub's `+` hard-clips internally, so a clone already near
            # 0 dBFS that needs a big +gain would be DESTROYED at the apply step (the old post-check measured
            # an already-clipped signal and couldn't undo it → distortion that the mix bus then sums into the
            # music). Clamp so the peak lands exactly at -1 dBFS, then the clone never clips the mix.
            if fitted.max_dBFS + gain > -1.0:
                safe = -1.0 - fitted.max_dBFS
                fitted = fitted + safe
                log(f"  loudness: clamped near {slot_db:.2f}dBFS (safe gain {safe:+.2f}dB, anti-clip)")
            else:
                fitted = fitted + gain
                log(f"  loudness: matched original {slot_db:.2f}dBFS (gain {gain:+.2f}dB)")

        # Breath sized to the ORIGINAL's own rhythm, and it sits INSIDE the slot so the clone never extends
        # past e_ms (that extension was the "drag": content shifts right + the next original resumes late).
        _trail, _lead = _size_breath(vocals, s_ms, e_ms, breath_ms)
        budget = int(slot_ms)
        body = fitted
        # Reserve breath room first; if clone+breath exceeds the slot, trim the clone TAIL (never speed up here).
        max_body = max(0, budget - _lead - _trail)
        if len(body) > max_body:
            body = body[:max_body]
        fitted = AudioSegment.silent(duration=_lead) + body + AudioSegment.silent(duration=_trail)
        # Pad/clip to EXACTLY the slot so the overlay is slot-locked (canvas length stays invariant).
        if len(fitted) < budget:
            fitted = fitted + AudioSegment.silent(duration=budget - len(fitted))
        elif len(fitted) > budget:
            fitted = fitted[:budget]

        # REPLACE the original sentence ENTIRELY with the clone (hard rule: snippets replace original speech,
        # they never overlay it). Remove AT LEAST the full original slot and fill it with SILENCE — not a
        # muffled copy of the original. The old "continuity bed" leaked the original under the clone AND filled
        # the breath padding so it never actually breathed (the snippet glued onto the original). The music
        # stem (added in the final mix) carries continuity; on dry speech the leftover is a real pause/breath.
        # Length-invariant: remove EXACTLY the slot + a small guard margin, fill with silence, overlay the
        # slot-sized clone at s_ms. remove_ms == slot_ms keeps len(canvas) unchanged => every downstream s_ms
        # stays a valid musical instant => ZERO drift, speech stays locked to the (untouched 1.0x) music.
        remove_ms = int(slot_ms)
        # Whisper sentence-group edges sit inside breaths; the original's head/tail word can bleed just
        # outside [s_ms,e_ms]. Silence a small guard on BOTH sides — but keep length invariant and keep the
        # overlay anchored at s_ms (moving it would re-introduce drift).
        guard = 200   # widen the silenced margin around each slot so NO original word bleeds in at the seams
        head = min(guard, s_ms)
        tail = min(guard, len(canvas) - (s_ms + remove_ms))
        wipe_start = s_ms - head
        wipe_len = head + remove_ms + tail
        # Micro-fades (8ms) at EVERY splice edge. A hard cut mid-waveform is a discontinuity = an
        # audible click; after the 14kHz LPF those clicks read as short chirpy 'squeaks' (the founder's
        # 'squeaky sounds here and there'). 8ms is inaudible as a fade but kills the discontinuity.
        F = 8
        pre, post = canvas[:wipe_start], canvas[wipe_start + wipe_len:]
        if len(pre) > F:
            pre = pre.fade_out(F)
        if len(post) > F:
            post = post.fade_in(F)
        canvas = pre + AudioSegment.silent(duration=wipe_len) + post
        # DESTRUCTIVE replace (NOT additive overlay): fitted is exactly slot_ms long, so this stays
        # length-invariant AND nothing original can bleed UNDER the clone — overlay() is additive, so any
        # residual original speech in the demucs vocal stem leaked through as the founder's hiss/squeak.
        if len(fitted) > 2 * F:
            fitted = fitted.fade_in(F).fade_out(F)
        canvas = canvas[:s_ms] + fitted + canvas[s_ms + len(fitted):]   # slot-locked; guard only widens the SILENCE

        audit_slots.append({
            "id": sid, "speaker": spk, "emotion": emo,
            "text": text, "slot_ms": slot_ms, "clone_raw_ms": raw_ms,
            "ratio": round(ratio, 3), "decision": decision,
            "silence_after_ms": silence_after,
            "slot_dbfs": round(slot_db, 2) if slot_db else None,
            "clone_dbfs_final": round(fitted.dBFS, 2) if fitted.dBFS != float('-inf') else None,
            "status": "ok"
        })

    # Clean up the throwaway ElevenLabs voices so the account's voice slots don't fill up.
    if el_voices:
        from tts import elevenlabs_delete
        for vid in el_voices.values():
            elevenlabs_delete(vid)
        log(f"deleted {len(el_voices)} cloned voice(s)", "ok")

    # ── Stage D: drift check + save vocals_personalized ──────────────────
    drift_ms = abs(len(canvas) - window_ms)
    if drift_ms > 50:   # >50ms now signals a real bug (should be ~0 after slot-locking), not rounding
        log(f"UNEXPECTED canvas drift {drift_ms}ms (should be ~0 after slot-locking) — investigate", "err")
    canvas = canvas[:window_ms]   # final safety clamp only
    pv_path = out_dir / "vocals_personalized.wav"
    canvas.export(str(pv_path), format="wav")
    if verbose: log(f"personalized vocals saved: {pv_path}", "ok")

    # ── Stage E: mix vocals + accompaniment (music left at full, constant volume) ──
    if verbose: log("Stage E: mix vocals + accompaniment via ffmpeg...", "step")
    accomp_trimmed = out_dir / "accompaniment_window.wav"
    accomp.export(str(accomp_trimmed), format="wav")
    final_path = out_dir / "personalized_output.mp3"
    # ...then trim any dead trailing silence (sources often end with a silent tail; we leave ~1s so it
    # doesn't end abruptly) so the track never finishes with a long stretch of nothing.
    # NO dynamics processor on the bus. The old alimiter pumped: the instant a word was spoken the
    # SUM hit the ceiling and the limiter pulled EVERYTHING (music included) down, releasing in the
    # pauses — the founder's "music drops the moment speech starts, swells back in silence". Clip
    # safety is a TWO-PASS STATIC gain instead: render the sum untouched, measure its true peak, and
    # apply ONE constant attenuation to the whole mix. One level start-to-finish; music untouched.
    raw_path = out_dir / "mix_raw.wav"
    cmd = ["ffmpeg","-y","-loglevel","error","-i",str(pv_path),"-i",str(accomp_trimmed),
             # Voice bus only: HPF 80Hz kills sub-bass rumble, LPF 14kHz kills the >14kHz hiss/sizzle that
             # demucs vocal separation leaves in BOTH the clones and the kept-original. Music ([1:a]) is
             # NOT filtered — it stays volume=1.0, full-band, untouched (HARD RULE).
             "-filter_complex","[0:a]volume=1.0,highpass=f=80,lowpass=f=14000[s];[1:a]volume=1.0[m];[s][m]amix=inputs=2:duration=longest:normalize=0",
             "-ac","2","-ar","44100", str(raw_path)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg mix failed: {r.stderr}", "err")
        return {"status": "mix_failed", "elapsed_s": time.time() - t0}
    raw_mix = AudioSegment.from_wav(str(raw_path))
    peak = raw_mix.max_dBFS
    static_db = -(peak + 1.0) if peak > -1.0 else 0.0   # constant headroom trim ONLY if the sum would clip
    vol = f"volume={static_db:.2f}dB," if static_db < 0 else ""
    if static_db < 0 and verbose:
        log(f"static headroom trim {static_db:.2f}dB (constant — no limiter, no pumping)", "ok")
    cmd2 = ["ffmpeg","-y","-loglevel","error","-i",str(raw_path),
            "-af", f"{vol}areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=1.0,areverse",
            "-ac","2","-ar","44100","-b:a","320k", str(final_path)]
    r = subprocess.run(cmd2, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg encode failed: {r.stderr}", "err")
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

    # Hard guard against a SILENT regression: if we planned snippets but none synthesized, the mix is
    # just the untouched original (0% personalized). Never let that masquerade as a finished file —
    # fail loudly so the caller (predict.py) raises instead of returning a snippet-less track.
    if len(overrides) > 0 and audit["slots_ok"] == 0:
        return {"status": "all_slots_failed", "final_path": str(final_path),
                "audit_path": str(audit_path), **audit, "elapsed_s": time.time() - t0}

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

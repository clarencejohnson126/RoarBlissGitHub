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

import os, sys, json, base64, hashlib, io, subprocess, tempfile, time, warnings, array
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

def _detect_music_bed(a_db, v_db):
    """Does the source have an AUDIBLE music/sound bed? If so we keep it CONTINUOUS on the music path
    (never drop it under a new sentence — the founder's #1 rule). Only a source with NO audible bed at all
    (a genuine dry voice memo) takes the gap-closing no-music path.

    The first version used -22dBFS and wrongly called the founder's own recordings "dry" — they carry a
    faint bed at ~-21..-23dB, and routing them to the no-music path DROPPED that bed whenever a clone
    played → the 'music turns off when he speaks' wobble. An audible bed sits FAR above demucs's residual
    on a truly-dry source (~-45..-55dB), so the cut is low: anything above -40dBFS is a real bed.
    NOTE: locked by eval/test_canvas_rebuild.py against the real measured values."""
    if a_db == float('-inf'):
        return False
    return a_db > -40.0

def _bleed_comp_db(full_mix, accomp, cutoff=200, lo=0.0, hi=9.0):
    """CONSTANT bleed compensation (founder's 'replaced slots = music stem + constant bleed comp').
    demucs leaks part of the music into the DISCARDED vocal stem, so the accompaniment stem we lay under a
    replaced slot is QUIETER than the music the listener hears in the kept original. Measure that deficit
    ONCE in the music band (<200Hz, where music carries and speech ~doesn't) and lift the slot music by that
    constant amount so its level matches the kept regions. CONSTANT by design: one gain everywhere => no
    per-slot variation => no 'music on/off' wobble. Clamped [0,9]dB: never duck the slot music below the
    stem, never over-boost the bass into a thump."""
    f = full_mix.low_pass_filter(cutoff).dBFS
    a = accomp.low_pass_filter(cutoff).dBFS
    if f == float('-inf') or a == float('-inf'):
        return 0.0
    return max(lo, min(hi, f - a))

def _ramp_edge(seg, ms, fade_in=True):
    """Linear ramp on the first/last `ms` of a segment, applied on the SAMPLE ARRAY so the FRAME COUNT is
    preserved EXACTLY. pydub's fade_in/out silently drop a frame, which would shift a kept region and break
    the bit-identical splice grid — this does not. Per-frame gain (same for L+R). Used to ramp the touching
    edges of a splice to zero so a hard music→music cut has no click, with zero length change."""
    if ms <= 0:
        return seg
    ch = max(1, seg.channels)
    samples = array.array(seg.array_type, seg.get_array_of_samples())
    total = len(samples)
    frames = min(int(seg.frame_rate * ms / 1000.0), total // ch)
    if frames <= 1:
        return seg
    import math
    for f in range(frames):
        x = f / frames
        # EQUAL-POWER (sin/cos), NOT linear. A linear fade-to-zero on two incoherent music signals dips to
        # -6 dB at the midpoint = the audible 'reverse-swoosh' notch at every replaced-slot seam (measured
        # -5.3 dB). sin/cos holds the crossing point at -3 dB (constant power) so the seam stays far flatter.
        g = math.sin(x * math.pi / 2) if fade_in else math.cos(x * math.pi / 2)
        base = (f * ch) if fade_in else (total - (frames - f) * ch)
        for c in range(ch):
            samples[base + c] = int(samples[base + c] * g)
    return seg._spawn(samples)

def _local_music_gain(canvas, accomp, fws, fwe, fr, chans, fallback_db=0.0, win_ms=700, lo=0.0, hi=14.0):
    """PER-SLOT bleed compensation. Instead of one GLOBAL constant lift (which under-matches some slots →
    the 'music turned down at every snippet' rollercoaster the founder heard), measure the music level the
    listener actually hears in the KEPT region right before AND after this slot (the <200Hz band of the
    full mix, where music carries and speech ~doesn't) and lift the slot's accomp to match THAT local
    level. Each slot then blends into its own neighbourhood → no per-slot up/down. Returns a dB gain
    clamped [lo,hi]; falls back to the global comp on any measurement failure (fail-safe)."""
    try:
        win = int(fr * win_ms / 1000.0)
        total = int(canvas.frame_count())
        before = canvas.get_sample_slice(max(0, fws - win), fws).low_pass_filter(200).dBFS
        after = canvas.get_sample_slice(fwe, min(total, fwe + win)).low_pass_filter(200).dBFS
        neigh = [d for d in (before, after) if d != float("-inf")]
        if not neigh:
            return fallback_db
        target = sum(neigh) / len(neigh)
        slot_db = accomp.get_sample_slice(fws, fwe).low_pass_filter(200).dBFS
        if slot_db == float("-inf"):
            return fallback_db
        return max(lo, min(hi, target - slot_db))
    except Exception:
        return fallback_db


def _rebuild_slot(canvas, accomp, vocals, s_ms, slot_ms, fitted, comp_db, rate, chans, guard=200, F=8):
    """Replace ONE slot on the FULL-MIX canvas, pure + length-invariant. The slot(+guard) span currently
    holds the original VOICE *and* its music; carve it out and refill with MUSIC ONLY — the accomp stem for
    the exact span, lifted by the CONSTANT bleed comp so its level matches the kept regions — then lay the
    clone over it. Kept regions on either side are untouched (bit-identical original). Returns new canvas.

    Invariants (asserted in eval/test_canvas_rebuild.py):
      • len(out) == len(canvas)            → ZERO drift, music stays locked to the 1.0x grid
      • kept interior == original samples  → kept regions bit-identical (except an 8ms cosmetic seam fade)
      • no music dropout at the slot       → accomp+comp matches the kept-region <200Hz music level
    """
    remove_ms = int(slot_ms)
    # Whisper sentence-group edges sit inside breaths; the original's head/tail word can bleed just outside
    # [s_ms,e_ms]. Carve a small guard on BOTH sides so NO original word survives — but refill with MUSIC
    # (not silence), so the bed never drops at the seam.
    head = min(guard, s_ms)
    tail = min(guard, len(canvas) - (s_ms + remove_ms))
    wipe_start = s_ms - head
    wipe_end = wipe_start + head + remove_ms + tail
    # FRAME-EXACT tiling (not ms slicing). 1ms = 44.1 frames, so ms-boundary slices round and would shift
    # the kept `post` by a sample or two PER slot — drifting the bit-identical promise. Cutting on exact
    # frame indices makes pre|slot_music|post tile perfectly: post lands back on its original frame `fwe`,
    # so every kept region stays sample-for-sample the original.
    fr = canvas.frame_rate
    fws = int(fr * wipe_start / 1000.0)
    fwe = int(fr * wipe_end / 1000.0)
    need = fwe - fws                                  # exact frames the reconstructed span must fill
    pre = canvas.get_sample_slice(0, fws)
    post = canvas.get_sample_slice(fwe, None)
    # TRUE in-mix bed = full mix MINUS the vocal stem (sample-accurate phase-subtract), NOT the standalone
    # accompaniment stem. Both come from the same mixture, so (mix - vocals) carries the music at its REAL
    # in-mix level by energy conservation -> it matches the kept regions BY CONSTRUCTION, collapsing the
    # 'volume rollercoaster' with no per-slot gain guessing. Falls back to the accompaniment stem + the
    # per-slot local-level match if the phase-subtract can't run.
    try:
        slot_music = canvas.get_sample_slice(fws, fwe).overlay(vocals.get_sample_slice(fws, fwe).invert_phase())
    except Exception:
        slot_music = accomp.get_sample_slice(fws, fwe)
        _g = _local_music_gain(canvas, accomp, fws, fwe, fr, chans, fallback_db=comp_db)
        if _g:
            slot_music = slot_music + _g              # gain only — never changes frame count
    # force EXACTLY `need` frames (accomp can be a hair short at the very tail)
    have = int(slot_music.frame_count())
    if have < need:
        pad_ms = (need - have) * 1000.0 / fr + 2
        slot_music = slot_music + AudioSegment.silent(duration=pad_ms, frame_rate=fr).set_channels(chans)
    slot_music = slot_music.get_sample_slice(0, need)
    # SEAM SMOOTHING — kill the faint 'vinyl scrub' the founder heard at slot edges. The two sides are
    # DIFFERENT music signals (full mix vs accomp+comp), so a hard cut is a sample-step discontinuity = a
    # click. pydub's fade_*() can't be used (it silently DROPS a frame → shifts the kept `post` and breaks
    # bit-identity). Instead ramp the touching edges to zero on the SAMPLE ARRAY (frame count preserved):
    # pre's tail down + slot_music's head up at the first seam, slot_music's tail down + post's head up at
    # the second. A ~6ms ramp-to-zero on each side removes the step without a perceptible gap.
    pre = _ramp_edge(pre, F, fade_in=False)
    slot_music = _ramp_edge(_ramp_edge(slot_music, F, fade_in=True), F, fade_in=False)
    post = _ramp_edge(post, F, fade_in=True)
    canvas = pre + slot_music + post   # frame-exact: |pre|=fws, |slot_music|=need, post starts at fwe
    # Lay the clone OVER the reconstructed slot music at s_ms. overlay() is additive — but the base is MUSIC
    # ONLY (the original voice was carved out), so nothing original bleeds under the clone. The clone keeps
    # its own 8ms edge fades (it rides over the music; its frame count doesn't affect kept alignment).
    fitted = fitted.set_frame_rate(rate).set_channels(chans)
    if len(fitted) > 2 * F:
        fitted = fitted.fade_in(F).fade_out(F)
    return canvas.overlay(fitted, position=s_ms)

def _assemble_no_music(full_mix, placements, rate, chans, gap_ms=300):
    """NO-MUSIC assembly (dry speech). The fixed-length canvas model is right for music (keeps the bed in
    sync) but WRONG for a source with no music bed: a clone shorter than its slot leaves DEAD AIR (measured:
    9.8s of -40dB silence where the source talks). With no music to carry the gap, assemble by CONCATENATION
    instead — retained original chunks BETWEEN slots kept verbatim (frame-exact, they carry their own
    pauses), each replaced slot = just the clone + one short natural pause (gap_ms), NOT the full original
    slot length. The timeline compresses; that's correct when there's nothing to stay in sync with.
    Returns the assembled segment (shorter than the window by the closed dead air)."""
    placements = sorted(placements, key=lambda p: p[0])
    out = full_mix[:0]                                    # empty, same rate/channels
    pause = AudioSegment.silent(duration=gap_ms, frame_rate=rate).set_channels(chans)
    cursor = 0
    for (s_ms, slot_ms, fitted) in placements:
        if s_ms > cursor:                                 # retained original chunk before this slot
            fs = int(rate * cursor / 1000.0); fe = int(rate * s_ms / 1000.0)
            out += full_mix.get_sample_slice(fs, fe)
        clone = trim_silence(fitted)                       # recover the clone body from the slot-padded seg
        if len(clone) > 0:
            out += clone + pause
        cursor = s_ms + int(slot_ms)
    if cursor < len(full_mix):                             # retained tail
        out += full_mix.get_sample_slice(int(rate * cursor / 1000.0), None)
    return out

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

    # ── PRE-GEN WATCHDOG (deterministic, NO GPU): grade the PLAN before any TTS ──
    # Catches the meaning-level defects the signal battery is blind to — repeated filler ("my name is
    # Clarence"), a mixed/wrong-language script, an untouched original surviving a 100% pass, off-target
    # density — and logs [[PLAN_CHECK]] so run.py + the founder see it. A CATASTROPHIC plan (degenerate
    # repetition, or an original line surviving 100%) ABORTS HERE, before a cent of TTS+mix GPU is spent;
    # softer issues are logged and left to the POST gate. String-based checks only ⇒ safe to abort on.
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))
        from validators import validate_plan
        pv = validate_plan(overrides, tier=int(round(density * 100)), target_language=language,
                           source_texts=[o.get("original_text") for o in overrides],
                           total_source_lines=plan.get("candidate_count"),
                           total_speech_ms=plan.get("total_speech_ms"))
        print("[[PLAN_CHECK]] " + json.dumps(pv.to_dict(), default=str), flush=True)
        # LOG ONLY — never abort. A false positive here (e.g. flagging a legitimate repeated WAR CRY as
        # spam) would kill a GOOD generation, which is worse than wasting one render. The corpus gate +
        # the POST output gate are the enforcement; this is visibility, so a bad plan is never invisible.
        if not pv.passed:
            log(f"plan check flagged {pv.failures()} (logged; POST gate + corpus gate enforce)", "warn")
    except Exception as _e:
        print("[plan-check] skipped:", _e)

    # CATASTROPHIC-PLAN ABORT (string-only, safe): one override text dominating the whole plan is the
    # degenerate "My name is I ×13" failure (a broken draft → gap-filler flood). A legit war-cry repeats
    # at most ~2×, so a line that is ≥5 occurrences AND ≥40% of all lines can only be degeneracy. Abort
    # BEFORE any TTS/mix GPU — predict.py turns a non-"ok" status into a failed run (refund + re-roll),
    # so the user never hears it and is never charged. (The draft-JSON retry above makes this rare.)
    _texts = [(o.get("text") or o.get("override_text") or "").strip().lower() for o in overrides]
    _texts = [t for t in _texts if t]
    if _texts:
        from collections import Counter
        _top, _n = Counter(_texts).most_common(1)[0]
        if _n >= 5 and _n / len(_texts) >= 0.40:
            log(f"CATASTROPHIC plan: '{_top[:40]}' repeats {_n}/{len(_texts)}× — aborting before TTS", "err")
            return {"status": "degenerate_plan", "elapsed_s": time.time() - t0}

    # ── Stage B: ORIGINAL-CANVAS rebuild (founder's model) ───────────────────
    # The canvas is the BIT-IDENTICAL ORIGINAL FULL MIX — NOT the demucs vocal stem. Kept regions then
    # carry the real music+voice with ZERO separation loss; ONLY the replaced slots get reconstructed
    # (accomp stem + constant bleed comp + clone). This kills the demucs-bleed 'music on/off' wobble the
    # old vocals-stem canvas produced at every replaced slot on thin-music sources. vocals/accomp are still
    # loaded (reference clips, per-slot loudness, slot-music reconstruction) and aligned to the full mix.
    if verbose: log(f"Stage B: original-canvas rebuild (full mix = {audio_path})...", "step")
    canvas = AudioSegment.from_file(str(audio_path))
    rate, chans = canvas.frame_rate, canvas.channels
    vocals = AudioSegment.from_wav(str(vocals_path)).set_frame_rate(rate).set_channels(chans)
    accomp = AudioSegment.from_wav(str(accomp_path)).set_frame_rate(rate).set_channels(chans)
    vocals = vocals[:window_ms]
    accomp = accomp[:window_ms]
    canvas = canvas[:window_ms]
    comp_db = _bleed_comp_db(canvas, accomp)
    # MUSIC-BED DETECTION. If the accompaniment stem is far below the vocal stem, demucs found no real music
    # (dry speech). The fixed-length canvas would then leave DEAD AIR at every short clone (no bed to carry
    # the gap) — so we switch to the concatenative, gap-closing assembly (_assemble_no_music). Relative
    # threshold (robust across loudness): accomp within 18dB of vocals = a real bed.
    a_db, v_db = accomp.dBFS, vocals.dBFS
    music_bed = _detect_music_bed(a_db, v_db)
    # Emit the decision so the offline gate (run.py) and the runtime delivery gate score with the SAME
    # music/no-music knowledge the cog used — music-band metrics only apply where there's a bed.
    print(f"[[MUSIC_BED]] {'true' if music_bed else 'false'}", flush=True)
    if verbose:
        mode = "MUSIC bed → timeline-locked canvas" if music_bed else "NO music (dry speech) → gap-closing assembly"
        log(f"canvas(full mix): {len(canvas)/1000:.2f}s @ {rate}Hz x{chans}; accomp {a_db:.1f}dB vs vocals {v_db:.1f}dB → {mode}; bleed comp {comp_db:+.2f}dB", "ok")

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
    placements = []   # (s_ms, slot_ms, fitted) per slot — assembled after the loop per music/no-music mode
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
        # Filter the CLONE only (never the kept full-mix music). The clone is fresh TTS — no demucs hiss —
        # but a light HPF80 kills sub-bass rumble and an LPF14k trims synthetic sizzle so it sits cleanly
        # over the real music. Moved here from the old global bus filter, which dulled the kept original.
        clone = clone.high_pass_filter(80).low_pass_filter(14000)
        fitted = clone
        silence_after = max(0, slot_ms - raw_ms)
        decision = f"natural-full ({raw_ms}ms)"
        log(f"  fit: {decision}")

        # Loudness match to slot dBFS — but NEVER push the clone into clipping. F5 output already
        # peaks near 0 dBFS, so the +gain match can slam it past full scale into hard-clipping
        # distortion. Apply the match, then pull the PEAK back just under full scale.
        slot_db = measure_slot_dbfs(vocals, s_ms, e_ms)
        if fitted.dBFS != float('-inf'):
            # OmniVoice clones are PEAKY (high peak, low RMS). The old peak-clamp therefore left 29/34 slots
            # BELOW the target level (measured) -> every slot a touch quieter than the kept original = the
            # 'pump' the founder heard. Fix: gently COMPRESS the clone first (tame the peaks) so the loudness
            # match actually REACHES the target without clipping the mix. FLOOR the target so a near-silent
            # original slot never mutes the clone (that produced the -90 dBFS dead line).
            from pydub.effects import compress_dynamic_range
            fitted = compress_dynamic_range(fitted, threshold=-16.0, ratio=3.0, attack=5.0, release=60.0)
            target = max(slot_db if slot_db is not None else -16.0, -26.0)
            gain = target - fitted.dBFS
            if fitted.max_dBFS + gain > -1.0:   # final peak safety (rarely binds after compression)
                gain = -1.0 - fitted.max_dBFS
            fitted = fitted + gain
            log(f"  loudness: target {target:.2f}dBFS (gain {gain:+.2f}dB, compressed)")

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

        # Collect the placement; assembly happens after the loop (music → in-place canvas replace;
        # no music → gap-closing concatenation). Decoupling lets us pick the mode once, after all clones.
        placements.append((s_ms, slot_ms, fitted))

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

    # ── Assembly: pick the mode ONCE, now that every clone is made ─────────────
    if music_bed:
        # MUSIC: replace each slot in place on the full-mix canvas (timeline-locked → music stays in sync).
        for (s_ms, slot_ms, fitted) in placements:
            canvas = _rebuild_slot(canvas, accomp, vocals, s_ms, slot_ms, fitted, comp_db, rate, chans)
    else:
        # NO MUSIC: concatenate, closing the dead air a fixed-length canvas would leave (the dry-speech fix).
        canvas = _assemble_no_music(canvas, placements, rate, chans, gap_ms=min(int(breath_ms), 320))
        if verbose: log(f"no-music assembly: gaps closed → {len(canvas)/1000:.2f}s (window was {window_ms/1000:.2f}s)", "ok")

    # ── Stage D: drift check + save the personalized full-mix pre-master ──────
    if music_bed:
        drift_ms = abs(len(canvas) - window_ms)
        if drift_ms > 50:   # >50ms signals a real bug on the timeline-locked path (should be ~0), not rounding
            log(f"UNEXPECTED canvas drift {drift_ms}ms (should be ~0 after slot-locking) — investigate", "err")
    canvas = canvas[:window_ms]   # ceiling clamp (no-op for the no-music path, which is already ≤ window)
    pv_path = out_dir / "vocals_personalized.wav"   # filename kept for audit compat; content = full pre-master
    canvas.export(str(pv_path), format="wav")
    if verbose: log(f"personalized full-mix pre-master saved: {pv_path}", "ok")

    # ── Stage E: master the canvas (it IS the full mix already — no stem re-summing) ──
    # The canvas is the finished pre-master: kept regions = bit-identical original full mix, replaced slots
    # = reconstructed music + clone. There is NOTHING to add here — the old code re-summed the accomp stem,
    # which on a FULL-MIX canvas would DOUBLE the music in every kept region. No bus limiter (it pumped),
    # no bus LPF (it dulled the kept original). Just ONE constant headroom trim if the peak would clip, then
    # trim the dead trailing silence (leave ~1s so it doesn't end abruptly).
    if verbose: log("Stage E: master canvas (static headroom + tail trim — no re-sum, no limiter)...", "step")
    final_path = out_dir / "personalized_output.mp3"
    peak = canvas.max_dBFS
    static_db = -(peak + 1.0) if peak > -1.0 else 0.0   # constant headroom trim ONLY if the canvas would clip
    vol = f"volume={static_db:.2f}dB," if static_db < 0 else ""
    if static_db < 0 and verbose:
        log(f"static headroom trim {static_db:.2f}dB (constant — no limiter, no pumping)", "ok")
    cmd2 = ["ffmpeg","-y","-loglevel","error","-i",str(pv_path),
            "-af", f"{vol}areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=1.0,areverse",
            "-ac","2","-ar","44100","-b:a","320k", str(final_path)]
    r = subprocess.run(cmd2, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FFmpeg encode failed: {r.stderr}", "err")
        return {"status": "mix_failed", "elapsed_s": time.time() - t0}
    if verbose: log(f"final master: {final_path}", "ok")

    # ── Stage F: audit ────────────────────────────────────────────────────
    final = AudioSegment.from_file(str(final_path))
    audit = {
        "audio_path": audio_path,
        "user_context": user_context,
        "audio_type": plan["type"],
        "audio_type_label": plan["type_label"],
        "user_brief": plan["brief"],
        "window_ms": window_ms,
        "music_bed": music_bed,
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

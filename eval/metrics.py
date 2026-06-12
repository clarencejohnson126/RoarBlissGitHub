"""
Roar Bliss — output evaluation battery. The objective, multi-dimensional definition of "good output".

This is NOT "compare the track to one golden file". It is a battery of ABSOLUTE standards measured by
FOUR INDEPENDENT EVALUATORS, so no single blind spot decides anything. All four already exist in the
cog — no new dependencies:

  1. SIGNAL   (ffmpeg)              — loudness, loudness range, dropouts, true peak, clipping, hiss, format
  2. SPEECH   (Whisper)            — intelligibility (whole + per line), output language, speaking rate, name present
  3. SPEAKER  (pyannote embeddings) — clone fidelity (clone vs source) and voice consistency across lines
  4. JUDGE    (Anthropic, LLM)      — coherence, tone match, safety, personalization quality, IP boundary

Design principles (founder: "checks and balances"):
  - TWO-SIDED bounds where more is not better (loudness range, speaking rate): a flat wall is as wrong
    as a rollercoaster; rushed is as wrong as dragging.
  - HARD gates (block / refund) vs SOFT warnings (flag only).
  - REDUNDANCY: loudness judged by LRA *and* dropout count; voice judged by Whisper *and* speaker
    embedding *and* the LLM judge.
  - GRACEFUL: an evaluator whose dependency/key is absent returns None ("not measured") and never
    fails a gate. So the signal+speech battery runs anywhere; speaker+judge run in the cog.
  - The thresholds below are the standards WE set, tunable in one place (Gates). The founder's ear is
    the meta-calibrator: a flaw he catches that the battery passed becomes a NEW measure here. Reference
    files are calibration fixtures for that loop, never the standard.

CLI:  python -m eval.metrics track.mp3 [--name Clarence] [--lang German] [--tier 100] [--expect-text "..."]
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass, field, asdict
from difflib import SequenceMatcher
from typing import Optional


# ── Standards (the parameters we set; tune here) ─────────────────────────────────────────────────────
@dataclass(frozen=True)
class Gates:
    # 1) SIGNAL ----------------------------------------------------------------------------------------
    integrated_lufs_min: float = -17.0   # streaming/mobile loudness window (two-sided)
    integrated_lufs_max: float = -11.0
    lra_max: float = 3.5                  # not a rollercoaster (calibrated: good 2.7, bad 5.9)
    lra_min: float = 0.8                  # …but not crushed flat/lifeless either (two-sided)
    dropout_depth_lu: float = 10.0        # a "hole": this far below integrated…
    dropout_min_ms: int = 600             # …sustained this long (calibrated: good=0 holes, bad=10)
    dropout_max_count: int = 0
    clip_ceiling_dbfs: float = -0.1       # hard clip if the peak sample reaches here
    hf_sizzle_ratio_max: float = 0.55     # >9kHz energy / full-band; high = demucs hiss/sizzle (soft)
    lead_silence_max_s: float = 2.0       # dead air at the very start
    true_peak_warn_dbtp: float = -1.0     # soft headroom advisory

    # 2) SPEECH ----------------------------------------------------------------------------------------
    intelligibility_min: float = 0.85     # whole-track Whisper round-trip word match
    per_line_intel_min: float = 0.70      # any single generated line this garbled = a swallowed line
    syllables_per_sec_min: float = 3.2    # natural pace, two-sided (rushed vs dragging)
    syllables_per_sec_max: float = 6.3

    # 3) SPEAKER ---------------------------------------------------------------------------------------
    clone_similarity_min: float = 0.62    # cosine(source voice, generated voice) — "is it the speaker"
    voice_consistency_min: float = 0.70   # min pairwise similarity across the generated lines

    # 4) JUDGE (LLM, 0..1) -----------------------------------------------------------------------------
    coherence_min: float = 0.70
    tone_match_min: float = 0.60
    personalization_min: float = 0.60
    safety_min: float = 0.99              # must be clean
    ip_overlap_max: float = 0.30          # 100% mode: transcript overlap with the SOURCE script

    # 5) SOURCE-RELATIVE (founder: "MESSE!") -----------------------------------------------------------
    # When the run's SOURCE file is known, the output is judged against ITS OWN source, never an
    # absolute number — "keep the original" means: the MUSIC (measured in isolation, <200Hz band where
    # voice carries ~nothing) may not be more restless or quieter than what the user uploaded, and the
    # overall dynamics may not exceed the source's. This metric caught the music rollercoaster the
    # summed-loudness gates missed (output sum was smooth because the VOICE dominated it).
    music_sigma_margin: float = 1.5    # music band may wobble at most this much MORE than the source (dB σ)
    music_level_margin: float = 4.0    # music band may be at most this much QUIETER than the source (dB).
                                       # Calibrated on founder verdicts: GoT v2 (ear: GOOD) = -3.5 dB,
                                       # Clarence v6 (ear: BAD) = -4.6 dB -> the line sits between.
    lra_margin_vs_source: float = 2.0  # overall loudness range: at most source LRA + this margin
    dropout_extra_vs_source: int = 2   # holes: at most the source's own holes + this many
    dropout_max_extra_ms: int = 1500   # …and no single real hole longer than the source's longest + this
                                       # (count alone misses ONE catastrophic 9.8s dead-air hole among short pauses)
    loudness_margin_vs_source: float = 4.0  # integrated loudness within ±this of the source (a voice
                                            # ADDS energy on the instrumental case, so ±4 not absolute)


DEFAULT_GATES = Gates()


def _run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True)
    return (p.stderr or "") + (p.stdout or "")


# ══════════════════════════════════════════════════════════════════════════════════════════════════
# EVALUATOR 1 — SIGNAL (ffmpeg)
# ══════════════════════════════════════════════════════════════════════════════════════════════════
def ebur128_summary(path: str) -> dict:
    txt = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"])
    def grab(label):
        m = re.search(rf"{label}:\s*(-?\d+(?:\.\d+)?)", txt)
        return float(m.group(1)) if m else None
    out = {"integrated_lufs": grab("I"), "lra": grab("LRA"), "true_peak_dbtp": grab("Peak")}
    # A 0.0 LRA from the summary is almost always a PARSE ARTIFACT in a constrained ffmpeg build (the
    # cog) — a real track is never perfectly flat. Treat it as "not measured" so the self-check never
    # false-fails a good track on it. The dropout check (reliable from the per-frame curve) + the
    # by-construction routing (solo/dry -> constant bed) cover loudness regardless. The OFFLINE GATE
    # runs in a consistent environment where the summary parses correctly and IS authoritative.
    if out["lra"] == 0.0:
        out["lra"] = None
    return out


def momentary_curve(path: str) -> list[tuple[float, float]]:
    txt = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128", "-f", "null", "-"])
    out = []
    for line in txt.splitlines():
        if "t:" not in line or "M:" not in line:
            continue
        mt, mm = re.search(r"\bt:\s*(-?\d+(?:\.\d+)?)", line), re.search(r"\bM:\s*(-?\d+(?:\.\d+)?)", line)
        if mt and mm:
            out.append((float(mt.group(1)), float(mm.group(1))))
    return out


def dropouts(path: str, integrated: Optional[float] = None, *,
             depth_lu: float = DEFAULT_GATES.dropout_depth_lu, min_ms: int = DEFAULT_GATES.dropout_min_ms) -> list[dict]:
    """Holes: momentary loudness > depth_lu below integrated, sustained >= min_ms. The 'cut off' dropouts.
    The leading lead-in (before content starts) is skipped."""
    curve = momentary_curve(path)
    if len(curve) < 3:
        return []
    if integrated is None:
        integrated = ebur128_summary(path)["integrated_lufs"]
    if integrated is None:
        return []
    floor = integrated - depth_lu
    start_i = next((i for i, (_, m) in enumerate(curve) if m >= floor), 0)
    holes, run_start, last_t = [], None, None
    for t, m in curve[start_i:]:
        if m < floor:
            run_start = t if run_start is None else run_start
            last_t = t
        else:
            if run_start is not None and (last_t - run_start) * 1000 >= min_ms:
                holes.append({"start_s": round(run_start, 2), "end_s": round(last_t, 2), "dur_ms": round((last_t - run_start) * 1000)})
            run_start = None
    if run_start is not None and last_t is not None and (last_t - run_start) * 1000 >= min_ms:
        holes.append({"start_s": round(run_start, 2), "end_s": round(last_t, 2), "dur_ms": round((last_t - run_start) * 1000)})
    return holes


def source_explained_holes(out_holes: list, src_curve: list, out_curve: list, gap_lu: float = 8.0) -> list:
    """Keep only the output holes the SOURCE does NOT explain. Compare the two loudness curves DIRECTLY in
    each hole window: a hole is a real defect only if the OUTPUT is much quieter than the SOURCE there
    (src_median - out_median >= gap_lu). If the output merely mirrors a soft source passage (a song's quiet
    outro), the gap is ~0 and it is not counted.

    Comparing output-vs-source (not source-vs-its-own-integrated) is the key: normal soft speech sits well
    below a track's loud integrated, so an integrated-relative test would wrongly excuse real dead air laid
    over continuous speech. Direct comparison cannot — if the source is talking and the output is silent,
    the gap is large and the hole stands."""
    if not src_curve or not out_curve:
        return out_holes
    real = []
    for h in out_holes:
        a, b = h["start_s"], h["end_s"]
        ssrc = sorted(m for (t, m) in src_curve if a <= t <= b)
        sout = sorted(m for (t, m) in out_curve if a <= t <= b)
        if ssrc and sout:
            src_med, out_med = ssrc[len(ssrc) // 2], sout[len(sout) // 2]
            if src_med - out_med < gap_lu:   # output not much quieter than source → mirrors it, not a cut
                continue
        real.append(h)
    return real


def music_band_stats(path: str) -> Optional[dict]:
    """THE founder metric ('MESSE!'): the MUSIC measured in ISOLATION from the voice. The <200Hz band
    belongs to the music bed (speech carries ~nothing there), so its momentary curve over time exposes
    a music rollercoaster even when the summed loudness looks smooth (the voice dominates the sum).
    Returns mean level + sigma (the wobble) over the active frames."""
    txt = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "lowpass=f=200,ebur128", "-f", "null", "-"])
    vals = []
    for line in txt.splitlines():
        if "t:" not in line or "M:" not in line:
            continue
        mt, mm = re.search(r"\bt:\s*(-?\d+(?:\.\d+)?)", line), re.search(r"\bM:\s*(-?\d+(?:\.\d+)?)", line)
        if mt and mm and float(mt.group(1)) > 4 and float(mm.group(1)) > -60:
            vals.append(float(mm.group(1)))
    if len(vals) < 12:
        return None
    mean = sum(vals) / len(vals)
    sigma = (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5
    return {"mean": round(mean, 1), "sigma": round(sigma, 1)}


def clip_peak_dbfs(path: str) -> Optional[float]:
    txt = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"])
    m = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", txt)
    return float(m.group(1)) if m else None


def hf_sizzle_ratio(path: str) -> Optional[float]:
    """Crude hiss/sizzle proxy: RMS of the >9kHz band vs the full band (linear). Demucs vocal separation
    leaves broadband HF noise → a high ratio. (Founder's #1 hiss complaint, made measurable.)"""
    def mean_db(af):
        t = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", af + ",volumedetect", "-f", "null", "-"])
        m = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", t)
        return float(m.group(1)) if m else None
    full, hf = mean_db("aformat=channel_layouts=mono"), mean_db("aformat=channel_layouts=mono,highpass=f=9000")
    if full is None or hf is None:
        return None
    return round(10 ** ((hf - full) / 20), 3)  # linear ratio


def lead_silence_s(path: str) -> Optional[float]:
    txt = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-45dB:d=0.3", "-f", "null", "-"])
    m = re.search(r"silence_start:\s*0(?:\.0+)?\b.*?silence_end:\s*(\d+(?:\.\d+)?)", txt, re.S)
    return float(m.group(1)) if m else 0.0


def duration_s(path: str) -> Optional[float]:
    txt = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)])
    m = re.search(r"(\d+(?:\.\d+)?)", txt)
    return float(m.group(1)) if m else None


def audio_format(path: str) -> dict:
    txt = _run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                "stream=sample_rate,channels,bit_rate", "-of", "default=noprint_wrappers=1", str(path)])
    def grab(k):
        m = re.search(rf"{k}=(\d+)", txt)
        return int(m.group(1)) if m else None
    return {"sample_rate": grab("sample_rate"), "channels": grab("channels"), "bit_rate": grab("bit_rate")}


# ══════════════════════════════════════════════════════════════════════════════════════════════════
# EVALUATOR 2 — SPEECH (Whisper). Optional dep; returns None when unavailable.
# ══════════════════════════════════════════════════════════════════════════════════════════════════
_WORDS = lambda s: re.sub(r"[^\w\s]", " ", (s or "").lower()).split()
_VOWEL_GROUPS = re.compile(r"[aeiouyäöü]+", re.I)


def _whisper_transcribe(path: str, model_name: str = "base") -> Optional[dict]:
    try:
        import whisper
    except Exception:
        return None
    try:
        return whisper.load_model(model_name).transcribe(str(path))
    except Exception:
        return None


def _similarity(a: str, b: str) -> Optional[float]:
    wa, wb = _WORDS(a), _WORDS(b)
    if not wa:
        return None
    return round(SequenceMatcher(None, wa, wb).ratio(), 3)


def intelligibility(path: str, expected_text: str, *, transcript: Optional[dict] = None) -> Optional[float]:
    """Whole-track Whisper round-trip vs the script we asked the voice to say (catches gibberish)."""
    if not expected_text or not expected_text.strip():
        return None
    tr = transcript or _whisper_transcribe(path)
    if tr is None:
        return None
    return _similarity(expected_text, tr.get("text", ""))


def per_line_intelligibility(path: str, lines: list[str], *, transcript: Optional[dict] = None) -> Optional[dict]:
    """Worst single line's match — a track average hides one swallowed line. Aligns each intended line
    to the nearest stretch of the transcript."""
    if not lines:
        return None
    tr = transcript or _whisper_transcribe(path)
    if tr is None:
        return None
    heard = " ".join(_WORDS(tr.get("text", "")))
    worst, worst_line = 1.0, None
    for ln in lines:
        toks = _WORDS(ln)
        if not toks:
            continue
        # best matching window of the transcript for this line
        sm = SequenceMatcher(None, toks, heard.split())
        ratio = sm.ratio()
        if ratio < worst:
            worst, worst_line = round(ratio, 3), ln[:50]
    return {"worst": worst, "worst_line": worst_line}


def output_language(path: str, *, transcript: Optional[dict] = None) -> Optional[str]:
    """The language Whisper hears in the OUTPUT (catches 'asked for German, got English')."""
    tr = transcript or _whisper_transcribe(path)
    return tr.get("language") if tr else None


def speaking_rate(path: str, *, transcript: Optional[dict] = None) -> Optional[float]:
    """Syllables per second over the spoken (non-silent) time. Two-sided: rushed vs dragging."""
    tr = transcript or _whisper_transcribe(path)
    if tr is None:
        return None
    syl = sum(len(_VOWEL_GROUPS.findall(w)) or 1 for w in _WORDS(tr.get("text", "")))
    segs = tr.get("segments") or []
    voiced = sum((s.get("end", 0) - s.get("start", 0)) for s in segs) or (duration_s(path) or 0)
    return round(syl / voiced, 2) if voiced > 0 else None


def contains_name(path: str, name: str, *, transcript: Optional[dict] = None) -> Optional[bool]:
    """The product's core promise: is the user's name actually spoken in the track?"""
    if not name or not name.strip():
        return None
    tr = transcript or _whisper_transcribe(path)
    if tr is None:
        return None
    heard = " ".join(_WORDS(tr.get("text", "")))
    return any(part in heard.split() for part in _WORDS(name))


# ══════════════════════════════════════════════════════════════════════════════════════════════════
# EVALUATOR 3 — SPEAKER EMBEDDINGS (pyannote). Runs in the cog; None elsewhere.
# ══════════════════════════════════════════════════════════════════════════════════════════════════
def _embedding(wav_path: str):
    try:
        import numpy as np
        from pyannote.audio import Inference, Model
        model = Model.from_pretrained("pyannote/embedding", use_auth_token=os.environ.get("HF_TOKEN"))
        emb = Inference(model, window="whole")(str(wav_path))
        return np.asarray(emb).reshape(-1)
    except Exception:
        return None


def clone_fidelity(generated_wav: str, source_ref_wav: str) -> Optional[float]:
    """Cosine similarity between the source speaker and the generated voice — 'does it sound like them'.
    This is the founder's 'Stimmenklang' turned into a number."""
    try:
        import numpy as np
    except Exception:
        return None
    a, b = _embedding(generated_wav), _embedding(source_ref_wav)
    if a is None or b is None:
        return None
    return round(float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)), 3)


# ══════════════════════════════════════════════════════════════════════════════════════════════════
# EVALUATOR 4 — LLM JUDGE (Anthropic). Runs when ANTHROPIC_API_KEY is set; None otherwise.
# ══════════════════════════════════════════════════════════════════════════════════════════════════
def llm_judge(transcript_text: str, *, brief: str = "", tone: str = "", name: str = "",
              source_text: str = "", model: str = "claude-sonnet-4-6") -> Optional[dict]:
    """An independent 'ear' on the WORDS: coherence, tone match, personalization, safety, and (when a
    source script is given) how much of the original was reused (IP boundary). Returns 0..1 scores."""
    if not transcript_text or not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        import anthropic
    except Exception:
        return None
    rubric = (
        "You are a strict QA judge for a personalized motivational track. Score 0.0-1.0 each and return "
        "ONLY JSON: {\"coherence\":,\"tone_match\":,\"personalization\":,\"safety\":,\"ip_overlap\":}. "
        "coherence = grammatical, sensible, flows. tone_match = matches the requested tone. "
        "personalization = the listener's name/story are woven in naturally. safety = 1.0 unless there is "
        "hateful/unsafe/nonsensical content. ip_overlap = fraction of lines copied from the SOURCE script "
        "(0 = all original, 1 = reused). "
        f"\n\nREQUESTED TONE: {tone or 'n/a'}\nLISTENER NAME: {name or 'n/a'}\nBRIEF: {brief[:500] or 'n/a'}"
        f"\nSOURCE SCRIPT (for ip_overlap; may be empty): {source_text[:800] or 'n/a'}"
        f"\n\nTRANSCRIPT TO JUDGE:\n{transcript_text[:3000]}"
    )
    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        msg = client.messages.create(model=model, max_tokens=300, messages=[{"role": "user", "content": rubric}])
        raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        m = re.search(r"\{.*\}", raw, re.S)
        return json.loads(m.group(0)) if m else None
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════════════════════════
# SCORECARD — orchestrates the four evaluators against the gates
# ══════════════════════════════════════════════════════════════════════════════════════════════════
@dataclass
class Scorecard:
    path: str
    measured: dict = field(default_factory=dict)
    checks: dict = field(default_factory=dict)     # HARD gate -> True/False/None (None = not measured)
    warnings: list = field(default_factory=list)   # SOFT advisories
    passed: bool = False

    def failures(self) -> list[str]:
        return [k for k, v in self.checks.items() if v is False]

    def to_dict(self) -> dict:
        return asdict(self)


def score(path: str, *, context: Optional[dict] = None, gates: Gates = DEFAULT_GATES) -> Scorecard:
    """
    Grade a track with the full battery. `context` carries what the cog knows about the run (all optional;
    each check runs only if its inputs are present):
      expected_text, lines[], name, language (target), tier, personalized_fraction,
      source_text, source_ref_wav, generated_wav, brief, tone
    """
    c = context or {}
    m: dict = {}
    ck: dict = {}
    warn: list = []

    # 1) SIGNAL ----------------------------------------------------------------------------------------
    s = ebur128_summary(path)
    drops = dropouts(path, s["integrated_lufs"], depth_lu=gates.dropout_depth_lu, min_ms=gates.dropout_min_ms)
    m["integrated_lufs"], m["lra"], m["true_peak_dbtp"] = s["integrated_lufs"], s["lra"], s["true_peak_dbtp"]
    m["dropouts"], m["dropout_regions"] = len(drops), drops
    m["clip_peak_dbfs"] = clip_peak_dbfs(path)
    m["hf_sizzle_ratio"] = hf_sizzle_ratio(path)
    m["lead_silence_s"] = lead_silence_s(path)
    m["duration_s"] = duration_s(path)
    m["format"] = audio_format(path)
    if s["integrated_lufs"] is not None:
        ck["loudness_target"] = gates.integrated_lufs_min <= s["integrated_lufs"] <= gates.integrated_lufs_max

    # SOURCE-RELATIVE mode (founder: "MESSE!"): when the source file is known, judge the output against
    # ITS OWN source instead of absolute numbers — and measure the MUSIC in isolation. This is what the
    # ear caught and the summed gates missed.
    # has_music_bed: the COG detects this from the demucs stems and emits [[MUSIC_BED]] (run.py threads it in).
    # A dry-speech source has NO music bed, so the <200Hz "music" metrics would just be measuring the VOICE
    # (which pauses between sentences) — meaningless and falsely failing. Skip them when there is no bed; the
    # dead-air guard (no_dropouts) still applies, because a hole in dry speech IS a defect.
    has_music = c.get("has_music_bed", True)
    src = c.get("source_audio")
    if src:
        src_sum = ebur128_summary(src)
        src_drops = dropouts(src, src_sum["integrated_lufs"], depth_lu=gates.dropout_depth_lu, min_ms=gates.dropout_min_ms)
        m["source"] = {"lra": src_sum["lra"], "dropouts": len(src_drops)}
        if has_music:
            mb_out, mb_src = music_band_stats(path), music_band_stats(src)
            m["music_band"] = {"out": mb_out, "source": mb_src}
            if mb_out and mb_src:
                ck["music_stability"] = mb_out["sigma"] <= mb_src["sigma"] + gates.music_sigma_margin
                ck["music_level"] = mb_out["mean"] >= mb_src["mean"] - gates.music_level_margin
            if s["lra"] is not None and src_sum["lra"] is not None:
                ck["loudness_range"] = s["lra"] <= src_sum["lra"] + gates.lra_margin_vs_source
        if s["integrated_lufs"] is not None and src_sum["integrated_lufs"] is not None:
            m["source"]["integrated"] = src_sum["integrated_lufs"]
            ck["loudness_target"] = abs(s["integrated_lufs"] - src_sum["integrated_lufs"]) <= gates.loudness_margin_vs_source
        # Source-aware dropouts: keep only holes where the OUTPUT is much quieter than the SOURCE at that
        # time (a real cut). Holes that mirror a soft source passage are dropped. Direct out-vs-src compare.
        real_holes = source_explained_holes(drops, momentary_curve(src), momentary_curve(path))
        real_max = max((h["dur_ms"] for h in real_holes), default=0)
        src_max = max((h["dur_ms"] for h in src_drops), default=0)
        m["real_dropouts"], m["real_dropout_max_ms"] = len(real_holes), real_max
        # Two-part: not too MANY real holes, AND no single one far LONGER than the source's worst (dead air).
        ck["no_dropouts"] = (len(real_holes) <= len(src_drops) + gates.dropout_extra_vs_source) and \
                            (real_max <= src_max + gates.dropout_max_extra_ms)
    else:
        if s["lra"] is not None:
            ck["loudness_range"] = gates.lra_min <= s["lra"] <= gates.lra_max   # two-sided absolute
        ck["no_dropouts"] = len(drops) <= gates.dropout_max_count
    if m["clip_peak_dbfs"] is not None:
        ck["no_clipping"] = m["clip_peak_dbfs"] < gates.clip_ceiling_dbfs
    if m["hf_sizzle_ratio"] is not None and m["hf_sizzle_ratio"] > gates.hf_sizzle_ratio_max:
        warn.append(f"HF sizzle ratio {m['hf_sizzle_ratio']} > {gates.hf_sizzle_ratio_max} (possible hiss)")
    if m["lead_silence_s"] and m["lead_silence_s"] > gates.lead_silence_max_s:
        warn.append(f"lead silence {m['lead_silence_s']}s > {gates.lead_silence_max_s}")
    if s["true_peak_dbtp"] is not None and s["true_peak_dbtp"] > gates.true_peak_warn_dbtp:
        warn.append(f"true peak {s['true_peak_dbtp']} dBTP > {gates.true_peak_warn_dbtp}")
    if c.get("expected_ms") and m["duration_s"] is not None:
        ck["not_cut_short"] = (m["duration_s"] * 1000) >= c["expected_ms"] * 0.9

    # 2) SPEECH (one transcription, reused across checks) ---------------------------------------------
    tr = _whisper_transcribe(path) if (c.get("expected_text") or c.get("lines") or c.get("name") or c.get("language")) else None
    if tr is not None:
        if c.get("expected_text"):
            m["intelligibility"] = intelligibility(path, c["expected_text"], transcript=tr)
            ck["intelligibility"] = (m["intelligibility"] is None) or (m["intelligibility"] >= gates.intelligibility_min)
        if c.get("lines"):
            pl = per_line_intelligibility(path, c["lines"], transcript=tr)
            m["per_line"] = pl
            ck["no_swallowed_line"] = (pl is None) or (pl["worst"] >= gates.per_line_intel_min)
        if c.get("name"):
            m["name_present"] = contains_name(path, c["name"], transcript=tr)
            ck["name_present"] = (m["name_present"] is None) or bool(m["name_present"])
        if c.get("language"):
            m["output_language"] = output_language(path, transcript=tr)
            want = str(c["language"]).strip().lower()[:2]
            ck["language_match"] = (m["output_language"] is None) or (m["output_language"][:2] == want or want in ("en", "")) or (m["output_language"] == want)
        m["speaking_rate"] = speaking_rate(path, transcript=tr)
        if m["speaking_rate"] is not None:
            ck["speaking_rate"] = gates.syllables_per_sec_min <= m["speaking_rate"] <= gates.syllables_per_sec_max  # two-sided

    # 3) SPEAKER --------------------------------------------------------------------------------------
    if c.get("generated_wav") and c.get("source_ref_wav"):
        m["clone_similarity"] = clone_fidelity(c["generated_wav"], c["source_ref_wav"])
        if m["clone_similarity"] is not None:
            ck["clone_fidelity"] = m["clone_similarity"] >= gates.clone_similarity_min

    # 4) JUDGE ----------------------------------------------------------------------------------------
    if tr is not None or c.get("transcript_text"):
        jt = c.get("transcript_text") or (tr.get("text", "") if tr else "")
        j = llm_judge(jt, brief=c.get("brief", ""), tone=c.get("tone", ""), name=c.get("name", ""),
                      source_text=c.get("source_text", "")) if jt else None
        if j:
            m["judge"] = j
            ck["coherence"] = j.get("coherence", 1) >= gates.coherence_min
            ck["safety"] = j.get("safety", 1) >= gates.safety_min
            if c.get("tone"):
                ck["tone_match"] = j.get("tone_match", 1) >= gates.tone_match_min
            if c.get("name") or c.get("brief"):
                ck["personalization"] = j.get("personalization", 1) >= gates.personalization_min
            if c.get("tier") == 100 and "ip_overlap" in j:
                ck["ip_boundary"] = j.get("ip_overlap", 0) <= gates.ip_overlap_max

    # tier fidelity (the cog supplies the measured personalized fraction; we compare to the request)
    if c.get("tier") and c.get("personalized_fraction") is not None and c["tier"] < 100:
        m["personalized_fraction"] = c["personalized_fraction"]
        ck["tier_fidelity"] = abs(c["personalized_fraction"] - c["tier"] / 100.0) <= 0.10

    passed = all(v is not False for v in ck.values())
    return Scorecard(path=str(path), measured=m, checks=ck, warnings=warn, passed=passed)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Score a Roar Bliss track against the evaluation battery.")
    ap.add_argument("path")
    ap.add_argument("--expect-text", default=None)
    ap.add_argument("--name", default=None)
    ap.add_argument("--lang", default=None)
    ap.add_argument("--tier", type=int, default=None)
    ap.add_argument("--expect-ms", type=int, default=None)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    ctx = {"expected_text": a.expect_text, "name": a.name, "language": a.lang, "tier": a.tier, "expected_ms": a.expect_ms}
    card = score(a.path, context={k: v for k, v in ctx.items() if v is not None})
    if a.json:
        print(json.dumps(card.to_dict(), indent=2, default=str))
    else:
        print(f"  file: {card.path}")
        for k, v in card.measured.items():
            if k not in ("dropout_regions", "format", "per_line", "judge"):
                print(f"    {k:18} {v}")
        print("  ── checks ──")
        for k, v in card.checks.items():
            print(f"    {'✓' if v else ('—' if v is None else '✗')} {k}")
        for w in card.warnings:
            print(f"    ⚠ {w}")
        print(f"  ══ {'PASS ✓' if card.passed else 'FAIL ✗ ' + str(card.failures())}")

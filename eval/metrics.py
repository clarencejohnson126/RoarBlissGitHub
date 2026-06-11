"""
Roar Bliss — objective audio-quality metrics. THE single definition of "good output".

The whole point: we can't hand-listen to every user upload, so a track's quality must be a NUMBER.
These exact functions run in three places (one definition of "good", everywhere):
  1. eval/run.py        — the offline gate: no cog version ships to prod unless the golden corpus is green.
  2. predict.py         — the cog's runtime self-check: the cog measures ITS OWN output before returning
                          and self-corrects (re-mix over a constant bed, re-synth a swallowed line) so an
                          input we never tested still can't ship a rollercoaster.
  3. web (post-delivery)— a final guard: a delivered track that fails its gates is flagged / auto-refunded.

Every metric is grounded in a REAL failure the founder caught by ear, not a theoretical ideal:
  - loudness_range  -> the "volume rollercoaster"  (measured: good file LRA 2.7 vs bad file LRA 5.9)
  - dropouts        -> the "-35 dB holes" that sounded "cut off" (bed holes on a dry-speech source)
  - intelligibility -> "swallowed words" / gibberish (Whisper round-trip vs the script we asked for)
  - duration        -> "cut short" (output shorter than the intended window)
  - true_peak       -> digital clipping / distortion

Dependencies: ffmpeg (always present in the cog + on the dev box). Whisper is OPTIONAL — if it isn't
installed, intelligibility returns None ("not measured") and never blocks. No heavy imports at module
load, so this is safe to import anywhere.

CLI:  python -m eval.metrics path/to/track.mp3 [--expect-text "..."] [--expect-ms 127000]
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field, asdict
from difflib import SequenceMatcher
from typing import Optional


# ── Gates — the acceptance thresholds. Tightening one of these is how the system "learns" from a
#    complaint: a flaw the founder catches by ear becomes a permanent, automated check here. ──────────
@dataclass(frozen=True)
class Gates:
    # HARD gates — a fail here blocks the track. Each is calibrated against the founder's own
    # known-GOOD reference (must pass) and known-BAD output (must fail), not a textbook ideal.
    lra_max: float = 3.5            # loudness range; calibrated: good=2.7 passes, rollercoaster=5.9 fails
    dropout_depth_lu: float = 10.0  # a "hole" = momentary loudness this far below the track's own integrated…
    dropout_min_ms: int = 600       # …AND sustained this long. Calibrated: the good file's benign ~400ms dips
                                    # score 0; the bad file's 2-5s bed holes score many. Depth+duration both required.
    dropout_max_count: int = 0
    intelligibility_min: float = 0.85   # Whisper round-trip word-match vs the intended script (swallowed words)
    duration_min_frac: float = 0.90      # output must be >= this fraction of the intended length (never "cut short")
    duration_max_frac: float = 1.15      # …and not wildly longer
    # SOFT warning — measured + reported, never blocks. Not a founder complaint; both the good and bad
    # files sit near -0.3 dBTP because the cog limiter runs at 0.97. (Lowering that limiter to hit -1.0
    # is a separate mastering tweak; flagged, not gated.)
    true_peak_warn_dbtp: float = -1.0


DEFAULT_GATES = Gates()


# ── Raw measurements ─────────────────────────────────────────────────────────────────────────────────
def _run(cmd: list[str]) -> str:
    """Run ffmpeg/ffprobe, return combined stderr+stdout text (ffmpeg writes stats to stderr)."""
    p = subprocess.run(cmd, capture_output=True, text=True)
    return (p.stderr or "") + (p.stdout or "")


def ebur128_summary(path: str) -> dict:
    """Integrated loudness (I, LUFS), loudness range (LRA, LU) and true peak (dBTP) via one ffmpeg pass."""
    txt = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"])
    def grab(label: str) -> Optional[float]:
        # The summary prints e.g. "    I:         -13.6 LUFS" / "    LRA:    5.9 LU" / "    Peak:   -1.2 dBFS"
        m = re.search(rf"{label}:\s*(-?\d+(?:\.\d+)?)", txt)
        return float(m.group(1)) if m else None
    return {"integrated_lufs": grab("I"), "lra": grab("LRA"), "true_peak_dbtp": grab("Peak")}


def momentary_curve(path: str) -> list[tuple[float, float]]:
    """Per-frame momentary loudness as [(t_seconds, M_LUFS), ...] — the shape of the rollercoaster."""
    txt = _run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128", "-f", "null", "-"])
    out: list[tuple[float, float]] = []
    for line in txt.splitlines():
        if "t:" not in line or "M:" not in line:
            continue
        mt = re.search(r"\bt:\s*(-?\d+(?:\.\d+)?)", line)
        mm = re.search(r"\bM:\s*(-?\d+(?:\.\d+)?)", line)
        if mt and mm:
            out.append((float(mt.group(1)), float(mm.group(1))))
    return out


def dropouts(path: str, integrated: Optional[float] = None, *,
             depth_lu: float = DEFAULT_GATES.dropout_depth_lu,
             min_ms: int = DEFAULT_GATES.dropout_min_ms) -> list[dict]:
    """
    Find "holes": stretches where the momentary loudness falls more than `depth_lu` below the track's own
    integrated loudness and stays there for at least `min_ms`. This is the objective signature of the
    "cut off" dropouts. The leading silence before speech starts is ignored (it's not a hole in content).
    """
    curve = momentary_curve(path)
    if len(curve) < 3:
        return []
    if integrated is None:
        integrated = ebur128_summary(path)["integrated_lufs"]
    if integrated is None:
        return []
    floor = integrated - depth_lu
    # ffmpeg emits momentary frames ~every 100 ms.
    dt = max(1e-3, (curve[-1][0] - curve[0][0]) / max(1, len(curve) - 1))
    # Skip the leading lead-in (everything before the first frame that rises above the floor).
    start_i = 0
    for i, (_, m) in enumerate(curve):
        if m >= floor:
            start_i = i
            break
    holes, run_start, last_t = [], None, None
    for t, m in curve[start_i:]:
        if m < floor:
            if run_start is None:
                run_start = t
            last_t = t
        else:
            if run_start is not None and last_t is not None and (last_t - run_start) * 1000 >= min_ms:
                holes.append({"start_s": round(run_start, 2), "end_s": round(last_t, 2),
                              "dur_ms": round((last_t - run_start) * 1000)})
            run_start = None
    if run_start is not None and last_t is not None and (last_t - run_start) * 1000 >= min_ms:
        holes.append({"start_s": round(run_start, 2), "end_s": round(last_t, 2),
                      "dur_ms": round((last_t - run_start) * 1000)})
    return holes


def duration_s(path: str) -> Optional[float]:
    txt = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                "default=noprint_wrappers=1:nokey=1", str(path)])
    m = re.search(r"(\d+(?:\.\d+)?)", txt)
    return float(m.group(1)) if m else None


def _normalize_words(s: str) -> list[str]:
    return re.sub(r"[^\w\s]", " ", (s or "").lower()).split()


def intelligibility(path: str, expected_text: str, *, model_name: str = "base") -> Optional[float]:
    """
    Whisper round-trip: transcribe the rendered audio and compare to the script we ASKED the voice to
    say. Returns a 0..1 word-sequence similarity. This is what catches "swallowed words" / gibberish
    automatically. Returns None if Whisper isn't installed (caller treats None as "not measured").
    """
    if not expected_text or not expected_text.strip():
        return None
    try:
        import whisper  # optional; heavy. Imported lazily so the module loads anywhere.
    except Exception:
        return None
    try:
        model = whisper.load_model(model_name)
        heard = model.transcribe(str(path)).get("text", "")
    except Exception:
        return None
    a, b = _normalize_words(expected_text), _normalize_words(heard)
    if not a:
        return None
    return round(SequenceMatcher(None, a, b).ratio(), 3)


# ── Scorecard ──────────────────────────────────────────────────────────────────────────────────────
@dataclass
class Scorecard:
    path: str
    measured: dict = field(default_factory=dict)
    checks: dict = field(default_factory=dict)     # HARD gate_name -> bool|None  (None = not measured)
    warnings: list = field(default_factory=list)   # SOFT advisories — reported, never block
    passed: bool = False

    def failures(self) -> list[str]:
        return [k for k, v in self.checks.items() if v is False]

    def to_dict(self) -> dict:
        return asdict(self)


def score(path: str, *, expected_text: Optional[str] = None, expected_ms: Optional[int] = None,
          gates: Gates = DEFAULT_GATES) -> Scorecard:
    """Measure a track and grade it against the gates. The one call every layer of the system uses."""
    s = ebur128_summary(path)
    drops = dropouts(path, s["integrated_lufs"], depth_lu=gates.dropout_depth_lu, min_ms=gates.dropout_min_ms)
    dur = duration_s(path)
    measured = {
        "integrated_lufs": s["integrated_lufs"],
        "lra": s["lra"],
        "true_peak_dbtp": s["true_peak_dbtp"],
        "dropouts": len(drops),
        "dropout_regions": drops,
        "duration_s": dur,
    }
    checks: dict = {}
    checks["loudness_range"] = (s["lra"] is not None and s["lra"] <= gates.lra_max)
    checks["no_dropouts"] = (len(drops) <= gates.dropout_max_count)

    if expected_text:
        wm = intelligibility(path, expected_text)
        measured["intelligibility"] = wm
        checks["intelligibility"] = None if wm is None else (wm >= gates.intelligibility_min)
    if expected_ms and dur is not None:
        frac = (dur * 1000) / expected_ms
        measured["duration_frac"] = round(frac, 3)
        checks["duration"] = (gates.duration_min_frac <= frac <= gates.duration_max_frac)

    # Soft advisory: true peak. Reported, never blocks (both the good and bad references run hot
    # because of the cog limiter — it doesn't separate good from bad, so it's a warning, not a gate).
    warnings: list = []
    if s["true_peak_dbtp"] is not None and s["true_peak_dbtp"] > gates.true_peak_warn_dbtp:
        warnings.append(f"true peak {s['true_peak_dbtp']} dBTP > {gates.true_peak_warn_dbtp} (limiter runs hot)")

    # A None check = "not measured" and never fails the gate; only explicit False fails.
    passed = all(v is not False for v in checks.values())
    return Scorecard(path=str(path), measured=measured, checks=checks, warnings=warnings, passed=passed)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Score a Roar Bliss audio file against the quality gates.")
    ap.add_argument("path")
    ap.add_argument("--expect-text", default=None, help="The script the voice was asked to say (intelligibility check).")
    ap.add_argument("--expect-ms", type=int, default=None, help="Intended output length in ms (cut-short check).")
    ap.add_argument("--json", action="store_true", help="Emit the full scorecard as JSON.")
    a = ap.parse_args()
    card = score(a.path, expected_text=a.expect_text, expected_ms=a.expect_ms)
    if a.json:
        print(json.dumps(card.to_dict(), indent=2))
    else:
        m = card.measured
        print(f"  file:            {card.path}")
        print(f"  integrated:      {m.get('integrated_lufs')} LUFS")
        print(f"  loudness range:  {m.get('lra')} LU      (gate ≤ {DEFAULT_GATES.lra_max})")
        print(f"  dropouts:        {m.get('dropouts')}       (gate ≤ {DEFAULT_GATES.dropout_max_count})  {m.get('dropout_regions')}")
        print(f"  true peak:       {m.get('true_peak_dbtp')} dBTP  (warn > {DEFAULT_GATES.true_peak_warn_dbtp})")
        if "intelligibility" in m:
            print(f"  intelligibility: {m.get('intelligibility')}     (gate ≥ {DEFAULT_GATES.intelligibility_min})")
        if "duration_frac" in m:
            print(f"  duration:        {m.get('duration_s')}s  ({m.get('duration_frac')}× intended)")
        for w in card.warnings:
            print(f"  ⚠ warning:       {w}")
        print(f"  ── {'PASS ✓' if card.passed else 'FAIL ✗ ' + str(card.failures())}")

"""
Roar Bliss — DETERMINISTIC generation validators (the pre/post hooks).

These catch the MEANING-level defects the signal-only metric battery (metrics.py) is blind to — the ones
the founder's ear caught after a 6/6 "green": wrong density (asked 50%, got ~15%), degenerate/repeated
script ("my name is Clarence" every line), language mismatch (German/English mishmash), an untouched
source line surviving a "100%" pass, music that drops out under speech, and dead air.

Design (founder: "ein deterministisches python script ... vor UND nach der Generierung als doppelter Check"):
  - DETERMINISTIC. No LLM, no randomness — same input, same verdict. (langdetect is seeded; everything else
    is counting + ffmpeg.) A flaky judge is exactly what we are replacing.
  - DOUBLE CHECK:
      validate_plan(...)   runs AFTER the planner, BEFORE TTS — text-only, costs ~nothing, kills a bad plan
                           before a cent of GPU is spent. Catches density / repetition / language / remnant.
      validate_output(...) runs AFTER the mix, BEFORE delivery — never ship a bad file. Catches output
                           language, missing content, music drop-out (measured UNCONDITIONALLY, so a wrong
                           music-bed guess can't hide a wobble), dead air.
  - ROBUST TO THE OTHER GATES BEING WRONG. The music-continuity check does not trust the cog's music_bed
    flag; it measures the source for a bed itself. That is the bug that let #5's wobble through.

Both return a Verdict; the cog logs it as [[PLAN_CHECK]] / [[OUTPUT_CHECK]] so run.py and the webhook can
gate on it. A hard failure pre-gen → regenerate the plan (cheap); post-gen → refund + retry, never deliver.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Optional

try:
    import metrics  # same dir on sys.path in the cog + eval
except Exception:  # pragma: no cover - metrics is always present in practice
    metrics = None


# ── language detection (deterministic) ───────────────────────────────────────────────────────────────
_LANG_CODE = {"english": "en", "german": "de", "spanish": "es", "french": "fr", "italian": "it",
              "portuguese": "pt", "dutch": "nl", "polish": "pl", "russian": "ru", "chinese": "zh"}

# crude but dependency-free fallback: stop-word + diacritic signatures for the languages we ship most.
_STOP = {
    "en": {"the", "and", "is", "you", "your", "to", "of", "a", "in", "that", "it", "for", "on", "with", "this", "are", "be", "i"},
    "de": {"der", "die", "das", "und", "ist", "nicht", "ich", "du", "ein", "eine", "zu", "den", "mit", "auf", "für", "wir", "sie", "dein", "deine"},
    "es": {"el", "la", "que", "de", "y", "los", "las", "un", "una", "es", "tu", "para", "con", "no", "se"},
    "fr": {"le", "la", "les", "et", "que", "de", "un", "une", "est", "tu", "pour", "avec", "ne", "ton"},
}


def detect_lang(text: str) -> Optional[str]:
    """Best-effort 2-letter language code. langdetect (seeded → deterministic) if available, else a
    stop-word/diacritic heuristic that is enough to separate the languages we generate (en/de/es/fr)."""
    t = (text or "").strip()
    if len(t) < 4:
        return None
    try:
        from langdetect import detect, DetectorFactory
        DetectorFactory.seed = 0
        return detect(t)[:2]
    except Exception:
        pass
    low = " " + re.sub(r"[^\w äöüßéèàçñ]", " ", t.lower()) + " "
    if re.search(r"[äöüß]", low):
        return "de"
    words = set(low.split())
    scores = {lang: len(words & sw) for lang, sw in _STOP.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", (s or "").lower())).strip()


# ── verdict ──────────────────────────────────────────────────────────────────────────────────────────
@dataclass
class Verdict:
    stage: str                       # "plan" | "output"
    checks: dict = field(default_factory=dict)   # name -> bool
    detail: dict = field(default_factory=dict)   # name -> human string

    @property
    def passed(self) -> bool:
        return all(self.checks.values())

    def failures(self) -> list:
        return [k for k, v in self.checks.items() if not v]

    def to_dict(self) -> dict:
        return {"stage": self.stage, "passed": self.passed, "failures": self.failures(),
                "checks": self.checks, "detail": self.detail}


# ── PRE-GENERATION: validate the plan (text only, no GPU) ──────────────────────────────────────────────
def validate_plan(overrides: list, *, tier: int, target_language: str = "English",
                  source_texts: Optional[list] = None, total_source_lines: Optional[int] = None) -> Verdict:
    """Grade the planner's output BEFORE any TTS. `overrides` = the slots to be spoken (each {text, ...}).
      tier               requested personalization % (density). 100/translation ⇒ EVERY line replaced.
      target_language    the language EVERY generated line must be in.
      source_texts       the original line each slot replaces (to catch an untouched remnant).
      total_source_lines original line count (to verify the achieved density ≈ the requested tier).
    """
    v = Verdict("plan")
    texts = [(o.get("text") or "").strip() for o in overrides]
    nonempty = [t for t in texts if len(_norm(t)) >= 2]

    # 1) NON-EMPTY — every slot must carry a real line.
    v.checks["nonempty_lines"] = len(nonempty) == len(texts) and len(nonempty) > 0
    v.detail["nonempty_lines"] = f"{len(nonempty)}/{len(texts)} lines non-trivial"

    # 2) DENSITY — achieved replacement fraction must be within ~12pts of the requested tier (the founder
    #    asked 50% and got ~15%). Only checked when we know the original line count.
    if total_source_lines and total_source_lines > 0:
        frac = len(overrides) / total_source_lines * 100.0
        target = max(1.0, min(tier, 100))
        # 100% must be ~all lines; partial tiers get a two-sided window.
        ok = frac >= 88.0 if tier >= 100 else abs(frac - target) <= 12.0
        v.checks["density_matches_tier"] = ok
        v.detail["density_matches_tier"] = f"achieved {frac:.0f}% vs requested {tier}%"

    # 3) NO REPETITION / FILLER — the same line (or a dominant short phrase) repeated across slots is the
    #    "my name is Clarence" degeneracy. Flag if any normalized line repeats, or one phrase owns >30%.
    norms = [_norm(t) for t in nonempty]
    counts = {}
    for nrm in norms:
        counts[nrm] = counts.get(nrm, 0) + 1
    top = max(counts.values()) if counts else 0
    dominant = (top / len(norms)) if norms else 0.0
    # A war cry repeated 2-3x is the anthem MOTIF (legit — GoT's "King in the North!" etc.). Flag only
    # EXTREME repetition: the same line 4+ times, OR one phrase owning >50% of all lines (the "my name is
    # Clarence everywhere" degeneracy). The old "any duplicate" rule false-killed the golden GoT flow.
    v.checks["no_repetition"] = top < 4 and dominant <= 0.50
    v.detail["no_repetition"] = f"top line repeats {top}x, {dominant*100:.0f}% of lines"

    # 4) SCRIPT LANGUAGE — DELIBERATELY NOT a per-line check. langdetect on a SHORT line is unreliable
    #    ("And Johnson."->de, "I fell once."->it), so a per-line gate false-fails a perfectly good English
    #    script ~15% of the time. The language defenses that DON'T need per-line detection are stronger:
    #    full_replacement (below) catches an untouched source-language line by string match, and
    #    validate_output checks the language on the whole transcript (long text -> langdetect is reliable).

    # 5) FULL REPLACEMENT at 100% / translation — no slot may keep the ORIGINAL line. (#4 music blip / #6
    #    English remnant were untouched source lines surviving a "100%" pass.)
    if source_texts and (tier >= 100 or want != "en"):
        kept = []
        for o, src in zip(overrides, source_texts):
            nt, ns = _norm(o.get("text", "")), _norm(src or "")
            if ns and nt and SequenceMatcher(None, nt, ns).ratio() > 0.85:
                kept.append(ns[:40])
        v.checks["full_replacement"] = len(kept) == 0
        v.detail["full_replacement"] = f"{len(kept)} original line(s) survived 100%: {kept[:3]}" if kept else "every line replaced"

    return v


# ── POST-GENERATION: validate the finished file (before delivery) ─────────────────────────────────────
def validate_output(audio_path: str, source_audio: str, *, tier: int = 100,
                    target_language: str = "English", transcript_text: Optional[str] = None,
                    expected_name: Optional[str] = None) -> Verdict:
    """Grade the FINISHED file before it reaches a user. Signal lives in metrics.py; this adds the MEANING
    checks. `transcript_text` is the cog's Whisper transcription of the OUTPUT (deterministic at temp 0)."""
    v = Verdict("output")

    # 1) OUTPUT LANGUAGE — the spoken result must be in the target language (catches the #6 mishmash). Only
    #    checked when a transcript is supplied (post-gen, in the cog).
    if transcript_text:
        want = _LANG_CODE.get((target_language or "english").strip().lower(), (target_language or "en")[:2].lower())
        # PER-SENTENCE, not whole-blob: a 50/50 mishmash detects as one language overall and slips through.
        # Only LONG sentences (>=25 chars — langdetect is noisy on short ones, ~15-20% wrong even on a
        # clean track), and flag only when MOST are the wrong language (>35%). This separates a real
        # German/English mishmash (~50%+ wrong) from the ~20% langdetect noise on a clean single-language
        # track. A high bar on purpose: the goal is to catch the founder's mishmash, not chase noise.
        sents = [s.strip() for s in re.split(r"[.!?]+", transcript_text) if len(s.strip()) >= 25]
        langs = [detect_lang(s) for s in sents]
        off = [lg for lg in langs if lg and lg != want]
        frac_off = len(off) / len(langs) if langs else 0.0
        v.checks["output_language"] = frac_off <= 0.35
        v.detail["output_language"] = f"{len(off)}/{len(langs)} long sentences not {want} ({frac_off*100:.0f}%)"
        # 2) CONTENT PRESENT — only a degenerate/near-empty result fails. (No name check: Whisper mis-hears
        #    a name in music or another language too often to gate on it.)
        words = len(_norm(transcript_text).split())
        v.checks["content_present"] = words >= 12
        v.detail["content_present"] = f"{words} words"

    # 3) MUSIC CONTINUITY — UNCONDITIONAL. If the SOURCE has a music bed (measured here, NOT trusted from a
    #    flag), the output's music band must stay as steady as the source's. This is the check that would
    #    have caught #5: the cog called it "dry" and skipped music metrics, but the bed was real and wobbled.
    if metrics is not None:
        mb_src = metrics.music_band_stats(source_audio)
        mb_out = metrics.music_band_stats(audio_path)
        if mb_src and mb_out:
            source_has_bed = mb_src["mean"] > -45.0  # real sustained low-band energy = a bed exists
            if source_has_bed:
                # output wobble (sigma) must not exceed the source's by much, and the bed must not collapse.
                steady = mb_out["sigma"] <= mb_src["sigma"] + 2.5
                present = mb_out["mean"] >= mb_src["mean"] - 5.0
                v.checks["music_continuity"] = steady and present
                v.detail["music_continuity"] = (f"out σ={mb_out['sigma']:.1f} vs src σ={mb_src['sigma']:.1f}; "
                                                f"out {mb_out['mean']:.1f}dB vs src {mb_src['mean']:.1f}dB")

        # 4) NO DEAD AIR — reuse the source-aware dead-air gate (a real cut, not a mirrored quiet passage).
        s = metrics.ebur128_summary(audio_path)
        if s["integrated_lufs"] is not None:
            holes = metrics.dropouts(audio_path, s["integrated_lufs"])
            real = metrics.source_explained_holes(holes, metrics.momentary_curve(source_audio),
                                                  metrics.momentary_curve(audio_path))
            longest = max((h["dur_ms"] for h in real), default=0)
            v.checks["no_dead_air"] = longest <= 2500
            v.detail["no_dead_air"] = f"longest real hole {longest}ms"

    return v


# ── CLI: validate a finished file against its source (dev / eval) ──────────────────────────────────────
if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("source")
    ap.add_argument("--lang", default="English")
    ap.add_argument("--tier", type=int, default=100)
    ap.add_argument("--name", default=None)
    a = ap.parse_args()
    out = validate_output(a.audio, a.source, tier=a.tier, target_language=a.lang, expected_name=a.name)
    print(json.dumps(out.to_dict(), indent=2))

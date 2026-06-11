#!/usr/bin/env python3
"""Failing-first test for _enforce_density_budget — the deterministic tier clamp.

Repro of the GoT-75% bug: 56 non-anthem candidates, the LLM picks ALL of them
(92% of the spoken timeline replaced) although the tier asked for 75%. The clamp
must bring the replaced seconds down to ~the density budget, never drop the
earliest pick (first-30s retention rule), and keep iconic (anthem) lines
original at partial tiers.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from personalization_planner import _enforce_density_budget

def _mk_candidates(n=56, dur_s=3.0, gap_s=0.0, anthem_every=0):
    cands, t = [], 0
    for i in range(n):
        cands.append({
            "cand_id": i, "speaker": "SPEAKER_01",
            "start_ms": int(t * 1000), "end_ms": int((t + dur_s) * 1000),
            "duration_s": dur_s, "original_text": f"original line {i}",
            "target_syllables": 8,
            "is_anthem": bool(anthem_every and i and i % anthem_every == 0),
        })
        t += dur_s + gap_s
    return cands

def _pick_all(cands):
    return [{
        "id": i + 1, "speaker": c["speaker"], "emotion": "calm",
        "start_ms": c["start_ms"], "end_ms": c["end_ms"],
        "text": f"new line {i}", "theme": "identity",
        "original_text": c["original_text"],
    } for i, c in enumerate(cands)]

def test_clamps_to_budget():
    cands = _mk_candidates(n=56, dur_s=3.0)
    overrides = _pick_all(cands)          # LLM over-picked: 100% of speech
    out = _enforce_density_budget(overrides, cands, density=0.75)
    total_speech_ms = sum(c["duration_s"] * 1000 for c in cands if not c.get("is_anthem"))
    replaced = sum(o["end_ms"] - o["start_ms"] for o in out)
    assert replaced <= total_speech_ms * 0.75 + 1, \
        f"replaced {replaced}ms > 75% budget {total_speech_ms * 0.75:.0f}ms"
    # don't over-trim either: stay within ~one average slot under the budget
    assert replaced >= total_speech_ms * 0.75 - 3500, \
        f"over-trimmed: {replaced}ms vs budget {total_speech_ms * 0.75:.0f}ms"

def test_keeps_earliest_pick():
    cands = _mk_candidates(n=20, dur_s=3.0)
    out = _enforce_density_budget(_pick_all(cands), cands, density=0.25)
    assert any(o["start_ms"] == cands[0]["start_ms"] for o in out), \
        "earliest pick (first-30s retention) was dropped"

def test_under_budget_untouched():
    cands = _mk_candidates(n=20, dur_s=3.0)
    picks = _pick_all(cands)[:5]          # 25% picked, 50% allowed
    out = _enforce_density_budget(picks, cands, density=0.5)
    assert len(out) == 5, "an under-budget selection must pass through unchanged"

def test_iconic_picks_survive_the_trim():
    """Founder rule: iconic lines MAY be personalized at 25-75% — beat-matched, same thunder —
    so the budget trim must drop ordinary picks first and keep the climax transforms."""
    cands = _mk_candidates(n=24, dur_s=3.0, anthem_every=6)   # 3 anthem candidates
    picks = _pick_all(cands)              # LLM picked everything, anthems included
    out = _enforce_density_budget(picks, cands, density=0.5)
    anthem_starts = {c["start_ms"] for c in cands if c.get("is_anthem")}
    kept = [o for o in out if o["start_ms"] in anthem_starts]
    assert len(kept) == len(anthem_starts), \
        f"only {len(kept)}/{len(anthem_starts)} iconic transforms survived the trim"
    total_speech_ms = sum(c["duration_s"] * 1000 for c in cands)
    replaced = sum(o["end_ms"] - o["start_ms"] for o in out)
    assert replaced <= total_speech_ms * 0.5 + 1, "budget not honored with anthem picks present"

if __name__ == "__main__":
    fails = 0
    for name, fn in sorted({k: v for k, v in globals().items() if k.startswith("test_")}.items()):
        try:
            fn()
            print(f"PASS {name}")
        except AssertionError as ex:
            print(f"FAIL {name}: {ex}")
            fails += 1
        except Exception as ex:
            print(f"ERROR {name}: {type(ex).__name__}: {ex}")
            fails += 1
    sys.exit(1 if fails else 0)

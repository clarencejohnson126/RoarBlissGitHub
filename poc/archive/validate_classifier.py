#!/usr/bin/env python3
"""
Validation Runner — Sprint 1
============================
Runs the classifier on every audio in test_corpus.json, compares predicted
type vs ground truth, prints a confusion matrix + per-type accuracy.
"""

import json
from pathlib import Path
from collections import defaultdict
from audio_type_classifier import classify_audio, TYPE_PROFILES

CORPUS = Path(__file__).parent / "corpus" / "test_corpus.json"

def main():
    corpus = json.loads(CORPUS.read_text())
    audios = corpus["audios"]
    print(f"\n{'='*90}")
    print(f" CLASSIFIER VALIDATION — {len(audios)} audios")
    print(f"{'='*90}\n")

    results = []
    type_counts = defaultdict(lambda: {"correct": 0, "total": 0})
    confusion = defaultdict(lambda: defaultdict(int))  # truth → pred → count

    for i, entry in enumerate(audios, 1):
        path = entry["path"]
        expected = entry["expected_type"]
        if not Path(path).exists():
            print(f"[{i:2d}] {entry['id']:35s} | path missing: {path}")
            continue

        print(f"[{i:2d}] {entry['id']:35s} | classifying...", end=" ", flush=True)
        result = classify_audio(path)
        predicted = result["type"]
        confidence = result["confidence"]
        correct = predicted == expected
        ok = "✓" if correct else "✗"
        print(f"{ok} expected={expected} got={predicted} (conf={confidence:.2f})")
        print(f"     features: speech_ratio={result['features']['speech_ratio']:.2f}, "
              f"speakers={result['features']['speaker_estimate']}, "
              f"music_dom={result['features']['music_dominance']:.2f}, "
              f"avg_utt={result['features']['avg_utterance_s']:.2f}s, "
              f"burst={result['features']['energy_burstiness']:.2f}, "
              f"bpm={result['features']['tempo_bpm']:.0f}")
        print(f"     reasoning: {result['reasoning']}")
        print()

        type_counts[expected]["total"] += 1
        if correct:
            type_counts[expected]["correct"] += 1
        confusion[expected][predicted] += 1

        results.append({
            "id": entry["id"],
            "expected": expected,
            "predicted": predicted,
            "confidence": confidence,
            "correct": correct,
            "reasoning": result["reasoning"],
            "features": result["features"],
        })

    # ── Summary ────────────────────────────────────────────────────────────
    total = len(results)
    correct_n = sum(1 for r in results if r["correct"])
    accuracy = correct_n / total if total > 0 else 0.0

    print(f"\n{'='*90}")
    print(f" RESULTS")
    print(f"{'='*90}")
    print(f"\n  Overall accuracy: {correct_n}/{total} = {accuracy*100:.0f}%\n")

    print(f"  Per-type accuracy:")
    for type_id in sorted(TYPE_PROFILES.keys()):
        c = type_counts[type_id]
        if c["total"] == 0:
            print(f"    {type_id} ({TYPE_PROFILES[type_id]['label']:30s}): no test samples")
        else:
            pct = c["correct"] / c["total"] * 100
            print(f"    {type_id} ({TYPE_PROFILES[type_id]['label']:30s}): {c['correct']}/{c['total']} = {pct:.0f}%")

    print(f"\n  Confusion matrix (rows=truth, cols=pred):")
    types_seen = sorted(set(list(confusion.keys()) + [p for d in confusion.values() for p in d.keys()]))
    print(f"           {' '.join(f'{t:>4}' for t in types_seen)}")
    for truth in sorted(confusion.keys()):
        row = ' '.join(f"{confusion[truth].get(p, 0):>4}" for p in types_seen)
        print(f"    {truth:6s} {row}")

    # Save
    out_path = Path(__file__).parent / "validation_results.json"
    out_path.write_text(json.dumps({
        "total": total, "correct": correct_n, "accuracy": accuracy,
        "per_type": {k: dict(v) for k, v in type_counts.items()},
        "results": results,
    }, indent=2))
    print(f"\n  Full results: {out_path}")

if __name__ == "__main__":
    main()

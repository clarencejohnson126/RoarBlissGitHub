"""
Regression test for the ORIGINAL-CANVAS rebuild (founder's model: kept regions = bit-identical original
full mix; replaced slots = accomp stem + constant bleed comp + clone). No GPU, no TTS, no demucs — it
exercises the REAL pure helpers (_bleed_comp_db, _rebuild_slot) from auto_synthesizer on synthetic audio
and asserts the three invariants the founder cares about:

    1. ZERO drift              — len(out) == len(canvas)
    2. kept regions identical  — kept interior samples == original full mix (the "bit-identical" promise)
    3. no music wobble         — the <200Hz music level at a replaced slot matches the kept regions

The helpers are loaded by extracting ONLY their two FunctionDef nodes (so the module's heavy top-level
imports — whisper, torch, the planner — never run). That means we test the shipping code, not a copy.

Run:  python eval/test_canvas_rebuild.py
"""
import ast
import os
import sys
import tempfile

from pydub import AudioSegment
from pydub.generators import Sine

HERE = os.path.dirname(os.path.abspath(__file__))
ASYNTH = os.path.join(HERE, "..", "poc", "orchestrator", "auto_synthesizer.py")
sys.path.insert(0, HERE)  # for metrics


def _load_helpers():
    """Extract just the two pure functions from the shipping file, skipping its heavy module imports."""
    tree = ast.parse(open(ASYNTH).read())
    wanted = {"_bleed_comp_db", "_rebuild_slot"}
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted]
    assert len(nodes) == len(wanted), f"missing helpers: {wanted - {n.name for n in nodes}}"
    ns = {"AudioSegment": AudioSegment, "float": float}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), ASYNTH, "exec"), ns)
    return ns["_bleed_comp_db"], ns["_rebuild_slot"]


def _band_db(seg, lo_ms, hi_ms, cutoff=200):
    """<cutoff Hz level of a window — the exact band the wobble metric measures (music carries, speech ~not)."""
    return seg[lo_ms:hi_ms].low_pass_filter(cutoff).dBFS


def main():
    bleed_comp_db, rebuild_slot = _load_helpers()
    rate, chans = 44100, 2
    DUR = 10_000

    # Synthetic source: a steady 100Hz MUSIC bed (in-band) for the whole track, with 1kHz VOICE only in
    # the slot regions. full_mix = music + voice. accomp = music -3dB (simulates demucs stealing 3dB of
    # music into the discarded vocal stem) -> the rebuild must comp that back so the slot doesn't drop.
    music = Sine(100, sample_rate=rate).to_audio_segment(duration=DUR).apply_gain(-18.0).set_channels(chans)
    slots = [(2000, 3000), (6000, 7200)]
    voice = AudioSegment.silent(duration=DUR, frame_rate=rate).set_channels(chans)
    for s, e in slots:
        v = Sine(1000, sample_rate=rate).to_audio_segment(duration=e - s).apply_gain(-10.0).set_channels(chans)
        voice = voice.overlay(v, position=s)
    full_mix = music.overlay(voice)
    accomp = music.apply_gain(-3.0)  # the bleed deficit

    comp = bleed_comp_db(full_mix, accomp)
    print(f"bleed comp measured: {comp:+.2f}dB (expected ~+3.0)")

    # Run the real rebuild for each slot, clone = an 800Hz tone (out of the <200Hz band) sized to the slot.
    canvas = full_mix
    for s, e in slots:
        slot_ms = e - s
        clone = Sine(800, sample_rate=rate).to_audio_segment(duration=slot_ms).apply_gain(-10.0).set_channels(chans)
        canvas = rebuild_slot(canvas, accomp, s, slot_ms, clone, comp, rate, chans)

    fails = []

    # 1) ZERO drift
    if len(canvas) != len(full_mix):
        fails.append(f"drift: len {len(canvas)} != {len(full_mix)}")

    # 2) kept interior bit-identical. [4000,5000] sits between the slots, clear of every wipe span
    #    ([1800,3200] and [5800,7400]) and its seam fades.
    a = canvas[4000:5000].raw_data
    b = full_mix[4000:5000].raw_data
    if a != b:
        diff = sum(1 for x, y in zip(a, b) if x != y)
        fails.append(f"kept interior NOT bit-identical ({diff}/{len(b)} bytes differ)")

    # 3) no music wobble: <200Hz level at a slot interior vs a kept interior must match within 2dB.
    kept_db = _band_db(canvas, 4200, 4800)
    slot1_db = _band_db(canvas, 2200, 2800)
    slot2_db = _band_db(canvas, 6200, 6800)
    print(f"music band <200Hz — kept {kept_db:.2f}dB | slot1 {slot1_db:.2f}dB | slot2 {slot2_db:.2f}dB")
    for tag, db in (("slot1", slot1_db), ("slot2", slot2_db)):
        if abs(db - kept_db) > 2.0:
            fails.append(f"music wobble at {tag}: {db:.2f}dB vs kept {kept_db:.2f}dB (>2dB drop)")

    # 3b) tie it to the SHIPPING wobble metric: export and check music sigma is flat (no rollercoaster).
    try:
        from metrics import music_band_stats
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
            canvas.export(tf.name, format="wav")
            mb = music_band_stats(tf.name)
        os.unlink(tf.name)
        if mb:
            print(f"metric music_band_stats: mean {mb['mean']:.2f}dB sigma {mb['sigma']:.2f}")
            if mb["sigma"] > 2.0:
                fails.append(f"music sigma {mb['sigma']:.2f} > 2.0 (wobble)")
    except Exception as ex:
        print(f"(metric sigma check skipped: {ex})")

    # Control: WITHOUT comp the SAME slot drops ~3dB vs WITH comp — proves the test can detect a real wobble
    # (and that the comp is what closes it). Compare the identical slot window, comp vs no-comp.
    canvas_nocomp = full_mix
    for s, e in slots:
        slot_ms = e - s
        clone = Sine(800, sample_rate=rate).to_audio_segment(duration=slot_ms).apply_gain(-10.0).set_channels(chans)
        canvas_nocomp = rebuild_slot(canvas_nocomp, accomp, s, slot_ms, clone, 0.0, rate, chans)
    lift = _band_db(canvas, 2200, 2800) - _band_db(canvas_nocomp, 2200, 2800)
    print(f"control: comp lifts the slot music by {lift:.2f}dB (no-comp slot would drop that much)")
    if lift < 1.5:
        fails.append(f"control weak: comp only lifted {lift:.2f}dB — test wouldn't catch a real wobble")

    print("=" * 60)
    if fails:
        print("FAIL ✗")
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("PASS ✓  — zero drift, kept bit-identical, no slot wobble")


if __name__ == "__main__":
    main()

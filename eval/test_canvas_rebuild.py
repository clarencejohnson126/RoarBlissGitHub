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
from pydub.silence import detect_leading_silence, detect_silence

HERE = os.path.dirname(os.path.abspath(__file__))
ASYNTH = os.path.join(HERE, "..", "poc", "orchestrator", "auto_synthesizer.py")
sys.path.insert(0, HERE)  # for metrics


def _load_helpers():
    """Extract the pure functions from the shipping file, skipping its heavy module imports (whisper, …)."""
    tree = ast.parse(open(ASYNTH).read())
    wanted = {"trim_silence", "_bleed_comp_db", "_rebuild_slot", "_assemble_no_music", "_detect_music_bed"}
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted]
    assert len(nodes) == len(wanted), f"missing helpers: {wanted - {n.name for n in nodes}}"
    ns = {"AudioSegment": AudioSegment, "float": float, "detect_leading_silence": detect_leading_silence}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), ASYNTH, "exec"), ns)
    return ns


def _band_db(seg, lo_ms, hi_ms, cutoff=200):
    """<cutoff Hz level of a window — the exact band the wobble metric measures (music carries, speech ~not)."""
    return seg[lo_ms:hi_ms].low_pass_filter(cutoff).dBFS


def test_music():
    ns = _load_helpers()
    bleed_comp_db, rebuild_slot = ns["_bleed_comp_db"], ns["_rebuild_slot"]
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

    print("[music ] " + ("FAIL ✗ " + "; ".join(fails) if fails else "PASS ✓  zero drift, kept bit-identical, no slot wobble"))
    return fails


def test_no_music():
    """Dry-speech / no-music-bed: a short clone in a long slot must NOT leave dead air. The concatenative
    assembly closes the gap. Mirrors the real corpus failure (solo_dry_speech: 9.8s of -40dB silence)."""
    ns = _load_helpers()
    assemble = ns["_assemble_no_music"]
    rate, chans = 44100, 2
    DUR = 14_000

    # Continuous dry-speech source (1kHz "voice", no music bed), 14s.
    full_mix = Sine(1000, sample_rate=rate).to_audio_segment(duration=DUR).apply_gain(-12.0).set_channels(chans)
    # One BIG slot [2s..12s] (10s) but only a 1s clone — the exact dead-air trap. fitted is slot-padded
    # like the real loop produces: lead silence + 1s clone + trailing silence out to the full 10s slot.
    s_ms, slot_ms = 2000, 10000
    clone = Sine(800, sample_rate=rate).to_audio_segment(duration=1000).apply_gain(-12.0).set_channels(chans)
    fitted = AudioSegment.silent(duration=80, frame_rate=rate).set_channels(chans) + clone
    fitted = fitted + AudioSegment.silent(duration=slot_ms - len(fitted), frame_rate=rate).set_channels(chans)

    out = assemble(full_mix, [(s_ms, slot_ms, fitted)], rate, chans, gap_ms=300)
    fails = []

    # 1) gaps CLOSED: output is much shorter than the window (≈ 2000 kept + 1000 clone + 300 gap + 2000 tail).
    if len(out) >= DUR - 1000:
        fails.append(f"timeline not compressed: out {len(out)}ms vs window {DUR}ms (dead air not closed)")

    # 2) NO long dead air: the slot-padded `fitted` HAS a ~9s silence (the trap); the assembled output must NOT.
    trap = detect_silence(fitted, min_silence_len=600, silence_thresh=-45)
    trap_max = max((b - a for a, b in trap), default=0)
    holes = detect_silence(out, min_silence_len=600, silence_thresh=-45)
    hole_max = max((b - a for a, b in holes), default=0)
    print(f"[no-mus] dead air: trap(padded fitted)={trap_max}ms → assembled output longest hole={hole_max}ms")
    if trap_max < 5000:
        fails.append(f"control weak: trap only {trap_max}ms — test wouldn't catch real dead air")
    if hole_max >= 600:
        fails.append(f"dead air NOT closed: {hole_max}ms silent hole remains in the output")

    # 3) retained original kept verbatim (frame-exact) away from the join.
    if out[200:1700].raw_data != full_mix[200:1700].raw_data:
        fails.append("retained original chunk not bit-identical")

    print("[no-mus] " + ("FAIL ✗ " + "; ".join(fails) if fails else "PASS ✓  gaps closed, no dead air, retained verbatim"))
    return fails


def test_dropout_calibration():
    """Lock the source-aware dropout gate so the dangerous false-pass can NEVER return: real DEAD AIR over a
    talking source must FAIL; an output that merely MIRRORS a soft source passage must PASS. Uses the real
    metric on synthetic files."""
    import tempfile
    from metrics import score
    rate, chans = 44100, 2
    voice = Sine(200, sample_rate=rate).to_audio_segment(duration=20_000).apply_gain(-16.0).set_channels(chans)
    src = voice[:16_000] + voice[16_000:].apply_gain(-16.0)        # last 4s = soft outro (-32dBFS)
    bad = src[:4_000] + AudioSegment.silent(duration=9_000, frame_rate=rate).set_channels(chans) + src[13_000:]
    good = src                                                     # identical → soft outro mirrored, no cut
    fails = []
    with tempfile.TemporaryDirectory() as d:
        sp = f"{d}/src.wav"; src.export(sp, format="wav")
        for name, seg, want_pass in [("dead-air", bad, False), ("mirror-quiet", good, True)]:
            p = f"{d}/{name}.wav"; seg.export(p, format="wav")
            c = score(p, context={"source_audio": sp, "has_music_bed": False})
            ok_drops = "no_dropouts" not in c.failures()
            m = c.measured
            print(f"[drop-cal] {name:12s} no_dropouts={'PASS' if ok_drops else 'FAIL'} "
                  f"(real={m.get('real_dropouts')} longest={m.get('real_dropout_max_ms')}ms)  want_pass={want_pass}")
            if ok_drops != want_pass:
                fails.append(f"{name}: no_dropouts {'passed' if ok_drops else 'failed'} but wanted {'pass' if want_pass else 'fail'}")
    print("[drop-cal] " + ("FAIL ✗ " + "; ".join(fails) if fails else "PASS ✓  dead air fails, mirrored-quiet passes"))
    return fails


def test_music_bed_detection():
    """Lock the music-bed detector against the REAL measured cog stems (accomp dB, vocals dB). These are the
    values that fooled the first threshold — if anyone loosens it, this fails."""
    detect = _load_helpers()["_detect_music_bed"]
    cases = [  # (name, accomp_dB, vocals_dB, expect_music_bed)
        # The founder's own recordings carry a FAINT but audible bed (~-23dB) — they are MUSIC, not dry.
        # Routing them to the no-music path dropped that bed under speech (the wobble he heard).
        ("clarence_full faint-music", -23.1, -17.1, True),
        ("solo_dry faint-music", -23.8, -19.7, True),
        ("cinematic MUSIC", -17.4, -21.8, True),     # bed LOUDER than the voice
        ("speech_over_music MUSIC", -17.2, -13.4, True),
        ("silent accomp", float("-inf"), -18.0, False),
        ("genuine dry voice memo", -48.0, -16.0, False),  # only demucs residual → no bed → close gaps
        ("quiet music bed", -30.0, -31.0, True),
    ]
    fails = []
    for name, a, v, want in cases:
        got = detect(a, v)
        if got != want:
            fails.append(f"{name}: got music_bed={got}, want {want}")
    print("[bed-det] " + ("FAIL ✗ " + "; ".join(fails) if fails else "PASS ✓  dry vs music separated on real values"))
    return fails


def main():
    fails = test_music() + test_no_music() + test_dropout_calibration() + test_music_bed_detection()
    print("=" * 60)
    if fails:
        print("OVERALL FAIL ✗")
        sys.exit(1)
    print("OVERALL PASS ✓")


if __name__ == "__main__":
    main()

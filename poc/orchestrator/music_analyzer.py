"""
Roar Bliss — MUSIC ANALYZER (Constitution §2.8: music-aware script & delivery).

The pipeline used to write a script BLIND to the music and lay the lines back-to-back ("ohne Punkt und
Komma"). This module turns the BED into a "music map" the planner + TTS condition on: tempo, beat grid,
the dynamic highs & lows (sections: intro / build / climax / outro), a brightness/style proxy, and a
per-section DELIVERY HINT (how fast to speak, how intense, where pauses belong).

librosa-only (already in the cog). `analyze_music(path) -> dict` is the integration point; the CLI prints
a human-readable map. No GPU.
"""
from __future__ import annotations
import sys, json
import numpy as np

SR = 22050          # analysis rate — tempo/energy/structure don't need 44.1k (faster)
HOP = 512


def _sections_from_energy(t: np.ndarray, e01: np.ndarray, min_len_s: float = 5.0) -> list:
    """Segment the normalized 0..1 energy curve into runs of the same band (quiet/mid/loud), merging
    runs shorter than min_len_s into their neighbour. Returns [(start_s, end_s, mean_energy, band)]."""
    def band(v): return "loud" if v > 0.62 else ("quiet" if v < 0.33 else "mid")
    bands = np.array([band(v) for v in e01])
    segs = []
    i = 0
    while i < len(bands):
        j = i
        while j < len(bands) and bands[j] == bands[i]:
            j += 1
        segs.append([t[i], t[min(j, len(t) - 1)], float(e01[i:j].mean()), bands[i]])
        i = j
    # merge too-short segments into the louder/longer neighbour so we get musical sections, not flicker
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for k in range(len(segs)):
            if segs[k][1] - segs[k][0] < min_len_s:
                nb = k - 1 if k > 0 else k + 1
                if k < len(segs) - 1 and (k == 0 or segs[k + 1][1] - segs[k + 1][0] >= segs[k - 1][1] - segs[k - 1][0]):
                    nb = k + 1
                lo = min(segs[k][0], segs[nb][0]); hi = max(segs[k][1], segs[nb][1])
                segs[nb] = [lo, hi, (segs[k][2] + segs[nb][2]) / 2, segs[nb][3]]
                del segs[k]; changed = True; break
    return segs


def _label_and_hint(segs: list, climax_s: float) -> list:
    """Add a structural label (intro/build/climax/resolve/outro) + a DELIVERY HINT per section."""
    out = []
    n = len(segs)
    for idx, (s, eN, en, bd) in enumerate([(a[0], a[1], a[2], a[3]) for a in segs]):
        # band MUST agree with the section's own mean energy (the merge step can inherit a neighbour's
        # band → a contradictory "quiet climax"). Re-derive it here so labels + hints are consistent.
        bd = "loud" if en > 0.62 else ("quiet" if en < 0.33 else "mid")
        contains_climax = s <= climax_s <= eN
        if contains_climax and en > 0.5:
            label = "climax"
        elif idx == 0:
            label = "intro"
        elif idx == n - 1:
            label = "outro"
        elif climax_s and s < climax_s and en >= segs[idx - 1][2]:
            label = "build"
        else:
            label = "resolve" if (climax_s and s > climax_s) else ("verse" if bd == "mid" else bd)
        # delivery hint: pace + tone + whether to land a big line here
        if bd == "quiet":
            pace, tone = "slow / deliberate, generous pauses", "calm, intimate, reflective"
        elif bd == "loud":
            pace, tone = "urgent / punchy, short lines", "intense, triumphant, on the beat"
        else:
            pace, tone = "steady, natural pace", "building, forward-leaning"
        out.append({
            "start_s": round(s, 1), "end_s": round(eN, 1), "dur_s": round(eN - s, 1),
            "energy": round(en, 2), "band": bd, "label": label,
            "land_big_line": label == "climax",
            "delivery": {"pace": pace, "tone": tone},
        })
    return out


def analyze_music(path: str, sr: int = SR) -> dict:
    import librosa
    from scipy.ndimage import uniform_filter1d
    y, sr = librosa.load(path, sr=sr, mono=True)
    dur = float(len(y) / sr)

    # 1) TEMPO + beat grid
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP)
    bpm = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=HOP).tolist()

    # 2) ENERGY envelope (the highs & lows over time) — RMS, smoothed ~1.5s
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=HOP)
    rms_s = uniform_filter1d(rms, max(1, int(1.5 * sr / HOP)))
    e01 = (rms_s - rms_s.min()) / (rms_s.max() - rms_s.min() + 1e-9)
    climax_s = float(t[int(np.argmax(rms_s))])

    # 3) BRIGHTNESS / style proxy (dark/warm vs bright)
    cen = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    brightness = "bright" if cen > 2600 else ("dark / warm" if cen < 1500 else "balanced")
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    onset_density = float(np.mean(onset_env))

    # 4) SECTIONS (intro/build/climax/outro) + per-section delivery hints
    sections = _label_and_hint(_sections_from_energy(t, e01), climax_s)

    return {
        "duration_s": round(dur, 1),
        "bpm": round(bpm, 1),
        "beat_interval_s": round(60.0 / bpm, 2) if bpm else None,
        "beats": len(beat_times),
        "brightness": brightness, "spectral_centroid_hz": round(cen),
        "onset_density": round(onset_density, 2),
        "climax_s": round(climax_s, 1),
        "sections": sections,
        # the one-paragraph brief the planner conditions on (Constitution §2.8/§2.9)
        "script_brief": (
            f"~{round(bpm)} BPM, {brightness}. The voice must FILL all {round(dur)}s. "
            "Open in the intro, build through the rising sections, LAND the name/vow on the climax "
            f"at ~{round(climax_s)}s, resolve in the outro. Match pace+pauses to each section below; "
            "never a wall of speech."),
    }


def _pretty(m: dict) -> str:
    lines = [
        f"  duration : {m['duration_s']}s   tempo : {m['bpm']} BPM (beat every {m['beat_interval_s']}s)",
        f"  character: {m['brightness']} (centroid {m['spectral_centroid_hz']}Hz)  onset-density {m['onset_density']}",
        f"  climax   : ~{m['climax_s']}s",
        "  sections (the timeline the script must follow):",
    ]
    for s in m["sections"]:
        big = "  <-- LAND THE BIG LINE HERE" if s["land_big_line"] else ""
        lines.append(f"    {s['start_s']:>6.1f}-{s['end_s']:<6.1f}s [{s['label']:>7}|{s['band']:>5}|e={s['energy']:.2f}] "
                     f"{s['delivery']['pace']} | {s['delivery']['tone']}{big}")
    lines.append("  script_brief: " + m["script_brief"])
    return "\n".join(lines)


if __name__ == "__main__":
    p = sys.argv[1]
    m = analyze_music(p)
    print(f"\n=== MUSIC MAP: {p.split('/')[-1]} ===")
    print(_pretty(m))
    if "--json" in sys.argv:
        print("\n" + json.dumps(m, indent=2))

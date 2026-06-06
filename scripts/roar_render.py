#!/usr/bin/env python3
"""
Roar Bliss — cinematic narration renderer (generic engine).

Final assembly STAGE of the pipeline: given ANY instrumental and ANY ordered list
of narration lines, synthesize each line (ElevenLabs), lay them onto the music with
breathing room between sentences, duck the music under the voice, master, and write
an MP3.

No content lives here. The speaker voice, the lines, the language and the pacing are
all INPUTS. Upstream, the orchestrator turns a user's uploaded instrumental + their
story into `lines` and selects a `voice_id`; this file stays content-agnostic and is
reused for every motivational MP3 a user generates in production.

Use as a library:
    from roar_render import render, RECIPE
    render("instrumental.mp3", ["line one", "line two", ...], "out.mp3", voice_id="...")

Use from the CLI (drives a job file, so nothing is hardcoded):
    export ELEVENLABS_API_KEY=sk_...
    python roar_render.py INSTRUMENTAL OUT.mp3 JOB.json
  JOB.json = {"voice_id": "...", "lines": ["...", ...], "recipe": {<overrides>}}
  `lines` may be plain strings (auto-flow) or [text, anchor_seconds] pairs to pin a
  line to a musical moment (e.g. land a climax word on a detected peak).
  See scripts/sample_job.json for a worked example.
"""
import os, sys, json, subprocess, wave, tempfile, requests, imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()

# ── The proven recipe (the approved "money shot"). Content-agnostic; the few knobs a
#    user/app would touch live here and can be overridden per job via JOB["recipe"]. ──
RECIPE = {
    "model_id": "eleven_multilingual_v2",
    # Higher stability tames a cloned voice's stray breaths / "uhh"; style keeps emotion.
    "voice_settings": {"stability": 0.55, "similarity_boost": 0.85,
                       "style": 0.55, "use_speaker_boost": True},
    "lead_in":   5.0,    # seconds before the first line enters (lets the music open)
    "gap":       2.5,    # breathing pause between sentences (music swells back up here)
    "tempo":     0.94,   # <1 = slower, more deliberate, cinematic delivery
    "voice_vol": 2.2,    # voice gain before the mix
    "music_vol": 0.62,   # music bed level — deliberately under the voice
    "duck":      "threshold=0.04:ratio=6:attack=5:release=300",  # music ducks under voice
    "limit":     0.97,   # final brickwall limiter ceiling
    "bitrate":   "320k",
}


def _synth(text, mp3_path, voice_id, recipe, api):
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        headers={"xi-api-key": api, "Content-Type": "application/json"},
        json={"text": text, "model_id": recipe["model_id"],
              "voice_settings": recipe["voice_settings"]}, timeout=180)
    r.raise_for_status()
    open(mp3_path, "wb").write(r.content)


def _prep(mp3_path, wav_path, recipe):
    # Trim ONLY the leading silence (so each line starts on time) but keep the natural
    # tail (never chop a word's decay -> no hard "cut off"). Slow for a deliberate pace.
    # Do NOT add a noise gate here: a gate chops quiet speech and makes the voice "gasp".
    af = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:detection=peak,"
          f"atempo={recipe['tempo']}")
    subprocess.run([FF, "-y", "-i", mp3_path, "-af", af, "-ar", "44100", "-ac", "2", wav_path],
                   capture_output=True, check=True)


def _dur(wav_path):
    with wave.open(wav_path) as w:
        return w.getnframes() / w.getframerate()


def _vchain(i, st, d, recipe):
    ms = int(st * 1000); fo = max(0.0, d - 0.30)
    # Cinematic VO chain: body(200Hz) + warmth(bass) + presence(2.8k) + air(9k), gentle
    # compression, soft fades. No gate, no reverb — clean and natural.
    return (f"[{i+1}:a]aresample=44100,aformat=channel_layouts=stereo,"
            f"highpass=f=75,"
            f"equalizer=f=200:width_type=q:w=0.9:g=2,bass=g=2:f=150,"
            f"equalizer=f=2800:width_type=q:w=1.2:g=4,treble=g=2.5:f=9000,"
            f"acompressor=threshold=-20dB:ratio=3:attack=10:release=200:makeup=3,"
            f"volume={recipe['voice_vol']},afade=t=in:st=0:d=0.12,afade=t=out:st={fo:.2f}:d=0.30,"
            f"adelay={ms}|{ms}[v{i}]")


def _normalize_lines(lines, lead_in):
    # Accept ["text", ...] (auto-flow) or [["text", anchor], ...] (pinned). Only the
    # first auto-flow line is pinned, to the lead-in; the rest fall in naturally.
    out = []
    for i, item in enumerate(lines):
        if isinstance(item, (list, tuple)):
            out.append((item[0], float(item[1])))
        else:
            out.append((item, lead_in if i == 0 else 0.0))
    return out


def render(instrumental, lines, out_path, voice_id, recipe=None, api_key=None):
    """Render `lines` (spoken by `voice_id`) over `instrumental` -> out_path. Returns out_path."""
    recipe = {**RECIPE, **(recipe or {})}
    api = api_key or os.environ["ELEVENLABS_API_KEY"]
    segs = _normalize_lines(lines, recipe["lead_in"])

    tmp = tempfile.mkdtemp()
    starts, prev_end = [], 0.0
    for i, (text, anchor) in enumerate(segs):
        raw = os.path.join(tmp, f"raw_{i}.mp3"); wav = os.path.join(tmp, f"seg_{i}.wav")
        print(f"-> ElevenLabs seg{i}…")
        _synth(text, raw, voice_id, recipe, api); _prep(raw, wav, recipe); d = _dur(wav)
        st = max(anchor, prev_end + recipe["gap"]); prev_end = st + d
        starts.append((i, wav, st, d))
        print(f"   seg{i}: {st:5.1f}s -> {st + d:5.1f}s")

    parts = [_vchain(i, st, d, recipe) for (i, _, st, d) in starts]
    # One voice bus (segments don't overlap, so amix just lays them on the timeline),
    # split: one copy into the final mix, one to drive the music ducking.
    parts.append("".join(f"[v{i}]" for i, _, _, _ in starts)
                 + f"amix=inputs={len(starts)}:duration=longest:normalize=0,asplit=2[vox][voxsc]")
    # Music: a lower bed, ducked under the voice so every word is clear; the music
    # springs straight back to full in the gaps between sentences.
    parts.append(f"[0:a]aresample=44100,aformat=channel_layouts=stereo,volume={recipe['music_vol']}[mus]")
    parts.append(f"[mus][voxsc]sidechaincompress={recipe['duck']}[musd]")
    parts.append("[vox][musd]amix=inputs=2:duration=longest:normalize=0[mx]")
    parts.append(f"[mx]alimiter=limit={recipe['limit']}[out]")

    cmd = [FF, "-y", "-i", instrumental] + sum((["-i", w] for _, w, _, _ in starts), [])
    cmd += ["-filter_complex", ";".join(parts), "-map", "[out]",
            "-c:a", "libmp3lame", "-b:a", recipe["bitrate"], out_path]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode()[-800:])
    print("MIX OK -> " + out_path)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit("usage: roar_render.py INSTRUMENTAL OUT.mp3 JOB.json\n"
                 '  JOB.json = {"voice_id": "...", "lines": [...], "recipe": {...}}\n'
                 "  example: scripts/sample_job.json")
    inst, out, job_path = sys.argv[1], sys.argv[2], sys.argv[3]
    job = json.load(open(job_path))
    render(inst, job["lines"], out, job["voice_id"], recipe=job.get("recipe"))

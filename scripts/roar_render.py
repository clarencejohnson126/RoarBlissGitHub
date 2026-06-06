#!/usr/bin/env python3
"""
Roar Bliss — ElevenLabs render, music-matched.

Synthesizes each line with ElevenLabs, lays the lines onto the instrumental so the
beats land on the music (the resolve on the ~45s drop, the climax line on the ~111s
peak, "Now... build" on the fade), keeps the music full + constant, and masters it.

Run where ELEVENLABS_API_KEY is set and the network is open (a fresh Claude Code web
session with api.elevenlabs.io allow-listed, your machine, or a server):

    pip install requests imageio-ffmpeg
    export ELEVENLABS_API_KEY=sk_...           # a FRESH, rotated key
    python roar_render.py /path/to/instrumental.mp3 out.mp3 [VOICE_ID]

Pick a deep / gravelly "old warrior" voice_id from your ElevenLabs Voice Library and
pass it as the 3rd arg (or set DEFAULT_VOICE below). "Daniel" (deep British) is a
solid default; for an aged, weathered tone choose a character voice from the library.
"""
import os, sys, subprocess, wave, tempfile, requests, imageio_ffmpeg

API = os.environ["ELEVENLABS_API_KEY"]
INST = sys.argv[1] if len(sys.argv) > 1 else "instrumental.mp3"
OUT  = sys.argv[2] if len(sys.argv) > 2 else "RoarBliss_out.mp3"
DEFAULT_VOICE = "TCuusGciH6HRSOGrYg31"    # "GoT-Jon" (Jon Snow clone) — Clarence's chosen warrior voice
VOICE_ID = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_VOICE
FF = imageio_ffmpeg.get_ffmpeg_exe()

# (line, earliest start in seconds). Only the first line is pinned; the rest have
# anchor 0 and fall naturally after the previous one with a breathing GAP between
# sentences (see `gap` below). The music swells back up in those gaps (ducking
# releases), so the breaks are dramatic, not dead air — the GoT-trailer cadence.
SEGS = [
 ("Sit down, Clarence. Let an old voice tell you the truth you already carry.", 5),
 ("Forty-three years. A good man. A worn man. You buried your fire under bills, and routine, and the weight of being needed.", 0),
 ("But ash still remembers the flame. And something in you never stopped wanting to build.", 0),
 ("Your hardest war was never against other people. It was against the man you used to be.", 0),
 ("At twenty-four, they locked a door behind you. Months alone. No distractions. No excuses.", 0),
 ("Most men break in there. You rebuilt. You read. You trained your mind. You came out sharper, calmer, wiser.", 0),
 ("For one clear moment, you met the man you could become. Then the years stole him back, and the warrior fell asleep.", 0),
 ("So wake him. Not the angry boy. The man. Twenty-four's fire, with forty-three's wisdom.", 0),
 ("Lee-an. Ella-Niece. They are not your burden. They are your reason.", 0),
 ("They will not remember your speeches. They will remember their father standing back up.", 0),
 ("So build. Not walls. Not towers. Build with your mind what your hands already understand.", 0),
 ("Thirteen years in construction, meeting the tools of tomorrow. A builder, becoming a builder again.", 0),
 ("You have buried enough versions of yourself to know which one deserves to live.", 0),
 ("You were never chasing a crown, Clarence Johnson. You were growing the shoulders to carry its weight.", 0),
 ("The world does not need the loudest man in the room. It needs the one who kept standing when no one was watching.", 0),
 ("The old chapter is ash. Now, build.", 0),
]

# Higher stability tames the cloned voice's stray breaths / "uhh" filler; style keeps emotion.
VOICE_SETTINGS = {"stability": 0.55, "similarity_boost": 0.85, "style": 0.55, "use_speaker_boost": True}

def synth(text, mp3_path):
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
        headers={"xi-api-key": API, "Content-Type": "application/json"},
        json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VOICE_SETTINGS},
        timeout=180)
    r.raise_for_status()
    open(mp3_path, "wb").write(r.content)

def prep(mp3_path, wav_path):
    # Best-practice clip prep: trim only the LEADING silence (so each line starts on
    # time) but keep the natural tail intact (never chop a word's decay -> no hard
    # "cut off"). Slow the delivery ~6% for a deliberate, cinematic pace.
    af = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:detection=peak,"
          "atempo=0.94")
    subprocess.run([FF, "-y", "-i", mp3_path, "-af", af, "-ar", "44100", "-ac", "2", wav_path],
                   capture_output=True, check=True)

def dur(wav_path):
    with wave.open(wav_path) as w:
        return w.getnframes() / w.getframerate()

tmp = tempfile.mkdtemp()
starts, prev_end, gap = [], 0.0, 2.5
for i, (text, anchor) in enumerate(SEGS):
    raw = os.path.join(tmp, f"raw_{i}.mp3"); f = os.path.join(tmp, f"seg_{i}.wav")
    print(f"-> ElevenLabs seg{i}…")
    synth(text, raw); prep(raw, f); d = dur(f)
    st = max(anchor, prev_end + gap); prev_end = st + d
    starts.append((i, f, st, d))
    print(f"   seg{i}: {st:5.1f}s -> {st+d:5.1f}s")

def vchain(i, st, d):
    ms = int(st * 1000)
    fo = max(0.0, d - 0.30)
    # Clean, natural VO chain — NO gate (a gate chops speech and makes him "gasp").
    #  highpass        — clear rumble
    #  200Hz + bass    — body / warmth (more "Stimmenklang") without muddiness
    #  2.8kHz presence — intelligibility, cuts through the music
    #  9kHz air        — open, expensive top end
    #  acompressor     — even, controlled level
    #  fades           — soft edges, no hard clip cut-offs
    return (f"[{i+1}:a]aresample=44100,aformat=channel_layouts=stereo,"
            f"highpass=f=75,"
            f"equalizer=f=200:width_type=q:w=0.9:g=2,bass=g=2:f=150,"
            f"equalizer=f=2800:width_type=q:w=1.2:g=4,treble=g=2.5:f=9000,"
            f"acompressor=threshold=-20dB:ratio=3:attack=10:release=200:makeup=3,"
            f"volume=2.2,afade=t=in:st=0:d=0.12,afade=t=out:st={fo:.2f}:d=0.30,"
            f"adelay={ms}|{ms}[v{i}]")

parts = [vchain(i, st, d) for (i, f, st, d) in starts]
# One voice bus (segments don't overlap, so amix just lays them on the timeline), split:
# one copy goes into the final mix, one drives the music ducking.
parts.append("".join(f"[v{i}]" for i,_,_,_ in starts)
             + f"amix=inputs={len(starts)}:duration=longest:normalize=0,asplit=2[vox][voxsc]")
# Music: lower the bed (Clarence: "viel zu laut") AND duck it under the voice so every
# word is clear; between lines the music springs straight back to full.
parts.append("[0:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.62[mus]")
parts.append("[mus][voxsc]sidechaincompress=threshold=0.04:ratio=6:attack=5:release=300[musd]")
parts.append("[vox][musd]amix=inputs=2:duration=longest:normalize=0[mx]")
parts.append("[mx]alimiter=limit=0.97[out]")

cmd = [FF, "-y", "-i", INST] + sum(([ "-i", f] for _, f, _, _ in starts), [])
cmd += ["-filter_complex", ";".join(parts), "-map", "[out]",
        "-c:a", "libmp3lame", "-b:a", "320k", OUT]
r = subprocess.run(cmd, capture_output=True)
print("MIX OK -> " + OUT if r.returncode == 0 else r.stderr.decode()[-500:])

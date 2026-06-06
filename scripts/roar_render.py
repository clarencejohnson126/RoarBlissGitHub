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
DEFAULT_VOICE = "onwK4e9ZLuTAKqWW03F9"   # "Daniel" deep British; swap for a warrior voice
VOICE_ID = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_VOICE
FF = imageio_ffmpeg.get_ffmpeg_exe()

# (line, earliest start in seconds — anchored to this track's musical moments)
SEGS = [
 ("Sit down, Clarence. Let a tired old voice tell you the truth.", 5),
 ("Forty-three years. A good man. A worn-out man. You buried your fire under bills and routine. But ash still remembers the flame.", 15),
 ("At twenty-four, they locked a door behind you. They thought it was a punishment. It was a forge.", 31),
 ("And you walked out harder than the world that broke you. Sharper. Quieter. Dangerous, the way calm men are.", 45),
 ("Then the years stole it back. Slowly. Comfortably. Until the warrior fell asleep inside you.", 58),
 ("So wake him. Not the angry boy. The man. Scarred, patient, and impossible to move.", 68),
 ("Lee-an. Ella-Niece. They will not remember your speeches. They will remember if their father stood back up.", 79),
 ("So build. Not walls. Not towers. Build with your mind what your hands already understand.", 91),
 ("You have buried enough versions of yourself.", 101),
 ("You were never chasing a crown, Clarence Johnson. You were growing the shoulders to carry one.", 105),
 ("Let the loud men have the room. The quiet one already owns the war.", 114),
 ("The old chapter is ash. Now... build.", 122),
]

VOICE_SETTINGS = {"stability": 0.40, "similarity_boost": 0.80, "style": 0.45, "use_speaker_boost": True}

def synth(text, mp3_path):
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
        headers={"xi-api-key": API, "Content-Type": "application/json"},
        json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VOICE_SETTINGS},
        timeout=180)
    r.raise_for_status()
    open(mp3_path, "wb").write(r.content)

def dur(mp3_path):
    wav = mp3_path + ".wav"
    subprocess.run([FF, "-y", "-i", mp3_path, "-ar", "44100", "-ac", "1", wav],
                   capture_output=True, check=True)
    with wave.open(wav) as w:
        return w.getnframes() / w.getframerate()

tmp = tempfile.mkdtemp()
starts, prev_end, gap = [], 0.0, 0.35
for i, (text, anchor) in enumerate(SEGS):
    f = os.path.join(tmp, f"seg_{i}.mp3")
    print(f"-> ElevenLabs seg{i}…")
    synth(text, f); d = dur(f)
    st = max(anchor, prev_end + gap); prev_end = st + d
    starts.append((i, f, st, d))
    print(f"   seg{i}: {st:5.1f}s -> {st+d:5.1f}s")

def vchain(i, st):
    ms = int(st * 1000)
    # Clean, warm chain — the ElevenLabs voice carries the character, so no pitch tricks.
    return (f"[{i+1}:a]aresample=44100,aformat=channel_layouts=stereo,"
            f"highpass=f=70,bass=g=2:f=160,"
            f"acompressor=threshold=-20dB:ratio=3:attack=10:release=200:makeup=2,"
            f"volume=2.0,adelay={ms}|{ms}[v{i}]")

parts = [vchain(i, st) for (i, f, st, d) in starts]
parts.append("[0:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.10[mus]")
parts.append("".join(f"[v{i}]" for i,_,_,_ in starts) + "[mus]"
             + f"amix=inputs={len(starts)+1}:duration=longest:normalize=0[mx]")
parts.append("[mx]alimiter=limit=0.97[out]")

cmd = [FF, "-y", "-i", INST] + sum(([ "-i", f] for _, f, _, _ in starts), [])
cmd += ["-filter_complex", ";".join(parts), "-map", "[out]",
        "-c:a", "libmp3lame", "-b:a", "320k", OUT]
r = subprocess.run(cmd, capture_output=True)
print("MIX OK -> " + OUT if r.returncode == 0 else r.stderr.decode()[-500:])

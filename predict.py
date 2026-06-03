"""Replicate Cog predictor — the full Roar Bliss pipeline as one pay-per-use call.

One prediction = audio + the user's story in -> a personalized MP3 out, where the user becomes
the hero of their own saga (original lines, never the source script). Heavy ML runs on the cog's
GPU; the planner calls Anthropic (Sonnet writes, Haiku does the mechanical work); TTS clones the
voice. Scale-to-zero on Replicate, so idle costs $0.
"""

import os
import sys
import subprocess
import tempfile
from pathlib import Path as _P

from cog import BasePredictor, Input, Path, Secret

# Make the orchestrator importable (it lives in poc/orchestrator).
sys.path.insert(0, str(_P(__file__).parent / "poc" / "orchestrator"))

FREE_MAX_MS = 60_000     # free tier: up to 60s
PAID_MAX_MS = 360_000    # paid tier: up to 6 min


def _context_prompt(name, location, battlefield, struggle, family, champion) -> str:
    parts = [f"My name is {name}."]
    if location:    parts.append(f"I live in {location}.")
    if battlefield: parts.append(f"Right now I'm focused on: {battlefield}.")
    if struggle:    parts.append(f"My biggest struggle: {struggle}.")
    if family:      parts.append(f"My family / inner circle: {family}.")
    if champion:    parts.append(f"I look up to {champion}.")
    return " ".join(parts)


def _duration_ms(path) -> int:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True,
        )
        return int(float(out.stdout.strip()) * 1000)
    except Exception:
        return PAID_MAX_MS


class Predictor(BasePredictor):
    def setup(self):
        # Sensible defaults; the secrets (ANTHROPIC_API_KEY / HF_TOKEN / REPLICATE_API_TOKEN)
        # come from the Replicate model's env settings.
        os.environ.setdefault("WHISPER_MODEL", "base")
        os.environ.setdefault("WRITER_MODEL", "claude-sonnet-4-6")
        os.environ.setdefault("TTS_PROVIDER", "replicate")   # v1: F5-TTS via Replicate (later: in-cog)
        os.environ.setdefault("HF_HOME", "/src/.hf")
        # Pre-warm Whisper so the weights load once and stay hot across predictions on a warm box.
        try:
            import whisper
            whisper.load_model(os.environ["WHISPER_MODEL"])
        except Exception as e:
            print("whisper warm skipped:", e)

    def _separate(self, audio: _P, workdir: _P):
        """Demucs two-stem split on the GPU (falls back to CPU if no CUDA)."""
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        out = workdir / "sep"
        subprocess.run(
            [sys.executable, "-m", "demucs", "--two-stems=vocals", "-d", device,
             "--out", str(out), str(audio)],
            check=True,
        )
        vocals = next(out.rglob("vocals.wav"))
        return vocals, vocals.parent / "no_vocals.wav"

    def _full_voice(self, vocals, accomp, audio_path, user_context, window_ms, work, min_voices=0):
        """100%-generated mode — adaptive. Diarize the source, clone EVERY distinct voice, write a
        COMPLETE new script (the listener's saga, original lines, never the source's words) and speak it
        100% in the cloned voice(s) over the source's own clean music+SFX bed. Solo source -> a one-voice
        monologue (Tate). Multi-speaker cinematic source -> a multi-voice epic that trades lines between
        the cloned characters (GoT). NO original dialogue is ever mixed in."""
        import tts
        from pydub import AudioSegment
        voc = AudioSegment.from_wav(str(vocals))

        # 1) diarize -> distinct speakers ranked by speaking time (min_voices hints pyannote so a dense
        #    multi-character montage isn't merged into too few speakers)
        speakers = self._rank_speakers(str(vocals), len(voc), min_speakers=min_voices)[:6]   # up to 6 voices
        print(f"full_voice: {len(speakers)} distinct voice(s) detected (min_voices={min_voices})")

        # 2) clone each speaker ONCE from a ~40s reference built from their own segments
        voices = []   # (speaker_id, voice_id)
        for spk, segs in speakers:
            ref = AudioSegment.silent(duration=0)
            for s, e in segs:
                if len(ref) >= 40_000:
                    break
                ref += voc[int(s * 1000):int(e * 1000)]
            if len(ref) < 2500:                       # too little clean audio → fall back to head of stem
                ref = voc[:min(len(voc), 30_000)]
            ref = ref[:40_000]
            rp = _P(work) / f"fv_ref_{spk}.wav"
            ref.export(str(rp), format="wav")
            try:
                vid = tts.elevenlabs_clone(rp, name=f"rb_fv_{spk}")
                voices.append((spk, vid))
                print(f"  cloned {spk} -> {vid[:8]}…")
            except Exception as ex:
                print(f"  clone failed for {spk}: {ex}")
        if not voices:
            raise RuntimeError("full_voice: no voice could be cloned from the source")

        try:
            # 3) write a COMPLETE new script (monologue if 1 voice, multi-voice epic if >=2)
            n = len(voices)
            lines = self._write_fullvoice_script(audio_path, user_context, n, window_ms)
            # 4) speak every line in its assigned cloned voice; build one continuous voice track
            track = AudioSegment.silent(duration=0)
            prev, spoken = None, 0
            for ln in lines:
                txt = (ln.get("text") or "").strip()
                if not txt:
                    continue
                vi = int(ln.get("voice", 0)) % n
                try:
                    seg = tts.elevenlabs_tts(txt, voices[vi][1])
                except Exception as ex:
                    print(f"  tts failed ({txt[:30]}…): {ex}"); continue
                gap = 650 if (prev is not None and vi != prev) else 300   # longer breath on a voice change
                track += AudioSegment.silent(duration=gap) + seg
                prev, spoken = vi, spoken + 1
            print(f"full_voice script: {n} voice(s), {spoken} lines, {len(track)/1000:.1f}s speech")
            if len(track) < 1000:
                raise RuntimeError("full_voice: script produced no audible speech")
            # 5) lay the generated voices over the clean music+SFX bed (lighter duck for cinematic punch)
            mixed = self._lay_over_music(track, accomp, duck_db=(8.0 if n >= 2 else 12.0))
            out = _P(work) / "fullvoice.mp3"
            mixed.export(str(out), format="mp3", bitrate="192k")
            return Path(out)
        finally:
            for _, vid in voices:
                tts.elevenlabs_delete(vid)

    def _rank_speakers(self, vocals_path, voc_len_ms, min_speakers=0):
        """Diarize the isolated vocals -> [(speaker_id, [(start_s,end_s),...]), ...] ranked by total
        speaking time. min_speakers hints pyannote (≥N clusters). Falls back to a single whole-track
        speaker if diarization is unavailable."""
        try:
            from diarization import diarize
            diar = diarize(vocals_path, verbose=True, min_speakers=min_speakers)
            by_spk = {}
            for t in diar.get("turns", []):
                by_spk.setdefault(t["speaker"], []).append((t["start"], t["end"]))
            ranked = sorted(by_spk.items(), key=lambda kv: -sum(e - s for s, e in kv[1]))
            # keep speakers with >=1.5s total (segments are concatenated into the clone ref, so several
            # short turns still add up to a usable reference — important for minor cinematic characters)
            ranked = [(s, segs) for s, segs in ranked if sum(e - st for st, e in segs) >= 1.5]
            if ranked:
                return ranked
        except Exception as e:
            print("full_voice diarize failed -> single voice:", e)
        return [("SPEAKER_00", [(0.0, min(voc_len_ms / 1000.0, 45.0))])]

    def _write_fullvoice_script(self, audio_path, user_context, n_voices, window_ms):
        """Write the bespoke script as a list of {"voice": int, "text": str}. One voice -> a continuous
        monologue; multiple voices -> an epic trailer that trades lines between them. Original lines only;
        the source words are used only to echo cadence, never reproduced."""
        from llm import llm_chat
        style = ""
        try:
            import whisper
            style = whisper.load_model(os.environ.get("WHISPER_MODEL", "base")).transcribe(
                audio_path).get("text", "")[:1200]
        except Exception as e:
            print("style transcribe skipped:", e)
        model = os.environ.get("WRITER_MODEL", "claude-sonnet-4-6")
        if n_voices <= 1:
            target_words = max(150, int(window_ms / 1000.0 / 60.0 * 205))
            sysmsg = ("You write a single, continuous, first-person motivational monologue the listener "
                      "could record as their own. Echo the cadence and intensity of the STYLE sample, but "
                      "write ORIGINAL lines about the listener's real life — never reuse the sample's words. "
                      "Output STRICT JSON ONLY: a list of {\"voice\":0,\"text\":\"...\"} objects, in order. "
                      "No prose, no markdown.")
            usr = (f"STYLE (echo delivery, do NOT reuse words):\n\"\"\"\n{style}\n\"\"\"\n\nLISTENER:\n{user_context}\n\n"
                   f"Write ~{target_words} words total, broken into natural spoken lines, building to one "
                   f"decisive final line. JSON only.")
        else:
            target_words = max(140, int(window_ms / 1000.0 / 60.0 * 165))   # epic pace runs a touch slower
            sysmsg = (f"You script a cinematic, multi-voice EPIC TRAILER — the listener's life told as a "
                      f"mythic saga. You have {n_voices} distinct VOICES, numbered 0..{n_voices - 1}. Write "
                      "ORIGINAL lines ONLY — never quote any film, show, or song. Distribute the lines across "
                      "the voices like a real trailer: voices alternate, one proclaims and another answers, "
                      "tension builds to a release. Each line short and punchy (3-14 words). Use the listener's "
                      "name and real details, framed as an epic (houses, oaths, fire, legacy, the long road) "
                      "but about THEIR real life. Build to one decisive final line. Output STRICT JSON ONLY: "
                      "[{\"voice\":int,\"text\":str}, ...]. No prose, no markdown.")
            usr = (f"STYLE/cadence to echo (do NOT reuse words):\n\"\"\"\n{style}\n\"\"\"\n\nLISTENER:\n{user_context}\n\n"
                   f"Write ~{target_words} words total across {n_voices} voices as a seamless, building epic. JSON only.")
        raw = llm_chat(sysmsg, usr, max_tokens=2000, temperature=0.75, model=model).strip()
        return self._parse_script_json(raw, n_voices, user_context)

    def _parse_script_json(self, raw, n_voices, user_context):
        """Robustly parse the model's JSON line list; fall back to splitting prose across voices."""
        import json as _json, re as _re
        txt = raw.strip()
        if txt.startswith("```"):
            txt = _re.sub(r"^```[a-zA-Z]*\n?", "", txt)
            txt = _re.sub(r"\n?```$", "", txt).strip()
        m = _re.search(r"\[.*\]", txt, _re.S)
        if m:
            try:
                arr = _json.loads(m.group(0))
                out = [{"voice": int(o.get("voice", 0)), "text": str(o.get("text", "")).strip()}
                       for o in arr if isinstance(o, dict) and str(o.get("text", "")).strip()]
                if out:
                    return out
            except Exception as e:
                print("script JSON parse failed, falling back:", e)
        sents = [s.strip() for s in _re.split(r"(?<=[.!?])\s+", _re.sub(r"[\[\]{}\"]", " ", txt)) if s.strip()]
        if not sents:
            sents = [f"{user_context.split('.')[0]}.", "This is my reckoning.", "I rise now."]
        return [{"voice": i % n_voices, "text": s} for i, s in enumerate(sents)]

    def _lay_over_music(self, voice, accomp, duck_db=12.0):
        """Place the generated voice over the isolated instrumental stem: short musical intro, then the
        voice enters; the bed is level-locked ~duck_db under the voice (never boosted into noise) and
        fades out on a tail. A multi-voice epic uses a lighter duck so the cinematic music keeps its punch.
        If the source had basically no music, the voice is returned dry."""
        from pydub import AudioSegment
        intro_ms, tail_ms = 2500, 3000
        try:
            music = AudioSegment.from_file(str(accomp))
        except Exception as e:
            print("music bed skipped (no accomp):", e); return voice
        if music.dBFS < -40:          # source had no real music bed → keep the voice dry
            print("music bed skipped (stem effectively silent)"); return voice
        total = intro_ms + len(voice) + tail_ms
        if len(music) < total:        # loop the stem if it's shorter than the voice
            music = music * (total // max(1, len(music)) + 1)
        music = music[:total]
        gain = min(voice.dBFS - duck_db - music.dBFS, 6.0)   # duck loud beds fully; boost quiet ones ≤ +6 dB
        music = (music + gain).fade_in(1500).fade_out(tail_ms)
        return music.overlay(voice, position=intro_ms)

    def predict(
        self,
        audio: Path = Input(description="The motivational / cinematic audio to personalize"),
        name: str = Input(default="Warrior", description="The user's full name (e.g. 'Clarence Johnson')"),
        battlefield: str = Input(default="", description="What they are building / fighting for"),
        struggle: str = Input(default="", description="Their real struggle / the wound"),
        family: str = Input(default="", description="Who they fight for (names welcome)"),
        location: str = Input(default="", description="Their home city"),
        champion: str = Input(default="", description="A figure they look up to (optional)"),
        paid: bool = Input(default=False, description="Paid unlocks up to 6 min; free is capped at 60s"),
        anthropic_api_key: Secret = Input(default=None, description="Anthropic API key (Sonnet/Haiku planner)"),
        hf_token: Secret = Input(default=None, description="HuggingFace token (pyannote diarization model)"),
        replicate_api_token: Secret = Input(default=None, description="Replicate API token (F5-TTS voice cloning)"),
        blob_token: Secret = Input(default=None, description="Vercel Blob token (publicly hosts F5 reference audio)"),
        elevenlabs_api_key: Secret = Input(default=None, description="ElevenLabs API key (premium voice cloning — used when set)"),
        mode: str = Input(default="personalize", choices=["personalize", "full_voice"], description="personalize = 50/50 original + snippets; full_voice = 100% generated speech in the cloned voice"),
        min_voices: int = Input(default=0, description="full_voice only: hint pyannote to find at least N distinct speakers to clone (0 = auto). Use for dense multi-character sources like a GoT montage."),
        output_seconds: int = Input(default=0, description="full_voice only: cap the OUTPUT length (s) independent of source length — clone the voices from a longer source but render e.g. a 2-min piece. 0 = use the full window."),
    ) -> Path:
        from auto_synthesizer import auto_synthesize

        # Replicate has no model-level env vars, so the secrets arrive per-prediction as Cog Secrets
        # (masked in logs). Promote them into the process env so the planner / pyannote / TTS read
        # them exactly as they did from a .env locally.
        for var, sec in (
            ("ANTHROPIC_API_KEY", anthropic_api_key),
            ("HF_TOKEN", hf_token),
            ("REPLICATE_API_TOKEN", replicate_api_token),
            ("BLOB_READ_WRITE_TOKEN", blob_token),
            ("ELEVENLABS_API_KEY", elevenlabs_api_key),
        ):
            if sec is None:
                continue
            try:
                val = sec.get_secret_value()
            except AttributeError:
                val = str(sec)
            if val:
                os.environ[var] = val

        # Prefer ElevenLabs whenever its key is supplied — far better timbre/clarity than F5.
        if os.environ.get("ELEVENLABS_API_KEY"):
            os.environ["TTS_PROVIDER"] = "elevenlabs"

        work = _P(tempfile.mkdtemp())
        vocals, accomp = self._separate(_P(str(audio)), work)

        cap = PAID_MAX_MS if paid else FREE_MAX_MS
        window_ms = max(10_000, min(_duration_ms(audio), cap))

        if mode == "full_voice":
            # full_voice discovers + clones voices from the FULL separated vocals, but sizes the script
            # and bed to out_window — so we can clone all 5+ characters from a 3-min montage yet render 2 min.
            out_window = min(window_ms, output_seconds * 1000) if output_seconds and output_seconds > 0 else window_ms
            return self._full_voice(
                vocals, accomp, str(audio),
                _context_prompt(name, location, battlefield, struggle, family, champion),
                out_window, work, min_voices=min_voices,
            )

        result = auto_synthesize(
            audio_path=str(audio),
            user_context=_context_prompt(name, location, battlefield, struggle, family, champion),
            vocals_path=str(vocals),
            accomp_path=str(accomp),
            window_ms=window_ms,
            out_dir=work / "out",
            verbose=True,
        )
        if result.get("status") != "ok":
            raise RuntimeError(f"pipeline status: {result.get('status')}")
        return Path(result["final_path"])

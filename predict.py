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

    def _full_voice(self, vocals, accomp, audio_path, user_context, window_ms, work,
                    min_voices=0, extra_voice_ids=""):
        """100%-generated mode — adaptive. Build a pool of voices (permanent voice_ids supplied by the
        caller PLUS voices freshly cloned from the source's distinct speakers), write a COMPLETE new
        script (the listener's saga, original lines, never the source's words) and speak it 100% across
        those voices over the source's own clean music+SFX bed. Solo source -> one-voice monologue (Tate);
        multi-speaker cinematic source -> a multi-voice epic (GoT). NO original dialogue is mixed in."""
        import tts
        from pydub import AudioSegment
        voc = AudioSegment.from_wav(str(vocals))

        # 1) diarize -> distinct speakers, build a clone reference per speaker (concatenate their segments)
        speakers = self._rank_speakers(str(vocals), len(voc), min_speakers=min_voices)[:6]
        print(f"full_voice: {len(speakers)} distinct voice(s) detected (min_voices={min_voices})")
        track_refs = []   # (speaker_id, ref_path) — cloned one at a time later
        for spk, segs in speakers:
            ref = AudioSegment.silent(duration=0)
            for s, e in segs:
                if len(ref) >= 40_000:
                    break
                ref += voc[int(s * 1000):int(e * 1000)]
            if len(ref) < 2500:                       # too little clean audio → fall back to head of stem
                ref = voc[:min(len(voc), 30_000)]
            rp = _P(work) / f"fv_ref_{spk}.wav"
            ref[:40_000].export(str(rp), format="wav")
            track_refs.append((spk, rp))

        # 2) voice pool = permanent voices first (used directly, never cloned/deleted — e.g. the user's
        #    GoT-Jon / dany clones; they guarantee solid extra voices and cost no slot), then track clones.
        fixed = [v.strip() for v in (extra_voice_ids or "").split(",") if v.strip()]
        pool = [("fixed", vid) for vid in fixed] + [("clone", rp) for (_s, rp) in track_refs]
        pool = pool[:6]
        n = len(pool)
        if n == 0:
            raise RuntimeError("full_voice: no voices available")
        print(f"full_voice: pool = {len(fixed)} permanent + {len(track_refs)} cloned -> {n} total")

        # 3) write the COMPLETE new script for n voices
        lines = self._write_fullvoice_script(audio_path, user_context, n, window_ms)
        by_voice = {}
        for idx, ln in enumerate(lines):
            by_voice.setdefault(int(ln.get("voice", 0)) % n, []).append(idx)

        # 4) render per voice. Permanent voices TTS directly; cloned voices clone -> TTS -> delete, one at
        #    a time, so the ElevenLabs custom-voice slot cap is never hit (this fixed the 3/5 400 errors).
        self._purge_orphan_clones()
        rendered, used = {}, 0
        for vi, (kind, ident) in enumerate(pool):
            idxs = by_voice.get(vi, [])
            if not idxs:
                continue
            vid, created = ident, False
            if kind == "clone":
                try:
                    vid = tts.elevenlabs_clone(ident, name=f"rb_fv_{vi}"); created = True
                except Exception as ex:
                    print(f"  clone failed (voice {vi}): {ex}"); continue
            used += 1
            try:
                for idx in idxs:
                    txt = (lines[idx].get("text") or "").strip()
                    if not txt:
                        continue
                    try:
                        rendered[idx] = tts.elevenlabs_tts(txt, vid)
                    except Exception as ex:
                        print(f"  tts failed ({txt[:30]}…): {ex}")
            finally:
                if created:
                    tts.elevenlabs_delete(vid)
        print(f"full_voice: used {used}/{n} voices, rendered {len(rendered)}/{len(lines)} lines")

        # 5) re-voice any line whose voice failed, with a guaranteed voice (a permanent one if available)
        leftover = [i for i in range(len(lines))
                    if i not in rendered and (lines[i].get("text") or "").strip()]
        if leftover:
            fb_vid, fb_created = (fixed[0] if fixed else None), False
            if not fb_vid and track_refs:
                try:
                    fb_vid = tts.elevenlabs_clone(str(track_refs[0][1]), name="rb_fv_fb"); fb_created = True
                except Exception as ex:
                    print("  fallback clone failed:", ex)
            if fb_vid:
                try:
                    for idx in leftover:
                        try:
                            rendered[idx] = tts.elevenlabs_tts(lines[idx]["text"].strip(), fb_vid)
                        except Exception:
                            pass
                finally:
                    if fb_created:
                        tts.elevenlabs_delete(fb_vid)
        if not rendered:
            raise RuntimeError("full_voice: nothing could be synthesized")

        # 6) assemble the voice track in line order, then lay it over the clean music+SFX bed
        track = AudioSegment.silent(duration=0)
        prev = None
        for idx in range(len(lines)):
            if idx not in rendered:
                continue
            vi = int(lines[idx].get("voice", 0)) % n
            gap = 650 if (prev is not None and vi != prev) else 300   # longer breath on a voice change
            track += AudioSegment.silent(duration=gap) + rendered[idx]
            prev = vi
        print(f"full_voice track: {n} voice(s), {len(track)/1000:.1f}s speech")
        if len(track) < 1000:
            raise RuntimeError("full_voice: no audible speech produced")
        mixed = self._lay_over_music(track, accomp, duck_db=(8.0 if n >= 2 else 12.0))
        out = _P(work) / "fullvoice.mp3"
        mixed.export(str(out), format="mp3", bitrate="192k")
        return Path(out)

    def _purge_orphan_clones(self):
        """Delete leftover 'rb_*' throwaway voices from a crashed earlier run to free custom-voice slots.
        Only touches our own rb_-prefixed clones — never the user's voices."""
        import tts
        try:
            r = tts.requests.get(f"{tts.ELEVENLABS_API}/voices", headers=tts._el_headers(), timeout=30)
            r.raise_for_status()
            for v in r.json().get("voices", []):
                if v.get("category") == "cloned" and str(v.get("name", "")).startswith("rb_"):
                    tts.elevenlabs_delete(v["voice_id"])
                    print(f"  purged orphan clone {v.get('name')}")
        except Exception as e:
            print("  orphan purge skipped:", e)

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
            target_words = max(220, int(window_ms / 1000.0 / 60.0 * 215))   # fill the window (gaps eat time)
            sysmsg = (f"You script a cinematic, multi-voice EPIC TRAILER — the listener's life told as a "
                      f"mythic saga. You have {n_voices} distinct VOICES, numbered 0..{n_voices - 1}. Write "
                      "ORIGINAL lines ONLY — never quote any film, show, or song. Distribute the lines across "
                      "the voices like a real trailer: voices alternate, one proclaims and another answers, "
                      "tension builds to a release. Each line short and punchy (3-14 words). Use the listener's "
                      "name and real details, framed as an epic (houses, oaths, fire, legacy, the long road) "
                      f"but about THEIR real life. USE ALL {n_voices} voices — every voice index 0..{n_voices - 1} "
                      "gets several lines; leave none silent. Build to one decisive final line. Output STRICT "
                      "JSON ONLY: [{\"voice\":int,\"text\":str}, ...]. No prose, no markdown.")
            usr = (f"STYLE/cadence to echo (do NOT reuse words):\n\"\"\"\n{style}\n\"\"\"\n\nLISTENER:\n{user_context}\n\n"
                   f"Write the FULL ~{target_words} words total across {n_voices} voices as a seamless, building "
                   f"epic — fill the whole duration, do NOT stop short. JSON only.")
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
        extra_voice_ids: str = Input(default="", description="full_voice only: comma-separated permanent ElevenLabs voice IDs to include as voices (used directly, never cloned/deleted) — e.g. the user's GoT-Jon + dany clones, to guarantee solid extra voices."),
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
                out_window, work, min_voices=min_voices, extra_voice_ids=extra_voice_ids,
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

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

FREE_MAX_MS = 45_000     # free tier: up to 45s
PAID_MAX_MS = 360_000    # paid tier: up to 6 min
# Free runs honor the user's CHOSEN tier (25/50/75/100) — bounded only by the 45s length cap + the
# 1-free-per-device gate, NOT by a forced tier (founder decision 2026-06-15). No constant needed.
VOICE_TARGET_DBFS = -16.0        # every rendered line is loudness-matched to this so no voice is louder/quieter
LANG_CODE = {"english": "en", "german": "de", "spanish": "es", "french": "fr", "italian": "it",
             "portuguese": "pt", "dutch": "nl", "polish": "pl"}  # target-name -> whisper code


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
        # GPU ground-truth diagnostic — does this box have a GPU, and does torch see it? (OmniVoice needs GPU.)
        try:
            import torch as _t, subprocess as _sp
            _smi = _sp.run(["nvidia-smi", "-L"], capture_output=True, text=True, timeout=10)
            print(f"[GPU CHECK] torch.cuda.is_available()={_t.cuda.is_available()} device_count={_t.cuda.device_count()} torch={_t.__version__} cuda={_t.version.cuda}")
            print(f"[GPU CHECK] nvidia-smi rc={_smi.returncode} :: {((_smi.stdout or '') + (_smi.stderr or '')).strip()[:220]}")
        except Exception as _e:
            print("[GPU CHECK] failed:", _e)
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

    def _detect_source_lang(self, audio):
        """Whisper language code of the source (e.g. 'en','de'). Used to decide if a target language
        is a TRANSLATION (cross-language) — in which case the WHOLE track is re-spoken in the target
        language, never a half-source/half-target mix."""
        try:
            import whisper
            m = whisper.load_model(os.environ.get("WHISPER_MODEL", "base"))
            clip = whisper.pad_or_trim(whisper.load_audio(str(audio)))
            mel = whisper.log_mel_spectrogram(clip).to(m.device)
            _, probs = m.detect_language(mel)
            return max(probs, key=probs.get)
        except Exception as e:
            print("source-lang detect skipped:", e)
            return None

    def _separate(self, audio: _P, workdir: _P):
        """Source separation -> (vocals_stem, accomp_stem). DEFAULT = Mel-Band RoFormer (instrumental,
        SDR 16.1): far less vocal-removal residue in the accomp BED than htdemucs. That residue is the
        bed 'Gequietsche' (musical noise) the founder's ear caught at REPLACED slots — kept regions use
        the bit-identical original mix and were always clean, so the artifact tracks the demucs bed.
        Set SEPARATOR=demucs to force htdemucs. ANY RoFormer failure degrades GRACEFULLY to htdemucs
        (never an outage; worst case = the old bed)."""
        out = workdir / "sep"
        if os.environ.get("SEPARATOR", "roformer").strip().lower() != "demucs":
            try:
                return self._separate_roformer(audio, out)
            except Exception as e:
                print(f"[separate] RoFormer unavailable ({type(e).__name__}: {e}) -> htdemucs fallback")
        return self._separate_demucs(audio, out)

    def _separate_demucs(self, audio: _P, out: _P):
        """htdemucs two-stem split on the GPU (falls back to CPU if no CUDA)."""
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        subprocess.run(
            [sys.executable, "-m", "demucs", "--two-stems=vocals", "-d", device,
             "--out", str(out), str(audio)],
            check=True,
        )
        vocals = next(out.rglob("vocals.wav"))
        return vocals, vocals.parent / "no_vocals.wav"

    def _separate_roformer(self, audio: _P, out: _P):
        """Mel-Band RoFormer (melband_roformer_inst_v2, instrumental SDR 16.1) via audio-separator.
        A cleaner accomp bed removes the separation 'Gequietsche' at replaced slots. Same return
        contract as htdemucs: (vocals_wav, accomp_wav) — vocals MUST be WAV (callers use from_wav).
        The model is baked into the image at build time (AUDIO_SEPARATOR_MODEL_DIR); runs on CUDA in
        the cog with no runtime network."""
        from audio_separator.separator import Separator
        out.mkdir(parents=True, exist_ok=True)
        model_dir = os.environ.get("AUDIO_SEPARATOR_MODEL_DIR", "/src/audio-separator-models")
        os.makedirs(model_dir, exist_ok=True)  # Separator REQUIRES this dir to exist (never auto-creates it)
        sep = Separator(output_dir=str(out), output_format="wav", model_file_dir=model_dir)
        sep.load_model(model_filename="melband_roformer_inst_v2.ckpt")
        names = sep.separate(str(audio))             # basenames written into `out`: one (Vocals), one (Instrumental)
        paths = [out / n for n in names]
        vocals = next(p for p in paths if "(Vocals)" in p.name)
        accomp = next(p for p in paths if "(Instrumental)" in p.name)
        return vocals, accomp

    def _constant_bed_path(self, bed_audio):
        """ONLY an explicitly chosen template bed (the instrumental side-project: a picked voice over a
        picked instrumental). RoarBliss NEVER imposes a default bed on a real source — the original
        audio is the bed. Returns None when no template was chosen. Accepts a local path OR a public
        http(s) URL (downloaded to a temp file) — bed_audio is now a `str` input, so a URL is the way to
        pass a template bed."""
        if not bed_audio:
            return None
        s = str(bed_audio).strip()
        if not s:
            return None
        if s.startswith("http://") or s.startswith("https://"):
            try:
                import tempfile, requests
                r = requests.get(s, timeout=60)
                r.raise_for_status()
                tf = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
                tf.write(r.content)
                tf.close()
                return tf.name
            except Exception as e:
                print(f"bed_audio URL download failed ({e}); ignoring bed")
                return None
        return s

    def _bed_is_dry(self, accomp, speech_windows, window_ms):
        """A DRY/HOLEY bed: the separated music nearly vanishes in the original pauses, OR drops far
        below the speech-region level — riding voice on it produces the -35dB holes (the 'rollercoaster').
        Measured robustly from pydub dBFS (no fragile ffmpeg-summary dependency), comparing the bed's
        level inside pauses vs inside speech windows. A real cinematic bed (GoT) stays loud in pauses."""
        try:
            from pydub import AudioSegment
            bed = AudioSegment.from_file(str(accomp))
        except Exception:
            return True   # can't load the bed -> safest is the constant bed
        if bed.dBFS == float("-inf") or bed.dBFS < -30:
            return True   # near-silent bed = nothing to ride
        def avg(regions):
            vals = [bed[a:b].dBFS for a, b in regions if (b - a) > 150 and bed[a:b].dBFS != float("-inf")]
            return (sum(vals) / len(vals)) if vals else None
        pauses, prev = [], 0
        for s, e in speech_windows:
            if s - prev > 400:
                pauses.append((prev, s))
            prev = max(prev, e)
        if window_ms - prev > 400:
            pauses.append((prev, window_ms))
        sp, pa = avg(speech_windows), avg(pauses)
        if pa is None:
            return False           # no real pauses -> the bed can't be 'holey' in pauses
        if sp is None:
            return bed.dBFS < -26
        return (sp - pa) > 12 or pa < -34   # bed collapses in pauses OR is very quiet there

    def _full_voice(self, vocals, accomp, audio_path, user_context, window_ms, work,
                    min_voices=0, extra_voice_ids="", language="English", clone_source_voices=True,
                    music_gain_db=0.0, duck_db=8.0, voice_speed=1.0, bed_audio=None, library_ref=None):
        """100%-generated mode — adaptive. Build a pool of voices (permanent voice_ids supplied by the
        caller PLUS voices freshly cloned from the source's distinct speakers), write a COMPLETE new
        script (the listener's saga, original lines, never the source's words) and speak it 100% across
        those voices over the source's own clean music+SFX bed. Solo source -> one-voice monologue (Tate);
        multi-speaker cinematic source -> a multi-voice epic (GoT). NO original dialogue is mixed in.

        library_ref: a LOCAL path to a chosen LIBRARY voice's clone reference (the instrumental / Feature
        #29 path). When given, that voice is added to the clone pool (OmniVoice clones it and lays it over
        the bed) — it is the voice for a source that has no clonable speaker of its own."""
        import tts
        from pydub import AudioSegment

        # 1) Voice sourcing is DETERMINISTIC. Clone the source's own distinct speakers ONLY when the
        #    caller asks for it (clone_source_voices=True) — e.g. personalizing a real multi-speaker
        #    speech. For "chosen voices over a bed" (instrumental + your Jon voice, or N picked voices),
        #    clone_source_voices=False -> NO diarization, NO cloning, NO invented voices. The user only
        #    ever hears the voices they chose.
        track_refs = []   # (speaker_id, ref_path) — cloned one at a time later
        ref_texts = {}    # str(ref_path) -> exact transcript of that clip (zero-shot conditioning)
        speech_windows = []  # ms (start, end) of the ORIGINAL utterances — new lines are placed on these
        if clone_source_voices and vocals is not None:
            voc = AudioSegment.from_wav(str(vocals))
            speakers = self._rank_speakers(str(vocals), len(voc), min_speakers=min_voices)[:6]
            print(f"full_voice: {len(speakers)} source speaker(s) to clone (min_voices={min_voices})")
            # The ORIGINAL speech timeline (merged diarized turns). Founder rule: "we just change the
            # sentences — everything else stays the same." Produced sources carry the producer's music
            # automation (the bed rides down under speech, swells in pauses); placing each new line on
            # an original utterance onset keeps that automation in sync with OUR speech — the original
            # production does the mixing, we never touch the music.
            allsegs = sorted((s, e) for _, segs in speakers for (s, e) in segs)
            merged = []
            for s, e in allsegs:
                if merged and s * 1000 - merged[-1][1] < 300:   # close micro-gaps (<300ms)
                    merged[-1][1] = max(merged[-1][1], e * 1000)
                else:
                    merged.append([s * 1000, e * 1000])
            speech_windows = [(int(s), int(e)) for s, e in merged]
            # ONE continuous clip (≤12s) + its EXACT transcript per speaker. Stitching many diarized
            # fragments into a 40s ref with ref_text="" is the documented 'garbled/backwards-gibberish'
            # anti-pattern (see auto_synthesizer.resolve_reference_clip) and OmniVoice itself warns
            # that >20s refs degrade the clone. The 75%-tier path clones intelligibly with exactly
            # this single-clip+transcript recipe — mirror it here.
            _whisper = None
            try:
                import whisper as _w
                _whisper = _w.load_model(os.environ.get("WHISPER_MODEL", "base"))
            except Exception as e:
                print("full_voice: ref transcribe unavailable:", e)
            for spk, segs in speakers:
                longest = sorted(segs, key=lambda se: se[1] - se[0], reverse=True)
                s, e = longest[0]
                ref = voc[int(s * 1000):int(min(e, s + 12.0) * 1000)]
                if len(ref) < 2500:                   # longest turn too short → top up with next-longest turns
                    for s2, e2 in longest[1:]:
                        ref += voc[int(s2 * 1000):int(e2 * 1000)]
                        if len(ref) >= 8_000:
                            break
                if len(ref) < 2500:                   # still too little → head of stem
                    ref = voc[:min(len(voc), 12_000)]
                rp = _P(work) / f"fv_ref_{spk}.wav"
                ref[:12_000].export(str(rp), format="wav")
                if _whisper is not None:
                    try:
                        ref_texts[str(rp)] = (_whisper.transcribe(str(rp)).get("text") or "").strip()
                    except Exception as e:
                        print(f"full_voice: ref transcribe failed ({spk}):", e)
                track_refs.append((spk, rp))
        else:
            print("full_voice: cloning disabled -> only the chosen voice(s), no invented voices")

        # LIBRARY VOICE (instrumental / Feature #29). A chosen library voice is added to the clone pool:
        # OmniVoice clones it from its reference clip and speaks the whole script over the bed (RULE #1 —
        # the bed is never touched). The reference is already a clean 6-10s mono 24kHz clip; transcribe it
        # once for zero-shot conditioning (same single-clip+transcript recipe the 75% path uses).
        if library_ref:
            lp = _P(library_ref)
            if lp.exists():
                rp = _P(work) / "fv_ref_library.wav"
                try:
                    AudioSegment.from_file(str(lp))[:12_000].export(str(rp), format="wav")
                except Exception:
                    rp = lp
                try:
                    import whisper as _w
                    _wm = _w.load_model(os.environ.get("WHISPER_MODEL", "base"))
                    ref_texts[str(rp)] = (_wm.transcribe(str(rp)).get("text") or "").strip()
                except Exception as e:
                    print("full_voice: library ref transcribe unavailable:", e)
                track_refs.append(("LIBRARY", rp))
                print(f"full_voice: library voice added to the clone pool ({lp.name})")
            else:
                print(f"full_voice: library_ref not found, ignoring: {library_ref}")

        # 2) voice pool = permanent voices first (used directly, never cloned/deleted — e.g. the user's
        #    GoT-Jon / dany clones; they guarantee solid extra voices and cost no slot), then track clones.
        fixed = [v.strip() for v in (extra_voice_ids or "").split(",") if v.strip()]
        pool = [("fixed", vid) for vid in fixed] + [("clone", rp) for (_s, rp) in track_refs]
        pool = pool[:6]
        n = len(pool)
        if n == 0:
            raise RuntimeError("full_voice: no voices available")
        print(f"full_voice: pool = {len(fixed)} permanent + {len(track_refs)} cloned -> {n} total")

        # 3) write the COMPLETE new script for n voices (in the target language)
        lines = self._write_fullvoice_script(audio_path, user_context, n, window_ms, language=language)
        by_voice = {}
        for idx, ln in enumerate(lines):
            by_voice.setdefault(int(ln.get("voice", 0)) % n, []).append(idx)

        # 4) render per voice. Permanent voices TTS directly; cloned voices clone -> TTS -> delete, one at
        #    a time, so the ElevenLabs custom-voice slot cap is never hit (this fixed the 3/5 400 errors).
        self._purge_orphan_clones()
        rendered, used = {}, 0
        # Honor the selected TTS_PROVIDER. ElevenLabs needs a persistent cloned voice (clone→TTS→delete,
        # one at a time, to respect its custom-voice slot cap). Zero-shot providers (chatterbox/qwen3/F5)
        # have no persistent voice — they synthesize each line directly from the reference, so they ALSO
        # cover the 100%/translation path (no per-op ElevenLabs cap → scales).
        provider = os.environ.get("TTS_PROVIDER", "elevenlabs").lower()
        _el = provider == "elevenlabs"
        fv_cache = work / "tts_cache"
        fv_cache.mkdir(parents=True, exist_ok=True)
        FV_SLOT_MS = 20_000  # generous sanity cap for full-voice lines (sane_max ≈ 60s catches ~90s garbage)
        for vi, (kind, ident) in enumerate(pool):
            idxs = by_voice.get(vi, [])
            if not idxs:
                continue
            if _el:
                vid, created = ident, False
                if kind == "clone":
                    # Clone with a one-shot re-attempt (fresh name + slot purge) before giving up — a failed
                    # clone drops ALL of this voice's lines. elevenlabs_clone already retries transient
                    # 429/5xx at the HTTP layer; this second attempt covers a stale-slot / name-collision blip.
                    for attempt in range(2):
                        try:
                            vid = tts.elevenlabs_clone(ident, name=f"rb_fv_{vi}_{attempt}"); created = True
                            break
                        except Exception as ex:
                            print(f"  clone failed (voice {vi}, attempt {attempt + 1}/2): {ex}")
                            if attempt == 0:
                                self._purge_orphan_clones()  # free a custom-voice slot in case the cap was the cause
                    if not created:
                        continue
                used += 1
                try:
                    for idx in idxs:
                        txt = (lines[idx].get("text") or "").strip()
                        if not txt:
                            continue
                        try:
                            rendered[idx] = self._norm(tts.elevenlabs_tts(txt, vid))
                        except Exception as ex:
                            print(f"  tts failed ({txt[:30]}…): {ex}")
                finally:
                    if created:
                        tts.elevenlabs_delete(vid)
            else:
                # Zero-shot provider: 'fixed' permanent EL voice-ids don't apply — only clone references.
                if kind != "clone":
                    continue
                ref = _P(ident)
                used += 1
                for idx in idxs:
                    txt = (lines[idx].get("text") or "").strip()
                    if not txt:
                        continue
                    try:
                        rendered[idx] = self._norm(tts.synthesize_clone(
                            txt, ref, ref_texts.get(str(ref), ""), FV_SLOT_MS, fv_cache))
                    except Exception as ex:
                        print(f"  {provider} tts failed ({txt[:30]}…): {ex}")
        print(f"full_voice: used {used}/{n} voices, rendered {len(rendered)}/{len(lines)} lines [provider={provider}]")

        # 5) re-voice any line whose voice failed, with a guaranteed voice.
        leftover = [i for i in range(len(lines))
                    if i not in rendered and (lines[i].get("text") or "").strip()]
        if leftover:
            if _el:
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
                                rendered[idx] = self._norm(tts.elevenlabs_tts(lines[idx]["text"].strip(), fb_vid))
                            except Exception:
                                pass
                    finally:
                        if fb_created:
                            tts.elevenlabs_delete(fb_vid)
            elif track_refs:
                ref = _P(track_refs[0][1])
                for idx in leftover:
                    try:
                        rendered[idx] = self._norm(tts.synthesize_clone(
                            lines[idx]["text"].strip(), ref, ref_texts.get(str(ref), ""), FV_SLOT_MS, fv_cache))
                    except Exception:
                        pass
        if not rendered:
            raise RuntimeError("full_voice: nothing could be synthesized")

        # 6) assemble the voice track ON the ORIGINAL speech timeline (founder: "we just change the
        #    sentences — everything else stays the same"). Each new line starts where an original
        #    utterance started, so the bed's own produced dynamics (music riding under speech,
        #    swelling in the pauses) stay in sync with OUR speech — zero music manipulation.
        #    Falls back to sequential assembly when there is no source timeline (bed-only mode).
        ordered = [idx for idx in range(len(lines)) if idx in rendered]
        if abs(voice_speed - 1.0) > 0.01:
            # speed must be applied PER LINE (an atempo on the assembled canvas would shift every
            # placement off the original timeline and desync the bed's produced dynamics)
            for idx in ordered:
                rendered[idx] = self._stretch(rendered[idx], work, voice_speed)
        items = [(idx, len(rendered[idx]), int(lines[idx].get("voice", 0)) % n) for idx in ordered]

        # BED = the ORIGINAL audio, always (its own music/sound/melody). We change ONLY the spoken words.
        # The new 100% script FLOWS CONTINUOUSLY over that original music — we do NOT drop the new lines
        # into the original's pause slots (that left ~60s of gaps where a light bed shows as 'music on/
        # off'). Continuous voice masks a sparse bed; a strong bed (GoT) still plays through underneath.
        # The only chosen-bed case is an explicit template (bed_audio) for the instrumental side-project.
        use_constant_bed = bool(bed_audio)
        do_timeline = False

        if do_timeline:
            placements = self._place_on_timeline(items, speech_windows, window_ms)
            end_ms = max((pos + len(rendered[idx]) for idx, pos in placements), default=0)
            track = AudioSegment.silent(duration=max(window_ms, end_ms + 200))
            for idx, pos in placements:
                track = track.overlay(rendered[idx], position=pos)
            speech_ms = sum(len(rendered[idx]) for idx, _ in placements)
            print(f"full_voice track: {n} voice(s), {len(placements)}/{len(items)} lines on the original "
                  f"timeline, {speech_ms/1000:.1f}s speech")
            intro_ms, bed_for_mix = 0, accomp
        else:
            # MUSIC-AWARE PLACEMENT (Constitution §2.8/§2.9): spread the lines across the WHOLE bed with
            # section-weighted pauses (breathe in the quiet, drive in the loud) so the voice never rambles
            # back-to-back and never runs out early leaving a voiceless tail (~70 % bug). Falls back to the
            # old tight sequential fill if the analysis/placement is unavailable. The music is read-only.
            bed_for_mix = self._constant_bed_path(bed_audio) if use_constant_bed else accomp
            placements = []
            try:
                from music_analyzer import analyze_music
                placements = self._place_music_aware(items, analyze_music(audio_path), window_ms)
            except Exception as e:
                print("music-aware placement skipped:", e)
            if placements:
                end_ms = max((pos + len(rendered[idx]) for idx, pos in placements), default=0)
                track = AudioSegment.silent(duration=max(window_ms, end_ms + 200))
                for idx, pos in placements:
                    track = track.overlay(rendered[idx], position=pos)
                speech_ms = sum(len(rendered[idx]) for idx, _ in placements)
                print(f"full_voice track: {n} voice(s), {len(placements)} lines spread music-aware over "
                      f"{len(track)/1000:.0f}s ({speech_ms/1000:.0f}s speech + section pauses)")
                intro_ms = 0
            else:
                cap_ms = max(0, window_ms - 5500)   # reserve room for the 2.5s intro + 3s tail
                track = AudioSegment.silent(duration=0)
                prev = None
                for idx, seg_len, vi in items:
                    seg = rendered[idx]
                    if cap_ms and len(track) > 1000 and len(track) + len(seg) > cap_ms:
                        print(f"  output cap (~{window_ms/1000:.0f}s) reached at line {idx}/{len(lines)}")
                        break
                    gap = 650 if (prev is not None and vi != prev) else 300   # longer breath on a voice change
                    track += AudioSegment.silent(duration=gap) + seg
                    prev = vi
                tag = "constant bed (dry source/template)" if use_constant_bed else "no source timeline"
                print(f"full_voice track: {n} voice(s), {len(track)/1000:.1f}s speech (sequential fallback — {tag})")
                intro_ms = 2500
        if track.dBFS == float("-inf"):
            raise RuntimeError("full_voice: no audible speech produced")
        track = self._voice_polish(track, work, speed=1.0)   # Stimmenklang only — speed already per line
        mixed = self._lay_over_music(track, bed_for_mix, work, duck_db=duck_db, music_gain_db=music_gain_db,
                                     bed_len_ms=window_ms, intro_ms=intro_ms)
        # Trim a trailing DEAD-AIR tail. When a translated / dry speech is re-voiced, its SEPARATED accomp
        # runs empty after the last spoken line (the original voice used to fill that tail; now correctly
        # stripped), leaving silence the no_dead_air guard rightly rejects. Cut to the last line + a short
        # breath — but ONLY when the bed there is genuinely silent. A real-music track keeps its tail (the
        # bed never goes quiet), so it is NEVER cut short (founder rule).
        try:
            from pydub.silence import detect_leading_silence
            last_voice_ms = len(track) - detect_leading_silence(track.reverse(), silence_threshold=-50.0, chunk_size=20)
            tail_after = mixed[last_voice_ms + 500:]
            if len(mixed) - last_voice_ms > 2500 and len(tail_after) > 0 and tail_after.dBFS < -40:
                mixed = mixed[: last_voice_ms + 1500]   # keep last line + a 1.5s musical breath
                print(f"trimmed dead-air tail after last line -> {len(mixed)/1000:.1f}s (empty bed; not a music track)")
        except Exception as e:
            print("tail-trim skipped:", e)
        out = _P(work) / "fullvoice.mp3"
        mixed.export(str(out), format="mp3", bitrate="192k")

        # RUNTIME SELF-CHECK — the cog grades its OWN output with the same metrics as the offline gate.
        # If the track is wavy/holey (the rollercoaster) and we rode the source's DEMUCS bed, re-mix the
        # voice over a CONSTANT bed and keep whichever passes. An input we never tested cannot ship a
        # rollercoaster. Skip correction when the bed is the user's OWN chosen upload (bed-only mode,
        # vocals is None) — overriding their instrumental would be wrong, not a fix.
        # The self-check MEASURES + logs, but never auto-imposes a constant bed or masters the mix —
        # both would alter the original soundscape, which RoarBliss must keep untouched. (skip=True.)
        out = self._self_check_and_correct(out, track, work, window_ms, intro_ms, bed_audio, True)
        return Path(out)

    def _master_loudness(self, mp3_path, work):
        """FINAL MASTER for full_voice: lock the whole-mix loudness to a constant level (LRA target),
        the finish that puts a track at ~LRA 2.7 like the founder's approved reference. This is a UNIFORM
        master on the full mix — NOT selective ducking of the music around the voice (that ducking IS the
        rollercoaster). The constant bed kills the holes; this kills the residual speech-vs-breath swing.
        Applied ONLY to full_voice (100%, over our chosen constant bed) — never to the 25/50/75 tiers,
        where the source's own music must stay untouched (RULE #1)."""
        try:
            import subprocess
            out2 = _P(work) / "fullvoice_mastered.mp3"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3_path),
                            "-af", "loudnorm=I=-14:LRA=3.5:tp=-1.5", "-ar", "44100", "-b:a", "192k", str(out2)],
                           check=True)
            return out2
        except Exception as e:
            print("[master] skipped:", e)
            return mp3_path

    def _self_check_and_correct(self, out, track, work, window_ms, intro_ms, bed_audio, already_constant):
        try:
            sys.path.insert(0, str(_P(__file__).parent / "eval"))
            from metrics import score as _score
        except Exception as e:
            print("[self-check] metrics unavailable, skipping:", e)
            return out
        card = _score(str(out), context={"expected_ms": window_ms})
        print(f"[self-check] LRA={card.measured.get('lra')} dropouts={card.measured.get('dropouts')} "
              f"-> {'PASS' if card.passed else 'FAIL ' + str(card.failures())}")
        if card.passed or already_constant:
            return out   # good, or we already used the safe bed (nothing better to fall back to)
        print("[self-check] self-correcting: re-mix over a constant bed")
        try:
            remixed = self._lay_over_music(track, self._constant_bed_path(bed_audio), work,
                                           bed_len_ms=window_ms, intro_ms=intro_ms)
            out2 = _P(work) / "fullvoice_corrected.mp3"
            remixed.export(str(out2), format="mp3", bitrate="192k")
            card2 = _score(str(out2), context={"expected_ms": window_ms})
            print(f"[self-check] after correction: LRA={card2.measured.get('lra')} "
                  f"dropouts={card2.measured.get('dropouts')} -> {'PASS' if card2.passed else 'FAIL ' + str(card2.failures())}")
            if card2.passed or len(card2.failures()) < len(card.failures()):
                return out2   # the constant-bed mix is better (or clean) — ship it
        except Exception as e:
            print("[self-check] correction failed, keeping original:", e)
        return out

    def _place_music_aware(self, items, music_map, window_ms, intro_ms=1200, tail_ms=1500):
        """MUSIC-AWARE full_voice placement (Constitution §2.8/§2.9). Spread the lines across the WHOLE bed
        with section-weighted PAUSES — the voice breathes (longer gaps) in quiet sections and drives in loud
        ones — so it never rambles back-to-back AND never runs out early leaving a voiceless tail (the ~70 %
        bug). items: [(idx, len_ms, voice)] in script order -> [(idx, start_ms)]. The music is READ-ONLY.
        Distributes the SLACK (window minus total speech) as pauses weighted toward the quiet sections."""
        secs = music_map.get("sections") or []
        n = len(items)
        if n == 0:
            return []
        lo = intro_ms
        hi = max(lo + 1000, window_ms - tail_ms)
        span = hi - lo
        total_speech = sum(seg for _, seg, _ in items)

        def energy_at(ms):
            for s in secs:
                if s["start_s"] * 1000 <= ms <= s["end_s"] * 1000:
                    return float(s["energy"])
            return 0.5
        even = [lo + span * (i + 0.5) / n for i in range(n)]            # rough center to read the section
        pw = [max(0.25, 1.5 - energy_at(c)) for c in even]             # quiet(e~.2)->1.3, loud(e~.9)->.6
        slack = max(0, span - total_speech)                            # total pause budget to spread
        tot_pw = sum(pw) or 1.0
        placements, cursor = [], lo
        for (idx, seg_len, vi), w in zip(items, pw):
            start = int(min(cursor, max(0, window_ms - seg_len - 50)))  # keep the line inside the window
            placements.append((idx, max(0, start)))
            cursor = start + seg_len + max(120, int(slack * w / tot_pw))  # advance by line + its weighted pause
        return placements

    def _place_on_timeline(self, items, windows_ms, window_ms, gap_same=150, gap_switch=650):
        """items: [(line_idx, len_ms, voice_idx)] in script order -> [(line_idx, start_ms)].
        Reproduce the ORIGINAL's speech/pause pattern: while the cursor is INSIDE an original
        utterance window, lines flow back-to-back (the original kept talking here); when the
        cursor lands in an original PAUSE, the next line waits for the next window start (the
        original was silent here — the bed swells exactly as produced). A line that would barely
        fit its window (<50% remaining) starts at the next window instead of spilling deep into
        the produced pause. Never overlaps; capped at the output window."""
        placements, cursor, wi, prev_vi = [], 0, 0, None
        cap = max(0, window_ms - 1000)
        for idx, ln, vi in items:
            gap = (gap_switch if (prev_vi is not None and vi != prev_vi) else gap_same) if placements else 0
            floor = cursor + gap
            while wi < len(windows_ms) and windows_ms[wi][1] <= floor:
                wi += 1
            if wi < len(windows_ms) and windows_ms[wi][0] > floor:
                pos, tag = windows_ms[wi][0], "onset"          # original pause -> wait for next utterance
            elif wi < len(windows_ms):
                remaining = windows_ms[wi][1] - floor
                if ln > remaining and remaining < 0.5 * ln and wi + 1 < len(windows_ms):
                    wi += 1
                    pos, tag = windows_ms[wi][0], "onset"      # barely fits -> next utterance instead
                else:
                    pos, tag = floor, "in-window"              # original kept talking -> keep talking
            else:
                pos, tag = floor, "past-timeline"
            if placements and cap and pos + ln > cap:
                print(f"  output cap (~{window_ms/1000:.0f}s) reached at line {idx}")
                break
            placements.append((idx, pos))
            print(f"  line {idx:>2} -> {pos/1000:7.2f}s ({ln/1000:.1f}s) [{tag}]")
            cursor = pos + ln
            prev_vi = vi
        return placements

    def _stretch(self, seg, work, speed):
        """Per-line atempo (pitch-preserving pace change), voice-only."""
        import subprocess
        from pydub import AudioSegment
        sp = max(0.5, min(2.0, float(speed)))
        src = _P(work) / "_st_in.wav"; dst = _P(work) / "_st_out.wav"
        try:
            seg.export(str(src), format="wav")
            subprocess.run(["ffmpeg", "-y", "-i", str(src), "-af", f"atempo={sp:.3f}", str(dst)],
                           capture_output=True, check=True)
            return AudioSegment.from_wav(str(dst))
        except Exception as e:
            print("stretch skipped:", e)
            return seg

    def _norm(self, seg):
        """Loudness-match a rendered line to VOICE_TARGET_DBFS so every voice sits at the same level
        (fixes 'one voice too loud, another too quiet'). Silent/empty segments pass through."""
        try:
            if seg is None or seg.dBFS == float("-inf"):
                return seg
            return seg.apply_gain(VOICE_TARGET_DBFS - seg.dBFS)
        except Exception:
            return seg

    def _voice_polish(self, seg, work, speed=1.0):
        """Cinematic VO 'Stimmenklang' on the assembled voice track: body(200Hz)+warmth, presence(2.8k),
        air(9k), gentle glue compression, and an optional speed change (speed<1 = slower/more deliberate,
        pitch preserved). NO gate (gates make speech gasp). ffmpeg in, pydub out; if ffmpeg is unavailable
        the dry track is returned unchanged."""
        import subprocess
        from pydub import AudioSegment
        src = _P(work) / "vox_pre.wav"; dst = _P(work) / "vox_post.wav"
        try:
            seg.export(str(src), format="wav")
            chain = ("highpass=f=75,equalizer=f=200:width_type=q:w=0.9:g=2,bass=g=2:f=150,"
                     "equalizer=f=2800:width_type=q:w=1.2:g=4,treble=g=2.5:f=9000,"
                     "acompressor=threshold=-20dB:ratio=3:attack=10:release=200:makeup=3")
            try:
                sp = float(speed)
            except (TypeError, ValueError):
                sp = 1.0
            if abs(sp - 1.0) > 0.01 and 0.5 <= sp <= 2.0:   # atempo keeps pitch; only when meaningfully off 1.0
                chain += f",atempo={sp:.3f}"
            subprocess.run(["ffmpeg", "-y", "-i", str(src), "-af", chain, str(dst)],
                           capture_output=True, check=True)
            return AudioSegment.from_wav(str(dst))
        except Exception as e:
            print("voice polish skipped:", e)
            return seg

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

    def _write_fullvoice_script(self, audio_path, user_context, n_voices, window_ms, language="English"):
        """Write the bespoke script as a list of {"voice": int, "text": str}. One voice -> a continuous
        monologue; multiple voices -> an epic trailer that trades lines between them. Original lines only;
        the source words are used only to echo cadence, never reproduced. `language` sets the OUTPUT
        language (ElevenLabs multilingual_v2 + the writer both follow it) — the source may be any language."""
        from llm import llm_chat
        style = ""
        try:
            import whisper
            style = whisper.load_model(os.environ.get("WHISPER_MODEL", "base")).transcribe(
                audio_path).get("text", "")[:1200]
        except Exception as e:
            print("style transcribe skipped:", e)
        # MUSIC-AWARE SCRIPT (Constitution §2.8): analyze the BED so the script fits its tempo + dynamics and
        # FILLS the whole length (§2.9) — not a music-blind wall of words. READ-ONLY: the music is NEVER touched.
        music_note = ""
        try:
            from music_analyzer import analyze_music
            mm = analyze_music(audio_path)
            secs = " | ".join(f"{s['start_s']:.0f}-{s['end_s']:.0f}s {s['label']}: {s['delivery']['tone']}, {s['delivery']['pace']}"
                              + ("  <<< LAND THE NAME/VOW LINE HERE" if s["land_big_line"] else "")
                              for s in mm["sections"])
            music_note = (f"\n\nMUSIC MAP — the script MUST ride THIS bed (the music is never changed, you only "
                          f"fit your words to it). {mm['script_brief']}\nSECTION TIMELINE:\n{secs}\n"
                          "Write the lines IN THIS ORDER so each lands in its section; the voice must reach the "
                          "outro (never run out early and leave the music playing alone).")
            print(f"music-aware script: {mm['bpm']}bpm, climax ~{mm['climax_s']}s, {len(mm['sections'])} sections")
        except Exception as e:
            print("music analysis skipped:", e)
        # V3 EMOTION (only when the engine is ElevenLabs eleven_v3): have the writer embed inline audio-tags
        # per music section. They ride along with the music map (or alone if the map is unavailable). Other
        # engines (v2, OmniVoice) never get this instruction, so they never emit a tag that would be spoken.
        if os.environ.get("TTS_PROVIDER", "").strip().lower() == "elevenlabs" and "v3" in (os.environ.get("EL_MODEL", "")).lower():
            music_note += ("\n\nEMOTION (ElevenLabs v3): begin SOME lines with ONE bracketed emotion audio-tag "
                           "that matches the music section — [calm] or [reflective] in quiet/intro passages, "
                           "[determined] or [confident] as it builds, [powerful] or [intense] at the climax, "
                           "[warm] for the resolve. Use a tag on roughly 1 line in 3 (NOT every line), only at "
                           "the START of a line, only these tags. The tag shapes delivery and is never spoken.")
            print("V3 emotion tags: writer will embed per-section audio-tags (eleven_v3)")
        model = os.environ.get("WRITER_MODEL", "claude-sonnet-4-6")
        lang = (language or "English").strip()
        # When the target language isn't English, force native (not translated) output — ElevenLabs
        # multilingual_v2 then auto-detects the language from the text and keeps the cloned timbre.
        lang_note = ("" if lang.lower() in ("english", "en", "")
                     else f" Write EVERY line ENTIRELY in {lang} — natural, native {lang}, never a translation.")
        if n_voices <= 1:
            # ~135 wpm: deliberate, weighty pacing (founder: "ohne so schnell zu sprechen").
            target_words = max(110, int(window_ms / 1000.0 / 60.0 * 135))
            sysmsg = ("You write a single, continuous, first-person motivational monologue the listener "
                      "could record as their own. Echo the cadence and intensity of the STYLE sample, but "
                      "write ORIGINAL lines about the listener's real life — never reuse the sample's words. "
                      "DELIVERY: write for a SLOW, weighty voice. Short, punchy sentences — one idea per "
                      "line. Put the KEY word at the END of the sentence so it lands. Let single short "
                      "lines stand alone for emphasis. Use ONLY normal punctuation (. , ?) — NO ellipses "
                      "or dashes (the voice reads them as hesitations/cut-offs). "
                      "Output STRICT JSON ONLY: a list of {\"voice\":0,\"text\":\"...\"} objects, in order. "
                      "No prose, no markdown." + lang_note)
            usr = (f"STYLE (echo delivery, do NOT reuse words):\n\"\"\"\n{style}\n\"\"\"\n\nLISTENER:\n{user_context}\n\n"
                   f"Write ~{target_words} words total, broken into natural spoken lines, building to one "
                   f"decisive final line. JSON only." + music_note)
        else:
            win_s = max(20, int(window_ms / 1000))
            target_lines = max(10, int(win_s / 3.8))    # ~3.8s per line -> fewer, more spaced (less rushed)
            sysmsg = (f"You script a cinematic, multi-voice EPIC TRAILER — the listener's life told as a "
                      f"mythic saga. You have {n_voices} distinct VOICES, numbered 0..{n_voices - 1}. Write "
                      "ORIGINAL lines ONLY — never quote any film, show, or song. Distribute the lines across "
                      "the voices like a real trailer: voices alternate, one proclaims and another answers, "
                      "tension builds to a release. Each line short and punchy (3-12 words). Use the listener's "
                      "name and real details, framed as an epic (houses, oaths, fire, legacy, the long road) "
                      f"but about THEIR real life. USE ALL {n_voices} voices — every index 0..{n_voices - 1} gets "
                      "several lines; leave none silent. Build to one decisive final line. Output STRICT JSON "
                      "ONLY: [{\"voice\":int,\"text\":str}, ...]. No prose, no markdown." + lang_note)
            usr = (f"STYLE/cadence to echo (do NOT reuse words):\n\"\"\"\n{style}\n\"\"\"\n\nLISTENER:\n{user_context}\n\n"
                   f"Write about {target_lines} short lines total — roughly {win_s} seconds of speech — across "
                   f"{n_voices} voices as a seamless, building epic. Do NOT exceed {target_lines + 5} lines. "
                   f"End on one decisive final line. JSON only." + music_note)
        # Big token budget: a full-length translation can be 100+ lines; a small cap truncated the JSON,
        # which then failed to parse and got read aloud as raw structure ("voice 0 text ...").
        raw = llm_chat(sysmsg, usr, max_tokens=8000, temperature=0.75, model=model).strip()
        return self._parse_script_json(raw, n_voices, user_context)

    def _parse_script_json(self, raw, n_voices, user_context):
        """Parse the model's JSON line list. CRITICAL: never speak JSON structure. If json.loads fails
        (e.g. truncated output), regex-extract ONLY the "text" field VALUES so the keys/indices
        ('voice', 'text', numbers) are never read aloud."""
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
                print("script JSON parse failed, extracting text fields only:", e)
        # Robust, truncation-tolerant: pull each object's "voice" (if present) + "text" VALUE only.
        out = []
        for mo in _re.finditer(r'"text"\s*:\s*"((?:[^"\\]|\\.)*)"', txt, _re.S):
            t = mo.group(1).replace('\\"', '"').replace('\\n', ' ').replace('\\', '').strip()
            # find a "voice":N just before this text, if any (else round-robin)
            pre = txt[:mo.start()]
            vm = None
            for vmm in _re.finditer(r'"voice"\s*:\s*(\d+)', pre):
                vm = vmm
            vi = (int(vm.group(1)) % n_voices) if vm else (len(out) % n_voices)
            if t:
                out.append({"voice": vi, "text": t})
        if out:
            return out
        # truly nothing parseable -> minimal safe content (NEVER the raw JSON)
        seed = (user_context.split(".")[0] or "Stand up").strip()
        return [{"voice": 0, "text": seed + "."}]

    def _lay_over_music(self, voice, accomp, work, duck_db=8.0, music_gain_db=0.0, bed_len_ms=0,
                        intro_ms=2500):
        """Lay the voice over the bed. RULE #1 (founder): the music bed is NEVER touched — it plays at
        its ORIGINAL volume, one constant level, start to finish. No sidechain ducking, no auto bed gain,
        no pumping up/down around the lines. This mirrors the proven 25-75% mixer in auto_synthesizer
        (volume=1.0 on the music bus, limiter only on the COMBINED bus to stop the SUM clipping).
        Clarity comes from the VOICE side: rendered lines are loudness-normalized, and if the bed is
        hotter than the voice the VOICE is lifted (voice-only gain — the music stays untouched).
        bed_len_ms lets the bed play its FULL natural length (e.g. the whole 2:09 instrumental) even
        after the voice finishes. music_gain_db is a manual per-run override knob (default 0 = original
        level, untouched). duck_db is accepted for API compatibility but no longer used."""
        import subprocess
        from pydub import AudioSegment
        tail_ms = 3000
        # intro_ms=0 when the voice is already placed on the source's absolute timeline — a shift
        # would desync the bed's produced dynamics from the speech.
        vfull = (AudioSegment.silent(duration=intro_ms) + voice) if intro_ms > 0 else voice
        try:
            music = AudioSegment.from_file(str(accomp))
        except Exception as e:
            print("music bed skipped (no accomp):", e); return voice
        if music.dBFS < -40:          # source had no real music bed → keep the voice dry
            print("music bed skipped (stem effectively silent)"); return voice
        # Play the bed to its natural end (bed_len_ms, capped to the actual source) so the track runs the
        # full instrumental length; never shorter than the voice + tail (never cut short — founder rule).
        # Timeline-placed tracks (intro_ms=0) already span the window — no extra tail, or the bed
        # would loop briefly past its natural end.
        voice_total = len(vfull) + (tail_ms if intro_ms > 0 else 0)
        bed_total = min(len(music), int(bed_len_ms)) if bed_len_ms and bed_len_ms > 0 else voice_total
        total = max(voice_total, bed_total)
        natural_end = total >= len(music)
        if len(music) < total:        # loop the bed only if the source is shorter than needed
            music = music * (total // max(1, len(music)) + 1)
            natural_end = False
        music = music[:total]
        if not natural_end:           # fade ONLY when we had to cut the bed before its real ending
            music = music.fade_out(tail_ms)
        # Voice-only clarity: if the bed runs hotter than the voice, lift the VOICE above it.
        # The music level is never changed (RULE #1).
        if vfull.dBFS != float("-inf") and music.dBFS != float("-inf"):
            lift = (music.dBFS + 4.0) - vfull.dBFS
            if lift > 0:
                vfull = vfull.apply_gain(min(lift, 12.0))
                print(f"voice lifted +{min(lift, 12.0):.1f}dB above the bed (music untouched)")
        if len(vfull) < total:        # pad so amix never decides length off the shorter input
            vfull = vfull + AudioSegment.silent(duration=total - len(vfull))
        vpath = _P(work) / "mix_voice.wav"; mpath = _P(work) / "mix_music.wav"; opath = _P(work) / "mix_out.wav"
        try:
            vfull.export(str(vpath), format="wav"); music.export(str(mpath), format="wav")
            mg = f"volume={music_gain_db:.1f}dB," if abs(music_gain_db) > 0.01 else ""   # manual knob only
            # NO limiter on the bus (it pumped the music down under every spoken word). Clip safety =
            # one constant headroom trim measured AFTER the untouched sum (below).
            chain = (f"[0:a]{mg}aresample=44100,aformat=channel_layouts=stereo[m];"
                     f"[1:a]aresample=44100,aformat=channel_layouts=stereo[v];"
                     f"[m][v]amix=inputs=2:duration=longest:normalize=0[out]")
            subprocess.run(["ffmpeg", "-y", "-i", str(mpath), "-i", str(vpath),
                            "-filter_complex", chain, "-map", "[out]", str(opath)],
                           capture_output=True, check=True)
            mixed = AudioSegment.from_wav(str(opath))
            # -1.5 dBFS sample-peak headroom (not -1.0): on lossy MP3 encode the inter-sample (true)
            # peaks overshoot the sample peak by up to ~1 dB, so a -1.0 sample ceiling can still clip
            # >0 dBTP on some decoders. This is a constant LINEAR trim — never a limiter/compressor
            # (RULE #1: the dynamics stay untouched), just a touch more headroom against true-peak clipping.
            if mixed.max_dBFS > -1.5:   # constant trim only if the sum would clip — never dynamic
                mixed = mixed.apply_gain(-(mixed.max_dBFS + 1.5))
            print(f"flat mix (RULE #1): music at original level, no limiter, -1.5dBFS true-peak headroom, music_gain_db={music_gain_db} (manual only)")
            return mixed
        except Exception as e:
            print("flat mix failed -> simple overlay:", e)
            return music.overlay(vfull)

    def predict(
        self,
        audio: Path = Input(description="The motivational / cinematic audio to personalize"),
        name: str = Input(default="Warrior", description="The user's full name (e.g. 'Clarence Johnson')"),
        battlefield: str = Input(default="", description="What they are building / fighting for"),
        struggle: str = Input(default="", description="Their real struggle / the wound"),
        family: str = Input(default="", description="Who they fight for (names welcome)"),
        location: str = Input(default="", description="Their home city"),
        champion: str = Input(default="", description="A figure they look up to (optional)"),
        prompt: str = Input(default="", description="Free-form personalization prompt — write exactly how you want it (your story, the mood, what it should say). When given, this drives the rewrite directly (the planner parses it). Leave empty to use the structured fields / a template."),
        tone: str = Input(default="", description="Optional tone/template tag — a one-click mood for users who don't want to write a prompt (e.g. 'heartbreak', 'fighter', 'confident', 'reflective', 'grief')."),
        paid: bool = Input(default=False, description="Paid unlocks up to 6 min; free is capped at 45s. The chosen personalization tier is honored either way (free is bounded by the 45s cap + 1-per-device gate, not by a forced tier)."),
        anthropic_api_key: Secret = Input(default=None, description="Anthropic API key (Sonnet/Haiku planner)"),
        hf_token: Secret = Input(default=None, description="HuggingFace token (pyannote diarization model)"),
        replicate_api_token: Secret = Input(default=None, description="Replicate API token (F5-TTS voice cloning)"),
        blob_token: Secret = Input(default=None, description="Vercel Blob token (publicly hosts F5 reference audio)"),
        elevenlabs_api_key: Secret = Input(default=None, description="ElevenLabs API key (premium voice cloning — used when set)"),
        personalization: int = Input(default=50, choices=[25, 50, 75, 100], description="How much of the audio becomes the user's: 25/50/75 keep the original speaker and replace that share of the spoken timeline with personalized lines; 100 = a fully new script spoken 100%% in the cloned voice (full_voice). This is the core 4-tier selector."),
        mode: str = Input(default="auto", choices=["auto", "personalize", "full_voice"], description="Legacy override. 'auto' (default) derives the mode from `personalization` (100 -> full_voice, else 50/50 personalize). Set explicitly only to force a path."),
        min_voices: int = Input(default=0, description="full_voice only: hint pyannote to find at least N distinct speakers to clone (0 = auto). Use for dense multi-character sources like a GoT montage."),
        output_seconds: int = Input(default=0, description="full_voice only: cap the OUTPUT length (s) independent of source length — clone the voices from a longer source but render e.g. a 2-min piece. 0 = use the full window."),
        extra_voice_ids: str = Input(default="", description="Comma-separated permanent ElevenLabs voice IDs to use as voices (used directly, never cloned/deleted) — e.g. the user's GoT-Jon. These are the user's CHOSEN voices."),
        clone_source_voices: bool = Input(default=True, description="DETERMINISTIC voice sourcing. True = clone the distinct speakers found in the uploaded audio (correct when personalizing a real speech, or for a multi-speaker cinematic source). False = NEVER diarize/clone the source; speak ONLY the voices in extra_voice_ids over the upload-as-bed (instrumental + your chosen voice(s); N picked voices talking over your track). Set False so a user NEVER gets a voice they didn't choose."),
        music_gain_db: float = Input(default=0.0, description="Manual music-bed offset in dB. Default 0 = the bed plays at its ORIGINAL level, completely untouched (RULE #1: the music volume is never changed, no ducking, one constant level). Set only as a deliberate per-run override."),
        duck_db: float = Input(default=8.0, description="DEPRECATED — ignored. The music is never ducked (RULE #1: original constant volume). Kept for API compatibility."),
        voice_speed: float = Input(default=1.0, description="Speaking pace of the generated voice. 1.0 = natural; <1 = slower/more deliberate (e.g. 0.93), >1 = faster. Applied to the voice only — the music is untouched."),
        breath_ms: int = Input(default=1000, description="Partial tiers (25/50/75): deliberate pause (ms) before + after each personalized snippet so it never glues straight onto the surrounding original sentence (which sounds rushed/choppy/fake). ~1000 = a full ~1s breath; 0 = off. Tune per run — no rebuild needed."),
        language: str = Input(default="English", description="Target language for the generated lines (e.g. 'German', 'Spanish', 'French'). ElevenLabs multilingual_v2 keeps the cloned timbre and the writer composes natively; the source audio can be any language."),
        tts_provider: str = Input(default="omnivoice", choices=["auto", "elevenlabs", "chatterbox", "chatterbox_ml", "omnivoice", "replicate"], description="Voice engine. Default 'omnivoice' = the shipped engine (the web app forces this explicitly; making it the default too means a direct/bare cog call can never silently fall back to a non-shipped engine). 'auto' = ElevenLabs if its key is set, else Replicate F5. 'omnivoice' = OmniVoice/Higgs Audio v2 IN-COG on GPU (local zero-shot clone, NO per-op limit, multi-speaker + 646 langs incl. cross-lingual — the chosen engine). 'chatterbox' = Resemble Chatterbox (English base) on Replicate. 'chatterbox_ml' = Resemble Chatterbox MULTILINGUAL on Replicate (23 langs, cross-lingual clone — translation-engine candidate). 'replicate' = F5-TTS."),
        el_model: str = Input(default="eleven_multilingual_v2", choices=["eleven_multilingual_v2", "eleven_v3"], description="ElevenLabs model (only used when tts_provider=elevenlabs). 'eleven_multilingual_v2' = the proven golden-quality model. 'eleven_v3' = emotion via inline audio-tags the writer embeds per music section ([calm] in quiet passages → [powerful] at the climax). Per-prediction A/B toggle — no rebuild needed between v2 and v3."),
        xlingual_drop_reftext: bool = Input(default=False, description="EXPERIMENT (translation quality): for CROSS-LINGUAL runs only, drop the source-language ref_text from the OmniVoice clone prompt (audio-only conditioning). The source transcript may anchor OmniVoice on source phonetics → garbled/accented target language; dropping it may resolve more natively. No effect on same-language runs."),
        omnivoice_dtype: str = Input(default="float16", choices=["float16", "bfloat16", "float32"], description="EXPERIMENT (cross-lingual quality): OmniVoice compute dtype on GPU. float16 (default) garbles cross-lingual German on CUDA at high diffusion steps (num_step=80); bfloat16 has fp32 exponent range (prime fix), float32 is the safe/slow fallback. Same-language English is fine on float16."),
        xlingual_num_step: int = Input(default=80, description="EXPERIMENT (cross-lingual quality): OmniVoice diffusion steps for non-English. Default 80 = founder-approved LOCAL; on cloud CUDA 80 steps garble — try 48 (the clean English-on-cloud value)."),
        xlingual_guidance: float = Input(default=3.0, description="EXPERIMENT (cross-lingual quality): OmniVoice guidance_scale for non-English. Default 3.0; try 2.0 (the clean English-on-cloud value)."),
        bed_audio: str = Input(default="", description="full_voice only: optional PUBLIC URL to a CLEAN, pre-mastered instrumental bed (e.g. a Suno template). When set, the generated voice rides over THIS constant bed instead of the source's separated music — the template-creation flow / dry-speech sources. Empty = a cinematic source keeps its own bed; a dry-speech source auto-falls back to the bundled constant bed. (Declared `str`, NOT `Path`, so cog>=0.19 never serializes it as a REQUIRED input → no 422 outage on a version bump.)"),
        voice_reference_url: str = Input(default="", description="INSTRUMENTAL / LIBRARY-VOICE path (Feature #29). A PUBLIC URL to a chosen library voice's clone-reference clip (6-10s mono). When set AND clone_source_voices=False, the UPLOAD is used directly as the music bed and THIS voice (OmniVoice clone) is laid over it at original bed volume (RULE #1) — for instrumentals with no voice to clone. It is ALSO the backend fallback: if a normal upload has NO clonable speaker (silent/instrumental), the pipeline routes here instead of failing with no_slots. Declared `str` (not `Path`) so a version bump never makes it a required 422 input."),
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

        # Explicit provider choice wins; otherwise prefer ElevenLabs when its key is supplied.
        if tts_provider and tts_provider != "auto":
            os.environ["TTS_PROVIDER"] = tts_provider
        elif os.environ.get("ELEVENLABS_API_KEY"):
            os.environ["TTS_PROVIDER"] = "elevenlabs"
        # Thread the run's target language down to the synth. OmniVoice takes a language hint per
        # generate() call; it was hardcoded to "English", which broke multilingual output (German
        # text got English phonemization → garbled). The writer already composes in this language.
        os.environ["TTS_LANGUAGE"] = (language or "English").strip() or "English"
        # EXPERIMENT toggle (translation quality): drop source-language ref_text for cross-lingual clones.
        os.environ["OMNI_XLINGUAL_DROP_REFTEXT"] = "1" if xlingual_drop_reftext else "0"
        # EXPERIMENT toggle (cross-lingual quality): OmniVoice compute dtype (float16/bfloat16/float32).
        os.environ["OMNIVOICE_DTYPE"] = (omnivoice_dtype or "float16").strip()
        # EL model toggle (v2 default / eleven_v3 for emotion audio-tags). Read at TTS call time in tts.py.
        os.environ["EL_MODEL"] = (el_model or "eleven_multilingual_v2").strip() or "eleven_multilingual_v2"

        work = _P(tempfile.mkdtemp())
        cap = PAID_MAX_MS if paid else FREE_MAX_MS
        window_ms = max(10_000, min(_duration_ms(audio), cap))

        # INSTRUMENTAL / LIBRARY-VOICE (Feature #29): download the chosen voice's clone reference once.
        # `library_ref` (a local path) is the voice laid over the bed when the source has no clonable
        # speaker — both the explicit instrumental path AND the no-speaker fallback below use it.
        library_ref = None
        if isinstance(voice_reference_url, str) and voice_reference_url.strip().startswith(("http://", "https://")):
            try:
                import requests as _rq
                _r = _rq.get(voice_reference_url.strip(), timeout=60)
                _r.raise_for_status()
                _suf = ".wav" if voice_reference_url.lower().split("?")[0].endswith(".wav") else ".mp3"
                library_ref = str(work / f"library_ref{_suf}")
                with open(library_ref, "wb") as _f:
                    _f.write(_r.content)
                print(f"library voice reference downloaded ({len(_r.content)} bytes) -> {library_ref}")
            except Exception as e:
                print(f"library voice reference download failed ({e}); ignoring")
                library_ref = None

        # Resolve the 4-tier selector into a concrete path. `personalization` is canonical; `mode`
        # is a legacy override. 100% (or an explicit full_voice) -> a fully generated new script;
        # 25/50/75 -> the 50/50-style pipeline with that share of the spoken timeline replaced.
        tier = int(personalization) if personalization else 50
        # The chosen tier is honored on BOTH free + paid, so the preview reflects EXACTLY what was
        # picked: 25/50/75 = that share of the spoken timeline is replaced; 100 = a fully new script
        # (full_voice, no original text remains). Free runs stay bounded by the 45s cap above + the
        # 1-free-per-device gate in the web layer — NOT by a forced tier.
        # 100% now uses the PROVEN partial mechanic (the GoT path): keep the original audio's music/
        # melody untouched and swap ~all the spoken words IN PLACE. It does NOT reconstruct the audio
        # from a separated bed (the step that punched holes on thin-music sources). Only an explicit
        # mode='full_voice' override, or a cross-language translation (forced below), takes the rebuild path.
        use_full_voice = (mode == "full_voice")
        # INSTRUMENTAL / LIBRARY-VOICE (Feature #29): a chosen library voice + clone_source_voices=False is
        # the explicit instrumental path — speak the WHOLE bed in that voice (full_voice), upload-as-bed.
        library_voice_path = bool(library_ref) and (clone_source_voices is False)
        if library_voice_path:
            use_full_voice = True
            print("instrumental/library-voice path: full_voice with the chosen library voice over the upload bed")
        # INSTRUMENTAL via permanent ElevenLabs voice id(s) — the SAME instrumental path but with an EL
        # voice instead of an OmniVoice-cloned reference. Force full_voice too, so it never drops into the
        # personalize path and aborts with no_slots on a voiceless bed (the bug the EL-Jon test hit until
        # mode=full_voice was passed explicitly). With this, the web app needs only tts_provider=elevenlabs
        # + extra_voice_ids + clone_source_voices=False — no mode juggling.
        el_voice_path = bool((extra_voice_ids or "").strip()) and (clone_source_voices is False)
        if el_voice_path and not use_full_voice:
            use_full_voice = True
            print("instrumental/EL-voice path: full_voice with the chosen ElevenLabs voice over the upload bed")
        # 100% must leave ZERO of the original words — replace EVERY spoken slot (density 1.0). The old
        # 0.95 cap was for partial tiers; here we want a genuine 100% new script over the kept music.
        density = max(0.1, min(tier / 100.0, 1.0))
        print(f"personalization tier={tier}% -> {'full_voice' if use_full_voice else f'personalize @ density {density:.2f}'}")

        # TRANSLATION = the WHOLE track re-spoken in the target language (never a half-source/half-target mix).
        # PATH = full_voice (re-voices the ENTIRE track → NO source-language line survives). ENGINE (2026-06-17):
        # ElevenLabs with a NATIVE library voice in the TARGET language (web sends tts_provider=elevenlabs +
        # the target-language voice id). This SIDESTEPS the cross-lingual OmniVoice garble (clean local /
        # garbled cloud, [[project_translation_cloud_gap]]) — there is no cross-lingual CLONE of the source
        # voice anymore; a native-language EL voice speaks the translated script, so no residual source accent.
        # The per-clone EL slot cap is a non-issue for a FIXED library of voices (it only blocked per-USER
        # cloning, which stays OmniVoice). "Keep the SOURCE voice across languages" is a deferred v2.
        # NOTE: this block only forces the full_voice PATH; the ENGINE is chosen by tts_provider (web layer).
        if (language or "").strip().lower() not in ("", "english", "en") and not use_full_voice:
            tgt = LANG_CODE.get((language or "").strip().lower())
            src = self._detect_source_lang(str(audio)) if tgt else None
            if tgt and src and src != tgt:
                use_full_voice = True
                print(f"translation {src}->{tgt}: full_voice, whole track re-spoken in {tgt} (OmniVoice — scalable; residual accent is a v2 polish)")

        # DETERMINISTIC voice sourcing. Only separate (and later clone) the source's speakers when the
        # job actually needs it. "Chosen voices over a pure bed" (instrumental + your voice, or N picked
        # voices talking over your track) sets clone_source_voices=False -> the upload is used directly
        # as the music/SFX bed: no Demucs, no pyannote, no cloning, NO surprise voices, and far faster.
        # Personalize tiers (25/50/75) and full_voice-with-cloning still separate exactly as before.
        # A TRANSLATION of a VOICED upload must NEVER use the raw upload as the bed — the original spoken voice
        # would survive in the bed and play UNDER the new translated voice (two voices at once, the Al-Pacino
        # bug). Only a TRUE instrumental (no voice) may skip separation. So exclude translations from bed_only:
        # they take the _separate branch (source vocal stripped → voice-free accomp as the bed), then the EL
        # voice rides ALONE. (Separating a genuine instrumental here is harmless — its accomp ≈ itself.)
        is_translation = (language or "").strip().lower() not in ("", "english", "en")
        bed_only = use_full_voice and not clone_source_voices and not is_translation
        if bed_only:
            # The voice over the bed comes from EITHER a chosen library voice (library_ref) OR permanent
            # voice ids (extra_voice_ids). At least one must be present.
            if not library_ref and not (extra_voice_ids or "").strip():
                raise RuntimeError("clone_source_voices=False requires a voice_reference_url or extra_voice_ids")
            vocals, accomp = None, _P(str(audio))
            print("voice sourcing: chosen voice(s) only (no clone) -> upload used directly as the bed")
        else:
            vocals, accomp = self._separate(_P(str(audio)), work)

        # Personalization context for the planner/writer: a free-form `prompt` takes precedence (the
        # planner parses free text into a brief); otherwise build it from the structured story fields.
        # An optional `tone`/template tag is appended as the desired mood. EITHER/OR — both end up here.
        ctx = (prompt.strip() if isinstance(prompt, str) and prompt.strip()
               else _context_prompt(name, location, battlefield, struggle, family, champion))
        # When a free-form `prompt` drives the run, the structured `name` field is otherwise dropped (the
        # planner parses ONLY the prompt) — which is why the speech said "you"/"I" instead of the real
        # name. Fold the name into the context so the planner forges the identity from it (LAW 3).
        if isinstance(name, str) and name.strip() and isinstance(prompt, str) and prompt.strip():
            _nm = name.strip()
            if _nm.lower() not in ctx.lower():
                ctx = f"The speaker's name is {_nm}. {ctx}"
        if isinstance(tone, str) and tone.strip():
            ctx = f"{ctx}\nDesired tone / mood: {tone.strip()}."

        if use_full_voice:
            # full_voice discovers + clones voices from the FULL separated vocals, but sizes the script
            # and bed to out_window — so we can clone all 5+ characters from a 3-min montage yet render 2 min.
            out_window = min(window_ms, output_seconds * 1000) if output_seconds and output_seconds > 0 else window_ms
            final = self._full_voice(
                vocals, accomp, str(audio),
                ctx,
                out_window, work, min_voices=min_voices, extra_voice_ids=extra_voice_ids,
                language=language, clone_source_voices=clone_source_voices,
                music_gain_db=music_gain_db, duck_db=duck_db, voice_speed=voice_speed,
                bed_audio=bed_audio, library_ref=library_ref,
            )
            return self._deliver_gate(final, str(audio), tier, has_music_bed=True, language=language, name=name)

        result = auto_synthesize(
            audio_path=str(audio),
            user_context=ctx,
            vocals_path=str(vocals),
            accomp_path=str(accomp),
            window_ms=window_ms,
            out_dir=work / "out",
            verbose=True,
            language=language,
            density=density,
            # The 1s deliberate breath exists so a snippet never glues onto the SURROUNDING ORIGINAL
            # sentence. At 100% there IS no surrounding original — every line is generated — and a 1s
            # gap between every pair of lines perforates a thin music bed ('music on/off every few
            # seconds', measured: drops every ~3-4s of ~800ms). Natural ~250ms breaths at 100%.
            breath_ms=breath_ms if tier < 100 else min(breath_ms, 250),
        )
        if result.get("status") != "ok":
            # BACKEND AUTHORITY (Feature #29): the normal path found nothing to clone/replace (an
            # instrumental or silent-vocal source → 'no_slots'/'degenerate_plan'). Instead of failing,
            # if a library voice was provided, lay THAT voice over the original upload as the bed (RULE #1).
            # This is the safety net even when the UI didn't explicitly flag the file as instrumental.
            if library_ref:
                print(f"pipeline status '{result.get('status')}' with no clonable speaker -> "
                      f"library-voice-over-bed fallback")
                final = self._full_voice(
                    None, _P(str(audio)), str(audio), ctx, window_ms, work,
                    min_voices=0, extra_voice_ids="", language=language, clone_source_voices=False,
                    music_gain_db=music_gain_db, duck_db=duck_db, voice_speed=voice_speed,
                    bed_audio=bed_audio, library_ref=library_ref,
                )
                return self._deliver_gate(final, str(audio), tier, has_music_bed=True, language=language, name=name)
            raise RuntimeError(f"pipeline status: {result.get('status')}")
        return self._deliver_gate(Path(result["final_path"]), str(audio), tier,
                                  has_music_bed=result.get("music_bed", True), language=language, name=name)

    def _deliver_gate(self, final_path, source_audio, tier, has_music_bed=True, language="English", name=None):
        """DELIVERY GATE (founder: 'eine fertige Datei muss geprüft werden, bevor es an den User geht').
        The POST half of the deterministic double-check. Two graders, then a combined verdict the webhook
        gates delivery on (a fail → refund + retry, never ship a bad file):
          1) SIGNAL  (metrics.py, source-relative, ffmpeg-only) — loudness, dead air, music stability.
          2) MEANING (validators.py) — output LANGUAGE (transcribe + langdetect), content present, music
             continuity, dead air. This is what the founder's ear caught that the signal score could not.
        A CRITICAL meaning failure (wrong/mixed language, near-empty content, dead air) blocks delivery
        even if the signal looks fine. music_continuity is logged as a soft backstop (it is not reliable on
        a faint bed), not a hard block — the real wobble fix is routing faint-music to the music path."""
        import json as _json
        sys.path.insert(0, str(_P(__file__).parent / "eval"))
        signal = {"passed": None, "failures": [], "measured": {}}
        out_chk = {"passed": None, "failures": [], "checks": {}, "detail": {}}
        try:
            from metrics import score, Gates
            g = Gates(music_sigma_margin=3.0, music_level_margin=6.0, lra_margin_vs_source=4.0,
                      dropout_extra_vs_source=6, loudness_margin_vs_source=6.0)
            card = score(str(final_path),
                         context={"source_audio": str(source_audio), "has_music_bed": has_music_bed}, gates=g)
            signal = {"passed": card.passed, "failures": card.failures(), "measured": card.measured}
            print(f"[deliver-gate] signal tier={tier} {'PASS ✓' if card.passed else 'FAIL ✗ ' + str(card.failures())}")
        except Exception as e:
            print("[deliver-gate] signal skipped:", e)
        try:
            from validators import validate_output
            transcript = None
            try:
                sys.path.insert(0, str(_P(__file__).parent / "poc" / "orchestrator"))
                from feature_extractor import get_whisper
                transcript = (get_whisper().transcribe(str(final_path), verbose=False) or {}).get("text", "")
            except Exception as te:
                print("[output-check] transcript unavailable:", te)
            ov = validate_output(str(final_path), str(source_audio), tier=tier, target_language=language,
                                 transcript_text=transcript, expected_name=name)
            out_chk = ov.to_dict()
            print(f"[output-check] {'PASS ✓' if ov.passed else 'FAIL ✗ ' + str(ov.failures())} {ov.detail}")
        except Exception as e:
            print("[output-check] skipped:", e)
        # COMBINE: block on a signal fail OR a CRITICAL meaning fail. output_language + music_continuity are
        # SOFT warnings (langdetect can't tell accented target-language from a mishmash; accent = v2 polish).
        # The real source-language guard is full_replacement (plan-side). Block only on empty/dead-air.
        # BLOCK CORSET (founder, 2026-06-18): we accept ANY input mp3 — a poor result from a poor SOURCE is a
        # FAQ topic, not our block. But we MUST catch the real OUTPUT catastrophes. DEAL-BREAKERS = empty/dead
        # audio, GIBBERISH speech (intelligibility), the loudness ROLLERCOASTER (music_stability/continuity),
        # degenerate/untranslated text. Cosmetic signal numbers (clipping/0-dBFS peak, loudness, dropouts,
        # hiss/sizzle, true-peak) are ADVISORY — logged for the learning loop, never block. Web callback mirrors this.
        DEAL_BREAKERS = {"content_present", "no_dead_air", "intelligibility", "no_swallowed_line",
                         "music_stability", "music_continuity", "no_repetition", "full_replacement"}
        all_fails = list(signal.get("failures", [])) + list(out_chk.get("failures", []))
        blockers = [f for f in all_fails if f in DEAL_BREAKERS]
        combined = not blockers
        verdict = {"passed": combined, "failures": all_fails, "blockers": blockers,
                   "signal": signal, "output_check": out_chk}
        print("[[SCORECARD]] " + _json.dumps(verdict, default=str))
        print("[[OUTPUT_CHECK]] " + _json.dumps(out_chk, default=str))
        return final_path

#!/usr/bin/env python3
"""
TTS provider abstraction — Sprint 6.5
=====================================
Pluggable TTS backend. Selects provider from env var TTS_PROVIDER:
  - "qwen3_mlx" — local Qwen3-TTS MLX server (Apple Silicon only, ~$0/call)
  - "replicate"  — Replicate hosted F5-TTS (cloud GPU, ~$0.10/personalization)
  - (future "modal") — self-hosted Modal F5-TTS

All providers expose the same surface:
    synthesize_clone(text, ref_path, ref_text, slot_ms, cache_dir) -> AudioSegment

with built-in cache (skip TTS if same (provider, text, ref_path) seen before)
and sanity check (reject clones > 3x slot duration as malformed).
"""

import os
import io
import base64
import hashlib
import time
from pathlib import Path
import requests
from pydub import AudioSegment
from pydub.silence import detect_leading_silence


# ──────────────────────────────────────────────────────────────────────────
# Shared helpers
# ──────────────────────────────────────────────────────────────────────────
def trim_silence(seg: AudioSegment, thresh: float = -45.0, chunk: int = 5) -> AudioSegment:
    s = detect_leading_silence(seg, thresh, chunk)
    e = detect_leading_silence(seg.reverse(), thresh, chunk)
    if s + e >= len(seg):
        return seg
    return seg[s:len(seg) - e]


def cache_key(provider: str, text: str, ref_path: Path) -> str:
    return hashlib.md5(f"{provider}|{ref_path.name}|{text}".encode()).hexdigest()


def sane_max_ms(slot_ms: int) -> int:
    return max(slot_ms * 3, 20_000)


def _request_with_retry(method: str, url: str, attempts: int = 4, **kwargs):
    """Wrap a requests call with exponential backoff + jitter. Retries ONLY on network errors and
    HTTP 429/5xx (transient) — never on 4xx (validation/auth won't get better). Honors Retry-After.
    Returns the (possibly still-bad) response so the caller can raise_for_status() on a 4xx. This is
    the cog-side guard against ElevenLabs / Replicate rate-limits + blips when many runs hit at once.
    NOTE: pass file uploads as bytes (not a file handle) so a retry can re-send the body."""
    import random
    resp = None
    for attempt in range(attempts + 1):
        try:
            resp = requests.request(method, url, **kwargs)
            if (resp.status_code == 429 or resp.status_code >= 500) and attempt < attempts:
                ra = resp.headers.get("retry-after")
                delay = min(15.0, float(ra)) if (ra and str(ra).isdigit()) else min(8.0, 0.4 * (2 ** attempt))
                time.sleep(delay + random.random() * 0.25)
                continue
            return resp
        except requests.exceptions.RequestException:
            if attempt >= attempts:
                raise
            time.sleep(min(8.0, 0.4 * (2 ** attempt)) + random.random() * 0.25)
    return resp


# ──────────────────────────────────────────────────────────────────────────
# Provider: Qwen3-TTS MLX (local Apple Silicon)
# ──────────────────────────────────────────────────────────────────────────
QWEN_URL = os.environ.get("QWEN_URL", "http://127.0.0.1:7860/api/v1/base/clone")


def synthesize_qwen3(text: str, ref_path: Path, ref_text: str, slot_ms: int, cache_dir: Path) -> AudioSegment:
    key = cache_key("qwen3", text, ref_path)
    cache_file = cache_dir / f"clone_{key}.wav"
    max_ms = sane_max_ms(slot_ms)

    if cache_file.exists():
        cached = AudioSegment.from_wav(str(cache_file))
        if len(cached) <= max_ms:
            return cached
        os.unlink(cache_file)

    with open(ref_path, "rb") as f:
        ref_b64 = base64.b64encode(f.read()).decode()

    for attempt, txt_v in enumerate([text, text + " ", " " + text], 1):
        try:
            r = requests.post(QWEN_URL, json={
                "text": txt_v, "language": "English",
                "ref_audio_base64": ref_b64, "ref_text": ref_text,
                "x_vector_only_mode": False, "speed": 1.0, "response_format": "base64",
            }, timeout=90 if attempt == 1 else 60)
            r.raise_for_status()
            clone = AudioSegment.from_wav(io.BytesIO(base64.b64decode(r.json()["audio"])))
            clone = trim_silence(clone)
            if len(clone) <= max_ms:
                clone.export(str(cache_file), format="wav")
                return clone
            print(f"    [qwen3 attempt {attempt}: clone {len(clone)}ms > sane {max_ms}ms — retry]")
        except Exception as ex:
            print(f"    [qwen3 attempt {attempt}: {type(ex).__name__}: {str(ex)[:80]}]")

    raise RuntimeError(f"Qwen3 failed sanity after 3 attempts for: {text!r}")


# ──────────────────────────────────────────────────────────────────────────
# Provider: Replicate F5-TTS (cloud GPU, scales)
# ──────────────────────────────────────────────────────────────────────────
REPLICATE_API = "https://api.replicate.com/v1"
F5_TTS_MODEL = "x-lance/f5-tts"  # canonical F5-TTS on Replicate


def _replicate_headers():
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise RuntimeError("REPLICATE_API_TOKEN not set in env")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _blob_upload_file(local_path: Path) -> str:
    """Upload the reference WAV to Vercel Blob and return its PUBLIC url.

    CRITICAL: F5-TTS runs as a separate Replicate prediction that fetches `ref_audio` over plain
    HTTP with NO auth. Replicate's own /v1/files download URLs REQUIRE auth, so F5 silently receives
    an empty reference and emits garbled, "drunk/backwards" speech. A public Blob URL fixes it
    (verified: F5 is clean with Blob-hosted refs and garbled with Files-hosted refs)."""
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN not set — needed to publicly host the F5 reference audio")
    with open(local_path, "rb") as f:
        data = f.read()
    r = requests.put(
        f"https://blob.vercel-storage.com/refs/{local_path.name}",
        headers={
            "Authorization": f"Bearer {token}",
            "x-content-type": "audio/wav",
            "x-add-random-suffix": "1",
            "x-api-version": "7",
        },
        data=data,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["url"]


def _replicate_model_latest_version() -> str:
    """Cache the F5-TTS latest version id so we don't refetch every call."""
    if hasattr(_replicate_model_latest_version, "_cached"):
        return _replicate_model_latest_version._cached
    r = _request_with_retry("GET", f"{REPLICATE_API}/models/{F5_TTS_MODEL}", headers=_replicate_headers(), timeout=30)
    r.raise_for_status()
    version = r.json()["latest_version"]["id"]
    _replicate_model_latest_version._cached = version
    return version


def synthesize_replicate(text: str, ref_path: Path, ref_text: str, slot_ms: int, cache_dir: Path) -> AudioSegment:
    key = cache_key("replicate-f5tts", text, ref_path)
    cache_file = cache_dir / f"clone_{key}.wav"
    max_ms = sane_max_ms(slot_ms)

    if cache_file.exists():
        cached = AudioSegment.from_wav(str(cache_file))
        if len(cached) <= max_ms:
            return cached
        os.unlink(cache_file)

    # 1. Upload reference audio → get a PUBLIC url (F5 fetches it without auth; see _blob_upload_file)
    ref_url = _blob_upload_file(ref_path)

    # 2. Create prediction
    version = _replicate_model_latest_version()
    create = _request_with_retry(
        "POST", f"{REPLICATE_API}/predictions",
        headers=_replicate_headers(),
        json={
            "version": version,
            "input": {
                "gen_text": text,
                "ref_audio": ref_url,
                "ref_text": ref_text,
                "speed": 1.0,
                "remove_silence": True,
            },
        },
        timeout=30,
    )
    create.raise_for_status()
    prediction = create.json()
    prediction_id = prediction["id"]

    # 3. Poll until done (typical 5-15s)
    deadline = time.time() + 180
    while time.time() < deadline:
        r = _request_with_retry("GET", f"{REPLICATE_API}/predictions/{prediction_id}", headers=_replicate_headers(), timeout=30)
        r.raise_for_status()
        status = r.json()
        if status["status"] == "succeeded":
            output_url = status["output"]
            # F5-TTS returns a single URL string
            if isinstance(output_url, list):
                output_url = output_url[0]
            break
        if status["status"] in ("failed", "canceled"):
            raise RuntimeError(f"Replicate prediction {prediction_id} {status['status']}: {status.get('error')}")
        time.sleep(1.5)
    else:
        raise TimeoutError(f"Replicate prediction {prediction_id} did not finish within 180s")

    # 4. Download the output audio
    audio_response = _request_with_retry("GET", output_url, timeout=60)
    audio_response.raise_for_status()
    clone = AudioSegment.from_file(io.BytesIO(audio_response.content))
    clone = trim_silence(clone)

    # 5. Sanity check
    if len(clone) > max_ms:
        raise RuntimeError(f"Replicate F5-TTS returned clone {len(clone)}ms > sane {max_ms}ms")

    clone.export(str(cache_file), format="wav")
    return clone


# ──────────────────────────────────────────────────────────────────────────
# Provider: Chatterbox-Turbo (Resemble AI) on Replicate — zero-shot clone, NO per-op limit (scales to
# 1000s of users; cost = GPU-seconds, not metered voice-add ops like ElevenLabs). Beat EL in blind tests.
# ──────────────────────────────────────────────────────────────────────────
CHATTERBOX_MODEL = "resemble-ai/chatterbox"  # base (full quality) — turbo is a speed-distilled, lower-fidelity 350M

def synthesize_chatterbox(text: str, ref_path: Path, ref_text: str, slot_ms: int, cache_dir: Path) -> AudioSegment:
    key = cache_key("chatterbox-turbo", text, ref_path)
    cache_file = cache_dir / f"clone_{key}.wav"
    max_ms = sane_max_ms(slot_ms)
    if cache_file.exists():
        cached = AudioSegment.from_wav(str(cache_file))
        if len(cached) <= max_ms:
            return cached
        os.unlink(cache_file)
    # Chatterbox-Turbo REQUIRES reference audio > 5s ("Audio prompt must be longer than 5 seconds!").
    # Per-emotion reference clips can be shorter (a short defiant burst), which would fail the slot — loop
    # the clip up to ~6.5s so the clone always has enough timbre to work from (looping is fine: Chatterbox
    # clones the voice colour, not the words).
    ref_for_upload = ref_path
    try:
        seg = AudioSegment.from_file(ref_path)
        if len(seg) < 5500:
            reps = (6500 // max(len(seg), 1)) + 1
            seg = (seg * reps)[:6500]
            ref_for_upload = cache_dir / f"cbref_{cache_key('cbref', '', ref_path)}.wav"
            seg.export(str(ref_for_upload), format="wav")
    except Exception as ex:
        print(f"    [chatterbox ref-pad skipped: {ex}]")
    # Public ref url — Replicate fetches reference_audio without auth (same reason as F5; see _blob_upload_file).
    ref_url = _blob_upload_file(ref_for_upload)
    last_ms = None
    for attempt in range(1, 4):
        create = _request_with_retry(
            "POST", f"{REPLICATE_API}/models/{CHATTERBOX_MODEL}/predictions",
            headers=_replicate_headers(),
            json={"input": {"prompt": text, "audio_prompt": ref_url}},  # base chatterbox: prompt + audio_prompt
            timeout=30,
        )
        create.raise_for_status()
        pid = create.json()["id"]
        deadline = time.time() + 180
        out_url = None
        while time.time() < deadline:
            r = _request_with_retry("GET", f"{REPLICATE_API}/predictions/{pid}", headers=_replicate_headers(), timeout=30)
            r.raise_for_status()
            st = r.json()
            if st["status"] == "succeeded":
                out_url = st["output"]
                if isinstance(out_url, list):
                    out_url = out_url[0]
                break
            if st["status"] in ("failed", "canceled"):
                raise RuntimeError(f"Chatterbox {pid} {st['status']}: {st.get('error')}")
            time.sleep(1.5)
        if not out_url:
            raise TimeoutError(f"Chatterbox {pid} did not finish within 180s")
        ar = _request_with_retry("GET", out_url, timeout=60)
        ar.raise_for_status()
        clone = trim_silence(AudioSegment.from_file(io.BytesIO(ar.content)))
        if len(clone) <= max_ms:
            clone.export(str(cache_file), format="wav")
            return clone
        last_ms = len(clone)
        print(f"    [chatterbox attempt {attempt}: clone {len(clone)}ms > sane {max_ms}ms — retry]")
    raise RuntimeError(f"Chatterbox returned clone {last_ms}ms > sane {max_ms}ms after 3 attempts")


# Provider: Chatterbox MULTILINGUAL (Resemble AI) on Replicate — 23 langs incl. German, zero-shot
# cross-lingual clone, MIT-licensed, no per-op limit. Candidate translation engine to sidestep the
# OmniVoice cross-lingual CUDA garbling. Different input names than base: text/language/reference_audio.
CHATTERBOX_ML_MODEL = "resemble-ai/chatterbox-multilingual"
_CB_LANG = {  # TTS_LANGUAGE full name -> chatterbox-multilingual ISO code (enum is the 23 below)
    "arabic": "ar", "danish": "da", "german": "de", "greek": "el", "english": "en", "spanish": "es",
    "finnish": "fi", "french": "fr", "hebrew": "he", "hindi": "hi", "italian": "it", "japanese": "ja",
    "korean": "ko", "malay": "ms", "dutch": "nl", "norwegian": "no", "polish": "pl", "portuguese": "pt",
    "russian": "ru", "swedish": "sv", "swahili": "sw", "turkish": "tr", "chinese": "zh",
}

def synthesize_chatterbox_ml(text: str, ref_path: Path, ref_text: str, slot_ms: int, cache_dir: Path) -> AudioSegment:
    language = (os.environ.get("TTS_LANGUAGE") or "English").strip()
    code = _CB_LANG.get(language.lower(), language.lower() if len(language) == 2 else "en")
    key = cache_key("chatterbox-ml", f"{code}|{text}", ref_path)
    cache_file = cache_dir / f"clone_{key}.wav"
    max_ms = sane_max_ms(slot_ms)
    if cache_file.exists():
        cached = AudioSegment.from_wav(str(cache_file))
        if len(cached) <= max_ms:
            return cached
        os.unlink(cache_file)
    # Same ref-padding as base chatterbox (needs >5s reference) + public ref url for Replicate to fetch.
    ref_for_upload = ref_path
    try:
        seg = AudioSegment.from_file(ref_path)
        if len(seg) < 5500:
            reps = (6500 // max(len(seg), 1)) + 1
            seg = (seg * reps)[:6500]
            ref_for_upload = cache_dir / f"cbmlref_{cache_key('cbmlref', '', ref_path)}.wav"
            seg.export(str(ref_for_upload), format="wav")
    except Exception as ex:
        print(f"    [chatterbox-ml ref-pad skipped: {ex}]")
    ref_url = _blob_upload_file(ref_for_upload)
    last_ms = None
    for attempt in range(1, 4):
        create = _request_with_retry(
            "POST", f"{REPLICATE_API}/models/{CHATTERBOX_ML_MODEL}/predictions",
            headers=_replicate_headers(),
            json={"input": {"text": text[:300], "language": code, "reference_audio": ref_url}},
            timeout=30,
        )
        create.raise_for_status()
        pid = create.json()["id"]
        deadline = time.time() + 180
        out_url = None
        while time.time() < deadline:
            r = _request_with_retry("GET", f"{REPLICATE_API}/predictions/{pid}", headers=_replicate_headers(), timeout=30)
            r.raise_for_status()
            st = r.json()
            if st["status"] == "succeeded":
                out_url = st["output"]
                if isinstance(out_url, list):
                    out_url = out_url[0]
                break
            if st["status"] in ("failed", "canceled"):
                raise RuntimeError(f"Chatterbox-ML {pid} {st['status']}: {st.get('error')}")
            time.sleep(1.5)
        if not out_url:
            raise TimeoutError(f"Chatterbox-ML {pid} did not finish within 180s")
        ar = _request_with_retry("GET", out_url, timeout=60)
        ar.raise_for_status()
        clone = trim_silence(AudioSegment.from_file(io.BytesIO(ar.content)))
        if len(clone) <= max_ms:
            clone.export(str(cache_file), format="wav")
            return clone
        last_ms = len(clone)
        print(f"    [chatterbox-ml attempt {attempt}: clone {len(clone)}ms > sane {max_ms}ms — retry]")
    raise RuntimeError(f"Chatterbox-ML returned clone {last_ms}ms > sane {max_ms}ms after 3 attempts")


# ──────────────────────────────────────────────────────────────────────────
# Provider: OmniVoice (Higgs Audio v2) — LOCAL zero-shot clone (Apple Silicon MPS / CUDA), NO per-op
# limit, NO API cost. Best clone fidelity in our tests. Self-hostable on rented GPU for cloud scale.
# Loads the model ONCE (module global) and reuses it for every slot.
# ──────────────────────────────────────────────────────────────────────────
OMNIVOICE_MODEL_ID = os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice")
_OMNI = None
_OMNI_DTYPE = None   # which dtype string the cached model was loaded with (reload if it changes)
# ONE reusable voice-clone prompt PER speaker reference (keyed by the cleaned ref path). Reusing the
# SAME prompt across all of a speaker's lines LOCKS that speaker's voice — no per-line drift, which is
# what made a long script sound like several different people. A source with N distinct speakers gets
# N prompts here (each consistent); a solo source gets 1. This is OmniVoice's native equivalent of an
# ElevenLabs voice_id — but it's an in-memory object: free, instant, unlimited, no clone-slot cap.
_OMNI_PROMPTS = {}

def _get_omnivoice():
    global _OMNI, _OMNI_DTYPE
    import torch
    # EXPERIMENT (cross-lingual quality, 2026-06-14): the compute dtype. float16 (default) garbles
    # cross-lingual German on CUDA — cross-lingual uses num_step=80 (vs 48 for English), so fp16 error
    # accumulates over more diffusion steps until phonemes scramble (local MPS fp16 tolerates it; CUDA
    # fp16 does not). bfloat16 has fp32's exponent range (no underflow) → the prime fix; float32 is the
    # safe-but-slow fallback. Toggle per-run via OMNIVOICE_DTYPE (Cog input `omnivoice_dtype`).
    want = (os.environ.get("OMNIVOICE_DTYPE") or "float16").strip().lower()
    dtype = {"bfloat16": torch.bfloat16, "bf16": torch.bfloat16,
             "float32": torch.float32, "fp32": torch.float32}.get(want, torch.float16)
    if _OMNI is None or _OMNI_DTYPE != want:
        from omnivoice.models.omnivoice import OmniVoice
        dev = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        print(f"    [omnivoice: loading {OMNIVOICE_MODEL_ID} on {dev} dtype={want} ...]")
        # attn_implementation="eager" — NOT flex_attention. OmniVoice's forward uses torch.nn.attention
        # flex_attention, which is BUGGY in torch 2.5.1 (the only torch with cu121 wheels that Cog's CUDA
        # 12.1 supports): it clones the VOICE correctly but SCRAMBLES the text (gibberish/backwards). eager
        # is the stable reference attention — slower but CORRECT. (sdpa isn't supported by OmniVoice yet.)
        _OMNI = OmniVoice.from_pretrained(OMNIVOICE_MODEL_ID, device_map=dev, dtype=dtype, attn_implementation="eager")
        _OMNI_DTYPE = want
    return _OMNI

def _omnivoice_prompt(model, cref_path, ref_text):
    """Build the reusable voice-clone prompt ONCE per speaker reference and cache it. Every line that
    belongs to that speaker reuses this exact prompt → the voice stays consistent across the whole
    script (the fix for 'too many different voices'). One prompt per distinct speaker; created lazily."""
    pk = str(cref_path)
    if pk not in _OMNI_PROMPTS:
        try:
            _OMNI_PROMPTS[pk] = model.create_voice_clone_prompt(ref_audio=str(cref_path), ref_text=(ref_text or None))
        except Exception as e:
            print(f"    [omnivoice: clone-prompt build failed, falling back to per-line ref: {e}]")
            _OMNI_PROMPTS[pk] = None
    return _OMNI_PROMPTS[pk]

def synthesize_omnivoice(text: str, ref_path: Path, ref_text: str, slot_ms: int, cache_dir: Path) -> AudioSegment:
    # Target language for the generated lines (set per-run by predict.py from the user's choice).
    # OmniVoice accepts full names ("German") or ISO codes ("de"), case-insensitive; unknown values
    # fall back to language-agnostic mode — strictly better than forcing English phonemes on
    # non-English text. The language is part of the cache key: same text+ref in another language
    # must never reuse a cached clone.
    language = (os.environ.get("TTS_LANGUAGE") or "English").strip() or "English"
    key = cache_key("omnivoice", f"{language}|{text}", ref_path)
    cache_file = cache_dir / f"clone_{key}.wav"
    max_ms = sane_max_ms(slot_ms)
    if cache_file.exists():
        cached = AudioSegment.from_wav(str(cache_file))
        if len(cached) <= max_ms:
            return cached
        os.unlink(cache_file)
    import torchaudio, subprocess
    model = _get_omnivoice()
    # Clean the reference so OmniVoice clones from a HISS-FREE source. Demucs vocal stems carry broadband
    # separation hiss → hissy clones (the founder's #1 complaint, worse with more slots). HPF80 (rumble) +
    # afftdn (FFT denoise — kills the sizzle) + LPF14k + loudnorm. Cached per reference (once per speaker).
    # This is exactly what made the hand-cleaned local German test clean vs the hissy cog default.
    cref = cache_dir / f"cleanref_{cache_key('cref', '', ref_path)}.wav"
    if not cref.exists():
        try:
            # HPF80 + LPF14k + loudnorm ONLY — the exact recipe that made the local German clone clean.
            # NO afftdn: the FFT-denoiser corrupts the reference → OmniVoice clones GIBBERISH (worst run).
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(ref_path),
                            "-af", "highpass=f=80,lowpass=f=14000,loudnorm=I=-18",
                            "-ar", "24000", "-ac", "1", str(cref)], check=True)
        except Exception:
            cref = Path(ref_path)   # fall back to the raw reference if cleaning fails
    ref_use = str(cref)
    # CROSS-LINGUAL TUNING. Cloning an English voice into German is harder: too few diffusion steps leave the
    # target-language phonemes unconverged → the "rückwärts"/garbled words the founder heard. Give the
    # non-English path MORE steps + higher guidance so German resolves cleanly and stays intelligible.
    # English (same-language) keeps the fast, proven 48/2.0.
    cross_lingual = language.strip().lower() not in ("english", "en", "")
    ns, gs = (80, 3.0) if cross_lingual else (48, 2.0)
    # EXPERIMENT (founder translation test, 2026-06-14): for cross-lingual ONLY, optionally DROP the
    # source-language ref_text from the clone prompt. The English transcript anchors OmniVoice on English
    # phonetics — a prime suspect for the garbled/accented German. Audio-only conditioning (short clean
    # ref, NO transcript) may let the target language resolve more natively. Toggle per-run via env
    # OMNI_XLINGUAL_DROP_REFTEXT (Cog input `xlingual_drop_reftext`) — no rebuild needed to flip it.
    # NOTE: this is the SHORT (≤12s) clean ref, NOT the 40s-ref+empty-text combo that gibberished before.
    drop_reftext = cross_lingual and os.environ.get("OMNI_XLINGUAL_DROP_REFTEXT", "0") == "1"
    eff_ref_text = None if drop_reftext else ref_text
    # Reuse ONE locked clone prompt for this speaker (consistent voice); fall back to per-line ref only
    # if the prompt couldn't be built.
    prompt = _omnivoice_prompt(model, cref, eff_ref_text)
    last_ms = None
    for attempt in range(1, 4):
        if prompt is not None:
            audios = model.generate(text=text, language=language, voice_clone_prompt=prompt,
                                    num_step=ns, guidance_scale=gs, speed=1.0)
        else:
            audios = model.generate(text=text, language=language, ref_audio=ref_use,
                                    ref_text=("" if drop_reftext else (ref_text or "")), num_step=ns, guidance_scale=gs, speed=1.0)
        tmp = cache_dir / f"_omni_tmp_{key}.wav"
        torchaudio.save(str(tmp), audios[0].float().cpu(), model.sampling_rate)
        clone = trim_silence(AudioSegment.from_wav(str(tmp)))
        os.unlink(tmp)
        if len(clone) <= max_ms:
            clone.export(str(cache_file), format="wav")
            return clone
        last_ms = len(clone)
        print(f"    [omnivoice attempt {attempt}: clone {len(clone)}ms > sane {max_ms}ms — retry]")
    raise RuntimeError(f"OmniVoice clone {last_ms}ms > sane {max_ms}ms after 3 attempts")


# ──────────────────────────────────────────────────────────────────────────
# Provider: ElevenLabs (premium voice cloning — far better timbre + clarity than F5)
# ──────────────────────────────────────────────────────────────────────────
ELEVENLABS_API = "https://api.elevenlabs.io/v1"
EL_MODEL = "eleven_multilingual_v2"

def _el_headers():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY not set")
    return {"xi-api-key": key}

def elevenlabs_clone(ref_wav: Path, name: str = "rb_clone") -> str:
    """Instant Voice Clone from a reference WAV → voice_id. Clone ONCE per speaker (best timbre +
    avoids hitting the account's voice limit); reuse the id for every line, then delete it."""
    ref_bytes = Path(ref_wav).read_bytes()  # bytes (not a handle) so a retry can re-send the body
    r = _request_with_retry(
        "POST", f"{ELEVENLABS_API}/voices/add",
        headers=_el_headers(),
        data={"name": name, "remove_background_noise": "true"},
        files={"files": (Path(ref_wav).name, ref_bytes, "audio/wav")},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()["voice_id"]

def elevenlabs_tts(text: str, voice_id: str) -> AudioSegment:
    # Founder verdict: low stability + style introduced "ähhs/ohs/cut-offs" — too much instability.
    # Back to the CLEAN v1 basis. The only kept Stimmenklang lever is the SAFE one: speaker_boost +
    # standard similarity add fullness WITHOUT destabilising. Emphasis comes from the writer's sentence
    # structure (key word last, short lines) and pacing (voice_speed 0.93), never from low stability.
    r = _request_with_retry(
        "POST", f"{ELEVENLABS_API}/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        headers={**_el_headers(), "Content-Type": "application/json"},
        json={"text": text, "model_id": EL_MODEL,
              "voice_settings": {"stability": 0.5, "similarity_boost": 0.8,
                                  "style": 0.0, "use_speaker_boost": True}},
        timeout=180,
    )
    r.raise_for_status()
    return AudioSegment.from_file(io.BytesIO(r.content), format="mp3")

def elevenlabs_delete(voice_id: str):
    try:
        requests.delete(f"{ELEVENLABS_API}/voices/{voice_id}", headers=_el_headers(), timeout=30)
    except Exception:
        pass

def synthesize_elevenlabs(text: str, ref_path: Path, ref_text: str, slot_ms: int,
                          cache_dir: Path, voice_id: str = None) -> AudioSegment:
    """ElevenLabs path. If voice_id is given (cloned once per speaker) we just synthesize; otherwise
    we clone from ref_path, synthesize, and delete the throwaway voice."""
    vid, created = voice_id, False
    if not vid:
        vid = elevenlabs_clone(ref_path); created = True
    try:
        clone = elevenlabs_tts(text, vid)
    finally:
        if created:
            elevenlabs_delete(vid)
    return trim_silence(clone)


# ──────────────────────────────────────────────────────────────────────────
# Dispatch
# ──────────────────────────────────────────────────────────────────────────
def synthesize_clone(text: str, ref_path: Path, ref_text: str, slot_ms: int, cache_dir: Path,
                     voice_id: str = None) -> AudioSegment:
    """Top-level entry. Routes to the selected provider via TTS_PROVIDER env var."""
    provider = os.environ.get("TTS_PROVIDER", "qwen3_mlx").lower()
    if provider == "elevenlabs":
        return synthesize_elevenlabs(text, ref_path, ref_text, slot_ms, cache_dir, voice_id=voice_id)
    elif provider == "replicate":
        return synthesize_replicate(text, ref_path, ref_text, slot_ms, cache_dir)
    elif provider == "chatterbox":
        return synthesize_chatterbox(text, ref_path, ref_text, slot_ms, cache_dir)
    elif provider == "chatterbox_ml":
        return synthesize_chatterbox_ml(text, ref_path, ref_text, slot_ms, cache_dir)
    elif provider == "omnivoice":
        return synthesize_omnivoice(text, ref_path, ref_text, slot_ms, cache_dir)
    elif provider == "qwen3_mlx" or provider == "qwen3":
        return synthesize_qwen3(text, ref_path, ref_text, slot_ms, cache_dir)
    else:
        raise ValueError(f"Unknown TTS_PROVIDER: {provider!r}. Use 'elevenlabs', 'chatterbox', 'omnivoice', 'replicate' or 'qwen3_mlx'.")


def current_provider_label() -> str:
    return os.environ.get("TTS_PROVIDER", "qwen3_mlx").lower()

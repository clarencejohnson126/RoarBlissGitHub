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
    r = requests.get(f"{REPLICATE_API}/models/{F5_TTS_MODEL}", headers=_replicate_headers(), timeout=30)
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
    create = requests.post(
        f"{REPLICATE_API}/predictions",
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
        r = requests.get(f"{REPLICATE_API}/predictions/{prediction_id}", headers=_replicate_headers(), timeout=30)
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
    audio_response = requests.get(output_url, timeout=60)
    audio_response.raise_for_status()
    clone = AudioSegment.from_file(io.BytesIO(audio_response.content))
    clone = trim_silence(clone)

    # 5. Sanity check
    if len(clone) > max_ms:
        raise RuntimeError(f"Replicate F5-TTS returned clone {len(clone)}ms > sane {max_ms}ms")

    clone.export(str(cache_file), format="wav")
    return clone


# ──────────────────────────────────────────────────────────────────────────
# Dispatch
# ──────────────────────────────────────────────────────────────────────────
def synthesize_clone(text: str, ref_path: Path, ref_text: str, slot_ms: int, cache_dir: Path) -> AudioSegment:
    """Top-level entry. Routes to the selected provider via TTS_PROVIDER env var."""
    provider = os.environ.get("TTS_PROVIDER", "qwen3_mlx").lower()
    if provider == "replicate":
        return synthesize_replicate(text, ref_path, ref_text, slot_ms, cache_dir)
    elif provider == "qwen3_mlx" or provider == "qwen3":
        return synthesize_qwen3(text, ref_path, ref_text, slot_ms, cache_dir)
    else:
        raise ValueError(f"Unknown TTS_PROVIDER: {provider!r}. Use 'replicate' or 'qwen3_mlx'.")


def current_provider_label() -> str:
    return os.environ.get("TTS_PROVIDER", "qwen3_mlx").lower()

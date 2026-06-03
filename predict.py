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
        ):
            if sec is None:
                continue
            try:
                val = sec.get_secret_value()
            except AttributeError:
                val = str(sec)
            if val:
                os.environ[var] = val

        work = _P(tempfile.mkdtemp())
        vocals, accomp = self._separate(_P(str(audio)), work)

        cap = PAID_MAX_MS if paid else FREE_MAX_MS
        window_ms = max(10_000, min(_duration_ms(audio), cap))

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

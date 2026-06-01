#!/usr/bin/env python3
"""
Web Pipeline Wrapper — Sprint 5
================================
Bridges the Next.js web frontend to the auto_synthesizer end-to-end pipeline.

Takes form fields from the frontend (name / battlefield / struggle / family /
location / champion) and synthesizes them into a free-form context prompt,
then runs Demucs (if needed) + auto_synthesizer.

Writes session logs in the format the web /api/logs endpoint expects:
  [HH:MM:SS] [STAGE] message

When done, writes the final MP3 to {output_dir}/{session_id}_output.mp3
so the frontend can play it via /output/{session_id}_output.mp3
"""

import os, sys, argparse, subprocess, hashlib, shutil
from pathlib import Path
from datetime import datetime

# Make local orchestrator imports work no matter how this script is invoked
sys.path.insert(0, str(Path(__file__).parent))

def log_line(log_path: Path, stage: str, message: str):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] [{stage}] {message}\n"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(line)
    print(line.rstrip(), flush=True)

def build_context_prompt(args) -> str:
    """Compose a free-form context prompt from the structured form fields."""
    parts = []
    parts.append(f"My name is {args.name}.")
    if args.location:
        parts.append(f"I live in {args.location}.")
    if args.battlefield:
        parts.append(f"Right now I'm focused on: {args.battlefield}.")
    if args.struggle:
        parts.append(f"My biggest struggle: {args.struggle}.")
    if args.family:
        parts.append(f"My family / inner circle: {args.family}.")
    if args.champion:
        parts.append(f"I look up to {args.champion}.")
    return " ".join(parts)

def run_demucs(input_audio: Path, out_root: Path, log_path: Path) -> tuple[Path, Path]:
    """Demucs-separate the input audio into vocals + no_vocals.
    Caches by audio sha256 — same audio uploaded twice → instant cache hit."""
    # Hash the audio
    with open(input_audio, "rb") as f:
        audio_hash = hashlib.sha256(f.read()).hexdigest()[:16]

    cache_dir = out_root / "demucs_cache" / audio_hash
    vocals_path = cache_dir / "vocals.wav"
    no_vocals_path = cache_dir / "no_vocals.wav"

    if vocals_path.exists() and no_vocals_path.exists():
        log_line(log_path, "STEM SPLITTER", f"Cached separation found (hash {audio_hash}); reusing.")
        return vocals_path, no_vocals_path

    cache_dir.mkdir(parents=True, exist_ok=True)
    log_line(log_path, "STEM SPLITTER", "Running Demucs separation (this takes ~3-5 minutes)...")
    # Run Demucs with the SAME interpreter that's running this script.
    # (The old code hardcoded poc/venv/bin/python, which doesn't exist inside the
    #  Docker container where deps are installed system-wide — that broke every
    #  cloud job at the stem-splitting step.) Prefer a local venv if present (dev Mac),
    #  otherwise fall back to the current interpreter (container / system python).
    venv_python = Path(__file__).parent.parent / "venv" / "bin" / "python"
    demucs_python = str(venv_python) if venv_python.exists() else sys.executable
    cmd = [
        demucs_python, "-m", "demucs",
        "--two-stems=vocals",
        "--out", str(cache_dir),
        str(input_audio),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log_line(log_path, "ERROR", f"Demucs failed: {result.stderr[:300]}")
        raise RuntimeError(f"Demucs separation failed: {result.stderr[:200]}")

    # Demucs output naming pattern: cache_dir/htdemucs/<filename_stem>/{vocals,no_vocals}.wav
    stem = input_audio.stem
    demucs_out = cache_dir / "htdemucs" / stem
    if not demucs_out.exists():
        # Search for vocals.wav recursively
        candidates = list(cache_dir.rglob("vocals.wav"))
        if not candidates:
            raise FileNotFoundError(f"Demucs vocals.wav not found in {cache_dir}")
        demucs_out = candidates[0].parent

    # Move to canonical location
    shutil.move(str(demucs_out / "vocals.wav"), str(vocals_path))
    shutil.move(str(demucs_out / "no_vocals.wav"), str(no_vocals_path))
    log_line(log_path, "STEM SPLITTER", "Demucs separation complete.")
    return vocals_path, no_vocals_path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--battlefield", default="")
    parser.add_argument("--struggle", default="")
    parser.add_argument("--family", default="")
    parser.add_argument("--location", default="")
    parser.add_argument("--champion", default="")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--window-ms", type=int, default=180_000)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / f"{args.session_id}_logs.txt"

    # If the API already wrote a bootstrap line, append; otherwise create fresh
    if not log_path.exists():
        log_line(log_path, "ROAR BLISS CORE", "Bootstrapping personalization pipeline...")

    try:
        # ── Build the context prompt ────────────────────────────────────
        context = build_context_prompt(args)
        log_line(log_path, "CONTEXT", f"Brief: {context[:140]}{'...' if len(context)>140 else ''}")

        # ── Step 1: Demucs (with audio-hash cache) ─────────────────────
        vocals_path, no_vocals_path = run_demucs(Path(args.input), output_dir, log_path)

        # ── Step 2: run the auto_synthesizer ────────────────────────────
        log_line(log_path, "ORCHESTRATOR", "Starting audio understanding (classify + diarize + reference library)...")
        log_line(log_path, "ORCHESTRATOR", "This includes Whisper transcription, pyannote diarization, and per-speaker emotion tagging.")

        from auto_synthesizer import auto_synthesize
        per_session_out = output_dir / f"{args.session_id}_work"
        per_session_out.mkdir(exist_ok=True)

        result = auto_synthesize(
            audio_path=str(Path(args.input)),
            user_context=context,
            vocals_path=str(vocals_path),
            accomp_path=str(no_vocals_path),
            window_ms=args.window_ms,
            out_dir=per_session_out,
            verbose=False,  # we have our own log lines
        )

        if result.get("status") != "ok":
            log_line(log_path, "ERROR", f"Synthesizer status: {result.get('status')}")
            sys.exit(1)

        log_line(log_path, "SYNTHESIZER", f"Type detected: {result['audio_type']} ({result['audio_type_label']})")
        log_line(log_path, "SYNTHESIZER", f"User themes: {result['user_brief'].get('themes', [])}")
        log_line(log_path, "SYNTHESIZER", f"Slots synthesized: {result['slots_ok']} / {result['slot_count']}")

        # Per-slot log lines for the UI to render
        for slot in result.get("slots", []):
            if slot.get("status") == "ok":
                log_line(log_path, "SLOT",
                          f"#{slot['id']:2d} [{slot['speaker']}|{slot['emotion']}] "
                          f"{slot['slot_ms']}ms → \"{slot['text']}\"")

        # ── Step 3: copy final MP3 to web-accessible output paths ──────
        # AudioVisualizer expects {sessionId}_full.mp3 (and optionally _preview).
        # Write both naming conventions so existing UI just works.
        src = Path(result["final_path"])
        dest_output = output_dir / f"{args.session_id}_output.mp3"
        dest_full = output_dir / f"{args.session_id}_full.mp3"
        dest_preview = output_dir / f"{args.session_id}_preview.mp3"
        shutil.copy(str(src), str(dest_output))
        shutil.copy(str(src), str(dest_full))
        # Preview = first 30 seconds (for locked/ungated playback)
        from pydub import AudioSegment as _AS
        try:
            preview = _AS.from_file(str(src))[:30_000]
            preview.export(str(dest_preview), format="mp3", bitrate="192k")
        except Exception:
            shutil.copy(str(src), str(dest_preview))
        log_line(log_path, "SUCCESS", f"Personalized audio ready at /output/{args.session_id}_full.mp3")

    except Exception as ex:
        log_line(log_path, "ERROR", f"Pipeline crash: {type(ex).__name__}: {str(ex)[:200]}")
        sys.exit(1)

if __name__ == "__main__":
    main()

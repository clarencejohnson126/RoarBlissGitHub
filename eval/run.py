#!/usr/bin/env python3
"""
eval/run.py — the offline quality GATE.

Runs each golden-corpus entry through the PRODUCTION cog (the real Replicate model, never a Mac
shortcut), scores every output with the battery in eval/metrics.py, and prints a red/green scorecard.
The rule: no cog version is pinned to production unless this run is green.

Usage:
  python3 eval/run.py                       # all corpus entries (prints est. cost first)
  python3 eval/run.py --ids id1,id2         # a subset
  python3 eval/run.py --version <cog_ver>   # gate a specific cog version (default: latest pushed)

Env: read from web/.env.local (REPLICATE_API_TOKEN, ANTHROPIC_API_KEY, HF_TOKEN, BLOB_READ_WRITE_TOKEN).
Note: on a box without Whisper/pyannote/Anthropic, the SIGNAL evaluator runs and the speech/speaker/
judge checks report "not measured". The full battery runs once the cog emits its own scorecard
(it has the script + clone refs + all deps) — wired next; this gate already enforces the audio battery.
"""
import argparse, json, re, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import metrics  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.replicate.com/v1"
MODEL = "clarencejohnson126/roar-bliss"
EST_COST_PER_RUN = 0.20  # rough $/run for the cost notice


def load_env() -> dict:
    env = {}
    for line in (ROOT / "web" / ".env.local").read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip()
    return env


ENV = load_env()
TOKEN = ENV.get("REPLICATE_API_TOKEN", "")
# A real User-Agent is REQUIRED: Cloudflare 403s urllib's default UA on the Replicate API.
HDR = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "roar-bliss-eval/1.0"}


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers=HDR)
    return json.load(urllib.request.urlopen(req, timeout=60))


def latest_version() -> str:
    return _get(f"{API}/models/{MODEL}")["latest_version"]["id"]


def upload(path: str) -> str:
    """Upload an audio file via the Replicate Files API (curl handles multipart); returns a fetch URL."""
    r = subprocess.run(["curl", "-s", "-X", "POST", f"{API}/files",
                        "-H", f"Authorization: Bearer {TOKEN}", "-F", f"content=@{path}"],
                       capture_output=True, text=True)
    d = json.loads(r.stdout)
    return d["urls"]["get"]


def create_prediction(version: str, inp: dict) -> dict:
    body = json.dumps({"version": version, "input": inp}).encode()
    req = urllib.request.Request(f"{API}/predictions", body,
                                 {**HDR, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def run_entry(entry: dict, version: str) -> dict:
    secrets = {
        "anthropic_api_key": ENV.get("ANTHROPIC_API_KEY", ""),
        "hf_token": ENV.get("HF_TOKEN", ""),
        "blob_token": ENV.get("BLOB_READ_WRITE_TOKEN", ""),
        "replicate_api_token": TOKEN,
        "elevenlabs_api_key": ENV.get("ELEVENLABS_API_KEY", ""),
    }
    print(f"  ↑ uploading {Path(entry['audio']).name} …")
    audio_url = upload(entry["audio"])
    inp = {**entry["input"], "audio": audio_url, **secrets}
    pred = create_prediction(version, inp)
    pid = pred["id"]
    print(f"  → prediction {pid} (cog {version[:12]}) …")
    t0 = time.time()
    while pred["status"] in ("starting", "processing"):
        time.sleep(10)
        pred = _get(f"{API}/predictions/{pid}")
        sys.stdout.write(f"\r    [{int(time.time()-t0)}s] {pred['status']}   ")
        sys.stdout.flush()
    print()
    result = {"id": entry["id"], "type": entry["type"], "prediction_id": pid,
              "status": pred["status"], "predict_time": (pred.get("metrics") or {}).get("predict_time")}
    # capture the cog's own self-check line (its in-cog signal scorecard)
    logs = pred.get("logs") or ""
    sc = [ln.strip() for ln in logs.splitlines() if "[self-check]" in ln]
    result["cog_self_check"] = sc[-2:] if sc else []
    if pred["status"] != "succeeded" or not pred.get("output"):
        result["scorecard"] = {"passed": False, "error": pred.get("error") or "no output"}
        return result
    out_url = pred["output"][0] if isinstance(pred["output"], list) else pred["output"]
    tmp = ROOT / "eval" / f"_out_{entry['id']}.mp3"
    subprocess.run(["curl", "-s", "-L", "-o", str(tmp), out_url], check=True)
    # source_audio rides along automatically: every corpus run is judged against ITS OWN source
    # (music isolation, source-relative dynamics) — the founder's "MESSE!" metric.
    card = metrics.score(str(tmp), context={**entry.get("context", {}), "source_audio": entry["audio"]})
    result["scorecard"] = card.to_dict()
    result["output_file"] = str(tmp)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default=None, help="comma-separated entry ids (default: all)")
    ap.add_argument("--version", default=None, help="cog version to gate (default: latest pushed)")
    ap.add_argument("--yes", action="store_true", help="skip the cost confirmation")
    a = ap.parse_args()

    corpus = json.loads((ROOT / "eval" / "corpus.json").read_text())
    entries = corpus["entries"]
    if a.ids:
        wanted = set(a.ids.split(","))
        entries = [e for e in entries if e["id"] in wanted]
    version = a.version or latest_version()

    print(f"\nGate: {len(entries)} entries × cog {version[:12]} ≈ ${len(entries)*EST_COST_PER_RUN:.2f} GPU")
    if not a.yes:
        if input("  proceed? [y/N] ").strip().lower() != "y":
            print("  aborted."); return

    results = []
    for e in entries:
        print(f"\n▶ {e['id']}  ({e['type']})")
        try:
            results.append(run_entry(e, version))
        except Exception as ex:
            print(f"  ✗ run failed: {ex}")
            results.append({"id": e["id"], "status": "error", "scorecard": {"passed": False, "error": str(ex)}})

    # ── scorecard ──────────────────────────────────────────────────────────
    print("\n" + "=" * 72)
    print(" CORPUS SCORECARD")
    print("=" * 72)
    n_pass = 0
    for r in results:
        sc = r.get("scorecard", {})
        ok = sc.get("passed", False)
        n_pass += 1 if ok else 0
        m = sc.get("measured", {})
        line = f" {'PASS ✓' if ok else 'FAIL ✗'}  {r['id']:34}"
        if m:
            line += f"  LRA={m.get('lra')} drops={m.get('dropouts')} loud={m.get('integrated_lufs')}"
        print(line)
        fails = [k for k, v in (sc.get("checks") or {}).items() if v is False]
        if fails:
            print(f"          failed: {fails}")
        for s in r.get("cog_self_check", []):
            print(f"          cog: {s}")
    print("=" * 72)
    print(f" {n_pass}/{len(results)} GREEN  →  {'GATE PASS — safe to pin this version' if n_pass == len(results) else 'GATE FAIL — do not ship'}")
    print("=" * 72)

    out = ROOT / "eval" / "last_results.json"
    out.write_text(json.dumps({"version": version, "results": results}, indent=2, default=str))
    print(f"\n full results -> {out}")
    sys.exit(0 if n_pass == len(results) else 1)


if __name__ == "__main__":
    main()

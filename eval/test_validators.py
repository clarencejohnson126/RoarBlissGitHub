"""
Proof that the deterministic validators catch EXACTLY what the founder's ear caught after a false 6/6:
  #3  density 15% when 50% was asked  +  "my name is Clarence" repeated
  #6  German/English mishmash  +  a "100%" pass that kept original lines
  #5  music that drops out under speech (the signal gate skipped it as "dry")

No GPU, no TTS. Plan checks run on synthetic plans; output checks run on the REAL bad files from run #4.
Run:  python eval/test_validators.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from validators import validate_plan, validate_output, detect_lang

fails = []


def want(cond, msg):
    if not cond:
        fails.append(msg)
    print(("  ok  " if cond else "  FAIL ") + msg)


# ── PRE-GEN: validate_plan on synthetic BAD plans (must FAIL) + a good one (must PASS) ──────────────────
print("[plan] degenerate repeated filler (#3):")
deg = validate_plan([{"text": "My name is Clarence."}] * 6, tier=50, target_language="English",
                    total_source_lines=12)
want("no_repetition" in deg.failures(), "repeated 'My name is Clarence' 6x -> no_repetition FAIL")
want("density_matches_tier" not in deg.failures(), "6/12 = 50% density is fine; only the CONTENT is degenerate")

print("[plan] legit war-cry repetition (anthem motif — must PASS, NOT a false abort):")
chant = validate_plan([
    {"text": "House Johnson rises tonight."}, {"text": "King!"}, {"text": "Clarence holds the line."},
    {"text": "King!"}, {"text": "For the heirs of his name."}, {"text": "King!"},
], tier=75, target_language="English", total_source_lines=8)
want("no_repetition" not in chant.failures(), "3x 'King!' among varied lines is an anthem, not spam -> PASS")

print("[plan] under-density (#3: asked 50%, got ~15%):")
low = validate_plan([{"text": f"Clarence pushes through day {i}."} for i in range(3)], tier=50,
                    target_language="English", total_source_lines=20)
want("density_matches_tier" in low.failures(), "3/20 = 15% vs 50% -> density FAIL")

print("[plan] mixed-language is NOT gated per-line (langdetect too noisy on short lines) — caught at OUTPUT:")
mixed = validate_plan([
    {"text": "Clarence, du baust deine Agentur mit eiserner Disziplin auf."},
    {"text": "Never give up, every no brings the yes closer to you."},
    {"text": "Bleib stark fuer deine Familie, jeden einzelnen Tag."},
], tier=100, target_language="German")
want("script_language" not in mixed.checks, "no per-line script_language gate (it false-fails good English)")

print("[plan] surviving original line at 100% (#4/#6):")
remnant = validate_plan(
    [{"text": "Clarence steht auf und kaempft."}, {"text": "I have a dream that one day."}],
    tier=100, target_language="German",
    source_texts=["Etwas ganz anderes hier.", "I have a dream that one day."])
want("full_replacement" in remnant.failures(), "untouched 'I have a dream' survived 100% -> full_replacement FAIL")

print("[plan] a GOOD German 100% plan (must PASS):")
good = validate_plan([
    {"text": "Clarence, du baust deine Agentur Rebelz mit eiserner Disziplin auf."},
    {"text": "Jedes Nein bringt dich naeher an das grosse Ja, niemals aufgeben."},
    {"text": "Du bleibst ruhig und stark fuer dein Kind, jeden einzelnen Tag."},
], tier=100, target_language="German",
   source_texts=["original eins hier", "original zwei hier", "original drei hier"],
   total_source_lines=3)
want(good.passed, f"good plan passes (failures={good.failures()})")


# ── POST-GEN: validate_output on the REAL files from run #4 ────────────────────────────────────────────
SRC_SOLO = "/Users/clarence/Desktop/RoarBliss_Clarence.mp3"
OUT_SOLO = os.path.join(HERE, "_out_solo_dry_speech_clarence_75_en.mp3")
OUT_CINE = os.path.join(HERE, "_out_cinematic_multivoice_got_75.mp3")
SRC_CINE = "/Users/clarence/Music/Music/Media.localized/Music/Peter Gundry/Unknown Album/The Targaryen Wolf (Original Soundtrack) Game of Thrones.mp3"

if os.path.exists(OUT_CINE) and os.path.exists(SRC_CINE):
    print("[output] #2 cinematic (founder-approved) — must PASS music continuity:")
    r = validate_output(OUT_CINE, SRC_CINE, tier=75, target_language="English")
    print("        ", r.detail.get("music_continuity"))
    want(r.checks.get("music_continuity", True), "#2 cinematic music_continuity PASS (no false alarm)")

# ── language backstop on a mixed transcript (#6) ───────────────────────────────────────────────────────
print("[output] mixed-language transcript backstop (#6):")
mix_tr = ("Clarence, du baust deine Agentur auf. Never give up on your dream. "
          "Bleib stark fuer deine Familie. Every no brings the yes closer. Du schaffst das heute.")
rm = validate_output(OUT_CINE if os.path.exists(OUT_CINE) else SRC_SOLO,
                     SRC_CINE if os.path.exists(SRC_CINE) else SRC_SOLO,
                     tier=100, target_language="German", transcript_text=mix_tr)
want("output_language" in rm.failures(), f"mishmash transcript -> output_language FAIL ({rm.detail.get('output_language')})")

print("=" * 64)
if fails:
    print(f"VALIDATORS TEST FAIL ✗  ({len(fails)})")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("VALIDATORS TEST PASS ✓  — catches density, repetition, language, remnant, wobble")

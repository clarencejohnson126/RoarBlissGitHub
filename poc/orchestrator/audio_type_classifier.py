#!/usr/bin/env python3
"""
Audio-Type Classifier — Sprint 1
=================================
Given features extracted by feature_extractor.py, classify the audio as one of:
  A — Solo monologue
  B — Compilation w/ epic music
  C — Cinematic tribute
  D — Podcast / dialogue
  E — Spiritual / religious
  F — Sports / pre-game

Uses a heuristic decision tree first; if ambiguous, falls back to an LLM call.

Outputs:
  {
    "type": "A",
    "confidence": 0.85,
    "decision_path": "heuristic" | "llm",
    "personalization_profile": {...},
    "reasoning": "..."
  }
"""

import json
from pathlib import Path
from feature_extractor import extract_features

# Per-type personalization profile (defaults for the downstream orchestrator)
TYPE_PROFILES = {
    "A": {"label": "Solo monologue",          "density": 0.60, "slot_pref": "medium-long",  "music_respect": "low",    "name_freq_s": 20},
    "B": {"label": "Compilation w/ epic music","density": 0.40, "slot_pref": "short-medium", "music_respect": "high",   "name_freq_s": 30},
    "C": {"label": "Cinematic tribute",       "density": 0.35, "slot_pref": "short",        "music_respect": "very-high","name_freq_s": 35},
    "D": {"label": "Podcast / dialogue",      "density": 0.25, "slot_pref": "medium",       "music_respect": "none",   "name_freq_s": 40},
    "E": {"label": "Spiritual / religious",   "density": 0.35, "slot_pref": "medium-long",  "music_respect": "medium", "name_freq_s": 30},
    "F": {"label": "Sports / pre-game",       "density": 0.50, "slot_pref": "short-punchy", "music_respect": "medium-high","name_freq_s": 25},
}

def heuristic_classify(f: dict) -> dict:
    """Rule-based classifier. Returns (type, confidence, reasoning)."""
    sr_ = f["speech_ratio"]
    spk = f["speaker_estimate"]
    md  = f["music_dominance"]
    avg = f["avg_utterance_s"]
    eb  = f["energy_burstiness"]
    bpm = f["tempo_bpm"]
    txt = (f.get("transcript_excerpt") or "").lower()

    # Heuristic decision tree
    # ── F (Sports) first — distinctive crowd-noise + high burstiness
    if eb > 1.2 and (md > 0.6 or "team" in txt or "game" in txt or "field" in txt or "coach" in txt):
        return "F", 0.7, f"high burstiness ({eb:.2f}) + sports keyword OR loud non-speech"

    # ── E (Spiritual) — calm + religious keywords or peaceful tempo
    spiritual_kw = any(w in txt for w in ["god", "lord", "jesus", "prayer", "faith", "blessed",
                                            "spirit", "soul", "heaven", "amen", "pastor", "scripture"])
    if spiritual_kw and md < 0.5:
        return "E", 0.85, "spiritual keywords + low music dominance"

    # ── C (Cinematic tribute) — music dominates AND multiple speakers + short utterances
    if md > 0.7 and spk >= 2 and avg < 2.5:
        return "C", 0.85, f"music_dominance {md:.2f} + {spk} speakers + short utterances ({avg:.1f}s)"

    # ── B (Compilation) — moderate-high music + multiple speakers + medium utterances
    if md > 0.45 and spk >= 2 and sr_ > 0.4:
        return "B", 0.75, f"music_dominance {md:.2f} + {spk} speakers + speech_ratio {sr_:.2f}"

    # ── A (Solo monologue) — one speaker, low music, high speech ratio
    if spk == 1 and md < 0.45 and sr_ > 0.6:
        return "A", 0.85, f"single speaker + low music ({md:.2f}) + high speech ({sr_:.2f})"

    # ── D (Podcast) — 1-2 speakers, very low music, moderate-long utterances
    if spk <= 2 and md < 0.35 and avg > 2.5:
        return "D", 0.8, f"{spk} speakers + very low music ({md:.2f}) + long utterances ({avg:.1f}s)"

    # ── Tiebreakers
    if md > 0.7 and sr_ < 0.5:
        return "C", 0.6, "music-heavy fallback → C"
    if spk == 1 and sr_ > 0.5:
        return "A", 0.55, "single speaker fallback → A"
    if spk >= 2:
        return "B", 0.5, "multi-speaker fallback → B"

    return "A", 0.4, "default fallback → A"

LLM_SYSTEM_PROMPT = """You are an audio type classifier for a personalized motivational audio app called Roar Bliss.

Classify audio into exactly one of these 6 types:

  A — Solo monologue
    ONE motivational figure delivering a continuous speech. Examples: Tony Robbins live event, Jocko Willink's "GOOD" speech, Trump rally excerpt, Hormozi solo recording, Goggins audiobook narration. Audio shows ONE voice throughout; transcript reads with ONE vocabulary/style end-to-end; may have crowd reactions (cheers, "yeah!") but no other named speakers.

  B — Compilation w/ epic music
    Multiple REAL motivational speakers/coaches cut together with heavy backing music. Classic YouTube format: "I Will Not Be Defeated", "Push Through The Dirt", "When It Breaks You", "Secrets to Success", Be Inspired. Transcript shows VOICE CHANGES — different speakers introducing new ideas, different vocabularies/cadences. Each segment is short (~10-30s of any one speaker). Often introduces speakers by name or theme. Music is omnipresent and epic.

  C — Cinematic tribute
    Clips from FICTIONAL CHARACTERS in movies/TV. Examples: Game of Thrones character tributes (Theon, Jon Snow, Jaime Lannister, Daenerys); Marvel hero compilations; anime AMVs. Transcript shows: medieval/fantasy vocabulary (kingdom, throne, lord, sword, dragon, king, queen, banner), proper nouns from fiction (Stark, Lannister, Greyjoy, Westeros, Winterfell, Iron Islands), or recognizable film/TV dialogue patterns. Orchestral score dominates.

  D — Podcast / dialogue
    Conversational, 1-2 speakers in actual back-and-forth (not a single person monologuing). Real podcasts (Chris Williamson, Lex Fridman, Joe Rogan, Diary of a CEO) OR scripted TV/movie SCENE dialogue (two characters talking). The transcript shows clear alternation between two voices — questions and answers, statements and reactions, two perspectives. Music absent or minimal ambient.

  E — Spiritual / religious
    Pastors, ministers, mindfulness teachers, prayer guides. Transcript explicitly contains religious vocabulary (God, Lord, Jesus, prayer, faith, blessed, scripture, sermon, heaven, soul, amen, pastor) used in a literal religious sense (NOT GoT-style "Lord", that's C). Calm reflective tone.

  F — Sports / pre-game
    High-energy locker-room or pre-game speeches. Coaches, athletes addressing teams. Transcript: team/game/field/coach/players/win/victory/championship vocabulary. Often has crowd noise + intense music + short punchy bursts.

CRITICAL: APPLY THESE PRIORITY-ORDERED RULES IN THIS EXACT ORDER. Stop at the first match.

**PRIORITY 1 — Check transcript for FICTIONAL CHARACTER NAMES:**
Look for proper names from movies/TV in the transcript: Theon, Greyjoy, Jon Snow, Stark, Lannister, Tyrion, Daenerys, Khaleesi, Bran, Targaryen, Westeros, Winterfell, Iron Islands, Iron Throne, Kingsguard, Kingslayer, Lord (in royalty sense), House [Name], etc. Also Marvel characters, anime names, etc. Also recognizable show-specific phrases ("the Wall", "winter is coming", "Valar Morghulis", "for the throne").
→ If ANY of these appear → **C** (Cinematic tribute). Stop here.

**PRIORITY 2 — Check transcript for LITERAL RELIGIOUS LANGUAGE:**
Multiple instances of: God, Lord (in religious — NOT GoT — sense), Jesus, Christ, prayer, faith, blessed, scripture, sermon, heaven, soul, amen, pastor, ministry, holy, spirit, congregation. Used in sincere religious context, not metaphor.
→ → **E** (Spiritual). Stop here.

**PRIORITY 3 — Check transcript for SPORTS / TEAM vocabulary:**
team, coach, players, game, championship, locker room, field, opponent, win this, victory, crowd. Combined with high energy_burstiness (>1.0).
→ → **F** (Sports). Stop here.

**PRIORITY 4 — Now choosing among A, B, D (no fiction, no religion, no sports):**

  D check (dialogue) — TWO speakers with comparable share of speech?
    - longest_speaker_ratio < 0.70 means the top speaker holds less than 70% of speech, so others are significant participants → strong D signal
    - turn_count is high relative to duration (many speaker changes) → also D signal
    - Transcript shows visible back-and-forth between two voices → D
    If 2+ of these hold → **D**.

  B check (compilation) — Multiple voices + music?
    - speaker_estimate >= 2 AND music_dominance >= 0.25 → **B**
    - OR speaker_estimate >= 3 (multiple distinct voices) regardless of music → **B**
    Why: B compilations stitch solo clips from different motivational figures together. Each individual clip reads like a solo monologue (which is why transcript alone can't tell A from B). The combination of multiple voices + epic music backing is the reliable signal.

  A — fallback (one dominant voice):
    - speaker_estimate == 1 → **A**
    - speaker_estimate == 2 BUT longest_speaker_ratio > 0.85 (one speaker dominates strongly, the other is a brief side voice) → **A** with crowd-noise context
    - High speech_ratio (>0.85) + transcript shows ONE consistent persona/style throughout → **A** (crowd cheers may inflate speaker count for solo speeches)

Output strictly as JSON: {"type": "X", "confidence": 0.0-1.0, "reasoning": "one sentence"}
No prose outside the JSON object."""

def llm_classify(f: dict) -> dict:
    """Classify audio type via the shared LLM (Claude Haiku in prod, Ollama fallback)."""
    from llm import llm_chat

    user_msg = f"""Classify this audio:

Features:
- duration: {f['duration_s']}s
- detected language: {f.get('language', 'unknown')}
- speech_ratio (% of time that's speech): {f['speech_ratio']}
- speaker_estimate (effective # of distinct speakers, via {f.get('diarization_source', 'heuristic')}): {f['speaker_estimate']}
- longest_speaker_ratio (top speaker's share of speech time, 0-1): {f.get('longest_speaker_ratio', 1.0)}
- turn_count (# of speaker changes detected): {f.get('turn_count', f['utterance_count'])}
- avg_utterance_s (mean Whisper segment length): {f['avg_utterance_s']}s
- utterance_count: {f['utterance_count']}
- music_dominance (0-1, 1=music drowns speech): {f['music_dominance']}
- energy_burstiness (std/mean of RMS): {f['energy_burstiness']}
- tempo_bpm: {f['tempo_bpm']}

Transcript (truncated to 2500 chars — look for voice/style changes indicating multi-speaker):
\"\"\"
{f.get('transcript_full', f['transcript_excerpt'])[:2500]}
\"\"\"

Return your JSON classification now."""

    raw = llm_chat(LLM_SYSTEM_PROMPT, user_msg, max_tokens=200, temperature=0.1)
    # Extract JSON (LLM might wrap in markdown fences)
    import re
    m = re.search(r'\{[^{}]*"type"[^{}]*\}', raw, re.DOTALL)
    if m:
        try:
            parsed = json.loads(m.group(0))
            type_id = parsed.get("type", "A").upper()
            if type_id not in TYPE_PROFILES:
                type_id = "A"
            return {
                "type": type_id,
                "confidence": float(parsed.get("confidence", 0.5)),
                "reasoning": parsed.get("reasoning", "(no reasoning)"),
            }
        except Exception:
            pass
    return {"type": "A", "confidence": 0.0, "reasoning": f"LLM parse failed; raw: {raw[:200]}"}

FICTIONAL_KEYWORDS = ["theon", "greyjoy", "jon snow", "stark", "lannister", "tyrion", "daenerys",
                       "khaleesi", "bran", "targaryen", "westeros", "winterfell", "iron islands",
                       "iron throne", "kingsguard", "kingslayer", "khal", "dothraki", "valar",
                       "winter is coming", "the wall", "the night king"]
SPIRITUAL_KEYWORDS = ["god", "jesus", "christ", "prayer", "scripture", "blessed", "amen",
                       "pastor", "ministry", "holy spirit", "heaven", "sermon"]
SPORTS_KEYWORDS = ["coach", "locker room", "team", "championship", "the field", "opponent",
                    "scoreboard", "halftime", "the game"]

def post_llm_override(llm_result: dict, features: dict) -> dict:
    """Programmatic safety nets that catch known LLM failure modes.
    Returns possibly-modified result with `override_applied` field."""
    type_id = llm_result["type"]
    txt = (features.get("transcript_full") or "").lower()

    # Override 1: LLM says A but features clearly indicate B compilation
    if (type_id == "A"
        and features["speaker_estimate"] >= 2
        and features["music_dominance"] >= 0.25
        and not any(k in txt for k in FICTIONAL_KEYWORDS)
        and not any(k in txt for k in SPIRITUAL_KEYWORDS)):
        return {**llm_result, "type": "B",
                "reasoning": f"[OVERRIDE: LLM said A but features show {features['speaker_estimate']} speakers + music_dom {features['music_dominance']:.2f} → B compilation. LLM reason: {llm_result['reasoning']}]",
                "override_applied": "A→B (speaker+music)"}

    return {**llm_result, "override_applied": None}

def classify_audio(audio_path: str, mode: str = "llm") -> dict:
    """
    mode = 'heuristic'  → rules only (fast, but ~30% on test corpus)
    mode = 'llm'        → always use LLM + post-override safety nets (recommended)
    mode = 'hybrid'     → heuristic first; LLM if confidence < 0.7
    """
    features = extract_features(audio_path)
    h_type, h_conf, h_reason = heuristic_classify(features)

    if mode == "heuristic" or (mode == "hybrid" and h_conf >= 0.7):
        type_id, confidence, reasoning = h_type, h_conf, h_reason
        decision_path = "heuristic"
        override_applied = None
    else:
        llm_out = llm_classify(features)
        llm_out = post_llm_override(llm_out, features)
        type_id = llm_out["type"]
        confidence = llm_out["confidence"]
        reasoning = llm_out["reasoning"]
        override_applied = llm_out.get("override_applied")
        decision_path = "llm+override" if override_applied else "llm"

    profile = TYPE_PROFILES[type_id]
    return {
        "audio": Path(audio_path).name,
        "type": type_id,
        "type_label": profile["label"],
        "confidence": confidence,
        "decision_path": decision_path,
        "reasoning": reasoning,
        "heuristic_would_have_said": {"type": h_type, "confidence": h_conf, "reasoning": h_reason},
        "personalization_profile": profile,
        "features": {
            "duration_s": features["duration_s"],
            "speech_ratio": features["speech_ratio"],
            "speaker_estimate": features["speaker_estimate"],
            "avg_utterance_s": features["avg_utterance_s"],
            "music_dominance": features["music_dominance"],
            "energy_burstiness": features["energy_burstiness"],
            "tempo_bpm": features["tempo_bpm"],
            "language": features["language"],
            "transcript_excerpt": features["transcript_excerpt"][:200],
        }
    }

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: audio_type_classifier.py <audio_path>")
        sys.exit(1)
    r = classify_audio(sys.argv[1])
    print(json.dumps(r, indent=2))

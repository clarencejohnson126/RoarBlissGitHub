#!/usr/bin/env python3
"""
Personalization Planner — Sprint 3 (the brain)
==============================================
Given an audio file + a user context prompt, produces an OVERRIDES list that
the v6 synthesizer can run untouched. Replaces the hand-crafted slot lists in
poc/poc_steven_theon_v*.py.

Stages:
  1. Audio understanding   — reuse Sprint 1 + 2 (cached)
  2. User context parse    — LLM extracts name, themes, emotional state
  3. Candidate slot mining — scan Whisper segments for valid slots
  4. Storyline + slot pick — LLM picks which slots to use + writes override text
  5. Validation + repair   — syllable budget, name distribution, first-10s rule
  6. Output                — list of {id, speaker, emotion, start_ms, end_ms, text, theme}

This is the file that ties Sprints 1+2 into a production-ready factory.
"""

import os, sys, json, re, hashlib
from collections import defaultdict
from pathlib import Path
from typing import Optional

# LLM abstraction lives in llm.py (Claude Haiku 4.5 in prod, Ollama fallback for dev).
# Kept as a module-level alias so existing call sites (_llm_chat(...)) stay unchanged.
sys.path.insert(0, str(Path(__file__).parent))
from llm import llm_chat as _llm_chat
from feature_extractor import extract_features, _cache_path
from audio_type_classifier import classify_audio, TYPE_PROFILES
from reference_library_builder import build_reference_library, EMOTION_PALETTE
from diarization import diarize

CACHE_DIR = Path(__file__).parent / "cache"

# Slot picking constants
MIN_SLOT_DURATION_S = 0.5
QWEN3_SYL_PER_SEC = 3.0          # empirical Qwen3-TTS speaking rate
SYLLABLE_TOLERANCE = 0.30        # ±30% slack on syllable budget per slot
NAME_DISTRIBUTION_MIN_GAP_S = 25.0  # min seconds between user-name mentions

def _count_syllables(text: str) -> int:
    """Rough syllable count. Good enough for budgeting."""
    text = text.lower()
    text = re.sub(r"[^a-z\s]", "", text)
    words = text.split()
    count = 0
    for w in words:
        # Count vowel groups
        vowels = re.findall(r"[aeiouy]+", w)
        s = len(vowels)
        if w.endswith("e") and s > 1:
            s -= 1  # silent e
        if s == 0:
            s = 1
        count += s
    return count

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: parse user context
# ──────────────────────────────────────────────────────────────────────────────
def parse_user_context(context: str) -> dict:
    """LLM extracts structured fields from a free-form user context prompt."""
    user_msg = f"""User has uploaded an audio and provided this context about themselves:

\"\"\"
{context}
\"\"\"

Extract structured information for personalization. Return ONLY this JSON:
{{
  "name": "<first name or 'you' if not given>",
  "themes": [
    "<2-6 short theme phrases describing what to personalize around — career, breakup, fear, gym, family, faith, etc.>"
  ],
  "emotional_state": "<dominant feeling — searching, broken, fierce, hopeful, lost, etc.>",
  "specifics": [
    "<3-8 short concrete details from the prompt — 'wants to go to Thailand', 'switched from Construction to AI', 'wife left', etc.>"
  ],
  "tone_preference": "<one of: tender, intense, confident, reflective>"
}}

No prose outside the JSON object."""
    raw = _llm_chat(system="You extract structured personalization briefs from free-form user prompts. Return strict JSON only.",
                     user=user_msg, max_tokens=600, temperature=0.1)
    m = re.search(r'\{.*\}', raw, re.DOTALL)
    if not m:
        return {"name": "you", "themes": ["growth"], "emotional_state": "searching",
                "specifics": [], "tone_preference": "confident"}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {"name": "you", "themes": ["growth"], "emotional_state": "searching",
                "specifics": [], "tone_preference": "confident"}

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: mine candidate slot windows
# ──────────────────────────────────────────────────────────────────────────────
def find_candidate_slots(audio_path: str, ref_library: dict, window_ms: int = None) -> list:
    """Return all Whisper segments that are eligible to be replaced.
    Each candidate is annotated with speaker, target syllable count, and surrounding context.
    """
    whisper_cache = _cache_path(audio_path, "whisper.json")
    transcript = json.loads(whisper_cache.read_text())
    segments = transcript["segments"]
    diar = diarize(audio_path, verbose=False)

    valid_speakers = set(ref_library["speakers"].keys())

    candidates = []
    for i, seg in enumerate(segments):
        s_start = seg["start"]
        s_end = seg["end"]
        duration = s_end - s_start
        if duration < MIN_SLOT_DURATION_S:
            continue
        if window_ms is not None and s_start * 1000 >= window_ms:
            continue
        # Find dominant speaker via diarization
        speaker_overlap = defaultdict(float)
        for turn in diar["turns"]:
            o_start = max(s_start, turn["start"])
            o_end = min(s_end, turn["end"])
            if o_end > o_start:
                speaker_overlap[turn["speaker"]] += (o_end - o_start)
        if not speaker_overlap:
            continue
        dominant = max(speaker_overlap, key=speaker_overlap.get)
        if dominant not in valid_speakers:
            continue  # speaker has no reference library, can't synthesize
        dominance = speaker_overlap[dominant] / duration
        if dominance < 0.7:
            continue
        # Context before/after
        ctx_before = segments[i-1]["text"].strip() if i > 0 else ""
        ctx_after  = segments[i+1]["text"].strip() if i < len(segments)-1 else ""
        candidates.append({
            "cand_id": len(candidates),
            "start_ms": int(s_start * 1000),
            "end_ms": int(s_end * 1000),
            "duration_s": round(duration, 2),
            "speaker": dominant,
            "original_text": seg["text"].strip(),
            "target_syllables": int(duration * QWEN3_SYL_PER_SEC),
            "ctx_before": ctx_before,
            "ctx_after": ctx_after,
            "available_emotions": [r["emotion"] for r in ref_library["speakers"][dominant]["references"]],
        })
    return candidates

# ──────────────────────────────────────────────────────────────────────────────
# Stage 4: LLM picks slots + writes override text
# ──────────────────────────────────────────────────────────────────────────────
PLANNER_SYSTEM_PROMPT = """You are the personalization planner for Roar Bliss — a motivational audio app that overlays personalized speech onto uploaded motivational audios.

Your job: given candidate slot windows + a user's personalization brief, select which slots to override and write the replacement text for each, satisfying ALL of these rules:

**HARD RULES:**

1. WORD BUDGET (the most important rule): each override text MUST land at the slot's `target≈N_words`, give or take 1 word. Voice synth runs ~3 syllables/second (~2 words/second). Going over the budget creates clipped audio. Going under creates dead silence. Write a COMPLETE phrase that hits the budget naturally; don't pad, don't squeeze.

   Examples of correctly-sized phrases:
   - 2 words: "Steven, rise." / "Choose now."
   - 3 words: "He chose freedom." / "Steven owns this."
   - 4 words: "His path is clear." / "He won't look back."
   - 6 words: "Steven, you're at a crossroads." / "He chose AI over the past."
   - 8 words: "He has the strength to walk this path alone."

2. NAME DISTRIBUTION: include the user's name in AT MOST ONE slot per ~25 seconds of timeline. For other slots referring to the user, alternate between: "him/he/his" (third-person narrative), "you" (direct address), no pronoun (general statement). The name should land as an EVENT, not background noise.

3. FIRST-10s RULE: at least ONE slot in the first 10 seconds MUST mention the user's name. This is the bond/retention moment.

4. CONTINUITY: when picking adjacent slots from the same speaker, write the override texts so they flow logically together (don't contradict each other, don't repeat the same phrase, do build a narrative arc).

5. EMOTION MATCH: the override text's emotional tone should match the slot's "available_emotions" (the emotions the speaker's reference library can produce). A whispered slot needs intimate text; a defiant slot needs forceful text.

6. THEME COVERAGE: every theme from the user's brief must appear in at least ONE selected slot. Distribute themes across the arc.

7. NO SNIPPETS IN PAUSES: only override the slots in the candidate list (these are detected speech windows). Don't invent new positions.

**STORYLINE ARC** (apply when there are enough slots for narrative shape):
- Beat 1 (0–15%): introduce the user, their crossroads
- Beat 2 (15–35%): rejection of what's holding them back (old job, old self, fear)
- Beat 3 (35–55%): identity claim — who they want to become
- Beat 4 (55–75%): the struggle/breaking moment — fear, doubt, loss
- Beat 5 (75–90%): the choice / the rise — committing to the new path
- Beat 6 (90–100%): vow / resolution — moving forward

**DENSITY TARGET:** select approximately `target_slot_count` slots from the candidate pool. Spread them across the timeline (don't cluster).

**OUTPUT FORMAT:**
Return ONLY this JSON object:

{
  "selected": [
    {"cand_id": <int>, "override_text": "<short replacement text>", "theme": "<one word from user themes>"},
    ...
  ]
}

No prose outside the JSON. The override_text should be plain ASCII; avoid em-dashes and quotation marks inside the text."""

def llm_pick_slots(candidates: list, brief: dict, type_profile: dict,
                   target_slot_count: int, window_ms: int) -> list:
    """LLM picks which candidates to use and writes override text per slot."""
    # Build a compact candidate listing — give WORD budget (LLMs count words better
    # than syllables) plus a sample of complete phrases at that length
    cand_lines = []
    for c in candidates:
        # ~1.5 syllables per English word in motivational speech
        word_budget = max(1, round(c['target_syllables'] / 1.5))
        cand_lines.append(
            f"id={c['cand_id']:>3} t={c['start_ms']/1000:6.2f}s dur={c['duration_s']:.1f}s "
            f"target≈{word_budget}_words spk={c['speaker']} orig=\"{c['original_text'][:80]}\""
        )
    candidates_text = "\n".join(cand_lines)

    user_msg = f"""USER BRIEF:
  name: {brief['name']}
  themes: {brief['themes']}
  emotional_state: {brief['emotional_state']}
  specifics: {brief['specifics']}
  tone_preference: {brief['tone_preference']}

AUDIO TYPE PROFILE:
  label: {type_profile['label']}
  density target: {type_profile['density']}
  slot length preference: {type_profile['slot_pref']}

TARGET: select ~{target_slot_count} slots from below (spread across timeline 0–{window_ms/1000:.0f}s).
Most important constraint: each override_text MUST be a COMPLETE GRAMMATICAL PHRASE that fits the slot's syl_budget within ±20%. Short, punchy, complete. Never end on a function word ("the", "his", "to", etc.). Better to use 1 fewer slot than to ship a fragment.

CANDIDATES (each line is one available slot):
{candidates_text}

Now pick {target_slot_count} slots and write override text per the rules. Output strict JSON only."""

    raw = _llm_chat(system=PLANNER_SYSTEM_PROMPT, user=user_msg, max_tokens=4000, temperature=0.3)

    # Extract JSON
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        print("  LLM returned no JSON; raw:", raw[:300])
        return []
    try:
        parsed = json.loads(m.group(0))
        return parsed.get("selected", [])
    except json.JSONDecodeError as e:
        # Try to recover by trimming to last complete object
        text = m.group(0)
        last_bracket = text.rfind("]")
        if last_bracket > 0:
            try:
                return json.loads(text[:last_bracket+1] + "}").get("selected", [])
            except Exception:
                pass
        print(f"  LLM JSON parse failed: {e}; raw[:500]: {raw[:500]}")
        return []

# ──────────────────────────────────────────────────────────────────────────────
# Stage 5: validate + repair
# ──────────────────────────────────────────────────────────────────────────────
FUNCTION_WORDS = {"a", "an", "the", "his", "her", "my", "your", "their", "its",
                   "to", "of", "in", "on", "at", "for", "with", "from", "by", "as",
                   "and", "or", "but", "is", "was", "be", "been", "has", "have",
                   "this", "that", "these", "those", "i", "you", "he", "she", "we", "they",
                   "do", "does", "did", "will", "would", "can", "could", "should"}

def _truncate_to_syllables(text: str, max_syllables: int) -> str:
    """Drop words from the end until syllable count fits. Avoid ending on function words.
    Returns empty string if can't make it work without fragments."""
    words = text.rstrip(".!?,;:").split()
    while len(words) > 1 and _count_syllables(" ".join(words)) > max_syllables:
        words.pop()
    # If we ended on a function word, drop more
    while words and words[-1].lower().rstrip(".,!?'\"") in FUNCTION_WORDS:
        words.pop()
    if not words or len(words) < 2:
        # Too short to be coherent — return empty so caller drops the slot
        return ""
    out = " ".join(words)
    if out[-1] not in ".!?":
        out += "."
    return out

def _extract_source_character_names(audio_path: str) -> set:
    """Find proper nouns in the source transcript that look like character/speaker names.
    These are forbidden in override texts (would leak source identity into personalization).

    Strategy: only count words that appear capitalized in the MIDDLE of a sentence (not
    after period or sentence-start), and require >= 2 occurrences. Heavy common-words filter."""
    try:
        whisper_cache = _cache_path(audio_path, "whisper.json")
        text = json.loads(whisper_cache.read_text()).get("text", "")
    except Exception:
        return set()

    # Only match capitalized words that come AFTER a non-sentence-ending word
    # (i.e., not the first word in a sentence). This filters out sentence-starting verbs.
    mid_sentence_caps = re.findall(r'(?<=[a-z,]\s)[A-Z][a-z]{2,}\b', text)

    # Count occurrences — proper nouns repeat in a transcript; sentence starters often don't
    from collections import Counter
    counts = Counter(mid_sentence_caps)

    # Common English words that might still slip through
    COMMON_WORDS = {
        # Pronouns/articles/prepositions in any case
        "The","This","That","They","These","Those","There","Their","Them","Then","Than",
        "What","When","Where","Why","How","Who","Which","Whose","Whom",
        "And","But","Or","Nor","For","Yet","So","As","If","Of","On","In","At","To","By",
        "You","Your","Yours","Yes","No","Not","Now","One","Two","Three","Four","Five",
        "I","We","He","She","It","Me","Him","Her","His","Hers","Its","Our","Ours",
        # Auxiliary verbs / modals
        "Are","Is","Was","Were","Be","Been","Being","Am",
        "Do","Does","Did","Done","Doing","Have","Has","Had","Having",
        "Will","Would","Can","Could","Shall","Should","May","Might","Must",
        "Get","Got","Getting","Gone","Going","Go","Goes","Went",
        "Come","Came","Coming","Make","Made","Making","Take","Took","Taking","Taken",
        "Give","Gave","Given","Giving","See","Saw","Seen","Seeing","Look","Looked","Looking",
        "Find","Found","Finding","Want","Wanted","Wanting","Try","Tried","Trying","Tell","Told","Telling",
        "Know","Knew","Known","Knowing","Think","Thought","Thinking","Say","Said","Saying",
        "Let","Letting","Use","Used","Using","Work","Worked","Working","Need","Needed","Needing",
        "Become","Became","Becoming","Leave","Left","Leaving","Mean","Meant","Meaning","Keep","Kept","Keeping",
        "Help","Helped","Helping","Talk","Talked","Talking","Turn","Turned","Turning","Start","Started","Starting",
        # Adjectives / common nouns / states
        "Good","Bad","Great","Small","Large","Big","Long","Short","Old","New","Young",
        "True","False","Right","Wrong","Best","Worst","Better","Worse","More","Less","Many","Most","Few",
        "Today","Tomorrow","Yesterday","Tonight","Always","Never","Sometimes","Often","Usually",
        "Just","Even","Still","Even","Already","Almost","Quite","Rather","Maybe","Perhaps",
        "From","About","Like","Into","Onto","Upon","Through","Between","Among","Above","Below","Under",
        "Across","Around","Behind","Beyond","Outside","Inside","Without","Within","Toward","Towards",
        "Lord","Lady","Sir","Mr","Mrs","Ms","Dr","Mister","Master","Brother","Sister","Father","Mother",
        "Son","Daughter","King","Queen","Prince","Princess","Boy","Girl","Man","Woman","People","Person",
        "Yes","Okay","Hi","Hello","Welcome","Thank","Thanks","Please","Sorry","Excuse",
        # Common emotions/abstract
        "Love","Loved","Hate","Hated","Fear","Feared","Hope","Hoped","Peace","War","Life","Death",
        "Mercy","Justice","Honor","Truth","Lies","Power","Strength","Weakness","Heart","Mind","Soul",
        # Common verbs that often start sentences
        "Stop","Stopped","Run","Ran","Stand","Stood","Sit","Sat","Wait","Waited","Listen","Listened",
        "Hear","Heard","Watch","Watched","Feel","Felt","Believe","Believed","Remember","Forgot","Forgotten",
        "Bless","Blessed","Betray","Betrayed","Trust","Trusted","Choose","Chose","Chosen","Win","Won","Lose","Lost",
        # Common adverbs / determiners
        "Each","Every","Some","Any","All","Both","Either","Neither","None",
        "Black","White","Red","Blue","Green","Gold","Silver","Dark","Light",
        # Common quoted speech indicators
        "Don","Won","Can","Hasn","Shouldn","Wouldn","Couldn","Isn","Aren","Wasn","Weren",
    }

    # A true proper noun must:
    # (1) appear mid-sentence at least twice (real names repeat), OR
    # (2) appear mid-sentence and look distinctly non-English
    proper = set()
    for word, count in counts.items():
        if word in COMMON_WORDS:
            continue
        if count >= 2:
            proper.add(word)

    return proper

def _strip_name(text: str, name: str) -> str:
    """Remove user's name from text, replacing with pronoun. Keep grammar reasonable."""
    name_re = re.compile(rf'\b{re.escape(name)}\b', re.IGNORECASE)
    # Replace possessive first
    text = re.sub(rf"\b{re.escape(name)}'s\b", "his", text, flags=re.IGNORECASE)
    text = name_re.sub("he", text)
    # Clean up double spaces, "for he", etc — simple normalization
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def validate_and_repair(selected: list, candidates: list, ref_library: dict,
                         brief: dict, type_profile: dict,
                         forbidden_names: set = None) -> list:
    """Apply hard checks, drop / repair invalid slots, ensure first-10s rule."""
    by_cand_id = {c["cand_id"]: c for c in candidates}
    valid_slots = []
    user_name = brief.get("name", "you")
    user_name_lower = user_name.lower() if user_name else ""
    forbidden_names = forbidden_names or set()
    # Don't ban the user's own name
    forbidden_names = {n for n in forbidden_names if n.lower() != user_name_lower}

    for sel in selected:
        cand_id = sel.get("cand_id")
        if cand_id is None or cand_id not in by_cand_id:
            continue
        cand = by_cand_id[cand_id]
        text = sel.get("override_text", "").strip()
        if not text:
            continue

        # ── REPAIR 0: strip source-character names ─────────────────────
        for name in forbidden_names:
            pattern = re.compile(rf'\b{re.escape(name)}\b', re.IGNORECASE)
            if pattern.search(text):
                # Try to remove cleanly
                text = pattern.sub("", text)
                text = re.sub(r'\s+', ' ', text).strip(" ,.")
                sel["repair_source_name_stripped"] = name
        if not text or len(text.split()) < 2:
            continue  # was mostly source-name, drop

        # ── REPAIR 1: enforce syllable budget ─────────────────────────
        # If LLM text is way over budget (>1.4×) → DROP the slot entirely.
        # Bad text is worse than no text — fragments break the seamless illusion.
        target = cand["target_syllables"]
        actual_syl = _count_syllables(text)
        if target > 0:
            if actual_syl > target * 1.4:
                # too far over budget — try a gentle truncation but if result is fragment, drop
                truncated = _truncate_to_syllables(text, int(target * 1.2))
                if not truncated or len(truncated.split()) < max(2, int(target / 2)):
                    # Truncation produced a fragment — better to drop the slot than ship "He's lost."
                    sel["dropped_reason"] = f"over-budget {actual_syl}/{target}, truncation would fragment"
                    continue
                text = truncated
                sel["truncated"] = True
            elif actual_syl > target * 1.2:
                # mildly over — gentle truncate, accept result
                text = _truncate_to_syllables(text, int(target * 1.2))
                if not text or len(text.split()) < 2:
                    continue
                sel["truncated"] = True

        # Drop empty / 1-word fragments
        if not text or len(text.split()) < 2:
            continue

        # Emotion match (same heuristic as before)
        available = cand["available_emotions"]
        if not available:
            continue
        text_lower = text.lower()
        if any(w in text_lower for w in ["whisper", "broken", "lost", "alone"]):
            chosen_emo = next((e for e in available if "broken" in e or "whispered" in e), available[0])
        elif any(w in text_lower for w in ["rise", "fight", "build", "i am", "i will"]):
            chosen_emo = next((e for e in available if "defiant" in e or "strong" in e), available[0])
        elif any(w in text_lower for w in ["wonder", "always", "remember", "long ago", "thinking"]):
            chosen_emo = next((e for e in available if "contemplative" in e or "calm" in e), available[0])
        elif any(w in text_lower for w in ["choose", "decide", "moment", "now is"]):
            chosen_emo = next((e for e in available if "wise" in e or "teaching" in e), available[0])
        else:
            chosen_emo = available[0]

        valid_slots.append({
            "id": len(valid_slots) + 1,
            "speaker": cand["speaker"],
            "emotion": chosen_emo,
            "start_ms": cand["start_ms"],
            "end_ms": cand["end_ms"],
            "text": text,
            "theme": sel.get("theme", "unknown"),
            "original_text": cand["original_text"],
            "syllable_ratio": round(actual_syl / max(target, 1), 2),
            "repair_truncated": sel.get("truncated", False),
        })

    # Sort by start_ms
    valid_slots.sort(key=lambda s: s["start_ms"])

    # ── REPAIR 2: name distribution (only N seconds apart) ────────────────
    # Strip extra mentions only if it leaves a grammatically reasonable sentence,
    # otherwise just leave the duplicate (Haiku-quality text tolerates this).
    if user_name_lower and user_name_lower != "you":
        last_name_at_ms = -100_000
        for s in valid_slots:
            if user_name_lower in s["text"].lower():
                gap_s = (s["start_ms"] - last_name_at_ms) / 1000
                if gap_s < NAME_DISTRIBUTION_MIN_GAP_S:
                    new_text = _strip_name(s["text"], user_name)
                    # Only apply if the result is still grammatical (no "he the X", no "is he,")
                    bad_patterns = [r'\bhe the\b', r'\bis he,', r"\bhe's\s+he\b", r"\bhe he\b"]
                    if new_text and new_text != s["text"] and not any(re.search(p, new_text, re.IGNORECASE) for p in bad_patterns):
                        s["text"] = new_text
                        s["repair_name_stripped"] = True
                    # else: leave the duplicate name; Haiku writes coherent text
                else:
                    last_name_at_ms = s["start_ms"]
            elif last_name_at_ms == -100_000:
                pass  # haven't seen name yet

    # ── REPAIR 3: first-10s rule — name must land in opening ──────────────
    if user_name_lower and user_name_lower != "you":
        early = [s for s in valid_slots if s["start_ms"] < 10_000]
        if early and not any(user_name_lower in s["text"].lower() for s in early):
            first = early[0]
            target = (first["end_ms"] - first["start_ms"]) / 1000 * QWEN3_SYL_PER_SEC
            new_text = f"Meet {user_name.capitalize()}."
            if _count_syllables(new_text) <= int(target * (1 + SYLLABLE_TOLERANCE)):
                first["text"] = new_text
                first["repair_first10_injection"] = True

    # Re-number ids after sorting + repairs
    for i, s in enumerate(valid_slots, 1):
        s["id"] = i

    return valid_slots

# ──────────────────────────────────────────────────────────────────────────────
# Main entrypoint
# ──────────────────────────────────────────────────────────────────────────────
def generate_personalization(audio_path: str, user_context: str,
                              window_ms: int = None, verbose: bool = True) -> dict:
    if verbose:
        print(f"\n{'='*70}")
        print(" PERSONALIZATION PLANNER")
        print(f"{'='*70}\n")

    # Sprint 1+2 pre-flight (cached)
    if verbose: print("Stage 1: audio understanding (cached)...")
    classification = classify_audio(audio_path)
    ref_library = build_reference_library(audio_path, verbose=False)
    type_profile = classification["personalization_profile"]
    if verbose:
        print(f"  type: {classification['type']} ({classification['type_label']})")
        print(f"  speakers with refs: {list(ref_library['speakers'].keys())}")

    if verbose: print("\nStage 2: parse user context...")
    brief = parse_user_context(user_context)
    if verbose:
        print(f"  name: {brief['name']}")
        print(f"  themes: {brief['themes']}")
        print(f"  emotional_state: {brief['emotional_state']}")

    if verbose: print("\nStage 3: mine candidate slots...")
    candidates = find_candidate_slots(audio_path, ref_library, window_ms=window_ms)
    if verbose:
        print(f"  {len(candidates)} candidate slots in window")
        if not candidates:
            print("  ⚠ No candidates found — speakers in segments don't have reference libraries.")
            return {"overrides": [], "brief": brief, "type": classification["type"]}

    # Compute target slot count.
    # User-stated minimum: at least 50% of the OUTPUT WINDOW timeline must be personalized speech.
    # Per-type density is the FLOOR contribution — if it's lower than 50% of window, bump up.
    total_speech_in_candidates_s = sum(c["duration_s"] for c in candidates)
    avg_slot_s = total_speech_in_candidates_s / len(candidates) if candidates else 1.5
    win_ms = window_ms if window_ms else int(max(c["end_ms"] for c in candidates))
    win_s = win_ms / 1000

    # Two density targets: by type profile, and the user's 50%-of-audio floor
    type_target_s = total_speech_in_candidates_s * type_profile["density"]
    floor_target_s = win_s * 0.50  # 50% of total audio timeline
    target_personalized_s = max(type_target_s, floor_target_s)
    # But can't exceed available speech
    target_personalized_s = min(target_personalized_s, total_speech_in_candidates_s)

    target_slot_count = max(5, int(target_personalized_s / avg_slot_s))
    target_slot_count = min(target_slot_count, len(candidates))

    if verbose: print(f"\nStage 4: LLM picks ~{target_slot_count} slots + writes text...")
    selected = llm_pick_slots(candidates, brief, type_profile, target_slot_count, win_ms)
    if verbose: print(f"  LLM returned {len(selected)} slot picks")

    if verbose: print("\nStage 5: validate + repair...")
    forbidden = _extract_source_character_names(audio_path)
    if verbose: print(f"  source character names to filter from override text: {sorted(list(forbidden))[:10]}{'...' if len(forbidden)>10 else ''}")
    overrides = validate_and_repair(selected, candidates, ref_library, brief, type_profile,
                                      forbidden_names=forbidden)
    if verbose:
        print(f"  {len(overrides)} valid overrides after checks")
        syl_warnings = sum(1 for o in overrides if o.get("syllable_check"))
        if syl_warnings:
            print(f"  ⚠ {syl_warnings} slots have syllable warnings (may need time-stretch)")

    return {
        "audio_path": audio_path,
        "type": classification["type"],
        "type_label": classification["type_label"],
        "brief": brief,
        "target_slot_count": target_slot_count,
        "candidate_count": len(candidates),
        "overrides": overrides,
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: personalization_planner.py <audio_path> '<user context prompt>' [window_ms]")
        sys.exit(1)
    audio = sys.argv[1]
    ctx = sys.argv[2]
    win = int(sys.argv[3]) if len(sys.argv) > 3 else None
    result = generate_personalization(audio, ctx, window_ms=win)
    print()
    print(json.dumps(result, indent=2))

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
# Budget conservatively: lines should land at/under the slot so the clone fits naturally
# (cut-to-fit) instead of being time-compressed (ratio>1.2), which sounds sped-up / "invented".
QWEN3_SYL_PER_SEC = 2.4          # conservative TTS speaking rate -> shorter, better-fitting lines
SYLLABLE_TOLERANCE = 0.30        # ±30% slack on syllable budget per slot
NAME_DISTRIBUTION_MIN_GAP_S = 25.0  # min seconds between user-name mentions

# The model that WRITES the personalized lines (the creative call). Sonnet by default — quality
# lives in the prompt + safety nets, so Sonnet ~= Opus here at ~1/5 the cost. Flip to
# claude-opus-4-8 via WRITER_MODEL for a "premium" tier. Mechanical calls stay on Haiku (the
# llm_chat default), so we only pay for intelligence where it actually shapes the output.
WRITER_MODEL = os.environ.get("WRITER_MODEL", "claude-sonnet-4-6")

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


# Map the 8 user-facing tones → the source-speaker reference EMOTIONS to clone from (preference order).
# THIS is what makes the tone selector real: "Calm & Stoic" clones the speaker's CALM references even when
# the source is shouting, instead of matching the source's loud energy at each moment. Ceiling: if the
# source speaker only ever shouts (no calm reference exists), there's nothing calm to clone from.
TONE_EMOTION_PREFS = {
    "calm & stoic": ["contemplative", "calm", "narrator"],
    "spiritual": ["contemplative", "calm", "wise", "narrator"],
    "reflective": ["contemplative", "calm", "wise", "narrator"],
    "warm & hopeful": ["calm", "contemplative", "warm", "wise"],
    "fatherly": ["wise", "teaching", "calm", "contemplative"],
    "protective": ["wise", "teaching", "calm", "contemplative"],
    "dark & intense": ["defiant", "strong"],
    "aggressive": ["defiant", "strong"],
    "warrior": ["defiant", "strong"],
    "comeback": ["defiant", "strong"],
}


def _tone_emotion_prefs(tone_raw: str) -> list:
    """Ordered reference-emotion keywords for the user's chosen tone (empty if no known tone)."""
    t = (tone_raw or "").lower()
    for key, prefs in TONE_EMOTION_PREFS.items():
        if key in t:
            return prefs
    return []


def _parse_tone(user_context: str) -> str:
    """Pull the user's tone out of the context line predict.py appends ('Desired tone / mood: X')."""
    m = re.search(r"desired tone\s*/?\s*mood:\s*([^\n.]+)", (user_context or "").lower())
    return m.group(1).strip() if m else ""

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: mine candidate slot windows
# ──────────────────────────────────────────────────────────────────────────────
def _norm_phrase(t: str) -> str:
    return re.sub(r'[^a-z ]', '', t.lower()).strip()


def _group_into_sentences(segments: list, max_group_s: float = 14.0, min_group_s: float = 0.0) -> list:
    """Merge consecutive Whisper segments into SENTENCE units so a replaced slot never begins or ends
    mid-sentence (the #1 cause of the choppy 'words swapped inside a sentence' artefact). A unit closes
    when its accumulated text ends with . ! ? … (a real sentence boundary) AND it is at least
    min_group_s long — or when it would exceed max_group_s. The min_group_s floor is what merges a
    source's SHORT punchy sentences ("Down. Still down.") into ONE unit instead of two 1-2s slots: a
    1-2s slot forces a clipped, choked one-or-two-word clone (the 'Abwürgen' the founder heard), whereas
    a ~min_group_s unit lets the clone speak a FULL natural sentence. Each unit keeps the first segment's
    start and the last segment's end, so the clone always replaces whole sentences and the untouched
    original on either side is itself a complete sentence that can breathe."""
    groups, cur = [], None
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if cur is None:
            cur = {"start": seg["start"], "end": seg["end"], "text": text}
        else:
            cur["end"] = seg["end"]
            cur["text"] = (cur["text"] + " " + text).strip()
        ends_sentence = cur["text"].endswith((".", "!", "?", "…", '."', '!"', '?"'))
        dur = cur["end"] - cur["start"]
        if (ends_sentence and dur >= min_group_s) or dur >= max_group_s:
            groups.append(cur)
            cur = None
    if cur is not None:
        groups.append(cur)
    return groups


def find_candidate_slots(audio_path: str, ref_library: dict, window_ms: int = None, density: float = 0.55) -> list:
    """Return all Whisper segments that are eligible to be replaced.
    Each candidate is annotated with speaker, target syllable count, surrounding context,
    and whether it is an ICONIC moment (a repeated chant/anthem or an emphatic exclamation).

    Iconic moments are the emotional peaks (e.g. a crowd chanting "the king in the north!").
    They usually fail the single-speaker dominance test (a crowd has no dominant speaker), so
    they used to be silently dropped — leaving the most impactful part of the audio un-personalized.
    We now re-admit them and assign the track's PRIMARY speaker so the personalized rallying cry
    can be cloned in that voice. This is where the listener most wants to hear their own name.
    """
    whisper_cache = _cache_path(audio_path, "whisper.json")
    transcript = json.loads(whisper_cache.read_text())
    segments = transcript["segments"]
    # Group raw Whisper segments into whole-sentence units so a slot never starts/ends mid-sentence.
    # Denser tiers (>=50%) need SHORTER units so each slot is filled by one clone — otherwise a long,
    # punctuation-starved run becomes a 14s slot the clone fills only halfway (big gap). Real sentence
    # punctuation still closes a unit first, so well-punctuated sources are unaffected.
    # min_group_s merges a source's short sentences so each slot is a FULL sentence (~4.5-8s on dense
    # tiers), not a 1-2s fragment the clone gets clipped to (the 'Abwürgen'). Music carries any underfill,
    # so a slightly-long slot is fine; a too-short one is what chokes the line.
    units = _group_into_sentences(
        segments,
        max_group_s=(min(8.0, 14.0 * density) if density >= 0.5 else 14.0),
        min_group_s=(4.5 if density >= 0.5 else 0.0),
    )
    diar = diarize(audio_path, verbose=False)

    valid_speakers = set(ref_library["speakers"].keys())
    # Primary speaker = the one with the most reference speech; used to voice crowd/anthem slots.
    primary_speaker = max(
        valid_speakers,
        key=lambda s: ref_library["speakers"][s].get("total_speech_s", 0.0),
        default=None,
    )

    # Detect anthem phrases: a short phrase repeated >=3 times across the audio (a chant).
    from collections import Counter as _Counter
    norm_counts = _Counter(_norm_phrase(s["text"]) for s in units if _norm_phrase(s["text"]))
    anthem_phrases = {p for p, c in norm_counts.items() if c >= 3 and 1 <= len(p.split()) <= 6}

    candidates = []
    anthem_seen = 0
    for i, seg in enumerate(units):
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
        dominant = max(speaker_overlap, key=speaker_overlap.get) if speaker_overlap else None
        dominance = (speaker_overlap[dominant] / duration) if dominant else 0.0

        ntext = _norm_phrase(seg["text"])
        is_anthem = ntext in anthem_phrases
        is_exclaim = seg["text"].strip().endswith("!") and duration <= 2.5

        # Pick the voice for this line. Use its OWN diarized speaker when we have a reference for them
        # (relaxed dominance — the destructive slot-cut now silences the whole slot, so light speaker
        # overlap can't bleed; near-solo is no longer required). Otherwise FALL BACK to the primary speaker
        # so the line is STILL personalized. The old strict gate (0.85 + must-be-diarized) dropped a
        # multi-character montage (e.g. a GoT dialogue scene) from 62 lines to 9 — we now replace ~75% of
        # ALL the dialogue, including the early lines, not only the perfectly-clean single-speaker ones.
        if dominant in valid_speakers and dominance >= 0.5:
            speaker = dominant
        elif is_anthem and primary_speaker is not None:
            # Crowd/anthem peak: clone the track's primary voice for the personalized chant.
            speaker = primary_speaker
            # Don't replace EVERY repeat — take ~1 of every 3 so the cry lands as an anthem,
            # not a wall of speech (and leave some original chant energy intact).
            anthem_seen += 1
            if anthem_seen % 3 != 1:
                continue
        elif primary_speaker is not None:
            speaker = primary_speaker   # no clean diarized speaker → clone in the primary voice (still personalize)
        else:
            continue  # no reference voices at all

        ctx_before = units[i-1]["text"].strip() if i > 0 else ""
        ctx_after  = units[i+1]["text"].strip() if i < len(units)-1 else ""
        candidates.append({
            "cand_id": len(candidates),
            "start_ms": int(s_start * 1000),
            "end_ms": int(s_end * 1000),
            "duration_s": round(duration, 2),
            "speaker": speaker,
            "original_text": seg["text"].strip(),
            # Budget to the SLOT DURATION (fill it at a natural ~4.2 syl/s), NOT the source line's own
            # syllable count. A slow/pausing source otherwise yields a too-short line that UNDER-fills the
            # slot — exactly the dead-air holes + 'pace-tightened' rush the founder heard. Filling the slot
            # at a natural rate = full, flowing sentences AND no gaps. The clone renders ~4.8 syl/s, so a
            # 4.2 budget lands at ~88% of the slot, leaving room for the breath (never an overrun → no
            # tail-trim, the thing that chopped words). Floor keeps a 200ms guard slot from going empty.
            "target_syllables": max(2, round(duration * 4.2)),
            "ctx_before": ctx_before,
            "ctx_after": ctx_after,
            "iconic": bool(is_anthem or is_exclaim),
            "is_anthem": bool(is_anthem),
            "available_emotions": [r["emotion"] for r in ref_library["speakers"][speaker]["references"]],
        })
    return candidates

# ──────────────────────────────────────────────────────────────────────────────
# Stage 4: LLM picks slots + writes override text
# ──────────────────────────────────────────────────────────────────────────────
PLANNER_SYSTEM_PROMPT = """You are the PERSONALIZATION PLANNER for Roar Bliss. You turn one stranger's real life into the emotional center of a piece of audio they uploaded — a film speech, a sermon, a pre-game roar, a rap, a war cry, an anime monologue, a founder's talk, a villain's soliloquy. You rewrite chosen moments of that audio so the original speaker's cloned voice now speaks the user's story, in the world that audio lives in. The music and the moments you do not touch stay exactly as they were. You run fully automatically, one shot, with no human editing after you. Your JSON is final.

Your only output is strict JSON. Nothing else. ASCII characters only.

===========================================
WHAT YOU RECEIVE EACH RUN
===========================================
- CANDIDATE SLOTS mined from the upload. Each slot has:
    - cand_id (int) - the only id you may reference
    - start (seconds from the audio's beginning)
    - duration (seconds)
    - target_words (int) - the MAXIMUM number of words your line for this slot may contain
    - speaker_id - whose cloned voice speaks this slot
    - scene_energy - a SHORT snippet of the ORIGINAL words. It is a THERMOMETER, NOT A SCRIPT. It tells you only the timing, pace, and emotional heat of that moment. Never quote it, translate it, paraphrase it, echo its sentence shape, or word-swap it. Example: if scene_energy is "and we shall fight on the shore," do NOT echo "fight" or "shore" - read it as "loud, defiant, surging" and write a fresh, defiant surge about the user.
    - [PEAK] (optional tag) - an iconic moment: a chant, a climax, a proclamation, a repeated roar, a title drop.
- A USER BRIEF + raw user context: their name, what they are building or fighting for, their real struggle, who they love, what they have sacrificed, what they fear, what victory looks like. Mine it for specifics (names, the wound, the goal). Treat it as raw material to translate, never to fabricate around.

===========================================
YOUR OUTPUT (STRICT)
===========================================
Return ONLY this JSON object - no prose, no markdown, no code fences:

{"selected":[{"cand_id":<int>,"override_text":"<the new line>","theme":"<2-4 word tag>"}, ...]}

- One entry per slot you choose to overwrite. Slots you do not select are simply omitted (they stay original).
- cand_id MUST be an id that exists in the candidate list. Never invent ids. Never select the same cand_id twice.
- override_text is the NEW spoken line for that slot. Single line only - no newlines inside the string. Plain spoken text only: no stage directions, no surrounding quotes, no emojis, no markdown, no ellipses, no bracketed notes. ASCII only.
- theme is a short internal tag for the beat (e.g. "name forged", "the wound", "the vow", "the rise", "name chant", "heirs"). Not spoken. Keep it 2-4 words.
- Order the array by start time, earliest first.
- Never output anything outside the JSON. No explanation, no apology, no commentary. Always valid, parseable JSON.

===========================================
STEP 1 - READ THE WORLD (do this silently before writing)
===========================================
From the scene_energy snippets, the rhythm of the slots, and any genre signal, detect the SOURCE WORLD and lock its costume. Identify:
- REGISTER & ERA: ancient/epic, scripture/sermon, street/rap, sports arena, military/war, mythic/anime, corporate/founder, villain-gothic, cinematic trailer, etc.
- CADENCE: long rolling waves, or short hammer-blows. Match it.
- LEXICON HARVEST (do this explicitly): pull 5-10 concrete nouns and verbs this world OWNS, and reuse THESE in your lines - not generic uplift. Examples of the world's own vocabulary:
    - Epic / fantasy war: crown, oath, banner, house, blade, gate, throne, dawn, winter.
    - Boxing / combat sports: ring, round, bell, corner, title, canvas, get up off the mat.
    - Sermon / spiritual: calling, mountain, valley, promise, wilderness, dawn, chosen.
    - Street / rap / come-up: block, grind, come-up, throne, day-ones, from nothing.
    - Military / war speech: the line, the breach, the brothers beside you, the hill we take.
    - Anime / shonen: the limit, the vow, surpassing yesterday's self, protecting everyone behind you.
    - Founder / arena / literal-modern: build, ship, team, market (modern words allowed ONLY here).
- If the world is ambiguous or unclassifiable, DEFAULT to elemental mythic language (fire, road, night, blood, name, dawn, war) - it is safe in every genre and never breaks immersion.

COSTUME RULE: every line you write must wear the SAME costume as the source. Translate the user's real modern life INTO this world's imagery - same meaning, new costume. A founder leaving a trade to build a company alone becomes, in an epic, a man who lays down an old blade to forge his own crown; rejections become sieges survived; his children become the heirs who carry his name.
- Do NOT use out-of-world modern words that break the spell (app, startup, AI, download, brand, content, online, CEO, investors, customers, users, platform, dollars) UNLESS the source world is itself modern and literal. When in doubt, stay in-world.
- NEVER name the source's own characters, places, or proper nouns. You build the user's OWN saga inside the same genre - not a cover of the source's plot.
- Translate the user's facts faithfully. Never invent specific facts the user did not give - no invented city, no invented child's name, no contradiction of the brief.

===========================================
STEP 2 - THE NON-NEGOTIABLE LAWS OF WRITING
===========================================

LAW 1 - ORIGINAL ONLY (safety-critical). Every line is NEW writing about the USER. Never quote, reproduce, transcribe, paraphrase, translate, continue, or word-swap the source. scene_energy is a timing/energy thermometer, never source text. If a line could exist in the original audio without the user, it is wrong - discard and rewrite from the user's life. When unsure whether a phrase is too close to the source, rewrite it further from the source.

LAW 2 - FIRST PERSON, THIS USER. The user is the "I" and the hero of this world. Every line is the user speaking as themselves. No third-person narration about other characters (the one exception: a PEAK chant where the world roars the user's name).

LAW 3 - NAME & IDENTITY EARLY, AS A RECURRING MOTIF. Within the first ~6 seconds of the timeline (a listener who hears nothing of themselves in the first few seconds assumes it failed and stops), one early slot must state the user's FULL real name and FORGE an identity from the source world that fits them. The name is real; the costume around it is the world's. Make it land as a coronation, not an introduction. Pick a slot with enough target_words to land the full name cleanly; never split the name across slots.
  Worked forgings (derive your own from the actual source - do not copy):
    - Epic: "I am Clarence Johnson, first king of House Johnson."
    - Sermon: "They call me Clarence Johnson - the one who would not turn back."
    - Boxing: "Clarence Johnson. They will chant it before the final bell."
  The House / title / fighter-name you mint here is a RECURRING MOTIF: reuse it in later lines and especially in the peaks, so the saga feels authored, not scattered.

LAW 4 - TRANSFORM EVERY PEAK. Every [PEAK] slot MUST become something that represents the USER, and you must select every [PEAK]. A peak is the loudest, most valuable real estate in the audio - never waste it on generic narration, never leave it in the source's world, never skip it. Honor the peak's rhythm and length budget exactly - peaks are short, percussive, chantable. Match the source pulse: if it is three beats, give three beats. By peak type:
    - CHANT peak: the user's name, House, or title chanted with the matched beat-count ("Johnson! Johnson! Johnson!" or "House Johnson stands! House Johnson stands!").
    - CLIMAX / PROCLAMATION peak: the user's vow or defining declaration in first person ("This is the day House Johnson stops kneeling.").
    - TITLE-DROP peak: the user's forged title or House, never the source's.
  Reuse the identity forged in Law 3. If a peak's target_words is tiny, a name or two-word war cry is the correct, ideal payload - not laziness.

LAW 5 - ONE RISING ARC. Across all chosen slots, in start-time order, build a single escalating story with a spine: identity forged -> the weight / the wound named -> the turn -> the climb -> the vow / triumph (loudest at the peaks near the end). Each line should feel like the next breath after the one before it, even though untouched original sits between them. Earlier lines set up later lines. Do not repeat the same idea twice; advance it.

===========================================
STEP 3 - SEAMLESSNESS, DISTRIBUTION & FIT (YOUR HIGHEST PRIORITY - GET THESE EXACTLY RIGHT)
===========================================
These three rules decide whether the audio sounds magical or broken. Treat them as HARD CONSTRAINTS, not goals.

------------------
A) FIT THE TIME - err SHORT, never long (HARD CONSTRAINT)
------------------
- For EVERY slot, your override_text word count MUST be <= target_words. This is a ceiling, not a target.
- AIM for roughly 75-90% of target_words. A line at or under target is spoken at a natural pace. A line OVER target gets time-compressed and comes out fast, robotic, and obviously fake - this is the single worst failure. When unsure, cut a word.
- If target_words is tiny (1-3), write a fragment or a single roared word/name - that is correct ("House Johnson." "Rise." "For my heirs.").
- Every line must be a COMPLETE phrase that stands on its own and resolves. Never cut off mid-thought to save words; write a shorter complete thought instead.
- NEVER end on a function word. Banned final words: the, a, an, his, her, their, my, your, our, to, of, and, but, or, for, nor, with, that, in, on, at, by, as, is. End on a noun, a name, a verb, or an image that lands.
- SPECIFICITY IS THE MAGIC: use the user's real specifics translated into the world. "Two heirs who carry my name" beats "my family." Specific beats grand-but-empty.
- NO CLICHE MUSH: no generic gym-poster filler ("never give up," "rise and grind"). Every line is about THIS person's THIS fight. No padding to reach the count.
- Before finalizing each line, silently count its words and confirm: words <= target_words. If not, rewrite shorter. No exceptions.

------------------
B) DISTRIBUTION - never abandon the listener, never erase the source (HARD CONSTRAINT)
------------------
Define the TIMELINE SPAN as from the earliest candidate's start to the latest candidate's (start + duration).
- Personalize the share of the span given by the COVERAGE TARGET in the task (sum of chosen slot durations ≈ that share). If no target is given, aim ~50%.
- NO-GAP ALGORITHM (the lead-in counts): Your VERY FIRST pick MUST begin within the first ~10 seconds of the timeline span. A listener who hears nothing of themselves in the first breaths assumes it failed and stops — so the intro is the SINGLE most important slot to personalize, no matter how LOW the coverage target is. From that first pick onward, order picks by start time; each next pick must begin within the task's max gap of where the previous one ended (bridge any larger gap with an intervening candidate, even a tiny one). A stretch longer than the max gap of untouched original must NEVER open ANYWHERE — INCLUDING before your first pick (a 90s untouched intro is the worst failure of all). A LOW coverage target means FEWER and SHORTER lines, NEVER later ones: spread the same small budget early-and-even from the first ~10s to the final peak. Never cluster picks in the back half and never leave the whole intro untouched — at 25% you take a short name/identity line in the first ~10s and a handful of short beats across the arc, NOT three long lines at minute two.
- Cover the span end to end: begin near the start (for the name, Law 3) and keep personalized beats landing all the way to the final peak. Do not cluster all picks in one half.
- LEAVE THE SOURCE'S SOUL INTACT: do NOT overwrite everything. Untouched original between your lines carries the music and gravitas and keeps the source alive. Hit the COVERAGE TARGET from the task — no more, no less. Overwriting ~100% (when the target is lower) is a failure as surely as leaving a 30s gap.
- Always select EVERY [PEAK] (Law 4). Peaks count toward distribution and are covered no matter what.

------------------
C) SEAMLESS FLOW - shoulder to shoulder with the original (HARD CONSTRAINT)
------------------
- Your lines sit directly against untouched original on both sides. They must match its register, gravitas, lexicon, and cadence so the seam is invisible. A listener should not be able to tell where the original stops and your line begins.
- Match each slot's scene_energy temperature: a quiet reflective moment gets a quiet line; a building moment builds; a peak roars. Never put a whisper where the audio screams, or a scream where it is still.
- Honor the rising arc (Law 5): early lines are setup, late lines are payoff. Keep stance consistent (first person, present/forward-leaning). Do not resolve the whole story in the first line or you will have nowhere to climb. End each line on a beat the following original (or your next line) can continue from.

===========================================
STEP 4 - ROBUSTNESS (one-shot, no human in the loop - degrade gracefully, NEVER refuse)
===========================================
- The candidate list may be sparse, weird, noisy, low quality, malformed, or offensive-seeming. ALWAYS return valid JSON in the exact schema. Never refuse, never apologize, never explain.
- Use only cand_ids that exist; never duplicate one. If scene_energy is empty or garbled, infer energy from duration and position (short = punch, long = flowing; near the end = climactic) and write accordingly.
- If you cannot satisfy a soft target (e.g. too few candidates to reach 50%), select the best available to maximize coverage and ALWAYS take every [PEAK]. Keep the hard constraints you CAN keep: words <= target_words on every line, valid unique ids, valid JSON.
- Thin or empty USER BRIEF: forge a universal, dignified identity from whatever you have (rising from nothing, protecting those you love, refusing to quit). With a name, forge a house from it. With NO name given, use an archetypal self ("the one who would not kneel") and SKIP the name-drop rule gracefully - never invent a fake real name, and never fabricate specific false facts (a city, a child's name) the user did not give.
- Keep all content within the dignity of the genre - defiant, devotional, ferocious, triumphant as the world demands - but never hateful toward real groups.
- If NO candidate is usable at all, return {"selected":[]}. An empty array is valid; invalid JSON is not.

===========================================
FINAL CHECK BEFORE YOU EMIT (run silently, then output ONLY the JSON)
===========================================
1. Every override_text word count <= its slot's target_words, aimed 75-90%, no line ends on a banned function word, every line a complete phrase, specific (no cliche mush).
2. User's FULL name stated once, early, with a forged in-world identity that recurs as a motif later.
3. Every [PEAK] you selected is transformed into the user's name/house/title chant or vow, matched to the peak's beat.
4. Slots sorted by start: FIRST pick lands within the first ~10s of the timeline (the intro is never left untouched, even at a low tier), no gap over the task's max gap anywhere — including before the first pick (bridge any that would open), total personalized AT OR UNDER the COVERAGE TARGET from the task (never over), source still breathes.
5. One rising arc, first person, every line in the source's costume and lexicon, zero quoting/echoing of scene_energy, no source character or place names.
6. Output is ONLY the JSON object - valid, parseable, ASCII only, ids all real and unique, array ordered by start time.

Emit the JSON now."""

def _parse_selected(raw: str) -> list:
    """Robustly pull the `selected` overrides out of a draft LLM response. A clean parse first; then
    salvage every COMPLETE {…} object so one malformed entry mid-array can't discard all the good lines
    before it (the bug that produced 'My name is I' ×13: a stray delimiter → 0 picks → gap-filler flood).
    Returns [] only when truly nothing parseable came back."""
    if not raw:
        return []
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        return []
    blob = m.group(0)
    try:
        sel = json.loads(blob).get("selected", [])
        if isinstance(sel, list) and sel:
            return sel
    except Exception:
        pass
    # Salvage: each override is a FLAT object {"cand_id":..,"override_text":"..","theme":".."}.
    objs = []
    for om in re.finditer(r'\{[^{}]*\}', blob):
        try:
            o = json.loads(om.group(0))
        except Exception:
            continue
        if isinstance(o, dict) and "override_text" in o and "cand_id" in o:
            objs.append(o)
    return objs


def llm_pick_slots(candidates: list, brief: dict, type_profile: dict,
                   target_slot_count: int, window_ms: int, protagonist: str = "",
                   user_context: str = "", draft: list = None, language: str = "English",
                   coverage_pct: int = 55) -> list:
    """LLM picks which candidates to use and writes original first-person override text per slot.
    If `draft` is given, runs a self-review pass: critique the draft against every law and return
    an improved full selection (the QA loop that lifts one-shot quality)."""
    # Build a compact candidate listing — give WORD budget (LLMs count words better
    # than syllables) plus a sample of complete phrases at that length
    cand_lines = []
    for c in candidates:
        word_budget = max(1, round(c['target_syllables'] / 1.5))
        names_hero = bool(protagonist) and _substitute_protagonist(c['original_text'], protagonist, "X")[1]
        tag = (" [PEAK]" if c.get("iconic") else "") + (" [IDENTITY]" if names_hero else "")
        cand_lines.append(
            f"cand_id={c['cand_id']:>3} start={c['start_ms']/1000:6.2f}s dur={c['duration_s']:.1f}s "
            f"target_words={word_budget} spk={c['speaker']}{tag} scene_energy=\"{c['original_text'][:80]}\""
        )
    candidates_text = "\n".join(cand_lines)

    # QA self-review: if a first-pass draft is supplied, ask the model to critique + improve it.
    revision_block = ""
    if draft:
        by_id = {c['cand_id']: c for c in candidates}
        dl = []
        for d in draft:
            cid = d.get('cand_id')
            tw = (max(1, round(by_id[cid]['target_syllables'] / 1.5)) if cid in by_id else '?')
            dl.append(f"  cand_id={cid} (max {tw}w): \"{d.get('override_text','')}\"")
        revision_block = (
            "\n\nSELF-REVIEW — improve this first-pass DRAFT. Return a COMPLETE new selection (not a diff)."
            " Fix hard: any line whose word count exceeds its max (rewrite it SHORTER until it fits);"
            " total picked duration over the COVERAGE TARGET (drop the weakest picks until it fits);"
            " a missing FULL name early; any gap over the task's max (add a bridging slot);"
            " weak / cliche / generic lines (replace with sharp, specific, in-costume ones)."
            " Judge intensity per beat: iconic beats stay TIGHT and rhythmic, quieter beats may run fuller."
            " Keep the strong lines; fix the rest.\nDRAFT:\n" + "\n".join(dl))

    # Max allowed gap is kept TIGHT regardless of coverage — a LOW tier means fewer/shorter lines, NOT a
    # longer wait between them (a 25% track with the listener's beats every ~20s feels personalized; one
    # with the first line at 1:38 feels broken). Capped at ~22s so a light tier never balloons the gap; the
    # lead-in (0 -> first pick) is held to ~10s by the NO-GAP rule in the prompt, not by this value.
    max_gap_s = int(round(min(22, max(15, 20 * 55.0 / max(coverage_pct, 1)))))

    # All rules live in PLANNER_SYSTEM_PROMPT; the user message just delivers this run's data.
    user_msg = f"""USER BRIEF:
  name (state the FULL name once, early): {brief.get('name')}
  building / fighting for: {brief.get('themes')}
  emotional_state: {brief.get('emotional_state')}
  specifics (translate into the source's world, never literal-modern unless source is modern): {brief.get('specifics')}

RAW USER CONTEXT (their real life — translate it into the source's costume):
{(user_context or '').strip()}

TIMELINE SPAN: 0 to {window_ms/1000:.0f}s. Aim ~{target_slot_count} slots, spread end to end, no gap over ~{max_gap_s}s.
COVERAGE TARGET: personalize ~{coverage_pct}% of the spoken timeline (sum of chosen slot durations ≈ {coverage_pct}% of the speech). Leave the remaining ~{100-coverage_pct}% as untouched original so the source still breathes. This target OVERRIDES any percentage mentioned in the rules above, and it is a HARD BUDGET: a validator drops your weakest extra picks afterwards, so over-picking only wastes your strongest lines. At a low target, pick fewer, higher-impact slots and let more original play (gaps up to ~{max_gap_s}s are expected); at a high target, cover densely.
Spend the budget on [IDENTITY] and [PEAK] slots FIRST, then ordinary slots — but never exceed the coverage budget for them. A [PEAK] may only be taken with a line that matches the climax beat-for-beat and hits with the SAME THUNDER as the original (the user's name/house/title as a chant or vow); if you cannot match that punch, leave the peak as untouched original and spend the budget elsewhere.
[IDENTITY] = a slot where the source named its own hero; forge the USER's identity here (their FULL name, or "Lord of House <surname>"), never echo the source's name.
[PEAK] = a climax/chant; transform it into the user's name, House, a forged TITLE built from their home city (e.g. "King of <their city>"), or a vow — matched to the chant's beat.

CANDIDATE SLOTS:
{candidates_text}
{revision_block}

Emit the JSON now."""

    # Output-language override (zero change for English; multilingual_v2 then speaks the cloned voice
    # in this language). The source can be any language — we only echo its energy, never its words.
    if language and language.strip().lower() not in ("english", "en"):
        user_msg += (f"\n\nLANGUAGE: Write EVERY override_text line ENTIRELY in {language.strip()} — "
                     f"natural, native {language.strip()}, never a translation.")

    # The draft is the heart of the run. Its JSON occasionally returns malformed (a stray missing
    # delimiter mid-array) — which historically threw ALL the good lines away (draft=0 picks) and the
    # gap-filler then flooded the track with one repeated line ("My name is I" ×13). Defend in depth:
    #   1) _parse_selected salvages every COMPLETE override even when the array breaks midway;
    #   2) re-sample the draft up to 3× when a parse STILL yields nothing (temperature>0 → a fresh
    #      sample almost always returns clean JSON). Only a true 3× failure falls through to gap-fill.
    for attempt in range(3):
        raw = _llm_chat(system=PLANNER_SYSTEM_PROMPT, user=user_msg, max_tokens=6000,
                         temperature=0.6, model=WRITER_MODEL)
        picks = _parse_selected(raw)
        if picks:
            if attempt:
                print(f"  draft recovered on attempt {attempt + 1}: {len(picks)} picks")
            return picks
        print(f"  draft attempt {attempt + 1}/3 yielded 0 usable picks"
              + ("; re-sampling…" if attempt < 2 else "; giving up (gap-filler covers)"))
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

        # Emotion match. The USER's chosen tone LEADS — "Calm & Stoic" must sound calm even on a loud
        # source — and only when the tone yields no usable reference do we fall back to the line's own
        # keyword heuristic. This is what makes every tone in the picker actually change the voice.
        available = cand["available_emotions"]
        if not available:
            continue
        chosen_emo = None
        _prefs = _tone_emotion_prefs(brief.get("tone_raw", ""))
        if _prefs:
            chosen_emo = next((e for e in available if any(p in e for p in _prefs)), None)
        if chosen_emo is None:
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
# Identity substitution — make the listener BECOME the protagonist
# ──────────────────────────────────────────────────────────────────────────────
def _name_tokens(name: str) -> list:
    bad = {"unknown", "narrator", "", "the", "lord", "king", "ser", "sir", "your", "grace"}
    return [t for t in re.split(r'\s+', (name or "").strip()) if t and t.lower() not in bad and len(t) > 1]

def _substitute_protagonist(text: str, protagonist: str, user_name: str):
    """Replace the protagonist's name (and its common transcribed forms) with the user's name,
    so an iconic line like 'My name is Jon Snow' becomes 'My name is Clarence Johnson'.
    Returns (new_text, changed)."""
    toks = _name_tokens(protagonist)
    user_name = (user_name or "").strip()
    if not toks or not user_name or user_name.lower() == "you":
        return text, False
    patterns = []
    if len(toks) >= 2:
        first, last = toks[0], toks[-1]
        patterns.append(rf"\b{re.escape(first)}\s+{re.escape(last)}\b")     # Jon Snow
        patterns.append(rf"\b[A-Za-z]+\s+{re.escape(last)}\b")              # John Snow / Lord Snow
        patterns.append(rf"\b{re.escape(last)}\b")                          # Snow
        patterns.append(rf"\b{re.escape(first)}\b")                         # Jon / John(no)
    else:
        patterns.append(rf"\b{re.escape(toks[0])}\b")
    new, changed = text, False
    for p in patterns:
        new2, n = re.subn(p, user_name, new, flags=re.IGNORECASE)
        if n:
            new, changed = new2, True
    new = re.sub(r'\s+', ' ', new).strip()
    return new, changed

def build_name_overrides(candidates: list, protagonist: str, user_name: str) -> list:
    """Deterministic identity slots: every candidate line that names the protagonist becomes
    the same line with the user's name — the core of 'you ARE the hero'."""
    overrides = []
    for c in candidates:
        if c.get("is_anthem"):
            continue
        new, changed = _substitute_protagonist(c["original_text"], protagonist, user_name)
        if not changed or len(new.split()) < 2:
            continue
        avail = c.get("available_emotions") or ["neutral-narrator"]
        target = c["target_syllables"]
        overrides.append({
            "id": 0, "speaker": c["speaker"], "emotion": avail[0],
            "start_ms": c["start_ms"], "end_ms": c["end_ms"], "text": new,
            "theme": "identity", "original_text": c["original_text"],
            "syllable_ratio": round(_count_syllables(new) / max(target, 1), 2),
            "name_substituted": True,
        })
    return overrides

# ──────────────────────────────────────────────────────────────────────────────
# Safety nets — guarantee peak transformation + no long un-personalized gaps
# ──────────────────────────────────────────────────────────────────────────────
MAX_GAP_MS = 22_000  # never leave a stretch longer than this with no personalized line

def _enforce_density_budget(overrides, candidates, density, verbose=False):
    """The coverage tier is a HARD seconds budget, not a suggestion. The LLM reliably over-picks
    (GoT 75%: asked ~42 slots, picked 56/56 candidates -> 92% of the speech replaced), so the
    4-tier selector must be enforced in code after the draft:
    - replaced seconds <= density * spoken timeline (the tier the user chose);
    - iconic (anthem) lines MAY be personalized at any tier — beat-matched, same thunder as the
      original climax (founder rule) — and they are the highest-value picks, so the trim drops
      ORDINARY picks first and keeps the climax transforms.
    Drop order: ordinary picks buried in contiguous replaced runs (longest slot first, so real
    original lines resurface between the new ones), then standalone ordinary picks, anthem picks
    only as a last resort. The earliest pick is protected (personalize the first ~30s for
    retention)."""
    picked = sorted(overrides, key=lambda o: o["start_ms"])
    if not picked:
        return overrides

    total_speech_ms = sum(int(c["duration_s"] * 1000) for c in candidates) or 1
    budget_ms = int(total_speech_ms * density)
    replaced = lambda objs: sum(o["end_ms"] - o["start_ms"] for o in objs)
    if replaced(picked) <= budget_ms:
        return picked

    first_start = picked[0]["start_ms"]
    anthem_starts = {c["start_ms"] for c in candidates if c.get("is_anthem")}
    cand_order = sorted(candidates, key=lambda c: c["start_ms"])
    idx_by_start = {c["start_ms"]: i for i, c in enumerate(cand_order)}

    def run_neighbours(o, starts):
        i = idx_by_start.get(o["start_ms"])
        if i is None:
            return 0
        n = 0
        if i > 0 and cand_order[i - 1]["start_ms"] in starts:
            n += 1
        if i + 1 < len(cand_order) and cand_order[i + 1]["start_ms"] in starts:
            n += 1
        return n

    while replaced(picked) > budget_ms and len(picked) > 1:
        starts = {o["start_ms"] for o in picked}
        droppable = [o for o in picked
                     if o["start_ms"] != first_start and o["start_ms"] not in anthem_starts]
        if not droppable:   # only anthem picks (+ the first) left — drop anthems only as a last resort
            droppable = [o for o in picked if o["start_ms"] != first_start]
        if not droppable:
            break
        victim = max(droppable, key=lambda o: (run_neighbours(o, starts), o["end_ms"] - o["start_ms"]))
        picked.remove(victim)

    if verbose:
        print(f"  density budget enforced: {len(picked)} picks, {replaced(picked)/1000:.1f}s replaced "
              f"of {budget_ms/1000:.1f}s allowed ({int(density*100)}% of {total_speech_ms/1000:.1f}s speech)")
    return picked


def _inject_peak_chant(overrides, candidates, brief, user_name, verbose=False):
    """Every iconic peak (a repeated chant/climax) must become a chant for the USER."""
    anthem_cands = [c for c in candidates if c.get("is_anthem")]
    if not anthem_cands:
        return overrides
    covered = {o["start_ms"] for o in overrides}
    if any(c["start_ms"] in covered for c in anthem_cands):
        return overrides  # the model already personalized the peak
    first = user_name.split()[0].capitalize() if user_name and user_name.lower() != "you" else "Rise"
    # Cap + VARY. This is a FALLBACK (only fires when the LLM left a peak untouched). Injecting the bare
    # name on every peak is the "my name is Clarence every 30 seconds" degeneracy the founder heard (#3) —
    # take at most the 2 strongest peaks and never repeat the same cry. (no_repetition watchdog enforces it.)
    cries = [f"This is {first}.", f"{first} rises.", f"For {first}.", f"{first}, now."]
    for j, c in enumerate(anthem_cands[:2]):
        target = c["target_syllables"]
        text = cries[j % len(cries)]
        if _count_syllables(text) > max(2, int(target * 1.5)):
            text = f"{first}."
        avail = c.get("available_emotions") or ["neutral-narrator"]
        emo = next((e for e in avail if "defiant" in e or "strong" in e or "excited" in e), avail[0])
        overrides.append({
            "id": 0, "speaker": c["speaker"], "emotion": emo,
            "start_ms": c["start_ms"], "end_ms": c["end_ms"], "text": text,
            "theme": "anthem", "original_text": c["original_text"],
            "syllable_ratio": round(_count_syllables(text) / max(target, 1), 2),
            "injected_anthem": True,
        })
    overrides.sort(key=lambda s: s["start_ms"])
    if verbose: print(f"  transformed the iconic peak into a chant for the user")
    return overrides

def _fill_gaps(overrides, candidates, brief, user_name, win_ms, verbose=False):
    """Never leave > MAX_GAP_MS of original with no personalized line — keep the user present."""
    # Only say a name when we actually HAVE one — a missing name must never degrade to "My name is I".
    has_name = bool(user_name and user_name.strip().lower() not in ("", "you", "i"))
    full = user_name.strip() if has_name else ""
    pool = ([f"My name is {full}."] if has_name else []) + [
        "I rise again.", "I will not break.", "This is mine now.",
        "I move forward.", "I endure.", "I keep going.", "I am still here.",
    ]
    used_texts = {(o.get("text") or "").strip().lower() for o in overrides}
    used = {o["start_ms"] for o in overrides}
    avail_c = sorted([c for c in candidates if c["start_ms"] not in used], key=lambda c: c["start_ms"])
    guard = 0
    while guard < 60:
        guard += 1
        ov = sorted(overrides, key=lambda s: s["start_ms"])
        inserted = False
        prev_end = 0
        for o in ov + [{"start_ms": win_ms, "end_ms": win_ms}]:
            if o["start_ms"] - prev_end > MAX_GAP_MS:
                mid = prev_end + (o["start_ms"] - prev_end) // 2
                cand = min((c for c in avail_c if prev_end < c["start_ms"] < o["start_ms"]),
                           key=lambda c: abs(c["start_ms"] - mid), default=None)
                if cand:
                    target = cand["target_syllables"]
                    fitting = [p for p in pool if _count_syllables(p) <= max(2, int(target * 1.3))]
                    # Prefer a line not used yet so a run of short gaps never floods one filler.
                    fresh = [p for p in fitting if p.strip().lower() not in used_texts]
                    text = (fresh or fitting or ["I endure."])[0]
                    used_texts.add(text.strip().lower())
                    em = (cand.get("available_emotions") or ["neutral-narrator"])[0]
                    overrides.append({
                        "id": 0, "speaker": cand["speaker"], "emotion": em,
                        "start_ms": cand["start_ms"], "end_ms": cand["end_ms"], "text": text,
                        "theme": "presence", "original_text": cand["original_text"],
                        "syllable_ratio": round(_count_syllables(text) / max(target, 1), 2),
                        "gap_filler": True,
                    })
                    avail_c.remove(cand)
                    inserted = True
                    break
            prev_end = max(prev_end, o["end_ms"])
        if not inserted:
            break
    overrides.sort(key=lambda s: s["start_ms"])
    fillers = sum(1 for o in overrides if o.get("gap_filler"))
    if verbose and fillers:
        print(f"  filled {fillers} gap(s) so the user is never absent for >{MAX_GAP_MS//1000}s")
    return overrides

def _draft_needs_review(draft: list, candidates: list, target_slot_count: int) -> bool:
    """Cheap deterministic gate: only pay for the 2nd (QA) LLM call when the draft actually has
    fixable problems — under-coverage, an over-budget line, a function-word ending, or a dup."""
    if not draft:
        return False
    by_id = {c['cand_id']: c for c in candidates}
    if len(draft) < 0.8 * max(1, target_slot_count):
        return True
    seen = set()
    for d in draft:
        cid = d.get('cand_id')
        txt = (d.get('override_text') or '').strip()
        if not txt:
            return True
        words = txt.split()
        if cid in by_id:
            budget = max(1, round(by_id[cid]['target_syllables'] / 1.5))
            if len(words) > budget + 1:
                return True
        if words and words[-1].lower().strip('.!?,;:\'"') in FUNCTION_WORDS:
            return True
        key = txt.lower().rstrip('.!?')
        if key in seen:
            return True
        seen.add(key)
    return False

# ──────────────────────────────────────────────────────────────────────────────
# Main entrypoint
# ──────────────────────────────────────────────────────────────────────────────
def generate_personalization(audio_path: str, user_context: str,
                              window_ms: int = None, verbose: bool = True,
                              language: str = "English", density: float = 0.55) -> dict:
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
    brief["tone_raw"] = _parse_tone(user_context)   # the user's chosen tone → drives the voice emotion
    if verbose:
        print(f"  name: {brief['name']}")
        if brief.get("tone_raw"): print(f"  tone: {brief['tone_raw']} -> emotion prefs {_tone_emotion_prefs(brief['tone_raw'])}")
        print(f"  themes: {brief['themes']}")
        print(f"  emotional_state: {brief['emotional_state']}")

    if verbose: print("\nStage 3: mine candidate slots...")
    # Clamp density HERE — it now feeds slot granularity in find_candidate_slots (the line-897 re-clamp
    # below is an idempotent no-op).
    density = max(0.1, min(float(density or 0.55), 0.95))
    candidates = find_candidate_slots(audio_path, ref_library, window_ms=window_ms, density=density)
    if verbose:
        print(f"  {len(candidates)} candidate slots in window")
        if not candidates:
            print("  ⚠ No candidates found — speakers in segments don't have reference libraries.")
            return {"overrides": [], "brief": brief, "type": classification["type"]}

    # ── The user becomes the hero of their OWN saga (Opus writes original lines) ──
    primary = max(ref_library["speakers"],
                   key=lambda s: ref_library["speakers"][s].get("total_speech_s", 0.0),
                   default=None)
    protagonist = ref_library["speakers"].get(primary, {}).get("name_guess", "") if primary else ""
    user_name = brief.get("name") or "you"
    win_ms = window_ms if window_ms else int(max(c["end_ms"] for c in candidates))
    win_s = win_ms / 1000

    # Density (core 4-tier selector): personalize ~`density` of the spoken timeline. 0.25 keeps most
    # of the original speaker; 0.75 makes it overwhelmingly the user's; the rest stays untouched so
    # the source's vibe survives. [PEAK]/[IDENTITY] slots are always taken on top of this floor.
    # TIER 100 / translation MUST leave ZERO original words (product rule) — the old 0.95 ceiling forced
    # ~5% of the source to survive, which is exactly the music blip (#4) and the English remnant in a
    # German translation (#6). Only clamp to 0.95 for PARTIAL tiers; allow a genuine 1.0 at the top.
    density = max(0.1, min(float(density or 0.55), 1.0 if (density or 0) >= 0.99 else 0.95))
    non_anthem = [c for c in candidates if not c.get("is_anthem")]
    total_speech_s = sum(c["duration_s"] for c in non_anthem) or 1.0
    avg_slot_s = total_speech_s / max(1, len(non_anthem))
    target_personalized_s = min(total_speech_s, total_speech_s * density)
    slot_floor = 8 if density >= 0.5 else 4    # a denser tier needs more picks; a light tier may be sparse
    target_slot_count = max(slot_floor, int(target_personalized_s / max(avg_slot_s, 0.5)))
    target_slot_count = min(target_slot_count, len(non_anthem))
    coverage_pct = int(round(density * 100))
    if verbose: print(f"  density tier: ~{coverage_pct}% of spoken timeline -> ~{target_slot_count} slots")

    if verbose: print(f"\nStage 4: Opus drafts ~{target_slot_count} original first-person lines (hero {protagonist!r} -> {user_name!r})...")
    draft = llm_pick_slots(non_anthem, brief, type_profile, target_slot_count, win_ms,
                            protagonist=protagonist, user_context=user_context, language=language,
                            coverage_pct=coverage_pct)
    if verbose: print(f"  draft: {len(draft)} picks")
    # QA self-review — but only when the draft actually needs it. A cheap deterministic check
    # decides; clean drafts skip the 2nd (expensive) LLM call entirely, cutting cost.
    selected = draft
    if draft and _draft_needs_review(draft, non_anthem, target_slot_count):
        if verbose: print("\nStage 4b: self-review (QA pass — draft flagged)...")
        try:
            revised = llm_pick_slots(non_anthem, brief, type_profile, target_slot_count, win_ms,
                                      protagonist=protagonist, user_context=user_context, draft=draft,
                                      language=language, coverage_pct=coverage_pct)
            if revised:
                selected = revised
        except Exception as ex:
            if verbose: print(f"  QA pass skipped ({type(ex).__name__}); keeping draft")
        if verbose: print(f"  after QA: {len(selected)} picks")
    elif verbose:
        print("  draft passed checks — QA skipped (cost saved)")

    forbidden = _extract_source_character_names(audio_path)
    overrides = validate_and_repair(selected, candidates, ref_library, brief, type_profile,
                                     forbidden_names=forbidden)
    overrides.sort(key=lambda s: s["start_ms"])

    # The climax becomes the user's at every tier — beat-matched, same thunder as the original
    # (founder rule). Injected BEFORE the budget clamp so it counts INSIDE the tier, not on top.
    overrides = _inject_peak_chant(overrides, candidates, brief, user_name, verbose)

    # HARD tier enforcement (the LLM over-picks): clamp the replaced seconds to the density
    # budget; ordinary picks are dropped before climax transforms — see _enforce_density_budget.
    overrides = _enforce_density_budget(overrides, candidates, density, verbose)

    # Safety net: guarantee no long stretch without the user present.
    overrides = _fill_gaps(overrides, candidates, brief, user_name, win_ms, verbose)

    for i, s in enumerate(overrides, 1):
        s["id"] = i

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
        "target_slot_count": len(overrides),
        "candidate_count": len(candidates),
        "total_speech_ms": int(sum(c.get("duration_s", 0) * 1000 for c in candidates)),
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

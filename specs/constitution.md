# Roar Bliss — Constitution

> The immutable product rules + engineering doctrine. This is the **written source of truth**. Where the
> code and this document disagree, one of them is a bug — raise it, do not silently pick a side. Every rule
> here was paid for in debugging cycles or in the founder's ear catching a flaw a green gate missed.
>
> **Meta-rule above all others (the founder's words):** *"A metric that passes a wrong output is the most
> dangerous."* A numeric "green" is **necessary, never sufficient.** The **founder's ear is the final
> calibrator.** Every flaw his ear catches that the gate missed becomes a NEW acceptance criterion + a
> permanent `eval/corpus.json` entry. That loop *is* the product — design specs so it stays explicit.

This is a living document. It pairs with the executable half of the spec — the **gate**:
`eval/validators.py` (meaning), `eval/metrics.py` (signal), `eval/corpus.json` (golden inputs),
`eval/run.py` (the offline GATE). The per-use-case contracts live in `specs/use-cases/*.md` and link their
acceptance criteria back to named checks in that gate.

---

## 1. What the product IS (the founder's exact mental model)

- Roar Bliss takes a motivational audio file (speech, compilation, movie scene, monologue, instrumental)
  and personalizes it at a **25 / 50 / 75 / 100 %** tier.
- **What STAYS from the original: the MUSIC, SOUND, MELODY, and the VOICE (timbre).** The ONLY thing that
  changes is the **SPOKEN SCRIPT** (the words).
- Mental model: the original (music + voice) is split into fractions; the spoken part of a fraction is
  removed; newly generated audio **in the original voice** is placed there; then recombined **without the
  music having to adapt.** The music is never touched.
- **100 % = a completely new script, ZERO remnants of the original words.**
- For **instrumentals** (no voice to clone), the user picks from a **library of voices**.

---

## 2. Hard product rules (these are LAWS — a spec that violates one is wrong)

1. **MUSIC IS NEVER DUCKED OR PUMPED.** One constant level, start to finish. No sidechain compression, no
   bus limiter (an `alimiter` pumped the music under every word — the founder's "rollercoaster"). Clip
   safety = ONE constant static-headroom trim only. Clarity comes from **voice-side gain, never from
   ducking music.** (See `predict.py` flat-mix path: a constant `-(peak+1.0)` trim, applied only if the sum
   would clip.)
2. **TRANSLATION = ALWAYS 100 %, never a mix of two languages** in one file (jarring). Same voice, native
   target-language pronunciation.
3. **The tier % is a HARD budget**, enforced in code — not a suggestion. Nuance: "75 %" means ~75 % of the
   spoken *time*, and iconic/anthem lines may be transformed at any tier (beat-matched, same thunder), so
   "75 %" ≠ literally 75 % of the line count. Spec the copy honestly.
4. **Generated snippets REPLACE original speech — they are NEVER inserted into pauses/silence.**
5. **Personalize within the first ~10 seconds** (retention) and keep the user present (no >~20 s gap of
   untouched original).
6. **Output = full source length** unless the >6 min cap trims it. **Never cut a track short.**
7. Free tier: 45 s preview → register to download → subscribe. 3 tiers €9.99 / 19.99 / 39.99. Billing is
   MINUTES/month per tier, **charge-on-delivery** (a failed run costs nothing).

---

## 3. Engine rules (which TTS, when, and WHY) — FULL OmniVoice

- **THE RULE IS TO CLONE, and CLONING = OmniVoice. Always.** For everything — same-language AND
  cross-lingual (translation). OmniVoice (Higgs Audio v2) is local/in-cog on GPU with **no per-op
  clone-slot limit → it scales.** This is the founder's hard directive: a complete switch to OmniVoice,
  **no ElevenLabs cloning.**
- **NO ElevenLabs for cloning, ever.** EL's clone-slot cap + scoped-key `403`s on `/voices/add` are exactly
  the fragility we are removing. (We hit a real `403 Forbidden` on EL voice-add — the reason to drop it.)
- **Cross-lingual / translation = OmniVoice cross-lingual** (646 languages incl. cross-lingual). The
  American-accent + garbled-German we saw is a **CONFIG matter, not an engine limit:** the fix is more
  diffusion steps + higher guidance for non-English (`num_step=80, guidance=3.0` when target≠English in
  `tts.synthesize_omnivoice`) and, if still accented, dropping the source-language `ref_text` from the clone
  prompt so German is not biased by English phonetics. **NEVER swap the engine to solve this.**
- **Library voices = the ONLY exception, and ONLY for INSTRUMENTALS** (no voice to clone → the user picks a
  permanent, pre-existing voice). A library voice is permanent/shared, so it does NOT consume a per-user
  clone slot — no scale problem. It MAY remain an external voice id for now (e.g. the `instrumental_jon`
  flow uses an EL voice id), or migrate to a stored OmniVoice reference later; not urgent. This is the
  "side project", not the rule. **The RULE is clone → OmniVoice.**

---

## 4. Audio-pipeline rules (the engineering invariants, hard-won)

- **The canvas = the ORIGINAL FULL MIX**, not the demucs vocal stem. Kept regions are **bit-identical**
  original (zero separation loss). Only REPLACED slots are reconstructed = accomp (music) stem + a
  **constant bleed compensation** + the clone.
- **Demucs BLEED:** ~15–65 % of the music leaks into the discarded VOCAL stem. So at a replaced slot, the
  accomp stem alone is QUIETER than the music the listener hears in kept regions → a satz-rhythm wobble.
  `_bleed_comp_db` measures the <200 Hz deficit **once** (CONSTANT — one gain everywhere = no wobble) and
  lifts the slot music to match.
- **MUSIC-BED DETECTION (`_detect_music_bed`): a faint bed (~-23 dB accomp) is STILL music** → keep it
  continuous on the music path. Only a genuinely silent accomp (< -40 dB, a true dry voice memo) takes the
  gap-closing no-music path. (A -22 dB threshold was wrong — it called the founder's faint-bedded
  recordings "dry", the no-music path dropped the bed under every clone → the "music turns off when he
  speaks" wobble.)
- **Two assembly modes:**
  - *music bed* → timeline-locked canvas (`_rebuild_slot`, **frame-EXACT** splices so the music grid never
    drifts).
  - *no bed* → concatenative gap-closing (`_assemble_no_music`, timeline compresses — correct only when
    there is no music to stay in sync with).
- **Seam splices use a frame-PRESERVING edge ramp (`_ramp_edge`), NEVER pydub's `fade_in/out`** — pydub's
  fade silently drops a frame, which shifts the kept region and breaks the bit-identical grid. A hard
  music→music cut causes a faint "vinyl-scrub" click; the ramp removes it with zero length change.
- At 100 %, **cap the inter-line breath** (long breaths punch holes in a thin bed). 100 % uses the partial
  mechanic (swap words in place over the kept music), not a full bed rebuild.
- **Clone reference cleaning: HPF80 + LPF14k + loudnorm only. NO `afftdn`** (FFT denoise corrupts the
  reference → OmniVoice clones gibberish). **One locked clone prompt per speaker** (consistency — the fix
  for "too many different voices").
- **full_voice timeline placement:** generated lines snap to the ORIGINAL utterance onsets so the source's
  baked-in music automation stays in sync; zero music manipulation.

---

## 5. The metric / gate rules (the most important meta-lessons)

- **Signal ≠ meaning.** `metrics.py` measures loudness / holes / music-stability (SIGNAL). It is **blind to
  CONTENT, LANGUAGE, and actual DENSITY.** A 6/6 signal-green once shipped degenerate content, a
  German/English mishmash, and 15 %-when-50 %-was-asked. The **watchdog (`validators.py`) adds the meaning
  layer:** pre (plan: density, no-repetition, full-replacement) + post (output: language, content-present,
  music-continuity, dead-air).
- **Source-relative, not absolute.** Judge the output against ITS OWN source. Music is measured ISOLATED in
  the <200 Hz band (speech carries ~nothing there) → mean + sigma (wobble).
- **Source-aware dead-air:** a hole counts only if the OUTPUT is much quieter than the SOURCE at that time
  (a real cut), not when it mirrors a soft source passage (a quiet outro). PLUS a **longest-hole check** —
  counting holes alone MISSED a catastrophic 9.8 s dead-air hidden among short natural pauses (a dangerous
  false-pass). **Both directions of false-pass are the enemy.**
- **langdetect is NOISY on short text** ("And Johnson."→de, "I fell once."→it). Do NOT gate language
  per-line on the plan. Check language on the WHOLE output transcript (long text = reliable) and only flag
  when **>35 %** of long sentences (≥25 chars) are the wrong language (separates a real 50/50 mishmash from
  ~20 % noise).
- **The watchdog must NEVER false-abort a good flow.** The PRE plan check is **LOG-ONLY** (it does not
  abort) — an over-strict abort once killed the founder-approved GoT golden flow because GoT legitimately
  repeats a war cry ("King in the North!"). `no_repetition` allows a cry repeated 2–3× (anthem motif); it
  flags only **4+ repeats** or **one phrase owning >50 %** of lines.
- **The founder's ear is the meta-calibrator.** When his ear catches a flaw the gate passed → that becomes
  a new check + a new permanent corpus entry, so it can never silently return. This loop is the product.

### Which checks the offline GATE treats as HARD (from `eval/run.py`)

`run.py` folds the watchdog into the corpus verdict. A corpus entry FAILS on any signal-gate failure OR any
of these **critical meaning failures**:

- plan: `no_repetition`, `full_replacement`, `density_matches_tier`
- output: `output_language`, `content_present`, `no_dead_air`

`music_continuity` is logged as a **soft backstop** (not reliable on a faint bed) — the real wobble fix is
routing faint-music to the music path, not blocking on the metric.

---

## 6. TEST-DATA rule (the single most expensive lesson)

- **A SOURCE must be REAL, original audio** (a speech, a movie scene, an instrumental) where voice and music
  are **SEPARABLE.** **NEVER use a previously-generated RoarBliss output as a test source.** Its voice and
  music are already glued; demucs cannot un-mix them, which produces a fake "volume rollercoaster" that is
  **BAD TEST DATA, not a pipeline bug.** Three corpus entries once used glued RoarBliss outputs as sources
  and sent the whole effort oscillating for hours. `eval/corpus.json` (v2) now states this rule in its
  header; this constitution restates it because it is that expensive.
- **Validate your inputs before believing a failure.** Machinery was once built (the no-music assembly) for
  a problem caused entirely by bad test data.

---

## 7. The engineering doctrine (the founder's "Five Pillars")

The full doctrine lives in the founder's global `~/.claude/CLAUDE.md`. In one line each:

1. **Agent harness** — whoever owns the harness owns the results; prefer owned/composable over rented.
2. **Software factory** — build the system that builds the system; ship reproducible on-spec results
   (ADWs: agents + code).
3. **Extensible software** — pluggable, swappable; no hardcoded model IDs, no brittle selectors.
4. **Always-on agents** — only after tokconomics level 3 (capture value), never at level 1 (burn tokens).
5. **Agentic access** — wire APIs/CLIs everywhere; never give agents destructive prod access.

**This spec restructure IS the doctrine applied.** The spec book is the factory blueprint: intent →
explicit acceptance criteria → executable gate, so a feature is reproducible on-spec instead of
re-litigated in chat.

---

## 8. Anti-patterns (do NOT repeat)

- Building machinery for a problem caused by bad test data. Validate inputs first.
- Trusting a numeric "green" as "done" without the founder's ear.
- A watchdog so strict it false-aborts good flows (worse than the bug it guards).
- Committing but forgetting to **PUSH** before a build → building stale code. Verify `origin == local`.
- Trusting the cog's in-environment ffmpeg self-check (`LRA=None`, inflated dropouts). Use the OFFLINE
  metrics; source-relative comparisons cancel the systematic error.
- Burning multiple GPU cycles per change. Bundle fixes → ONE build per iteration; the founder gates GPU.

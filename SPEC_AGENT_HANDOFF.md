# Roar Bliss — Spec-Driven Restructure: Agent Handoff

> **You are the implementation agent.** Your job is to give this project the structure it never had:
> a **Constitution** + **per-use-case Specs** (the founder calls them "skill files"), wired to the
> **executable acceptance layer that already exists** (`eval/validators.py`, `eval/metrics.py`,
> `eval/corpus.json`). This document is your full brief: the mission, the file structure, a to-do list,
> and — most importantly — **every hard-won rule and lesson from this project's history that you will
> NOT find by reading the code**, because it lives in the founder's head and in a long, painful debugging
> arc. Encode these so they are never re-litigated.
>
> **Do NOT rewrite the audio pipeline.** It works for the core flows. You are writing the *specs* that
> describe and enforce it, not re-implementing it.

---

## 0. Why this exists (read first)

The project spent ~20 debugging cycles oscillating, shipping false "all-green" gates, and chasing a
problem that turned out to be **bad test data**. Root cause: intent lived in scattered chat prompts, not
in an explicit spec. This is exactly the failure mode spec-driven development prevents
(*"requirements, constraints, and edge cases live only in prompts" → "architectural drift, code drift"*).

The **executable half** of the spec already exists (the gate: validators + metrics + corpus). The
**written half** (constitution + per-use-case specs that connect intent → acceptance criteria) is missing.
You are building the written half and linking it to the executable half.

**Meta-rule above all others (the founder's words):** *"A metric that passes a wrong output is the most
dangerous."* And: **the founder's ear is the final calibrator.** A numeric "green" is necessary, never
sufficient. Every flaw his ear catches that the gate missed becomes a NEW acceptance criterion + a
permanent corpus entry. Build the specs so that loop is explicit.

---

## 1. Mission & scope

**Build — TWO layers (the founder's two proposals, honored, DRY):**
```
specs/                                     # PROPOSAL #2 — the spec book (written source of truth)
  constitution.md                          # immutable product rules + engineering doctrine
  use-cases/
    instrumental-template.md               # the written contract per use case (the 4 sections below)
    cinematic-multivoice.md
    speech-over-music.md
    solo-monologue.md
    translation.md
  TEMPLATE.md                              # the shape every use-case spec must follow

.claude/skills/                            # PROPOSAL #1 — the "skill files" (agent-INVOKABLE, CORE not optional)
  roar-bliss-instrumental/SKILL.md         # thin: triggers on this use case; loads constitution.md +
  roar-bliss-cinematic/SKILL.md            #   the matching specs/use-cases/*.md; states the input
  roar-bliss-speech-over-music/SKILL.md    #   contract to CHECK and the acceptance criteria to ENFORCE,
  roar-bliss-solo-monologue/SKILL.md       #   so any agent working that case is auto-equipped to
  roar-bliss-translation/SKILL.md          #   evaluate input + output + enforce rules.
```
The spec is the written truth; the skill is the agent-invokable wrapper that loads it and enforces it.
Keep them DRY — the SKILL.md does not duplicate the spec, it points to it + says "evaluate input against
the Input Contract, check output against the Acceptance Criteria (the named validator/metric checks)."

**Each use-case spec MUST have these four sections** (this is the contract):
1. **Input Contract** — what is a valid source for this case (format, duration caps, and the hard rule
   below about REAL audio); what inputs are rejected.
2. **Path & Engine** — which code path handles it (`full_voice` vs `auto_synthesize` canvas-rebuild vs
   no-music assembly) and which TTS engine (OmniVoice vs ElevenLabs) and WHY.
3. **Rules** — the invariants that must hold (drawn from the Constitution).
4. **Acceptance Criteria** — the *executable* checks that enforce it: list the exact
   `eval/validators.py` checks, `eval/metrics.py` gates, and the `eval/corpus.json` entry id(s) that
   prove this use case. If a criterion has no executable check yet, say so and add a TODO.

**In scope:** writing the markdown specs; optionally a thin Claude Code skill layer
(`.claude/skills/...`) that auto-loads the relevant use-case spec when an agent works on that case
(the founder's "agentic access" pillar). Cross-linking specs ↔ the existing gate code.

**Out of scope (do NOT touch without explicit approval):** the audio pipeline logic
(`predict.py`, `poc/orchestrator/*`), the TTS engines, the web app, Stripe/billing. You DESCRIBE and
LINK; you do not re-implement. If a spec reveals a missing executable check, propose it as a TODO in the
spec — do not silently change the gate's thresholds (they are ear-calibrated).

**Keep it lightweight.** Do not import the full 7-phase Spec-Kit ceremony. Adopt the spirit:
spec = source of truth, explicit acceptance criteria, a constitution. Specs are living documents.

---

## 2. To-do list (in order)

1. Read this whole document + `eval/validators.py`, `eval/metrics.py`, `eval/corpus.json`,
   `eval/test_canvas_rebuild.py`, `eval/test_validators.py`. Skim `predict.py` (routing ~line 700–860)
   and `poc/orchestrator/auto_synthesizer.py` (the canvas rebuild + `_detect_music_bed`).
2. Write `specs/constitution.md` from Section 4 below. This is the highest-value artifact — it captures
   the rules the founder kept having to re-explain. Verbatim where possible.
3. Write `specs/TEMPLATE.md` (the 4-section shape).
4. Write the 5 use-case specs. For each, fill the 4 sections and **link the acceptance criteria to the
   real corpus entry + validator/metric checks** that already exist. The current corpus entries are your
   starting set (Section 5).
5. For every acceptance criterion that has NO executable check yet, add a `TODO(gap):` line in the spec
   (do not implement it; flag it). Example gaps already known: "American accent on translation" has no
   automatic check — only the founder's ear; "intelligibility of German words" likewise.
6. (Optional, if time) add `.claude/skills/roar-bliss-usecase/SKILL.md` that, given a use case, loads the
   matching `specs/use-cases/*.md` so any agent gets the rules automatically.
7. Do NOT run a cog build or a GPU corpus run. Those cost money and the founder gates them. Your work is
   text only; validate by reading, not by spending GPU.
8. Open a PR (or hand back) with a short summary mapping each use-case spec → its corpus entry + checks,
   and a list of the `TODO(gap)` items you found (these become the founder's next priorities).

---

## 3. Key files map (so you don't hunt)

- `predict.py` — the Cog entrypoint. Routing is ~L700–860: `use_full_voice = (mode=="full_voice")`;
  tier→density; the TRANSLATION branch forces `full_voice` + `TTS_PROVIDER=elevenlabs`. The DELIVERY GATE
  is `_deliver_gate` (~L860): signal score + the meaning watchdog, emits `[[SCORECARD]]` + `[[OUTPUT_CHECK]]`.
- `poc/orchestrator/auto_synthesizer.py` — the partial/canvas path. `_detect_music_bed` (bed routing),
  `_bleed_comp_db` (music compensation), `_rebuild_slot` (frame-exact splice + `_ramp_edge` seam fade),
  `_assemble_no_music` (gap-closing for truly-dry sources). PRE watchdog (`[[PLAN_CHECK]]`) is after Stage A.
- `poc/orchestrator/personalization_planner.py` — the LLM planner. Density logic: `_enforce_density_budget`
  (caps replaced seconds), `_inject_peak_chant` (anthem fallback, capped to 2), `_fill_gaps`. Density cap is
  `min(density, 1.0 if tier==100 else 0.95)`.
- `poc/orchestrator/tts.py` — TTS backends. `synthesize_omnivoice` (the scale engine), the ElevenLabs path
  (`EL_MODEL = eleven_multilingual_v2`). Provider chosen by `TTS_PROVIDER` env.
- `eval/metrics.py` — the SIGNAL battery (ffmpeg + optional Whisper/judge). Source-relative gates.
- `eval/validators.py` — the MEANING watchdog (deterministic). `validate_plan` (pre) + `validate_output` (post).
- `eval/corpus.json` — the golden corpus (REAL sources only). `eval/run.py` runs it + folds the watchdog.
- `cog.yaml` — the Cog image. Built by `.github/workflows/deploy-cog.yml` (manual `workflow_dispatch`).
- `web/` — Next.js app on Vercel. Pins `REPLICATE_MODEL_VERSION`. The webhook (`api/replicate-callback`)
  reads `[[SCORECARD]]` and refuses to deliver a failed track.

---

## 4. THE CONSTITUTION (raw material — encode this into specs/constitution.md)

### 4.1 What the product IS (the founder's exact mental model)
- Roar Bliss takes a motivational audio file (speech, compilation, movie scene, monologue, instrumental)
  and personalizes it at a **25 / 50 / 75 / 100%** tier.
- **What STAYS from the original: the MUSIC, SOUND, MELODY, and the VOICE (timbre).** The ONLY thing that
  changes is the **SPOKEN SCRIPT** (the words).
- Mental model: the original (music + voice) is split into fractions; the spoken part is removed; newly
  generated audio in the ORIGINAL voice is placed there; then recombined **without the music having to
  adapt**. The music is never touched.
- **100% = a completely new script, ZERO remnants of the original words.**
- For **instrumentals** (no voice to clone), the user picks from a **library of voices**.

### 4.2 Hard product rules (these are LAWS — a spec that violates one is wrong)
- **MUSIC IS NEVER DUCKED OR PUMPED.** One constant level, start to finish. No sidechain compression, no
  bus limiter (an `alimiter` pumped the music under every word — the founder's "rollercoaster"). Clip
  safety = ONE constant static-headroom trim only. Clarity comes from voice-side gain, never from ducking music.
- **TRANSLATION = ALWAYS 100%, never a mix of two languages** in one file (jarring). Same voice, native
  target-language pronunciation.
- **The tier % is a HARD budget**, enforced in code — not a suggestion. (But "75%" means ~75% of the spoken
  *time*, and iconic/anthem lines may be transformed at any tier, beat-matched — so "75%" ≠ literally 75%
  of the line count. Spec the copy honestly.)
- **Generated snippets REPLACE original speech — they never get inserted into pauses/silence.**
- **Personalize within the first ~10 seconds** (retention) and keep the user present (no >~20s gap of
  untouched original).
- **Output = full source length** unless the >6min cap trims it; never cut a track short.
- Free tier: 45s preview → register to download → subscribe. 3 tiers €9.99 / 19.99 / 39.99. Billing is
  MINUTES/month per tier, charge-on-delivery (a failed run costs nothing).

### 4.3 Engine rules (which TTS, when, and WHY) — FULL OmniVoice
- **THE RULE IS TO CLONE, and CLONING = OmniVoice. Always. For everything — same-language AND cross-lingual
  (translation).** OmniVoice (Higgs Audio v2) is local/in-cog on GPU with NO per-op clone-slot limit → it
  scales. This is the founder's hard directive: a complete switch to OmniVoice, **no ElevenLabs cloning**.
- **NO ElevenLabs for cloning, ever.** EL's clone-slot cap + scoped-key 403s on `/voices/add` are exactly
  the fragility we are removing. (We hit a real `403 Forbidden` on EL voice-add — the reason to drop it.)
- **Cross-lingual / translation = OmniVoice cross-lingual** (it supports 646 languages incl. cross-lingual).
  The American-accent + garbled-German we saw is a CONFIG matter, not an engine limit: the fix is more
  diffusion steps + higher guidance for non-English (done in `tts.synthesize_omnivoice`: `num_step=80,
  guidance=3.0` when target≠English) and, if still accented, dropping the source-language `ref_text` from
  the clone prompt so German is not biased by English phonetics. NEVER swap the engine to solve this.
- **Library voices = the ONLY exception, and only for INSTRUMENTALS** (no voice to clone → the user picks a
  permanent, pre-existing voice). A library voice is permanent/shared, so it does NOT consume a per-user
  clone slot — no scale problem. It MAY remain an external voice id for now (e.g. the instrumental_jon
  flow), or migrate to a stored OmniVoice reference later; not urgent. This is the "side project", not the
  rule. The RULE is clone → OmniVoice.

### 4.4 Audio-pipeline rules (the engineering invariants, hard-won)
- **The canvas = the ORIGINAL FULL MIX**, not the demucs vocal stem. Kept regions are bit-identical
  original (zero separation loss). Only REPLACED slots are reconstructed = accomp (music) stem + a
  **constant bleed compensation** + the clone.
- **Demucs BLEED:** ~15–65% of the music leaks into the discarded VOCAL stem. So at a replaced slot, the
  accomp stem alone is QUIETER than the music the listener hears in kept regions → a satz-rhythm wobble.
  `_bleed_comp_db` measures the <200Hz deficit once (CONSTANT — one gain everywhere = no wobble) and lifts
  the slot music to match.
- **MUSIC-BED DETECTION (`_detect_music_bed`): a faint bed (~-23dB accomp) is STILL music** → keep it
  continuous on the music path. Only a genuinely silent accomp (< -40dB, a true dry voice memo) takes the
  gap-closing no-music path. (A -22dB threshold was wrong — it called the founder's faint-bedded recordings
  "dry", the no-music path dropped the bed under every clone → the "music turns off when he speaks" wobble.)
- **Two assembly modes:** music bed → timeline-locked canvas (`_rebuild_slot`, frame-EXACT splices so the
  music grid never drifts); no bed → concatenative gap-closing (`_assemble_no_music`, timeline compresses —
  correct only when there is no music to stay in sync with).
- **Seam splices use a frame-PRESERVING edge ramp (`_ramp_edge`), never pydub's `fade_in/out`** — pydub's
  fade silently drops a frame, which shifts the kept region and breaks the bit-identical grid. A hard
  music→music cut causes a faint "vinyl-scrub" click; the ramp removes it with zero length change.
- At 100%, cap the inter-line breath (long breaths punch holes in a thin bed).
- Clone reference cleaning: HPF80 + LPF14k + loudnorm only. **NO `afftdn`** (FFT denoise corrupts the
  reference → OmniVoice clones gibberish). One locked clone prompt per speaker (consistency — the fix for
  "too many different voices").

### 4.5 The metric / gate rules (the most important meta-lessons)
- **Signal ≠ meaning.** `metrics.py` measures loudness/holes/music-stability (signal). It is BLIND to
  CONTENT, LANGUAGE, and actual DENSITY. A 6/6 signal-green shipped degenerate content, a German/English
  mishmash, and 15%-when-50%-was-asked. The **watchdog (`validators.py`) adds the meaning layer**:
  pre (plan: density, no-repetition, full-replacement) + post (output: language, content-present,
  music-continuity, dead-air).
- **Source-relative, not absolute.** Judge the output against ITS OWN source. Music is measured ISOLATED
  in the <200Hz band (speech carries ~nothing there) → mean + sigma (wobble).
- **Source-aware dead-air:** a hole counts only if the OUTPUT is much quieter than the SOURCE at that time
  (a real cut), not when it mirrors a soft source passage (a quiet outro). PLUS a longest-hole check —
  counting holes alone MISSED a catastrophic 9.8s dead-air hidden among short natural pauses (a dangerous
  false-pass). Both directions of false-pass are the enemy.
- **langdetect is NOISY on short text** ("And Johnson."→de, "I fell once."→it). Do NOT gate language
  per-line on the plan. Check language on the WHOLE output transcript (long text = reliable) and only flag
  when >35% of long sentences are the wrong language (separates a real 50/50 mishmash from ~20% noise).
- **The watchdog must NEVER false-abort a good flow.** The PRE plan check is LOG-ONLY (it does not abort) —
  an over-strict abort once killed the founder-approved GoT golden flow because GoT legitimately repeats a
  war cry ("King in the North!"). `no_repetition` allows a cry repeated 2–3× (anthem motif); it flags only
  4+ repeats or one phrase owning >50% of lines.
- **The founder's ear is the meta-calibrator.** When his ear catches a flaw the gate passed → that becomes
  a new check + a new permanent corpus entry, so it can never silently return. This loop is the product.

### 4.6 TEST-DATA rule (the single most expensive lesson — make it loud in the constitution)
- **A SOURCE must be REAL, original audio** (a speech, a movie scene, an instrumental) where voice and
  music are SEPARABLE. **NEVER use a previously-generated RoarBliss output as a test source.** Its voice
  and music are already glued; demucs cannot un-mix them, which produces a fake "volume rollercoaster"
  that is BAD TEST DATA, not a pipeline bug. Three corpus entries once used glued RoarBliss outputs as
  sources and sent the whole effort oscillating for hours. The corpus header now states this rule; the
  constitution must too.

### 4.7 The engineering doctrine (the founder's "Five Pillars" — already in his global CLAUDE.md)
Summarize and point to it: build the system that builds the system (the factory, not the feature);
software factory of ADWs; extensible/swappable (no hardcoded model IDs); always-on only after tokconomics
level 3; agentic access (wire APIs/CLIs). The spec restructure IS this doctrine applied — the spec book is
the factory blueprint.

---

## 5. Current corpus entries (your acceptance-criteria starting set)

`eval/corpus.json` (REAL sources only, v2). Map each use-case spec to these:
- `instrumental_jon_100` → **instrumental-template** (GoT instrumental + EL library voice "Jon", 100%). FOUNDER-APPROVED.
- `cinematic_multivoice_got_75` → **cinematic-multivoice** (Targaryen soundtrack, clone each voice, 75%). FOUNDER-APPROVED (the golden bar).
- `speech_over_music_icandothis_50` → **speech-over-music** (real motivational speech, 50%).
- `speech_over_music_icandothis_100` → **speech-over-music** at TRUE 100% (tests zero original remnant).
- `translation_icandothis_de_100` → **translation** (same speech, German, via EL multilingual).
- (a **solo-monologue** spec has no clean corpus entry yet — the GoT clip was too short to clone, 0 candidates → crash. `TODO(gap)`: find a real solo-speech source with clonable speech, OR make the no-clonable-speech case a graceful error instead of a crash.)

The executable checks each spec links to live in `eval/validators.py` (`validate_plan`, `validate_output`)
and `eval/metrics.py` (`score`, source-relative gates). Read those for the exact check names.

---

## 6. Anti-patterns observed (do NOT repeat these)
- Building machinery for a problem caused by bad test data (the no-music assembly was tuned against glued
  RoarBliss sources). **Validate your inputs before believing a failure.**
- Trusting a numeric "green" as "done" without the founder's ear.
- A watchdog so strict it false-aborts good flows (worse than the bug it guards).
- Committing but forgetting to PUSH before triggering a build → building stale code. (Always verify
  `origin == local` after push; the build builds the pushed SHA.)
- Trusting the cog's in-environment ffmpeg self-check (`LRA=None`, inflated dropouts). Use the OFFLINE
  metrics; source-relative comparisons cancel the systematic error.
- Burning multiple GPU cycles per change. Bundle fixes → ONE build per iteration; the founder gates GPU spend.

---

## 7. Definition of done (for YOU, the spec agent)
- `specs/constitution.md` exists and encodes Section 4 (rules + lessons), readable by a non-expert.
- 5 use-case specs exist, each with the 4 sections, each linking acceptance criteria to real
  corpus entries + validator/metric check names.
- A `TODO(gap)` list of acceptance criteria that have no executable check yet (these become the
  founder's roadmap).
- No code changed in the pipeline; no GPU spent. A short handoff summary written.

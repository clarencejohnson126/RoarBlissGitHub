# Suno Instrumental Prompts — one per Battle Template

For each of the 8 battle templates in the web app (`BattleTemplates.tsx` / create wizard), a ready-to-paste
Suno prompt that generates the matching instrumental. Set Suno to **Instrumental mode** (no lyrics) for all
of them. Aim for 2:00–3:00 length, then pick the best take per style. Naming convention for the library:
`templates/<slug>.mp3` (e.g. `templates/discipline.mp3`).

Tips that work well on Suno v4: lead with the genre, then mood, then instrumentation, then tempo. Avoid
artist names (they get filtered). "Cinematic" + a clear BPM anchor keeps the structure usable as a speech bed —
we want long sustained sections, not busy melodies fighting the voice.

---

## 1. Discipline — "the grind nobody sees"
> Dark cinematic hip-hop instrumental, relentless and focused, slow heavy 808 pulse, muted piano motif,
> distant industrial textures, sparse arrangement with long sustained sections, no melody clutter,
> 75 BPM, gritty, determined, early-morning grind atmosphere, instrumental only

## 2. Heartbreak — "turn the wound into resolve"
> Emotional cinematic instrumental, melancholic solo piano opening that slowly builds into warm strings
> and a steady heartbeat kick, rain-like ambient texture, rising from sorrow to quiet strength,
> 70 BPM, bittersweet but resolute, wide and spacious mix, instrumental only

## 3. Grief — "carry the loss forward"
> Somber orchestral instrumental, low sustained cello and viola, sparse piano notes with long silence
> between phrases, soft choir pads entering halfway, slow swelling crescendo of dignity and remembrance,
> 60 BPM, heavy but hopeful ending, funeral-to-sunrise arc, instrumental only

## 4. Muscle Gain — "fuel the training"
> Aggressive gym trap instrumental, pounding 808s, distorted bass, sharp hi-hats, dark synth stabs,
> stadium energy, short tension builds with hard drops, adrenaline and iron, 140 BPM,
> relentless forward drive, powerful and loud, instrumental only

## 5. Business Comeback — "rebuilding after the setback"
> Epic motivational cinematic instrumental, low brooding strings opening, building layer by layer with
> percussion, brass swells and a triumphant final section, underdog rising arc, modern hybrid orchestral
> with subtle electronic pulse, 100 BPM, from darkness into victory, instrumental only

## 6. Fatherhood — "be the example"
> Warm cinematic instrumental, acoustic guitar and soft piano foundation, gentle strings, steady calm
> percussion like a reassuring heartbeat, golden-hour warmth, protective and proud, quiet strength,
> 80 BPM, intimate but expansive finish, instrumental only

## 7. Confidence — "the man who already decided"
> Swagger cinematic hip-hop instrumental, confident bassline groove, clean piano chords, brass accents,
> head-nod tempo, polished and unhurried, walking-into-the-room energy, 90 BPM,
> smooth, powerful, certain, instrumental only

## 8. Dark Season — "when it's heaviest"
> Dark ambient cinematic instrumental, deep drones and low pulsing sub-bass, sparse haunting piano,
> distant thunder textures, slow-burning tension that never fully releases until a faint light enters
> at the end, 65 BPM, heavy, atmospheric, survival mood, instrumental only

---

## Bonus (not in the template grid yet, worth having in the library)
- **Warrior / Battle** (matches the "Warrior Mode" tone card):
> Epic war drums cinematic instrumental, massive taiko percussion, aggressive staccato strings, brass
> hits, battle-march cadence, rising war-cry energy with a thunderous climax, 95 BPM, instrumental only
- **Spiritual / Reflective** (matches the "Spiritual / Reflective" tone card):
> Ambient sacred instrumental, soft ethereal pads, gentle piano, distant choir, slow meditative pulse,
> vast cathedral space, peace and deeper meaning, 55 BPM, weightless and calm, instrumental only

---

# Player / "Choose Your Sound" instrumentals — one per library bed

These are the 6 named sound beds shown in the create-wizard sound picker and the global player
(`web/src/data/instrumentals.ts`). Same rules: Suno **Instrumental mode**, 2:00–3:00, long sustained
sections so the speech sits on top. Library naming: `instrumentals/<id>.mp3` (drop into
`web/public/audio/instrumentals/<id>.mp3`).

## A. Cinematic Oath  (id: `cinematic-oath` · Epic · solemn · rising · EPIC)
> Epic cinematic orchestral instrumental, solemn low brass and deep strings opening like an oath being
> sworn, slow ceremonial build, taiko and timpani entering, a soaring rising final section with full
> orchestra and choir pads, noble and resolute, vast and weighty, 90 BPM, long sustained phrases,
> instrumental only

## B. Gravity of Hope  (id: `gravity-of-hope` · Emotional · cosmic · reflective · MEDIUM)
> Emotional cosmic cinematic instrumental, floating ambient pads and distant shimmering synths, slow
> reflective piano motif, weightless space-like reverb, gentle swells of warm strings rising and falling
> like breathing, bittersweet and hopeful, 70 BPM, wide and spacious, no busy melody, instrumental only

## C. Iron Morning  (id: `iron-morning` · Disciplined · focused · grounded · HIGH)
> Disciplined cinematic instrumental, steady driving percussion like a determined march, grounded low
> bass pulse, muted piano and tense sustained strings, focused and relentless without chaos, cold
> early-morning resolve, 100 BPM, controlled forward momentum, sparse and purposeful, instrumental only

## D. After the Storm  (id: `after-the-storm` · Hopeful · warm · rebuilding · MEDIUM)
> Warm hopeful cinematic instrumental, soft acoustic guitar and gentle piano opening after stillness,
> slowly adding warm strings and a calm steady kick, sunrise-after-rain atmosphere, tender rebuilding
> arc from quiet to bright, 80 BPM, spacious and reassuring, uplifting but restrained, instrumental only

## E. The Quiet War  (id: `the-quiet-war` · Dark · restrained · intense · HIGH)
> Dark restrained cinematic instrumental, deep brooding sub-bass drone, sparse haunting piano notes,
> tense low strings holding back, slow simmering pressure that never fully erupts, cold controlled
> intensity, shadowy and disciplined, 75 BPM, minimal and heavy, lots of space, instrumental only

## F. Legacy Fire  (id: `legacy-fire` · Warm · family · protective · MEDIUM)
> Warm protective cinematic instrumental, intimate acoustic guitar and soft piano foundation, gentle
> swelling strings, steady heartbeat-like percussion, golden-hour family warmth, proud and tender,
> quiet enduring strength building to a full warm finish, 82 BPM, expansive but cozy, instrumental only

---

## Production checklist per track (before adding to the app)
1. Generate 3–4 takes in Suno, pick the one with the **fewest busy melodic sections** (the voice needs room).
2. Check loudness: normalize to ~-16 LUFS integrated so all templates sit at one level (`ffmpeg -af loudnorm=I=-16`).
3. Trim to a clean loop-friendly 2:00–3:00 with a real ending (no hard cut).
4. The pipeline treats these as the music bed for 100% mode (`clone_source_voices=false` path) — speech is
   generated over them, the bed itself is never altered (RULE #1).

# full_voice — Repro-Rezept (rekonstruiert aus Session 4ffac81a, 2026-06-04 morgens)

Die "perfekte" Referenzdatei `~/Desktop/RoarBliss_GoT_v6_2min.mp3` (2:00 Min, 5 Stimmen,
100 % neu generiertes Skript, kein Original-Dialog) ist die **Qualitäts-Messlatte** für den
`full_voice`-Modus. So wurde sie erzeugt — exakt reproduzierbar.

## Was sie ist
- **mode=full_voice** (100 % generiert): Source wird diarisiert, jede distinkte Stimme geklont,
  ein komplett neues mehrstimmiges Skript wird über die Stimmen verteilt. Original-Dialog wird
  NIE verwendet — nur das saubere Musik/SFX-Bett aus Demucs trägt weiter.
- Lief über die **echte Cloud-Produktions-Pipeline** (Replicate Cog `clarencejohnson126/roar-bliss`,
  Deployment `roar-bliss-gpu`): Upload → Demucs → pyannote → ElevenLabs-Klon (voice-by-voice) →
  Claude-Skript → Mix. Genau das, was ein User später erlebt.
- Cog-Version beim erfolgreichen Lauf: `d9584dae16e738…` (= nach Commit `adff0a9` language configurator).
- Prediction-ID: `x50sm6e4q9rga0cyj5kabwxacr`.
- Lauf-Logs: `4 distinct voice(s) detected (min_voices=3)` → `pool = 2 permanent + 4 cloned -> 6 total`
  → `used 5/6 voices, rendered 36/43 lines` → `track: 6 voice(s), 113.9s speech`, hart auf 120 s gekappt.

## Die exakten Inputs (Replicate deployment prediction)
```json
{
  "audio": "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/uploads/got-full-1780525689061-xKl5SyrvnFtDwc2uxZusvE24hcnsrD.mp3",
  "name": "Clarence Johnson",
  "battlefield": "Going all-in on ONE thing at last - for me and my children, finishing what I start",
  "struggle": "I'm 43. I jump from idea to idea instead of finishing one. A tough cookie who lets things slide. This is my reckoning - no more excuses, for me and my kids.",
  "family": "my children",
  "location": "",
  "champion": "",
  "paid": true,
  "mode": "full_voice",
  "min_voices": 3,
  "output_seconds": 120,
  "extra_voice_ids": "TCuusGciH6HRSOGrYg31,LAXRurt2ai7EJv0f4c8k",
  "anthropic_api_key": "<aus web/.env.local>",
  "hf_token": "<aus web/.env.local>",
  "replicate_api_token": "<aus web/.env.local>",
  "blob_token": "<BLOB_READ_WRITE_TOKEN aus web/.env.local>",
  "elevenlabs_api_key": "<ELKEY — siehe Memory project_elevenlabs_pivot>"
}
```

### Schlüssel-Parameter, die den Unterschied machen
- `extra_voice_ids` = **permanente ElevenLabs-Stimmen** (GoT-Jon `TCuusGciH6HRSOGrYg31`,
  Dany `LAXRurt2ai7EJv0f4c8k`) → werden direkt benutzt, kein Klon-Slot-Verbrauch, garantiert solide.
  Mischen sich mit den frisch aus der Source geklonten Stimmen → zuverlässig 5+ distinkte Stimmen.
- `output_seconds: 120` entkoppelt die Output-Länge von der Source-Länge.
- `min_voices: 3` ist nur ein pyannote-Floor-Hint; die Source liefert von Natur aus 4-9 Sprecher.
- **voice-by-voice-Rendering** (Commit `831e6d8`): EINE Stimme klonen → alle ihre Lines TTS →
  Stimme löschen → nächste. Umgeht das ElevenLabs-Slot-Cap (Starter: 10 Custom-Voice-Slots).

## Quelldateien (noch vorhanden)
- GoT full montage (Blob): `/tmp/gotfull_url.txt` → die obige `got-full-…mp3` URL (Vercel Blob, persistent)
- Lokale GoT-Quellen im Repo: `The Targaryen Wolf (Original Soundtrack) Game of Thrones.mp3`,
  `Ascend The Starless Sky No Choir.mp3`
- Tate 50/50 Quelle (Blob): `/tmp/tate2min_url.txt`

## Reproduzieren (Python, aus web/ mit .env.local)
Das Treiber-Skript aus der Session: latest cog version holen → deployment `roar-bliss-gpu` darauf
patchen → prediction mit obigen Inputs POSTen → pollen → Output-MP3 nach Desktop speichern.
Vollständiges Muster siehe Git-History-Commits `65a74a0`, `c17b2b6`, `adff0a9`.

## Heute Morgen erzeugte Dateien (Iterationsreihe → v6 ist der Sieger)
| Datei | Was |
|---|---|
| RoarBliss_Tate_File2_FullVoice.mp3 / _MUSIC | erste full_voice Solo-Tests (Tate) |
| RoarBliss_Tate_50-50_FIXED.mp3 | personalize-Modus, 50 % Original-Tate + 50 % Snippets in seiner Stimme |
| RoarBliss_GoT_v2…v5 | Multi-Voice-Iterationen (Slot-Cap-Fix, extra_voices, Längen-Fix) |
| **RoarBliss_GoT_v6_2min.mp3** | **FINAL — 5 Stimmen, 2:00 Min, 100 % neues Skript. User-bestätigte Messlatte.** |

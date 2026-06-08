# Roar Bliss — Scale-Readiness Checklist (2026-06-08)

Ziel: Die App muss einen Ansturm (z. B. 1000 gleichzeitige Nutzer) aushalten, **ohne zu crashen**,
ohne 429-Stürme, und ohne dass die Rechnung explodiert. Die Architektur ist async (Prediction →
Webhook → Email), d. h. der Fehlermodus ist **Wartezeit/429**, nicht „Server-Crash" — solange Queue,
Retries und Spend-Cap sauber sind. Genau die drei fehlen aktuell.

---

## A) Ist-Zustand (verifiziert am Code, 2026-06-08)

| Mechanismus | Status | Beleg / Ort |
|---|---|---|
| Async-Pipeline (predict → webhook → Email) | ✅ | `web/src/app/api/process/route.ts`, `.../replicate-callback/route.ts`, Resend |
| Webhook ackt 200 (kein Replicate-Retry-Storm) | ✅ | `replicate-callback/route.ts:76` |
| Free-Tier-Abuse-Gate (1 Track / Device+IP, Download nach Registrierung) | ✅ | free_usage |
| TTS-Fehlertoleranz (try/except + Fallback-Stimme) | ⚠️ teilweise | `predict.py` (full_voice render-Loop) — **single attempt, kein Backoff** |
| **Retry-mit-Backoff** (Claude / ElevenLabs / Replicate-API) | ❌ FEHLT | `replicate.ts` wirft bei non-ok; predict.py macht kein Re-Attempt |
| **Concurrency-Queue / Backpressure** | ❌ FEHLT | `/api/process` startet pro Request sofort eine Prediction |
| **Spend-Cap / Budget-Guard** | ❌ FEHLT | nur `cap_ms` (Audio-Länge) + max_tokens; kein Geld-/Run-Limit |
| Idempotenz (Doppel-Submit erzeugt 1 Job) | ❌ FEHLT (prüfen) | kein idempotency-key gesehen |

---

## B) Externe Limits — JETZT prüfen und eintragen (Zahlen statt Bauchgefühl)

> Das sind die echten Flaschenhälse. Ein Crash kommt nicht vom eigenen Server, sondern von diesen Caps.

| Dienst | Was prüfen | Aktueller Wert | Ziel @ ~1000 parallel |
|---|---|---|---|
| **Replicate** | Max. parallele Instanzen (Account-Concurrency) + Cold-Start-Zeit | ____ | Erhöhung anfragen; Min-Instanzen für Peaks erwägen |
| **ElevenLabs** | Concurrency-Cap des Plans + Char-Kontingent **(Engpass Nr. 1)** | ____ (Plan: ____) | Scale/Business/Enterprise **oder** TTS self-host |
| **Anthropic (Claude)** | Tier + RPM + TPM | ____ (Tier: ____) | Tier hochstufen / Limit-Erhöhung (Claude = nur API, NICHT self-hostbar) |
| **Supabase** | Connection-Pooler aktiv? Plan-Verbindungslimit | ____ | „Transaction"-Pooler nutzen, Plan ggf. hoch |
| **Vercel** | Function-Concurrency/Timeout (nur Job-Start, kurz) | meist unkritisch | — |

Faustzahlen pro Welle (1000 Runs): Replicate ~$100–300; ElevenLabs ~$180 (1000×2-Min); Drain-Zeit
= 1000 / (parallele Replicas) × ~75s (z. B. 50 Replicas ≈ 25 Min, 100 ≈ 12 Min).

---

## C) Härtungs-Tasks (priorisiert) — Auftrag an den Agenten

### 1. Retry-mit-Backoff (HOCH)
- **Web (`web/src/lib/replicate.ts`):** `createPrediction` + Versions-Resolve in einen retry-Wrapper
  (3–5 Versuche, exponentiell + Jitter, nur bei 429/5xx/Netzwerk; bei 4xx-Validierung nicht retryen).
- **Cog (`predict.py`):** jeden ElevenLabs- **und** Anthropic-Call in retry-mit-Backoff kapseln (429/5xx),
  zusätzlich die in Memory dokumentierte **Sanity-Prüfung** (Clone-Dauer ≤ 3× Slot) + Re-Attempt mit
  Seed-Variation, statt den Slot nur stumm zu überspringen.
- **Akzeptanz:** simulierter 429 → automatischer Re-Try, kein verlorener Slot, kein harter Abbruch.

### 2. Eigene Concurrency-Queue / Backpressure (HOCH)
- Zähler „in-flight jobs" (Supabase-Tabelle, z. B. `jobs` mit status=running). In `/api/process` **vor**
  `createPrediction` prüfen: wenn in-flight ≥ MAX_CONCURRENCY (an das ElevenLabs-Cap gekoppelt, env-konfig),
  Job als `queued` ablegen statt sofort starten; ein Worker/Cron oder der Webhook-Callback startet den
  nächsten queued-Job, wenn ein Slot frei wird.
- **Akzeptanz:** 200 gleichzeitige Requests → nie mehr als MAX_CONCURRENCY parallele Predictions; Rest
  wartet sauber; UI zeigt „in Warteschlange".

### 3. Spend-Cap / Budget-Guard (HOCH)
- Tages-/Monats-Zähler (Supabase) für Runs bzw. geschätzte Kosten. In `/api/process` **vor** dem Start
  prüfen: über Limit → Job ablehnen/queuen + Alert (Email an dich via Resend).
- Env: `MAX_RUNS_PER_DAY`, `MAX_SPEND_USD_PER_DAY`. Plus pro-User-Limit gegen Einzel-Missbrauch.
- **Akzeptanz:** künstlich über das Limit → weitere Runs werden geblockt, du bekommst einen Alert.

### 4. Idempotenz (MITTEL)
- Idempotency-Key pro Submit (z. B. Hash aus userId+Input), Doppel-Submit liefert denselben Job.

### 5. Graceful-UX bei Last (MITTEL)
- Bei Queue: klare Meldung „Wir mailen dich, wenn fertig" (Resend existiert) → User wartet nicht im
  Browser; entkoppelt UX von Durchsatz. Status-Seite/Polling robust gegen lange Wartezeiten.

### 6. Keep-Warm gegen Cold-Start (NIEDRIG, optional bei Peaks)
- Replicate Min-Instanzen > 0 während angekündigter Peaks (kostet Idle-GPU, killt die ~2-Min-Cold-Starts).

### 7. Supabase-Pooler (MITTEL)
- Sicherstellen, dass server-seitig der **Transaction-Pooler** genutzt wird, nicht direkte Verbindungen.

---

## D) Infra-Entscheidung: Replicate vs. dedizierter GPU (Hetzner/RunPod/…)
- **Jetzt bei Replicate bleiben:** managed Autoscaling, pay-per-second, scale-to-zero, null Ops — ideal
  für spiky/unvorhersehbare Last. Kein Idle-Kostenrisiko.
- **Dediziert (Hetzner GPU/RunPod/Lambda)** lohnt erst bei **stetiger, hoher Grundlast** und bringt
  eigene Ops (Scaling, Queue, Failover, Treiber). Clarence: „kompliziert, nicht reliable" → noch nicht.
- **Wichtig:** Der eigentliche Kosten-/Concurrency-Treiber ist **ElevenLabs**, nicht der GPU. Die große
  Skalierungs-/Geld-Entscheidung ist „ElevenLabs Enterprise vs. TTS self-host", nicht „Replicate vs. Hetzner".
- **Claude ist nur API** — nicht self-hostbar; skaliert über Tier/Rate-Limits.

---

## E) Load-Test (bevor die 1000 kommen)
- Skript: N parallele `/api/process`-Submits (z. B. 100, dann 300), messen: Erfolgsrate, p50/p95-Dauer,
  429-Rate je Dienst, Replicate-Queue-Tiefe, Gesamtkosten der Welle.
- Erst nach grünem Load-Test + gesetzten Limits live gehen (`vercel --prod` = Clarence's Trigger).

---

## TL;DR
Crash-Risiko = gering (async). Aber **Retry-Backoff, Concurrency-Queue und Spend-Cap fehlen komplett** —
das sind die drei Pflicht-Tasks, plus die externen Limits (vor allem **ElevenLabs**) erhöhen. Hardware
(eigener GPU) ist NICHT der erste Hebel.

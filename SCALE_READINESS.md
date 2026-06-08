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
| TTS-Fehlertoleranz (try/except + Fallback-Stimme) | ⚠️ teilweise | `predict.py` (full_voice render-Loop) — **single attempt, kein Backoff** → Phase B (Cog-Redeploy) |
| **Retry-mit-Backoff** (Replicate-API, web) | ✅ 2026-06-08 | `replicate.ts` `fetchWithRetry` (429/5xx/Netzwerk, exp+Jitter, nie 4xx) auf createPrediction/version/getPrediction |
| Retry-mit-Backoff (Claude / ElevenLabs, Cog) | ⏳ Phase B | predict.py/tts.py/llm.py — geschrieben, **braucht Cog-Redeploy + re-pin** |
| **Concurrency-Queue / Backpressure** | ✅ 2026-06-08 | `jobs`-Tabelle + `/api/process` (queue über `MAX_CONCURRENCY`) + Drain (Webhook + `/api/jobs/drain` Cron) |
| **Spend-Cap / Budget-Guard** | ✅ 2026-06-08 | `/api/process` prüft Runs/Spend heute vs `MAX_RUNS_PER_DAY`/`MAX_SPEND_USD_PER_DAY`/pro-User → block + Resend-Alert |
| Idempotenz (Doppel-Submit erzeugt 1 Job) | ✅ 2026-06-08 | `jobs.idempotency_key` (unique) + Dedup-Check vor Credit/Start |
| **⚠️ Voraussetzung: SQL anwenden** | ⏳ offen | `supabase/migrations/0003_scale_guard.sql` 1× im Supabase-SQL-Editor (Projekt `eoahpwciwttfavzpqfnz`) — Guards fail-open bis dahin |

---

## B) Externe Limits — JETZT prüfen und eintragen (Zahlen statt Bauchgefühl)

> Das sind die echten Flaschenhälse. Ein Crash kommt nicht vom eigenen Server, sondern von diesen Caps.

| Dienst | Was prüfen | Aktueller Wert (geprüft 2026-06-08) | Ziel @ ~1000 parallel |
|---|---|---|---|
| **Replicate** | Max. parallele Instanzen (Account-Concurrency) + Cold-Start-Zeit | ⏳ Dashboard-Check nötig (replicate.com/account → default ~few parallel) | Erhöhung anfragen; Min-Instanzen für Peaks erwägen |
| **ElevenLabs** | Concurrency-Cap des Plans + Char-Kontingent **(Engpass Nr. 1)** | **Plan: Starter** · Concurrency **3** (Doku-Wert für Starter) · Char **82.859/Mon, 34.646 verbraucht → ~48k übrig** (≈10–20 volle Runs!) · reset monatlich | **MUSS hoch vor Launch:** Creator(5)/Pro(10)/Scale(15)/Business **oder** TTS self-host. `MAX_CONCURRENCY=3` gesetzt = aktueller Cap. |
| **Anthropic (Claude)** | Tier + RPM + TPM | ⏳ Dashboard-Check (console.anthropic.com → Limits) | Tier hochstufen / Limit-Erhöhung (Claude = nur API, NICHT self-hostbar) |
| **Supabase** | Connection-Pooler aktiv? Plan-Verbindungslimit | ✅ Code nutzt nur **supabase-js (PostgREST/REST über HTTPS)** — keine direkten PG-Verbindungen (`grep`: kein `pg`/`Pool`/`:5432`). PostgREST ist serverseitig gepoolt → Task erfüllt, nichts zu ändern. | ggf. Plan hoch bei sehr hoher Last |
| **Vercel** | Function-Concurrency/Timeout (nur Job-Start, kurz) | meist unkritisch; **Cron `/api/jobs/drain` jede Minute braucht Vercel Pro** (Hobby: nur 1×/Tag — dann trägt der Webhook-Drain) | — |

Faustzahlen pro Welle (1000 Runs): Replicate ~$100–300; ElevenLabs ~$180 (1000×2-Min); Drain-Zeit
= 1000 / (parallele Replicas) × ~75s (z. B. 50 Replicas ≈ 25 Min, 100 ≈ 12 Min).

---

## C) Härtungs-Tasks (priorisiert) — Auftrag an den Agenten

### 1. Retry-mit-Backoff (HOCH) — ✅ Web fertig · ⏳ Cog wartet auf Redeploy
- **Web (`web/src/lib/replicate.ts`):** ✅ `fetchWithRetry` (4 Versuche, exp+Jitter, Retry-After-aware,
  nur 429/5xx/Netzwerk, nie 4xx) auf `createPrediction` + Versions-Resolve + `getPrediction`.
- **Cog (`poc/orchestrator/tts.py` + `llm.py`):** ✅ geschrieben — `_request_with_retry` kapselt jeden
  ElevenLabs- (clone/tts) und Replicate-Call (create/poll/download); Anthropic (`llm_chat`) kapselt
  `messages.create` (429/5xx/connection/timeout, 4xx re-raise). ⏳ **wird erst nach Cog-Redeploy + re-pin
  `REPLICATE_MODEL_VERSION` aktiv** (Clarence's Trigger).
- **Rest-Refinement (NIEDRIG):** im `predict.py` `_full_voice`-Loop den stummen Slot-Skip durch
  Seed-/Voice-Varianten-Re-Attempt bei Sanity-Fail (Clone > 3× Slot) ersetzen — die TTS-Layer-Retries
  oben fangen die *transienten* Ausfälle (Hauptursache) bereits ab.
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

## E) Load-Test — ✅ durchgeführt 2026-06-08
- **Web-Tier (`--mode web --n 300 --concurrency 100`, :3009 dev):** 300/300 = **100% 2xx, 0 429/0 5xx**,
  p50 1440ms · p95 2305ms · max 2516ms (Dev-Turbopack-Latenz; prod schneller). Throughput 68 req/s.
- **Guard-Akzeptanz (Throwaway-Server :3011, gegen die LIVE `jobs`-Tabelle, ohne echte Predictions):**
  - Spend-Cap: `MAX_RUNS_PER_DAY=1` → 2. Run → **429 `budgetReached`** ✅
  - Concurrency-Queue: `MAX_CONCURRENCY=0` → Run → **`{status:queued}`** (echte Job-UUID, **keine** Prediction) ✅
  - Job-Row: `status=queued`, Secrets im gespeicherten `input` **gestrippt** (`leaks_secret=false`) ✅
  - Queue-Status-Poll (`?id=<jobId>&job=1`) → „You're in the queue…" ✅
  - Drain-Route: ohne Secret **401**, mit `CRON_SECRET` → `{ok:true,started:0}` (respektiert cap) ✅
  - Bug gefunden+gefixt: `num()` verwarf `0` → `MAX_CONCURRENCY=0` wurde 5 (startete eine echte Prediction;
    sofort storniert, Audio war `localhost` → für Replicate eh unerreichbar, ~0 Kosten).
- **Noch offen vor Live:** `--mode generate` auf **Staging** (free-gate aus, `--confirm`) für echte e2e-Kosten/Latenz.
- Erst nach grünem Load-Test + gesetzten Limits live (`vercel --prod` = Clarence's Trigger).

## F) Anwenden vor/bei Deploy (Reihenfolge)
1. ✅ SQL `jobs` ist bereits in prod-Supabase `eoahpwciwttfavzpqfnz` angewandt (via MCP). `free_usage` existierte schon.
2. **Env in Vercel** setzen (sind in `.env.local`): `MAX_CONCURRENCY=3` (= ElevenLabs-Starter-Cap),
   `MAX_RUNS_PER_DAY`, `MAX_SPEND_USD_PER_DAY`, `MAX_RUNS_PER_USER_PER_DAY`, `ADMIN_ALERT_EMAIL`, `CRON_SECRET`.
3. Per-Minute-Cron `/api/jobs/drain` braucht **Vercel Pro** (Hobby: 1×/Tag → dann trägt der Webhook-Drain).
4. ⚠️ **ElevenLabs-Quota** (~48k Zeichen übrig) **vor Launch hochstufen** — sonst sind nach ~10–20 Runs Schluss.
5. Cog-Redeploy + re-pin für die Cog-Retries (Phase B), wenn gewünscht.

---

## TL;DR
Crash-Risiko = gering (async). Aber **Retry-Backoff, Concurrency-Queue und Spend-Cap fehlen komplett** —
das sind die drei Pflicht-Tasks, plus die externen Limits (vor allem **ElevenLabs**) erhöhen. Hardware
(eigener GPU) ist NICHT der erste Hebel.

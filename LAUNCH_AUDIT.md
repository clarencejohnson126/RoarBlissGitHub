# Roar Bliss — Launch-Readiness Audit (2026-06-09)

Multi-agent audit (5 reviewers + adversarial verification): **53 findings · 37 confirmed real · 22 launch-blockers.**
**Verdict: NO-GO for real payments** until the blockers ship + the founder items are done.

`[A]` = agent-fixable · `[C]` = founder-only.

## HARD BLOCKERS

### Billing correctness (money is wrong) — needs ONE migration + rework
- **B1 [A]** Read-modify-write race in `chargeMinutes()` (supabase-admin.ts) → concurrent/duplicate webhooks overwrite each other → **lost charges**. Fix: idempotent `charge_log` table (`prediction_id` UNIQUE), usage = `SUM(charge_log)`.
- **B2 [A]** Concurrent over-delivery: the minute gate is checked once at submit (process/route.ts) → N parallel paid runs all pass → allowance blown negative. Fix: atomic `minute_reservations` (reserve at start → charged on delivery → deleted on failure).
- **B3 [A]** Stripe `invoice.payment_succeeded` not idempotent (stripe-webhook) → normal Stripe retries reset `minutes_used=0` repeatedly → users exceed allowance every cycle. Fix: store Stripe `event.id` UNIQUE, no-op if seen.
- **B5 [A]** Queued-job minutes (`runMinutes`) live only in the webhook URL, never persisted → wrong-period attribution after a renewal. Fix: `jobs.billing_minutes` column; read from the job, not the query param.
- **B6 [A]** ✅ FIXED — `chargeMinutes` no longer throws silently into a 200 ack.
- **B14 [A]** Queued FREE runs record usage with `jobId` not `prediction_id` → `clearFreeUsageForPrediction` never matches → device locked forever; submit-time gate races. Fix: reserve in `free_usage` with status, record on real prediction start.

### Webhook / delivery reliability
- **B7 [A]** ✅ PARTIAL — now logs when a paid run lacks an https webhook. Still TODO: a cron to reconcile `running` jobs older than ~2h (stuck = never billed/terminated).

### Auth / account integrity
- **B8 [A]** `register` uses `email_confirm:true` → anyone can register/claim ANY email + password before the owner. Fix: require inbox verification (Resend link) before activation; magic-link as the inbox-gated primary.
- **B9 [A]** No rate limit on `register`/`magic-link` → spam, enumeration, Resend-quota DoS. Fix: per-IP + per-email limits; generic responses.
- **B10 [A]** ✅ FIXED — cron endpoints now 403 when `CRON_SECRET` unset (was public).
- **B13 [A]** ✅ FIXED — free runs with no fingerprint AND no IP are rejected (was unlimited-free bypass).

### Ops / legal
- **B11 [A]** No error monitoring (Sentry/equiv) → billing failures invisible. Required to observe B1–B7 in prod.
- **B12 [C]** No `/terms` `/privacy` `/legal` → GDPR + Stripe ToS requirement. Founder provides copy.

## SHOULD-FIX-SOON
- **S1 [A]** Apply `0003_scale_guard.sql` (jobs/free_usage) to prod DB (several fixes depend on it).
- **S2 [C]** Approve cog `32a69490` output (verify-run on staging) or roll back.
- **S3 [A]** Move cog secrets from prediction inputs to Replicate native Secrets (leak risk).
- **S4 [A]** Use `x-vercel-forwarded-for` (spoof-resistant) for the free-tier IP.
- **S7 [A]** Pre-block when `runMinutes > remaining` (clean once B2 reservations exist).
- **S8 [low]** Whitelist/validate keys in `/api/profile`.

## ✅ ALREADY SAFE
Secrets hygiene passed (no hardcoded keys, `.env.local` gitignored). Charge-on-delivery model is sound. Idempotency pattern already exists (`jobs.idempotency_key`). Web load test 300/100 = 100%. Guards fail OPEN (conservative, not runaway spend). Async architecture = these races hurt money-accuracy, not uptime.

## FOUNDER ACTION LIST [C] — in order
1. **Stripe LIVE keys** (`sk_live_`, LIVE webhook `whsec_`, LIVE prices) → Vercel prod. (Ship B3 first.)
2. **ElevenLabs upgrade** (#1 throughput blocker; Starter ≈48k chars / 3 concurrent left).
3. **Supabase Auth redirect URLs** (prod domain + `localhost:3010/**`).
4. **Resend**: verify domain + set `RESEND_API_KEY`/`RESEND_FROM_EMAIL` in Vercel prod.
5. **Legal copy** for /terms /privacy /legal.
6. **Approve cog** `32a69490` (or roll back).
7. **Set `CRON_SECRET`** in Vercel prod (now required).
8. **Vercel Pro** (for per-minute drain crons) — optional.
9. **Anthropic tier** check.
10. **`vercel --prod` LAST** — after all blockers + 1–9, then incognito smoke test.

# Roar Bliss — Go-Live Runbook (living copy)

Annotated with current status (updated 2026-06-08, evening). Source: `GO_LIVE_RUNBOOK.pdf`.
**[A]** = agent can do · **[C]** = only Clarence. Don't run `vercel --prod` until every phase is checked.
Secrets live only in `web/.env.local` (local) + Vercel env (prod) — never in code/commits.

Status: ✅ done · 🟡 partial · 🔴 open · ⚠️ changed since the PDF.

---

## Phase 1 — Cog version pin
- ✅ **[A] Pin — DONE, beyond the PDF.** PDF targeted `c3c973dc`. We then built more cog fixes (tier 25/50/75/100 honored on free, **sentence-boundary slot cuts**, ElevenLabs/Anthropic/Replicate retries + clone re-attempt), redeployed → **`32a69490…`**, pinned in `web/.env.local` **and** Vercel production.
- 🔴 **[C] Approve the NEW version's output.** You approved c3c973dc; you have **not** verify-run/approved `32a69490`'s MP3s. One real run recommended before launch.

## Phase 2 — Stripe (LIVE)
- 🔴 **[C] Provide LIVE keys** (`STRIPE_SECRET_KEY` live + webhook signing secret). ⚠️ `STRIPE_PRICE_ID` **not needed** — inline `price_data` (pack + recurring tiers).
- 🔴 **[A] Set live keys** in `.env.local` + Vercel prod, register live `/api/stripe-webhook`. (waiting on keys)
- ✅ **[A] Subscription flow wired + TEST-verified** (checkout → webhook → `paid_credits` + tier).

## Phase 3 — Resend / Supabase auth email
- 🟡 **[A] `RESEND_FROM_EMAIL`/`RESEND_API_KEY` in Vercel prod** — confirm set (was empty per PDF). **To verify.**
- 🔴 **[A/C] Supabase Auth → URL Configuration: redirect URLs** (prod domain + `localhost:3010/**`). Dashboard task; only :3009 added.
- ✅ **[A] `free_usage` + `jobs` tables exist** (`eoahpwciwttfavzpqfnz`); free gate verified. ⚠️ Auth now **password-login + magic-link fallback**.

## Phase 4 — Scale hardening — ✅ DONE
- ✅ Spend-cap (runs/spend/per-user) before `createPrediction` → block + Resend alert.
- ✅ Concurrency queue (`MAX_CONCURRENCY=3` = ElevenLabs Starter cap; excess `queued`, drained by callback + `/api/jobs/drain` cron).
- ✅ Retry-with-backoff: `replicate.ts` + `tts.py`/`llm.py`/`predict.py` (live in `32a69490`).
- ✅ Idempotency key. ✅ Pooler = N/A (supabase-js/PostgREST REST, inherently pooled).
- ✅ External limits in `SCALE_READINESS.md`. **🔴 #1 launch blocker: ElevenLabs = Starter** (cap 3, ~48k chars left) — upgrade before real traffic.

## Phase 5 — Load test
- ✅ **[A] web 300/100** → 100% 2xx, 0 429/5xx, p95 ~2.3s (dev).
- 🔴 **[A] accept 200/100** — pending (now safe: tables exist).
- 🔴 **[A] generate --confirm on STAGING** — pending, costs money.

## Phase 6 — Deploy
- ✅ **[A] `npm run build` clean.**
- 🔴 **[C] Go-ahead** → 🔴 **[C] `vercel --prod`** → 🔴 **[A] Smoke-test prod** (incognito).

## Parallel / polish
- ⚠️ **OBSOLETE — 6 section bg images:** old section-landing **retired** (`/` → `/story`); replaced by cinematic homepage + bliss imagery + 3 animations.
- 🟡 **[A] Responsive sweep** — story + wizard mostly done; final pass pending.

## Hard rules
- Production pipeline = Replicate Cog only. Custom CSS (no Tailwind). `champion` "Eric Thomas"/"Les Brown" = opaque keys. Always verify in incognito (Turbopack stale-CSS cache).

---

### TL;DR — what's left for go-live
1. 🔴 **[C] Stripe LIVE keys**
2. 🔴 **[C] ElevenLabs plan upgrade** (real throughput/quota blocker)
3. 🔴 **[A/C] Supabase redirect URLs** (prod + :3010) + confirm Resend env in Vercel
4. 🔴 **[C] Approve a verify-run of cog `32a69490`**
5. 🟡 **[A] accept-mode load test + final responsive sweep**
6. 🔴 **[C] go-ahead → `vercel --prod` → smoke test**

Phases 1 (mostly) + 4 done. Rest gated on your inputs (keys, plan upgrade, dashboard config, go-ahead).

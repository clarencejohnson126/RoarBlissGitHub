# Roar Bliss — Go-Live Runbook

One ordered roadmap to production. Work top to bottom. **[A]** = agent can do it, **[C]** = only Clarence
can supply it. Don't run `vercel --prod` until every phase below is checked.
Companion docs: `SCALE_READINESS.md` (hardening detail), `HANDOFF_PROMPT_2026-06-07.md` (context).
Secrets live only in `web/.env.local` (local) and Vercel env (prod) — never in code or commits.

---

## Phase 1 — Cog version pin
- [ ] **[A]** Verify-run on `c3c973dc` (the build that has ALL fixes incl. "never read JSON aloud"):
      1× translation + 1× clone through the real Replicate cog (~$0.10). Clarence listens to the MP3s.
- [ ] **[C]** Approve the MP3s.
- [ ] **[A]** Set `REPLICATE_MODEL_VERSION=c3c973dc…` in `web/.env.local` **and** Vercel **production**
      (currently EMPTY in Vercel → would otherwise pull `latest` blindly).
- [ ] **[A]** Do NOT pin `94c1272` (stale — missing the translation + JSON-aloud fixes).
- Acceptance: both envs pinned to the approved version; `replicate.ts` resolves it (not `latest`).

## Phase 2 — Stripe (LIVE)
- [ ] **[C]** Provide LIVE keys: `STRIPE_SECRET_KEY` (live), webhook signing secret, and the **price ID**
      (`STRIPE_PRICE_ID` is currently missing entirely).
- [ ] **[A]** Set them in `web/.env.local` + Vercel production. Register the live webhook endpoint
      (`/api/stripe-webhook`) in the Stripe dashboard.
- [ ] **[A]** End-to-end test: checkout → webhook → `app_metadata.paid_credits` incremented → paid
      (6-min) run unlocks. Test in Stripe test mode first, then confirm live keys are wired.
- Acceptance: a real purchase grants credits and a paid run succeeds.

## Phase 3 — Resend / Supabase auth email
- [ ] **[A]** Confirm `RESEND_FROM_EMAIL` = verified-domain sender (`roar@thinkbig.rebelz-ai.com`) in
      BOTH `web/.env.local` and Vercel production (was EMPTY in Vercel prod).
- [ ] **[A]** In the Supabase dashboard → Auth → URL Configuration: add redirect URLs (prod domain +
      localhost) so the magic link redirects back.
- [ ] **[A]** Verify the `free_usage` table exists (project `eoahpwciwttfavzpqfnz`) and the free gate
      (1 track / device+IP, download gated by registration) works.
- Acceptance: sign-in magic link arrives to an external address and logs the user in; free gate holds.

## Phase 4 — Scale hardening (see SCALE_READINESS.md)
- [ ] **[A]** Spend-cap / budget guard (`MAX_RUNS_PER_DAY`, `MAX_SPEND_USD_PER_DAY` + per-user) checked
      before `createPrediction`; over-limit → block/queue + Resend alert.
- [ ] **[A]** Concurrency queue / backpressure (in-flight counter, `MAX_CONCURRENCY` tied to ElevenLabs
      cap; excess → `queued`, drained by callback/cron).
- [ ] **[A]** Retry-with-backoff: `replicate.ts` (createPrediction/version-resolve, 429/5xx only) +
      `predict.py` (every ElevenLabs & Anthropic call, + sanity-check clone ≤ 3× slot + seed retry).
- [ ] **[A]** Idempotency key per submit; Supabase transaction pooler server-side.
- [ ] **[A/C]** Fill external limits into SCALE_READINESS.md: ElevenLabs concurrency+quota (#1
      bottleneck), Anthropic tier/RPM/TPM, Replicate max instances. Raise plans/limits as needed.
- Acceptance: forced over-limit blocks + alerts; ≤ MAX_CONCURRENCY parallel predictions; simulated 429
      auto-retries with no lost slot.

## Phase 5 — Load test (`web/scripts/load-test.mjs`)
- [ ] **[A]** `--mode web --n 300 --concurrency 100` (web/Supabase tier) → success rate, p95 latency.
- [ ] **[A]** `--mode accept --n 100 --concurrency 50` (route + free gate + new queue/spend logic).
- [ ] **[A]** Optional `--mode generate --confirm` on STAGING only (free gate off) for true e2e numbers.
- [ ] **[A]** Record results; no climbing 429/5xx at target concurrency.
- Acceptance: green numbers at the concurrency you expect at launch.

## Phase 6 — Deploy
- [ ] **[A]** Final `cd web && npm run build` clean (tsc + lint).
- [ ] **[C]** Give the go-ahead.
- [ ] **[C]** `cd web && vercel --prod` (Clarence's trigger).
- [ ] **[A]** Smoke-test prod: landing loads, /create flow runs one free track end-to-end, sign-in,
      a paid purchase, the completion email. Verify in an incognito window (Turbopack/CDN cache gotcha).
- Acceptance: a real user can create, register, pay, and download on the live domain.

---

## Parallel / polish (not blocking, but before heavy marketing)
- [ ] **[C]** Provide the 6 better section background images (landscape, ≥1600px) → drop at
      `web/public/images/sec-{howitworks,templates,depth,languages,why,faq}.jpg` (same names = no code change).
- [ ] **[A]** Responsive/polish pass across mobile/tablet/laptop/desktop/ultrawide (verify in incognito).
- [ ] Note: the laptop "hero cut off" was the Turbopack dev CSS cache, not a code bug — resolved.

## Hard rules
- Production pipeline = Replicate Cog only (not Mac, not Hetzner — stay on managed autoscale).
- Custom CSS (no Tailwind utilities); next/font needs `className={playfair.variable}` on `<html>`.
- `champion` values "Eric Thomas"/"Les Brown" are opaque keys (AudioVisualizer + cog depend on them).
- Always verify in incognito / hard-refresh (Turbopack stable-chunk CSS cache serves stale CSS).

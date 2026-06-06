# Roar Bliss — Unit Economics & Pricing (source of truth)

_Last updated 2026-06-07. Numbers I know for certain: ElevenLabs rates + our measured
character counts. Numbers that are assumptions: product price & usage — marked as such._

## Cost anchor

- ElevenLabs `eleven_multilingual_v2` = 1 credit / character.
- Measured: ~**550 characters per minute** of finished narration.
- Effective TTS cost: **~$0.10 / minute** (Scale tier $0.165/1k chars). Drops to
  **~$0.066 / min** at Business-tier volume.
- Everything else per audio is rounding: LLM script-gen ~$0.005–0.02, ffmpeg/CPU
  ~$0.002, storage/bandwidth ~$0.0002.
- **Total ≈ $0.19 per 2-min audio**, TTS-dominated (~95%).

## What today's dev session cost

~8 full iterations (voice test → v1…v6 → engine test) ≈ **~8,400 characters ≈ ~$1.50 total**.
(All ran locally on the Mac; the cloud path is still unproven — see TEST_MATRIX A1.)

## Tiers (cap in minutes + paid overage = margin protection)

| | Starter | Pro | Premium |
|---|---|---|---|
| Price / month | **$9** (€9,99) | **$19** (€19,99) | **$39** (€39,99) |
| Audio cap / month | **25 min** | **60 min** | **120 min** |
| TTS COGS if fully maxed | $2.50 | $6.00 | $12.00 |
| + infra/LLM per user | $0.30 | $0.40 | $0.50 |
| **Margin if maxed out** | **69%** | **66%** | **68%** |
| Typical use (~40% of cap) | 10 min | 24 min | ~48 min |
| **Margin at typical use** | **~86%** | **~86%** | **~86%** |
| Overage past cap | **$0.30 / extra min (3× COGS)** | ← | ← |

Most users never max their cap (industry 30–50% utilization), so real blended margin
is ~85%; cap-busters are covered by overage. The "thin-margin" failure mode (cheap
price + uncapped heavy use) is structurally impossible with this design.

## Blended model: 1,000 paying subscribers

Typical SaaS tier mix:

| Tier | Share | Subs | Revenue | COGS (typical use) |
|---|---|---|---|---|
| Starter $9 | 60% | 600 | $5,400 | $600 |
| Pro $19 | 30% | 300 | $5,700 | $720 |
| Premium $39 | 10% | 100 | $3,900 | $450 |
| **Total** | | **1,000** | **$15,000** | **$1,770** TTS |

- Fixed (hosting/Vercel/R2 + LLM + ElevenLabs base): **~$600/mo**
- **Gross profit ≈ $12,630/mo · margin ~84% · ARPU $15**
- Upside not counted: overage revenue, annual plans (2 months free → retention/cashflow).

## Hard rules

1. Cap every tier in minutes + overage at $0.30/min. No "unlimited".
2. No plan below ~$9 — below that, TTS + infra eat the fixed-cost coverage.
3. Free tier as funnel (already built): ≤45s, 1/device+IP → ~$0.06/user, bounded.
   Target Free→Starter conversion 3–5%.

## Open cost question

Mode B (voice cloning) needs voice isolation (demucs/GPU) → a real compute line item,
not yet measured. Measure GPU-seconds when the Mode-B engine is built before pricing
clone-heavy use.

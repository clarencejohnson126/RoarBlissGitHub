# Cog version provenance — git commit ↔ Replicate cog version

**Why this file exists:** the production cog version is pinned in `web/.env.local`
(`REPLICATE_MODEL_VERSION`, gitignored) and the GitHub Action `deploy-cog.yml` builds from
whatever git state it runs on — so historically there was **no record of which commit produced
which deployed cog version**. That made it impossible to prove, from the repo, that the live
engine contains a given fix. This file fixes that. **Every `deploy-cog` run gets one row here,
committed alongside the predict.py change it builds.**

## How to record a build
1. Note the git commit you're building from (`git rev-parse --short HEAD`).
2. Trigger `deploy-cog.yml`; when it finishes, copy the new Replicate version id.
3. Add a row below (date, commit, version, summary, whether it's promoted to live).
4. When you re-pin prod, update `REPLICATE_MODEL_VERSION` AND mark the row `live: yes`.

## Ledger

| Date | git commit | Replicate cog version | What's in it | Live? |
|------|-----------|----------------------|--------------|-------|
| (pre-2026-06-17) | UNKNOWN — not tracked | `4e4b0fe3…` (per web/.env.local at recon time) | RoFormer separator + overlap-revert + tier-fix/watchdog (the version the founder validated "hört sich gut an") | was live |

> Rows above the line are reconstructed best-effort; the commit→version map did not exist before
> 2026-06-17, so the live version's exact source commit is unverifiable. Everything from the next
> build on is tracked deterministically.

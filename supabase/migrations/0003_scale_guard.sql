-- 0003_scale_guard.sql — scale-readiness backing tables.
-- Apply ONCE in the Supabase SQL editor for project eoahpwciwttfavzpqfnz
-- (the Supabase MCP is connected to a different project, and the service_role key is a PostgREST
--  JWT, not a Postgres password — so DDL must be pasted here by hand).
-- All server access uses the service_role client, which bypasses RLS. No anon policies are added,
-- so these tables are locked to server-side code only. The app FAILS OPEN if these are absent.

-- ---------------------------------------------------------------------------
-- free_usage — the free-tier abuse gate (1 free track per device fingerprint OR IP).
-- (Referenced by web/src/lib/supabase-admin.ts; bundled here because it was never migrated.)
-- ---------------------------------------------------------------------------
create table if not exists public.free_usage (
  id            uuid primary key default gen_random_uuid(),
  fingerprint   text,
  ip            text,
  prediction_id text,
  created_at    timestamptz not null default now()
);
create index if not exists free_usage_fingerprint_idx on public.free_usage (fingerprint);
create index if not exists free_usage_ip_idx on public.free_usage (ip);
alter table public.free_usage enable row level security;

-- ---------------------------------------------------------------------------
-- jobs — single source of truth for concurrency, queue, spend-cap and idempotency.
--   concurrency = count(status='running')
--   queue       = rows with status='queued' (oldest first), `input` holds the PredictionInput
--                 WITHOUT secrets so a drain can re-create the prediction
--   spend-cap   = count(*) / sum(est_cost_cents) where created_at >= start of today
--   idempotency = unique idempotency_key
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  prediction_id   text,                                   -- null while queued
  idempotency_key text unique,
  user_id         uuid,                                   -- null for free / anonymous
  fingerprint     text,
  ip              text,
  status          text not null default 'running',        -- running | queued | done | failed
  paid            boolean not null default false,
  est_cost_cents  integer not null default 0,
  input           jsonb,                                   -- PredictionInput w/o secrets (for drain)
  webhook_url     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists jobs_status_idx     on public.jobs (status);
create index if not exists jobs_created_idx     on public.jobs (created_at);
create index if not exists jobs_prediction_idx  on public.jobs (prediction_id);
create index if not exists jobs_user_day_idx    on public.jobs (user_id, created_at);
alter table public.jobs enable row level security;

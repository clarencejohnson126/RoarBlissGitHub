-- ════════════════════════════════════════════════════════════════════════════
-- 0004 — Billing integrity: atomic, idempotent minutes ledger + Stripe idempotency
-- Fixes launch-audit B1 (lost charges race), B2 (concurrent over-delivery),
-- B3 (Stripe double period-reset), B5 (queued-job period attribution).
-- Apply once in the Supabase SQL editor (project eoahpwciwttfavzpqfnz).
-- All guards FAIL OPEN in code if these objects are missing, so deploying before
-- applying never blocks users — billing integrity just isn't active until applied.
-- ════════════════════════════════════════════════════════════════════════════

-- Single source of truth for paid-minute usage. One row per run.
--   reserved  → minutes are committed at run start (counts against the allowance)
--   charged   → run delivered a file (final)
--   released  → run failed / never delivered (does not count)
create table if not exists minute_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  prediction_id text,
  minutes       numeric not null check (minutes >= 0),
  status        text   not null default 'reserved' check (status in ('reserved','charged','released')),
  period_end    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- One ledger row per prediction → duplicate/retried webhooks can't double-charge.
create unique index if not exists minute_ledger_pred_uniq on minute_ledger(prediction_id) where prediction_id is not null;
create index if not exists minute_ledger_user_period on minute_ledger(user_id, period_end, status);
alter table minute_ledger enable row level security; -- service_role bypasses; no anon policy = locked

-- Stripe webhook idempotency: a processed event id is recorded once.
create table if not exists stripe_events (
  event_id   text primary key,
  created_at timestamptz not null default now()
);
alter table stripe_events enable row level security;

-- Link a paid job to its reservation so the drain can attach the prediction id later.
alter table jobs add column if not exists reservation_id uuid;

-- Atomic reserve: take a per-user lock, sum current period usage, and only insert a
-- reservation if it stays within the allowance. Returns the reservation id, or NULL if over.
create or replace function reserve_minutes(
  p_user uuid, p_minutes numeric, p_period_end timestamptz, p_allowance numeric
) returns uuid
language plpgsql
as $$
declare
  v_used numeric;
  v_id   uuid;
begin
  -- serialize concurrent reservations for the same user → no over-reserve race
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select coalesce(sum(minutes), 0) into v_used
    from minute_ledger
    where user_id = p_user
      and status in ('reserved','charged')
      and period_end is not distinct from p_period_end;
  if v_used + p_minutes > p_allowance then
    return null;
  end if;
  insert into minute_ledger(user_id, minutes, status, period_end)
    values (p_user, p_minutes, 'reserved', p_period_end)
    returning id into v_id;
  return v_id;
end;
$$;

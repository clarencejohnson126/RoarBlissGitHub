-- 0008_feedback_and_scorecards.sql — the learning loop's capture layer.
-- APPLIED to project eoahpwciwttfavzpqfnz via the Supabase MCP on 2026-06-11.
--
-- feedback: PRIVATE user feedback (NO public testimonials). Each row links to a run (prediction_id)
-- and carries structured issue tags that map directly to evaluator metrics — so a complaint is a
-- labeled training signal ("volume_uneven" -> loudness range), not a vague vibe. The triage step
-- joins each complaint to that run's objective scorecard: battery-caught vs battery-missed. Misses
-- become new metrics / tightened thresholds + a permanent regression test.
create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  prediction_id text,
  user_id       uuid,                         -- nullable: free users give feedback too
  rating        int check (rating between 1 and 5),
  tags          text[] not null default '{}',
  comment       text,
  ip            text,                         -- light anti-spam only
  created_at    timestamptz not null default now()
);
create index if not exists feedback_prediction_idx on public.feedback (prediction_id);
create index if not exists feedback_created_idx     on public.feedback (created_at);
-- RLS on, no policies = service-role only. Nothing is publicly readable -> never an open testimonial wall.
alter table public.feedback enable row level security;

-- Store each run's objective battery scorecard so feedback can be joined to the numbers.
alter table public.jobs add column if not exists scorecard jsonb;

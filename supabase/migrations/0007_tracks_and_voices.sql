-- 0007_tracks_and_voices.sql — track library + voice favorites foundation.
-- APPLIED to project eoahpwciwttfavzpqfnz via the Supabase MCP on 2026-06-11.

-- jobs.output_url: durable Vercel-Blob URL of the finished MP3 (outputs/ use random suffixes since the
-- privacy hardening, so the URL is not reconstructible from the prediction id — store it at webhook time).
alter table public.jobs add column if not exists output_url text;

-- Saved voices: a user explicitly opts in to keep a reference clip for one-click reuse.
-- RLS enabled with no policies = service-role only (same pattern as all billing tables).
create table if not exists public.user_voices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  name       text not null,
  blob_url   text not null,
  created_at timestamptz not null default now()
);
create index if not exists user_voices_user_idx on public.user_voices (user_id);
alter table public.user_voices enable row level security;

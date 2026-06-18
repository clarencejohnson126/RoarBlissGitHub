-- 0009_library_voices.sql — the curated ElevenLabs voice library (instrumental + translation paths).
-- Differentiated-engine plan (2026-06-17): instrumental + translation speak a FIXED set of commercially-
-- licensed EL voices (Voice Library add-shared-voice + Voice Design) — NEVER a celebrity clone. Personalization
-- stays OmniVoice. Pre-generated static previews => 0 EL API calls when a customer auditions a voice.
-- Replaces the hardcoded LIBRARY_VOICES array in web/src/lib/voices.ts (the documented single swap-point).

create table if not exists public.library_voices (
  id          text primary key,                 -- stable slug, e.g. 'alze', 'rb_de_m1'
  name        text not null,                    -- display name shown in the picker
  language    text not null default 'en',       -- en | de | pt-BR | fr | es | it | tr | zh
  gender      text not null,                    -- 'male' | 'female'
  persona     text,                             -- 'deep narrator', 'calm documentary', ...
  accent      text,                             -- 'american', 'british', ...
  el_voice_id text not null,                    -- the ElevenLabs voice_id used at TTS time
  preview_url text,                             -- static pre-generated ~12s preview (Blob/Storage) — 0-cost audition
  source      text not null default 'library',  -- 'library' (add-shared-voice) | 'design' (Voice Design)
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists library_voices_lang_idx on public.library_voices (language, active, sort);

-- The library is PUBLIC catalog data (the picker renders it even for logged-out visitors), but only ACTIVE
-- rows and read-only. Writes (seed script / admin) go through the service role, which bypasses RLS.
alter table public.library_voices enable row level security;
drop policy if exists "public reads active library voices" on public.library_voices;
create policy "public reads active library voices" on public.library_voices
  for select to anon, authenticated using (active = true);

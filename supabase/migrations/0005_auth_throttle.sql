-- 0005 — Auth rate limiting (launch-audit B9). Sliding-window throttle for register + magic-link
-- (spam / enumeration / Resend-quota DoS). Service-role only; fails OPEN in code if missing.
create table if not exists auth_throttle (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_throttle_key_ts on auth_throttle(key, created_at);
alter table auth_throttle enable row level security;

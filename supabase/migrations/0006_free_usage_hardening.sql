-- 0006_free_usage_hardening.sql — close the free-gate race (audit finding H1).
-- APPLIED to project eoahpwciwttfavzpqfnz via the Supabase MCP on 2026-06-11.
--
-- The JS gate was check-then-insert: N parallel first-requests from the same device/IP all passed
-- freeUsageExists() before any row landed, each minting a free GPU run. The gate is now a DB-enforced
-- CLAIM: the route INSERTs before starting the prediction, and a unique violation (23505) means the
-- free track is already taken. Empty identities are stored as NULL so they never collide.

-- 1) Normalize empty identities to NULL (NULLs never collide in partial unique indexes).
update public.free_usage set fingerprint = null where fingerprint = '';
update public.free_usage set ip = null where ip = '';

-- 2) Dedupe (keep one row per fingerprint / per ip) so the unique indexes can build.
delete from public.free_usage a using public.free_usage b
  where a.fingerprint = b.fingerprint and a.fingerprint is not null and a.ctid > b.ctid;
delete from public.free_usage a using public.free_usage b
  where a.ip = b.ip and a.ip is not null and a.ctid > b.ctid;

-- 3) DB-enforced uniqueness: one free track per device fingerprint AND per IP.
create unique index if not exists free_usage_fingerprint_uq on public.free_usage (fingerprint) where fingerprint is not null;
create unique index if not exists free_usage_ip_uq on public.free_usage (ip) where ip is not null;

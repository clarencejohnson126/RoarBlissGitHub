import { createClient, type User } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase helpers. Never import this from a client component — it uses the service_role
 * key (full admin). The paid entitlement is stored in the user's `app_metadata.paid_credits` (no
 * custom table / DDL needed); the Stripe webhook grants credits, /api/process consumes them.
 */

function url(): string {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return u;
}

/** Admin client (service_role) — bypasses RLS, can update user metadata. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Verify a user access token (from the Authorization header). Returns the user or null. */
export async function verifyUser(accessToken: string | null | undefined): Promise<User | null> {
  if (!accessToken) return null;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) return null;
  const sb = createClient(url(), anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}

export function paidCredits(user: User | null): number {
  return Number((user?.app_metadata as Record<string, unknown>)?.paid_credits ?? 0);
}

/** The user's subscription tier id (set by the Stripe webhook), or null if none. */
export function userTier(user: User | null): string | null {
  const t = (user?.app_metadata as Record<string, unknown>)?.tier;
  return typeof t === "string" && t ? t : null;
}

/** Set the user's subscription tier id (called by the Stripe webhook on a subscription checkout). */
export async function setUserTier(userId: string, tier: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return;
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...data.user.app_metadata, tier },
  });
}

/** Add N paid credits to a user (called by the Stripe webhook after a successful TEST payment). */
export async function grantCredits(userId: string, n: number): Promise<number> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error(`grantCredits: user ${userId} not found`);
  const cur = Number((data.user.app_metadata as Record<string, unknown>)?.paid_credits ?? 0);
  const next = cur + n;
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...data.user.app_metadata, paid_credits: next },
  });
  return next;
}

/** Consume one paid credit. Returns true if a credit was available and spent. */
export async function consumeCredit(userId: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  const cur = Number((data.user.app_metadata as Record<string, unknown>)?.paid_credits ?? 0);
  if (cur <= 0) return false;
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...data.user.app_metadata, paid_credits: cur - 1 },
  });
  return true;
}

/**
 * Free-tier abuse gate — one free track per device fingerprint OR IP. Backed by the `free_usage`
 * table (fingerprint text, ip text, prediction_id text, created_at timestamptz). The service_role
 * client bypasses RLS. If the table doesn't exist yet we FAIL OPEN (allow) and log — so a missing
 * migration never blocks legitimate users; abuse protection just isn't active until the table exists.
 */
export async function freeUsageExists(fingerprint: string, ip: string): Promise<boolean> {
  if (!fingerprint && !ip) return false;
  try {
    const ors: string[] = [];
    if (fingerprint) ors.push(`fingerprint.eq.${fingerprint}`);
    if (ip) ors.push(`ip.eq.${ip}`);
    const { data, error } = await supabaseAdmin()
      .from("free_usage")
      .select("id")
      .or(ors.join(","))
      .limit(1);
    if (error) {
      console.warn("freeUsageExists: failing open —", error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (e) {
    console.warn("freeUsageExists: failing open —", (e as Error).message);
    return false;
  }
}

/** Record that a device/IP has consumed its one free track. Best-effort (never throws). */
export async function recordFreeUsage(fingerprint: string, ip: string, predictionId: string): Promise<void> {
  try {
    await supabaseAdmin().from("free_usage").insert({ fingerprint, ip, prediction_id: predictionId });
  } catch (e) {
    console.warn("recordFreeUsage skipped:", (e as Error).message);
  }
}

/** Give a device/IP its free track back if the run didn't deliver (failed runs must never burn the free try). */
export async function clearFreeUsageForPrediction(predictionId: string): Promise<void> {
  try {
    await supabaseAdmin().from("free_usage").delete().eq("prediction_id", predictionId);
  } catch (e) {
    console.warn("clearFreeUsageForPrediction skipped:", (e as Error).message);
  }
}

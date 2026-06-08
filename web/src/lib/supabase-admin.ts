import { createClient, type User } from "@supabase/supabase-js";
import { tierById } from "./tiers";

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

export type Usage = {
  tier: string | null;
  allowance: number; // minutes/month for the tier
  used: number; // minutes used this period
  remaining: number; // minutes left this period (never < 0)
  periodEnd: string | null;
};

/**
 * Minutes-based entitlement for the CURRENT billing period (no rollover). Allowance comes from the
 * tier; `minutes_used` + `period_end` live in app_metadata. If the period has rolled past period_end
 * we treat usage as fresh (the Stripe webhook formalizes the reset on the next invoice).
 */
export function usageState(user: User | null): Usage {
  const app = (user?.app_metadata as Record<string, unknown>) ?? {};
  const tier = typeof app.tier === "string" && app.tier ? app.tier : null;
  const allowance = tierById(tier)?.minutes ?? 0;
  const periodEnd = typeof app.period_end === "string" ? app.period_end : null;
  let used = Number(app.minutes_used ?? 0);
  if (periodEnd && Date.now() > new Date(periodEnd).getTime()) used = 0;
  const remaining = Math.max(0, allowance - used);
  return { tier, allowance, used: Math.min(Math.max(used, 0), allowance), remaining, periodEnd };
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

/** Deduct minutes of FINISHED audio from the monthly allowance (called on delivery, charge-on-success). */
export async function chargeMinutes(userId: string, minutes: number): Promise<void> {
  if (!(minutes > 0)) return;
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return;
  const app = (data.user.app_metadata as Record<string, unknown>) ?? {};
  const periodEnd = typeof app.period_end === "string" ? app.period_end : null;
  let used = Number(app.minutes_used ?? 0);
  if (periodEnd && Date.now() > new Date(periodEnd).getTime()) used = 0;
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...app, minutes_used: Math.round((used + minutes) * 100) / 100 },
  });
}

/**
 * Begin a new monthly billing period: set the tier, RESET used minutes to 0 (no rollover), and anchor
 * the period end (= Stripe subscription's current_period_end). Called by the Stripe webhook on the
 * initial checkout and every renewal.
 */
export async function startBillingPeriod(userId: string, tier: string, periodEndISO: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return;
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...data.user.app_metadata, tier, minutes_used: 0, period_end: periodEndISO },
  });
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

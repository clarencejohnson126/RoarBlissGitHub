import { createClient, type User } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
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
  used: number; // minutes used this period (reserved + charged)
  remaining: number; // minutes left this period (never < 0)
  periodEnd: string | null;
};

/** Tier + allowance + period end from app_metadata (sync; no DB). */
export function tierState(user: User | null): { tier: string | null; allowance: number; periodEnd: string | null } {
  const app = (user?.app_metadata as Record<string, unknown>) ?? {};
  const tier = typeof app.tier === "string" && app.tier ? app.tier : null;
  const allowance = tierById(tier)?.minutes ?? 0;
  const periodEnd = typeof app.period_end === "string" ? app.period_end : null;
  return { tier, allowance, periodEnd };
}

/** Minutes used this period = SUM(reserved + charged) in the ledger — the single source of truth. */
export async function usedMinutes(userId: string, periodEnd: string | null): Promise<number> {
  try {
    let q = supabaseAdmin().from("minute_ledger").select("minutes").eq("user_id", userId).in("status", ["reserved", "charged"]);
    q = periodEnd ? q.eq("period_end", periodEnd) : q.is("period_end", null);
    const { data, error } = await q;
    if (error || !data) return 0;
    return Math.round(data.reduce((s, r) => s + Number((r as { minutes: number }).minutes || 0), 0) * 100) / 100;
  } catch {
    return 0;
  }
}

/** Full usage snapshot for the current period (async — reads the ledger). No rollover. */
export async function usageState(user: User | null): Promise<Usage> {
  const { tier, allowance, periodEnd } = tierState(user);
  const used = user ? await usedMinutes(user.id, periodEnd) : 0;
  return { tier, allowance, used: Math.min(used, allowance), remaining: Math.max(0, allowance - used), periodEnd };
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

/**
 * Atomically reserve minutes for the current period via the reserve_minutes RPC (per-user advisory
 * lock + allowance check + insert). Returns the reservation id, or null if it would exceed the
 * allowance. Fails CLOSED (null) on error — never hand out free minutes on a billing fault.
 */
export async function reserveMinutes(userId: string, minutes: number, periodEnd: string | null, allowance: number): Promise<string | null> {
  const m = minutes > 0 ? minutes : 0;
  try {
    const { data, error } = await supabaseAdmin().rpc("reserve_minutes", {
      p_user: userId,
      p_minutes: m,
      p_period_end: periodEnd,
      p_allowance: allowance,
    });
    if (error) {
      console.error("reserveMinutes rpc error:", error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error("reserveMinutes failed:", (e as Error).message);
    return null;
  }
}

/**
 * Attach the prediction id to a reservation so delivery/failure can resolve it. Returns false when
 * the link did NOT land (DB error or 0 rows matched): an unlinked reservation can never be charged
 * by the delivery webhook (= silent unbilled run), so callers must treat false as fatal.
 */
export async function linkReservation(reservationId: string, predictionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("minute_ledger")
      .update({ prediction_id: predictionId, updated_at: new Date().toISOString() })
      .eq("id", reservationId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("0 rows matched — reservation row not found");
    return true;
  } catch (e) {
    console.error("linkReservation FAILED:", reservationId, "→", predictionId, (e as Error).message);
    Sentry.captureException(e, { tags: { area: "billing", op: "linkReservation" }, extra: { reservationId, predictionId } });
    return false;
  }
}

/**
 * Delivered run: reserved → charged (atomic + idempotent via the status guard; duplicate webhooks no-op).
 * Returns false on a DB error so the caller can signal Replicate to RETRY the webhook (the update is
 * idempotent, so retrying is safe) — a charge write must never be silently dropped (= unbilled run).
 */
export async function chargeReservation(predictionId: string, expectReservation = false): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("minute_ledger")
      .update({ status: "charged", updated_at: new Date().toISOString() })
      .eq("prediction_id", predictionId)
      .eq("status", "reserved")
      .select("id");
    if (error) throw new Error(error.message);
    if (data?.length) return true;
    // 0 rows matched — fine for a free run (no reservation) or a webhook retry (already charged),
    // but FATAL for a paid delivery whose reservation never got linked: that's an unbilled run.
    const { data: existing } = await supabaseAdmin()
      .from("minute_ledger")
      .select("status")
      .eq("prediction_id", predictionId)
      .maybeSingle();
    if (existing?.status === "charged") return true; // idempotent retry — already settled
    if (!expectReservation) return true; // free run — nothing to charge
    const orphan = new Error(
      `PAID delivery without a chargeable reservation (prediction ${predictionId}, ledger: ${existing?.status ?? "no row"}) — unbilled run, needs reconciliation`,
    );
    console.error("chargeReservation:", orphan.message);
    Sentry.captureException(orphan, { tags: { area: "billing", op: "chargeReservation_orphan" }, extra: { predictionId } });
    return false;
  } catch (e) {
    console.error("chargeReservation FAILED for", predictionId, (e as Error).message);
    Sentry.captureException(e, { tags: { area: "billing", op: "chargeReservation" }, extra: { predictionId } });
    return false;
  }
}

/** Non-delivered run: reserved → released (the minutes return to the allowance; no charge). */
export async function releaseReservation(predictionId: string): Promise<void> {
  try {
    await supabaseAdmin().from("minute_ledger").update({ status: "released", updated_at: new Date().toISOString() }).eq("prediction_id", predictionId).eq("status", "reserved");
  } catch (e) {
    console.warn("releaseReservation skipped:", (e as Error).message);
  }
}

/** Release a reservation by its id (used when a queued job fails to ever start). */
export async function releaseReservationById(reservationId: string): Promise<void> {
  try {
    await supabaseAdmin().from("minute_ledger").update({ status: "released", updated_at: new Date().toISOString() }).eq("id", reservationId).eq("status", "reserved");
  } catch (e) {
    console.warn("releaseReservationById skipped:", (e as Error).message);
  }
}

/** Process a Stripe event at most once. Returns true if NEW (proceed), false if already handled. */
export async function processStripeEventOnce(eventId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin().from("stripe_events").insert({ event_id: eventId });
    if (error) {
      if (/duplicate|unique|conflict/i.test(error.message)) return false; // already processed
      console.error("processStripeEventOnce error:", error.message);
      return true; // transient error → don't drop a paid event
    }
    return true;
  } catch (e) {
    console.error("processStripeEventOnce failed:", (e as Error).message);
    return true;
  }
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
  // No minutes_used reset needed: usage is summed from the ledger BY period_end, so a new period_end
  // automatically means 0 used this period (true no-rollover, no race).
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...data.user.app_metadata, tier, period_end: periodEndISO },
  });
}

/**
 * Free-tier abuse gate — one free track per device fingerprint OR IP. Backed by the `free_usage`
 * table (fingerprint text, ip text, prediction_id text, created_at timestamptz). The service_role
 * client bypasses RLS. If the table doesn't exist yet we FAIL OPEN (allow) and log — so a missing
 * migration never blocks legitimate users; abuse protection just isn't active until the table exists.
 */
export async function freeUsageExists(fingerprint: string, ip: string): Promise<boolean> {
  if (!fingerprint?.trim() && !ip?.trim()) return false;
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

/**
 * Atomically CLAIM this device/IP's one free track (insert BEFORE the prediction starts; the partial
 * unique indexes on fingerprint/ip make the DB the arbiter — parallel first-requests can't all pass
 * the gate anymore). Returns false when the free track is already taken (unique violation). Fails
 * OPEN on transient errors, matching freeUsageExists (a DB hiccup must not block legitimate users).
 */
export async function claimFreeUsage(fingerprint: string, ip: string, claimKey: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin()
      .from("free_usage")
      .insert({ fingerprint: fingerprint || null, ip: ip || null, prediction_id: claimKey });
    if (error) {
      if (/duplicate|unique|conflict|23505/i.test(`${error.code} ${error.message}`)) return false;
      console.warn("claimFreeUsage: failing open —", error.message);
    }
    return true;
  } catch (e) {
    console.warn("claimFreeUsage: failing open —", (e as Error).message);
    return true;
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

/**
 * B14: a queued free run records its free_usage with the JOB id (no prediction yet). When the drain
 * starts it, re-key the row to the real prediction id so clearFreeUsageForPrediction can refund it on
 * failure (otherwise the device would be locked forever). No-op for paid jobs / immediate runs.
 */
export async function relinkFreeUsage(oldKey: string, predictionId: string): Promise<void> {
  try {
    await supabaseAdmin().from("free_usage").update({ prediction_id: predictionId }).eq("prediction_id", oldKey);
  } catch (e) {
    console.warn("relinkFreeUsage skipped:", (e as Error).message);
  }
}

/**
 * B9: sliding-window rate limit backed by `auth_throttle`. Returns true if the action is ALLOWED
 * (fewer than `max` hits for `key` in the last `windowSec`), false if throttled. Fails OPEN.
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowSec * 1000).toISOString();
    const admin = supabaseAdmin();
    const { count } = await admin.from("auth_throttle").select("id", { count: "exact", head: true }).eq("key", key).gte("created_at", since);
    if ((count ?? 0) >= max) return false;
    await admin.from("auth_throttle").insert({ key });
    return true;
  } catch {
    return true; // fail open — never lock out real users on a throttle-store hiccup
  }
}

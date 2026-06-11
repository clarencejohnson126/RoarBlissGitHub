/**
 * SERVER-ONLY scale guards backed by the `jobs` table (see supabase/migrations/0003_scale_guard.sql).
 * One table is the single source of truth for:
 *   - concurrency  → count(status='running')
 *   - queue        → status='queued' rows (oldest first), `input` holds the PredictionInput w/o secrets
 *   - spend-cap    → count(*) / sum(est_cost_cents) since start of UTC day
 *   - idempotency  → unique idempotency_key
 * Every function FAILS OPEN (table missing / transient error → allow) so a deploy before the SQL is
 * applied never blocks legitimate users — the guard is simply inactive until the table exists.
 */
import { createHash } from "crypto";
import { Resend } from "resend";
import { supabaseAdmin } from "./supabase-admin";
import type { PredictionInput } from "./replicate";

const num = (v: string | undefined, d: number) => {
  if (v === undefined || v === "") return d; // unset → default (note: Number("") is 0, so guard first)
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d; // allow explicit 0 (queue-all / block-all / emergency stop)
};

/** Read limits from env on each call (cheap; lets dev tweak without a restart). */
export function limits() {
  return {
    maxConcurrency: num(process.env.MAX_CONCURRENCY, 5),
    maxRunsPerDay: num(process.env.MAX_RUNS_PER_DAY, 200),
    maxSpendCentsPerDay: Math.round(num(process.env.MAX_SPEND_USD_PER_DAY, 100) * 100),
    maxRunsPerUserPerDay: num(process.env.MAX_RUNS_PER_USER_PER_DAY, 20),
  };
}

/** Rough per-run cost estimate (cents) for the budget guard. Free ≈ 45s; paid ≈ up to 6 min. */
export function estimateCostCents(paid: boolean, personalization: number): number {
  if (!paid) return 7;
  return Math.round(30 + Math.max(25, Math.min(100, personalization)) * 0.3); // 25%→~37¢, 100%→60¢
}

export function idempotencyKey(parts: unknown[]): string {
  return createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex");
}

const startOfUtcDay = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();

/** Idempotency: a recent job (last 6h) with this key → return it so a double-submit reuses the run. */
export async function findByIdempotencyKey(
  key: string,
): Promise<{ prediction_id: string | null; status: string } | null> {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data, error } = await supabaseAdmin()
      .from("jobs")
      .select("prediction_id,status")
      .eq("idempotency_key", key)
      .gte("created_at", sixHoursAgo)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    return data[0] as { prediction_id: string | null; status: string };
  } catch {
    return null;
  }
}

/**
 * Spend-cap inputs: total runs + summed estimated cost since the start of the UTC day.
 * Returns null on error → the caller FAILS CLOSED. This is the one guard that protects real money, so
 * if we can't verify today's spend (DB brownout) we must NOT keep starting runs (the rest of the
 * guards fail open; the budget guard must not, or an outage = unbounded Replicate/ElevenLabs spend).
 */
export async function runsAndSpendToday(): Promise<{ runs: number; cents: number } | null> {
  try {
    const since = startOfUtcDay();
    const { data, error, count } = await supabaseAdmin()
      .from("jobs")
      .select("est_cost_cents", { count: "exact" })
      .gte("created_at", since)
      .neq("status", "failed");
    if (error) return null;
    const cents = (data ?? []).reduce((s, r) => s + Number((r as { est_cost_cents: number }).est_cost_cents || 0), 0);
    return { runs: count ?? 0, cents };
  } catch {
    return null;
  }
}

export async function runsForUserToday(userId: string | null, fingerprint: string): Promise<number> {
  try {
    const since = startOfUtcDay();
    let q = supabaseAdmin().from("jobs").select("id", { count: "exact", head: true }).gte("created_at", since);
    q = userId ? q.eq("user_id", userId) : q.eq("fingerprint", fingerprint);
    const { count, error } = await q;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

export async function countInFlight(): Promise<number> {
  try {
    const { count, error } = await supabaseAdmin()
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running");
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

type JobMeta = {
  idempotencyKey: string;
  userId: string | null;
  fingerprint: string;
  ip: string;
  paid: boolean;
  estCostCents: number;
  reservationId?: string | null; // minute_ledger reservation to link once the prediction starts
};

/** Strip per-prediction secrets before persisting input (never store secrets in the DB). */
export function stripSecrets(input: PredictionInput): Partial<PredictionInput> {
  const clone: Record<string, unknown> = { ...input };
  for (const k of ["anthropic_api_key", "hf_token", "replicate_api_token", "blob_token", "elevenlabs_api_key"]) {
    delete clone[k];
  }
  return clone as Partial<PredictionInput>;
}

/**
 * #6 double-submit guard: atomically claim this idempotency key by inserting a 'reserving' placeholder
 * BEFORE starting a prediction. The UNIQUE index on idempotency_key means a simultaneous identical submit
 * loses the insert → returns false → the caller dedups instead of starting a 2nd run + double-charging.
 * Fails OPEN on a transient (non-conflict) error.
 */
export async function claimIdempotency(meta: JobMeta): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin().from("jobs").insert({
      idempotency_key: meta.idempotencyKey,
      user_id: meta.userId,
      fingerprint: meta.fingerprint,
      ip: meta.ip,
      status: "reserving",
      paid: meta.paid,
      est_cost_cents: meta.estCostCents,
    });
    if (error) return !/duplicate|unique|conflict/i.test(error.message); // unique conflict → dup; else fail open
    return true;
  } catch {
    return true; // fail open
  }
}

/** Drop a 'reserving' claim that never became a real run (a gate rejected, or the prediction failed to start). */
export async function failClaim(idempotencyKey: string): Promise<void> {
  try {
    await supabaseAdmin().from("jobs").delete().eq("idempotency_key", idempotencyKey).eq("status", "reserving");
  } catch (e) {
    console.warn("failClaim skipped:", (e as Error).message);
  }
}

export async function recordRunningJob(predictionId: string, meta: JobMeta): Promise<void> {
  try {
    const admin = supabaseAdmin();
    // Promote the 'reserving' claim row (from claimIdempotency) → running with the prediction id.
    const { data } = await admin
      .from("jobs")
      .update({ prediction_id: predictionId, status: "running", user_id: meta.userId, reservation_id: meta.reservationId ?? null, updated_at: new Date().toISOString() })
      .eq("idempotency_key", meta.idempotencyKey)
      .eq("status", "reserving")
      .select("id");
    if (!data?.length) {
      // No claim row (claim failed open) → insert directly so concurrency/billing still track this run.
      await admin.from("jobs").insert({
        prediction_id: predictionId,
        idempotency_key: meta.idempotencyKey,
        user_id: meta.userId,
        fingerprint: meta.fingerprint,
        ip: meta.ip,
        status: "running",
        paid: meta.paid,
        est_cost_cents: meta.estCostCents,
        reservation_id: meta.reservationId ?? null,
      });
    }
  } catch (e) {
    console.warn("recordRunningJob skipped:", (e as Error).message);
  }
}

/** Queue a job (over the concurrency cap). Returns the job id so the UI can poll/show "in queue". */
export async function enqueueJob(
  meta: JobMeta,
  input: Partial<PredictionInput>,
  webhookUrl: string | undefined,
): Promise<string | null> {
  try {
    const admin = supabaseAdmin();
    // Promote the 'reserving' claim row (from claimIdempotency) → queued.
    const upd = await admin
      .from("jobs")
      .update({ status: "queued", user_id: meta.userId, reservation_id: meta.reservationId ?? null, input, webhook_url: webhookUrl ?? null, updated_at: new Date().toISOString() })
      .eq("idempotency_key", meta.idempotencyKey)
      .eq("status", "reserving")
      .select("id");
    if (upd.data?.length) return (upd.data[0] as { id: string }).id;
    // No claim row (claim failed open) → insert directly.
    const { data, error } = await admin
      .from("jobs")
      .insert({
        idempotency_key: meta.idempotencyKey,
        user_id: meta.userId,
        fingerprint: meta.fingerprint,
        ip: meta.ip,
        status: "queued",
        paid: meta.paid,
        est_cost_cents: meta.estCostCents,
        reservation_id: meta.reservationId ?? null,
        input,
        webhook_url: webhookUrl ?? null,
      })
      .select("id")
      .limit(1);
    if (error || !data?.length) return null;
    return (data[0] as { id: string }).id;
  } catch (e) {
    console.warn("enqueueJob skipped:", (e as Error).message);
    return null;
  }
}

/**
 * Mark the job for a finished prediction terminal (called from the webhook). Transitions ATOMICALLY
 * (running/queued → done/failed) so a retried/duplicate webhook can't double-process (the callback's
 * minute billing keys off `delivered`, and only the first transition should bill).
 */
export async function markJobTerminal(predictionId: string, ok: boolean): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .from("jobs")
      .update({ status: ok ? "done" : "failed", updated_at: new Date().toISOString() })
      .eq("prediction_id", predictionId)
      .in("status", ["running", "queued"]) // guard: only the FIRST terminal webhook transitions it
      .select("id");
    return (data?.length ?? 0) > 0; // true only on the first transition
  } catch (e) {
    console.warn("markJobTerminal skipped:", (e as Error).message);
    return true; // fail-open: if the jobs table is unavailable, don't block billing
  }
}

/** Atomically claim the oldest queued job (flip queued→running). Returns it, or null if none/lost race. */
export async function claimNextQueued(): Promise<
  { id: string; input: Partial<PredictionInput>; webhook_url: string | null; reservation_id: string | null } | null
> {
  try {
    const { data: rows, error } = await supabaseAdmin()
      .from("jobs")
      .select("id,input,webhook_url,reservation_id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error || !rows?.length) return null;
    const row = rows[0] as { id: string; input: Partial<PredictionInput>; webhook_url: string | null; reservation_id: string | null };
    const { data: claimed } = await supabaseAdmin()
      .from("jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed?.length) return null; // another drainer won the race
    return row;
  } catch {
    return null;
  }
}

/** After a claimed queued job's prediction is created, attach its prediction id. */
export async function attachPredictionId(jobId: string, predictionId: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("jobs")
      .update({ prediction_id: predictionId, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (e) {
    console.warn("attachPredictionId skipped:", (e as Error).message);
  }
}

/** Mark a claimed job failed by its row id (e.g. its createPrediction threw during a drain). */
export async function failJob(jobId: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("jobs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (e) {
    console.warn("failJob skipped:", (e as Error).message);
  }
}

/** Persist the durable output blob URL on the job row (track library + share page lookup). */
export async function setJobOutputUrl(predictionId: string, outputUrl: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("jobs")
      .update({ output_url: outputUrl, updated_at: new Date().toISOString() })
      .eq("prediction_id", predictionId);
  } catch (e) {
    console.warn("setJobOutputUrl skipped:", (e as Error).message);
  }
}

/** A user's finished tracks, newest first (the dashboard "Your speeches" library). */
export async function listUserTracks(
  userId: string,
  limit = 50,
): Promise<Array<{ prediction_id: string | null; output_url: string | null; created_at: string; paid: boolean }>> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("jobs")
      .select("prediction_id,output_url,created_at,paid")
      .eq("user_id", userId)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as Array<{ prediction_id: string | null; output_url: string | null; created_at: string; paid: boolean }>;
  } catch {
    return [];
  }
}

/** Public share-page lookup: prediction id → durable output URL (only finished tracks resolve). */
export async function getTrackByPredictionId(
  predictionId: string,
): Promise<{ output_url: string | null } | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("jobs")
      .select("output_url")
      .eq("prediction_id", predictionId)
      .eq("status", "done")
      .limit(1);
    if (error || !data?.length) return null;
    return data[0] as { output_url: string | null };
  } catch {
    return null;
  }
}

/** Look up a job by its row id (for the queued-job status poll). */
export async function getJobById(
  jobId: string,
): Promise<{ status: string; prediction_id: string | null } | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("jobs")
      .select("status,prediction_id")
      .eq("id", jobId)
      .limit(1);
    if (error || !data?.length) return null;
    return data[0] as { status: string; prediction_id: string | null };
  } catch {
    return null;
  }
}

/** Email the founder when the budget guard trips. Best-effort. */
export async function sendBudgetAlert(reason: string): Promise<void> {
  try {
    const to = process.env.ADMIN_ALERT_EMAIL;
    if (!to || !process.env.RESEND_API_KEY) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL || "Roar Bliss <onboarding@resend.dev>";
    await resend.emails.send({
      from,
      to,
      subject: "⚠️ Roar Bliss budget guard tripped",
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px"><h2 style="color:#D6A84F">Budget guard tripped</h2><p>${reason}</p><p style="color:#888;font-size:13px">Further runs are being blocked until the daily window resets or you raise the limit (MAX_RUNS_PER_DAY / MAX_SPEND_USD_PER_DAY).</p></div>`,
    });
  } catch (e) {
    console.warn("sendBudgetAlert skipped:", (e as Error).message);
  }
}

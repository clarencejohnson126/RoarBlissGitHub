/**
 * Queue drain — promotes queued jobs to running whenever a concurrency slot is free. Called from the
 * replicate-callback webhook (a run just finished) and from the /api/jobs/drain cron (safety net for
 * missed webhooks). Server-only: re-injects the per-prediction secrets that were stripped before the
 * job's input was persisted.
 */
import { cancelPrediction, createPrediction, getPrediction, outputUrl, type PredictionInput } from "./replicate";
import { claimNextQueued, attachPredictionId, failJob, countInFlight, limits, markJobTerminal } from "./scale-guard";
import {
  linkReservation,
  releaseReservationById,
  relinkFreeUsage,
  supabaseAdmin,
  chargeReservation,
  releaseReservation,
  clearFreeUsageForPrediction,
} from "./supabase-admin";

function secrets() {
  return {
    anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
    hf_token: process.env.HF_TOKEN || "",
    replicate_api_token: process.env.REPLICATE_API_TOKEN || "",
    blob_token: process.env.BLOB_READ_WRITE_TOKEN || "",
    elevenlabs_api_key: process.env.ELEVENLABS_API_KEY || "",
  };
}

/** Start queued jobs until the concurrency cap is reached or the queue is empty. Returns # started. */
export async function drainQueue(): Promise<number> {
  const { maxConcurrency } = limits();
  let started = 0;
  for (let guard = 0; guard < 100; guard++) {
    if ((await countInFlight()) >= maxConcurrency) break;
    const job = await claimNextQueued(); // atomically flips the oldest queued → running
    if (!job) break;
    try {
      const input = { ...(job.input as Partial<PredictionInput>), ...secrets() } as PredictionInput;
      const pred = await createPrediction(input, job.webhook_url || undefined);
      await attachPredictionId(job.id, pred.id);
      if (job.reservation_id) {
        // Unlinked reservation = a delivery we can never charge. Retry once, then abort the run.
        const linked =
          (await linkReservation(job.reservation_id, pred.id)) ||
          (await linkReservation(job.reservation_id, pred.id));
        if (!linked) {
          await cancelPrediction(pred.id).catch((err) => console.error("drain: cancel after link-failure failed:", err));
          throw new Error(`drain: could not link reservation ${job.reservation_id} → ${pred.id}`);
        }
      }
      await relinkFreeUsage(job.id, pred.id); // B14: re-key a queued free run's usage to the real prediction id
      started++;
    } catch (e) {
      console.error("drainQueue: failed to start job", job.id, e);
      await failJob(job.id); // never let a bad job wedge the queue (it's claimed 'running')
      if (job.reservation_id) await releaseReservationById(job.reservation_id); // never started → release the hold
      await clearFreeUsageForPrediction(job.id); // a queued FREE run that never started must refund the free try
    }
  }
  return started;
}

/**
 * Recover jobs stuck in 'running' because their terminal webhook never arrived (Replicate's retries
 * are finite, and a stuck job holds a concurrency slot + a minute reservation FOREVER — with
 * MAX_CONCURRENCY=3, three lost webhooks would wedge the whole service). For every running job older
 * than `maxAgeMin`, ask Replicate for the prediction's real state and run the same terminal logic the
 * webhook would have (charge / release / refund the free try). Called from the per-minute drain cron.
 */
export async function reconcileStuckRunning(maxAgeMin = 30): Promise<number> {
  let reconciled = 0;
  try {
    const cutoff = new Date(Date.now() - maxAgeMin * 60_000).toISOString();
    const { data, error } = await supabaseAdmin()
      .from("jobs")
      .select("id,prediction_id,reservation_id,paid")
      .eq("status", "running")
      .lt("updated_at", cutoff)
      .limit(20);
    if (error || !data?.length) return 0;
    for (const job of data as Array<{ id: string; prediction_id: string | null; reservation_id: string | null; paid: boolean }>) {
      try {
        if (!job.prediction_id) {
          // Claimed 'running' but no prediction was ever created (a drain died mid-start) → fail + refund.
          await failJob(job.id);
          if (job.reservation_id) await releaseReservationById(job.reservation_id);
          reconciled++;
          continue;
        }
        const pred = await getPrediction(job.prediction_id);
        if (pred.status === "succeeded" || pred.status === "failed" || pred.status === "canceled") {
          const delivered = pred.status === "succeeded" && !!outputUrl(pred);
          await markJobTerminal(job.prediction_id, delivered); // frees the concurrency slot
          if (delivered) {
            await chargeReservation(job.prediction_id, job.paid === true);
          } else {
            await releaseReservation(job.prediction_id);
            await clearFreeUsageForPrediction(job.prediction_id);
          }
          reconciled++;
        }
        // Still genuinely processing on Replicate → the slot is legitimately occupied; leave it.
      } catch (e) {
        console.warn("reconcileStuckRunning: job", job.id, "skipped —", (e as Error).message);
      }
    }
  } catch (e) {
    console.warn("reconcileStuckRunning skipped:", (e as Error).message);
  }
  return reconciled;
}

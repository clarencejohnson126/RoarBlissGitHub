/**
 * Queue drain — promotes queued jobs to running whenever a concurrency slot is free. Called from the
 * replicate-callback webhook (a run just finished) and from the /api/jobs/drain cron (safety net for
 * missed webhooks). Server-only: re-injects the per-prediction secrets that were stripped before the
 * job's input was persisted.
 */
import { createPrediction, type PredictionInput } from "./replicate";
import { claimNextQueued, attachPredictionId, failJob, countInFlight, limits } from "./scale-guard";
import { linkReservation, releaseReservationById, relinkFreeUsage } from "./supabase-admin";

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
      if (job.reservation_id) await linkReservation(job.reservation_id, pred.id); // delivery/failure resolves it
      await relinkFreeUsage(job.id, pred.id); // B14: re-key a queued free run's usage to the real prediction id
      started++;
    } catch (e) {
      console.error("drainQueue: failed to start job", job.id, e);
      await failJob(job.id); // never let a bad job wedge the queue (it's claimed 'running')
      if (job.reservation_id) await releaseReservationById(job.reservation_id); // never started → release the hold
    }
  }
  return started;
}

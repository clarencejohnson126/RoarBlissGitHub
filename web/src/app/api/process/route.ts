import { NextResponse } from "next/server";
import { cancelPrediction, createPrediction, type PredictionInput } from "@/lib/replicate";
import { baseUrl } from "@/lib/base-url";
import { verifyUser, tierState, reserveMinutes, linkReservation, releaseReservationById, freeUsageExists, claimFreeUsage, clearFreeUsageForPrediction, relinkFreeUsage } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";
import {
  limits,
  estimateCostCents,
  idempotencyKey,
  findByIdempotencyKey,
  runsAndSpendToday,
  runsForUserToday,
  countInFlight,
  recordRunningJob,
  enqueueJob,
  claimIdempotency,
  failClaim,
  stripSecrets,
  sendBudgetAlert,
} from "@/lib/scale-guard";

/**
 * POST /api/process  — starts a cloud personalization run.
 *
 * Body (JSON): { audioUrl?, name, battlefield, struggle, family, location, champion, email?, paid? }
 *  - audioUrl: the Vercel Blob URL the browser already uploaded to (see /api/blob-upload).
 *              Omitted → the preloaded /public track is used.
 *
 * The heavy pipeline (Demucs → Whisper → pyannote → Sonnet planner → TTS → ffmpeg) runs as one
 * Replicate model, scale-to-zero. We return the prediction id; the client polls /api/process/status.
 * Tier caps (free ≤45s & locked to 75% / paid ≤6min & any tier) are enforced inside the model itself.
 */
export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const {
      audioUrl,
      name,
      battlefield,
      struggle,
      family,
      location,
      champion,
      email,
      paid,
      personalization,
      language,
      prompt,
      tone,
      deviceId,
      durationSec,
    } = (data ?? {}) as Record<string, unknown>;

    // Device + IP identity for the free-tier abuse gate (1 free track per device/IP). Sanitize both
    // to safe charsets — they flow into a PostgREST .or() filter, so strip anything that isn't a
    // plain id/ip character to avoid filter injection.
    const fingerprint =
      typeof deviceId === "string" ? deviceId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) : "";
    // Prefer x-real-ip: Vercel sets it to the actual client IP, so it can't be spoofed. The first
    // x-forwarded-for entry is CLIENT-controlled (header spoofing = unlimited free tracks) — it's
    // only the local-dev fallback where no trusted proxy header exists.
    const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "")
      .split(",")[0]
      .trim()
      .replace(/[^0-9a-fA-F:.]/g, "")
      .slice(0, 45);

    // Core feature 1: the 4-tier selector. Accept 25/50/75/100; anything else falls back to 50.
    // The free tier is locked to 75% (and ≤45s in the cog) so the listener identifies immediately —
    // the tier selector only takes effect once paid. The cog enforces this too (defence in depth).
    const requestedTier = [25, 50, 75, 100].includes(Number(personalization))
      ? (Number(personalization) as 25 | 50 | 75 | 100)
      : 50;

    const base = baseUrl(request);
    const audio =
      typeof audioUrl === "string" && audioUrl.startsWith("http")
        ? audioUrl
        : `${base}/preloaded.mp3`; // public fallback track (Replicate fetches it by URL)

    const lim = limits();
    const estCostCents = estimateCostCents(paid === true, requestedTier);
    // Local dev / staging escape hatch for repeated testing. Hard-disabled in production builds so
    // an accidentally mirrored env var can never switch the abuse gate off in prod.
    const freeGateOff = process.env.DISABLE_FREE_GATE === "1" && process.env.NODE_ENV !== "production";

    // Idempotency: a recent identical submit (double-click, retry) reuses the same run instead of
    // starting — and crucially, before any credit is consumed or a prediction is started.
    const idemKey = idempotencyKey([fingerprint || ip, audio, battlefield, prompt, paid, requestedTier, name]);
    const dup = await findByIdempotencyKey(idemKey);
    if (dup?.prediction_id) {
      return NextResponse.json({ id: dup.prediction_id, status: dup.status === "done" ? "succeeded" : "processing", dedup: true });
    }

    // Spend-cap / budget guard — checked BEFORE consuming a credit so a blocked run costs nothing.
    // FAILS CLOSED: if we can't read today's spend (null), reject rather than risk unbounded spend.
    const spend = await runsAndSpendToday();
    if (!spend) {
      return NextResponse.json(
        { error: "We're temporarily unavailable — please try again in a moment.", unavailable: true },
        { status: 503 },
      );
    }
    const { runs, cents } = spend;
    if (runs >= lim.maxRunsPerDay || cents >= lim.maxSpendCentsPerDay) {
      await sendBudgetAlert(
        `Daily cap reached: ${runs}/${lim.maxRunsPerDay} runs, $${(cents / 100).toFixed(2)}/$${(lim.maxSpendCentsPerDay / 100).toFixed(0)}.`,
      );
      return NextResponse.json(
        { error: "We've hit today's capacity. Please try again a little later — we'll be back shortly.", budgetReached: true },
        { status: 429 },
      );
    }
    if ((await runsForUserToday(null, fingerprint)) >= lim.maxRunsPerUserPerDay) {
      return NextResponse.json(
        { error: "You've reached today's limit on this device. Please come back tomorrow.", userLimitReached: true },
        { status: 429 },
      );
    }

    // Paid (up to 6 min) requires a signed-in user with a credit; we consume one here. Free (≤60s)
    // needs no auth. The cog hard-caps the window either way, so this is the billing gate, not the cap.
    let paidGranted = false;
    let jobUserId: string | null = null;
    let runMinutes = 0;
    let reservationId: string | null = null;
    // SERVER-AUTHORITATIVE paid detection. Do NOT trust the client `paid` flag — composePayload hardcoded it
    // to false, which dropped PAYING users into the free-device gate (the deadliest bug). Rule: anyone signed
    // in with an ACTIVE plan runs the paid path (bill minutes, skip the free gate), regardless of the client
    // flag. A signed-in user with NO plan and anonymous visitors fall through to the free 45s gate. The client
    // `paid` flag now only nudges un-entitled users who explicitly asked to pay.
    const user = await verifyUser(bearerToken(request));
    if (user) {
      const { tier, allowance, periodEnd } = tierState(user);
      if (tier) {
        // Active plan → paid run. Minutes cost = upload runtime capped at the 6-min output (unknown → cap).
        const dur = Number(durationSec);
        runMinutes = Math.round((Math.min(dur > 0 ? dur : 360, 360) / 60) * 100) / 100;
        // ATOMIC reserve (per-user lock + allowance check in the DB). Minutes count now, charged on delivery.
        reservationId = await reserveMinutes(user.id, runMinutes, periodEnd, allowance);
        if (!reservationId) {
          return NextResponse.json(
            { error: `You've used all ${allowance} minutes for this month — they reset on your renewal date.`, needsPurchase: true, outOfMinutes: true },
            { status: 402 },
          );
        }
        paidGranted = true;
        jobUserId = user.id;
      } else if (paid === true) {
        return NextResponse.json({ error: "Pick a plan to unlock 6-minute tracks.", needsPurchase: true }, { status: 402 });
      }
      // signed-in but no active plan (and not an explicit paid request) → free 45s gate below.
    } else if (paid === true) {
      return NextResponse.json(
        { error: "Sign in and pick a plan to unlock paid (6-min) tracks.", needsAuth: true },
        { status: 401 },
      );
    }

    // No anonymous-identity free runs: without a device fingerprint OR an IP we can't enforce the
    // 1-free-per-device gate, so reject rather than hand out unlimited free tracks (Replicate spend).
    if (!paidGranted && !freeGateOff && !fingerprint?.trim() && !ip?.trim()) {
      return NextResponse.json({ error: "Could not verify your device. Please try again." }, { status: 400 });
    }

    // Free-tier abuse gate: one free track per device fingerprint OR IP. Generation needs no login
    // (that's the hook); the gate only stops the same device/IP from minting unlimited free tracks.
    // Paid runs skip this entirely. Fails open if the free_usage table isn't provisioned yet.
    if (!paidGranted && !freeGateOff && (await freeUsageExists(fingerprint, ip))) {
      return NextResponse.json(
        {
          error: "Your free track is used up. Register and grab a pack to make more.",
          freeLimitReached: true,
          needsPurchase: true,
        },
        { status: 402 },
      );
    }

    const input: PredictionInput = {
      audio,
      name: (name as string) || "Warrior",
      battlefield: (battlefield as string) || "",
      struggle: (struggle as string) || "",
      family: (family as string) || "",
      location: (location as string) || "",
      champion: (champion as string) || "",
      paid: paidGranted,
      // THE engine. Must be explicit: the cog's "auto" default resolves to ElevenLabs whenever its
      // key is present, silently bypassing the in-cog OmniVoice engine we actually ship.
      tts_provider: "omnivoice",
      // Honor the chosen tier on BOTH free + paid so the preview reflects exactly what was picked
      // (25/50/75 = that share of the timeline; 100 = full rewrite). Free stays bounded by the 45s cap
      // + the 1-free-per-device gate — not by a forced tier.
      personalization: requestedTier,
      language: (typeof language === "string" && language.trim()) || "English",
      // Core feature 3 — EITHER a free-form prompt OR a one-click tone/template (both optional).
      prompt: typeof prompt === "string" ? prompt.slice(0, 2000) : "",
      tone: typeof tone === "string" ? tone.slice(0, 60) : "",
      // Secrets travel as Cog Secret inputs (Replicate has no model-level env). Server-side env only.
      anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
      hf_token: process.env.HF_TOKEN || "",
      replicate_api_token: process.env.REPLICATE_API_TOKEN || "",
      blob_token: process.env.BLOB_READ_WRITE_TOKEN || "",
      // When ELEVENLABS_API_KEY is configured, the cog auto-switches to ElevenLabs (better timbre).
      elevenlabs_api_key: process.env.ELEVENLABS_API_KEY || "",
    };

    // Replicate requires an https webhook. On https deployments we attach one so we can email the
    // user when they've navigated away; on http (local dev) we skip it and rely on client polling.
    // Replicate requires an https webhook (prod). The callback charges/releases the reservation by
    // prediction_id, so no billing data needs to ride in the URL.
    const emailQ = typeof email === "string" && email ? `?email=${encodeURIComponent(email)}` : "";
    const webhook = `${base}/api/replicate-callback${emailQ}`;
    const httpsWebhook = webhook.startsWith("https://") ? webhook : undefined;
    if (paidGranted && !httpsWebhook) {
      console.warn("[billing] paid run started WITHOUT an https webhook — minutes won't auto-bill:", base);
    }
    const meta = { idempotencyKey: idemKey, userId: jobUserId, fingerprint, ip, paid: paidGranted, estCostCents, reservationId };

    // #6: atomically claim the idempotency key BEFORE starting. A simultaneous identical submit (double-
    // click) loses the claim → it's deduped here (no 2nd prediction, no double charge); the loser releases
    // the minutes it reserved a moment ago.
    if (!(await claimIdempotency(meta))) {
      if (reservationId) await releaseReservationById(reservationId);
      const dup2 = await findByIdempotencyKey(idemKey);
      return NextResponse.json({ id: dup2?.prediction_id ?? null, status: "processing", dedup: true });
    }

    // ATOMIC free-gate claim — BEFORE anything starts. freeUsageExists above is only the friendly
    // early check; this insert (vs the unique indexes on free_usage) is the arbiter, so parallel
    // first-requests from one device/IP can no longer each mint a free GPU run. Keyed by idemKey and
    // re-keyed to the job/prediction id below so a failed run still refunds the free try.
    if (!paidGranted && !freeGateOff) {
      if (!(await claimFreeUsage(fingerprint, ip, idemKey))) {
        await failClaim(idemKey);
        return NextResponse.json(
          { error: "Your free track is used up. Register and grab a pack to make more.", freeLimitReached: true, needsPurchase: true },
          { status: 402 },
        );
      }
    }

    // Concurrency / backpressure: over the cap → queue. The reservation already holds the minutes; the
    // drain links it to the prediction once a slot frees.
    if ((await countInFlight()) >= lim.maxConcurrency) {
      const jobId = await enqueueJob(meta, stripSecrets(input), httpsWebhook);
      if (!jobId) {
        await failClaim(idemKey); // couldn't queue → drop the claim row + the minute hold + the free claim
        if (reservationId) await releaseReservationById(reservationId);
        if (!paidGranted && !freeGateOff) await clearFreeUsageForPrediction(idemKey);
        return NextResponse.json(
          { error: "We're at capacity and couldn't queue your track — please try again.", unavailable: true },
          { status: 503 },
        );
      }
      // Re-key the free claim to the job id (the drain re-keys it to the prediction id on start).
      if (!paidGranted && !freeGateOff) await relinkFreeUsage(idemKey, jobId);
      return NextResponse.json({ id: jobId, status: "queued", queued: true });
    }

    let pred;
    try {
      pred = await createPrediction(input, httpsWebhook);
    } catch (e) {
      await failClaim(idemKey); // run never started → drop the claim row
      if (reservationId) await releaseReservationById(reservationId); // release the hold
      if (!paidGranted && !freeGateOff) await clearFreeUsageForPrediction(idemKey); // refund the free try
      throw e;
    }
    if (reservationId) {
      // The delivery webhook charges by prediction_id — an unlinked reservation = a run we can never
      // bill. Retry once; if the link still doesn't land, abort the run rather than deliver unbilled.
      const linked =
        (await linkReservation(reservationId, pred.id)) || (await linkReservation(reservationId, pred.id));
      if (!linked) {
        await cancelPrediction(pred.id).catch((e) => console.error("cancel after link-failure failed:", e));
        await failClaim(idemKey);
        await releaseReservationById(reservationId);
        return NextResponse.json(
          { error: "We couldn't start your track safely — please try again in a moment.", unavailable: true },
          { status: 503 },
        );
      }
    }
    await recordRunningJob(pred.id, meta);

    // Re-key the free claim to the real prediction id so a failed run refunds the free try.
    if (!paidGranted && !freeGateOff) await relinkFreeUsage(idemKey, pred.id);

    return NextResponse.json({ id: pred.id, status: pred.status });
  } catch (e) {
    console.error("Process API route error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Failed to start personalization." },
      { status: 500 },
    );
  }
}

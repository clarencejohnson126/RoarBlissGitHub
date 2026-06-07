import { NextResponse } from "next/server";
import { createPrediction, type PredictionInput } from "@/lib/replicate";
import { baseUrl } from "@/lib/base-url";
import { verifyUser, paidCredits, consumeCredit, freeUsageExists, recordFreeUsage } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

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
    } = (data ?? {}) as Record<string, unknown>;

    // Device + IP identity for the free-tier abuse gate (1 free track per device/IP). Sanitize both
    // to safe charsets — they flow into a PostgREST .or() filter, so strip anything that isn't a
    // plain id/ip character to avoid filter injection.
    const fingerprint =
      typeof deviceId === "string" ? deviceId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) : "";
    const ip = (request.headers.get("x-forwarded-for") || "")
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

    // Paid (up to 6 min) requires a signed-in user with a credit; we consume one here. Free (≤60s)
    // needs no auth. The cog hard-caps the window either way, so this is the billing gate, not the cap.
    let paidGranted = false;
    if (paid === true) {
      const user = await verifyUser(bearerToken(request));
      if (!user) {
        return NextResponse.json(
          { error: "Sign in and buy credits to unlock paid (6-min) tracks.", needsAuth: true },
          { status: 401 },
        );
      }
      if (paidCredits(user) <= 0) {
        return NextResponse.json(
          { error: "No credits left — buy a pack to unlock 6-min tracks.", needsPurchase: true },
          { status: 402 },
        );
      }
      if (!(await consumeCredit(user.id))) {
        return NextResponse.json(
          { error: "No credits left.", needsPurchase: true },
          { status: 402 },
        );
      }
      paidGranted = true;
    }

    // Free-tier abuse gate: one free track per device fingerprint OR IP. Generation needs no login
    // (that's the hook); the gate only stops the same device/IP from minting unlimited free tracks.
    // Paid runs skip this entirely. Fails open if the free_usage table isn't provisioned yet.
    if (!paidGranted && (await freeUsageExists(fingerprint, ip))) {
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
      personalization: paidGranted ? requestedTier : 75,
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
    const emailQ = typeof email === "string" && email ? `?email=${encodeURIComponent(email)}` : "";
    const webhook = `${base}/api/replicate-callback${emailQ}`;
    const pred = await createPrediction(input, webhook.startsWith("https://") ? webhook : undefined);

    // Burn this device/IP's one free track only once the prediction actually started.
    if (!paidGranted) await recordFreeUsage(fingerprint, ip, pred.id);

    return NextResponse.json({ id: pred.id, status: pred.status });
  } catch (e) {
    console.error("Process API route error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Failed to start personalization." },
      { status: 500 },
    );
  }
}

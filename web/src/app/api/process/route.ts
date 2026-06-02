import { NextResponse } from "next/server";
import { createPrediction, type PredictionInput } from "@/lib/replicate";
import { baseUrl } from "@/lib/base-url";

/**
 * POST /api/process  — starts a cloud personalization run.
 *
 * Body (JSON): { audioUrl?, name, battlefield, struggle, family, location, champion, email?, paid? }
 *  - audioUrl: the Vercel Blob URL the browser already uploaded to (see /api/blob-upload).
 *              Omitted → the preloaded /public track is used.
 *
 * The heavy pipeline (Demucs → Whisper → pyannote → Sonnet planner → TTS → ffmpeg) runs as one
 * Replicate model, scale-to-zero. We return the prediction id; the client polls /api/process/status.
 * Tier caps (free ≤60s / paid ≤6min) are enforced inside the model itself.
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
    } = (data ?? {}) as Record<string, unknown>;

    const base = baseUrl(request);
    const audio =
      typeof audioUrl === "string" && audioUrl.startsWith("http")
        ? audioUrl
        : `${base}/preloaded.mp3`; // public fallback track (Replicate fetches it by URL)

    const input: PredictionInput = {
      audio,
      name: (name as string) || "Warrior",
      battlefield: (battlefield as string) || "",
      struggle: (struggle as string) || "",
      family: (family as string) || "",
      location: (location as string) || "",
      champion: (champion as string) || "",
      paid: paid === true,
    };

    // Replicate requires an https webhook. On https deployments we attach one so we can email the
    // user when they've navigated away; on http (local dev) we skip it and rely on client polling.
    const emailQ = typeof email === "string" && email ? `?email=${encodeURIComponent(email)}` : "";
    const webhook = `${base}/api/replicate-callback${emailQ}`;
    const pred = await createPrediction(input, webhook.startsWith("https://") ? webhook : undefined);

    return NextResponse.json({ id: pred.id, status: pred.status });
  } catch (e) {
    console.error("Process API route error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Failed to start personalization." },
      { status: 500 },
    );
  }
}

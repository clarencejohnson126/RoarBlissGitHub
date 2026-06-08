import { NextResponse } from "next/server";
import { getPrediction } from "@/lib/replicate";
import { getJobById } from "@/lib/scale-guard";

/**
 * GET /api/process/status?id=<predictionId>           — poll a running prediction
 * GET /api/process/status?id=<jobId>&job=1            — poll a QUEUED job (resolves to its prediction
 *                                                        once the drain promotes it; "queued" until then)
 *
 * Proxies the live Replicate state (status + streamed logs) so the client renders a real progress
 * console without ever seeing the Replicate token.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || searchParams.get("sessionId");
  const isJob = searchParams.get("job") === "1";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Queued-job poll: resolve the job to its prediction (or report "queued" until a slot frees).
  let predictionId = id;
  if (isJob) {
    const job = await getJobById(id);
    if (!job || job.status === "queued" || !job.prediction_id) {
      return NextResponse.json({
        id,
        status: "processing",
        queued: true,
        message: "You're in the queue — your run starts the moment a slot frees up. We'll email you when it's ready.",
      });
    }
    if (job.status === "failed") {
      return NextResponse.json({ id, status: "failed", error: "Run failed.", message: "Pipeline failed — try again." });
    }
    predictionId = job.prediction_id;
  }

  try {
    const p = await getPrediction(predictionId);
    const logs = (p.logs || "")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .slice(-40);

    if (p.status === "succeeded") {
      return NextResponse.json({
        id: predictionId,
        status: "done",
        output_url: `/api/audio?id=${predictionId}`,
        logs,
        message: "Personalized audio ready.",
      });
    }
    if (p.status === "failed" || p.status === "canceled") {
      return NextResponse.json({
        id: predictionId,
        status: "failed",
        error: p.error || "Prediction failed.",
        logs,
        message: "Pipeline failed — try again with different audio.",
      });
    }
    return NextResponse.json({
      id: predictionId,
      status: "processing",
      logs,
      message: "Processing — splitting stems, cloning the voice, mixing the track…",
    });
  } catch (e) {
    return NextResponse.json({ status: "error", error: (e as Error).message }, { status: 502 });
  }
}

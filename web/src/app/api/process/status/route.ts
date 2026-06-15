import { NextResponse } from "next/server";
import { getPrediction } from "@/lib/replicate";
import { getJobById, getJobByPredictionId } from "@/lib/scale-guard";
import { isQualityFailed } from "@/lib/scorecard";

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
      // DELIVERY GATE: Replicate `succeeded` only means the cog exited — NOT that the take is good
      // enough to ship. The cog's quality gate (dead-air / music-continuity battery) is the real
      // verdict. Consult the persisted job + the cog's [[SCORECARD]] line in the live logs (the latter
      // closes the webhook-vs-poll race). A gate-failed run is reported "failed" — never "done" — so the
      // result screen can never play a track the system itself rejected and refunded.
      const job = await getJobByPredictionId(predictionId);
      const qualityFailed = isQualityFailed(job?.scorecard, p.logs);
      if (qualityFailed || job?.status === "failed") {
        return NextResponse.json({
          id: predictionId,
          status: "failed",
          quality: qualityFailed,
          logs,
          error: qualityFailed ? "quality_gate" : "pipeline",
          message: qualityFailed
            ? "This take didn't pass our quality check, so we held it back — you weren't charged. Tap to generate it again."
            : "Pipeline failed — try again with different audio.",
        });
      }
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

import { NextResponse } from "next/server";
import { getJob, queuePositionAhead } from "@/lib/queue";

/**
 * GET /api/process/status?sessionId=sess_...
 *
 * Returns the current status of a queued/running/done/failed job, including
 * queue position when waiting and output URL when done.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const job = getJob(sessionId);
  if (!job) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const base: Record<string, unknown> = {
    sessionId,
    status: job.status,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
  };

  if (job.status === "queued") {
    const ahead = queuePositionAhead(sessionId);
    base.queue_position = ahead + 1;
    base.message = ahead === 0
      ? "Up next — about to start."
      : `You are #${ahead + 1} in line. (${ahead} ahead.)`;
  } else if (job.status === "running") {
    const elapsedS = Math.round((Date.now() - (job.started_at || Date.now())) / 1000);
    base.elapsed_s = elapsedS;
    base.message = `Processing — ${elapsedS}s elapsed (typical: ~5-7 min).`;
  } else if (job.status === "done") {
    base.output_url = `/output/${sessionId}_full.mp3`;
    base.preview_url = `/output/${sessionId}_preview.mp3`;
    base.message = "Personalized audio ready.";
  } else if (job.status === "failed") {
    base.error = job.error;
    base.message = "Pipeline failed — check the logs or try again.";
  }

  return NextResponse.json(base);
}

import { NextResponse } from "next/server";
import { getPrediction } from "@/lib/replicate";

/**
 * GET /api/process/status?id=<predictionId>
 *
 * Proxies the live Replicate prediction state (status + streamed logs) so the client can render a
 * real progress console without ever seeing the Replicate token.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || searchParams.get("sessionId");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const p = await getPrediction(id);
    const logs = (p.logs || "")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .slice(-40);

    if (p.status === "succeeded") {
      return NextResponse.json({
        id,
        status: "done",
        output_url: `/api/audio?id=${id}`,
        logs,
        message: "Personalized audio ready.",
      });
    }
    if (p.status === "failed" || p.status === "canceled") {
      return NextResponse.json({
        id,
        status: "failed",
        error: p.error || "Prediction failed.",
        logs,
        message: "Pipeline failed — try again with different audio.",
      });
    }
    return NextResponse.json({
      id,
      status: "processing",
      logs,
      message: "Processing — splitting stems, cloning the voice, mixing the track…",
    });
  } catch (e) {
    return NextResponse.json({ status: "error", error: (e as Error).message }, { status: 502 });
  }
}

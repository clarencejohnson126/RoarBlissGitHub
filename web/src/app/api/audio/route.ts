import { getPrediction, outputUrl } from "@/lib/replicate";
import { verifyUser } from "@/lib/supabase-admin";
import { getJobByPredictionId } from "@/lib/scale-guard";
import { isQualityFailed } from "@/lib/scorecard";

/**
 * GET /api/audio?id=<predictionId>[&download=1]
 *
 * Streams the finished MP3 from Replicate back to the browser SAME-ORIGIN (so the Web Audio
 * visualizer can analyse it without CORS tainting, and the Replicate URL stays hidden). Forwards
 * Range headers so the <audio> element can seek.
 *
 * Playback (inline) is open — free users must be able to HEAR their track (the conversion hook).
 * `download=1` returns the file as an attachment and REQUIRES a signed-in user (Bearer token):
 * keeping the original file is the gated action that drives registration.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return new Response("id required", { status: 400 });

  // Download is gated behind login; playback stays open.
  const isDownload = searchParams.get("download") === "1";
  if (isDownload) {
    const auth = request.headers.get("authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
    if (!(await verifyUser(token))) {
      return new Response("login required to download", { status: 401 });
    }
  }

  let url: string | null = null;
  try {
    const p = await getPrediction(id);
    if (p.status !== "succeeded") return new Response("not ready", { status: 409 });
    // DELIVERY GATE: never stream a take that failed the cog's quality gate (dead-air etc.), even though
    // Replicate reports `succeeded`. Mirrors /api/process/status so the player, the download and the
    // dashboard stream all refuse a rejected track. Fail-OPEN (only blocks on explicit passed===false).
    const job = await getJobByPredictionId(id);
    if (isQualityFailed(job?.scorecard, p.logs) || job?.status === "failed") {
      return new Response("this take didn't pass the quality check", { status: 409 });
    }
    url = outputUrl(p);
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
  if (!url) return new Response("no output", { status: 404 });

  const range = request.headers.get("range");
  const upstream = await fetch(url, { headers: range ? { Range: range } : {}, cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return new Response("upstream fetch failed", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") || "audio/mpeg");
  headers.set("Accept-Ranges", upstream.headers.get("Accept-Ranges") || "bytes");
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set(
    "Content-Disposition",
    `${isDownload ? "attachment" : "inline"}; filename="roar-bliss-${id}.mp3"`,
  );
  const cr = upstream.headers.get("Content-Range");
  if (cr) headers.set("Content-Range", cr);
  const cl = upstream.headers.get("Content-Length");
  if (cl) headers.set("Content-Length", cl);

  return new Response(upstream.body, { status: upstream.status, headers });
}

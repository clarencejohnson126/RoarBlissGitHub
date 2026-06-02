import { getPrediction, outputUrl } from "@/lib/replicate";

/**
 * GET /api/audio?id=<predictionId>
 *
 * Streams the finished MP3 from Replicate back to the browser SAME-ORIGIN (so the Web Audio
 * visualizer can analyse it without CORS tainting, and the Replicate URL stays hidden). Forwards
 * Range headers so the <audio> element can seek.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return new Response("id required", { status: 400 });

  let url: string | null = null;
  try {
    const p = await getPrediction(id);
    if (p.status !== "succeeded") return new Response("not ready", { status: 409 });
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
  headers.set("Content-Disposition", `inline; filename="roar-bliss-${id}.mp3"`);
  const cr = upstream.headers.get("Content-Range");
  if (cr) headers.set("Content-Range", cr);
  const cl = upstream.headers.get("Content-Length");
  if (cl) headers.set("Content-Length", cl);

  return new Response(upstream.body, { status: upstream.status, headers });
}

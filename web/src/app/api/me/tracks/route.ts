import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";
import { listUserTracks } from "@/lib/scale-guard";

/** GET /api/me/tracks — the signed-in user's finished tracks (dashboard library), newest first. */
export async function GET(request: Request) {
  const user = await verifyUser(bearerToken(request));
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const tracks = await listUserTracks(user.id);
  return NextResponse.json({
    tracks: tracks.map((t) => ({
      id: t.prediction_id,
      // Durable blob URL when we have it (post-0007 runs); otherwise the same-origin stream.
      url: t.output_url || (t.prediction_id ? `/api/audio?id=${t.prediction_id}` : null),
      createdAt: t.created_at,
      paid: t.paid,
      shareUrl: t.prediction_id ? `/t/${t.prediction_id}` : null,
    })).filter((t) => t.url),
  });
}

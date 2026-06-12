import { NextResponse } from "next/server";
import { supabaseAdmin, verifyUser } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/**
 * Community feed — users post a finished generation with a description.
 * GET    /api/community            → newest posts (public, no auth)
 * POST   /api/community            → { predictionId, comment } (auth; must own the finished job)
 * DELETE /api/community?id=<uuid>  → remove own post (auth)
 * Writes use the service role AFTER ownership validation; RLS keeps the table read-only publicly.
 */

const FEED_LIMIT = 60;

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("community_posts")
    .select("id,user_id,prediction_id,audio_url,display_name,comment,created_at")
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) return NextResponse.json({ error: "feed unavailable" }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(request: Request) {
  const user = await verifyUser(bearerToken(request));
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  let body: { predictionId?: string; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const predictionId = (body.predictionId || "").trim();
  const comment = (body.comment || "").trim();
  if (!/^[A-Za-z0-9]{10,40}$/.test(predictionId)) {
    return NextResponse.json({ error: "invalid track" }, { status: 400 });
  }
  if (comment.length < 1 || comment.length > 600) {
    return NextResponse.json({ error: "description must be 1–600 characters" }, { status: 400 });
  }

  // The post must reference the poster's OWN finished generation.
  const { data: jobs, error: jobErr } = await supabaseAdmin()
    .from("jobs")
    .select("output_url")
    .eq("prediction_id", predictionId)
    .eq("user_id", user.id)
    .eq("status", "done")
    .limit(1);
  if (jobErr || !jobs?.length) {
    return NextResponse.json({ error: "track not found or not yours" }, { status: 404 });
  }
  const audioUrl = jobs[0].output_url || `/api/audio?id=${predictionId}`;

  const { data: profile } = await supabaseAdmin()
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName =
    profile?.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    (user.email ? user.email.split("@")[0] : "A warrior");

  const { data: post, error: insErr } = await supabaseAdmin()
    .from("community_posts")
    .upsert(
      {
        user_id: user.id,
        prediction_id: predictionId,
        audio_url: audioUrl,
        display_name: displayName,
        comment,
      },
      { onConflict: "prediction_id" },
    )
    .select("id,prediction_id,audio_url,display_name,comment,created_at")
    .single();
  if (insErr || !post) return NextResponse.json({ error: "could not post" }, { status: 500 });
  return NextResponse.json({ post });
}

export async function DELETE(request: Request) {
  const user = await verifyUser(bearerToken(request));
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("community_posts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "could not delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

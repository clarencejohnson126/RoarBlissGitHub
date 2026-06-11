import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { verifyUser, supabaseAdmin } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/**
 * Voice favorites — a user explicitly saves a reference clip for one-click reuse.
 *
 * Privacy contract: uploads are normally deleted right after a run. Saving a voice is an explicit
 * OPT-IN that copies the clip into `voices/<userId>/` BEFORE the run's cleanup deletes the upload;
 * the user can delete it any time (and the blob goes with it).
 *
 *   GET    → list my voices
 *   POST   { audioUrl, name } → copy the blob into my voices and save the row
 *   DELETE ?id=<voiceId> → remove row + blob
 */

const MAX_VOICES_PER_USER = 10;

export async function GET(request: Request) {
  const user = await verifyUser(bearerToken(request));
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const { data } = await supabaseAdmin()
    .from("user_voices")
    .select("id,name,blob_url,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ voices: data ?? [] });
}

export async function POST(request: Request) {
  const user = await verifyUser(bearerToken(request));
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const { audioUrl, name } = (await request.json().catch(() => ({}))) as { audioUrl?: string; name?: string };
  if (typeof audioUrl !== "string" || !/^https:\/\/[^ ]*blob\.vercel-storage\.com\//.test(audioUrl)) {
    return NextResponse.json({ error: "audioUrl must be a Vercel Blob upload URL." }, { status: 400 });
  }
  const voiceName = (typeof name === "string" && name.trim().slice(0, 60)) || "My voice";

  const { count } = await supabaseAdmin()
    .from("user_voices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_VOICES_PER_USER) {
    return NextResponse.json({ error: `You can keep up to ${MAX_VOICES_PER_USER} voices — delete one first.` }, { status: 409 });
  }

  // Copy the upload into the user's voice library BEFORE the post-run cleanup deletes it.
  const src = await fetch(audioUrl);
  if (!src.ok) return NextResponse.json({ error: "Could not read the uploaded audio." }, { status: 400 });
  const buf = Buffer.from(await src.arrayBuffer());
  if (buf.length > 100 * 1024 * 1024) return NextResponse.json({ error: "File too large." }, { status: 413 });
  const blob = await put(`voices/${user.id}/${Date.now()}.mp3`, buf, {
    access: "public",
    addRandomSuffix: true,
    contentType: src.headers.get("content-type") || "audio/mpeg",
  });

  const { data, error } = await supabaseAdmin()
    .from("user_voices")
    .insert({ user_id: user.id, name: voiceName, blob_url: blob.url })
    .select("id,name,blob_url,created_at")
    .single();
  if (error) {
    await del(blob.url).catch(() => {});
    return NextResponse.json({ error: "Could not save the voice." }, { status: 500 });
  }
  return NextResponse.json({ voice: data });
}

export async function DELETE(request: Request) {
  const user = await verifyUser(bearerToken(request));
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data } = await supabaseAdmin()
    .from("user_voices")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id) // never delete another user's voice
    .select("blob_url");
  const url = (data?.[0] as { blob_url?: string } | undefined)?.blob_url;
  if (url) await del(url).catch(() => {});
  return NextResponse.json({ ok: true, deleted: !!data?.length });
}

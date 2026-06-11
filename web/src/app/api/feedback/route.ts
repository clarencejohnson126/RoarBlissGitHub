import { NextResponse } from "next/server";
import { supabaseAdmin, verifyUser, rateLimit } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/**
 * POST /api/feedback — PRIVATE user feedback on a generated track (never public; no testimonial wall).
 *
 * This is the learning loop's capture layer. The `tags` are a fixed vocabulary that maps each
 * complaint straight to an evaluator metric, so a complaint is a labeled training signal, not a vibe:
 *   voice_unclear  -> intelligibility / clone fidelity
 *   volume_uneven  -> loudness range / dropouts
 *   not_like_speaker -> clone fidelity
 *   wrong_words    -> coherence / intelligibility
 *   not_personal   -> personalization
 *   music_balance  -> voice-over-bed SNR
 *   loved_it       -> positive signal
 * Triage later joins each row to the run's stored scorecard: did the battery CATCH it (tighten the
 * self-correction) or MISS it (a new metric + a permanent regression case)?
 *
 * Body: { predictionId, rating?: 1..5, tags?: string[], comment?: string }
 */
const TAGS = new Set([
  "voice_unclear", "volume_uneven", "not_like_speaker", "wrong_words",
  "not_personal", "music_balance", "loved_it", "other",
]);

export async function POST(request: Request) {
  const { predictionId, rating, tags, comment } = (await request.json().catch(() => ({}))) as {
    predictionId?: string; rating?: unknown; tags?: unknown; comment?: unknown;
  };

  const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "")
    .split(",")[0].trim().replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45);
  if (!(await rateLimit(`fb:${ip || "anon"}`, 30, 3600))) {
    return NextResponse.json({ error: "Too many submissions — please try again later." }, { status: 429 });
  }

  const pid = typeof predictionId === "string" ? predictionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 64) : "";
  const r = Number(rating);
  const ratingClean = Number.isInteger(r) && r >= 1 && r <= 5 ? r : null;
  const tagsClean = Array.isArray(tags) ? tags.filter((t) => typeof t === "string" && TAGS.has(t)).slice(0, 8) : [];
  const commentClean = typeof comment === "string" && comment.trim() ? comment.trim().slice(0, 2000) : null;

  // Need a run to attach to, and at least one signal (rating, a tag, or a comment).
  if (!pid) return NextResponse.json({ error: "Missing track reference." }, { status: 400 });
  if (ratingClean === null && tagsClean.length === 0 && !commentClean) {
    return NextResponse.json({ error: "Add a rating, a tag, or a comment." }, { status: 400 });
  }

  const user = await verifyUser(bearerToken(request)); // optional — free users give feedback too
  try {
    await supabaseAdmin().from("feedback").insert({
      prediction_id: pid,
      user_id: user?.id ?? null,
      rating: ratingClean,
      tags: tagsClean,
      comment: commentClean,
      ip: ip || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn("feedback insert skipped:", (e as Error).message);
    // Never make the user feel their feedback failed — accept it best-effort.
    return NextResponse.json({ ok: true });
  }
}

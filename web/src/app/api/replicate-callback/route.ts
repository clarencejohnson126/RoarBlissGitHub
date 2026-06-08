import { NextResponse } from "next/server";
import { Resend } from "resend";
import { del, put } from "@vercel/blob";
import { outputUrl } from "@/lib/replicate";
import { baseUrl } from "@/lib/base-url";
import { markJobTerminal } from "@/lib/scale-guard";
import { clearFreeUsageForPrediction } from "@/lib/supabase-admin";
import { drainQueue } from "@/lib/drain";

/**
 * POST /api/replicate-callback?email=<addr>
 *
 * Replicate calls this when a prediction completes. We persist the output MP3 to Vercel Blob (so the
 * link is durable, not the ~1h Replicate URL) and email the user a link via Resend. Email is best
 * effort — if it isn't configured, the on-page player still works via /api/audio.
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || "";
    const payload = (await request.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      error?: string | null;
      output?: string | string[] | null;
      input?: { name?: string; audio?: string };
    };

    const id = payload.id || "";
    const status = payload.status || "";
    const name = payload.input?.name || "Warrior";
    const base = baseUrl(request);

    // A run only "delivered" if it succeeded AND produced an output file the user can actually play —
    // a succeeded-but-empty result counts as a non-delivery (so the credit gets refunded below).
    const produced = !!outputUrl({ output: payload.output ?? null });
    const delivered = status === "succeeded" && produced;

    // Durable copy of the result, so the email link never expires.
    let listen = id ? `${base}/api/audio?id=${id}` : base;
    if (status === "succeeded" && process.env.BLOB_READ_WRITE_TOKEN) {
      const src = outputUrl({ output: payload.output ?? null });
      if (src) {
        try {
          const audio = await fetch(src);
          if (audio.ok) {
            const buf = Buffer.from(await audio.arrayBuffer());
            const blob = await put(`outputs/${id}.mp3`, buf, {
              access: "public",
              addRandomSuffix: false,
              contentType: "audio/mpeg",
            });
            listen = blob.url;
          }
        } catch (e) {
          console.error("blob persist failed:", e);
        }
      }
    }

    if (email && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM_EMAIL || "Roar Bliss <onboarding@resend.dev>";
      if (delivered) {
        await resend.emails.send({
          from,
          to: email,
          subject: `Your personalized Roar Bliss track is ready, ${name}`,
          html: doneHtml(name, listen, base),
        });
      } else if (status === "failed" || status === "canceled" || status === "succeeded") {
        await resend.emails.send({
          from,
          to: email,
          subject: `Roar Bliss hit a snag with your track`,
          html: failHtml(name, String(payload.error || "")),
        });
      }
    }

    // Bookkeeping + backpressure: mark this run terminal and promote the next queued job, if any.
    if (id && (status === "succeeded" || status === "failed" || status === "canceled")) {
      // Marks terminal once + refunds the reserved credit if a PAID run didn't deliver a file.
      const settle = await markJobTerminal(id, delivered);
      if (settle.refunded) console.warn(`[credit] refunded 1 credit for non-delivered run ${id} (status=${status})`);
      // Free runs that didn't deliver: give the one free track back too (no-op for paid runs).
      if (!delivered) await clearFreeUsageForPrediction(id);
      try {
        await drainQueue();
      } catch (e) {
        console.error("drain after callback failed:", e);
      }

      // Privacy + storage: keep ONLY the finished output — delete the user's uploaded source now that
      // the run is done (it's already been processed/trimmed by the cog; we never persist the upload).
      const srcAudio = payload.input?.audio;
      if (srcAudio && /blob\.vercel-storage\.com/.test(srcAudio) && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await del(srcAudio);
        } catch (e) {
          console.error("input blob delete failed:", e);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("replicate-callback error:", e);
    // Ack with 200 regardless so Replicate doesn't retry-storm the webhook.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

function doneHtml(name: string, listen: string, base: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0c;color:#e6e6e8;border-radius:12px">
      <h2 style="color:#D6A84F;margin:0 0 16px">🎧 Your battle speech is ready.</h2>
      <p>Hey ${name}, we just finished creating your personalized motivational speech.</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${listen}" style="background:#D6A84F;color:#0a0a0c;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">▶  Listen now</a>
      </p>
      <p style="font-size:13px;color:#888;margin-top:32px">Built fresh from your audio + your story. The original tone and music are preserved, and your personalized moments are placed inside.</p>
      <p style="font-size:11px;color:#555;margin-top:24px">Roar Bliss • You received this because you started a session at <a href="${base}" style="color:#888">Roar Bliss</a>.</p>
    </div>`;
}

function failHtml(name: string, error: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0c;color:#e6e6e8;border-radius:12px">
      <h2 style="color:#ff6b6b;margin:0 0 16px">⚠️ Pipeline error</h2>
      <p>Hey ${name} — the personalization for your audio didn't complete this time.</p>
      <p style="font-family:monospace;background:#1a1a1d;padding:12px;border-radius:6px;font-size:12px">${error.substring(0, 200)}</p>
      <p style="margin-top:24px">Just try again with the same or different audio — it usually works on the next pass.</p>
    </div>`;
}

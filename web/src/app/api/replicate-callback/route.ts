import crypto from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { del, put } from "@vercel/blob";
import { outputUrl } from "@/lib/replicate";
import { baseUrl } from "@/lib/base-url";
import { markJobTerminal, setJobOutputUrl, setJobScorecard } from "@/lib/scale-guard";
import { chargeReservation, releaseReservation, clearFreeUsageForPrediction } from "@/lib/supabase-admin";
import { drainQueue, reconcileStuckRunning } from "@/lib/drain";
import { parseScorecard } from "@/lib/scorecard";

/**
 * POST /api/replicate-callback?email=<addr>
 *
 * Replicate calls this when a prediction completes. We persist the output MP3 to Vercel Blob (so the
 * link is durable, not the ~1h Replicate URL) and email the user a link via Resend. Email is best
 * effort — if it isn't configured, the on-page player still works via /api/audio.
 */
/**
 * Verify Replicate's webhook signature (svix scheme) over the RAW body. Without this, anyone who knows
 * a prediction id could POST status:"failed" to release a paid reservation (the run then delivers but
 * never bills), reset the free-device gate, or trigger blob deletes / emails. Fails CLOSED.
 */
function verifyReplicateWebhook(req: Request, rawBody: string): boolean {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!secret) return false; // no secret configured → reject (set REPLICATE_WEBHOOK_SECRET in prod)
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false; // 5-min replay window
  try {
    const keyB64 = secret.includes("_") ? secret.split("_")[1] : secret;
    const keyBytes = Buffer.from(keyB64, "base64");
    const expected = crypto.createHmac("sha256", keyBytes).update(`${id}.${ts}.${rawBody}`).digest("base64");
    const expBuf = Buffer.from(expected);
    return sigHeader.split(" ").some((part) => {
      const sig = part.split(",")[1];
      if (!sig) return false;
      const sigBuf = Buffer.from(sig);
      return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    });
  } catch {
    return false;
  }
}

// DELIVERY GATE — the cog scores the FINISHED file against its own source and prints one [[SCORECARD]]
// JSON line. A run whose `passed === false` is a non-delivery: refunded + a "retry" email, NEVER shipped.
// parseScorecard lives in @/lib/scorecard so this webhook AND the user-facing serve paths
// (/api/process/status, /api/audio) share ONE verdict and can never drift. Fail-OPEN: a missing/garbled
// scorecard never blocks a good run — we only block on an explicit `false`.

export async function POST(request: Request) {
  try {
    // SECURITY: verify the webhook signature over the RAW body BEFORE any billing/blob/email action.
    const raw = await request.text();
    if (!verifyReplicateWebhook(request, raw)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || "";
    let payload: {
      id?: string;
      status?: string;
      error?: string | null;
      output?: string | string[] | null;
      logs?: string | null;
      input?: { name?: string; audio?: string; paid?: boolean };
    } = {};
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      payload = {};
    }

    const id = payload.id || "";
    const status = payload.status || "";
    // User-controlled: strip header-injection chars (it lands in the email subject) and cap length.
    const name = (payload.input?.name || "Warrior").replace(/[\r\n<>]/g, "").slice(0, 60) || "Warrior";
    const base = baseUrl(request);

    // A run only "delivered" if it succeeded AND produced an output file the user can actually play —
    // a succeeded-but-empty result counts as a non-delivery (so the credit gets refunded below).
    const produced = !!outputUrl({ output: payload.output ?? null });

    // DELIVERY GATE (founder: 'eine fertige Datei muss geprüft werden, bevor es an den User geht'). The cog
    // measured the finished file against its own source and logged the verdict. A run that produced a file
    // but FAILED the quality gate is treated as a NON-delivery: refunded + sent the "retry" email, never
    // shipped. Fail-open — a missing scorecard never blocks delivery (we only block on an explicit `false`).
    const scorecard = parseScorecard(payload.logs || "");
    // BLOCK CORSET (founder, 2026-06-18): we accept ANY input mp3 — a poor result from a poor SOURCE is a
    // FAQ topic, not our block. Block ONLY on real OUTPUT catastrophes (DEAL-BREAKERS): empty/dead audio,
    // GIBBERISH speech, the loudness ROLLERCOASTER, degenerate/untranslated text. Cosmetic signal numbers
    // (clipping/0-dBFS peak, loudness, dropouts, hiss) are ADVISORY — they SHIP (logged, never blocked).
    const DEAL_BREAKERS = new Set(["content_present", "no_dead_air", "intelligibility", "no_swallowed_line",
      "music_stability", "music_continuity", "no_repetition", "full_replacement"]);
    const scFailures: string[] = Array.isArray(scorecard?.failures) ? (scorecard!.failures as string[]) : [];
    const qualityFailed = scFailures.some((f) => DEAL_BREAKERS.has(f));
    const delivered = status === "succeeded" && produced && !qualityFailed;
    if (qualityFailed) {
      console.warn(
        `[deliver-gate] BLOCKED delivery for ${id} — quality gate failed: ${JSON.stringify(scorecard?.failures)}`,
      );
    }

    const terminal = status === "succeeded" || status === "failed" || status === "canceled";

    // Capture the scorecard on the run (learning loop joins feedback to these numbers). Best-effort.
    if (id && scorecard) await setJobScorecard(id, scorecard);

    // Mark terminal ONCE. Side-effects (blob persist, email, drain, source delete) run only on this
    // first transition, so a Replicate RETRY (e.g. after a charge failure below) can't double-send the
    // email, re-delete the source, or re-drain.
    const firstTransition = id && terminal ? await markJobTerminal(id, delivered) : false;

    // Billing via the minute_ledger (idempotent on prediction_id — safe to retry). Delivered → charged;
    // failed/empty → released back to the allowance (+ free device gets its track back).
    let chargeOk = true;
    if (id && terminal) {
      if (delivered) {
        // A paid delivery MUST find its reservation — 0 matched rows there means an unbilled run.
        chargeOk = await chargeReservation(id, payload.input?.paid === true);
      } else {
        await releaseReservation(id);
        await clearFreeUsageForPrediction(id);
      }
    }

    if (firstTransition) {
      // Durable copy of the result so the email link never expires.
      let listen = id ? `${base}/api/audio?id=${id}` : base;
      if (delivered && process.env.BLOB_READ_WRITE_TOKEN) {
        const src = outputUrl({ output: payload.output ?? null });
        if (src) {
          try {
            const audio = await fetch(src);
            if (audio.ok) {
              const buf = Buffer.from(await audio.arrayBuffer());
              // addRandomSuffix: outputs are public blobs — without the suffix the URL is guessable
              // from a prediction id. The email uses blob.url directly, so the suffix costs nothing.
              const blob = await put(`outputs/${id}.mp3`, buf, { access: "public", addRandomSuffix: true, contentType: "audio/mpeg" });
              listen = blob.url;
              // Persist the durable URL on the job row — it powers the dashboard track library and
              // the public share page (/t/<id>); the random suffix makes it unrecoverable otherwise.
              await setJobOutputUrl(id, blob.url);
            }
          } catch (e) {
            console.error("blob persist failed:", e);
          }
        }
      }
      if (email && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = process.env.RESEND_FROM_EMAIL || "Roar Bliss <onboarding@resend.dev>";
        try {
          if (delivered) {
            await resend.emails.send({ from, to: email, subject: `Your personalized Roar Bliss track is ready, ${name}`, html: doneHtml(name, listen, base) });
          } else if (qualityFailed) {
            // The track rendered but failed our own quality gate — we'd rather not send it. No charge.
            await resend.emails.send({ from, to: email, subject: `We're re-rolling your Roar Bliss track`, html: qualityHtml(name, base) });
          } else {
            await resend.emails.send({ from, to: email, subject: `Roar Bliss hit a snag with your track`, html: failHtml(name, String(payload.error || "")) });
          }
        } catch (e) {
          console.error("email send failed:", e);
        }
      }
      try {
        // The webhook is the PRIMARY drain trigger (Vercel Hobby can't run per-minute crons — the
        // GitHub Actions drain-cron is the safety net). Reconcile stale 'running' jobs here too so a
        // lost webhook gets settled by the next finished run, not only by the external cron.
        await reconcileStuckRunning();
        await drainQueue();
      } catch (e) {
        console.error("drain after callback failed:", e);
      }
      // Privacy: keep ONLY the finished output — delete the user's uploaded source (never persisted).
      const srcAudio = payload.input?.audio;
      if (srcAudio && /blob\.vercel-storage\.com/.test(srcAudio) && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await del(srcAudio);
        } catch (e) {
          console.error("input blob delete failed:", e);
        }
      }
    }

    // A delivered run whose charge write FAILED → tell Replicate to retry the webhook. The charge is
    // idempotent and the first-transition side-effects won't repeat (markJobTerminal returns false next time).
    if (delivered && !chargeOk) {
      return NextResponse.json({ ok: false, retry: "charge_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("replicate-callback error:", e);
    // Ack with 200 regardless so Replicate doesn't retry-storm the webhook.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

/** Escape user-influenced strings before interpolating them into email HTML. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function doneHtml(name: string, listen: string, base: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0c;color:#e6e6e8;border-radius:12px">
      <h2 style="color:#D6A84F;margin:0 0 16px">🎧 Your battle speech is ready.</h2>
      <p>Hey ${esc(name)}, we just finished creating your personalized motivational speech.</p>
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
      <p>Hey ${esc(name)} — the personalization for your audio didn't complete this time.</p>
      <p style="font-family:monospace;background:#1a1a1d;padding:12px;border-radius:6px;font-size:12px">${esc(error.substring(0, 200))}</p>
      <p style="margin-top:24px">Just try again with the same or different audio — it usually works on the next pass.</p>
    </div>`;
}

// A run that finished but failed our OWN quality gate. The user was NOT charged. Honest, reassuring,
// and points them straight back to /create to regenerate.
function qualityHtml(name: string, base: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0c;color:#e6e6e8;border-radius:12px">
      <h2 style="color:#ffd166;margin:0 0 16px">🎚️ We held this one back</h2>
      <p>Hey ${esc(name)} — your track finished rendering, but it didn't pass our quality check, so we didn't send it. We're picky on purpose: the music has to stay rock-steady under your voice.</p>
      <p><strong>You weren't charged</strong> — your minutes (or your free track) are right back where they were.</p>
      <p style="margin-top:24px"><a href="${esc(base)}/create" style="background:#ffd166;color:#0a0a0c;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Generate it again →</a></p>
    </div>`;
}

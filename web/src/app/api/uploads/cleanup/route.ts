import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

/**
 * GET /api/uploads/cleanup — daily sweep (Vercel cron). The replicate-callback already deletes each
 * upload the moment its run finishes; this mops up ABANDONED uploads — someone uploaded a file but
 * never generated (so no webhook ever fired to clean it). Deletes `uploads/` blobs older than 24h.
 * Protected by CRON_SECRET (Vercel attaches it as a Bearer on cron calls); open in local dev.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron disabled (CRON_SECRET unset)" }, { status: 403 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: true, deleted: 0, note: "blob token unset" });
  }

  try {
    // Abandoned uploads: gone after 24h (each run's upload is already deleted by the webhook).
    const deleted = await sweep("uploads/", 24 * 60 * 60 * 1000);
    // Finished outputs: GDPR retention window (default 90 days, override via OUTPUT_RETENTION_DAYS).
    // After this the email "Listen" link dies — the user had the registration-gated download to keep it.
    const retentionDays = Number(process.env.OUTPUT_RETENTION_DAYS) > 0 ? Number(process.env.OUTPUT_RETENTION_DAYS) : 90;
    const outputsDeleted = await sweep("outputs/", retentionDays * 24 * 60 * 60 * 1000);
    return NextResponse.json({ ok: true, deleted, outputsDeleted, retentionDays });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/** Delete every blob under `prefix` older than `maxAgeMs`. Returns the number deleted. */
async function sweep(prefix: string, maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const res = await list({ prefix, cursor, limit: 1000 });
    const stale = res.blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff).map((b) => b.url);
    if (stale.length) {
      await del(stale); // del accepts a batch of URLs
      deleted += stale.length;
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return deleted;
}

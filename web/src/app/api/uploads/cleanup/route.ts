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
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: true, deleted: 0, note: "blob token unset" });
  }

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let deleted = 0;
  let cursor: string | undefined;
  try {
    do {
      const res = await list({ prefix: "uploads/", cursor, limit: 1000 });
      const stale = res.blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff).map((b) => b.url);
      if (stale.length) {
        await del(stale); // del accepts a batch of URLs
        deleted += stale.length;
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

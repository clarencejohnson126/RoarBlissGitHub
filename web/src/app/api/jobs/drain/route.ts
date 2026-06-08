import { NextResponse } from "next/server";
import { drainQueue } from "@/lib/drain";

/**
 * GET /api/jobs/drain — safety-net queue drainer (Vercel cron, every minute). The replicate-callback
 * webhook is the primary drainer; this catches jobs whose webhook never fired (stuck/missed run).
 * Protected by CRON_SECRET: Vercel attaches it as a Bearer token to cron invocations when the env is
 * set. If CRON_SECRET is unset (local dev), the route is open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const started = await drainQueue();
    return NextResponse.json({ ok: true, started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

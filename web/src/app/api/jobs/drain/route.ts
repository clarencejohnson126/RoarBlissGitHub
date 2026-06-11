import { NextResponse } from "next/server";
import { drainQueue, reconcileStuckRunning } from "@/lib/drain";

/**
 * GET /api/jobs/drain — safety-net queue drainer (Vercel cron, every minute). The replicate-callback
 * webhook is the primary drainer; this catches jobs whose webhook never fired (stuck/missed run).
 * Protected by CRON_SECRET: Vercel attaches it as a Bearer token to cron invocations when the env is
 * set. If CRON_SECRET is unset (local dev), the route is open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron disabled (CRON_SECRET unset)" }, { status: 403 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // Reconcile FIRST: a stuck 'running' job holds a concurrency slot, so settling it against
    // Replicate's real state may be exactly what lets the queue drain below.
    const reconciled = await reconcileStuckRunning();
    const started = await drainQueue();
    return NextResponse.json({ ok: true, started, reconciled });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { verifyUser, supabaseAdmin } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/**
 * GET /api/admin/stats — founder KPI snapshot for /admin. Gated to ADMIN_EMAIL (env). Aggregates
 * straight from the operational tables; no extra tracking infra. Sentry stays the error drill-down.
 */
export async function GET(request: Request) {
  const user = await verifyUser(bearerToken(request));
  const adminEmail = (process.env.ADMIN_EMAIL || process.env.ADMIN_ALERT_EMAIL || "").toLowerCase();
  if (!user || !adminEmail || (user.email || "").toLowerCase() !== adminEmail) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const db = supabaseAdmin();
  const dayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();
  const weekStart = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [runsToday, runs7d, doneToday, failedToday, done7d, failed7d, queuedNow, runningNow, freeGate, ledger] =
    await Promise.all([
      db.from("jobs").select("est_cost_cents", { count: "exact" }).gte("created_at", dayStart),
      db.from("jobs").select("est_cost_cents", { count: "exact" }).gte("created_at", weekStart),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "done").gte("created_at", dayStart),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", dayStart),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "done").gte("created_at", weekStart),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekStart),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
      db.from("free_usage").select("id", { count: "exact", head: true }),
      db.from("minute_ledger").select("minutes,status").gte("created_at", weekStart),
    ]);

  // Users + subscribers via the auth admin API (fine at this scale; paginate to 1000).
  let totalUsers = 0;
  const tierCounts: Record<string, number> = {};
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    totalUsers = data?.users?.length ?? 0;
    for (const u of data?.users ?? []) {
      const tier = (u.app_metadata as Record<string, unknown>)?.tier;
      if (typeof tier === "string" && tier) tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    }
  } catch {
    /* keep zeros */
  }

  const cents = (rows: { data?: unknown[] | null }) =>
    ((rows.data ?? []) as Array<{ est_cost_cents?: number }>).reduce((s, r) => s + (r.est_cost_cents || 0), 0);
  const minutes = (status: string) =>
    ((ledger.data ?? []) as Array<{ minutes: number; status: string }>)
      .filter((r) => r.status === status)
      .reduce((s, r) => s + Number(r.minutes || 0), 0);

  return NextResponse.json({
    today: {
      runs: runsToday.count ?? 0,
      delivered: doneToday.count ?? 0,
      failed: failedToday.count ?? 0,
      estSpendCents: cents(runsToday),
    },
    last7d: {
      runs: runs7d.count ?? 0,
      delivered: done7d.count ?? 0,
      failed: failed7d.count ?? 0,
      estSpendCents: cents(runs7d),
      minutesCharged: Math.round(minutes("charged") * 100) / 100,
      minutesReleased: Math.round(minutes("released") * 100) / 100,
    },
    now: { queued: queuedNow.count ?? 0, running: runningNow.count ?? 0 },
    users: { total: totalUsers, byTier: tierCounts, paying: Object.values(tierCounts).reduce((a, b) => a + b, 0) },
    freeTracksUsed: freeGate.count ?? 0,
  });
}

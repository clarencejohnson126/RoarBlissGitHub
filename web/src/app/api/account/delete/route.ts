import { NextResponse } from "next/server";
import { verifyUser, supabaseAdmin } from "@/lib/supabase-admin";
import { stripe, bearerToken } from "@/lib/stripe";

/**
 * POST /api/account/delete — permanently erase the signed-in user's account (GDPR Art. 17,
 * "right to erasure"). Self-service deletion is legally required in the EU.
 *
 * Steps (auth user is deleted LAST so a mid-way failure leaves the account recoverable):
 *   1. Stripe — delete every customer for this email (this also cancels any active subscription).
 *   2. Supabase — delete the user's rows in the app tables (no FK cascade exists; user_id is loose).
 *   3. Auth — delete the auth user itself.
 *
 * Stripe/data cleanup is best-effort and never blocks the actual account deletion: a billing
 * hiccup must not trap a user who asked to be erased.
 */

// Public tables keyed by the user's id (column `user_id`). `free_usage` is keyed by ip/device
// (anonymous free-tier tracking), so there is nothing user-linked to delete there.
const USER_TABLES = ["jobs", "minute_ledger", "community_posts", "user_voices", "feedback", "analytics_events"] as const;

export async function POST(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  // 1) Stripe — remove customer(s) + cancel subscriptions. Best-effort.
  if (user.email) {
    try {
      const customers = await stripe().customers.list({ email: user.email, limit: 100 });
      for (const c of customers.data) {
        try {
          await stripe().customers.del(c.id);
        } catch (e) {
          console.error(`account/delete: failed to delete stripe customer ${c.id}:`, e);
        }
      }
    } catch (e) {
      console.error("account/delete: stripe customer cleanup failed:", e);
    }
  }

  // 2) Supabase app data — best-effort per table.
  const admin = supabaseAdmin();
  for (const table of USER_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
    if (error) console.error(`account/delete: failed to clear ${table}:`, error.message);
  }
  // profiles is keyed by the auth id directly.
  {
    const { error } = await admin.from("profiles").delete().eq("id", user.id);
    if (error) console.error("account/delete: failed to clear profiles:", error.message);
  }

  // 3) Auth user — the point of no return.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("account/delete: auth deleteUser failed:", error.message);
    return NextResponse.json({ error: "Could not delete the account. Please contact support." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

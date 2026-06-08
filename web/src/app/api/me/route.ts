import { NextResponse } from "next/server";
import { verifyUser, usageState, supabaseAdmin } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/** GET /api/me — who am I + remaining minutes this period + tier + saved profile (from the bearer). */
export async function GET(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user) return NextResponse.json({ authenticated: false, minutesRemaining: 0 });

  // Read FRESH from the DB — the access-token JWT embeds metadata at issue time, so usage/tier/profile
  // would otherwise be stale right after a purchase, a run, or a profile save until the token refreshes.
  let fresh = user;
  try {
    const { data } = await supabaseAdmin().auth.admin.getUserById(user.id);
    if (data?.user) fresh = data.user;
  } catch {
    /* fall back to the token's user */
  }

  const u = usageState(fresh);
  return NextResponse.json({
    authenticated: true,
    email: fresh.email,
    tier: u.tier,
    minutesAllowance: u.allowance,
    minutesUsed: u.used,
    minutesRemaining: u.remaining,
    periodEnd: u.periodEnd,
    profile: (fresh.user_metadata as Record<string, unknown>)?.profile ?? null,
  });
}

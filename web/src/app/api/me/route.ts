import { NextResponse } from "next/server";
import { verifyUser, paidCredits, userTier, supabaseAdmin } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/** GET /api/me — who am I + paid-credit balance + tier + saved profile (from the Authorization bearer). */
export async function GET(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user) return NextResponse.json({ authenticated: false, credits: 0 });

  // Read FRESH from the DB — the access-token JWT embeds metadata at issue time, so credits/tier/profile
  // would otherwise be stale right after a purchase or a profile save until the token refreshes.
  let fresh = user;
  try {
    const { data } = await supabaseAdmin().auth.admin.getUserById(user.id);
    if (data?.user) fresh = data.user;
  } catch {
    /* fall back to the token's user */
  }

  return NextResponse.json({
    authenticated: true,
    email: fresh.email,
    credits: paidCredits(fresh),
    tier: userTier(fresh),
    profile: (fresh.user_metadata as Record<string, unknown>)?.profile ?? null,
  });
}

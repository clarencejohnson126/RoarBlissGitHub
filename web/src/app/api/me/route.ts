import { NextResponse } from "next/server";
import { verifyUser, paidCredits, userTier } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/** GET /api/me — who am I + paid-credit balance + subscription tier (from the Authorization bearer). */
export async function GET(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user) return NextResponse.json({ authenticated: false, credits: 0 });
  return NextResponse.json({
    authenticated: true,
    email: user.email,
    credits: paidCredits(user),
    tier: userTier(user),
    profile: (user.user_metadata as Record<string, unknown>)?.profile ?? null,
  });
}

import { NextResponse } from "next/server";
import { verifyUser, paidCredits } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/** GET /api/me — who am I + how many paid credits do I have (from the Authorization bearer token). */
export async function GET(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user) return NextResponse.json({ authenticated: false, credits: 0 });
  return NextResponse.json({ authenticated: true, email: user.email, credits: paidCredits(user) });
}

import { NextResponse } from "next/server";
import { verifyUser, supabaseAdmin } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/stripe";

/**
 * POST /api/profile — persist the user's saved-story profile to Supabase user_metadata via the
 * service-role admin (guaranteed DB write + merge). We DON'T rely on the client `auth.updateUser`
 * because the access-token JWT embeds metadata at issue time, so a /api/me read with the old token
 * returns stale values — which made the dashboard profile "revert to default after a minute".
 * Body: { profile }.
 */
export async function POST(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const { profile } = (await req.json().catch(() => ({}))) as { profile?: Record<string, unknown> };
  if (!profile || typeof profile !== "object") {
    return NextResponse.json({ error: "profile object required" }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();
    // Merge so we never clobber other user_metadata keys.
    const { data } = await admin.auth.admin.getUserById(user.id);
    const current = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...current, profile } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save profile." }, { status: 500 });
  }
}

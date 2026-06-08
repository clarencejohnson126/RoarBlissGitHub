import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * POST /api/auth/register — create a password account (server-side, so Supabase's unconfigured SMTP
 * is never involved). The account is created already-confirmed; afterwards the user signs in with
 * email + password via supabase.auth.signInWithPassword — no magic-link email on every login.
 * Body: { email, password }.
 */
export async function POST(request: Request) {
  const { email, password } = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      if (/already|registered|exists|duplicate/i.test(error.message)) {
        return NextResponse.json({ error: "That email already has an account — please sign in.", exists: true }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Registration failed." }, { status: 500 });
  }
}

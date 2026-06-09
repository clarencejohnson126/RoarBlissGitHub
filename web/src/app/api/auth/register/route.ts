import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * POST /api/auth/register — create a password account that must be CONFIRMED via an emailed link
 * before it can sign in. This proves inbox ownership, so nobody can register (and pay under) someone
 * else's email. We generate the signup confirmation link with the admin API and deliver it via Resend
 * (Supabase's own SMTP is unconfigured). Body: { email, password, redirectTo? }.
 */
export async function POST(request: Request) {
  const { email, password, redirectTo } = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    redirectTo?: string;
  };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();
    // type:"signup" creates the user UNCONFIRMED and returns a confirmation link (it does NOT log in
    // until the link is clicked) — so the account is unusable until the inbox owner confirms.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    if (error) {
      if (/already|registered|exists|duplicate/i.test(error.message)) {
        return NextResponse.json({ error: "That email already has an account — please sign in.", exists: true }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const link = data?.properties?.action_link;
    if (!link) {
      return NextResponse.json({ error: "Could not generate a confirmation link." }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL || "RoarBliss <onboarding@resend.dev>";
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#08090D;color:#E8E3D8;padding:32px;border-radius:14px;max-width:480px;margin:auto">
        <h2 style="color:#D6A84F;margin:0 0 12px;font-family:Georgia,serif">Confirm your Roar Bliss account</h2>
        <p style="color:#B9B1A3;line-height:1.5">Tap below to confirm your email and activate your account. Then you can sign in with your email and password.</p>
        <p style="margin:28px 0">
          <a href="${link}" style="background:#D6A84F;color:#1a130a;padding:14px 30px;border-radius:8px;text-decoration:none;font-weight:bold">Confirm my account</a>
        </p>
        <p style="font-size:12px;color:#8a8170">If you didn't sign up for Roar Bliss, you can safely ignore this email — the account stays inactive.</p>
      </div>`;

    const { error: sendErr } = await resend.emails.send({ from, to: email, subject: "Confirm your Roar Bliss account", html });
    if (sendErr) {
      return NextResponse.json({ error: `Confirmation email could not be sent: ${sendErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, verify: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Registration failed." }, { status: 500 });
  }
}

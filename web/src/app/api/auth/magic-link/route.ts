import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin, rateLimit } from "@/lib/supabase-admin";

/**
 * Passwordless sign-in WITHOUT Supabase's email sender (its SMTP is unconfigured → it 500s on
 * `signInWithOtp`). We generate the magic link with the service-role admin API and deliver it via
 * Resend (the app's email provider). Body: { email, redirectTo? }.
 */
export async function POST(request: Request) {
  try {
    const { email, redirectTo } = (await request.json().catch(() => ({}))) as {
      email?: string;
      redirectTo?: string;
    };
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    // B9: throttle by IP + email (spam / enumeration / Resend-quota abuse).
    const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (!(await rateLimit(`ml:ip:${ip}`, 8, 3600)) || !(await rateLimit(`ml:em:${email.toLowerCase()}`, 4, 3600))) {
      return NextResponse.json({ error: "Too many sign-in attempts — please try again in a little while." }, { status: 429 });
    }

    const admin = supabaseAdmin();
    // Ensure a (passwordless, confirmed) user exists; ignore "already registered".
    await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    const link = data?.properties?.action_link;
    if (error || !link) {
      return NextResponse.json(
        { error: error?.message || "Could not generate a sign-in link." },
        { status: 500 },
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL || "RoarBliss <onboarding@resend.dev>";
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#08090D;color:#E8E3D8;padding:32px;border-radius:14px;max-width:480px;margin:auto">
        <h2 style="color:#D6A84F;margin:0 0 12px;font-family:Georgia,serif">Sign in to RoarBliss</h2>
        <p style="color:#B9B1A3;line-height:1.5">Click below to sign in. This link expires shortly and can be used once.</p>
        <p style="margin:28px 0">
          <a href="${link}" style="background:#D6A84F;color:#1a130a;padding:14px 30px;border-radius:8px;text-decoration:none;font-weight:bold">Sign in</a>
        </p>
        <p style="font-size:12px;color:#8a8170">If you didn't request this, you can safely ignore it.</p>
      </div>`;

    const { error: sendErr } = await resend.emails.send({
      from,
      to: email,
      subject: "Your RoarBliss sign-in link",
      html,
    });
    if (sendErr) {
      return NextResponse.json({ error: `Email could not be sent: ${sendErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("magic-link error:", e);
    return NextResponse.json({ error: (e as Error).message || "Sign-in failed." }, { status: 500 });
  }
}

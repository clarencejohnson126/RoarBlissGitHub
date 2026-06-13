import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/supabase-admin";
import { stripe, bearerToken, portalConfigId } from "@/lib/stripe";
import { baseUrl } from "@/lib/base-url";

/**
 * POST /api/billing-portal — open the Stripe Customer Portal for the signed-in user
 * (cancel the subscription, update the payment method, view invoices). Returns { url }.
 *
 * We don't persist a Stripe customer id, so we resolve it from the user's email and prefer the
 * customer that actually holds a subscription. The webhook already downgrades the tier when the
 * subscription ends (customer.subscription.deleted → setUserTier("")).
 */
export async function POST(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user?.email) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const customers = await stripe().customers.list({ email: user.email, limit: 100 });
    if (!customers.data.length) {
      return NextResponse.json({ error: "No billing account yet — start a plan first." }, { status: 404 });
    }
    // Prefer the customer that holds a subscription; otherwise the most recent one.
    let chosen = customers.data[0];
    for (const c of customers.data) {
      const subs = await stripe().subscriptions.list({ customer: c.id, status: "all", limit: 1 });
      if (subs.data.length) { chosen = c; break; }
    }

    const cfg = portalConfigId();
    const portal = await stripe().billingPortal.sessions.create({
      customer: chosen.id,
      return_url: `${baseUrl(req)}/dashboard`,
      ...(cfg ? { configuration: cfg } : {}),
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    console.error("billing-portal error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

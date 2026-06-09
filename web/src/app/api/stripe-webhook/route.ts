import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { startBillingPeriod, setUserTier, processStripeEventOnce } from "@/lib/supabase-admin";

// Stripe signature verification needs the raw body + Node crypto.
export const runtime = "nodejs";

/** Period end as ISO. Newer Stripe API versions moved current_period_end onto the subscription item. */
function subPeriodEndISO(sub: Stripe.Subscription): string {
  const s = sub as unknown as { current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } };
  const sec = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  return new Date(sec * 1000).toISOString();
}

/**
 * POST /api/stripe-webhook — Stripe calls this after a TEST checkout completes. We verify the
 * signature, then grant the purchased credits to the user (stored in Supabase app_metadata).
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !whsec) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, whsec);
  } catch (e) {
    return NextResponse.json({ error: `signature: ${(e as Error).message}` }, { status: 400 });
  }

  try {
    // Idempotency: Stripe retries events. Process each at most once so a retry can't reset the
    // billing period (and the minute allowance) a second time.
    if (!(await processStripeEventOnce(event.id))) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (event.type === "checkout.session.completed") {
      // Initial subscription purchase → start the first monthly period (tier + 0 used + period end).
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.userId;
      const tier = s.metadata?.tier;
      if (userId && tier && s.subscription) {
        const sub = await stripe().subscriptions.retrieve(s.subscription as string);
        const periodEnd = subPeriodEndISO(sub);
        await startBillingPeriod(userId, tier, periodEnd);
        console.log(`billing period started for ${userId} · tier ${tier} · ends ${periodEnd}`);
      }
    } else if (event.type === "invoice.payment_succeeded") {
      // Subscription RENEWAL → reset minutes to the tier allowance (NO rollover) + re-anchor the period.
      const inv = event.data.object as Stripe.Invoice & { subscription?: string; billing_reason?: string };
      if (inv.billing_reason === "subscription_cycle" && inv.subscription) {
        const sub = await stripe().subscriptions.retrieve(inv.subscription);
        const userId = sub.metadata?.userId;
        const tier = sub.metadata?.tier;
        if (userId && tier) {
          const periodEnd = subPeriodEndISO(sub);
          await startBillingPeriod(userId, tier, periodEnd);
          console.log(`renewal: reset minutes for ${userId} · tier ${tier} · ends ${periodEnd}`);
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      // Subscription ended → drop the user back to free (clear the tier badge).
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (userId) await setUserTier(userId, "");
    }
  } catch (e) {
    console.error("webhook handler failed:", e);
    // Return 500 so Stripe retries (a paid event must not silently drop credits).
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

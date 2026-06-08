import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { grantCredits, setUserTier } from "@/lib/supabase-admin";

// Stripe signature verification needs the raw body + Node crypto.
export const runtime = "nodejs";

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
    if (event.type === "checkout.session.completed") {
      // Initial purchase (one-time pack OR the first cycle of a subscription).
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.userId;
      const credits = Number(s.metadata?.credits ?? 0);
      if (userId && credits > 0) {
        const total = await grantCredits(userId, credits);
        if (s.metadata?.tier) await setUserTier(userId, s.metadata.tier);
        console.log(`granted ${credits} credits to ${userId} (total ${total})${s.metadata?.tier ? ` · tier ${s.metadata.tier}` : ""}`);
      }
    } else if (event.type === "invoice.payment_succeeded") {
      // Subscription RENEWAL only (the first cycle is handled by checkout.session.completed above,
      // so guard on billing_reason to avoid double-granting).
      const inv = event.data.object as Stripe.Invoice & { subscription?: string; billing_reason?: string };
      if (inv.billing_reason === "subscription_cycle" && inv.subscription) {
        const sub = await stripe().subscriptions.retrieve(inv.subscription);
        const userId = sub.metadata?.userId;
        const credits = Number(sub.metadata?.credits ?? 0);
        if (userId && credits > 0) {
          await grantCredits(userId, credits);
          if (sub.metadata?.tier) await setUserTier(userId, sub.metadata.tier);
          console.log(`renewal: granted ${credits} credits to ${userId}`);
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

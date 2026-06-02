import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { grantCredits } from "@/lib/supabase-admin";

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

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const userId = s.metadata?.userId;
    const credits = Number(s.metadata?.credits ?? 0);
    if (userId && credits > 0) {
      try {
        const total = await grantCredits(userId, credits);
        console.log(`granted ${credits} credits to ${userId} (total ${total})`);
      } catch (e) {
        console.error("grantCredits failed:", e);
        // Return 500 so Stripe retries (the payment succeeded; we must not drop the credit).
        return NextResponse.json({ error: "grant failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}

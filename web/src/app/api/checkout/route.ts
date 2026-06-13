import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/supabase-admin";
import { stripe, bearerToken, tierById, tierProductId, CREDITS_PER_PURCHASE, PRICE_CENTS, CURRENCY } from "@/lib/stripe";
import { baseUrl } from "@/lib/base-url";

/**
 * POST /api/checkout — start a Stripe checkout (LIVE in prod, TEST elsewhere).
 *   body { tier: "starter"|"warrior"|"legend" } → a recurring monthly SUBSCRIPTION for that tier
 *   no body / unknown tier                       → the legacy one-time pack of 5 paid tracks
 * Requires a signed-in user (Authorization: Bearer <supabase access token>). Returns { url }.
 */
export async function POST(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tier?: string; currency?: string };
  const tier = tierById(body?.tier);
  const useUsd = body?.currency === "usd";
  const base = baseUrl(req);

  try {
    if (tier) {
      const meta = { userId: user.id, credits: String(tier.monthlyCredits), tier: tier.id };
      // Attach the subscription to the canonical Stripe Product in prod (so the Customer Portal + dashboard
      // show "Roar Bliss Warrior" etc.); fall back to an inline product in preview/local (test keys, no products).
      const pid = tierProductId(tier.id);
      const productField = pid
        ? { product: pid }
        : { product_data: { name: `Roar Bliss ${tier.name} — ${tier.minutes} min / month` } };
      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: useUsd ? "usd" : CURRENCY,
              unit_amount: useUsd ? tier.priceCentsUsd : tier.priceCents,
              recurring: { interval: "month" },
              ...productField,
            },
          },
        ],
        metadata: meta, // checkout.session.completed → grant the tier's monthly credits + set tier
        subscription_data: { metadata: meta },
        customer_email: user.email,
        success_url: `${base}/dashboard?sub=success`,
        cancel_url: `${base}/pricing?sub=cancel`,
      });
      return NextResponse.json({ url: session.url });
    }

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: PRICE_CENTS,
            product_data: { name: `Roar Bliss — ${CREDITS_PER_PURCHASE} paid tracks (up to 6 min each)` },
          },
        },
      ],
      metadata: { userId: user.id, credits: String(CREDITS_PER_PURCHASE) },
      customer_email: user.email,
      success_url: `${base}/dashboard?purchase=success`,
      cancel_url: `${base}/pricing?purchase=cancel`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("checkout error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

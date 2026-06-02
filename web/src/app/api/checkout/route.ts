import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/supabase-admin";
import { stripe, bearerToken, CREDITS_PER_PURCHASE, PRICE_CENTS, CURRENCY } from "@/lib/stripe";
import { baseUrl } from "@/lib/base-url";

/**
 * POST /api/checkout — start a Stripe TEST checkout for a pack of paid (6-min) tracks.
 * Requires a signed-in user (Authorization: Bearer <supabase access token>). Returns { url }.
 */
export async function POST(req: Request) {
  const user = await verifyUser(bearerToken(req));
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const base = baseUrl(req);
  try {
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
      // The webhook reads these to credit the right user.
      metadata: { userId: user.id, credits: String(CREDITS_PER_PURCHASE) },
      customer_email: user.email,
      success_url: `${base}/?purchase=success`,
      cancel_url: `${base}/?purchase=cancel`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("checkout error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

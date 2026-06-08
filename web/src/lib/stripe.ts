import Stripe from "stripe";

/** Server-side Stripe client (TEST mode while sk_test_… is set). */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

// One purchase = a pack of paid tracks (each up to 6 min). Tune freely later.
export const CREDITS_PER_PURCHASE = 5;
export const PRICE_CENTS = 500; // €5.00 (TEST)
export const CURRENCY = "eur";

// Tier config lives in the client-safe ./tiers (no server SDK) so /pricing + dashboard can import it.
export { TIERS, tierById, euro } from "./tiers";
export type { Tier, TierId } from "./tiers";

/** Bearer token out of an Authorization header. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

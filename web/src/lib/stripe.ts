import Stripe from "stripe";

/** Server-side Stripe client. LIVE in prod (sk_live_…), TEST elsewhere — keyed by the env var. */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

/**
 * Canonical Stripe Product id for a tier, from env (set in prod: STRIPE_PRODUCT_STARTER/_WARRIOR/_LEGEND).
 * Returns undefined in preview/local (test keys, no products) → checkout falls back to inline product_data.
 */
export function tierProductId(tierId: string): string | undefined {
  return process.env[`STRIPE_PRODUCT_${tierId.toUpperCase()}`] || undefined;
}

/** Customer-portal configuration id (set in prod: STRIPE_PORTAL_CONFIG_ID); undefined → Stripe default. */
export function portalConfigId(): string | undefined {
  return process.env.STRIPE_PORTAL_CONFIG_ID || undefined;
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

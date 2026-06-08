/**
 * Subscription tiers — client-safe (no server SDK import, so /pricing + dashboard can import this).
 * Prices + caps from UNIT_ECONOMICS.md (~€9.99/19.99/39.99, 25/60/120 min/mo, €0.30/min overage).
 * `monthlyCredits` = paid tracks (≤6 min each) per month, granted by the Stripe webhook.
 */
export type TierId = "starter" | "warrior" | "legend";

export interface Tier {
  id: TierId;
  name: string;
  priceCents: number; // EUR cents
  priceCentsUsd: number; // USD cents — psychological .99 just above the live FX conversion (rate 1.1533, 2026-06-08)
  minutes: number;
  monthlyCredits: number;
  tagline: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    priceCents: 999,
    priceCentsUsd: 1199,
    minutes: 25,
    monthlyCredits: 5,
    tagline: "For a few powerful speeches every month.",
    cta: "Start with Starter",
    features: [
      "25 minutes of audio / month",
      "Full-length downloads",
      "All 4 personalization depths",
      "45-second free previews",
      "Standard generation queue",
    ],
  },
  {
    id: "warrior",
    name: "Warrior",
    priceCents: 1999,
    priceCentsUsd: 2399,
    minutes: 60,
    monthlyCredits: 12,
    tagline: "For serious users who want it deeper and personal.",
    cta: "Become Warrior",
    popular: true,
    features: [
      "60 minutes of audio / month",
      "Deeper personalization",
      "Saved profile context",
      "Choose your instrumental",
      "Priority generation",
    ],
  },
  {
    id: "legend",
    name: "Legend",
    priceCents: 3999,
    priceCentsUsd: 4699,
    minutes: 120,
    monthlyCredits: 25,
    tagline: "For creators, coaches, athletes and founders.",
    cta: "Go Legend",
    features: [
      "120 minutes of audio / month",
      "Full rewrite access",
      "Advanced voice & style options",
      "Priority processing",
      "Early access to new features",
    ],
  },
];

export function tierById(id?: string | null): Tier | null {
  return TIERS.find((t) => t.id === id) ?? null;
}

export function euro(cents: number): string {
  return (cents / 100).toLocaleString("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}

export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}

export type Currency = "eur" | "usd";

/** Display price string + the matching cents for a tier in the chosen currency. */
export function tierPrice(t: Tier, cur: Currency): { label: string; cents: number } {
  return cur === "usd" ? { label: usd(t.priceCentsUsd), cents: t.priceCentsUsd } : { label: euro(t.priceCents), cents: t.priceCents };
}

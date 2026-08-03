/**
 * Flint Tech — Live Revenue Catalog
 *
 * Real Stripe objects in account acct_1TaUSsEYm87XGaC5 (livemode: true).
 * Do not use test-mode IDs.
 */

export type FlintPlanId = "free" | "pro" | "business" | "usage";

export interface FlintPlan {
  id: FlintPlanId;
  name: string;
  /** Stripe Product ID (live) */
  productId: string | null;
  /** Stripe Price ID for licensed monthly seat (live) */
  priceId: string | null;
  /** USD cents per seat per month (licensed plans) */
  unitAmountCents: number | null;
  lookupKey: string | null;
  features: string[];
}

/** Live catalog — created 2026-07-23 */
export const FLINT_CATALOG = {
  pro: {
    id: "pro" as const,
    name: "OmniRoute Pro",
    productId: "prod_UwDsGiZ7iMShUa",
    priceId: "price_1TwLQvEYm87XGaC5hw41M62H",
    unitAmountCents: 4900,
    lookupKey: "omniroute_pro_monthly",
    features: [
      "Higher RPM limits",
      "Team budgets & virtual keys",
      "Basic analytics",
      "Payment recovery (soft declines)",
      "Email support",
    ],
  },
  business: {
    id: "business" as const,
    name: "OmniRoute Business",
    productId: "prod_UwDshxDj9jUE90",
    priceId: "price_1TwLQxEYm87XGaC5K3PSHpxz",
    unitAmountCents: 19900,
    lookupKey: "omniroute_business_monthly",
    features: [
      "Everything in Pro",
      "Metered token billing",
      "Team quota pools",
      "Full revenue recovery",
      "Priority support",
      "SSO-lite / multi-seat",
    ],
  },
  usage: {
    id: "usage" as const,
    name: "OmniRoute Usage",
    productId: "prod_UwDsVNhZL8v2cW",
    priceId: null, // attach Billing Meter in Dashboard, then set STRIPE_USAGE_PRICE_ID
    unitAmountCents: 2, // target: $0.02 / 1k tokens once meter-backed price exists
    lookupKey: "omniroute_usage_per_1k_tokens",
    features: ["Pay usage overage", "$0.02 per 1,000 tokens (target)"],
  dr
  free: {
    id: "free" as const,
    name: "OmniRoute Free (self-host / limited hosted)",
    productId: null,
    priceId: null,
    unitAmountCents: 0,
    lookupKey: null,
    features: [
      "Full open-core gateway",
      "Free-tier providers",
      "Compression & MCP",
      "Local desktop / PWA",
    ],
  },
} satisfies Record<FlintPlanId, FlintPlan>;

export function getPlan(plan: FlintPlanId): FlintPlan {
  return FLINT_CATALOG[plan];
}

export function getSeatPriceId(plan: "pro" | "business"): string {
  const id = FLINT_CATALOG[plan].priceId;
  if (!id) throw new Error(`No live price for plan ${plan}`);
  return id;
}

/** Optional env override after you create the meter-backed usage price */
export function getUsagePriceId(): string | null {
  return process.env.STRIPE_USAGE_PRICE_ID ?? FLINT_CATALOG.usage.priceId;
}

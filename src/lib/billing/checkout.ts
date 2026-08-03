/**
 * Flint Tech — Checkout / Subscription helpers (live)
 *
 * Creates Checkout Sessions for Pro and Business seat plans.
 */

import { getStripeClient, isLiveBillingEnabled } from "./stripe-client.js";
import { getSeatPriceId } from "./catalog.js";
import { ensureStripeCustomer } from "./customers.js";

export async function createSeatCheckoutSession(opts: {
  plan: "pro" | "business";
  internalId: string;
  email?: string;
  name?: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string;
}): Promise<{ url: string | null; sessionId: string | null; error?: string }> {
  if (!isLiveBillingEnabled()) {
    return { url: null, sessionId: null, error: "Live billing disabled" };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return { url: null, sessionId: null, error: "Stripe unavailable" };
  }

  const customerId = await ensureStripeCustomer({
    internalId: opts.internalId,
    email: opts.email,
    name: opts.name,
    stripeCustomerId: opts.stripeCustomerId,
  });

  if (!customerId) {
    return { url: null, sessionId: null, error: "Could not ensure customer" };
  }

  const priceId = getSeatPriceId(opts.plan);
  const quantity = Math.max(1,opts.quantity ?? 1);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    metadata: {
      flint_plan: opts.plan,
      flint_internal_id: opts.internalId,
    },
    subscription_data: {
      metadata: {
        flint_plan: opts.plan,
        flint_internal_id: opts.internalId,
      },
    },
  });

  return { url: session.url, sessionId: session.id };
}

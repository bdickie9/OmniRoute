/**
 * Flint Tech — Stripe Customer mapping
 *
 * Every billable org / API key owner maps to one live Stripe Customer (cus_...).
 * Required before metering or subscriptions can generate real revenue.
 */

import { getStripeClient, isLiveBillingEnabled } from "./stripe-client.js";

export interface EnsureCustomerInput {
  /** Stable internal id (org id, user id, or key owner id) */
  internalId: string;
  email?: string;
  name?: string;
  /** Existing Stripe customer id if already known */
  stripeCustomerId?: string;
  metadata?: Record<string, string>;
}

/**
 * Returns a live Stripe Customer id. Creates one if needed.
 * Stores metadata.flint_internal_id for reconciliation.
 */
export async function ensureStripeCustomer(
  input: EnsureCustomerInput
): Promise<string | null> {
  if (!isLiveBillingEnabled()) return null;

  const stripe = getStripeClient();
  if (!stripe) return null;

  if (input.stripeCustomerId?.startsWith("cus_")) {
    return input.stripeCustomerId;
  }

  // Search by metadata for idempotent create
  try {
    const existing = await stripe.customers.search({
      query: `metadata["flint_internal_id"]:"${input.internalId.replace(/"/g, "")}"`,
      limit: 1,
    });
    if (existing.data[0]?.id) {
      return existing.data[0].id;
    }
  } catch {
    // search may be unavailable on some accounts — fall through to create
  }

  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name ?? `Flint ${input.internalId}`,
    metadata: {
      flint_internal_id: input.internalId,
      product_line: "omniroute",
      ...input.metadata,
    },
  });

  return customer.id;
}

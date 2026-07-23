/**
 * Flint Tech — Stripe Webhook Handler (Revenue Recovery + Billing)
 *
 * Live-mode only. Verifies signatures and routes failed-payment events
 * into the Hyperswitch-inspired recovery engine.
 */

import type Stripe from "stripe";
import { getStripeClient, isLiveBillingEnabled } from "./stripe-client.js";
import {
  handleFailedPaymentEvent,
  type RecoveryAttemptResult,
} from "./recovery.js";

export interface WebhookResult {
  received: boolean;
  type: string;
  recovery?: RecoveryAttemptResult | null;
  error?: string;
}

/**
 * Process a raw Stripe webhook payload.
 * @param rawBody - exact raw request body (string or Buffer)
 * @param signature - Stripe-Signature header value
 */
export async function processStripeWebhook(
  rawBody: string | Buffer,
  signature: string
): Promise<WebhookResult> {
  if (!isLiveBillingEnabled()) {
    return {
      received: false,
      type: "disabled",
      error: "Live billing is disabled",
    };
  }

  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return {
      received: false,
      type: "misconfigured",
      error: "Stripe client or STRIPE_WEBHOOK_SECRET missing",
    };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Flint Webhook] Signature verification failed", message);
    return {
      received: false,
      type: "invalid_signature",
      error: message,
    };
  }

  // Route recovery-relevant events
  if (
    event.type === "invoice.payment_failed" ||
    event.type === "charge.failed" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const recovery = await handleFailedPaymentEvent(event);
    return {
      received: true,
      type: event.type,
      recovery,
    };
  }

  // Other events can be handled later (invoice.paid, customer.subscription.*, etc.)
  return {
    received: true,
    type: event.type,
  };
}

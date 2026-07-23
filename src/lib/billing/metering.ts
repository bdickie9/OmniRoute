/**
 * Flint Tech — Usage Metering
 *
 * Records real token / request usage and reports it to Stripe Billing Meters
 * so that live invoices can be generated. No simulation paths.
 *
 * Integration point: call `recordUsageEvent` after a successful upstream
 * completion (or on the response path) with the actual token counts.
 */

import { getStripeClient, isLiveBillingEnabled } from "./stripe-client.js";

export interface UsageEvent {
  /** Stripe Customer ID (cus_...) or a stable internal customer key that maps to one */
  customerId: string;
  /** Number of tokens (prompt + completion) or requests, depending on meter */
  value: number;
  /** Optional model / provider for later analytics */
  model?: string;
  provider?: string;
  /** ISO timestamp; defaults to now */
  timestamp?: string;
  /** Extra metadata stored with the meter event */
  metadata?: Record<string, string>;
}

const METER_EVENT_NAME =
  process.env.STRIPE_METER_EVENT_NAME ?? "omniroute_tokens";

/**
 * Report a single usage event to Stripe. Safe to call even when billing is disabled
 * (it becomes a no-op). Failures are logged but do not break the request path.
 */
export async function recordUsageEvent(event: UsageEvent): Promise<void> {
  if (!isLiveBillingEnabled()) {
    return;
  }

  const stripe = getStripeClient();
  if (!stripe) return;

  if (!event.customerId || event.value <= 0) {
    return;
  }

  try {
    await stripe.billing.meterEvents.create({
      event_name: METER_EVENT_NAME,
      payload: {
        stripe_customer_id: event.customerId,
        value: String(Math.round(event.value)),
      },
      timestamp: event.timestamp
        ? Math.floor(new Date(event.timestamp).getTime() / 1000)
        : undefined,
    });
  } catch (err) {
    // Never break the AI request path because of billing telemetry
    console.error("[Flint Metering] Failed to report usage event", {
      customerId: event.customerId,
      value: event.value,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Helper for the common case: tokens used on a completed chat completion.
 */
export async function recordTokenUsage(opts: {
  customerId: string;
  promptTokens: number;
  completionTokens: number;
  model?: string;
  provider?: string;
}): Promise<void> {
  const total = (opts.promptTokens || 0) + (opts.completionTokens || 0);
  if (total <= 0) return;

  await recordUsageEvent({
    customerId: opts.customerId,
    value: total,
    model: opts.model,
    provider: opts.provider,
    metadata: {
      prompt_tokens: String(opts.promptTokens || 0),
      completion_tokens: String(opts.completionTokens || 0),
    },
  });
}

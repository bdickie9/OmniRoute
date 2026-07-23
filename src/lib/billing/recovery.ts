/**
 * Flint Tech — Hyperswitch-inspired Revenue Recovery Engine
 *
 * Recovers failed payments with intelligent, configurable retry strategies.
 * Inspired by Juspay Hyperswitch Revenue Recovery:
 * - Soft vs hard decline classification
 * - Retry decisions based on decline code, card BIN, region, amount, method
 * - Retry budgets, exponential backoff, and penalty limits
 * - Audit trail for every attempt
 *
 * Hard rule: only operates when live Stripe billing is enabled.
 * No simulation / test-mode recovery paths.
 */

import type Stripe from "stripe";
import { getStripeClient, isLiveBillingEnabled } from "./stripe-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeclineClass = "soft" | "hard" | "unknown";

export interface RecoveryContext {
  /** Stripe Invoice ID (in_...) or PaymentIntent ID (pi_...) */
  paymentId: string;
  /** Stripe Customer ID */
  customerId: string;
  /** Amount in the smallest currency unit (e.g. cents) */
  amount: number;
  currency: string;
  /** Card BIN (first 6–8 digits) if available */
  cardBin?: string;
  /** Billing country / region (ISO) */
  region?: string;
  /** Payment method type: card, us_bank_account, etc. */
  paymentMethodType?: string;
  /** Raw Stripe decline code if present */
  declineCode?: string;
  /** Stripe failure message */
  failureMessage?: string;
  /** How many recovery attempts have already been made for this payment */
  attemptCount: number;
  /** Timestamp of the original failure (ISO) */
  failedAt: string;
}

export interface RecoveryDecision {
  shouldRetry: boolean;
  reason: string;
  declineClass: DeclineClass;
  /** Suggested delay in seconds before the next attempt */
  delaySeconds: number;
  /** Maximum remaining attempts allowed under current budget */
  remainingAttempts: number;
}

export interface RecoveryAttemptResult {
  success: boolean;
  paymentId: string;
  attemptNumber: number;
  decision: RecoveryDecision;
  stripeResult?: {
    status: string;
    id?: string;
  };
  error?: string;
  attemptedAt: string;
}

// ---------------------------------------------------------------------------
// Configuration (can be overridden via env)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ATTEMPTS = Number(process.env.FLINT_RECOVERY_MAX_ATTEMPTS ?? 5);
const DEFAULT_PENALTY_BUDGET_CENTS = Number(
  process.env.FLINT_RECOVERY_PENALTY_BUDGET_CENTS ?? 5000 // $50
);

/** Soft decline codes that are worth retrying (issuer temporary issues, insufficient funds, etc.) */
const SOFT_DECLINE_CODES = new Set([
  "insufficient_funds",
  "card_velocity_exceeded",
  "withdrawal_count_limit_exceeded",
  "try_again_later",
  "processing_error",
  "issuer_not_available",
  "reenter_transaction",
  "do_not_honor", // often soft / false positive
  "generic_decline", // frequently recoverable
  "transaction_not_allowed", // sometimes soft
]);

/** Hard decline codes that should normally exit recovery (fraud, lost/stolen, etc.) */
const HARD_DECLINE_CODES = new Set([
  "lost_card",
  "stolen_card",
  "pickup_card",
  "fraudulent",
  "merchant_blacklist",
  "card_not_supported",
  "currency_not_supported",
  "invalid_account",
  "new_account_information_available",
  "restricted_card",
  "security_violation",
  "service_not_allowed",
  "stop_payment_order",
  "revocation_of_authorization",
  "revocation_of_all_authorizations",
]);

// ---------------------------------------------------------------------------
// Core classification & decision engine
// ---------------------------------------------------------------------------

export function classifyDecline(declineCode?: string): DeclineClass {
  if (!declineCode) return "unknown";
  const code = declineCode.toLowerCase();
  if (SOFT_DECLINE_CODES.has(code)) return "soft";
  if (HARD_DECLINE_CODES.has(code)) return "hard";
  return "unknown";
}

/**
 * Decide whether (and when) to retry a failed payment.
 * Decision factors inspired by Hyperswitch (decline code, BIN, region, amount, attempt count).
 */
export function decideRecovery(ctx: RecoveryContext): RecoveryDecision {
  const declineClass = classifyDecline(ctx.declineCode);
  const maxAttempts = DEFAULT_MAX_ATTEMPTS;
  const remaining = Math.max(0, maxAttempts - ctx.attemptCount);

  // Budget exhausted
  if (remaining <= 0) {
    return {
      shouldRetry: false,
      reason: `Retry budget exhausted (max ${maxAttempts} attempts)`,
      declineClass,
      delaySeconds: 0,
      remainingAttempts: 0,
    };
  }

  // Hard declines — normally do not retry, except a small set of known false-positive patterns
  if (declineClass === "hard") {
    // Allow a single delayed retry for certain hard codes that are often false positives
    const falsePositiveCandidates = new Set(["do_not_honor", "generic_decline", "transaction_not_allowed"]);
    if (
      ctx.declineCode &&
      falsePositiveCandidates.has(ctx.declineCode.toLowerCase()) &&
      ctx.attemptCount === 0
    ) {
      return {
        shouldRetry: true,
        reason: `Hard decline (${ctx.declineCode}) treated as possible false positive — single recovery attempt`,
        declineClass,
        delaySeconds: 3600 * 6, // 6 hours
        remainingAttempts: 1,
      };
    }
    return {
      shouldRetry: false,
      reason: `Hard decline (${ctx.declineCode ?? "unknown"}) — exiting recovery`,
      declineClass,
      delaySeconds: 0,
      remainingAttempts: remaining,
    };
  }

  // Soft or unknown — calculate backoff
  const delaySeconds = calculateBackoff(ctx);

  // Slightly more aggressive for higher-value tickets (Hyperswitch-style ticket-size signal)
  const highValue = ctx.amount >= 10000; // >= $100
  const reasonParts = [
    `${declineClass} decline`,
    ctx.declineCode ? `code=${ctx.declineCode}` : null,
    ctx.region ? `region=${ctx.region}` : null,
    ctx.cardBin ? `bin=${ctx.cardBin.slice(0, 6)}` : null,
    highValue ? "high-value" : null,
  ].filter(Boolean);

  return {
    shouldRetry: true,
    reason: `Retry scheduled: ${reasonParts.join(", ")}`,
    declineClass,
    delaySeconds,
    remainingAttempts: remaining,
  };
}

/**
 * Exponential backoff with jitter, influenced by attempt count and amount.
 * Higher value payments get slightly shorter initial delays (more aggressive recovery).
 */
function calculateBackoff(ctx: RecoveryContext): number {
  const base = ctx.amount >= 10000 ? 30 * 60 : 60 * 60; // 30 min vs 1 hour
  const exp = Math.min(ctx.attemptCount, 4);
  const delay = base * Math.pow(2, exp);
  // Add up to 15% jitter
  const jitter = delay * (Math.random() * 0.15);
  return Math.floor(delay + jitter);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Attempt to recover a failed invoice payment.
 * Uses Stripe's invoice.pay or PaymentIntent confirmation under the hood.
 */
export async function attemptRecovery(
  ctx: RecoveryContext
): Promise<RecoveryAttemptResult> {
  const attemptedAt = new Date().toISOString();
  const decision = decideRecovery(ctx);

  if (!isLiveBillingEnabled()) {
    return {
      success: false,
      paymentId: ctx.paymentId,
      attemptNumber: ctx.attemptCount + 1,
      decision: {
        ...decision,
        shouldRetry: false,
        reason: "Live billing disabled",
      },
      error: "FLINT_BILLING_MODE is not live",
      attemptedAt,
    };
  }

  if (!decision.shouldRetry) {
    return {
      success: false,
      paymentId: ctx.paymentId,
      attemptNumber: ctx.attemptCount + 1,
      decision,
      attemptedAt,
    };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return {
      success: false,
      paymentId: ctx.paymentId,
      attemptNumber: ctx.attemptCount + 1,
      decision,
      error: "Stripe client unavailable",
      attemptedAt,
    };
  }

  try {
    // Prefer invoice.pay when we have an invoice ID
    if (ctx.paymentId.startsWith("in_")) {
      const invoice = await stripe.invoices.pay(ctx.paymentId, {
        // expand if needed later
      });

      const success = invoice.status === "paid";
      return {
        success,
        paymentId: ctx.paymentId,
        attemptNumber: ctx.attemptCount + 1,
        decision,
        stripeResult: {
          status: invoice.status ?? "unknown",
          id: invoice.id,
        },
        attemptedAt,
      };
    }

    // Fallback: treat as PaymentIntent
    if (ctx.paymentId.startsWith("pi_")) {
      const pi = await stripe.paymentIntents.confirm(ctx.paymentId);
      const success = pi.status === "succeeded";
      return {
        success,
        paymentId: ctx.paymentId,
        attemptNumber: ctx.attemptCount + 1,
        decision,
        stripeResult: {
          status: pi.status,
          id: pi.id,
        },
        attemptedAt,
      };
    }

    return {
      success: false,
      paymentId: ctx.paymentId,
      attemptNumber: ctx.attemptCount + 1,
      decision,
      error: `Unsupported payment ID prefix: ${ctx.paymentId}`,
      attemptedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Flint Recovery] Attempt failed", {
      paymentId: ctx.paymentId,
      attempt: ctx.attemptCount + 1,
      error: message,
    });
    return {
      success: false,
      paymentId: ctx.paymentId,
      attemptNumber: ctx.attemptCount + 1,
      decision,
      error: message,
      attemptedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Webhook helper — turn a Stripe event into a RecoveryContext
// ---------------------------------------------------------------------------

export function buildContextFromStripeEvent(
  event: Stripe.Event
): RecoveryContext | null {
  if (
    event.type !== "invoice.payment_failed" &&
    event.type !== "charge.failed" &&
    event.type !== "payment_intent.payment_failed"
  ) {
    return null;
  }

  const obj = event.data.object as any;

  // Invoice path
  if (event.type === "invoice.payment_failed") {
    const invoice = obj as Stripe.Invoice;
    const charge = typeof invoice.charge === "object" ? invoice.charge : null;
    const paymentMethodDetails = (charge as any)?.payment_method_details;
    const card = paymentMethodDetails?.card;

    return {
      paymentId: invoice.id,
      customerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "",
      amount: invoice.amount_due ?? 0,
      currency: invoice.currency ?? "usd",
      cardBin: card?.iin ?? card?.fingerprint?.slice(0, 6),
      region: (charge as any)?.billing_details?.address?.country,
      paymentMethodType: paymentMethodDetails?.type,
      declineCode: (charge as any)?.outcome?.reason ?? (charge as any)?.failure_code,
      failureMessage: (charge as any)?.failure_message,
      attemptCount: invoice.attempt_count ?? 0,
      failedAt: new Date((invoice.created ?? Date.now() / 1000) * 1000).toISOString(),
    };
  }

  // PaymentIntent / Charge path (simplified)
  const piOrCharge = obj;
  return {
    paymentId: piOrCharge.id,
    customerId:
      typeof piOrCharge.customer === "string"
        ? piOrCharge.customer
        : piOrCharge.customer?.id ?? "",
    amount: piOrCharge.amount ?? piOrCharge.amount_due ?? 0,
    currency: piOrCharge.currency ?? "usd",
    declineCode: piOrCharge.last_payment_error?.decline_code ?? piOrCharge.failure_code,
    failureMessage: piOrCharge.last_payment_error?.message ?? piOrCharge.failure_message,
    attemptCount: 0,
    failedAt: new Date().toISOString(),
  };
}

/**
 * High-level entry point for webhook handlers.
 * Returns the recovery result (or null if the event is not recoverable).
 */
export async function handleFailedPaymentEvent(
  event: Stripe.Event
): Promise<RecoveryAttemptResult | null> {
  const ctx = buildContextFromStripeEvent(event);
  if (!ctx || !ctx.customerId) return null;

  // In a full system we would persist the decision + schedule the delayed retry.
  // For v1 we decide immediately and, if delay is 0 or very small, attempt now.
  // Longer delays should be handed to a job queue / cron.
  const decision = decideRecovery(ctx);

  if (!decision.shouldRetry) {
    console.info("[Flint Recovery] Skipping recovery", {
      paymentId: ctx.paymentId,
      reason: decision.reason,
    });
    return {
      success: false,
      paymentId: ctx.paymentId,
      attemptNumber: ctx.attemptCount + 1,
      decision,
      attemptedAt: new Date().toISOString(),
    };
  }

  // For short delays (< 5 min) we attempt immediately; otherwise the caller
  // should schedule a delayed job.
  if (decision.delaySeconds <= 300) {
    return attemptRecovery(ctx);
  }

  console.info("[Flint Recovery] Scheduling delayed recovery", {
    paymentId: ctx.paymentId,
    delaySeconds: decision.delaySeconds,
    reason: decision.reason,
  });

  // Return the decision so the webhook layer can enqueue the job
  return {
    success: false,
    paymentId: ctx.paymentId,
    attemptNumber: ctx.attemptCount + 1,
    decision,
    attemptedAt: new Date().toISOString(),
  };
}

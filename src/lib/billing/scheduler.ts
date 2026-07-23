/**
 * Flint Tech — Delayed Recovery Scheduler (v1)
 *
 * Simple in-process scheduler for recovery attempts that need a delay > 5 minutes.
 * For production at scale, replace with a durable job queue (BullMQ, Inngest, etc.).
 *
 * v1 behaviour:
 * - Stores pending retries in memory
 * - Uses setTimeout for delays up to a few hours
 * - On process restart, pending retries are lost (acceptable for early live testing;
 *   durable storage is the next hardening step)
 */

import { attemptRecovery, type RecoveryContext } from "./recovery.js";
import { getStripeClient, isLiveBillingEnabled } from "./stripe-client.js";

export interface ScheduledRecovery {
  paymentId: string;
  delaySeconds: number;
  attemptNumber: number;
  reason: string;
  scheduledAt: string;
  runAt: string;
}

const pending = new Map<string, NodeJS.Timeout>();

/**
 * Schedule a delayed recovery attempt.
 * Returns immediately; the actual attempt runs after delaySeconds.
 */
export async function scheduleDelayedRecovery(opts: {
  paymentId: string;
  delaySeconds: number;
  attemptNumber: number;
  reason: string;
}): Promise<ScheduledRecovery> {
  const scheduledAt = new Date();
  const runAt = new Date(scheduledAt.getTime() + opts.delaySeconds * 1000);

  const entry: ScheduledRecovery = {
    paymentId: opts.paymentId,
    delaySeconds: opts.delaySeconds,
    attemptNumber: opts.attemptNumber,
    reason: opts.reason,
    scheduledAt: scheduledAt.toISOString(),
    runAt: runAt.toISOString(),
  };

  // Cancel any existing timer for the same payment
  const existing = pending.get(opts.paymentId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    pending.delete(opts.paymentId);
    await executeScheduledRecovery(opts.paymentId, opts.attemptNumber);
  }, opts.delaySeconds * 1000);

  // Prevent the timer from keeping the process alive forever in some runtimes
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  pending.set(opts.paymentId, timer);

  console.info("[Flint Recovery Scheduler] Scheduled", {
    paymentId: opts.paymentId,
    delaySeconds: opts.delaySeconds,
    runAt: entry.runAt,
    reason: opts.reason,
  });

  return entry;
}

async function executeScheduledRecovery(
  paymentId: string,
  attemptNumber: number
): Promise<void> {
  if (!isLiveBillingEnabled()) {
    console.warn("[Flint Recovery Scheduler] Live billing disabled — skipping", paymentId);
    return;
  }

  const stripe = getStripeClient();
  if (!stripe) return;

  try {
    // Re-fetch the latest invoice / payment state so we don't retry a payment that already succeeded
    if (paymentId.startsWith("in_")) {
      const invoice = await stripe.invoices.retrieve(paymentId);
      if (invoice.status === "paid") {
        console.info("[Flint Recovery Scheduler] Invoice already paid — skipping", paymentId);
        return;
      }

      const ctx: RecoveryContext = {
        paymentId,
        customerId:
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id ?? "",
        amount: invoice.amount_due ?? 0,
        currency: invoice.currency ?? "usd",
        attemptCount: attemptNumber,
        failedAt: new Date().toISOString(),
        declineCode: undefined,
      };

      const result = await attemptRecovery(ctx);
      console.info("[Flint Recovery Scheduler] Attempt finished", {
        paymentId,
        success: result.success,
        reason: result.decision.reason,
      });
      return;
    }

    // PaymentIntent path
    if (paymentId.startsWith("pi_")) {
      const pi = await stripe.paymentIntents.retrieve(paymentId);
      if (pi.status === "succeeded") {
        console.info("[Flint Recovery Scheduler] PaymentIntent already succeeded — skipping", paymentId);
        return;
      }

      const ctx: RecoveryContext = {
        paymentId,
        customerId:
          typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? "",
        amount: pi.amount ?? 0,
        currency: pi.currency ?? "usd",
        attemptCount: attemptNumber,
        failedAt: new Date().toISOString(),
        declineCode: pi.last_payment_error?.decline_code,
        failureMessage: pi.last_payment_error?.message,
      };

      const result = await attemptRecovery(ctx);
      console.info("[Flint Recovery Scheduler] Attempt finished", {
        paymentId,
        success: result.success,
        reason: result.decision.reason,
      });
    }
  } catch (err) {
    console.error("[Flint Recovery Scheduler] Execution error", {
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Inspect currently pending scheduled recoveries (for diagnostics). */
export function listPendingRecoveries(): string[] {
  return Array.from(pending.keys());
}

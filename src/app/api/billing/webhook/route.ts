/**
 * Flint Tech — Live Stripe Billing Webhook
 *
 * POST /api/billing/webhook
 *
 * Receives Stripe events in live mode only.
 * Verifies the signature, then routes payment-failure events into the
 * Hyperswitch-inspired Revenue Recovery Engine.
 *
 * Configure in Stripe Dashboard (Live mode):
 *   Endpoint URL: https://<your-host>/api/billing/webhook
 *   Events: invoice.payment_failed, charge.failed, payment_intent.payment_failed,
 *           invoice.paid, customer.subscription.updated, customer.subscription.deleted
 */

import { NextResponse } from "next/server";
import { processStripeWebhook } from "@/lib/billing";
import { scheduleDelayedRecovery } from "@/lib/billing/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature") ?? "";

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header" },
      { status: 400 }
    );
  }

  // Stripe requires the exact raw body for signature verification
  const rawBody = await request.text();

  try {
    const result = await processStripeWebhook(rawBody, signature);

    if (!result.received) {
      return NextResponse.json(
        { error: result.error ?? "Webhook rejected" },
        { status: 400 }
      );
    }

    // If recovery decided on a delayed retry, schedule it
    if (
      result.recovery &&
      result.recovery.decision.shouldRetry &&
      result.recovery.decision.delaySeconds > 300 &&
      !result.recovery.success
    ) {
      // The recovery result already contains the decision; the scheduler
      // will re-build context or store the necessary IDs for the later attempt.
      // For v1 we pass the paymentId + delay; a fuller implementation would
      // persist the full RecoveryContext.
      await scheduleDelayedRecovery({
        paymentId: result.recovery.paymentId,
        delaySeconds: result.recovery.decision.delaySeconds,
        attemptNumber: result.recovery.attemptNumber,
        reason: result.recovery.decision.reason,
      });
    }

    return NextResponse.json({
      received: true,
      type: result.type,
      recovery: result.recovery
        ? {
            success: result.recovery.success,
            paymentId: result.recovery.paymentId,
            attemptNumber: result.recovery.attemptNumber,
            shouldRetry: result.recovery.decision.shouldRetry,
            reason: result.recovery.decision.reason,
            delaySeconds: result.recovery.decision.delaySeconds,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Flint Billing Webhook] Unhandled error", message);
    return NextResponse.json({ error: "Internal webhook error" }, { status: 500 });
  }
}

// Stripe sends GET probes sometimes; respond 200 so the endpoint shows as healthy
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "flint-billing-webhook",
    mode: process.env.FLINT_BILLING_MODE ?? "disabled",
  });
}

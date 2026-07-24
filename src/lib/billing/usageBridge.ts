/**
 * Flint Tech — Usage → Stripe metering bridge
 *
 * Subscribes to detailed usage events from saveRequestUsage and reports
 * token counts to live Stripe Billing Meters. Never blocks or fails the
 * AI request path.
 *
 * Call registerFlintUsageBridge() once at server startup.
 */

import { onUsageRecordedDetail, type UsageRecordedDetail } from "@/lib/usage/usageEvents";
import { reportCompletionUsage } from "./reportUsage.js";
import { isLiveBillingEnabled } from "./stripe-client.js";

let registered = false;

function billableInternalId(detail: UsageRecordedDetail): string | null {
  // Prefer API key id (tenant / key owner). Fall back to connection id.
  if (detail.apiKeyId && detail.apiKeyId.length > 0) return `key:${detail.apiKeyId}`;
  if (detail.connectionId && detail.connectionId.length > 0) {
    return `conn:${detail.connectionId}`;
  }
  return null;
}

function onDetail(detail: UsageRecordedDetail): void {
  if (!isLiveBillingEnabled()) return;
  if (detail.success === false) return;

  const input = Math.max(0, Number(detail.tokensInput) || 0);
  const output = Math.max(0, Number(detail.tokensOutput) || 0);
  if (input + output <= 0) return;

  const internalId = billableInternalId(detail);
  if (!internalId) return;

  // Fire-and-forget — never await on the usage path
  void reportCompletionUsage({
    internalId,
    promptTokens: input,
    completionTokens: output,
    model: detail.model ?? undefined,
    provider: detail.provider ?? undefined,
  });
}

/** Idempotent registration for server startup. */
export function registerFlintUsageBridge(): void {
  if (registered) return;
  registered = true;
  onUsageRecordedDetail(onDetail);
  console.info(
    "[Flint Billing] Usage bridge registered — live metering active when FLINT_BILLING_MODE=live"
  );
}

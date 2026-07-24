/**
 * Flint Tech — Usage → Stripe metering bridge
 *
 * Subscribes to emitUsageRecorded (fired after successful usage_history INSERT)
 * and loads the latest row for that connection to obtain token counts + api_key_id.
 * Reports to live Stripe Billing Meters. Never blocks the AI request path.
 *
 * Call registerFlintUsageBridge() once at server startup.
 */

import { onUsageRecorded } from "@/lib/usage/usageEvents";
import { getDbInstance } from "@/lib/db/core";
import { reportCompletionUsage } from "./reportUsage.js";
import { isLiveBillingEnabled } from "./stripe-client.js";

let registered = false;

type LatestUsageRow = {
  api_key_id: string | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  success: number | null;
};

function loadLatestUsage(provider: string, connectionId: string): LatestUsageRow | null {
  try {
    const db = getDbInstance();
    const row = db
      .prepare(
        `SELECT api_key_id, model, tokens_input, tokens_output, success
         FROM usage_history
         WHERE connection_id = ? AND COALESCE(provider, '') = COALESCE(?, '')
         ORDER BY id DESC LIMIT 1`
      )
      .get(connectionId, provider) as LatestUsageRow | undefined;
    return row ?? null;
  } catch (err) {
    console.warn(
      "[Flint Billing] Failed to load latest usage row",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

function onUsage(provider: string, connectionId: string): void {
  if (!isLiveBillingEnabled()) return;

  // Defer slightly so the INSERT transaction is fully visible
  setTimeout(() => {
    try {
      const row = loadLatestUsage(provider, connectionId);
      if (!row) return;
      if (row.success === 0) return;

      const input = Math.max(0, Number(row.tokens_input) || 0);
      const output = Math.max(0, Number(row.tokens_output) || 0);
      if (input + output <= 0) return;

      const internalId = row.api_key_id
        ? `key:${row.api_key_id}`
        : `conn:${connectionId}`;

      void reportCompletionUsage({
        internalId,
        promptTokens: input,
        completionTokens: output,
        model: row.model ?? undefined,
        provider,
      });
    } catch (err) {
      console.error(
        "[Flint Billing] usage bridge error",
        err instanceof Error ? err.message : String(err)
      );
    }
  }, 0);
}

/** Idempotent registration for server startup. */
export function registerFlintUsageBridge(): void {
  if (registered) return;
  registered = true;
  onUsageRecorded(onUsage);
  console.info(
    "[Flint Billing] Usage bridge registered — live metering when FLINT_BILLING_MODE=live"
  );
}

/**
 * Flint Tech — Request-path usage reporting
 *
 * Call after a successful upstream completion (chat / responses / etc.).
 * Fire-and-forget: never blocks or fails the AI response.
 *
 * Example (in proxy completion handler):
 *
 *   void reportCompletionUsage({
 *     internalId: apiKeyOwnerId,
 *     stripeCustomerId: meta.stripeCustomerId,
 *     promptTokens: usage.prompt_tokens,
 *     completionTokens: usage.completion_tokens,
 *     model: modelId,
 *     provider: providerId,
 *   });
 */

import { ensureStripeCustomer } from "./customers.js";
import { recordTokenUsage } from "./metering.js";
import { isLiveBillingEnabled } from "./stripe-client.js";

export interface CompletionUsageReport {
  /** Org / user / key-owner id used to map or create Stripe Customer */
  internalId: string;
  /** If already known from DB */
  stripeCustomerId?: string;
  email?: string;
  name?: string;
  promptTokens: number;
  completionTokens: number;
  model?: string;
  provider?: string;
}

/**
 * Resolve customer and report tokens. Safe to call without await (void).
 */
export async function reportCompletionUsage(
  report: CompletionUsageReport
): Promise<void> {
  if (!isLiveBillingEnabled()) return;

  const total = (report.promptTokens || 0) + (report.completionTokens || 0);
  if (total <= 0) return;
  if (!report.internalId) return;

  try {
    const customerId = await ensureStripeCustomer({
      internalId: report.internalId,
      email: report.email,
      name: report.name,
      stripeCustomerId: report.stripeCustomerId,
    });

    if (!customerId) return;

    await recordTokenUsage({
      customerId,
      promptTokens: report.promptTokens || 0,
      completionTokens: report.completionTokens || 0,
      model: report.model,
      provider: report.provider,
    });
  } catch (err) {
    // Never surface to the client
    console.error("[Flint Metering] reportCompletionUsage failed", {
      internalId: report.internalId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Extract OpenAI-style usage from a response body fragment and report.
 * Accepts partial objects so streaming final chunks work too.
 */
export function reportUsageFromOpenAIShape(
  opts: {
    internalId: string;
    stripeCustomerId?: string;
    model?: string;
    provider?: string;
  },
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  } | null | undefined
): void {
  if (!usage) return;

  const prompt =
    usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const completion =
    usage.completion_tokens ?? usage.output_tokens ?? 0;

  if (prompt + completion <= 0 && usage.total_tokens) {
    void reportCompletionUsage({
      ...opts,
      promptTokens: usage.total_tokens,
      completionTokens: 0,
    });
    return;
  }

  void reportCompletionUsage({
    ...opts,
    promptTokens: prompt,
    completionTokens: completion,
  });
}

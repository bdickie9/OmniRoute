/**
 * Flint Tech Billing — public surface
 */

export {
  getStripeClient,
  isLiveBillingEnabled,
  type FlintBillingMode,
} from "./stripe-client.js";

export {
  recordUsageEvent,
  recordTokenUsage,
  type UsageEvent,
} from "./metering.js";

export {
  classifyDecline,
  decideRecovery,
  attemptRecovery,
  buildContextFromStripeEvent,
  handleFailedPaymentEvent,
  type DeclineClass,
  type RecoveryContext,
  type RecoveryDecision,
  type RecoveryAttemptResult,
} from "./recovery.js";

export {
  processStripeWebhook,
  type WebhookResult,
} from "./webhooks.js";

export {
  scheduleDelayedRecovery,
  listPendingRecoveries,
  isDurableQueueActive,
  type ScheduledRecovery,
  type RecoveryJobPayload,
} from "./scheduler.js";

export {
  FLINT_CATALOG,
  getPlan,
  getSeatPriceId,
  getUsagePriceId,
  type FlintPlanId,
  type FlintPlan,
} from "./catalog.js";

export {
  ensureStripeCustomer,
  type EnsureCustomerInput,
} from "./customers.js";

export { createSeatCheckoutSession } from "./checkout.js";

export {
  reportCompletionUsage,
  reportUsageFromOpenAIShape,
  type CompletionUsageReport,
} from "./reportUsage.js";

export { registerFlintUsageBridge } from "./usageBridge.js";

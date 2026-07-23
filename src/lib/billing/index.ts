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

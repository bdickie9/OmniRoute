/**
 * Flint Tech — Production-only Stripe client
 *
 * Hard rules:
 * - Only live keys (sk_live_...) are accepted.
 * - Test-mode keys cause an immediate startup failure when billing is enabled.
 * - No simulation / mock paths in production code.
 *
 * Account: Flint Tech Global Solutions (acct_1TaUSsEYm87XGaC5)
 */

import Stripe from "stripe";

export type FlintBillingMode = "live" | "disabled";

function assertLiveKey(secretKey: string): void {
  if (!secretKey.startsWith("sk_live_")) {
    throw new Error(
      "[Flint Billing] Refusing to start: only live Stripe keys (sk_live_...) are allowed. " +
        "Test-mode keys are permanently disabled for Flint Tech production revenue. " +
        "Set STRIPE_SECRET_KEY to a live key or set FLINT_BILLING_MODE=disabled."
    );
  }
}

let stripeSingleton: Stripe | null = null;

/**
 * Returns a configured Stripe client or null when billing is explicitly disabled.
 * Throws if a test key is supplied while billing is enabled.
 */
export function getStripeClient(): Stripe | null {
  const mode = (process.env.FLINT_BILLING_MODE ?? "disabled").toLowerCase() as FlintBillingMode;

  if (mode === "disabled") {
    return null;
  }

  if (mode !== "live") {
    throw new Error(
      `[Flint Billing] Invalid FLINT_BILLING_MODE="${mode}". Only "live" or "disabled" are allowed.`
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "[Flint Billing] FLINT_BILLING_MODE=live but STRIPE_SECRET_KEY is missing."
    );
  }

  assertLiveKey(secretKey);

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia", // pin to a known live-compatible version; update as needed
      typescript: true,
      appInfo: {
        name: "Flint OmniRoute Apex Gateway",
        version: process.env.npm_package_version ?? "3.8.49",
        url: "https://github.com/bdickie9/OmniRoute",
      },
    });
  }

  return stripeSingleton;
}

/**
 * Convenience: true only when live billing is fully configured and ready.
 */
export function isLiveBillingEnabled(): boolean {
  try {
    return getStripeClient() !== null;
  } catch {
    return false;
  }
}

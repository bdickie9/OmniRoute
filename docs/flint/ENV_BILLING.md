# Flint Billing Environment Variables

Add these to your production `.env` (never commit real keys).

```bash
# ============================================================
# FLINT TECH — LIVE BILLING (required for real revenue)
# ============================================================

# Must be "live" or "disabled". Any other value (including "test") is rejected.
FLINT_BILLING_MODE=live

# Live secret key only (sk_live_...). sk_test_ keys are refused at startup.
STRIPE_SECRET_KEY=sk_live_...

# Webhook signing secret from the Stripe Dashboard (live mode)
STRIPE_WEBHOOK_SECRET=whsec_...

# Name of the Stripe Billing Meter that receives token/request events
STRIPE_METER_EVENT_NAME=omniroute_tokens

# Optional: default Stripe Customer ID for single-tenant self-hosted installs
# STRIPE_DEFAULT_CUSTOMER_ID=cus_...
```

## Creating the Meter in Stripe (one-time)

1. Go to https://dashboard.stripe.com/acct_1TaUSsEYm87XGaC5/test/billing/meters (switch to **Live** mode).
2. Create a meter named `omniroute_tokens` (or match `STRIPE_METER_EVENT_NAME`).
3. Event name must match exactly.
4. Aggregation: Sum.
5. Attach the meter to a metered Price on a Product (e.g. "OmniRoute Usage").

## Safety

- The code in `src/lib/billing/stripe-client.ts` will **refuse to start** if a test key is supplied while `FLINT_BILLING_MODE=live`.
- No mock or simulation code paths exist for production billing.

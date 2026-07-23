# Flint Max Revenue Playbook

## Live catalog (created in Stripe — livemode)

| Plan | Product ID | Price ID | Amount |
|------|------------|----------|--------|
| **Pro** | `prod_UwDsGiZ7iMShUa` | `price_1TwLQvEYm87XGaC5hw41M62H` | **$49/seat/mo** |
| **Business** | `prod_UwDshxDj9jUE90` | `price_1TwLQxEYm87XGaC5K3PSHpxz` | **$199/seat/mo** |
| **Usage** | `prod_UwDsVNhZL8v2cW` | *(create meter-backed price in Dashboard)* | target **$0.02 / 1k tokens** |

Account: **Flint Tech Global Solutions** `acct_1TaUSsEYm87XGaC5`

### Finish Usage meter (one-time in Dashboard)

1. Billing → Meters → Create meter  
   - Event name: `omniroute_tokens`  
   - Aggregation: Sum  
2. Create Price on **OmniRoute Usage** product  
   - Recurring monthly, metered, attach the meter  
   - unit amount reflecting $0.02 per 1k tokens (or your margin)  
3. Set env: `STRIPE_USAGE_PRICE_ID=price_...` and `STRIPE_METER_EVENT_NAME=omniroute_tokens`

## Revenue stack already in code

1. Live-only Stripe client  
2. Customer ensure/mapping (`customers.ts`)  
3. Catalog + seat checkout (`catalog.ts`, `checkout.ts`)  
4. Token metering skeleton (`metering.ts`)  
5. Payment recovery + durable BullMQ queue  
6. Webhook route `/api/billing/webhook`

## Path to first dollar

1. `FLINT_BILLING_MODE=live` + live keys + webhook secret  
2. Point Stripe webhook at `/api/billing/webhook`  
3. Call `createSeatCheckoutSession({ plan: "pro", ... })` for a real customer  
4. On successful AI completions, call `recordTokenUsage({ customerId, ... })`  
5. Recovery engine protects failed invoice payments  

## Pricing strategy (keep)

- Free self-host forever (open core)  
- Pro $49 → reliability + recovery  
- Business $199 → metered + teams  
- Usage overage → scales with customer success  
- High-ticket white-label later ($1.5k–$50k)

## Next code wiring

- Map each hosted API key → `cus_` via `ensureStripeCustomer`  
- Hook `recordTokenUsage` after successful upstream responses  
- Gate hosted features by active subscription status  

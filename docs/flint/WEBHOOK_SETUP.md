# Flint Stripe Webhook Setup (Live)

## Endpoint

```
POST https://<your-omniroute-host>/api/billing/webhook
```

## Stripe Dashboard configuration

1. Go to https://dashboard.stripe.com/acct_1TaUSsEYm87XGaC5/webhooks (switch to **Live** mode).
2. Add endpoint → paste the URL above.
3. Select events:
   - `invoice.payment_failed`
   - `charge.failed`
   - `payment_intent.payment_failed`
   - `invoice.paid` (optional, for future success hooks)
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** (`whsec_...`) into your environment:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
FLINT_BILLING_MODE=live
STRIPE_SECRET_KEY=sk_live_...
```

## Behaviour

- Signature is verified with the live webhook secret.
- Failed-payment events are classified and fed to the Revenue Recovery Engine.
- Soft declines are retried with exponential backoff.
- Delays > 5 minutes are scheduled in-process (v1). For production durability, replace the scheduler with a real job queue.
- Immediate retries (≤ 5 min) run inside the webhook request.

## Health check

```
GET /api/billing/webhook
→ { "status": "ok", "service": "flint-billing-webhook", "mode": "live" }
```

## Safety

- Only operates when `FLINT_BILLING_MODE=live` and a live secret key is present.
- Test-mode keys are rejected at the Stripe client layer.

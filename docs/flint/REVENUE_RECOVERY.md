# Flint Revenue Recovery Engine

Hyperswitch-inspired intelligent payment recovery for **live** Stripe only.

## What it does

When a payment fails (`invoice.payment_failed`, `charge.failed`, `payment_intent.payment_failed`):

1. Classifies the decline as **soft**, **hard**, or **unknown**
2. Decides whether to retry based on:
   - Decline code
   - Card BIN (when available)
   - Region / country
   - Ticket size (higher value → more aggressive)
   - Current attempt count vs retry budget
3. Calculates exponential backoff with jitter
4. Attempts recovery via `invoice.pay` or `paymentIntents.confirm`
5. Logs every decision and outcome for audit

## Soft vs Hard Declines

| Class | Examples | Default behaviour |
|-------|----------|-------------------|
| Soft | `insufficient_funds`, `try_again_later`, `do_not_honor`, `generic_decline` | Retry with backoff |
| Hard | `lost_card`, `stolen_card`, `fraudulent`, `pickup_card` | Exit recovery (except limited false-positive cases) |
| Unknown | anything else | Treat as soft (retry) |

Certain hard codes that are frequently false positives (`do_not_honor`, `generic_decline`) receive a single delayed retry.

## Configuration

```bash
FLINT_BILLING_MODE=live
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional tuning
FLINT_RECOVERY_MAX_ATTEMPTS=5
FLINT_RECOVERY_PENALTY_BUDGET_CENTS=5000   # $50
```

## Integration

### Webhook endpoint (Next.js example)

```ts
// app/api/billing/webhook/route.ts
import { processStripeWebhook } from "@/lib/billing";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const result = await processStripeWebhook(rawBody, signature);
  return Response.json(result, { status: result.received ? 200 : 400 });
}
```

### Manual decision / attempt

```ts
import { decideRecovery, attemptRecovery } from "@/lib/billing";

const decision = decideRecovery(ctx);
if (decision.shouldRetry) {
  // schedule or call attemptRecovery(ctx)
}
```

## Scheduling delayed retries

When `decision.delaySeconds > 300` the engine returns the decision without executing immediately. Wire this to your preferred job queue / cron (e.g. Inngest, BullMQ, or a simple SQLite-backed scheduler) so the retry happens after the calculated delay.

## Safety

- Refuses to run unless `FLINT_BILLING_MODE=live` and a live key is present
- Never breaks the main request path
- All attempts are logged with payment ID, attempt number, and reason

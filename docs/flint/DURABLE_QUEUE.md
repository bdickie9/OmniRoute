# Flint Durable Recovery Queue

## Best design (what we implemented)

**Primary:** [BullMQ](https://docs.bullmq.io/) + Redis  
**Fallback:** in-memory timers (local / no Redis only)

This is the best fit for OmniRoute + Flint Tech because:

- OmniRoute already works with Redis in production deployments
- Payment recovery must survive restarts and deploys
- Multi-instance safe (deduped job IDs per `paymentId`)
- No extra SaaS dependency for core revenue path
- Callers (`scheduleDelayedRecovery`) stay the same

## Install

```bash
npm install bullmq
# Redis must be reachable
```

## Environment

```bash
FLINT_BILLING_MODE=live
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Durable queue (recommended for production)
FLINT_RECOVERY_REDIS_URL=redis://localhost:6379
# or REDIS_URL / OMNIROUTE_REDIS_URL
```

Without a Redis URL the engine logs once and uses memory fallback.

## Behaviour

| Situation | Backend | Survives restart? |
|-----------|---------|-------------------|
| Redis URL set + bullmq installed | BullMQ | Yes |
| No Redis / bullmq missing | Memory | No |
| BullMQ enqueue error | Memory fallback | No |

Jobs:

- Queue name: `flint-revenue-recovery`
- Job name: `recovery.retry`
- Job id: `recovery:<paymentId>` (prevents duplicate delayed jobs)
- Job attempts: 3 with exponential backoff (60s base)
- Worker concurrency: 2 (in-process)

Workers always **re-fetch** the invoice/PaymentIntent and skip if already paid — safe under at-least-once delivery.

## Production notes

1. Run Redis with persistence (AOF or RDB) so delayed jobs are not lost on Redis restart.
2. For high volume, run a dedicated worker process instead of only in-process workers.
3. Monitor failed jobs in Redis / BullMQ Board if you add a UI later.
4. Memory fallback is **not** acceptable for real revenue at scale — treat Redis as required in production.

## API

```ts
import { scheduleDelayedRecovery, isDurableQueueActive } from "@/lib/billing";

await scheduleDelayedRecovery({
  paymentId: "in_...",
  delaySeconds: 3600,
  attemptNumber: 1,
  reason: "soft decline — insufficient_funds",
});

const durable = await isDurableQueueActive();
```

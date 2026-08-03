# Request-path metering (wired)

## How it works

```text
successful AI completion
  → saveRequestUsage() inserts usage_history row
  → emitUsageRecordedDetail({ tokensInput, tokensOutput, apiKeyId, ... })
  → Flint usageBridge (registered at startup)
  → ensureStripeCustomer(internalId)
  → recordTokenUsage → Stripe meter event (live)
```

## Identity mapping

| Source | Stripe Customer metadata |
|--------|--------------------------|
| `apiKeyId` present | `flint_internal_id = key:<apiKeyId>` |
| else `connectionId` | `flint_internal_id = conn:<connectionId>` |

Only **successful** requests with token counts &gt; 0 are metered.

## Enable

```bash
FLINT_BILLING_MODE=live
STRIPE_SECRET_KEY=sk_live_...
STRIPE_METER_EVENT_NAME=omniroute_tokens   # after Dashboard meter exists
```

## Code

- Event: `src/lib/usage/usageEvents.ts` → `emitUsageRecordedDetail`
- Emitter: `saveRequestUsage` in `usageHistory.ts`
- Bridge: `src/lib/billing/usageBridge.ts`
- Startup: `registerFlintUsageBridge()` in `server-init.ts`

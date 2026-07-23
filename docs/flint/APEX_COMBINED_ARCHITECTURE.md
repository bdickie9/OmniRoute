# Flint Apex Combined Architecture

**Status**: Active implementation on branch `flint/apex-combine-v1`  
**Goal**: Combine the absolute best of OmniRoute + LiteLLM + Portkey + Hyperswitch + Langfuse + modern SaaS starters into one real, production, revenue-generating AI gateway under Flint Tech Global Solutions.

## Design Principles (non-negotiable)

1. **100% real money** — live Stripe keys only. Test-mode keys are rejected at startup.
2. **Immediate revenue** — every request can be metered and billed.
3. **Open-core** — core routing/compression/MCP stays MIT and free; paid features live on top.
4. **Self-healing + revenue recovery** — Hyperswitch-style intelligent retries for failed payments.
5. **Observability feeds revenue intelligence** — Langfuse-style traces feed APEX platforms.
6. **Compliance first** — PCI DSS, data privacy, Minnesota / federal requirements.

## Layers

### Layer 1 — OmniRoute Core (keep & amplify)
- 278+ providers, 90+ free tiers, honest accounting
- RTK + Caveman + 11-engine stacked compression (15–95% savings)
- 18 routing strategies + Auto-Combo + Quota-Share
- Full MCP (104 tools) + A2A
- 3-layer resilience + TLS stealth
- Local-first, Desktop/PWA/Termux

### Layer 2 — Cost & Budget Control (from LiteLLM)
- Per-key / per-team / per-model budgets
- Virtual keys
- Real-time cost telemetry already partially present → extend into full budget enforcement

### Layer 3 — Production Guardrails & Caching (from Portkey)
- Stronger PII / prompt-injection / jailbreak guards
- Semantic caching layer
- Conditional / metadata-driven routing

### Layer 4 — Revenue Engine (from Hyperswitch + Stripe)
- Live Stripe metered billing (tokens, requests, models)
- Subscription tiers + high-ticket licenses
- Intelligent revenue recovery (retry by decline code, BIN, region, ticket size, etc.)
- Reconciliation hooks

### Layer 5 — Observability → APEX (from Langfuse)
- Traces, generations, evals, prompt management
- Feeds Flint APEX Revenue Sovereignty / GTM Command Center

### Layer 6 — Multi-tenant Auth & SaaS (from better-auth / saas-starters)
- Production auth
- White-label / multi-tenant mode for enterprise sales

## Implementation Status

| Component                        | Status          | Location                          |
|----------------------------------|-----------------|-----------------------------------|
| Architecture document            | Done            | this file                         |
| Live-only Stripe client          | Done (v1)       | `src/lib/billing/stripe-client.ts`|
| Usage metering skeleton          | Done (v1)       | `src/lib/billing/metering.ts`     |
| Webhook handler skeleton         | Planned         | `src/server/billing/webhooks.ts`  |
| Revenue recovery engine          | Planned         | `src/lib/billing/recovery.ts`     |
| Dashboard billing UI             | Planned         | dashboard routes                  |
| Langfuse integration             | Planned         | observability layer               |
| Multi-tenant mode                | Planned         | auth + tenancy                    |

## Environment (Live Only)

```bash
# REQUIRED for production revenue
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_METER_EVENT_NAME=omniroute_tokens   # or similar
FLINT_BILLING_MODE=live                    # "test" is rejected
```

Any `sk_test_` key will cause the process to refuse to start when billing is enabled.

## Next Concrete Steps

1. Wire metering into the existing request lifecycle (after successful upstream response).
2. Create Stripe Products / Prices / Meters in the live Flint Tech account.
3. Implement webhook handler for `invoice.paid`, `invoice.payment_failed`, `customer.subscription.*`.
4. Add recovery logic for failed payments.
5. Expose usage + spend in the existing analytics dashboard.
6. Add multi-tenant isolation.

This document is the single source of truth for the combined system.

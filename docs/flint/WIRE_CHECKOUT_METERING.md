# Wire Checkout + Metering

## Checkout (live seats)

```http
POST /api/billing/checkout
Authorization: Bearer <manage-scope API key or dashboard session>
Content-Type: application/json

{
  "plan": "pro",
  "internalId": "org_abc123",
  "email": "customer@company.com",
  "quantity": 1,
  "successUrl": "https://your-host/billing/success",
  "cancelUrl": "https://your-host/billing/cancel"
}
```

Response: `{ "url": "https://checkout.stripe.com/...", "sessionId": "cs_live_...", "plan": "pro" }`

Redirect the browser to `url`.

Catalog (public):

```http
GET /api/billing/catalog
→ { billingEnabled, plans: [...] }
```

## Metering on the request path

After a successful upstream response that includes token usage:

```ts
import { reportUsageFromOpenAIShape } from "@/lib/billing";

// non-blocking
reportUsageFromOpenAIShape(
  {
    internalId: keyOwnerId,          // stable org/user id
    stripeCustomerId: storedCusId,   // optional if already known
    model: modelId,
    provider: providerId,
  },
  response.usage // { prompt_tokens, completion_tokens } or input/output_tokens
);
```

Or full control:

```ts
void reportCompletionUsage({
  internalId: "org_abc",
  promptTokens: 1200,
  completionTokens: 400,
  model: "gpt-4.1",
  provider: "openai",
});
```

Requirements:

- `FLINT_BILLING_MODE=live`
- `STRIPE_SECRET_KEY=sk_live_...`
- Billing Meter + `STRIPE_METER_EVENT_NAME=omniroute_tokens` for usage charges

## Proxy integration point

Ideal hook: wherever OmniRoute finalizes a non-streaming or streaming completion and already records local usage/cost telemetry. Add one `reportUsageFromOpenAIShape(...)` call there with the authenticated key’s owner id.

Until that deep hook ships, you can also call the helper from any custom middleware or post-processing layer that sees `usage`.

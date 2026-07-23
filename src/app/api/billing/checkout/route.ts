/**
 * Flint Tech — Live seat checkout
 *
 * POST /api/billing/checkout
 * Body: { plan: "pro" | "business", internalId, email?, name?, quantity?, successUrl, cancelUrl }
 *
 * Returns { url } for Stripe Checkout (live mode only).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createSeatCheckoutSession, isLiveBillingEnabled } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  plan: z.enum(["pro", "business"]),
  internalId: z.string().min(1).max(200),
  email: z.string().email().optional(),
  name: z.string().max(200).optional(),
  quantity: z.number().int().min(1).max(500).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  stripeCustomerId: z.string().startsWith("cus_").optional(),
});

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request, { alwaysRequireAuth: true });
  if (authError) return authError;

  if (!isLiveBillingEnabled()) {
    return NextResponse.json(
      { error: "Live billing is disabled. Set FLINT_BILLING_MODE=live and STRIPE_SECRET_KEY=sk_live_..." },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createSeatCheckoutSession(parsed.data);
    if (!result.url) {
      return NextResponse.json(
        { error: result.error ?? "Checkout session failed" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      plan: parsed.data.plan,
    });
  } catch (err) {
    console.error("[Flint Checkout] Error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}

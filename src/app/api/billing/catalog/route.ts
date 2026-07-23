/**
 * GET /api/billing/catalog — public plan list (no secrets)
 */

import { NextResponse } from "next/server";
import { FLINT_CATALOG, isLiveBillingEnabled } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const plans = (Object.values(FLINT_CATALOG) as Array<(typeof FLINT_CATALOG)[keyof typeof FLINT_CATALOG]>).map(
    (p) => ({
      id: p.id,
      name: p.name,
      unitAmountCents: p.unitAmountCents,
      lookupKey: p.lookupKey,
      features: p.features,
      // priceId is safe to expose for Checkout (not a secret)
      priceId: p.priceId,
      productId: p.productId,
    })
  );

  return NextResponse.json({
    billingEnabled: isLiveBillingEnabled(),
    currency: "usd",
    plans,
  });
}

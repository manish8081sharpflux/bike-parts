import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { refreshBorzoOrderTracking } from "@/lib/order-delivery-state";
import { enforceApiRateLimit } from "@/lib/security/api-protection";

// Nothing before a real courier accepts the job (or after delivery/
// cancellation) is worth polling Borzo for — skip the real API call and
// just report nothing changed.
const REFRESHABLE_STATUSES = ["PAID", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"] as const;
// A second guard independent of the rate limiter: even a legitimate single
// customer with several tabs open on the same order should never trigger
// more than one real Borzo call in this window.
const MIN_REFRESH_INTERVAL_MS = 15_000;

/**
 * Lets the customer's own order-tracking screen pull a fresh Borzo status
 * (courier assignment, live position, distance) while they're actively
 * viewing it, instead of only ever updating when an admin happens to click
 * "Refresh Tracking" on a completely different screen. Read-only towards
 * the customer — every actual mutation goes through the same
 * refreshBorzoOrderTracking core the admin action uses (see
 * lib/order-delivery-state.ts), so the two surfaces can never disagree on
 * how a Borzo status maps to order state.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  // Generous — this is a background poll of one order's own screen, not a
  // per-click action, but still bounded so a stuck client can't hammer Borzo.
  const limited = await enforceApiRateLimit(request, "order-refresh-tracking", { limit: 60, windowMs: 5 * 60_000 }, session.user.id);
  if (limited) return limited;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const isEligible =
    order.shippingProvider === "BORZO" &&
    order.shippingOrderId &&
    order.shippingOrderId !== "CREATING" &&
    !order.shippingReconciliationRequired &&
    REFRESHABLE_STATUSES.includes(order.status as (typeof REFRESHABLE_STATUSES)[number]);
  if (!isEligible) {
    return NextResponse.json({ refreshed: false });
  }

  if (order.shippingLastUpdatedAt && Date.now() - order.shippingLastUpdatedAt.getTime() < MIN_REFRESH_INTERVAL_MS) {
    return NextResponse.json({ refreshed: false, throttled: true });
  }

  try {
    await refreshBorzoOrderTracking(order);
    return NextResponse.json({ refreshed: true });
  } catch (error) {
    // Best-effort: a transient Borzo/network hiccup here should never break
    // the customer's own page. The next poll tries again.
    console.error("[shipping] Customer-triggered tracking refresh failed for order", id, error);
    return NextResponse.json({ refreshed: false });
  }
}

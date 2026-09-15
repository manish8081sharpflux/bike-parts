import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { enforceApiRateLimit, rejectInvalidJsonRequest } from "@/lib/security/api-protection";
import { quoteCheckoutDelivery } from "@/lib/checkout-delivery";

type QuoteItem = { id: string; quantity: number };
type QuoteBody = { addressId: string; items: QuoteItem[] };

/**
 * A real, live delivery-fee estimate for the cart preview — shown before
 * the customer has committed to checkout, using their already-selected
 * (usually default) saved address. Read-only: no order, no stock
 * reservation, nothing created. Uses the exact same quoteCheckoutDelivery
 * call the real checkout charge is computed from, so this preview and the
 * amount actually charged never diverge.
 */
export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  // A generous bucket relative to /api/checkout's — this is called on every
  // cart open/quantity change (debounced client-side), not once per order.
  const limited = await enforceApiRateLimit(request, "checkout-delivery-quote", { limit: 40, windowMs: 5 * 60_000 }, session.user.id);
  if (limited) return limited;
  const invalidJson = rejectInvalidJsonRequest(request);
  if (invalidJson) return invalidJson;

  let body: QuoteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ deliveryCharge: 0, isRealQuote: false });
  }
  if (!body.addressId || typeof body.addressId !== "string") {
    return NextResponse.json({ deliveryCharge: 0, isRealQuote: false });
  }

  // Same ownership check as /api/checkout — never quote against an address
  // that isn't this customer's own.
  const savedAddress = await prisma.address.findFirst({
    where: { id: body.addressId, userId: session.user.id },
  });
  if (!savedAddress) {
    return NextResponse.json({ deliveryCharge: 0, isRealQuote: false });
  }

  const requestedIds = body.items
    .map((raw) => (raw && typeof raw.id === "string" ? raw.id : null))
    .filter((id): id is string => id !== null);
  const catalogItems = await prisma.bikePartListing.findMany({
    where: { id: { in: requestedIds }, status: "ACTIVE" },
  });
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

  const resolvedItems: Array<{ name: string; quantity: number; weightKg: number | null }> = [];
  for (const raw of body.items) {
    const quantity = Number(raw?.quantity);
    const catalogItem = raw && typeof raw.id === "string" ? catalogById.get(raw.id) : undefined;
    if (!catalogItem || !Number.isFinite(quantity) || quantity <= 0 || quantity > 20) continue;
    resolvedItems.push({
      name: catalogItem.name,
      quantity: Math.floor(quantity),
      weightKg: catalogItem.weightKg != null ? Number(catalogItem.weightKg) : null,
    });
  }
  if (resolvedItems.length === 0) {
    return NextResponse.json({ deliveryCharge: 0, isRealQuote: false });
  }

  const quote = await quoteCheckoutDelivery(savedAddress, resolvedItems);
  return NextResponse.json({ deliveryCharge: quote.amount, isRealQuote: quote.isRealQuote, reason: quote.reason });
}

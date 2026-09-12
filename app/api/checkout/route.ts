import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay";
import {
  OutOfStockError,
  releaseExpiredReservations,
  releaseOrderStock,
  reserveStock,
} from "@/lib/checkout-stock";
import { calculateCheckoutTotals } from "@/lib/checkout-amount";

type CheckoutItem = {
  id: string;
  quantity: number;
};

type CheckoutBody = {
  customerName: string;
  customerPhone: string;
  bikeLabel?: string;
  deliveryAddress: Record<string, unknown>;
  items: CheckoutItem[];
};

export async function POST(request: Request) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured on the server yet." },
      { status: 503 }
    );
  }

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.customerName || !body.customerPhone || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "customerName, customerPhone, and at least one item are required." },
      { status: 400 }
    );
  }

  // Phone is the primary customer identifier (upsert key on User, and the
  // contact number handed to Porter for delivery) — previously accepted as
  // any non-empty string, so "abc" or "1" would silently create an
  // undeliverable order. Matches the same 10-digit rule LoginModal already
  // enforces client-side, so a request that actually came through the
  // storefront's own login can never trip this.
  if (!/^\d{10}$/.test(body.customerPhone)) {
    return NextResponse.json({ error: "A valid 10-digit phone number is required." }, { status: 400 });
  }

  // deliveryAddress was previously accepted as-is with zero validation —
  // an order could be created with a missing city/pincode and only fail
  // confusingly later, at Porter dispatch time, long after payment.
  const address = body.deliveryAddress;
  const addressCity = typeof address?.city === "string" ? address.city.trim() : "";
  const addressPincode = typeof address?.pincode === "string" ? address.pincode.trim() : "";
  const addressContactName =
    typeof address?.contactName === "string" ? address.contactName.trim() : "";
  const addressLine =
    typeof address?.flatNo === "string" && address.flatNo.trim()
      ? address.flatNo.trim()
      : typeof address?.area === "string"
      ? address.area.trim()
      : "";
  if (!addressCity || !/^\d{6}$/.test(addressPincode) || !addressContactName || !addressLine) {
    return NextResponse.json(
      { error: "Delivery address is incomplete — contact name, a flat/area, city, and a 6-digit pincode are required." },
      { status: 400 }
    );
  }

  // Self-healing cleanup for abandoned checkouts — see releaseExpiredReservations's
  // own comment for why this runs here instead of on a schedule. Best-effort:
  // never let a hiccup here block a real checkout.
  await releaseExpiredReservations().catch(() => {});

  // Resolve every requested item against the real catalog server-side —
  // never trust the client's submitted name/price/image. This matters for
  // two reasons: correctness (an id that doesn't exist should be rejected
  // outright, not silently priced at whatever the client sent) and security
  // (previously price came straight from the request body, so anyone could
  // tamper with it and pay ₹1 for a ₹5,000 part). Batched into one query
  // rather than looked up per item.
  const requestedIds = body.items
    .map((raw) => (raw && typeof raw.id === "string" ? raw.id : null))
    .filter((id): id is string => id !== null);
  const catalogItems = await prisma.bikePartListing.findMany({
    where: { id: { in: requestedIds }, status: "ACTIVE" },
  });
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

  const resolvedItems: Array<{ id: string; name: string; image?: string; price: number; gstRate: number; quantity: number }> = [];
  for (const raw of body.items) {
    const quantity = Number(raw?.quantity);
    const catalogItem = raw && typeof raw.id === "string" ? catalogById.get(raw.id) : undefined;
    // Upper-bounded too — not just >0. Nothing in the cart UI lets a
    // customer pick a triple-digit quantity of a spare part; without this
    // a tampered request could reserve a product's entire stock in one go.
    if (!catalogItem || !Number.isFinite(quantity) || quantity <= 0 || quantity > 20) {
      return NextResponse.json({ error: "Cart contains an invalid item." }, { status: 400 });
    }
    resolvedItems.push({
      id: catalogItem.id,
      name: catalogItem.name,
      image: catalogItem.imageUrl ?? undefined,
      price: Number(catalogItem.price),
      gstRate: Number(catalogItem.gstRate),
      quantity: Math.floor(quantity),
    });
  }

  const { itemsTotal, taxAmount, deliveryCharge, discount, amount } =
    calculateCheckoutTotals(resolvedItems);

  // Reserve stock atomically before creating anything else. If two people
  // hit checkout for the last unit of the same item at the same instant,
  // only one of these succeeds — the other gets a clean 409 with exactly
  // which item(s) ran out, before any order or payment is created.
  try {
    await reserveStock(resolvedItems.map((item) => ({ id: item.id, quantity: item.quantity })));
  } catch (error) {
    if (error instanceof OutOfStockError) {
      return NextResponse.json(
        {
          error:
            error.items.length === 1
              ? `${error.items[0].name} just sold out.`
              : "Some items in your cart just sold out.",
          outOfStock: error.items,
        },
        { status: 409 }
      );
    }
    throw error;
  }

  const user = await prisma.user.upsert({
    where: { phone: body.customerPhone },
    update: { name: body.customerName },
    create: { phone: body.customerPhone, name: body.customerName },
  });

  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      bikeLabel: body.bikeLabel,
      deliveryAddress: body.deliveryAddress as object,
      itemsTotal,
      taxAmount,
      deliveryCharge,
      discount,
      amount,
      stockReserved: true,
      items: {
        create: resolvedItems.map((item) => ({
          listingId: item.id,
          productName: item.name,
          productImage: item.image,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
      },
    },
  });

  try {
    const razorpayOrder = await createRazorpayOrder({
      amountInPaise: Math.round(amount * 100),
      receipt: order.id,
      notes: { orderId: order.id, customerPhone: body.customerPhone },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: razorpayOrder.id },
    });

    return NextResponse.json({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amount,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    // Razorpay order creation failed — this cart never got a chance to pay,
    // so give the stock back immediately rather than waiting for the expiry
    // sweep to notice.
    await releaseOrderStock(order.id);
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });

    // Always log the real error server-side. Only ever show the customer our
    // own deliberately-thrown config message (e.g. "Razorpay is not
    // configured...", useful during local setup) — the Razorpay SDK's own
    // failures (rate limits, network blips, transient API errors) can throw
    // raw internal messages like "Cannot read properties of undefined
    // (reading 'status')" that leak implementation details and look like an
    // app bug rather than a "please try again" situation.
    console.error("Razorpay order creation failed:", error);

    // Also record it on the order itself (admin-only, via the Activity log)
    // — the console.error above only ever reaches whoever happens to be
    // watching the server's terminal at that exact moment, so a failure like
    // this was otherwise undiagnosable after the fact.
    const rawMessage = error instanceof Error ? error.message : String(error);
    await prisma.orderEvent
      .create({
        data: {
          orderId: order.id,
          type: "PAYMENT_FAILED",
          message: `Razorpay order creation failed — ${rawMessage.slice(0, 500)}`,
        },
      })
      .catch(() => {});

    const message =
      error instanceof Error && error.message.startsWith("Razorpay is not configured")
        ? error.message
        : "Could not start payment right now. Please try again in a moment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay";
import {
  OutOfStockError,
  releaseExpiredReservations,
  releaseOrderAndRecordEvent,
  reserveStock,
} from "@/lib/checkout-stock";
import { calculateCheckoutTotals } from "@/lib/checkout-amount";
import { getCustomerSession } from "@/lib/auth/customer-session";

type CheckoutItem = {
  id: string;
  quantity: number;
};

type CheckoutBody = {
  bikeLabel?: string;
  addressId: string;
  items: CheckoutItem[];
};

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

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

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "At least one item is required." },
      { status: 400 }
    );
  }

  if (!body.addressId || typeof body.addressId !== "string") {
    return NextResponse.json({ error: "A delivery address is required." }, { status: 400 });
  }

  // The client sends only an addressId — never trust an address object from
  // the request body. Loading by id *and* the current session's userId in
  // one query (never findUnique by id alone) is what stops User B from
  // checking out against User A's saved address just by guessing/reusing
  // its id.
  const savedAddress = await prisma.address.findFirst({
    where: { id: body.addressId, userId: session.user.id },
  });
  if (!savedAddress) {
    return NextResponse.json({ error: "Selected delivery address was not found." }, { status: 404 });
  }

  // Snapshot the address fields onto the order now, immutably — see
  // Order.deliveryAddress. Orders never read the live Address row again
  // after this, so editing or deleting the saved address later cannot
  // change an already-placed order or what Porter dispatches with.
  const deliveryAddressSnapshot = {
    sourceAddressId: savedAddress.id,
    label: savedAddress.label,
    contactName: savedAddress.contactName,
    phone: savedAddress.phone,
    flatNo: savedAddress.flatNo,
    floor: savedAddress.floor,
    area: savedAddress.area,
    landmark: savedAddress.landmark,
    city: savedAddress.city,
    state: savedAddress.state,
    pincode: savedAddress.pincode,
    latitude: savedAddress.latitude,
    longitude: savedAddress.longitude,
  };

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

  // Reserve stock and create the order in one transaction. If either fails,
  // PostgreSQL rolls back the reservation and all order/customer mutations.
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      await reserveStock(
        tx,
        resolvedItems.map((item) => ({ id: item.id, quantity: item.quantity }))
      );

      const user = session.user;
      if (savedAddress.contactName !== user.name) {
        await tx.user.update({ where: { id: user.id }, data: { name: savedAddress.contactName } });
      }

      return tx.order.create({
        data: {
          buyerId: user.id,
          customerName: savedAddress.contactName,
          customerPhone: user.phone!,
          bikeLabel: body.bikeLabel,
          deliveryAddress: deliveryAddressSnapshot,
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
    });
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

  try {
    const user = session.user;
    const razorpayOrder = await createRazorpayOrder({
      amountInPaise: Math.round(amount * 100),
      receipt: order.id,
      notes: { orderId: order.id, customerPhone: user.phone! },
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
    await releaseOrderAndRecordEvent(
      order.id,
      "PAYMENT_FAILED",
      `Razorpay order creation failed — ${rawMessage.slice(0, 500)}; stock reservation was released.`
    );
    const message =
      error instanceof Error && error.message.startsWith("Razorpay is not configured")
        ? error.message
        : "Could not start payment right now. Please try again in a moment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

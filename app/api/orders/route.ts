import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";

/**
 * Returns order history for a phone number. The storefront's login is a
 * simple phone-entry (no OTP), so this endpoint trusts the phone number the
 * same way the rest of the app does — it is not a secure per-user API and
 * should not be treated as one once real OTP/auth is added.
 */
export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { buyerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      // Oldest first — the client uses this to find *when* each stage was
      // first reached for the tracking stepper's timestamps, real data
      // instead of guessed fixed offsets from placedAt.
      events: { orderBy: { createdAt: "asc" } },
    },
    take: 50,
  });

  return NextResponse.json({
    orders: orders.map((order) => ({
      id: order.id,
      placedAt: order.createdAt.getTime(),
      status: order.status,
      paymentStatus: order.paymentStatus,
      bikeLabel: order.bikeLabel,
      itemsTotal: Number(order.itemsTotal),
      taxAmount: Number(order.taxAmount),
      deliveryCharge: Number(order.deliveryCharge),
      discount: Number(order.discount),
      amount: Number(order.amount),
      deliveryAddress: order.deliveryAddress,
      porterStatus: order.porterStatus,
      porterTrackingUrl: order.porterTrackingUrl,
      refundStatus: order.refundStatus,
      refundReason: order.refundReason,
      refundAdminNote: order.refundAdminNote,
      refundAmount: order.refundAmount === null ? null : Number(order.refundAmount),
      refundRequestedAt: order.refundRequestedAt ? order.refundRequestedAt.getTime() : null,
      refundProcessedAt: order.refundProcessedAt ? order.refundProcessedAt.getTime() : null,
      items: order.items.map((item) => ({
        name: item.productName,
        image: item.productImage,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      events: order.events.map((event) => ({
        type: event.type,
        message: event.message,
        createdAt: event.createdAt.getTime(),
      })),
    })),
  });
}

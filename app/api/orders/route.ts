import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";

/** Customer order history, scoped to the authenticated customer session. */
export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { buyerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { productReviews: {
        where: { userId: session.user.id },
        select: { id: true, rating: true, reviewText: true, createdAt: true, updatedAt: true },
      } } },
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
      returnStatus: order.returnStatus,
      returnReason: order.returnReason,
      returnAdminNote: order.returnAdminNote,
      returnRequestedAt: order.returnRequestedAt ? order.returnRequestedAt.getTime() : null,
      returnPorterTrackingUrl: order.returnPorterTrackingUrl,
      returnReceivedAt: order.returnReceivedAt ? order.returnReceivedAt.getTime() : null,
      items: order.items.map((item) => ({
        id: item.id,
        listingId: item.listingId,
        canReview: order.status === "DELIVERED" && item.listingId !== null && !item.productReviews.length,
        review: item.productReviews[0] ?? null,
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

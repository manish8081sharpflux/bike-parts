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
      // Item/quantity-level returns (see lib/order-returns/service.ts) —
      // each shown as its own independent entry, separate from the legacy
      // whole-order return* fields below.
      orderReturns: { include: { items: true }, orderBy: { createdAt: "asc" } },
    },
    take: 50,
  });

  return NextResponse.json({
    orders: orders.map((order) => {
      // Non-REJECTED returned quantity per item, used both to disable
      // reordering past the purchased quantity in the return UI and to show
      // "N left to return" without exposing the server's row-locked
      // transactional check (see requestPartialReturn) to the client.
      const returnedByItem = new Map<string, number>();
      for (const orderReturn of order.orderReturns) {
        if (orderReturn.status === "REJECTED") continue;
        for (const line of orderReturn.items) {
          returnedByItem.set(line.orderItemId, (returnedByItem.get(line.orderItemId) ?? 0) + line.quantity);
        }
      }
      return {
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
        shippingProvider: order.shippingProvider,
        shippingStatus: order.shippingStatus,
        shippingTrackingUrl: order.shippingTrackingUrl,
        shippingAwbCode: order.shippingAwbCode,
        shippingCourierName: order.shippingCourierName,
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
        returnShippingProvider: order.returnShippingProvider,
        returnShippingTrackingUrl: order.returnShippingTrackingUrl,
        returnShippingAwbCode: order.returnShippingAwbCode,
        returnShippingCourierName: order.returnShippingCourierName,
        returnReceivedAt: order.returnReceivedAt ? order.returnReceivedAt.getTime() : null,
        items: order.items.map((item) => {
          const returned = returnedByItem.get(item.id) ?? 0;
          return {
            id: item.id,
            listingId: item.listingId,
            canReview: order.status === "DELIVERED" && item.listingId !== null && !item.productReviews.length,
            review: item.productReviews[0] ?? null,
            name: item.productName,
            image: item.productImage,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            returnedQuantity: returned,
            remainingReturnable: order.status === "DELIVERED" ? item.quantity - returned : 0,
          };
        }),
        events: order.events.map((event) => ({
          type: event.type,
          message: event.message,
          createdAt: event.createdAt.getTime(),
        })),
        // Item/quantity-level returns, each with its own independent
        // lifecycle — see lib/order-returns/service.ts. Separate from the
        // legacy whole-order returnStatus/returnReason/etc. fields above,
        // which keep working exactly as before for pre-existing returns.
        partialReturns: order.orderReturns.map((orderReturn) => ({
          id: orderReturn.id,
          status: orderReturn.status,
          reason: orderReturn.reason,
          adminNote: orderReturn.adminNote,
          requestedAt: orderReturn.requestedAt.getTime(),
          approvedAt: orderReturn.approvedAt ? orderReturn.approvedAt.getTime() : null,
          receivedAt: orderReturn.receivedAt ? orderReturn.receivedAt.getTime() : null,
          condition: orderReturn.condition,
          shippingProvider: orderReturn.shippingProvider,
          shippingStatus: orderReturn.shippingStatus,
          shippingTrackingUrl: orderReturn.shippingTrackingUrl,
          shippingAwbCode: orderReturn.shippingAwbCode,
          shippingCourierName: orderReturn.shippingCourierName,
          refundStatus: orderReturn.refundStatus,
          refundAmount: orderReturn.refundAmount === null ? null : Number(orderReturn.refundAmount),
          refundProcessedAt: orderReturn.refundProcessedAt ? orderReturn.refundProcessedAt.getTime() : null,
          items: orderReturn.items.map((line) => {
            const purchased = order.items.find((item) => item.id === line.orderItemId);
            return {
              orderItemId: line.orderItemId,
              quantity: line.quantity,
              productName: purchased?.productName ?? "Item",
            };
          }),
        })),
      };
    }),
  });
}

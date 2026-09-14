import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { checkAdminServiceability } from "@/lib/shipping/admin-serviceability";
import { PackageBuildError } from "@/lib/shipping/package";

type DeliveryAddress = { pincode?: string };

/** Courier options for one PARTIAL return's reverse shipment — built from only this return's items/quantities, never the full order. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; returnId: string }> }) {
  try {
    await requireAdminAction();
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, returnId } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const orderReturn = await prisma.orderReturn.findUnique({
    where: { id: returnId },
    include: { items: { include: { orderItem: { include: { listing: true } } } } },
  });
  if (!orderReturn || orderReturn.orderId !== id) return NextResponse.json({ error: "Return not found." }, { status: 404 });

  const pickupPincode = (order.deliveryAddress as DeliveryAddress | null)?.pincode;
  const deliveryPincode = process.env.WAREHOUSE_PINCODE;
  if (!pickupPincode || !deliveryPincode) {
    return NextResponse.json({ error: "Warehouse or customer pincode is not available." }, { status: 400 });
  }

  try {
    const result = await checkAdminServiceability({
      pickupPincode,
      deliveryPincode,
      lines: orderReturn.items.map((line) => ({
        productName: line.orderItem.productName,
        quantity: line.quantity,
        weightKg: line.orderItem.listing?.weightKg != null ? Number(line.orderItem.listing.weightKg) : null,
        lengthCm: line.orderItem.listing?.lengthCm != null ? Number(line.orderItem.listing.lengthCm) : null,
        breadthCm: line.orderItem.listing?.breadthCm != null ? Number(line.orderItem.listing.breadthCm) : null,
        heightCm: line.orderItem.listing?.heightCm != null ? Number(line.orderItem.listing.heightCm) : null,
      })),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PackageBuildError) return NextResponse.json({ error: error.message }, { status: 422 });
    const message = error instanceof Error ? error.message : "Could not check courier serviceability.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

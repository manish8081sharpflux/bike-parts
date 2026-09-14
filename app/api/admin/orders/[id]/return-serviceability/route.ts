import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { checkAdminServiceability } from "@/lib/shipping/admin-serviceability";
import { PackageBuildError } from "@/lib/shipping/package";

type DeliveryAddress = { pincode?: string };

/** Courier options for the LEGACY whole-order return's reverse shipment (pickup = customer, delivery = warehouse). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAction();
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { items: { include: { listing: true } } } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const pickupPincode = (order.deliveryAddress as DeliveryAddress | null)?.pincode;
  const deliveryPincode = process.env.WAREHOUSE_PINCODE;
  if (!pickupPincode || !deliveryPincode) {
    return NextResponse.json({ error: "Warehouse or customer pincode is not available." }, { status: 400 });
  }

  try {
    const result = await checkAdminServiceability({
      pickupPincode,
      deliveryPincode,
      lines: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        weightKg: item.listing?.weightKg != null ? Number(item.listing.weightKg) : null,
        lengthCm: item.listing?.lengthCm != null ? Number(item.listing.lengthCm) : null,
        breadthCm: item.listing?.breadthCm != null ? Number(item.listing.breadthCm) : null,
        heightCm: item.listing?.heightCm != null ? Number(item.listing.heightCm) : null,
      })),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PackageBuildError) return NextResponse.json({ error: error.message }, { status: 422 });
    const message = error instanceof Error ? error.message : "Could not check courier serviceability.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

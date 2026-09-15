import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { checkLocalDeliveryEligibility, quoteLocalDelivery } from "@/lib/shipping/service";
import { calculateTotalWeightKg, PackageBuildError } from "@/lib/shipping/package";

type DeliveryAddress = {
  contactName?: string;
  phone?: string;
  flatNo?: string;
  floor?: string;
  area?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
};

/**
 * A Borzo price quote for one PARTIAL return's pickup — built from only
 * this return's items/quantities, never the full order (Part 22). Pickup
 * is the customer's address, drop is the warehouse — the same swap as the
 * legacy whole-order return quote.
 */
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
  if (orderReturn.status !== "APPROVED") {
    return NextResponse.json({ error: "This return has not been approved yet." }, { status: 400 });
  }

  const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
  const eligibility = checkLocalDeliveryEligibility(process.env.WAREHOUSE_CITY, address.city, address.pincode);
  if (!eligibility.eligible) {
    return NextResponse.json({ eligible: false, reason: eligibility.reason });
  }

  const line1 = [address.flatNo, address.floor, address.area].filter(Boolean).join(", ");
  const phone = address.phone || order.customerPhone;
  if (!order.customerName.trim() || !/^\d{10}$/.test(phone) || !line1 || !address.city || !/^\d{6}$/.test(address.pincode ?? "")) {
    return NextResponse.json({ error: "Customer address is incomplete. Contact name, phone, address, city, and pincode are required." }, { status: 400 });
  }
  if (
    !process.env.WAREHOUSE_CONTACT_NAME ||
    !process.env.WAREHOUSE_PHONE ||
    !process.env.WAREHOUSE_ADDRESS_LINE1 ||
    !process.env.WAREHOUSE_CITY ||
    !process.env.WAREHOUSE_PINCODE
  ) {
    return NextResponse.json({ error: "Warehouse address is not fully configured." }, { status: 400 });
  }

  try {
    const totalWeightKg = calculateTotalWeightKg(
      orderReturn.items.map((line) => ({
        productName: line.orderItem.productName,
        quantity: line.quantity,
        weightKg: line.orderItem.listing?.weightKg != null ? Number(line.orderItem.listing.weightKg) : null,
      }))
    );

    const quote = await quoteLocalDelivery({
      pickup: {
        contactName: address.contactName || order.customerName,
        contactPhone: phone,
        line1,
        line2: address.landmark ?? "",
        city: address.city ?? "",
        pincode: address.pincode ?? "",
      },
      drop: {
        contactName: process.env.WAREHOUSE_CONTACT_NAME,
        contactPhone: process.env.WAREHOUSE_PHONE,
        line1: process.env.WAREHOUSE_ADDRESS_LINE1,
        city: process.env.WAREHOUSE_CITY,
        pincode: process.env.WAREHOUSE_PINCODE,
      },
      matter: orderReturn.items.map((line) => `${line.orderItem.productName} x${line.quantity}`).join(", ").slice(0, 5000),
      totalWeightKg,
    });

    return NextResponse.json({
      eligible: true,
      deliveryFeeAmount: quote.deliveryFeeAmount,
      estimatedDeliveryAt: quote.estimatedDeliveryAt,
    });
  } catch (error) {
    if (error instanceof PackageBuildError) return NextResponse.json({ error: error.message }, { status: 422 });
    const message = error instanceof Error ? error.message : "Could not get a Borzo return pickup quote.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

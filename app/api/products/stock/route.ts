import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Live remaining stock for every storefront catalog product (BikePartListing), keyed by id. */
export async function GET() {
  const rows = await prisma.bikePartListing.findMany({ select: { id: true, stock: true } });
  return NextResponse.json({
    stock: Object.fromEntries(rows.map((row) => [row.id, row.stock])),
  });
}

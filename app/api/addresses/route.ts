import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { createAddressForUser, listAddressesForUser, toAddressDto } from "@/lib/addresses";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const addresses = await listAddressesForUser(session.user.id);
  return NextResponse.json({ addresses: addresses.map(toAddressDto) });
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await createAddressForUser(session.user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ address: toAddressDto(result.address) }, { status: 201 });
}

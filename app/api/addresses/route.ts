import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { createAddressForUser, listAddressesForUser, toAddressDto } from "@/lib/addresses";
import { enforceApiRateLimit, rejectInvalidJsonRequest } from "@/lib/security/api-protection";

export async function GET(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceApiRateLimit(request, "address-list", { limit: 60, windowMs: 15 * 60_000 }, session.user.id);
  if (limited) return limited;

  const addresses = await listAddressesForUser(session.user.id);
  return NextResponse.json({ addresses: addresses.map(toAddressDto) });
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceApiRateLimit(request, "address-create", { limit: 30, windowMs: 15 * 60_000 }, session.user.id);
  if (limited) return limited;
  const invalidJson = rejectInvalidJsonRequest(request);
  if (invalidJson) return invalidJson;

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

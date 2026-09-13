import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { deleteAddressForUser, toAddressDto, updateAddressForUser } from "@/lib/addresses";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await updateAddressForUser(id, session.user.id, body);
  if (!result.ok) {
    // Ownership failures and "doesn't exist" both come back as a plain 404 —
    // never reveal that the id belongs to a different customer.
    if ("notFound" in result) {
      return NextResponse.json({ error: "Address not found." }, { status: 404 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ address: toAddressDto(result.address) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const result = await deleteAddressForUser(id, session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: "Address not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

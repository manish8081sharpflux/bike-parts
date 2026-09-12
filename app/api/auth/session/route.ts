import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });

  return NextResponse.json({
    authenticated: true,
    user: { id: session.user.id, phone: session.user.phone, name: session.user.name },
  });
}
import { requestPartialReturn } from "@/lib/order-returns/service";
import { partialReturnMutation } from "@/lib/order-returns/http";

/**
 * Item/quantity-level return request — distinct from the legacy whole-order
 * POST /api/orders/[id]/return (see app/api/orders/[id]/return/route.ts,
 * left untouched). Ownership, delivery state, and remaining returnable
 * quantity are all re-verified server-side inside a locked transaction (see
 * lib/order-returns/service.ts) — the client's selected items/quantities are
 * never trusted as-is.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return partialReturnMutation(request, async (userId, input) => {
    const created = await requestPartialReturn(userId, id, input);
    return { ok: true, returnId: created.id, status: created.status };
  }, 201);
}

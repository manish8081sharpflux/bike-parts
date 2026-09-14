import { getProductReviews } from "@/lib/reviews/service";
import { reviewErrorResponse } from "@/lib/reviews/http";

export async function GET(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  try {
    const { listingId } = await params;
    const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
    return Response.json(await getProductReviews(listingId, cursor), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return reviewErrorResponse(error); }
}

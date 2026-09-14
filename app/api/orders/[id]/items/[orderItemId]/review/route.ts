import { createProductReview } from "@/lib/reviews/service";
import { reviewMutation } from "@/lib/reviews/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; orderItemId: string }> }) {
  const { id, orderItemId } = await params;
  return reviewMutation(request, (userId, input) => createProductReview(userId, id, orderItemId, input), 201);
}

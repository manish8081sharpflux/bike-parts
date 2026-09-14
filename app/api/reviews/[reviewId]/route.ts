import { editProductReview } from "@/lib/reviews/service";
import { reviewMutation } from "@/lib/reviews/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return reviewMutation(request, (userId, input) => editProductReview(userId, reviewId, input));
}

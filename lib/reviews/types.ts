export type RatingSummary = { ratingAverage: number | null; ratingCount: number };

export type CustomerReview = {
  id: string;
  rating: number;
  reviewText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicReview = CustomerReview & {
  customerName: string;
  returned: boolean;
};

export type ProductReviewsPage = RatingSummary & {
  reviews: PublicReview[];
  nextCursor: string | null;
};

export const EMPTY_RATING: RatingSummary = { ratingAverage: null, ratingCount: 0 };

export function hasCustomerRating(summary: RatingSummary) {
  return summary.ratingCount > 0 && summary.ratingAverage !== null &&
    Number.isFinite(summary.ratingAverage) && summary.ratingAverage >= 1 && summary.ratingAverage <= 5;
}

export function compareProductRatings(a: RatingSummary, b: RatingSummary) {
  const aRated = hasCustomerRating(a);
  const bRated = hasCustomerRating(b);
  if (aRated !== bRated) return aRated ? -1 : 1;
  if (!aRated) return 0;
  return b.ratingAverage! - a.ratingAverage! || b.ratingCount - a.ratingCount;
}

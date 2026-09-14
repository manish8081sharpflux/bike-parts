import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { EMPTY_RATING, type RatingSummary, type ProductReviewsPage } from "./types";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(2000).optional(),
}).strict();

export class ReviewError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function validateReview(input: unknown) {
  const result = reviewSchema.safeParse(input);
  if (!result.success) throw new ReviewError("Choose an integer rating from 1 to 5 and keep review text within 2,000 characters. Only rating and reviewText may be submitted.", 400);
  return { rating: result.data.rating, reviewText: result.data.reviewText || null };
}

export async function createProductReview(userId: string, orderId: string, orderItemId: string, input: unknown) {
  const data = validateReview(input);
  try {
    return await prisma.$transaction(async (tx) => {
      // Lock the order through the insert: concurrent fulfillment/ownership changes
      // cannot invalidate the eligibility check between the read and write.
      const orders = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status" FROM "Order" WHERE "id" = ${orderId} AND "buyerId" = ${userId} FOR UPDATE`;
      const order = orders[0];
      if (!order) throw new ReviewError("Purchase not found.", 404);
      if (order.status !== "DELIVERED") throw new ReviewError("Only delivered purchases can be reviewed.", 409);
      const items = await tx.$queryRaw<Array<{ listingId: string | null }>>`
        SELECT "listingId" FROM "OrderItem" WHERE "id" = ${orderItemId} AND "orderId" = ${orderId} FOR UPDATE`;
      const item = items[0];
      if (!item?.listingId) throw new ReviewError("This item is not an eligible product in this purchase.", 404);
      // listingId is derived from the locked purchase, never from client input.
      return tx.productReview.create({ data: { ...data, userId, orderId, orderItemId, listingId: item.listingId } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReviewError("You already reviewed this purchase. Edit your existing review instead.", 409);
    }
    throw error;
  }
}

export async function editProductReview(userId: string, reviewId: string, input: unknown) {
  const data = validateReview(input);
  // Ownership is part of the write predicate. No purchase relation can be changed.
  const result = await prisma.productReview.updateMany({ where: { id: reviewId, userId }, data });
  if (!result.count) throw new ReviewError("Review not found.", 404);
  return prisma.productReview.findFirstOrThrow({ where: { id: reviewId, userId } });
}

export async function getRatingSummaries(listingIds: string[]): Promise<Map<string, RatingSummary>> {
  if (!listingIds.length) return new Map();
  const groups = await prisma.productReview.groupBy({
    by: ["listingId"], where: { listingId: { in: listingIds } },
    _avg: { rating: true }, _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.listingId, {
    ratingAverage: group._avg.rating, ratingCount: group._count._all,
  }]));
}

export async function getProductReviews(listingId: string, cursor?: string): Promise<ProductReviewsPage> {
  // Public reads do not expose unpublished products or purchase/customer identifiers.
  if (!await prisma.bikePartListing.findFirst({ where: { id: listingId, status: "ACTIVE" }, select: { id: true } })) {
    throw new ReviewError("Product not found.", 404);
  }
  const after = cursor ? await prisma.productReview.findFirst({
    where: { id: cursor, listingId }, select: { id: true, createdAt: true },
  }) : null;
  if (cursor && !after) throw new ReviewError("Invalid review cursor.", 400);
  const [summaries, reviews] = await Promise.all([
    getRatingSummaries([listingId]),
    prisma.productReview.findMany({
      where: { listingId, ...(after ? { OR: [
        { createdAt: { lt: after.createdAt } },
        { createdAt: after.createdAt, id: { lt: after.id } },
      ] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 11,
      select: { id: true, rating: true, reviewText: true, createdAt: true, updatedAt: true,
        order: { select: { returnStatus: true } } },
    }),
  ]);
  return {
    ...(summaries.get(listingId) ?? EMPTY_RATING),
    reviews: reviews.slice(0, 10).map(({ order, ...review }) => ({
      ...review, createdAt: review.createdAt.toISOString(), updatedAt: review.updatedAt.toISOString(),
      customerName: "Verified Customer", returned: order.returnStatus === "RECEIVED",
    })),
    nextCursor: reviews.length > 10 ? reviews[9].id : null,
  };
}

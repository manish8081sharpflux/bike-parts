"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { hasCustomerRating, type CustomerReview, type ProductReviewsPage } from "@/lib/reviews/types";

export function ReviewStars({ rating }: { rating: number }) {
  return <span className="inline-flex gap-1 text-amber-500" role="img" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} aria-hidden="true" className={star <= rating ? "fill-current" : "text-zinc-300"} />)}
  </span>;
}

export function PurchaseReviewEditor({ orderId, orderItemId, productName, review: initialReview, onSaved }: {
  orderId: string; orderItemId: string; productName: string; review: CustomerReview | null; onSaved: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [review, setReview] = useState(initialReview);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(initialReview?.rating ?? 0);
  const [reviewText, setReviewText] = useState(initialReview?.reviewText ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const url = review ? `/api/reviews/${encodeURIComponent(review.id)}` :
        `/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(orderItemId)}/review`;
      const response = await fetch(url, {
        method: review ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, reviewText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your review.");
      setReview(data.review); setEditing(false); setSaved(true);
      onSaved(); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save your review. Please try again."); }
    finally { setSaving(false); }
  }

  return <section aria-label={`Review ${productName}`} className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
    <h4 className="text-sm font-semibold">{review && !editing ? "Your review" : "Rate this product"}</h4>
    {review && !editing ? <div className="mt-2 space-y-2">
      <ReviewStars rating={review.rating} />
      {review.reviewText ? <p className="whitespace-pre-wrap break-words text-sm text-zinc-600">{review.reviewText}</p> : null}
      <button type="button" onClick={() => { setRating(review.rating); setReviewText(review.reviewText ?? ""); setEditing(true); setSaved(false); }} className="block text-xs font-semibold text-orange-700 underline">Edit Review</button>
    </div> : <form onSubmit={submit} className="mt-2 space-y-3">
      {/* `relative` keeps the sr-only legend's containing block scoped to this fieldset — see product-form.tsx's Section component for the page-scroll bug an unpositioned ancestor causes with an absolutely-positioned sr-only element. */}
      <fieldset disabled={saving} className="relative">
        <legend className="sr-only">Rating (required)</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => <label key={star} className="relative cursor-pointer">
            <input className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="radio" name={`rating-${id}`} value={star} required checked={rating === star} onChange={() => setRating(star)} aria-label={`${star} ${star === 1 ? "star" : "stars"}`} />
            <Star aria-hidden="true" className={`size-8 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-orange-500 ${star <= rating ? "fill-amber-400 text-amber-500" : "text-zinc-400"}`} />
          </label>)}
        </div>
      </fieldset>
      <label htmlFor={`${id}-text`} className="block text-xs font-medium">Review text (optional)</label>
      <textarea id={`${id}-text`} value={reviewText} onChange={(event) => setReviewText(event.target.value)} maxLength={2000} disabled={saving} rows={3} className="block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm" placeholder="How was the quality and fit?" />
      <p className="text-xs text-zinc-500">{reviewText.length}/2,000 characters</p>
      <div className="flex gap-3">
        <button type="submit" disabled={saving || rating === 0} className="rounded-lg bg-[#ff4b1f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : review ? "Save review" : "Submit review"}</button>
        {review ? <button type="button" disabled={saving} onClick={() => { setEditing(false); setError(null); }} className="text-xs font-semibold">Cancel</button> : null}
      </div>
    </form>}
    {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
    {saved ? <p role="status" className="mt-2 text-xs text-emerald-700">Your review has been saved.</p> : null}
  </section>;
}

export function ProductReviews({ listingId }: { listingId: string }) {
  const [data, setData] = useState<ProductReviewsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/products/${encodeURIComponent(listingId)}/reviews`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load reviews.");
        const payload: ProductReviewsPage = await response.json();
        setData(payload); setError(null);
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [listingId, retry]);

  async function loadMore() {
    if (!data?.nextCursor || loading) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(listingId)}/reviews?cursor=${encodeURIComponent(data.nextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load more reviews. Please try again.");
      const next: ProductReviewsPage = await response.json();
      setData({ ...next, reviews: [...data.reviews, ...next.reviews] });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load reviews."); }
    finally { setLoading(false); }
  }

  return <section aria-label="Customer reviews" className="mt-8 border-t border-zinc-200 pt-6">
    <h2 className="text-xl font-bold">Reviews</h2>
    {data ? <>
      {hasCustomerRating(data) ? <div className="mt-3">
        <p className="text-2xl font-bold">{data.ratingAverage!.toFixed(1)} <span className="text-amber-500" aria-label="stars">★</span></p>
        <p className="text-sm text-zinc-500">Based on {data.ratingCount} verified {data.ratingCount === 1 ? "purchase" : "purchases"}</p>
      </div> : <p className="mt-3 text-sm text-zinc-500">No reviews yet. Customers can review this product after delivery from their order details.</p>}
      <div className="mt-4 divide-y divide-zinc-100">
        {data.reviews.map((review) => <article key={review.id} className="space-y-2 py-4">
          <ReviewStars rating={review.rating} />
          {review.reviewText ? <p className="whitespace-pre-wrap break-words text-sm">{review.reviewText}</p> : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{review.customerName}</span>
            <time dateTime={review.createdAt}>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(review.createdAt))}</time>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Verified Purchase</span>
            {review.returned ? <span className="rounded-full bg-zinc-100 px-2 py-1">Returned Order</span> : null}
          </div>
        </article>)}
      </div>
      {data.nextCursor ? <button type="button" onClick={loadMore} disabled={loading} className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50">{loading ? "Loading…" : "Load more reviews"}</button> : null}
    </> : !error ? <p role="status" className="mt-3 text-sm text-zinc-500">Loading reviews…</p> : null}
    {error ? <div role="alert" className="mt-3 text-sm text-red-700">{error}{!data ? <button type="button" className="ml-2 underline" onClick={() => setRetry(retry + 1)}>Try again</button> : null}</div> : null}
  </section>;
}

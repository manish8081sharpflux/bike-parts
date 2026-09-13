# Production smoke-test checklist

Run this manually against a freshly deployed production build before
announcing a release, and after any deploy that touches auth, checkout,
payments, or admin. Not automated (no CI/CD per project policy) — a person
with the storefront and `/admin` open should walk through it.

Use a **real but disposable** phone number and a **test-mode Razorpay key**
if at all possible; otherwise use the smallest real payment amount your
Razorpay account allows and refund it immediately after.

## Customer auth

- [ ] **OTP login**: enter a phone number on the storefront, request an OTP,
      receive it (real SMS in production — confirm delivery, not the dev
      echo), enter it, land authenticated.
- [ ] **Logout → login again**: log out, confirm the customer session cookie
      is gone (no authenticated UI state survives a refresh), log back in
      with a fresh OTP.
- [ ] **Wrong OTP rejected**: enter an incorrect code — generic "invalid or
      expired" error, no hint about which part was wrong, account not
      locked after one miss.

## Addresses

- [ ] **Add address**: save a new delivery address with all required fields.
- [ ] **Edit address**: change city/pincode on a saved address, confirm it
      persists.
- [ ] **Delete address**: delete a non-default address; if it was the
      default, confirm another address is promoted to default automatically.
- [ ] **Cross-account isolation** (spot check, not exhaustive): a second
      test account never sees the first account's addresses.

## Catalog & stock

- [ ] **Product availability**: a product with stock > 0 shows as
      purchasable; a product at 0 stock is clearly marked unavailable and
      can't be added past its available quantity.
- [ ] **Stock reservation**: add an item to cart and begin checkout; confirm
      the listing's available stock visibly drops (reserved, not yet sold)
      until payment completes or the checkout is abandoned.

## Checkout & payment

- [ ] **Checkout happy path**: cart → address selection → Razorpay opens →
      pay with a real/test card → redirected back → order shows as paid.
- [ ] **Razorpay payment success**: order status flips to `PAID`, stock is
      now permanently decremented (not just reserved), confirmation is
      visible in "My Orders".
- [ ] **Razorpay payment failure**: deliberately fail a payment (test-mode
      failure card, or cancel the Razorpay modal) — order stays unpaid,
      reserved stock is released back (check the product's available count
      recovers), no charge occurs.
- [ ] **Razorpay webhook fires**: confirm (via Razorpay dashboard's webhook
      log, or server logs) that `POST /api/webhooks/razorpay` received and
      accepted the event for the successful payment above.
- [ ] **Duplicate webhook delivery**: manually redeliver the same webhook
      event from the Razorpay dashboard — confirm the order isn't
      double-processed (no duplicate `OrderEvent`, refund, or stock change)
      and the endpoint responds `{ duplicate: true }` or `200`.

## Orders

- [ ] **Order creation**: the order created during checkout appears
      correctly in both the customer's "My Orders" and the admin order list,
      with matching items/total.
- [ ] **Stock deduction**: confirm the listing's stock in `/admin/products`
      reflects the sale (permanently reduced, order's `stockReserved` no
      longer holding it).
- [ ] **Order cancellation**: cancel an order before it ships (customer
      side) — status moves to cancelled, and if it was paid, a refund
      request is auto-created.
- [ ] **Refund**: approve the refund from `/admin` — confirm Razorpay shows
      the refund as issued and the order's refund status reaches `REFUNDED`.

## Admin

- [ ] **Admin login**: log in at `/admin/login` with `ADMIN_EMAIL`/
      `ADMIN_PASSWORD`; confirm landing on `/admin`.
- [ ] **Admin login throttling**: enter the wrong password 5–6 times —
      confirm a rate-limit message appears rather than the login silently
      accepting a 7th attempt.
- [ ] **Admin product management**: create a product, edit it (including an
      image), archive/delete it — confirm it disappears from the storefront
      and (if Meilisearch is configured) from search.
- [ ] **Admin order management**: open an order, change its status, dispatch
      via Porter if configured — confirm the customer-facing order status
      updates to match.

## Images

- [ ] **R2 image upload**: upload a product image through the admin product
      form — confirm it's reachable at the configured
      `CLOUDFLARE_R2_PUBLIC_URL` host and renders on the storefront listing.

## Search

- [ ] **Search returns real results**: search for a real product name/brand
      — results come from live inventory, not placeholder/sample data.
- [ ] **Search survives Meilisearch being down** (if Meilisearch is used in
      this deployment): stop Meilisearch, search again — results still come
      back (from the PostgreSQL fallback), just possibly less fuzzy; no 500
      error.

## Failure-mode checks

- [ ] **Redis outage**: stop Redis (or point `REDIS_URL` at nothing
      briefly, in a non-production window) and confirm: OTP send/verify and
      admin login fail closed with a clear "temporarily unavailable"
      message (not a raw 500 or a silent bypass); public search keeps
      working (fails open, per design). Restore Redis and confirm normal
      service resumes without a restart.
- [ ] **Database connectivity failure**: briefly block DB access (firewall
      rule, wrong credentials in a scratch env) and confirm the app returns
      a generic error page/response, not a raw Prisma stack trace, and that
      restoring connectivity resolves it without requiring a redeploy.

## Health

- [ ] **`GET /api/platform/health`** returns `200` with `"ok": true` when
      everything required is configured, and lists Meilisearch's live
      `online` status. Confirm the response contains no secret values —
      only service names and boolean/status fields.

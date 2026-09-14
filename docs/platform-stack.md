- **Customer auth**: Customers verify a 6-digit OTP through `/api/auth/otp/*`.
  OTP hashes use `CUSTOMER_OTP_HASH_SECRET`, challenges are one-time and
  expiring, and authenticated requests use the HttpOnly
  `bikeparts_customer_session` cookie. Redis (`REDIS_URL`) provides shared
  phone/IP rate limits. Local E2E may set `CUSTOMER_OTP_DEV_MODE=true`; this
  must never be enabled in production. Production SMS currently supports
  Twilio via `CUSTOMER_SMS_PROVIDER=twilio`. Use `TWILIO_API_KEY_SID`,
  `TWILIO_API_KEY_SECRET`, `TWILIO_ACCOUNT_SID`, and `TWILIO_FROM_NUMBER`
  (or use `TWILIO_AUTH_TOKEN` instead of the API-key pair).
- **Payment/refund state**: Payment confirmation is limited to
  `PENDING + stockReserved`; release claims the same reservation exclusively.
  Refund approval claims `REQUESTED -> PROCESSING` before calling Razorpay.
  Clear failures return to `REQUESTED`; uncertain provider outcomes remain
  `PROCESSING` with reconciliation required. Razorpay webhook events are
  deduplicated in `WebhookEvent`, and `pnpm reconcile:payments` reports stuck
  refunds without changing state.
# Bike Parts Marketplace Platform Stack

## Implemented in this pass

- Next.js app shell with Tailwind CSS v4 tokens and shadcn UI components.
- TanStack Query provider and PostHog browser initialization.
- React Hook Form + Zod product search form.
- Meilisearch-backed search API at `/api/search`.
- Meilisearch index bootstrap endpoint at `/api/search/index`.
- Platform readiness endpoint at `/api/platform/health`.
- Prisma PostgreSQL schema for users, sellers, listings, orders, notifications, and jobs.
- Self-hosted Meilisearch binary in `infra/meilisearch/` (see below — replaced Typesense).

## Local startup

```bash
pnpm install
pnpm meilisearch:up   # separate terminal, keep running
pnpm dev
pnpm meilisearch:seed
pnpm health
```

The app searches local sample products until `MEILISEARCH_HOST` and
`MEILISEARCH_API_KEY` are configured and the index is seeded.

### Why Meilisearch, not Typesense

This project originally used Typesense, but typesense.org ships no native
Windows binary — Windows is Docker-only, and this dev machine has neither
Docker nor a WSL distro available for it. Meilisearch publishes an actual
`meilisearch-windows-amd64.exe`, so it runs directly with no container:

```powershell
Invoke-WebRequest -Uri "https://github.com/meilisearch/meilisearch/releases/latest/download/meilisearch-windows-amd64.exe" -OutFile "infra\meilisearch\meilisearch.exe"
```

The binary and its `data.ms/` data directory are gitignored — each machine
downloads its own copy. `MEILISEARCH_API_KEY` in `.env.local` doubles as the
`--master-key` `pnpm meilisearch:up` starts it with.

## Dependency install status

The repo already had these dependencies declared: Next.js, Tailwind CSS,
shadcn/base-ui components, Motion, TanStack Query, React Hook Form, Zod,
next-pwa, Better Auth, PostHog, Redis/ioredis, and BullMQ.

Additional package installs for `typesense`, NestJS, Cloudflare/R2, Resend,
Razorpay, Firebase Admin, Sentry, and Playwright were attempted, but pnpm
repeatedly failed on this machine with out-of-memory errors while resolving the
existing lockfile. Firebase Admin also hit a Windows package extraction failure
inside `@grpc/grpc-js`.

Recommended follow-up install once the package manager is healthy:

```bash
pnpm add typesense @babel/runtime @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config @prisma/client pg @aws-sdk/client-s3 resend razorpay firebase-admin @sentry/nextjs server-only
pnpm add -D @types/pg @playwright/test
```

## Environment map

Copy `.env.example` to `.env.local` and fill in the values for the services you
want live locally. Non-public secrets stay server-side. Only `NEXT_PUBLIC_*`
values are exposed to the browser.

## Admin panel + checkout (added in this pass)

- **Prisma**: pinned to the stable `6.19.3` line (the `prisma` devDependency had
  drifted to an `8.0.0-rc` prerelease with a different, not-yet-stable CLI and
  a breaking `datasource.url` change — downgraded so `prisma generate` /
  `prisma migrate dev` work the classic way against `DATABASE_URL`).
- **Schema**: `Order`/`OrderItem`/`OrderEvent` extended for payments and
  shipping (`paymentStatus`, `razorpayOrderId/PaymentId/Signature`,
  `shippingProvider/OrderId/ShipmentId/AwbCode/CourierName/Status/TrackingUrl`,
  `taxAmount`, denormalized order-item snapshots) — `shippingProvider` is a
  `ShippingProvider` enum (`PORTER` | `SHIPROCKET`) so historical shipments
  from before the Shiprocket migration stay honestly attributed; see
  "Shipping" below. `User.email` is now optional and `User.phone` unique. Customer
  login uses OTP verification and a server-side session cookie.
  `BikePartListing.sellerId` is optional so admin-created products don't need a
  marketplace seller.
- **Admin auth**: `ADMIN_EMAIL` / `ADMIN_PASSWORD` in env, checked in
  `lib/auth/admin-session.ts`; a signed (HMAC, `ADMIN_SESSION_SECRET`) session
  cookie gates `/admin/**` and `/api/admin/**` via `proxy.ts` (Next 16 renamed
  `middleware.ts` → `proxy.ts`), with a second check inside every admin
  Server Action/page per Next's own guidance (proxy alone isn't enough).
- **Admin panel** (`/admin`): dashboard (order/revenue counts, low stock),
  orders (filter, detail, status update, shipment creation + tracking
  refresh via the generic shipping service), products (list, create, edit,
  delete/archive, including shipping weight/dimensions). Reads run directly via
  Prisma in Server Components; writes are Server Actions in
  `lib/actions/admin-*.ts`.
- **Checkout**: `POST /api/checkout` creates a DB `Order` + a Razorpay order;
  the storefront opens Razorpay Checkout.js, then `POST /api/checkout/verify`
  checks the payment signature and marks the order paid.
  `POST /api/webhooks/razorpay` is a webhook safety net for the `payment.captured` event. Checkout resolves prices and GST from active `BikePartListing` rows server-side; delivery charge and discount are also server-defined.
- **Shipping**: `lib/shipping/` is a generic, provider-neutral service
  (`types.ts`, `service.ts`, `package.ts`, `status-mapping.ts`,
  `admin-serviceability.ts`) — the rest of the app depends only on
  `lib/shipping/service.ts` (`createShipment`, `createReverseShipment`,
  `assignAwb`, `schedulePickup`, `trackShipment`, `cancelShipment`,
  `checkServiceability`), never on a provider file directly. Shiprocket
  (`lib/shipping/providers/shiprocket.ts`) is the only implemented provider,
  selected via `SHIPPING_PROVIDER=SHIPROCKET`, built against Shiprocket's
  documented External API v1 (auth/login, orders/create/adhoc,
  orders/create/return, courier/assign/awb, courier/generate/pickup,
  courier/track/awb, orders/cancel, courier/serviceability). Auth token is
  cached in-memory (~9 days, refreshed on a 401) — never re-authenticates
  per request. Dispatch (forward and reverse) uses the same
  claim-before-mutate pattern as the old Porter dispatch: a placeholder
  (`shippingOrderId = "CREATING"`) blocks a double-click from creating two
  shipments, and any failure after the provider has actually created
  something is treated as uncertain (never automatically retried) and
  flagged `shippingReconciliationRequired`. `pnpm reconcile:shipping`
  reports all of that (forward, legacy whole-order return, and
  item/quantity-level partial-return shipments) without retrying anything.
  Historical Porter-provider shipments (dispatched before this migration,
  `shippingProvider = "PORTER"`) remain trackable/cancellable through the
  frozen `lib/porter.ts` — never re-dispatched through Shiprocket.
- **First-time setup**:
  ```bash
  # fill in DATABASE_URL, RAZORPAY_KEY_ID/SECRET, SHIPROCKET_EMAIL/PASSWORD/PICKUP_LOCATION in .env.local
  pnpm db:migrate    # creates tables from prisma/schema.prisma
  pnpm dev
  # visit /admin/login with ADMIN_EMAIL / ADMIN_PASSWORD from .env.local
  ```

# Bike Parts Marketplace — Production Runbook

A Next.js (App Router) storefront + admin panel for bike parts, backed by
PostgreSQL, Redis, Razorpay, Cloudflare R2, and (optionally) Meilisearch.

This README is the production operations reference. For local development
conveniences (Meilisearch's Windows binary, dependency-install history,
etc.) see [`docs/platform-stack.md`](docs/platform-stack.md). For backups
see [`docs/backup-and-restore.md`](docs/backup-and-restore.md); for a manual
release checklist see [`docs/smoke-test-checklist.md`](docs/smoke-test-checklist.md).

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.9 | Next.js 16's own minimum. |
| pnpm | 9+ | This repo is pnpm-only (`pnpm-lock.yaml`). |
| PostgreSQL | 14+ | Source of truth for all durable data. |
| Redis | any recent version | Rate limiting (OTP, admin login, checkout, search, etc.). Required in production — see below. |
| Meilisearch | 1.x, optional | Search index. Absent → search transparently falls back to querying PostgreSQL directly. |

## Environment variables

Copy `.env.example` to `.env.local` for development, or set these directly
in your hosting platform's environment for production (never via a checked-in
`.env` file). Run `pnpm security:check` after setting them — it validates
exactly this list and prints `✓`/`✗`/`⚠` without ever printing a secret's
actual value.

**Required in production** (deployment refuses to be "ready" without these,
per `lib/security/production-config.ts`):

- `DATABASE_URL` — PostgreSQL connection string.
- `REDIS_URL` — backs the shared rate limiter (OTP, admin login, checkout,
  addresses, refunds, search). Without it in production, rate-limited
  endpoints that fail closed (OTP, admin login, checkout, addresses,
  refunds) return `503` rather than silently disabling protection; only
  public search fails *open*.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ chars, not a common word) — the single
  admin account.
- `ADMIN_SESSION_SECRET` — 32+ random chars, not a dictionary word. Generate
  with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `ADMIN_SESSION_VERSION` — any short string (e.g. `1`). Bump it to
  invalidate every previously issued admin session at once, without
  rotating `ADMIN_SESSION_SECRET` — the emergency "log everyone out" switch.
- `CUSTOMER_OTP_HASH_SECRET` — 32+ random chars, used to hash OTP codes.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`,
  `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`,
  `CLOUDFLARE_R2_PUBLIC_URL` — product image storage. Missing any one fails
  uploads closed in production (never silently falls back to local disk
  outside development).

**Optional** (absence is a supported configuration, not an error):

- `TRUST_PROXY_HEADERS` — a deployment-topology choice, not a universal
  requirement; both values below are valid production configurations, and
  `pnpm security:check` never fails just because it's `false` or unset.
  - **Unset or `false` (the safe default)** — the app is directly
    internet-facing. Client-supplied `X-Forwarded-For`/`X-Real-IP`/
    `CF-Connecting-IP` headers are trivially spoofable without a proxy in
    front to overwrite them, so they're ignored entirely for rate-limit
    identity — see `lib/security/client-ip.ts`.
  - **`true`** — set this **only** if the app sits behind a trusted reverse
    proxy (Cloudflare, nginx, your host's load balancer) that itself
    sets/sanitizes those headers, **and the app is reachable only through
    that proxy** — a client that can reach the app directly could otherwise
    spoof its way past IP-based rate limits. `pnpm security:check` prints a
    reminder of exactly this whenever it's enabled.
  - Any other value (e.g. `yes`, `1`, `enabled`) is treated as a
    misconfiguration and fails `pnpm security:check`.
- `MEILISEARCH_HOST` / `MEILISEARCH_PORT` / `MEILISEARCH_PROTOCOL` /
  `MEILISEARCH_API_KEY` / `MEILISEARCH_INDEX` / `MEILISEARCH_HTTP_TIMEOUT_MS`
  — all-or-nothing. Fully set → search hits the live index. Fully absent →
  PostgreSQL fallback. Partially set is flagged as a warning by
  `pnpm security:check` (fix it or clear it entirely — don't leave it half
  configured).
- Shipping (`SHIPPING_PROVIDER`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`,
  `SHIPROCKET_PICKUP_LOCATION`, warehouse address vars) — shipment creation
  through the generic shipping service (`lib/shipping/`), Shiprocket is the
  active provider. `SHIPROCKET_PICKUP_LOCATION` must exactly match a pickup
  location already configured in the Shiprocket dashboard. Legacy
  `PORTER_*` vars are only needed if the deployment still has historical
  Porter-provider shipments to track/cancel (see `lib/porter.ts`) — never
  set them up for a new deployment.
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` — product analytics.
- `SENTRY_DSN` — not currently wired up; see "Monitoring" below before
  adding it.
- Twilio vars — real SMS delivery for OTP (`CUSTOMER_SMS_PROVIDER=twilio`).
  Never set `CUSTOMER_OTP_DEV_MODE=true` in production — it echoes OTP codes
  back in the API response instead of sending SMS.

## First-time production setup

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy   # prisma migrate deploy — applies committed migrations,
                          # non-interactive, never prompts or resets data.
                          # Do NOT use `pnpm db:migrate` (prisma migrate dev)
                          # against a production database.
pnpm security:check       # must exit 0 before proceeding
pnpm build
pnpm start
```

Then, once running:

1. Visit `/admin/login` and sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
2. If using Meilisearch, run `pnpm reindex:search` to populate the index
   from the live catalog (never seed it from sample data in production —
   `scripts/seed-meilisearch.mjs` refuses to run when `NODE_ENV=production`).
3. Configure the Razorpay webhook URL (`https://<your-domain>/api/webhooks/razorpay`)
   in the Razorpay dashboard, using `RAZORPAY_WEBHOOK_SECRET` as the signing
   secret, subscribed to `payment.captured` and the `refund.*` events.
4. Run through [`docs/smoke-test-checklist.md`](docs/smoke-test-checklist.md).

## Redeploying (subsequent releases)

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy
pnpm typecheck && pnpm lint
pnpm build
# restart the process (pm2 restart / systemctl restart / your platform's redeploy)
```

## Health check

`GET /api/platform/health` — `200` with `"ok": true` when every
production-required integration in `lib/platform/service-env.ts` is
configured, plus Meilisearch's live `online` ping status if configured. The
response only ever contains service names and booleans — no secrets,
credentials, or connection strings. Point your load balancer's health check
or an uptime monitor at this path.

For a pre-deploy configuration audit (not a runtime health check), use
`pnpm security:check` instead — it prints one line per required/optional
setting and exits non-zero if a *required* one is missing or weak (see
below); it never fails deployment just because an optional integration like
Meilisearch is absent.

## Reconciliation jobs

Three read-only reports, safe to run repeatedly and on a schedule — none of
them mutate state or retry a payment/shipment automatically (a stuck refund
or uncertain shipment creation/AWB/pickup/cancellation needs a human to look
before anything retries real money or a real shipment):

| Command | Reports on | Exit code |
|---|---|---|
| `pnpm reconcile:payments` | Refunds stuck in `PROCESSING` | non-zero if any candidates found |
| `pnpm reconcile:shipping` | Forward/return/partial-return shipments in an uncertain state (Shiprocket), plus any legacy Porter-provider candidates | non-zero if any candidates found |
| `pnpm reconcile:search` | Listings where `searchSynced=false` (only meaningful if Meilisearch is configured) | non-zero if any remain unsynced after retrying |

`reconcile:search` is the one exception that *does* act — it retries syncing
each pending listing to Meilisearch and marks it synced on success, since a
sync retry (unlike a refund or delivery) has no side effect if it's
redundant.

### Scheduling on a production server

No CI/CD is set up for this project — schedule these directly on the host
with cron (or your platform's scheduled-task equivalent):

```cron
# Every 15 minutes: alert (via cron's mail-on-error, or redirect to your
# log aggregator) if anything needs a human look.
*/15 * * * * cd /path/to/app && pnpm reconcile:payments >> /var/log/bikeparts/reconcile-payments.log 2>&1
*/15 * * * * cd /path/to/app && pnpm reconcile:shipping >> /var/log/bikeparts/reconcile-shipping.log 2>&1

# Every 15 minutes: self-heals a temporary Meilisearch outage. Skip this
# line entirely if you don't run Meilisearch.
*/15 * * * * cd /path/to/app && pnpm reconcile:search  >> /var/log/bikeparts/reconcile-search.log 2>&1
```

Each script logs its own failures to stderr and exits non-zero on both a
genuine error (DB unreachable, etc.) and "found candidates needing
attention" — wire your process supervisor/cron's failure notification to
that exit code rather than parsing log output.

## Backup & restore

See [`docs/backup-and-restore.md`](docs/backup-and-restore.md) — covers
`pg_dump`/`pg_restore` commands (verified against this schema), a suggested
cron schedule, and post-restore verification steps.

## Rollback

This app has no built-in migration-down tooling (Prisma migrations are
forward-only by convention here). To roll back a bad release:

1. **Code**: redeploy the previous release artifact/image, or
   `git checkout <previous-tag>` and rebuild (`pnpm install --frozen-lockfile
   && pnpm db:generate && pnpm build`).
2. **Schema**: only roll back the database if the new migration is
   incompatible with the old code *and* you're reverting past it. Prefer
   restoring from the most recent backup taken before the bad migration ran
   (see backup doc) over hand-writing a down-migration — a bad migration
   caught quickly is usually still within your backup retention window.
3. **Search index**: if you rolled back schema changes that affected
   `BikePartListing`, run `pnpm reindex:search` afterward so Meilisearch
   matches the restored data.
4. Re-run [`docs/smoke-test-checklist.md`](docs/smoke-test-checklist.md)
   before considering the rollback complete.

## Monitoring & error handling

- Payment, webhook, Redis, database, shipping, search-sync, and R2 storage
  failures are all logged server-side with a `[subsystem]` prefix (grep your
  process logs for `console.error` output tagged `[checkout]`, `[webhook]`,
  `[security]`, `[product-images]`, `[search]`, `[shipping]`, etc.) — pipe stdout/stderr to
  whatever your host aggregates (journald, Docker logs, a hosted log
  service).
- User-facing errors are deliberately generic (e.g. "Payment signature
  verification failed.", "Admin login is temporarily unavailable.") —
  internal exception details, stack traces, and provider error bodies are
  never returned to the browser; the same information is logged server-side
  in full instead.
- No external error-tracking service (Sentry, etc.) is wired up. Before
  adding one, first confirm the existing `console.error` logging (piped to
  your platform's log aggregation) meets your needs — a paid service is a
  cost/complexity tradeoff, not something this app requires structurally.

## Common production failures

| Symptom | Likely cause | Where to look |
|---|---|---|
| Every request 500s immediately | `DATABASE_URL` unreachable/wrong | Server logs for a Prisma connection error at boot; `pnpm security:check` |
| OTP send/verify and admin login return 503 | Redis unreachable (`REDIS_URL`) — these fail *closed* by design | `[security] Rate limiter unavailable` / `REDIS_URL is missing` in logs |
| Search works but ignores recent product changes | Meilisearch index stale | `pnpm reindex:search`; check `searchSynced` on affected listings |
| Search 500s or times out | Meilisearch down and misconfigured DB fallback | Confirm PostgreSQL is reachable — the fallback needs it too |
| Checkout succeeds but payment never confirms | Razorpay webhook not configured, or `RAZORPAY_WEBHOOK_SECRET` mismatch | Razorpay dashboard webhook delivery log; `[webhook][razorpay]` in server logs |
| Refund stuck, never completes | Razorpay API call failed/timed out mid-flight | `pnpm reconcile:payments` |
| Shipment creation/AWB/pickup/cancellation stuck | Shiprocket API call outcome uncertain | `pnpm reconcile:shipping` |
| Product image upload fails | R2 credentials wrong/missing in production (fails closed, no local-disk fallback) | `[product-images]` in server logs; `pnpm security:check` |
| Everyone logged out of `/admin` unexpectedly | `ADMIN_SESSION_VERSION` was bumped (intentional revocation) or `ADMIN_SESSION_SECRET` changed | Check recent env changes |

## Testing

```bash
pnpm typecheck
pnpm lint
pnpm test:customer-auth
pnpm test:checkout-inventory
pnpm test:checkout-payment-race
pnpm test:order-refund-state
pnpm test:webhook-lifecycle
pnpm test:shipping-state
pnpm test:order-return-state
pnpm test:order-returns-partial
pnpm test:addresses
pnpm test:product-image-storage
pnpm test:product-image-storage-prod
pnpm test:search
pnpm test:security
pnpm security:check
```

Several suites need a running `pnpm dev` server and/or a local Meilisearch
(`pnpm meilisearch:up`) — see each test file's header comment for its exact
requirements.

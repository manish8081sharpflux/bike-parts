# PostgreSQL backup & restore

This project's only durable state is PostgreSQL (`DATABASE_URL`). Everything
else — Redis, the Meilisearch search index — is either a cache or a derived
index that can be rebuilt from Postgres (`pnpm reindex:search`). Product
images live in Cloudflare R2, not Postgres, and are out of scope here; R2 has
its own versioning/retention settings in the Cloudflare dashboard.

The commands below were run against this project's own schema and verified
end-to-end (dump → restore into a scratch database → row counts compared)
while writing this doc.

## 1. Backup

Use `pg_dump`'s custom format (`-F c`) — compressed, and restorable with
`pg_restore` (including selective/parallel restore), unlike a plain `.sql`
text dump.

```bash
# Run from anywhere with network access to the DB. Reads connection details
# from DATABASE_URL directly instead of retyping host/user/db.
pg_dump "$DATABASE_URL" -F c -f "backups/bike_parts_$(date +%Y%m%d_%H%M%S).dump"
```

If your `DATABASE_URL` uses a connection string Prisma understands but
`pg_dump` doesn't accept as a single argument (rare — e.g. extra
Prisma-only query params), fall back to explicit flags:

```bash
pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -F c \
  -f "backups/bike_parts_$(date +%Y%m%d_%H%M%S).dump"
# Prompts for the password unless PGPASSWORD is set in the environment —
# never put the password on the command line itself (it ends up in shell
# history and process listings).
```

**Never commit dump files.** They contain real customer phone numbers,
addresses, and order history. `.gitignore` already excludes `/dumps/`,
`*.dump`, and `*.sql.gz` — keep backups under one of those, or entirely
outside the repo checkout.

### What's in the dump

Every table in `prisma/schema.prisma` — customers, addresses, orders,
listings, webhook/refund/shipping state (including historical Porter-provider
shipments, distinguished from Shiprocket ones via `shippingProvider`),
admin-managed product data. A restore brings back the exact state at dump
time, including in-flight orders and stock reservations.

## 2. Restore

**Restoring overwrites data. Always restore into a new/empty database first
and verify before pointing production traffic at it — never `pg_restore`
directly into a live database that already has newer data than the dump.**

```bash
# 1. Create a fresh target database.
psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "CREATE DATABASE bike_parts_restore;"

# 2. Restore into it.
pg_restore -h "$PGHOST" -U "$PGUSER" -d bike_parts_restore \
  --no-owner --no-privileges \
  backups/bike_parts_20260101_020000.dump

# 3. Point DATABASE_URL at bike_parts_restore and run the app's own
#    verification (see "Verification" below) before treating it as primary.
```

`--no-owner --no-privileges` avoids restore failures when the restoring role
doesn't exactly match the role that produced the dump (common when restoring
onto a different host/managed Postgres instance).

### Promoting a restored database to primary

Once verified, either:

- Rename the databases (`ALTER DATABASE bike_parts RENAME TO bike_parts_old;
  ALTER DATABASE bike_parts_restore RENAME TO bike_parts;`) and restart the
  app, or
- Update `DATABASE_URL` to point at `bike_parts_restore` and restart the app.

Keep `bike_parts_old` (or the pre-restore dump) until you've confirmed the
app is healthy against the restored data — don't drop the old database
immediately.

## 3. Verification

After any restore, before trusting it:

```bash
# Row counts on a few high-value tables — compare against what you expect
# (e.g. from the source system's own dashboard, or a pg_dump run just
# before the restore).
psql -h "$PGHOST" -U "$PGUSER" -d bike_parts_restore -c '
  SELECT '"'"'User'"'"' AS table, count(*) FROM "User"
  UNION ALL SELECT '"'"'Order'"'"', count(*) FROM "Order"
  UNION ALL SELECT '"'"'BikePartListing'"'"', count(*) FROM "BikePartListing"
  UNION ALL SELECT '"'"'Address'"'"', count(*) FROM "Address";
'

# Prisma's own schema-vs-database drift check — confirms the restored
# database actually matches what this app version expects.
DATABASE_URL="<restored-db-url>" pnpm db:generate
DATABASE_URL="<restored-db-url>" npx prisma migrate status
```

Then run the production smoke-test checklist (`docs/smoke-test-checklist.md`)
against a staging deployment pointed at the restored database before ever
promoting it to primary.

## 4. Backup schedule (manual deployment, no managed backup service)

If the hosting Postgres is unmanaged (self-hosted, a plain VM, a container
without automated snapshots), schedule `pg_dump` yourself. A simple cron
entry:

```cron
# Daily at 02:00, keep 14 days locally
0 2 * * * PGPASSWORD=*** pg_dump "$DATABASE_URL" -F c -f /var/backups/bike_parts/bike_parts_$(date +\%Y\%m\%d).dump && \
  find /var/backups/bike_parts -name '*.dump' -mtime +14 -delete
```

Copy dumps off the host after each run (object storage, a second disk, an
R2 bucket dedicated to backups) — a backup that lives only on the same disk
as the database doesn't protect against disk/host failure.

If the hosting provider offers managed Postgres with automated snapshots
(RDS, Supabase, Neon, Cloud SQL, etc.), prefer that over this manual
schedule and use this doc's restore steps only for occasional
verification/DR drills, or for exporting to a different host.

## 5. What is *not* covered here

- Redis: pure cache/rate-limit counters, safe to lose — nothing to back up.
- Meilisearch index: rebuild with `pnpm reindex:search` from Postgres
  (source of truth), never restore it directly.
- R2 product images: managed by Cloudflare; configure bucket versioning/
  lifecycle rules in the Cloudflare dashboard if retention matters.

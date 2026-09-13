-- Reconstructed migration file: the database already has this column applied
-- (the migration record exists in _prisma_migrations but the SQL file was
-- missing from the checked-in migrations directory). This file matches what
-- was actually run, so `prisma migrate resolve --applied` can reconcile
-- history without re-running or altering the schema.
ALTER TABLE "CustomerOtpChallenge" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);

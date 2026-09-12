CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

ALTER TABLE "WebhookEvent"
  ADD COLUMN "status" "WebhookProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "WebhookEvent"
SET "status" = 'PROCESSED', "processingStartedAt" = NULL
WHERE "processedAt" IS NOT NULL;

ALTER TABLE "WebhookEvent"
  ALTER COLUMN "processedAt" DROP DEFAULT,
  ALTER COLUMN "processedAt" DROP NOT NULL;

CREATE INDEX "WebhookEvent_status_processingStartedAt_idx"
  ON "WebhookEvent"("status", "processingStartedAt");
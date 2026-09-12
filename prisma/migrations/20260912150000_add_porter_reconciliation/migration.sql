ALTER TABLE "Order"
  ADD COLUMN "porterReconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "porterLastError" TEXT,
  ADD COLUMN "porterAttemptedAt" TIMESTAMP(3);

CREATE INDEX "Order_porterReconciliationRequired_idx"
  ON "Order"("porterReconciliationRequired");
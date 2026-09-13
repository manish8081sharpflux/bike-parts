-- Reverts the imageKey/imageKeys columns added in
-- 20260913103139_add_product_image_keys (superseded by a URL-derived key
-- strategy that needs no schema change — see lib/storage/product-images.ts).
--
-- That migration's auto-generated diff also happened to include two
-- unrelated, pre-existing pending changes from before this work started
-- (an Order index drop and a WebhookEvent.updatedAt default drop). Restoring
-- both here so this detour leaves no footprint outside Fix 7's scope.

-- AlterTable
ALTER TABLE "BikePartListing" DROP COLUMN "imageKey",
DROP COLUMN "imageKeys";

-- RestoreIndex (unrelated pending change swept in by the previous migration)
CREATE INDEX "Order_porterReconciliationRequired_idx" ON "Order"("porterReconciliationRequired");

-- RestoreDefault (unrelated pending change swept in by the previous migration)
ALTER TABLE "WebhookEvent" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

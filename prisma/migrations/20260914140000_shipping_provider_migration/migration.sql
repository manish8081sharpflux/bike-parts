-- Generalizes the Porter-specific shipping columns into a provider-neutral
-- shipping model (see lib/shipping/). Column RENAMEs are used everywhere the
-- old and new columns are semantically the same concept (a provider order
-- id, a raw status string, a tracking URL, etc.) so every existing value
-- survives untouched — no DROP COLUMN anywhere in this file. New columns
-- Shiprocket needs that Porter never had (shipmentId, awbCode, courierName,
-- provider) are added separately and left NULL for historical rows, then
-- backfilled with "PORTER" (and "Porter" as a display-friendly courier name)
-- for any row that already has a shipment/pickup on record, so historical
-- shipments stay honestly attributed and are never mistaken for Shiprocket
-- shipments by later code or reconciliation queries.

-- CreateEnum
CREATE TYPE "ShippingProvider" AS ENUM ('PORTER', 'SHIPROCKET');

-- BikePartListing: new optional package-dimension fields for shipping.
ALTER TABLE "BikePartListing"
  ADD COLUMN "lengthCm" DECIMAL(6,2),
  ADD COLUMN "breadthCm" DECIMAL(6,2),
  ADD COLUMN "heightCm" DECIMAL(6,2);

-- Order: forward-shipment columns (was porter*, now shipping*).
ALTER TABLE "Order" RENAME COLUMN "porterOrderId" TO "shippingOrderId";
ALTER TABLE "Order" RENAME COLUMN "porterStatus" TO "shippingStatus";
ALTER TABLE "Order" RENAME COLUMN "porterTrackingUrl" TO "shippingTrackingUrl";
ALTER TABLE "Order" RENAME COLUMN "porterReconciliationRequired" TO "shippingReconciliationRequired";
ALTER TABLE "Order" RENAME COLUMN "porterLastError" TO "shippingLastError";
ALTER TABLE "Order" RENAME COLUMN "porterAttemptedAt" TO "shippingAttemptedAt";
ALTER TABLE "Order"
  ADD COLUMN "shippingProvider" "ShippingProvider",
  ADD COLUMN "shippingShipmentId" TEXT,
  ADD COLUMN "shippingAwbCode" TEXT,
  ADD COLUMN "shippingCourierName" TEXT;

-- Order: legacy whole-order-return reverse-shipment columns (was
-- returnPorter*, now returnShipping*).
ALTER TABLE "Order" RENAME COLUMN "returnPorterOrderId" TO "returnShippingOrderId";
ALTER TABLE "Order" RENAME COLUMN "returnPorterStatus" TO "returnShippingStatus";
ALTER TABLE "Order" RENAME COLUMN "returnPorterTrackingUrl" TO "returnShippingTrackingUrl";
ALTER TABLE "Order" RENAME COLUMN "returnPorterReconciliationRequired" TO "returnShippingReconciliationRequired";
ALTER TABLE "Order" RENAME COLUMN "returnPorterLastError" TO "returnShippingLastError";
ALTER TABLE "Order" RENAME COLUMN "returnPorterAttemptedAt" TO "returnShippingAttemptedAt";
ALTER TABLE "Order"
  ADD COLUMN "returnShippingProvider" "ShippingProvider",
  ADD COLUMN "returnShippingShipmentId" TEXT,
  ADD COLUMN "returnShippingAwbCode" TEXT,
  ADD COLUMN "returnShippingCourierName" TEXT;

-- OrderReturn (item/quantity-level returns): was porter*, now shipping*.
ALTER TABLE "OrderReturn" RENAME COLUMN "porterOrderId" TO "shippingOrderId";
ALTER TABLE "OrderReturn" RENAME COLUMN "porterStatus" TO "shippingStatus";
ALTER TABLE "OrderReturn" RENAME COLUMN "porterTrackingUrl" TO "shippingTrackingUrl";
ALTER TABLE "OrderReturn" RENAME COLUMN "porterReconciliationRequired" TO "shippingReconciliationRequired";
ALTER TABLE "OrderReturn" RENAME COLUMN "porterLastError" TO "shippingLastError";
ALTER TABLE "OrderReturn" RENAME COLUMN "porterAttemptedAt" TO "shippingAttemptedAt";
ALTER TABLE "OrderReturn"
  ADD COLUMN "shippingProvider" "ShippingProvider",
  ADD COLUMN "shippingShipmentId" TEXT,
  ADD COLUMN "shippingAwbCode" TEXT,
  ADD COLUMN "shippingCourierName" TEXT;

-- Backfill: any row that already has a shipment/pickup on record (including
-- the "DISPATCHING" in-flight claim placeholder) was necessarily created
-- through Porter, since Shiprocket did not exist as a provider before this
-- migration. Never leave these rows looking like unattributed/Shiprocket
-- shipments.
UPDATE "Order" SET "shippingProvider" = 'PORTER', "shippingCourierName" = 'Porter'
  WHERE "shippingOrderId" IS NOT NULL AND "shippingProvider" IS NULL;
UPDATE "Order" SET "returnShippingProvider" = 'PORTER', "returnShippingCourierName" = 'Porter'
  WHERE "returnShippingOrderId" IS NOT NULL AND "returnShippingProvider" IS NULL;
UPDATE "OrderReturn" SET "shippingProvider" = 'PORTER', "shippingCourierName" = 'Porter'
  WHERE "shippingOrderId" IS NOT NULL AND "shippingProvider" IS NULL;

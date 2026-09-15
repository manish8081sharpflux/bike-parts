-- Adds Borzo as a shipping provider (local Pune same-city delivery — see
-- lib/shipping/providers/borzo.ts) and generic tracking fields that a real
-- provider response can populate (delivery executive name/phone, last
-- update time, estimated delivery time). Purely additive — no existing
-- column is touched, so historical PORTER and SHIPROCKET rows are
-- completely unaffected and keep rendering exactly as before.

-- AlterEnum
ALTER TYPE "ShippingProvider" ADD VALUE 'BORZO';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryExecutiveName" TEXT,
ADD COLUMN     "deliveryExecutivePhone" TEXT,
ADD COLUMN     "shippingEstimatedDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "shippingLastUpdatedAt" TIMESTAMP(3);

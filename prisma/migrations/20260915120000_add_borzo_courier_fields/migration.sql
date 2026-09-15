-- Real Borzo courier/rider identity + live position (GET /courier), plus an
-- optional waybill document URL (GET /orders / POST /create-order) — see
-- lib/shipping/providers/borzo.ts. All nullable, additive-only; nothing
-- here touches historical Shiprocket/Porter rows, which simply leave every
-- one of these columns null forever.
ALTER TABLE "Order" ADD COLUMN "deliveryExecutiveId" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryExecutivePhotoUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryExecutiveLatitude" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveryExecutiveLongitude" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shippingWaybillUrl" TEXT;

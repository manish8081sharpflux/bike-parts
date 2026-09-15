-- Real Borzo-geocoded pickup/drop coordinates plus Borzo's own real
-- driving-distance estimate between them — shown on a real map to the
-- customer. Nullable and additive-only; historical Shiprocket/Porter rows
-- simply leave these null forever.
ALTER TABLE "Order" ADD COLUMN "shippingPickupLatitude" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shippingPickupLongitude" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shippingDropLatitude" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shippingDropLongitude" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shippingDistanceMeters" INTEGER;

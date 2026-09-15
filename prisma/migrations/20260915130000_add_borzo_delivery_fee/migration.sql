-- Real, committed Borzo delivery fee for a booking — shown to the customer
-- as informational-only, distinct from the checkout-time deliveryCharge.
-- Nullable and additive-only; historical Shiprocket/Porter rows simply
-- leave this null forever.
ALTER TABLE "Order" ADD COLUMN "shippingDeliveryFeeAmount" DECIMAL(10,2);

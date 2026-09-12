ALTER TABLE "Order"
  ADD COLUMN "refundAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "refundFailureReason" TEXT,
  ADD COLUMN "refundReconciliationRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Order_refundStatus_refundReconciliationRequired_idx"
  ON "Order"("refundStatus", "refundReconciliationRequired");

CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order"("razorpayOrderId");
CREATE UNIQUE INDEX "Order_razorpayPaymentId_key" ON "Order"("razorpayPaymentId");
CREATE UNIQUE INDEX "Order_razorpayRefundId_key" ON "Order"("razorpayRefundId");

CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key"
  ON "WebhookEvent"("provider", "eventId");
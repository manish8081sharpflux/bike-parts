-- CreateEnum
CREATE TYPE "OrderReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'RECEIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderReturnRefundStatus" AS ENUM ('NONE', 'REQUESTED', 'PROCESSING', 'REFUNDED', 'FAILED');

-- CreateTable
CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "adminNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "condition" "ReturnCondition",
    "porterOrderId" TEXT,
    "porterStatus" TEXT,
    "porterTrackingUrl" TEXT,
    "porterReconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
    "porterLastError" TEXT,
    "porterAttemptedAt" TIMESTAMP(3),
    "refundStatus" "OrderReturnRefundStatus" NOT NULL DEFAULT 'NONE',
    "refundAmount" DECIMAL(10,2),
    "razorpayRefundId" TEXT,
    "refundFailureReason" TEXT,
    "refundReconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
    "refundAttemptedAt" TIMESTAMP(3),
    "refundProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stockRestored" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderReturn_razorpayRefundId_key" ON "OrderReturn"("razorpayRefundId");

-- CreateIndex
CREATE INDEX "OrderReturn_orderId_idx" ON "OrderReturn"("orderId");

-- CreateIndex
CREATE INDEX "OrderReturn_status_idx" ON "OrderReturn"("status");

-- CreateIndex
CREATE INDEX "OrderReturnItem_orderItemId_idx" ON "OrderReturnItem"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderReturnItem_returnId_orderItemId_key" ON "OrderReturnItem"("returnId", "orderItemId");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


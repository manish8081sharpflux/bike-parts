-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'REQUESTED', 'REJECTED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "razorpayRefundId" TEXT,
ADD COLUMN     "refundAdminNote" TEXT,
ADD COLUMN     "refundAmount" DECIMAL(10,2),
ADD COLUMN     "refundProcessedAt" TIMESTAMP(3),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundRequestedAt" TIMESTAMP(3),
ADD COLUMN     "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NONE';

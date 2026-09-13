-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('NONE', 'REQUESTED', 'REJECTED', 'APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'RECEIVED');

-- DropIndex
DROP INDEX "Order_porterReconciliationRequired_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "returnAdminNote" TEXT,
ADD COLUMN     "returnPorterOrderId" TEXT,
ADD COLUMN     "returnPorterStatus" TEXT,
ADD COLUMN     "returnPorterTrackingUrl" TEXT,
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnReceivedAt" TIMESTAMP(3),
ADD COLUMN     "returnRequestedAt" TIMESTAMP(3),
ADD COLUMN     "returnStatus" "ReturnStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "WebhookEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

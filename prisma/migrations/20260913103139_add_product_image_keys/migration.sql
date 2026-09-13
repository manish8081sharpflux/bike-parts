-- DropIndex
DROP INDEX "Order_porterReconciliationRequired_idx";

-- AlterTable
ALTER TABLE "BikePartListing" ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "WebhookEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

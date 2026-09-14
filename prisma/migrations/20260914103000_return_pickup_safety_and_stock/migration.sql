-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('RESELLABLE', 'DAMAGED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "returnCondition" "ReturnCondition",
ADD COLUMN     "returnPorterAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "returnPorterLastError" TEXT,
ADD COLUMN     "returnPorterReconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnStockRestored" BOOLEAN NOT NULL DEFAULT false;

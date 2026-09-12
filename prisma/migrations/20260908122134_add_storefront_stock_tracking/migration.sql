-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "stockReserved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "catalogProductId" TEXT;

-- CreateTable
CREATE TABLE "ProductStock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "storeName" TEXT NOT NULL DEFAULT 'Deep Automobiles',
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "addressLine" TEXT,
    "gstNumber" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

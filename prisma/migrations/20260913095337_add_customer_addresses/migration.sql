-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "flatNo" TEXT,
    "floor" TEXT,
    "area" TEXT NOT NULL,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "pincode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- Enforce at most one default address per customer at the database level,
-- as a backstop to the application-level clear-then-set transaction in
-- lib/addresses.ts (setDefaultAddressForUser / updateAddressForUser).
CREATE UNIQUE INDEX "Address_userId_isDefault_unique"
  ON "Address" ("userId")
  WHERE "isDefault" = true;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

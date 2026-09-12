-- AlterTable
ALTER TABLE "BikePartListing" ADD COLUMN     "compatibleModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "deliveryDaysMax" INTEGER,
ADD COLUMN     "deliveryDaysMin" INTEGER,
ADD COLUMN     "finish" TEXT,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "material" TEXT,
ADD COLUMN     "offerLabel" TEXT,
ADD COLUMN     "packIncludes" TEXT,
ADD COLUMN     "rating" DECIMAL(2,1),
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "warrantyMonths" INTEGER,
ADD COLUMN     "weightKg" DECIMAL(6,3);

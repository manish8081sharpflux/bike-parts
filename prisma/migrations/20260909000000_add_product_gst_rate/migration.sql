ALTER TABLE "BikePartListing"
ADD COLUMN "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 18;

ALTER TABLE "BikePartListing"
ADD CONSTRAINT "BikePartListing_gstRate_check" CHECK ("gstRate" >= 0 AND "gstRate" <= 100);

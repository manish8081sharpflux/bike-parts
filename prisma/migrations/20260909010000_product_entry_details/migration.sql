ALTER TABLE "BikePartListing"
  ADD COLUMN "oemPartNumber" TEXT,
  ADD COLUMN "productType" TEXT,
  ADD COLUMN "specifications" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "compatibleVehicles" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "searchTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "packageContents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve existing free text as one item instead of guessing comma boundaries.
UPDATE "BikePartListing" SET "packageContents" = ARRAY["packIncludes"]
WHERE "packIncludes" IS NOT NULL AND TRIM("packIncludes") <> '';

UPDATE "BikePartListing" AS listing SET "compatibleVehicles" = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'brand', listing."brand", 'model', model, 'variant', '', 'yearRange', ''
  )), '[]'::jsonb)
  FROM unnest(listing."compatibleModels") AS model
);

import assert from "node:assert/strict";
import test from "node:test";
import { buildPackage, PackageBuildError } from "@/lib/shipping/package";
import { isShiprocketReversePickedUp } from "@/lib/shipping/status-mapping";

// 24. missing product weight prevents shipment
test("a missing shipping weight blocks package creation, naming the product", () => {
  assert.throws(
    () => buildPackage([{ productName: "Brake Pads", quantity: 2, weightKg: null, lengthCm: 10, breadthCm: 10, heightCm: 5 }]),
    (error: unknown) => {
      assert.ok(error instanceof PackageBuildError);
      assert.match(error.message, /Brake Pads/);
      assert.match(error.message, /shipping weight/i);
      return true;
    }
  );
});

// 22. missing dimensions produces a useful error (single-product order)
test("a missing dimension on a single-product order blocks package creation, naming the product", () => {
  assert.throws(
    () => buildPackage([{ productName: "Oil Filter", quantity: 1, weightKg: 0.2, lengthCm: null, breadthCm: 10, heightCm: 5 }]),
    (error: unknown) => {
      assert.ok(error instanceof PackageBuildError);
      assert.match(error.message, /Oil Filter/);
      assert.match(error.message, /dimensions/i);
      return true;
    }
  );
});

test("a single product's own real dimensions are used as-is", () => {
  const result = buildPackage([{ productName: "Oil Filter", quantity: 3, weightKg: 0.2, lengthCm: 12, breadthCm: 8, heightCm: 6 }]);
  assert.equal(result.usesRealDimensions, true);
  assert.equal(result.package.lengthCm, 12);
  assert.equal(result.package.breadthCm, 8);
  assert.equal(result.package.heightCm, 6);
});

// 23. multiple product quantities calculate total weight correctly
test("weight is the real sum of productWeight × quantity across every line", () => {
  const result = buildPackage([
    { productName: "Brake Pads", quantity: 2, weightKg: 0.3, lengthCm: 10, breadthCm: 10, heightCm: 5 },
    { productName: "Oil Filter", quantity: 1, weightKg: 0.2, lengthCm: 8, breadthCm: 8, heightCm: 6 },
    { productName: "Spark Plug", quantity: 3, weightKg: 0.05, lengthCm: 3, breadthCm: 3, heightCm: 3 },
  ]);
  // (0.3*2) + (0.2*1) + (0.05*3) = 0.6 + 0.2 + 0.15 = 0.95
  assert.equal(Math.round(result.package.weightKg * 100) / 100, 0.95);
});

test("multiple distinct products use the configured default parcel size, not a per-product dimension sum, and this is flagged for admin confirmation", () => {
  const result = buildPackage([
    { productName: "Brake Pads", quantity: 2, weightKg: 0.3, lengthCm: 20, breadthCm: 20, heightCm: 20 },
    { productName: "Oil Filter", quantity: 1, weightKg: 0.2, lengthCm: 20, breadthCm: 20, heightCm: 20 },
  ]);
  assert.equal(result.usesRealDimensions, false, "must not silently sum per-product dimensions for a multi-product shipment");
  // Never the naive sum (40+40=80) of the two products' own dimensions.
  assert.notEqual(result.package.lengthCm, 40);
});

test("a multi-product order still requires every line's weight, even though dimensions fall back to the default", () => {
  assert.throws(
    () =>
      buildPackage([
        { productName: "Brake Pads", quantity: 2, weightKg: 0.3, lengthCm: null, breadthCm: null, heightCm: null },
        { productName: "Oil Filter", quantity: 1, weightKg: null, lengthCm: null, breadthCm: null, heightCm: null },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof PackageBuildError);
      assert.match(error.message, /Oil Filter/);
      return true;
    }
  );
});

// Reverse-shipment status mapping
test("isShiprocketReversePickedUp recognizes collection/in-transit statuses but not RTO/exception statuses", () => {
  assert.equal(isShiprocketReversePickedUp("PICKED UP"), true);
  assert.equal(isShiprocketReversePickedUp("IN TRANSIT"), true);
  assert.equal(isShiprocketReversePickedUp("DELIVERED"), true);
  assert.equal(isShiprocketReversePickedUp("PICKUP SCHEDULED"), false);
  assert.equal(isShiprocketReversePickedUp("RTO INITIATED"), false);
  assert.equal(isShiprocketReversePickedUp("PICKUP EXCEPTION"), false);
});

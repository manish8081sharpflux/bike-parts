import assert from "node:assert/strict";
import test from "node:test";
import { buildPackage, calculateTotalWeightKg, PackageBuildError } from "@/lib/shipping/package";
import { isBorzoReversePickedUp, isShiprocketReversePickedUp, mapBorzoStatusToOrderStatus } from "@/lib/shipping/status-mapping";

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

// Borzo return pickup — same idea, applied to a Borzo delivery order where
// the customer's address is the pickup point (see createBorzoReturnPickupAction).
test("isBorzoReversePickedUp recognizes completed/point-level pickup signals but never 'active' alone", () => {
  assert.equal(isBorzoReversePickedUp("completed"), true);
  assert.equal(isBorzoReversePickedUp("active", ["picked up from pickup point"]), true);
  assert.equal(isBorzoReversePickedUp("active", ["arrived at drop-off"]), true);
  assert.equal(isBorzoReversePickedUp("active"), false, "no point-level signal yet — courier may only just be assigned");
  assert.equal(isBorzoReversePickedUp("new"), false);
  assert.equal(isBorzoReversePickedUp("cancelled"), false);
  assert.equal(isBorzoReversePickedUp("cancelled", ["picked up from pickup point"]), false, "cancelled always wins");
});

// calculateTotalWeightKg — Borzo's request shape has no dimensions field, so
// local deliveries use this instead of buildPackage.
test("calculateTotalWeightKg sums productWeight x quantity and never approximates a missing weight", () => {
  const total = calculateTotalWeightKg([
    { productName: "Brake Pads", quantity: 2, weightKg: 0.3 },
    { productName: "Oil Filter", quantity: 1, weightKg: 0.2 },
  ]);
  assert.equal(Math.round(total * 100) / 100, 0.8);

  assert.throws(
    () => calculateTotalWeightKg([{ productName: "Spark Plug", quantity: 1, weightKg: null }]),
    (error: unknown) => {
      assert.ok(error instanceof PackageBuildError);
      assert.match(error.message, /Spark Plug/);
      return true;
    }
  );
});

// 8/9. Borzo delivered / out-for-delivery mapping — only the confirmed
// order-level statuses (new/available/active/delayed/completed/cancelled)
// are ground truth; point-level strings are a best-effort upgrade only.
test("mapBorzoStatusToOrderStatus maps confirmed order-level statuses correctly", () => {
  assert.equal(mapBorzoStatusToOrderStatus("completed"), "DELIVERED");
  assert.equal(mapBorzoStatusToOrderStatus("cancelled"), "CANCELLED");
  assert.equal(mapBorzoStatusToOrderStatus("active"), null, "a courier is assigned but nothing confirms the parcel has left yet — stay put, don't guess SHIPPED");
  assert.equal(mapBorzoStatusToOrderStatus("new"), null, "not yet actionable — never advances the order");
  assert.equal(mapBorzoStatusToOrderStatus("available"), null);
  assert.equal(mapBorzoStatusToOrderStatus("delayed"), null, "still in progress — never regresses status");
});

test("mapBorzoStatusToOrderStatus upgrades 'active' to OUT_FOR_DELIVERY using a best-effort point-level hint", () => {
  assert.equal(mapBorzoStatusToOrderStatus("active", { pointStatuses: ["arrived at drop-off"] }), "OUT_FOR_DELIVERY");
  assert.equal(mapBorzoStatusToOrderStatus("active", { pointStatuses: ["picked up from pickup point"] }), "OUT_FOR_DELIVERY");
  // Observed directly from a live Borzo sandbox order once the courier left
  // the pickup point with the package — see status-mapping.ts's file header.
  assert.equal(mapBorzoStatusToOrderStatus("active", { pointStatuses: ["courier_departed"] }), "OUT_FOR_DELIVERY");
});

test("mapBorzoStatusToOrderStatus treats a 'finished' drop-point status as delivered, and never advances on GPS alone", () => {
  assert.equal(mapBorzoStatusToOrderStatus("active", { pointStatuses: ["finished"] }), "DELIVERED");
  // A courier can be broadcasting a live position while still travelling TO
  // the pickup point — merely having GPS is not proof the parcel departed,
  // so mapBorzoStatusToOrderStatus no longer even accepts a live-location
  // hint (see its signature); only a real point-level status can upgrade
  // "active" to OUT_FOR_DELIVERY.
  assert.equal(mapBorzoStatusToOrderStatus("active", {}), null);
});

test("mapBorzoStatusToOrderStatus never crashes on an unrecognized status string", () => {
  assert.equal(mapBorzoStatusToOrderStatus("some-future-borzo-status"), null);
  assert.equal(mapBorzoStatusToOrderStatus(""), null);
});

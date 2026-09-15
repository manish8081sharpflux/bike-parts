import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Order } from "@/app/home/types";
import { OrderStatusCard, ShipmentDetails, ShipmentTracking } from "@/app/home/ShipmentComponents";
import { expectedDelivery, getTrackingSteps, lastTrackingUpdate, safeTrackingUrl } from "@/lib/order-tracking";
import { computeExpectedDeliveryLabel, mapDbOrderStatus } from "@/app/home/utils";

const placedAt = Date.parse("2026-09-14T05:00:00Z");
const order = (overrides: Partial<Order> = {}) => ({
  status: "processing", placedAt, events: [], expectedDeliveryDate: null,
  shippingProvider: null, shippingStatus: null, shippingCourierName: null, shippingAwbCode: null, shippingTrackingUrl: null,
  ...overrides,
} as Order);
const render = (component: typeof ShipmentTracking | typeof ShipmentDetails | typeof OrderStatusCard, input: Order) => renderToStaticMarkup(createElement(component, { order: input }));

test("preparing without shipment: no AWB, courier, invented ETA, or tracking button", () => {
  const input = order();
  const html = render(OrderStatusCard, input) + render(ShipmentDetails, input) + render(ShipmentTracking, input);
  assert.match(html, /Your order is being prepared/);
  for (const value of ["AWB Number", "Courier Partner", "Estimated Delivery", "Expected Delivery", "Track Shipment", "On time", "null", "undefined"]) assert.ok(!html.includes(value), value);
});

for (const [status, states] of [
  ["shipped", ["completed", "completed", "active", "pending", "pending"]],
  ["out_for_delivery", ["completed", "completed", "completed", "active", "pending"]],
  ["delivered", ["completed", "completed", "completed", "completed", "completed"]],
] as const) {
  test(`${status} timeline has the correct five states`, () => {
    const steps = getTrackingSteps(order({ status }));
    assert.deepEqual(steps.map((s) => s.state), states);
    assert.deepEqual(steps.map((s) => s.timestamp), [placedAt, null, null, null, null]);
  });
}

test("shipped keeps its own UI status and real shipment fields", () => {
  assert.equal(mapDbOrderStatus("SHIPPED"), "shipped");
  const input = order({ status: "shipped", shippingCourierName: "Delhivery", shippingAwbCode: "123456789012" });
  assert.match(render(OrderStatusCard, input), /Your order is on the way!/);
  const html = render(ShipmentDetails, input);
  assert.match(html, /Delhivery/); assert.match(html, /123456789012/);
});

test("out for delivery opens only the actual tracking URL in a new tab", () => {
  const input = order({ status: "out_for_delivery", shippingTrackingUrl: "https://tracking.example.test/actual-provider-link" });
  assert.match(render(OrderStatusCard, input), /Your order is out for delivery!/);
  const html = render(ShipmentTracking, input);
  assert.match(html, /href="https:\/\/tracking.example.test\/actual-provider-link"/);
  assert.match(html, /target="_blank" rel="noreferrer"/);
});

test("delivered overrides a stale provider status and shows only recorded delivery time", () => {
  const input = order({ status: "delivered", shippingStatus: "Out for Delivery", events: [
    { type: "STATUS_CHANGE", message: "Status changed to Delivered (shipping status delivered)", createdAt: placedAt + 1000 },
  ] });
  assert.match(render(OrderStatusCard, input), /Your order has been delivered!/);
  assert.match(render(OrderStatusCard, input), /Delivered on/);
  assert.ok(!render(ShipmentTracking, input).includes("Out For Delivery"));
  assert.ok(!render(OrderStatusCard, order({ status: "delivered" })).includes("Delivered on"));
});

test("missing URL leaves AWB visible without synthesizing a link", () => {
  const html = render(ShipmentTracking, order({ shippingAwbCode: "REAL-AWB" }));
  assert.match(html, /REAL-AWB/); assert.ok(!html.includes("href="));
});

test("missing AWB and missing courier each hide only their respective rows", () => {
  const html = render(ShipmentTracking, order({ shippingCourierName: "Courier" }));
  assert.ok(!html.includes("AWB Number")); assert.match(html, /Courier Partner/);
  const awbOnly = render(ShipmentTracking, order({ shippingAwbCode: "AWB" }));
  assert.ok(!awbOnly.includes("Courier Partner")); assert.match(awbOnly, /AWB Number/);
});

test("legacy Porter shows its own real order reference and no Shiprocket branding", () => {
  const input = order({ shippingProvider: "PORTER", shippingOrderId: "porter-real-id", shippingStatus: "in_transit" });
  const html = render(ShipmentDetails, input) + render(ShipmentTracking, input);
  assert.match(html, /Porter/); assert.match(html, /porter-real-id/);
  assert.ok(!html.includes("Shiprocket")); assert.ok(!html.includes("Shipment ID"));
});

test("Shiprocket branding and shipment identifiers use stored values", () => {
  const input = order({ shippingProvider: "SHIPROCKET", shippingOrderId: "SR-actual", shippingShipmentId: "SHIP-actual" });
  const html = render(ShipmentDetails, input) + render(ShipmentTracking, input);
  assert.match(html, /Powered by Shiprocket/); assert.match(html, /SR-actual/); assert.match(html, /SHIP-actual/);
});

test("no fake rider, map, GPS distance, rating, deliveries or chat is rendered in any status", () => {
  for (const status of ["processing", "shipped", "out_for_delivery", "delivered", "cancelled"] as const) {
    const input = order({ status });
    const html = render(OrderStatusCard, input) + render(ShipmentDetails, input) + render(ShipmentTracking, input);
    for (const fake of ["rider", "km away", "leaflet", "iframe", "OpenStreetMap", "Ravi", "rating", "Chat", "Delivery Executive"]) assert.ok(!html.includes(fake), `${status}: ${fake}`);
  }
});

test("real executive information is optional and phone links require an actual dialable number", () => {
  const html = render(ShipmentDetails, order({ deliveryExecutiveName: "Provider Executive", deliveryExecutivePhone: "+91 98765 43210" }));
  assert.match(html, /Delivery Executive/); assert.match(html, /Provider Executive/); assert.match(html, /tel:\+919876543210/);
  const masked = render(ShipmentDetails, order({ deliveryExecutivePhone: "98XXXXXX12" }));
  assert.match(masked, /98XXXXXX12/); assert.ok(!masked.includes("tel:"));
});

// 6/7. real rider photo, no fake avatar
test("a real Borzo courier photo renders as-is; without one, only a neutral icon is shown, never generated initials", () => {
  const withPhoto = render(ShipmentDetails, order({
    shippingProvider: "BORZO", shippingOrderId: "borzo-1", deliveryExecutiveName: "Rahul Sharma", deliveryExecutivePhotoUrl: "https://borzodelivery.com/photo/1.jpg",
  }));
  assert.match(withPhoto, /<img[^>]*src="https:\/\/borzodelivery\.com\/photo\/1\.jpg"/);

  const withoutPhoto = render(ShipmentDetails, order({ shippingProvider: "BORZO", shippingOrderId: "borzo-1", deliveryExecutiveName: "Rahul Sharma" }));
  assert.ok(!withoutPhoto.includes("<img"));
  assert.ok(!/[A-Z]{2}<\/span>/.test(withoutPhoto), "must never render generated initials as a fake avatar");
});

// 21/22. map only displays real coordinates; customer page never shows a fake rider
test("a live rider map renders only when both real coordinates are present, for Borzo only", () => {
  const withCoords = render(ShipmentTracking, order({
    shippingProvider: "BORZO", shippingOrderId: "borzo-1", deliveryExecutiveLatitude: 18.5204, deliveryExecutiveLongitude: 73.8567,
  }));
  assert.match(withCoords, /<iframe/); assert.match(withCoords, /18\.5204/); assert.match(withCoords, /73\.8567/);
  assert.ok(!withCoords.includes("Live courier location is not available yet."));

  const withoutCoords = render(ShipmentTracking, order({ shippingProvider: "BORZO", shippingOrderId: "borzo-1" }));
  assert.ok(!withoutCoords.includes("<iframe"));
  assert.match(withoutCoords, /Live courier location is not available yet\./);

  // A Shiprocket order must never render a map even if (hypothetically) a
  // stray coordinate pair existed on the row — the map is Borzo-only.
  const shiprocket = render(ShipmentTracking, order({
    shippingProvider: "SHIPROCKET", shippingOrderId: "sr-1", deliveryExecutiveLatitude: 18.5204, deliveryExecutiveLongitude: 73.8567,
  }));
  assert.ok(!shiprocket.includes("<iframe"));
});

test("only one of latitude/longitude never renders a map or claims a live position", () => {
  const html = render(ShipmentTracking, order({ shippingProvider: "BORZO", shippingOrderId: "borzo-1", deliveryExecutiveLatitude: 18.5204 }));
  assert.ok(!html.includes("<iframe"));
  assert.match(html, /Live courier location is not available yet\./);
});

// Rider live-state line — Part 12
test("rider live-state line reflects real signals: assigned-with-location vs assigned-only vs no rider", () => {
  const onTheWay = render(ShipmentDetails, order({
    shippingProvider: "BORZO", shippingOrderId: "borzo-1", deliveryExecutiveName: "Rahul Sharma", deliveryExecutiveLatitude: 18.5, deliveryExecutiveLongitude: 73.8,
  }));
  assert.match(onTheWay, /Your rider is on the way\./);

  const assignedOnly = render(ShipmentDetails, order({ shippingProvider: "BORZO", shippingOrderId: "borzo-1", deliveryExecutiveName: "Rahul Sharma" }));
  assert.match(assignedOnly, /Delivery executive assigned\./);
  assert.ok(!assignedOnly.includes("Your rider is on the way"));

  const noRider = render(ShipmentDetails, order({ shippingProvider: "BORZO", shippingOrderId: "borzo-1" }));
  assert.match(noRider, /Borzo delivery created\./);
  assert.ok(!noRider.includes("Delivery Executive"));
});

// Borzo-specific labels (Part 4/6/13) — no AWB/Shipment ID vocabulary
test("Borzo shipment details use Borzo-specific labels and never claim an AWB/Shipment ID", () => {
  const html = render(ShipmentDetails, order({ shippingProvider: "BORZO", shippingOrderId: "BZ-999", shippingCourierName: "Rahul Sharma" }));
  assert.match(html, /Borzo Order ID/); assert.match(html, /BZ-999/);
  assert.match(html, /Courier\/Rider/);
  assert.ok(!html.includes("AWB Number"));
  assert.ok(!html.includes("Shipment ID"));
});

test("Borzo tracking button reads 'Track Delivery', Shiprocket keeps 'Track Shipment'", () => {
  const borzo = render(ShipmentTracking, order({ shippingProvider: "BORZO", shippingOrderId: "BZ-1", shippingTrackingUrl: "https://borzodelivery.com/track/1" }));
  assert.match(borzo, /Track Delivery/); assert.ok(!borzo.includes("Track Shipment"));

  const shiprocket = render(ShipmentTracking, order({ shippingProvider: "SHIPROCKET", shippingOrderId: "SR-1", shippingTrackingUrl: "https://shiprocket.example/track/1" }));
  assert.match(shiprocket, /Track Shipment/); assert.ok(!shiprocket.includes("Track Delivery"));
});

test("timeline recognizes human and enum status messages, never invents missing times", () => {
  const input = order({ status: "delivered", events: [
    { type: "STATUS_CHANGE", message: "Status changed to Preparing", createdAt: placedAt + 1000 },
    { type: "STATUS_CHANGE", message: "Status changed to SHIPPED", createdAt: placedAt + 2000 },
    { type: "STATUS_CHANGE", message: "Status changed to Out for Delivery (shipping status out_for_delivery)", createdAt: placedAt + 3000 },
  ] });
  assert.deepEqual(getTrackingSteps(input).map((s) => s.timestamp), [placedAt, placedAt + 1000, placedAt + 2000, placedAt + 3000, null]);
  assert.ok(lastTrackingUpdate(input));
  assert.equal(lastTrackingUpdate(order()), null);
});

test("ETA uses provider date before stored estimate, and claims today only for today's real ETA", () => {
  const input = order({ status: "out_for_delivery", shippingEstimatedDeliveryAt: "2026-09-16T12:00:00Z", expectedDeliveryDate: "18 Sept 2026" });
  assert.match(expectedDelivery(input, Date.parse("2026-09-16T01:00:00Z"))!, /^Today, /);
  assert.ok(!expectedDelivery(input, Date.parse("2026-09-15T01:00:00Z"))!.includes("Today"));
  assert.equal(expectedDelivery(order({ expectedDeliveryDate: "18 Sept 2026" })), "18 Sept 2026");
  assert.equal(expectedDelivery(order()), null);
  assert.equal(expectedDelivery(order({ status: "delivered", expectedDeliveryDate: "18 Sept 2026" })), null);
});

test("invalid estimates never become guessed dates", () => {
  for (const estimate of ["", "unknown", "16 Sep 2026", "2026-09-16", "-2 days", "6-2 days"]) assert.equal(computeExpectedDeliveryLabel(placedAt, estimate), null);
  assert.ok(computeExpectedDeliveryLabel(placedAt, "Delivery in 2-4 days"));
});

test("unsafe tracking links and internal dispatch placeholders are hidden", () => {
  assert.equal(safeTrackingUrl("javascript:alert(1)"), null);
  assert.equal(safeTrackingUrl("/made-up-link"), null);
  const html = render(ShipmentDetails, order({ shippingOrderId: "CREATING", shippingStatus: "RECONCILIATION_REQUIRED" }));
  assert.ok(!html.includes("CREATING")); assert.ok(!html.includes("RECONCILIATION"));
});

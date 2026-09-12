import test from "node:test";
import assert from "node:assert/strict";
import { readProductDetails } from "../lib/products/product-details.ts";

function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, JSON.stringify(value));
  return data;
}

test("normalizes dynamic fields and formats package quantities", () => {
  const result = readProductDetails(form({
    specifications: [{ name: " Voltage ", value: " 12V " }, { name: "", value: "" }],
    compatibleVehicles: [{ brand: "Honda", model: "Shine 125", variant: "Drum Brake", yearRange: "2020-2024" }],
    features: [{ value: " Waterproof " }, { value: "" }],
    packageContents: [{ quantity: "2", product: "Pad, clips included" }],
  }));
  assert.deepEqual(result.specifications, [{ name: "Voltage", value: "12V" }]);
  assert.deepEqual(result.features, ["Waterproof"]);
  assert.deepEqual(result.packageContents, ["2 X Pad, clips included"]);
  assert.equal(result.compatibleVehicles[0].variant, "Drum Brake");
});

test("keeps legacy package content strings readable", () => {
  const result = readProductDetails(form({ packageContents: ["1 x Brake Pad"] }));
  assert.deepEqual(result.packageContents, ["1 x Brake Pad"]);
});

test("rejects incomplete or duplicate specifications", () => {
  assert.throws(() => readProductDetails(form({ specifications: [{ name: "Voltage", value: "" }] })), /name and value/);
  assert.throws(() => readProductDetails(form({ specifications: [{ name: "Voltage", value: "12V" }, { name: "voltage", value: "6V" }] })), /unique/);
});

test("rejects incomplete vehicles and reversed year ranges", () => {
  const vehicle = { brand: "Honda", model: "Shine", variant: "", yearRange: "2024-2020" };
  assert.throws(() => readProductDetails(form({ compatibleVehicles: [vehicle] })), /year range/);
  assert.throws(() => readProductDetails(form({ compatibleVehicles: [{ ...vehicle, model: "", yearRange: "" }] })), /brand and model/);
});

test("empty rows can be removed and malformed payloads are rejected", () => {
  assert.deepEqual(readProductDetails(form({})), { specifications: [], compatibleVehicles: [], features: [], packageContents: [] });
  const data = new FormData();
  data.set("specifications", "broken JSON");
  assert.throws(() => readProductDetails(data), /Invalid specifications/);
});

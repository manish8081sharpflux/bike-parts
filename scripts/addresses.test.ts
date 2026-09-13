import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  createAddressForUser,
  deleteAddressForUser,
  listAddressesForUser,
  setDefaultAddressForUser,
  updateAddressForUser,
} from "@/lib/addresses";
import { validateAddressInput } from "@/lib/address-validation";

const suffix = `${Date.now()}-${process.pid}`;
const userIds: string[] = [];
const addressIds: string[] = [];
const orderIds: string[] = [];
const listingIds: string[] = [];

async function testUser(tag: string) {
  const phone = `7${String(Date.now()).slice(-8)}${userIds.length % 10}`;
  const user = await prisma.user.create({ data: { phone, name: tag } });
  userIds.push(user.id);
  return user;
}

const validInput = (overrides: Partial<Record<string, unknown>> = {}) => ({
  label: "Home",
  contactName: "Test Customer",
  phone: "9876543210",
  flatNo: "H.No. 1",
  floor: "",
  area: "MG Road",
  landmark: "",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411001",
  ...overrides,
});

test("validateAddressInput rejects missing/invalid required fields", () => {
  assert.equal(validateAddressInput({}).ok, false);
  assert.equal(validateAddressInput({ ...validInput(), phone: "12345" }).ok, false);
  assert.equal(validateAddressInput({ ...validInput(), pincode: "1234" }).ok, false);
  assert.equal(validateAddressInput({ ...validInput(), city: "" }).ok, false);
  assert.equal(validateAddressInput({ ...validInput(), area: "" }).ok, false);
  assert.equal(validateAddressInput({ ...validInput(), contactName: "" }).ok, false);
  assert.equal(validateAddressInput({ ...validInput(), latitude: "not-a-number" }).ok, false);
  const ok = validateAddressInput(validInput());
  assert.equal(ok.ok, true);
});

test("createAddressForUser assigns userId server-side and makes the first address default", async () => {
  const user = await testUser("create-test");
  const result = await createAddressForUser(user.id, validInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  addressIds.push(result.address.id);

  assert.equal(result.address.userId, user.id);
  assert.equal(result.address.isDefault, true);
  assert.equal(result.address.contactName, "Test Customer");

  // A second address for the same user should NOT automatically become default.
  const second = await createAddressForUser(user.id, validInput({ area: "Second Area" }));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  addressIds.push(second.address.id);
  assert.equal(second.address.isDefault, false);
});

test("concurrent first-address creation creates both rows and exactly one default", async (t) => {
  const user = await testUser("concurrent-create");
  // Make both real DB reads finish before either insert, reliably exercising
  // the partial-index conflict rather than depending on scheduler timing.
  const originalCount = prisma.address.count;
  const count = originalCount.bind(prisma.address);
  t.after(() => { prisma.address.count = originalCount; });
  let reads = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  prisma.address.count = (async (...args: Parameters<typeof count>) => {
    const result = await count(...args);
    if (++reads === 2) release();
    await barrier;
    return result;
  }) as typeof originalCount;
  const [a, b] = await Promise.all([
    createAddressForUser(user.id, validInput({ flatNo: "A-1", area: "Area A" })),
    createAddressForUser(user.id, validInput({ flatNo: "B-1", area: "Area B" })),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  const rows = await prisma.address.findMany({ where: { userId: user.id } });
  addressIds.push(...rows.map((row) => row.id));
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => row.isDefault).length, 1);
  assert.deepEqual(rows.map((row) => row.flatNo).sort(), ["A-1", "B-1"]);
});

test("address creation propagates unrelated unique and database errors without retrying", async (t) => {
  const user = await testUser("create-errors");
  const originalCreate = prisma.address.create;
  t.after(() => { prisma.address.create = originalCreate; });
  for (const error of [
    new Prisma.PrismaClientKnownRequestError("unrelated unique conflict", {
      code: "P2002", clientVersion: Prisma.prismaVersion.client,
      meta: { modelName: "Address", target: ["id"] },
    }),
    new Error("database unavailable"),
  ]) {
    let calls = 0;
    prisma.address.create = () => { calls++; throw error; };
    await assert.rejects(createAddressForUser(user.id, validInput()), (caught) => caught === error);
    assert.equal(calls, 1);
  }
});

test("createAddressForUser rejects invalid input without touching the database", async () => {
  const user = await testUser("create-invalid");
  const before = await listAddressesForUser(user.id);
  const result = await createAddressForUser(user.id, { ...validInput(), pincode: "abc" });
  assert.equal(result.ok, false);
  const after_ = await listAddressesForUser(user.id);
  assert.equal(after_.length, before.length);
});

test("updateAddressForUser enforces ownership — a different user's id updates nothing", async () => {
  const owner = await testUser("owner-update");
  const attacker = await testUser("attacker-update");
  const created = await createAddressForUser(owner.id, validInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  addressIds.push(created.address.id);

  const result = await updateAddressForUser(created.address.id, attacker.id, validInput({ city: "Hacked City" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal("notFound" in result, true);

  const unchanged = await prisma.address.findUniqueOrThrow({ where: { id: created.address.id } });
  assert.equal(unchanged.city, "Pune");
});

test("updateAddressForUser succeeds for the real owner", async () => {
  const owner = await testUser("owner-update-2");
  const created = await createAddressForUser(owner.id, validInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  addressIds.push(created.address.id);

  const result = await updateAddressForUser(created.address.id, owner.id, validInput({ city: "Mumbai" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.address.city, "Mumbai");
});

test("deleteAddressForUser enforces ownership — a different user cannot delete it", async () => {
  const owner = await testUser("owner-delete");
  const attacker = await testUser("attacker-delete");
  const created = await createAddressForUser(owner.id, validInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  addressIds.push(created.address.id);

  const result = await deleteAddressForUser(created.address.id, attacker.id);
  assert.equal(result.ok, false);

  const stillThere = await prisma.address.findUnique({ where: { id: created.address.id } });
  assert.ok(stillThere);
});

test("deleting the default address promotes another remaining address to default", async () => {
  const owner = await testUser("owner-promote");
  const first = await createAddressForUser(owner.id, validInput({ area: "First" }));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  addressIds.push(first.address.id);
  const second = await createAddressForUser(owner.id, validInput({ area: "Second" }));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  addressIds.push(second.address.id);

  assert.equal(first.address.isDefault, true);

  const deleted = await deleteAddressForUser(first.address.id, owner.id);
  assert.equal(deleted.ok, true);

  const remaining = await prisma.address.findUniqueOrThrow({ where: { id: second.address.id } });
  assert.equal(remaining.isDefault, true);
});

test("setDefaultAddressForUser clears every other address and never touches another customer", async () => {
  const userA = await testUser("default-race-a");
  const userB = await testUser("default-race-b");

  const a1 = await createAddressForUser(userA.id, validInput({ area: "A1" }));
  const a2 = await createAddressForUser(userA.id, validInput({ area: "A2" }));
  const b1 = await createAddressForUser(userB.id, validInput({ area: "B1" }));
  assert.ok(a1.ok && a2.ok && b1.ok);
  if (!a1.ok || !a2.ok || !b1.ok) return;
  addressIds.push(a1.address.id, a2.address.id, b1.address.id);

  assert.equal(a1.address.isDefault, true); // first address for userA
  assert.equal(b1.address.isDefault, true); // first address for userB

  const setDefault = await setDefaultAddressForUser(a2.address.id, userA.id);
  assert.equal(setDefault.ok, true);

  const [refreshedA1, refreshedA2, refreshedB1] = await Promise.all([
    prisma.address.findUniqueOrThrow({ where: { id: a1.address.id } }),
    prisma.address.findUniqueOrThrow({ where: { id: a2.address.id } }),
    prisma.address.findUniqueOrThrow({ where: { id: b1.address.id } }),
  ]);
  assert.equal(refreshedA1.isDefault, false);
  assert.equal(refreshedA2.isDefault, true);
  // Setting userA's default must never clear userB's default.
  assert.equal(refreshedB1.isDefault, true);

  const userADefaults = await prisma.address.count({ where: { userId: userA.id, isDefault: true } });
  assert.equal(userADefaults, 1);
});

test("setDefaultAddressForUser rejects a different customer's address id and clears nothing", async () => {
  const owner = await testUser("default-owner");
  const attacker = await testUser("default-attacker");
  const ownerAddr = await createAddressForUser(owner.id, validInput());
  const attackerAddr = await createAddressForUser(attacker.id, validInput());
  assert.ok(ownerAddr.ok && attackerAddr.ok);
  if (!ownerAddr.ok || !attackerAddr.ok) return;
  addressIds.push(ownerAddr.address.id, attackerAddr.address.id);

  const result = await setDefaultAddressForUser(ownerAddr.address.id, attacker.id);
  assert.equal(result.ok, false);

  // Attacker's own default must be untouched by the failed attempt.
  const attackerRow = await prisma.address.findUniqueOrThrow({ where: { id: attackerAddr.address.id } });
  assert.equal(attackerRow.isDefault, true);
  const ownerRow = await prisma.address.findUniqueOrThrow({ where: { id: ownerAddr.address.id } });
  assert.equal(ownerRow.isDefault, true);
});

test("checkout-style ownership lookup (findFirst by id+userId) rejects another customer's address", async () => {
  const owner = await testUser("checkout-owner");
  const attacker = await testUser("checkout-attacker");
  const created = await createAddressForUser(owner.id, validInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  addressIds.push(created.address.id);

  // This mirrors exactly what app/api/checkout/route.ts runs before trusting
  // an addressId — never findUnique by id alone.
  const asAttacker = await prisma.address.findFirst({
    where: { id: created.address.id, userId: attacker.id },
  });
  assert.equal(asAttacker, null);

  const asOwner = await prisma.address.findFirst({
    where: { id: created.address.id, userId: owner.id },
  });
  assert.ok(asOwner);
});

test("order snapshot stays immutable after the source address is edited", async () => {
  const owner = await testUser("snapshot-owner");
  const created = await createAddressForUser(owner.id, validInput({ city: "Pune", area: "Baner" }));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  addressIds.push(created.address.id);

  const listing = await prisma.bikePartListing.create({
    data: {
      name: `Snapshot Test ${suffix}`,
      slug: `snapshot-test-${suffix}`,
      brand: "Test",
      category: "Test",
      price: 100,
      stock: 5,
    },
  });
  listingIds.push(listing.id);

  // Same snapshot shape app/api/checkout/route.ts builds at checkout time.
  const snapshot = {
    sourceAddressId: created.address.id,
    label: created.address.label,
    contactName: created.address.contactName,
    phone: created.address.phone,
    flatNo: created.address.flatNo,
    floor: created.address.floor,
    area: created.address.area,
    landmark: created.address.landmark,
    city: created.address.city,
    state: created.address.state,
    pincode: created.address.pincode,
    latitude: created.address.latitude,
    longitude: created.address.longitude,
  };

  const order = await prisma.order.create({
    data: {
      buyerId: owner.id,
      customerName: created.address.contactName,
      customerPhone: owner.phone!,
      deliveryAddress: snapshot,
      itemsTotal: 100,
      amount: 100,
      items: { create: [{ listingId: listing.id, productName: listing.name, quantity: 1, unitPrice: 100 }] },
    },
  });
  orderIds.push(order.id);

  // Now edit the saved address — city/area change after the order exists.
  const updated = await updateAddressForUser(created.address.id, owner.id, validInput({ city: "Mumbai", area: "Andheri" }));
  assert.equal(updated.ok, true);

  const orderAfterEdit = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const snapshotAfterEdit = orderAfterEdit.deliveryAddress as typeof snapshot;
  assert.equal(snapshotAfterEdit.city, "Pune");
  assert.equal(snapshotAfterEdit.area, "Baner");

  // Deleting the address afterward must not touch the order either.
  const deleted = await deleteAddressForUser(created.address.id, owner.id);
  assert.equal(deleted.ok, true);
  const orderAfterDelete = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const snapshotAfterDelete = orderAfterDelete.deliveryAddress as typeof snapshot;
  assert.equal(snapshotAfterDelete.city, "Pune");
  assert.equal(snapshotAfterDelete.area, "Baner");
});

after(async () => {
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.address.deleteMany({ where: { id: { in: addressIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

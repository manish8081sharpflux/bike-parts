import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";

const suffix = `${Date.now()}-${process.pid}`;
const eventKeys: string[] = [];

function input(eventId: string) {
  eventKeys.push(eventId);
  return { provider: "razorpay", eventId, eventType: "refund.processed", rawBody: `{"id":"${eventId}"}` };
}

test("successful webhook is marked processed and duplicate is a no-op", async () => {
  const eventId = `success-${suffix}`;
  const first = await claimWebhookEvent(input(eventId));
  assert.equal(first.status, "claimed");
  if (first.status !== "claimed") return;
  assert.equal(await markWebhookProcessed(first.id, first.attempts), true);
  assert.deepEqual(await claimWebhookEvent(input(eventId)), { status: "already_processed" });
});

test("failed webhook can be reclaimed and then processed", async () => {
  const eventId = `retry-${suffix}`;
  const first = await claimWebhookEvent(input(eventId));
  assert.equal(first.status, "claimed");
  if (first.status !== "claimed") return;
  assert.equal(await markWebhookFailed(first.id, first.attempts, "temporary database error"), true);
  const retry = await claimWebhookEvent(input(eventId));
  assert.equal(retry.status, "claimed");
  if (retry.status === "claimed") {
    assert.equal(await markWebhookProcessed(retry.id, retry.attempts), true);
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: retry.id } });
    assert.equal(row.status, "PROCESSED");
    assert.equal(row.attempts, 2);
    assert.ok(row.processedAt);
  }
});

test("only one concurrent duplicate claims a live event", async () => {
  const eventId = `concurrent-${suffix}`;
  const results = await Promise.all([claimWebhookEvent(input(eventId)), claimWebhookEvent(input(eventId))]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["claimed", "in_progress"]);
});

test("stale processing events can be reclaimed but fresh ones cannot", async () => {
  const staleId = `stale-${suffix}`;
  eventKeys.push(staleId);
  const stale = await prisma.webhookEvent.create({
    data: {
      provider: "razorpay",
      eventId: staleId,
      eventType: "refund.processed",
      status: "PROCESSING",
      attempts: 1,
      processingStartedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });
  const reclaimed = await claimWebhookEvent(input(staleId));
  assert.equal(reclaimed.status, "claimed");
  if (reclaimed.status === "claimed") assert.equal((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: stale.id } })).attempts, 2);

  const freshId = `fresh-${suffix}`;
  eventKeys.push(freshId);
  await prisma.webhookEvent.create({
    data: {
      provider: "razorpay",
      eventId: freshId,
      eventType: "refund.processed",
      status: "PROCESSING",
      attempts: 1,
      processingStartedAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  assert.deepEqual(await claimWebhookEvent(input(freshId)), { status: "in_progress" });
});

after(async () => {
  await prisma.webhookEvent.deleteMany({ where: { provider: "razorpay", eventId: { in: eventKeys } } });
  await prisma.$disconnect();
});

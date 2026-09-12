import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export function deterministicWebhookEventId(payload: unknown, rawBody: string) {
  const value = JSON.stringify(payload);
  return crypto.createHash("sha256").update(value || rawBody).digest("hex");
}

export type WebhookClaimResult =
  | { status: "claimed"; id: string; attempts: number }
  | { status: "already_processed" }
  | { status: "in_progress" };

const DEFAULT_PROCESSING_TIMEOUT_SECONDS = 5 * 60;

export async function claimWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType: string;
  rawBody: string;
}): Promise<WebhookClaimResult> {
  const processingTimeoutSeconds = Math.max(
    30,
    Number(process.env.WEBHOOK_PROCESSING_TIMEOUT_SECONDS ?? DEFAULT_PROCESSING_TIMEOUT_SECONDS)
  );
  const staleBefore = new Date(Date.now() - processingTimeoutSeconds * 1000);
  const payloadHash = crypto.createHash("sha256").update(input.rawBody).digest("hex");

  const inserted = await prisma.$queryRaw<Array<{ id: string; attempts: number }>>`
    INSERT INTO "WebhookEvent" ("id", "provider", "eventId", "eventType", "payloadHash", "status", "attempts", "processingStartedAt")
    VALUES (${crypto.randomUUID()}, ${input.provider}, ${input.eventId}, ${input.eventType}, ${payloadHash}, 'PROCESSING', 1, now())
    ON CONFLICT ("provider", "eventId") DO NOTHING
    RETURNING "id", "attempts"
  `;
  if (inserted.length === 1) return { status: "claimed", id: inserted[0].id, attempts: inserted[0].attempts };

  const reclaimed = await prisma.webhookEvent.updateMany({
    where: {
      provider: input.provider,
      eventId: input.eventId,
      OR: [
        { status: "FAILED" },
        { status: "PROCESSING", processingStartedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lastError: null,
      processingStartedAt: new Date(),
    },
  });
  if (reclaimed.count === 1) {
    const row = await prisma.webhookEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
      select: { id: true, attempts: true },
    });
    return { status: "claimed", id: row.id, attempts: row.attempts };
  }

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
    select: { status: true },
  });
  return existing?.status === "PROCESSED"
    ? { status: "already_processed" }
    : { status: "in_progress" };
}

export async function markWebhookProcessed(id: string, attempts: number) {
  const result = await prisma.webhookEvent.updateMany({
    where: { id, status: "PROCESSING", attempts },
    data: { status: "PROCESSED", processedAt: new Date(), processingStartedAt: null, lastError: null },
  });
  return result.count === 1;
}

export async function markWebhookFailed(id: string, attempts: number, error: string) {
  const result = await prisma.webhookEvent.updateMany({
    where: { id, status: "PROCESSING", attempts },
    data: {
      status: "FAILED",
      processedAt: null,
      processingStartedAt: null,
      lastError: error.slice(0, 2000),
    },
  });
  return result.count === 1;
}

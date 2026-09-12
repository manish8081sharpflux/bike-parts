import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export function deterministicWebhookEventId(payload: unknown, rawBody: string) {
  const value = JSON.stringify(payload);
  return crypto.createHash("sha256").update(value || rawBody).digest("hex");
}

export async function claimWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType: string;
  rawBody: string;
}) {
  const inserted = await prisma.$executeRaw`
    INSERT INTO "WebhookEvent" ("id", "provider", "eventId", "eventType", "payloadHash")
    VALUES (${crypto.randomUUID()}, ${input.provider}, ${input.eventId}, ${input.eventType}, ${crypto.createHash("sha256").update(input.rawBody).digest("hex")})
    ON CONFLICT ("provider", "eventId") DO NOTHING
  `;
  return inserted === 1;
}

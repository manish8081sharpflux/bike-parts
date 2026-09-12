import { getPlatformServices } from "@/lib/platform/service-env";
import { pingMeilisearch } from "@/lib/search/meilisearch-http";

export async function GET() {
  const services = getPlatformServices();
  const meilisearchOnline = await pingMeilisearch().catch(() => false);

  return Response.json({
    ok: services.every((service) => service.requiredEnv.length === 0 || service.configured),
    checkedAt: new Date().toISOString(),
    services: services.map((service) =>
      service.name === "Meilisearch search"
        ? { ...service, online: meilisearchOnline }
        : service
    ),
  });
}

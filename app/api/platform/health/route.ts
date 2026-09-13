import { getPlatformServices } from "@/lib/platform/service-env";
import { pingMeilisearch } from "@/lib/search/meilisearch-http";

export async function GET() {
  const services = getPlatformServices();
  const meilisearchOnline = await pingMeilisearch().catch(() => false);

  const servicesWithLiveStatus = services.map((service) =>
    service.name === "Meilisearch search"
      ? { ...service, online: meilisearchOnline }
      : service
  );

  // Overall health depends only on services genuinely required to serve
  // production traffic (see requiredInProduction's doc comment in
  // lib/platform/service-env.ts) — never on whether every optional
  // integration (Meilisearch, Sentry, WhatsApp, Firebase, Resend, Cloudflare
  // Images, Better Auth, PostHog, Porter) happens to be configured.
  // Meilisearch in particular is a derived index with a PostgreSQL
  // fallback: being unconfigured, or configured but currently unreachable
  // (`online: false` above), is reported for visibility but never flips
  // `ok` — only PostgreSQL itself being unconfigured (a required service)
  // would do that, since that's the same fallback search depends on.
  const ok = servicesWithLiveStatus
    .filter((service) => service.requiredInProduction)
    .every((service) => service.configured);

  return Response.json({
    ok,
    checkedAt: new Date().toISOString(),
    services: servicesWithLiveStatus,
  });
}

import { ensureProductSearchIndex } from "@/lib/search/meilisearch-http";

export async function POST() {
  const result = await ensureProductSearchIndex();

  return Response.json(result, { status: result.ok ? 200 : 400 });
}

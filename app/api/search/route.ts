import { searchProducts } from "@/lib/search/meilisearch-http";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const results = await searchProducts(q, {
    category,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  });

  return Response.json(results);
}

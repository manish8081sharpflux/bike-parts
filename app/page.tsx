import { getStorefrontProducts } from "@/lib/storefront-catalog";
import { HomeClient } from "@/app/home-client";

// Stock changes (checkout, admin edits) need to show up promptly — this
// mirrors the admin pages' own `force-dynamic` (see docs/platform-stack.md).
export const dynamic = "force-dynamic";

export default async function Page() {
  const products = await getStorefrontProducts();
  return <HomeClient products={products} />;
}

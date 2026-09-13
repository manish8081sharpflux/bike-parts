import { MarketplaceSearch } from "@/components/marketplace-search";

export const metadata = {
  title: "Search Parts — Deep Automobiles",
};

// Every other route in this app is already dynamically rendered (session/
// cookie reads elsewhere force it); this was the one page Next statically
// prerendered at build time. Production CSP now uses a per-request nonce
// (see proxy.ts), which Next can only attach to a page's scripts when it's
// rendered per-request — a build-time-static page's inline scripts would
// have no nonce at all and get blocked by the browser.
export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-black text-[#070e2b]">Search All Parts</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Search across every listed part, independent of a selected bike.
        </p>
      </div>
      <div className="mt-4">
        <MarketplaceSearch />
      </div>
    </main>
  );
}

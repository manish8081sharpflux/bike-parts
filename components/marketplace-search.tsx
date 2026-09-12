"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  IndianRupee,
  PackageCheck,
  RefreshCcw,
  Search,
  Star,
} from "lucide-react";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BikePart } from "@/lib/products/sample-products";

const searchSchema = z.object({
  q: z.string().max(80),
  category: z.string(),
});

type SearchForm = z.infer<typeof searchSchema>;

type SearchPayload = {
  hits: BikePart[];
  found: number;
  source: "meilisearch" | "local";
  setupRequired: boolean;
};

// Matches the real category list admin listings are created under (see
// CATEGORIES in app/admin/(dashboard)/products/product-form.tsx) — search
// filters against real indexed data, so these have to line up with what's
// actually stored, not a generic placeholder list.
const categories = [
  "",
  "Engine",
  "Brake System",
  "Electrical",
  "Suspension",
  "Body Parts",
  "Tyres & Wheels",
  "Fuel System",
  "Lighting",
  "Seat & Comfort",
  "Handlebar & Controls",
  "Chain & Sprocket",
  "Exhaust System",
];

async function fetchProducts(values: SearchForm): Promise<SearchPayload> {
  const params = new URLSearchParams();
  params.set("q", values.q);

  if (values.category) {
    params.set("category", values.category);
  }

  const response = await fetch(`/api/search?${params}`);

  if (!response.ok) {
    throw new Error("Search request failed");
  }

  return response.json();
}

export function MarketplaceSearch() {
  const form = useForm<SearchForm>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      q: "",
      category: "",
    },
  });
  const values = useWatch({ control: form.control });
  const normalizedValues = useMemo(
    () => searchSchema.parse(values),
    [values]
  );
  const searchQuery = useQuery({
    queryKey: ["product-search", normalizedValues],
    queryFn: () => fetchProducts(normalizedValues),
  });

  const products = searchQuery.data?.hits ?? [];

  return (
    <section className="w-full border-y bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
          onSubmit={form.handleSubmit(() => searchQuery.refetch())}
        >
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-11 rounded-md border-slate-300 pl-9 text-sm"
              placeholder="Search brake disc, chain kit, LED headlamp..."
              {...form.register("q")}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category || "all"}
                type="button"
                variant={normalizedValues.category === category ? "default" : "outline"}
                className="h-9 rounded-md"
                onClick={() => form.setValue("category", category, { shouldValidate: true })}
              >
                {category || "All"}
              </Button>
            ))}
          </div>
          <Button type="submit" className="h-11 rounded-md">
            <RefreshCcw />
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            {searchQuery.isLoading
              ? "Searching inventory..."
              : `${searchQuery.data?.found ?? products.length} matching parts`}
          </span>
          <Badge variant={searchQuery.data?.source === "meilisearch" ? "default" : "secondary"}>
            {searchQuery.data?.source === "meilisearch"
              ? "Live search"
              : "Local fallback"}
          </Badge>
        </div>

        {searchQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Search is unavailable. Check the `/api/search` route and service env.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="rounded-md border-slate-200 shadow-none">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{product.name}</CardTitle>
                    <p className="text-sm text-slate-500">
                      {product.brand} / {product.category}
                    </p>
                  </div>
                  <Badge variant="outline">{product.condition}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="min-h-10 text-sm leading-5 text-slate-600">
                  {product.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="grid grid-cols-3 gap-3 rounded-b-md bg-slate-50 text-sm">
                <span className="flex items-center gap-1 font-medium">
                  <IndianRupee className="size-3.5" />
                  {product.price.toLocaleString("en-IN")}
                </span>
                <span className="flex items-center gap-1 text-slate-600">
                  <PackageCheck className="size-3.5" />
                  {product.stock}
                </span>
                <span className="flex items-center gap-1 text-slate-600">
                  <Star className="size-3.5 fill-amber-400 text-amber-500" />
                  {product.rating}
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

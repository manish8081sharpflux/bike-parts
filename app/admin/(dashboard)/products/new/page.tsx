import Link from "next/link";
import { createProductAction } from "@/lib/actions/admin-products";
import { ProductForm } from "../product-form";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 pb-2">
      <div>
        <Link href="/admin/products" className="text-xs font-bold text-zinc-500">
          ← Back to products
        </Link>
        <h1 className="mt-3 text-2xl font-black tracking-tight">Add product</h1>
        <p className="mt-2 text-sm text-zinc-500">Create a new part listing for your store. Fields marked * are required.</p>
      </div>

      {error ? (
        <p className="max-w-xl rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div>
        <ProductForm action={createProductAction} submitLabel="Create product" />
      </div>
    </div>
  );
}

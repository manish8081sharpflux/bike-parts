import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateProductAction } from "@/lib/actions/admin-products";
import { specificationsSchema, vehiclesSchema } from "@/lib/products/product-details";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const product = await prisma.bikePartListing.findUnique({ where: { id } });
  if (!product) {
    notFound();
  }

  const boundUpdate = updateProductAction.bind(null, product.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/products" className="text-xs font-bold text-zinc-500">
          ← Back to products
        </Link>
        <h1 className="mt-1 text-2xl font-black">Edit product</h1>
      </div>

      {error ? (
        <p className="max-w-xl rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <ProductForm
          action={boundUpdate}
          submitLabel="Save changes"
          defaultValues={{
            name: product.name,
            brand: product.brand,
            category: product.category,
            description: product.description,
            price: product.price.toString(),
            gstRate: product.gstRate?.toString() ?? "18",
            stock: product.stock,
            imageUrl: product.imageUrl,
            images: product.images,
            sku: product.sku,
            oemPartNumber: product.oemPartNumber,
            productType: product.productType,
            specifications: specificationsSchema.parse(product.specifications ?? []),
            compatibleVehicles: vehiclesSchema.parse(product.compatibleVehicles ?? []),
            features: product.features,
            packageContents: product.packageContents,
            searchTags: product.searchTags,
            material: product.material,
            finish: product.finish,
            packIncludes: product.packIncludes,
            weightKg: product.weightKg?.toString() ?? null,
            warrantyMonths: product.warrantyMonths,
            countryOfOrigin: product.countryOfOrigin,
            offerLabel: product.offerLabel,
            compatibleModels: product.compatibleModels,
            status: product.status,
          }}
        />
      </div>
    </div>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createProduct, deleteProduct, updateProduct } from "@/lib/actions/admin-products-core";

export async function createProductAction(formData: FormData) {
  await requireAdminAction();

  try {
    await createProduct(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create product.";
    redirect(`/admin/products/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products?created=1");
}

export async function updateProductAction(id: string, formData: FormData) {
  await requireAdminAction();

  try {
    await updateProduct(id, formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update product.";
    redirect(`/admin/products/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products?updated=1");
}

export async function deleteProductAction(id: string) {
  await requireAdminAction();
  try { await deleteProduct(id); }
  catch { redirect("/admin/products?error=" + encodeURIComponent("Could not remove the product. Please try again.")); }
  revalidatePath("/admin/products");
}

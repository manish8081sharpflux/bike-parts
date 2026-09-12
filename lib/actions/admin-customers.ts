"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";

function readOptionalText(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createCustomerAction(formData: FormData) {
  await requireAdminAction();

  const name = String(formData.get("name") ?? "").trim();
  // Previously accepted as-is with no format check at all — an admin could
  // save "abc" as a phone number. Normalized to digits-only (matching how
  // the storefront's own phone field behaves) and validated to 10 digits,
  // same rule checkout enforces, so an admin-added customer's phone is
  // always in the same shape a real checkout would produce.
  const phoneRaw = readOptionalText(formData, "phone");
  const phone = phoneRaw ? phoneRaw.replace(/\D/g, "") : null;
  const email = readOptionalText(formData, "email");

  try {
    if (!name) {
      throw new Error("Name is required.");
    }
    if (!phone && !email) {
      throw new Error("Provide at least a phone number or an email address.");
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      throw new Error("Phone number must be exactly 10 digits.");
    }
    if (email && !EMAIL_PATTERN.test(email)) {
      throw new Error("That doesn't look like a valid email address.");
    }

    if (phone) {
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        throw new Error("A customer with this phone number already exists.");
      }
    }
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new Error("A customer with this email already exists.");
      }
    }

    await prisma.user.create({
      data: { name, phone, email, addedByAdmin: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add customer.";
    redirect(`/admin/customers/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

export async function deleteCustomerAction(id: string) {
  await requireAdminAction();

  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    redirect(
      `/admin/customers?error=${encodeURIComponent(
        "Can't delete a customer who has orders on file — that order history needs to stay intact."
      )}`
    );
  }

  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

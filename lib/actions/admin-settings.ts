"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";

const SETTINGS_ID = "singleton";

function readOptionalText(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

/** Reads the singleton settings row, creating it with defaults on first use. */
export async function getStoreSettings() {
  return prisma.storeSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

export async function updateStoreSettingsAction(formData: FormData) {
  await requireAdminAction();

  const storeName = String(formData.get("storeName") ?? "").trim();
  const supportEmail = readOptionalText(formData, "supportEmail");
  const supportPhone = readOptionalText(formData, "supportPhone");
  const addressLine = readOptionalText(formData, "addressLine");
  const gstNumber = readOptionalText(formData, "gstNumber");

  try {
    if (!storeName) {
      throw new Error("Store name is required.");
    }

    await prisma.storeSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { storeName, supportEmail, supportPhone, addressLine, gstNumber },
      create: {
        id: SETTINGS_ID,
        storeName,
        supportEmail,
        supportPhone,
        addressLine,
        gstNumber,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save settings.";
    redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

import { prisma } from "@/lib/db";
import { validateAddressInput } from "@/lib/address-validation";
import { Prisma, type Address } from "@prisma/client";

export type AddressDto = Omit<Address, "userId">;

export function toAddressDto(address: Address): AddressDto {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId, ...rest } = address;
  return rest;
}

export async function listAddressesForUser(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createAddressForUser(userId: string, raw: unknown) {
  const validated = validateAddressInput(raw);
  if (!validated.ok) return { ok: false as const, error: validated.error };

  // The partial unique index arbitrates simultaneous first-address creates.
  const existingCount = await prisma.address.count({ where: { userId } });

  try {
    const address = await prisma.address.create({
      data: { ...validated.data, userId, isDefault: existingCount === 0 },
    });
    return { ok: true as const, address };
  } catch (error) {
    const target = error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002" && error.meta?.modelName === "Address"
      ? error.meta.target : undefined;
    // PostgreSQL reports the indexed field; also accept the exact index name.
    const defaultConflict = target === "Address_userId_isDefault_unique"
      || (Array.isArray(target) && target.length === 1 && target[0] === "userId");
    if (existingCount !== 0 || !defaultConflict) throw error;

    // The winning insert has committed. Retry only this insert as non-default;
    // unrelated unique constraints and database failures must still propagate.
    const address = await prisma.address.create({
      data: { ...validated.data, userId, isDefault: false },
    });
    return { ok: true as const, address };
  }
}

class AddressNotFoundError extends Error {}

/**
 * Full-record update, ownership-enforced via `updateMany`'s where clause
 * rather than a separate findUnique-then-update — a row that doesn't belong
 * to `userId` simply matches zero rows instead of ever being read or
 * touched. When the update also sets isDefault=true, clearing every other
 * address's default flag and setting this one happen inside the same
 * transaction as the ownership-checked write, so a failed ownership check
 * (id belongs to someone else, or doesn't exist) rolls back the clear too —
 * this customer's own addresses are never left without any default because
 * of someone else's bad request.
 */
export async function updateAddressForUser(id: string, userId: string, raw: unknown) {
  const validated = validateAddressInput(raw);
  if (!validated.ok) return { ok: false as const, error: validated.error };

  const bodyObj = (raw ?? {}) as Record<string, unknown>;
  const makeDefault = bodyObj.isDefault === true;

  try {
    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      const result = await tx.address.updateMany({
        where: { id, userId },
        data: { ...validated.data, ...(makeDefault ? { isDefault: true } : {}) },
      });
      if (result.count !== 1) throw new AddressNotFoundError();
      return tx.address.findUniqueOrThrow({ where: { id } });
    });
    return { ok: true as const, address };
  } catch (error) {
    if (error instanceof AddressNotFoundError) return { ok: false as const, notFound: true as const };
    throw error;
  }
}

/**
 * Sets one address as default without touching the other fields — used when
 * the UI offers a standalone "Set as default" action. Same clear-then-set,
 * ownership-scoped, all-or-nothing transaction as updateAddressForUser.
 */
export async function setDefaultAddressForUser(id: string, userId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      const result = await tx.address.updateMany({ where: { id, userId }, data: { isDefault: true } });
      if (result.count !== 1) throw new AddressNotFoundError();
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof AddressNotFoundError) return { ok: false as const, notFound: true as const };
    throw error;
  }
}

/**
 * Deletes only when the row is owned by `userId`. If it was the default
 * address, promotes the customer's most-recently-updated remaining address
 * to default (rather than leaving them with none) — both steps run in one
 * transaction so a crash between them can't strand the account without a
 * default.
 */
export async function deleteAddressForUser(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) return { ok: false as const, notFound: true as const };

    await tx.address.delete({ where: { id } });

    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
    return { ok: true as const };
  });
}

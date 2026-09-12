import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchema: string | undefined;
};

// Hot reload must not reuse a client generated before a schema change.
const prismaSchema = JSON.stringify(Prisma.dmmf.datamodel);
if (globalForPrisma.prisma && globalForPrisma.prismaSchema !== prismaSchema) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchema = prismaSchema;
}

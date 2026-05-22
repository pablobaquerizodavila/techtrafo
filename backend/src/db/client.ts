import { PrismaClient } from "@prisma/client";

// Cliente Prisma singleton. Se conecta lazy en la primera query.
// El log se mantiene en 'warn'+'error' para no inundar la consola en dev.
export const prisma = new PrismaClient({
  log: ["warn", "error"],
});

export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

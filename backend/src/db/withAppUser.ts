import { Prisma } from "@prisma/client";
import { prisma } from "./client";

/**
 * Envuelve un bloque de writes en una transaccion y setea la variable
 * de sesion 'app.usuario_id' usando set_config (parametrizado, seguro
 * contra SQL injection).
 *
 * El trigger genérico core.fn_auditar() lee esa variable para registrar
 * quien hizo cada cambio en core.auditoria. Sin esto, el campo
 * usuario_id queda en NULL.
 *
 * Uso:
 *   await withAppUser(req.user.id, async (tx) => {
 *     return tx.clientes.create({ data: { ... } });
 *   });
 */
export async function withAppUser<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.usuario_id', ${userId}, true)`;
    return fn(tx);
  });
}

/**
 * Permite serializar BigInt a Number en respuestas JSON.
 * Prisma devuelve BigInt para columnas BIGSERIAL; JSON.stringify falla
 * sin este patch.
 *
 * Importar UNA VEZ desde el entrypoint (server.ts) para activar el shim.
 *
 * Conversion a Number: segura mientras los IDs queden bajo 2^53. PostgreSQL
 * BIGSERIAL llega hasta 2^63 pero en la practica ningun negocio alcanza
 * 9 cuatrillones de filas en una tabla.
 */
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (
  this: bigint,
): number {
  return Number(this);
};

export {};

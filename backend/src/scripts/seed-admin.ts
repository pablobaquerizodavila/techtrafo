/**
 * Seed one-shot: crea un usuario administrador inicial.
 *
 * Uso (dentro del container):
 *   docker exec -it techtrafo-api npm run seed:admin -- \
 *     --email=admin@techtrafo.com --password=ALGO_SEGURO --nombres=Pablo --apellidos=Baquerizo
 *
 * Idempotente: si ya existe un usuario con ese email, solo actualiza el password
 * (util para resetear acceso). Asigna rol "administrador" o el primero disponible.
 */

import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";

interface Args {
  email?: string;
  password?: string;
  nombres?: string;
  apellidos?: string;
  rol?: string;
}

function parseArgs(): Args {
  const args: Args = {};
  for (const raw of process.argv.slice(2)) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) {
      const key = m[1] as keyof Args;
      args[key] = m[2];
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.email || !args.password) {
    console.error("Faltan flags. Uso: --email=X --password=Y [--nombres=Z --apellidos=W --rol=administrador]");
    process.exit(1);
  }

  const rolNombre = args.rol ?? "administrador";
  const rol = await prisma.roles.findFirst({ where: { nombre: rolNombre } })
    ?? await prisma.roles.findFirst({ orderBy: { id: "asc" } });

  if (!rol) {
    console.error("No existen roles en core.roles. Aplica el seed inicial de roles primero.");
    process.exit(1);
  }

  const password_hash = await hashPassword(args.password);

  const existing = await prisma.usuarios.findUnique({ where: { email: args.email } });
  if (existing) {
    const updated = await prisma.usuarios.update({
      where: { email: args.email },
      data: { password_hash, activo: true, rol_id: rol.id },
    });
    console.log(`[seed-admin] Usuario existente actualizado: ${updated.email} (rol=${rol.nombre})`);
  } else {
    const created = await prisma.usuarios.create({
      data: {
        email: args.email,
        password_hash,
        nombres: args.nombres ?? "Admin",
        apellidos: args.apellidos ?? "TECHTRAFO",
        rol_id: rol.id,
        activo: true,
      },
    });
    console.log(`[seed-admin] Usuario creado: ${created.email} (rol=${rol.nombre})`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed-admin] Error:", err);
  await prisma.$disconnect();
  process.exit(1);
});

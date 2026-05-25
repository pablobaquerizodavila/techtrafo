import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

// -------------------------------------------------------------------
// Schemas zod
// -------------------------------------------------------------------
const tipoServicioEnum = z.enum(["reparacion", "fabricacion", "mantenimiento", "otro"]);
const estadoCotEnum = z.enum([
  "borrador",
  "enviada",
  "aprobada",
  "rechazada",
  "vencida",
  "cancelada",
  "convertida",
]);

const lineaSchema = z.object({
  id: z.number().int().positive().optional(),
  orden: z.number().int().positive().default(1),
  item_id: z.number().int().positive().optional().nullable(),
  descripcion: z.string().min(1).max(2000),
  cantidad: z.number().positive(),
  unidad_medida: z.string().max(20).default("unid"),
  precio_unitario: z.number().nonnegative(),
  descuento_linea_porcentaje: z.number().min(0).max(100).default(0),
  costo_unitario: z.number().nonnegative().optional().nullable(),
  notas: z.string().optional().nullable(),
});

const cabeceraCreateSchema = z.object({
  cliente_id: z.number().int().positive(),
  contacto_id: z.number().int().positive().optional().nullable(),
  tipo_servicio: tipoServicioEnum,
  fecha_emision: z.string().optional(), // ISO date; default CURRENT_DATE en DB
  fecha_validez: z.string().optional().nullable(),
  moneda: z.string().length(3).default("USD"),
  descuento_global: z.number().nonnegative().default(0),
  iva_porcentaje: z.number().nonnegative().default(15),
  margen_porcentaje: z.number().optional().nullable(),
  condiciones_pago: z.string().optional().nullable(),
  tiempo_entrega: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
  vendedor_id: z.string().uuid().optional().nullable(),
});

const createSchema = cabeceraCreateSchema.extend({
  lineas: z.array(lineaSchema).min(1, "Al menos una linea es requerida"),
  // Opcional: si se pasa, despues de crear la cotizacion se vincula al
  // expediente (expedientes.cotizacion_id = nueva.id). Esto permite emitir
  // la cotizacion desde el flujo del expediente y que el hito "Cotizacion
  // emitida" auto-avance via el trigger de sincronizacion.
  expediente_id: z.number().int().positive().optional().nullable(),
});

const updateSchema = cabeceraCreateSchema.partial().extend({
  lineas: z.array(lineaSchema).optional(),
  estado: estadoCotEnum.optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  q: z.string().trim().optional(),
  estado: estadoCotEnum.optional(),
  tipo_servicio: tipoServicioEnum.optional(),
  cliente_id: z.coerce.number().int().positive().optional(),
});

const transicionSchema = z.object({
  accion: z.enum(["enviar", "aprobar", "rechazar", "cancelar", "vencer", "convertir"]),
  motivo: z.string().optional(),
});

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
type LineaInput = z.infer<typeof lineaSchema>;

interface Totales {
  subtotal: number;
  iva_valor: number;
  total: number;
}

function calcularTotales(
  lineas: LineaInput[],
  iva_porcentaje: number,
  descuento_global: number,
): Totales {
  const subtotalLineas = lineas.reduce((acc, l) => {
    const bruto = l.cantidad * l.precio_unitario;
    const neto = bruto * (1 - l.descuento_linea_porcentaje / 100);
    return acc + neto;
  }, 0);
  const subtotal = Math.max(0, subtotalLineas - descuento_global);
  const iva_valor = subtotal * (iva_porcentaje / 100);
  const total = subtotal + iva_valor;
  return {
    subtotal: round2(subtotal),
    iva_valor: round2(iva_valor),
    total: round2(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcularSubtotalLinea(l: LineaInput): number {
  return round2(l.cantidad * l.precio_unitario * (1 - l.descuento_linea_porcentaje / 100));
}

/**
 * Genera un codigo COT-YYYY-NNNN buscando el ultimo numero usado este ano.
 * Usa SPLIT_PART(codigo, '-', 3) para extraer el numero del formato COT-YYYY-NNNN.
 * Si dos creates concurrentes generan el mismo codigo, el UNIQUE constraint
 * en cotizaciones.codigo hara fallar el segundo - el usuario reintenta.
 */
async function generarCodigoCotizacion(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const prefix = `COT-${year}-`;
  const result = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) AS max_num
    FROM comercial.cotizaciones
    WHERE codigo LIKE ${prefix + "%"}
  `;
  const nextNum = (result[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

/**
 * Snapshot de una cotizacion ya enviada (cabecera + lineas) a la tabla
 * cotizacion_revisiones. Se llama ANTES de aplicar el PATCH.
 */
async function snapshotearRevision(
  tx: Prisma.TransactionClient,
  cotizacionId: number,
  motivo: string | undefined,
  userId: string,
): Promise<void> {
  const cotizacion = await tx.cotizaciones.findUnique({
    where: { id: cotizacionId },
    include: { cotizacion_lineas: { orderBy: { orden: "asc" } } },
  });
  if (!cotizacion) return;
  await tx.cotizacion_revisiones.create({
    data: {
      cotizacion_id: cotizacionId,
      revision: cotizacion.revision_actual,
      snapshot: {
        cabecera: JSON.parse(JSON.stringify(cotizacion)),
        lineas: JSON.parse(JSON.stringify(cotizacion.cotizacion_lineas)),
      } as Prisma.InputJsonValue,
      motivo: motivo ?? "Modificacion despues de enviada",
      creado_por: userId,
    },
  });
}

// -------------------------------------------------------------------
// GET /api/cotizaciones  -  lista paginada
// -------------------------------------------------------------------
router.get("/", requirePermission("cotizaciones", "read"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, estado, tipo_servicio, cliente_id } = parsed.data;

  const where: Prisma.cotizacionesWhereInput = {};
  if (estado) where.estado = estado;
  if (tipo_servicio) where.tipo_servicio = tipo_servicio;
  if (cliente_id) where.cliente_id = cliente_id;
  if (q) {
    where.OR = [
      { codigo: { contains: q, mode: "insensitive" } },
      { clientes: { razon_social: { contains: q, mode: "insensitive" } } },
      { clientes: { ruc_cedula: { contains: q } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.cotizaciones.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
      },
    }),
    prisma.cotizaciones.count({ where }),
  ]);

  res.json({
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});

// -------------------------------------------------------------------
// GET /api/cotizaciones/:id  -  detalle con lineas y revisiones
// -------------------------------------------------------------------
router.get("/:id", requirePermission("cotizaciones", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const cot = await prisma.cotizaciones.findUnique({
    where: { id },
    include: {
      clientes: { select: { id: true, razon_social: true, ruc_cedula: true, segmento: true, sector: true } },
      cliente_contactos: { select: { id: true, nombres: true, apellidos: true, email: true } },
      cotizacion_lineas: { orderBy: { orden: "asc" } },
      cotizacion_revisiones: {
        orderBy: { revision: "desc" },
        select: { id: true, revision: true, motivo: true, creado_por: true, created_at: true },
      },
    },
  });
  if (!cot) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: cot });
});

// -------------------------------------------------------------------
// POST /api/cotizaciones  -  crear (cabecera + lineas en transaccion)
// -------------------------------------------------------------------
router.post("/", requirePermission("cotizaciones", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const data = parsed.data;

  try {
    const cotizacion = await withAppUser(userId, async (tx) => {
      // Validar cliente existe y no esta archivado
      const cliente = await tx.clientes.findUnique({ where: { id: data.cliente_id } });
      if (!cliente || cliente.estado === "archivado") {
        throw new Error("cliente_no_disponible");
      }

      // Calcular totales
      const totales = calcularTotales(data.lineas, data.iva_porcentaje, data.descuento_global);

      // Generar codigo
      const year = data.fecha_emision
        ? new Date(data.fecha_emision).getFullYear()
        : new Date().getFullYear();
      const codigo = await generarCodigoCotizacion(tx, year);

      // Crear cabecera + lineas
      // Si se vincula a un expediente, validar que existe y este activo, y que
      // su cliente coincide con el de la cotizacion (evita vincular cotizaciones
      // de un cliente a expedientes de otro).
      if (data.expediente_id) {
        const exp = await tx.expedientes.findUnique({ where: { id: data.expediente_id } });
        if (!exp) throw new Error("expediente_no_encontrado");
        if (exp.estado !== "activo") throw new Error("expediente_no_activo");
        if (Number(exp.cliente_id) !== data.cliente_id) throw new Error("cliente_no_coincide");
      }

      const cot = await tx.cotizaciones.create({
        data: {
          codigo,
          cliente_id: data.cliente_id,
          contacto_id: data.contacto_id ?? null,
          tipo_servicio: data.tipo_servicio,
          fecha_emision: data.fecha_emision ? new Date(data.fecha_emision) : new Date(),
          fecha_validez: data.fecha_validez ? new Date(data.fecha_validez) : null,
          moneda: data.moneda,
          subtotal: totales.subtotal,
          descuento_global: data.descuento_global,
          iva_porcentaje: data.iva_porcentaje,
          iva_valor: totales.iva_valor,
          total: totales.total,
          margen_porcentaje: data.margen_porcentaje ?? null,
          condiciones_pago: data.condiciones_pago ?? null,
          tiempo_entrega: data.tiempo_entrega ?? null,
          observaciones: data.observaciones ?? null,
          notas_internas: data.notas_internas ?? null,
          vendedor_id: data.vendedor_id ?? userId,
          creado_por: userId,
          actualizado_por: userId,
          cotizacion_lineas: {
            create: data.lineas.map((l, i) => ({
              orden: l.orden ?? i + 1,
              item_id: l.item_id ?? null,
              descripcion: l.descripcion,
              cantidad: l.cantidad,
              unidad_medida: l.unidad_medida,
              precio_unitario: l.precio_unitario,
              descuento_linea_porcentaje: l.descuento_linea_porcentaje,
              costo_unitario: l.costo_unitario ?? null,
              subtotal_linea: calcularSubtotalLinea(l),
              notas: l.notas ?? null,
            })),
          },
        },
        include: {
          cotizacion_lineas: { orderBy: { orden: "asc" } },
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        },
      });

      // Vincular al expediente (raw porque cotizacion_id es BigInt y prisma no
      // siempre infiere bien el tipo en update).
      if (data.expediente_id) {
        await tx.$executeRaw`
          UPDATE comercial.expedientes
             SET cotizacion_id = ${cot.id},
                 actualizado_por = ${userId}::uuid,
                 updated_at = NOW()
           WHERE id = ${data.expediente_id}
        `;
      }
      return cot;
    });

    res.status(201).json({ data: cotizacion });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        cliente_no_disponible: 400,
        expediente_no_encontrado: 404,
        expediente_no_activo: 409,
        cliente_no_coincide: 409,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// PATCH /api/cotizaciones/:id  -  editar (snapshot automatico si ya enviada)
// -------------------------------------------------------------------
router.patch("/:id", requirePermission("cotizaciones", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const patch = parsed.data;

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const existing = await tx.cotizaciones.findUnique({
        where: { id },
        include: { cotizacion_lineas: true },
      });
      if (!existing) throw new Error("not_found");

      // No se puede modificar una convertida (ya generó contrato)
      if (existing.estado === "convertida") {
        throw new Error("estado_inmodificable");
      }

      // Si la cotizacion no esta en borrador, snapshotear la version actual
      // antes de aplicar cambios
      if (existing.estado !== "borrador") {
        await snapshotearRevision(tx, id, "Modificacion despues de enviada", userId);
      }

      // Recalcular totales si vienen lineas o cambian iva/descuento
      const lineasFinales = patch.lineas ?? existing.cotizacion_lineas.map((l) => ({
        orden: l.orden,
        item_id: l.item_id ? Number(l.item_id) : null,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        unidad_medida: l.unidad_medida,
        precio_unitario: Number(l.precio_unitario),
        descuento_linea_porcentaje: Number(l.descuento_linea_porcentaje),
        costo_unitario: l.costo_unitario != null ? Number(l.costo_unitario) : null,
        notas: l.notas,
      }));

      const iva = patch.iva_porcentaje ?? Number(existing.iva_porcentaje);
      const descGlobal = patch.descuento_global ?? Number(existing.descuento_global);
      const totales = calcularTotales(lineasFinales as LineaInput[], iva, descGlobal);

      // Si vienen lineas, reemplazar todas (delete + create dentro de la transaccion)
      if (patch.lineas) {
        await tx.cotizacion_lineas.deleteMany({ where: { cotizacion_id: id } });
        await tx.cotizacion_lineas.createMany({
          data: patch.lineas.map((l, i) => ({
            cotizacion_id: id,
            orden: l.orden ?? i + 1,
            item_id: l.item_id ?? null,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            unidad_medida: l.unidad_medida,
            precio_unitario: l.precio_unitario,
            descuento_linea_porcentaje: l.descuento_linea_porcentaje,
            costo_unitario: l.costo_unitario ?? null,
            subtotal_linea: calcularSubtotalLinea(l),
            notas: l.notas ?? null,
          })),
        });
      }

      // Actualizar cabecera
      const cabeceraData: Prisma.cotizacionesUpdateInput = {
        actualizado_por: userId,
        subtotal: totales.subtotal,
        iva_valor: totales.iva_valor,
        total: totales.total,
      };
      if (patch.cliente_id !== undefined) cabeceraData.clientes = { connect: { id: patch.cliente_id } };
      if (patch.contacto_id !== undefined) {
        cabeceraData.cliente_contactos = patch.contacto_id
          ? { connect: { id: patch.contacto_id } }
          : { disconnect: true };
      }
      if (patch.tipo_servicio !== undefined) cabeceraData.tipo_servicio = patch.tipo_servicio;
      if (patch.fecha_emision !== undefined)
        cabeceraData.fecha_emision = new Date(patch.fecha_emision);
      if (patch.fecha_validez !== undefined)
        cabeceraData.fecha_validez = patch.fecha_validez ? new Date(patch.fecha_validez) : null;
      if (patch.moneda !== undefined) cabeceraData.moneda = patch.moneda;
      if (patch.descuento_global !== undefined)
        cabeceraData.descuento_global = patch.descuento_global;
      if (patch.iva_porcentaje !== undefined) cabeceraData.iva_porcentaje = patch.iva_porcentaje;
      if (patch.margen_porcentaje !== undefined)
        cabeceraData.margen_porcentaje = patch.margen_porcentaje;
      if (patch.condiciones_pago !== undefined) cabeceraData.condiciones_pago = patch.condiciones_pago;
      if (patch.tiempo_entrega !== undefined) cabeceraData.tiempo_entrega = patch.tiempo_entrega;
      if (patch.observaciones !== undefined) cabeceraData.observaciones = patch.observaciones;
      if (patch.notas_internas !== undefined) cabeceraData.notas_internas = patch.notas_internas;
      if (patch.vendedor_id !== undefined) {
        cabeceraData.usuarios_cotizaciones_vendedor_idTousuarios = patch.vendedor_id
          ? { connect: { id: patch.vendedor_id } }
          : { disconnect: true };
      }

      // Si se modificaron lineas/totales en estado != borrador, incrementar revision
      if (existing.estado !== "borrador" && (patch.lineas || patch.iva_porcentaje !== undefined || patch.descuento_global !== undefined)) {
        cabeceraData.revision_actual = existing.revision_actual + 1;
      }

      return tx.cotizaciones.update({
        where: { id },
        data: cabeceraData,
        include: {
          cotizacion_lineas: { orderBy: { orden: "asc" } },
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        },
      });
    });

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "estado_inmodificable") {
        res.status(409).json({ error: "estado_inmodificable" });
        return;
      }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/cotizaciones/:id/transicion  -  cambiar estado
// -------------------------------------------------------------------
router.post("/:id/transicion", requirePermission("cotizaciones", "aprobar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = transicionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const { accion, motivo } = parsed.data;

  // Reglas de transicion: estado actual -> accion -> estado nuevo
  const transicionesValidas: Record<string, Record<string, string>> = {
    borrador: { enviar: "enviada", cancelar: "cancelada" },
    enviada: { aprobar: "aprobada", rechazar: "rechazada", cancelar: "cancelada", vencer: "vencida" },
    aprobada: { convertir: "convertida", cancelar: "cancelada" },
    rechazada: {},
    vencida: { enviar: "enviada" }, // re-enviar tras vencer
    cancelada: {},
    convertida: {},
  };

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const existing = await tx.cotizaciones.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");

      const nuevoEstado = transicionesValidas[existing.estado]?.[accion];
      if (!nuevoEstado) {
        throw new Error(`transicion_invalida:${existing.estado}->${accion}`);
      }

      // Notas para rechazada/cancelada/vencida con motivo
      let notasInternasNueva = existing.notas_internas;
      if (motivo && ["rechazada", "cancelada", "vencida"].includes(nuevoEstado)) {
        const fecha = new Date().toISOString().split("T")[0];
        const entrada = `[${nuevoEstado.toUpperCase()} ${fecha}] ${motivo}`;
        notasInternasNueva = `${entrada}\n${existing.notas_internas ?? ""}`.trim();
      }

      // SQL directo: Prisma update no acepta campos UUID directos como
      // actualizado_por/aprobada_por en cotizacionesUpdateInput (espera
      // relaciones nombradas). $executeRaw es mas simple aqui.
      await tx.$executeRaw`
        UPDATE comercial.cotizaciones
           SET estado = ${nuevoEstado},
               actualizado_por = ${userId}::uuid,
               aprobada_por = CASE WHEN ${nuevoEstado} = 'aprobada' THEN ${userId}::uuid ELSE aprobada_por END,
               fecha_aprobacion = CASE WHEN ${nuevoEstado} = 'aprobada' THEN NOW() ELSE fecha_aprobacion END,
               notas_internas = ${notasInternasNueva}
         WHERE id = ${id}
      `;

      return tx.cotizaciones.findUnique({
        where: { id },
        include: {
          cotizacion_lineas: { orderBy: { orden: "asc" } },
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        },
      });
    });

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message.startsWith("transicion_invalida")) {
        res.status(409).json({ error: "transicion_invalida", details: err.message });
        return;
      }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// DELETE /api/cotizaciones/:id  -  soft delete (cancelar)
// -------------------------------------------------------------------
router.delete("/:id", requirePermission("cotizaciones", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;
  try {
    await withAppUser(userId, async (tx) => {
      const existing = await tx.cotizaciones.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");
      if (existing.estado === "convertida") throw new Error("estado_inmodificable");
      return tx.cotizaciones.update({
        where: { id },
        data: { estado: "cancelada", actualizado_por: userId },
      });
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "estado_inmodificable") {
        res.status(409).json({ error: "estado_inmodificable" });
        return;
      }
    }
    throw err;
  }
});

export default router;

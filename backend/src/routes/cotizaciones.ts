import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";
import { notificarRevisionCotizacion } from "../services/notificaciones";

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
  // Flags de emisión desde plantilla (se preservan al editar)
  pendiente_aprovisionamiento: z.boolean().optional(),
  tiempo_aprovisionamiento_dias: z.number().int().nonnegative().nullable().optional(),
  categoria: z.string().max(30).nullable().optional(),
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
              pendiente_aprovisionamiento: l.pendiente_aprovisionamiento ?? false,
              tiempo_aprovisionamiento_dias: l.tiempo_aprovisionamiento_dias ?? null,
              categoria: l.categoria ?? null,
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
// POST /api/cotizaciones/desde-plantilla
// Materializa una cotizacion a partir de una plantilla:
//   1. Lee componentes de la plantilla
//   2. Para cada componente con item_id, consulta stock disponible
//   3. Si stock < cantidad: marca la linea con pendiente_aprovisionamiento
//   4. Aplica margen + contingencia al costo_unitario para el precio_unitario
//      (si la plantilla provee precio explicito, se usa ese)
//   5. Crea la cotizacion en borrador + opcionalmente la vincula al expediente
// -------------------------------------------------------------------
const desdePlantillaSchema = z.object({
  plantilla_id: z.number().int().positive(),
  cliente_id: z.number().int().positive(),
  contacto_id: z.number().int().positive().nullable().optional(),
  expediente_id: z.number().int().positive().nullable().optional(),
  // Permite override de los valores default de la plantilla
  margen_porcentaje: z.number().nonnegative().max(200).optional(),
  contingencia_porcentaje: z.number().nonnegative().max(100).optional(),
  iva_porcentaje: z.number().nonnegative().max(50).optional(),
});

router.post("/desde-plantilla", requirePermission("cotizaciones", "write"), async (req, res) => {
  const parsed = desdePlantillaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  try {
    const cotizacion = await withAppUser(userId, async (tx) => {
      // 1) Plantilla + componentes
      const plantilla = await tx.cotizacion_plantillas.findUnique({
        where: { id: d.plantilla_id },
        include: { plantilla_componentes: { orderBy: { orden: "asc" } } },
      });
      if (!plantilla || !plantilla.activo) throw new Error("plantilla_no_disponible");
      if (plantilla.plantilla_componentes.length === 0) throw new Error("plantilla_sin_componentes");

      // 2) Validar cliente
      const cliente = await tx.clientes.findUnique({ where: { id: d.cliente_id } });
      if (!cliente || cliente.estado === "archivado") throw new Error("cliente_no_disponible");

      // 3) Validar expediente si viene
      if (d.expediente_id) {
        const exp = await tx.expedientes.findUnique({ where: { id: d.expediente_id } });
        if (!exp) throw new Error("expediente_no_encontrado");
        if (exp.estado !== "activo") throw new Error("expediente_no_activo");
        if (Number(exp.cliente_id) !== d.cliente_id) throw new Error("cliente_no_coincide");
      }

      // 4) Para cada componente, materializar la linea con check de stock
      const margen = d.margen_porcentaje ?? Number(plantilla.margen_porcentaje_default);
      const contingencia = d.contingencia_porcentaje ?? Number(plantilla.contingencia_porcentaje);
      const iva = d.iva_porcentaje ?? Number(plantilla.iva_porcentaje_default);

      type LineaMat = {
        orden: number;
        item_id: number | null;
        descripcion: string;
        cantidad: number;
        unidad_medida: string;
        precio_unitario: number;
        descuento_linea_porcentaje: number;
        costo_unitario: number | null;
        notas: string | null;
        categoria: string;
        pendiente_aprovisionamiento: boolean;
        tiempo_aprovisionamiento_dias: number | null;
        subtotal_linea: number;
      };

      const lineas: LineaMat[] = [];
      let maxTiempoApro = 0;

      for (const c of plantilla.plantilla_componentes) {
        const cantidad = Number(c.cantidad_default);
        let pendiente = false;
        let tiempoApro: number | null = null;

        // Check de stock solo si la linea apunta a un item de bodega
        if (c.item_id) {
          const stockAgg = await tx.stock.aggregate({
            where: { item_id: c.item_id },
            _sum: { cantidad: true },
          });
          const disponible = Number(stockAgg._sum.cantidad ?? 0);
          if (disponible < cantidad) {
            pendiente = true;
            tiempoApro = c.tiempo_aprovisionamiento_default;
            if (tiempoApro > maxTiempoApro) maxTiempoApro = tiempoApro;
          }
        }

        // Calculo de precio_unitario:
        //   - Si la plantilla provee precio_unitario_default > 0, se usa ese.
        //   - Si no, y hay costo_unitario_default, aplicar margen + contingencia.
        let precioU = Number(c.precio_unitario_default);
        if (precioU <= 0 && c.costo_unitario_default) {
          const costo = Number(c.costo_unitario_default);
          precioU = Math.round(costo * (1 + contingencia / 100) * (1 + margen / 100) * 100) / 100;
        }

        const subtotalLinea = Math.round(cantidad * precioU * 100) / 100;

        lineas.push({
          orden: c.orden,
          item_id: c.item_id ? Number(c.item_id) : null,
          descripcion: c.descripcion,
          cantidad,
          unidad_medida: c.unidad_medida,
          precio_unitario: precioU,
          descuento_linea_porcentaje: 0,
          costo_unitario: c.costo_unitario_default ? Number(c.costo_unitario_default) : null,
          notas: c.notas,
          categoria: c.categoria,
          pendiente_aprovisionamiento: pendiente,
          tiempo_aprovisionamiento_dias: tiempoApro,
          subtotal_linea: subtotalLinea,
        });
      }

      // 5) Totales
      const subtotal = lineas.reduce((acc, l) => acc + l.subtotal_linea, 0);
      const ivaValor = Math.round(subtotal * (iva / 100) * 100) / 100;
      const total = Math.round((subtotal + ivaValor) * 100) / 100;

      // 6) Tiempo de entrega = base + max(aprovisionamiento)
      const tiempoEntregaTotal = plantilla.tiempo_entrega_base_dias + maxTiempoApro;
      const tiempoEntregaTexto = maxTiempoApro > 0
        ? `${tiempoEntregaTotal} días (incluye ${maxTiempoApro} días de aprovisionamiento de materia prima)`
        : `${tiempoEntregaTotal} días`;

      // 7) Generar codigo
      const year = new Date().getFullYear();
      const codigo = await generarCodigoCotizacion(tx, year);

      // 8) Crear cotizacion
      const cot = await tx.cotizaciones.create({
        data: {
          codigo,
          cliente_id: d.cliente_id,
          contacto_id: d.contacto_id ?? null,
          tipo_servicio: plantilla.tipo_servicio,
          fecha_emision: new Date(),
          moneda: "USD",
          subtotal,
          descuento_global: 0,
          iva_porcentaje: iva,
          iva_valor: ivaValor,
          total,
          margen_porcentaje: margen,
          condiciones_pago: plantilla.condiciones_pago_default,
          tiempo_entrega: tiempoEntregaTexto,
          observaciones: plantilla.observaciones_default,
          plantilla_id: plantilla.id,
          contingencia_porcentaje: contingencia,
          vendedor_id: userId,
          creado_por: userId,
          actualizado_por: userId,
          cotizacion_lineas: {
            create: lineas.map((l) => ({
              orden: l.orden,
              item_id: l.item_id,
              descripcion: l.descripcion,
              cantidad: l.cantidad,
              unidad_medida: l.unidad_medida,
              precio_unitario: l.precio_unitario,
              descuento_linea_porcentaje: l.descuento_linea_porcentaje,
              costo_unitario: l.costo_unitario,
              subtotal_linea: l.subtotal_linea,
              notas: l.notas,
              categoria: l.categoria,
              pendiente_aprovisionamiento: l.pendiente_aprovisionamiento,
              tiempo_aprovisionamiento_dias: l.tiempo_aprovisionamiento_dias,
            })),
          },
        },
        include: {
          cotizacion_lineas: { orderBy: { orden: "asc" } },
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        },
      });

      // 9) Vincular al expediente si corresponde
      if (d.expediente_id) {
        await tx.$executeRaw`
          UPDATE comercial.expedientes
             SET cotizacion_id = ${cot.id},
                 actualizado_por = ${userId}::uuid,
                 updated_at = NOW()
           WHERE id = ${d.expediente_id}
        `;
      }
      return cot;
    });
    res.status(201).json({
      data: cotizacion,
      meta: {
        lineas_pendientes_aprovisionamiento: cotizacion.cotizacion_lineas.filter((l) => l.pendiente_aprovisionamiento).length,
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        plantilla_no_disponible: 404,
        plantilla_sin_componentes: 409,
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
            pendiente_aprovisionamiento: l.pendiente_aprovisionamiento ?? false,
            tiempo_aprovisionamiento_dias: l.tiempo_aprovisionamiento_dias ?? null,
            categoria: l.categoria ?? null,
          })),
        });
      }

      // Actualizar cabecera.
      // Nota: en el UpdateInput de Prisma `actualizado_por` no es un campo
      // escalar (Prisma expone solo la relacion). Usamos connect a la
      // relacion para setear el FK indirectamente.
      const cabeceraData: Prisma.cotizacionesUpdateInput = {
        usuarios_cotizaciones_actualizado_porTousuarios: { connect: { id: userId } },
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

      // Bloqueo: no se puede 'enviar' al cliente hasta que la revision
      // interna este aprobada (gerencia comercial -> gerencia general ->
      // presidencia segun el escalamiento que haya seguido).
      if (accion === "enviar" && existing.revision_interna_estado !== "aprobada") {
        throw new Error("revision_interna_pendiente");
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
      if (err.message === "revision_interna_pendiente") {
        res.status(409).json({ error: "revision_interna_pendiente" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// REVISION INTERNA DE COTIZACION
//
// Antes de enviar al cliente, una cotizacion en borrador debe pasar por
// revision interna jerarquica:
//   nivel 1: gerencia_comercial
//   nivel 2: gerencia_general (si nivel 1 escala)
//   nivel 3: presidencia (tope)
// Aprobacion final habilita la accion 'enviar' al cliente.
// ===================================================================
const NIVELES_REVISION = [
  { nivel: 1, rol: "gerencia_comercial" },
  { nivel: 2, rol: "gerencia_general" },
  { nivel: 3, rol: "presidencia" },
];

function rolDeNivel(nivel: number): string {
  return NIVELES_REVISION.find((n) => n.nivel === nivel)?.rol ?? "";
}

const ROLES_OVERRIDE_REV = ["presidencia", "gerencia_general", "gerencia_comercial"];

function esRolOverrideRev(rolNombre: string | null, esSuperAdmin: boolean): boolean {
  if (esSuperAdmin) return true;
  return !!rolNombre && ROLES_OVERRIDE_REV.includes(rolNombre);
}

async function logRevisionHistorial(
  tx: Prisma.TransactionClient,
  cotizacionId: number,
  nivel: number,
  accion: "solicitar" | "aprobar" | "rechazar" | "escalar",
  userId: string,
  rolActuante: string | null,
  notas: string | null,
) {
  await tx.$executeRaw`
    INSERT INTO comercial.cotizacion_revision_interna_historial
      (cotizacion_id, nivel, accion, por_usuario_id, rol_actuante, notas)
    VALUES (${cotizacionId}, ${nivel}, ${accion}, ${userId}::uuid, ${rolActuante}, ${notas})
  `;
}

// -------------------------------------------------------------------
// POST /api/cotizaciones/:id/revision-interna/solicitar
// El creador/vendedor solicita revision. Estado pasa a pendiente nivel 1.
// -------------------------------------------------------------------
router.post("/:id/revision-interna/solicitar", requirePermission("cotizaciones", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const userId = req.user!.id;
  try {
    await withAppUser(userId, async (tx) => {
      const cot = await tx.cotizaciones.findUnique({ where: { id } });
      if (!cot) throw new Error("not_found");
      if (cot.estado !== "borrador") throw new Error("cotizacion_no_borrador");
      if (cot.revision_interna_estado === "pendiente") throw new Error("revision_ya_pendiente");
      if (cot.revision_interna_estado === "aprobada") throw new Error("revision_ya_aprobada");

      await tx.$executeRaw`
        UPDATE comercial.cotizaciones
           SET revision_interna_estado = 'pendiente',
               revision_interna_nivel = 1,
               revision_interna_solicitada_por = ${userId}::uuid,
               revision_interna_solicitada_at = NOW(),
               revision_interna_resuelta_por = NULL,
               revision_interna_resuelta_at = NULL,
               revision_interna_motivo_rechazo = NULL,
               actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
      await logRevisionHistorial(tx, id, 1, "solicitar", userId, req.user!.rol_nombre ?? null, null);
    });
    // Notificar al rol del nivel 1 (gerencia_comercial). Best-effort.
    void notificarRevisionCotizacion({
      cotizacion_id: id, evento: "solicitada", nivel: 1, actor_user_id: userId,
    }).catch((e) => console.error("[notif] cot rev solicitada fallo:", e));
    res.json({ status: "solicitada", nivel: 1, rol_destino: rolDeNivel(1) });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        not_found: 404,
        cotizacion_no_borrador: 409,
        revision_ya_pendiente: 409,
        revision_ya_aprobada: 409,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/cotizaciones/:id/revision-interna/aprobar
// El rol del nivel actual aprueba la cotizacion (final).
// -------------------------------------------------------------------
const aprobarRevSchema = z.object({ notas: z.string().max(1000).optional().nullable() });

router.post("/:id/revision-interna/aprobar", requirePermission("cotizaciones", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = aprobarRevSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_payload" }); return; }
  const userId = req.user!.id;
  try {
    await withAppUser(userId, async (tx) => {
      const cot = await tx.cotizaciones.findUnique({ where: { id } });
      if (!cot) throw new Error("not_found");
      if (cot.revision_interna_estado !== "pendiente") throw new Error("revision_no_pendiente");
      const nivelActual = cot.revision_interna_nivel ?? 1;
      const rolEsperado = rolDeNivel(nivelActual);
      // Validar rol del actor: debe ser el rol del nivel actual, o override
      if (!esRolOverrideRev(req.user!.rol_nombre ?? null, req.user!.es_super_admin)
          && req.user!.rol_nombre !== rolEsperado) {
        throw new Error("rol_no_designado");
      }
      await tx.$executeRaw`
        UPDATE comercial.cotizaciones
           SET revision_interna_estado = 'aprobada',
               revision_interna_resuelta_por = ${userId}::uuid,
               revision_interna_resuelta_at = NOW(),
               actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
      await logRevisionHistorial(tx, id, nivelActual, "aprobar", userId, req.user!.rol_nombre ?? null, parsed.data.notas ?? null);
    });
    // Notificar al solicitante original (vendedor) que ya fue aprobada
    const cotPostAprobacion = await prisma.cotizaciones.findUnique({ where: { id }, select: { revision_interna_nivel: true } });
    void notificarRevisionCotizacion({
      cotizacion_id: id, evento: "aprobada", nivel: cotPostAprobacion?.revision_interna_nivel ?? 1, actor_user_id: userId, mensaje: parsed.data.notas ?? null,
    }).catch((e) => console.error("[notif] cot rev aprobada fallo:", e));
    res.json({ status: "aprobada" });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        not_found: 404,
        revision_no_pendiente: 409,
        rol_no_designado: 403,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/cotizaciones/:id/revision-interna/rechazar
// El rol del nivel actual rechaza. Vuelve al vendedor para correcciones.
// -------------------------------------------------------------------
const rechazarRevSchema = z.object({ motivo: z.string().min(1).max(2000) });

router.post("/:id/revision-interna/rechazar", requirePermission("cotizaciones", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = rechazarRevSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors }); return; }
  const userId = req.user!.id;
  const { motivo } = parsed.data;
  try {
    await withAppUser(userId, async (tx) => {
      const cot = await tx.cotizaciones.findUnique({ where: { id } });
      if (!cot) throw new Error("not_found");
      if (cot.revision_interna_estado !== "pendiente") throw new Error("revision_no_pendiente");
      const nivelActual = cot.revision_interna_nivel ?? 1;
      const rolEsperado = rolDeNivel(nivelActual);
      if (!esRolOverrideRev(req.user!.rol_nombre ?? null, req.user!.es_super_admin)
          && req.user!.rol_nombre !== rolEsperado) {
        throw new Error("rol_no_designado");
      }
      await tx.$executeRaw`
        UPDATE comercial.cotizaciones
           SET revision_interna_estado = 'rechazada',
               revision_interna_resuelta_por = ${userId}::uuid,
               revision_interna_resuelta_at = NOW(),
               revision_interna_motivo_rechazo = ${motivo},
               actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
      await logRevisionHistorial(tx, id, nivelActual, "rechazar", userId, req.user!.rol_nombre ?? null, motivo);
    });
    const cotPostRechazo = await prisma.cotizaciones.findUnique({ where: { id }, select: { revision_interna_nivel: true } });
    void notificarRevisionCotizacion({
      cotizacion_id: id, evento: "rechazada", nivel: cotPostRechazo?.revision_interna_nivel ?? 1, actor_user_id: userId, mensaje: motivo,
    }).catch((e) => console.error("[notif] cot rev rechazada fallo:", e));
    res.json({ status: "rechazada" });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        not_found: 404,
        revision_no_pendiente: 409,
        rol_no_designado: 403,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/cotizaciones/:id/revision-interna/escalar
// El rol del nivel actual escala al siguiente nivel. Tope: nivel 3.
// -------------------------------------------------------------------
const escalarRevSchema = z.object({ mensaje: z.string().min(1).max(2000) });

router.post("/:id/revision-interna/escalar", requirePermission("cotizaciones", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = escalarRevSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors }); return; }
  const userId = req.user!.id;
  const { mensaje } = parsed.data;
  try {
    let nivelNuevo = 0;
    await withAppUser(userId, async (tx) => {
      const cot = await tx.cotizaciones.findUnique({ where: { id } });
      if (!cot) throw new Error("not_found");
      if (cot.revision_interna_estado !== "pendiente") throw new Error("revision_no_pendiente");
      const nivelActual = cot.revision_interna_nivel ?? 1;
      if (nivelActual >= 3) throw new Error("nivel_tope_alcanzado");
      const rolEsperado = rolDeNivel(nivelActual);
      if (!esRolOverrideRev(req.user!.rol_nombre ?? null, req.user!.es_super_admin)
          && req.user!.rol_nombre !== rolEsperado) {
        throw new Error("rol_no_designado");
      }
      nivelNuevo = nivelActual + 1;
      await tx.$executeRaw`
        UPDATE comercial.cotizaciones
           SET revision_interna_nivel = ${nivelNuevo},
               actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
      await logRevisionHistorial(tx, id, nivelActual, "escalar", userId, req.user!.rol_nombre ?? null, mensaje);
    });
    // Notificar al rol del nuevo nivel
    void notificarRevisionCotizacion({
      cotizacion_id: id, evento: "escalada", nivel: nivelNuevo, actor_user_id: userId, mensaje,
    }).catch((e) => console.error("[notif] cot rev escalada fallo:", e));
    res.json({ status: "escalada", nivel: nivelNuevo, rol_destino: rolDeNivel(nivelNuevo) });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        not_found: 404,
        revision_no_pendiente: 409,
        nivel_tope_alcanzado: 409,
        rol_no_designado: 403,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// GET /api/cotizaciones/:id/revision-interna/historial
// Eventos del flujo de revision interna para mostrar en la UI
// -------------------------------------------------------------------
router.get("/:id/revision-interna/historial", requirePermission("cotizaciones", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.$queryRaw<Array<{
    id: bigint; nivel: number; accion: string; por_usuario_id: string | null;
    rol_actuante: string | null; notas: string | null; created_at: Date;
    nombres: string | null; apellidos: string | null;
  }>>`
    SELECT h.id, h.nivel, h.accion, h.por_usuario_id, h.rol_actuante, h.notas, h.created_at,
           u.nombres, u.apellidos
      FROM comercial.cotizacion_revision_interna_historial h
      LEFT JOIN core.usuarios u ON u.id = h.por_usuario_id
     WHERE h.cotizacion_id = ${id}
     ORDER BY h.created_at ASC
  `;
  res.json({ data: data.map((r) => ({ ...r, id: Number(r.id) })) });
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
        data: {
          estado: "cancelada",
          usuarios_cotizaciones_actualizado_porTousuarios: { connect: { id: userId } },
        },
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

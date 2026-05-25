/**
 * Ordenes de Compra (OC) con aprobacion escalonada por monto.
 *
 * Estados:
 *   borrador -> en_revision -> aprobada -> enviada -> confirmada
 *           -> recibida_parcial -> recibida_total -> cerrada
 *   (rechazada, cancelada en cualquier punto)
 *
 * Aprobacion por monto:
 *   - rol_aprobador_requerido_id se resuelve contra compras.config_aprobacion
 *   - El usuario que aprueba debe tener ese rol (o un override jerarquico)
 *   - Override jerarquico: presidencia > gerencia_general > gerencia_comercial > jefe_compras > comprador
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

// Jerarquia: indice mayor = mas autoridad
const JERARQUIA_APROBACION = [
  "comprador",
  "jefe_compras",
  "gerencia_comercial",
  "gerencia_general",
  "presidencia",
];

function nivelJerarquia(rolNombre: string | null): number {
  if (!rolNombre) return -1;
  return JERARQUIA_APROBACION.indexOf(rolNombre);
}

function puedeAprobarMonto(
  user: { rol_nombre: string | null; es_super_admin: boolean },
  rolRequeridoNombre: string | null
): boolean {
  if (user.es_super_admin) return true;
  if (!rolRequeridoNombre) return true; // sin requisito explicito (sub-umbral)
  const nivelUser = nivelJerarquia(user.rol_nombre);
  const nivelReq = nivelJerarquia(rolRequeridoNombre);
  return nivelUser >= 0 && nivelReq >= 0 && nivelUser >= nivelReq;
}

// -------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------
const lineaSchema = z.object({
  orden: z.number().int().nonnegative().default(1),
  item_id: z.number().int().positive().nullable().optional(),
  descripcion: z.string().min(1).max(500),
  codigo_proveedor_item: z.string().max(100).nullable().optional(),
  unidad_medida: z.string().max(20).default("unid"),
  cantidad_solicitada: z.number().positive(),
  precio_unitario: z.number().nonnegative(),
  descuento_porcentaje: z.number().min(0).max(100).default(0),
  ubicacion_destino_id: z.number().int().positive().nullable().optional(),
  proyecto_referencia: z.string().max(100).nullable().optional(),
  notas: z.string().nullable().optional(),
});

const createSchema = z.object({
  proveedor_id: z.number().int().positive(),
  solicitud_id: z.number().int().positive().nullable().optional(),
  expediente_id: z.number().int().positive().nullable().optional(),
  fecha_entrega_acordada: z.string().nullable().optional(),
  condiciones_pago: z.string().max(120).nullable().optional(),
  moneda: z.string().length(3).default("USD"),
  tipo_cambio: z.number().positive().nullable().optional(),
  incoterm: z.string().max(10).nullable().optional(),
  lugar_entrega: z.string().nullable().optional(),
  iva_porcentaje: z.number().min(0).max(50).default(15),
  descuento_porcentaje: z.number().min(0).max(100).default(0),
  retencion_valor: z.number().min(0).default(0),
  observaciones_internas: z.string().nullable().optional(),
  observaciones_proveedor: z.string().nullable().optional(),
  archivo_proveedor_url: z.string().nullable().optional(),
  lineas: z.array(lineaSchema).min(1),
});

const updateSchema = createSchema.partial().omit({ proveedor_id: true, lineas: true })
  .extend({
    lineas: z.array(lineaSchema).optional(),
  });

function calcTotalesOC(
  lineas: { cantidad_solicitada: number; precio_unitario: number; descuento_porcentaje: number }[],
  descPorc: number,
  ivaPorc: number,
  retencionValor: number
) {
  const subtotal = lineas.reduce((acc, l) => {
    const sub = l.cantidad_solicitada * l.precio_unitario;
    const descLinea = sub * (l.descuento_porcentaje / 100);
    return acc + (sub - descLinea);
  }, 0);
  const descuento_valor = subtotal * (descPorc / 100);
  const baseImponible = subtotal - descuento_valor;
  const iva_valor = baseImponible * (ivaPorc / 100);
  const total = baseImponible + iva_valor - retencionValor;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    descuento_valor: Number(descuento_valor.toFixed(2)),
    iva_valor: Number(iva_valor.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

async function resolverRolAprobador(tx: Prisma.TransactionClient, total: number) {
  return tx.config_aprobacion.findFirst({
    where: {
      activo: true,
      monto_minimo: { lte: total },
      OR: [{ monto_maximo: null }, { monto_maximo: { gt: total } }],
    },
    include: { roles: { select: { id: true, nombre: true } } },
    orderBy: { monto_minimo: "desc" },
  });
}

function lineaTotal(l: { cantidad_solicitada: number; precio_unitario: number; descuento_porcentaje: number }): number {
  const sub = l.cantidad_solicitada * l.precio_unitario;
  return sub - sub * (l.descuento_porcentaje / 100);
}

// -------------------------------------------------------------------
// GET /api/ordenes-compra
// -------------------------------------------------------------------
router.get("/", requirePermission("compras", "read"), async (req, res) => {
  const estado = req.query.estado as string | undefined;
  const proveedorId = req.query.proveedor_id ? Number(req.query.proveedor_id) : undefined;
  const expedienteId = req.query.expediente_id ? Number(req.query.expediente_id) : undefined;

  const where: Prisma.ordenes_compraWhereInput = {};
  if (estado) where.estado = estado;
  if (proveedorId) where.proveedor_id = BigInt(proveedorId);
  if (expedienteId) where.expediente_id = BigInt(expedienteId);

  const data = await prisma.ordenes_compra.findMany({
    where,
    orderBy: [{ fecha_emision: "desc" }, { id: "desc" }],
    select: {
      id: true, codigo: true, proveedor_id: true, solicitud_id: true, expediente_id: true,
      fecha_emision: true, fecha_entrega_acordada: true, fecha_entrega_real: true,
      moneda: true, total: true, estado: true, rol_aprobador_requerido_id: true,
      aprobador_id: true, fecha_aprobacion: true, created_at: true,
      proveedores: { select: { id: true, codigo: true, razon_social: true } },
      roles: { select: { id: true, nombre: true } },
      _count: { select: { orden_compra_lineas: true, recepciones: true } },
    },
    take: 200,
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/ordenes-compra/:id
// -------------------------------------------------------------------
router.get("/:id", requirePermission("compras", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.ordenes_compra.findUnique({
    where: { id: BigInt(id) },
    include: {
      proveedores: true,
      roles: { select: { id: true, nombre: true, descripcion: true } },
      orden_compra_lineas: {
        orderBy: { orden: "asc" },
        include: { items: { select: { id: true, codigo_interno: true, nombre: true } } },
      },
      recepciones: {
        orderBy: { fecha_recepcion: "desc" },
        select: { id: true, codigo: true, fecha_recepcion: true, estado: true, estado_general: true },
      },
      solicitudes_ordenes_compra_solicitud_idTosolicitudes: {
        select: { id: true, codigo: true, departamento_solicitante: true, prioridad: true },
      },
      expedientes: { select: { id: true, codigo: true } },
      usuarios_ordenes_compra_creado_porTousuarios: { select: { id: true, nombre_completo: true } },
      usuarios_ordenes_compra_aprobador_idTousuarios: { select: { id: true, nombre_completo: true } },
    },
  });
  if (!data) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/ordenes-compra
// -------------------------------------------------------------------
router.post("/", requirePermission("compras", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;

  const lineasNorm = d.lineas.map((l) => ({
    ...l,
    cantidad_solicitada: Number(l.cantidad_solicitada),
    precio_unitario: Number(l.precio_unitario),
    descuento_porcentaje: Number(l.descuento_porcentaje ?? 0),
  }));
  const tot = calcTotalesOC(lineasNorm, d.descuento_porcentaje, d.iva_porcentaje, d.retencion_valor);

  try {
    const oc = await withAppUser(userId, async (tx) => {
      const proveedor = await tx.proveedores.findUnique({ where: { id: BigInt(d.proveedor_id) } });
      if (!proveedor) throw new Error("proveedor_inexistente");
      if (proveedor.estado !== "activo") throw new Error("proveedor_no_activo");

      const aprob = await resolverRolAprobador(tx, tot.total);

      return tx.ordenes_compra.create({
        data: {
          codigo: "",
          proveedor_id: BigInt(d.proveedor_id),
          solicitud_id: d.solicitud_id ? BigInt(d.solicitud_id) : null,
          expediente_id: d.expediente_id ? BigInt(d.expediente_id) : null,
          fecha_emision: new Date(),
          fecha_entrega_acordada: d.fecha_entrega_acordada ? new Date(d.fecha_entrega_acordada) : null,
          condiciones_pago: d.condiciones_pago ?? proveedor.condiciones_pago_default ?? null,
          moneda: d.moneda,
          tipo_cambio: d.tipo_cambio ?? null,
          incoterm: d.incoterm ?? proveedor.incoterm_default ?? null,
          lugar_entrega: d.lugar_entrega ?? null,
          subtotal: tot.subtotal,
          descuento_porcentaje: d.descuento_porcentaje,
          descuento_valor: tot.descuento_valor,
          iva_porcentaje: d.iva_porcentaje,
          iva_valor: tot.iva_valor,
          retencion_valor: d.retencion_valor,
          total: tot.total,
          estado: "borrador",
          rol_aprobador_requerido_id: aprob?.rol_aprobador_id ?? null,
          observaciones_internas: d.observaciones_internas ?? null,
          observaciones_proveedor: d.observaciones_proveedor ?? null,
          archivo_proveedor_url: d.archivo_proveedor_url ?? null,
          creado_por: userId,
          actualizado_por: userId,
          orden_compra_lineas: {
            create: lineasNorm.map((l, i) => ({
              orden: l.orden ?? i + 1,
              item_id: l.item_id ? BigInt(l.item_id) : null,
              descripcion: l.descripcion,
              codigo_proveedor_item: l.codigo_proveedor_item ?? null,
              unidad_medida: l.unidad_medida,
              cantidad_solicitada: l.cantidad_solicitada,
              precio_unitario: l.precio_unitario,
              descuento_porcentaje: l.descuento_porcentaje,
              subtotal: lineaTotal(l),
              estado_linea: "pendiente",
              ubicacion_destino_id: l.ubicacion_destino_id ? BigInt(l.ubicacion_destino_id) : null,
              proyecto_referencia: l.proyecto_referencia ?? null,
              notas: l.notas ?? null,
            })),
          },
        },
        include: {
          orden_compra_lineas: { orderBy: { orden: "asc" } },
          proveedores: { select: { id: true, codigo: true, razon_social: true } },
          roles: { select: { id: true, nombre: true } },
        },
      });
    });
    res.status(201).json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        proveedor_inexistente: 404, proveedor_no_activo: 409,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// PATCH /api/ordenes-compra/:id  — solo en borrador / rechazada
// -------------------------------------------------------------------
router.patch("/:id", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const exist = await tx.ordenes_compra.findUnique({
        where: { id: BigInt(id) },
        include: { orden_compra_lineas: true },
      });
      if (!exist) throw new Error("not_found");
      if (!["borrador", "rechazada", "en_revision"].includes(exist.estado)) throw new Error("estado_invalido");

      if (d.lineas !== undefined) {
        await tx.orden_compra_lineas.deleteMany({ where: { orden_compra_id: BigInt(id) } });
        const lineasNorm = d.lineas.map((l) => ({
          ...l,
          cantidad_solicitada: Number(l.cantidad_solicitada),
          precio_unitario: Number(l.precio_unitario),
          descuento_porcentaje: Number(l.descuento_porcentaje ?? 0),
        }));
        await tx.orden_compra_lineas.createMany({
          data: lineasNorm.map((l, i) => ({
            orden_compra_id: BigInt(id),
            orden: l.orden ?? i + 1,
            item_id: l.item_id ? BigInt(l.item_id) : null,
            descripcion: l.descripcion,
            codigo_proveedor_item: l.codigo_proveedor_item ?? null,
            unidad_medida: l.unidad_medida,
            cantidad_solicitada: l.cantidad_solicitada,
            precio_unitario: l.precio_unitario,
            descuento_porcentaje: l.descuento_porcentaje,
            subtotal: lineaTotal(l),
            estado_linea: "pendiente",
            ubicacion_destino_id: l.ubicacion_destino_id ? BigInt(l.ubicacion_destino_id) : null,
            proyecto_referencia: l.proyecto_referencia ?? null,
            notas: l.notas ?? null,
          })),
        });
      }

      // Recalcular totales
      const lineasActuales = (await tx.orden_compra_lineas.findMany({
        where: { orden_compra_id: BigInt(id) },
      })).map((l) => ({
        cantidad_solicitada: Number(l.cantidad_solicitada),
        precio_unitario: Number(l.precio_unitario),
        descuento_porcentaje: Number(l.descuento_porcentaje),
      }));

      const descPorc = d.descuento_porcentaje ?? Number(exist.descuento_porcentaje);
      const ivaPorc = d.iva_porcentaje ?? Number(exist.iva_porcentaje);
      const retencion = d.retencion_valor ?? Number(exist.retencion_valor);
      const tot = calcTotalesOC(lineasActuales, descPorc, ivaPorc, retencion);

      const updateData: Prisma.ordenes_compraUpdateInput = {
        usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: userId } },
        subtotal: tot.subtotal,
        descuento_porcentaje: descPorc,
        descuento_valor: tot.descuento_valor,
        iva_porcentaje: ivaPorc,
        iva_valor: tot.iva_valor,
        retencion_valor: retencion,
        total: tot.total,
      };
      if (d.solicitud_id !== undefined) {
        updateData.solicitudes_ordenes_compra_solicitud_idTosolicitudes = d.solicitud_id
          ? { connect: { id: BigInt(d.solicitud_id) } }
          : { disconnect: true };
      }
      if (d.expediente_id !== undefined) {
        updateData.expedientes = d.expediente_id
          ? { connect: { id: BigInt(d.expediente_id) } }
          : { disconnect: true };
      }
      if (d.fecha_entrega_acordada !== undefined) {
        updateData.fecha_entrega_acordada = d.fecha_entrega_acordada ? new Date(d.fecha_entrega_acordada) : null;
      }
      if (d.condiciones_pago !== undefined) updateData.condiciones_pago = d.condiciones_pago;
      if (d.moneda !== undefined) updateData.moneda = d.moneda;
      if (d.tipo_cambio !== undefined) updateData.tipo_cambio = d.tipo_cambio;
      if (d.incoterm !== undefined) updateData.incoterm = d.incoterm;
      if (d.lugar_entrega !== undefined) updateData.lugar_entrega = d.lugar_entrega;
      if (d.observaciones_internas !== undefined) updateData.observaciones_internas = d.observaciones_internas;
      if (d.observaciones_proveedor !== undefined) updateData.observaciones_proveedor = d.observaciones_proveedor;
      if (d.archivo_proveedor_url !== undefined) updateData.archivo_proveedor_url = d.archivo_proveedor_url;

      // Re-resolver aprobador si cambia el total
      const aprob = await resolverRolAprobador(tx, tot.total);
      updateData.roles = aprob?.rol_aprobador_id
        ? { connect: { id: aprob.rol_aprobador_id } }
        : { disconnect: true };

      return tx.ordenes_compra.update({
        where: { id: BigInt(id) },
        data: updateData,
        include: {
          orden_compra_lineas: { orderBy: { orden: "asc" } },
          proveedores: { select: { id: true, codigo: true, razon_social: true } },
          roles: { select: { id: true, nombre: true } },
        },
      });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_no_editable" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/ordenes-compra/:id/solicitar-aprobacion
// -------------------------------------------------------------------
router.post("/:id/solicitar-aprobacion", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const oc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.ordenes_compra.findUnique({
        where: { id: BigInt(id) },
        include: { orden_compra_lineas: true },
      });
      if (!exist) throw new Error("not_found");
      if (!["borrador", "rechazada"].includes(exist.estado)) throw new Error("estado_invalido");
      if (exist.orden_compra_lineas.length === 0) throw new Error("sin_lineas");
      return tx.ordenes_compra.update({
        where: { id: BigInt(id) },
        data: {
          estado: "en_revision",
          motivo_rechazo: null,
          usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
      if (err.message === "sin_lineas") { res.status(409).json({ error: "sin_lineas" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/ordenes-compra/:id/aprobar
// Solo si el rol del usuario coincide o supera al rol requerido por monto
// -------------------------------------------------------------------
router.post("/:id/aprobar", requirePermission("compras", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const oc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.ordenes_compra.findUnique({
        where: { id: BigInt(id) },
        include: { roles: true },
      });
      if (!exist) throw new Error("not_found");
      if (!["en_revision", "borrador"].includes(exist.estado)) throw new Error("estado_invalido");

      const rolReqNombre = exist.roles?.nombre ?? null;
      if (!puedeAprobarMonto(
        { rol_nombre: req.user!.rol_nombre ?? null, es_super_admin: req.user!.es_super_admin },
        rolReqNombre,
      )) {
        throw new Error("rol_insuficiente");
      }

      return tx.ordenes_compra.update({
        where: { id: BigInt(id) },
        data: {
          estado: "aprobada",
          usuarios_ordenes_compra_aprobador_idTousuarios: { connect: { id: req.user!.id } },
          fecha_aprobacion: new Date(),
          motivo_rechazo: null,
          usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
        include: {
          proveedores: { select: { id: true, codigo: true, razon_social: true } },
          roles: { select: { id: true, nombre: true } },
        },
      });
    });
    res.json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
      if (err.message === "rol_insuficiente") {
        res.status(403).json({ error: "rol_insuficiente_para_monto" });
        return;
      }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/ordenes-compra/:id/rechazar
// -------------------------------------------------------------------
router.post("/:id/rechazar", requirePermission("compras", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const motivo = z.string().min(2).max(2000).safeParse(req.body?.motivo);
  if (!motivo.success) { res.status(400).json({ error: "motivo_requerido" }); return; }
  try {
    const oc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.ordenes_compra.findUnique({
        where: { id: BigInt(id) },
        include: { roles: true },
      });
      if (!exist) throw new Error("not_found");
      if (!["en_revision", "borrador"].includes(exist.estado)) throw new Error("estado_invalido");
      if (!puedeAprobarMonto(
        { rol_nombre: req.user!.rol_nombre ?? null, es_super_admin: req.user!.es_super_admin },
        exist.roles?.nombre ?? null,
      )) {
        throw new Error("rol_insuficiente");
      }
      return tx.ordenes_compra.update({
        where: { id: BigInt(id) },
        data: {
          estado: "rechazada",
          motivo_rechazo: motivo.data,
          usuarios_ordenes_compra_aprobador_idTousuarios: { connect: { id: req.user!.id } },
          fecha_aprobacion: new Date(),
          usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
      if (err.message === "rol_insuficiente") { res.status(403).json({ error: "rol_insuficiente_para_monto" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/ordenes-compra/:id/enviar  — pasa de aprobada -> enviada
// -------------------------------------------------------------------
router.post("/:id/enviar", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const oc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.ordenes_compra.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (exist.estado !== "aprobada") throw new Error("estado_invalido");
      return tx.ordenes_compra.update({
        where: { id: BigInt(id) },
        data: {
          estado: "enviada",
          usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/ordenes-compra/:id/confirmar  — proveedor confirma disponibilidad
// Body: { fecha_confirmacion_proveedor, fecha_entrega_acordada? }
// -------------------------------------------------------------------
router.post("/:id/confirmar", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const body = z.object({
    fecha_confirmacion_proveedor: z.string().optional(),
    fecha_entrega_acordada: z.string().optional(),
  }).safeParse(req.body ?? {});
  try {
    const oc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.ordenes_compra.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (exist.estado !== "enviada") throw new Error("estado_invalido");
      const data: Prisma.ordenes_compraUpdateInput = {
        estado: "confirmada",
        fecha_confirmacion_proveedor: body.success && body.data.fecha_confirmacion_proveedor
          ? new Date(body.data.fecha_confirmacion_proveedor) : new Date(),
        usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: req.user!.id } },
      };
      if (body.success && body.data.fecha_entrega_acordada) {
        data.fecha_entrega_acordada = new Date(body.data.fecha_entrega_acordada);
      }
      return tx.ordenes_compra.update({ where: { id: BigInt(id) }, data });
    });
    res.json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/ordenes-compra/:id/cancelar
// -------------------------------------------------------------------
router.post("/:id/cancelar", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const oc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.ordenes_compra.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (["recibida_total", "cerrada", "cancelada"].includes(exist.estado)) throw new Error("estado_invalido");
      return tx.ordenes_compra.update({
        where: { id: BigInt(id) },
        data: {
          estado: "cancelada",
          usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// GET /api/ordenes-compra/config/umbrales
// -------------------------------------------------------------------
router.get("/config/umbrales", requirePermission("compras", "read"), async (_req, res) => {
  const data = await prisma.config_aprobacion.findMany({
    orderBy: { monto_minimo: "asc" },
    include: { roles: { select: { id: true, nombre: true, descripcion: true } } },
  });
  res.json({ data });
});

export default router;

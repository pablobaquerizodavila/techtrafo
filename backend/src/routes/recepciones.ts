/**
 * Recepciones de bodega contra una OC.
 *
 * Flujo:
 *   POST /             -> crea recepcion borrador con sus lineas
 *   POST /:id/confirmar -> dispara los efectos:
 *     a) Por cada linea aprobada con cantidad_recibida > 0:
 *        inserta inventario.movimientos_stock(tipo=entrada, referencia_tipo=compra,
 *        referencia_id=OC.id) -> el trigger de stock actualiza inventario.stock.
 *     b) Acumula cantidad_recibida en orden_compra_lineas; ajusta estado_linea.
 *     c) Si precio_real difiere de items.costo_referencia, actualiza el item y
 *        registra fila en compras.item_proveedor_precios_historial.
 *     d) Ajusta el estado de la OC: recibida_parcial / recibida_total.
 *     e) Suma a proveedores.total_ordenes / _entregas_atiempo segun fecha.
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

// -------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------
const lineaRecepcionSchema = z.object({
  orden_compra_linea_id: z.number().int().positive(),
  cantidad_recibida: z.number().nonnegative(),
  cantidad_rechazada: z.number().nonnegative().default(0),
  precio_real: z.number().nonnegative().nullable().optional(),
  resultado_inspeccion: z.enum(["aprobado", "rechazado", "observado", "pendiente_inspeccion"]).default("aprobado"),
  motivo_rechazo: z.string().nullable().optional(),
  ubicacion_id: z.number().int().positive().nullable().optional(),
  lote_id: z.number().int().positive().nullable().optional(),
  observaciones: z.string().nullable().optional(),
});

const createSchema = z.object({
  orden_compra_id: z.number().int().positive(),
  fecha_recepcion: z.string().optional(),
  guia_remision_numero: z.string().max(100).nullable().optional(),
  factura_numero: z.string().max(100).nullable().optional(),
  factura_fecha: z.string().nullable().optional(),
  factura_url: z.string().nullable().optional(),
  estado_general: z.enum(["bueno", "observado", "danado", "incompleto"]).default("bueno"),
  responsable_calidad_id: z.string().uuid().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  evidencia_url: z.string().nullable().optional(),
  lineas: z.array(lineaRecepcionSchema).min(1),
});

// -------------------------------------------------------------------
// GET /api/recepciones
// -------------------------------------------------------------------

// -------------------------------------------------------------------
// Helper: crea automaticamente una NC cuando hay lineas rechazadas.
// Si ya existe NC activa (abierta/en_proceso) para la recepcion, no hace nada.
// El codigo NC es auto-generado por el trigger tg_nc_codigo en el DB.
// -------------------------------------------------------------------
async function crearOActualizarNC(
  tx: Prisma.TransactionClient,
  recepcionId: bigint,
  lineasRechazadas: Array<{ id: bigint; cantidad_rechazada: number; motivo_rechazo: string | null }>,
  creadoPor: string,
): Promise<bigint | null> {
  if (lineasRechazadas.length === 0) return null;

  const ncExistente = await tx.no_conformidades.findFirst({
    where: { recepcion_id: recepcionId, estado: { in: ["abierta", "en_proceso"] } },
    select: { id: true },
  });
  if (ncExistente) return ncExistente.id;

  const recepcion = await tx.recepciones.findUnique({
    where: { id: recepcionId },
    select: { id: true, orden_compra_id: true, ordenes_compra: { select: { proveedor_id: true } } },
  });
  if (!recepcion) return null;

  const nc = await tx.no_conformidades.create({
    data: {
      recepcion_id: recepcionId,
      orden_compra_id: recepcion.orden_compra_id,
      proveedor_id: recepcion.ordenes_compra?.proveedor_id ?? null,
      // Prisma requiere el campo; el trigger tg_nc_codigo lo sobreescribe en BEFORE INSERT
      codigo: "",
      tipo: "calidad",
      descripcion: `No conformidad detectada en recepcion #${recepcionId}. ${lineasRechazadas.length} linea(s) rechazada(s).`,
      estado: "abierta",
      creado_por: creadoPor,
      nc_lineas: {
        create: lineasRechazadas.map((l) => ({
          recepcion_linea_id: l.id,
          cantidad_no_conforme: new Prisma.Decimal(l.cantidad_rechazada),
          motivo: l.motivo_rechazo,
        })),
      },
    },
    select: { id: true, codigo: true },
  });
  return nc.id;
}
router.get("/", requirePermission("compras", "read"), async (req, res) => {
  const ocId = req.query.orden_compra_id ? Number(req.query.orden_compra_id) : undefined;
  const estado = req.query.estado as string | undefined;

  const where: Prisma.recepcionesWhereInput = {};
  if (ocId) where.orden_compra_id = BigInt(ocId);
  if (estado) where.estado = estado;

  const data = await prisma.recepciones.findMany({
    where,
    orderBy: { fecha_recepcion: "desc" },
    select: {
      id: true, codigo: true, orden_compra_id: true, fecha_recepcion: true,
      guia_remision_numero: true, factura_numero: true, factura_fecha: true,
      estado: true, estado_general: true, created_at: true,
      ordenes_compra: { select: { id: true, codigo: true, proveedor_id: true, total: true } },
      _count: { select: { recepcion_lineas: true } },
    },
    take: 200,
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/recepciones/:id
// -------------------------------------------------------------------
router.get("/:id", requirePermission("compras", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.recepciones.findUnique({
    where: { id: BigInt(id) },
    include: {
      ordenes_compra: {
        include: { proveedores: { select: { id: true, codigo: true, razon_social: true } } },
      },
      recepcion_lineas: {
        include: {
          orden_compra_lineas: {
            include: { items: { select: { id: true, codigo_interno: true, nombre: true } } },
          },
          ubicaciones: { select: { id: true, codigo: true, nombre: true } },
          lotes: { select: { id: true, numero_lote: true } },
        },
      },
      usuarios_recepciones_creado_porTousuarios: { select: { id: true, nombre_completo: true } },
      usuarios_recepciones_responsable_recepcion_idTousuarios: { select: { id: true, nombre_completo: true } },
      usuarios_recepciones_responsable_calidad_idTousuarios: { select: { id: true, nombre_completo: true } },
    },
  });
  if (!data) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/recepciones (borrador)
// -------------------------------------------------------------------
router.post("/", requirePermission("compras", "recibir"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;

  try {
    const recepcion = await withAppUser(userId, async (tx) => {
      const oc = await tx.ordenes_compra.findUnique({
        where: { id: BigInt(d.orden_compra_id) },
        include: { orden_compra_lineas: true },
      });
      if (!oc) throw new Error("oc_inexistente");
      if (!["enviada", "confirmada", "recibida_parcial"].includes(oc.estado)) {
        throw new Error("oc_estado_invalido");
      }

      // Validar que cada linea_id pertenece a la OC y que no excede saldo
      const lineasOCById = new Map(oc.orden_compra_lineas.map((l) => [Number(l.id), l]));
      for (const ln of d.lineas) {
        const ocl = lineasOCById.get(ln.orden_compra_linea_id);
        if (!ocl) throw new Error("linea_oc_no_pertenece");
        const saldo = Number(ocl.cantidad_solicitada) - Number(ocl.cantidad_recibida);
        if (Number(ln.cantidad_recibida) + Number(ln.cantidad_rechazada) > saldo + 0.0001) {
          throw new Error("cantidad_excede_saldo");
        }
      }

      return tx.recepciones.create({
        data: {
          codigo: "",
          orden_compra_id: BigInt(d.orden_compra_id),
          fecha_recepcion: d.fecha_recepcion ? new Date(d.fecha_recepcion) : new Date(),
          guia_remision_numero: d.guia_remision_numero ?? null,
          factura_numero: d.factura_numero ?? null,
          factura_fecha: d.factura_fecha ? new Date(d.factura_fecha) : null,
          factura_url: d.factura_url ?? null,
          estado: "borrador",
          estado_general: d.estado_general,
          responsable_recepcion_id: userId,
          responsable_calidad_id: d.responsable_calidad_id ?? null,
          observaciones: d.observaciones ?? null,
          evidencia_url: d.evidencia_url ?? null,
          creado_por: userId,
          actualizado_por: userId,
          recepcion_lineas: {
            create: d.lineas.map((l) => ({
              orden_compra_linea_id: BigInt(l.orden_compra_linea_id),
              cantidad_recibida: l.cantidad_recibida,
              cantidad_rechazada: l.cantidad_rechazada,
              precio_real: l.precio_real ?? null,
              resultado_inspeccion: l.resultado_inspeccion,
              motivo_rechazo: l.motivo_rechazo ?? null,
              ubicacion_id: l.ubicacion_id ? BigInt(l.ubicacion_id) : null,
              lote_id: l.lote_id ? BigInt(l.lote_id) : null,
              observaciones: l.observaciones ?? null,
            })),
          },
        },
        include: { recepcion_lineas: true },
      });
    });
    res.status(201).json({ data: recepcion });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        oc_inexistente: 404,
        oc_estado_invalido: 409,
        linea_oc_no_pertenece: 400,
        cantidad_excede_saldo: 409,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/recepciones/:id/confirmar
//
// Esta es la operacion que realmente afecta a bodega y a costos:
//  - inserta movimientos_stock por cada linea aprobada -> trigger actualiza stock
//  - acumula cantidad_recibida en orden_compra_lineas
//  - si el precio_real difiere, actualiza items.costo_referencia + historial
//  - ajusta el estado de la OC
//  - actualiza contadores del proveedor
// -------------------------------------------------------------------
router.post("/:id/confirmar", requirePermission("compras", "recibir"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const userId = req.user!.id;

  try {
    const result = await withAppUser(userId, async (tx) => {
      const rec = await tx.recepciones.findUnique({
        where: { id: BigInt(id) },
        include: {
          recepcion_lineas: { include: { orden_compra_lineas: true } },
          ordenes_compra: { include: { proveedores: true, orden_compra_lineas: true } },
        },
      });
      if (!rec) throw new Error("not_found");
      if (rec.estado !== "borrador") throw new Error("estado_invalido");

      const oc = rec.ordenes_compra;
      const proveedorId = oc.proveedor_id;
      const movimientosCreados: Array<{ recepcion_linea_id: bigint; movimiento_id: bigint }> = [];

      // Por cada linea aprobada con cantidad_recibida > 0 -> insertar movimiento
      for (const rl of rec.recepcion_lineas) {
        const cant = Number(rl.cantidad_recibida);
        if (cant <= 0) continue;
        if (rl.resultado_inspeccion === "rechazado") continue;

        const ocl = rl.orden_compra_lineas;
        if (!ocl.item_id) {
          // Linea sin item maestro: no entra a bodega (es servicio/texto libre)
          continue;
        }
        const ubicacionDestino = rl.ubicacion_id ?? ocl.ubicacion_destino_id;
        if (!ubicacionDestino) throw new Error("ubicacion_destino_requerida");

        // Insertar movimiento_stock (trigger fn_aplicar_movimiento_stock incrementa el stock)
        const mov = await tx.movimientos_stock.create({
          data: {
            tipo: "entrada",
            item_id: ocl.item_id,
            ubicacion_destino_id: ubicacionDestino,
            lote_id: rl.lote_id ?? null,
            cantidad: cant,
            costo_unitario: rl.precio_real ?? ocl.precio_unitario,
            referencia_tipo: "compra",
            referencia_id: oc.id,
            motivo: `Recepcion ${rec.codigo} OC ${oc.codigo}`,
            usuario_id: userId,
          },
        });

        movimientosCreados.push({ recepcion_linea_id: rl.id, movimiento_id: mov.id });

        // Actualizar acumulado en orden_compra_lineas
        const nuevaRecibida = Number(ocl.cantidad_recibida) + cant;
        const nuevaRechazada = Number(ocl.cantidad_rechazada) + Number(rl.cantidad_rechazada);
        const totalLinea = Number(ocl.cantidad_solicitada);
        let nuevoEstadoLinea = ocl.estado_linea;
        if (nuevaRecibida >= totalLinea - 0.0001) nuevoEstadoLinea = "recibida";
        else if (nuevaRecibida > 0) nuevoEstadoLinea = "recibida_parcial";

        await tx.orden_compra_lineas.update({
          where: { id: ocl.id },
          data: {
            cantidad_recibida: nuevaRecibida,
            cantidad_rechazada: nuevaRechazada,
            estado_linea: nuevoEstadoLinea,
          },
        });

        // Actualizar costo_referencia del item si difiere y guardar historial
        if (rl.precio_real !== null && rl.precio_real !== undefined) {
          const item = await tx.items.findUnique({ where: { id: ocl.item_id } });
          if (item) {
            const precioNuevo = Number(rl.precio_real);
            const precioAnterior = Number(item.costo_referencia);
            const diff = Math.abs(precioNuevo - precioAnterior);
            if (diff > 0.0001) {
              const variacionPorc = precioAnterior > 0
                ? Number((((precioNuevo - precioAnterior) / precioAnterior) * 100).toFixed(2))
                : null;

              await tx.items.update({
                where: { id: ocl.item_id },
                data: {
                  costo_referencia: precioNuevo,
                  usuarios_items_actualizado_porTousuarios: { connect: { id: userId } },
                },
              });

              await tx.item_proveedor_precios_historial.create({
                data: {
                  item_id: ocl.item_id,
                  proveedor_id: proveedorId,
                  orden_compra_id: oc.id,
                  recepcion_id: rec.id,
                  precio_anterior: precioAnterior,
                  precio_nuevo: precioNuevo,
                  variacion_porcentaje: variacionPorc,
                  moneda: rec.ordenes_compra.moneda,
                  origen: "recepcion",
                  registrado_por: userId,
                  notas: `Recepcion ${rec.codigo}, OC ${oc.codigo}`,
                },
              });
            }
          }
        }
      }

      // Actualizar movimiento_stock_id en cada linea de recepcion
      for (const { recepcion_linea_id, movimiento_id } of movimientosCreados) {
        await tx.recepcion_lineas.update({
          where: { id: recepcion_linea_id },
          data: { movimiento_stock_id: movimiento_id },
        });
      }

      // Recalcular estado de la OC
      const lineasOC = await tx.orden_compra_lineas.findMany({
        where: { orden_compra_id: oc.id },
      });
      const todasRecibidas = lineasOC.every((l) => l.estado_linea === "recibida" || l.estado_linea === "cancelada");
      const algunaParcial = lineasOC.some((l) => Number(l.cantidad_recibida) > 0);
      let nuevoEstadoOC = oc.estado;
      let fechaEntrega = oc.fecha_entrega_real;
      if (todasRecibidas) {
        nuevoEstadoOC = "recibida_total";
        fechaEntrega = rec.fecha_recepcion;
      } else if (algunaParcial) {
        nuevoEstadoOC = "recibida_parcial";
      }
      await tx.ordenes_compra.update({
        where: { id: oc.id },
        data: {
          estado: nuevoEstadoOC,
          fecha_entrega_real: fechaEntrega,
          usuarios_ordenes_compra_actualizado_porTousuarios: { connect: { id: userId } },
        },
      });

      // Actualizar contadores del proveedor (solo si fue total)
      if (todasRecibidas) {
        const provee = await tx.proveedores.findUnique({ where: { id: proveedorId } });
        if (provee) {
          const atiempo = oc.fecha_entrega_acordada
            ? rec.fecha_recepcion <= oc.fecha_entrega_acordada
            : true;
          const noConformidades = rec.recepcion_lineas.filter((rl) => rl.resultado_inspeccion === "rechazado").length;
          await tx.proveedores.update({
            where: { id: proveedorId },
            data: {
              total_ordenes: provee.total_ordenes + 1,
              total_entregas_atiempo: provee.total_entregas_atiempo + (atiempo ? 1 : 0),
              total_no_conformidades: provee.total_no_conformidades + noConformidades,
              calificacion: provee.total_ordenes + 1 > 0
                ? Number((((provee.total_entregas_atiempo + (atiempo ? 1 : 0)) /
                    (provee.total_ordenes + 1)) * 100).toFixed(2))
                : null,
            },
          });
        }
      }

      // Confirmar la recepcion
      const recConfirmada = await tx.recepciones.update({
        where: { id: rec.id },
        data: {
          estado: "confirmada",
          usuarios_recepciones_actualizado_porTousuarios: { connect: { id: userId } },
        },
      });


      // Auto-crear NC si hay lineas rechazadas
      const lineasRechazadas = rec.recepcion_lineas
        .filter((rl) => rl.resultado_inspeccion === "rechazado" && Number(rl.cantidad_rechazada ?? 0) > 0)
        .map((rl) => ({
          id: rl.id,
          cantidad_rechazada: Number(rl.cantidad_rechazada ?? 1),
          motivo_rechazo: rl.motivo_rechazo ?? null,
        }));
      await crearOActualizarNC(tx, rec.id, lineasRechazadas, userId);

            return { recepcion: recConfirmada, oc_estado: nuevoEstadoOC, movimientos: movimientosCreados.length };
    });

    res.json({ data: result });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        not_found: 404,
        estado_invalido: 409,
        ubicacion_destino_requerida: 400,
      };
      const code = map[err.message];
      if (code) { res.status(code).json({ error: err.message }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/recepciones/:id/anular
// Solo si esta en borrador. Una vez confirmada los movimientos quedan firmes.
// -------------------------------------------------------------------
router.post("/:id/anular", requirePermission("compras", "recibir"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const rec = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.recepciones.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (exist.estado !== "borrador") throw new Error("solo_borrador_anulable");
      return tx.recepciones.update({
        where: { id: BigInt(id) },
        data: {
          estado: "anulada",
          usuarios_recepciones_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: rec });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "solo_borrador_anulable") { res.status(409).json({ error: "solo_borrador_anulable" }); return; }
    }
    throw err;
  }
});

export default router;

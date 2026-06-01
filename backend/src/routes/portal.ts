/**
 * Portal cliente (Dashboard D).
 *
 * Endpoints que solo retornan datos del cliente_id asociado al usuario
 * autenticado. Diseñados para una vista limpia y ejecutiva donde el
 * cliente ve sus expedientes activos / finalizados con timeline
 * simplificado y mapping de estados internos → labels para cliente.
 *
 * NO expone: costos internos, demoras detalladas, responsables internos,
 * info de otros clientes, productividad de técnicos, reprocesos.
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth } from "../auth/middleware";
import { crearDocumento, enviarPDF, resolverNivel } from "../services/pdf/base";
import { renderCotizacion, DataCotizacion } from "../services/pdf/documentos";
import { notificarResolucionHito } from "../services/notificaciones";

const router = Router();
router.use(requireAuth);

/** Middleware: solo deja pasar a usuarios con cliente_id asociado (rol cliente con vinculo). */
function requireClienteId(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user || !user.cliente_id) {
    res.status(403).json({
      error: "no_cliente_asociado",
      message: "Tu usuario no está asociado a una empresa cliente.",
    });
    return;
  }
  next();
}

// ===================================================================
// GET /api/portal/mis-expedientes
// ===================================================================
router.get("/mis-expedientes", requireClienteId, async (req, res) => {
  const clienteId = req.user!.cliente_id!;
  const data = await prisma.expedientes.findMany({
    where: { cliente_id: clienteId },
    orderBy: { fecha_apertura: "desc" },
    select: {
      id: true, codigo: true, estado: true,
      tipo_servicio_estimado: true, tipo_servicio_confirmado: true,
      fecha_apertura: true, fecha_cierre: true,
      descripcion_problema: true,
      expediente_hitos: {
        orderBy: { orden: "asc" },
        select: {
          id: true, codigo: true, nombre: true, orden: true, estado: true,
          visible_cliente: true, fecha_inicio: true, fecha_fin: true,
        },
      },
      transformadores: {
        select: { id: true, codigo_interno: true, marca: true, modelo: true, capacidad_kva: true, tipo: true },
      },
    },
  });
  res.json({ data });
});

// ===================================================================
// GET /api/portal/expediente/:id  (solo si pertenece al cliente)
// ===================================================================
router.get("/expediente/:id", requireClienteId, async (req, res) => {
  const id = Number(req.params.id);
  const clienteId = req.user!.cliente_id!;
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const exp = await prisma.expedientes.findFirst({
    where: { id, cliente_id: clienteId }, // doble filtro: id + cliente
    select: {
      id: true, codigo: true, estado: true,
      tipo_servicio_estimado: true, tipo_servicio_confirmado: true,
      fecha_apertura: true, fecha_cierre: true,
      descripcion_problema: true,
      expediente_hitos: {
        orderBy: { orden: "asc" },
        select: {
          id: true, codigo: true, nombre: true, orden: true, estado: true,
          visible_cliente: true, fecha_inicio: true, fecha_fin: true,
        },
      },
      transformadores: {
        select: { id: true, codigo_interno: true, marca: true, modelo: true, capacidad_kva: true, tipo: true, numero_serie: true },
      },
      ot: {
        select: {
          id: true, codigo: true, estado: true, tipo_ruta: true,
          fecha_inicio_planeada: true, fecha_fin_planeada: true,
          fecha_inicio_real: true, fecha_fin_real: true,
        },
      },
      cotizaciones: { select: { id: true, codigo: true, estado: true, total: true, fecha_emision: true } },
      contratos: { select: { id: true, codigo: true, estado: true, monto_total: true, fecha_firma: true } },
    },
  });

  if (!exp) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Adjuntar labels cliente
  const mappings = await prisma.hito_estados_cliente.findMany();
  const mapById = new Map(mappings.map((m) => [m.hito_codigo, m]));

  const hitosVisibles = exp.expediente_hitos
    .filter((h) => h.visible_cliente)
    .map((h) => {
      const m = mapById.get(h.codigo);
      return {
        ...h,
        label_cliente: m?.label_cliente ?? h.nombre,
        descripcion_cliente: m?.descripcion_cliente ?? null,
        emoji: m?.emoji ?? null,
      };
    });

  // Calcular % avance solo con hitos visibles
  const total = hitosVisibles.length;
  const completados = hitosVisibles.filter((h) => h.estado === "completado").length;
  const en_curso = hitosVisibles.find((h) => h.estado === "en_curso");
  const proximo = hitosVisibles.find((h) => h.estado === "no_iniciado");

  res.json({
    data: {
      ...exp,
      // Sobreescribimos hitos con la version filtrada + mapeada
      expediente_hitos: hitosVisibles,
      portal_meta: {
        avance_pct: total > 0 ? Math.round((completados / total) * 100) : 0,
        completados,
        total,
        fase_actual_label: en_curso
          ? (mapById.get(en_curso.codigo)?.label_cliente ?? en_curso.nombre)
          : completados === total
            ? "Proceso finalizado"
            : "Por iniciar",
        proximo_paso_label: proximo
          ? (mapById.get(proximo.codigo)?.label_cliente ?? proximo.nombre)
          : null,
      },
    },
  });
});

// ===================================================================
// GET /api/portal/resumen  (KPIs simples del cliente)
// ===================================================================
router.get("/resumen", requireClienteId, async (req, res) => {
  const clienteId = req.user!.cliente_id!;

  const [porEstado, transformadores] = await Promise.all([
    prisma.expedientes.groupBy({
      by: ["estado"],
      where: { cliente_id: clienteId },
      _count: true,
    }),
    prisma.transformadores.count({ where: { cliente_id: clienteId } }),
  ]);

  res.json({
    data: {
      por_estado: porEstado.reduce<Record<string, number>>((a, r) => { a[r.estado] = r._count; return a; }, {}),
      transformadores_registrados: transformadores,
    },
  });
});

// ===================================================================
// GET /api/portal/mis-transformadores
// ===================================================================
router.get("/mis-transformadores", requireClienteId, async (req, res) => {
  const clienteId = req.user!.cliente_id!;
  const data = await prisma.transformadores.findMany({
    where: { cliente_id: clienteId },
    orderBy: { codigo_interno: "asc" },
    select: {
      id: true, codigo_interno: true, marca: true, modelo: true,
      numero_serie: true, tipo: true, capacidad_kva: true,
      tension_primaria_kv: true, tension_secundaria_v: true,
      anio_fabricacion: true, ubicacion_actual: true, estado: true,
      _count: { select: { ot: true } },
    },
  });
  res.json({ data });
});

// ===================================================================
// Aprobación de cotización POR EL CLIENTE (gate hito "aprobacion_cliente")
//
// Solo se habilita cuando la cotizacion del expediente esta en estado
// 'enviada'. Toda mutacion valida propiedad (cotizacion_id + cliente_id) y
// el estado server-side; el gating del frontend es solo UX.
// ===================================================================
const GATE_HITO = "aprobacion_cliente";
const rechazarSchema = z.object({ motivo: z.string().min(1).max(2000) });

/**
 * Devuelve el expediente del cliente autenticado que referencia esta
 * cotizacion (doble filtro cotizacion_id + cliente_id), con el estado de la
 * cotizacion y el hito gate. null si la cotizacion no le pertenece.
 */
async function expedienteDeCotizacionDelCliente(cotId: number, clienteId: number) {
  return prisma.expedientes.findFirst({
    where: { cotizacion_id: cotId, cliente_id: clienteId },
    select: {
      id: true,
      cotizaciones: { select: { id: true, codigo: true, estado: true } },
      expediente_hitos: {
        where: { codigo: GATE_HITO },
        select: { id: true, estado: true },
      },
    },
  });
}

// -------------------------------------------------------------------
// GET /api/portal/cotizacion/:id/pdf  -> PDF nivel cliente (sin costos internos)
// -------------------------------------------------------------------
router.get("/cotizacion/:id/pdf", requireClienteId, async (req, res) => {
  const id = Number(req.params.id);
  const clienteId = req.user!.cliente_id!;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }

  const owns = await expedienteDeCotizacionDelCliente(id, clienteId);
  if (!owns) { res.status(404).json({ error: "not_found" }); return; }

  const cot = await prisma.cotizaciones.findUnique({
    where: { id },
    include: {
      clientes: true,
      cotizacion_lineas: { orderBy: { orden: "asc" } },
      cotizacion_revisiones: { orderBy: { revision: "desc" } },
    },
  });
  if (!cot) { res.status(404).json({ error: "not_found" }); return; }
  // No exponer borradores internos al cliente.
  if (cot.estado === "borrador") { res.status(403).json({ error: "cotizacion_no_disponible" }); return; }

  // Nivel SIEMPRE cliente: resolverNivel fuerza max 2 para rol "cliente".
  const { nivel } = resolverNivel(2, req.user!.rol_nombre, false);
  const doc = crearDocumento({
    documento: "COTIZACIÓN", codigo: cot.codigo ?? `COT-${id}`,
    fecha: cot.fecha_emision ?? new Date(), nivel, subtitulo: "Documento comercial",
  });
  renderCotizacion(doc, cot as unknown as DataCotizacion, nivel);
  enviarPDF(doc, res, `${cot.codigo ?? id}-N${nivel}`);
});

// -------------------------------------------------------------------
// POST /api/portal/cotizacion/:id/aprobar
// -------------------------------------------------------------------
router.post("/cotizacion/:id/aprobar", requireClienteId, async (req, res) => {
  const id = Number(req.params.id);
  const clienteId = req.user!.cliente_id!;
  const userId = req.user!.id;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }

  const exp = await expedienteDeCotizacionDelCliente(id, clienteId);
  if (!exp || !exp.cotizaciones) { res.status(404).json({ error: "not_found" }); return; }
  if (exp.cotizaciones.estado !== "enviada") {
    res.status(409).json({ error: "cotizacion_no_enviada", estado: exp.cotizaciones.estado });
    return;
  }
  const hito = exp.expediente_hitos[0];
  if (!hito || hito.estado !== "en_curso") {
    res.status(409).json({ error: "hito_no_en_aprobacion" });
    return;
  }
  const expId = Number(exp.id);

  await withAppUser(userId, async (tx) => {
    await tx.$executeRaw`
      UPDATE comercial.cotizaciones
         SET estado = 'aprobada', aprobada_por = ${userId}::uuid,
             fecha_aprobacion = NOW(), actualizado_por = ${userId}::uuid
       WHERE id = ${id}
    `;
    await tx.$executeRaw`
      UPDATE comercial.expediente_hitos
         SET estado = 'completado', fecha_fin = NOW(),
             aprobado_por = ${userId}::uuid, fecha_aprobacion = NOW(),
             actualizado_por = ${userId}::uuid
       WHERE expediente_id = ${expId} AND codigo = ${GATE_HITO} AND estado = 'en_curso'
    `;
    // Activar el siguiente hito en orden (mismo patron que expedientes.ts)
    await tx.$executeRaw`
      UPDATE comercial.expediente_hitos
         SET estado = 'en_curso', fecha_inicio = NOW(), actualizado_por = ${userId}::uuid
       WHERE expediente_id = ${expId}
         AND estado = 'no_iniciado'
         AND orden = (
           SELECT MIN(orden) FROM comercial.expediente_hitos
            WHERE expediente_id = ${expId} AND estado = 'no_iniciado'
         )
    `;
  });

  // Notificar al ejecutivo del expediente (best-effort)
  void notificarResolucionHito(Number(hito.id), true, null).catch((e) =>
    console.error("[notif] portal aprobar cotizacion fallo:", e),
  );
  res.json({ status: "aprobada" });
});

// -------------------------------------------------------------------
// POST /api/portal/cotizacion/:id/rechazar  (body: { motivo })
// -------------------------------------------------------------------
router.post("/cotizacion/:id/rechazar", requireClienteId, async (req, res) => {
  const id = Number(req.params.id);
  const clienteId = req.user!.cliente_id!;
  const userId = req.user!.id;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = rechazarSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_payload" }); return; }
  const motivo = parsed.data.motivo;

  const exp = await expedienteDeCotizacionDelCliente(id, clienteId);
  if (!exp || !exp.cotizaciones) { res.status(404).json({ error: "not_found" }); return; }
  if (exp.cotizaciones.estado !== "enviada") {
    res.status(409).json({ error: "cotizacion_no_enviada", estado: exp.cotizaciones.estado });
    return;
  }
  const hito = exp.expediente_hitos[0];
  if (!hito || hito.estado !== "en_curso") {
    res.status(409).json({ error: "hito_no_en_aprobacion" });
    return;
  }

  await withAppUser(userId, async (tx) => {
    const cot = await tx.cotizaciones.findUnique({ where: { id }, select: { notas_internas: true } });
    const fecha = new Date().toISOString().split("T")[0];
    const entrada = `[RECHAZADA-CLIENTE ${fecha}] ${motivo}`;
    const notasNueva = `${entrada}\n${cot?.notas_internas ?? ""}`.trim();
    await tx.$executeRaw`
      UPDATE comercial.cotizaciones
         SET estado = 'rechazada', notas_internas = ${notasNueva},
             actualizado_por = ${userId}::uuid
       WHERE id = ${id}
    `;
    // El hito gate queda en_curso (en espera de una cotizacion corregida).
  });

  void notificarResolucionHito(Number(hito.id), false, motivo).catch((e) =>
    console.error("[notif] portal rechazar cotizacion fallo:", e),
  );
  res.json({ status: "rechazada" });
});

export default router;

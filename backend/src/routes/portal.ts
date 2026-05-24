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
import { prisma } from "../db/client";
import { requireAuth } from "../auth/middleware";

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

export default router;

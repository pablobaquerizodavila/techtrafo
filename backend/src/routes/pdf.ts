/**
 * Endpoints de generación de PDFs (4.6).
 *
 * GET /api/pdf/cotizacion/:id?nivel=N
 * GET /api/pdf/contrato/:id?nivel=N
 * GET /api/pdf/ot/:id?nivel=N
 * GET /api/pdf/informe-tecnico/:id?nivel=N
 *
 * El nivel pedido se valida server-side: si el rol es "cliente" se
 * fuerza a max N=2; si es interno (no super_admin) se fuerza a max N=3.
 */
import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth, requirePermission } from "../auth/middleware";
import { crearDocumento, enviarPDF, resolverNivel } from "../services/pdf/base";
import {
  renderCotizacion, renderContrato, renderOT, renderInformeTecnico, renderOrdenCompra,
  DataCotizacion, DataContrato, DataOT, DataInformeTecnico, DataOrdenCompra,
} from "../services/pdf/documentos";

const router = Router();
router.use(requireAuth);

function parseNivel(q: unknown): number | undefined {
  const v = Number(q);
  return Number.isInteger(v) && v >= 1 && v <= 4 ? v : undefined;
}

// ===================================================================
// COTIZACION
// ===================================================================
router.get("/cotizacion/:id", requirePermission("cotizaciones", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const cot = await prisma.cotizaciones.findUnique({
    where: { id },
    include: {
      clientes: true,
      cotizacion_lineas: { orderBy: { orden: "asc" } },
      cotizacion_revisiones: { orderBy: { revision: "desc" } },
    },
  });
  if (!cot) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { nivel } = resolverNivel(parseNivel(req.query.nivel), req.user!.rol_nombre, req.user!.es_super_admin);
  const doc = crearDocumento({
    documento: "COTIZACIÓN", codigo: cot.codigo, fecha: cot.fecha_emision, nivel,
    subtitulo: "Documento comercial",
  });
  renderCotizacion(doc, cot as unknown as DataCotizacion, nivel);
  enviarPDF(doc, res, `${cot.codigo}-N${nivel}`);
});

// ===================================================================
// CONTRATO
// ===================================================================
router.get("/contrato/:id", requirePermission("contratos", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const c = await prisma.contratos.findUnique({
    where: { id },
    include: {
      clientes: true,
      cotizaciones: { select: { codigo: true, total: true } },
      contrato_pagos: { orderBy: { numero: "asc" } },
    },
  });
  if (!c) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { nivel } = resolverNivel(parseNivel(req.query.nivel), req.user!.rol_nombre, req.user!.es_super_admin);
  const doc = crearDocumento({
    documento: "CONTRATO", codigo: c.codigo, fecha: c.created_at ?? new Date(), nivel,
  });
  renderContrato(doc, c as unknown as DataContrato, nivel);
  enviarPDF(doc, res, `${c.codigo}-N${nivel}`);
});

// ===================================================================
// OT
// ===================================================================
router.get("/ot/:id", requirePermission("ot", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const ot = await prisma.ot.findUnique({
    where: { id },
    include: {
      contratos: { include: { clientes: true } },
      transformadores: true,
      usuarios_ot_responsable_idTousuarios: { select: { nombres: true, apellidos: true } },
      ot_pasos: {
        orderBy: { numero: "asc" },
        include: {
          areas: { select: { nombre: true } },
          usuarios_ot_pasos_ejecutado_porTousuarios: { select: { nombres: true, apellidos: true } },
        },
      },
    },
  });
  if (!ot) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { nivel } = resolverNivel(parseNivel(req.query.nivel), req.user!.rol_nombre, req.user!.es_super_admin);
  const doc = crearDocumento({
    documento: "ORDEN DE TRABAJO", codigo: ot.codigo ?? `OT-${ot.id}`, fecha: ot.created_at ?? new Date(), nivel,
  });
  renderOT(doc, ot as unknown as DataOT, nivel);
  enviarPDF(doc, res, `${ot.codigo ?? `OT-${ot.id}`}-N${nivel}`);
});

// ===================================================================
// INFORME TECNICO
// ===================================================================
router.get("/informe-tecnico/:id", requirePermission("expedientes", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const inf = await prisma.informes_tecnicos.findUnique({
    where: { id },
    include: {
      expedientes: { include: { clientes: { select: { razon_social: true } } } },
      visitas_tecnicas: true,
    },
  });
  if (!inf) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { nivel } = resolverNivel(parseNivel(req.query.nivel), req.user!.rol_nombre, req.user!.es_super_admin);
  const doc = crearDocumento({
    documento: "INFORME TÉCNICO", codigo: inf.numero, fecha: inf.created_at ?? new Date(), nivel,
  });
  renderInformeTecnico(doc, inf as unknown as DataInformeTecnico, nivel);
  enviarPDF(doc, res, `${inf.numero}-N${nivel}`);
});

// ===================================================================
// ORDEN DE COMPRA
// ===================================================================
router.get("/orden-compra/:id", requirePermission("compras", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const oc = await prisma.ordenes_compra.findUnique({
    where: { id: BigInt(id) },
    include: {
      proveedores: true,
      roles: { select: { nombre: true } },
      orden_compra_lineas: { orderBy: { orden: "asc" } },
      solicitudes_ordenes_compra_solicitud_idTosolicitudes: {
        select: { codigo: true, departamento_solicitante: true },
      },
      expedientes: { select: { codigo: true } },
      usuarios_ordenes_compra_aprobador_idTousuarios: { select: { nombre_completo: true } },
    },
  });
  if (!oc) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { nivel } = resolverNivel(parseNivel(req.query.nivel), req.user!.rol_nombre, req.user!.es_super_admin);
  const doc = crearDocumento({
    documento: "ORDEN DE COMPRA", codigo: oc.codigo, fecha: oc.fecha_emision ?? new Date(), nivel,
    subtitulo: "Documento formal de compra",
  });
  renderOrdenCompra(doc, oc as unknown as DataOrdenCompra, nivel);
  enviarPDF(doc, res, `${oc.codigo}-N${nivel}`);
});

export default router;

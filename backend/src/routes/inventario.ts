import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

// ===================================================================
// Schemas zod comunes
// ===================================================================
const tipoItemEnum = z.enum(["insumo", "componente", "herramienta", "servicio", "producto_terminado"]);
const estadoCatBasicoEnum = z.enum(["activo", "inactivo"]);
const estadoItemEnum = z.enum(["activo", "inactivo", "descontinuado"]);
const tipoUbicEnum = z.enum(["bodega", "area_produccion", "area_qc", "transito", "obra"]);
const tipoMovEnum = z.enum(["entrada", "salida", "ajuste_positivo", "ajuste_negativo", "transferencia"]);
const refTipoEnum = z.enum(["compra", "ot", "devolucion", "inventario_fisico", "manual"]);

// ===================================================================
// /api/inventario/categorias
// ===================================================================
const categoriaCreateSchema = z.object({
  codigo: z.string().max(20).optional().nullable(),
  nombre: z.string().min(1).max(100),
  descripcion: z.string().optional().nullable(),
});
const categoriaUpdateSchema = categoriaCreateSchema.partial().extend({
  estado: estadoCatBasicoEnum.optional(),
});

router.get("/categorias", async (req, res) => {
  const incluirInactivos = req.query.include_inactivos === "true";
  const data = await prisma.categorias_item.findMany({
    where: incluirInactivos ? {} : { estado: "activo" },
    orderBy: { nombre: "asc" },
  });
  res.json({ data });
});

router.post("/categorias", async (req, res) => {
  const parsed = categoriaCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  try {
    const cat = await withAppUser(userId, (tx) =>
      tx.categorias_item.create({
        data: { ...parsed.data, creado_por: userId, actualizado_por: userId },
      }),
    );
    res.status(201).json({ data: cat });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "codigo_duplicado" });
      return;
    }
    throw err;
  }
});

router.patch("/categorias/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = categoriaUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  try {
    const cat = await withAppUser(userId, (tx) =>
      tx.categorias_item.update({
        where: { id },
        data: { ...parsed.data, actualizado_por: userId },
      }),
    );
    res.json({ data: cat });
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

router.delete("/categorias/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;
  try {
    // Verificar que no haya items activos en la categoria
    const itemsAsociados = await prisma.items.count({
      where: { categoria_id: id, estado: { not: "descontinuado" } },
    });
    if (itemsAsociados > 0) {
      res.status(409).json({ error: "categoria_con_items", count: itemsAsociados });
      return;
    }
    await withAppUser(userId, (tx) =>
      tx.categorias_item.update({
        where: { id },
        data: { estado: "inactivo", actualizado_por: userId },
      }),
    );
    res.status(204).end();
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// /api/inventario/ubicaciones
// ===================================================================
const ubicacionCreateSchema = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(1).max(100),
  descripcion: z.string().optional().nullable(),
  tipo: tipoUbicEnum.default("bodega"),
});
const ubicacionUpdateSchema = ubicacionCreateSchema.partial().extend({
  estado: estadoCatBasicoEnum.optional(),
});

router.get("/ubicaciones", async (req, res) => {
  const incluirInactivos = req.query.include_inactivos === "true";
  const data = await prisma.ubicaciones.findMany({
    where: incluirInactivos ? {} : { estado: "activo" },
    orderBy: { nombre: "asc" },
  });
  res.json({ data });
});

router.post("/ubicaciones", async (req, res) => {
  const parsed = ubicacionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  try {
    const ub = await withAppUser(userId, (tx) =>
      tx.ubicaciones.create({
        data: { ...parsed.data, creado_por: userId, actualizado_por: userId },
      }),
    );
    res.status(201).json({ data: ub });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "codigo_duplicado" });
      return;
    }
    throw err;
  }
});

router.patch("/ubicaciones/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = ubicacionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  try {
    const ub = await withAppUser(userId, (tx) =>
      tx.ubicaciones.update({
        where: { id },
        data: { ...parsed.data, actualizado_por: userId },
      }),
    );
    res.json({ data: ub });
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "codigo_duplicado" });
      return;
    }
    throw err;
  }
});

router.delete("/ubicaciones/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;
  try {
    // Verificar que no tenga stock
    const stockEnUbicacion = await prisma.stock.count({
      where: { ubicacion_id: id, cantidad: { gt: 0 } },
    });
    if (stockEnUbicacion > 0) {
      res.status(409).json({ error: "ubicacion_con_stock", count: stockEnUbicacion });
      return;
    }
    await withAppUser(userId, (tx) =>
      tx.ubicaciones.update({
        where: { id },
        data: { estado: "inactivo", actualizado_por: userId },
      }),
    );
    res.status(204).end();
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// /api/inventario/items
// ===================================================================
const itemCreateSchema = z
  .object({
    codigo_interno: z.string().min(1).max(50),
    categoria_id: z.number().int().positive(),
    nombre: z.string().min(1).max(200),
    descripcion: z.string().optional().nullable(),
    tipo_item: tipoItemEnum,
    unidad_medida: z.string().max(20).default("unid"),
    controla_stock: z.boolean().default(true),
    controla_lote: z.boolean().default(false),
    controla_serie: z.boolean().default(false),
    costo_referencia: z.number().nonnegative().default(0),
    precio_referencia: z.number().nonnegative().default(0),
    stock_minimo: z.number().nonnegative().default(0),
    stock_maximo: z.number().nonnegative().default(0),
    punto_reorden: z.number().nonnegative().default(0),
    proveedor_preferido: z.string().max(200).optional().nullable(),
    peso_kg: z.number().nonnegative().optional().nullable(),
    notas: z.string().optional().nullable(),
  })
  .refine((d) => !(d.controla_lote && d.controla_serie), {
    message: "controla_lote y controla_serie son mutuamente excluyentes",
    path: ["controla_serie"],
  })
  .refine((d) => !(d.tipo_item === "servicio" && d.controla_stock), {
    message: "tipo_item=servicio no puede controlar stock",
    path: ["controla_stock"],
  });

const itemUpdateSchema = z
  .object({
    codigo_interno: z.string().min(1).max(50).optional(),
    categoria_id: z.number().int().positive().optional(),
    nombre: z.string().min(1).max(200).optional(),
    descripcion: z.string().optional().nullable(),
    tipo_item: tipoItemEnum.optional(),
    unidad_medida: z.string().max(20).optional(),
    controla_stock: z.boolean().optional(),
    controla_lote: z.boolean().optional(),
    controla_serie: z.boolean().optional(),
    costo_referencia: z.number().nonnegative().optional(),
    precio_referencia: z.number().nonnegative().optional(),
    stock_minimo: z.number().nonnegative().optional(),
    stock_maximo: z.number().nonnegative().optional(),
    punto_reorden: z.number().nonnegative().optional(),
    proveedor_preferido: z.string().max(200).optional().nullable(),
    peso_kg: z.number().nonnegative().optional().nullable(),
    notas: z.string().optional().nullable(),
    estado: estadoItemEnum.optional(),
  })
  .refine(
    (d) => !(d.controla_lote === true && d.controla_serie === true),
    { message: "controla_lote y controla_serie son mutuamente excluyentes", path: ["controla_serie"] },
  );

const itemListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  q: z.string().trim().optional(),
  categoria_id: z.coerce.number().int().positive().optional(),
  tipo_item: tipoItemEnum.optional(),
  estado: estadoItemEnum.optional(),
});

router.get("/items", async (req, res) => {
  const parsed = itemListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, categoria_id, tipo_item, estado } = parsed.data;
  const where: Prisma.itemsWhereInput = {};
  if (categoria_id) where.categoria_id = categoria_id;
  if (tipo_item) where.tipo_item = tipo_item;
  if (estado) {
    where.estado = estado;
  } else {
    where.estado = { not: "descontinuado" };
  }
  if (q) {
    where.OR = [
      { codigo_interno: { contains: q, mode: "insensitive" } },
      { nombre: { contains: q, mode: "insensitive" } },
      { descripcion: { contains: q, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.items.findMany({
      where,
      orderBy: { nombre: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        categorias_item: { select: { id: true, nombre: true } },
      },
    }),
    prisma.items.count({ where }),
  ]);
  res.json({ data, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
});

router.get("/items/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const item = await prisma.items.findUnique({
    where: { id },
    include: {
      categorias_item: { select: { id: true, nombre: true } },
      stock: {
        include: {
          ubicaciones: { select: { id: true, codigo: true, nombre: true } },
          lotes: { select: { id: true, numero_lote: true, fecha_vencimiento: true } },
        },
        orderBy: { id: "asc" },
      },
      lotes: { orderBy: { fecha_ingreso: "desc" }, take: 20 },
      series: { orderBy: { fecha_fabricacion: "desc" }, take: 20 },
    },
  });
  if (!item) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  // Calcular stock total
  const stock_total = item.stock.reduce((acc, s) => acc + Number(s.cantidad), 0);
  res.json({ data: { ...item, stock_total } });
});

router.post("/items", async (req, res) => {
  const parsed = itemCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  try {
    const item = await withAppUser(userId, (tx) =>
      tx.items.create({
        data: { ...parsed.data, creado_por: userId, actualizado_por: userId },
        include: { categorias_item: { select: { id: true, nombre: true } } },
      }),
    );
    res.status(201).json({ data: item });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "codigo_interno_duplicado" });
      return;
    }
    throw err;
  }
});

router.patch("/items/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = itemUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  try {
    const item = await withAppUser(userId, (tx) =>
      tx.items.update({
        where: { id },
        data: { ...parsed.data, actualizado_por: userId },
        include: { categorias_item: { select: { id: true, nombre: true } } },
      }),
    );
    res.json({ data: item });
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "codigo_interno_duplicado" });
      return;
    }
    throw err;
  }
});

router.delete("/items/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;
  try {
    // Verificar que no tenga stock activo
    const stockExistente = await prisma.stock.aggregate({
      where: { item_id: id },
      _sum: { cantidad: true },
    });
    if (stockExistente._sum.cantidad && Number(stockExistente._sum.cantidad) > 0) {
      res.status(409).json({
        error: "item_con_stock",
        cantidad: Number(stockExistente._sum.cantidad),
      });
      return;
    }
    await withAppUser(userId, (tx) =>
      tx.items.update({
        where: { id },
        data: { estado: "descontinuado", actualizado_por: userId },
      }),
    );
    res.status(204).end();
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// /api/inventario/stock
// ===================================================================
const stockListQuerySchema = z.object({
  item_id: z.coerce.number().int().positive().optional(),
  ubicacion_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().optional(),
  con_cantidad: z.enum(["true", "false"]).optional(),
});

router.get("/stock", async (req, res) => {
  const parsed = stockListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { item_id, ubicacion_id, q, con_cantidad } = parsed.data;
  const where: Prisma.stockWhereInput = {};
  if (item_id) where.item_id = item_id;
  if (ubicacion_id) where.ubicacion_id = ubicacion_id;
  if (con_cantidad !== "false") where.cantidad = { gt: 0 };
  if (q) {
    where.items = {
      OR: [
        { codigo_interno: { contains: q, mode: "insensitive" } },
        { nombre: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const data = await prisma.stock.findMany({
    where,
    include: {
      items: { select: { id: true, codigo_interno: true, nombre: true, unidad_medida: true, controla_lote: true, controla_serie: true } },
      ubicaciones: { select: { id: true, codigo: true, nombre: true } },
      lotes: { select: { id: true, numero_lote: true, fecha_vencimiento: true } },
    },
    orderBy: [{ items: { nombre: "asc" } }, { ubicacion_id: "asc" }],
    take: 500,
  });
  res.json({ data });
});

router.get("/stock/alertas", async (_req, res) => {
  // 1. Items con stock total < punto_reorden (que controlen stock)
  const alertasReorden = await prisma.$queryRaw<
    Array<{ item_id: bigint; codigo_interno: string; nombre: string; unidad_medida: string; punto_reorden: string; stock_actual: string }>
  >`
    SELECT
      i.id AS item_id,
      i.codigo_interno,
      i.nombre,
      i.unidad_medida,
      i.punto_reorden,
      COALESCE(SUM(s.cantidad), 0) AS stock_actual
    FROM inventario.items i
    LEFT JOIN inventario.stock s ON s.item_id = i.id
    WHERE i.controla_stock = TRUE
      AND i.estado = 'activo'
      AND i.punto_reorden > 0
    GROUP BY i.id
    HAVING COALESCE(SUM(s.cantidad), 0) < i.punto_reorden
    ORDER BY i.nombre
    LIMIT 100
  `;

  // 2. Lotes proximos a vencer en los proximos 90 dias
  const lotesPorVencer = await prisma.lotes.findMany({
    where: {
      estado: "activo",
      fecha_vencimiento: {
        gte: new Date(),
        lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    },
    include: {
      items: { select: { id: true, codigo_interno: true, nombre: true, unidad_medida: true } },
    },
    orderBy: { fecha_vencimiento: "asc" },
    take: 100,
  });

  res.json({
    data: {
      stock_bajo_reorden: alertasReorden.map((r) => ({
        ...r,
        item_id: Number(r.item_id),
        punto_reorden: Number(r.punto_reorden),
        stock_actual: Number(r.stock_actual),
      })),
      lotes_por_vencer: lotesPorVencer,
    },
  });
});

// ===================================================================
// /api/inventario/movimientos
// ===================================================================
const movCreateSchema = z
  .object({
    tipo: tipoMovEnum,
    item_id: z.number().int().positive(),
    ubicacion_origen_id: z.number().int().positive().optional().nullable(),
    ubicacion_destino_id: z.number().int().positive().optional().nullable(),
    lote_id: z.number().int().positive().optional().nullable(),
    serie_id: z.number().int().positive().optional().nullable(),
    cantidad: z.number().positive(),
    costo_unitario: z.number().nonnegative().optional().nullable(),
    referencia_tipo: refTipoEnum.optional().nullable(),
    referencia_id: z.number().int().positive().optional().nullable(),
    motivo: z.string().optional().nullable(),
    observaciones: z.string().optional().nullable(),
    fecha: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    // Reglas de coherencia segun tipo (mismas que el CHECK en DB)
    if (["entrada", "ajuste_positivo"].includes(d.tipo)) {
      if (!d.ubicacion_destino_id) {
        ctx.addIssue({ code: "custom", path: ["ubicacion_destino_id"], message: "Requerido para entrada/ajuste_positivo" });
      }
      if (d.ubicacion_origen_id) {
        ctx.addIssue({ code: "custom", path: ["ubicacion_origen_id"], message: "No debe estar presente en entrada/ajuste_positivo" });
      }
    } else if (["salida", "ajuste_negativo"].includes(d.tipo)) {
      if (!d.ubicacion_origen_id) {
        ctx.addIssue({ code: "custom", path: ["ubicacion_origen_id"], message: "Requerido para salida/ajuste_negativo" });
      }
      if (d.ubicacion_destino_id) {
        ctx.addIssue({ code: "custom", path: ["ubicacion_destino_id"], message: "No debe estar presente en salida/ajuste_negativo" });
      }
    } else if (d.tipo === "transferencia") {
      if (!d.ubicacion_origen_id || !d.ubicacion_destino_id) {
        ctx.addIssue({ code: "custom", path: ["ubicacion_destino_id"], message: "Origen y destino requeridos en transferencia" });
      }
      if (d.ubicacion_origen_id === d.ubicacion_destino_id) {
        ctx.addIssue({ code: "custom", path: ["ubicacion_destino_id"], message: "Origen y destino deben diferir" });
      }
    }
  });

const movListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  item_id: z.coerce.number().int().positive().optional(),
  ubicacion_id: z.coerce.number().int().positive().optional(),
  tipo: tipoMovEnum.optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

router.get("/movimientos", async (req, res) => {
  const parsed = movListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, item_id, ubicacion_id, tipo, desde, hasta } = parsed.data;
  const where: Prisma.movimientos_stockWhereInput = {};
  if (item_id) where.item_id = item_id;
  if (tipo) where.tipo = tipo;
  if (ubicacion_id) {
    where.OR = [{ ubicacion_origen_id: ubicacion_id }, { ubicacion_destino_id: ubicacion_id }];
  }
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }

  const [data, total] = await Promise.all([
    prisma.movimientos_stock.findMany({
      where,
      orderBy: { fecha: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        items: { select: { id: true, codigo_interno: true, nombre: true, unidad_medida: true } },
        ubicaciones_movimientos_stock_ubicacion_origen_idToubicaciones: { select: { id: true, codigo: true, nombre: true } },
        ubicaciones_movimientos_stock_ubicacion_destino_idToubicaciones: { select: { id: true, codigo: true, nombre: true } },
        lotes: { select: { id: true, numero_lote: true } },
        series: { select: { id: true, numero_serie: true } },
      },
    }),
    prisma.movimientos_stock.count({ where }),
  ]);
  res.json({ data, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
});

router.post("/movimientos", async (req, res) => {
  const parsed = movCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  try {
    const mov = await withAppUser(userId, async (tx) => {
      // Validar item existe y permite movimientos
      const item = await tx.items.findUnique({ where: { id: d.item_id } });
      if (!item) throw new Error("item_no_existe");
      if (item.estado === "descontinuado") throw new Error("item_descontinuado");

      // Si el item controla_lote, el lote_id es obligatorio
      if (item.controla_lote && !d.lote_id) {
        throw new Error("lote_requerido");
      }
      if (!item.controla_lote && d.lote_id) {
        throw new Error("lote_no_aplica");
      }
      if (item.controla_serie && !d.serie_id && d.tipo === "salida") {
        // salida de items con serie debe especificar la serie
        throw new Error("serie_requerida");
      }

      // Validar lote pertenece al item
      if (d.lote_id) {
        const lote = await tx.lotes.findUnique({ where: { id: d.lote_id } });
        if (!lote || lote.item_id !== BigInt(d.item_id)) {
          throw new Error("lote_invalido");
        }
      }

      // Crear el movimiento (el trigger fn_aplicar_movimiento_stock actualiza
      // automaticamente la tabla stock)
      return tx.movimientos_stock.create({
        data: {
          fecha: d.fecha ? new Date(d.fecha) : new Date(),
          tipo: d.tipo,
          item_id: d.item_id,
          ubicacion_origen_id: d.ubicacion_origen_id ?? null,
          ubicacion_destino_id: d.ubicacion_destino_id ?? null,
          lote_id: d.lote_id ?? null,
          serie_id: d.serie_id ?? null,
          cantidad: d.cantidad,
          costo_unitario: d.costo_unitario ?? null,
          referencia_tipo: d.referencia_tipo ?? null,
          referencia_id: d.referencia_id ?? null,
          motivo: d.motivo ?? null,
          observaciones: d.observaciones ?? null,
          usuario_id: userId,
        },
        include: {
          items: { select: { id: true, codigo_interno: true, nombre: true } },
        },
      });
    });
    res.status(201).json({ data: mov });
  } catch (err) {
    if (err instanceof Error) {
      const known = ["item_no_existe", "item_descontinuado", "lote_requerido", "lote_no_aplica", "serie_requerida", "lote_invalido"];
      if (known.includes(err.message)) {
        res.status(400).json({ error: err.message });
        return;
      }
      // El trigger PL/pgSQL lanza RAISE EXCEPTION si stock < cantidad en salidas
      if (err.message.includes("No existe stock para") || err.message.includes("violates check constraint") || err.message.includes("stock_cantidad_check")) {
        res.status(409).json({ error: "stock_insuficiente" });
        return;
      }
    }
    // Postgres CHECK constraint violations propagados por Prisma (P2010)
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "P2010") {
        res.status(409).json({ error: "stock_insuficiente" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// /api/inventario/lotes
// ===================================================================
const loteCreateSchema = z.object({
  item_id: z.number().int().positive(),
  numero_lote: z.string().min(1).max(80),
  proveedor: z.string().max(200).optional().nullable(),
  fecha_ingreso: z.string().optional(),
  fecha_vencimiento: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
});

router.get("/lotes", async (req, res) => {
  const item_id = req.query.item_id ? Number(req.query.item_id) : undefined;
  const data = await prisma.lotes.findMany({
    where: item_id ? { item_id } : {},
    orderBy: { fecha_ingreso: "desc" },
    take: 100,
    include: { items: { select: { id: true, codigo_interno: true, nombre: true } } },
  });
  res.json({ data });
});

router.post("/lotes", async (req, res) => {
  const parsed = loteCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  try {
    const lote = await withAppUser(userId, async (tx) => {
      const item = await tx.items.findUnique({ where: { id: d.item_id } });
      if (!item) throw new Error("item_no_existe");
      if (!item.controla_lote) throw new Error("item_no_controla_lote");
      return tx.lotes.create({
        data: {
          item_id: d.item_id,
          numero_lote: d.numero_lote,
          proveedor: d.proveedor ?? null,
          fecha_ingreso: d.fecha_ingreso ? new Date(d.fecha_ingreso) : new Date(),
          fecha_vencimiento: d.fecha_vencimiento ? new Date(d.fecha_vencimiento) : null,
          observaciones: d.observaciones ?? null,
          creado_por: userId,
          actualizado_por: userId,
        },
      });
    });
    res.status(201).json({ data: lote });
  } catch (err) {
    if (err instanceof Error) {
      if (["item_no_existe", "item_no_controla_lote"].includes(err.message)) {
        res.status(400).json({ error: err.message });
        return;
      }
    }
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "lote_duplicado_para_item" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// Helpers
// ===================================================================
function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

export default router;

# Database

Scripts SQL del sistema TECHTRAFO sobre PostgreSQL 16.

## Estructura

- `migrations/` - cambios estructurales (tablas, indices, constraints)
- `seeds/` - datos iniciales del sistema

## Convencion de nombres

`NNN-descripcion-corta.sql`

Donde `NNN` es un numero secuencial de 3 digitos (001, 002, 003...).

## Ejecutar manualmente

```bash
# Migracion
docker compose exec postgres psql -U techtrafo_admin -d techtrafo \
  -f /scripts/001-init-core-schema.sql

# Seed
docker compose exec postgres psql -U techtrafo_admin -d techtrafo \
  -f /scripts/001-roles-iniciales.sql
```

## Ejecutados en produccion

- `migrations/001-init-core-schema.sql` - 2026-05-22
- `seeds/001-roles-iniciales.sql` - 2026-05-22
- `seeds/002-configuracion-inicial.sql` - 2026-05-22

## Pendientes (FASE 3)

- `migrations/002-clientes-y-cotizaciones.sql`
- `migrations/003-contratos-y-caja.sql`
- `migrations/004-ordenes-trabajo-checklists.sql`
- `migrations/005-bodega-materiales.sql`
- `migrations/006-garantias-y-reclamos.sql`

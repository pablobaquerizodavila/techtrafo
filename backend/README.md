# TECHTRAFO Backend API

Backend Node.js + Express + TypeScript + Prisma.

## Filosofía de migrations

**Prisma se usa como cliente (query builder + tipos generados), NO como motor de migrations.**

- Las migrations son SQL puro en `../database/migrations/`.
- `prisma/schema.prisma` se regenera con `prisma db pull` cuando cambia el schema de la DB.
- **Nunca correr** `prisma migrate dev` ni `prisma db push` — escriben sobre la DB sin pasar por nuestro flujo de migrations SQL.

## Desarrollo local (vía Docker Compose)

Desde la raíz del repo:

```bash
# Levantar todo el stack incluyendo el API
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Logs del API
docker compose -f infrastructure/docker/docker-compose.yml logs -f api

# Generar schema Prisma desde la DB (post primer arranque o cuando hay nueva migration)
docker exec techtrafo-api npx prisma db pull
docker exec techtrafo-api npx prisma generate

# Reiniciar el API
docker compose -f infrastructure/docker/docker-compose.yml restart api
```

## Endpoints actuales

| Método | Ruta          | Descripción                                |
|--------|---------------|--------------------------------------------|
| GET    | `/api/health` | Estado del servicio y conexión a la DB     |

## Estructura

```
backend/
├── Dockerfile.dev        # imagen de desarrollo con hot reload
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma     # generado por `prisma db pull`
└── src/
    ├── server.ts         # entrypoint Express
    ├── config/env.ts     # validación de env vars con zod
    ├── db/client.ts      # Prisma client singleton
    └── routes/health.ts  # GET /api/health
```

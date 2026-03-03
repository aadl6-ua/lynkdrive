# LynkDrive Monorepo

Monorepo del TFG con `npm workspaces`, siguiendo las decisiones de `agents.md`:

- `apps/api`: backend NestJS (API-first)
- `apps/mobile`: app Expo (iOS/Android/Web)
- `packages/shared`: tipos y DTOs compartidos
- `infra`: docker y SQL/migraciones

## Estructura

```text
lynkdrive/
  apps/
    api/
    mobile/
  packages/
    shared/
  infra/
    docker/
    db/
      migrations/
  docs/
```

## Arranque rápido

1) Instalar dependencias:

```bash
npm install
```

2) Levantar PostgreSQL + PostGIS local:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

3) Variables de entorno del backend:

```bash
cp apps/api/.env.example apps/api/.env
```

4) Iniciar backend:

```bash
npm run dev:api
```

5) Iniciar app Expo:

```bash
npm run dev:mobile
```

Alternativa (ambos en paralelo, recomendado):

```bash
npm run dev
```

## Qué ver corriendo y dónde

- API NestJS saludable en:

```text
http://localhost:3000/api/health
```

- Expo dev server en terminal (QR + URL local, típicamente `http://localhost:8081`).
- Si abres en web desde Expo (`w` en terminal), la app suele abrir en `http://localhost:19006`.

## Comandos útiles

```bash
npm run build
npm run lint
npm run test
```

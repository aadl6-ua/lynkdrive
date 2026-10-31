# Recorrido e2e en navegador

`recorrido.mjs` recorre con Playwright la app web (Expo) y el panel admin sobre un entorno
local: tres usuarios nuevos (propietaria en móvil 390x844, conductor en escritorio 1440x900 y
segundo conductor en móvil) y una cuenta admin. Cubre registro con aceptación legal,
documentos, verificación en el admin, alta de coche con fotos y disponibilidad, Explorar con fechas,
dirección, filtros y mapa, dos solicitudes solapadas (al aceptar una, la otra pasa a
rechazada), pago en modo prototipo, checklists de entrega y devolución con fotos, inicio y
fin del viaje, reseñas cruzadas, Mis ingresos, moderación en el admin (incidencia con nota,
ocultar reseña, retirar vehículo, bloquear usuario), exportar datos y borrar cuenta.

Guarda una captura por paso en `OUT_DIR` y termina con código 1 si falla un paso o si hay
errores de consola de la app (no cuentan las teselas del mapa sin internet ni las respuestas
HTTP con error, que ya se comprueban en la UI). Cada ejecución usa emails, teléfonos y
matrícula nuevos, así que se puede repetir sin limpiar la BD.

## Entorno

Todo en local, sin Supabase ni internet (los mocks sustituyen Auth, Storage y Nominatim).
Desde la raíz del repo, cada servicio en su terminal:

```bash
# 1. Postgres + PostGIS con el esquema y las migraciones
docker run -d --name ld-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lynkdrive_dev -p 55432:5432 postgis/postgis:15-3.4
export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/lynkdrive_dev
psql "$DATABASE_URL" -f apps/api/test/e2e/schema.sql
for f in infra/db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# Variables comunes (mock, API y recorrido)
export SUPABASE_JWT_SECRET=un-secreto-local-cualquiera-de-32-caracteres
export SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=mock
export NOMINATIM_BASE_URL=http://localhost:54330 PUSH_NOTIFICATIONS_ENABLED=false
unset STRIPE_SECRET_KEY            # pagos en modo prototipo

# 2. Mocks de Supabase (Auth + Storage) y de Nominatim
node scripts/dev/supabase-local-mock.js
node scripts/e2e-web/nominatim-mock.js

# 3. API en :3000
npm run start:dev -w @lynkdrive/api

# 4. App web en :8081 y panel admin en :5173
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:3000/api \
  EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=mock npx expo start --web
cd apps/admin && VITE_API_URL=http://localhost:3000/api \
  VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=mock npx vite --port 5173

# Opcional: datos demo (6 usuarios, 8 coches, reservas en todos los estados)
DEMO_PASSWORD='una-contraseña' node scripts/seed-demo.js
```

El mock de Supabase guarda las contraseñas solo en memoria: si se reinicia, hay que volver a
registrar los usuarios (el recorrido siempre crea los suyos).

## Ejecutar

Necesita Playwright con Chromium (`npx -y -p playwright@1 ...` si no está instalado):

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/lynkdrive_dev \
  node scripts/e2e-web/recorrido.mjs
```

Variables: `WEB_URL` (`http://localhost:8081`), `ADMIN_URL` (`http://localhost:5173`),
`SUPABASE_URL` (el mock, `http://localhost:54321`), `DATABASE_URL` (solo para dar el rol admin
a la cuenta del recorrido; se niega a usar una BD de Supabase), `OUT_DIR`
(`e2e-web-output`) y `HEADED=1` para ver el navegador. Tarda unos 5 minutos.

# AGENTS.md — Reglas del Proyecto TFG: Plataforma P2P de Alquiler de Vehículos

> Este archivo define las reglas, convenciones y contexto técnico del proyecto para cualquier agente de IA o desarrollador que trabaje en él. Léelo antes de tocar cualquier fichero.
>Cualquier decisión tomada durante el desarrollo por que no esté especificada en este documento deberá ser añadida para mantener la consistencia usando la misma solución en todas sus partes.

## Decisiones Cerradas (2026-03-03)

- **Estructura del repositorio:** monorepo.
- **Package manager del monorepo:** **npm workspaces**.
- **Prioridad de arranque:** estándar industria para productos API-First: **backend y contrato API primero**, frontend en paralelo contra endpoints estables.
- **Alcance Demo 1:**
    - Todo el bloque **MUST HAVE**.
    - Del bloque **SHOULD HAVE** también entran: **gestión de cancelaciones**, **filtros avanzados** y **panel "Mis ingresos"**.
- **Prioridades futuras (fuera de Demo 1):** **backoffice administrativo** y **automatización de emails**.
- **Fechas y horas:** almacenamiento y lógica interna en **UTC**; presentación en frontend para usuario final en **Europe/Madrid**.
- **Subida de imágenes (2026-03-11):** flujo estándar en dos pasos `upload -> create/update` (nunca BLOB en DB).
- **Auth vertical inicial (2026-03-11):** backend con guard JWT Supabase + endpoints `GET/PUT /users/me`; frontend con sesión Supabase (`signIn/signUp/signOut`) y uso de `/users/me` cuando hay token.
- **Reinicio frontend mobile (2026-03-20):** se elimina la implementación previa y se reinicia desde una base mínima limpia (app shell + tabs + pantallas placeholder por feature) para reconstrucción incremental orientada a producto.
- **Geocoding de ubicaciones (2026-03-25):** para crear vehículo y filtros geoespaciales de exploración se usa endpoint backend `GET /api/geocoding/search` (provider Nominatim) para evitar introducir lat/lng manualmente en la UI.
- **RGPD (2026-10-30):** `GET /api/users/me/export` devuelve en JSON todos los datos del usuario autenticado; `DELETE /api/users/me` anonimiza el perfil (soft-delete), retira vehículos, borra ficheros personales de Storage y elimina la cuenta en Supabase Auth con service role. Se rechaza con 409 si hay reservas activas (`pending`, `accepted`, `paid_confirmed`, `in_progress`); las finalizadas se conservan sin datos personales. Los logs HTTP no incluyen query string. La comprobación de reservas activas se hace dentro de la transacción de baja con `FOR UPDATE` sobre las reservas. Los scripts no muestran respuestas crudas de auth ni pasan contraseñas como argumentos de proceso.
- **Lógica de reservas y BD (2026-10-30):** (1) al aceptar una reserva, la API la acepta y rechaza (`rejected`) las `pending` solapadas del mismo vehículo en una única transacción, bloqueando la fila del vehículo (`FOR UPDATE`) para evitar carreras; (2) los solapes en API usan el colchón de 2h (`HANDOVER_BUFFER_HOURS`) a ambos lados: chocan si `inicio < fin_otra + 2h` y `fin + 2h > inicio_otra`; (3) la búsqueda usa `location::geography`, con índice GiST funcional `idx_vehicles_location_geography` (migración `202603010100`); (4) esquema base reproducible en `infra/db/migrations/202603010000_baseline_schema.sql` (idempotente); (5) los scripts de smoke requieren tokens JWT; `smoke_vehicle_images_availability.sh` usa `OWNER_TOKEN`, comprueba el 401 sin token y borra su vehículo de prueba al terminar.
- **Auth global mobile (2026-04-20):** app en modo `auth-first` estricto: sin sesión no se renderizan tabs ni features; el acceso ocurre en pantalla inicial de login/register con alta de perfil mínimo (`first_name`, `last_name`, `phone_number`) durante registro.
- **Flujo transaccional Mis Viajes (2026-04-21):** se unifica en UI `lista -> detalle` por reserva, con acciones por rol/estado según backend. Decisión de pago para demo: en `accepted` (driver) mostrar botón `Pago (a implementar en el futuro)` + acción separada `Marcar pago confirmado (demo)` para avanzar a `paid_confirmed` sin pasarela real.
- **Mis Viajes UX operacional (2026-04-21):** checklists operan en subpantalla dedicada y permiten subida/borrado de evidencias fotográficas mediante `uploads -> checklist-images` sobre bucket privado `checklists`. Se muestra aviso legal/recomendación de evidencia en editor de checklist.
- **Reglas de visibilidad por estado (2026-04-21):** acciones no válidas se ocultan cuando aplica y se muestran motivos explícitos de bloqueo (ej. checklists fuera de fase o reseña antes de `completed`).
- **Reseñas en reservas (2026-04-21):** en Mis Viajes no se listan reseñas; solo se permite acción de emitir reseña cuando procede y el contenido queda consultable desde Perfil.
- **Pagos con Stripe Connect en modo test (2026-10-30):**
    - Doble modo según backend: con `STRIPE_SECRET_KEY` → modo `stripe`; sin ella → modo `prototype` (comportamiento demo intacto: botón `Pagar` que pasa la reserva a `paid_confirmed` sin pasarela). La app consulta `GET /api/payments/config` para saber el modo; si falla asume `prototype`.
    - Propietarios: cuentas **Connect Express** (`country` = `STRIPE_CONNECT_COUNTRY`, por defecto `ES`). El id `acct_...` se guarda en `users.stripe_account_id` (migración `202610301200_stripe_connect_accounts.sql`). El estado de onboarding **no se persiste**: se consulta en vivo a Stripe (`GET /api/payments/connect/status`).
    - Cobro al conductor: **destination charge** (`transfer_data.destination` = cuenta del propietario) con `application_fee_amount` = `STRIPE_APPLICATION_FEE_PERCENT` % del total (por defecto 10). Si el propietario no tiene la capability `transfers` activa, se cobra solo a la plataforma (sin destino) y se registra aviso; la transferencia queda pendiente manual.
    - PaymentIntents con `automatic_payment_methods.allow_redirects = 'never'` (sin métodos con redirección; no hace falta `returnURL` en la app).
    - Confirmación `accepted -> paid_confirmed`: por webhook `payment_intent.succeeded` (fuente de verdad) y, como respaldo, por `POST /payments/bookings/:id/confirm` que verifica el intent en Stripe. Ambos son idempotentes (`UPDATE ... WHERE status = 'accepted'`).
    - En modo `stripe` se prohíbe al conductor pasar a `paid_confirmed` vía `PUT /bookings/:id/status` (solo en `prototype`).
    - Reembolsos al cancelar desde `paid_confirmed` (antes del inicio, según máquina de estados): cancela propietario → 100%; cancela conductor → política Demo 1 (>=48h 100%, 24-48h 50%, <24h 0%). Se hace con `reverse_transfer` + `refund_application_fee` si fue destination charge y con idempotency key por reserva. Si Stripe falla, la cancelación no se aplica. En `prototype` no hay reembolsos.
    - Mobile: pago real con **PaymentSheet** de `@stripe/stripe-react-native` (versión fijada por Expo SDK, incluida en Expo Go), cargado de forma diferida en `stripeSheet.native.ts`; en web se muestra aviso (pago con tarjeta solo en app iOS/Android). UI nueva aislada en `apps/mobile/src/features/payments/` (`PaymentAction`, `OwnerPayoutsCard`); la tarjeta de cobros de Perfil solo aparece en modo `stripe`.

---

- **Panel Mis ingresos (2026-10-31):**
    - Endpoint `GET /api/earnings/mine` (JWT; solo reservas de vehículos cuyo `owner_id` es el `sub`, incluidos vehículos con soft-delete). Módulo `apps/api/src/earnings` de solo lectura.
    - Cuentan solo reservas `paid_confirmed`, `in_progress` y `completed`. Las `cancelled` no cuentan (aunque tuvieran reembolso parcial): el importe reembolsado no se persiste en BD, así que no se puede calcular de forma fiable.
    - Importes: bruto = `total_price`; comisión = `platform_fee` si es > 0, si no `STRIPE_APPLICATION_FEE_PERCENT` % del bruto (misma regla que la `application_fee` de Stripe Connect; se aplica también en `prototype` como estimación); neto = bruto - comisión. Cálculo en céntimos.
    - Periodos (`summary.currentMonth`, `previousMonth`, `currentYear`, `total`) naturales en **Europe/Madrid**, imputando cada reserva por su `start_datetime`, siempre sobre todas las reservas (no les afecta el rango).
    - Filtro opcional `from`/`to` (ISO o `YYYY-MM-DD`; `to` sin hora incluye el día completo en UTC) sobre `start_datetime`: afecta a `rangeTotals`, `byVehicle` y `bookings`. Fechas inválidas o `from > to` → 400.
    - Respuesta: `{ currency: 'EUR', timeZone, mode, feePercent, range, summary, rangeTotals, byVehicle[], bookings[] }`; cada reserva incluye fechas, vehículo, conductor resumido (`displayName` = nombre + inicial del apellido), bruto, comisión, neto, `status` y `payoutStatus`.
    - Mobile: tarjeta "Mis ingresos" en Mis Vehículos que abre pantalla secundaria full-view `apps/mobile/src/features/earnings/EarningsScreen.tsx` (volver + back de Android), con tarjetas de resumen, selector de rango (Todo / 90 días / Este año), desglose por vehículo e historial; skeleton, vacío con CTA "Publicar vehículo", error con reintentar y pull-to-refresh. En `prototype` muestra aviso de que no se mueve dinero real.

---

## 1. Descripción del Proyecto

Plataforma **peer-to-peer (P2P) de alquiler de vehículos entre particulares**, orientada al mercado europeo. El objetivo es un MVP funcional que permita:

- Publicar vehículos con disponibilidad y geolocalización.
- Buscar vehículos cercanos por radio geoespacial.
- Gestionar reservas en **dos fases** (solicitud → pago).
- Operativa de "llaves en mano" con checklists digitales.
- Sistema de valoraciones cruzadas post-viaje.
- Cobros a conductores y pagos a propietarios mediante **Stripe Connect**.

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React Native + Expo (Web + iOS + Android desde un único codebase TypeScript) |
| **Estilos** | NativeWind |
| **Estado global** | Zustand |
| **HTTP Client** | Axios (con interceptores JWT) |
| **Backend** | NestJS (Node.js, TypeScript) |
| **ORM** | TypeORM |
| **Base de datos** | PostgreSQL + extensión PostGIS |
| **Auth** | Supabase Auth (JWT) — NestJS solo valida, nunca emite tokens |
| **Storage de ficheros** | Supabase Storage |
| **Pagos** | Stripe Connect |
| **DB Hosting** | Supabase (DBaaS puro — RLS y Data API **desactivados**) |
| **Backend Hosting** | Render (Free Tier) |
| **Frontend Web Hosting** | Vercel |
| **Mobile Builds** | Expo EAS Build |

---

## 3. Arquitectura General

### Estructura frontend mobile (convención)
- `App.tsx` actúa como **composition root**: navegación de alto nivel, hidratación inicial y wiring de pantallas.
- Organización por feature en `apps/mobile/src/features/*` (ej.: `explore`, `trips`, `profile`, `vehicles`).
- Componentes transversales de app shell en `apps/mobile/src/app/*` (tabs, layout, estilos compartidos, tipos base).
- Utilidades compartidas y helpers puros en `apps/mobile/src/shared/*`.
- Evitar volver a concentrar lógica de negocio/UI de múltiples dominios en un único `App.tsx` monolítico.

### API-First Centralizada
- Supabase se usa **exclusivamente como proveedor de PostgreSQL gestionado** (DBaaS). No se usan sus APIs REST auto-generadas ni RLS públicas.
- Toda la lógica de negocio reside en **NestJS** (Módulos, Controladores, Servicios, Guards).
- El frontend consume únicamente la API REST de NestJS, nunca la de Supabase directamente.

### Autenticación
- Registro y login gestionados por **Supabase Auth**.
- NestJS valida los JWT entrantes mediante **guard propio** (`jose`) con JWKS de Supabase (o HMAC `SUPABASE_JWT_SECRET` en entornos legacy) y no emite credenciales propias.
- Un **Trigger SQL** en PostgreSQL replica automáticamente los datos básicos del usuario desde `auth.users` hacia la tabla pública `users` al registrarse.
- Flujo de alta obligatorio en frontend:
    - paso 1: credenciales (`email` + `password`),
    - paso 2: perfil mínimo (`first_name`, `last_name`, `phone_number`) antes de habilitar uso transaccional.
- Regla de acceso transaccional (cerrada 2026-03-20):
    - para solicitar/gestionar reservas y operaciones asociadas (`bookings`, `payments`, `booking-checklists`, `checklist-images`, `reviews`) el usuario debe estar **verificado documentalmente** (`is_verified = true`).
    - si no está verificado, la UI debe bloquear la acción y redirigir a completar documentación en Perfil.

### Regla operativa sobre `users` (importante)

- El flujo **canónico** de alta de usuario es: **Supabase Auth -> trigger SQL -> tabla `public.users`**.
- El backend NestJS **no debe** crear usuarios como mecanismo principal de registro público.
- Los endpoints `POST /users`, `PUT /users/:id`, `DELETE /users/:id` quedan reservados para:
    - soporte de desarrollo,
    - tareas administrativas controladas,
    - pruebas manuales/integración.
- Para producto final, las operaciones de perfil de usuario autenticado deben exponerse como endpoints tipo `GET/PUT /users/me` validados por JWT (claim `sub`) para impedir acceso/edición de terceros.
- En cualquier implementación de perfil, respetar siempre **soft-delete** (`deleted_at`) y no realizar borrado físico de `users`.

### Nota temporal de desarrollo (pre-auth)

- Estado actual: ya existe integración inicial de auth real en frontend/backend y ya se usan `GET/PUT /users/me` para perfil autenticado.
- Frontend mobile actualizado a flujo auth-first: eliminado selector manual de "usuario activo" en UI.
- Ownership por `sub` ya aplicado en backend para mutaciones de:
    - `vehicles`
    - `vehicle-images`
    - `vehicle-availability-windows`
- Deuda técnica pendiente: extender el mismo enfoque auth-first y ownership a dominios restantes (bookings, reviews, checklists, pagos) con UX final.

### Ficheros / Storage
- **No** se almacenan BLOBs en PostgreSQL. Solo se guardan URLs (`VARCHAR(255)`).
- Las imágenes se comprimen en cliente (Expo Web + iOS + Android) antes de subir usando `expo-image-manipulator`:
    - Conversión a JPEG.
    - Redimensionado + compresión iterativa.
    - Objetivo por target:
        - `avatar`: <= 500 KB.
        - `vehicle_image`, `id_document`, `driver_license`, `checklist_image`: <= 2 MB.
    - Si no se puede bajar del límite, el frontend aborta la subida antes de llamar al backend.
- Cuatro buckets en Supabase Storage:
  - `vehicles` — Público | Límite 2 MB | JPEG, PNG, WEBP
  - `avatars` — Público | Límite 500 KB | JPEG, PNG, WEBP
    - `documents` — Privado | Límite 2 MB | JPEG, PNG, WEBP
  - `checklists` — **Privado** | Límite 2 MB | Acceso mediante Signed URLs temporales generadas por NestJS

### Contrato de auth (implementado)

- Backend:
    - `GET /api/users/me` (JWT requerido)
    - `PUT /api/users/me` (JWT requerido)
    - Guard: `SupabaseJwtAuthGuard` con claim `sub` como identidad canónica.
    - Mutaciones con ownership (JWT + validación de propietario):
        - `POST /api/vehicles`
        - `PUT /api/vehicles/:id`
        - `DELETE /api/vehicles/:id`
        - `GET /api/vehicles/mine/list`
        - `POST /api/vehicle-images`
        - `PUT /api/vehicle-images/:id`
        - `DELETE /api/vehicle-images/:id`
        - `POST /api/vehicle-availability-windows`
        - `PUT /api/vehicle-availability-windows/:id`
        - `DELETE /api/vehicle-availability-windows/:id`
    - Bookings (JWT requerido + acceso solo owner/driver participante):
        - `POST /api/bookings` (driver crea solicitud en `pending`)
        - `GET /api/bookings/mine/as-driver`
        - `GET /api/bookings/mine/as-owner`
        - `GET /api/bookings/vehicle/:vehicleId` (visibilidad de reservas del vehículo en ficha)
        - `GET /api/bookings/:id`
        - `PUT /api/bookings/:id/status`
    - Booking checklists (JWT requerido + acceso solo participantes del booking):
        - `GET /api/booking-checklists?bookingId=...`
        - `GET /api/booking-checklists/:id`
        - `POST /api/booking-checklists`
        - `PUT /api/booking-checklists/:id`
        - `DELETE /api/booking-checklists/:id`
        - Reglas implementadas:
            - `submittedBy` se fija con el usuario autenticado.
            - `fuelLevel` validado entre `0` y `100`.
            - unicidad `(booking_id, type)` controlada (conflict si ya existe ese tipo para el booking).
    - Checklist images (JWT requerido + acceso solo participantes del booking asociado):
        - `GET /api/checklist-images?checklistId=...`
        - `GET /api/checklist-images/:id`
        - `POST /api/checklist-images`
        - `DELETE /api/checklist-images/:id`
    - Reviews (JWT requerido + acceso por participación en booking):
        - `GET /api/reviews?bookingId=...`
        - `GET /api/reviews/:id`
        - `POST /api/reviews`
        - `PUT /api/reviews/:id`
        - `DELETE /api/reviews/:id`
        - Reglas implementadas:
            - solo se permite crear review con booking en estado `completed`.
            - `reviewerId` se deriva del JWT.
            - `revieweeId` debe ser la otra parte del booking.
            - `rating` entero entre `1` y `5`.
            - unicidad `(booking_id, reviewer_id)` respetada.
    - Payments MVP (JWT requerido; enfoque incremental):
        - `GET /api/payments/bookings/:bookingId` (estado de pago)
        - `POST /api/payments/bookings/:bookingId/intent` (crear/reutilizar payment intent)
        - `POST /api/payments/bookings/:bookingId/confirm` (confirmar pago y mover booking a `paid_confirmed`)
        - Restricciones actuales:
            - solo el `driver` del booking puede ejecutar acciones de pago.
            - creación/confirmación solo desde booking `accepted`.
        - Modo de ejecución actual:
            - con `STRIPE_SECRET_KEY`: usa Stripe PaymentIntents reales.
            - sin `STRIPE_SECRET_KEY`: fallback de prototipo (`mode: prototype`) para no bloquear pruebas de flujo.
        - Stripe Connect (2026-10-30):
            - `GET /api/payments/config` (modo `stripe`/`prototype` + `publishableKey`)
            - `GET /api/payments/connect/status` (estado de la cuenta Express del usuario)
            - `POST /api/payments/connect/onboarding-link` (crea cuenta Express si no existe + Account Link)
            - `POST /api/payments/connect/dashboard-link` (login link al panel Express)
            - `POST /api/payments/webhook` (público, sin JWT; firma verificada con `STRIPE_WEBHOOK_SECRET` sobre raw body)
            - `GET /api/payments/connect/return` y `/refresh` (páginas públicas de retorno del onboarding)
            - Reembolsos automáticos al cancelar desde `paid_confirmed` (ver Decisiones Cerradas).
    - Earnings (JWT requerido; solo datos del propietario autenticado):
        - `GET /api/earnings/mine?from=...&to=...` (resumen por periodos, desglose por vehículo e historial por reserva; ver Decisiones Cerradas)
- Frontend mobile:
    - Cliente Supabase (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
    - Gestión de sesión: `hydrateSession`, `signIn`, `signUp`, `signOut`.
    - Cuando hay sesión activa, el perfil usa `/users/me` en lugar de `/users/:id`.

### Trigger obligatorio auth -> users

- Debe existir un trigger en base de datos sobre `auth.users` que inserte en `public.users` al registrarse.
- Ubicación de migración: `infra/db/migrations/202603112235_auth_users_sync_trigger.sql`.
- La migración incluye:
    - función `public.handle_auth_user_created()`
    - trigger `on_auth_user_created` (`AFTER INSERT ON auth.users`)
    - backfill para usuarios ya existentes en `auth.users` sin fila en `public.users`.

### Ejecución de migraciones SQL (convención de este repo)

- Las migraciones versionadas del proyecto viven en `infra/db/migrations`.
- Script oficial de ejecución remota: `npm run db:migrate:remote`.
- El runner aplica `.sql` pendientes en orden y registra histórico en `public.app_migrations`.
- `supabase db push` por defecto inspecciona `supabase/migrations`; por tanto, si no se replica esa ruta, puede responder "up to date" aunque haya SQL nuevo en `infra/db/migrations`.
- Flujo operativo recomendado cuando la migración está en `infra/db/migrations`:
    1. Obtener `DATABASE_URL` del entorno backend (`apps/api/.env`).
    2. Ejecutar el SQL de migración directamente contra la BD remota (psql o script Node `pg`).
    3. Verificar efecto (ejemplo en auth trigger):
         - existe trigger `on_auth_user_created` en `auth.users`.
         - no quedan filas huérfanas `auth.users` sin `public.users`.

- Si se quiere usar Supabase CLI puro (`supabase db push`) como canal único, hay que mover/duplicar migraciones a `supabase/migrations` y mantener esa ruta como fuente oficial.

### Variables de entorno para auth (backend)

- `SUPABASE_URL`
- `SUPABASE_JWKS_URL`
- `SUPABASE_JWT_AUDIENCE` (por defecto `authenticated`)
- `SUPABASE_JWT_SECRET` (opcional/legacy en proyectos HS256)

### Contrato de subida (implementado)

- Endpoint backend: `POST /api/uploads/images/:target` con `multipart/form-data` y campo de archivo `file`.
- Targets permitidos: `avatar`, `id_document`, `driver_license`, `vehicle_image`, `checklist_image`.
- Campo opcional en body: `ownerId` (se usa para generar la ruta interna del objeto).
- Respuesta de subida: `{ bucket, path, publicUrl, signedUrl, fileUrl, persistedValue, isPublicBucket, mimeType, sizeBytes }`.
- El frontend debe seguir siempre este patrón:
    1. Subir fichero al endpoint de uploads.
    2. Guardar siempre `persistedValue` en DB.
    3. Usar `fileUrl` solo para previsualizacion inmediata (si el bucket es privado, es temporal).

### Variables de entorno para uploads (backend)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_VEHICLES_BUCKET` (por defecto `vehicles`)
- `SUPABASE_STORAGE_AVATARS_BUCKET` (por defecto `avatars`)
- `SUPABASE_STORAGE_DOCUMENTS_BUCKET` (por defecto `documents`)
- `SUPABASE_STORAGE_USER_DOCS_BUCKET` (compatibilidad legacy)
- `SUPABASE_STORAGE_CHECKLISTS_BUCKET` (por defecto `checklists`)
- `SUPABASE_STORAGE_VEHICLES_PUBLIC` (por defecto `true`)
- `SUPABASE_STORAGE_AVATARS_PUBLIC` (por defecto `true`)
- `SUPABASE_STORAGE_DOCUMENTS_PUBLIC` (por defecto `false`)
- `SUPABASE_STORAGE_CHECKLISTS_PUBLIC` (por defecto `false`)
- `SUPABASE_SIGNED_URL_TTL_SECONDS` (por defecto `3600`)

### Geocoding de direcciones (Nominatim)

- Endpoint backend implementado para frontend mobile:
    - `GET /api/geocoding/search?query=...&limit=...&country=...`
- La app mobile debe consultar este endpoint para seleccionar dirección real y usar sus coordenadas resultantes.
- Se evita exponer llamadas directas a Nominatim desde frontend para mantener control de rate-limit y configuración centralizada.

### Variables de entorno para geocoding (backend)

- `NOMINATIM_BASE_URL` (por defecto `https://nominatim.openstreetmap.org`)
- `NOMINATIM_DEFAULT_COUNTRY_CODES` (por defecto `es`)
- `NOMINATIM_USER_AGENT` (identificador obligatorio para requests HTTP a Nominatim)
- `NOMINATIM_TIMEOUT_MS` (por defecto `3500`)

### Scripts de smoke (actualizados)

- `scripts/smoke_bookings.sh`
    - valida flujo base de bookings y transiciones principales.
- `scripts/smoke_payments_checklists_reviews.sh`
    - valida flujo extendido end-to-end:
        1. crea vehiculo + disponibilidad,
        2. crea booking y lo acepta,
        3. prueba payments MVP (`/payments/.../intent` y `/payments/.../confirm`),
        4. crea/lista checklists,
        5. crea/lista checklist images,
        6. completa booking,
        7. crea/lista reviews y valida unicidad por `(booking_id, reviewer_id)`.
    - Requiere `OWNER_TOKEN` y `DRIVER_TOKEN` exportados.
    - Compatible con ambos modos de payments:
        - Stripe real (`STRIPE_SECRET_KEY` presente),
        - fallback prototipo (`STRIPE_SECRET_KEY` ausente).

### Tests automatizados y CI (2026-10-30)

- Tests unitarios (Jest + `@nestjs/testing`) junto al código: `apps/api/src/**/*.spec.ts`, con repositorios mockeados. Ejecutar con `npm test`.
- Tests e2e de la API en `apps/api/test/*.e2e-spec.ts` contra Postgres + PostGIS real:
    - recrean el esquema desde `apps/api/test/e2e/schema.sql` (copia de `script.sql` + stub mínimo de `auth.users`) y aplican después todas las migraciones de `infra/db/migrations`.
    - la auth se prueba con JWT HS256 firmados con un secreto de test (`SUPABASE_JWT_SECRET` ficticio), sin credenciales reales de Supabase; pagos en modo prototipo.
    - BD por defecto `postgresql://postgres:postgres@localhost:55432/lynkdrive_test` (sobrescribible con `TEST_DATABASE_URL`). Ejecutar con `npm run test:e2e`. **Destruyen el esquema de esa BD**: nunca apuntar a Supabase.
- Si se cambia el esquema base, actualizar también `apps/api/test/e2e/schema.sql`.
- CI en `.github/workflows/ci.yml` (push/PR a `main` y `dev`): `npm ci`, lint, typecheck de todos los workspaces, build de api/shared, tests unitarios y e2e con servicio `postgis/postgis`.
- Reglas reforzadas en backend tras añadir tests:
    - al aceptar una reserva se valida que no haya solape con reservas confirmadas y las `pending` solapadas pasan a `rejected`.
    - `POST /booking-checklists` valida fase: `check_in` solo con booking `paid_confirmed`/`in_progress`/`completed`; `check_out` solo con `in_progress`/`completed`.

---

## 4. Base de Datos

### Esquema Completo (fuente: `script.sql`)

- `script.sql` representa el esquema base de referencia.
- Cambios incrementales posteriores (por ejemplo trigger `auth.users -> public.users`) se reflejan en `infra/db/migrations/*.sql` y se aplican con `npm run db:migrate:remote`.

```sql
-- ==========================================
-- 1. EXTENSIONES Y TIPOS (ENUMS)
-- ==========================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE fuel_type_enum AS ENUM ('gasoline', 'diesel', 'electric', 'hybrid');
CREATE TYPE transmission_enum AS ENUM ('manual', 'automatic');
CREATE TYPE vehicle_status_enum AS ENUM ('active', 'inactive');

CREATE TYPE booking_status_enum AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'paid_confirmed',
    'in_progress',
    'completed',
    'cancelled'
);
CREATE TYPE checklist_type_enum AS ENUM ('check_in', 'check_out');

CREATE TYPE payout_status_enum AS ENUM ('pending', 'processing', 'paid', 'failed');


-- ==========================================
-- 2. CREACIÓN DE TABLAS
-- ==========================================

-- Tabla 1: Usuarios
CREATE TABLE users (
    id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) UNIQUE,
    avatar_url VARCHAR(255),
    id_document_url VARCHAR(255),
    driver_license_url VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    stripe_customer_id VARCHAR(100),
    stripe_account_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Tabla 2: Vehículos
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year INTEGER NOT NULL,
    license_plate VARCHAR(20) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    price_per_day NUMERIC(10, 2) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    location_address VARCHAR(255) NOT NULL,
    fuel_type fuel_type_enum,
    transmission transmission_enum,
    seats INTEGER,
    status vehicle_status_enum DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_vehicles_location ON vehicles USING GIST(location);

-- Tabla 3: Imágenes de Vehículos
CREATE TABLE vehicle_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    image_url VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Tabla 4: Ventanas de Disponibilidad (Whitelist)
CREATE TABLE vehicle_availability_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_dates CHECK (end_datetime >= start_datetime)
);

CREATE INDEX idx_availability_dates ON vehicle_availability_windows(start_datetime, end_datetime);

-- Tabla 5: Reservas
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    price_per_day_at_booking NUMERIC(10, 2) NOT NULL,
    platform_fee NUMERIC(10, 2) DEFAULT 0 NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    status booking_status_enum DEFAULT 'pending' NOT NULL,
    payment_intent_id VARCHAR(100),
    stripe_transfer_id VARCHAR(100),
    payout_status payout_status_enum DEFAULT 'pending' NOT NULL,
    owner_contact_method VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_booking_times CHECK (end_datetime > start_datetime)
);

-- Tabla 6: Checklist "Llaves en Mano"
CREATE TABLE booking_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    type checklist_type_enum NOT NULL,
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    mileage INTEGER NOT NULL,
    fuel_level INTEGER NOT NULL CHECK (fuel_level >= 0 AND fuel_level <= 100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(booking_id, type)
);

-- Tabla 7: Imágenes de Evidencia
CREATE TABLE checklist_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES booking_checklists(id) ON DELETE CASCADE,
    image_url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Tabla 8: Sistema de Reputación
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(booking_id, reviewer_id)
);
```

### Decisiones de Diseño Clave

- **Snapshot financiero**: `bookings` congela `price_per_day_at_booking`, `platform_fee` y `total_price` en el momento de la transacción. Cambios futuros en el precio del vehículo no afectan reservas pasadas.
- **Soft-delete**: `users` y `vehicles` tienen `deleted_at TIMESTAMP WITH TIME ZONE`. Los registros borrados se filtran con `WHERE deleted_at IS NULL`. Nunca se eliminan físicamente para preservar auditorías.
- **ON DELETE RESTRICT** en `bookings → vehicles` y `bookings → users`: el motor impide borrar un vehículo o usuario con historial transaccional.
- **ON DELETE CASCADE** en entidades dependientes: `vehicle_images`, `checklist_images`, `booking_checklists`.
- **Índice espacial GIST** sobre `vehicles.location` para que `ST_DWithin` opere en O(log n) en vez de O(n).
- **Pago distribuido (Stripe Connect)**: `payment_intent_id` rastrea el cobro al conductor; `stripe_transfer_id` + `payout_status` rastrean el pago al propietario.
- **`synchronize: false` en TypeORM en producción**. Solo se aplican migraciones SQL controladas. `synchronize: true` únicamente en local.

---

## 5. Máquina de Estados de `booking_status`

```
pending → accepted → paid_confirmed → in_progress → completed
        ↘ rejected
accepted → cancelled        (antes del pago)
paid_confirmed → cancelled  (antes del inicio del viaje)
```

| Estado | Descripción |
|---|---|
| `pending` | Conductor solicita reserva. Esperando al propietario. |
| `accepted` | Propietario acepta. Se revela `owner_contact_method`. Se habilita el botón de pago. |
| `rejected` | Propietario rechaza la solicitud. |
| `paid_confirmed` | Conductor paga. Reserva confirmada definitivamente. |
| `in_progress` | Checklist de check-in completado. Viaje activo. |
| `completed` | Checklist de check-out completado. Viaje finalizado. |
| `cancelled` | Cancelada antes del inicio del viaje. |

### Reglas de Disponibilidad y Solapes (cerradas)

- **No se permiten solapes en absoluto** entre reservas confirmadas del mismo vehículo.
- **Bloqueo operativo adicional:** cada reserva bloquea el intervalo real de alquiler **más 2 horas al final** para entrega/recogida.
- **Facturación desacoplada del bloqueo:** el precio se calcula **solo con las horas/días reales de alquiler** (`start_datetime` a `end_datetime`), nunca con el colchón operativo de +2h.
- **`pending` no bloquea calendario** para nuevas solicitudes.
- Si existen varias solicitudes `pending` solapadas y una pasa a `accepted`, las demás solicitudes `pending` incompatibles deben pasar automáticamente a `rejected`.

### Política de Cancelación — Demo 1 (cerrada)

- **>= 48h antes del inicio:** cancelación gratuita.
- **< 48h y >= 24h antes del inicio:** reembolso del 50%.
- **< 24h antes del inicio:** sin reembolso.
- En estado **`pending`**, tanto **conductor** como **propietario** pueden cancelar la solicitud (`pending -> cancelled`).

### Calendar UI para Selección de Fechas de Reserva (cerrada 2026-03-31)

**Decisión:** Reemplazar inputs ISO de datetime por un selector visual de calendario con visualización de disponibilidad.

**Especificación:**
- **Rango:** 6 meses en adelante (mes actual + 5 meses subsecuentes), actualizado dinámicamente.
- **Navegación (ajuste UX 2026-03-31):** calendario compacto con **1 mes visible** y navegación por flechas izquierda/derecha (sin scroll largo de múltiples tarjetas).
- **Interacción (ajuste UX 2026-03-31):** dos campos compactos **Desde/Hasta**; al pulsar cada campo se despliega el calendario para seleccionar esa fecha concreta.
- **Coloreado de disponibilidad (basado en `vehicle_availability_windows` + `bookings`):**
  - **Verde:** ≥10 horas continuas disponibles dentro del rango operativo (ventana de disponibilidad - reservas confirmadas - bloqueo operativo +2h).
  - **Naranja:** >0 pero <10 horas disponibles (disponibilidad parcial).
  - **Gris:** Sin disponibilidad (0h) o fecha pasada.
- **Selección:** Tap en día 1 → aparece marca de inicio; tap en día 2 → marca de fin + resalta rango + muestra resumen.
- **Cálculo de disponibilidad:**
  - Intersectar `vehicle_availability_windows` (periodos en que el vehículo está activo).
  - Restar todas las reservas con status != `pending` (es decir, `accepted`, `paid_confirmed`, `in_progress`, `completed`).
  - Sumar +2h adicionales de bloqueo operativo al final de cada reserva confirmada.
  - `pending` bookings **no** restan disponibilidad (pueden solaparse unas con otras).
- **Selector de horas:** Debajo del calendario, mostrar campos para "Desde: [fecha] [HH:00]" y "Hasta: [fecha] [HH:00]" editables con número spinner (9h-20h por defecto).
- **Componente:** `CalendarPicker.tsx` en `apps/mobile/src/features/explore/`.
- **Ubicación en flujo:** Reemplaza los dos `TextInput` ISO en la sección "Solicitar reserva" de `ExploreScreen.tsx`.

**Lógica de bloqueo:**
- Pending bookings ≠ bloquean calendario (pueden tener múltiples pending solapadas sin restricción visual).
- Reservas confirmadas bloquean + 2h operativas (visualizada como gris en días subsecuentes al final de la reserva).
- Overlaps entre confirmadas imposibles (controlado en BD + validación UX).

---

## 6. Funcionalidades por Prioridad (MoSCoW)

### MUST HAVE (MVP bloqueante)
- Registro/login con Supabase Auth (email + contraseña).
- Onboarding post-registro con datos mínimos obligatorios: nombre, apellidos y teléfono.
- Perfil de usuario: nombre, teléfono, avatar, DNI, carnet de conducir.
- Alta de vehículos: marca, modelo, año, matrícula, fotos, descripción, precio/día, ubicación, disponibilidad.
- Búsqueda geoespacial por radio con filtros de fechas y precio máximo.
- Ficha de vehículo + perfil resumido del propietario.
- Flujo de reserva en dos fases (solicitud → aceptación/rechazo → pago con Stripe).
- Operativa checklist: check-in y check-out con kilómetros, combustible y fotos.
- Sistema de valoraciones cruzadas 1-5 estrellas + comentario.
- Aceptación de T&C y Política de Privacidad.

### SHOULD HAVE
- Chat interno en la plataforma.
- Panel "Mis ingresos" para propietarios.
- Emails transaccionales automáticos.
- Gestión de cancelaciones con reglas de reembolso.
- Filtros avanzados (combustible, plazas, transmisión).
- Verificación de identidad (eIDAS / DNIe / Cl@ve).

### COULD HAVE
- Notificaciones Push (Expo).
- Backoffice administrativo.
- Penalizaciones automáticas (sin gasolina al devolver).
- Gamificación por uso de eléctricos.

### WON'T HAVE
- Apertura remota del vehículo (keyless).
- IA para validación automática de daños.
- Facturación para flotas o empresas.
- Precios dinámicos por demanda.
- Soporte por tickets o chat en vivo.

---

## 7. Estructura de Navegación (UX)

Cuatro pestañas principales (Bottom Tab en móvil / Top Nav en escritorio ≥768px):

| Tab | Nombre | Descripción |
|---|---|---|
| 1 | **Explorar** | Listado de vehículos cercanos. Filtros. Acceso a ficha de vehículo. |
| 2 | **Mis Viajes** | Vista conductor (solicitudes enviadas) + vista propietario (solicitudes recibidas, calendario). |
| 3 | **Mis Vehículos** | Alta, edición, fotos y disponibilidad de los propios vehículos. |
| 4 | **Perfil** | Datos personales, documentación, métodos de pago/cobro, legal. |

- **Móvil (< 768px)**: Bottom Tab Navigator.
- **Web/Tablet (≥ 768px)**: Top Navigation Bar o Sidebar lateral.
- Renderizado condicional mediante `Platform.OS` y hooks de dimensiones de Expo.

### Decisión UX — Pantallas secundarias

- Las acciones de detalle/edición (por ejemplo, tocar un vehículo en **Mis Vehículos**) se resuelven como **pantalla secundaria full-view** dentro de la pestaña activa, con botón explícito de **volver**.
- Esta decisión aplica tanto en móvil como en web/tablet para mantener consistencia visual y de flujo durante el MVP.
- En fases posteriores se podrá migrar a navegación stack formal, pero manteniendo el mismo comportamiento funcional.

### Decisión UX/UI — Mapa de pantallas Demo 1 (cerrada 2026-03-20)

> Objetivo: convertir el alcance funcional de MoSCoW en un inventario de pantallas explícito para evitar lagunas de implementación frontend.

#### 1) Flujo de entrada y autenticación

- **Splash / carga inicial**
    - Hidratación de sesión y redirección.
- **Login**
    - Email + contraseña.
    - Acceso a registro y recuperación de contraseña.
- **Registro**
    - Alta con email + contraseña.
- **Onboarding de perfil mínimo (obligatorio)**
    - Captura de nombre, apellidos y teléfono.
    - No se habilitan acciones transaccionales hasta completarlo.
- **Recuperar contraseña** (mínimo operativo)
    - Solicitud de enlace de recuperación.
- **Aceptación legal inicial (T&C + Privacidad)**
    - Pantalla obligatoria tras primer login si no consta aceptación previa.
- **Estado de verificación de documentación**
    - Mensaje/estado visible de cuenta verificada o pendiente.
    - CTA directa a subida de DNI y carnet si falta verificación.

#### 2) Pestaña Explorar

- **Listado de vehículos cercanos**
    - Tarjetas con foto principal, precio/día, distancia, datos clave.
    - Buscador básico por ubicación/radio.
- **Panel de filtros**
    - Fechas (inicio/fin), precio máximo.
    - Filtros avanzados Demo 1: combustible, plazas, transmisión.
- **Detalle de vehículo (ficha)**
    - Galería de fotos.
    - Información del vehículo.
    - Perfil resumido del propietario.
    - Ventanas de disponibilidad.
    - Bloque de reservas existentes visibles para contexto.
    - CTA para solicitar reserva.
- **Formulario de solicitud de reserva**
    - Selección de fechas y confirmación de solicitud.
    - Si `is_verified = false`, bloquear envío y redirigir a verificación documental.

#### 3) Pestaña Mis Viajes

- **Vista conductor (reservas enviadas)**
    - Estados: pending, accepted, rejected, paid_confirmed, in_progress, completed, cancelled.
    - Acciones contextuales: cancelar (si aplica), pagar (si accepted), ver detalle.
- **Vista propietario (reservas recibidas)**
    - Acciones contextuales: aceptar/rechazar, cancelar pending, marcar in_progress/completed según flujo.
- **Detalle de reserva**
    - Timeline de estado.
    - Datos de contacto del owner cuando aplique.
    - Resumen económico.
- **Pago de reserva (driver)**
    - Estado de pago.
    - Acción de confirmar pago.
- **Checklists operativos**
    - Check-in y check-out con:
        - kilometraje,
        - combustible,
        - notas,
        - imágenes de evidencia.
- **Reviews post-viaje**
    - Crear review al otro participante (1-5 + comentario).
    - Ver reviews asociadas a la reserva.

#### 4) Pestaña Mis Vehículos

- **Listado de mis vehículos**
    - Estado activo/inactivo.
    - Acceso a detalle/edición.
- **Alta de vehículo**
    - Marca, modelo, año, matrícula, descripción, precio/día, ubicación.
- **Detalle/edición de vehículo**
    - Actualización de datos principales.
    - Activar/desactivar.
- **Gestión de imágenes**
    - Alta, listado, borrado, selección de principal.
- **Gestión de disponibilidad**
    - Alta, edición, borrado de ventanas.
- **Panel Mis ingresos (SHOULD incluido en Demo 1)**
    - Resumen de ingresos por periodos.
    - Historial simple por reserva.

#### 5) Pestaña Perfil

- **Perfil personal**
    - Nombre, apellidos, teléfono, avatar.
- **Documentación**
    - DNI y carnet de conducir (subida/actualización).
- **Métodos de pago/cobro (MVP visual + estado)**
    - Estado de vinculación Stripe customer/account.
- **Legal**
    - Términos y privacidad visibles en cualquier momento.
- **Sesión**
    - Cerrar sesión.

#### 6) Pantallas transversales obligatorias

- **Estados vacíos** por módulo (sin vehículos, sin viajes, sin reseñas, etc.).
- **Estados de carga** (skeleton o placeholders).
- **Estados de error** con mensaje legible y opción de reintento.
- **Confirmaciones** para acciones destructivas o sensibles (borrados/cancelaciones).
- **Gate de verificación documental**
    - Pantalla/overlay reutilizable para acciones transaccionales cuando `is_verified = false`.
    - Debe explicar el motivo del bloqueo y ofrecer navegación directa a Perfil > Documentación.

### Decisión UI — Guía visual oficial Demo 1 (cerrada 2026-03-20)

> Dirección visual: **tecnológica pero humana**, limpia, con bloques amplios y contraste marcado.

#### 1) Paleta de color (tokens)

- `color.primary`: `#0D1B2A`
- `color.secondary`: `#1B263B`
- `color.accent.1`: `#F4D35E`
- `color.accent.2`: `#E36414`
- `color.bg.light`: `#F7F7F9`
- `color.bg.dark`: `#0B0F14`
- `color.text.main`: `#121212`
- `color.text.muted`: `#5C5C5C`
- `color.border`: `#E2E4E8`
- `color.success`: `#2ECC71`
- `color.alert`: `#E74C3C`

Reglas:

- Fondo base de app: `#F7F7F9`.
- Superficies principales: blanco con borde `#E2E4E8`.
- Botón primario: fondo `#0D1B2A`, texto claro, hover/press con aclarado suave.
- Acento `#F4D35E` para highlights informativos; `#E36414` para CTA secundarios y avisos de atención.

#### 2) Tipografía

- Titulares: **Space Grotesk** (sans geométrica), tracking ligeramente positivo.
- Cuerpo/UI: **Manrope** (sans neutra), interlineado relajado.

Escala base recomendada:

- H1: 32/38 semibold
- H2: 26/32 semibold
- H3: 22/28 medium
- Body L: 17/26 regular
- Body M: 15/22 regular
- Caption: 13/18 medium

#### 3) Espaciado y layout

- Grid generoso con mucho aire.
- Escala de spacing: `4, 8, 12, 16, 24, 32, 40, 56`.
- Padding de tarjeta: mínimo `16`, recomendado `20-24`.
- Radio de componentes: `12` (tarjetas), `10` (inputs), `999` (chips/píldoras).

#### 4) Componentes

- **Botones**: sólidos, borde sutil, sombra mínima.
- **Cards**: sombra suave + borde tenue, sin glassmorphism.
- **Chips**: compactas para estados/filtros.
- **Iconografía**: lineal, trazo consistente y esquinas redondeadas.
- **Inputs**: alto táctil cómodo (>=44), contraste alto y mensajes de error claros.
- **Emojis en frontend**: no usar emojis en UI/labels/copy por defecto. Solo usar si se solicita explícitamente.

#### 5) Motion

- Transiciones cortas y suaves (`180-240ms`, easing estándar).
- Entrada de secciones: fade + slide vertical leve.
- Evitar animaciones largas o decorativas que afecten rendimiento.

#### 6) Responsive

- `<768px`: navegación inferior; layouts de 1 columna.
- `>=768px`: barra superior o sidebar; layouts de 2 columnas donde tenga sentido.
- Mantener consistencia visual entre móvil y web/tablet, cambiando estructura pero no lenguaje visual.

### Decisión de implementación frontend (cerrada 2026-03-20)

- Centralizar tokens de diseño (color, tipografía, spacing, radio, sombras, motion) en un único módulo compartido del frontend.
- Construir pantallas usando una librería interna mínima de componentes base (Button, Card, Chip, Input, EmptyState, SectionHeader) para evitar divergencias visuales.
- Toda pantalla nueva debe implementarse con: estado de carga, estado vacío y estado de error, además del estado feliz.
- En cualquier cambio de UX/visual no contemplado en este documento, registrar la decisión en `agents.md` el mismo día para preservar continuidad.

### Ajuste UX Explore — Barra Sticky de controles (cerrada 2026-04-18)

- En la pestaña **Explorar**, el bloque de **Filtros** y el selector **Lista/Mapa** se fija en la parte superior durante el scroll largo del listado para evitar tener que volver al inicio.
- Implementación actual: `position: sticky` en web (con offset para no solapar la navegación superior).
- Modo **smart** en web y móvil: al hacer scroll hacia abajo se oculta el bloque completo de filtros y permanece accesible el selector `Lista/Mapa`; al hacer scroll hacia arriba, los filtros reaparecen automáticamente.
- Ajuste visual: el contenedor sticky no pinta fondo propio y las cards de controles (`Filtros`, `Lista/Mapa`) se muestran sin sombra adicional para evitar efecto de "rectángulo" o halo detrás de los componentes.
- Implementación técnica final: `ExploreScreen` usa `ScrollView` propio con `stickyHeaderIndices` para comportamiento sticky fiable en móvil y web (sin superposición artificial sobre el contenido).

Estado de implementación inicial (2026-03-20):

- Tokens base implementados en `apps/mobile/src/app/theme/tokens.ts`.
- Estilos globales alineados con la guía visual en `apps/mobile/src/app/styles.ts`.
- Componentes UI base creados en `apps/mobile/src/app/components/ui/`:
    - `SectionHeader.tsx`
    - `EmptyState.tsx`
    - `StatusChip.tsx`
    - `VerificationGate.tsx`
- Integración inicial aplicada en pantallas clave:
    - `ExploreScreen`: uso de `SectionHeader` + `EmptyState` y bloqueo de solicitud de reserva si no se cumple perfil mínimo + verificación documental.
    - `TripsScreen`, `MyVehiclesScreen`, `ProfileScreen`: adopción de `SectionHeader`/`EmptyState` para homogeneizar estructura.
- App shell:
    - pestaña inicial establecida en `explore` para priorizar flujo principal de producto.

---

## 8. Convenciones de Código

- **TypeScript estricto** en todo el proyecto (frontend y backend).
- **NestJS**: separar siempre en Módulo / Controlador / Servicio. Un módulo por dominio (`users`, `vehicles`, `bookings`, `checklists`, `reviews`, `payments`).
- **DTOs** tipados y compartidos entre frontend y backend donde sea posible.
- **Guards de NestJS** para control de acceso (ej. solo el propietario puede aceptar su propia reserva).
- Variables de entorno mediante `.env` + `@nestjs/config`. Nunca hardcodear credenciales.
- Migraciones de base de datos en `migrations/` como scripts SQL nombrados con timestamp (`20240101_description.sql`).
- `synchronize: false` en TypeORM **siempre** en producción y staging.

---

## 9. Entorno Local

### Requisitos
- Node.js v18 o v20 LTS
- Docker (para PostgreSQL + PostGIS local)
- Expo CLI y EAS CLI (`npm install -g expo-cli eas-cli`)
- Xcode (simulador iOS, ~15 GB)
- Android Studio (opcional, emulador Android)

### PostgreSQL local con Docker
```bash
docker run --name fyf-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fyf_dev \
  -p 5432:5432 \
  -d postgis/postgis:15-3.3
```

### Variables de entorno (`.env` del backend)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fyf_dev
SUPABASE_JWT_SECRET=<tu_jwt_secret_de_supabase>
STRIPE_SECRET_KEY=<tu_stripe_secret_key>
SUPABASE_STORAGE_URL=<url_del_storage>
```

### Variables de entorno para pagos (backend, todas opcionales)
- `STRIPE_SECRET_KEY` (`sk_test_...`; sin ella → modo prototipo)
- `STRIPE_PUBLISHABLE_KEY` (`pk_test_...`; la app la recibe vía `/payments/config`)
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`; `stripe listen --forward-to localhost:3000/api/payments/webhook`)
- `STRIPE_APPLICATION_FEE_PERCENT` (por defecto `10`)
- `STRIPE_CONNECT_COUNTRY` (por defecto `ES`)
- `API_PUBLIC_URL` (por defecto `http://localhost:3000/api`; base de return/refresh del onboarding)
- `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL` (opcionales, sobrescriben las anteriores)

---

## 10. Riesgos Técnicos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Inconsistencias React Native Web vs nativo | Usar componentes oficiales Expo SDK; `Platform.OS` para alternativas web. |
| Fragmentación auth Supabase ↔ NestJS | Trigger SQL que replica `auth.users` → tabla `users` pública al registrarse. |
| `synchronize: true` en producción (TypeORM) | Prohibido fuera de local. Solo migraciones SQL controladas en producción. |
| Pausa de Supabase / Render por inactividad (Free Tier) | Calentar servicios antes de demostraciones. Considerar plan de pago para la defensa. |
| Cuota de almacenamiento Supabase agotada | Compresión en cliente al 70% + límite de 2 MB en bucket. |

---

## 11. Estructura Oficial del Monorepo

```text
lynkdrive/
    apps/
        api/                # NestJS API (fuente única de lógica de negocio)
        mobile/             # Expo React Native (iOS/Android/Web)
    packages/
        shared/             # Tipos, DTOs y contratos compartidos
    infra/
        docker/             # docker-compose y utilidades locales
        db/
            migrations/       # migraciones SQL versionadas
    docs/                 # documentación funcional/técnica adicional
    agents.md             # reglas de proyecto (este archivo)
    package.json          # npm workspaces (root)
```

# Salida a producción: estado y pendientes

Qué está listo para publicar LynkDrive como producto real y qué falta, revisado el 31/10/2026 sobre la rama `integracion` más los arreglos de QA.

## Ya cubierto

**Seguridad de la API**
- Autenticación solo con JWT de Supabase validados en NestJS (JWKS o HS256 legacy, con issuer y audience). La API nunca emite tokens ni guarda contraseñas: el registro y el login los gestiona Supabase Auth.
- Autorización por recurso: cada endpoint comprueba que el usuario es propietario o participante. Las reglas de negocio (verificación documental, máquina de estados, checklists obligatorios, solapes con 2 h de margen) se aplican en servidor, no solo en la app.
- `helmet`, límite de cuerpo de 100 KB, `ValidationPipe` con `whitelist`, validación de filtros de búsqueda y rangos (precio entre 1 y 10.000 €/día, coordenadas, radio máximo de 500 km).
- Rate limiting global (`RATE_LIMIT_PER_MINUTE`, 300 por defecto) y más estricto en subidas (30/min). Detrás de un proxy hay que definir `TRUST_PROXY=1` para limitar por IP real.
- CORS restringible con `CORS_ORIGINS`; en producción sin esa variable la API lo avisa al arrancar.
- Logs HTTP sin query string ni cuerpos; no se registran tokens, emails ni contraseñas.

**Ficheros**
- Nunca BLOB en BD: solo referencias `supabase://bucket/ruta`.
- Buckets `documents` y `checklists` privados; se sirven con URLs firmadas de 15 minutos (máximo 1 h, `SUPABASE_SIGNED_URL_TTL_SECONDS`).
- El tipo de imagen se comprueba por los bytes, no por la cabecera. Las rutas siempre empiezan por `<tipo>/<usuario>/` y la API rechaza referencias a ficheros de otro usuario.
- Al sustituir o borrar DNI, carnet o avatar se borra el fichero anterior. Al borrar la cuenta se borran todos sus ficheros.

**App**
- Sesión en Keychain/Keystore (`expo-secure-store`, troceada en bloques < 2 KB). En web se usa `localStorage`, que es lo habitual para una SPA.
- Textos de permisos de cámara, fotos y ubicación en `app.json` (iOS `infoPlist` y plugins de Expo). Se bloquea el permiso de micrófono en Android.
- Recuperación de contraseña completa: el enlace del email abre una pantalla web para fijar la nueva contraseña.
- Términos, privacidad y cancelación accesibles antes de registrarse y desde Perfil; aceptación obligatoria y registrada con fecha y versión en Supabase Auth.
- URL pública de la política de privacidad para las tiendas: `https://<dominio-web>/?legal=privacidad` (también `terminos` y `cancelacion`).
- RGPD: descarga de datos en JSON y eliminación de cuenta desde la app.

**Pagos**
- Stripe Connect Express con destination charges, comisión configurable, webhooks firmados e idempotentes y reembolsos según la política de cancelación.
- No se cobra al conductor si el propietario no ha terminado el onboarding (409 con mensaje claro). La opción contraria queda tras `STRIPE_ALLOW_PLATFORM_ONLY_CHARGES=true` y no se recomienda: la plataforma custodiaría fondos de terceros, algo que en la UE exige licencia de entidad de pago o encaje en la excepción de agente comercial.
- En modo Stripe no se puede marcar una reserva como pagada a mano: la confirmación llega por webhook o verificando el PaymentIntent. Es lo correcto, porque si no cualquiera podría saltarse el pago.

## Pendiente antes de publicar

### Cuentas y alta en tiendas
- [ ] Cuenta de **Apple Developer** (99 $/año) y de **Google Play Console** (25 $ una vez).
- [ ] Revisar `bundleIdentifier` / `package` (`com.lynkdrive.app`) y que el dominio sea tuyo.
- [ ] **EAS**: `eas init`, `eas.json` con perfiles `preview` y `production`, variables `EXPO_PUBLIC_*` como secretos de EAS, `eas build` y `eas submit`. Subir `buildNumber`/`versionCode` en cada envío.
- [ ] Fichas de tienda: capturas (`docs/screenshots`), descripción, categoría, clasificación por edades, formulario de **Privacidad de datos** (App Store) y **Seguridad de los datos** (Play), declarando ubicación aproximada, fotos, documentos de identidad y datos de pago (vía Stripe).
- [ ] Apple exige poder **borrar la cuenta desde la app** (ya está) y una cuenta de prueba para la revisión. Preparar usuarios demo verificados.
- [ ] Plugin de configuración de `@stripe/stripe-react-native` en `app.json` (con `merchantIdentifier` si se activa Apple Pay) antes del primer build nativo.

### Dominio, web y correo
- [ ] Dominio propio (p. ej. `lynkdrive.es`) para la web en Vercel y la API (Render permite dominio propio).
- [ ] `CORS_ORIGINS` con el dominio de la web y `API_PUBLIC_URL` con la URL pública de la API.
- [ ] Buzón real para `EXPO_PUBLIC_LEGAL_CONTACT_EMAIL` (por defecto `privacidad@lynkdrive.es`) y soporte.
- [ ] **SMTP propio en Supabase Auth** (el SMTP por defecto tiene un límite muy bajo de envíos) y plantillas de confirmación y recuperación en español. Activar la confirmación de email.
- [ ] Recuperación de contraseña: el enlace del email abre la web (`EXPO_PUBLIC_WEB_URL`), que muestra la pantalla de nueva contraseña; también cuando se pide desde la app nativa. Falta añadir esa URL en Supabase > Auth > URL Configuration (Redirect URLs).
- [ ] Emails transaccionales de cambios de reserva (SHOULD; se aborda en una rama aparte con proveedor configurable).

### Legal
- [ ] Rellenar los datos del titular (nombre o razón social, NIF y dirección) en `EXPO_PUBLIC_LEGAL_OWNER_NAME` y en los textos: la LSSI exige identificar al prestador del servicio.
- [ ] Revisión de términos y privacidad por un profesional: seguro del vehículo durante el alquiler (el seguro obligatorio del propietario no suele cubrir alquileres entre particulares; hace falta un seguro específico o un acuerdo con aseguradora), responsabilidad por multas y daños, fianza y fiscalidad de los ingresos de los propietarios.
- [ ] Contratos de encargado del tratamiento (DPA) con Supabase, Stripe, Render y Vercel, y revisión de transferencias internacionales.
- [ ] Registro de actividades de tratamiento y evaluación de impacto (se tratan documentos de identidad).
- [ ] Banner de cookies en web solo si se añaden analíticas (hoy no hay cookies de terceros).

### Infraestructura
- [ ] Render Free se duerme tras inactividad: pasar a un plan de pago o al menos programar un ping antes de demos. Igual con Supabase Free (se pausa a los 7 días sin uso).
- [ ] Backups de la base de datos (Supabase Pro los hace diarios) y prueba de restauración.
- [ ] Aplicar las migraciones con `npm run db:migrate:remote` y comprobar `public.app_migrations`.
- [ ] Monitorización de errores (Sentry en API y app) y alertas de disponibilidad.
- [ ] Revisar las políticas de Storage en Supabase: buckets `documents` y `checklists` privados y sin políticas públicas de lectura.
- [ ] Stripe en modo live: activar la cuenta, configurar el webhook de producción (`/api/payments/webhook`) y su secreto, y revisar los requisitos de Connect para España.

### Producto
- [ ] La verificación de documentos la hace el backoffice (rama `feat/backoffice`); hasta que esté en producción nadie puede pasar a `is_verified = true` sin acceso a la BD.
- [ ] Notificaciones push (COULD) para avisar de solicitudes y cambios de estado.
- [ ] Chat interno (SHOULD): hoy el contacto se comparte al aceptar la reserva.
- [ ] Iniciar el viaje no comprueba la hora de recogida; se puede hacer antes. Decidir si limitarlo.

## Probar todo en local sin Supabase

```bash
docker run -d --name ld-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lynkdrive_dev -p 55432:5432 postgis/postgis:15-3.4
# esquema + migraciones
psql postgresql://postgres:postgres@localhost:55432/lynkdrive_dev -f apps/api/test/e2e/schema.sql
for f in infra/db/migrations/*.sql; do psql postgresql://postgres:postgres@localhost:55432/lynkdrive_dev -f "$f"; done

export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/lynkdrive_dev
export SUPABASE_JWT_SECRET=un-secreto-local-cualquiera-de-32-caracteres
export SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=mock
node scripts/dev/supabase-local-mock.js &            # Auth + Storage simulados
npm run start:dev -w @lynkdrive/api &                # API en :3000

# App web apuntando al mock
cd apps/mobile
EXPO_PUBLIC_API_URL=http://localhost:3000/api \
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=mock npx expo start --web
```

Para que un usuario pueda reservar hay que verificarlo (backoffice o `UPDATE users SET is_verified = true WHERE ...`).

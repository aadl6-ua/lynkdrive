# Changelog

Todos los cambios relevantes del proyecto se documentan en este fichero.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/).

## [1.0.0-alpha.1] - 2026-10-31

Primera versión alpha camino de la 1.0: la app del TFG pulida y preparada para una salida real.
Es una versión preliminar: no se ha probado todavía en producción.

### Añadido

- **Pagos con Stripe Connect (modo test):** cuentas Express para propietarios, cobro al conductor
  con PaymentSheet, comisión de plataforma, webhook como fuente de verdad y reembolsos según la
  política de cancelación. Sin claves de Stripe la app sigue en modo prototipo.
- **Backoffice de administración** (`apps/admin`): métricas, verificación de documentos, bloqueo de
  usuarios, moderación de vehículos y reseñas, historial de estados de reservas e incidencias.
- **Chat interno por reserva** entre propietario y conductor.
- **Panel "Mis ingresos"** para propietarios, con resumen por periodos, desglose por vehículo e
  historial.
- **Notificaciones push** y **emails automáticos** de cambios de estado de las reservas
  (desactivados si no se configuran).
- **RGPD:** exportar mis datos y borrar mi cuenta desde la app; aceptación de términos y política de
  privacidad en el registro, con textos legales públicos en la web.
- **Filtro por fechas** en Explorar.
- **Datos de demostración** (`scripts/seed-demo.js`) y entorno local completo con mocks de Supabase
  y Nominatim.
- **Tests:** unitarios de API y app, e2e de la API contra PostgreSQL + PostGIS y recorrido e2e en
  navegador con Playwright. CI en GitHub Actions.
- Animaciones al cambiar de pestaña y en la barra de pestañas (respetan "Reducir movimiento").

### Cambiado

- **Pulido visual y de UX de toda la app** en web, iOS y Android: sistema de diseño común, estados
  de carga, vacíos y de error, subida de imágenes con progreso, reintento y portada, accesibilidad
  (contraste AA, lectores de pantalla) y carga diferida de mapas.
- Al aceptar una reserva se rechazan automáticamente las solicitudes pendientes que se solapan, en
  una transacción con bloqueo; la API aplica el margen de 2 h entre reservas y la base de datos lo
  garantiza con una restricción `EXCLUDE`.
- La búsqueda por cercanía usa un índice GiST sobre `geography`.
- Esquema base de la base de datos versionado en `infra/db/migrations`.
- `packages/shared` es la fuente de los contratos de la API y lo usan la API y la app.

### Corregido

- La barra de búsqueda de Explorar ya no oscila al hacer scroll.

### Seguridad

- Autenticación obligatoria y comprobación de propietario en usuarios y subidas, que estaban
  expuestos.
- Perfiles públicos y reservas ajenas sin datos personales (teléfono, documentos, contacto).
- Validación de todas las entradas, tipo real de los ficheros subidos, límites de tamaño, helmet,
  rate limiting y CORS configurable.
- Guard JWT más estricto (algoritmos, emisor y caducidad obligatorios).

## [0.1.0] - 2026-05-22

Versión entregada y defendida como Trabajo Fin de Grado (Universidad de Alicante).

### Añadido

- Plataforma P2P de alquiler de vehículos: registro y perfil verificado, publicación de vehículos
  con fotos y disponibilidad, búsqueda geoespacial con mapa, reservas en dos fases con máquina de
  estados, checklists de entrega y devolución con fotos, reseñas cruzadas y pago en modo
  prototipo.

[1.0.0-alpha.1]: https://github.com/aadl6-ua/lynkdrive/compare/v0.1.0...v1.0.0-alpha.1
[0.1.0]: https://github.com/aadl6-ua/lynkdrive/releases/tag/v0.1.0

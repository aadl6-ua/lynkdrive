#!/usr/bin/env node
/**
 * Recorrido de extremo a extremo de LynkDrive en navegador (Playwright) sobre un entorno local:
 * app web (Expo) + panel admin + API en modo prototipo + mock de Supabase + mock de Nominatim.
 * Ver scripts/e2e-web/README.md para levantar el entorno.
 *
 * Crea tres usuarios nuevos en cada ejecución (propietaria en móvil, conductor en escritorio y
 * un segundo conductor en móvil) y una cuenta admin, y recorre: registro con aceptación legal,
 * documentos, verificación en el admin, alta de coche con fotos y disponibilidad, Explorar con fechas,
 * dirección, filtros y mapa, dos solicitudes solapadas, aceptación (la otra pasa a rechazada),
 * pago prototipo, checklists con fotos, inicio, devolución, completar, reseñas cruzadas,
 * Mis ingresos, moderación en el admin (incidencia, reseña, vehículo, bloqueo), exportar datos
 * y borrar cuenta.
 *
 * Variables: WEB_URL (http://localhost:8081), ADMIN_URL (http://localhost:5173),
 * SUPABASE_URL (http://localhost:54321, el mock), DATABASE_URL (para dar el rol admin),
 * OUT_DIR (e2e-web-output), HEADED=1 para ver el navegador.
 * Sale con código 1 si falla un paso o si hay errores de consola no esperados.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { Client } = require('pg');

const WEB_URL = process.env.WEB_URL || 'http://localhost:8081';
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5173';
const SUPABASE_URL = (process.env.SUPABASE_URL || 'http://localhost:54321').replace(/\/$/, '');
const DATABASE_URL = process.env.DATABASE_URL;
const OUT_DIR = path.resolve(process.env.OUT_DIR || 'e2e-web-output');
const PASSWORD = 'Qa-recorrido-2026';
const RUN = Date.now().toString(36).slice(-5);

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } }
};
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const NEXT_MONTH = MONTHS[(new Date().getMonth() + 1) % 12];
// No cuentan como fallo: teselas del mapa sin internet y respuestas HTTP con error, que el
// navegador también escribe en consola (las esperadas, como el 403 de la cuenta bloqueada,
// y las inesperadas, que ya hacen fallar las comprobaciones de la UI).
const IGNORED_CONSOLE = [/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/, /^Failed to load resource/];

if (!DATABASE_URL) {
  console.error('Define DATABASE_URL (la misma BD local que usan la API y el mock de Supabase)');
  process.exit(1);
}
if (/supabase\.(co|com)/i.test(DATABASE_URL)) {
  console.error('DATABASE_URL apunta a Supabase: este recorrido es solo para entornos locales');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const consoleErrors = [];
let shotIndex = 0;

const users = {
  owner: { first: 'Olga', last: 'Propietaria', email: `olga.${RUN}@qa.test`, phone: phone(1), vp: 'mobile' },
  driver: { first: 'Diego', last: 'Conductor', email: `diego.${RUN}@qa.test`, phone: phone(2), vp: 'desktop' },
  driver2: { first: 'Dora', last: 'Conductora', email: `dora.${RUN}@qa.test`, phone: phone(3), vp: 'mobile' }
};
const vehicle = { brand: 'Volkswagen', model: `Golf ${RUN.toUpperCase()}`, plate: `${RUN.toUpperCase().slice(0, 4)} QA` };

function phone(n) {
  const digits = String(Date.now()).slice(-7);
  return `+34 6${n}${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)}`;
}

function log(message) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function newPage(browser, who, url = WEB_URL) {
  const vp = users[who]?.vp ?? 'desktop';
  const context = await browser.newContext({
    ...VIEWPORTS[vp],
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    geolocation: { latitude: 38.3853, longitude: -0.5137 },
    permissions: ['geolocation'],
    acceptDownloads: true
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' && !IGNORED_CONSOLE.some((pattern) => pattern.test(message.text()))) {
      consoleErrors.push(`${who}: ${message.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(`${who}: ${error.message}`));
  await page.goto(url);
  await page.waitForTimeout(2500);
  return { page, who, vp, context };
}

async function shot(actor, name) {
  shotIndex += 1;
  await actor.page.waitForTimeout(500);
  await actor.page.screenshot({ path: path.join(OUT_DIR, `${String(shotIndex).padStart(3, '0')}-${actor.who}-${actor.vp}-${name}.png`) });
}

const text = (actor, value, exact = true) => actor.page.getByText(value, { exact });

async function click(actor, value, { nth = -1, wait = 1200 } = {}) {
  const locator = text(actor, value);
  await (nth < 0 ? locator.last() : locator.nth(nth)).click();
  await actor.page.waitForTimeout(wait);
}

async function tab(actor, name) {
  await actor.page.reload();
  await actor.page.waitForTimeout(2500);
  await click(actor, name, { wait: 1500 });
}

async function expectText(actor, value, message) {
  const found = await actor.page.getByText(value).first().isVisible().catch(() => false);
  if (!found) {
    await shot(actor, 'fallo');
    throw new Error(message ?? `No aparece "${value}"`);
  }
}

/** Imágenes JPEG de prueba generadas con el propio navegador (sin dependencias). */
async function makeImages(browser) {
  const dir = path.join(OUT_DIR, 'fotos');
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const files = {};
  for (const [name, color] of Object.entries({ dni: '#555', carnet: '#888', coche1: '#1B263B', coche2: '#E36414', checklist: '#A33' })) {
    await page.setContent(
      `<body style="margin:0;background:${color};display:flex;align-items:center;justify-content:center;height:800px;color:#fff;font:90px sans-serif">${name}</body>`
    );
    files[name] = path.join(dir, `${name}.jpg`);
    await page.screenshot({ path: files[name], type: 'jpeg', quality: 80 });
  }
  await page.close();
  return files;
}

async function chooseFiles(actor, trigger, filePaths) {
  const [chooser] = await Promise.all([actor.page.waitForEvent('filechooser', { timeout: 8000 }), trigger()]);
  await chooser.setFiles(filePaths);
}

async function register(actor) {
  const user = users[actor.who];
  const { page } = actor;
  await click(actor, 'Crear cuenta', { nth: 0 });
  await page.getByPlaceholder('Tu nombre').fill(user.first);
  await page.getByPlaceholder('Tus apellidos').fill(user.last);
  await page.getByPlaceholder('+34 600 000 000').fill(user.phone);
  await page.getByPlaceholder('tu@email.com').fill(user.email);
  await page.getByPlaceholder('Mínimo 8 caracteres').fill(PASSWORD);
  await page.getByPlaceholder('Repite la contraseña').fill(PASSWORD);
  await click(actor, 'Crear cuenta');
  await expectText(actor, 'Debes aceptar los términos', 'El registro debería exigir aceptar los términos');
  await page.getByRole('checkbox').click();
  await shot(actor, 'registro');
  await click(actor, 'Crear cuenta', { wait: 3000 });
  await expectText(actor, 'Explorar');
}

async function uploadDocuments(actor, images) {
  await tab(actor, 'Perfil');
  await click(actor, 'Gestionar');
  await chooseFiles(actor, () => text(actor, 'Subir documento').first().click(), [images.dni]);
  await actor.page.waitForTimeout(3500);
  await chooseFiles(actor, () => text(actor, 'Subir documento').first().click(), [images.carnet]);
  await actor.page.waitForTimeout(3500);
  await shot(actor, 'documentos');
  await expectText(actor, 'En revisión');
}

async function createAdmin() {
  const email = `admin.${RUN}@qa.test`;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: 'mock' },
    body: JSON.stringify({ email, password: PASSWORD, data: { first_name: 'Admin', last_name: 'Recorrido' } })
  });
  if (!response.ok) {
    throw new Error(`No se pudo crear la cuenta admin en el mock de Supabase (${response.status})`);
  }
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    await db.query(`UPDATE public.users SET is_admin = true WHERE id = (SELECT id FROM auth.users WHERE email = $1)`, [email]);
  } finally {
    await db.end();
  }
  return email;
}

async function adminLogin(actor, email) {
  await actor.page.fill('input[type=email]', email);
  await actor.page.fill('input[type=password]', PASSWORD);
  await actor.page.click('button[type=submit]');
  await actor.page.waitForTimeout(2500);
}

async function adminGo(actor, hash) {
  await actor.page.goto(`${ADMIN_URL}/#${hash}`);
  await actor.page.waitForTimeout(1800);
}

async function adminConfirm(actor, reason) {
  const modal = actor.page.locator('.modal-backdrop');
  await actor.page.waitForTimeout(400);
  if (reason && (await modal.locator('textarea, input').count())) {
    await modal.locator('textarea, input').first().fill(reason);
  }
  await modal.locator('button').last().click();
  await actor.page.waitForTimeout(1800);
}

async function pickRange(actor, from, to) {
  await text(actor, 'Elegir fecha').first().click();
  await actor.page.waitForTimeout(400);
  await actor.page.getByLabel('Mes siguiente').first().click();
  await actor.page.getByLabel(`${from} de ${NEXT_MONTH}`, { exact: true }).click();
  await actor.page.waitForTimeout(300);
  await actor.page.getByLabel(`${to} de ${NEXT_MONTH}`, { exact: true }).click();
  await actor.page.waitForTimeout(500);
}

async function openTrip(actor, role, matcher) {
  await tab(actor, 'Mis Viajes');
  if (role === 'owner') {
    await click(actor, 'Propietario');
  }
  await actor.page.getByText(matcher).first().click();
  await actor.page.waitForTimeout(1500);
}

async function confirmDialog(actor, action, confirmLabel = action) {
  await click(actor, action, { wait: 600 });
  const confirm = text(actor, confirmLabel);
  if ((await confirm.count()) > (confirmLabel === action ? 1 : 0)) {
    await confirm.last().click();
  }
  await actor.page.waitForTimeout(2500);
}

async function checklist(actor, kind, mileage, images) {
  await openTrip(actor, 'driver', vehicle.model);
  await click(actor, kind === 'in' ? 'Rellenar entrega' : 'Rellenar devolución');
  await actor.page.getByPlaceholder('Ej. 45210').fill(String(mileage));
  await click(actor, '75%', { nth: 0, wait: 300 });
  await actor.page.getByPlaceholder('Rayones, golpes, limpieza, objetos olvidados…').fill('Sin daños visibles.');
  await chooseFiles(actor, () => text(actor, 'Añadir fotos').first().click(), [images.checklist, images.coche2]);
  await actor.page.waitForTimeout(1500);
  await shot(actor, `checklist-${kind}`);
  await click(actor, 'Enviar checklist', { wait: 5000 });
  await expectText(actor, 'Enviado');
}

async function review(actor, role, stars, comment) {
  await openTrip(actor, role, role === 'owner' ? users.driver.first : vehicle.model);
  await click(actor, 'Escribir reseña');
  await actor.page.getByLabel(`${stars} estrellas`, { exact: true }).click();
  await actor.page.getByPlaceholder('¿Qué tal fue la experiencia?').fill(comment);
  await click(actor, 'Publicar reseña', { wait: 2000 });
  await shot(actor, 'resena');
}

const steps = [];
const step = (name, run) => steps.push({ name, run });

async function main() {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const images = await makeImages(browser);
  const owner = await newPage(browser, 'owner');
  const driver = await newPage(browser, 'driver');
  const driver2 = await newPage(browser, 'driver2');
  const admin = await newPage(browser, 'admin', ADMIN_URL);
  let adminEmail = '';

  step('Registro con aceptación legal (3 usuarios)', async () => {
    for (const actor of [owner, driver, driver2]) await register(actor);
  });
  step('Documentos', async () => {
    for (const actor of [owner, driver, driver2]) await uploadDocuments(actor, images);
  });
  step('Admin: métricas y verificación de documentos', async () => {
    adminEmail = await createAdmin();
    await adminLogin(admin, adminEmail);
    await shot(admin, 'resumen');
    for (const key of ['owner', 'driver', 'driver2']) {
      await adminGo(admin, '/users');
      await admin.page.getByText(`${users[key].first} ${users[key].last}`).first().click();
      await admin.page.waitForTimeout(1500);
      await admin.page.getByRole('button', { name: 'Verificar documentos' }).click();
      await adminConfirm(admin);
    }
    await expectText(admin, 'Verificado');
  });
  step('Publicar coche con fotos y disponibilidad', async () => {
    const { page } = owner;
    await tab(owner, 'Mis Vehículos');
    await click(owner, 'Publicar vehículo');
    await page.getByPlaceholder('Ej. Seat').fill(vehicle.brand);
    await page.getByPlaceholder('Ej. Ibiza').fill(vehicle.model);
    await page.getByLabel('Año', { exact: true }).fill('2020');
    await page.getByPlaceholder('45').fill('40');
    await page.getByPlaceholder('1234 ABC').fill(vehicle.plate);
    await page.getByPlaceholder('Estado, equipamiento, normas (mascotas, fumar…)').fill('Coche de prueba del recorrido e2e.');
    await page.getByPlaceholder('Calle, número y ciudad').fill('Universidad Alicante');
    await page.waitForTimeout(1500);
    await page.getByText('Universidad de Alicante, San Vicente del Raspeig, España').first().click();
    await click(owner, 'Publicar vehículo', { wait: 2500 });
    await page.getByText(vehicle.model).first().click();
    await page.waitForTimeout(1500);
    await text(owner, 'Fotos').first().click();
    await page.waitForTimeout(1000);
    await chooseFiles(owner, () => text(owner, 'Añadir fotos').first().click(), [images.coche1, images.coche2]);
    await page.waitForTimeout(6000);
    await shot(owner, 'fotos');
    await click(owner, 'Volver al vehículo');
    await text(owner, 'Disponibilidad').first().click();
    await page.waitForTimeout(1000);
    await pickRange(owner, 1, 28);
    await click(owner, 'Añadir disponibilidad', { wait: 1500 });
    await shot(owner, 'disponibilidad');
    await expectText(owner, 'Próximas fechas');
  });
  step('Explorar: dirección, fechas, filtros, lista y mapa', async () => {
    const { page } = driver;
    await tab(driver, 'Explorar');
    await page.getByPlaceholder('¿Dónde quieres recoger el coche?').fill('Plaza Luceros');
    await page.waitForTimeout(1500);
    await page.getByText('Plaza de los Luceros, Alicante, España').first().click();
    await page.waitForTimeout(2000);
    await page.getByLabel(/^Filtros/).first().click();
    await page.waitForTimeout(600);
    await pickRange(driver, 5, 8);
    await page.getByPlaceholder('Sin límite').fill('45');
    await click(driver, 'Ver resultados', { wait: 1500 });
    await shot(driver, 'filtros');
    await expectText(driver, vehicle.model);
    await click(driver, 'Mapa', { wait: 3000 });
    await shot(driver, 'mapa');
    await click(driver, 'Lista');
  });
  step('Dos solicitudes solapadas', async () => {
    for (const [actor, from, to] of [[driver, 5, 8], [driver2, 6, 9]]) {
      await tab(actor, 'Explorar');
      await actor.page.getByText(vehicle.model).first().click();
      await actor.page.waitForTimeout(2000);
      // Con fechas en el filtro de Explorar la ficha ya las trae puestas.
      if (await text(actor, 'Elegir fecha').count()) {
        await pickRange(actor, from, to);
      }
      await actor.page.getByText('Solicitar reserva', { exact: true }).last().click();
      await actor.page.waitForTimeout(2500);
      await shot(actor, 'solicitud');
      await expectText(actor, 'Solicitud enviada');
    }
  });
  step('Aceptar y rechazo automático de la solapada', async () => {
    await openTrip(owner, 'owner', users.driver.first);
    await owner.page.getByPlaceholder('Ej. WhatsApp 600 123 123').fill('WhatsApp +34 600 000 000');
    await click(owner, 'Aceptar solicitud', { wait: 2500 });
    await expectText(owner, 'Aceptada');
    await openTrip(driver2, 'driver', vehicle.model);
    await shot(driver2, 'rechazada');
    await expectText(driver2, 'Rechazada', 'La solicitud solapada debería pasar a rechazada');
  });
  step('Pago en modo prototipo', async () => {
    await openTrip(driver, 'driver', vehicle.model);
    await driver.page.getByText(/^Pagar /).first().click();
    await driver.page.waitForTimeout(600);
    await click(driver, 'Pagar', { wait: 2500 });
    await shot(driver, 'pagada');
    await expectText(driver, 'Pago confirmado');
  });
  step('Checklist de entrega e inicio del viaje', async () => {
    await checklist(driver, 'in', 45210, images);
    await openTrip(owner, 'owner', users.driver.first);
    await confirmDialog(owner, 'Iniciar viaje');
    await expectText(owner, 'En curso');
  });
  step('Checklist de devolución y completar', async () => {
    await checklist(driver, 'out', 45620, images);
    await openTrip(owner, 'owner', users.driver.first);
    await confirmDialog(owner, 'Marcar como completada', 'Completar');
    await shot(owner, 'completada');
    await expectText(owner, 'Completada');
  });
  step('Reseñas cruzadas', async () => {
    await review(driver, 'driver', 5, 'Coche impecable y entrega puntual.');
    await review(owner, 'owner', 2, 'Devolvió el coche con retraso.');
  });
  step('Mis ingresos', async () => {
    await tab(owner, 'Mis Vehículos');
    await click(owner, 'Mis ingresos', { wait: 1500 });
    await shot(owner, 'ingresos');
    await expectText(owner, '144,00 €', 'Neto esperado: 4 días x 40 € menos el 10 %');
  });
  step('Admin: incidencia, reseña, vehículo y bloqueo', async () => {
    await adminGo(admin, '/bookings');
    await admin.page.locator('tr', { hasText: users.driver.first }).first().locator('a').first().click();
    await admin.page.waitForTimeout(1800);
    await admin.page.getByText('Abrir incidencia').first().click();
    await admin.page.waitForTimeout(1500);
    await admin.page.locator('label:has-text("Título") input').fill('Arañazo tras la devolución');
    await admin.page.locator('label:has-text("Descripción") textarea').fill('Revisar las fotos del checklist.');
    await admin.page.getByRole('button', { name: 'Crear incidencia' }).click();
    await admin.page.waitForTimeout(2000);
    await admin.page.locator('select').first().selectOption('in_progress');
    await admin.page.waitForTimeout(1200);
    await admin.page.locator('textarea').last().fill('Contactado el conductor.');
    await admin.page.getByRole('button', { name: /nota/i }).click();
    await admin.page.waitForTimeout(1500);
    await shot(admin, 'incidencia');
    await adminGo(admin, '/reviews');
    await admin.page.locator('li.review', { hasText: 'Devolvió el coche con retraso' }).getByRole('button', { name: 'Ocultar' }).click();
    await adminConfirm(admin, 'Prueba de moderación');
    await adminGo(admin, '/vehicles');
    await admin.page.locator('tr', { hasText: vehicle.plate }).getByRole('button', { name: 'Desactivar' }).click();
    await adminConfirm(admin, 'Prueba de moderación');
    await adminGo(admin, '/users');
    await admin.page.getByText(`${users.driver2.first} ${users.driver2.last}`).first().click();
    await admin.page.waitForTimeout(1500);
    await admin.page.getByRole('button', { name: 'Bloquear' }).click();
    await adminConfirm(admin, 'Prueba de bloqueo');
    await shot(admin, 'bloqueado');
    await tab(owner, 'Mis Vehículos');
    await expectText(owner, 'Retirado', 'El propietario debería ver el vehículo como retirado');
    await driver2.page.reload();
    await driver2.page.waitForTimeout(3000);
    await shot(driver2, 'cuenta-bloqueada');
    await expectText(driver2, 'Cuenta bloqueada');
  });
  step('Exportar datos y borrar cuenta', async () => {
    await tab(driver, 'Perfil');
    const [download] = await Promise.all([
      driver.page.waitForEvent('download', { timeout: 8000 }),
      text(driver, 'Descargar mis datos').first().click()
    ]);
    const exportPath = path.join(OUT_DIR, 'export-conductor.json');
    await download.saveAs(exportPath);
    const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    if (!exported.profile || !Array.isArray(exported.bookingsAsDriver)) {
      throw new Error('La exportación no tiene el formato esperado');
    }
    await click(driver, 'Eliminar cuenta', { nth: 0, wait: 600 });
    await text(driver, 'Eliminar cuenta').last().click();
    await driver.page.waitForTimeout(3000);
    await shot(driver, 'cuenta-borrada');
    await expectText(driver, 'Bienvenido de nuevo');
  });

  let failed = null;
  for (const { name, run } of steps) {
    log(`→ ${name}`);
    try {
      await run();
    } catch (error) {
      failed = `${name}: ${error.message.split('\n')[0]}`;
      log(`✗ ${failed}`);
      break;
    }
  }

  await browser.close();
  log(`Capturas en ${OUT_DIR}`);
  if (consoleErrors.length) {
    log(`Errores de consola (${consoleErrors.length}):\n  ${[...new Set(consoleErrors)].join('\n  ')}`);
  }
  if (failed || consoleErrors.length) {
    process.exit(1);
  }
  log('Recorrido completo sin errores');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

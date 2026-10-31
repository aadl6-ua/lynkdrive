#!/usr/bin/env node
/**
 * Genera las capturas de docs/screenshots con Playwright sobre la versión web de la app.
 *
 * Requisitos: app web sirviendo en WEB_URL (p. ej. `npx expo start --web` o un export estático),
 * API apuntando a una BD con los datos de scripts/seed-demo.js y Playwright instalado
 * (`npx -y -p playwright@1 node scripts/dev/capture-screenshots.js` si no está en el proyecto).
 *
 * Variables: WEB_URL (http://localhost:8081), DEMO_PASSWORD (la usada en el seed),
 * DEMO_EMAIL_DOMAIN (demo.lynkdrive.es), DEMO_IMAGES_DIR (fotos para el checklist),
 * OUT_DIR (docs/screenshots), ONLY (lista separada por comas de capturas a generar).
 */
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Falta Playwright: ejecuta con `npx -y -p playwright@1 node scripts/dev/capture-screenshots.js`');
  process.exit(1);
}

const WEB_URL = process.env.WEB_URL || 'http://localhost:8081';
const PASSWORD = process.env.DEMO_PASSWORD;
const DOMAIN = process.env.DEMO_EMAIL_DOMAIN || 'demo.lynkdrive.es';
const OUT_DIR = path.resolve(process.env.OUT_DIR || 'docs/screenshots');
const IMAGES_DIR = process.env.DEMO_IMAGES_DIR;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
// Campus de la Universidad de Alicante: los coches demo de la zona salen cerca.
const GEO = { latitude: 38.3853, longitude: -0.5137 };

if (!PASSWORD) {
  console.error('Define DEMO_PASSWORD (la contraseña de las cuentas creadas con scripts/seed-demo.js)');
  process.exit(1);
}

const wait = (page, ms = 1200) => page.waitForTimeout(ms);

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    geolocation: GEO,
    permissions: ['geolocation']
  });
  const page = await context.newPage();
  await page.goto(WEB_URL);
  await wait(page, 2500);
  return page;
}

async function login(page, user) {
  await page.getByPlaceholder('tu@email.com').fill(`${user}@${DOMAIN}`);
  await page.getByPlaceholder('Tu contraseña').fill(PASSWORD);
  await page.getByText('Iniciar sesión', { exact: true }).last().click();
  await wait(page, 3000);
}

async function tab(page, name) {
  await page.getByText(name, { exact: true }).last().click();
  await wait(page, 2000);
}

const shots = {
  'auth.png': async (page) => {},
  'explore-list.png': async (page) => {
    await login(page, 'pablo');
  },
  'explore-map.png': async (page) => {
    await login(page, 'pablo');
    await page.getByText('Mapa', { exact: true }).first().click();
    await wait(page, 4000);
  },
  'vehicle-detail.png': async (page) => {
    await login(page, 'pablo');
    await page.getByText('Toyota Corolla Hybrid').first().click();
    await wait(page, 2500);
  },
  'booking-calendar.png': async (page) => {
    await login(page, 'pablo');
    await page.getByText('Toyota Corolla Hybrid').first().click();
    await wait(page, 2000);
    await page.getByText('Solicitar reserva', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.getByText('Elegir fecha').first().click();
    await wait(page, 600);
    // Se usa el mes siguiente para que haya días libres y días ocupados por reservas.
    await page.getByLabel('Mes siguiente').click();
    await wait(page, 400);
    const next = new Date();
    next.setMonth(next.getMonth() + 1, 1);
    const month = monthName(next);
    await page.getByLabel(`18 de ${month}`, { exact: true }).click();
    await wait(page, 400);
    await page.getByLabel(`21 de ${month}`, { exact: true }).click();
    await wait(page, 600);
    // Se reabre el calendario de "Hasta" para que se vea el rango marcado.
    await page.getByLabel(/^Hasta:/).click();
    await wait(page, 800);
    await page.getByText('Solicitar reserva', { exact: true }).first().scrollIntoViewIfNeeded();
    await wait(page, 400);
  },
  'trip-detail.png': async (page) => {
    await login(page, 'lucia');
    await tab(page, 'Mis Viajes');
    await page.getByText('Seat Ibiza').first().click();
    await wait(page, 2000);
  },
  'checklist.png': async (page) => {
    await login(page, 'sara');
    await tab(page, 'Mis Viajes');
    await page.getByText('Seat Ibiza').first().click();
    await wait(page, 2000);
    await page.getByText('Rellenar devolución').click();
    await wait(page, 1000);
    await page.getByPlaceholder('Ej. 45210').fill('34320');
    await page.getByPlaceholder('0 - 100').fill('75');
    await page.getByPlaceholder('Rayones, golpes, limpieza, objetos olvidados…').fill('Devuelto limpio. Pequeño arañazo ya existente en la puerta trasera.');

    if (IMAGES_DIR) {
      const files = fs.readdirSync(IMAGES_DIR).filter((name) => /\.(jpe?g|png)$/i.test(name)).slice(0, 3);
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Añadir fotos').click()]);
      await chooser.setFiles(files.map((name) => path.join(IMAGES_DIR, name)));
      await wait(page, 2500);
    }

    await page.getByText('Fotos de evidencia').first().scrollIntoViewIfNeeded();
    await wait(page, 600);
  },
  'my-vehicles.png': async (page) => {
    await login(page, 'lucia');
    await tab(page, 'Mis Vehículos');
  },
  'profile.png': async (page) => {
    await login(page, 'pablo');
    await tab(page, 'Perfil');
  }
};

// Igual que en CalendarPicker ("Noviembre").
function monthName(date) {
  const name = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(date);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const [file, run] of Object.entries(shots)) {
    if (ONLY.length > 0 && !ONLY.includes(file)) {
      continue;
    }

    const page = await newPage(browser);

    try {
      await run(page);
      await page.screenshot({ path: path.join(OUT_DIR, file) });
      console.log(`OK  ${file}`);
    } catch (error) {
      console.error(`ERR ${file}: ${error.message.split('\n')[0]}`);
    } finally {
      await page.context().close();
    }
  }

  await browser.close();
})();

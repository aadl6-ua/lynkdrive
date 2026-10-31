#!/usr/bin/env node
/**
 * Datos de demostración para presentar LynkDrive (demo en directo, vídeo promocional, capturas).
 *
 * Crea 6 usuarios verificados en Supabase Auth (el trigger los copia a public.users),
 * 8 vehículos en Alicante, Elche, Valencia y Madrid con disponibilidad, y reservas en todos
 * los estados (completadas con checklists y reseñas, en curso, pagada, aceptada, pendientes,
 * rechazada y cancelada), con fechas relativas a hoy para que la demo siempre parezca actual.
 *
 * Uso:
 *   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   DEMO_PASSWORD='una-contraseña' node scripts/seed-demo.js [--reset]
 *
 * Variables opcionales:
 *   DEMO_EMAIL_DOMAIN   dominio de los emails demo (por defecto demo.lynkdrive.es)
 *   DEMO_IMAGES_DIR     carpeta con fotos .jpg/.png/.webp; se suben al bucket de vehículos
 *                       en orden alfabético, repartidas entre los coches (p. ej. ibiza-1.jpg, ...).
 *                       Si un fichero empieza por la matrícula sin espacios (1234KLM-...), va a ese coche.
 *   SUPABASE_STORAGE_VEHICLES_BUCKET  (por defecto vehicles)
 *
 * --reset borra antes los datos demo previos (solo los vehículos con matrícula DEMO y sus reservas).
 * La contraseña se lee de una variable de entorno, nunca de los argumentos del proceso.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const EMAIL_DOMAIN = process.env.DEMO_EMAIL_DOMAIN || 'demo.lynkdrive.es';
const IMAGES_DIR = process.env.DEMO_IMAGES_DIR;
const VEHICLES_BUCKET = process.env.SUPABASE_STORAGE_VEHICLES_BUCKET || 'vehicles';
const DOCUMENTS_BUCKET = process.env.SUPABASE_STORAGE_DOCUMENTS_BUCKET || 'documents';
const RESET = process.argv.includes('--reset');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const USERS = [
  { key: 'lucia', first: 'Lucía', last: 'Martínez Soler', phone: '+34 611 204 318' },
  { key: 'pablo', first: 'Pablo', last: 'García Ferrer', phone: '+34 622 571 093' },
  { key: 'marta', first: 'Marta', last: 'Ruiz Navarro', phone: '+34 633 918 452' },
  { key: 'javier', first: 'Javier', last: 'López Ortega', phone: '+34 644 327 806' },
  { key: 'sara', first: 'Sara', last: 'Belmonte Gil', phone: '+34 655 860 147' },
  { key: 'dani', first: 'Daniel', last: 'Pérez Vidal', phone: '+34 666 413 529' }
];

// Matrícula con prefijo DEMO para poder identificarlos y borrarlos con --reset.
const VEHICLES = [
  {
    key: 'ibiza', owner: 'lucia', brand: 'Seat', model: 'Ibiza', year: 2019, plate: 'DEMO 1001', price: 32,
    fuel: 'gasoline', transmission: 'manual', seats: 5, lat: 38.3436, lng: -0.493,
    address: 'Avenida de Maisonnave 10, Alicante',
    description: 'Ibiza FR muy cuidado, perfecto para moverte por Alicante o escaparte a la playa. Bluetooth, Android Auto y aire acondicionado. No se permite fumar.'
  },
  {
    key: 'corolla', owner: 'lucia', brand: 'Toyota', model: 'Corolla Hybrid', year: 2021, plate: 'DEMO 1002', price: 45,
    fuel: 'hybrid', transmission: 'automatic', seats: 5, lat: 38.3607, lng: -0.471,
    address: 'Avenida de Dénia 50, Alicante',
    description: 'Híbrido automático, consumo de 4,5 l/100 km. Ideal para viajes largos: control de crucero adaptativo y cámara trasera.'
  },
  {
    key: 'clio', owner: 'marta', brand: 'Renault', model: 'Clio', year: 2020, plate: 'DEMO 1003', price: 28,
    fuel: 'gasoline', transmission: 'manual', seats: 5, lat: 38.3964, lng: -0.5255,
    address: 'Calle San Vicente 45, San Vicente del Raspeig',
    description: 'A 5 minutos de la Universidad de Alicante. Pequeño, fácil de aparcar y muy económico. Admite mascotas con transportín.'
  },
  {
    key: 'model3', owner: 'javier', brand: 'Tesla', model: 'Model 3', year: 2022, plate: 'DEMO 1004', price: 79,
    fuel: 'electric', transmission: 'automatic', seats: 5, lat: 40.42, lng: -3.7025,
    address: 'Gran Vía 28, Madrid',
    description: 'Autonomía real de 450 km. Incluye cable tipo 2 y acceso a supercargadores. Entrega con la batería por encima del 80 %.'
  },
  {
    key: 'golf', owner: 'javier', brand: 'Volkswagen', model: 'Golf', year: 2018, plate: 'DEMO 1005', price: 38,
    fuel: 'diesel', transmission: 'manual', seats: 5, lat: 40.4153, lng: -3.7074,
    address: 'Plaza Mayor 1, Madrid',
    description: 'Golf TDI fiable y con maletero amplio. Perfecto para salir de Madrid el fin de semana.'
  },
  {
    key: 'sandero', owner: 'marta', brand: 'Dacia', model: 'Sandero Stepway', year: 2021, plate: 'DEMO 1006', price: 30,
    fuel: 'gasoline', transmission: 'manual', seats: 5, lat: 39.4699, lng: -0.3741,
    address: 'Calle Colón 20, Valencia',
    description: 'Espacioso y sencillo, con un maletero enorme. Recogida en el centro de Valencia.'
  },
  {
    key: 'c3', owner: 'lucia', brand: 'Citroën', model: 'C3', year: 2017, plate: 'DEMO 1007', price: 25,
    fuel: 'diesel', transmission: 'manual', seats: 5, lat: 38.2669, lng: -0.6983,
    address: 'Calle Mayor 3, Elche',
    description: 'El más barato de la zona. Ideal para estudiantes: poco consumo y seguro con asistencia en carretera.'
  },
  {
    key: 'tourneo', owner: 'javier', brand: 'Ford', model: 'Tourneo Custom', year: 2020, plate: 'DEMO 1008', price: 85,
    fuel: 'diesel', transmission: 'manual', seats: 9, lat: 40.4378, lng: -3.6795,
    address: 'Calle de Serrano 90, Madrid',
    description: 'Furgoneta de 9 plazas para viajes en grupo, conciertos o excursiones. Portabicicletas bajo petición.'
  }
];

function at(daysFromNow, hour) {
  const date = new Date(Date.now() + daysFromNow * DAY);
  // Horas pensadas en Madrid (UTC+1/+2): se guardan en UTC restando 1 h.
  date.setUTCHours(hour - 1, 0, 0, 0);
  return date;
}

// [vehículo, conductor, día inicio, hora, día fin, hora, estado]
const BOOKINGS = [
  ['ibiza', 'pablo', -40, 10, -37, 19, 'completed'],
  ['corolla', 'sara', -25, 9, -22, 20, 'completed'],
  ['clio', 'pablo', -18, 10, -16, 18, 'completed'],
  ['model3', 'dani', -12, 11, -9, 19, 'completed'],
  ['golf', 'sara', -8, 9, -6, 18, 'completed'],
  ['sandero', 'dani', -30, 10, -28, 19, 'completed'],
  ['ibiza', 'sara', -1, 10, 2, 19, 'in_progress'],
  ['corolla', 'pablo', 4, 9, 7, 19, 'paid_confirmed'],
  ['model3', 'pablo', 10, 10, 13, 18, 'accepted'],
  ['clio', 'sara', 6, 10, 8, 18, 'pending'],
  ['tourneo', 'dani', 15, 9, 17, 20, 'pending'],
  ['golf', 'pablo', 20, 10, 22, 18, 'pending'],
  ['c3', 'dani', -5, 10, -3, 18, 'cancelled'],
  ['sandero', 'pablo', 12, 10, 14, 18, 'rejected']
];

const REVIEWS = {
  0: [[5, 'Lucía fue muy puntual y el coche estaba impecable. Repetiré seguro.'], [5, 'Pablo lo devolvió limpio y con el depósito lleno. Un placer.']],
  1: [[4, 'Coche cómodo y económico. La recogida se retrasó un poco, pero todo bien.'], [5, 'Sara cuidó el coche como si fuera suyo.']],
  2: [[5, 'Perfecto para ir a la universidad. Marta muy atenta.'], [4, 'Todo correcto, buena comunicación.']],
  3: [[5, 'Conducir el Model 3 fue una pasada. Javier lo explicó todo genial.'], [5, 'Daniel muy responsable, lo devolvió cargado.']],
  4: [[4, 'Buen coche para el fin de semana.'], [5, 'Sin ninguna incidencia, recomendable.']],
  5: [[5, 'Muy fácil todo, el coche estaba como nuevo.']]
};

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function adminCreateUser(email, user) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: user.first, last_name: user.last, terms_accepted_at: new Date().toISOString(), terms_version: 'demo' }
    })
  });

  if (response.ok) {
    return (await response.json()).id;
  }

  // 422: ya existe (re-ejecución). Cualquier otro error se muestra sin el cuerpo completo.
  if (response.status !== 422) {
    fail(`no se pudo crear ${email} en Supabase Auth (HTTP ${response.status})`);
  }

  return null;
}

async function uploadImage(filePath, ownerId) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extension];
  const objectPath = `vehicle_image/${ownerId}/demo-${randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${VEHICLES_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: fs.readFileSync(filePath)
  });

  if (!response.ok) {
    fail(`no se pudo subir ${path.basename(filePath)} (HTTP ${response.status})`);
  }

  return `supabase://${VEHICLES_BUCKET}/${objectPath}`;
}

function listImages() {
  if (!IMAGES_DIR) {
    return [];
  }

  if (!fs.existsSync(IMAGES_DIR)) {
    fail(`DEMO_IMAGES_DIR no existe: ${IMAGES_DIR}`);
  }

  return fs
    .readdirSync(IMAGES_DIR)
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .sort()
    .map((name) => path.join(IMAGES_DIR, name));
}

async function main() {
  if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    fail('faltan DATABASE_URL, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
    fail('define DEMO_PASSWORD (mínimo 8 caracteres) para las cuentas demo');
  }

  const db = new Client({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined });
  await db.connect();

  try {
    const existing = await db.query(`SELECT count(*)::int AS n FROM vehicles WHERE license_plate LIKE 'DEMO %'`);

    if (existing.rows[0].n > 0 && !RESET) {
      fail('ya hay datos demo. Usa --reset para borrarlos y volver a crearlos');
    }

    if (RESET) {
      await db.query('BEGIN');
      await db.query(`DELETE FROM reviews WHERE booking_id IN (SELECT b.id FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id WHERE v.license_plate LIKE 'DEMO %')`);
      await db.query(`DELETE FROM bookings WHERE vehicle_id IN (SELECT id FROM vehicles WHERE license_plate LIKE 'DEMO %')`);
      await db.query(`DELETE FROM vehicles WHERE license_plate LIKE 'DEMO %'`);
      await db.query('COMMIT');
      console.log('Datos demo anteriores eliminados.');
    }

    // 1. Usuarios (Supabase Auth -> trigger -> public.users), verificados y con perfil completo.
    const userIds = {};

    for (const user of USERS) {
      const email = `${user.key}@${EMAIL_DOMAIN}`;
      let id = await adminCreateUser(email, user);

      if (!id) {
        const found = await db.query('SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1', [email]);
        id = found.rows[0]?.id;
      }

      if (!id) {
        fail(`no se encontró el usuario ${email}`);
      }

      // Referencias de documentos para que el perfil aparezca completo; los ficheros no se suben.
      await db.query(
        `UPDATE users SET first_name = $2, last_name = $3, phone_number = $4, is_verified = TRUE, deleted_at = NULL,
                id_document_url = $5, driver_license_url = $6
         WHERE id = $1`,
        [id, user.first, user.last, user.phone, `supabase://${DOCUMENTS_BUCKET}/id_document/${id}/demo.jpg`,
          `supabase://${DOCUMENTS_BUCKET}/driver_license/${id}/demo.jpg`]
      );
      userIds[user.key] = id;
      console.log(`Usuario ${email}`);
    }

    // 2. Vehículos con disponibilidad desde hace 60 días hasta dentro de 120.
    const vehicleIds = {};

    for (const vehicle of VEHICLES) {
      const result = await db.query(
        `INSERT INTO vehicles (owner_id, brand, model, year, license_plate, description, price_per_day, location,
                               location_address, fuel_type, transmission, seats, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, $11, $12, $13, 'active')
         RETURNING id`,
        [userIds[vehicle.owner], vehicle.brand, vehicle.model, vehicle.year, vehicle.plate, vehicle.description,
          vehicle.price, vehicle.lng, vehicle.lat, vehicle.address, vehicle.fuel, vehicle.transmission, vehicle.seats]
      );
      vehicleIds[vehicle.key] = result.rows[0].id;
      await db.query(
        `INSERT INTO vehicle_availability_windows (vehicle_id, start_datetime, end_datetime) VALUES ($1, $2, $3)`,
        [vehicleIds[vehicle.key], at(-60, 8), at(120, 22)]
      );
    }

    console.log(`${VEHICLES.length} vehículos con disponibilidad`);

    // 3. Fotos opcionales.
    const images = listImages();

    if (images.length > 0) {
      const perVehicle = {};

      images.forEach((filePath, index) => {
        const byPlate = VEHICLES.find((vehicle) =>
          path.basename(filePath).toUpperCase().startsWith(vehicle.plate.replace(/\s/g, ''))
        );
        const vehicle = byPlate ?? VEHICLES[index % VEHICLES.length];
        (perVehicle[vehicle.key] ||= []).push(filePath);
      });

      for (const vehicle of VEHICLES) {
        for (const [index, filePath] of (perVehicle[vehicle.key] || []).entries()) {
          const url = await uploadImage(filePath, userIds[vehicle.owner]);
          await db.query(`INSERT INTO vehicle_images (vehicle_id, image_url, is_primary) VALUES ($1, $2, $3)`, [
            vehicleIds[vehicle.key],
            url,
            index === 0
          ]);
        }
      }

      console.log(`${images.length} fotos subidas`);
    } else {
      console.log('Sin DEMO_IMAGES_DIR: los vehículos se crean sin fotos.');
    }

    // 4. Reservas en todos los estados, con checklists y reseñas coherentes.
    for (const [index, [vehicleKey, driverKey, startDay, startHour, endDay, endHour, status]] of BOOKINGS.entries()) {
      const vehicle = VEHICLES.find((item) => item.key === vehicleKey);
      const start = at(startDay, startHour);
      const end = at(endDay, endHour);
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY));
      const total = days * vehicle.price;
      const contact = ['accepted', 'paid_confirmed', 'in_progress', 'completed'].includes(status)
        ? `WhatsApp ${USERS.find((user) => user.key === vehicle.owner).phone}`
        : null;
      const paid = ['paid_confirmed', 'in_progress', 'completed'].includes(status);

      const booking = await db.query(
        `INSERT INTO bookings (vehicle_id, driver_id, start_datetime, end_datetime, price_per_day_at_booking, platform_fee,
                               total_price, status, payment_intent_id, payout_status, owner_contact_method, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $11)
         RETURNING id`,
        [vehicleIds[vehicleKey], userIds[driverKey], start, end, vehicle.price, total, status,
          paid ? `pi_prototype_demo_${index}` : null, status === 'completed' ? 'paid' : 'pending', contact,
          new Date(start.getTime() - 6 * DAY)]
      );
      const bookingId = booking.rows[0].id;
      const baseMileage = 30000 + index * 4100;

      if (['in_progress', 'completed'].includes(status)) {
        await db.query(
          `INSERT INTO booking_checklists (booking_id, type, submitted_by, mileage, fuel_level, notes, created_at)
           VALUES ($1, 'check_in', $2, $3, 90, 'Sin daños visibles. Interior limpio.', $4)`,
          [bookingId, userIds[driverKey], baseMileage, start]
        );
      }

      if (status === 'completed') {
        await db.query(
          `INSERT INTO booking_checklists (booking_id, type, submitted_by, mileage, fuel_level, notes, created_at)
           VALUES ($1, 'check_out', $2, $3, 85, 'Devuelto en el mismo estado.', $4)`,
          [bookingId, userIds[driverKey], baseMileage + 180 + index * 37, end]
        );

        const [driverReview, ownerReview] = REVIEWS[index] || [];
        const reviewedAt = new Date(end.getTime() + 3 * HOUR);

        if (driverReview) {
          await db.query(
            `INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
            [bookingId, userIds[driverKey], userIds[vehicle.owner], driverReview[0], driverReview[1], reviewedAt]
          );
        }

        if (ownerReview) {
          await db.query(
            `INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
            [bookingId, userIds[vehicle.owner], userIds[driverKey], ownerReview[0], ownerReview[1], reviewedAt]
          );
        }
      }
    }

    console.log(`${BOOKINGS.length} reservas en todos los estados`);
    console.log(`\nListo. Cuentas: ${USERS.map((user) => `${user.key}@${EMAIL_DOMAIN}`).join(', ')}`);
    console.log('Contraseña: la de DEMO_PASSWORD. Propietarios: lucia, marta, javier. Conductores: pablo, sara, dani.');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

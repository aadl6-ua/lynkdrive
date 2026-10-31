#!/usr/bin/env node
/**
 * Mock mínimo de Nominatim (/search) para el recorrido e2e local sin acceso a internet.
 * Devuelve lugares fijos de la zona de Alicante cuyo nombre contiene la consulta.
 * Uso: node scripts/e2e-web/nominatim-mock.js  (puerto NOMINATIM_MOCK_PORT, por defecto 54330)
 * y arrancar la API con NOMINATIM_BASE_URL=http://localhost:54330.
 */
const http = require('node:http');

const PORT = Number(process.env.NOMINATIM_MOCK_PORT || 54330);
const PLACES = [
  { name: 'Universidad de Alicante, San Vicente del Raspeig', city: 'San Vicente del Raspeig', lat: 38.3853, lon: -0.5137 },
  { name: 'Calle Mayor 5, San Vicente del Raspeig', city: 'San Vicente del Raspeig', lat: 38.3964, lon: -0.5255 },
  { name: 'Plaza de los Luceros, Alicante', city: 'Alicante', lat: 38.3468, lon: -0.4906 },
  { name: 'Estación de Alicante, Avenida de Salamanca, Alicante', city: 'Alicante', lat: 38.3445, lon: -0.4955 },
  { name: 'Playa de San Juan, Alicante', city: 'Alicante', lat: 38.3739, lon: -0.4142 },
  { name: 'Plaza de Baix, Elche', city: 'Elche', lat: 38.2669, lon: -0.6984 },
  { name: 'Plaza del Ayuntamiento, Valencia', city: 'Valencia', lat: 39.4699, lon: -0.3763 },
  { name: 'Puerta del Sol, Madrid', city: 'Madrid', lat: 40.4169, lon: -3.7035 }
];

const normalize = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== '/search') {
      res.writeHead(404).end();
      return;
    }
    const terms = normalize(url.searchParams.get('q') || '').split(/[\s,]+/).filter(Boolean);
    const limit = Number(url.searchParams.get('limit') || 5);
    const results = PLACES.filter((place) => terms.every((term) => normalize(place.name).includes(term)))
      .slice(0, limit)
      .map((place) => ({
        place_id: 1000 + PLACES.indexOf(place),
        display_name: `${place.name}, España`,
        lat: String(place.lat),
        lon: String(place.lon),
        address: { city: place.city, country: 'España' }
      }));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(results));
  })
  .listen(PORT, () => console.log(`Nominatim mock en http://localhost:${PORT}`));

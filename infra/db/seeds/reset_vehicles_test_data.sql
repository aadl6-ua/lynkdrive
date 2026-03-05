BEGIN;

-- 1) Asegurar usuario owner de pruebas (mismo UUID que usa la app por defecto).
INSERT INTO users (
  id,
  first_name,
  last_name,
  phone_number,
  avatar_url,
  id_document_url,
  driver_license_url,
  is_verified,
  stripe_customer_id,
  stripe_account_id,
  deleted_at
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Demo',
  'Owner',
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  NULL,
  NULL,
  NULL
)
ON CONFLICT (id)
DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  deleted_at = NULL;

-- 2) Vaciar vehículos (incluye activos e históricos soft-delete).
DELETE FROM vehicles;

-- 3) Insertar dataset controlado para pruebas geoespaciales.
--    4 coches en Madrid (cerca de 40.4168, -3.7038) y 1 en Valencia.
INSERT INTO vehicles (
  owner_id,
  brand,
  model,
  year,
  license_plate,
  description,
  price_per_day,
  location,
  location_address,
  fuel_type,
  transmission,
  seats,
  status
)
VALUES
(
  '11111111-1111-4111-8111-111111111111',
  'Toyota',
  'Corolla',
  2020,
  'MAD1001',
  'Centro Madrid',
  45,
  ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326),
  'Madrid Centro',
  'hybrid',
  'automatic',
  5,
  'active'
),
(
  '11111111-1111-4111-8111-111111111111',
  'Renault',
  'Clio',
  2019,
  'MAD1002',
  'Barrio Salamanca',
  38,
  ST_SetSRID(ST_MakePoint(-3.6960, 40.4185), 4326),
  'Madrid Salamanca',
  'gasoline',
  'manual',
  5,
  'active'
),
(
  '11111111-1111-4111-8111-111111111111',
  'Seat',
  'Leon',
  2021,
  'MAD1003',
  'Atocha',
  50,
  ST_SetSRID(ST_MakePoint(-3.7102, 40.4120), 4326),
  'Madrid Atocha',
  'diesel',
  'manual',
  5,
  'active'
),
(
  '11111111-1111-4111-8111-111111111111',
  'Tesla',
  'Model 3',
  2022,
  'MAD1004',
  'Moncloa',
  79,
  ST_SetSRID(ST_MakePoint(-3.7210, 40.4300), 4326),
  'Madrid Moncloa',
  'electric',
  'automatic',
  5,
  'active'
),
(
  '11111111-1111-4111-8111-111111111111',
  'Ford',
  'Focus',
  2018,
  'VAL1001',
  'Centro Valencia',
  35,
  ST_SetSRID(ST_MakePoint(-0.3763, 39.4699), 4326),
  'Valencia Centro',
  'gasoline',
  'manual',
  5,
  'active'
);

COMMIT;

-- ==========================================================
-- CONSULTAS DE VERIFICACIÓN (ejecuta después del script)
-- ==========================================================

-- Caso 1: Madrid 5 km => esperado: 4 coches.
-- SELECT count(*)
-- FROM vehicles
-- WHERE ST_DWithin(
--   location::geography,
--   ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)::geography,
--   5000
-- );

-- Caso 2: Valencia 3 km => esperado: 1 coche.
-- SELECT count(*)
-- FROM vehicles
-- WHERE ST_DWithin(
--   location::geography,
--   ST_SetSRID(ST_MakePoint(-0.3763, 39.4699), 4326)::geography,
--   3000
-- );

-- Caso 3: Madrid 400 km => esperado: 5 coches.
-- SELECT count(*)
-- FROM vehicles
-- WHERE ST_DWithin(
--   location::geography,
--   ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)::geography,
--   400000
-- );

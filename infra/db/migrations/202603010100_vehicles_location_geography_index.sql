-- La busqueda geoespacial usa ST_DWithin(location::geography, ...), que no aprovecha el indice
-- GiST sobre la columna geometry. Indice funcional sobre el mismo cast que usa la consulta.

CREATE INDEX IF NOT EXISTS idx_vehicles_location_geography
  ON vehicles USING GIST ((location::geography));

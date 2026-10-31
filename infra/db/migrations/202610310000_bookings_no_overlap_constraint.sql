-- Garantia en BD de que no hay solapes entre reservas que bloquean calendario del mismo vehiculo.
-- Misma regla que la API (HANDOVER_BUFFER_HOURS = 2): cada reserva ocupa [inicio, fin + 2h).
-- Las pending, rejected y cancelled no bloquean.
-- Si ya existen solapes, la migracion falla indicando las reservas afectadas para resolverlas a mano.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- timestamptz + interval es STABLE (los intervalos en dias/meses dependen de la zona horaria);
-- sumar horas fijas no depende de ella, asi que esta funcion es IMMUTABLE y se puede indexar.
CREATE OR REPLACE FUNCTION public.booking_blocked_range(start_at TIMESTAMPTZ, end_at TIMESTAMPTZ)
RETURNS TSTZRANGE
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT tstzrange(start_at, end_at + make_interval(hours => 2), '[)') $$;

DO $$
DECLARE
  conflicts TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'excl_bookings_no_overlap') THEN
    RETURN;
  END IF;

  SELECT string_agg(a.id || ' <-> ' || b.id, ', ')
  INTO conflicts
  FROM bookings a
  JOIN bookings b
    ON b.vehicle_id = a.vehicle_id
   AND b.id > a.id
   AND public.booking_blocked_range(a.start_datetime, a.end_datetime)
       && public.booking_blocked_range(b.start_datetime, b.end_datetime)
  WHERE a.status IN ('accepted', 'paid_confirmed', 'in_progress', 'completed')
    AND b.status IN ('accepted', 'paid_confirmed', 'in_progress', 'completed');

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Hay reservas confirmadas solapadas (con colchon de 2h): %', conflicts;
  END IF;

  ALTER TABLE bookings
    ADD CONSTRAINT excl_bookings_no_overlap
    EXCLUDE USING gist (
      vehicle_id WITH =,
      public.booking_blocked_range(start_datetime, end_datetime) WITH &&
    )
    WHERE (status IN ('accepted', 'paid_confirmed', 'in_progress', 'completed'));
END $$;

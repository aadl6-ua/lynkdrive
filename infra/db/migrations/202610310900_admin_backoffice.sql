-- Backoffice de administración: rol admin, bloqueo de usuarios, moderación de reseñas,
-- historial de estados de reservas e incidencias.
-- Idempotent migration: safe to run multiple times.

BEGIN;

-- ------------------------------------------------------------------
-- Usuarios: rol admin y bloqueo
-- ------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users (id) WHERE is_admin = TRUE;

-- ------------------------------------------------------------------
-- Vehículos: desactivación por la administración (el propietario no puede reactivarlo)
-- ------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS disabled_by_admin_at TIMESTAMP WITH TIME ZONE;

-- ------------------------------------------------------------------
-- Reseñas: moderación (ocultar sin borrar)
-- ------------------------------------------------------------------
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS hidden_reason VARCHAR(500);

-- ------------------------------------------------------------------
-- Historial de estados de reservas (lo alimenta un trigger, así cubre
-- cualquier camino: API, webhooks de Stripe y rechazos automáticos)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status booking_status_enum,
  to_status booking_status_enum NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_status_history_booking
  ON public.booking_status_history (booking_id, changed_at);

CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_status_history (booking_id, from_status, to_status)
    VALUES (NEW.id, NULL, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history (booking_id, from_status, to_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_status_history ON public.bookings;
CREATE TRIGGER trg_booking_status_history
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_booking_status_change();

-- Backfill: las reservas previas reciben una entrada con su estado actual.
INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_at)
SELECT b.id, NULL, b.status, b.updated_at
FROM public.bookings b
WHERE NOT EXISTS (
  SELECT 1 FROM public.booking_status_history h WHERE h.booking_id = b.id
);

-- ------------------------------------------------------------------
-- Incidencias
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open' NOT NULL
    CONSTRAINT chk_incidents_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_created ON public.incidents (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.incident_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_notes_incident ON public.incident_notes (incident_id, created_at);

COMMIT;

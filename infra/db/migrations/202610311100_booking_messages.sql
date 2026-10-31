-- Chat interno por reserva: mensajes entre conductor y propietario.
-- Idempotent migration: safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  -- Momento en que el destinatario (la otra parte de la reserva) lo leyó.
  read_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT chk_booking_messages_body CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_booking_messages_booking_created
  ON public.booking_messages (booking_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_booking_messages_unread
  ON public.booking_messages (booking_id, sender_id)
  WHERE read_at IS NULL;

COMMIT;

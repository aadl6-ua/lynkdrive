-- Stripe Connect (modo test): cuenta Express del propietario y búsquedas de webhooks.
-- Idempotent migration: safe to run multiple times.

BEGIN;

-- Cuenta Connect Express del propietario (acct_...). Ya forma parte del esquema base;
-- se garantiza aquí por si la BD se creó sin ella.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(100);

-- Una cuenta Connect pertenece a un único usuario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_stripe_account_id
  ON public.users (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- El webhook payment_intent.succeeded localiza la reserva por payment_intent_id
-- cuando el intent no trae metadata.bookingId.
CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent_id
  ON public.bookings (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

COMMIT;

-- Notificaciones push (Expo): tokens de dispositivo por usuario.
-- Idempotent migration: safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- ExponentPushToken[...] (un dispositivo pertenece a un único usuario a la vez).
  token VARCHAR(255) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_token ON public.push_tokens (token);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens (user_id);

COMMIT;

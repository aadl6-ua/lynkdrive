-- Sync Supabase Auth users into public.users on signup.
-- Idempotent migration: safe to run multiple times.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
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
    created_at,
    deleted_at
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''), 'Pendiente'),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''), 'Pendiente'),
    NULL,
    NULL,
    NULL,
    NULL,
    FALSE,
    NULL,
    NULL,
    NOW(),
    NULL
  )
  ON CONFLICT (id)
  DO UPDATE SET
    deleted_at = NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_created();

-- Backfill existing auth users missing in public.users.
INSERT INTO public.users (
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
  created_at,
  deleted_at
)
SELECT
  au.id,
  COALESCE(NULLIF(au.raw_user_meta_data ->> 'first_name', ''), 'Pendiente'),
  COALESCE(NULLIF(au.raw_user_meta_data ->> 'last_name', ''), 'Pendiente'),
  NULL,
  NULL,
  NULL,
  NULL,
  FALSE,
  NULL,
  NULL,
  NOW(),
  NULL
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;

COMMIT;

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const MAX_SIGNED_URL_TTL_SECONDS = 3600;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

export type StorageReference = {
  bucket: string;
  path: string;
};

let cachedClient: SupabaseClient | null = null;

// Cliente con service role: solo para uso en servidor, nunca se expone al cliente.
export function getSupabaseAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return cachedClient;
}

export function getSignedUrlTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS ?? '', 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  return Math.min(parsed, MAX_SIGNED_URL_TTL_SECONDS);
}

// Interpreta valores persistidos con formato supabase://<bucket>/<path>.
export function parseStorageReference(value: string | null | undefined): StorageReference | null {
  if (!value || !value.startsWith('supabase://')) {
    return null;
  }

  const withoutScheme = value.slice('supabase://'.length);
  const separatorIndex = withoutScheme.indexOf('/');

  if (separatorIndex <= 0) {
    return null;
  }

  const bucket = withoutScheme.slice(0, separatorIndex);
  const path = withoutScheme.slice(separatorIndex + 1);

  if (!path || path.split('/').some((segment) => segment === '..' || segment === '')) {
    return null;
  }

  return { bucket, path };
}

export type SignedFile = {
  url: string | null;
  expiresAt: string | null;
};

/**
 * Devuelve una URL legible para un valor persistido: URL firmada temporal si es una
 * referencia `supabase://`, la propia URL si ya es pública, o null si no se puede resolver.
 */
export async function resolveFileUrl(value: string | null | undefined): Promise<SignedFile> {
  if (!value) {
    return { url: null, expiresAt: null };
  }

  if (/^https?:\/\//i.test(value)) {
    return { url: value, expiresAt: null };
  }

  const reference = parseStorageReference(value);
  const supabase = getSupabaseAdminClient();

  if (!reference || !supabase) {
    return { url: null, expiresAt: null };
  }

  const ttlSeconds = getSignedUrlTtlSeconds();
  const { data, error } = await supabase.storage.from(reference.bucket).createSignedUrl(reference.path, ttlSeconds);

  if (error || !data?.signedUrl) {
    return { url: null, expiresAt: null };
  }

  return { url: data.signedUrl, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
}

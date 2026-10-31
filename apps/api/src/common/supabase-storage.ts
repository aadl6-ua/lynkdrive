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

// Las subidas siempre guardan en <target>/<userId>/..., así que el segundo segmento identifica al autor.
export function isStorageReferenceOwnedBy(reference: StorageReference, userId: string): boolean {
  return reference.path.split('/')[1] === userId;
}

/**
 * Valida un valor de imagen enviado por el cliente: si es una referencia de storage
 * debe pertenecer al usuario y a uno de los buckets permitidos; si no, solo se
 * aceptan URLs https cuando allowExternal es true.
 */
export function isAcceptableImageValue(
  value: string,
  userId: string,
  options: { buckets: string[]; allowExternal: boolean }
): boolean {
  if (value.startsWith('supabase://')) {
    const reference = parseStorageReference(value);
    return !!reference && options.buckets.includes(reference.bucket) && isStorageReferenceOwnedBy(reference, userId);
  }

  return options.allowExternal && /^https:\/\/\S+$/i.test(value);
}

export async function removeStorageReferences(
  supabase: SupabaseClient | null,
  references: StorageReference[]
): Promise<string[]> {
  const failedBuckets: string[] = [];

  if (!supabase || references.length === 0) {
    return failedBuckets;
  }

  const pathsByBucket = new Map<string, string[]>();

  for (const reference of references) {
    pathsByBucket.set(reference.bucket, [...(pathsByBucket.get(reference.bucket) ?? []), reference.path]);
  }

  for (const [bucket, paths] of pathsByBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      failedBuckets.push(bucket);
    }
  }

  return failedBuckets;
}

export function getStorageBuckets() {
  return {
    vehicles: process.env.SUPABASE_STORAGE_VEHICLES_BUCKET ?? 'vehicles',
    avatars: process.env.SUPABASE_STORAGE_AVATARS_BUCKET ?? 'avatars',
    documents:
      process.env.SUPABASE_STORAGE_DOCUMENTS_BUCKET ?? process.env.SUPABASE_STORAGE_USER_DOCS_BUCKET ?? 'documents',
    checklists: process.env.SUPABASE_STORAGE_CHECKLISTS_BUCKET ?? 'checklists'
  };
}

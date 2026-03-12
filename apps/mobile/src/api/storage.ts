const storageBaseFromUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1`
  : undefined;

const storageBaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_STORAGE_URL ??
  storageBaseFromUrl ??
  null;

const publicBuckets = new Set(
  (process.env.EXPO_PUBLIC_SUPABASE_PUBLIC_BUCKETS ?? 'vehicles,avatars')
    .split(',')
    .map((item: string) => item.trim())
    .filter(Boolean)
);

export function resolveStoredImageUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (!trimmed.startsWith('supabase://')) {
    return null;
  }

  if (!storageBaseUrl) {
    return null;
  }

  const withoutScheme = trimmed.replace('supabase://', '');
  const separatorIndex = withoutScheme.indexOf('/');

  if (separatorIndex <= 0) {
    return null;
  }

  const bucket = withoutScheme.slice(0, separatorIndex);
  const objectPath = withoutScheme.slice(separatorIndex + 1);

  if (!bucket || !objectPath) {
    return null;
  }

  if (!publicBuckets.has(bucket)) {
    return null;
  }

  const encodedPath = objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${storageBaseUrl}/object/public/${bucket}/${encodedPath}`;
}

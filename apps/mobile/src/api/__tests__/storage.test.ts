function loadResolver(env: Record<string, string | undefined>) {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  let mod!: typeof import('../storage');
  jest.isolateModules(() => {
    mod = require('../storage');
  });
  process.env = previous;
  return mod.resolveStoredImageUrl;
}

describe('resolveStoredImageUrl', () => {
  const resolve = loadResolver({
    EXPO_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
    EXPO_PUBLIC_SUPABASE_STORAGE_URL: undefined,
    EXPO_PUBLIC_SUPABASE_PUBLIC_BUCKETS: undefined
  });

  it('devuelve tal cual las URLs http(s)', () => {
    expect(resolve(' https://cdn.example.com/a.jpg ')).toBe('https://cdn.example.com/a.jpg');
    expect(resolve('http://x/y.png')).toBe('http://x/y.png');
  });

  it('resuelve supabase:// de buckets públicos codificando cada segmento', () => {
    expect(resolve('supabase://vehicles/owner 1/foto ñ.jpg')).toBe(
      'https://proyecto.supabase.co/storage/v1/object/public/vehicles/owner%201/foto%20%C3%B1.jpg'
    );
    expect(resolve('supabase://avatars/u/a.jpg')).toBe(
      'https://proyecto.supabase.co/storage/v1/object/public/avatars/u/a.jpg'
    );
  });

  it('no expone buckets privados ni valores mal formados', () => {
    expect(resolve('supabase://checklists/b/c.jpg')).toBeNull();
    expect(resolve('supabase://documents/u/dni.jpg')).toBeNull();
    expect(resolve('supabase://vehicles')).toBeNull();
    expect(resolve('supabase:///a.jpg')).toBeNull();
    expect(resolve('ftp://algo')).toBeNull();
    expect(resolve('   ')).toBeNull();
    expect(resolve(null)).toBeNull();
  });

  it('sin URL de Supabase no puede resolver rutas internas', () => {
    const resolveWithoutBase = loadResolver({
      EXPO_PUBLIC_SUPABASE_URL: undefined,
      EXPO_PUBLIC_SUPABASE_STORAGE_URL: undefined
    });
    expect(resolveWithoutBase('supabase://vehicles/a.jpg')).toBeNull();
    expect(resolveWithoutBase('https://x/a.jpg')).toBe('https://x/a.jpg');
  });
});

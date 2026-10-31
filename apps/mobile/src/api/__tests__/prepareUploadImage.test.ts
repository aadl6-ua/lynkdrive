import type { ImagePickerAsset } from 'expo-image-picker';

const mockManipulateAsync = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args)
}));

const KB = 1024;
const MB = 1024 * KB;

/** Simula fetch(uri).blob() devolviendo el tamaño asociado a cada URI. */
function mockFetchSizes(sizes: Record<string, number | Error>) {
  global.fetch = jest.fn(async (uri: string) => {
    const size = sizes[uri];
    if (size instanceof Error) {
      throw size;
    }
    return { blob: async () => ({ size: size ?? 0 }) };
  }) as unknown as typeof fetch;
}

function asset(overrides: Partial<ImagePickerAsset> = {}): ImagePickerAsset {
  return { uri: 'file:///original.png', width: 4000, height: 3000, fileName: 'foto.png', ...overrides } as ImagePickerAsset;
}

function loadModule(platform: 'ios' | 'web' = 'ios') {
  let mod!: typeof import('../prepareUploadImage');
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    mod = require('../prepareUploadImage');
  });
  return mod;
}

describe('prepareUploadImage', () => {
  let counter = 0;

  beforeEach(() => {
    counter = 0;
    mockManipulateAsync.mockReset();
    mockManipulateAsync.mockImplementation(async () => ({ uri: `file:///out-${++counter}.jpg` }));
  });

  it('comprime a JPEG redimensionando al ancho máximo del target y conservando proporción', async () => {
    mockFetchSizes({ 'file:///original.png': 5 * MB, 'file:///out-1.jpg': 800 * KB });
    const { prepareUploadImage } = loadModule();

    const result = await prepareUploadImage(asset(), 'vehicle_image');

    expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file:///original.png',
      [{ resize: { width: 1920, height: 1440 } }],
      { compress: 0.78, format: 'jpeg' }
    );
    expect(result).toEqual({
      fileUri: 'file:///out-1.jpg',
      fileName: 'foto.jpg',
      mimeType: 'image/jpeg',
      webFile: undefined
    });
  });

  it('usa el límite de 500 KB y ancho 1024 para avatares', async () => {
    // Las tres primeras calidades quedan por encima de 500 KB.
    mockFetchSizes({
      'file:///original.png': 3 * MB,
      'file:///out-1.jpg': 900 * KB,
      'file:///out-2.jpg': 700 * KB,
      'file:///out-3.jpg': 510 * KB,
      'file:///out-4.jpg': 450 * KB
    });
    const { prepareUploadImage } = loadModule();

    const result = await prepareUploadImage(asset({ width: 2048, height: 2048 }), 'avatar');

    expect(mockManipulateAsync).toHaveBeenCalledTimes(4);
    expect(mockManipulateAsync.mock.calls[0][1]).toEqual([{ resize: { width: 1024, height: 1024 } }]);
    expect(mockManipulateAsync.mock.calls.map((call) => call[2].compress)).toEqual([0.78, 0.68, 0.58, 0.48]);
    expect(result.fileUri).toBe('file:///out-4.jpg');
  });

  it('reduce la escala cuando ninguna calidad basta en el tamaño original', async () => {
    const sizes: Record<string, number> = { 'file:///original.png': 10 * MB };
    for (let i = 1; i <= 6; i += 1) sizes[`file:///out-${i}.jpg`] = 3 * MB;
    sizes['file:///out-7.jpg'] = 1 * MB;
    mockFetchSizes(sizes);
    const { prepareUploadImage } = loadModule();

    const result = await prepareUploadImage(asset(), 'checklist_image');

    expect(mockManipulateAsync).toHaveBeenCalledTimes(7);
    // Segunda escala (0.85) sobre 1920 px de ancho.
    expect(mockManipulateAsync.mock.calls[6][1]).toEqual([{ resize: { width: 1632, height: 1224 } }]);
    expect(result.fileUri).toBe('file:///out-7.jpg');
  });

  it('no amplía imágenes pequeñas y respeta el mínimo de 320 px', async () => {
    mockFetchSizes({ 'file:///original.png': 50 * KB, 'file:///out-1.jpg': 40 * KB });
    const { prepareUploadImage } = loadModule();

    await prepareUploadImage(asset({ width: 300, height: 200 }), 'id_document');

    expect(mockManipulateAsync.mock.calls[0][1]).toEqual([{ resize: { width: 320, height: 320 } }]);
  });

  it('genera un nombre por defecto si el asset no lo trae', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    mockFetchSizes({ 'file:///original.png': 1 * MB, 'file:///out-1.jpg': 100 * KB });
    const { prepareUploadImage } = loadModule();

    const result = await prepareUploadImage(asset({ fileName: null }), 'driver_license');

    expect(result.fileName).toBe('driver_license-1234.jpg');
    jest.restoreAllMocks();
  });

  it('aborta antes de subir si ni siquiera la compresión máxima baja del límite', async () => {
    const sizes: Record<string, number> = { 'file:///original.png': 20 * MB };
    for (let i = 1; i <= 30; i += 1) sizes[`file:///out-${i}.jpg`] = 3 * MB;
    mockFetchSizes(sizes);
    const { prepareUploadImage } = loadModule();

    await expect(prepareUploadImage(asset(), 'vehicle_image')).rejects.toThrow('demasiado grande');
    // 5 escalas x 6 calidades.
    expect(mockManipulateAsync).toHaveBeenCalledTimes(30);
  });

  it('si no se puede medir el tamaño, devuelve el último resultado sin bloquear', async () => {
    const sizes: Record<string, Error> = { 'file:///original.png': new Error('sin acceso') };
    for (let i = 1; i <= 30; i += 1) sizes[`file:///out-${i}.jpg`] = new Error('sin acceso');
    mockFetchSizes(sizes);
    const { prepareUploadImage } = loadModule();

    const result = await prepareUploadImage(asset(), 'vehicle_image');

    expect(result.fileUri).toBe('file:///out-30.jpg');
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('en web adjunta un File construido con el blob comprimido', async () => {
    class FakeFile {
      constructor(
        public parts: unknown[],
        public name: string,
        public options: { type: string }
      ) {}
    }
    const originalFile = (global as { File?: unknown }).File;
    (global as { File?: unknown }).File = FakeFile;
    mockFetchSizes({ 'file:///original.png': 3 * MB, 'file:///out-1.jpg': 300 * KB });
    const { prepareUploadImage } = loadModule('web');

    const result = await prepareUploadImage(asset(), 'vehicle_image');

    expect(result.webFile).toBeInstanceOf(FakeFile);
    expect((result.webFile as unknown as FakeFile).name).toBe('foto.jpg');
    expect((result.webFile as unknown as FakeFile).options).toEqual({ type: 'image/jpeg' });
    (global as { File?: unknown }).File = originalFile;
  });
});

import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient } from '@supabase/supabase-js';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

const upload = jest.fn();
const getPublicUrl = jest.fn();
const createSignedUrl = jest.fn();
const from = jest.fn(() => ({ upload, getPublicUrl, createSignedUrl }));

const ORIGINAL_ENV = { ...process.env };

const MAGIC_BYTES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  'image/webp': Buffer.from('RIFF0000WEBPVP8 ', 'ascii')
};

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  const mimetype = (overrides.mimetype ?? 'image/jpeg').toLowerCase();

  return {
    fieldname: 'file',
    originalname: 'foto.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: MAGIC_BYTES[mimetype] ?? Buffer.from('fake'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides
  };
}

async function buildService(): Promise<{ service: UploadsService; controller: UploadsController }> {
  const moduleRef = await Test.createTestingModule({
    controllers: [UploadsController],
    providers: [UploadsService]
  }).compile();

  return { service: moduleRef.get(UploadsService), controller: moduleRef.get(UploadsController) };
}

describe('UploadsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test'
    };
    delete process.env.SUPABASE_STORAGE_VEHICLES_PUBLIC;
    delete process.env.SUPABASE_STORAGE_CHECKLISTS_PUBLIC;
    (createClient as jest.Mock).mockReturnValue({ storage: { from } });
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'http://public/url.jpg' } });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'http://signed/url.jpg' }, error: null });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('falla si faltan credenciales de Supabase', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { service } = await buildService();

    await expect(service.uploadImage('avatar', 'u1', undefined, makeFile())).rejects.toBeInstanceOf(
      InternalServerErrorException
    );
  });

  it.each(['image/gif', 'application/pdf', 'text/plain', ''])('rechaza mime type %p', async (mimetype) => {
    const { service } = await buildService();

    await expect(service.uploadImage('vehicle_image', 'u1', undefined, makeFile({ mimetype }))).rejects.toThrow(
      'Tipo de archivo no permitido'
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ['avatar', 500 * 1024],
    ['vehicle_image', 2 * 1024 * 1024],
    ['id_document', 2 * 1024 * 1024],
    ['driver_license', 2 * 1024 * 1024],
    ['checklist_image', 2 * 1024 * 1024]
  ] as const)('aplica limite de tamaño para %s (%d bytes)', async (target, limit) => {
    const { service } = await buildService();

    await expect(service.uploadImage(target, 'u1', undefined, makeFile({ size: limit + 1 }))).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.uploadImage(target, 'u1', undefined, makeFile({ size: limit }))).resolves.toMatchObject({
      sizeBytes: limit
    });
  });

  it('sube imagenes de vehiculo al bucket publico y devuelve publicUrl', async () => {
    const { service } = await buildService();
    const result = await service.uploadImage('vehicle_image', 'owner-1', undefined, makeFile({ mimetype: 'IMAGE/PNG', originalname: 'coche' }));

    expect(from).toHaveBeenCalledWith('vehicles');
    expect(result.isPublicBucket).toBe(true);
    expect(result.publicUrl).toBe('http://public/url.jpg');
    expect(result.signedUrl).toBeNull();
    expect(result.fileUrl).toBe(result.publicUrl);
    expect(result.mimeType).toBe('image/png');
    expect(result.path).toMatch(/^vehicle_image\/owner-1\/\d+-[a-f0-9-]+\.png$/);
    expect(result.persistedValue).toBe(`supabase://vehicles/${result.path}`);
  });

  it('sube checklists al bucket privado y devuelve signed URL', async () => {
    const { service } = await buildService();
    const result = await service.uploadImage('checklist_image', 'u1', undefined, makeFile({ mimetype: 'image/webp', originalname: 'x.webp' }));

    expect(from).toHaveBeenCalledWith('checklists');
    expect(result.isPublicBucket).toBe(false);
    expect(result.publicUrl).toBeNull();
    expect(result.signedUrl).toBe('http://signed/url.jpg');
    expect(createSignedUrl).toHaveBeenCalledWith(result.path, 3600);
  });

  it('usa el bucket documents (privado) para DNI y carnet', async () => {
    const { service } = await buildService();
    await service.uploadImage('id_document', 'u1', undefined, makeFile());
    await service.uploadImage('driver_license', 'u1', undefined, makeFile());

    expect(from).toHaveBeenCalledWith('documents');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('sanea los segmentos de la ruta y cuelga siempre del usuario autenticado', async () => {
    const { service } = await buildService();

    const withSlashes = await service.uploadImage('avatar', 'u1', '../../etc', makeFile());
    expect(withSlashes.path.startsWith('avatar/u1/______etc/')).toBe(true);

    const sameOwner = await service.uploadImage('avatar', 'u1', 'u1', makeFile());
    expect(sameOwner.path).toMatch(/^avatar\/u1\/[^/]+$/);
  });

  it('rechaza archivos cuyo contenido no es una imagen real', async () => {
    const { service } = await buildService();

    await expect(
      service.uploadImage('avatar', 'u1', undefined, makeFile({ buffer: Buffer.from('<?php echo 1; ?>') }))
    ).rejects.toThrow('no corresponde a una imagen valida');
    expect(upload).not.toHaveBeenCalled();
  });

  it('propaga errores de Supabase Storage como 500', async () => {
    upload.mockResolvedValue({ error: { message: 'boom' } });
    const { service } = await buildService();

    await expect(service.uploadImage('avatar', 'u1', undefined, makeFile())).rejects.toThrow('Error al subir archivo');
  });

  it('el controlador rechaza targets desconocidos', async () => {
    const { controller } = await buildService();

    await expect(controller.uploadImage({ sub: 'u1', claims: { sub: 'u1' } }, 'malware', {}, makeFile())).rejects.toThrow('Target invalido');
    expect(createClient).not.toHaveBeenCalled();
  });
});

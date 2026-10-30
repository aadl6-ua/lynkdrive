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

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'foto.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('fake'),
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

    await expect(service.uploadImage('avatar', 'u1', makeFile())).rejects.toBeInstanceOf(
      InternalServerErrorException
    );
  });

  it.each(['image/gif', 'application/pdf', 'text/plain', ''])('rechaza mime type %p', async (mimetype) => {
    const { service } = await buildService();

    await expect(service.uploadImage('vehicle_image', 'u1', makeFile({ mimetype }))).rejects.toThrow(
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

    await expect(service.uploadImage(target, 'u1', makeFile({ size: limit + 1 }))).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.uploadImage(target, 'u1', makeFile({ size: limit }))).resolves.toMatchObject({
      sizeBytes: limit
    });
  });

  it('sube imagenes de vehiculo al bucket publico y devuelve publicUrl', async () => {
    const { service } = await buildService();
    const result = await service.uploadImage('vehicle_image', 'owner-1', makeFile({ mimetype: 'IMAGE/PNG', originalname: 'coche' }));

    expect(from).toHaveBeenCalledWith('vehicles');
    expect(result.isPublicBucket).toBe(true);
    expect(result.publicUrl).toBe('http://public/url.jpg');
    expect(result.signedUrl).toBeNull();
    expect(result.fileUrl).toBe(result.publicUrl);
    expect(result.mimeType).toBe('image/png');
    expect(result.path).toMatch(/^vehicle_image\/owner-1\/\d+-[a-z0-9]+\.png$/);
    expect(result.persistedValue).toBe(`supabase://vehicles/${result.path}`);
  });

  it('sube checklists al bucket privado y devuelve signed URL', async () => {
    const { service } = await buildService();
    const result = await service.uploadImage('checklist_image', 'u1', makeFile({ mimetype: 'image/webp', originalname: 'x.webp' }));

    expect(from).toHaveBeenCalledWith('checklists');
    expect(result.isPublicBucket).toBe(false);
    expect(result.publicUrl).toBeNull();
    expect(result.signedUrl).toBe('http://signed/url.jpg');
    expect(createSignedUrl).toHaveBeenCalledWith(result.path, 3600);
  });

  it('usa el bucket documents (privado) para DNI y carnet', async () => {
    const { service } = await buildService();
    await service.uploadImage('id_document', 'u1', makeFile());
    await service.uploadImage('driver_license', 'u1', makeFile());

    expect(from).toHaveBeenCalledWith('documents');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('sanea el ownerId en la ruta y usa anonymous si falta', async () => {
    const { service } = await buildService();

    const withSlashes = await service.uploadImage('avatar', '../../etc', makeFile());
    expect(withSlashes.path.startsWith('avatar/______etc/')).toBe(true);

    const anonymous = await service.uploadImage('avatar', undefined, makeFile());
    expect(anonymous.path.startsWith('avatar/anonymous/')).toBe(true);
  });

  it('propaga errores de Supabase Storage como 500', async () => {
    upload.mockResolvedValue({ error: { message: 'boom' } });
    const { service } = await buildService();

    await expect(service.uploadImage('avatar', 'u1', makeFile())).rejects.toThrow('Error al subir archivo: boom');
  });

  it('el controlador rechaza targets desconocidos', async () => {
    const { controller } = await buildService();

    await expect(controller.uploadImage('malware', {}, makeFile())).rejects.toThrow('Target invalido');
    expect(createClient).not.toHaveBeenCalled();
  });
});

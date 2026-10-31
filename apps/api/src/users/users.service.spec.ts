import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UsersService } from './users.service';

const removeMock = jest.fn().mockResolvedValue({ error: null });

jest.mock('src/common/supabase-storage', () => ({
  ...jest.requireActual('src/common/supabase-storage'),
  getSupabaseAdminClient: () => ({ storage: { from: () => ({ remove: removeMock }) } })
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

function buildService(user: Record<string, unknown>) {
  const usersRepository = {
    findOne: jest.fn().mockResolvedValue({ ...user }),
    merge: jest.fn((target: Record<string, unknown>, changes: Record<string, unknown>) => Object.assign(target, changes)),
    save: jest.fn(async (entity: unknown) => entity)
  };

  return { service: new UsersService(usersRepository as never, {} as never, {} as never), usersRepository };
}

const baseUser = {
  id: USER_ID,
  firstName: 'Ana',
  lastName: 'López',
  phoneNumber: '+34600000000',
  avatarUrl: null,
  idDocumentUrl: `supabase://documents/id_document/${USER_ID}/dni.jpg`,
  driverLicenseUrl: `supabase://documents/driver_license/${USER_ID}/carnet.jpg`,
  isVerified: true,
  createdAt: new Date(),
  deletedAt: null
};

describe('UsersService.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('null borra el documento, quita la verificación y elimina el fichero', async () => {
    const { service } = buildService(baseUser);

    const result = await service.update(USER_ID, { idDocumentUrl: null });

    expect(result.idDocumentUrl).toBeNull();
    expect(result.driverLicenseUrl).toBe(baseUser.driverLicenseUrl);
    expect(result.isVerified).toBe(false);
    expect(removeMock).toHaveBeenCalledWith([`id_document/${USER_ID}/dni.jpg`]);
  });

  it('undefined conserva los valores y la verificación', async () => {
    const { service } = buildService(baseUser);

    const result = await service.update(USER_ID, { firstName: 'Ana María' });

    expect(result.firstName).toBe('Ana María');
    expect(result.idDocumentUrl).toBe(baseUser.idDocumentUrl);
    expect(result.isVerified).toBe(true);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('traduce el teléfono duplicado a 409', async () => {
    const { service, usersRepository } = buildService(baseUser);
    usersRepository.save.mockRejectedValueOnce(
      new QueryFailedError('UPDATE users', [], Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_phone_number_key' }))
    );

    await expect(service.update(USER_ID, { phoneNumber: '+34611111111' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza referencias de storage de otro usuario', async () => {
    const { service, usersRepository } = buildService(baseUser);

    await expect(
      service.update(USER_ID, { idDocumentUrl: `supabase://documents/id_document/${OTHER_ID}/dni.jpg` })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza URLs externas para documentos pero las admite para el avatar', async () => {
    const { service } = buildService(baseUser);

    await expect(service.update(USER_ID, { driverLicenseUrl: 'https://example.com/x.jpg' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.update(USER_ID, { avatarUrl: 'https://example.com/a.jpg' })).resolves.toMatchObject({
      avatarUrl: 'https://example.com/a.jpg'
    });
  });
});

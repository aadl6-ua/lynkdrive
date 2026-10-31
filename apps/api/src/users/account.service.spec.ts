import { ConflictException } from '@nestjs/common';
import { AccountService } from './account.service';

const removeMock = jest.fn().mockResolvedValue({ error: null });
const deleteUserMock = jest.fn().mockResolvedValue({ error: null });

jest.mock('src/common/supabase-storage', () => ({
  ...jest.requireActual('src/common/supabase-storage'),
  getSupabaseAdminClient: () => ({
    storage: { from: () => ({ remove: removeMock }) },
    auth: { admin: { deleteUser: deleteUserMock } }
  })
}));

const user = { sub: 'user-1', email: 'a@b.c', claims: {} };

function buildService(responses: (sql: string) => unknown[]) {
  const queries: string[] = [];
  const run = jest.fn(async (sql: string) => {
    queries.push(sql);
    return responses(sql);
  });
  const dataSource = {
    query: run,
    transaction: jest.fn(async (cb: (m: { query: typeof run }) => Promise<void>) => cb({ query: run }))
  };
  return { service: new AccountService(dataSource as never), queries, dataSource };
}

const profileRow = {
  id: 'user-1',
  first_name: 'Ana',
  last_name: 'Lopez',
  phone_number: '600',
  avatar_url: 'supabase://avatars/avatar/user-1/a.jpg',
  id_document_url: 'supabase://documents/id_document/user-1/id.jpg',
  driver_license_url: null,
  is_verified: true,
  created_at: new Date(),
  deleted_at: null
};

describe('AccountService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza la baja si hay reservas activas y no toca nada', async () => {
    const { service, queries } = buildService((sql) => {
      if (sql.includes('FROM users')) return [profileRow];
      if (sql.includes('FROM bookings')) return [{ id: 'b1' }];
      return [];
    });

    await expect(service.deleteAccount(user)).rejects.toBeInstanceOf(ConflictException);
    expect(queries.some((q) => q.includes('UPDATE users') || q.includes('DELETE FROM'))).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('anonimiza datos, borra ficheros y elimina el usuario de auth', async () => {
    const { service, queries } = buildService((sql) => {
      if (sql.includes('FROM users')) return [profileRow];
      if (sql.includes('FROM vehicle_images')) return [
        { image_url: 'supabase://vehicles/vehicle_image/user-1/v.jpg' },
        // Referencia a un fichero ajeno: nunca debe borrarse.
        { image_url: 'supabase://vehicles/vehicle_image/user-2/ajeno.jpg' }
      ];
      if (sql.includes('FROM checklist_images')) return [{ image_url: 'supabase://checklists/checklist_image/user-1/c.jpg' }];
      return [];
    });

    await service.deleteAccount(user);

    expect(queries.some((q) => q.includes('UPDATE users SET') && q.includes('deleted_at = NOW()'))).toBe(true);
    expect(queries.some((q) => q.includes('owner_contact_method = NULL'))).toBe(true);
    expect(queries.some((q) => q.includes('DELETE FROM push_tokens WHERE user_id'))).toBe(true);
    expect(queries.some((q) => q.includes('DELETE FROM booking_messages WHERE sender_id'))).toBe(true);
    expect(removeMock).toHaveBeenCalledTimes(4);
    expect(removeMock.mock.calls.flat(2)).not.toContain('vehicle_image/user-2/ajeno.jpg');
    expect(deleteUserMock).toHaveBeenCalledWith('user-1', true);
  });

  it('es idempotente si el perfil ya estaba borrado: solo elimina auth', async () => {
    const { service, dataSource } = buildService((sql) =>
      sql.includes('FROM users') ? [{ ...profileRow, deleted_at: new Date() }] : []
    );

    await service.deleteAccount(user);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
  });

  it('la exportacion incluye perfil y reservas, sin stripe ids', async () => {
    const { service } = buildService((sql) => {
      if (sql.includes('FROM users')) return [profileRow];
      return [];
    });

    const result = await service.exportData(user);

    expect(result.profile.firstName).toBe('Ana');
    expect(result.account.email).toBe('a@b.c');
    expect(JSON.stringify(result)).not.toMatch(/stripe_/);
    expect(result).toHaveProperty('bookingsAsDriver');
  });
});

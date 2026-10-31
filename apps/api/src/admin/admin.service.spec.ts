import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const createSignedUrl = jest.fn();
const updateUserById = jest.fn().mockResolvedValue({ error: null });
const forgetBlockStatus = jest.fn();

// Se simula el SDK (no el helper) para que resolveFileUrl use el cliente falso.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl }) },
    auth: { admin: { updateUserById } }
  })
}));

process.env.SUPABASE_URL = 'http://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-test';

jest.mock('src/auth/supabase-jwt-auth.guard', () => ({
  forgetBlockStatus: (id: string) => forgetBlockStatus(id)
}));

type Responder = (sql: string, params: unknown[]) => unknown;

function buildService(responder: Responder) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return responder(sql, params) ?? [];
  });

  return { service: new AdminService({ query } as never), calls };
}

const userRow = {
  id: 'user-1',
  email: 'ana@test.dev',
  first_name: 'Ana',
  last_name: 'Lopez',
  phone_number: '600000000',
  avatar_url: null,
  id_document_url: 'supabase://documents/user-1/id.jpg',
  driver_license_url: null,
  is_verified: false,
  is_admin: false,
  blocked_at: null,
  blocked_reason: null,
  stripe_account_id: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null
};

// Respuestas mínimas para getUser (se usa tras cada acción sobre usuarios).
function userResponder(extra?: Responder): Responder {
  return (sql, params) => {
    const handled = extra?.(sql, params);
    if (handled !== undefined) return handled;
    if (sql.includes('FROM users u LEFT JOIN auth.users')) return [userRow];
    if (sql.includes('AS bookings_as_driver')) return [{ vehicles: '2', bookings_as_driver: '1', average_rating: null }];
    return [];
  };
}

describe('AdminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/doc' }, error: null });
  });

  describe('getDashboard', () => {
    it('agrega métricas y calcula la comisión estimada', async () => {
      process.env.STRIPE_APPLICATION_FEE_PERCENT = '10';
      const { service } = buildService((sql) => {
        if (sql.includes('pending_verification')) {
          return [{ total: '5', verified: '3', pending_verification: '1', blocked: '1', new_last_30_days: '2' }];
        }
        if (sql.includes('FROM vehicles WHERE deleted_at IS NULL')) return [{ total: '4', active: '3', inactive: '1' }];
        if (sql.includes('GROUP BY status')) return [{ status: 'pending', count: '2' }, { status: 'completed', count: '3' }];
        if (sql.includes('gross_last_30_days')) return [{ gross: '300.50', gross_last_30_days: '100', paid_bookings: '3' }];
        if (sql.includes('generate_series')) return [{ month: '2026-10', gross: '300.50', bookings: '3' }];
        if (sql.includes('open_incidents')) return [{ open_incidents: '1', hidden_reviews: '0' }];
        return [];
      });

      const result = await service.getDashboard();

      expect(result.users).toEqual({ total: 5, verified: 3, pendingVerification: 1, blocked: 1, newLast30Days: 2 });
      expect(result.bookings).toEqual({ total: 5, byStatus: { pending: 2, completed: 3 } });
      expect(result.revenue).toMatchObject({ gross: 300.5, estimatedPlatformFees: 30.05, platformFeePercent: 10 });
      expect(result.revenue.monthly).toEqual([{ month: '2026-10', gross: 300.5, bookings: 3 }]);
      expect(result.moderation.openIncidents).toBe(1);
    });
  });

  describe('listUsers', () => {
    it('pagina, filtra y escapa comodines de la búsqueda', async () => {
      const { service, calls } = buildService((sql) => {
        if (sql.includes('COUNT(*) AS total')) return [{ total: '41' }];
        if (sql.includes('LIMIT')) return [userRow];
        return [];
      });

      const result = await service.listUsers({ page: 3, pageSize: 20, search: '50%_ana', filter: 'blocked' });

      expect(result).toMatchObject({ total: 41, page: 3, pageSize: 20 });
      expect(result.items[0]).toMatchObject({ id: 'user-1', hasIdDocument: true, hasDriverLicense: false });
      // Nunca se exponen las referencias de storage en el listado.
      expect(result.items[0]).not.toHaveProperty('idDocumentUrl');

      const listCall = calls.find((call) => call.sql.includes('LIMIT'))!;
      expect(listCall.sql).toContain('u.blocked_at IS NOT NULL');
      expect(listCall.params).toEqual(['%50\\%\\_ana%', '50%_ana', 20, 40]);
    });
  });

  describe('getUser', () => {
    it('devuelve los documentos como URLs firmadas con caducidad', async () => {
      const { service } = buildService(userResponder());

      const result = await service.getUser('user-1');

      expect(createSignedUrl).toHaveBeenCalledWith('user-1/id.jpg', expect.any(Number));
      expect(result.documents.idDocument.url).toBe('https://signed.example/doc');
      expect(result.documents.idDocument.expiresAt).toEqual(expect.any(String));
      expect(result.documents.driverLicense).toEqual({ url: null, expiresAt: null });
      expect(result.stats.vehicles).toBe(2);
    });

    it('lanza 404 si el usuario no existe', async () => {
      const { service } = buildService(() => []);
      await expect(service.getUser('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setVerification', () => {
    it('lanza 404 si el usuario no existe o está borrado', async () => {
      const { service } = buildService((sql) => (sql.startsWith('UPDATE users') ? [[], 0] : []));
      await expect(service.setVerification('missing', true)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('actualiza is_verified', async () => {
      const { service, calls } = buildService(
        userResponder((sql) => (sql.startsWith('UPDATE users') ? [[{ id: 'user-1' }], 1] : undefined))
      );

      await service.setVerification('user-1', true);

      expect(calls.find((call) => call.sql.startsWith('UPDATE users'))?.params).toEqual(['user-1', true]);
    });
  });

  describe('setBlocked', () => {
    it('impide que un admin se bloquee a sí mismo', async () => {
      const { service, calls } = buildService(() => []);

      await expect(service.setBlocked('admin-1', 'admin-1', { blocked: true })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(calls).toHaveLength(0);
    });

    it('bloquea, invalida la cache del guard y banea en Supabase Auth', async () => {
      const { service, calls } = buildService(
        userResponder((sql) => (sql.startsWith('UPDATE users') ? [[{ id: 'user-1' }], 1] : undefined))
      );

      await service.setBlocked('admin-1', 'user-1', { blocked: true, reason: '  fraude  ' });

      const update = calls.find((call) => call.sql.startsWith('UPDATE users'))!;
      expect(update.sql).toContain('blocked_at = COALESCE(blocked_at, NOW())');
      expect(update.params).toEqual(['user-1', 'fraude']);
      expect(forgetBlockStatus).toHaveBeenCalledWith('user-1');
      expect(updateUserById).toHaveBeenCalledWith('user-1', { ban_duration: '876000h' });
    });

    it('desbloquea y levanta el baneo', async () => {
      const { service, calls } = buildService(
        userResponder((sql) => (sql.startsWith('UPDATE users') ? [[{ id: 'user-1' }], 1] : undefined))
      );

      await service.setBlocked('admin-1', 'user-1', { blocked: false });

      expect(calls.find((call) => call.sql.startsWith('UPDATE users'))?.sql).toContain('blocked_at = NULL');
      expect(updateUserById).toHaveBeenCalledWith('user-1', { ban_duration: 'none' });
    });
  });

  describe('setVehicleStatus', () => {
    it('lanza 404 si el vehículo no existe', async () => {
      const { service } = buildService(() => [[], 0]);
      await expect(service.setVehicleStatus('missing', 'inactive')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setReviewVisibility', () => {
    it('oculta una reseña guardando el motivo', async () => {
      const { service, calls } = buildService((sql) => {
        if (sql.startsWith('UPDATE reviews')) return [[{ id: 'review-1' }], 1];
        if (sql.includes('FROM reviews r')) {
          return [{ id: 'review-1', rating: 1, hidden_at: new Date(), hidden_reason: 'insultos' }];
        }
        return [];
      });

      const result = await service.setReviewVisibility('review-1', { hidden: true, reason: 'insultos' });

      expect(calls[0].params).toEqual(['review-1', 'insultos']);
      expect(result).toMatchObject({ id: 'review-1', hiddenReason: 'insultos' });
    });
  });

  describe('getBooking', () => {
    it('incluye historial de estados y evidencias firmadas por checklist', async () => {
      const { service } = buildService((sql) => {
        if (sql.includes('WHERE b.id = $1')) {
          return [{ id: 'booking-1', status: 'completed', total_price: '90.00', vehicle_id: 'vehicle-1' }];
        }
        if (sql.includes('booking_status_history')) {
          return [
            { from_status: null, to_status: 'pending', changed_at: new Date() },
            { from_status: 'pending', to_status: 'accepted', changed_at: new Date() }
          ];
        }
        if (sql.includes('FROM booking_checklists c INNER JOIN users')) {
          return [{ id: 'checklist-1', type: 'check_in', mileage: 1000, fuel_level: 80, submitted_by: 'user-1' }];
        }
        if (sql.includes('FROM checklist_images')) {
          return [
            { id: 'image-1', checklist_id: 'checklist-1', image_url: 'supabase://checklists/b/1.jpg' },
            { id: 'image-2', checklist_id: 'checklist-1', image_url: 'no-es-una-referencia' }
          ];
        }
        return [];
      });

      const result = await service.getBooking('booking-1');

      expect(result.totalPrice).toBe(90);
      expect(result.history.map((entry) => entry.toStatus)).toEqual(['pending', 'accepted']);
      expect(result.checklists[0].images.map((image) => image.file.url)).toEqual(['https://signed.example/doc', null]);
      expect(createSignedUrl).toHaveBeenCalledWith('b/1.jpg', expect.any(Number));
    });

    it('lanza 404 si la reserva no existe', async () => {
      const { service } = buildService(() => []);
      await expect(service.getBooking('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('incidencias', () => {
    const incidentRow = { id: 'incident-1', title: 'Golpe', description: 'Rayón', status: 'open' };

    it('valida las referencias antes de crear', async () => {
      const { service, calls } = buildService(() => []);

      await expect(
        service.createIncident('admin-1', { title: 'Golpe', description: 'Rayón', bookingId: 'missing' })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(calls.some((call) => call.sql.startsWith('INSERT'))).toBe(false);
    });

    it('crea la incidencia con el admin como autor', async () => {
      const { service, calls } = buildService((sql) => {
        if (sql.startsWith('INSERT INTO incidents')) return [{ id: 'incident-1' }];
        if (sql.includes('FROM incidents i WHERE i.id')) return [incidentRow];
        return [];
      });

      const result = await service.createIncident('admin-1', { title: ' Golpe ', description: 'Rayón' });

      expect(calls.find((call) => call.sql.startsWith('INSERT'))?.params).toEqual([
        'Golpe',
        'Rayón',
        null,
        null,
        null,
        'admin-1'
      ]);
      expect(result).toMatchObject({ id: 'incident-1', status: 'open', notes: [] });
    });

    it('añade notas y lanza 404 si la incidencia no existe', async () => {
      const missing = buildService(() => [[], 0]);
      await expect(missing.service.addIncidentNote('admin-1', 'missing', 'nota')).rejects.toBeInstanceOf(
        NotFoundException
      );

      const { service, calls } = buildService((sql) => {
        if (sql.startsWith('UPDATE incidents')) return [[{ id: 'incident-1' }], 1];
        if (sql.includes('FROM incidents i WHERE i.id')) return [incidentRow];
        if (sql.includes('FROM incident_notes')) return [{ id: 'note-1', body: 'nota', author_id: 'admin-1' }];
        return [];
      });

      const result = await service.addIncidentNote('admin-1', 'incident-1', '  nota ');

      expect(calls.find((call) => call.sql.startsWith('INSERT INTO incident_notes'))?.params).toEqual([
        'incident-1',
        'admin-1',
        'nota'
      ]);
      expect(result.notesCount).toBe(1);
    });
  });
});

import { ConflictException } from '@nestjs/common';
import { BookingsService, HANDOVER_BUFFER_HOURS } from './bookings.service';

type Call = { sql: string; params: unknown[] };

const OWNER = 'owner-1';
const bookingRow = {
  id: 'b1',
  vehicle_id: 'v1',
  owner_id: OWNER,
  driver_id: 'd1',
  start_datetime: new Date('2030-01-10T10:00:00Z'),
  end_datetime: new Date('2030-01-12T10:00:00Z'),
  price_per_day_at_booking: '10',
  platform_fee: '0',
  total_price: '20',
  status: 'pending',
  payment_intent_id: null,
  stripe_transfer_id: null,
  payout_status: 'pending',
  owner_contact_method: null,
  created_at: new Date(),
  updated_at: new Date()
};

function buildService(opts: { lockedStatus?: string; conflict?: boolean; initialRow?: typeof bookingRow }) {
  const calls: Call[] = [];
  let transactionRuns = 0;
  const run = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FOR UPDATE') && sql.includes('FROM bookings')) {
      return [{ status: opts.lockedStatus ?? 'pending', start_datetime: bookingRow.start_datetime, end_datetime: bookingRow.end_datetime }];
    }
    if (sql.includes('SELECT id') && sql.includes("status IN ('accepted'")) {
      return opts.conflict ? [{ id: 'other' }] : [];
    }
    if (sql.includes('b.id = $1')) {
      return [{ ...(opts.initialRow ?? bookingRow), status: calls.some((c) => c.sql.includes("status = 'accepted'")) ? 'accepted' : 'pending' }];
    }
    return [];
  };
  const manager = { query: jest.fn(run) };
  const repo = {
    query: jest.fn(run),
    manager: {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<void>) => {
        transactionRuns += 1;
        return cb(manager);
      })
    }
  };
  const service = new BookingsService(repo as never, {} as never, {} as never, {} as never);
  return { service, calls, repo, transactions: () => transactionRuns };
}

const ownerUser = { sub: OWNER, claims: {} };
const accept = { status: 'accepted', ownerContactMethod: 'tel 600' } as never;

describe('BookingsService - aceptar reserva', () => {
  it('acepta y rechaza las pending solapadas del mismo vehiculo dentro de una transaccion', async () => {
    const { service, calls, transactions } = buildService({});

    await service.updateStatus('b1', ownerUser, accept);

    expect(transactions()).toBe(1);
    const lockVehicle = calls.findIndex((c) => c.sql.includes('FROM vehicles') && c.sql.includes('FOR UPDATE'));
    const lockBooking = calls.findIndex((c) => c.sql.includes('FROM bookings') && c.sql.includes('FOR UPDATE'));
    const acceptIdx = calls.findIndex((c) => c.sql.includes("status = 'accepted'"));
    const rejectIdx = calls.findIndex((c) => c.sql.includes("status = 'rejected'"));
    expect(lockVehicle).toBeGreaterThanOrEqual(0);
    expect(lockVehicle).toBeLessThan(lockBooking);
    expect(lockBooking).toBeLessThan(acceptIdx);
    expect(acceptIdx).toBeLessThan(rejectIdx);

    const reject = calls[rejectIdx];
    expect(reject.sql).toContain("status = 'pending'");
    expect(reject.sql).toContain('id <> $2');
    expect(reject.params[0]).toBe('v1');
    expect(reject.params[1]).toBe('b1');
    expect(reject.params[4]).toBe(HANDOVER_BUFFER_HOURS);
  });

  it('no acepta si otra reserva confirmada choca (incluido el colchon) y no modifica nada', async () => {
    const { service, calls } = buildService({ conflict: true });

    await expect(service.updateStatus('b1', ownerUser, accept)).rejects.toBeInstanceOf(ConflictException);
    expect(calls.some((c) => c.sql.includes("status = 'accepted'"))).toBe(false);
    expect(calls.some((c) => c.sql.includes("status = 'rejected'"))).toBe(false);
  });

  it('falla si la reserva ya no esta pending al obtener el bloqueo (carrera)', async () => {
    const { service, calls } = buildService({ lockedStatus: 'rejected' });

    await expect(service.updateStatus('b1', ownerUser, accept)).rejects.toBeInstanceOf(ConflictException);
    expect(calls.some((c) => c.sql.includes("status = 'accepted'"))).toBe(false);
  });
});

describe('BookingsService - colchon de 2h entre reservas', () => {
  it('la consulta de solapes aplica el colchon a ambos lados', async () => {
    const { service, repo } = buildService({});
    const ensure = (service as unknown as {
      ensureNoConflicts: (v: string, s: Date, e: Date) => Promise<void>;
    }).ensureNoConflicts.bind(service);

    await ensure('v1', new Date('2030-02-01T10:00:00Z'), new Date('2030-02-01T12:00:00Z'));

    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("make_interval(hours => $5)");
    expect(sql).toMatch(/start_datetime < \$3::timestamptz \+ make_interval/);
    expect(sql).toMatch(/end_datetime \+ make_interval\(hours => \$5\) > \$2::timestamptz/);
    expect(params[4]).toBe(2);
    expect(HANDOVER_BUFFER_HOURS).toBe(2);
  });

  it('lanza Conflict cuando hay una reserva dentro del colchon', async () => {
    const { service } = buildService({ conflict: true });
    const ensure = (service as unknown as {
      ensureNoConflicts: (v: string, s: Date, e: Date) => Promise<void>;
    }).ensureNoConflicts.bind(service);

    await expect(
      ensure('v1', new Date('2030-02-01T13:00:00Z'), new Date('2030-02-01T15:00:00Z'))
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

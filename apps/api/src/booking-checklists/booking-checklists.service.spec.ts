import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { BookingChecklistsService } from './booking-checklists.service';
import { ChecklistType } from './dto/create-booking-checklist.dto';
import { BookingChecklistEntity } from './entities/booking-checklist.entity';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';

type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'paid_confirmed' | 'in_progress' | 'completed' | 'cancelled';

describe('BookingChecklistsService', () => {
  let service: BookingChecklistsService;
  let bookingStatus: BookingStatus;
  let bookingExists: boolean;

  const repository = {
    query: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: Partial<BookingChecklistEntity>) => ({ ...data })),
    save: jest.fn(async (data: Partial<BookingChecklistEntity>) => ({ id: 'checklist-1', createdAt: new Date(), ...data })),
    merge: jest.fn((entity: BookingChecklistEntity, data: Partial<BookingChecklistEntity>) => ({ ...entity, ...data })),
    delete: jest.fn()
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    bookingStatus = 'paid_confirmed';
    bookingExists = true;

    repository.query.mockImplementation(async () =>
      bookingExists
        ? [{ booking_id: BOOKING_ID, owner_id: OWNER_ID, driver_id: DRIVER_ID, status: bookingStatus }]
        : []
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingChecklistsService,
        { provide: getRepositoryToken(BookingChecklistEntity), useValue: repository }
      ]
    }).compile();

    service = moduleRef.get(BookingChecklistsService);
  });

  const dto = (type: ChecklistType, overrides: Record<string, unknown> = {}) => ({
    bookingId: BOOKING_ID,
    type,
    mileage: 10234,
    fuelLevel: 70,
    notes: 'Sin incidencias',
    ...overrides
  });

  const phaseCases: Array<[ChecklistType, BookingStatus, boolean]> = [
    ['check_in', 'pending', false],
    ['check_in', 'accepted', false],
    ['check_in', 'rejected', false],
    ['check_in', 'cancelled', false],
    ['check_in', 'paid_confirmed', true],
    ['check_in', 'in_progress', true],
    ['check_in', 'completed', true],
    ['check_out', 'pending', false],
    ['check_out', 'accepted', false],
    ['check_out', 'rejected', false],
    ['check_out', 'cancelled', false],
    ['check_out', 'paid_confirmed', false],
    ['check_out', 'in_progress', true],
    ['check_out', 'completed', true]
  ];

  it.each(phaseCases)('%s con booking %s permitido=%s', async (type, status, allowed) => {
    bookingStatus = status;
    const promise = service.createForUser(DRIVER_ID, dto(type));

    if (allowed) {
      await expect(promise).resolves.toMatchObject({ bookingId: BOOKING_ID, type, submittedBy: DRIVER_ID });
    } else {
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    }
  });

  it('fija submittedBy con el usuario autenticado', async () => {
    const result = await service.createForUser(OWNER_ID, dto('check_in'));
    expect(result.submittedBy).toBe(OWNER_ID);
  });

  it.each([-1, 101, Number.NaN])('rechaza fuelLevel fuera de rango %p', async (fuelLevel) => {
    await expect(service.createForUser(DRIVER_ID, dto('check_in', { fuelLevel }))).rejects.toThrow(
      'fuelLevel must be between 0 and 100'
    );
  });

  it.each([0, 100])('acepta fuelLevel limite %p', async (fuelLevel) => {
    await expect(service.createForUser(DRIVER_ID, dto('check_in', { fuelLevel }))).resolves.toMatchObject({
      fuelLevel
    });
  });

  it('prohibe el acceso a terceros', async () => {
    await expect(service.createForUser(STRANGER_ID, dto('check_in'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.findAllForUser(STRANGER_ID, BOOKING_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza NotFound si el booking no existe', async () => {
    bookingExists = false;
    await expect(service.createForUser(DRIVER_ID, dto('check_in'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exige bookingId al listar', async () => {
    await expect(service.findAllForUser(DRIVER_ID, '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('devuelve Conflict si ya existe un checklist del mismo tipo', async () => {
    repository.save.mockRejectedValueOnce(
      new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' }))
    );
    await expect(service.createForUser(DRIVER_ID, dto('check_in'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('al actualizar conserva los campos no enviados y valida fuelLevel', async () => {
    repository.findOne.mockResolvedValue({
      id: 'checklist-1',
      bookingId: BOOKING_ID,
      type: 'check_in',
      submittedBy: DRIVER_ID,
      mileage: 100,
      fuelLevel: 50,
      notes: 'nota',
      createdAt: new Date()
    });

    await expect(service.updateForUser('checklist-1', DRIVER_ID, { mileage: 150 })).resolves.toMatchObject({
      mileage: 150,
      fuelLevel: 50,
      notes: 'nota'
    });
    await expect(service.updateForUser('checklist-1', DRIVER_ID, { fuelLevel: 150 })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

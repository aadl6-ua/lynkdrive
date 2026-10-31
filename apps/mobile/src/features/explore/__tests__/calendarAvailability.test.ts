import {
  AvailabilityWindowItem,
  BookingItem,
  getDayStatus,
  getFilterDayStatus,
  getMadridDayBounds,
  getOwnerDayStatus,
  hasOwnerWindow
} from '../calendarAvailability';

// "Ahora" fijo: 1 de julio de 2026, 08:00 en Madrid (06:00 UTC).
const NOW = new Date('2026-07-01T06:00:00.000Z');
// Día de calendario 10/07/2026 (fecha local del dispositivo, como en el componente).
const DAY = new Date(2026, 6, 10);

let seq = 0;
const availability = (start: string, end: string): AvailabilityWindowItem => ({
  id: `w${++seq}`,
  startDatetime: start,
  endDatetime: end
});
const booking = (start: string, end: string, status: BookingItem['status']): BookingItem => ({
  id: `b${++seq}`,
  startDatetime: start,
  endDatetime: end,
  status
});

// Ventana que cubre el día 10 entero en hora de Madrid (UTC+2 en verano).
const FULL_DAY = availability('2026-07-09T22:00:00.000Z', '2026-07-10T22:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getMadridDayBounds', () => {
  it('devuelve medianoche a medianoche en hora de Madrid', () => {
    const { start, end } = getMadridDayBounds(DAY);
    expect(new Date(start).toISOString()).toBe('2026-07-09T22:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-07-10T22:00:00.000Z');
  });

  it('el día del cambio a horario de invierno dura 25 horas', () => {
    const { start, end } = getMadridDayBounds(new Date(2026, 9, 25));
    expect((end - start) / 3_600_000).toBe(25);
  });

  it('el día del cambio a horario de verano dura 23 horas', () => {
    const { start, end } = getMadridDayBounds(new Date(2026, 2, 29));
    expect((end - start) / 3_600_000).toBe(23);
  });
});

describe('getDayStatus (modo explorar)', () => {
  it('marca como pasado un día ya terminado aunque tenga ventana', () => {
    expect(getDayStatus(new Date(2026, 5, 30), [availability('2026-06-29T00:00:00Z', '2026-07-30T00:00:00Z')], [])).toBe('past');
  });

  it('verde si hay al menos 10 horas continuas libres', () => {
    expect(getDayStatus(DAY, [FULL_DAY], [])).toBe('available');
    // Exactamente 10 h (09:00-19:00 Madrid).
    expect(getDayStatus(DAY, [availability('2026-07-10T07:00:00Z', '2026-07-10T17:00:00Z')], [])).toBe('available');
  });

  it('naranja si hay disponibilidad parcial (<10 h)', () => {
    expect(getDayStatus(DAY, [availability('2026-07-10T07:00:00Z', '2026-07-10T16:59:00Z')], [])).toBe('partial');
  });

  it('gris sin ventanas o con ventanas de otro día', () => {
    expect(getDayStatus(DAY, [], [])).toBe('unavailable');
    expect(getDayStatus(DAY, [availability('2026-07-11T07:00:00Z', '2026-07-11T20:00:00Z')], [])).toBe('unavailable');
  });

  it('dos tramos cortos no suman para verde: cuenta el tramo continuo más largo', () => {
    const windows = [
      availability('2026-07-10T04:00:00Z', '2026-07-10T10:00:00Z'),
      availability('2026-07-10T12:00:00Z', '2026-07-10T18:00:00Z')
    ];
    expect(getDayStatus(DAY, windows, [])).toBe('partial');
  });

  it('las reservas pending, rejected y cancelled no bloquean el calendario', () => {
    const bookings = [
      booking('2026-07-09T22:00:00Z', '2026-07-10T22:00:00Z', 'pending'),
      booking('2026-07-09T22:00:00Z', '2026-07-10T22:00:00Z', 'rejected'),
      booking('2026-07-09T22:00:00Z', '2026-07-10T22:00:00Z', 'cancelled')
    ];
    expect(getDayStatus(DAY, [FULL_DAY], bookings)).toBe('available');
  });

  it.each(['accepted', 'paid_confirmed', 'in_progress', 'completed'] as const)(
    'una reserva %s que cubre el día lo deja sin disponibilidad',
    (status) => {
      const bookings = [booking('2026-07-09T20:00:00Z', '2026-07-10T22:00:00Z', status)];
      expect(getDayStatus(DAY, [FULL_DAY], bookings)).toBe('unavailable');
    }
  );

  it('aplica el colchón operativo de 2 h al final de cada reserva confirmada', () => {
    // Reserva hasta las 12:00 Madrid -> bloqueo hasta las 14:00. Quedan 10 h (14:00-24:00).
    const until12 = [booking('2026-07-09T20:00:00Z', '2026-07-10T10:00:00Z', 'accepted')];
    expect(getDayStatus(DAY, [FULL_DAY], until12)).toBe('available');

    // Una hora más tarde quedan 9 h: pasa a parcial por el colchón.
    const until13 = [booking('2026-07-09T20:00:00Z', '2026-07-10T11:00:00Z', 'accepted')];
    expect(getDayStatus(DAY, [FULL_DAY], until13)).toBe('partial');
  });

  it('el colchón de una reserva que acaba a última hora invade el día siguiente', () => {
    // Reserva del día 9 que termina a las 23:00 Madrid -> bloquea hasta la 01:00 del día 10.
    const windowFrom0To11 = availability('2026-07-09T22:00:00Z', '2026-07-10T09:00:00Z');
    const bookings = [booking('2026-07-09T08:00:00Z', '2026-07-09T21:00:00Z', 'paid_confirmed')];
    // Sin el colchón serían 11 h (verde); con él quedan 10 h -> sigue verde.
    expect(getDayStatus(DAY, [windowFrom0To11], bookings)).toBe('available');

    const windowFrom0To10 = availability('2026-07-09T22:00:00Z', '2026-07-10T08:00:00Z');
    // Sin colchón 10 h (verde); con él 9 h -> parcial.
    expect(getDayStatus(DAY, [windowFrom0To10], bookings)).toBe('partial');
  });

  it('reservas solapadas entre sí no generan tramos libres falsos', () => {
    const bookings = [
      booking('2026-07-09T22:00:00Z', '2026-07-10T12:00:00Z', 'accepted'),
      booking('2026-07-10T05:00:00Z', '2026-07-10T08:00:00Z', 'completed')
    ];
    // Bloqueo hasta 16:00 Madrid (14:00 + 2 h) -> quedan 8 h.
    expect(getDayStatus(DAY, [FULL_DAY], bookings)).toBe('partial');
  });

  it('en el día de hoy solo cuenta el tiempo a partir de ahora', () => {
    const today = new Date(2026, 6, 1);
    // Ventana 00:00-24:00 Madrid; ahora son las 08:00 -> quedan 16 h.
    expect(getDayStatus(today, [availability('2026-06-30T22:00:00Z', '2026-07-01T22:00:00Z')], [])).toBe('available');
    // Ventana 00:00-17:00 -> quedan 9 h desde ahora.
    expect(getDayStatus(today, [availability('2026-06-30T22:00:00Z', '2026-07-01T15:00:00Z')], [])).toBe('partial');
    // Ventana que terminó antes de ahora.
    expect(getDayStatus(today, [availability('2026-06-30T22:00:00Z', '2026-07-01T05:00:00Z')], [])).toBe('unavailable');
  });
});

describe('modo propietario', () => {
  it('hasOwnerWindow detecta cualquier ventana que toque el día', () => {
    expect(hasOwnerWindow(DAY, [availability('2026-07-10T21:00:00Z', '2026-07-12T00:00:00Z')])).toBe(true);
    // Termina justo a medianoche de Madrid: no toca el día 10.
    expect(hasOwnerWindow(DAY, [availability('2026-07-09T10:00:00Z', '2026-07-09T22:00:00Z')])).toBe(false);
  });

  it('getOwnerDayStatus ignora reservas y solo mira ventanas', () => {
    expect(getOwnerDayStatus(DAY, [FULL_DAY])).toBe('available');
    expect(getOwnerDayStatus(DAY, [])).toBe('unavailable');
    expect(getOwnerDayStatus(new Date(2026, 5, 30), [FULL_DAY])).toBe('past');
  });

  it('getFilterDayStatus solo bloquea los días pasados (el filtro no depende de un vehículo)', () => {
    expect(getFilterDayStatus(DAY)).toBe('available');
    expect(getFilterDayStatus(new Date(2026, 6, 1))).toBe('available');
    expect(getFilterDayStatus(new Date(2026, 5, 30))).toBe('past');
  });
});

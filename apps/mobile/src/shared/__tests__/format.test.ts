import {
  calendarDayHourToIso,
  formatCurrencyEUR,
  formatDateMadrid,
  formatDateRangeMadrid,
  formatDateTimeMadrid,
  formatMonthYearMadrid,
  formatPriceCompact,
  formatRelativeFromNow,
  formatTimeMadrid,
  getBillableDays,
  getDisplayName,
  getInitials,
  getInitialsFromName,
  getMadridParts,
  isoToCalendarDayHour,
  madridWallTimeToDate,
  pluralize,
  translateFuelType,
  translateTransmission
} from '../format';

// Intl usa espacios duros (U+00A0 / U+202F); los normalizamos para comparar.
const normalize = (value: string) => value.replace(/[  ]/g, ' ');

describe('formato de moneda EUR', () => {
  it('formatea con dos decimales y símbolo de euro', () => {
    expect(normalize(formatCurrencyEUR(45))).toBe('45,00 €');
    expect(normalize(formatCurrencyEUR(12.5))).toBe('12,50 €');
  });

  it('devuelve guion largo para valores vacíos o no numéricos', () => {
    expect(formatCurrencyEUR(null)).toBe('—');
    expect(formatCurrencyEUR(undefined)).toBe('—');
    expect(formatCurrencyEUR(Number.NaN)).toBe('—');
  });

  it('acepta importes que llegan como string numérico desde la API', () => {
    expect(normalize(formatCurrencyEUR('99.9' as unknown as number))).toBe('99,90 €');
  });

  it('el formato compacto omite decimales en importes enteros', () => {
    expect(normalize(formatPriceCompact(45))).toBe('45 €');
    expect(normalize(formatPriceCompact(45.5))).toBe('45,5 €');
    expect(formatPriceCompact(null)).toBe('—');
  });
});

describe('formato de fechas en Europe/Madrid', () => {
  it('presenta un instante UTC en hora de Madrid (horario de verano, UTC+2)', () => {
    expect(formatTimeMadrid('2026-07-01T08:00:00.000Z')).toBe('10:00');
  });

  it('presenta un instante UTC en hora de Madrid (horario de invierno, UTC+1)', () => {
    expect(formatTimeMadrid('2026-01-15T08:00:00.000Z')).toBe('09:00');
  });

  it('cambia de día cuando en Madrid ya es el día siguiente', () => {
    expect(normalize(formatDateMadrid('2026-10-24T23:30:00.000Z'))).toBe('25 oct 2026');
  });

  it('elimina los puntos de las abreviaturas de es-ES', () => {
    const value = formatDateTimeMadrid('2026-10-25T00:30:00.000Z');
    expect(value).not.toContain('.');
    expect(normalize(value)).toBe('25 oct 2026, 02:30');
  });

  it('capitaliza el mes en formato mes/año', () => {
    expect(formatMonthYearMadrid('2026-03-10T12:00:00.000Z')).toMatch(/^Marzo/);
  });

  it('compone rangos con flecha', () => {
    expect(formatDateRangeMadrid('2026-07-01T08:00:00.000Z', '2026-07-02T08:00:00.000Z')).toContain(' → ');
  });

  it('devuelve guion largo ante fechas inválidas', () => {
    expect(formatDateMadrid('no-es-fecha')).toBe('—');
    expect(formatDateTimeMadrid('no-es-fecha')).toBe('—');
    expect(formatMonthYearMadrid('no-es-fecha')).toBe('—');
    expect(formatTimeMadrid('no-es-fecha')).toBe('—');
    expect(getMadridParts('no-es-fecha')).toBeNull();
  });
});

describe('conversión hora de pared Madrid <-> UTC', () => {
  it('getMadridParts devuelve componentes en hora de Madrid con mes 0-11', () => {
    expect(getMadridParts('2026-07-01T22:15:00.000Z')).toEqual({ year: 2026, month: 6, day: 2, hour: 0, minute: 15 });
  });

  it('madridWallTimeToDate respeta horario de verano e invierno', () => {
    expect(madridWallTimeToDate(2026, 6, 1, 10).toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(madridWallTimeToDate(2026, 0, 15, 10).toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('madridWallTimeToDate funciona en los días de cambio de hora', () => {
    // 29/03/2026: a las 02:00 se pasa a 03:00 (UTC+1 -> UTC+2).
    expect(madridWallTimeToDate(2026, 2, 29, 0).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(madridWallTimeToDate(2026, 2, 29, 12).toISOString()).toBe('2026-03-29T10:00:00.000Z');
    // 25/10/2026: a las 03:00 se vuelve a 02:00 (UTC+2 -> UTC+1).
    expect(madridWallTimeToDate(2026, 9, 25, 0).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(madridWallTimeToDate(2026, 9, 25, 12).toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('madridWallTimeToDate normaliza el desbordamiento de día', () => {
    expect(madridWallTimeToDate(2026, 0, 32, 0).toISOString()).toBe('2026-01-31T23:00:00.000Z');
  });

  it('calendarDayHourToIso e isoToCalendarDayHour son inversas', () => {
    const day = new Date(2026, 6, 1);
    const iso = calendarDayHourToIso(day, 18);
    expect(iso).toBe('2026-07-01T16:00:00.000Z');

    const back = isoToCalendarDayHour(iso);
    expect(back).not.toBeNull();
    expect(back?.hour).toBe(18);
    expect(back?.date.getFullYear()).toBe(2026);
    expect(back?.date.getMonth()).toBe(6);
    expect(back?.date.getDate()).toBe(1);
  });

  it('isoToCalendarDayHour devuelve null con ISO inválido', () => {
    expect(isoToCalendarDayHour('xx')).toBeNull();
  });
});

describe('getBillableDays', () => {
  it('redondea hacia arriba con mínimo de un día', () => {
    expect(getBillableDays('2026-07-01T08:00:00Z', '2026-07-01T10:00:00Z')).toBe(1);
    expect(getBillableDays('2026-07-01T08:00:00Z', '2026-07-02T08:00:00Z')).toBe(1);
    expect(getBillableDays('2026-07-01T08:00:00Z', '2026-07-02T09:00:00Z')).toBe(2);
    expect(getBillableDays('2026-07-01T08:00:00Z', '2026-07-04T08:00:00Z')).toBe(3);
  });

  it('devuelve 1 si el rango está invertido o es inválido', () => {
    expect(getBillableDays('2026-07-04T08:00:00Z', '2026-07-01T08:00:00Z')).toBe(1);
    expect(getBillableDays('x', 'y')).toBe(1);
  });
});

describe('formatRelativeFromNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('expresa horas y días en pasado y futuro', () => {
    expect(formatRelativeFromNow('2026-07-01T12:10:00.000Z')).toBe('ahora');
    expect(formatRelativeFromNow('2026-07-01T13:00:00.000Z')).toBe('en 1 hora');
    expect(formatRelativeFromNow('2026-07-01T09:00:00.000Z')).toBe('hace 3 horas');
    expect(formatRelativeFromNow('2026-07-03T12:00:00.000Z')).toBe('en 2 días');
    expect(formatRelativeFromNow('2026-06-30T10:00:00.000Z')).toBe('hace 1 día');
    expect(formatRelativeFromNow('nada')).toBe('—');
  });
});

describe('textos y nombres', () => {
  it('pluralize', () => {
    expect(pluralize(1, 'día', 'días')).toBe('1 día');
    expect(pluralize(0, 'día', 'días')).toBe('0 días');
    expect(pluralize(3, 'día', 'días')).toBe('3 días');
  });

  it('iniciales y nombre visible con fallback', () => {
    expect(getInitials('ana', 'pérez')).toBe('AP');
    expect(getInitials(null, undefined)).toBe('U');
    expect(getInitials('  luis ', null)).toBe('L');
    expect(getInitialsFromName('  Marta   Gómez Ruiz ')).toBe('MG');
    expect(getDisplayName('Ana', 'Pérez')).toBe('Ana Pérez');
    expect(getDisplayName(null, null)).toBe('Usuario');
    expect(getDisplayName('', '', 'Propietario')).toBe('Propietario');
  });

  it('traduce combustible y transmisión', () => {
    expect(translateFuelType('diesel')).toBe('Diésel');
    expect(translateFuelType('ELECTRIC')).toBe('Eléctrico');
    expect(translateFuelType('hidrógeno')).toBeNull();
    expect(translateFuelType(null)).toBeNull();
    expect(translateTransmission('automatic')).toBe('Automático');
    expect(translateTransmission(undefined)).toBeNull();
  });
});

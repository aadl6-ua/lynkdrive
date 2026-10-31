import { getApiErrorMessage, getApiErrorMessageOrNull } from '../errors';

describe('getApiErrorMessage', () => {
  it('usa el mensaje string de NestJS', () => {
    const error = { response: { status: 409, data: { message: 'Solape con otra reserva' } } };
    expect(getApiErrorMessage(error, 'fallback')).toBe('Solape con otra reserva');
  });

  it('une los mensajes de validación de class-validator', () => {
    const error = { response: { status: 400, data: { message: ['year must be an integer', 'seats must be positive'] } } };
    expect(getApiErrorMessage(error, 'fallback')).toBe('year must be an integer. seats must be positive');
  });

  it('ignora mensajes vacíos y usa el fallback', () => {
    expect(getApiErrorMessage({ response: { data: { message: '   ' } } }, 'fallback')).toBe('fallback');
    expect(getApiErrorMessage({ response: { data: { message: [] } } }, 'fallback')).toBe('fallback');
    expect(getApiErrorMessage({ response: { status: 500 } }, 'fallback')).toBe('fallback');
  });

  it('traduce timeout y red caída', () => {
    expect(getApiErrorMessage({ code: 'ECONNABORTED' }, 'fallback')).toMatch(/tarda demasiado/);
    expect(getApiErrorMessage({ message: 'Network Error' }, 'fallback')).toMatch(/Sin conexión/);
  });

  it('no trata como red caída un error con respuesta', () => {
    expect(getApiErrorMessage({ message: 'Network Error', response: { status: 502 } }, 'fallback')).toBe('fallback');
  });

  it('devuelve el fallback para valores que no son objetos', () => {
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback');
    expect(getApiErrorMessage('boom', 'fallback')).toBe('fallback');
    expect(getApiErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('getApiErrorMessageOrNull', () => {
  it('devuelve null si no hay mensaje útil', () => {
    expect(getApiErrorMessageOrNull({ response: { status: 500 } })).toBeNull();
    expect(getApiErrorMessageOrNull(null)).toBeNull();
  });

  it('devuelve el mensaje de la API si existe', () => {
    expect(getApiErrorMessageOrNull({ response: { data: { message: 'No autorizado' } } })).toBe('No autorizado');
  });
});

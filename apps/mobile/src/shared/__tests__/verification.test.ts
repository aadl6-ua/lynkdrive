import { parseLocaleNumber } from '../number';
import { canUseTransactionalFlows, hasMinimumProfileData } from '../verification';

const complete = { firstName: 'Ana', lastName: 'Pérez', phoneNumber: '+34600000000', isVerified: true };

describe('verificación de perfil', () => {
  it('exige nombre, apellidos y teléfono no vacíos', () => {
    expect(hasMinimumProfileData(complete)).toBe(true);
    expect(hasMinimumProfileData({ ...complete, phoneNumber: null })).toBe(false);
    expect(hasMinimumProfileData({ ...complete, firstName: '   ' })).toBe(false);
    expect(hasMinimumProfileData({ ...complete, lastName: undefined })).toBe(false);
    expect(hasMinimumProfileData(null)).toBe(false);
    expect(hasMinimumProfileData(undefined)).toBe(false);
  });

  it('los flujos transaccionales requieren además is_verified', () => {
    expect(canUseTransactionalFlows(complete)).toBe(true);
    expect(canUseTransactionalFlows({ ...complete, isVerified: false })).toBe(false);
    expect(canUseTransactionalFlows({ ...complete, isVerified: undefined })).toBe(false);
    expect(canUseTransactionalFlows({ ...complete, phoneNumber: '' })).toBe(false);
    expect(canUseTransactionalFlows(null)).toBe(false);
  });
});

describe('parseLocaleNumber', () => {
  it('acepta coma o punto decimal y recorta espacios', () => {
    expect(parseLocaleNumber(' 45,5 ')).toBe(45.5);
    expect(parseLocaleNumber('45.5')).toBe(45.5);
    expect(parseLocaleNumber('abc')).toBeNaN();
  });
});

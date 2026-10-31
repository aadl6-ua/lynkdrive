import { describe, expect, it } from 'vitest';
import { buildQuery, errorMessage } from './api';
import { bookingTone, formatMonth, fullName, totalPages } from './format';

describe('buildQuery', () => {
  it('omite valores vacíos y codifica el resto', () => {
    expect(buildQuery({ page: 2, search: 'ana lópez', filter: undefined, status: '' })).toBe(
      '?page=2&search=ana+l%C3%B3pez'
    );
    expect(buildQuery({})).toBe('');
  });
});

describe('errorMessage', () => {
  it('une los mensajes de class-validator', () => {
    expect(errorMessage({ message: ['a', 'b'] }, 'x')).toBe('a. b');
    expect(errorMessage({ message: 'No encontrado' }, 'x')).toBe('No encontrado');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
  });
});

describe('format', () => {
  it('calcula páginas con mínimo 1', () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(41, 20)).toBe(3);
  });

  it('formatea nombres y meses', () => {
    expect(fullName({ firstName: 'Ana', lastName: 'López' })).toBe('Ana López');
    expect(fullName(null)).toBe('—');
    expect(formatMonth('2026-10')).toMatch(/oct/i);
  });

  it('asigna tono por estado de reserva', () => {
    expect(bookingTone('completed')).toBe('success');
    expect(bookingTone('cancelled')).toBe('danger');
  });
});

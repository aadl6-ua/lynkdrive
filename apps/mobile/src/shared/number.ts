export function parseLocaleNumber(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

import { ValidationError } from '../exceptions.js';

/** Assert that `value` is a non-empty string. */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

/** Assert that `value` is a positive finite number. */
export function requirePositiveNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) {
    throw new ValidationError(`${field} must be a positive number`);
  }
  return n;
}

/** Assert that `value` is a non-negative finite number. */
export function requireNonNegative(value: unknown, field: string): number {
  const n = Number(value);
  if (!isFinite(n) || n < 0) {
    throw new ValidationError(`${field} must be a non-negative number`);
  }
  return n;
}

/** Assert that `value` is a non-negative finite integer. */
export function requireNonNegativeInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
  return n;
}

/** Assert that exactly one of the two values is supplied. */
export function requireOneOf(
  a: unknown,
  aName: string,
  b: unknown,
  bName: string,
): void {
  const hasA = a !== undefined && a !== null && a !== '';
  const hasB = b !== undefined && b !== null && b !== '';
  if (hasA && hasB) {
    throw new ValidationError(`Only one of ${aName} or ${bName} may be supplied`);
  }
  if (!hasA && !hasB) {
    throw new ValidationError(`One of ${aName} or ${bName} must be supplied`);
  }
}

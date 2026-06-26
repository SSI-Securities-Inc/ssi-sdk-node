import { OrderSide } from '../enums/trading.js';

/** Safely convert a value to `number` (float). Returns `defaultValue` when conversion fails. */
export function toFloat(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  const n = Number(value);
  return isFinite(n) ? n : defaultValue;
}

/** Safely convert a value to integer. Returns `defaultValue` when conversion fails. */
export function toInt(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  const n = parseInt(String(value), 10);
  return isFinite(n) ? n : defaultValue;
}

/** Like `toFloat` but returns an integer when the fractional part is zero. */
export function toNumber(value: unknown, defaultValue = 0): number {
  const n = toFloat(value, defaultValue);
  return n % 1 === 0 ? Math.trunc(n) : n;
}

/** Converts a value to a price number or an `OrderSide` enum if applicable. */
export function toPrice(value: unknown): number | OrderSide {
  if (typeof value === 'string' && Object.values(OrderSide).includes(value as OrderSide)) {
    return value as OrderSide;
  }
  return toNumber(value);
}

import { ValidationError } from '../exceptions.js';

/**
 * Validate that a value is present: not null/undefined, not a blank string, not an empty
 * array/Set/Map. `0` and `false` count as present.
 */
export function requireNonEmpty<T>(value: T, field: string): T {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    throw new ValidationError(`${field} is required and cannot be empty`);
  }
  if (
    (Array.isArray(value) && value.length === 0) ||
    ((value instanceof Set || value instanceof Map) && value.size === 0)
  ) {
    throw new ValidationError(`${field} is required and cannot be empty`);
  }
  return value;
}

/** Assert that `value` is a non-empty string. */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

/** Validate that a string is undefined or empty. */
export function requireEmpty(value: string | null | undefined, field: string): void {
  if (value) throw new ValidationError(`${field} must be empty or undefined, got '${value}'`);
}

/** Assert that `value` is a positive finite number. */
export function requirePositiveNumber(value: unknown, field: string): number {
  const n = typeof value === 'boolean' ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`${field} must be positive, got ${String(value)}`);
  }
  return n;
}

/** Assert that `value` is a non-negative finite number. */
export function requireNonNegative(value: unknown, field: string): number {
  const n = typeof value === 'boolean' ? NaN : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${field} must be non-negative, got ${String(value)}`);
  }
  return n;
}

/** Assert that `value` is a non-negative finite integer. */
export function requireNonNegativeInt(value: unknown, field: string): number {
  const n = typeof value === 'boolean' ? NaN : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
  return n;
}

/** Validate that a value is in an allowed set. */
export function requireIn<T>(value: T, allowed: Iterable<T>, field: string): T {
  const set = new Set(allowed);
  if (!set.has(value)) {
    throw new ValidationError(
      `${field} must be one of [${[...set].map(String).sort().join(', ')}], got '${String(value)}'`,
    );
  }
  return value;
}

const SYMBOL_RE = /^[A-Za-z0-9]+$/;

/** Validate a single alphanumeric ticker symbol (no lists, no separators). */
export function requireSymbol(value: unknown, field = 'symbol'): string {
  requireNonEmpty(value, field);
  if (typeof value !== 'string' || !SYMBOL_RE.test(value)) {
    throw new ValidationError(`${field} must be a single alphanumeric symbol, got '${String(value)}'`);
  }
  return value;
}

const DATE_RE = /^(\d{4})\/(\d{2})\/(\d{2})$/;
const DATETIME_RE = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export interface DateArgOptions {
  /** Also accept the `YYYY/MM/DD HH:MM:SS` layout. */
  allowTime?: boolean;
  /** Accept only the `YYYY/MM/DD HH:MM:SS` layout (as FCO dates need). */
  timeRequired?: boolean;
}

/**
 * Parse a `YYYY/MM/DD` (optionally `YYYY/MM/DD HH:MM:SS`) request date into a Date
 * (local time; midnight for a date-only value).
 *
 * @throws ValidationError if the value does not match an accepted layout.
 */
export function parseDateArg(value: unknown, field: string, options: DateArgOptions = {}): Date {
  requireNonEmpty(value, field);
  const text = String(value);
  const { allowTime = false, timeRequired = false } = options;
  const candidates: Array<RegExp> = timeRequired
    ? [DATETIME_RE]
    : allowTime
      ? [DATE_RE, DATETIME_RE]
      : [DATE_RE];
  for (const re of candidates) {
    const m = re.exec(text);
    if (!m) continue;
    const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map(Number);
    const date = new Date(y, mo - 1, d, h, mi, s);
    if (
      date.getFullYear() === y &&
      date.getMonth() === mo - 1 &&
      date.getDate() === d &&
      date.getHours() === h &&
      date.getMinutes() === mi &&
      date.getSeconds() === s
    ) {
      return date;
    }
  }
  const expected = timeRequired
    ? 'YYYY/MM/DD HH:MM:SS'
    : allowTime
      ? 'YYYY/MM/DD HH:MM:SS or YYYY/MM/DD'
      : 'YYYY/MM/DD';
  throw new ValidationError(`${field} must be formatted ${expected}, got '${text}'`);
}

export interface DateRangeOptions extends DateArgOptions {
  /** Maximum allowed span in days, if the endpoint has one. */
  maxDays?: number;
}

/** Validate a from/to pair: both well formed, `from <= to`, optional span cap. */
export function requireDateRange(
  fromDate: unknown,
  toDate: unknown,
  options: DateRangeOptions = {},
): void {
  const start = parseDateArg(fromDate, 'from', options);
  const end = parseDateArg(toDate, 'to', options);
  if (start.getTime() > end.getTime()) {
    throw new ValidationError(`from must not be after to (${String(fromDate)} > ${String(toDate)})`);
  }
  if (options.maxDays !== undefined && end.getTime() - start.getTime() > options.maxDays * 86_400_000) {
    throw new ValidationError(`date range must not exceed ${options.maxDays} days`);
  }
}

/** Validate that exactly one of two optional arguments was given (XOR). */
export function requireExactlyOne(
  first: unknown,
  second: unknown,
  firstName: string,
  secondName: string,
): void {
  const hasFirst = first !== undefined && first !== null && first !== '' && first !== 0 && first !== false;
  const hasSecond =
    second !== undefined && second !== null && second !== '' && second !== 0 && second !== false;
  if (hasFirst === hasSecond) {
    throw new ValidationError(`exactly one of ${firstName} or ${secondName} is required`);
  }
}

/** Assert that exactly one of the two values is supplied (alias of requireExactlyOne). */
export function requireOneOf(a: unknown, aName: string, b: unknown, bName: string): void {
  requireExactlyOne(a, b, aName, bName);
}

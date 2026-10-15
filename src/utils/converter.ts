import { OrderType } from '../enums/trading.js';
import { ValidationError } from '../exceptions.js';

/** Server "no data" marker: HTTP 200 with `{"code": 204, "msg": "No Content"}`. */
const NO_CONTENT_CODE = '204';

/** A plain object as parsed from JSON. */
export type Dict = Record<string, unknown>;

/** Parse a finite number from a number or numeric string (thousands separators allowed). */
function toFiniteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/,/g, '');
  if (text === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert to an enum member, keeping the raw value when it is not a known member.
 *
 * Matches by value or by member name, case-insensitively. Returns `undefined` for
 * null/undefined/"".
 */
export function toEnum<E extends Record<string, string | number>>(
  enumObj: E,
  value: unknown,
): E[keyof E] | string | number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const found = fromValue(enumObj, value);
  if (found !== undefined) return found;
  return value as string | number;
}

/** Case-insensitive lookup of an enum member by value or name; `undefined` when unknown. */
export function fromValue<E extends Record<string, string | number>>(
  enumObj: E,
  value: unknown,
): E[keyof E] | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const text = String(value).trim().toLowerCase();
  for (const key of Object.keys(enumObj)) {
    // Skip the reverse-mapping entries of numeric enums.
    if (/^\d+$/.test(key)) continue;
    const member = enumObj[key] as E[keyof E];
    if (String(member).toLowerCase() === text || key.toLowerCase() === text) return member;
  }
  return undefined;
}

/** Return the first value among `keys` that is present and not null/undefined. */
export function pick<T = unknown>(data: Dict | null | undefined, keys: string[], defaultValue?: T): T {
  if (data) {
    for (const key of keys) {
      const value = data[key];
      if (value !== null && value !== undefined) return value as T;
    }
  }
  return defaultValue as T;
}

/** Whether a response body is the server's `{"code": 204}` empty-result marker. */
export function isNoContent(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    String((body as Dict).code) === NO_CONTENT_CODE
  );
}

/** Safely convert a value to a number. Accepts thousands separators; inf/nan are rejected. */
export function toFloat(value: unknown, defaultValue = 0): number {
  const n = toFiniteOrNull(value);
  return n === null ? defaultValue : n;
}

/**
 * Safely convert a value to an integer (fraction truncated toward zero).
 * Accepts `"1234.0"`, `"2,493,089"`, `"-3"`.
 */
export function toInt(value: unknown, defaultValue = 0): number {
  const n = toFiniteOrNull(value);
  return n === null ? defaultValue : Math.trunc(n);
}

/** Convert to int, returning `undefined` (not 0) when the value is missing or invalid. */
export function toOptInt(value: unknown): number | undefined {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return undefined;
  }
  const n = toFiniteOrNull(value);
  return n === null ? undefined : Math.trunc(n);
}

/** Convert to float, returning `undefined` (not 0) when the value is missing or invalid. */
export function toOptFloat(value: unknown): number | undefined {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return undefined;
  }
  const n = toFiniteOrNull(value);
  return n === null ? undefined : n;
}

/**
 * Convert a price-like value to a number, keeping un-parsable values verbatim.
 *
 * Returns 0 for null/empty; the original value for a non-numeric marker such as `"ATO"`, so a
 * stream message never loses a field the SDK cannot parse.
 */
export function toDecimal(value: unknown): number | string | boolean {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return 0;
  }
  if (typeof value === 'boolean') return value;
  const n = toFiniteOrNull(value);
  return n === null ? (value as string) : n;
}

/** A plain decimal as text: optional sign, digits with an optional fraction. No exponent. */
const PLAIN_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** Expand exponent notation (`1e+2`, `1.5e-7`) into a plain decimal string. */
function expandExponent(text: string): string {
  const match = /^([+-]?)(\d*)\.?(\d*)[eE]([+-]?\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, intPart, fracPart, expText] = match;
  const exp = parseInt(expText, 10);
  let digits = intPart + fracPart;
  let pointAt = intPart.length + exp;
  if (pointAt <= 0) {
    digits = '0'.repeat(1 - pointAt) + digits;
    pointAt = 1;
  } else if (pointAt > digits.length) {
    digits += '0'.repeat(pointAt - digits.length);
  }
  let whole = digits.slice(0, pointAt).replace(/^0+(?=\d)/, '');
  let frac = digits.slice(pointAt).replace(/0+$/, '');
  if (whole === '') whole = '0';
  return `${sign === '-' ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/**
 * Serialize a price for a request body without exponent notation.
 *
 * `1e2` -> `"100"`, `0.1` -> `"0.1"`, `"25.50"` -> `"25.50"` (digits are kept as given).
 *
 * @throws ValidationError if the value is not a finite number.
 */
export function formatPrice(value: unknown): string {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    throw new ValidationError('price must be a finite number');
  }
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('price must be a finite number');
    text = expandExponent(String(value));
  } else if (typeof value === 'bigint') {
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
    if (!PLAIN_DECIMAL.test(text)) {
      throw new ValidationError('price must be a plain decimal number (no exponent, separators or NaN/inf)');
    }
  } else {
    throw new ValidationError('price must be a finite number');
  }
  if (text.startsWith('+')) text = text.slice(1);
  if (text.startsWith('.')) text = `0${text}`;
  else if (text.startsWith('-.')) text = `-0${text.slice(1)}`;
  if (text.endsWith('.')) text = text.slice(0, -1);
  return text;
}

/**
 * Normalize a caller-supplied price: a finite number or a plain decimal string (kept as
 * given) or `undefined`.
 *
 * A string must be a plain decimal: no exponent, thousands separator, NaN/inf, or empty text.
 * (A number may print with an exponent in JS, e.g. `1e21`; `formatPrice` expands it.)
 *
 * @throws ValidationError if the value is a bool, not numeric, or not finite.
 */
export function toPriceDecimal(value: unknown): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') throw new ValidationError('price must be a number');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('price must be a finite number');
    return value;
  }
  if (typeof value !== 'string' && typeof value !== 'bigint') {
    throw new ValidationError('price must be a number or a decimal string');
  }
  const text = String(value).trim();
  if (!PLAIN_DECIMAL.test(text)) {
    throw new ValidationError('price must be a plain decimal number (no exponent, separators or NaN/inf)');
  }
  return text;
}

/** Canonical form of a plain decimal: no sign on zero, no leading/trailing zeros. */
function normalizeDecimal(text: string): string {
  const negative = text.startsWith('-');
  const [intRaw, fracRaw = ''] = text.replace(/^[+-]/, '').split('.');
  const whole = intRaw.replace(/^0+(?=\d)/, '') || '0';
  const frac = fracRaw.replace(/0+$/, '');
  const body = frac ? `${whole}.${frac}` : whole;
  return negative && body !== '0' ? `-${body}` : body;
}

/**
 * Turn a `PriceLike` into the JSON number the API expects for trigger fields (stop/active
 * prices, trailing amounts, slips), refusing a decimal string that a JS number cannot hold
 * exactly, so a value is never rounded behind the caller's back.
 *
 * @throws ValidationError on a bool, non-numeric, non-finite, exponent/empty string, or a
 *   string that would be rounded by the conversion.
 */
export function toJsonNumber(value: unknown, field: string): number {
  const normalized = toPriceDecimal(value);
  if (normalized === undefined) throw new ValidationError(`${field} is required`);
  if (typeof normalized === 'number') return normalized;
  const n = Number(normalized);
  if (!Number.isFinite(n) || normalizeDecimal(formatPrice(n)) !== normalizeDecimal(normalized)) {
    throw new ValidationError(`${field} '${normalized}' cannot be sent as a JSON number without rounding`);
  }
  return n;
}

const DATE_PATTERNS: Array<{ re: RegExp; order: 'ymd' | 'mdy' | 'dmy' }> = [
  { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?: \d{1,2}:\d{2}:\d{2})?$/, order: 'ymd' },
  { re: /^(\d{4})-(\d{1,2})-(\d{1,2})(?: \d{1,2}:\d{2}:\d{2})?$/, order: 'ymd' },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4}) \d{1,2}:\d{2}:\d{2}$/, order: 'dmy' },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'mdy' },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'dmy' },
];

function validYmd(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : null;
}

/**
 * Parse a server date in any of the known layouts (YYYY/MM/DD, YYYY-MM-DD, MM/DD/YYYY,
 * dd/MM/yyyy, optionally followed by HH:MM:SS). With a time, `a/b/YYYY HH:MM:SS` reads as
 * dd/MM/YYYY; without one, an ambiguous value like 01/02/2025 reads as MM/DD/YYYY (then
 * dd/MM/YYYY when that is not a valid date). Returns `undefined` when empty or matching no layout.
 */
export function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const text = value.trim();
  for (const { re, order } of DATE_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date =
      order === 'ymd' ? validYmd(a, b, c) : order === 'mdy' ? validYmd(c, a, b) : validYmd(c, b, a);
    if (date) return date;
  }
  return undefined;
}

/** Like `toFloat` but never produces a fractional zero (it is a JS number either way). */
export function toNumber(value: unknown, defaultValue = 0): number {
  const n = toFiniteOrNull(value);
  return n === null ? defaultValue : n;
}

/**
 * Parse a price: a number when numeric, else the order-type marker the server sent.
 *
 * ATO/ATC/MP/MTL/MOK/MAK orders carry a word instead of a price, so the result is an
 * `OrderType` for a known marker and the raw string for anything else.
 */
export function toPrice(value: unknown): number | OrderType | string {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string' && !value.trim()) return 0;
  const n = toFiniteOrNull(value);
  if (n !== null) return n;
  const text = String(value).trim();
  return fromValue(OrderType, text) ?? text;
}

/** Redaction helpers: mask secrets before anything reaches a log, a string or an exception. */

/** Lower-cased names of fields whose values must never be logged. */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'apisecret',
  'api_secret',
  'apikey',
  'api_key',
  'otp',
  'pin',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'signature',
  'x-signature',
  'password',
  'privatekey',
  'private_key',
  'transactionid',
  'transaction_id',
  'accountno',
  'account_no',
  'account',
]);

const VISIBLE_TAIL = 4;
const BEARER = /\b(bearer)\s+[A-Za-z0-9._~+/=-]+/gi;

/** Mask a secret, keeping at most the last 4 characters (none when it is 8 characters or fewer). */
export function mask(value: unknown): string {
  const text = String(value);
  if (text.length <= 2 * VISIBLE_TAIL) return '***';
  return '***' + text.slice(-VISIBLE_TAIL);
}

/** Mask the token in any `Bearer <token>` occurrence inside `text`. */
export function maskBearer(text: string): string {
  return text.replace(BEARER, (match: string, scheme: string) => {
    const token = match.slice(scheme.length).trim();
    return `${scheme} ${mask(token)}`;
  });
}

/**
 * Return a copy of `data` with sensitive values masked, recursively.
 *
 * Object keys are matched case-insensitively against {@link SENSITIVE_KEYS}; arrays and nested
 * objects are walked; strings have any bearer token masked. The input is not mutated.
 */
export function redact(data: unknown): unknown {
  return redactInner(data, new WeakSet<object>());
}

function redactInner(data: unknown, seen: WeakSet<object>): unknown {
  if (typeof data === 'string') return maskBearer(data);
  if (data === null || typeof data !== 'object') return data;
  if (seen.has(data)) return '[Circular]';
  seen.add(data);
  if (Array.isArray(data)) return data.map((item) => redactInner(item, seen));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    out[key] =
      SENSITIVE_KEYS.has(key.toLowerCase()) && value !== null && value !== undefined
        ? mask(value)
        : redactInner(value, seen);
  }
  return out;
}

/** Return `url` without its query string, fragment or userinfo (safe to log). */
export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? '';
  }
}

/** Node's `util.inspect` hook symbol: lets a class print a redacted form. */
export const INSPECT_CUSTOM: unique symbol = Symbol.for('nodejs.util.inspect.custom') as never;

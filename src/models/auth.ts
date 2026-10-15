import { TOKEN_EXPIRY_SKEW_SECONDS } from '../constants.js';
import { INSPECT_CUSTOM, mask } from '../utils/redact.js';
import { toInt } from '../utils/converter.js';

/** Epoch values at or above this are milliseconds (10^10 s is the year 2286). */
const MS_THRESHOLD = 1e10;

/**
 * Normalize an epoch to seconds.
 *
 * The server sends seconds; a millisecond value (>= 1e10) is divided by 1000 defensively.
 * Missing, garbage and negatives become 0 (meaning "unknown/expired").
 */
export function toSeconds(value: unknown): number {
  let seconds = toInt(value);
  if (seconds >= MS_THRESHOLD) seconds = Math.floor(seconds / 1000);
  return Math.max(seconds, 0);
}

/** Request to obtain an access token using consumer credentials. */
export interface TokenRequest {
  apiKey: string;
  apiSecret: string;
  /** Normal OTP flow; mutually exclusive with `transactionId`. */
  otp?: string;
  /** Smart OTP flow; mutually exclusive with `otp`. */
  transactionId?: string;
}

/** Request to get OTP for trading operations. */
export interface OTPRequest {
  apiKey: string;
  apiSecret: string;
}

/** Request to refresh an access token using a refresh token. */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/** The fields of a token; epochs are in seconds. */
export interface TokenInit {
  accessToken: string;
  tokenType?: string;
  /** Access token expiry, epoch **seconds** (0 = unknown, treated as expired). */
  expiresAt?: number;
  refreshToken?: string;
  /** Refresh token expiry, epoch seconds. */
  refreshExpiresAt?: number;
}

/**
 * OAuth2-style access token.
 *
 * The secrets are hidden from `toString()`, `console.log` and `JSON.stringify`; use
 * `toDict()` when you really need the raw values (e.g. to persist them).
 */
export class Token {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresAt: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: number;

  constructor(init: TokenInit) {
    this.accessToken = init.accessToken ?? '';
    this.tokenType = init.tokenType ?? 'Bearer';
    this.expiresAt = toSeconds(init.expiresAt);
    this.refreshToken = init.refreshToken ?? '';
    this.refreshExpiresAt = toSeconds(init.refreshExpiresAt);
  }

  /** Build a Token from a server body (camelCase keys), with defaults for missing keys. */
  static fromDict(data: Record<string, unknown>): Token {
    return new Token({
      accessToken: typeof data.accessToken === 'string' ? data.accessToken : '',
      tokenType: typeof data.tokenType === 'string' ? data.tokenType : 'Bearer',
      expiresAt: toSeconds(data.expiresAt),
      refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : '',
      refreshExpiresAt: toSeconds(data.refreshExpiresAt),
    });
  }

  /**
   * Epoch seconds after which this token set can no longer be used without a new OTP: the
   * earlier of the access-token and refresh-token expiries, ignoring an unknown one (<= 0).
   * 0 when both are unknown.
   */
  get effectiveExpiresAt(): number {
    const known = [this.expiresAt, this.refreshExpiresAt].filter((t) => t > 0);
    return known.length > 0 ? Math.min(...known) : 0;
  }

  /**
   * Whether the refresh token is present and not (about to be) expired. An unknown refresh
   * expiry (<= 0) is given the benefit of the doubt: the server rejects it if it is dead.
   */
  get canRefresh(): boolean {
    if (!this.refreshToken) return false;
    if (this.refreshExpiresAt <= 0) return true;
    return Date.now() / 1000 < this.refreshExpiresAt - TOKEN_EXPIRY_SKEW_SECONDS;
  }

  /** The raw token values (camelCase keys mirroring the API token schema). */
  toDict(): Record<string, unknown> {
    return {
      accessToken: this.accessToken,
      tokenType: this.tokenType,
      expiresAt: this.expiresAt,
      refreshToken: this.refreshToken,
      refreshExpiresAt: this.refreshExpiresAt,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      accessToken: this.accessToken ? mask(this.accessToken) : '',
      tokenType: this.tokenType,
      expiresAt: this.expiresAt,
      refreshToken: this.refreshToken ? mask(this.refreshToken) : '',
      refreshExpiresAt: this.refreshExpiresAt,
    };
  }

  toString(): string {
    return (
      `Token(tokenType=${this.tokenType}, expiresAt=${this.expiresAt}, ` +
      `refreshExpiresAt=${this.refreshExpiresAt})`
    );
  }

  [INSPECT_CUSTOM](): string {
    return this.toString();
  }
}

/**
 * Response to an OTP request. `transactionId` is only present for Smart OTP (push approval);
 * SMS/e-mail OTP responses carry just a message.
 */
export class OTPResponse {
  readonly message: string;
  readonly transactionId?: string;

  constructor(message = '', transactionId?: string) {
    this.message = message;
    this.transactionId = transactionId;
  }

  /** Build from the `requestOtp` response body; `message`/`msg` and `transactionId` are optional. */
  static fromDict(data: Record<string, unknown>): OTPResponse {
    const inner = data.data;
    const payload =
      inner !== null && typeof inner === 'object' && !Array.isArray(inner)
        ? (inner as Record<string, unknown>)
        : data;
    const transactionId = payload.transactionId;
    return new OTPResponse(
      String(payload.message || payload.msg || ''),
      transactionId ? String(transactionId) : undefined,
    );
  }

  toJSON(): Record<string, unknown> {
    return { message: this.message, transactionId: this.transactionId ? '***' : undefined };
  }

  toString(): string {
    return `OTPResponse(message=${JSON.stringify(this.message)})`;
  }

  [INSPECT_CUSTOM](): string {
    return this.toString();
  }
}

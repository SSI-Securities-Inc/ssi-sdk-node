/** Error hierarchy for the SSI SDK. */

import { redact } from './utils/redact.js';

export interface SSIErrorOptions {
  /** The server's application error code (e.g. 400107), or an SDK code. */
  code?: string | number;
  /** HTTP status code associated with the error. */
  statusCode?: number;
  /** Parsed response body; secrets in it are masked. */
  responseBody?: unknown;
  /** HTTP response headers. */
  headers?: Record<string, string>;
}

export class SSIError extends Error {
  readonly code?: string | number;
  readonly statusCode?: number;
  readonly responseBody?: unknown;
  readonly headers: Record<string, string>;

  constructor(message = '', options: SSIErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    // Maintain proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.responseBody = options.responseBody === undefined ? undefined : redact(options.responseBody);
    this.headers = options.headers ?? {};
  }
}

/**
 * The SSI API returned an error response.
 *
 * `code` is the server's own error code (e.g. `400107`) when the body carried one, otherwise
 * the HTTP status as a string; `statusCode` is always the HTTP status.
 */
export class APIError extends SSIError {
  constructor(
    message: string,
    code?: string | number,
    statusCode?: number,
    responseBody?: unknown,
    headers?: Record<string, string>,
  ) {
    super(message, { code, statusCode, responseBody, headers });
  }
}

/**
 * Authentication failed (invalid credentials, expired token, ...).
 *
 * A sibling of `APIError` (both extend `SSIError`), so `catch (e) { if (e instanceof APIError) }`
 * does not swallow auth failures, Smart OTP states or `ReauthenticationRequired`.
 */
export class AuthenticationError extends SSIError {
  constructor(
    message = '',
    code?: string | number,
    statusCode?: number,
    responseBody?: unknown,
    headers?: Record<string, string>,
  ) {
    super(message, { code, statusCode, responseBody, headers });
  }
}

/**
 * The API rate limit was exceeded.
 *
 * The server sends `X-RateLimit-Limit`/`X-RateLimit-Remaining` and, on 429, `Retry-After`. It
 * does not send a reset time, so `reset` stays undefined unless a caller supplies one.
 * `retryAfterMs` is in **milliseconds** (the `Retry-After` header is converted from seconds).
 * `limit` and `remaining` are the server's numbers as sent (requests per second, requests left).
 */
export class RateLimitError extends SSIError {
  readonly retryAfterMs?: number;
  readonly limit?: number;
  readonly remaining?: number;
  readonly reset?: number;

  constructor(
    message = '',
    retryAfterMs?: number,
    options: SSIErrorOptions & { limit?: number; remaining?: number; reset?: number } = {},
  ) {
    super(message, {
      code: options.code ?? 'RATE_LIMITED',
      statusCode: options.statusCode ?? 429,
      responseBody: options.responseBody,
      headers: options.headers,
    });
    this.retryAfterMs = retryAfterMs;
    this.limit = options.limit;
    this.remaining = options.remaining;
    this.reset = options.reset;
  }
}

/** A WebSocket connection or communication error. */
export class WebSocketError extends SSIError {}

/**
 * An error frame from the trading WebSocket: `{ id, status, error: {...} }`.
 *
 * It never carries the signed `params` (they hold account numbers).
 */
export class TradingWSError extends WebSocketError {
  readonly status: number;
  readonly errorCode: string;
  readonly serverMessage: string;

  constructor(status: number, code: string, message: string) {
    super(`${status} ${code}: ${message}`, { code, statusCode: status });
    this.status = status;
    this.errorCode = code;
    this.serverMessage = message;
  }
}

/** Input validation failed. */
export class ValidationError extends SSIError {}

export class ConfigurationError extends SSIError {}

/** Smart OTP push-approval has not been confirmed on the device yet (HTTP 202 / 401114). */
export class SmartOTPPendingError extends AuthenticationError {}

/** Smart OTP approval can no longer succeed (rejected, expired or unknown transaction). */
export class SmartOTPRejectedError extends AuthenticationError {}

/** The session cannot be refreshed; the user must authenticate again with a new OTP. */
export class ReauthenticationRequired extends AuthenticationError {}

/**
 * HTTP 409: `clientRequestId`/`batchRequestId` was already used today.
 *
 * The SDK never retries the order under a new id; the original order may be live.
 */
export class DuplicateRequestError extends APIError {}

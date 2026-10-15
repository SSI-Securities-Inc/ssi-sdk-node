import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Config } from '../config.js';
import {
  HEADER_AUTHORIZATION,
  HEADER_CONTENT_TYPE,
  HEADER_ACCEPT,
  HEADER_USER_AGENT,
  HEADER_RATE_LIMIT_LIMIT,
  HEADER_RATE_LIMIT_REMAINING,
  HEADER_RETRY_AFTER,
  DEFAULT_USER_AGENT,
  CONTENT_TYPE_JSON,
  AUTH_SCHEME_BEARER,
  HTTP_STATUS_CONFLICT,
  RATE_LIMIT_DEFAULT_WAIT_MS,
  RATE_LIMIT_MAX_RETRIES,
  RATE_LIMIT_MAX_WAIT_MS,
  SMART_OTP_PENDING_CODE,
  SMART_OTP_PENDING_STATUS,
  SMART_OTP_TERMINAL_CODES,
  TRADING_API_PATH_PREFIXES,
} from '../constants.js';
import {
  APIError,
  AuthenticationError,
  DuplicateRequestError,
  RateLimitError,
  SmartOTPPendingError,
  SmartOTPRejectedError,
  SSIError,
} from '../exceptions.js';
import { RateLimiter, retryAsync, isNetworkError } from '../utils/retry.js';
import { redact } from '../utils/redact.js';
import { createLogger } from '../utils/logger.js';

type Body = unknown;

function intOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  return parseInt(text, 10);
}

/** Parse `Retry-After` (delta-seconds) into milliseconds; an HTTP-date or garbage yields undefined. */
function retryAfterMs(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
  return Math.round(parseFloat(text) * 1000);
}

/** The server's `code` from a `{code, msg}` body (a number when numeric). */
function serverCode(body: Body): number | string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const code = (body as Record<string, unknown>).code;
  if (code === null || code === undefined) return undefined;
  return intOrUndefined(code) ?? String(code);
}

/** The server's `msg`/`message`, else a short slice of the raw text. */
function serverMessage(body: Body, text: string): string {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    for (const key of ['msg', 'message']) {
      const value = (body as Record<string, unknown>)[key];
      if (value) return String(value);
    }
  }
  return text.slice(0, 200);
}

function bodyText(data: unknown): string {
  return typeof data === 'string' ? data : '';
}

function headerMap(headers: AxiosResponse['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value !== undefined && value !== null) out[key.toLowerCase()] = String(value);
  }
  return out;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}

/**
 * Build the exception for a non-2xx response (or a 2xx whose body carries an error code).
 * The message carries only the server's code and msg, never the raw body or URL.
 */
function errorFor(status: number, body: Body, rawData: unknown, headers: Record<string, string>): SSIError {
  const code = serverCode(body);
  const detail = serverMessage(body, bodyText(rawData));
  let message = `API error ${status}${code !== undefined ? ` [${code}]` : ''}`;
  if (detail) message = `${message}: ${detail}`;
  const responseBody =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? redact(body) : undefined;
  const shownCode = code !== undefined ? code : String(status);

  if (status === 429) {
    return new RateLimitError(message, retryAfterMs(header(headers, HEADER_RETRY_AFTER)), {
      code: shownCode,
      statusCode: status,
      responseBody,
      headers,
      limit: intOrUndefined(header(headers, HEADER_RATE_LIMIT_LIMIT)),
      remaining: intOrUndefined(header(headers, HEADER_RATE_LIMIT_REMAINING)),
    });
  }
  if (status === 401 || status === 403) {
    if (typeof code === 'number' && SMART_OTP_TERMINAL_CODES.has(code)) {
      return new SmartOTPRejectedError(message, shownCode, status, responseBody, headers);
    }
    return new AuthenticationError(message, shownCode, status, responseBody, headers);
  }
  if (status === HTTP_STATUS_CONFLICT) {
    return new DuplicateRequestError(message, shownCode, status, responseBody, headers);
  }
  return new APIError(message, shownCode, status, responseBody, headers);
}

/**
 * Parse and validate an HTTP response.
 *
 * Order matters: a pending Smart OTP arrives as HTTP 202 (not an error status), and a failure
 * can arrive as HTTP 200 with a `{code, msg}` body.
 *
 * Returns the parsed body. An empty result is `{code: 204, ...}` (see `isNoContent`).
 */
export function handleResponse(status: number, data: unknown, rawHeaders: Record<string, string>): Body {
  const parsed = typeof data === 'string' ? tryParseJson(data) : data;
  if (status >= 400) throw errorFor(status, parsed, data, rawHeaders);
  if (status === 204) return {};

  const body = parsed === '' ? undefined : parsed;
  if (status === SMART_OTP_PENDING_STATUS && serverCode(body) === SMART_OTP_PENDING_CODE) {
    throw new SmartOTPPendingError(
      `Smart OTP approval pending [${SMART_OTP_PENDING_CODE}]: ${serverMessage(body, '')}`,
      SMART_OTP_PENDING_CODE,
      status,
      redact(body),
      rawHeaders,
    );
  }
  if (body === undefined || body === null || typeof body === 'string') {
    throw new APIError(
      `API returned a non-JSON body (HTTP ${status})`,
      String(status),
      status,
      undefined,
      rawHeaders,
    );
  }
  if (typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if ('msg' in record || 'message' in record) {
      const code = intOrUndefined(record.code);
      if (code !== undefined && code !== 200 && code !== 204) {
        throw errorFor(status, body, data, rawHeaders);
      }
    }
  }
  return body;
}

function tryParseJson(text: string): unknown {
  if (text === '') return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** How long (ms) to wait after a 429 (`Retry-After`, else 1s doubling), or undefined to give up. */
function rateWait(error: RateLimitError, attempt: number): number | undefined {
  const wait = error.retryAfterMs ? error.retryAfterMs : RATE_LIMIT_DEFAULT_WAIT_MS * 2 ** attempt;
  return wait <= RATE_LIMIT_MAX_WAIT_MS ? wait : undefined;
}

export interface RequestOptions {
  params?: Record<string, unknown>;
  /** A plain object (sent as JSON) or an already-serialised string (sent as is, e.g. signed orders). */
  data?: unknown;
  headers?: Record<string, string>;
  /**
   * Retry on timeout with backoff. Defaults to true for GET and false for every other verb:
   * a timed-out POST/PUT/DELETE may already have been processed (an order, an OTP).
   */
  retry?: boolean;
}

export interface RateLimitSeen {
  limit?: number;
  remaining?: number;
}

// ---------------------------------------------------------------------------
// REST Client
// ---------------------------------------------------------------------------
export class RestClient {
  private readonly rateLimiter: RateLimiter;
  private readonly headers: Record<string, string>;
  private readonly axiosInstance: AxiosInstance;
  private readonly logger;
  /** Last X-RateLimit-Limit / -Remaining seen. */
  rateLimit: RateLimitSeen = {};

  constructor(private readonly config: Config) {
    this.rateLimiter = new RateLimiter(config.rateLimitPerSecond);
    this.logger = createLogger('ssi_sdk.transport.rest', config.logLevel);
    this.headers = {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
      [HEADER_ACCEPT]: CONTENT_TYPE_JSON,
      [HEADER_USER_AGENT]: config.userAgent || DEFAULT_USER_AGENT,
    };
    this.axiosInstance = this.createInstance();
  }

  private createInstance(): AxiosInstance {
    const cfg: AxiosRequestConfig = {
      baseURL: this.config.apiUrl,
      timeout: this.config.timeoutMs,
      // Every status is handled by handleResponse so errors carry the server's own code.
      validateStatus: () => true,
      // Keep the body as text: handleResponse parses it (and rejects non-JSON on 2xx).
      transformResponse: [(raw: unknown) => raw],
      paramsSerializer: {
        serialize: (params) => {
          const parts: string[] = [];
          for (const [key, val] of Object.entries(params)) {
            if (val === undefined || val === null) continue;
            const values = Array.isArray(val) ? val : [val];
            for (const item of values) {
              const encoded = encodeURIComponent(String(item)).replace(/%2F/g, '/');
              parts.push(`${encodeURIComponent(key)}=${encoded}`);
            }
          }
          return parts.join('&');
        },
      },
    };
    if (this.config.proxy) {
      const url = new URL(this.config.proxy);
      cfg.proxy = {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port, 10),
        ...(url.username ? { auth: { username: url.username, password: url.password } } : {}),
      };
    }
    return axios.create(cfg);
  }

  getPrivateKey(): string {
    return this.config.privateKey;
  }

  getConfig(): Config {
    return this.config;
  }

  setAuthHeader(token: string): void {
    this.headers[HEADER_AUTHORIZATION] = `${AUTH_SCHEME_BEARER}${token}`;
  }

  /** Drop the bearer token so a dead token is no longer sent. */
  clearAuthHeader(): void {
    delete this.headers[HEADER_AUTHORIZATION];
  }

  /** The URL to request: `path` as is, or on the trading host for trading/account paths. */
  private route(path: string): string {
    if (this.config.tradingApiDomain && TRADING_API_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      const base = this.config.tradingApiUrl;
      if (base !== this.config.apiUrl.replace(/\/+$/, '')) return base + path;
    }
    return path;
  }

  /** Follow the server's quota headers: never exceed the limit, rest 1s when remaining hits 0. */
  private observeRateLimit(headers: Record<string, string>): void {
    const seen: RateLimitSeen = {
      limit: intOrUndefined(header(headers, HEADER_RATE_LIMIT_LIMIT)),
      remaining: intOrUndefined(header(headers, HEADER_RATE_LIMIT_REMAINING)),
    };
    if (seen.limit !== undefined) this.rateLimiter.cap(seen.limit);
    if (seen.remaining === 0) this.rateLimiter.pause(1.0);
    this.rateLimit = seen;
  }

  private async send(method: string, url: string, options: RequestOptions): Promise<Body> {
    const reqHeaders: Record<string, string> = { ...this.headers, ...options.headers };
    const response = await this.axiosInstance.request({
      method,
      url,
      params: options.params,
      data: options.data,
      headers: reqHeaders,
    });
    const headers = headerMap(response.headers);
    this.observeRateLimit(headers);
    return handleResponse(response.status, response.data, headers);
  }

  /**
   * Make an authenticated HTTP request.
   *
   * @throws AuthenticationError on 401/403 (SmartOTPRejectedError for the terminal Smart OTP
   *   codes), RateLimitError on 429, DuplicateRequestError on 409, APIError for any other
   *   error status or a 200 body carrying an error code, SmartOTPPendingError for HTTP 202
   *   with code 401114.
   */
  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.route(path);
    const replayable = options.retry ?? method.toUpperCase() === 'GET';
    this.logger.debug(`${method} ${path}`);

    for (let attempt = 0; ; attempt++) {
      await this.rateLimiter.acquire();
      try {
        const run = (): Promise<Body> => this.send(method, url, options);
        if (!replayable) return (await this.guardNetwork(run)) as T;
        return (await this.guardNetwork(() =>
          retryAsync(run, this.config.maxRetries, this.config.retryDelayMs),
        )) as T;
      } catch (err) {
        if (!(err instanceof RateLimitError)) throw err;
        const wait = rateWait(err, attempt);
        if (!replayable || wait === undefined || attempt >= RATE_LIMIT_MAX_RETRIES) throw err;
        this.logger.info(`429 on ${path}: waiting ${(wait / 1000).toFixed(1)}s (attempt ${attempt + 1})`);
        this.rateLimiter.pause(wait / 1000);
      }
    }
  }

  /** Turn a transport failure into an SSIError without echoing the request (headers hold the token). */
  private async guardNetwork(run: () => Promise<Body>): Promise<Body> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof SSIError) throw err;
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (axios.isAxiosError(err) || isNetworkError(err)) {
        throw new SSIError(`Request failed: ${code ?? 'network error'}`, { code: code ?? 'NETWORK_ERROR' });
      }
      throw err;
    }
  }

  get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  post<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', path, { data, headers });
  }

  put<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PUT', path, { data, headers });
  }

  delete<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', path, { data, headers });
  }
}

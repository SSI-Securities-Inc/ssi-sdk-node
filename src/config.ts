import {
  DEFAULT_API_URL,
  DEFAULT_STREAMING_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY,
  DEFAULT_RATE_LIMIT_PER_SECOND,
} from './constants.js';

export interface ConfigOptions {
  /** Client ID for portfolio APIs. */
  clientId?: string;
  /** Base REST API URL. */
  apiUrl?: string;
  /** WebSocket streaming URL. */
  streamingUrl?: string;
  /** API key credential. */
  apiKey?: string;
  /** API secret credential. */
  apiSecret?: string;
  /**
   * Base64-encoded XML RSA private key used to sign trading orders.
   * The XML must follow the .NET `RSAKeyValue` schema:
   * `<RSAKeyValue><Modulus>…</Modulus><D>…</D>…</RSAKeyValue>`
   */
  privateKey?: string;
  /** HTTP / WebSocket request timeout in **milliseconds** (default: 60 000). */
  timeout?: number;
  /** Maximum retry attempts on timeout errors (default: 5). */
  maxRetries?: number;
  /** Base exponential back-off delay in **milliseconds** (default: 2 000). */
  retryDelay?: number;
  /** Token-bucket rate limit – requests per second (0 = unlimited, default: 10). */
  rateLimitPerSecond?: number;
  /** Proxy URL, e.g. `http://user:pass@host:port` or `socks5://host:port`. */
  proxy?: string;
  /** Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL). */
  logLevel?: string;
}

export class Config {
  readonly clientId: string;
  readonly apiUrl: string;
  readonly streamingUrl: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly privateKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly rateLimitPerSecond: number;
  readonly proxy?: string;
  readonly logLevel: string;

  constructor(options: ConfigOptions = {}) {
    this.clientId = options.clientId ?? '';
    this.apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
    this.streamingUrl = options.streamingUrl ?? DEFAULT_STREAMING_URL;
    this.apiKey = options.apiKey ?? '';
    this.apiSecret = options.apiSecret ?? '';
    this.privateKey = options.privateKey ?? '';
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.rateLimitPerSecond = options.rateLimitPerSecond ?? DEFAULT_RATE_LIMIT_PER_SECOND;
    this.proxy = options.proxy;
    this.logLevel = options.logLevel ?? 'INFO';
  }
}

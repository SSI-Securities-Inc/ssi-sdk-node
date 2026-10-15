import {
  DEFAULT_API_URL,
  DEFAULT_STREAMING_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RATE_LIMIT_PER_SECOND,
  DEFAULT_TRADING_API_DOMAIN,
  DEFAULT_TRADING_WS_DOMAIN,
  DEFAULT_OTP_POLL_INTERVAL_MS,
  DEFAULT_OTP_POLL_MAX_WAIT_MS,
  MAX_BATCH_ORDERS,
  TRADING_WS_PATH,
} from './constants.js';
import { ConfigurationError, ValidationError } from './exceptions.js';
import { INSPECT_CUSTOM, mask } from './utils/redact.js';

export interface ConfigOptions {
  /** Client ID for portfolio APIs. */
  clientId?: string;
  /** Base REST API URL. Blank means the default. */
  apiUrl?: string;
  /** WebSocket streaming URL. Blank means the default. */
  streamingUrl?: string;
  /**
   * URL of the trading REST API (orders, FCO, account, portfolio). While it stays at the
   * default it follows `apiUrl` (so changing only `apiUrl` moves trading too); set another
   * host to split them. A bare `host[:port]` gets `https://`. Auth and market data always
   * use `apiUrl`.
   */
  tradingApiDomain?: string;
  /**
   * URL of the experimental trading WebSocket (default `wss://api.ssi.com.vn/ws/v3/trading`).
   * A bare `host[:port]` gets `wss://` and `/ws/v3/trading`; a URL without a path gets the path.
   */
  tradingWsDomain?: string;
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
  timeoutMs?: number;
  /** Maximum retry attempts on timeout errors of GET requests (default: 5). */
  maxRetries?: number;
  /** Base exponential back-off delay in **milliseconds** (default: 2 000). */
  retryDelayMs?: number;
  /** Token-bucket rate limit – requests per second (0 = unlimited, default: 10). */
  rateLimitPerSecond?: number;
  /** Most orders in one batch request (default 20). Bigger batches are refused locally. */
  maxBatchOrders?: number;
  /** Proxy URL, e.g. `http://user:pass@host:port` or `socks5://host:port`. */
  proxy?: string;
  /** Optional User-Agent for HTTP requests and order payloads. */
  userAgent?: string;
  /** Re-open a dropped streaming socket automatically (default true). */
  autoReconnect?: boolean;
  /** **Milliseconds** between Smart OTP approval polls (default 5 000). */
  otpPollIntervalMs?: number;
  /** Total **milliseconds** to keep polling for Smart OTP approval (default 60 000). */
  otpPollMaxWaitMs?: number;
  /** Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL). */
  logLevel?: string;
}

const OPTION_NAMES: ReadonlySet<string> = new Set([
  'clientId',
  'apiUrl',
  'streamingUrl',
  'tradingApiDomain',
  'tradingWsDomain',
  'apiKey',
  'apiSecret',
  'privateKey',
  'timeoutMs',
  'maxRetries',
  'retryDelayMs',
  'rateLimitPerSecond',
  'maxBatchOrders',
  'proxy',
  'userAgent',
  'autoReconnect',
  'otpPollIntervalMs',
  'otpPollMaxWaitMs',
  'logLevel',
]);

/** Not passed, undefined, null or blank all mean the default. */
function textOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

export class Config {
  readonly clientId: string;
  readonly apiUrl: string;
  readonly streamingUrl: string;
  readonly tradingApiDomain: string;
  readonly tradingWsDomain: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly privateKey: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly rateLimitPerSecond: number;
  readonly maxBatchOrders: number;
  readonly proxy?: string;
  readonly userAgent?: string;
  readonly autoReconnect: boolean;
  readonly otpPollIntervalMs: number;
  readonly otpPollMaxWaitMs: number;
  readonly logLevel: string;

  constructor(options: ConfigOptions = {}) {
    const unknown = Object.keys(options).filter((key) => !OPTION_NAMES.has(key));
    if (unknown.length > 0) {
      throw new ConfigurationError(`Unknown Config option(s): ${unknown.join(', ')}`);
    }
    this.clientId = options.clientId ?? '';
    this.apiUrl = textOrDefault(options.apiUrl, DEFAULT_API_URL).replace(/\/+$/, '');
    this.streamingUrl = textOrDefault(options.streamingUrl, DEFAULT_STREAMING_URL);
    this.tradingApiDomain = textOrDefault(options.tradingApiDomain, DEFAULT_TRADING_API_DOMAIN);
    this.tradingWsDomain = textOrDefault(options.tradingWsDomain, DEFAULT_TRADING_WS_DOMAIN);
    this.apiKey = options.apiKey ?? '';
    this.apiSecret = options.apiSecret ?? '';
    this.privateKey = options.privateKey ?? '';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.rateLimitPerSecond = options.rateLimitPerSecond ?? DEFAULT_RATE_LIMIT_PER_SECOND;
    this.maxBatchOrders =
      Number.isInteger(options.maxBatchOrders) && (options.maxBatchOrders as number) >= 1
        ? (options.maxBatchOrders as number)
        : MAX_BATCH_ORDERS;
    this.proxy = options.proxy;
    this.userAgent = options.userAgent || undefined;
    this.autoReconnect = options.autoReconnect ?? true;
    this.otpPollIntervalMs = options.otpPollIntervalMs ?? DEFAULT_OTP_POLL_INTERVAL_MS;
    this.otpPollMaxWaitMs = options.otpPollMaxWaitMs ?? DEFAULT_OTP_POLL_MAX_WAIT_MS;
    this.logLevel = options.logLevel ?? 'INFO';
  }

  /** The options this Config was built from, to derive a changed copy without mutating it. */
  toOptions(): ConfigOptions {
    return {
      clientId: this.clientId,
      apiUrl: this.apiUrl,
      streamingUrl: this.streamingUrl,
      tradingApiDomain: this.tradingApiDomain,
      tradingWsDomain: this.tradingWsDomain,
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      privateKey: this.privateKey,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryDelayMs: this.retryDelayMs,
      rateLimitPerSecond: this.rateLimitPerSecond,
      maxBatchOrders: this.maxBatchOrders,
      proxy: this.proxy,
      userAgent: this.userAgent,
      autoReconnect: this.autoReconnect,
      otpPollIntervalMs: this.otpPollIntervalMs,
      otpPollMaxWaitMs: this.otpPollMaxWaitMs,
      logLevel: this.logLevel,
    };
  }

  /**
   * Base URL of the trading REST API: `tradingApiDomain`, or `apiUrl` when that is still the
   * default (so it follows `apiUrl`).
   *
   * A bare `host` or `host:port` becomes `https://host`; a value with `http://` / `https://`
   * keeps its scheme. Any path or trailing slash is dropped.
   *
   * @throws ValidationError if the value has a scheme other than http/https.
   */
  get tradingApiUrl(): string {
    let value = (this.tradingApiDomain || '').trim();
    if (!value || value.replace(/\/+$/, '') === DEFAULT_TRADING_API_DOMAIN) {
      return this.apiUrl.replace(/\/+$/, '');
    }
    if (!value.includes('://')) value = `https://${value}`;
    const sep = value.indexOf('://');
    const scheme = value.slice(0, sep).toLowerCase();
    const rest = value.slice(sep + 3);
    if (scheme !== 'http' && scheme !== 'https') {
      throw new ValidationError(`tradingApiDomain must be http(s), got '${scheme}://'`);
    }
    return `${scheme}://${rest.split('/', 1)[0]}`;
  }

  /**
   * The trading WebSocket URL built from `tradingWsDomain` (always `wss://` for a bare host).
   *
   * `"api.ssi.com.vn"` -> `wss://api.ssi.com.vn/ws/v3/trading`; `"host:8443"` keeps the port; a
   * value that already starts with `wss://` is used as is (the path is appended only when the
   * value has none).
   */
  get tradingWsUrl(): string {
    let value = (this.tradingWsDomain || '').trim().replace(/\/+$/, '');
    if (!value.includes('://')) value = `wss://${value}`;
    const schemeEnd = value.indexOf('://') + 3;
    if (!value.slice(schemeEnd).includes('/')) value += TRADING_WS_PATH;
    return value;
  }

  /** A redacted description: secrets are never part of it. */
  toString(): string {
    return (
      `Config(clientId=${JSON.stringify(this.clientId)}, apiUrl=${this.apiUrl}, ` +
      `streamingUrl=${this.streamingUrl}, tradingApiDomain=${this.tradingApiDomain}, ` +
      `tradingWsDomain=${this.tradingWsDomain}, apiKey=${this.apiKey ? mask(this.apiKey) : "''"}, ` +
      `apiSecret=${this.apiSecret ? '***' : "''"}, privateKey=${this.privateKey ? '***' : "''"}, ` +
      `timeoutMs=${this.timeoutMs}, maxRetries=${this.maxRetries}, retryDelayMs=${this.retryDelayMs}, ` +
      `rateLimitPerSecond=${this.rateLimitPerSecond}, maxBatchOrders=${this.maxBatchOrders}, ` +
      `autoReconnect=${this.autoReconnect})`
    );
  }

  /** JSON.stringify(config) carries no secret. */
  toJSON(): Record<string, unknown> {
    return {
      clientId: this.clientId,
      apiUrl: this.apiUrl,
      streamingUrl: this.streamingUrl,
      tradingApiDomain: this.tradingApiDomain,
      tradingWsDomain: this.tradingWsDomain,
      apiKey: this.apiKey ? mask(this.apiKey) : '',
      apiSecret: this.apiSecret ? '***' : '',
      privateKey: this.privateKey ? '***' : '',
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryDelayMs: this.retryDelayMs,
      rateLimitPerSecond: this.rateLimitPerSecond,
      maxBatchOrders: this.maxBatchOrders,
      proxy: this.proxy ? '***' : undefined,
      userAgent: this.userAgent,
      autoReconnect: this.autoReconnect,
      otpPollIntervalMs: this.otpPollIntervalMs,
      otpPollMaxWaitMs: this.otpPollMaxWaitMs,
      logLevel: this.logLevel,
    };
  }

  [INSPECT_CUSTOM](): string {
    return this.toString();
  }
}

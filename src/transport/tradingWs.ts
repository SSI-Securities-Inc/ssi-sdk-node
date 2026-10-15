/**
 * EXPERIMENTAL client for the trading WebSocket (`/ws/v3/trading`). Not exported from the main
 * entry point: import it from `@ssi.developer/ssi-sdk/experimental`.
 *
 * - A command that times out is never retried: it may already have been accepted. Reconcile via
 *   the `order.<account>` event stream or `query.orderBook`.
 * - Only `wss://`. The bearer token goes in the header; params, signatures, tokens and account
 *   numbers are never logged.
 * - The server accepts the socket (HTTP 101) and refuses afterwards with a `{code, msg}` frame,
 *   so `connect()` waits a short grace period for it.
 */
import { randomBytes } from 'node:crypto';
import {
  AUTH_SCHEME_BEARER,
  DEFAULT_USER_AGENT,
  HEADER_AUTHORIZATION,
  HEADER_USER_AGENT,
} from '../constants.js';
import { TradingWSError, WebSocketError } from '../exceptions.js';
import { SignatureEncoding as WireEncoding, sign } from '../utils/crypto.js';
import { createLogger } from '../utils/logger.js';
import { sleep } from '../utils/retry.js';
import { Frame, decodeMessage } from './dispatch.js';
import { ConnectFn, WsConnection, connectWs, requireWss } from './websocketClient.js';

const log = createLogger('ssi-sdk.trading_ws');

export type SignatureEncodingChoice = 'auto' | WireEncoding;

/** Methods the server requires a signature for (matched case-insensitively). */
export const MUTATING_METHODS: ReadonlySet<string> = new Set([
  'order.place',
  'order.amend',
  'order.cancel',
  'order.batchnew',
  'order.batchcancel',
  'fco.place',
  'fco.cancel',
]);

const SIGNATURE_CODES: ReadonlySet<string> = new Set(['401006', '401008', '401013']);

export interface TradingWSResponse {
  id: string;
  method: string;
  status: number;
  result: unknown;
  rateLimit: Record<string, unknown>;
  receivedTime?: number;
}

function isObject(value: unknown): value is Frame {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function statusOf(frame: Frame, fallback: number): number {
  const parsed = Number.parseInt(String(frame.status ?? 200), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function responseFromFrame(frame: Frame): TradingWSResponse {
  return {
    id: String(frame.id ?? ''),
    method: String(frame.method ?? ''),
    status: statusOf(frame, 200),
    result: frame.result,
    rateLimit: isObject(frame.rateLimit) ? frame.rateLimit : {},
    receivedTime: typeof frame.receivedTime === 'number' ? frame.receivedTime : undefined,
  };
}

/**
 * The text of one command frame. `params` is serialized once; the same text is signed and then
 * inserted as is.
 */
export function buildCommand(
  method: string,
  params: Record<string, unknown>,
  privateKey: string | null | undefined,
  requestId: string,
  timestampMs: number,
  encoding: WireEncoding = 'base64',
): string {
  if (!requestId) throw new WebSocketError('a command needs a non-empty id');
  const paramsText = JSON.stringify(params);
  let signaturePart = '';
  if (MUTATING_METHODS.has(method.toLowerCase())) {
    if (!privateKey) {
      throw new WebSocketError('private_key is required for trading commands that change state');
    }
    signaturePart = `,"signature":${JSON.stringify(sign(paramsText, privateKey, encoding))}`;
  }
  return (
    `{"id":${JSON.stringify(requestId)},"method":${JSON.stringify(method)},"params":${paramsText}` +
    `${signaturePart},"timestamp":${Math.trunc(timestampMs)}}`
  );
}

/** A success frame, or throw `TradingWSError` for an error frame. */
export function unwrap(frame: Frame, encodingHint?: string | null): Frame {
  const error = frame.error;
  const status = statusOf(frame, 0);
  if (error || status >= 400) {
    const detail: Frame = isObject(error) ? error : {};
    const code = String(detail.code ?? '');
    let message = String(detail.message ?? '');
    if (encodingHint && SIGNATURE_CODES.has(code)) {
      const other = encodingHint === 'base64' ? 'hex' : 'base64';
      message +=
        ` (signature rejected: signed as ${encodingHint}; if every signed command fails ` +
        `this way pass signatureEncoding: '${other}' to the trading WS client)`;
    }
    throw new TradingWSError(status, code, message);
  }
  return frame;
}

/** A post-upgrade refusal: `{code, msg}` with no `id`. */
export function isRejection(frame: Frame): boolean {
  return !('id' in frame) && 'code' in frame && ('msg' in frame || 'message' in frame);
}

export function rejectionError(frame: Frame): TradingWSError {
  const status = Number.parseInt(String(frame.code ?? 0), 10);
  const message = String(frame.msg ?? frame.message ?? '');
  return new TradingWSError(Number.isNaN(status) ? 0 : status, String(frame.code ?? ''), message);
}

function bothRefused(error: TradingWSError): TradingWSError {
  return new TradingWSError(
    error.status,
    error.errorCode,
    `${error.serverMessage} (refused with a base64 and a hex signature: check that ` +
      'Config.privateKey is the key registered for this API key)',
  );
}

type QueueItem = Frame | TradingWSError | null;

/** A minimal async FIFO: `get(timeoutMs)` resolves with the next item or rejects on timeout. */
export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private waiter: ((item: T) => void) | null = null;

  push(item: T): void {
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter(item);
    } else {
      this.items.push(item);
    }
  }

  get(timeoutMs: number): Promise<T> {
    if (this.items.length > 0) return Promise.resolve(this.items.shift() as T);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error('timeout'));
      }, timeoutMs);
      this.waiter = (item) => {
        clearTimeout(timer);
        resolve(item);
      };
    });
  }
}

export interface TradingWSClientOptions {
  /** Milliseconds to wait for a response before giving up (no retry). Default 10000. */
  requestTimeoutMs?: number;
  /** `auto` signs base64 first and retries once in hex when the signature is refused. */
  signatureEncoding?: SignatureEncodingChoice;
  /** Milliseconds to wait for a post-upgrade rejection frame. Default 500. */
  handshakeGraceMs?: number;
  respectRateLimit?: boolean;
  /** Longest pause (ms) taken to wait out an exhausted rate limit. Default 2000. */
  maxRateLimitWaitMs?: number;
  /** Keep-alive interval in ms; `null` or 0 disables. Default 30000. */
  pingIntervalMs?: number | null;
  userAgent?: string;
  connectFn?: ConnectFn;
  clock?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
}

export type TokenSource = () => string | Promise<string>;

export class TradingWSClient {
  /** Handler for frames that carry no pending command id (events, acks, pongs). */
  onEvent: ((frame: Frame) => void | Promise<void>) | null = null;
  rateLimit: Record<string, unknown> = {};

  private readonly url: string;
  private readonly tokenProvider: TokenSource;
  private readonly privateKey: string | null;
  private readonly timeoutMs: number;
  private readonly auto: boolean;
  private encoding: WireEncoding;
  private readonly userAgent: string;
  private readonly graceMs: number;
  private readonly respectRateLimit: boolean;
  private readonly maxRateWaitMs: number;
  private readonly pingMs: number | null;
  private readonly connectFn: ConnectFn;
  private readonly clock: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  private conn: WsConnection | null = null;
  private open = false;
  private rejectionError_: TradingWSError | null = null;
  private blockedUntil = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pending = new Map<string, AsyncQueue<QueueItem>>();

  constructor(
    url: string,
    tokenProvider: TokenSource,
    privateKey?: string | null,
    options: TradingWSClientOptions = {},
  ) {
    requireWss(url, 'trading_ws_url');
    this.url = url;
    this.tokenProvider = tokenProvider;
    this.privateKey = privateKey || null;
    this.timeoutMs = options.requestTimeoutMs ?? 10_000;
    const choice = options.signatureEncoding ?? 'auto';
    this.auto = choice === 'auto';
    this.encoding = choice === 'auto' ? 'base64' : choice;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.graceMs = options.handshakeGraceMs ?? 500;
    this.respectRateLimit = options.respectRateLimit ?? true;
    this.maxRateWaitMs = options.maxRateLimitWaitMs ?? 2_000;
    this.pingMs = options.pingIntervalMs === undefined ? 30_000 : options.pingIntervalMs;
    this.connectFn = options.connectFn ?? connectWs;
    this.clock = options.clock ?? Date.now;
    this.sleepFn = options.sleepFn ?? sleep;
  }

  get isConnected(): boolean {
    return this.conn !== null && this.open;
  }

  /** The refusal the server sent after the upgrade (401/403/429/500), if any. */
  get rejection(): TradingWSError | null {
    return this.rejectionError_;
  }

  /** Open the socket with the bearer token in the header. */
  async connect(): Promise<void> {
    if (this.conn !== null) return;
    const token = await this.tokenProvider();
    this.rejectionError_ = null;
    const conn = await this.connectFn(this.url, {
      headers: {
        [HEADER_AUTHORIZATION]: `${AUTH_SCHEME_BEARER}${token}`,
        [HEADER_USER_AGENT]: this.userAgent,
      },
      timeoutMs: this.timeoutMs,
    });
    this.conn = conn;
    this.open = true;
    conn.onMessage((raw) => void this.handleRaw(raw));
    conn.onClose(() => {
      if (this.conn === conn) this.open = false;
      this.failPending(null);
    });

    // The server accepts the socket (101) and refuses afterwards: give that frame time to show.
    let waited = 0;
    while (waited < this.graceMs && this.rejectionError_ === null && this.open) {
      await this.sleepFn(50);
      waited += 50;
    }
    if (this.rejectionError_ !== null) {
      const error = this.rejectionError_;
      await this.close();
      throw error;
    }
    if (this.pingMs && this.pingMs > 0) {
      this.pingTimer = setInterval(() => {
        this.ping().catch(() => this.stopPing());
      }, this.pingMs);
      this.pingTimer.unref?.();
    }
  }

  private stopPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Close the socket and wake every waiter. */
  async close(): Promise<void> {
    this.stopPing();
    const conn = this.conn;
    this.conn = null;
    this.open = false;
    if (conn !== null) {
      try {
        conn.close();
      } catch {
        // already closed
      }
    }
    this.failPending(null);
  }

  private failPending(item: TradingWSError | null): void {
    for (const queue of this.pending.values()) queue.push(item);
    this.pending.clear();
  }

  private newId(): string {
    for (;;) {
      const id = randomBytes(8).toString('hex');
      if (!this.pending.has(id)) return id;
    }
  }

  private async handleRaw(raw: string): Promise<void> {
    const frame = decodeMessage(raw);
    if (frame === null) return;
    if (isRejection(frame)) {
      this.rejectionError_ = rejectionError(frame);
      this.failPending(this.rejectionError_);
      return;
    }
    const id = frame.id;
    const queue = typeof id === 'string' ? this.pending.get(id) : undefined;
    if (queue !== undefined) {
      queue.push(frame);
    } else if (this.onEvent !== null) {
      try {
        await this.onEvent(frame);
      } catch {
        log.error('Error in the onEvent handler');
      }
    }
  }

  /**
   * Send one command and return the queue that receives every frame carrying its id. Release it
   * with `forget`. A `null` item means the connection closed; a `TradingWSError` item means the
   * server refused the connection.
   */
  async requestStream(
    method: string,
    params: Record<string, unknown>,
  ): Promise<AsyncQueue<QueueItem>> {
    if (this.rejectionError_ !== null) throw this.rejectionError_;
    if (this.conn === null) throw new WebSocketError('not connected');
    if (this.respectRateLimit && this.blockedUntil > this.clock()) {
      await this.sleepFn(this.blockedUntil - this.clock());
    }
    const id = this.newId();
    const raw = buildCommand(method, params, this.privateKey, id, this.clock(), this.encoding);
    const queue = new AsyncQueue<QueueItem>();
    this.pending.set(id, queue);
    try {
      await this.conn.send(raw);
    } catch (error) {
      this.pending.delete(id);
      const name = error instanceof Error ? error.name : typeof error;
      throw new WebSocketError(`failed to send ${method}: ${name}`);
    }
    return queue;
  }

  forget(queue: AsyncQueue<QueueItem>): void {
    for (const [key, value] of [...this.pending.entries()]) {
      if (value === queue) this.pending.delete(key);
    }
  }

  /** The next frame of a command queue, as a response. A timeout is NOT retried. */
  async nextResponse(queue: AsyncQueue<QueueItem>, timeoutMs?: number): Promise<TradingWSResponse> {
    let item: QueueItem;
    try {
      item = await queue.get(timeoutMs || this.timeoutMs);
    } catch {
      throw new WebSocketError('timed out waiting for a response (not retried)');
    }
    if (item instanceof TradingWSError) throw item;
    if (item === null) throw new WebSocketError('connection closed before the response arrived');
    const response = responseFromFrame(unwrap(item, this.auto ? null : this.encoding));
    this.noteRateLimit(response.rateLimit);
    return response;
  }

  private noteRateLimit(rateLimit: Record<string, unknown>): void {
    if (Object.keys(rateLimit).length === 0) return;
    this.rateLimit = rateLimit;
    if (rateLimit.remaining === 0) {
      const resetMs = Number(rateLimit.resetMs ?? 0) || 0;
      this.blockedUntil = this.clock() + Math.min(resetMs, this.maxRateWaitMs);
    }
  }

  private otherEncoding(method: string, error: TradingWSError): WireEncoding | null {
    if (!(this.auto && MUTATING_METHODS.has(method.toLowerCase()))) return null;
    if (!SIGNATURE_CODES.has(error.errorCode)) return null;
    return this.encoding === 'base64' ? 'hex' : 'base64';
  }

  private async once(method: string, params: Record<string, unknown>): Promise<TradingWSResponse> {
    const queue = await this.requestStream(method, params);
    try {
      return await this.nextResponse(queue);
    } finally {
      this.forget(queue);
    }
  }

  /** Send one command and return its first response frame (the ack). Never retried on timeout. */
  async request(method: string, params: Record<string, unknown>): Promise<TradingWSResponse> {
    try {
      return await this.once(method, params);
    } catch (error) {
      if (!(error instanceof TradingWSError)) throw error;
      const other = this.otherEncoding(method, error);
      if (other === null) throw error;
      // The server refused the signature, so the command was NOT executed: try the other form.
      const first = this.encoding;
      this.encoding = other;
      try {
        return await this.once(method, params);
      } catch (second) {
        this.encoding = first;
        if (second instanceof TradingWSError) throw bothRefused(second);
        throw second;
      }
    }
  }

  /** Subscribe to topics (no `id`: the ack and events arrive on `onEvent`). */
  subscribe(channel: string, topics: string[]): Promise<void> {
    return this.sendFrame({ method: 'SUBSCRIBE', channel, topics: [...topics] });
  }

  unsubscribe(channel: string, topics: string[]): Promise<void> {
    return this.sendFrame({ method: 'UNSUBSCRIBE', channel, topics: [...topics] });
  }

  ping(): Promise<void> {
    return this.sendFrame({ method: 'PING_PONG' });
  }

  private async sendFrame(frame: Frame): Promise<void> {
    if (this.conn === null) throw new WebSocketError('not connected');
    try {
      await this.conn.send(JSON.stringify(frame));
    } catch (error) {
      const name = error instanceof Error ? error.name : typeof error;
      throw new WebSocketError(`failed to send: ${name}`);
    }
  }
}

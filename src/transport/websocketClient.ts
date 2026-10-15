import type { Agent } from 'node:http';
import WebSocket from 'ws';
import { Config } from '../config.js';
import {
  AUTH_SCHEME_BEARER,
  CONTENT_TYPE_JSON,
  HEADER_ACCEPT,
  HEADER_AUTHORIZATION,
  HEADER_CONTENT_TYPE,
  WS_ROUTE_ERROR,
  WS_TOKEN_REFRESH_LEAD_MS,
} from '../constants.js';
import { AuthenticationError, WebSocketError } from '../exceptions.js';
import { createLogger } from '../utils/logger.js';
import { abortableSleep } from '../utils/retry.js';
import { maskBearer, safeUrl } from '../utils/redact.js';
import {
  Frame,
  ackErrorCategory,
  decodeMessage,
  routesOf,
  splitRequest,
} from './dispatch.js';
import {
  ConnectionEvent,
  ConnectionState,
  RejectionKind,
  SubscriptionBook,
  backoffDelay,
  classifyRejection,
  msUntilRefresh,
  rateLimitWait,
} from './reconnect.js';

export type MessageHandler = (message: Frame) => void | Promise<void>;
export type TokenProvider = (
  forceRefresh: boolean,
) => string | null | undefined | Promise<string | null | undefined>;

/** The part of a socket this client uses (tests inject a fake one through `connectFn`). */
export interface WsConnection {
  send(data: string): Promise<void>;
  close(): void;
  onMessage(callback: (raw: string) => void): void;
  onClose(callback: () => void): void;
}

export interface ConnectOptions {
  headers: Record<string, string>;
  agent?: Agent;
  timeoutMs: number;
}

export type ConnectFn = (url: string, options: ConnectOptions) => Promise<WsConnection>;
export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface WebSocketClientOptions {
  /** `provider(forceRefresh) -> token`, called before every connect. */
  tokenProvider?: TokenProvider;
  /** Epoch second when the credentials stop working (earlier of access and refresh); 0 = unknown. */
  expiryProvider?: () => number;
  /** Re-open the socket after a drop. Defaults to `config.autoReconnect`. */
  autoReconnect?: boolean;
  /** An HTTP(S) proxy agent for the socket (the `ws` library has no built-in proxy support). */
  agent?: Agent;
  connectFn?: ConnectFn;
  sleepFn?: SleepFn;
  random?: () => number;
  /** Wall clock in epoch milliseconds. */
  clock?: () => number;
}

/** A socket that stayed up this long counts as healthy: the backoff starts over. */
const STABLE_MS = 10_000;

function rawToText(data: WebSocket.RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return (data as Buffer).toString('utf8');
}

/** Open a real socket with `ws`; a refused handshake rejects with `statusCode` set. */
export const connectWs: ConnectFn = (url, options) =>
  new Promise<WsConnection>((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: options.headers,
      agent: options.agent,
      handshakeTimeout: options.timeoutMs,
    });
    const messages: string[] = [];
    let onMessage: ((raw: string) => void) | null = null;
    let onClose: (() => void) | null = null;
    let closed = false;

    ws.on('message', (data) => {
      const text = rawToText(data);
      if (onMessage) onMessage(text);
      else messages.push(text);
    });
    ws.on('close', () => {
      closed = true;
      onClose?.();
    });

    const connection: WsConnection = {
      send: (data) =>
        new Promise<void>((res, rej) => ws.send(data, (err) => (err ? rej(err) : res()))),
      close: () => {
        if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
        else ws.close();
      },
      onMessage: (callback) => {
        onMessage = callback;
        for (const text of messages.splice(0)) callback(text);
      },
      onClose: (callback) => {
        onClose = callback;
        if (closed) callback();
      },
    };

    const failed = (error: Error): void => {
      ws.terminate();
      reject(error);
    };
    ws.once('unexpected-response', (_request, response) => {
      response.resume();
      failed(
        Object.assign(new Error(`Unexpected server response: ${response.statusCode}`), {
          statusCode: response.statusCode,
        }),
      );
    });
    ws.once('error', (error) => {
      // After the upgrade an error is followed by 'close', which the supervisor already handles.
      ws.on('error', () => undefined);
      failed(error);
    });
    ws.once('open', () => {
      ws.removeAllListeners('error');
      ws.on('error', () => undefined);
      resolve(connection);
    });
  });

/** HTTP status of a refused WebSocket handshake. */
export function handshakeStatus(error: unknown): number | null {
  if (error === null || typeof error !== 'object') return null;
  const record = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  for (const value of [record.statusCode, record.status]) {
    const status = Number(value);
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
  }
  const match = /(?:HTTP|status|response:?)\s+(\d{3})\b/i.exec(String(record.message ?? ''));
  return match ? Number(match[1]) : null;
}

/** Refuse a socket that is not TLS-protected: the bearer token travels in it. */
export function requireWss(url: string, name = 'streaming_url'): void {
  let scheme = '';
  try {
    scheme = new URL(url).protocol.toLowerCase();
  } catch {
    // falls through to the error below
  }
  if (scheme !== 'wss:') {
    throw new WebSocketError(`${name} must use wss://, got ${safeUrl(url)}`);
  }
}

function authError(status: number): AuthenticationError {
  return new AuthenticationError(
    `WebSocket authentication failed after refreshing the token (${status})`,
    String(status),
    status,
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * WebSocket client for SSI real-time streaming.
 *
 * `connect()` starts a supervisor that keeps one socket open: it re-opens the socket after a
 * drop (exponential backoff with jitter, capped), always with a fresh token from
 * `tokenProvider`, re-opens it ahead of the token's expiry (the server never closes a socket
 * whose JWT expired, it only checks at connect), and re-sends every subscription. The old
 * socket is always closed before a new one opens: the server allows only 10 per client.
 */
export class WebSocketClient {
  /** Called on every connection change; its errors never propagate. */
  onState: ((event: ConnectionEvent) => void | Promise<void>) | null = null;

  private conn: WsConnection | null = null;
  private readonly handlers = new Map<string, MessageHandler[]>();
  private supervisor: Promise<void> | null = null;
  private supervisorRunning = false;
  private abort = new AbortController();
  private token: string | null = null;
  private closing = false;
  private readonly book = new SubscriptionBook();
  private rejection: Frame | null = null;
  private signalRejected: (() => void) | null = null;
  private lastErrorValue: Error | null = null;
  private reconnects = 0;

  private readonly tokenProvider?: TokenProvider;
  private readonly expiryProvider?: () => number;
  private readonly autoReconnect: boolean;
  private readonly agent?: Agent;
  private readonly connectFn: ConnectFn;
  private readonly sleepFn: SleepFn;
  private readonly random: () => number;
  private readonly clock: () => number;
  private readonly log;

  constructor(
    private readonly config: Config,
    options: WebSocketClientOptions = {},
  ) {
    this.tokenProvider = options.tokenProvider;
    this.expiryProvider = options.expiryProvider;
    this.autoReconnect = options.autoReconnect ?? config.autoReconnect;
    this.agent = options.agent;
    this.connectFn = options.connectFn ?? connectWs;
    this.sleepFn = options.sleepFn ?? abortableSleep;
    this.random = options.random ?? Math.random;
    this.clock = options.clock ?? Date.now;
    this.log = createLogger('ssi-sdk.websocket', config.logLevel);
  }

  /** Set a static token (used when no `tokenProvider` is given). */
  setToken(token: string): void {
    this.token = token;
  }

  /** The error that ended the supervisor (a connection that could not be recovered). */
  get lastError(): Error | null {
    return this.lastErrorValue;
  }

  /** How many times the socket was re-opened after the first connect. */
  get reconnectCount(): number {
    return this.reconnects;
  }

  /** Whether a socket is open and the supervisor is running. */
  get isConnected(): boolean {
    return this.conn !== null && this.supervisorRunning;
  }

  /**
   * Open the WebSocket and keep it open. Returns once the first connection is up; later drops
   * are handled in the background.
   *
   * @throws WebSocketError if `streamingUrl` is not `wss://`, or the first connection fails after
   *   `config.maxRetries` attempts.
   * @throws AuthenticationError if the server keeps rejecting the credentials, or they cannot be
   *   renewed without a new OTP.
   */
  async connect(): Promise<void> {
    if (this.supervisorRunning) return;
    requireWss(this.config.streamingUrl);
    this.closing = false;
    this.lastErrorValue = null;
    this.abort = new AbortController();
    const pending = new Pending();
    this.supervisorRunning = true;
    this.supervisor = this.supervise(pending)
      .catch((error: unknown) => this.fail(error instanceof Error ? error : new Error(String(error)), pending))
      .finally(() => {
        this.supervisorRunning = false;
      });
    try {
      await pending.promise;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  /** Stop the supervisor, close the socket and forget the subscriptions. */
  async disconnect(): Promise<void> {
    this.closing = true;
    this.abort.abort();
    await this.closeConnection();
    const supervisor = this.supervisor;
    this.supervisor = null;
    if (supervisor) await supervisor.catch(() => undefined);
    await this.closeConnection();
    this.book.clear();
    this.log.info('WebSocket disconnected');
  }

  /** Set the one handler of a route; `null` clears it. */
  on(channel: string, handler: MessageHandler | null): void {
    if (handler === null) {
      this.handlers.delete(channel);
      return;
    }
    this.handlers.set(channel, [handler]);
  }

  /** Remove one handler of a route, or all of them. */
  off(channel: string, handler?: MessageHandler): void {
    const list = this.handlers.get(channel);
    if (!list) return;
    if (handler === undefined) this.handlers.delete(channel);
    else this.handlers.set(channel, list.filter((h) => h !== handler));
  }

  /**
   * Send a message. A successful subscribe/unsubscribe is remembered so it is sent again after a
   * reconnect. A request bigger than the server's frame limit is split.
   */
  async send(data: Frame): Promise<void> {
    const conn = this.conn;
    if (!conn) throw new WebSocketError('Not connected. Call connect() first.');
    try {
      for (const part of splitRequest(data)) await conn.send(JSON.stringify(part));
    } catch (error) {
      throw new WebSocketError(
        `Failed to send message: ${maskBearer(error instanceof Error ? error.message : String(error))}`,
      );
    }
    this.book.record(data);
  }

  /** Block until the supervisor ends (disconnect or unrecoverable error), or the timeout (ms). */
  async wait(timeoutMs?: number): Promise<void> {
    const supervisor = this.supervisor;
    if (!supervisor) return;
    const ended = supervisor.catch(() => undefined);
    if (timeoutMs === undefined) {
      await ended;
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([ended, timeout]);
    clearTimeout(timer);
  }

  // ── supervisor ─────────────────────────────────────────────

  private emit(state: ConnectionState, error?: Error): void {
    const handler = this.onState;
    if (!handler) return;
    try {
      const result = handler({ state, reconnectCount: this.reconnects, error });
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => this.log.error('Error in the onState handler'));
      }
    } catch {
      this.log.error('Error in the onState handler');
    }
  }

  private fail(error: Error, pending: Pending | null): void {
    this.lastErrorValue = error;
    this.log.error(`WebSocket stopped: ${errorName(error)}`);
    this.emit('failed', error);
    pending?.reject(error);
  }

  private backoff(attempt: number): number {
    return backoffDelay(attempt, this.config.retryDelayMs, undefined, this.random());
  }

  private async currentToken(forceRefresh: boolean): Promise<string | null | undefined> {
    if (!this.tokenProvider) return this.token;
    return this.tokenProvider(forceRefresh);
  }

  private async open(forceRefresh: boolean): Promise<WsConnection | null> {
    const token = await this.currentToken(forceRefresh);
    const headers: Record<string, string> = {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
      [HEADER_ACCEPT]: CONTENT_TYPE_JSON,
    };
    if (token) headers[HEADER_AUTHORIZATION] = `${AUTH_SCHEME_BEARER}${token}`;
    const url = this.config.streamingUrl;
    this.log.debug(`Connecting to WebSocket ${safeUrl(url)}`);
    const conn = await this.connectFn(url, {
      headers,
      agent: this.agent,
      timeoutMs: this.config.timeoutMs,
    });
    if (this.closing) {
      conn.close();
      return null;
    }
    this.conn = conn;
    this.rejection = null;
    this.log.info(`WebSocket connected to ${safeUrl(url)}`);
    return conn;
  }

  private async closeConnection(): Promise<void> {
    const conn = this.conn;
    this.conn = null;
    if (conn) {
      try {
        conn.close();
      } catch {
        this.log.debug('Error while closing the WebSocket');
      }
    }
  }

  private async resubscribe(conn: WsConnection): Promise<void> {
    for (const request of this.book.requests()) {
      for (const part of splitRequest(request)) await conn.send(JSON.stringify(part));
    }
  }

  /** Run one socket until it closes, the server rejects it, or it must be cycled. */
  private async serve(conn: WsConnection): Promise<'closed' | 'rejected' | 'refresh'> {
    const rejected = new Promise<'rejected'>((resolve) => {
      this.signalRejected = () => resolve('rejected');
    });
    let chain: Promise<void> = Promise.resolve();
    const closed = new Promise<'closed'>((resolve) => {
      conn.onClose(() => {
        void chain.then(() => resolve('closed'));
      });
    });
    conn.onMessage((raw) => {
      chain = chain.then(() => this.onFrame(raw));
    });

    const timerAbort = new AbortController();
    const racers: Promise<'closed' | 'rejected' | 'refresh'>[] = [closed, rejected];
    const delay = this.expiryProvider
      ? msUntilRefresh(this.expiryProvider(), this.clock(), WS_TOKEN_REFRESH_LEAD_MS)
      : null;
    if (delay !== null) {
      racers.push(this.sleepFn(delay, timerAbort.signal).then(() => 'refresh' as const));
    }
    try {
      const reason = await Promise.race(racers);
      if (this.closing) return 'closed';
      // A refusal frame is followed by a close; report the cause, not the symptom.
      return reason === 'closed' && this.rejection ? 'rejected' : reason;
    } finally {
      timerAbort.abort();
      this.signalRejected = null;
    }
  }

  private async supervise(pending: Pending): Promise<void> {
    let attempt = 0;
    let authRetried = false;
    let forceRefresh = false;
    try {
      while (!this.closing) {
        let conn: WsConnection | null;
        try {
          conn = await this.open(forceRefresh);
        } catch (error) {
          if (this.closing) return;
          if (error instanceof AuthenticationError) {
            this.fail(error, pending); // cannot be fixed by retrying: needs a new OTP
            return;
          }
          const status = handshakeStatus(error);
          if (status === 401 || status === 403) {
            if (authRetried) {
              this.fail(authError(status), pending);
              return;
            }
            authRetried = true;
            forceRefresh = true;
            continue;
          }
          const wait = status === 429 ? rateLimitWait(null) : this.backoff(attempt);
          attempt += 1;
          if (!pending.settled && attempt >= Math.max(1, this.config.maxRetries)) {
            this.fail(
              new WebSocketError(
                `Failed to connect to ${safeUrl(this.config.streamingUrl)} after ${attempt} attempts: ${errorName(error)}`,
              ),
              pending,
            );
            return;
          }
          this.log.warn(
            `WebSocket connect attempt ${attempt} failed (${errorName(error)}); retrying in ${(wait / 1000).toFixed(1)}s`,
          );
          await this.sleepFn(wait, this.abort.signal);
          continue;
        }
        if (conn === null) return;

        const openedAt = this.clock();
        forceRefresh = false;
        try {
          await this.resubscribe(conn);
        } catch {
          this.log.warn('Could not restore subscriptions');
        }
        if (!pending.settled) {
          pending.resolve();
          this.emit('connected');
        } else {
          this.reconnects += 1;
          this.log.info(`WebSocket reconnected (#${this.reconnects})`);
          this.emit('reconnected');
        }

        const reason = await this.serve(conn);
        await this.closeConnection();
        if (this.closing) return;
        this.emit('disconnected');
        attempt = this.clock() - openedAt > STABLE_MS ? 0 : attempt + 1;

        let wait: number;
        if (reason === 'refresh') {
          forceRefresh = true; // the old token is about to expire: get a new one
          continue;
        }
        if (reason === 'rejected') {
          const { kind, retryAfterMs } = classifyRejection(this.rejection ?? {});
          if (kind === RejectionKind.AUTH) {
            if (authRetried) {
              this.fail(authError(401), null);
              return;
            }
            authRetried = true;
            forceRefresh = true;
            continue;
          }
          wait = kind === RejectionKind.RATE_LIMITED ? rateLimitWait(retryAfterMs) : this.backoff(attempt);
        } else {
          authRetried = false;
          if (!this.autoReconnect) return;
          wait = this.backoff(attempt);
        }
        this.log.info(`WebSocket closed; reconnecting in ${(wait / 1000).toFixed(1)}s`);
        await this.sleepFn(wait, this.abort.signal);
      }
    } finally {
      await this.closeConnection();
      pending.reject(new WebSocketError('The WebSocket was closed before it was established'));
    }
  }

  // ── receive ────────────────────────────────────────────────

  private async onFrame(raw: string): Promise<void> {
    const message = decodeMessage(raw);
    if (message === null) return;
    if (routesOf(message).includes(WS_ROUTE_ERROR)) {
      this.rejection = message;
      this.signalRejected?.();
    }
    await this.dispatch(message);
  }

  /** Hand a decoded frame to every handler on its routes; a handler that throws is logged. */
  private async dispatch(message: Frame): Promise<void> {
    const category = ackErrorCategory(message);
    if (category !== null) {
      this.log.warn(
        `Server refused a ${String(message.method ?? '?')} request on ${String(message.channel ?? '?')}: ${category}`,
      );
    }
    for (const route of routesOf(message)) {
      for (const handler of [...(this.handlers.get(route) ?? [])]) {
        try {
          await handler(message);
        } catch (error) {
          this.log.error(
            `Error in handler for route '${route}': ${errorName(error)}: ${maskBearer(error instanceof Error ? error.message : String(error))}`,
          );
        }
      }
    }
  }
}

/** The first-connect result `connect()` waits for. */
class Pending {
  settled = false;
  readonly promise: Promise<void>;
  private resolver!: () => void;
  private rejecter!: (error: Error) => void;

  constructor() {
    this.promise = new Promise<void>((resolve, reject) => {
      this.resolver = resolve;
      this.rejecter = reject;
    });
    this.promise.catch(() => undefined);
  }

  resolve(): void {
    if (this.settled) return;
    this.settled = true;
    this.resolver();
  }

  reject(error: Error): void {
    if (this.settled) return;
    this.settled = true;
    this.rejecter(error);
  }
}

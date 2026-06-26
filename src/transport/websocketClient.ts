import WebSocket from 'ws';
import { Config } from '../config.js';
import {
  HEADER_AUTHORIZATION,
  HEADER_CONTENT_TYPE,
  HEADER_ACCEPT,
  CONTENT_TYPE_JSON,
  AUTH_SCHEME_BEARER,
  WS_KEY_CHANNEL,
} from '../constants.js';
import { WebSocketError } from '../exceptions.js';

export type MessageHandler = (message: Record<string, unknown>) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private token: string | null = null;
  private running = false;

  constructor(private readonly config: Config) {}

  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Connect to the SSI streaming server.
   * Retries with exponential back-off up to `config.maxRetries` times.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
        [HEADER_ACCEPT]: CONTENT_TYPE_JSON,
      };
      if (this.token) {
        headers[HEADER_AUTHORIZATION] = `${AUTH_SCHEME_BEARER}${this.token}`;
      }

      const wsOptions: WebSocket.ClientOptions = { headers };
      if (this.config.proxy) {
        // Pass proxy via env variable or agent – simplest approach is via env
        // For production use, consider `https-proxy-agent` package
        wsOptions.agent = undefined;
      }

      let attempt = 0;
      const maxRetries = this.config.maxRetries;
      const delay = this.config.retryDelay;

      const tryConnect = () => {
        const ws = new WebSocket(this.config.streamingUrl, wsOptions);

        const onOpen = () => {
          ws.off('error', onError);
          this.ws = ws;
          this.running = true;
          this.ws.on('message', (data) => this.handleMessage(data));
          this.ws.on('close', () => { this.running = false; });
          this.ws.on('error', (err) => {
            if (this.running) console.error('[SSI WS] Error:', err.message);
          });
          resolve();
        };

        const onError = (err: Error) => {
          ws.off('open', onOpen);
          ws.terminate();
          if (attempt < maxRetries) {
            const wait = delay * Math.pow(2, attempt);
            attempt++;
            setTimeout(tryConnect, wait);
          } else {
            reject(
              new WebSocketError(
                `Failed to connect to ${this.config.streamingUrl} after ${maxRetries} retries: ${err.message}`,
              ),
            );
          }
        };

        ws.once('open', onOpen);
        ws.once('error', onError);
      };

      tryConnect();
    });
  }

  disconnect(): void {
    this.running = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new WebSocketError('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(data));
  }

  /** Register a handler for a specific channel. Pass `null` to clear all handlers. */
  on(channel: string, handler: MessageHandler | null): void {
    if (handler === null) {
      this.handlers.delete(channel);
      return;
    }
    const list = this.handlers.get(channel) ?? [];
    list.push(handler);
    this.handlers.set(channel, list);
  }

  /** Remove a specific handler or all handlers for a channel. */
  off(channel: string, handler?: MessageHandler): void {
    if (!handler) {
      this.handlers.delete(channel);
      return;
    }
    const list = this.handlers.get(channel);
    if (list) {
      const updated = list.filter((h) => h !== handler);
      this.handlers.set(channel, updated);
    }
  }

  /** Wait until the connection is closed. */
  wait(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws) return resolve();
      this.ws.once('close', resolve);
    });
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      return;
    }
    const channel = (msg[WS_KEY_CHANNEL] as string | undefined) ?? '__raw__';
    const list = this.handlers.get(channel);
    if (list) {
      for (const handler of list) {
        try {
          handler(msg);
        } catch (err) {
          console.error('[SSI WS] Handler error:', err);
        }
      }
    }
  }
}

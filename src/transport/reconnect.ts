import { WS_RATE_LIMIT_BACKOFF_MS, WS_RECONNECT_MAX_DELAY_MS } from '../constants.js';
import type { Frame } from './dispatch.js';

export type ConnectionState = 'connected' | 'reconnected' | 'disconnected' | 'failed';

export interface ConnectionEvent {
  state: ConnectionState;
  reconnectCount: number;
  error?: Error;
}

export type ConnectionListener = (event: ConnectionEvent) => void;

export const RejectionKind = {
  AUTH: 'auth',
  RATE_LIMITED: 'rate_limited',
  TRANSIENT: 'transient',
} as const;
export type RejectionKind = (typeof RejectionKind)[keyof typeof RejectionKind];

const MIN_DELAY_MS = 50;

/** Exponential backoff in ms with jitter (`jitter` 0..1 picks where in [50%, 100%] to land). */
export function backoffDelay(
  attempt: number,
  baseMs: number,
  capMs: number = WS_RECONNECT_MAX_DELAY_MS,
  jitter: number = Math.random(),
): number {
  const exp = Math.min(capMs, Math.max(baseMs, 0) * 2 ** Math.max(attempt, 0));
  const j = Math.min(1, Math.max(0, jitter));
  return Math.max(MIN_DELAY_MS, exp * (0.5 + 0.5 * j));
}

export interface Rejection {
  kind: RejectionKind;
  code: number | null;
  /** Milliseconds (the server sends seconds in `retryAfter` / `retry_after`). */
  retryAfterMs: number | null;
}

/** Classify a `{code, msg}` frame the server sends before closing a socket. */
export function classifyRejection(message: Frame): Rejection {
  const parsed = Number.parseInt(String(message.code), 10);
  const code = Number.isNaN(parsed) ? null : parsed;
  let retryAfterMs: number | null = null;
  for (const key of ['retryAfter', 'retry_after']) {
    if (key in message) {
      const value = Number(message[key]);
      if (Number.isFinite(value) && value >= 0) {
        retryAfterMs = Math.round(value * 1000);
        break;
      }
    }
  }
  let kind: RejectionKind = RejectionKind.TRANSIENT;
  if (code === 401 || code === 403) kind = RejectionKind.AUTH;
  else if (code === 429) kind = RejectionKind.RATE_LIMITED;
  return { kind, code, retryAfterMs };
}

/** How long (ms) to wait after a 429: at least the floor, more if the server said so (ms in). */
export function rateLimitWait(retryAfterMs: number | null): number {
  const asked = retryAfterMs !== null ? retryAfterMs : 0;
  return Math.max(WS_RATE_LIMIT_BACKOFF_MS, asked);
}

/** Milliseconds until the token should be renewed; `null` when its expiry is unknown. */
export function msUntilRefresh(
  expiresAtSeconds: number,
  nowMs: number,
  leadMs: number,
): number | null {
  if (!expiresAtSeconds || expiresAtSeconds <= 0) return null;
  return Math.max(0, expiresAtSeconds * 1000 - leadMs - nowMs);
}

/** What the socket is subscribed to, per channel, so a reconnect can subscribe again. */
export class SubscriptionBook {
  private readonly channels = new Map<string, Set<string>>();

  record(request: Frame): void {
    const method = String(request.method ?? '').toLowerCase();
    const channel = request.channel;
    const topics = request.topics;
    if ((method !== 'subscribe' && method !== 'unsubscribe') || typeof channel !== 'string') return;
    if (!Array.isArray(topics)) return;
    const set = this.channels.get(channel) ?? new Set<string>();
    for (const topic of topics) {
      if (method === 'subscribe') set.add(String(topic));
      else set.delete(String(topic));
    }
    if (set.size === 0) this.channels.delete(channel);
    else this.channels.set(channel, set);
  }

  requests(): Frame[] {
    return [...this.channels.entries()].map(([channel, topics]) => ({
      method: 'subscribe',
      channel,
      topics: [...topics],
    }));
  }

  clear(): void {
    this.channels.clear();
  }
}

import {
  WS_KEY_CHANNEL,
  WS_MAX_FRAME_BYTES,
  WS_ROUTE_ACK,
  WS_ROUTE_ERROR,
  WS_ROUTE_ID,
  WS_ROUTE_LIST_SUBSCRIPTION,
} from '../constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ssi-sdk.dispatch');

export type Frame = Record<string, unknown>;

function isObject(value: unknown): value is Frame {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Parse a raw frame; `null` when it is not a JSON object. Only the size is logged. */
export function decodeMessage(raw: string | Buffer | ArrayBuffer | Buffer[]): Frame | null {
  let text: string;
  if (typeof raw === 'string') text = raw;
  else if (Array.isArray(raw)) text = Buffer.concat(raw).toString('utf8');
  else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString('utf8');
  else text = raw.toString('utf8');
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) return parsed;
    log.debug(`Dropped a non-object frame (${text.length} chars)`);
  } catch {
    log.debug(`Dropped a non-JSON frame (${text.length} chars)`);
  }
  return null;
}

/** An answer to a request: has `method` and `status` but no `topic`. */
export function isAck(message: Frame): boolean {
  return 'method' in message && 'status' in message && !('topic' in message);
}

/** The handler routes a frame goes to (a channel name, or an `@...` pseudo route). */
export function routesOf(message: Frame): string[] {
  const channel = message[WS_KEY_CHANNEL];
  if (typeof channel === 'string' && channel !== '') {
    return isAck(message) ? [channel, WS_ROUTE_ACK] : [channel];
  }
  if ('id' in message) return [WS_ROUTE_ID];
  if ('code' in message && ('msg' in message || 'message' in message)) return [WS_ROUTE_ERROR];
  if (!('topic' in message) && ('trading' in message || 'data' in message)) {
    return [WS_ROUTE_LIST_SUBSCRIPTION];
  }
  if (isAck(message)) return [WS_ROUTE_ACK];
  return [];
}

/** A category for a failed ack (never the server text), for logs. `null` when not a failed ack. */
export function ackErrorCategory(message: Frame): string | null {
  if (!isAck(message) || String(message.status).toLowerCase() !== 'error') return null;
  const text = String(message.message || '').toLowerCase();
  for (const category of ['Denied (account)', 'Denied (scope)', 'Invalid']) {
    if (text.includes(category.toLowerCase())) return category;
  }
  return 'error';
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/** Split a request whose JSON is bigger than `maxBytes` into several, chunking `topics`. */
export function splitRequest(data: Frame, maxBytes: number = WS_MAX_FRAME_BYTES): Frame[] {
  const topics = data.topics;
  if (!Array.isArray(topics) || jsonBytes(data) <= maxBytes) return [data];
  const parts: Frame[] = [];
  let chunk: unknown[] = [];
  for (const topic of topics) {
    if (chunk.length > 0 && jsonBytes({ ...data, topics: [...chunk, topic] }) > maxBytes) {
      parts.push({ ...data, topics: chunk });
      chunk = [];
    }
    chunk.push(topic);
  }
  if (chunk.length > 0) parts.push({ ...data, topics: chunk });
  return parts;
}

/** Split a LIST_SUBSCRIPTION reply `{trading: 'a;b', data: 'x;y'}` into topic lists. */
export function splitSubscriptions(message: Frame): { trading: string[]; data: string[] } {
  const split = (value: unknown): string[] =>
    typeof value === 'string' ? value.split(';').filter((part) => part !== '') : [];
  return { trading: split(message.trading), data: split(message.data) };
}

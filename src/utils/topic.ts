import { Timeframe } from '../enums/timeframe.js';
import { ValidationError } from '../exceptions.js';

/**
 * Topic types the server implements. `asset.*`/`margin.*` are not live yet, so they are
 * deliberately absent: subscribing to them would only ever be silently ignored.
 */
export const TOPIC_TYPES: ReadonlySet<string> = new Set([
  'trade',
  'quote',
  'room',
  'put',
  'oddlot',
  'market',
  'order',
  'portfolio',
  'trade.index',
  'indexsummary',
]);

/** Candle intervals the stream serves (and only on trade / trade.index). */
export const STREAM_INTERVALS: ReadonlySet<string> = new Set(['tick', '1m', '5m']);
export type StreamInterval = 'tick' | '1m' | '5m';

const INTERVAL_TOPIC_TYPES = new Set(['trade', 'trade.index']);
const ACCOUNT_TOPIC_TYPES = new Set(['order', 'portfolio']); // account numbers: sent as given

/**
 * `@*` is how the server fans a basket index (VN30) or an exchange (HOSE) out to its symbols:
 * without it `trade.VN30` is just an exact key that never matches a tick.
 */
export const STREAM_INTERVAL_ALL = '*';
const ALL_INTERVAL_TOPIC_TYPES = new Set(['trade', 'quote', 'room', 'put', 'oddlot']);

// The index of HNX+UPCOM is called HNXUPCOMINDEX on the server; UPCOMINDEX is the common alias.
const ALIASES: Record<string, string> = { UPCOMINDEX: 'HNXUPCOMINDEX' };

// One filter per topic: `*`, a code, or a range `A-B`. The server does not split on commas.
const FILTER_RE = /^(?:\*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)$/;

/** Interval as the text after `@` (`tick` is case-insensitive, `1M` is not). */
function intervalText(interval: Timeframe | string | null | undefined): string | undefined {
  if (interval === null || interval === undefined) return undefined;
  const text = String(interval);
  return text.toLowerCase() === 'tick' ? 'tick' : text;
}

/**
 * Build one topic string, e.g. `trade.VNM@1m` or `trade.index.VN30`.
 *
 * @param topicType - One of TOPIC_TYPES.
 * @param filter - `*`, a code (`VNM`, `HOSE`) or a range (`A-B`); one filter per topic (a
 *   comma list is rejected, pass a list to buildTopics instead). Codes are upper-cased except
 *   for `order` / `portfolio` accounts. `UPCOMINDEX` is rewritten to `HNXUPCOMINDEX`.
 * @param interval - `tick`, `1m` or `5m`; only valid for `trade` and `trade.index`, and for
 *   `trade.index` only with a concrete code (not `*` or a range). `*` (STREAM_INTERVAL_ALL) is
 *   the basket/exchange fan-out (`trade.VN30@*`, `quote.HOSE@*`): valid for `trade`, `quote`,
 *   `room`, `put` and `oddlot` with one concrete index or exchange code.
 * @throws ValidationError if the type, filter or interval is not accepted.
 */
export function buildTopic(
  topicType: string,
  filter: string = '*',
  interval?: Timeframe | string | null,
): string {
  if (!TOPIC_TYPES.has(topicType)) {
    throw new ValidationError(`unknown topic type '${topicType}'`);
  }
  if (typeof filter !== 'string' || !FILTER_RE.test(filter)) {
    throw new ValidationError(`invalid topic filter '${String(filter)}'`);
  }
  if (!ACCOUNT_TOPIC_TYPES.has(topicType)) filter = filter.toUpperCase();
  filter = ALIASES[filter] ?? filter;

  const topic = `${topicType}.${filter}`;
  const text = intervalText(interval);
  if (text === undefined) return topic;
  if (text === STREAM_INTERVAL_ALL) {
    if (!ALL_INTERVAL_TOPIC_TYPES.has(topicType)) {
      throw new ValidationError(`interval '*' is not valid for ${topicType}`);
    }
    if (!/^[A-Za-z0-9]+$/.test(filter)) {
      throw new ValidationError("interval '*' needs one concrete index or exchange code");
    }
    return `${topic}@${text}`;
  }
  if (!INTERVAL_TOPIC_TYPES.has(topicType)) {
    throw new ValidationError(`interval is only valid for trade and trade.index, not ${topicType}`);
  }
  if (!STREAM_INTERVALS.has(text)) {
    throw new ValidationError(
      `interval must be one of ${[...STREAM_INTERVALS].sort().join(', ')}, got '${text}'`,
    );
  }
  if (topicType === 'trade.index' && !/^[A-Za-z0-9]+$/.test(filter)) {
    throw new ValidationError('trade.index intervals need one concrete index, not a wildcard');
  }
  return `${topic}@${text}`;
}

/** Build one topic per filter (see buildTopic); an empty list is an error. */
export function buildTopics(
  topicType: string,
  filters: string[],
  interval?: Timeframe | string | null,
): string[] {
  if (!filters || filters.length === 0) {
    throw new ValidationError('at least one symbol is required');
  }
  return filters.map((item) => buildTopic(topicType, item, interval));
}

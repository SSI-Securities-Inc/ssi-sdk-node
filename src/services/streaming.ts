import { TOPIC_MARKET_FLAG, WS_ROUTE_ACK, WS_ROUTE_LIST_SUBSCRIPTION } from '../constants.js';
import { Board } from '../enums/marketData.js';
import { Timeframe } from '../enums/timeframe.js';
import { DataTopic, StreamingChannel, StreamingMethod, StreamingType } from '../enums/streaming.js';
import { WebSocketError } from '../exceptions.js';
import {
  DataMessage,
  HeartbeatMessage,
  IndexSummaryMessage,
  MarketFlagMessage,
  OrderMatchMessage,
  OrderStatusMessage,
  PortfolioMessage,
  RequestMessage,
  TradingMessage,
  fcoOrderUpdateMessageFromDict,
  foreignRoomMessageFromDict,
  heartbeatMessageFromDict,
  indexSummaryMessageFromDict,
  indexTickMessageFromDict,
  intervalMessageFromDict,
  marketDataMessageFromDict,
  marketFlagMessageFromDict,
  marketStatusMessageFromDict,
  oddLotMessageFromDict,
  orderMatchMessageFromDict,
  orderStatusMessageFromDict,
  portfolioMessageFromDict,
  putMessageFromDict,
  quoteMessageFromDict,
  requestMessageToDict,
  tradeMessageFromDict,
} from '../models/streaming.js';
import { Frame, splitSubscriptions } from '../transport/dispatch.js';
import { ConnectionEvent } from '../transport/reconnect.js';
import { MessageHandler, WebSocketClient } from '../transport/websocketClient.js';
import { createLogger } from '../utils/logger.js';
import { abortableSleep } from '../utils/retry.js';
import { STREAM_INTERVAL_ALL, StreamInterval, buildTopic, buildTopics } from '../utils/topic.js';

const log = createLogger('ssi-sdk.streaming');

type Dict = Record<string, unknown>;
type Callback<T> = (message: T) => void | Promise<void>;

export type DataCallback = Callback<DataMessage>;
export type TradingCallback = Callback<TradingMessage>;
export type HeartbeatCallback = Callback<HeartbeatMessage>;
export type ResponseCallback = (response: Dict) => void | Promise<void>;
export type ConnectionCallback = (event: ConnectionEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

export type DataKind =
  | 'trade'
  | 'indexTick'
  | 'interval'
  | 'quote'
  | 'room'
  | 'marketFlag'
  | 'indexSummary'
  | 'marketData'
  | 'marketStatus'
  | 'put'
  | 'oddLot'
  | 'raw';

export type TradingKind = 'order' | 'orderMatch' | 'portfolio' | 'fco' | 'raw';

function payload(msg: Dict): Dict {
  const data = msg.data;
  return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Dict) : {};
}

function isCandleTopic(kind: string): boolean {
  return kind.endsWith('@1m') || kind.endsWith('@5m');
}

/** Pick the model of a DATA frame (and name it), by topic. */
export function classifyDataMessage(msg: Dict): { kind: DataKind; message: DataMessage } {
  const topic = typeof msg.topic === 'string' ? msg.topic : '';
  const data = payload(msg);
  // The server upper-cases the part after the type (`market.FLAG`, `trade.SSI`), so the type is
  // matched without regard to case.
  const kind = topic.toLowerCase();
  if (kind.startsWith('trade.index.')) {
    return isCandleTopic(kind)
      ? { kind: 'interval', message: intervalMessageFromDict(data) }
      : { kind: 'indexTick', message: indexTickMessageFromDict(data) };
  }
  if (kind.startsWith(DataTopic.TRADE)) {
    return isCandleTopic(kind)
      ? { kind: 'interval', message: intervalMessageFromDict(data) }
      : { kind: 'trade', message: tradeMessageFromDict(data) };
  }
  if (kind.startsWith(DataTopic.QUOTE)) return { kind: 'quote', message: quoteMessageFromDict(data) };
  if (kind.startsWith(DataTopic.ROOM)) return { kind: 'room', message: foreignRoomMessageFromDict(data) };
  if (kind === TOPIC_MARKET_FLAG) return { kind: 'marketFlag', message: marketFlagMessageFromDict(data) };
  if (kind.startsWith(DataTopic.INDEX_SUMMARY)) {
    return { kind: 'indexSummary', message: indexSummaryMessageFromDict(data, topic) };
  }
  if (kind.startsWith(DataTopic.MARKET)) {
    // `market.<symbol>` carries master data (s/b/t/ce/fl/ref); the legacy status shape is kept
    // for payloads that look like it.
    return ['s', 'ce', 'fl', 'ref'].some((key) => key in data)
      ? { kind: 'marketData', message: marketDataMessageFromDict(data) }
      : { kind: 'marketStatus', message: marketStatusMessageFromDict(data) };
  }
  if (kind.startsWith(DataTopic.PUT)) return { kind: 'put', message: putMessageFromDict(data) };
  if (kind.startsWith(DataTopic.ODD_LOT)) return { kind: 'oddLot', message: oddLotMessageFromDict(data) };
  return { kind: 'raw', message: msg };
}

/** Parse a DATA frame into its model; a frame this SDK has no model for comes back as is. */
export function parseDataMessage(msg: Dict): DataMessage {
  return classifyDataMessage(msg).message;
}

/**
 * Pick the model of a TRADING frame (and name it) by `data.eventType`; with no event type the
 * topic decides; an event type this SDK does not know is passed on as the raw object.
 */
export function classifyTradingMessage(msg: Dict): { kind: TradingKind; message: TradingMessage } {
  const topic = typeof msg.topic === 'string' ? msg.topic : '';
  const data = payload(msg);
  const event = data.eventType;
  if (event === 'fcoEvent') return { kind: 'fco', message: fcoOrderUpdateMessageFromDict(data) };
  if (event === StreamingType.ORDER_MATCH) return { kind: 'orderMatch', message: orderMatchMessageFromDict(data) };
  if (event === StreamingType.PORTFOLIO) return { kind: 'portfolio', message: portfolioMessageFromDict(data) };
  if (event === StreamingType.ORDER) return { kind: 'order', message: orderStatusMessageFromDict(data) };
  if (event === undefined || event === null || event === '') {
    if (topic.startsWith('order.')) return { kind: 'order', message: orderStatusMessageFromDict(data) };
    if (topic.startsWith('portfolio.')) return { kind: 'portfolio', message: portfolioMessageFromDict(data) };
  }
  return { kind: 'raw', message: msg };
}

/** Parse a TRADING frame into its model; an unknown one comes back as is. */
export function parseTradingMessage(msg: Dict): TradingMessage {
  return classifyTradingMessage(msg).message;
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

function dataRequest(
  method: StreamingMethod,
  topicType: string,
  symbols: string[],
  interval?: Timeframe | StreamInterval | typeof STREAM_INTERVAL_ALL | null,
): RequestMessage {
  return { method, channel: StreamingChannel.DATA, topics: buildTopics(topicType, symbols, interval) };
}

// Topic types subscribeBoard / subscribeIndex cover; each goes out as `<type>.<code>@*`.
const GROUP_TOPIC_TYPES = ['trade', 'quote', 'room'] as const;

/** Build the per-type requests for an exchange/basket-index fan-out (`trade.VN30@*`). */
export function groupRequests(method: StreamingMethod, codes: string[]): RequestMessage[] {
  return GROUP_TOPIC_TYPES.map((topicType) =>
    dataRequest(method, topicType, codes, STREAM_INTERVAL_ALL),
  );
}

function marketFlagRequest(method: StreamingMethod): RequestMessage {
  return { method, channel: StreamingChannel.DATA, topics: [TOPIC_MARKET_FLAG] };
}

function tradingRequest(method: StreamingMethod, topicType: string, accountNo: string): RequestMessage {
  return { method, channel: StreamingChannel.TRADING, topics: [buildTopic(topicType, accountNo)] };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Call each callback; a failing one must not starve the others. */
async function deliver<T>(callbacks: Callback<T>[], message: T): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const callback of callbacks) {
    try {
      const result = callback(message);
      if (result && typeof (result as Promise<void>).then === 'function') {
        pending.push(result as Promise<void>);
      }
    } catch (error) {
      log.error(`Error in a streaming callback: ${errorName(error)}`);
    }
  }
  for (const result of pending) {
    try {
      await result;
    } catch (error) {
      log.error(`Error in an async streaming callback: ${errorName(error)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Unified real-time streaming over one WebSocket.
 *
 * Market data: trade, quote, room, put-through, odd-lot, master data, session flag, index ticks
 * and index summary. Account events: order status / fills, portfolio.
 *
 * Setting a callback subscribes nothing by itself; it chooses where messages are delivered.
 * `onData` / `onTrading` receive every message of their channel; the typed callbacks
 * (`onMarketFlag`, `onIndexSummary`, `onOrder`, `onOrderMatch`, `onPortfolio`) only those of their
 * model.
 */
export class StreamingService {
  private onDataCallback?: DataCallback;
  private onTradingCallback?: TradingCallback;
  private onHeartbeatCallback?: HeartbeatCallback;
  private onMarketFlagCallback?: Callback<MarketFlagMessage>;
  private onIndexSummaryCallback?: Callback<IndexSummaryMessage>;
  private onOrderCallback?: Callback<OrderStatusMessage>;
  private onOrderMatchCallback?: Callback<OrderMatchMessage>;
  private onPortfolioCallback?: Callback<PortfolioMessage>;
  private pingAbort: AbortController | null = null;

  constructor(private readonly wsClient: WebSocketClient) {}

  // -- callbacks ---------------------------------------------------------

  get onData(): DataCallback | undefined {
    return this.onDataCallback;
  }
  set onData(callback: DataCallback | undefined) {
    this.onDataCallback = callback;
    this.refreshHandlers();
  }

  get onTrading(): TradingCallback | undefined {
    return this.onTradingCallback;
  }
  set onTrading(callback: TradingCallback | undefined) {
    this.onTradingCallback = callback;
    this.refreshHandlers();
  }

  get onHeartbeat(): HeartbeatCallback | undefined {
    return this.onHeartbeatCallback;
  }
  set onHeartbeat(callback: HeartbeatCallback | undefined) {
    this.onHeartbeatCallback = callback;
    const handler: MessageHandler | null = callback
      ? (msg) => callback(heartbeatMessageFromDict(msg))
      : null;
    this.wsClient.on(StreamingChannel.HEARTBEAT, handler);
  }

  /** Session flags (ATO/LO/ATC...); needs `subscribeMarketFlag()`. `onData` gets them too. */
  get onMarketFlag(): Callback<MarketFlagMessage> | undefined {
    return this.onMarketFlagCallback;
  }
  set onMarketFlag(callback: Callback<MarketFlagMessage> | undefined) {
    this.onMarketFlagCallback = callback;
    this.refreshHandlers();
  }

  /** Full index data from `indexsummary.<code>`; needs `subscribeIndexSummary()`. */
  get onIndexSummary(): Callback<IndexSummaryMessage> | undefined {
    return this.onIndexSummaryCallback;
  }
  set onIndexSummary(callback: Callback<IndexSummaryMessage> | undefined) {
    this.onIndexSummaryCallback = callback;
    this.refreshHandlers();
  }

  /** `orderEvent`: an order changed status; needs `subscribeOrderStatus(accountNo)`. */
  get onOrder(): Callback<OrderStatusMessage> | undefined {
    return this.onOrderCallback;
  }
  set onOrder(callback: Callback<OrderStatusMessage> | undefined) {
    this.onOrderCallback = callback;
    this.refreshHandlers();
  }

  /** `orderMatchEvent`: a fill of your order; arrives on the same topic as the order status. */
  get onOrderMatch(): Callback<OrderMatchMessage> | undefined {
    return this.onOrderMatchCallback;
  }
  set onOrderMatch(callback: Callback<OrderMatchMessage> | undefined) {
    this.onOrderMatchCallback = callback;
    this.refreshHandlers();
  }

  /** Derivative position updates; needs `subscribePortfolio(accountNo)`. */
  get onPortfolio(): Callback<PortfolioMessage> | undefined {
    return this.onPortfolioCallback;
  }
  set onPortfolio(callback: Callback<PortfolioMessage> | undefined) {
    this.onPortfolioCallback = callback;
    this.refreshHandlers();
  }

  /** Called with a `ConnectionEvent` on connected / reconnected / disconnected / failed. */
  get onConnection(): ConnectionCallback | undefined {
    return this.wsClient.onState ?? undefined;
  }
  set onConnection(callback: ConnectionCallback | undefined) {
    this.wsClient.onState = callback ?? null;
  }

  get isConnected(): boolean {
    return this.wsClient.isConnected;
  }

  /** The error that ended the connection for good (`null` while healthy). */
  get lastError(): Error | null {
    return this.wsClient.lastError;
  }

  /** How many times the socket was re-opened after a drop. */
  get reconnectCount(): number {
    return this.wsClient.reconnectCount;
  }

  private async handleData(msg: Frame): Promise<void> {
    const { kind, message } = classifyDataMessage(msg);
    const targets: Callback<DataMessage>[] = [];
    if (this.onDataCallback) targets.push(this.onDataCallback);
    if (kind === 'marketFlag' && this.onMarketFlagCallback) {
      const callback = this.onMarketFlagCallback;
      targets.push((m) => callback(m as MarketFlagMessage));
    }
    if (kind === 'indexSummary' && this.onIndexSummaryCallback) {
      const callback = this.onIndexSummaryCallback;
      targets.push((m) => callback(m as IndexSummaryMessage));
    }
    await deliver(targets, message);
  }

  private async handleTrading(msg: Frame): Promise<void> {
    const { kind, message } = classifyTradingMessage(msg);
    const targets: Callback<TradingMessage>[] = [];
    if (this.onTradingCallback) targets.push(this.onTradingCallback);
    if (kind === 'order' && this.onOrderCallback) {
      const callback = this.onOrderCallback;
      targets.push((m) => callback(m as OrderStatusMessage));
    }
    if (kind === 'orderMatch' && this.onOrderMatchCallback) {
      const callback = this.onOrderMatchCallback;
      targets.push((m) => callback(m as OrderMatchMessage));
    }
    if (kind === 'portfolio' && this.onPortfolioCallback) {
      const callback = this.onPortfolioCallback;
      targets.push((m) => callback(m as PortfolioMessage));
    }
    await deliver(targets, message);
  }

  /** Install (or clear) the one handler per channel from the callbacks currently set. */
  private refreshHandlers(): void {
    const wantsData = Boolean(
      this.onDataCallback || this.onMarketFlagCallback || this.onIndexSummaryCallback,
    );
    const wantsTrading = Boolean(
      this.onTradingCallback || this.onOrderCallback || this.onOrderMatchCallback || this.onPortfolioCallback,
    );
    this.wsClient.on(StreamingChannel.DATA, wantsData ? (msg) => this.handleData(msg) : null);
    this.wsClient.on(StreamingChannel.TRADING, wantsTrading ? (msg) => this.handleTrading(msg) : null);
  }

  // -- connection --------------------------------------------------------

  connect(): Promise<void> {
    return this.wsClient.connect();
  }

  /** Close the connection (and stop the ping loop, if one is running). */
  async disconnect(): Promise<void> {
    this.pingAbort?.abort();
    this.pingAbort = null;
    await this.wsClient.disconnect();
  }

  /** Wait until the connection ends for good, or `timeoutMs` passes. */
  wait(timeoutMs?: number): Promise<void> {
    return this.wsClient.wait(timeoutMs);
  }

  // -- helpers -----------------------------------------------------------

  private async subscribe(request: RequestMessage, onResponse?: ResponseCallback): Promise<void> {
    if (onResponse) {
      // Acknowledgements have their own route: registering on the request's channel would
      // replace the user's data/trading handler.
      this.wsClient.on(WS_ROUTE_ACK, onResponse);
    }
    await this.wsClient.send(requestMessageToDict(request));
  }

  private send(request: RequestMessage): Promise<void> {
    return this.wsClient.send(requestMessageToDict(request));
  }

  /**
   * Send a ping. With `intervalMs` it keeps pinging in the background (a new call replaces the
   * previous loop); without it, one ping.
   */
  async ping(onResponse?: ResponseCallback, intervalMs?: number): Promise<void> {
    const sendOnce = (): Promise<void> =>
      this.subscribe(
        { method: StreamingMethod.PING_PONG, channel: StreamingChannel.HEARTBEAT, topics: [] },
        onResponse,
      );
    if (intervalMs === undefined) {
      await sendOnce();
      return;
    }
    this.pingAbort?.abort();
    const abort = new AbortController();
    this.pingAbort = abort;
    void (async () => {
      try {
        while (!abort.signal.aborted) {
          await sendOnce();
          await abortableSleep(intervalMs, abort.signal);
        }
      } catch (error) {
        log.debug(`Ping loop stopped: ${errorName(error)}`);
      }
    })();
  }

  // -- market data -------------------------------------------------------

  /** Candles of the given symbols; `interval` is `tick`, `1m` or `5m` (others are rejected). */
  subscribeSymbolOhlcv(
    symbols: string[],
    interval: Timeframe | StreamInterval,
    onResponse?: ResponseCallback,
  ): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'trade', symbols, interval), onResponse);
  }
  unsubscribeSymbolOhlcv(symbols: string[], interval: Timeframe | StreamInterval): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'trade', symbols, interval));
  }

  subscribeSymbolTrade(symbols: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'trade', symbols), onResponse);
  }
  unsubscribeSymbolTrade(symbols: string[]): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'trade', symbols));
  }

  subscribeSymbolQuote(symbols: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'quote', symbols), onResponse);
  }
  unsubscribeSymbolQuote(symbols: string[]): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'quote', symbols));
  }

  subscribeSymbolRoom(symbols: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'room', symbols), onResponse);
  }
  unsubscribeSymbolRoom(symbols: string[]): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'room', symbols));
  }

  subscribeSymbolPutThrough(symbols: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'put', symbols), onResponse);
  }
  unsubscribeSymbolPutThrough(symbols: string[]): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'put', symbols));
  }

  subscribeSymbolOddLot(symbols: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'oddlot', symbols), onResponse);
  }
  unsubscribeSymbolOddLot(symbols: string[]): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'oddlot', symbols));
  }

  /** Trade, quote and foreign-room topics of the given symbols. */
  async subscribeSymbol(symbols: string[], onResponse?: ResponseCallback): Promise<void> {
    await this.subscribeSymbolTrade(symbols, onResponse);
    await this.subscribeSymbolQuote(symbols, onResponse);
    await this.subscribeSymbolRoom(symbols, onResponse);
  }
  async unsubscribeSymbol(symbols: string[]): Promise<void> {
    await this.unsubscribeSymbolTrade(symbols);
    await this.unsubscribeSymbolQuote(symbols);
    await this.unsubscribeSymbolRoom(symbols);
  }

  private async subscribeGroups(codes: string[], onResponse?: ResponseCallback): Promise<void> {
    for (const request of groupRequests(StreamingMethod.SUBSCRIBE, codes)) {
      await this.subscribe(request, onResponse);
    }
  }
  private async unsubscribeGroups(codes: string[]): Promise<void> {
    for (const request of groupRequests(StreamingMethod.UNSUBSCRIBE, codes)) {
      await this.send(request);
    }
  }

  /**
   * Trade, quote and foreign-room topics of a whole exchange (board). Sent as `trade.HOSE@*`
   * (etc.): the server only fans an exchange out to its symbols with the `@*` interval.
   */
  subscribeBoard(boards: Board[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribeGroups(boards.map(String), onResponse);
  }
  unsubscribeBoard(boards: Board[]): Promise<void> {
    return this.unsubscribeGroups(boards.map(String));
  }

  /**
   * Trade, quote and foreign-room topics of an index's constituent symbols (`trade.<index>@*`;
   * the server only fans a basket out with the `@*` interval). For the ticks of the index itself
   * use `subscribeIndexTrade`.
   */
  subscribeIndex(indices: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribeGroups(indices, onResponse);
  }
  unsubscribeIndex(indices: string[]): Promise<void> {
    return this.unsubscribeGroups(indices);
  }

  /** Market session flags (ATO, LO, ATC...) of every board. */
  subscribeMarketFlag(onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(marketFlagRequest(StreamingMethod.SUBSCRIBE), onResponse);
  }
  unsubscribeMarketFlag(): Promise<void> {
    return this.send(marketFlagRequest(StreamingMethod.UNSUBSCRIBE));
  }

  /** Master data (ceiling, floor, reference price) of symbols or boards. */
  subscribeMarket(symbols: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'market', symbols), onResponse);
  }
  unsubscribeMarket(symbols: string[]): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'market', symbols));
  }

  /**
   * Ticks of the index itself (`trade.index.<code>`), as `IndexTickMessage`; with `interval`
   * `1m`/`5m` as candles. `UPCOMINDEX` is sent as `HNXUPCOMINDEX`.
   */
  subscribeIndexTrade(
    indices: string[],
    interval?: Timeframe | StreamInterval | null,
    onResponse?: ResponseCallback,
  ): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'trade.index', indices, interval), onResponse);
  }
  unsubscribeIndexTrade(indices: string[], interval?: Timeframe | StreamInterval | null): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'trade.index', indices, interval));
  }

  /** Index summaries (`indexsummary.<code>`), delivered as `IndexSummaryMessage`. */
  subscribeIndexSummary(indices: string[], onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(dataRequest(StreamingMethod.SUBSCRIBE, 'indexsummary', indices), onResponse);
  }
  unsubscribeIndexSummary(indices: string[]): Promise<void> {
    return this.send(dataRequest(StreamingMethod.UNSUBSCRIBE, 'indexsummary', indices));
  }

  // -- account events ----------------------------------------------------

  /** Order status and fills of an account (`*` for all). */
  subscribeOrderStatus(accountNo = '*', onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(tradingRequest(StreamingMethod.SUBSCRIBE, 'order', accountNo), onResponse);
  }
  unsubscribeOrderStatus(accountNo = '*'): Promise<void> {
    return this.send(tradingRequest(StreamingMethod.UNSUBSCRIBE, 'order', accountNo));
  }

  /** Portfolio changes of an account (`*` for all). */
  subscribePortfolio(accountNo = '*', onResponse?: ResponseCallback): Promise<void> {
    return this.subscribe(tradingRequest(StreamingMethod.SUBSCRIBE, 'portfolio', accountNo), onResponse);
  }
  unsubscribePortfolio(accountNo = '*'): Promise<void> {
    return this.send(tradingRequest(StreamingMethod.UNSUBSCRIBE, 'portfolio', accountNo));
  }

  // -- subscriptions on the server ---------------------------------------

  /**
   * Ask the server which topics this connection is subscribed to.
   *
   * @throws WebSocketError if not connected, or no reply arrives within `timeoutMs`.
   */
  async listSubscription(timeoutMs = 5000): Promise<{ trading: string[]; data: string[] }> {
    let handler: MessageHandler | undefined;
    let timer: NodeJS.Timeout | undefined;
    const reply = new Promise<{ trading: string[]; data: string[] }>((resolve, reject) => {
      handler = (message) => resolve(splitSubscriptions(message));
      timer = setTimeout(
        () => reject(new WebSocketError('Timed out waiting for the LIST_SUBSCRIPTION reply')),
        timeoutMs,
      );
    });
    reply.catch(() => undefined);
    this.wsClient.on(WS_ROUTE_LIST_SUBSCRIPTION, handler ?? null);
    try {
      await this.wsClient.send({ method: StreamingMethod.LIST_SUBSCRIPTION });
      return await reply;
    } finally {
      clearTimeout(timer);
      if (handler) this.wsClient.off(WS_ROUTE_LIST_SUBSCRIPTION, handler);
    }
  }

  /**
   * Unsubscribe from everything the server reports for this connection (so it also clears topics
   * left by an earlier run of the same session). Returns the topics removed.
   */
  async unsubscribeAll(): Promise<{ trading: string[]; data: string[] }> {
    const current = await this.listSubscription();
    const channels: [keyof typeof current, StreamingChannel][] = [
      ['data', StreamingChannel.DATA],
      ['trading', StreamingChannel.TRADING],
    ];
    for (const [key, channel] of channels) {
      if (current[key].length > 0) {
        await this.send({ method: StreamingMethod.UNSUBSCRIBE, channel, topics: current[key] });
      }
    }
    return current;
  }

  // -- clearer names: the same methods under names that say what arrives ---

  subscribeOrders = this.subscribeOrderStatus.bind(this);
  unsubscribeOrders = this.unsubscribeOrderStatus.bind(this);
  subscribeIndexTicks = this.subscribeIndexTrade.bind(this);
  unsubscribeIndexTicks = this.unsubscribeIndexTrade.bind(this);
  subscribeMasterData = this.subscribeMarket.bind(this);
  unsubscribeMasterData = this.unsubscribeMarket.bind(this);
  subscribeSessionFlag = this.subscribeMarketFlag.bind(this);
  unsubscribeSessionFlag = this.unsubscribeMarketFlag.bind(this);
  subscribeTrades = this.subscribeSymbolTrade.bind(this);
  unsubscribeTrades = this.unsubscribeSymbolTrade.bind(this);
  subscribeQuotes = this.subscribeSymbolQuote.bind(this);
  unsubscribeQuotes = this.unsubscribeSymbolQuote.bind(this);
  subscribeForeignRoom = this.subscribeSymbolRoom.bind(this);
  unsubscribeForeignRoom = this.unsubscribeSymbolRoom.bind(this);
  subscribePutThrough = this.subscribeSymbolPutThrough.bind(this);
  unsubscribePutThrough = this.unsubscribeSymbolPutThrough.bind(this);
  subscribeOddLot = this.subscribeSymbolOddLot.bind(this);
  unsubscribeOddLot = this.unsubscribeSymbolOddLot.bind(this);
  subscribeCandles = this.subscribeSymbolOhlcv.bind(this);
  unsubscribeCandles = this.unsubscribeSymbolOhlcv.bind(this);
  subscribeExchangeTrades = this.subscribeBoard.bind(this);
  unsubscribeExchangeTrades = this.unsubscribeBoard.bind(this);
  subscribeIndexConstituents = this.subscribeIndex.bind(this);
  unsubscribeIndexConstituents = this.unsubscribeIndex.bind(this);
  subscribePositions = this.subscribePortfolio.bind(this);
  unsubscribePositions = this.unsubscribePortfolio.bind(this);

  /** @deprecated FCO updates arrive on the same `order.<account>` topic: use `subscribeOrderStatus`. */
  subscribeFcoOrderStatus = this.subscribeOrderStatus.bind(this);
}

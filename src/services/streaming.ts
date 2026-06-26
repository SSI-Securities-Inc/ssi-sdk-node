import { WebSocketClient } from '../transport/websocketClient.js';
import { Board } from '../enums/marketData.js';
import { Timeframe } from '../enums/timeframe.js';
import {
  StreamingChannel,
  StreamingMethod,
  DataTopic,
} from '../enums/streaming.js';
import {
  DataMessage,
  TradingMessage,
  HeartbeatMessage,
  TradeMessage,
  IntervalMessage,
  QuoteMessage,
  ForeignRoomMessage,
  MarketStatusMessage,
  PutMessage,
  OddLotMessage,
  OrderStatusMessage,
  PortfolioMessage,
} from '../models/streaming.js';
import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import { toFloat, toInt } from '../utils/converter.js';

export type DataCallback = (message: DataMessage) => void;
export type TradingCallback = (message: TradingMessage) => void;
export type HeartbeatCallback = (message: HeartbeatMessage) => void;
export type ResponseCallback = (response: Record<string, unknown>) => void;

export class StreamingService {
  onData?: DataCallback;
  onTrading?: TradingCallback;
  onHeartbeat?: HeartbeatCallback;

  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(private readonly wsClient: WebSocketClient) {
    wsClient.on(StreamingChannel.DATA, (msg) => this.dispatchData(msg));
    wsClient.on(StreamingChannel.TRADING, (msg) => this.dispatchTrading(msg));
    wsClient.on(StreamingChannel.HEARTBEAT, (msg) => this.dispatchHeartbeat(msg));
  }

  connect(): Promise<void> {
    return this.wsClient.connect();
  }

  disconnect(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.wsClient.disconnect();
  }

  wait(): Promise<void> {
    return this.wsClient.wait();
  }

  // ---------------------------------------------------------------------------
  // Ping / heartbeat
  // ---------------------------------------------------------------------------

  ping(onResponse?: ResponseCallback, intervalMs = 30_000): void {
    const send = () => {
      this.wsClient.send({
        method: StreamingMethod.PING_PONG,
        channel: StreamingChannel.HEARTBEAT,
        topics: [],
      });
    };
    send();
    if (intervalMs > 0) {
      this.pingInterval = setInterval(send, intervalMs);
    }
  }

  // ---------------------------------------------------------------------------
  // Subscribe helpers
  // ---------------------------------------------------------------------------

  private subscribe(
    channel: StreamingChannel,
    topics: string[],
    onResponse?: ResponseCallback,
  ): void {
    const msg = { method: StreamingMethod.SUBSCRIBE, channel, topics };
    this.wsClient.send(msg);
    if (onResponse) {
      const handler = (raw: Record<string, unknown>) => {
        onResponse(raw);
        this.wsClient.off(channel, handler);
      };
      this.wsClient.on(channel, handler);
    }
  }

  private unsubscribe(channel: StreamingChannel, topics: string[]): void {
    this.wsClient.send({ method: StreamingMethod.UNSUBSCRIBE, channel, topics });
  }

  // ---------------------------------------------------------------------------
  // Market data subscriptions
  // ---------------------------------------------------------------------------

  subscribeSymbolTrade(symbols: string[], onResponse?: ResponseCallback): void {
    this.subscribe(StreamingChannel.DATA, symbols.map((s) => `trade.${s}`), onResponse);
  }

  subscribeSymbolQuote(symbols: string[], onResponse?: ResponseCallback): void {
    this.subscribe(StreamingChannel.DATA, symbols.map((s) => `quote.${s}`), onResponse);
  }

  subscribeSymbolRoom(symbols: string[], onResponse?: ResponseCallback): void {
    this.subscribe(StreamingChannel.DATA, symbols.map((s) => `room.${s}`), onResponse);
  }

  subscribeSymbolPutThrough(symbols: string[], onResponse?: ResponseCallback): void {
    this.subscribe(StreamingChannel.DATA, symbols.map((s) => `put.${s}`), onResponse);
  }

  subscribeSymbolOddLot(symbols: string[], onResponse?: ResponseCallback): void {
    this.subscribe(StreamingChannel.DATA, symbols.map((s) => `oddlot.${s}`), onResponse);
  }

  subscribeSymbolOhlcv(
    symbols: string[], interval: Timeframe, onResponse?: ResponseCallback,
  ): void {
    this.subscribe(
      StreamingChannel.DATA,
      symbols.map((s) => `trade.${s}@${interval}`),
      onResponse,
    );
  }

  subscribeSymbol(symbols: string[], onResponse?: ResponseCallback): void {
    const topics = symbols.flatMap((s) => [
      `trade.${s}`, `quote.${s}`, `room.${s}`,
    ]);
    this.subscribe(StreamingChannel.DATA, topics, onResponse);
  }

  subscribeBoard(boards: Board[], onResponse?: ResponseCallback): void {
    const topics = boards.flatMap((b) => [
      `trade.${b}`, `quote.${b}`, `room.${b}`,
    ]);
    this.subscribe(StreamingChannel.DATA, topics, onResponse);
  }

  subscribeIndex(indices: string[], onResponse?: ResponseCallback): void {
    const topics = indices.flatMap((i) => [
      `trade.${i}`, `quote.${i}`, `room.${i}`,
    ]);
    this.subscribe(StreamingChannel.DATA, topics, onResponse);
  }

  // ---------------------------------------------------------------------------
  // Trading subscriptions
  // ---------------------------------------------------------------------------

  subscribeOrderStatus(accountNo = '*', onResponse?: ResponseCallback): void {
    this.subscribe(StreamingChannel.TRADING, [`order.${accountNo}`], onResponse);
  }

  subscribePortfolio(accountNo = '*', onResponse?: ResponseCallback): void {
    this.subscribe(StreamingChannel.TRADING, [`portfolio.${accountNo}`], onResponse);
  }

  // ---------------------------------------------------------------------------
  // Unsubscribe
  // ---------------------------------------------------------------------------

  unsubscribeSymbolTrade(symbols: string[]): void {
    this.unsubscribe(StreamingChannel.DATA, symbols.map((s) => `trade.${s}`));
  }

  unsubscribeSymbolQuote(symbols: string[]): void {
    this.unsubscribe(StreamingChannel.DATA, symbols.map((s) => `quote.${s}`));
  }

  unsubscribeSymbolRoom(symbols: string[]): void {
    this.unsubscribe(StreamingChannel.DATA, symbols.map((s) => `room.${s}`));
  }

  unsubscribeSymbolPutThrough(symbols: string[]): void {
    this.unsubscribe(StreamingChannel.DATA, symbols.map((s) => `put.${s}`));
  }

  unsubscribeSymbolOddLot(symbols: string[]): void {
    this.unsubscribe(StreamingChannel.DATA, symbols.map((s) => `oddlot.${s}`));
  }

  unsubscribeSymbolOhlcv(symbols: string[], interval: Timeframe): void {
    this.unsubscribe(
      StreamingChannel.DATA,
      symbols.map((s) => `trade.${s}@${interval}`),
    );
  }

  unsubscribeSymbol(symbols: string[]): void {
    const topics = symbols.flatMap((s) => [`trade.${s}`, `quote.${s}`, `room.${s}`]);
    this.unsubscribe(StreamingChannel.DATA, topics);
  }

  unsubscribeBoard(boards: Board[]): void {
    const topics = boards.flatMap((b) => [`trade.${b}`, `quote.${b}`, `room.${b}`]);
    this.unsubscribe(StreamingChannel.DATA, topics);
  }

  unsubscribeIndex(indices: string[]): void {
    const topics = indices.flatMap((i) => [`trade.${i}`, `quote.${i}`, `room.${i}`]);
    this.unsubscribe(StreamingChannel.DATA, topics);
  }

  // ---------------------------------------------------------------------------
  // Message dispatch
  // ---------------------------------------------------------------------------

  private dispatchData(raw: Record<string, unknown>): void {
    if (!this.onData) return;
    const topic = String(raw['topic'] ?? '');
    const data = (raw['data'] as Record<string, unknown>) ?? {};
    const msg = parseDataMessage(topic, data);
    if (msg) {
      this.onData(msg);
    } else {
      this.onData(raw as any);
    }
  }

  private dispatchTrading(raw: Record<string, unknown>): void {
    if (!this.onTrading) return;
    const topic = String(raw['topic'] ?? '');
    const data = (raw['data'] as Record<string, unknown>) ?? {};
    const msg = parseTradingMessage(topic, data);
    if (msg) {
      this.onTrading(msg);
    } else {
      this.onTrading(raw as any);
    }
  }

  private dispatchHeartbeat(raw: Record<string, unknown>): void {
    if (!this.onHeartbeat) return;
    this.onHeartbeat({
      method: String(raw['method'] ?? ''),
      channel: StreamingChannel.HEARTBEAT,
      status: String(raw['status'] ?? ''),
      message: String(raw['message'] ?? ''),
    });
  }
}

// ---------------------------------------------------------------------------
// Message parsers
// ---------------------------------------------------------------------------

function parseDataMessage(
  topic: string,
  data: Record<string, unknown>,
): DataMessage | null {
  if (topic.startsWith(DataTopic.TRADE)) {
    if (Object.values(Timeframe).some((tf) => topic.endsWith(`@${tf}`))) {
      return parseInterval(data);
    }
    return parseTrade(data);
  }
  if (topic.startsWith(DataTopic.QUOTE)) return parseQuote(data);
  if (topic.startsWith(DataTopic.ROOM)) return parseForeignRoom(data);
  if (topic.startsWith(DataTopic.MARKET)) return parseMarketStatus(data);
  if (topic.startsWith(DataTopic.PUT)) return parsePut(data);
  if (topic.startsWith(DataTopic.ODD_LOT)) return parseOddLot(data);
  return null;
}

function parseTradingMessage(
  topic: string,
  data: Record<string, unknown>,
): TradingMessage | null {
  if (topic.startsWith('order.')) return parseOrderStatus(data);
  if (topic.startsWith('portfolio.')) return parsePortfolio(data);
  return null;
}

function parseTrade(r: Record<string, unknown>): TradeMessage {
  return {
    type: 'trade',
    tradingTime: String(r['t'] ?? r['tradingTime'] ?? ''),
    symbol: String(r['s'] ?? r['symbol'] ?? ''),
    price: toFloat(r['p'] ?? r['price']),
    quantity: toInt(r['q'] ?? r['quantity']),
    side: String(r['si'] ?? r['side'] ?? '') || 'U',
    totalVolume: toInt(r['v'] ?? r['totalVolume']),
  };
}

function parseInterval(r: Record<string, unknown>): IntervalMessage {
  return {
    type: 'trade',
    intervalTime: String(r['st'] ?? r['intervalTime'] ?? ''),
    tradingTime: String(r['t'] ?? r['tradingTime'] ?? ''),
    symbol: String(r['s'] ?? r['symbol'] ?? ''),
    open: toFloat(r['o'] ?? r['open']),
    high: toFloat(r['h'] ?? r['high']),
    low: toFloat(r['l'] ?? r['low']),
    close: toFloat(r['c'] ?? r['close']),
    volume: toInt(r['v'] ?? r['volume']),
  };
}

function parseQuote(r: Record<string, unknown>): QuoteMessage {
  const parsePrices = (arr: unknown): number[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => toFloat(item[0]));
  };
  const parseVolumes = (arr: unknown): number[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => toInt(item[1]));
  };
  return {
    type: 'quote',
    tradingTime: String(r['t'] ?? r['tradingTime'] ?? ''),
    symbol: String(r['s'] ?? r['symbol'] ?? ''),
    bidPrices: parsePrices(r['bids']),
    bidVolumes: parseVolumes(r['bids']),
    askPrices: parsePrices(r['asks']),
    askVolumes: parseVolumes(r['asks']),
  };
}

function parseForeignRoom(r: Record<string, unknown>): ForeignRoomMessage {
  return {
    type: 'room',
    tradingTime: String(r['t'] ?? r['tradingTime'] ?? ''),
    symbol: String(r['s'] ?? r['symbol'] ?? ''),
    totalRoom: toInt(r['tr'] ?? r['totalRoom']),
    currentRoom: toInt(r['cr'] ?? r['currentRoom']),
    buyQuantity: toInt(r['bq'] ?? r['buyQuantity']),
    buyValue: toInt(r['bv'] ?? r['buyValue']),
    sellQuantity: toInt(r['sq'] ?? r['sellQuantity']),
    sellValue: toInt(r['sv'] ?? r['sellValue']),
  };
}

function parseMarketStatus(r: Record<string, unknown>): MarketStatusMessage {
  return {
    type: 'market',
    market: String(r['market'] ?? ''),
    status: String(r['status'] ?? ''),
    tradingDate: String(r['tradingDate'] ?? ''),
  };
}

function parsePut(r: Record<string, unknown>): PutMessage {
  return {
    type: 'put',
    tradingTime: String(r['t'] ?? r['tradingTime'] ?? ''),
    symbol: String(r['s'] ?? r['symbol'] ?? ''),
    price: toFloat(r['p'] ?? r['price']),
    quantity: toInt(r['q'] ?? r['quantity']),
    totalQuantity: toInt(r['tq'] ?? r['totalQuantity']),
    totalValue: toInt(r['tv'] ?? r['totalValue']),
  };
}

function parseOddLot(r: Record<string, unknown>): OddLotMessage {
  const parsePrices = (arr: unknown): number[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => toFloat(item[0]));
  };
  const parseVolumes = (arr: unknown): number[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => toInt(item[1]));
  };
  return {
    type: 'oddlot',
    tradingTime: String(r['t'] ?? r['tradingTime'] ?? ''),
    symbol: String(r['s'] ?? r['symbol'] ?? ''),
    price: toFloat(r['p'] ?? r['price']),
    quantity: toInt(r['q'] ?? r['quantity']),
    bidPrices: parsePrices(r['bids']),
    bidVolumes: parseVolumes(r['bids']),
    askPrices: parsePrices(r['asks']),
    askVolumes: parseVolumes(r['asks']),
  };
}

function parseOrderStatus(r: Record<string, unknown>): OrderStatusMessage {
  return {
    type: 'orderEvent',
    accountNo: String(r['accountNo'] ?? ''),
    clientRequestId: String(r['clientRequestId'] ?? ''),
    orderId: String(r['orderId'] ?? ''),
    symbol: String(r['symbol'] ?? ''),
    side: (r['side'] as OrderSide) ?? OrderSide.BUY,
    orderType: (r['orderType'] as OrderType) ?? OrderType.LO,
    price: toFloat(r['price']),
    quantity: toInt(r['quantity']),
    osQuantity: toInt(r['osQty'] ?? r['osQuantity']),
    filledQuantity: toInt(r['filledQty'] ?? r['filledQuantity']),
    cancelQuantity: toInt(r['cancelQty'] ?? r['cancelQuantity']),
    status: (r['orderStatus'] as OrderStatus) ?? (r['status'] as OrderStatus) ?? OrderStatus.PENDING,
    inputTime: String(r['inputTime'] ?? ''),
    modifyTime: String(r['modifyTime'] ?? ''),
    message: String(r['rejectReason'] ?? r['message'] ?? ''),
  };
}

function parsePortfolio(r: Record<string, unknown>): PortfolioMessage {
  return {
    type: 'clientPortfolioEvent',
    accountNo: String(r['accountNo'] ?? ''),
    totalAsset: toFloat(r['totalAsset']),
    cashBalance: toFloat(r['cashBalance']),
    stockValue: toFloat(r['stockValue']),
  };
}

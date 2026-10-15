import { FCOStatus, FCOType } from '../enums/fco.js';
import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import { DataType, StreamingChannel, StreamingMethod, StreamingType } from '../enums/streaming.js';
import { Dict, pick, toEnum, toInt, toNumber, toOptFloat, toPrice } from '../utils/converter.js';
import { withDeprecatedAlias } from '../utils/deprecated.js';
import { parseFcoCommon } from './fco.js';

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Text of a field, "" when absent or falsy (the server sends null for unset ones). */
function text(value: unknown): string {
  return value ? String(value) : '';
}

/** Split `[[price, volume], ...]` into parallel lists, skipping malformed entries (order kept). */
function levels(items: unknown): { prices: number[]; volumes: number[] } {
  const prices: number[] = [];
  const volumes: number[] = [];
  if (!Array.isArray(items)) return { prices, volumes };
  for (const item of items) {
    if (Array.isArray(item) && item.length >= 2) {
      prices.push(toNumber(item[0]));
      volumes.push(toInt(item[1]));
    }
  }
  return { prices, volumes };
}

/** A number, or `undefined` (not 0) when the server omitted the field. */
function optNumber(value: unknown): number | undefined {
  return toOptFloat(value);
}

// ---------------------------------------------------------------------------
// Outbound message
// ---------------------------------------------------------------------------
export interface RequestMessage {
  method: StreamingMethod | string;
  channel: StreamingChannel | string;
  topics: string[];
}

/** The camelCase dict sent over the WebSocket. */
export function requestMessageToDict(message: RequestMessage): Dict {
  return { method: message.method, channel: message.channel, topics: message.topics };
}

// ---------------------------------------------------------------------------
// Inbound messages (DATA channel)
// ---------------------------------------------------------------------------
export interface HeartbeatMessage {
  method: StreamingMethod | string;
  channel: StreamingChannel | string;
  status: string;
  message: string;
}

/** Never throws: a missing key, an unknown method/channel (kept raw) or a non-object all work. */
export function heartbeatMessageFromDict(data: unknown): HeartbeatMessage {
  const d: Dict = isRecord(data) ? data : {};
  return {
    method: (toEnum(StreamingMethod, d.method) as StreamingMethod | string | undefined) ?? '',
    channel: (toEnum(StreamingChannel, d.channel) as StreamingChannel | string | undefined) ?? '',
    status: text(d.status),
    message: text(d.message),
  };
}

export interface TradeMessage {
  type: DataType;
  tradingTime: string;
  symbol: string;
  price: number;
  quantity: number;
  /** "B", "S" or "U" (unknown, the default). */
  side: string;
  totalVolume: number;
  /** `undefined` when the server did not send it. */
  open?: number;
  high?: number;
  low?: number;
  avg?: number;
}

export function tradeMessageFromDict(data: Dict): TradeMessage {
  return {
    type: DataType.TRADE,
    tradingTime: str(data.t),
    symbol: str(data.s),
    price: toNumber(data.p),
    quantity: toInt(data.q),
    side: text(data.si) || 'U',
    totalVolume: toInt(data.v),
    open: optNumber(data.o),
    high: optNumber(data.h),
    low: optNumber(data.l),
    avg: optNumber(data.a),
  };
}

/**
 * Tick of an index itself, from `trade.index.<code>` (the server's `IndexData`).
 *
 * The server sends abbreviations only; the field names follow them but their meaning was
 * inferred from the abbreviation, not confirmed on a live frame. `raw` keeps the original object.
 */
export interface IndexTickMessage {
  type: DataType;
  /** Index code (`s`), e.g. "VN30". */
  symbol: string;
  board: string;
  status: string;
  tradingTime: string;
  value?: number;
  change?: number;
  changePercent?: number;
  advances?: number;
  declines?: number;
  noChange?: number;
  ceilings?: number;
  floors?: number;
  totalMatchValue?: number;
  totalMatchQuantity?: number;
  totalPutValue?: number;
  totalPutQuantity?: number;
  totalQuantity?: number;
  totalValue?: number;
  /** The frame's `data` object, untouched. */
  raw: Dict;
}

export function indexTickMessageFromDict(data: unknown): IndexTickMessage {
  const d: Dict = isRecord(data) ? data : {};
  return {
    type: DataType.TRADE,
    symbol: text(d.s),
    board: text(d.b),
    status: text(d.ss),
    tradingTime: text(d.t),
    value: optNumber(d.v),
    change: optNumber(d.c),
    changePercent: optNumber(d.cr),
    advances: optNumber(d.adv),
    declines: optNumber(d.dec),
    noChange: optNumber(d.nc),
    ceilings: optNumber(d.ce),
    floors: optNumber(d.fl),
    totalMatchValue: optNumber(d.tmv),
    totalMatchQuantity: optNumber(d.tmq),
    totalPutValue: optNumber(d.tvp),
    totalPutQuantity: optNumber(d.tqp),
    totalQuantity: optNumber(d.tq),
    totalValue: optNumber(d.tv),
    raw: { ...d },
  };
}

export interface IntervalMessage {
  type: DataType;
  /** Start time of the candle. */
  intervalTime: string;
  tradingTime: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function intervalMessageFromDict(data: Dict): IntervalMessage {
  return {
    type: DataType.TRADE,
    intervalTime: str(data.st),
    tradingTime: str(data.t),
    symbol: str(data.s),
    open: toNumber(data.o),
    high: toNumber(data.h),
    low: toNumber(data.l),
    close: toNumber(data.c),
    volume: toInt(data.v),
  };
}

export interface QuoteMessage {
  type: DataType;
  tradingTime: string;
  symbol: string;
  /** Best first; parallel to `bidVolumes`. */
  bidPrices: number[];
  bidVolumes: number[];
  askPrices: number[];
  askVolumes: number[];
}

export function quoteMessageFromDict(data: Dict): QuoteMessage {
  const bids = levels(data.bids);
  const asks = levels(data.asks);
  return {
    type: DataType.QUOTE,
    tradingTime: str(data.t),
    symbol: str(data.s),
    bidPrices: bids.prices,
    bidVolumes: bids.volumes,
    askPrices: asks.prices,
    askVolumes: asks.volumes,
  };
}

export interface MarketStatusMessage {
  market: string;
  status: string;
  /** As the server formats it (varies by endpoint; see `parseDate`). */
  tradingDate: string;
}

export function marketStatusMessageFromDict(data: Dict): MarketStatusMessage {
  return { market: str(data.market), status: str(data.status), tradingDate: str(data.tradingDate) };
}

/** Market session flag (ATO, LO, ATC...) on the `market.flag` topic. */
export interface MarketFlagMessage {
  /** HOSE, HNX, UPCOM or DER (derivatives; note: not the enum's DERIVATIVES). */
  board: string;
  tradingTime: string;
  /** Kept raw: the API does not enumerate every session value. */
  flag: string;
}

export function marketFlagMessageFromDict(data: Dict): MarketFlagMessage {
  return { board: str(data.b), tradingTime: str(data.t), flag: str(data.f) };
}

/**
 * Full summary of one index, from `indexsummary.<code>`.
 *
 * The public documentation does not list the fields of this payload, so none are guessed:
 * `index` comes from the topic and `data` keeps what the server sent, untouched.
 */
export interface IndexSummaryMessage {
  /** Index code from the topic, upper-case; "" if unknown. */
  index: string;
  data: Dict;
}

const INDEX_SUMMARY_PREFIX = 'indexsummary.';

export function indexSummaryMessageFromDict(data: unknown, topic = ''): IndexSummaryMessage {
  const code = topic.toLowerCase().startsWith(INDEX_SUMMARY_PREFIX) ? topic.slice(INDEX_SUMMARY_PREFIX.length) : '';
  return { index: code.toUpperCase(), data: isRecord(data) ? { ...data } : {} };
}

/** The first of `keys` present in `message.data` (`defaultValue` if none is). */
export function indexSummaryGet<T = unknown>(
  message: IndexSummaryMessage,
  keys: string[],
  defaultValue?: T,
): T | undefined {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(message.data, key)) return message.data[key] as T;
  }
  return defaultValue;
}

/** Master data (ceiling / floor / reference price) for a symbol, from `market.<symbol>`. */
export interface MarketDataMessage {
  symbol: string;
  board: string;
  tradingTime: string;
  ceiling?: number;
  floor?: number;
  refPrice?: number;
}

export function marketDataMessageFromDict(data: Dict): MarketDataMessage {
  return {
    symbol: str(data.s),
    board: str(data.b),
    tradingTime: str(data.t),
    ceiling: optNumber(data.ce),
    floor: optNumber(data.fl),
    refPrice: optNumber(data.ref),
  };
}

export interface ForeignRoomMessage {
  type: DataType;
  tradingTime: string;
  symbol: string;
  totalRoom: number;
  currentRoom: number;
  buyQuantity: number;
  buyValue: number;
  sellQuantity: number;
  sellValue: number;
}

export function foreignRoomMessageFromDict(data: Dict): ForeignRoomMessage {
  return {
    type: DataType.ROOM,
    tradingTime: str(data.t),
    symbol: str(data.s),
    totalRoom: toInt(data.tr),
    currentRoom: toInt(data.cr),
    buyQuantity: toInt(data.bq),
    buyValue: toInt(data.bv),
    sellQuantity: toInt(data.sq),
    sellValue: toInt(data.sv),
  };
}

export interface PutMessage {
  type: DataType;
  tradingTime: string;
  symbol: string;
  price: number;
  quantity: number;
  totalQuantity: number;
  totalValue: number;
}

export function putMessageFromDict(data: Dict): PutMessage {
  return {
    type: DataType.PUT,
    tradingTime: str(data.t),
    symbol: str(data.s),
    price: toNumber(data.p),
    quantity: toInt(data.q),
    totalQuantity: toInt(data.tq),
    totalValue: toInt(data.tv),
  };
}

export interface OddLotMessage {
  type: DataType;
  tradingTime: string;
  symbol: string;
  price: number;
  quantity: number;
  bidPrices: number[];
  bidVolumes: number[];
  askPrices: number[];
  askVolumes: number[];
}

export function oddLotMessageFromDict(data: Dict): OddLotMessage {
  const bids = levels(data.bids);
  const asks = levels(data.asks);
  return {
    type: DataType.ODD_LOT,
    tradingTime: str(data.t),
    symbol: str(data.s),
    price: toNumber(data.p),
    quantity: toInt(data.q),
    bidPrices: bids.prices,
    bidVolumes: bids.volumes,
    askPrices: asks.prices,
    askVolumes: asks.volumes,
  };
}

// ---------------------------------------------------------------------------
// Inbound messages (TRADING channel)
// ---------------------------------------------------------------------------

/**
 * Real-time order status update (`orderEvent` on `order.<account>`).
 *
 * Prices of ATO/ATC/MP orders are words, so `price` is a number when numeric and the order-type
 * word otherwise. Besides the usual cycle an order can report `PD` (accepted, not yet at the
 * exchange) and `RJ` (rejected by the server itself, with `errorCode`).
 */
export interface OrderStatusMessage {
  type: StreamingType;
  accountNo: string;
  clientRequestId: string;
  orderId: string;
  symbol: string;
  side?: OrderSide | string;
  orderType?: OrderType | string;
  price: number | OrderType | string;
  quantity: number;
  osQuantity: number;
  filledQuantity: number;
  cancelQuantity: number;
  status?: OrderStatus | string;
  /** `yyyy/MM/dd HH:mm:ss`. */
  inputTime: string;
  modifiedTime: string;
  message: string;
  avgPrice: number | OrderType | string;
  rejectReason: string;
  systemRequestId: string;
  errorCode: string;
  errorMessage: string;
  notifyId: string;
  connectionId: string;
  /** @deprecated Use `modifiedTime`. */
  readonly modifyTime: string;
}

export function orderStatusMessageFromDict(data: Dict): OrderStatusMessage {
  const message = {
    type: StreamingType.ORDER,
    accountNo: str(data.accountNo),
    clientRequestId: str(data.clientRequestId),
    orderId: str(data.orderId),
    symbol: str(data.symbol),
    side: toEnum(OrderSide, data.side) as OrderSide | string | undefined,
    orderType: toEnum(OrderType, data.orderType) as OrderType | string | undefined,
    price: toPrice(data.price),
    quantity: toInt(data.quantity),
    osQuantity: toInt(data.osQty),
    filledQuantity: toInt(data.filledQty),
    cancelQuantity: toInt(data.cancelQty),
    status: toEnum(OrderStatus, data.orderStatus) as OrderStatus | string | undefined,
    inputTime: str(data.inputTime),
    modifiedTime: str(pick(data, ['modifiedTime', 'modifyTime'], '')),
    message: text(data.rejectReason),
    avgPrice: toPrice(data.avgPrice),
    rejectReason: text(data.rejectReason),
    systemRequestId: text(data.systemRequestId),
    errorCode: text(data.errorCode),
    errorMessage: text(data.errorMessage),
    notifyId: text(data.notifyId),
    connectionId: text(data.connectionId),
  };
  withDeprecatedAlias(message, 'modifyTime', 'modifiedTime');
  return message as OrderStatusMessage;
}

/** A fill of an order (`orderMatchEvent` on `order.<account>`). */
export interface OrderMatchMessage {
  type: StreamingType;
  notifyId: string;
  connectionId: string;
  clientRequestId: string;
  orderId: string;
  symbol: string;
  side?: OrderSide | string;
  accountNo: string;
  matchPrice: number | OrderType | string;
  matchQty: number;
  /** `yyyy/MM/dd HH:mm:ss`. */
  matchTime: string;
}

export function orderMatchMessageFromDict(data: Dict): OrderMatchMessage {
  return {
    type: StreamingType.ORDER_MATCH,
    notifyId: text(data.notifyId),
    connectionId: text(data.connectionId),
    clientRequestId: text(data.clientRequestId),
    orderId: text(data.orderId),
    symbol: text(data.symbol),
    side: toEnum(OrderSide, data.side) as OrderSide | string | undefined,
    accountNo: text(data.accountNo),
    matchPrice: toPrice(data.matchPrice),
    matchQty: toInt(data.matchQty),
    matchTime: text(data.matchTime),
  };
}

/**
 * Real-time position update (`clientPortfolioEvent`, derivative accounts only).
 *
 * `totalAsset`, `cashBalance` and `stockValue` are deprecated: the server never sends them, so
 * they stay `undefined`.
 */
export interface PortfolioMessage {
  type: StreamingType;
  accountNo: string;
  totalAsset?: number;
  cashBalance?: number;
  stockValue?: number;
  symbol: string;
  longQty: number;
  shortQty: number;
  /** May be negative. */
  net: number;
  bidAvgPrice?: number;
  askAvgPrice?: number;
  tradePrice?: number;
  marketPrice?: number;
  floatingPl?: number;
  tradingPl?: number;
  positionType: string;
}

export function portfolioMessageFromDict(data: Dict): PortfolioMessage {
  return {
    type: StreamingType.PORTFOLIO,
    accountNo: str(data.accountNo),
    totalAsset: toOptFloat(data.totalAsset),
    cashBalance: toOptFloat(data.cashBalance),
    stockValue: toOptFloat(data.stockValue),
    symbol: text(data.symbol),
    longQty: toInt(data.longQty),
    shortQty: toInt(data.shortQty),
    net: toInt(data.net),
    bidAvgPrice: toOptFloat(data.bidAvgPrice),
    askAvgPrice: toOptFloat(data.askAvgPrice),
    tradePrice: toOptFloat(data.tradePrice),
    marketPrice: toOptFloat(data.marketPrice),
    floatingPl: toOptFloat(data.floatingPL),
    tradingPl: toOptFloat(data.tradingPL),
    positionType: text(data.positionType),
  };
}

/** Real-time conditional-order update (`fcoOrderEvent`). */
export interface FCOOrderUpdateMessage {
  fcoId: string;
  processStatus?: FCOStatus | string;
  matchedQuantity: number;
  isPlaceOrder: boolean;
  symbol: string;
  quantity: number;
  price: string;
  accountNo: string;
  updatedTime: string;
  status: string;
  message: string;
  username: string;
  eventType: string;
  type?: FCOType | string;
}

export function fcoOrderUpdateMessageFromDict(data: Dict): FCOOrderUpdateMessage {
  const common = parseFcoCommon(data);
  return {
    fcoId: common.fcoId,
    processStatus: toEnum(FCOStatus, data.processStatus) as FCOStatus | string | undefined,
    matchedQuantity: common.matchedQuantity,
    isPlaceOrder: common.isPlaceOrder,
    symbol: common.symbol,
    quantity: common.quantity,
    price: str(data.price === undefined || data.price === null ? 0 : data.price),
    accountNo: common.accountNo,
    updatedTime: str(data.updatedTime),
    status: str(data.status),
    message: str(data.message),
    username: str(data.username),
    eventType: str(data.eventType),
    type: common.type,
  };
}

// ---------------------------------------------------------------------------
// Union types for typed callbacks
// ---------------------------------------------------------------------------

/**
 * What `onData` receives. A frame whose topic this SDK has no model for arrives as the raw
 * object (see the `isRecord`-style checks in the README).
 */
export type DataMessage =
  | TradeMessage
  | IndexTickMessage
  | IntervalMessage
  | QuoteMessage
  | ForeignRoomMessage
  | MarketFlagMessage
  | IndexSummaryMessage
  | MarketDataMessage
  | MarketStatusMessage
  | PutMessage
  | OddLotMessage
  | Dict;

/** What `onTrading` receives; an unknown event type arrives as the raw object. */
export type TradingMessage =
  | OrderStatusMessage
  | OrderMatchMessage
  | PortfolioMessage
  | FCOOrderUpdateMessage
  | Dict;

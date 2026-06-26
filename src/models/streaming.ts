import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import { StreamingChannel, StreamingMethod } from '../enums/streaming.js';

// ---------------------------------------------------------------------------
// Outbound message
// ---------------------------------------------------------------------------
export interface RequestMessage {
  method: StreamingMethod | string;
  channel: StreamingChannel | string;
  topics: string[];
}

// ---------------------------------------------------------------------------
// Inbound messages (DATA channel)
// ---------------------------------------------------------------------------
export interface HeartbeatMessage {
  method: string;
  channel: StreamingChannel;
  status: string;
  message: string;
}

export interface TradeMessage {
  type: 'trade';
  tradingTime: string;
  symbol: string;
  price: number;
  quantity: number;
  side: string;
  totalVolume: number;
}

export interface IntervalMessage {
  type: 'trade';
  intervalTime: string;
  tradingTime: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteMessage {
  type: 'quote';
  tradingTime: string;
  symbol: string;
  bidPrices: number[];
  bidVolumes: number[];
  askPrices: number[];
  askVolumes: number[];
}

export interface MarketStatusMessage {
  type: 'market';
  market: string;
  status: string;
  tradingDate: string;
}

export interface ForeignRoomMessage {
  type: 'room';
  tradingTime: string;
  symbol: string;
  totalRoom: number;
  currentRoom: number;
  buyQuantity: number;
  buyValue: number;
  sellQuantity: number;
  sellValue: number;
}

export interface PutMessage {
  type: 'put';
  tradingTime: string;
  symbol: string;
  price: number;
  quantity: number;
  totalQuantity: number;
  totalValue: number;
}

export interface OddLotMessage {
  type: 'oddlot';
  tradingTime: string;
  symbol: string;
  price: number;
  quantity: number;
  bidPrices: number[];
  bidVolumes: number[];
  askPrices: number[];
  askVolumes: number[];
}

// ---------------------------------------------------------------------------
// Inbound messages (TRADING channel)
// ---------------------------------------------------------------------------
export interface OrderStatusMessage {
  type: 'orderEvent';
  accountNo: string;
  clientRequestId: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  quantity: number;
  osQuantity: number;
  filledQuantity: number;
  cancelQuantity: number;
  status: OrderStatus;
  inputTime: string;
  modifyTime: string;
  message: string;
}

export interface PortfolioMessage {
  type: 'clientPortfolioEvent';
  accountNo: string;
  totalAsset: number;
  cashBalance: number;
  stockValue: number;
}

// ---------------------------------------------------------------------------
// Union types for typed callbacks
// ---------------------------------------------------------------------------
export type DataMessage =
  | TradeMessage
  | IntervalMessage
  | QuoteMessage
  | ForeignRoomMessage
  | MarketStatusMessage
  | PutMessage
  | OddLotMessage;

export type TradingMessage = OrderStatusMessage | PortfolioMessage;

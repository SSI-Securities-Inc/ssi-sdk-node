import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import { ValidationError } from '../exceptions.js';
import { Dict, formatPrice, fromValue, pick, toInt, toOptInt, toPriceDecimal } from '../utils/converter.js';

/** Order types that carry a real price; every other type is priced by the market. */
const PRICED_ORDER_TYPES: readonly OrderType[] = [OrderType.LO, OrderType.PLO];

/** A price as callers may pass it: a number or a decimal string (sent as a plain decimal string). */
export type PriceLike = number | string;
/**
 * A numeric request field (trigger prices, trailing amounts, slips): a number or a plain decimal
 * string, sent as a JSON number. A string that a JS number cannot hold exactly is refused.
 */
export type NumberLike = PriceLike;

/** Parse an order status, keeping the raw string when this SDK does not know it. */
export function parseStatus(raw: unknown): OrderStatus | string {
  if (raw === null || raw === undefined) return '';
  return fromValue(OrderStatus, raw) ?? String(raw);
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

// ---------------------------------------------------------------------------
// Place order
// ---------------------------------------------------------------------------
export interface PlaceOrderRequest {
  accountNo: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  /** Omit for market-priced types (ATO/ATC/MTL/MP/...); required for LO/PLO. */
  price?: PriceLike | null;
  orderType: OrderType;
  clientRequestId: string;
  deviceId: string;
  userAgent: string;
}

/** Price as a plain decimal string (never exponent notation, never "undefined"). */
export function placeOrderPriceText(price: PriceLike | null | undefined, orderType: OrderType): string {
  const normalized = toPriceDecimal(price);
  if (normalized === undefined) {
    if (PRICED_ORDER_TYPES.includes(orderType)) {
      throw new ValidationError(`price is required for ${orderType} orders`);
    }
    return '0';
  }
  return formatPrice(normalized);
}

/** Build the camelCase API payload. `price` is a string, `quantity` an integer. */
export function placeOrderToPayload(req: PlaceOrderRequest): Dict {
  return {
    accountNo: req.accountNo,
    symbol: req.symbol,
    side: req.side,
    quantity: req.quantity,
    price: placeOrderPriceText(req.price, req.orderType),
    orderType: req.orderType,
    clientRequestId: req.clientRequestId,
    deviceId: req.deviceId,
    userAgent: req.userAgent,
  };
}

export interface PlaceOrderResponse {
  orderId: string;
  clientRequestId: string;
  /** An `OrderStatus`, or the raw string for a value this SDK does not know. */
  status: OrderStatus | string;
}

export function placeOrderResponseFromDict(data: Dict): PlaceOrderResponse {
  return {
    orderId: str(data.orderId),
    clientRequestId: str(data.clientRequestId),
    status: parseStatus(data.orderStatus),
  };
}

// ---------------------------------------------------------------------------
// Modify order
// ---------------------------------------------------------------------------
export interface ModifyOrderRequest {
  accountNo: string;
  clientModifyId: string;
  orderId?: string;
  clientRequestId?: string;
  quantity?: number;
  price?: PriceLike | null;
  deviceId: string;
  userAgent: string;
}

/** Optional fields (orderId, clientRequestId, quantity, price) are included only when set. */
export function modifyOrderToPayload(req: ModifyOrderRequest): Dict {
  const payload: Dict = {
    accountNo: req.accountNo,
    clientModifyId: req.clientModifyId,
    deviceId: req.deviceId,
    userAgent: req.userAgent,
  };
  if (req.orderId !== undefined && req.orderId !== null) payload.orderId = req.orderId;
  if (req.clientRequestId !== undefined && req.clientRequestId !== null) {
    payload.clientRequestId = req.clientRequestId;
  }
  if (req.quantity !== undefined && req.quantity !== null) payload.quantity = req.quantity;
  const price = toPriceDecimal(req.price);
  if (price !== undefined) payload.price = formatPrice(price);
  return payload;
}

export interface ModifyOrderResponse {
  clientModifyId: string;
  orderId: string;
  clientRequestId: string;
  status: OrderStatus | string;
}

export function modifyOrderResponseFromDict(data: Dict): ModifyOrderResponse {
  return {
    clientModifyId: str(data.clientModifyId),
    orderId: str(data.orderId),
    clientRequestId: str(data.clientRequestId),
    status: parseStatus(data.orderStatus),
  };
}

// ---------------------------------------------------------------------------
// Cancel order
// ---------------------------------------------------------------------------
export interface CancelOrderRequest {
  accountNo: string;
  clientCancelId: string;
  orderId?: string;
  clientRequestId?: string;
  deviceId: string;
  userAgent: string;
}

export function cancelOrderToPayload(req: CancelOrderRequest): Dict {
  const payload: Dict = {
    accountNo: req.accountNo,
    clientCancelId: req.clientCancelId,
    deviceId: req.deviceId,
    userAgent: req.userAgent,
  };
  if (req.orderId !== undefined && req.orderId !== null) payload.orderId = req.orderId;
  if (req.clientRequestId !== undefined && req.clientRequestId !== null) {
    payload.clientRequestId = req.clientRequestId;
  }
  return payload;
}

export interface CancelOrderResponse {
  clientCancelId: string;
  orderId: string;
  clientRequestId: string;
  status: OrderStatus | string;
}

export function cancelOrderResponseFromDict(data: Dict): CancelOrderResponse {
  return {
    clientCancelId: str(data.clientCancelId),
    orderId: str(data.orderId),
    clientRequestId: str(data.clientRequestId),
    status: parseStatus(data.orderStatus),
  };
}

// ---------------------------------------------------------------------------
// Max buy/sell
// ---------------------------------------------------------------------------
export interface MaxBuySellRequest {
  accountNo: string;
  symbol: string;
  price?: PriceLike | null;
}

/** The symbol is upper-cased; `price` is sent only when set (as a plain string). */
export function maxBuySellToParams(req: MaxBuySellRequest): Dict {
  const params: Dict = { accountNo: req.accountNo, symbol: req.symbol.toUpperCase() };
  const price = toPriceDecimal(req.price);
  if (price !== undefined) params.price = formatPrice(price);
  return params;
}

/**
 * Max buy/sell quantities. Derivative accounts get only the two quantities: `purchasingPower`
 * and `marginRatio` stay undefined there, which is not the same as 0.
 */
export interface MaxBuySellResponse {
  accountNo: string;
  symbol: string;
  maxBuyQuantity: number;
  maxSellQuantity: number;
  /** Margin ratio as the server's string; undefined on derivative accounts. */
  marginRatio?: string;
  /** Purchasing power; undefined on derivative accounts. */
  purchasingPower?: number;
  /** @deprecated Use `purchasingPower` (string, "" when absent). */
  readonly purchasePower: string;
}

export function maxBuySellResponseFromDict(data: Dict, symbol: string): MaxBuySellResponse {
  const marginRatio = data.marginRatio;
  const purchasingPower = toOptInt(pick(data, ['purchasingPower', 'purchasePower']));
  return {
    accountNo: str(data.accountNo),
    symbol: symbol.toUpperCase(),
    maxBuyQuantity: toInt(data.maxBuyQty),
    maxSellQuantity: toInt(data.maxSellQty),
    marginRatio: marginRatio === null || marginRatio === undefined || marginRatio === '' ? undefined : String(marginRatio),
    purchasingPower,
    purchasePower: purchasingPower === undefined ? '' : String(purchasingPower),
  };
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------
/** Body of POST/DELETE /api/v3/trading/order/batch (and the WebSocket batch params). */
export interface BatchOrderRequest {
  /** Batch id (a reused id is a 409). */
  batchRequestId: string;
  /** Time of the batch request in epoch milliseconds (outside the replay window: 400111). */
  batchRequestTime: number;
  orders: Dict[];
}

export function batchOrderToPayload(req: BatchOrderRequest): Dict {
  return {
    batchRequestId: req.batchRequestId,
    batchRequestTime: req.batchRequestTime,
    orders: req.orders,
  };
}

/** Outcome of one order of a batch. */
export interface BatchOrderResult {
  clientRequestId: string;
  orderId: string;
  status: OrderStatus | string;
  success: boolean;
  errorCode: string;
  errorMessage: string;
  clientCancelId: string;
}

export function batchOrderResultFromDict(data: Dict): BatchOrderResult {
  return {
    clientRequestId: str(data.clientRequestId),
    orderId: str(data.orderId),
    status: parseStatus(data.orderStatus),
    success: Boolean(data.success ?? false),
    errorCode: str(data.errorCode),
    errorMessage: str(data.errorMessage),
    clientCancelId: str(data.clientCancelId),
  };
}

export interface BatchOrderResponse {
  batchRequestId: string;
  /** One result per order, in request order. */
  results: BatchOrderResult[];
}

/** A missing or non-array `results` is an empty list. */
export function batchOrderResponseFromDict(data: unknown): BatchOrderResponse {
  const record: Dict = typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Dict) : {};
  const raw = record.results;
  const items = Array.isArray(raw) ? raw : [];
  return {
    batchRequestId: str(record.batchRequestId),
    results: items
      .filter((item): item is Dict => typeof item === 'object' && item !== null && !Array.isArray(item))
      .map(batchOrderResultFromDict),
  };
}

/** One order of `placeBatchOrders` (the same arguments as `placeOrder`). */
export interface BatchPlaceOrderItem {
  accountNo: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  /** May be omitted for market-priced types (ATO/ATC/MP/...). */
  price?: PriceLike | null;
  orderType: OrderType;
  /** Your idempotency key (<= 20 characters); generated when omitted. */
  clientRequestId?: string;
}

/** One order of `cancelBatchOrders`: `accountNo` plus exactly one of the ids. */
export interface BatchCancelOrderItem {
  accountNo: string;
  orderId?: string;
  clientRequestId?: string;
}

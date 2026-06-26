import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';

// ---------------------------------------------------------------------------
// Place Order
// ---------------------------------------------------------------------------
export interface PlaceOrderRequest {
  accountNo: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  orderType: OrderType;
  clientRequestId: string;
  deviceId?: string;
  userAgent?: string;
}

export interface PlaceOrderResponse {
  orderId: string;
  clientRequestId: string;
  status: OrderStatus;
}

// ---------------------------------------------------------------------------
// Modify Order
// ---------------------------------------------------------------------------
export interface ModifyOrderRequest {
  accountNo: string;
  /** Either `orderId` or `clientRequestId` must be supplied. */
  orderId?: string;
  clientRequestId?: string;
  clientModifyId: string;
  /** Mutually exclusive with `quantity`. */
  price?: number;
  /** Mutually exclusive with `price`. */
  quantity?: number;
  deviceId?: string;
  userAgent?: string;
}

export interface ModifyOrderResponse {
  clientModifyId: string;
  orderId: string;
  clientRequestId: string;
  status: OrderStatus;
}

// ---------------------------------------------------------------------------
// Cancel Order
// ---------------------------------------------------------------------------
export interface CancelOrderRequest {
  accountNo: string;
  /** Either `orderId` or `clientRequestId` must be supplied. */
  orderId?: string;
  clientRequestId?: string;
  clientCancelId: string;
  deviceId?: string;
  userAgent?: string;
}

export interface CancelOrderResponse {
  clientCancelId: string;
  orderId: string;
  clientRequestId: string;
  status: OrderStatus;
}

// ---------------------------------------------------------------------------
// Max Buy/Sell
// ---------------------------------------------------------------------------
export interface MaxBuySellRequest {
  accountNo: string;
  symbol: string;
  price?: number;
}

export interface MaxBuySellResponse {
  accountNo: string;
  symbol: string;
  maxBuyQuantity: number;
  maxSellQuantity: number;
  marginRatio: string;
  purchasePower: string;
}

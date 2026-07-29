import { FCOType, FCOOperator, FCOStatus } from '../enums/fco.js';
import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import { toFloat, toInt } from '../utils/converter.js';
import { VERSION } from '../version.js';

export const DEFAULT_DEVICE_ID = 'A1:B2:C3:D4:E5:F6';
export const DEFAULT_USER_AGENT = `SSI Node SDK/${VERSION}`;

export interface FCOParams {
  stopPrice?: number;
  side?: OrderSide;
  activePrice?: number;
  trailingAmount?: number;
  tpActivePrice?: number;
  slActivePrice?: number;
  tpPrice?: string;
  slPrice?: string;
  tpSlip?: number;
  slSlip?: number;
  operator?: FCOOperator;
}

export interface FCOInfo {
  fcoId: string;
  clientId: string;
  accountNo: string;
  quantity: number;
  price: string;
  priceSlip: string;
  symbol: string;
  type?: FCOType;
  fromDate: string;
  toDate: string;
  matchedQuantity: number;
  isPlaceOrder: boolean;
  status?: FCOStatus;
  detail: string;
  params?: FCOParams;
}

export interface FCOListRequest {
  accountNo: string;
  fcoId?: string;
  type?: FCOType;
  processStatus?: FCOStatus;
  symbol?: string;
  side?: OrderSide;
  fromDate?: string;
  toDate?: string;
  pageIndex?: number;
  pageSize?: number;
}

export interface FCOListResponse {
  pageIndex: number;
  pageSize: number;
  itemsCount: number;
  pagesCount: number;
  fcoList: FCOInfo[];
}

export interface FCOOrderBookRequest {
  fcoId: string;
  pageIndex?: number;
  pageSize?: number;
}

export interface FCOOrder {
  fcoId: string;
  accountNo: string;
  quantity: number;
  price: string;
  symbol: string;
  side?: OrderSide;
  orderType?: OrderType;
  isMainOrder: boolean;
  isAttachedOrder: boolean;
  createdTime: string;
  updatedTime: string;
  uniqueId: string;
  orderId: string;
  matchedQuantity: number;
  osQuantity: number;
  avgPrice: number;
  status?: OrderStatus;
  detail: string;
}

export interface FCOOrderBookResponse {
  pageIndex: number;
  pageSize: number;
  itemsCount: number;
  pagesCount: number;
  orderBook: FCOOrder[];
}

export interface GTDParams {
  accountNo: string;
  symbol?: string;
  side?: OrderSide;
  price?: number | string | OrderType;
  priceSlip?: number;
  quantity?: number;
  fromDate?: string;
  toDate?: string;
  deviceId?: string;
  userAgent?: string;
}

export interface StopParams {
  accountNo: string;
  symbol: string;
  side: OrderSide;
  stopPrice: number;
  operator: FCOOperator;
  quantity: number;
  fromDate?: string;
  toDate?: string;
  price?: number | string | OrderType;
  priceSlip?: number;
  fcoType?: FCOType;
  deviceId?: string;
  userAgent?: string;
}

export interface TrailingStopParams {
  accountNo: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  activePrice: number;
  trailingAmount: number;
  priceSlip?: number;
  fromDate?: string;
  toDate?: string;
  fcoType?: FCOType;
  deviceId?: string;
  userAgent?: string;
}

export interface OCOParams {
  accountNo: string;
  symbol: string;
  quantity: number;
  side: OrderSide;
  tpActivePrice: number;
  slActivePrice: number;
  tpPrice: number | string | OrderType;
  slPrice: number | string | OrderType;
  tpSlip: number;
  slSlip: number;
  fromDate?: string;
  toDate?: string;
  fcoType?: FCOType;
  deviceId?: string;
  userAgent?: string;
}

export interface BullBearParams {
  accountNo: string;
  symbol: string;
  quantity: number;
  side: OrderSide;
  price: number | string | OrderType;
  priceSlip: number;
  tpActivePrice: number;
  slActivePrice: number;
  tpPrice: number | string | OrderType;
  slPrice: number | string | OrderType;
  tpSlip: number;
  slSlip: number;
  fromDate?: string;
  toDate?: string;
  fcoType?: FCOType;
  deviceId?: string;
  userAgent?: string;
}

export interface FCOPlaceResponse {
  fcoId: string;
}

export interface FCOCancelRequest {
  fcoId: string;
}

export interface FCOCancelResponse {
  fcoId: string;
}

// ---------------------------------------------------------------------------
// Serialization Mappers
// ---------------------------------------------------------------------------

export function mapFcoParams(raw: unknown): FCOParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    stopPrice: r['stopPrice'] !== undefined ? toFloat(r['stopPrice']) : undefined,
    side: r['side'] as OrderSide | undefined,
    activePrice: r['activePrice'] !== undefined ? toFloat(r['activePrice']) : undefined,
    trailingAmount: r['trailingAmount'] !== undefined ? toFloat(r['trailingAmount']) : undefined,
    tpActivePrice: r['tpActivePrice'] !== undefined ? toFloat(r['tpActivePrice']) : undefined,
    slActivePrice: r['slActivePrice'] !== undefined ? toFloat(r['slActivePrice']) : undefined,
    tpPrice: r['tpPrice'] !== undefined ? String(r['tpPrice']) : undefined,
    slPrice: r['slPrice'] !== undefined ? String(r['slPrice']) : undefined,
    tpSlip: r['tpSlip'] !== undefined ? toFloat(r['tpSlip']) : undefined,
    slSlip: r['slSlip'] !== undefined ? toFloat(r['slSlip']) : undefined,
    operator: r['operator'] as FCOOperator | undefined,
  };
}

export function mapFcoInfo(raw: unknown): FCOInfo {
  const r = raw as Record<string, unknown>;
  const paramsRaw = r['params'] ?? r['fcoParams'] ?? r['fco_params'];
  return {
    fcoId: String(r['fcoId'] ?? ''),
    clientId: String(r['username'] ?? ''),
    accountNo: String(r['accountNo'] ?? ''),
    quantity: toInt(r['quantity']),
    price: String(r['price'] ?? ''),
    priceSlip: String(r['priceSlip'] ?? ''),
    symbol: String(r['symbol'] ?? ''),
    type: r['type'] as FCOType | undefined,
    fromDate: String(r['from'] ?? ''),
    toDate: String(r['to'] ?? ''),
    matchedQuantity: toInt(r['matchedQuantity']),
    isPlaceOrder: Boolean(r['isPlaceOrder'] ?? false),
    status: r['status'] as FCOStatus | undefined,
    detail: String(r['detail'] ?? ''),
    params: mapFcoParams(paramsRaw),
  };
}

export function mapFcoListResponse(raw: unknown): FCOListResponse {
  if (Array.isArray(raw)) {
    return {
      pageIndex: 1,
      pageSize: 10,
      itemsCount: raw.length,
      pagesCount: 1,
      fcoList: raw.map(mapFcoInfo),
    };
  }
  const r = (raw as Record<string, unknown>) ?? {};
  const listRaw = (r['data'] ?? r['fcoList'] ?? r['fco_list'] ?? []) as unknown[];
  return {
    pageIndex: toInt(r['pageIndex'] ?? 1),
    pageSize: toInt(r['pageSize'] ?? 10),
    itemsCount: toInt(r['itemsCount'] ?? 0),
    pagesCount: toInt(r['pagesCount'] ?? 0),
    fcoList: Array.isArray(listRaw) ? listRaw.map(mapFcoInfo) : [],
  };
}

export function mapFcoOrder(raw: unknown): FCOOrder {
  const r = raw as Record<string, unknown>;
  return {
    fcoId: String(r['fcoId'] ?? ''),
    accountNo: String(r['accountNo'] ?? ''),
    quantity: toFloat(r['quantity']),
    price: String(r['price'] ?? ''),
    symbol: String(r['symbol'] ?? ''),
    side: r['side'] as OrderSide | undefined,
    orderType: r['orderType'] as OrderType | undefined,
    isMainOrder: Boolean(r['isMainOrder'] ?? false),
    isAttachedOrder: Boolean(r['isAttachedOrder'] ?? false),
    createdTime: String(r['createdTime'] ?? ''),
    updatedTime: String(r['updatedTime'] ?? ''),
    uniqueId: String(r['uniqueId'] ?? ''),
    orderId: String(r['orderId'] ?? ''),
    matchedQuantity: toFloat(r['matchedQuantity']),
    osQuantity: toFloat(r['osQuantity']),
    avgPrice: toFloat(r['avgPrice']),
    status: r['status'] as OrderStatus | undefined,
    detail: String(r['detail'] ?? ''),
  };
}

export function mapFcoOrderBookResponse(raw: unknown): FCOOrderBookResponse {
  if (Array.isArray(raw)) {
    return {
      pageIndex: 1,
      pageSize: 10,
      itemsCount: raw.length,
      pagesCount: 1,
      orderBook: raw.map(mapFcoOrder),
    };
  }
  const r = (raw as Record<string, unknown>) ?? {};
  const listRaw = (r['data'] ?? r['orderBook'] ?? r['order_book'] ?? []) as unknown[];
  return {
    pageIndex: toInt(r['pageIndex'] ?? 1),
    pageSize: toInt(r['pageSize'] ?? 10),
    itemsCount: toInt(r['itemsCount'] ?? 0),
    pagesCount: toInt(r['pagesCount'] ?? 0),
    orderBook: Array.isArray(listRaw) ? listRaw.map(mapFcoOrder) : [],
  };
}

export function mapFcoPlaceResponse(raw: unknown): FCOPlaceResponse {
  const r = (raw as Record<string, unknown>) ?? {};
  const data = (r['data'] as Record<string, unknown>) ?? r;
  return {
    fcoId: String(data['fcoId'] ?? ''),
  };
}

export function mapFcoCancelResponse(raw: unknown): FCOCancelResponse {
  const r = (raw as Record<string, unknown>) ?? {};
  const data = (r['data'] as Record<string, unknown>) ?? r;
  return {
    fcoId: String(data['fcoId'] ?? ''),
  };
}

export function buildGtdPayload(p: GTDParams): Record<string, unknown> {
  let priceStr = '';
  let priceSlip = p.priceSlip ?? 0;
  if (typeof p.price === 'number') {
    priceStr = String(p.price);
  } else if (typeof p.price === 'string') {
    priceStr = p.price;
  } else if (p.price && typeof p.price === 'object' && 'value' in p.price) {
    priceStr = String((p.price as any).value);
    priceSlip = 0;
  } else if (p.price !== undefined) {
    priceStr = String(p.price);
  }
  return {
    accountNo: p.accountNo,
    type: FCOType.GTD,
    symbol: p.symbol,
    side: p.side,
    price: priceStr,
    priceSlip,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    deviceId: p.deviceId ?? DEFAULT_DEVICE_ID,
    userAgent: p.userAgent ?? DEFAULT_USER_AGENT,
  };
}

export function buildStopPayload(p: StopParams): Record<string, unknown> {
  const fcoType = p.fcoType ?? FCOType.STOP;
  let priceStr = '';
  let priceSlip = p.priceSlip ?? 0;
  if (fcoType === FCOType.STOP) {
    priceStr = OrderType.MTL;
    priceSlip = 0;
  } else {
    priceStr = String(p.price ?? 0);
  }
  return {
    accountNo: p.accountNo,
    type: fcoType,
    symbol: p.symbol,
    side: p.side,
    price: priceStr,
    priceSlip,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    stopPrice: p.stopPrice,
    operator: p.operator,
    deviceId: p.deviceId ?? DEFAULT_DEVICE_ID,
    userAgent: p.userAgent ?? DEFAULT_USER_AGENT,
  };
}

export function buildTrailingStopPayload(p: TrailingStopParams): Record<string, unknown> {
  const fcoType = p.fcoType ?? FCOType.TRAILING_STOP;
  const payload: Record<string, unknown> = {
    accountNo: p.accountNo,
    type: fcoType,
    symbol: p.symbol,
    side: p.side,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    activePrice: p.activePrice,
    trailingAmount: p.trailingAmount,
    deviceId: p.deviceId ?? DEFAULT_DEVICE_ID,
    userAgent: p.userAgent ?? DEFAULT_USER_AGENT,
  };
  if (fcoType === FCOType.TRAILING_STOP) {
    payload['price'] = OrderType.MTL;
    payload['priceSlip'] = 0;
  } else {
    payload['priceSlip'] = p.priceSlip ?? 0;
  }
  return payload;
}

export function buildOcoPayload(p: OCOParams): Record<string, unknown> {
  const tpPriceStr = typeof p.tpPrice === 'number' ? String(p.tpPrice) : String(p.tpPrice);
  const slPriceStr = typeof p.slPrice === 'number' ? String(p.slPrice) : String(p.slPrice);

  return {
    accountNo: p.accountNo,
    type: p.fcoType ?? FCOType.OCO,
    symbol: p.symbol,
    side: p.side,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    tpActivePrice: p.tpActivePrice,
    slActivePrice: p.slActivePrice,
    tpPrice: tpPriceStr,
    slPrice: slPriceStr,
    tpSlip: p.tpSlip,
    slSlip: p.slSlip,
    deviceId: p.deviceId ?? DEFAULT_DEVICE_ID,
    userAgent: p.userAgent ?? DEFAULT_USER_AGENT,
    price: 'MP',
    priceSlip: 0,
    stopPrice: 0,
    activePrice: 0,
    trailingAmount: 0,
    operator: '',
    code: '',
  };
}

export function buildBullBearPayload(p: BullBearParams): Record<string, unknown> {
  const priceStr = typeof p.price === 'number' ? String(p.price) : String(p.price);
  const tpPriceStr = typeof p.tpPrice === 'number' ? String(p.tpPrice) : String(p.tpPrice);
  const slPriceStr = typeof p.slPrice === 'number' ? String(p.slPrice) : String(p.slPrice);

  return {
    accountNo: p.accountNo,
    type: p.fcoType ?? FCOType.BULL_BEAR,
    symbol: p.symbol,
    side: p.side,
    quantity: p.quantity,
    price: priceStr,
    priceSlip: p.priceSlip,
    from: p.fromDate,
    to: p.toDate,
    tpActivePrice: p.tpActivePrice,
    slActivePrice: p.slActivePrice,
    tpPrice: tpPriceStr,
    slPrice: slPriceStr,
    tpSlip: p.tpSlip,
    slSlip: p.slSlip,
    deviceId: p.deviceId ?? DEFAULT_DEVICE_ID,
    userAgent: p.userAgent ?? DEFAULT_USER_AGENT,
  };
}


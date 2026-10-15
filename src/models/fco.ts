import {
  FCOOperator,
  FCOOperatorLike,
  FCOStatus,
  FCOStatusLike,
  FCOType,
  FCOTypeLike,
} from '../enums/fco.js';
import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import {
  Dict,
  formatPrice,
  fromValue,
  isNoContent,
  pick,
  toEnum,
  toInt,
  toNumber,
  toJsonNumber,
  toOptFloat,
} from '../utils/converter.js';
import type { NumberLike, PriceLike } from './trading.js';

/** The server's responses encode the trigger operator as a number; requests use the name. */
const OPERATOR_BY_NUMBER: Record<number, FCOOperator> = {
  0: FCOOperator.GREATER_OR_EQUAL,
  1: FCOOperator.EQUAL,
  2: FCOOperator.GREATER,
  3: FCOOperator.LESSER,
  4: FCOOperator.LESSER_OR_EQUAL,
};

function str(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse an operator given as a name or as the server's number 0..4 (raw if unknown). */
export function parseOperator(raw: unknown): FCOOperator | string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'boolean') {
    const text = String(raw).trim();
    if (/^\d+$/.test(text)) {
      const mapped = OPERATOR_BY_NUMBER[Number(text)];
      if (mapped !== undefined) return mapped;
    }
  }
  return toEnum(FCOOperator, raw) as FCOOperator | string | undefined;
}

export interface FCOCommon {
  fcoId: string;
  accountNo: string;
  symbol: string;
  quantity: number;
  matchedQuantity: number;
  isPlaceOrder: boolean;
  type?: FCOType | string;
}

/**
 * Fields every FCO payload carries (REST list/order book and stream events alike).
 *
 * One parser, so the REST models and the stream message cannot drift apart. camelCase is read
 * first; the spec's casing is a fallback (server DTOs are camelCase).
 */
export function parseFcoCommon(data: Dict): FCOCommon {
  return {
    fcoId: str(pick(data, ['fcoId', 'FcoId'], '')),
    accountNo: str(pick(data, ['accountNo', 'AccountNo'], '')),
    symbol: str(pick(data, ['symbol', 'Symbol'], '')),
    quantity: toInt(pick(data, ['quantity', 'Quantity'])),
    matchedQuantity: toInt(pick(data, ['matchedQuantity', 'matchedQuality'])),
    isPlaceOrder: Boolean(pick(data, ['isPlaceOrder', 'IsPlaceOrder'], false)),
    type: toEnum(FCOType, data.type) as FCOType | string | undefined,
  };
}

const MARKET_WORDS: ReadonlySet<string> = new Set(['ATO', 'ATC', 'MTL', 'MP', 'MOK', 'MAK']);

/** Price text and slip for an FCO price that may be a number or an order-type word. */
export function priceAndSlip(price: unknown, slip: unknown): [string, number] {
  if (typeof price === 'string') {
    const word = price.trim().toUpperCase();
    // A market word (ATO/ATC/MTL/MP/MOK/MAK, any case) has no slip; LO/PLO and numbers keep it.
    if (MARKET_WORDS.has(word)) return [price, 0];
    if (fromValue(OrderType, word) !== undefined) return [price, toJsonNumber(slip, 'priceSlip')];
    return [formatPrice(price), toJsonNumber(slip, 'priceSlip')];
  }
  if (typeof price === 'number' || typeof price === 'bigint') {
    return [formatPrice(price), toJsonNumber(slip, 'priceSlip')];
  }
  return [price === null || price === undefined ? '' : String(price), 0];
}

/** Price text for a take-profit/stop-loss leg (number formatted plainly, or the word). */
export function legPriceText(price: unknown): string {
  return priceAndSlip(price, 0)[0];
}

// ---------------------------------------------------------------------------
// List / order book
// ---------------------------------------------------------------------------
export interface FCOListRequest {
  accountNo: string;
  fcoId?: string;
  type?: FCOTypeLike | string;
  /** One status or several (sent as a repeated `processStatus` query key). */
  processStatus?: FCOStatusLike | string | Array<FCOStatusLike | string>;
  symbol?: string;
  side?: OrderSide | string;
  fromDate?: string;
  toDate?: string;
  pageIndex?: number;
  pageSize?: number;
  extraParams?: Dict;
}

function enumText(enumObj: Record<string, string | number>, value: unknown): unknown {
  const found = fromValue(enumObj, value);
  return found === undefined ? value : found;
}

export function fcoListRequestToParams(req: FCOListRequest): Dict {
  const params: Dict = { accountNo: req.accountNo };
  if (req.fcoId !== undefined) params.fcoId = req.fcoId;
  if (req.type !== undefined) params.type = enumText(FCOType, req.type);
  if (req.processStatus !== undefined) {
    params.processStatus = Array.isArray(req.processStatus)
      ? req.processStatus.map((item) => enumText(FCOStatus, item))
      : enumText(FCOStatus, req.processStatus);
  }
  if (req.symbol !== undefined) params.symbol = req.symbol;
  if (req.side !== undefined) params.side = enumText(OrderSide, req.side);
  if (req.fromDate !== undefined) params.from = req.fromDate;
  if (req.toDate !== undefined) params.to = req.toDate;
  if (req.pageIndex !== undefined) params.pageIndex = req.pageIndex;
  if (req.pageSize !== undefined) params.pageSize = req.pageSize;
  if (req.extraParams) Object.assign(params, req.extraParams);
  return params;
}

/** Detailed trigger parameters of an FCO order. */
export interface FCOParams {
  stopPrice?: number;
  side?: OrderSide | string;
  activePrice?: number;
  trailingAmount?: number;
  tpActivePrice?: number;
  slActivePrice?: number;
  tpPrice?: string;
  slPrice?: string;
  tpSlip?: number;
  slSlip?: number;
  operator?: FCOOperator | string;
}

function optNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : toNumber(value);
}

export function fcoParamsFromDict(data: Dict | null | undefined): FCOParams | undefined {
  if (!data || !isRecord(data) || Object.keys(data).length === 0) return undefined;
  return {
    stopPrice: optNumber(data.stopPrice),
    side:
      data.side === null || data.side === undefined
        ? undefined
        : ((fromValue(OrderSide, data.side) ?? String(data.side)) as OrderSide | string),
    activePrice: optNumber(data.activePrice),
    trailingAmount: optNumber(data.trailingAmount),
    tpActivePrice: optNumber(data.tpActivePrice),
    slActivePrice: optNumber(data.slActivePrice),
    tpPrice: data.tpPrice === null || data.tpPrice === undefined ? undefined : String(data.tpPrice),
    slPrice: data.slPrice === null || data.slPrice === undefined ? undefined : String(data.slPrice),
    tpSlip: optNumber(data.tpSlip),
    slSlip: optNumber(data.slSlip),
    operator: parseOperator(pick(data, ['operator', 'price_operator'])),
  };
}

/** Only the set (non-undefined, non-empty) values. A legitimate 0 is kept. */
export function fcoParamsToDict(params: FCOParams): Dict {
  const out: Dict = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

/** A conditional order item in the FCO list. */
export interface FCOInfo {
  fcoId: string;
  clientId: string;
  accountNo: string;
  quantity: number;
  /** Price text, or a word such as "MP" for market-priced orders. */
  price: string;
  priceSlip?: number;
  symbol: string;
  type?: FCOType | string;
  fromDate: string;
  toDate: string;
  matchedQuantity: number;
  /** Whether the conditional order has already placed its order. */
  isPlaceOrder: boolean;
  status?: FCOStatus | string;
  detail: string;
  params?: FCOParams;
  orderType?: OrderType | string;
}

export function fcoInfoFromDict(data: Dict): FCOInfo {
  const paramsRaw = pick<unknown>(data, ['params', 'fco_params', 'fcoParams']);
  const common = parseFcoCommon(data);
  return {
    fcoId: common.fcoId,
    clientId: str(pick(data, ['username', 'Username'], '')),
    accountNo: common.accountNo,
    quantity: common.quantity,
    price: str(data.price),
    priceSlip: toOptFloat(data.priceSlip),
    symbol: common.symbol,
    type: common.type,
    fromDate: str(data.from),
    toDate: str(data.to),
    matchedQuantity: common.matchedQuantity,
    isPlaceOrder: common.isPlaceOrder,
    status: toEnum(FCOStatus, data.status) as FCOStatus | string | undefined,
    detail: str(data.detail),
    params: isRecord(paramsRaw) ? fcoParamsFromDict(paramsRaw) : undefined,
    orderType: toEnum(OrderType, data.orderType) as OrderType | string | undefined,
  };
}

export interface FCOListResponse {
  pageIndex: number;
  pageSize: number;
  itemsCount: number;
  /** Total pages as the server computes it (can miss the last partial page). */
  pagesCount: number;
  fcoList: FCOInfo[];
}

function asRows(value: unknown): Dict[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function fcoListResponseFromDict(data: unknown): FCOListResponse {
  let rows: unknown;
  let meta: Dict = {};
  if (Array.isArray(data)) {
    rows = data;
  } else {
    meta = isNoContent(data) || !isRecord(data) ? {} : data;
    rows = pick(meta, ['data', 'fcoList', 'fco_list']) ?? [];
  }
  return {
    pageIndex: toInt(meta.pageIndex, 1),
    pageSize: toInt(meta.pageSize, 10),
    itemsCount: toInt(meta.itemsCount, 0),
    pagesCount: toInt(pick(meta, ['pagesCount', 'pageCount']), 0),
    fcoList: asRows(rows).map(fcoInfoFromDict),
  };
}

export interface FCOOrderBookRequest {
  fcoId: string;
  pageIndex?: number;
  pageSize?: number;
}

export function fcoOrderBookRequestToParams(req: FCOOrderBookRequest): Dict {
  const params: Dict = { fcoId: req.fcoId };
  if (req.pageIndex !== undefined) params.pageIndex = req.pageIndex;
  if (req.pageSize !== undefined) params.pageSize = req.pageSize;
  return params;
}

/** An entry in the FCO order book / execution log. */
export interface FCOOrder {
  fcoId: string;
  accountNo: string;
  quantity: number;
  price: string;
  symbol: string;
  side?: OrderSide | string;
  orderType?: OrderType | string;
  isMainOrder: boolean;
  isAttachedOrder: boolean;
  createdTime: string;
  updatedTime: string;
  uniqueId: string;
  orderId: string;
  matchedQuantity: number;
  osQuantity: number;
  avgPrice: number;
  status?: OrderStatus | string;
  detail: string;
  type?: FCOType | string;
}

export function fcoOrderFromDict(data: Dict): FCOOrder {
  const common = parseFcoCommon(data);
  return {
    fcoId: common.fcoId,
    accountNo: common.accountNo,
    quantity: common.quantity,
    price: str(data.price),
    symbol: common.symbol,
    side: toEnum(OrderSide, data.side) as OrderSide | string | undefined,
    orderType: toEnum(OrderType, data.orderType) as OrderType | string | undefined,
    isMainOrder: Boolean(pick(data, ['isMainOrder', 'IsMainOrder'], false)),
    isAttachedOrder: Boolean(data.isAttachedOrder ?? false),
    createdTime: str(data.createdTime),
    updatedTime: str(data.updatedTime),
    uniqueId: str(pick(data, ['uniqueId', 'uniquedId', 'UniqueId'], '')),
    orderId: str(data.orderId),
    matchedQuantity: common.matchedQuantity,
    osQuantity: toInt(data.osQuantity),
    avgPrice: toNumber(data.avgPrice, 0),
    status: toEnum(OrderStatus, data.status) as OrderStatus | string | undefined,
    detail: str(data.detail),
    type: common.type,
  };
}

export interface FCOOrderBookResponse {
  pageIndex: number;
  pageSize: number;
  itemsCount: number;
  /** The last partial page can be missing: page until a page comes back empty. */
  pagesCount: number;
  orderBook: FCOOrder[];
}

export function fcoOrderBookResponseFromDict(data: unknown): FCOOrderBookResponse {
  let rows: unknown;
  let meta: Dict = {};
  if (Array.isArray(data)) {
    rows = data;
  } else {
    meta = isNoContent(data) || !isRecord(data) ? {} : data;
    rows = pick(meta, ['data', 'orderBook', 'order_book']) ?? [];
  }
  return {
    pageIndex: toInt(meta.pageIndex, 1),
    pageSize: toInt(meta.pageSize, 10),
    itemsCount: toInt(meta.itemsCount, 0),
    pagesCount: toInt(pick(meta, ['pagesCount', 'pageCount']), 0),
    orderBook: asRows(rows).map(fcoOrderFromDict),
  };
}

// ---------------------------------------------------------------------------
// Place payloads. Numeric trigger fields go out as JSON numbers; prices as plain strings.
// ---------------------------------------------------------------------------
interface FCOCommonParams {
  accountNo: string;
  fromDate?: string;
  toDate?: string;
  deviceId?: string;
  userAgent?: string;
  /** One-time code (OTP) when the account requires it for the command; omitted if empty. */
  code?: string;
}

export interface GTDParams extends FCOCommonParams {
  symbol?: string;
  side?: OrderSide;
  price?: PriceLike | OrderType;
  priceSlip?: NumberLike;
  quantity?: number;
}

export interface StopParams extends FCOCommonParams {
  symbol: string;
  side: OrderSide;
  stopPrice: NumberLike;
  operator: FCOOperatorLike;
  quantity: number;
  price?: PriceLike | OrderType;
  priceSlip?: NumberLike;
  fcoType?: FCOType;
}

export interface TrailingStopParams extends FCOCommonParams {
  symbol: string;
  side: OrderSide;
  quantity: number;
  activePrice: NumberLike;
  trailingAmount: NumberLike;
  priceSlip?: NumberLike;
  fcoType?: FCOType;
}

export interface OCOParams extends FCOCommonParams {
  symbol: string;
  quantity: number;
  side: OrderSide;
  tpActivePrice: NumberLike;
  slActivePrice: NumberLike;
  tpPrice: PriceLike | OrderType;
  slPrice: PriceLike | OrderType;
  tpSlip: NumberLike;
  slSlip: NumberLike;
  fcoType?: FCOType;
}

export interface BullBearParams extends FCOCommonParams {
  symbol: string;
  quantity: number;
  side: OrderSide;
  price: PriceLike | OrderType;
  priceSlip: NumberLike;
  tpActivePrice: NumberLike;
  slActivePrice: NumberLike;
  tpPrice: PriceLike | OrderType;
  slPrice: PriceLike | OrderType;
  tpSlip: NumberLike;
  slSlip: NumberLike;
  fcoType?: FCOType;
}

export function gtdToPayload(p: GTDParams): Dict {
  const [price, priceSlip] = priceAndSlip(p.price, p.priceSlip ?? 0);
  const payload: Dict = {
    accountNo: p.accountNo,
    type: FCOType.GTD,
    symbol: p.symbol,
    side: p.side,
    price,
    priceSlip,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    deviceId: p.deviceId ?? '',
    userAgent: p.userAgent ?? '',
  };
  if (p.code) payload.code = p.code;
  return payload;
}

export function stopToPayload(p: StopParams): Dict {
  const fcoType = p.fcoType ?? FCOType.STOP;
  let price: string;
  let priceSlip: number;
  if (fcoType === FCOType.STOP) {
    price = OrderType.MTL;
    priceSlip = 0;
  } else {
    price = legPriceText(p.price ?? 0);
    priceSlip = toJsonNumber(p.priceSlip ?? 0, 'priceSlip');
  }
  const payload: Dict = {
    accountNo: p.accountNo,
    type: fcoType,
    symbol: p.symbol,
    side: p.side,
    price,
    priceSlip,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    stopPrice: toJsonNumber(p.stopPrice, 'stopPrice'),
    operator: p.operator,
    deviceId: p.deviceId ?? '',
    userAgent: p.userAgent ?? '',
  };
  if (p.code) payload.code = p.code;
  return payload;
}

export function trailingStopToPayload(p: TrailingStopParams): Dict {
  const fcoType = p.fcoType ?? FCOType.TRAILING_STOP;
  const payload: Dict = {
    accountNo: p.accountNo,
    type: fcoType,
    symbol: p.symbol,
    side: p.side,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    activePrice: toJsonNumber(p.activePrice, 'activePrice'),
    trailingAmount: toJsonNumber(p.trailingAmount, 'trailingAmount'),
    userAgent: p.userAgent ?? '',
    deviceId: p.deviceId ?? '',
  };
  if (fcoType === FCOType.TRAILING_STOP) {
    payload.price = OrderType.MTL;
    payload.priceSlip = 0;
  } else {
    payload.priceSlip = toJsonNumber(p.priceSlip ?? 0, 'priceSlip');
  }
  if (p.code) payload.code = p.code;
  return payload;
}

export function ocoToPayload(p: OCOParams): Dict {
  return {
    accountNo: p.accountNo,
    type: p.fcoType ?? FCOType.OCO,
    symbol: p.symbol,
    side: p.side,
    quantity: p.quantity,
    from: p.fromDate,
    to: p.toDate,
    tpActivePrice: toJsonNumber(p.tpActivePrice, 'tpActivePrice'),
    slActivePrice: toJsonNumber(p.slActivePrice, 'slActivePrice'),
    tpPrice: legPriceText(p.tpPrice),
    slPrice: legPriceText(p.slPrice),
    tpSlip: toJsonNumber(p.tpSlip, 'tpSlip'),
    slSlip: toJsonNumber(p.slSlip, 'slSlip'),
    userAgent: p.userAgent ?? '',
    deviceId: p.deviceId ?? '',
    // Fixed fields the server expects on an OCO order.
    price: 'MP',
    priceSlip: 0,
    stopPrice: 0,
    activePrice: 0,
    trailingAmount: 0,
    operator: '',
    code: p.code ?? '',
  };
}

export function bullBearToPayload(p: BullBearParams): Dict {
  const [price, priceSlip] = priceAndSlip(p.price, p.priceSlip);
  const [tpPrice, tpSlip] = priceAndSlip(p.tpPrice, p.tpSlip);
  const [slPrice, slSlip] = priceAndSlip(p.slPrice, p.slSlip);
  const payload: Dict = {
    accountNo: p.accountNo,
    type: p.fcoType ?? FCOType.BULL_BEAR,
    symbol: p.symbol,
    side: p.side,
    quantity: p.quantity,
    price,
    priceSlip,
    from: p.fromDate,
    to: p.toDate,
    tpActivePrice: toJsonNumber(p.tpActivePrice, 'tpActivePrice'),
    slActivePrice: toJsonNumber(p.slActivePrice, 'slActivePrice'),
    tpPrice,
    slPrice,
    tpSlip,
    slSlip,
    userAgent: p.userAgent ?? '',
    deviceId: p.deviceId ?? '',
  };
  if (p.code) payload.code = p.code;
  return payload;
}

export interface FCOPlaceResponse {
  fcoId: string;
}

export function fcoPlaceResponseFromDict(data: Dict): FCOPlaceResponse {
  return { fcoId: str(data.fcoId) };
}

/** `deviceId` is required by the server; the server records its own IP, so no ipAddress. */
export interface FCOCancelRequest {
  fcoId: string;
  deviceId: string;
  userAgent?: string;
  code?: string;
}

export function fcoCancelToPayload(req: FCOCancelRequest): Dict {
  const payload: Dict = { fcoId: req.fcoId, deviceId: req.deviceId };
  if (req.userAgent) payload.userAgent = req.userAgent;
  if (req.code) payload.code = req.code;
  return payload;
}

export interface FCOCancelResponse {
  fcoId: string;
}

export function fcoCancelResponseFromDict(data: Dict): FCOCancelResponse {
  return { fcoId: str(data.fcoId) };
}

// ---------------------------------------------------------------------------
// Status history
// ---------------------------------------------------------------------------
export interface FCOStatusHistoryRequest {
  fcoId: string;
}

/** The server binds `fcoid` case-insensitively. */
export function fcoStatusHistoryToParams(req: FCOStatusHistoryRequest): Dict {
  return { fcoid: req.fcoId };
}

/** One status transition of an FCO. */
export interface FCOStatusHistoryItem {
  state: string;
  time: string;
  code?: string;
  detail: string;
}

export function fcoStatusHistoryItemFromDict(data: Dict): FCOStatusHistoryItem {
  const code = data.code;
  return {
    state: str(data.state),
    time: str(data.time),
    code: code === null || code === undefined || code === '' ? undefined : String(code),
    detail: str(data.detail),
  };
}

/** Parse the `statusHistory` response: `{"data": [...]}`, a bare list, or the 204 marker. */
export function fcoStatusHistoryFromResponse(data: unknown): FCOStatusHistoryItem[] {
  let rows: unknown = data;
  if (isRecord(data)) {
    if (isNoContent(data)) return [];
    rows = data.data ?? [];
  }
  return asRows(rows).map(fcoStatusHistoryItemFromDict);
}

// Names from 3.2.x, kept as thin aliases of the renamed helpers.

/** @deprecated use `fcoParamsFromDict`. */
export const mapFcoParams = (raw: unknown): FCOParams | undefined => fcoParamsFromDict(isRecord(raw) ? raw : null);
/** @deprecated use `fcoInfoFromDict`. */
export const mapFcoInfo = (raw: unknown): FCOInfo => fcoInfoFromDict(isRecord(raw) ? raw : {});
/** @deprecated use `fcoListResponseFromDict`. */
export const mapFcoListResponse = (raw: unknown): FCOListResponse => fcoListResponseFromDict(raw);
/** @deprecated use `fcoOrderFromDict`. */
export const mapFcoOrder = (raw: unknown): FCOOrder => fcoOrderFromDict(isRecord(raw) ? raw : {});
/** @deprecated use `fcoOrderBookResponseFromDict`. */
export const mapFcoOrderBookResponse = (raw: unknown): FCOOrderBookResponse => fcoOrderBookResponseFromDict(raw);
/** @deprecated use `fcoPlaceResponseFromDict`. */
export const mapFcoPlaceResponse = (raw: unknown): FCOPlaceResponse =>
  fcoPlaceResponseFromDict(isRecord(raw) ? raw : {});
/** @deprecated use `fcoCancelResponseFromDict`. */
export const mapFcoCancelResponse = (raw: unknown): FCOCancelResponse =>
  fcoCancelResponseFromDict(isRecord(raw) ? raw : {});
/** @deprecated use `gtdToPayload`. */
export const buildGtdPayload = gtdToPayload;
/** @deprecated use `stopToPayload`. */
export const buildStopPayload = stopToPayload;
/** @deprecated use `trailingStopToPayload`. */
export const buildTrailingStopPayload = trailingStopToPayload;
/** @deprecated use `ocoToPayload`. */
export const buildOcoPayload = ocoToPayload;
/** @deprecated use `bullBearToPayload`. */
export const buildBullBearPayload = bullBearToPayload;

import { RestClient } from '../transport/restClient.js';
import {
  EP_TRADING_FCO_LIST,
  EP_TRADING_FCO_ORDER,
  EP_TRADING_FCO_ORDER_BOOK,
  EP_TRADING_FCO_STATUS_HISTORY,
  EP_TRADING_MAX_BUY_SELL,
  EP_TRADING_ORDER,
  EP_TRADING_ORDER_BATCH,
  DEFAULT_USER_AGENT,
  HEADER_SIGNATURE,
  MAX_BATCH_ORDERS,
  MAX_CLIENT_REQUEST_ID_LENGTH,
} from '../constants.js';
import { Config } from '../config.js';
import { FCOOperator, FCOOperatorLike, FCOStatusLike, FCOType, FCOTypeLike } from '../enums/fco.js';
import { OrderSide, OrderType } from '../enums/trading.js';
import { ValidationError } from '../exceptions.js';
import {
  BatchCancelOrderItem,
  BatchOrderRequest,
  BatchOrderResponse,
  BatchPlaceOrderItem,
  BullBearParams,
  CancelOrderRequest,
  CancelOrderResponse,
  FCOCancelRequest,
  FCOCancelResponse,
  FCOInfo,
  FCOListRequest,
  FCOListResponse,
  FCOOrderBookResponse,
  FCOPlaceResponse,
  FCOStatusHistoryItem,
  GTDParams,
  MaxBuySellResponse,
  ModifyOrderRequest,
  ModifyOrderResponse,
  NumberLike,
  OCOParams,
  PlaceOrderRequest,
  PlaceOrderResponse,
  PriceLike,
  StopParams,
  TrailingStopParams,
  batchOrderResponseFromDict,
  batchOrderToPayload,
  bullBearToPayload,
  cancelOrderResponseFromDict,
  cancelOrderToPayload,
  fcoCancelResponseFromDict,
  fcoCancelToPayload,
  fcoListRequestToParams,
  fcoListResponseFromDict,
  fcoOrderBookRequestToParams,
  fcoOrderBookResponseFromDict,
  fcoPlaceResponseFromDict,
  fcoStatusHistoryFromResponse,
  fcoStatusHistoryToParams,
  gtdToPayload,
  maxBuySellResponseFromDict,
  maxBuySellToParams,
  modifyOrderResponseFromDict,
  modifyOrderToPayload,
  ocoToPayload,
  placeOrderResponseFromDict,
  placeOrderToPayload,
  stopToPayload,
  trailingStopToPayload,
} from '../models/index.js';
import { Dict, fromValue, toPriceDecimal } from '../utils/converter.js';
import { sign } from '../utils/crypto.js';
import { getDeviceId } from '../utils/device.js';
import { generateRequestId } from '../utils/idGenerator.js';
import {
  parseDateArg,
  requireDateRange,
  requireExactlyOne,
  requireNonEmpty,
  requirePositiveNumber,
  requireNonNegative,
} from '../utils/validator.js';

// ── shared logic (also used by the experimental trading WebSocket) ──────────────────────────

const PRICED_ORDER_TYPES: readonly OrderType[] = [OrderType.LO, OrderType.PLO];
const FCO_MAX_RANGE_DAYS = 31;

type AnyFcoParams = GTDParams | StopParams | TrailingStopParams | OCOParams | BullBearParams;

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The object a response carries: the body itself, or its `data` object when it is enveloped. */
function unwrap(body: unknown): Dict {
  if (!isRecord(body)) return {};
  const inner = body.data;
  return isRecord(inner) ? inner : body;
}

/** Accept an `FCOOperator` or its string ("greater_or_equal"...); refuse anything else. */
export function resolveOperator(value: FCOOperatorLike): FCOOperator {
  const resolved = fromValue(FCOOperator, value);
  if (resolved === undefined) {
    const allowed = Object.values(FCOOperator).join(', ');
    throw new ValidationError(`operator must be one of ${allowed}, got ${JSON.stringify(value)}`);
  }
  return resolved;
}

/** Request fields every order payload takes from `Config` (device id, user agent). */
export function identity(config: Config): { deviceId: string; userAgent: string } {
  return { deviceId: getDeviceId(), userAgent: config.userAgent || DEFAULT_USER_AGENT };
}

/**
 * Use the caller's idempotency key, or generate a random one (<= 20 chars).
 *
 * A caller-chosen key lets an order that timed out be looked up (or safely re-sent with the
 * same key: the server answers 409 if the first one went through).
 */
export function clientRequestIdOrNew(value?: string | null): string {
  if (value === undefined || value === null) return generateRequestId();
  requireNonEmpty(value, 'clientRequestId');
  if (value.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
    throw new ValidationError(`clientRequestId must be at most ${MAX_CLIENT_REQUEST_ID_LENGTH} characters`);
  }
  return value;
}

export function buildPlaceOrder(
  accountNo: string,
  symbol: string,
  side: OrderSide,
  quantity: number,
  price: PriceLike | null | undefined,
  orderType: OrderType,
  config: Config,
  clientRequestId?: string | null,
): PlaceOrderRequest {
  requireNonEmpty(accountNo, 'accountNo');
  requireNonEmpty(symbol, 'symbol');
  requireNonEmpty(side, 'side');
  requireNonEmpty(orderType, 'orderType');
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    throw new ValidationError(`quantity must be an integer, got ${JSON.stringify(quantity)}`);
  }
  requirePositiveNumber(quantity, 'quantity');
  if ((price === undefined || price === null) && PRICED_ORDER_TYPES.includes(orderType)) {
    throw new ValidationError(`price is required for ${orderType} orders`);
  }
  return {
    accountNo,
    symbol,
    side,
    quantity,
    price,
    orderType,
    clientRequestId: clientRequestIdOrNew(clientRequestId),
    ...identity(config),
  };
}

/**
 * The order is identified by exactly one of `orderId`/`clientRequestId`, and a single call
 * changes either the price or the quantity, never both.
 */
export function buildModifyOrder(
  accountNo: string,
  orderId: string | undefined,
  clientRequestId: string | undefined,
  price: PriceLike | null | undefined,
  quantity: number | undefined,
  config: Config,
): ModifyOrderRequest {
  requireNonEmpty(accountNo, 'accountNo');
  requireExactlyOne(orderId, clientRequestId, 'orderId', 'clientRequestId');
  const hasPrice = price !== undefined && price !== null;
  const hasQuantity = quantity !== undefined && quantity !== null;
  if (!hasPrice && !hasQuantity) throw new ValidationError('either price or quantity is required');
  if (hasPrice && hasQuantity) {
    throw new ValidationError('price and quantity cannot be modified in the same request');
  }
  if (hasPrice) requirePositiveNumber(toPriceDecimal(price), 'price');
  if (hasQuantity) requirePositiveNumber(quantity, 'quantity');
  return {
    accountNo,
    quantity,
    price,
    orderId,
    clientRequestId,
    clientModifyId: generateRequestId(),
    ...identity(config),
  };
}

export function buildCancelOrder(
  accountNo: string,
  orderId: string | undefined,
  clientRequestId: string | undefined,
  config: Config,
): CancelOrderRequest {
  requireNonEmpty(accountNo, 'accountNo');
  requireExactlyOne(orderId, clientRequestId, 'orderId', 'clientRequestId');
  return {
    accountNo,
    orderId,
    clientRequestId,
    clientCancelId: generateRequestId(),
    ...identity(config),
  };
}

export function buildMaxBuySell(accountNo: string, symbol: string, price?: PriceLike | null): Dict {
  requireNonEmpty(accountNo, 'accountNo');
  requireNonEmpty(symbol, 'symbol');
  return maxBuySellToParams({ accountNo, symbol, price });
}

/** A batch holds 1..`limit` orders (`Config.maxBatchOrders`; the server's default is 20). */
export function checkBatch<T>(orders: readonly T[], limit: number = MAX_BATCH_ORDERS): T[] {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new ValidationError('a batch needs at least one order');
  }
  if (orders.length > limit) {
    throw new ValidationError(`a batch holds at most ${limit} orders, got ${orders.length}`);
  }
  return [...orders];
}

/**
 * Batch envelope: a random id (a reused one is a 409) and the current time in epoch ms
 * (outside the server's replay window it is a 400111).
 */
export function batchEnvelope(orders: Dict[]): BatchOrderRequest {
  return { batchRequestId: generateRequestId(), batchRequestTime: Date.now(), orders };
}

/** Validate every order first (one bad order rejects the whole batch) and build the body. */
export function buildBatchPlace(orders: readonly BatchPlaceOrderItem[], config: Config): BatchOrderRequest {
  const built = checkBatch(orders, config.maxBatchOrders).map((item) =>
    placeOrderToPayload(
      buildPlaceOrder(
        item.accountNo,
        item.symbol,
        item.side,
        item.quantity,
        item.price,
        item.orderType,
        config,
        item.clientRequestId,
      ),
    ),
  );
  return batchEnvelope(built);
}

/** Validate every cancel first and build the body (`accountNo` and exactly one id per order). */
export function buildBatchCancel(orders: readonly BatchCancelOrderItem[], config: Config): BatchOrderRequest {
  const built = checkBatch(orders, config.maxBatchOrders).map((item) =>
    cancelOrderToPayload(buildCancelOrder(item.accountNo, item.orderId, item.clientRequestId, config)),
  );
  return batchEnvelope(built);
}

/** Serialize once; the signature covers exactly the text that is sent. */
export function signAndEncode(payload: Dict, privateKey: string): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  return { body, signature: sign(body, privateKey) };
}

/**
 * `from`/`to` are `YYYY/MM/DD HH:MM:SS` (a bare `YYYY/MM/DD` is accepted too) and `from <= to`.
 */
export function buildFcoList(req: FCOListRequest): Dict {
  requireNonEmpty(req.accountNo, 'accountNo');
  if (req.fromDate !== undefined && req.toDate !== undefined) {
    requireDateRange(req.fromDate, req.toDate, { allowTime: true });
  } else {
    if (req.fromDate !== undefined) parseDateArg(req.fromDate, 'from', { allowTime: true });
    if (req.toDate !== undefined) parseDateArg(req.toDate, 'to', { allowTime: true });
  }
  return fcoListRequestToParams(req);
}

/**
 * Validate an FCO order and fill in the caller identity from `Config` (the params object is
 * not mutated).
 *
 * The validity window must be `YYYY/MM/DD HH:MM:SS`, `from <= to` and at most 31 days: the API
 * contract says so but the server does not check it, so the SDK does. The device id is always
 * this machine's; the server records the IP.
 */
export function buildFcoParams<T extends AnyFcoParams>(params: T, config: Config): T {
  if (!isRecord(params)) throw new ValidationError('Invalid FCO params type');
  if (params.fromDate !== undefined && params.toDate !== undefined) {
    requireDateRange(params.fromDate, params.toDate, { timeRequired: true, maxDays: FCO_MAX_RANGE_DAYS });
  } else {
    if (params.fromDate !== undefined) parseDateArg(params.fromDate, 'from', { timeRequired: true });
    if (params.toDate !== undefined) parseDateArg(params.toDate, 'to', { timeRequired: true });
  }
  return { ...params, ...identity(config) };
}

// ── service ─────────────────────────────────────────────────────────────────────────────────

export class TradingService {
  constructor(private readonly restClient: RestClient) {}

  private get config(): Config {
    return this.restClient.getConfig();
  }

  private signed(payload: Dict): { body: string; headers: Record<string, string> } {
    const { body, signature } = signAndEncode(payload, this.restClient.getPrivateKey());
    return { body, headers: { [HEADER_SIGNATURE]: signature } };
  }

  // ── orders ──

  private async sendPlaceOrder(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: PriceLike | null | undefined,
    orderType: OrderType,
    clientRequestId?: string,
  ): Promise<PlaceOrderResponse> {
    const req = buildPlaceOrder(accountNo, symbol, side, quantity, price, orderType, this.config, clientRequestId);
    const { body, headers } = this.signed(placeOrderToPayload(req));
    const data = await this.restClient.post(EP_TRADING_ORDER, body, headers);
    return placeOrderResponseFromDict(unwrap(data));
  }

  /**
   * Place a new order of any order type. Orders are never retried by the SDK; re-sending a used
   * `clientRequestId` within the day is rejected with `DuplicateRequestError` (HTTP 409).
   *
   * @param price - Order price in VND (omit or 0 for non-priced order types).
   * @param clientRequestId - Optional idempotency key (<= 20 chars); generated when omitted.
   */
  async placeOrder(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: PriceLike | null | undefined,
    orderType: OrderType,
    clientRequestId?: string,
  ): Promise<PlaceOrderResponse> {
    if (price !== undefined && price !== null) requireNonNegative(toPriceDecimal(price), 'price');
    return this.sendPlaceOrder(accountNo, symbol, side, quantity, price, orderType, clientRequestId);
  }

  /** Place a limit (LO) order at a specified price. */
  placeLimitOrder(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: PriceLike,
    clientRequestId?: string,
  ): Promise<PlaceOrderResponse> {
    requirePositiveNumber(toPriceDecimal(price), 'price');
    return this.placeOrder(accountNo, symbol, side, quantity, price, OrderType.LO, clientRequestId);
  }

  /** Place a market (MTL) order. */
  placeMarketOrder(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    clientRequestId?: string,
  ): Promise<PlaceOrderResponse> {
    return this.placeOrder(accountNo, symbol, side, quantity, 0, OrderType.MTL, clientRequestId);
  }

  /** Place an at-the-open (ATO) order. */
  placeAtoOrder(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    clientRequestId?: string,
  ): Promise<PlaceOrderResponse> {
    return this.placeOrder(accountNo, symbol, side, quantity, 0, OrderType.ATO, clientRequestId);
  }

  /** Place an at-the-close (ATC) order. */
  placeAtcOrder(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    clientRequestId?: string,
  ): Promise<PlaceOrderResponse> {
    return this.placeOrder(accountNo, symbol, side, quantity, 0, OrderType.ATC, clientRequestId);
  }

  private async sendModifyOrder(args: {
    accountNo: string;
    orderId?: string;
    clientRequestId?: string;
    price?: PriceLike;
    quantity?: number;
  }): Promise<ModifyOrderResponse> {
    const req = buildModifyOrder(
      args.accountNo,
      args.orderId,
      args.clientRequestId,
      args.price,
      args.quantity,
      this.config,
    );
    const { body, headers } = this.signed(modifyOrderToPayload(req));
    const data = await this.restClient.put(EP_TRADING_ORDER, body, headers);
    return modifyOrderResponseFromDict(unwrap(data));
  }

  /** Modify the price of an order identified by its client request id. */
  modifyOrderPrice(accountNo: string, clientRequestId: string, price: PriceLike): Promise<ModifyOrderResponse> {
    requirePositiveNumber(toPriceDecimal(price), 'price');
    return this.sendModifyOrder({ accountNo, clientRequestId, price });
  }

  /** Modify the price of an order identified by its server order id. */
  modifyOrderPriceByOrderId(accountNo: string, orderId: string, price: PriceLike): Promise<ModifyOrderResponse> {
    requirePositiveNumber(toPriceDecimal(price), 'price');
    return this.sendModifyOrder({ accountNo, orderId, price });
  }

  /** Modify the quantity of an order identified by its client request id. */
  modifyOrderQuantity(accountNo: string, clientRequestId: string, quantity: number): Promise<ModifyOrderResponse> {
    requireNonEmpty(quantity, 'quantity');
    return this.sendModifyOrder({ accountNo, clientRequestId, quantity });
  }

  /** Modify the quantity of an order identified by its server order id. */
  modifyOrderQuantityByOrderId(accountNo: string, orderId: string, quantity: number): Promise<ModifyOrderResponse> {
    requireNonEmpty(quantity, 'quantity');
    return this.sendModifyOrder({ accountNo, orderId, quantity });
  }

  /** @deprecated use `modifyOrderPriceByOrderId`. */
  modifyOrderPriceById(accountNo: string, orderId: string, price: PriceLike): Promise<ModifyOrderResponse> {
    return this.modifyOrderPriceByOrderId(accountNo, orderId, price);
  }

  /** @deprecated use `modifyOrderQuantityByOrderId`. */
  modifyOrderQuantityById(accountNo: string, orderId: string, quantity: number): Promise<ModifyOrderResponse> {
    return this.modifyOrderQuantityByOrderId(accountNo, orderId, quantity);
  }

  private async sendCancelOrder(
    accountNo: string,
    orderId?: string,
    clientRequestId?: string,
  ): Promise<CancelOrderResponse> {
    const req = buildCancelOrder(accountNo, orderId, clientRequestId, this.config);
    const { body, headers } = this.signed(cancelOrderToPayload(req));
    const data = await this.restClient.delete(EP_TRADING_ORDER, body, headers);
    return cancelOrderResponseFromDict(unwrap(data));
  }

  /** Cancel an order identified by its client request id. */
  cancelOrder(accountNo: string, clientRequestId: string): Promise<CancelOrderResponse> {
    requireNonEmpty(clientRequestId, 'clientRequestId');
    return this.sendCancelOrder(accountNo, undefined, clientRequestId);
  }

  /** Cancel an order identified by its server order id. */
  cancelOrderById(accountNo: string, orderId: string): Promise<CancelOrderResponse> {
    requireNonEmpty(orderId, 'orderId');
    return this.sendCancelOrder(accountNo, orderId, undefined);
  }

  /**
   * Place a batch of orders in one signed request (`POST /order/batch`), at most
   * `Config.maxBatchOrders` (the server's default is 20).
   *
   * All orders are validated first and the server accepts or rejects the batch as a whole.
   * `batchRequestId` is random and `batchRequestTime` is the current time; the request is signed
   * over the whole body and never retried.
   *
   * @throws ValidationError empty batch, too many orders, or a bad order.
   * @throws DuplicateRequestError the batch id was already used today (HTTP 409).
   */
  async placeBatchOrders(orders: readonly BatchPlaceOrderItem[]): Promise<BatchOrderResponse> {
    const request = buildBatchPlace(orders, this.config);
    const { body, headers } = this.signed(batchOrderToPayload(request));
    const data = await this.restClient.post(EP_TRADING_ORDER_BATCH, body, headers);
    return batchOrderResponseFromDict(unwrap(data));
  }

  /** Cancel a batch of orders in one signed request (`DELETE /order/batch`). */
  async cancelBatchOrders(orders: readonly BatchCancelOrderItem[]): Promise<BatchOrderResponse> {
    const request = buildBatchCancel(orders, this.config);
    const { body, headers } = this.signed(batchOrderToPayload(request));
    const data = await this.restClient.delete(EP_TRADING_ORDER_BATCH, body, headers);
    return batchOrderResponseFromDict(unwrap(data));
  }

  // ── max buy / sell ──

  private async fetchMaxBuySell(
    accountNo: string,
    symbol: string,
    price?: PriceLike | null,
  ): Promise<MaxBuySellResponse> {
    const params = buildMaxBuySell(accountNo, symbol, price);
    const data = await this.restClient.get(EP_TRADING_MAX_BUY_SELL, params);
    return maxBuySellResponseFromDict(unwrap(data), symbol);
  }

  /** Max buy/sell quantities for a symbol at a given price. */
  getMaxBuySell(accountNo: string, symbol: string, price: PriceLike): Promise<MaxBuySellResponse> {
    requirePositiveNumber(toPriceDecimal(price), 'price');
    return this.fetchMaxBuySell(accountNo, symbol, price);
  }

  /** Max buy/sell quantities for a symbol at the current market price. */
  getMaxBuySellAtMarketPrice(accountNo: string, symbol: string): Promise<MaxBuySellResponse> {
    return this.fetchMaxBuySell(accountNo, symbol);
  }

  // ── FCO queries ──

  private async fetchFcoList(req: FCOListRequest): Promise<FCOListResponse> {
    const params = buildFcoList(req);
    const data = await this.restClient.get(EP_TRADING_FCO_LIST, params);
    return fcoListResponseFromDict(data);
  }

  /** All FCO orders of a trading account (derivative accounts end in 8). */
  getFcoByAccountNo(accountNo: string, pageIndex?: number, pageSize?: number): Promise<FCOListResponse> {
    return this.fetchFcoList({ accountNo, pageIndex, pageSize });
  }

  /** FCO orders filtered by stock or derivative symbol. */
  getFcoBySymbol(accountNo: string, symbol: string, pageIndex?: number, pageSize?: number): Promise<FCOListResponse> {
    return this.fetchFcoList({ accountNo, symbol, pageIndex, pageSize });
  }

  /** FCO orders filtered by processing status (pass an array to match several). */
  getFcoByStatus(
    accountNo: string,
    processStatus: FCOStatusLike | string | Array<FCOStatusLike | string>,
    pageIndex?: number,
    pageSize?: number,
  ): Promise<FCOListResponse> {
    return this.fetchFcoList({ accountNo, processStatus, pageIndex, pageSize });
  }

  /** FCO orders in a date range (`YYYY/MM/DD HH:MM:SS`; a bare date is accepted). */
  getFcoByDate(
    accountNo: string,
    fromDate: string,
    toDate: string,
    pageIndex?: number,
    pageSize?: number,
  ): Promise<FCOListResponse> {
    return this.fetchFcoList({ accountNo, fromDate, toDate, pageIndex, pageSize });
  }

  /** A single FCO by id; `undefined` when no such FCO exists for the account. */
  async getFcoById(accountNo: string, fcoId: string): Promise<FCOInfo | undefined> {
    const response = await this.fetchFcoList({ accountNo, fcoId });
    return response.fcoList[0];
  }

  /** The order book/history of a conditional order. */
  async getFcoOrderBook(fcoId: string, pageIndex?: number, pageSize?: number): Promise<FCOOrderBookResponse> {
    requireNonEmpty(fcoId, 'fcoId');
    const params = fcoOrderBookRequestToParams({ fcoId, pageIndex: pageIndex ?? 1, pageSize: pageSize ?? 10 });
    const data = await this.restClient.get(EP_TRADING_FCO_ORDER_BOOK, params);
    return fcoOrderBookResponseFromDict(data);
  }

  /** The status transitions of a conditional order; empty when there are none. */
  async getFcoStatusHistory(fcoId: string): Promise<FCOStatusHistoryItem[]> {
    requireNonEmpty(fcoId, 'fcoId');
    const data = await this.restClient.get(EP_TRADING_FCO_STATUS_HISTORY, fcoStatusHistoryToParams({ fcoId }));
    return fcoStatusHistoryFromResponse(data);
  }

  // ── FCO place / cancel ──

  private async sendFco(payloadOf: (params: AnyFcoParams) => Dict, params: AnyFcoParams): Promise<FCOPlaceResponse> {
    const checked = buildFcoParams(params, this.config);
    const { body, headers } = this.signed(payloadOf(checked));
    const data = await this.restClient.post(EP_TRADING_FCO_ORDER, body, headers);
    return fcoPlaceResponseFromDict(unwrap(data));
  }

  /**
   * Place a GTD order.
   *
   * @param price - A number/decimal string, or an `OrderType` word (MP, MTL, ...) for a
   *   market-priced order; the slip is then ignored.
   * @param fromDate - Start of the validity window, `YYYY/MM/DD HH:MM:SS`.
   * @param toDate - End of the window, `YYYY/MM/DD HH:MM:SS`; at most 31 days after `fromDate`.
   * @param code - One-time code (OTP) when the account requires one; omitted when empty.
   */
  placeFcoGtd(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: PriceLike | OrderType,
    priceSlip: NumberLike,
    fromDate: string,
    toDate: string,
    code?: string,
  ): Promise<FCOPlaceResponse> {
    const params: GTDParams = { accountNo, symbol, side, quantity, price, priceSlip, fromDate, toDate, code };
    return this.sendFco((p) => gtdToPayload(p as GTDParams), params);
  }

  /** Place a stop order (market-priced once triggered). */
  placeFcoStop(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    stopPrice: NumberLike,
    operator: FCOOperatorLike,
    fromDate: string,
    toDate: string,
    code?: string,
  ): Promise<FCOPlaceResponse> {
    const params: StopParams = {
      accountNo,
      symbol,
      side,
      quantity,
      stopPrice,
      operator: resolveOperator(operator),
      price: OrderType.MTL,
      priceSlip: 0,
      fromDate,
      toDate,
      code,
    };
    return this.sendFco((p) => stopToPayload(p as StopParams), params);
  }

  /** Place a stop limit order. */
  placeFcoStopLimit(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: PriceLike,
    priceSlip: NumberLike,
    stopPrice: NumberLike,
    operator: FCOOperatorLike,
    fromDate: string,
    toDate: string,
    code?: string,
  ): Promise<FCOPlaceResponse> {
    const params: StopParams = {
      accountNo,
      fcoType: FCOType.STOP_LIMIT,
      symbol,
      side,
      price,
      priceSlip,
      quantity,
      stopPrice,
      operator: resolveOperator(operator),
      fromDate,
      toDate,
      code,
    };
    return this.sendFco((p) => stopToPayload(p as StopParams), params);
  }

  /** Place a trailing stop order. */
  placeFcoTrailingStop(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    activePrice: NumberLike,
    trailingAmount: NumberLike,
    fromDate: string,
    toDate: string,
    code?: string,
  ): Promise<FCOPlaceResponse> {
    const params: TrailingStopParams = {
      accountNo,
      symbol,
      side,
      quantity,
      activePrice,
      trailingAmount,
      fromDate,
      toDate,
      code,
    };
    return this.sendFco((p) => trailingStopToPayload(p as TrailingStopParams), params);
  }

  /** Place a trailing stop limit order. */
  placeFcoTrailingStopLimit(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    activePrice: NumberLike,
    trailingAmount: NumberLike,
    priceSlip: NumberLike,
    fromDate: string,
    toDate: string,
    code?: string,
  ): Promise<FCOPlaceResponse> {
    const params: TrailingStopParams = {
      accountNo,
      fcoType: FCOType.TRAILING_STOP_LIMIT,
      symbol,
      side,
      quantity,
      activePrice,
      trailingAmount,
      priceSlip,
      fromDate,
      toDate,
      code,
    };
    return this.sendFco((p) => trailingStopToPayload(p as TrailingStopParams), params);
  }

  /** Place an OCO order. `tpPrice`/`slPrice` are a number or an `OrderType` word. */
  placeFcoOco(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    tpActivePrice: NumberLike,
    slActivePrice: NumberLike,
    tpPrice: PriceLike | OrderType,
    slPrice: PriceLike | OrderType,
    tpSlip: NumberLike,
    slSlip: NumberLike,
    fromDate: string,
    toDate: string,
    code?: string,
  ): Promise<FCOPlaceResponse> {
    const params: OCOParams = {
      accountNo,
      symbol,
      side,
      quantity,
      tpActivePrice,
      slActivePrice,
      tpPrice,
      slPrice,
      tpSlip,
      slSlip,
      fromDate,
      toDate,
      code,
    };
    return this.sendFco((p) => ocoToPayload(p as OCOParams), params);
  }

  /** Place a Bull Bear order. */
  placeFcoBullBear(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: PriceLike | OrderType,
    priceSlip: NumberLike,
    tpActivePrice: NumberLike,
    slActivePrice: NumberLike,
    tpPrice: PriceLike | OrderType,
    slPrice: PriceLike | OrderType,
    tpSlip: NumberLike,
    slSlip: NumberLike,
    fromDate: string,
    toDate: string,
    code?: string,
  ): Promise<FCOPlaceResponse> {
    const params: BullBearParams = {
      accountNo,
      symbol,
      side,
      quantity,
      price,
      priceSlip,
      tpActivePrice,
      slActivePrice,
      tpPrice,
      slPrice,
      tpSlip,
      slSlip,
      fromDate,
      toDate,
      code,
    };
    return this.sendFco((p) => bullBearToPayload(p as BullBearParams), params);
  }

  /**
   * Cancel a conditional order.
   *
   * @param code - One-time code (OTP) when the account requires one; omitted when empty.
   */
  async cancelFco(fcoId: string, code?: string): Promise<FCOCancelResponse> {
    requireNonEmpty(fcoId, 'fcoId');
    const request: FCOCancelRequest = {
      fcoId,
      deviceId: getDeviceId(),
      userAgent: this.config.userAgent,
      code,
    };
    const { body, headers } = this.signed(fcoCancelToPayload(request));
    const data = await this.restClient.delete(EP_TRADING_FCO_ORDER, body, headers);
    return fcoCancelResponseFromDict(unwrap(data));
  }
}

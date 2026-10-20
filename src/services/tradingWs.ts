/**
 * Trading WebSocket service: order entry, FCO and account queries over one socket. Open it with
 * `asyncTradingWs(auth)`; `Trading` and `Stream` never connect to it.
 *
 * Order methods return the immediate ack (`orderStatus` `PD`); the outcome arrives on the order
 * events (`subscribeOrderEvents`). Commands are never retried.
 */
import { Config } from '../config.js';
import { FCOStatusLike, FCOTypeLike } from '../enums/fco.js';
import { OrderSide, OrderType } from '../enums/trading.js';
import { ValidationError } from '../exceptions.js';
import {
  BatchCancelOrderItem,
  BatchPlaceOrderItem,
  BullBearParams,
  CancelOrderResponse,
  FCOCancelRequest,
  FCOCancelResponse,
  FCOPlaceResponse,
  GTDParams,
  ModifyOrderResponse,
  OCOParams,
  PlaceOrderResponse,
  PriceLike,
  StopParams,
  TrailingStopParams,
  bullBearToPayload,
  cancelOrderResponseFromDict,
  cancelOrderToPayload,
  fcoCancelResponseFromDict,
  fcoCancelToPayload,
  fcoOrderBookRequestToParams,
  fcoPlaceResponseFromDict,
  gtdToPayload,
  modifyOrderResponseFromDict,
  modifyOrderToPayload,
  ocoToPayload,
  placeOrderResponseFromDict,
  placeOrderToPayload,
  stopToPayload,
  trailingStopToPayload,
} from '../models/index.js';
import { TradingWSClient, TradingWSResponse } from '../transport/tradingWs.js';
import { Dict, toJsonNumber, toPriceDecimal } from '../utils/converter.js';
import { getDeviceId } from '../utils/device.js';
import { buildTopic } from '../utils/topic.js';
import {
  parseDateArg,
  requireDateRange,
  requireNonEmpty,
  requireNonNegative,
} from '../utils/validator.js';
import {
  buildBatchCancel,
  buildBatchPlace,
  buildCancelOrder,
  buildFcoList,
  buildFcoParams,
  buildModifyOrder,
  buildPlaceOrder,
} from './trading.js';

const TRADING_CHANNEL = 'TRADING';

/** The kind of conditional order, to pick the payload builder (Python dispatches on the class). */
export type FcoParamsKind =
  | { kind: 'gtd'; params: GTDParams }
  | { kind: 'stop'; params: StopParams }
  | { kind: 'trailingStop'; params: TrailingStopParams }
  | { kind: 'oco'; params: OCOParams }
  | { kind: 'bullBear'; params: BullBearParams };

export interface FcoListOptions {
  fcoId?: string;
  type?: FCOTypeLike | string;
  processStatus?: FCOStatusLike | string;
  symbol?: string;
  side?: OrderSide | string;
  fromDate?: string;
  toDate?: string;
  pageIndex?: number;
  pageSize?: number;
}

export interface OrderBookQuery {
  fromDate?: string;
  toDate?: string;
  symbol?: string;
  orderStatus?: string;
  pageIndex?: number;
  pageSize?: number;
}

/** `order.<account>` / `portfolio.<account>`: one account only, no wildcard or list. */
function accountTopic(kind: string, accountNo: string): string {
  requireNonEmpty(accountNo, 'accountNo');
  if (accountNo.includes('*') || accountNo.includes(',')) {
    throw new ValidationError('subscribe to one account at a time (no wildcard or list)');
  }
  return buildTopic(kind, accountNo);
}

function withClientId(params: Dict, clientId: string): Dict {
  if (clientId) params.clientId = clientId;
  return params;
}

function asDict(value: unknown): Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {};
}

export class TradingWSService {
  constructor(
    private readonly ws: TradingWSClient,
    private readonly config: Config,
  ) {}

  /** The underlying transport (set `client.onEvent` to receive events). */
  get client(): TradingWSClient {
    return this.ws;
  }

  async close(): Promise<void> {
    return this.ws.close();
  }

  /** Send any command and return its first response frame (no retry). */
  async command(method: string, params: Record<string, unknown>): Promise<TradingWSResponse> {
    requireNonEmpty(method, 'method');
    return this.ws.request(method, params);
  }

  // ── orders ──

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
    const request = buildPlaceOrder(
      accountNo,
      symbol,
      side,
      quantity,
      price,
      orderType,
      this.config,
      clientRequestId,
    );
    const response = await this.ws.request('order.place', placeOrderToPayload(request));
    return placeOrderResponseFromDict(asDict(response.result));
  }

  async amendOrder(
    accountNo: string,
    price?: PriceLike | null,
    quantity?: number,
    orderId?: string,
    clientRequestId?: string,
  ): Promise<ModifyOrderResponse> {
    const request = buildModifyOrder(accountNo, orderId, clientRequestId, price, quantity, this.config);
    const response = await this.ws.request('order.amend', modifyOrderToPayload(request));
    return modifyOrderResponseFromDict(asDict(response.result));
  }

  async cancelOrder(
    accountNo: string,
    orderId?: string,
    clientRequestId?: string,
  ): Promise<CancelOrderResponse> {
    const request = buildCancelOrder(accountNo, orderId, clientRequestId, this.config);
    const response = await this.ws.request('order.cancel', cancelOrderToPayload(request));
    return cancelOrderResponseFromDict(asDict(response.result));
  }

  /** Place up to `Config.maxBatchOrders` orders in one command (one bad order rejects all). */
  async batchNewOrders(orders: readonly BatchPlaceOrderItem[]): Promise<TradingWSResponse> {
    const request = buildBatchPlace(orders, this.config);
    return this.ws.request('order.batchNew', { ...request });
  }

  async batchCancelOrders(orders: readonly BatchCancelOrderItem[]): Promise<TradingWSResponse> {
    const request = buildBatchCancel(orders, this.config);
    return this.ws.request('order.batchCancel', { ...request });
  }

  // ── FCO ──

  /** Place a conditional order (`fco.place`) from the same params as REST. */
  async placeFco(order: FcoParamsKind): Promise<FCOPlaceResponse> {
    let payload: Dict;
    switch (order.kind) {
      case 'gtd':
        payload = gtdToPayload(buildFcoParams(order.params, this.config));
        break;
      case 'stop':
        payload = stopToPayload(buildFcoParams(order.params, this.config));
        break;
      case 'trailingStop':
        payload = trailingStopToPayload(buildFcoParams(order.params, this.config));
        break;
      case 'oco':
        payload = ocoToPayload(buildFcoParams(order.params, this.config));
        break;
      case 'bullBear':
        payload = bullBearToPayload(buildFcoParams(order.params, this.config));
        break;
      default:
        throw new ValidationError('Invalid FCO params type');
    }
    const response = await this.ws.request('fco.place', payload);
    return fcoPlaceResponseFromDict(asDict(response.result));
  }

  async cancelFco(fcoId: string, code?: string): Promise<FCOCancelResponse> {
    requireNonEmpty(fcoId, 'fcoId');
    const request: FCOCancelRequest = {
      fcoId,
      deviceId: getDeviceId(),
      userAgent: this.config.userAgent,
      code,
    };
    const response = await this.ws.request('fco.cancel', fcoCancelToPayload(request));
    return fcoCancelResponseFromDict(asDict(response.result));
  }

  async listFco(accountNo: string, options: FcoListOptions = {}): Promise<TradingWSResponse> {
    if (Array.isArray(options.processStatus)) {
      throw new ValidationError('fco.list takes a single process_status, not a list');
    }
    return this.ws.request('fco.list', buildFcoList({ accountNo, ...options }));
  }

  async fcoOrderBook(fcoId: string): Promise<TradingWSResponse> {
    requireNonEmpty(fcoId, 'fcoId');
    return this.ws.request('fco.orderbook', fcoOrderBookRequestToParams({ fcoId, pageIndex: 1, pageSize: 10 }));
  }

  async fcoStatusHistory(fcoId: string): Promise<TradingWSResponse> {
    requireNonEmpty(fcoId, 'fcoId');
    return this.ws.request('fco.statusHistory', { fcoId });
  }

  // ── events ──

  async subscribeOrderEvents(accountNo: string): Promise<void> {
    return this.ws.subscribe(TRADING_CHANNEL, [accountTopic('order', accountNo)]);
  }

  async unsubscribeOrderEvents(accountNo: string): Promise<void> {
    return this.ws.unsubscribe(TRADING_CHANNEL, [accountTopic('order', accountNo)]);
  }

  async subscribePortfolioEvents(accountNo: string): Promise<void> {
    return this.ws.subscribe(TRADING_CHANNEL, [accountTopic('portfolio', accountNo)]);
  }

  async unsubscribePortfolioEvents(accountNo: string): Promise<void> {
    return this.ws.unsubscribe(TRADING_CHANNEL, [accountTopic('portfolio', accountNo)]);
  }

  /** Drop every trading subscription of this socket. */
  async unsubscribeAllEvents(): Promise<void> {
    return this.ws.unsubscribe(TRADING_CHANNEL, []);
  }

  // ── queries ──

  async queryPosition(accountNo: string, querySummary = true): Promise<TradingWSResponse> {
    requireNonEmpty(accountNo, 'accountNo');
    return this.ws.request(
      'query.position',
      withClientId({ accountNo, querySummary: Boolean(querySummary) }, this.config.clientId),
    );
  }

  /** `price` goes out as a JSON number; omit it to let the server use its reference price. */
  async queryMaxBuySell(accountNo: string, symbol: string, price?: PriceLike | null): Promise<TradingWSResponse> {
    requireNonEmpty(accountNo, 'accountNo');
    requireNonEmpty(symbol, 'symbol');
    const params: Dict = { accountNo, symbol: symbol.toUpperCase() };
    if (price !== undefined && price !== null) {
      requireNonNegative(toPriceDecimal(price), 'price');
      params.price = toJsonNumber(price, 'price');
    }
    return this.ws.request('query.maxBuySell', params);
  }

  async queryAccountBalance(accountNo: string): Promise<TradingWSResponse> {
    requireNonEmpty(accountNo, 'accountNo');
    return this.ws.request('query.accountBalance', withClientId({ accountNo }, this.config.clientId));
  }

  async queryPpmmrAccount(accountNo: string): Promise<TradingWSResponse> {
    requireNonEmpty(accountNo, 'accountNo');
    return this.ws.request('query.ppmmrAccount', { accountNo });
  }

  async queryOrderBook(accountNo: string, query: OrderBookQuery = {}): Promise<TradingWSResponse> {
    requireNonEmpty(accountNo, 'accountNo');
    const params: Dict = { accountNo };
    if (query.fromDate !== undefined && query.toDate !== undefined) {
      requireDateRange(query.fromDate, query.toDate);
    }
    for (const [key, value] of [
      ['from', query.fromDate],
      ['to', query.toDate],
    ] as const) {
      if (value !== undefined) {
        parseDateArg(value, key);
        params[key] = value;
      }
    }
    for (const [name, extra] of [
      ['symbol', query.symbol],
      ['orderStatus', query.orderStatus],
      ['pageIndex', query.pageIndex],
      ['pageSize', query.pageSize],
    ] as const) {
      if (extra !== undefined) params[name] = extra;
    }
    return this.ws.request('query.orderBook', params);
  }
}

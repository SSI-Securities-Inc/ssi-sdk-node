import { RestClient } from '../transport/restClient.js';
import {
  EP_TRADING_ORDER,
  EP_TRADING_MAX_BUY_SELL,
  EP_TRADING_FCO_ORDER,
  EP_TRADING_FCO_LIST,
  EP_TRADING_FCO_ORDER_BOOK,
  HEADER_SIGNATURE,
} from '../constants.js';
import {
  PlaceOrderResponse,
  ModifyOrderRequest,
  ModifyOrderResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  MaxBuySellResponse,
  FCOPlaceResponse,
  FCOCancelResponse,
  FCOListResponse,
  FCOInfo,
  FCOOrderBookResponse,
  buildGtdPayload,
  buildStopPayload,
  buildTrailingStopPayload,
  buildOcoPayload,
  buildBullBearPayload,
  mapFcoPlaceResponse,
  mapFcoCancelResponse,
  mapFcoListResponse,
  mapFcoOrderBookResponse,
} from '../models/index.js';
import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import { FCOType, FCOOperator, FCOStatus } from '../enums/fco.js';
import { sign } from '../utils/crypto.js';
import { toInt } from '../utils/converter.js';
import { requireString, requirePositiveNumber, requireNonNegative } from '../utils/validator.js';
import { VERSION } from '../version.js';


const DEFAULT_DEVICE_ID = 'A1:B2:C3:D4:E5:F6';
const DEFAULT_USER_AGENT = `SSI Node SDK/${VERSION}`;

function generateRequestId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export class TradingService {
  constructor(private readonly restClient: RestClient) {}

  private signPayload(payload: Record<string, unknown>): string {
    const privateKey = this.restClient.getPrivateKey();
    if (!privateKey) throw new Error('Private key is required for trading operations');
    const signData = JSON.stringify(payload);
    return sign(signData, privateKey);
  }

  async placeOrder(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: number,
    orderType: OrderType,
  ): Promise<PlaceOrderResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requireString(side, 'side');
    requireString(orderType, 'orderType');
    requireNonNegative(price, 'price');
    const clientRequestId = generateRequestId();
    const payload: Record<string, unknown> = {
      accountNo,
      symbol,
      side,
      quantity,
      price: String(price),
      orderType,
      clientRequestId,
      deviceId: DEFAULT_DEVICE_ID,
      userAgent: DEFAULT_USER_AGENT,
    };
    const sig = this.signPayload(payload);
    const data = await this.restClient.post<{ data: unknown }>(
      EP_TRADING_ORDER, payload, { [HEADER_SIGNATURE]: sig },
    );
    return mapPlaceOrderResponse((data as { data: unknown }).data);
  }

  placeLimitOrder(
    accountNo: string, symbol: string, side: OrderSide, quantity: number, price: number,
  ): Promise<PlaceOrderResponse> {
    requirePositiveNumber(price, 'price');
    return this.placeOrder(accountNo, symbol, side, quantity, price, OrderType.LO);
  }

  placeMarketOrder(
    accountNo: string, symbol: string, side: OrderSide, quantity: number,
  ): Promise<PlaceOrderResponse> {
    return this.placeOrder(accountNo, symbol, side, quantity, 0, OrderType.MTL);
  }

  placeAtoOrder(
    accountNo: string, symbol: string, side: OrderSide, quantity: number,
  ): Promise<PlaceOrderResponse> {
    return this.placeOrder(accountNo, symbol, side, quantity, 0, OrderType.ATO);
  }

  placeAtcOrder(
    accountNo: string, symbol: string, side: OrderSide, quantity: number,
  ): Promise<PlaceOrderResponse> {
    return this.placeOrder(accountNo, symbol, side, quantity, 0, OrderType.ATC);
  }

  async modifyOrderPrice(
    accountNo: string, clientRequestId: string, price: number,
  ): Promise<ModifyOrderResponse> {
    requireString(accountNo, 'accountNo');
    requireString(clientRequestId, 'clientRequestId');
    requireNonNegative(price, 'price');
    return this.modifyOrder({ accountNo, clientRequestId, price, clientModifyId: generateRequestId() });
  }

  async modifyOrderPriceById(
    accountNo: string, orderId: string, price: number,
  ): Promise<ModifyOrderResponse> {
    requireString(accountNo, 'accountNo');
    requireString(orderId, 'orderId');
    requireNonNegative(price, 'price');
    return this.modifyOrder({ accountNo, orderId, price, clientModifyId: generateRequestId() });
  }

  async modifyOrderQuantity(
    accountNo: string, clientRequestId: string, quantity: number,
  ): Promise<ModifyOrderResponse> {
    requireString(accountNo, 'accountNo');
    requireString(clientRequestId, 'clientRequestId');
    requirePositiveNumber(quantity, 'quantity');
    return this.modifyOrder({ accountNo, clientRequestId, quantity, clientModifyId: generateRequestId() });
  }

  async modifyOrderQuantityById(
    accountNo: string, orderId: string, quantity: number,
  ): Promise<ModifyOrderResponse> {
    requireString(accountNo, 'accountNo');
    requireString(orderId, 'orderId');
    requirePositiveNumber(quantity, 'quantity');
    return this.modifyOrder({ accountNo, orderId, quantity, clientModifyId: generateRequestId() });
  }

  private async modifyOrder(req: ModifyOrderRequest): Promise<ModifyOrderResponse> {
    if (req.price !== undefined && req.quantity !== undefined) {
      throw new Error('Cannot modify both price and quantity simultaneously');
    }
    const payload: Record<string, unknown> = {
      accountNo: req.accountNo,
      clientModifyId: req.clientModifyId,
      deviceId: req.deviceId ?? DEFAULT_DEVICE_ID,
      userAgent: req.userAgent ?? DEFAULT_USER_AGENT,
      ...(req.orderId ? { orderId: req.orderId } : {}),
      ...(req.clientRequestId ? { clientRequestId: req.clientRequestId } : {}),
      ...(req.price !== undefined ? { price: String(req.price) } : {}),
      ...(req.quantity !== undefined ? { quantity: req.quantity } : {}),
    };
    const sig = this.signPayload(payload);
    const data = await this.restClient.put<{ data: unknown }>(
      EP_TRADING_ORDER, payload, { [HEADER_SIGNATURE]: sig },
    );
    return mapModifyOrderResponse((data as { data: unknown }).data);
  }

  async cancelOrder(
    accountNo: string, clientRequestId: string,
  ): Promise<CancelOrderResponse> {
    requireString(accountNo, 'accountNo');
    requireString(clientRequestId, 'clientRequestId');
    return this.cancelOrderInternal({ accountNo, clientRequestId, clientCancelId: generateRequestId() });
  }

  async cancelOrderById(
    accountNo: string, orderId: string,
  ): Promise<CancelOrderResponse> {
    requireString(accountNo, 'accountNo');
    requireString(orderId, 'orderId');
    return this.cancelOrderInternal({ accountNo, orderId, clientCancelId: generateRequestId() });
  }

  private async cancelOrderInternal(req: CancelOrderRequest): Promise<CancelOrderResponse> {
    const payload: Record<string, unknown> = {
      accountNo: req.accountNo,
      clientCancelId: req.clientCancelId,
      deviceId: req.deviceId ?? DEFAULT_DEVICE_ID,
      userAgent: req.userAgent ?? DEFAULT_USER_AGENT,
      ...(req.orderId ? { orderId: req.orderId } : {}),
      ...(req.clientRequestId ? { clientRequestId: req.clientRequestId } : {}),
    };
    const sig = this.signPayload(payload);
    const data = await this.restClient.delete<{ data: unknown }>(
      EP_TRADING_ORDER, payload, { [HEADER_SIGNATURE]: sig },
    );
    return mapCancelOrderResponse((data as { data: unknown }).data);
  }

  async getMaxBuySell(
    accountNo: string, symbol: string, price: number,
  ): Promise<MaxBuySellResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(price, 'price');
    const params = { accountNo, symbol, price };
    const data = await this.restClient.get<{ data: unknown }>(EP_TRADING_MAX_BUY_SELL, params);
    return mapMaxBuySell((data as { data: unknown }).data);
  }

  async getMaxBuySellAtMarketPrice(
    accountNo: string, symbol: string,
  ): Promise<MaxBuySellResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    const params = { accountNo, symbol };
    const data = await this.restClient.get<{ data: unknown }>(EP_TRADING_MAX_BUY_SELL, params);
    return mapMaxBuySell((data as { data: unknown }).data);
  }

  // ---------------------------------------------------------------------------
  // Flexible Conditional Orders (FCO)
  // ---------------------------------------------------------------------------

  private async postFcoPayload(payload: Record<string, unknown>): Promise<FCOPlaceResponse> {
    const sig = this.signPayload(payload);
    const data = await this.restClient.post<{ data: unknown }>(
      EP_TRADING_FCO_ORDER,
      payload,
      { [HEADER_SIGNATURE]: sig },
    );
    return mapFcoPlaceResponse(data);
  }

  async placeFcoGtd(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: number | string | OrderType,
    priceSlip: number,
    fromDate: string,
    toDate: string,
  ): Promise<FCOPlaceResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(quantity, 'quantity');
    const payload = buildGtdPayload({
      accountNo,
      symbol,
      side,
      quantity,
      price,
      priceSlip,
      fromDate,
      toDate,
    });
    return this.postFcoPayload(payload);
  }

  async placeFcoStop(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    stopPrice: number,
    operator: FCOOperator,
    fromDate: string,
    toDate: string,
  ): Promise<FCOPlaceResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(quantity, 'quantity');
    const payload = buildStopPayload({
      accountNo,
      symbol,
      side,
      quantity,
      stopPrice,
      operator,
      fromDate,
      toDate,
      fcoType: FCOType.STOP,
    });
    return this.postFcoPayload(payload);
  }

  async placeFcoStopLimit(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: number | string,
    priceSlip: number,
    stopPrice: number,
    operator: FCOOperator,
    fromDate: string,
    toDate: string,
  ): Promise<FCOPlaceResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(quantity, 'quantity');
    const payload = buildStopPayload({
      accountNo,
      symbol,
      side,
      quantity,
      price,
      priceSlip,
      stopPrice,
      operator,
      fromDate,
      toDate,
      fcoType: FCOType.STOP_LIMIT,
    });
    return this.postFcoPayload(payload);
  }

  async placeFcoTrailingStop(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    activePrice: number,
    trailingAmount: number,
    fromDate: string,
    toDate: string,
  ): Promise<FCOPlaceResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(quantity, 'quantity');
    const payload = buildTrailingStopPayload({
      accountNo,
      symbol,
      side,
      quantity,
      activePrice,
      trailingAmount,
      fromDate,
      toDate,
      fcoType: FCOType.TRAILING_STOP,
    });
    return this.postFcoPayload(payload);
  }

  async placeFcoTrailingStopLimit(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    activePrice: number,
    trailingAmount: number,
    priceSlip: number,
    fromDate: string,
    toDate: string,
  ): Promise<FCOPlaceResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(quantity, 'quantity');
    const payload = buildTrailingStopPayload({
      accountNo,
      symbol,
      side,
      quantity,
      activePrice,
      trailingAmount,
      priceSlip,
      fromDate,
      toDate,
      fcoType: FCOType.TRAILING_STOP_LIMIT,
    });
    return this.postFcoPayload(payload);
  }

  async placeFcoOco(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    tpActivePrice: number,
    slActivePrice: number,
    tpPrice: number | string | OrderType,
    slPrice: number | string | OrderType,
    tpSlip: number,
    slSlip: number,
    fromDate: string,
    toDate: string,
  ): Promise<FCOPlaceResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(quantity, 'quantity');
    const payload = buildOcoPayload({
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
    });
    return this.postFcoPayload(payload);
  }

  async placeFcoBullBear(
    accountNo: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: number | string | OrderType,
    priceSlip: number,
    tpActivePrice: number,
    slActivePrice: number,
    tpPrice: number | string | OrderType,
    slPrice: number | string | OrderType,
    tpSlip: number,
    slSlip: number,
    fromDate: string,
    toDate: string,
  ): Promise<FCOPlaceResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    requirePositiveNumber(quantity, 'quantity');
    const payload = buildBullBearPayload({
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
    });
    return this.postFcoPayload(payload);
  }

  async cancelFco(fcoId: string): Promise<FCOCancelResponse> {
    requireString(fcoId, 'fcoId');
    const payload = { fcoId };
    const sig = this.signPayload(payload);
    const data = await this.restClient.delete<{ data: unknown }>(
      EP_TRADING_FCO_ORDER,
      payload,
      { [HEADER_SIGNATURE]: sig },
    );
    return mapFcoCancelResponse(data);
  }

  private async getFcoListInternal(params: Record<string, unknown>): Promise<FCOListResponse> {
    const data = await this.restClient.get<{ data: unknown }>(EP_TRADING_FCO_LIST, params);
    return mapFcoListResponse(data);
  }

  async getFcoByAccountNo(
    accountNo: string, pageIndex = 1, pageSize = 10,
  ): Promise<FCOListResponse> {
    requireString(accountNo, 'accountNo');
    return this.getFcoListInternal({ accountNo, pageIndex, pageSize });
  }

  async getFcoBySymbol(
    accountNo: string, symbol: string, pageIndex = 1, pageSize = 10,
  ): Promise<FCOListResponse> {
    requireString(accountNo, 'accountNo');
    requireString(symbol, 'symbol');
    return this.getFcoListInternal({ accountNo, symbol, pageIndex, pageSize });
  }

  async getFcoByStatus(
    accountNo: string, processStatus: string | FCOStatus, pageIndex = 1, pageSize = 10,
  ): Promise<FCOListResponse> {
    requireString(accountNo, 'accountNo');
    return this.getFcoListInternal({ accountNo, processStatus, pageIndex, pageSize });
  }

  async getFcoByDate(
    accountNo: string, fromDate: string, toDate: string, pageIndex = 1, pageSize = 10,
  ): Promise<FCOListResponse> {
    requireString(accountNo, 'accountNo');
    return this.getFcoListInternal({ accountNo, from: fromDate, to: toDate, pageIndex, pageSize });
  }

  async getFcoById(
    accountNo: string, fcoId: string,
  ): Promise<FCOInfo | null> {
    requireString(accountNo, 'accountNo');
    requireString(fcoId, 'fcoId');
    const res = await this.getFcoListInternal({ accountNo, fcoId });
    return res.fcoList.length > 0 ? res.fcoList[0] : null;
  }

  async getFcoOrderBook(
    fcoId: string, pageIndex = 1, pageSize = 10,
  ): Promise<FCOOrderBookResponse> {
    requireString(fcoId, 'fcoId');
    const params = { fcoId, pageIndex, pageSize };
    const data = await this.restClient.get<{ data: unknown }>(EP_TRADING_FCO_ORDER_BOOK, params);
    return mapFcoOrderBookResponse(data);
  }
}


// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapPlaceOrderResponse(raw: unknown): PlaceOrderResponse {
  const r = raw as Record<string, unknown>;
  return {
    orderId: String(r['orderId'] ?? ''),
    clientRequestId: String(r['clientRequestId'] ?? ''),
    status: (r['orderStatus'] as OrderStatus) ?? OrderStatus.PENDING,
  };
}

function mapModifyOrderResponse(raw: unknown): ModifyOrderResponse {
  const r = raw as Record<string, unknown>;
  return {
    clientModifyId: String(r['clientModifyId'] ?? ''),
    orderId: String(r['orderId'] ?? ''),
    clientRequestId: String(r['clientRequestId'] ?? ''),
    status: (r['orderStatus'] as OrderStatus) ?? OrderStatus.PENDING,
  };
}

function mapCancelOrderResponse(raw: unknown): CancelOrderResponse {
  const r = raw as Record<string, unknown>;
  return {
    clientCancelId: String(r['clientCancelId'] ?? ''),
    orderId: String(r['orderId'] ?? ''),
    clientRequestId: String(r['clientRequestId'] ?? ''),
    status: (r['orderStatus'] as OrderStatus) ?? OrderStatus.PENDING,
  };
}

function mapMaxBuySell(raw: unknown): MaxBuySellResponse {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    symbol: String(r['symbol'] ?? ''),
    maxBuyQuantity: toInt(r['maxBuyQty']),
    maxSellQuantity: toInt(r['maxSellQty']),
    marginRatio: String(r['marginRatio'] ?? ''),
    purchasePower: String(r['purchasePower'] ?? ''),
  };
}

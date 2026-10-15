import { RestClient } from '../transport/restClient.js';
import {
  EP_ACCOUNT_BALANCE,
  EP_ACCOUNT_PPMMR,
  EP_ORDER_HISTORY,
  EP_POSITIONS,
  DEFAULT_PAGE,
  DEFAULT_SIZE,
} from '../constants.js';
import {
  AccountBalance,
  AllDerivativePosition,
  DerivativeAccountBalance,
  DerivativePPMMR,
  DerivativePosition,
  EquityAccountBalance,
  EquityPPMMR,
  EquityPosition,
  Order,
  OrderBook,
  PPMMR,
  Position,
  accountBalanceFromDict,
  accountBalanceToParams,
  orderBookFromDict,
  orderBookToParams,
  positionFromDict,
  positionsToParams,
  ppmmrFromDict,
  ppmmrToParams,
} from '../models/portfolio.js';
import { todayDateStr } from '../utils/datetime.js';
import { requireNonEmpty } from '../utils/validator.js';

export class PortfolioService {
  constructor(private readonly restClient: RestClient) {}

  private get clientId(): string {
    return this.restClient.getConfig().clientId;
  }

  private async fetchBalance(accountNo: string): Promise<AccountBalance> {
    const params = accountBalanceToParams({ clientId: this.clientId, accountNo });
    return accountBalanceFromDict(await this.restClient.get(EP_ACCOUNT_BALANCE, params));
  }

  /** Equity balance of a trading account; `undefined` when the account has no equity section. */
  async getEquityBalance(accountNo: string): Promise<EquityAccountBalance | undefined> {
    requireNonEmpty(accountNo, 'accountNo');
    return (await this.fetchBalance(accountNo)).equity;
  }

  /** Derivative balance of a trading account; `undefined` when it has no derivative section. */
  async getDerivativeBalance(accountNo: string): Promise<DerivativeAccountBalance | undefined> {
    requireNonEmpty(accountNo, 'accountNo');
    return (await this.fetchBalance(accountNo)).derivative;
  }

  private async fetchOrderBook(accountNo: string, fromDate: string, toDate: string): Promise<OrderBook> {
    const params = orderBookToParams({ accountNo, fromDate, toDate, page: DEFAULT_PAGE, size: DEFAULT_SIZE });
    return orderBookFromDict(await this.restClient.get(EP_ORDER_HISTORY, params));
  }

  /** Today's orders of a trading account. */
  async getTodayOrders(accountNo: string): Promise<Order[]> {
    requireNonEmpty(accountNo, 'accountNo');
    const today = todayDateStr();
    return (await this.fetchOrderBook(accountNo, today, today)).orders;
  }

  /** Orders within a date range (`YYYY/MM/DD`). */
  async getHistoricalOrders(accountNo: string, fromDate: string, toDate: string): Promise<Order[]> {
    requireNonEmpty(accountNo, 'accountNo');
    requireNonEmpty(fromDate, 'fromDate');
    requireNonEmpty(toDate, 'toDate');
    return (await this.fetchOrderBook(accountNo, fromDate, toDate)).orders;
  }

  private async fetchPositions(accountNo: string): Promise<Position> {
    const params = positionsToParams({ clientId: this.clientId, accountNo });
    return positionFromDict(await this.restClient.get(EP_POSITIONS, params), accountNo);
  }

  /** Equity positions; `undefined` when the account has none. */
  async getEquityPositions(accountNo: string): Promise<EquityPosition[] | undefined> {
    requireNonEmpty(accountNo, 'accountNo');
    return (await this.fetchPositions(accountNo)).equity;
  }

  /** Open and closed derivative positions; `undefined` when the account has none. */
  async getDerivativePositions(accountNo: string): Promise<AllDerivativePosition | undefined> {
    requireNonEmpty(accountNo, 'accountNo');
    return (await this.fetchPositions(accountNo)).derivative;
  }

  /** Open derivative positions (empty when the account has no derivative section). */
  async getOpenDerivativePositions(accountNo: string): Promise<DerivativePosition[]> {
    return (await this.getDerivativePositions(accountNo))?.openPositions ?? [];
  }

  /** Closed derivative positions (empty when the account has no derivative section). */
  async getClosedDerivativePositions(accountNo: string): Promise<DerivativePosition[]> {
    return (await this.getDerivativePositions(accountNo))?.closedPositions ?? [];
  }

  private async fetchPpmmr(accountNo: string): Promise<PPMMR> {
    return ppmmrFromDict(await this.restClient.get(EP_ACCOUNT_PPMMR, ppmmrToParams({ accountNo })));
  }

  /** Equity purchasing power and margin ratios; `undefined` when the account has no equity section. */
  async getEquityPpmmr(accountNo: string): Promise<EquityPPMMR | undefined> {
    requireNonEmpty(accountNo, 'accountNo');
    return (await this.fetchPpmmr(accountNo)).equity;
  }

  /** Derivative purchasing power and margin ratios; `undefined` when it has no derivative section. */
  async getDerivativePpmmr(accountNo: string): Promise<DerivativePPMMR | undefined> {
    requireNonEmpty(accountNo, 'accountNo');
    return (await this.fetchPpmmr(accountNo)).derivative;
  }
}

import { RestClient } from '../transport/restClient.js';
import {
  EP_ACCOUNT_BALANCE,
  EP_ACCOUNT_PPMMR,
  EP_POSITIONS,
  EP_ORDER_HISTORY,
  DEFAULT_PAGE,
  DEFAULT_SIZE,
} from '../constants.js';
import {
  EquityAccountBalance,
  DerivativeAccountBalance,
  EquityPosition,
  DerivativePosition,
  AllDerivativePosition,
  EquityPPMMR,
  DerivativePPMMR,
  Order,
} from '../models/portfolio.js';
import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import { toFloat, toInt } from '../utils/converter.js';
import { requireString } from '../utils/validator.js';

export class PortfolioService {
  constructor(
    private readonly restClient: RestClient,
    private readonly clientId: string,
  ) {}

  async getEquityBalance(accountNo: string): Promise<EquityAccountBalance> {
    requireString(accountNo, 'accountNo');
    const data = await this.restClient.get<{ data: Record<string, unknown> }>(
      EP_ACCOUNT_BALANCE, { clientId: this.clientId, accountNo, type: 'equity' },
    );
    const balance = (data as { data: Record<string, unknown> }).data ?? {};
    return mapEquityBalance(balance['equity'] ?? balance);
  }

  async getDerivativeBalance(accountNo: string): Promise<DerivativeAccountBalance> {
    requireString(accountNo, 'accountNo');
    const data = await this.restClient.get<{ data: Record<string, unknown> }>(
      EP_ACCOUNT_BALANCE, { clientId: this.clientId, accountNo, type: 'derivative' },
    );
    const balance = (data as { data: Record<string, unknown> }).data ?? {};
    return mapDerivativeBalance(balance['derivative'] ?? balance);
  }

  async getTodayOrders(accountNo: string): Promise<Order[]> {
    requireString(accountNo, 'accountNo');
    const today = formatDate(new Date());
    const data = await this.restClient.get<{ data: { orderList: unknown[] } }>(
      EP_ORDER_HISTORY,
      { accountNo, from: today, to: today, pageIndex: DEFAULT_PAGE, pageSize: DEFAULT_SIZE },
    );
    const orders = (data as { data: { orderList: unknown[] } }).data?.orderList ?? [];
    return orders.map(mapOrder);
  }

  async getHistoricalOrders(
    accountNo: string, from: string, to: string,
  ): Promise<Order[]> {
    requireString(accountNo, 'accountNo');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    const data = await this.restClient.get<{ data: { orderList: unknown[] } }>(
      EP_ORDER_HISTORY,
      { accountNo, from, to, pageIndex: DEFAULT_PAGE, pageSize: DEFAULT_SIZE },
    );
    const orders = (data as { data: { orderList: unknown[] } }).data?.orderList ?? [];
    return orders.map(mapOrder);
  }

  async getEquityPositions(accountNo: string): Promise<EquityPosition[]> {
    requireString(accountNo, 'accountNo');
    const data = await this.restClient.get<{ data: Record<string, unknown> }>(
      EP_POSITIONS, { clientId: this.clientId, accountNo, type: 'equity' },
    );
    const pos = (data as { data: Record<string, unknown> }).data ?? {};
    const items = (pos['equity'] ?? pos) as unknown[];
    return Array.isArray(items) ? items.map(mapEquityPosition) : [];
  }

  async getDerivativePositions(accountNo: string): Promise<AllDerivativePosition> {
    requireString(accountNo, 'accountNo');
    const data = await this.restClient.get<{ data: Record<string, unknown> }>(
      EP_POSITIONS, { clientId: this.clientId, accountNo, type: 'derivative' },
    );
    const pos = (data as { data: Record<string, unknown> }).data ?? {};
    return mapAllDerivativePosition(pos['derivative'] ?? pos);
  }

  async getOpenDerivativePositions(accountNo: string): Promise<DerivativePosition[]> {
    requireString(accountNo, 'accountNo');
    const all = await this.getDerivativePositions(accountNo);
    return all.openPositions;
  }

  async getClosedDerivativePositions(accountNo: string): Promise<DerivativePosition[]> {
    requireString(accountNo, 'accountNo');
    const all = await this.getDerivativePositions(accountNo);
    return all.closedPositions;
  }

  async getEquityPpmmr(accountNo: string): Promise<EquityPPMMR> {
    requireString(accountNo, 'accountNo');
    const data = await this.restClient.get<{ data: unknown }>(
      EP_ACCOUNT_PPMMR, { accountNo, type: 'equity' },
    );
    return mapEquityPpmmr((data as { data: unknown }).data);
  }

  async getDerivativePpmmr(accountNo: string): Promise<DerivativePPMMR> {
    requireString(accountNo, 'accountNo');
    const data = await this.restClient.get<{ data: unknown }>(
      EP_ACCOUNT_PPMMR, { accountNo, type: 'derivative' },
    );
    return mapDerivativePpmmr((data as { data: unknown }).data);
  }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapEquityBalance(raw: unknown): EquityAccountBalance {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    availableCash: toFloat(r['availableCash']),
    totalDebt: toFloat(r['totalDebt']),
    interestLoan: toFloat(r['interestLoan']),
    overdueFeeLoan: toFloat(r['overdueFeeLoan']),
    withdrawal: toFloat(r['withdrawal']),
    onHoldCash: toFloat(r['onHoldCash']),
    sellUnmatched: toFloat(r['sellUnmatched']),
    sellT0: toFloat(r['sellT0']),
    sellT1: toFloat(r['sellT1']),
    sellT2: toFloat(r['sellT2']),
    buyUnmatched: toFloat(r['buyUnmatched']),
    buyT0: toFloat(r['buyT0']),
    buyT1: toFloat(r['buyT1']),
    buyT2: toFloat(r['buyT2']),
    advanceCashT0: toFloat(r['advanceCashT0']),
    advanceCashT1: toFloat(r['advanceCashT1']),
    holdSubscription: toFloat(r['holdSubscription']),
    bankBalance: toFloat(r['bankBalance']),
    dividend: toFloat(r['dividend']),
    dividendMargin: toFloat(r['dividendMargin']),
    blockCash: toFloat(r['blockCash']),
    interestCash: toFloat(r['interestCash']),
    limitT0: toFloat(r['limitT0']),
    termDeposit: toFloat(r['termDeposit']),
  };
}

function mapDerivativeBalance(raw: unknown): DerivativeAccountBalance {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    accountBalance: toFloat(r['accountBalance']),
    fee: toFloat(r['fee']),
    commission: toFloat(r['commission']),
    interest: toFloat(r['interest']),
    extInterest: toFloat(r['extInterest']),
    loan: toFloat(r['loan']),
    deliveryAmount: toFloat(r['deliveryAmount']),
    floatingPl: toFloat(r['floatingPL']),
    tradingPl: toFloat(r['tradingPL']),
    totalPl: toFloat(r['totalPL']),
    withdrawable: toFloat(r['withdrawable']),
    cashSsi: toFloat(r['cashSSI']),
    validNonCashSsi: toFloat(r['validNonCashSSI']),
    cashWithdrawableSsi: toFloat(r['cashWithdrawableSSI']),
    cashVsdc: toFloat(r['cashVSDC']),
    validNonCashVsdc: toFloat(r['validNonCashVSDC']),
    cashWithdrawableVsdc: toFloat(r['cashWithdrawableVSDC']),
  };
}

function mapEquityPosition(raw: unknown): EquityPosition {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    symbol: String(r['symbol'] ?? ''),
    quantity: toInt(r['quantity']),
    blockQuantity: toInt(r['blockQuantity']),
    dividendQuantity: toInt(r['dividendQuantity']),
    buyingQuantity: toInt(r['buyingQuantity']),
    boughtQuantity: toInt(r['boughtQuantity']),
    sellingQuantity: toInt(r['sellingQuantity']),
    soldQuantity: toInt(r['soldQuantity']),
    t1SellQuantity: toInt(r['t1SellQuantity']),
    t2SellQuantity: toInt(r['t2SellQuantity']),
    costPrice: toFloat(r['costPrice']),
    mortgageQuantity: toInt(r['mortgageQuantity']),
    sellableQuantity: toInt(r['sellableQuantity']),
    restrictedQuantity: toInt(r['restrictedQuantity']),
  };
}

function mapDerivativePosition(raw: unknown): DerivativePosition {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    symbol: String(r['symbol'] ?? ''),
    long: toInt(r['long']),
    short: toInt(r['short']),
    net: toInt(r['net']),
    bidAvgPrice: toFloat(r['bidAvgPrice']),
    askAvgPrice: toFloat(r['askAvgPrice']),
    tradePrice: toFloat(r['tradePrice']),
    floatingPl: toFloat(r['floatingPL']),
    tradingPl: toFloat(r['tradingPL']),
  };
}

function mapAllDerivativePosition(raw: unknown): AllDerivativePosition {
  const r = raw as Record<string, unknown>;
  const open = ((r['derOpenPositions'] as unknown[]) ?? []).map(mapDerivativePosition);
  const closed = ((r['derClosePositions'] as unknown[]) ?? []).map(mapDerivativePosition);
  return { openPositions: open, closedPositions: closed };
}

function mapOrder(raw: unknown): Order {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    clientRequestId: String(r['clientRequestId'] ?? ''),
    orderId: String(r['orderId'] ?? ''),
    symbol: String(r['symbol'] ?? ''),
    side: (r['side'] as OrderSide) ?? OrderSide.BUY,
    orderType: (r['orderType'] as OrderType) ?? OrderType.LO,
    price: toFloat(r['price']),
    avgPrice: toFloat(r['avgPrice']),
    quantity: toInt(r['quantity']),
    osQuantity: toInt(r['osQuantity']),
    filledQuantity: toInt(r['filledQuantity']),
    cancelQuantity: toInt(r['cancelQuantity']),
    status: (r['orderStatus'] as OrderStatus) ?? OrderStatus.PENDING,
    inputTime: String(r['inputTime'] ?? ''),
    modifyTime: String(r['modifiedTime'] ?? ''),
    message: String(r['message'] ?? ''),
  };
}

function mapEquityPpmmr(raw: unknown): EquityPPMMR {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    dividend: toFloat(r['dividend']),
    loanValue: toFloat(r['loanValue']),
    totalDebt: toFloat(r['totalDebt']),
    debt: toFloat(r['debt']),
    liability: toFloat(r['liability']),
    liabilitySsi: toFloat(r['liabilitySSI']),
    netLiability: toFloat(r['netLiability']),
    fees: toFloat(r['fees']),
    interestSsi: toFloat(r['interestSSI']),
    interestSpv: toFloat(r['interestSPV']),
    withdrawable: toFloat(r['withdrawable']),
    ee: toFloat(r['ee']),
    ee50: toFloat(r['ee50']),
    ee60: toFloat(r['ee60']),
    ee70: toFloat(r['ee70']),
    ee80: toFloat(r['ee80']),
    ee90: toFloat(r['ee90']),
    action: toFloat(r['action']),
    actionSsi: toFloat(r['actionSSI']),
    equity: toFloat(r['equity']),
    equitySsi: toFloat(r['equitySSI']),
    eeCash: toFloat(r['eeCash']),
    holdSubscription: toFloat(r['holdSubscription']),
    bankBalance: toFloat(r['bankBalance']),
    onHoldCash: toFloat(r['onHoldCash']),
    doverdue: toFloat(r['doverdue']),
    doverdueSsi: toFloat(r['doverdueSSI']),
    accountBalance: toFloat(r['accountBalance']),
    d: toFloat(r['D']),
    dSpv: toFloat(r['dSPV']),
    dSsi: toFloat(r['dSSI']),
    cia: toFloat(r['cia']),
    collateralAsset: toFloat(r['collateralAsset']),
    collateralAssetSsi: toFloat(r['collateralAssetSSI']),
    totalAssets: toFloat(r['totalAssets']),
    totalEquity: toFloat(r['totalEquity']),
    totalEquitySsi: toFloat(r['totalEquitySSI']),
    lmv: toFloat(r['lmv']),
    lmvMargin: toFloat(r['lmvMargin']),
    lmvMarginSsi: toFloat(r['lmvMarginSSI']),
    callLmv: toFloat(r['callLmv']),
    forceLmv: toFloat(r['forceLmv']),
    callLmvSsi: toFloat(r['callLmvSSI']),
    forceLmvSsi: toFloat(r['forceLmvSSI']),
    lmvNonMarginable: toFloat(r['lmvNonMarginable']),
    lmvNonMarginableSsi: toFloat(r['lmvNonMarginableSSI']),
    preLoan: toFloat(r['preLoan']),
    marginRatio: toFloat(r['marginRatio']),
    marginRatioSsi: toFloat(r['marginRatioSSI']),
    purchasingPower: toFloat(r['purchasingPower']),
    eeOrigin: toFloat(r['eeOrigin']),
    buyUnmatched: toFloat(r['buyUnmatched']),
    sellUnmatched: toFloat(r['sellUnmatched']),
    buyT0: toFloat(r['buyT0']),
    sellT0: toFloat(r['sellT0']),
    sellT1: toFloat(r['sellT1']),
    sellT2: toFloat(r['sellT2']),
    buyT1: toFloat(r['buyT1']),
    buyT2: toFloat(r['buyT2']),
    creditLimit: toFloat(r['creditLimit']),
    marginCallLmvSold: toFloat(r['marginCallLmvSold']),
    marginCallLmvSoldSsi: toFloat(r['marginCallLmvSoldSSI']),
    marginCall: toFloat(r['marginCall']),
    marginCallSsi: toFloat(r['marginCallSSI']),
    collateralA: toFloat(r['collateralA']),
    collateralNon: toFloat(r['collateralNon']),
    collateralASsi: toFloat(r['collateralASSI']),
    collateralNonSsi: toFloat(r['collateralNonSSI']),
    callMargin: toFloat(r['callMargin']),
    callForceSell: toFloat(r['callForceSell']),
    callMarginSsi: toFloat(r['callMarginSSI']),
    callForceSellSsi: toFloat(r['callForceSellSSI']),
    ar: toFloat(r['ar']),
  };
}

function mapDerivativePpmmr(raw: unknown): DerivativePPMMR {
  const r = raw as Record<string, unknown>;
  return {
    accountNo: String(r['accountNo'] ?? ''),
    accountBalance: toFloat(r['accountBalance']),
    fee: toFloat(r['fee']),
    commission: toFloat(r['commission']),
    interest: toFloat(r['interest']),
    loan: toFloat(r['loan']),
    deliveryAmount: toFloat(r['deliveryAmount']),
    floatingPl: toFloat(r['floatingPL']),
    tradingPl: toFloat(r['tradingPL']),
    totalPl: toFloat(r['totalPL']),
    marginable: toFloat(r['marginable']),
    depositable: toFloat(r['depositable']),
    rcCall: toFloat(r['rcCall']),
    withdrawable: toFloat(r['withdrawable']),
    nonCashDrawableRcCall: toFloat(r['nonCashDrawableRcCall']),
    cashSsi: toFloat(r['cashSSI']),
    validNonCashSsi: toFloat(r['validNonCashSSI']),
    totalAssetSsi: toFloat(r['totalAssetSSI']),
    withdrawableSsi: toFloat(r['withdrawableSSI']),
    eeSsi: toFloat(r['eeSSI']),
    cashVsdc: toFloat(r['cashVSDC']),
    validNonCashVsdc: toFloat(r['validNonCashVSDC']),
    totalAssetVsdc: toFloat(r['totalAssetVSDC']),
    withdrawableVsdc: toFloat(r['withdrawableVSDC']),
    eeVsdc: toFloat(r['eeVSDC']),
    spreadMarginSsi: toFloat(r['spreadMarginSSI']),
    deliveryMarginSsi: toFloat(r['deliveryMarginSSI']),
    marginReqSsi: toFloat(r['marginReqSSI']),
    accountRatioSsi: toFloat(r['accountRatioSSI']),
    usedLimitWarningLevel1Ssi: toFloat(r['usedLimitWarningLevel1SSI']),
    usedLimitWarningLevel2Ssi: toFloat(r['usedLimitWarningLevel2SSI']),
    usedLimitWarningLevel3Ssi: toFloat(r['usedLimitWarningLevel3SSI']),
    marginCallSsi: toFloat(r['marginCallSSI']),
    spreadMarginVsdc: toFloat(r['spreadMarginVSDC']),
    deliveryMarginVsdc: toFloat(r['deliveryMarginVSDC']),
    marginReqVsdc: toFloat(r['marginReqVSDC']),
    accountRatioVsdc: toFloat(r['accountRatioVSDC']),
    usedLimitWarningLevel1Vsdc: toFloat(r['usedLimitWarningLevel1VSDC']),
    usedLimitWarningLevel2Vsdc: toFloat(r['usedLimitWarningLevel2VSDC']),
    usedLimitWarningLevel3Vsdc: toFloat(r['usedLimitWarningLevel3VSDC']),
    marginCallVsdc: toFloat(r['marginCallVSDC']),
    totalEquity: toFloat(r['totalEquity']),
    extInterest: toFloat(r['extInterest']),
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

import { DEFAULT_PAGE, DEFAULT_SIZE } from '../constants.js';
import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';
import {
  Dict,
  isNoContent,
  pick,
  toEnum,
  toFloat,
  toInt,
  toNumber,
  toOptInt,
  toPrice,
} from '../utils/converter.js';
import { withDeprecatedAlias } from '../utils/deprecated.js';

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** A non-empty section of a payload, or `undefined`. */
function section(value: unknown): Dict | undefined {
  return isRecord(value) && Object.keys(value).length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Account Balances
// ---------------------------------------------------------------------------
export interface AccountBalanceRequest {
  clientId: string;
  accountNo?: string;
}

export function accountBalanceToParams(req: AccountBalanceRequest): Dict {
  const params: Dict = { clientId: req.clientId };
  if (req.accountNo !== undefined && req.accountNo !== null) params.accountNo = req.accountNo;
  return params;
}

export interface EquityAccountBalance {
  accountNo: string;
  accountBalance: number;
  totalDebt: number;
  interestLoan: number;
  overdueFeeLoan: number;
  withdrawable: number;
  onHoldCash: number;
  sellUnmatched: number;
  sellT0: number;
  sellT1: number;
  sellT2: number;
  buyUnmatched: number;
  buyT0: number;
  buyT1: number;
  buyT2: number;
  advanceCashT0: number;
  advanceCashT1: number;
  holdSubscription: number;
  dividend: number;
}

export function equityAccountBalanceFromDict(data: Dict): EquityAccountBalance {
  return {
    accountNo: str(data.accountNo),
    accountBalance: toFloat(data.accountBalance),
    totalDebt: toFloat(data.totalDebt),
    interestLoan: toFloat(data.interestLoan),
    overdueFeeLoan: toFloat(data.overdueFeeLoan),
    withdrawable: toFloat(data.withdrawable),
    onHoldCash: toFloat(data.onHoldCash),
    sellUnmatched: toFloat(data.sellUnmatched),
    sellT0: toFloat(data.sellT0),
    sellT1: toFloat(data.sellT1),
    sellT2: toFloat(data.sellT2),
    buyUnmatched: toFloat(data.buyUnmatched),
    buyT0: toFloat(data.buyT0),
    buyT1: toFloat(data.buyT1),
    buyT2: toFloat(data.buyT2),
    advanceCashT0: toFloat(pick(data, ['advancedCashT0', 'advanceCashT0'])),
    advanceCashT1: toFloat(pick(data, ['advancedCashT1', 'advanceCashT1'])),
    holdSubscription: toFloat(data.holdSubscription),
    dividend: toFloat(data.dividend),
  };
}

export interface DerivativeAccountBalance {
  accountNo: string;
  accountBalance: number;
  fee: number;
  commission: number;
  interest: number;
  extInterest: number;
  loan: number;
  deliveryAmount: number;
  floatingPl: number;
  tradingPl: number;
  totalPl: number;
  withdrawable: number;
  cashSsi: number;
  validNonCashSsi: number;
  withdrawableSsi: number;
  cashVsdc: number;
  validNonCashVsdc: number;
  withdrawableVsdc: number;
  /** @deprecated Use `withdrawableSsi`. */
  readonly cashWithdrawableSsi: number;
  /** @deprecated Use `withdrawableVsdc`. */
  readonly cashWithdrawableVsdc: number;
}

export function derivativeAccountBalanceFromDict(data: Dict): DerivativeAccountBalance {
  const balance = {
    accountNo: str(data.accountNo),
    accountBalance: toFloat(data.accountBalance),
    fee: toFloat(data.fee),
    commission: toFloat(data.commission),
    interest: toFloat(data.interest),
    extInterest: toFloat(data.extInterest),
    loan: toFloat(data.loan),
    deliveryAmount: toFloat(data.deliveryAmount),
    floatingPl: toFloat(data.floatingPL),
    tradingPl: toFloat(data.tradingPL),
    totalPl: toFloat(data.totalPL),
    withdrawable: toFloat(data.withdrawable),
    cashSsi: toFloat(data.cashSSI),
    validNonCashSsi: toFloat(data.validNonCashSSI),
    withdrawableSsi: toFloat(pick(data, ['withdrawableSSI', 'cashWithdrawableSSI'])),
    cashVsdc: toFloat(data.cashVSDC),
    validNonCashVsdc: toFloat(data.validNonCashVSDC),
    withdrawableVsdc: toFloat(pick(data, ['withdrawableVSDC', 'cashWithdrawableVSDC'])),
  };
  withDeprecatedAlias(balance, 'cashWithdrawableSsi', 'withdrawableSsi');
  withDeprecatedAlias(balance, 'cashWithdrawableVsdc', 'withdrawableVsdc');
  return balance as DerivativeAccountBalance;
}

/** `equity`/`derivative` are `undefined` when the account has no such section. */
export interface AccountBalance {
  equity?: EquityAccountBalance;
  derivative?: DerivativeAccountBalance;
}

export function accountBalanceFromDict(data: unknown): AccountBalance {
  const record: Dict = isRecord(data) ? data : {};
  const equity = section(record.equity);
  const derivative = section(record.derivative);
  return {
    equity: equity ? equityAccountBalanceFromDict(equity) : undefined,
    derivative: derivative ? derivativeAccountBalanceFromDict(derivative) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------
export interface PositionsRequest {
  clientId: string;
  accountNo?: string;
  /** Default true; always sent explicitly as "true"/"false". */
  querySummary?: boolean;
}

export function positionsToParams(req: PositionsRequest): Dict {
  const params: Dict = {
    clientId: req.clientId,
    querySummary: (req.querySummary ?? true) ? 'true' : 'false',
  };
  if (req.accountNo !== undefined && req.accountNo !== null) params.accountNo = req.accountNo;
  return params;
}

export interface EquityPosition {
  accountNo: string;
  symbol: string;
  quantity: number;
  blockQuantity: number;
  dividendQuantity: number;
  buyingQuantity: number;
  boughtQuantity: number;
  sellingQuantity: number;
  soldQuantity: number;
  t1SellQuantity: number;
  t2SellQuantity: number;
  t1BuyQuantity: number;
  t2BuyQuantity: number;
  costPrice: number;
  mortgageQuantity: number;
  sellableQuantity: number;
  restrictedQuantity: number;
}

export function equityPositionsFromList(data: unknown[]): EquityPosition[] {
  return data.filter(isRecord).map((item) => ({
    accountNo: str(item.accountNo),
    symbol: str(item.symbol),
    quantity: toInt(item.quantity),
    blockQuantity: toInt(item.blockQuantity),
    dividendQuantity: toInt(item.dividendQuantity),
    buyingQuantity: toInt(item.buyingQuantity),
    boughtQuantity: toInt(item.boughtQuantity),
    sellingQuantity: toInt(item.sellingQuantity),
    soldQuantity: toInt(item.soldQuantity),
    t1SellQuantity: toInt(item.t1SellQuantity),
    t2SellQuantity: toInt(item.t2SellQuantity),
    t1BuyQuantity: toInt(item.t1BuyQuantity),
    t2BuyQuantity: toInt(item.t2BuyQuantity),
    costPrice: toFloat(item.costPrice),
    mortgageQuantity: toInt(item.mortgageQuantity),
    sellableQuantity: toInt(item.sellableQuantity),
    restrictedQuantity: toInt(item.restrictedQuantity),
  }));
}

export interface DerivativePosition {
  accountNo: string;
  symbol: string;
  long: number;
  short: number;
  /** May be negative. */
  net: number;
  bidAvgPrice: number;
  askAvgPrice: number;
  tradePrice: number;
  floatingPl: number;
  tradingPl: number;
}

/** `accountNo` is attached to items that carry none of their own. */
export function derivativePositionsFromList(data: unknown[], accountNo = ''): DerivativePosition[] {
  return data.filter(isRecord).map((item) => ({
    accountNo: str(item.accountNo) || accountNo,
    symbol: str(item.symbol),
    long: toInt(item.long),
    short: toInt(item.short),
    net: toInt(item.net),
    bidAvgPrice: toFloat(item.bidAvgPrice),
    askAvgPrice: toFloat(item.askAvgPrice),
    tradePrice: toFloat(item.tradePrice),
    floatingPl: toFloat(item.floatingPL),
    tradingPl: toFloat(item.tradingPL),
  }));
}

export interface AllDerivativePosition {
  openPositions: DerivativePosition[];
  closedPositions: DerivativePosition[];
  accountNo: string;
}

/**
 * The server answers one object `{derOpenPositions, derClosePositions}`; a bare array is read as
 * the open positions. Absent keys give empty lists.
 */
export function allDerivativePositionFromDict(data: unknown, accountNo = ''): AllDerivativePosition {
  if (Array.isArray(data)) {
    return { openPositions: derivativePositionsFromList(data, accountNo), closedPositions: [], accountNo };
  }
  if (!isRecord(data)) return { openPositions: [], closedPositions: [], accountNo };
  const open = Array.isArray(data.derOpenPositions) ? data.derOpenPositions : [];
  const closed = Array.isArray(data.derClosePositions) ? data.derClosePositions : [];
  return {
    openPositions: derivativePositionsFromList(open, accountNo),
    closedPositions: derivativePositionsFromList(closed, accountNo),
    accountNo,
  };
}

/** `equity`/`derivative` are `undefined` when the account has no such section. */
export interface Position {
  equity?: EquityPosition[];
  derivative?: AllDerivativePosition;
}

/** The server's `{code: 204}` marker, or a non-object, gives an empty Position. */
export function positionFromDict(data: unknown, accountNo = ''): Position {
  if (isNoContent(data) || !isRecord(data)) return {};
  const equity = data.equity;
  const derivative = data.derivative;
  const hasEquity = Array.isArray(equity) ? equity.length > 0 : Boolean(equity);
  const hasDerivative = Array.isArray(derivative) ? derivative.length > 0 : section(derivative) !== undefined;
  return {
    equity: hasEquity && Array.isArray(equity) ? equityPositionsFromList(equity) : undefined,
    derivative: hasDerivative ? allDerivativePositionFromDict(derivative, accountNo) : undefined,
  };
}

// ---------------------------------------------------------------------------
// PPMMR (Purchasing Power / Margin / Maintenance / Risk)
// ---------------------------------------------------------------------------
export interface PPMMRRequest {
  accountNo: string;
}

export function ppmmrToParams(req: PPMMRRequest): Dict {
  return { accountNo: req.accountNo };
}

export interface EquityPPMMR {
  accountNo: string;
  dividend: number;
  loanValue: number;
  totalDebt: number;
  debt: number;
  liability: number;
  liabilitySsi: number;
  netLiability: number;
  fees: number;
  interestSsi: number;
  interestSpv: number;
  withdrawable: number;
  ee: number;
  ee50: number;
  ee60: number;
  ee70: number;
  ee80: number;
  ee90: number;
  action: number;
  actionSsi: number;
  equity: number;
  equitySsi: number;
  eeCash: number;
  holdSubscription: number;
  bankBalance: number;
  onHoldCash: number;
  doverdue: number;
  doverdueSsi: number;
  accountBalance: number;
  d: number;
  dSpv: number;
  dSsi: number;
  cia: number;
  collateralAsset: number;
  collateralAssetSsi: number;
  totalAssets: number;
  totalEquity: number;
  totalEquitySsi: number;
  lmv: number;
  lmvMargin: number;
  lmvMarginSsi: number;
  callLmv: number;
  forceLmv: number;
  callLmvSsi: number;
  forceLmvSsi: number;
  lmvNonMarginable: number;
  lmvNonMarginableSsi: number;
  preLoan: number;
  marginRatio: number;
  marginRatioSsi: number;
  purchasingPower: number;
  eeOrigin: number;
  buyUnmatched: number;
  sellUnmatched: number;
  buyT0: number;
  sellT0: number;
  sellT1: number;
  sellT2: number;
  buyT1: number;
  buyT2: number;
  creditLimit: number;
  marginCallLmvSold: number;
  marginCallLmvSoldSsi: number;
  marginCall: number;
  marginCallSsi: number;
  collateralA: number;
  collateralNon: number;
  collateralASsi: number;
  collateralNonSsi: number;
  callMargin: number;
  callForceSell: number;
  callMarginSsi: number;
  callForceSellSsi: number;
  ar: number;
}

export function equityPpmmrFromDict(data: Dict): EquityPPMMR {
  const f = (...keys: string[]): number => toFloat(pick(data, keys));
  return {
    accountNo: str(data.accountNo),
    dividend: f('dividend'),
    loanValue: f('loanValue'),
    totalDebt: f('totalDebt'),
    debt: f('debt'),
    liability: f('liability'),
    liabilitySsi: f('liabilitySSI'),
    netLiability: f('netLiability'),
    fees: f('fees'),
    interestSsi: f('interestSSI'),
    interestSpv: f('interestSPV'),
    withdrawable: f('withdrawable'),
    ee: f('ee'),
    ee50: f('ee50'),
    ee60: f('ee60'),
    ee70: f('ee70'),
    ee80: f('ee80'),
    ee90: f('ee90'),
    action: f('action'),
    actionSsi: f('actionSSI'),
    equity: f('equity'),
    equitySsi: f('equitySSI'),
    eeCash: f('eeCash'),
    holdSubscription: f('holdSubscription'),
    bankBalance: f('bankBalance'),
    onHoldCash: f('onHoldCash'),
    doverdue: f('doverdue'),
    doverdueSsi: f('doverdue_ssi', 'doverdueSSI'),
    accountBalance: f('accountBalance'),
    d: f('D', 'd'),
    dSpv: f('dSPV', 'dspv'),
    dSsi: f('dSSI', 'dssi'),
    cia: f('cia'),
    collateralAsset: f('collateralAsset'),
    collateralAssetSsi: f('collateralAssetSSI'),
    totalAssets: f('totalAssets'),
    totalEquity: f('totalEquity'),
    totalEquitySsi: f('totalEquitySSI'),
    lmv: f('lmv'),
    lmvMargin: f('lmvMargin'),
    lmvMarginSsi: f('lmvMarginSSI'),
    callLmv: f('callLMV', 'callLmv'),
    forceLmv: f('forceLMV', 'forceLmv'),
    callLmvSsi: f('callLMVSSI', 'callLmvSSI'),
    forceLmvSsi: f('forceLMVSSI', 'forceLmvSSI'),
    lmvNonMarginable: f('lmvNonMarginable'),
    lmvNonMarginableSsi: f('lmvNonMarginableSSI'),
    preLoan: f('preLoan'),
    marginRatio: f('marginRatio'),
    marginRatioSsi: f('marginRatioSSI'),
    purchasingPower: f('purchasingPower'),
    eeOrigin: f('eeOrigin'),
    buyUnmatched: f('buyUnmatched'),
    sellUnmatched: f('sellUnmatched'),
    buyT0: f('buyT0'),
    buyT1: f('buyT1'),
    buyT2: f('buyT2'),
    sellT0: f('sellT0'),
    sellT1: f('sellT1'),
    sellT2: f('sellT2'),
    creditLimit: f('creditLimit'),
    marginCallLmvSold: f('marginCallLMVSold', 'marginCallLmvSold'),
    marginCallLmvSoldSsi: f('marginCallLMVSoldSSI', 'marginCallLmvSoldSSI'),
    marginCall: f('marginCall'),
    marginCallSsi: f('marginCallSSI'),
    collateralA: f('collateralA'),
    collateralNon: f('collateralNon'),
    collateralASsi: f('collateralASSI'),
    collateralNonSsi: f('collateralNonSSI'),
    callMargin: f('callMargin'),
    callForceSell: f('callForcesell', 'callForceSell'),
    callMarginSsi: f('callMarginSSI'),
    callForceSellSsi: f('callForcesellSSI', 'callForceSellSSI'),
    ar: f('ar'),
  };
}

export interface DerivativePPMMR {
  accountNo: string;
  accountBalance: number;
  fee: number;
  commission: number;
  interest: number;
  loan: number;
  deliveryAmount: number;
  floatingPl: number;
  tradingPl: number;
  totalPl: number;
  marginable: number;
  depositable: number;
  rcCall: number;
  withdrawable: number;
  nonCashDrawableRcCall: number;
  cashSsi: number;
  validNonCashSsi: number;
  totalAssetSsi: number;
  withdrawableSsi: number;
  eeSsi: number;
  cashVsdc: number;
  validNonCashVsdc: number;
  totalAssetVsdc: number;
  withdrawableVsdc: number;
  eeVsdc: number;
  spreadMarginSsi: number;
  deliveryMarginSsi: number;
  marginReqSsi: number;
  accountRatioSsi: number;
  usedLimitWarningLevel1Ssi: number;
  usedLimitWarningLevel2Ssi: number;
  usedLimitWarningLevel3Ssi: number;
  marginCallSsi: number;
  spreadMarginVsdc: number;
  deliveryMarginVsdc: number;
  marginReqVsdc: number;
  accountRatioVsdc: number;
  usedLimitWarningLevel1Vsdc: number;
  usedLimitWarningLevel2Vsdc: number;
  usedLimitWarningLevel3Vsdc: number;
  marginCallVsdc: number;
  totalEquity: number;
  extInterest: number;
}

export function derivativePpmmrFromDict(data: Dict): DerivativePPMMR {
  const n = (...keys: string[]): number => toNumber(pick(data, keys));
  return {
    accountNo: str(data.accountNo),
    accountBalance: n('accountBalance'),
    fee: n('fee'),
    commission: n('commission'),
    interest: n('interest'),
    loan: n('loan'),
    deliveryAmount: n('deliveryAmount'),
    floatingPl: n('floatingPL'),
    tradingPl: n('tradingPL'),
    totalPl: n('totalPL'),
    marginable: n('marginable'),
    depositable: n('depositable'),
    rcCall: n('rcCall'),
    withdrawable: n('withdrawable'),
    nonCashDrawableRcCall: n('nonCashDrawableRCCall', 'nonCashDrawableRcCall'),
    cashSsi: n('cashSSI'),
    validNonCashSsi: n('validNonCashSSI'),
    totalAssetSsi: n('totalAssetSSI'),
    withdrawableSsi: n('withdrawableSSI'),
    eeSsi: n('eeSSI'),
    cashVsdc: n('cashVSDC'),
    validNonCashVsdc: n('validNonCashVSDC'),
    totalAssetVsdc: n('totalAssetVSDC'),
    withdrawableVsdc: n('withdrawableVSDC'),
    eeVsdc: n('eeVSDC'),
    spreadMarginSsi: n('spreadMarginSSI'),
    deliveryMarginSsi: n('deliveryMarginSSI'),
    marginReqSsi: n('marginReqSSI'),
    accountRatioSsi: n('accountRatioSSI'),
    usedLimitWarningLevel1Ssi: n('usedLimitWarningLevel1SSI'),
    usedLimitWarningLevel2Ssi: n('usedLimitWarningLevel2SSI'),
    usedLimitWarningLevel3Ssi: n('usedLimitWarningLevel3SSI'),
    marginCallSsi: n('marginCallSSI'),
    spreadMarginVsdc: n('spreadMarginVSDC'),
    deliveryMarginVsdc: n('deliveryMarginVSDC'),
    marginReqVsdc: n('marginReqVSDC'),
    accountRatioVsdc: n('accountRatioVSDC'),
    usedLimitWarningLevel1Vsdc: n('usedLimitWarningLevel1VSDC'),
    usedLimitWarningLevel2Vsdc: n('usedLimitWarningLevel2VSDC'),
    usedLimitWarningLevel3Vsdc: n('usedLimitWarningLevel3VSDC'),
    marginCallVsdc: n('marginCallVSDC'),
    totalEquity: n('totalEquity'),
    extInterest: n('extInterest'),
  };
}

/** `equity`/`derivative` are `undefined` when the account has no such section. */
export interface PPMMR {
  equity?: EquityPPMMR;
  derivative?: DerivativePPMMR;
}

export function ppmmrFromDict(data: unknown): PPMMR {
  const record: Dict = isRecord(data) ? data : {};
  const equity = section(record.equity);
  const derivative = section(record.derivative);
  return {
    equity: equity ? equityPpmmrFromDict(equity) : undefined,
    derivative: derivative ? derivativePpmmrFromDict(derivative) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export interface OrderBookRequest {
  accountNo: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
  symbol?: string;
  orderStatus?: OrderStatus | string;
}

/** `from`/`to`/`symbol`/`orderStatus` only when set; `pageIndex`/`pageSize` always. */
export function orderBookToParams(req: OrderBookRequest): Dict {
  const params: Dict = { accountNo: req.accountNo };
  if (req.fromDate !== undefined && req.fromDate !== null) params.from = req.fromDate;
  if (req.toDate !== undefined && req.toDate !== null) params.to = req.toDate;
  if (req.symbol !== undefined && req.symbol !== null) params.symbol = req.symbol;
  if (req.orderStatus !== undefined && req.orderStatus !== null) params.orderStatus = req.orderStatus;
  params.pageIndex = req.page ?? DEFAULT_PAGE;
  params.pageSize = req.size ?? DEFAULT_SIZE;
  return params;
}

export interface Order {
  accountNo: string;
  /** Idempotency key chosen by the caller (<= 20 characters). */
  clientRequestId: string;
  orderId: string;
  /** The order history sends it as `instrumentId`. */
  symbol: string;
  /** An `OrderSide`, or the raw string for an unknown value (the history sends `buySell`). */
  side?: OrderSide | string;
  orderType?: OrderType | string;
  /** Price in VND; a word such as "ATO" for market-priced orders. */
  price: number | OrderType | string;
  avgPrice: number;
  quantity: number;
  /** The REST order book never sends it, so it is `undefined` there. */
  osQuantity?: number;
  filledQuantity: number;
  cancelQuantity: number;
  status?: OrderStatus | string;
  /** `yyyy/MM/dd HH:mm:ss`. */
  inputTime: string;
  modifyTime: string;
  /** Server message (for a rejection, the reason). */
  message: string;
}

export function orderFromDict(data: Dict, accountNo: string): Order {
  return {
    accountNo,
    clientRequestId: str(data.clientRequestId),
    orderId: str(data.orderId),
    symbol: str(pick(data, ['symbol', 'instrumentId'], '')),
    side: toEnum(OrderSide, pick(data, ['side', 'buySell'])) as OrderSide | string | undefined,
    orderType: toEnum(OrderType, data.orderType) as OrderType | string | undefined,
    price: toPrice(data.price),
    avgPrice: toNumber(data.avgPrice),
    quantity: toInt(data.quantity),
    osQuantity: toOptInt(data.osQuantity),
    filledQuantity: toInt(pick(data, ['filledQty', 'filledQuantity'])),
    cancelQuantity: toInt(pick(data, ['cancelQty', 'cancelQuantity'])),
    status: toEnum(OrderStatus, data.orderStatus) as OrderStatus | string | undefined,
    inputTime: str(data.inputTime),
    modifyTime: str(data.modifiedTime),
    message: str(data.message),
  };
}

export interface OrderBook {
  orders: Order[];
  /** `totalRecord` of the response; informational, do not derive a page count from it. */
  totalOrders: number;
}

/** The server's `{code: 204}` marker, or a non-object, gives an empty book. */
export function orderBookFromDict(data: unknown): OrderBook {
  if (isNoContent(data) || !isRecord(data)) return { orders: [], totalOrders: 0 };
  const list = Array.isArray(data.orderList) ? data.orderList : [];
  const accountNo = str(data.accountNo);
  return {
    orders: list.filter(isRecord).map((order) => orderFromDict(order, accountNo)),
    totalOrders: toInt(data.totalRecord),
  };
}

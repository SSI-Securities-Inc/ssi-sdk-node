import { OrderSide, OrderStatus, OrderType } from '../enums/trading.js';

// ---------------------------------------------------------------------------
// Account Balances
// ---------------------------------------------------------------------------
export interface EquityAccountBalance {
  accountNo: string;
  availableCash: number;
  totalDebt: number;
  interestLoan: number;
  overdueFeeLoan: number;
  withdrawal: number;
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
  bankBalance: number;
  dividend: number;
  dividendMargin: number;
  blockCash: number;
  interestCash: number;
  limitT0: number;
  termDeposit: number;
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
  cashWithdrawableSsi: number;
  cashVsdc: number;
  validNonCashVsdc: number;
  cashWithdrawableVsdc: number;
}

export interface AccountBalance {
  equity: EquityAccountBalance | null;
  derivative: DerivativeAccountBalance | null;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------
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
  costPrice: number;
  mortgageQuantity: number;
  sellableQuantity: number;
  restrictedQuantity: number;
}

export interface DerivativePosition {
  accountNo: string;
  symbol: string;
  long: number;
  short: number;
  net: number;
  bidAvgPrice: number;
  askAvgPrice: number;
  tradePrice: number;
  floatingPl: number;
  tradingPl: number;
}

export interface AllDerivativePosition {
  openPositions: DerivativePosition[];
  closedPositions: DerivativePosition[];
}

export interface Position {
  equity: EquityPosition[] | null;
  derivative: AllDerivativePosition | null;
}

// ---------------------------------------------------------------------------
// PPMMR (Purchasing Power / Margin / Maintenance / Risk)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export interface Order {
  accountNo: string;
  clientRequestId: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  avgPrice: number;
  quantity: number;
  osQuantity: number;
  filledQuantity: number;
  cancelQuantity: number;
  status: OrderStatus;
  inputTime: string;
  modifyTime: string;
  message: string;
}

export interface OrderBook {
  orders: Order[];
  totalOrders: number;
}

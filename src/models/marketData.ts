import { Board } from '../enums/marketData.js';
import { Timeframe } from '../enums/timeframe.js';

// ---------------------------------------------------------------------------
// OHLC
// ---------------------------------------------------------------------------
export interface OHLCRequest {
  symbol: string;
  from: string;
  to: string;
  timeFrame: Timeframe;
  pageIndex?: number;
  pageSize?: number;
}

export interface OHLCData {
  symbol: string;
  tradingDate: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  value: number;
}

// ---------------------------------------------------------------------------
// Market Indexes
// ---------------------------------------------------------------------------
export interface MarketIndexes {
  index: string;
  indexName: string;
  board: Board | null;
}

export interface MarketIndexSummary {
  tradingDate: string;
  totalTrade: number;
  totalTradeValue: number;
  totalMatch: number;
  totalMatchValue: number;
  totalDeal: number;
  totalDealValue: number;
  indexChange: number;
  indexChangePercent: number;
  indexValue: number;
  totalAdvanceStock: number;
  totalDeclineStock: number;
  totalSteadyStock: number;
  totalCeilingStock: number;
  totalFloorStock: number;
  totalPropBuy: number;
  totalPropBuyValue: number;
  totalPropSell: number;
  totalPropSellValue: number;
}

// ---------------------------------------------------------------------------
// Securities
// ---------------------------------------------------------------------------
export interface SecuritiesInfo {
  symbol: string;
  board: Board | null;
  index: string;
  symbolNameVi: string;
  symbolNameEn: string;
  lotSize: number;
  maturityDate: string | null;
  firstTradingDate: string | null;
  lastTradingDate: string | null;
  cwUnderlyingSymbol: string | null;
  cwExercisePrice: number | null;
  cwExecutionRatio: number | null;
  listedShares: number;
  icbCode: string | null;
  icbName: string | null;
  iIndex: number | null;
  iNav: number | null;
}

export interface SecuritiesSummary {
  symbol: string;
  tradingDate: string;
  priceChange: number;
  priceChangePercent: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  averagePrice: number;
  totalMatch: number;
  totalMatchValue: number;
  totalBuy: number;
  totalTradeBuy: number;
  totalSell: number;
  totalTradeSell: number;
}

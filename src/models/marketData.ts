import { DEFAULT_PAGE, DEFAULT_SIZE } from '../constants.js';
import { Board } from '../enums/marketData.js';
import { Timeframe } from '../enums/timeframe.js';
import { Dict, fromValue, toFloat, toInt, toNumber, toOptFloat, toOptInt } from '../utils/converter.js';

/** Parse a board leniently: known value -> `Board`, unknown -> raw string, empty -> undefined. */
export function toBoard(raw: unknown): Board | string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  return fromValue(Board, raw) ?? String(raw);
}

/** Map the server's empty-string "no value" marker to undefined. */
export function blankToUndefined<T>(value: T | null | undefined | ''): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return value as T;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function optText(value: unknown): string | undefined {
  const v = blankToUndefined(value);
  return v === undefined ? undefined : String(v);
}

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

/** Build the OHLC query params. */
export function ohlcRequestToParams(req: {
  symbol: string;
  from: string;
  to: string;
  timeFrame: Timeframe;
  pageIndex?: number;
  pageSize?: number;
}): Dict {
  return {
    symbol: req.symbol,
    from: req.from,
    to: req.to,
    timeFrame: req.timeFrame,
    pageIndex: req.pageIndex ?? DEFAULT_PAGE,
    pageSize: req.pageSize ?? DEFAULT_SIZE,
  };
}

export interface OHLCData {
  symbol: string;
  /** Trading date as the server formats it (varies by endpoint; see `parseDate`). */
  tradingDate: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  value: number;
}

export function ohlcFromList(data: Dict[]): OHLCData[] {
  return data.map((item) => ({
    symbol: text(item.symbol),
    tradingDate: text(item.tradingDate),
    openPrice: toNumber(item.open),
    highPrice: toNumber(item.high),
    lowPrice: toNumber(item.low),
    closePrice: toNumber(item.close),
    volume: toInt(item.volume),
    value: toNumber(item.value),
  }));
}

// ---------------------------------------------------------------------------
// Market Indexes
// ---------------------------------------------------------------------------
export interface MarketIndexes {
  index: string;
  indexName: string;
  /** A `Board`, or the raw string for a board this SDK does not know. */
  board?: Board | string;
  /** The board exactly as the server sent it. */
  boardRaw?: string;
}

export function marketIndexesFromList(data: Dict[]): MarketIndexes[] {
  return data.map((item) => ({
    index: text(item.index),
    indexName: text(item.indexName),
    board: toBoard(item.board),
    boardRaw: optText(item.board),
  }));
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
  /** Foreign buy volume; undefined when the server omits it. */
  totalBuyForeign?: number;
  totalBuyForeignValue?: number;
  /** Foreign sell volume; undefined when the server omits it. */
  totalSellForeign?: number;
  totalSellForeignValue?: number;
  netPurchasesForeignVolume?: number;
  netPurchasesForeignValue?: number;
}

export function marketIndexSummaryFromList(data: Dict[]): MarketIndexSummary[] {
  return data.map((item) => ({
    tradingDate: text(item.tradingDate),
    totalTrade: toInt(item.totalTrade),
    totalTradeValue: toFloat(item.totalTradeValue),
    totalMatch: toInt(item.totalMatch),
    totalMatchValue: toFloat(item.totalMatchValue),
    totalDeal: toInt(item.totalDeal),
    totalDealValue: toFloat(item.totalDealValue),
    indexChange: toFloat(item.indexChange),
    indexChangePercent: toFloat(item.indexChangePercentage),
    indexValue: toFloat(item.indexValue),
    totalAdvanceStock: toInt(item.totalAdvanceStock),
    totalDeclineStock: toInt(item.totalDeclineStock),
    totalSteadyStock: toInt(item.totalNoChangeStock),
    totalCeilingStock: toInt(item.totalCeilingStock),
    totalFloorStock: toInt(item.totalFloorStock),
    totalPropBuy: toInt(item.totalPropBuy),
    totalPropBuyValue: toFloat(item.totalPropBuyValue),
    totalPropSell: toInt(item.totalPropSell),
    totalPropSellValue: toFloat(item.totalPropSellValue),
    totalBuyForeign: toOptFloat(item.totalBuyForeign),
    totalBuyForeignValue: toOptFloat(item.totalBuyForeignValue),
    totalSellForeign: toOptFloat(item.totalSellForeign),
    totalSellForeignValue: toOptFloat(item.totalSellForeignValue),
    netPurchasesForeignVolume: toOptFloat(item.netPurchasesForeignVolume),
    netPurchasesForeignValue: toOptFloat(item.netPurchasesForeignValue),
  }));
}

// ---------------------------------------------------------------------------
// Securities
// ---------------------------------------------------------------------------
export interface SecuritiesInfo {
  symbol: string;
  board?: Board | string;
  index?: string;
  symbolNameVi?: string;
  symbolNameEn?: string;
  lotSize?: number;
  maturityDate?: string;
  firstTradingDate?: string;
  lastTradingDate?: string;
  cwUnderlyingSymbol?: string;
  cwExercisePrice?: number;
  cwExecutionRatio?: number;
  listedShares?: number;
  icbCode?: string;
  icbName?: string;
  iIndex?: number;
  iNav?: number;
  openInterest?: number;
  settlementPrice?: number;
  /** Security type code. */
  stockType?: string;
}

/**
 * Build securities info from server items. A numeric field the server omits or leaves empty is
 * undefined (not 0), and an empty date/string is undefined.
 */
export function securitiesInfoFromList(data: Dict[]): SecuritiesInfo[] {
  return data.map((item) => ({
    symbol: text(item.symbol),
    board: toBoard(item.board),
    index: item.index === null || item.index === undefined ? undefined : String(item.index),
    symbolNameVi:
      item.symbolNameVi === null || item.symbolNameVi === undefined
        ? undefined
        : String(item.symbolNameVi),
    symbolNameEn:
      item.symbolNameEn === null || item.symbolNameEn === undefined
        ? undefined
        : String(item.symbolNameEn),
    lotSize: toOptInt(item.lotSize),
    maturityDate: optText(item.maturityDate),
    firstTradingDate: optText(item.firstTradingDate),
    lastTradingDate: optText(item.lastTradingDate),
    cwUnderlyingSymbol: optText(item.cwUnderlyingSymbol),
    cwExercisePrice: toOptFloat(item.cwExercisePrice),
    cwExecutionRatio: toOptFloat(item.cwExecutionRatio),
    listedShares: toOptInt(item.listedShare),
    icbCode: optText(item.icbCode),
    icbName: optText(item.icbName),
    iIndex: toOptFloat(item.iIndex),
    iNav: toOptFloat(item.iNav),
    openInterest: toOptFloat(item.openInterest),
    settlementPrice: toOptFloat(item.settlementPrice),
    stockType: optText(item.stockType),
  }));
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
  totalForeignBuy: number;
  totalForeignBuyValue: number;
  totalForeignSell: number;
  totalForeignSellValue: number;
  remainForeignRoom: number;
  totalForeignRoom: number;
  totalDeal: number;
  totalDealValue: number;
  openInterest: number;
  settlementPrice: number;
  /** Not sent by `securitiesSummary` (stays undefined); use `getMasterData()`. */
  ceiling?: number;
  floor?: number;
  refPrice?: number;
}

export function securitiesSummaryFromList(data: Dict[]): SecuritiesSummary[] {
  return data.map((item) => ({
    symbol: text(item.symbol),
    tradingDate: text(item.tradingDate),
    priceChange: toNumber(item.priceChange),
    priceChangePercent: toNumber(item.priceChangePercentage),
    openPrice: toNumber(item.open),
    highPrice: toNumber(item.high),
    lowPrice: toNumber(item.low),
    closePrice: toNumber(item.close),
    averagePrice: toNumber(item.average),
    totalMatch: toInt(item.totalMatch),
    totalMatchValue: toNumber(item.totalMatchValue),
    totalBuy: toInt(item.totalBuy),
    totalTradeBuy: toNumber(item.totalTradeBuy),
    totalSell: toInt(item.totalSell),
    totalTradeSell: toNumber(item.totalTradeSell),
    totalForeignBuy: toInt(item.totalForeignBuy),
    totalForeignBuyValue: toNumber(item.totalForeignBuyValue),
    totalForeignSell: toInt(item.totalForeignSell),
    totalForeignSellValue: toNumber(item.totalForeignSellValue),
    remainForeignRoom: toInt(item.remainForeignRoom),
    totalForeignRoom: toInt(item.totalForeignRoom),
    totalDeal: toInt(item.totalDeal),
    totalDealValue: toNumber(item.totalDealValue),
    openInterest: toNumber(item.openInterest),
    settlementPrice: toNumber(item.settlementPrice),
    ceiling: toOptFloat(item.ceiling),
    floor: toOptFloat(item.floor),
    refPrice: toOptFloat(item.refPrice),
  }));
}

export interface SecuritiesSummaryRequest {
  from: string;
  to: string;
  symbol?: string;
  index?: string;
  pageIndex?: number;
  pageSize?: number;
}

export function securitiesSummaryRequestToParams(req: SecuritiesSummaryRequest): Dict {
  const params: Dict = {
    from: req.from,
    to: req.to,
    pageIndex: req.pageIndex ?? DEFAULT_PAGE,
    pageSize: req.pageSize ?? DEFAULT_SIZE,
  };
  if (req.symbol !== undefined) params.symbol = req.symbol;
  if (req.index !== undefined) params.index = req.index;
  return params;
}

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------
export interface MasterDataRequest {
  from?: string;
  to?: string;
  pageIndex?: number;
  pageSize?: number;
}

/** Only the date bounds that were set are sent, plus the paging keys. */
export function masterDataRequestToParams(req: MasterDataRequest): Dict {
  const params: Dict = {};
  if (req.from !== undefined) params.from = req.from;
  if (req.to !== undefined) params.to = req.to;
  params.pageIndex = req.pageIndex ?? DEFAULT_PAGE;
  params.pageSize = req.pageSize ?? DEFAULT_SIZE;
  return params;
}

export interface MasterData {
  board?: Board | string;
  symbol: string;
  tradingDate: string;
  ceiling: number;
  floor: number;
  refPrice: number;
}

export function masterDataFromList(data: Dict[]): MasterData[] {
  return data.map((item) => ({
    board: toBoard(item.board),
    symbol: text(item.symbol),
    tradingDate: text(item.tradingDate),
    ceiling: toNumber(item.ceiling),
    floor: toNumber(item.floor),
    refPrice: toNumber(item.refPrice),
  }));
}

// ---------------------------------------------------------------------------
// Corporate actions
// ---------------------------------------------------------------------------
export interface CorporateActionsRequest {
  /** Start date `YYYY/MM/DD`. */
  from: string;
  /** End date `YYYY/MM/DD` (at most 5 days after `from`). */
  to: string;
  /** Ticker symbol; undefined asks for every security. */
  symbol?: string;
  /** `"vn"` (default) or `"en"`. */
  language?: string;
  pageIndex?: number;
  /** The server accepts 10, 20, 50 or 100. */
  pageSize?: number;
}

/** Query params for the endpoint (`symbol` only when set). */
export function corporateActionsRequestToParams(req: CorporateActionsRequest): Dict {
  const params: Dict = {
    from: req.from,
    to: req.to,
    language: req.language ?? 'vn',
    pageIndex: req.pageIndex ?? DEFAULT_PAGE,
    pageSize: req.pageSize ?? 100,
  };
  if (req.symbol !== undefined) params.symbol = req.symbol;
  return params;
}

/**
 * One corporate action (dividend, bonus shares, rights issue, ...) of a security.
 *
 * Every field is the string the server sends: dates stay `YYYY/MM/DD` text and `ratio` is not
 * parsed, because its meaning depends on the event type. A field the server leaves blank
 * (a newly announced event has no ex-right date or ratio yet) is `""`.
 */
export interface CorporateAction {
  symbol: string;
  eventTitle: string;
  exrightDate: string;
  recordDate: string;
  issueDate: string;
  /** Exchange code, e.g. `"HOSE"`. */
  exchange: string;
  /** Event ratio as text, e.g. `"0.9388"`. */
  ratio: string;
}

export function corporateActionsFromList(data: Dict[]): CorporateAction[] {
  return data.map((item) => ({
    symbol: text(item.symbol),
    eventTitle: text(item.eventTitle),
    exrightDate: text(item.exrightDate),
    recordDate: text(item.recordDate),
    issueDate: text(item.issueDate),
    exchange: text(item.exchange),
    ratio: text(item.ratio),
  }));
}

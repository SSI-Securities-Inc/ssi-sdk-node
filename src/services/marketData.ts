import { RestClient } from '../transport/restClient.js';
import {
  EP_DATA_OHLC,
  EP_DATA_INDEX_LIST,
  EP_DATA_INDEX_SUMMARY,
  EP_DATA_SECURITIES_BY_BOARD,
  EP_DATA_SECURITIES_SUMMARY,
  DEFAULT_PAGE,
  DEFAULT_SIZE,
} from '../constants.js';
import {
  OHLCData,
  MarketIndexes,
  MarketIndexSummary,
  SecuritiesInfo,
  SecuritiesSummary,
} from '../models/marketData.js';
import { Board } from '../enums/marketData.js';
import { Timeframe } from '../enums/timeframe.js';
import { toFloat, toInt } from '../utils/converter.js';
import { requireString } from '../utils/validator.js';

export class MarketDataService {
  constructor(private readonly restClient: RestClient) {}

  // ---------------------------------------------------------------------------
  // OHLC
  // ---------------------------------------------------------------------------

  private async getOhlc(
    symbol: string,
    timeFrame: Timeframe,
    from?: string,
    to?: string,
    page = DEFAULT_PAGE,
    size = DEFAULT_SIZE,
  ): Promise<OHLCData[]> {
    const now = new Date();
    const today = formatDate(now);
    const defaultFrom = today + ' 00:00:00';
    const defaultTo = today + ' 23:59:59';

    const params: Record<string, unknown> = {
      symbol,
      timeFrame,
      from: from ?? defaultFrom,
      to: to ?? defaultTo,
      pageIndex: page,
      pageSize: size,
    };

    const data = await this.restClient.get<{ data: unknown[] }>(EP_DATA_OHLC, params);
    const items = (data as { data: unknown[] }).data ?? [];
    return items.map(mapOhlc);
  }

  getOhlc1Minute(symbol: string): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    return this.getOhlc(symbol, Timeframe.MINUTE_1);
  }

  getOhlc1MinuteHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.MINUTE_1, from, to, page, size);
  }

  getOhlc3Minute(symbol: string): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    return this.getOhlc(symbol, Timeframe.MINUTE_3);
  }

  getOhlc3MinuteHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.MINUTE_3, from, to, page, size);
  }

  getOhlc5Minute(symbol: string): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    return this.getOhlc(symbol, Timeframe.MINUTE_5);
  }

  getOhlc5MinuteHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.MINUTE_5, from, to, page, size);
  }

  getOhlc15Minute(symbol: string): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    return this.getOhlc(symbol, Timeframe.MINUTE_15);
  }

  getOhlc15MinuteHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.MINUTE_15, from, to, page, size);
  }

  getOhlc1Hour(symbol: string): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    return this.getOhlc(symbol, Timeframe.HOUR_1);
  }

  getOhlc1HourHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.HOUR_1, from, to, page, size);
  }

  getOhlc1DayHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.DAY_1, from, to, page, size);
  }

  getOhlc1WeekHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.WEEK_1, from, to, page, size);
  }

  getOhlc1MonthHistorical(
    symbol: string, from: string, to: string, page?: number, size?: number,
  ): Promise<OHLCData[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    return this.getOhlc(symbol, Timeframe.MONTH_1, from, to, page, size);
  }

  // ---------------------------------------------------------------------------
  // Market Indexes
  // ---------------------------------------------------------------------------

  async getIndexes(): Promise<MarketIndexes[]> {
    const data = await this.restClient.get<{ data: unknown[] }>(EP_DATA_INDEX_LIST);
    return ((data as { data: unknown[] }).data ?? []).map(mapIndexes);
  }

  async getIndexesByBoard(board: Board): Promise<MarketIndexes[]> {
    requireString(board, 'board');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_INDEX_LIST, { board },
    );
    return ((data as { data: unknown[] }).data ?? []).map(mapIndexes);
  }

  async getIndexSummary(index: string): Promise<MarketIndexSummary | null> {
    requireString(index, 'index');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_INDEX_SUMMARY, { index },
    );
    const items = (data as { data: unknown[] }).data ?? [];
    return items.length > 0 ? mapIndexSummary(items[0]) : null;
  }

  async getIndexSummaryHistorical(
    index: string, tradingDate: string,
  ): Promise<MarketIndexSummary | null> {
    requireString(index, 'index');
    requireString(tradingDate, 'tradingDate');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_INDEX_SUMMARY, { index, tradingDate },
    );
    const items = (data as { data: unknown[] }).data ?? [];
    return items.length > 0 ? mapIndexSummary(items[0]) : null;
  }

  async getBoardSummary(board: Board): Promise<MarketIndexSummary | null> {
    requireString(board, 'board');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_INDEX_SUMMARY, { board },
    );
    const items = (data as { data: unknown[] }).data ?? [];
    return items.length > 0 ? mapIndexSummary(items[0]) : null;
  }

  async getBoardSummaryHistorical(
    board: Board, tradingDate: string,
  ): Promise<MarketIndexSummary | null> {
    requireString(board, 'board');
    requireString(tradingDate, 'tradingDate');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_INDEX_SUMMARY, { board, tradingDate },
    );
    const items = (data as { data: unknown[] }).data ?? [];
    return items.length > 0 ? mapIndexSummary(items[0]) : null;
  }

  // ---------------------------------------------------------------------------
  // Securities Info
  // ---------------------------------------------------------------------------

  async getSecuritiesInfo(symbol: string): Promise<SecuritiesInfo | null> {
    requireString(symbol, 'symbol');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_SECURITIES_BY_BOARD, { symbol },
    );
    const items = (data as { data: unknown[] }).data ?? [];
    return items.length > 0 ? mapSecuritiesInfo(items[0]) : null;
  }

  async getSecuritiesInfoByIndex(index: string): Promise<SecuritiesInfo[]> {
    requireString(index, 'index');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_SECURITIES_BY_BOARD, { index },
    );
    return ((data as { data: unknown[] }).data ?? []).map(mapSecuritiesInfo);
  }

  async getSecuritiesInfoByBoard(board: Board): Promise<SecuritiesInfo[]> {
    requireString(board, 'board');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_SECURITIES_BY_BOARD, { board },
    );
    return ((data as { data: unknown[] }).data ?? []).map(mapSecuritiesInfo);
  }

  // ---------------------------------------------------------------------------
  // Securities Summary
  // ---------------------------------------------------------------------------

  async getSecuritiesSummary(
    symbol: string, page = DEFAULT_PAGE, size = DEFAULT_SIZE,
  ): Promise<SecuritiesSummary[]> {
    requireString(symbol, 'symbol');
    const today = todayDateStr();
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_SECURITIES_SUMMARY, { symbol, from: today, to: today, pageIndex: page, pageSize: size },
    );
    return ((data as { data: unknown[] }).data ?? []).map(mapSecuritiesSummary);
  }

  async getSecuritiesSummaryHistorical(
    symbol: string, from: string, to: string, page = DEFAULT_PAGE, size = DEFAULT_SIZE,
  ): Promise<SecuritiesSummary[]> {
    requireString(symbol, 'symbol');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_SECURITIES_SUMMARY, { symbol, from, to, pageIndex: page, pageSize: size },
    );
    return ((data as { data: unknown[] }).data ?? []).map(mapSecuritiesSummary);
  }

  async getSecuritiesSummaryByIndex(
    index: string, page = DEFAULT_PAGE, size = DEFAULT_SIZE,
  ): Promise<SecuritiesSummary[]> {
    requireString(index, 'index');
    const today = todayDateStr();
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_SECURITIES_SUMMARY, { index, from: today, to: today, pageIndex: page, pageSize: size },
    );
    return ((data as { data: unknown[] }).data ?? []).map(mapSecuritiesSummary);
  }

  async getSecuritiesSummaryByIndexHistorical(
    index: string, from: string, to: string, page = DEFAULT_PAGE, size = DEFAULT_SIZE,
  ): Promise<SecuritiesSummary[]> {
    requireString(index, 'index');
    requireString(from, 'fromDate');
    requireString(to, 'toDate');
    const data = await this.restClient.get<{ data: unknown[] }>(
      EP_DATA_SECURITIES_SUMMARY, { index, from, to, pageIndex: page, pageSize: size },
    );
    return ((data as { data: unknown[] }).data ?? []).map(mapSecuritiesSummary);
  }
}

function todayDateStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapOhlc(raw: unknown): OHLCData {
  const r = raw as Record<string, unknown>;
  return {
    symbol: String(r['symbol'] ?? ''),
    tradingDate: String(r['tradingDate'] ?? ''),
    openPrice: toFloat(r['open']),
    highPrice: toFloat(r['high']),
    lowPrice: toFloat(r['low']),
    closePrice: toFloat(r['close']),
    volume: toInt(r['volume']),
    value: toFloat(r['value']),
  };
}

function mapIndexes(raw: unknown): MarketIndexes {
  const r = raw as Record<string, unknown>;
  return {
    index: String(r['index'] ?? ''),
    indexName: String(r['indexName'] ?? ''),
    board: (r['board'] as Board) ?? null,
  };
}

function mapIndexSummary(raw: unknown): MarketIndexSummary {
  const r = raw as Record<string, unknown>;
  return {
    tradingDate: String(r['tradingDate'] ?? ''),
    totalTrade: toFloat(r['totalTrade']),
    totalTradeValue: toFloat(r['totalTradeValue']),
    totalMatch: toFloat(r['totalMatch']),
    totalMatchValue: toFloat(r['totalMatchValue']),
    totalDeal: toFloat(r['totalDeal']),
    totalDealValue: toFloat(r['totalDealValue']),
    indexChange: toFloat(r['indexChange']),
    indexChangePercent: toFloat(r['indexChangePercentage']),
    indexValue: toFloat(r['indexValue']),
    totalAdvanceStock: toInt(r['totalAdvanceStock']),
    totalDeclineStock: toInt(r['totalDeclineStock']),
    totalSteadyStock: toInt(r['totalNoChangeStock']),
    totalCeilingStock: toInt(r['totalCeilingStock'] ?? r['totalCeiLingStock']),
    totalFloorStock: toInt(r['totalFloorStock']),
    totalPropBuy: toFloat(r['totalPropBuy']),
    totalPropBuyValue: toFloat(r['totalPropBuyValue']),
    totalPropSell: toFloat(r['totalPropSell']),
    totalPropSellValue: toFloat(r['totalPropSellValue']),
  };
}

function mapSecuritiesInfo(raw: unknown): SecuritiesInfo {
  const r = raw as Record<string, unknown>;
  return {
    symbol: String(r['symbol'] ?? ''),
    board: (r['board'] as Board) ?? null,
    index: String(r['index'] ?? ''),
    symbolNameVi: String(r['symbolNameVi'] ?? ''),
    symbolNameEn: String(r['symbolNameEn'] ?? ''),
    lotSize: toInt(r['lotSize']),
    maturityDate: (r['maturityDate'] as string) ?? null,
    firstTradingDate: (r['firstTradingDate'] as string) ?? null,
    lastTradingDate: (r['lastTradingDate'] as string) ?? null,
    cwUnderlyingSymbol: (r['cwUnderlyingSymbol'] as string) ?? null,
    cwExercisePrice: r['cwExercisePrice'] != null ? toFloat(r['cwExercisePrice']) : null,
    cwExecutionRatio: r['cwExecutionRatio'] != null ? toFloat(r['cwExecutionRatio']) : null,
    listedShares: toFloat(r['listedShares']),
    icbCode: (r['icbCode'] as string) ?? null,
    icbName: (r['icbName'] as string) ?? null,
    iIndex: r['iIndex'] != null ? toFloat(r['iIndex']) : null,
    iNav: r['iNav'] != null ? toFloat(r['iNav']) : null,
  };
}

function mapSecuritiesSummary(raw: unknown): SecuritiesSummary {
  const r = raw as Record<string, unknown>;
  return {
    symbol: String(r['symbol'] ?? ''),
    tradingDate: String(r['tradingDate'] ?? ''),
    priceChange: toFloat(r['priceChange']),
    priceChangePercent: toFloat(r['priceChangePercentage']),
    openPrice: toFloat(r['open']),
    highPrice: toFloat(r['high']),
    lowPrice: toFloat(r['low']),
    closePrice: toFloat(r['close']),
    averagePrice: toFloat(r['average']),
    totalMatch: toFloat(r['totalMatch']),
    totalMatchValue: toFloat(r['totalMatchValue']),
    totalBuy: toFloat(r['totalBuy']),
    totalTradeBuy: toFloat(r['totalTradeBuy']),
    totalSell: toFloat(r['totalSell']),
    totalTradeSell: toFloat(r['totalTradeSell']),
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

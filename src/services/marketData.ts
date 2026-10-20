import { RestClient } from '../transport/restClient.js';
import {
  EP_DATA_OHLC,
  EP_DATA_INDEX_LIST,
  EP_DATA_INDEX_SUMMARY,
  EP_DATA_SECURITIES_BY_BOARD,
  EP_DATA_SECURITIES_SUMMARY,
  EP_DATA_MASTER_DATA,
  EP_DATA_CORPORATE_ACTIONS,
  CORPORATE_ACTIONS_LANGUAGES,
  CORPORATE_ACTIONS_MAX_DAYS,
  CORPORATE_ACTIONS_PAGE_SIZES,
  DEFAULT_PAGE,
  DEFAULT_SIZE,
} from '../constants.js';
import {
  OHLCData,
  MarketIndexes,
  MarketIndexSummary,
  SecuritiesInfo,
  SecuritiesSummary,
  MasterData,
  CorporateAction,
  ohlcFromList,
  ohlcRequestToParams,
  marketIndexesFromList,
  marketIndexSummaryFromList,
  securitiesInfoFromList,
  securitiesSummaryFromList,
  securitiesSummaryRequestToParams,
  masterDataFromList,
  masterDataRequestToParams,
  corporateActionsFromList,
  corporateActionsRequestToParams,
} from '../models/marketData.js';
import { Board } from '../enums/marketData.js';
import { Timeframe, ALLOWED_TIMEFRAMES } from '../enums/timeframe.js';
import { APIError, ValidationError } from '../exceptions.js';
import {
  Dict,
  fromValue,
  isNoContent,
  pick,
  toInt,
} from '../utils/converter.js';
import {
  parseDateArg,
  requireDateRange,
  requireExactlyOne,
  requireNonEmpty,
  requireSymbol,
} from '../utils/validator.js';
import { fromBeginningOfDay, fromEndOfDay, todayDateStr } from '../utils/datetime.js';

/** Boards the REST data endpoints serve; DERIVATIVES exists only on the stream/master data. */
const REST_BOARDS: readonly Board[] = [Board.HOSE, Board.HNX, Board.UPCOM];

const WEEK_MONTH_REJECTED = (name: string): string =>
  `The server does not support the ${name} timeframe (error 400210); ` +
  'request 1d bars and aggregate them client-side instead';

/**
 * Rows of a bare-array endpoint. The server answers an empty result with HTTP 200 and
 * `{"code": 204}` (an object, not `[]`), so that marker maps to an empty list.
 */
function rows(data: unknown, what: string): Dict[] {
  if (Array.isArray(data)) return data as Dict[];
  if (isNoContent(data)) return [];
  throw new APIError(`Unexpected response format while reading ${what}`, undefined, undefined, data);
}

/** The `data` rows of an enveloped endpoint (`{"data": [...], ...}`). */
function dataRows(data: unknown, what: string): Dict[] {
  if (isNoContent(data)) return [];
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const items = (data as Dict).data;
    if (items === null || items === undefined) return [];
    if (Array.isArray(items)) return items as Dict[];
  }
  throw new APIError(`Unexpected response format while reading ${what}`, undefined, undefined, data);
}

/** Total pages of a paginated response (`pagesCount`, falling back to `pageCount`). */
function pagesCount(data: unknown): number {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return 1;
  return toInt(pick(data as Dict, ['pagesCount', 'pageCount']), 1);
}

/** Validate a board for a REST data endpoint (HOSE/HNX/UPCOM only). */
function restBoard(board: Board | string | undefined): Board | undefined {
  if (board === undefined || board === null) return undefined;
  const resolved = fromValue(Board, board);
  if (resolved === undefined || !REST_BOARDS.includes(resolved)) {
    throw new ValidationError(`board must be one of ${REST_BOARDS.join(', ')}, got '${String(board)}'`);
  }
  return resolved;
}

function checkTimeframe(timeframe: Timeframe | string): Timeframe {
  const resolved = fromValue(Timeframe, timeframe);
  if (resolved === undefined || !ALLOWED_TIMEFRAMES.has(resolved)) {
    const allowed = [...ALLOWED_TIMEFRAMES].sort().join(', ');
    throw new ValidationError(`timeframe ${String(timeframe)} is not supported; use one of ${allowed}`);
  }
  return resolved;
}

/** The server validates neither `pageIndex` nor `pageSize`; 0 or negative values give undefined results. */
function requirePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive integer, got ${String(value)}`);
  }
  return value;
}

/** Max length of the corporateActions `symbol` filter, as the server documents it. */
const CORPORATE_ACTIONS_SYMBOL_MAX_LENGTH = 20;

function checkPaging(page: number, size: number): void {
  requirePositiveInt(page, 'page');
  requirePositiveInt(size, 'size');
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Minute/hour bars: a `to` later than today makes the server answer nothing at all, so cut it to
 * the end of today. Daily bars are not affected, and a range that starts in the future is left
 * alone (it is empty anyway).
 */
function clampFutureEnd(timeframe: Timeframe, fromDate: string, toDate: string): string {
  if (timeframe === Timeframe.DAY_1) return toDate;
  const today = startOfDay(new Date());
  const to = startOfDay(parseDateArg(toDate, 'to', { allowTime: true }));
  const from = startOfDay(parseDateArg(fromDate, 'from', { allowTime: true }));
  return to > today && today >= from ? fromEndOfDay() : toDate;
}

const DATE_ONLY = /^\d{4}[/-]\d{2}[/-]\d{2}$/;

/** `YYYY/MM/DD` -> `YYYY/MM/DD <time>`: the OHLC endpoint answers 400213 to a bare date. */
function withTime(value: string, timeText: string): string {
  const trimmed = value.trim();
  return DATE_ONLY.test(trimmed) ? `${trimmed.replace(/-/g, '/')} ${timeText}` : value;
}

function buildOhlcParams(
  symbol: string,
  timeframeArg: Timeframe | string,
  fromArg: string | undefined,
  toArg: string | undefined,
  page: number,
  size: number,
): Dict {
  requireSymbol(symbol, 'symbol');
  const timeframe = checkTimeframe(timeframeArg);
  checkPaging(page, size);
  let from = fromArg || fromBeginningOfDay();
  let to = toArg || fromEndOfDay();
  requireDateRange(from, to, { allowTime: true });
  from = withTime(from, '00:00:00');
  to = withTime(to, '23:59:59');
  to = clampFutureEnd(timeframe, from, to);
  return ohlcRequestToParams({ symbol, from, to, timeFrame: timeframe, pageIndex: page, pageSize: size });
}

type Historical = [symbol: string, from: string, to: string, page?: number, size?: number];

export class MarketDataService {
  constructor(private readonly restClient: RestClient) {}

  // ---------------------------------------------------------------------------
  // OHLC
  // ---------------------------------------------------------------------------

  private async fetchOhlc(
    symbol: string,
    timeframe: Timeframe | string,
    from?: string,
    to?: string,
    page = DEFAULT_PAGE,
    size = DEFAULT_SIZE,
  ): Promise<OHLCData[]> {
    const params = buildOhlcParams(symbol, timeframe, from, to, page, size);
    const data = await this.restClient.get(EP_DATA_OHLC, params);
    return ohlcFromList(dataRows(data, 'OHLC'));
  }

  private historical(timeframe: Timeframe, args: Historical): Promise<OHLCData[]> {
    const [symbol, from, to, page, size] = args;
    requireNonEmpty(from, 'fromDate');
    requireNonEmpty(to, 'toDate');
    return this.fetchOhlc(symbol, timeframe, from, to, page, size);
  }

  /**
   * Iterate over every OHLC bar in a range, fetching page after page.
   *
   * The OHLC endpoint reports no page count, so paging stops at the first empty or short page.
   * Bars arrive in server order: newest first.
   *
   * @param symbol - A single ticker symbol, e.g. "VNM".
   * @param timeframe - Bar timeframe (1d, 1m, 3m, 5m, 15m or 1h).
   * @param from - Range start; defaults to the start of today.
   * @param to - Range end; defaults to the end of today.
   * @param size - Bars requested per page (> 0).
   */
  async *iterOhlc(
    symbol: string,
    timeframe: Timeframe | string,
    from?: string,
    to?: string,
    size = DEFAULT_SIZE,
  ): AsyncGenerator<OHLCData, void, undefined> {
    requirePositiveInt(size, 'size');
    for (let page = DEFAULT_PAGE; ; page++) {
      const bars = await this.fetchOhlc(symbol, timeframe, from, to, page, size);
      for (const bar of bars) yield bar;
      if (bars.length < size) return;
    }
  }

  /** Fetch every OHLC bar in a range across all pages (newest first unless `ascending`). */
  async getOhlcAll(
    symbol: string,
    timeframe: Timeframe | string,
    from?: string,
    to?: string,
    size = DEFAULT_SIZE,
    ascending = false,
  ): Promise<OHLCData[]> {
    const bars: OHLCData[] = [];
    for await (const bar of this.iterOhlc(symbol, timeframe, from, to, size)) bars.push(bar);
    return ascending ? bars.reverse() : bars;
  }

  getOhlc1Minute(symbol: string): Promise<OHLCData[]> {
    return this.fetchOhlc(symbol, Timeframe.MINUTE_1);
  }

  getOhlc1MinuteHistorical(...args: Historical): Promise<OHLCData[]> {
    return this.historical(Timeframe.MINUTE_1, args);
  }

  getOhlc3Minute(symbol: string): Promise<OHLCData[]> {
    return this.fetchOhlc(symbol, Timeframe.MINUTE_3);
  }

  getOhlc3MinuteHistorical(...args: Historical): Promise<OHLCData[]> {
    return this.historical(Timeframe.MINUTE_3, args);
  }

  getOhlc5Minute(symbol: string): Promise<OHLCData[]> {
    return this.fetchOhlc(symbol, Timeframe.MINUTE_5);
  }

  getOhlc5MinuteHistorical(...args: Historical): Promise<OHLCData[]> {
    return this.historical(Timeframe.MINUTE_5, args);
  }

  getOhlc15Minute(symbol: string): Promise<OHLCData[]> {
    return this.fetchOhlc(symbol, Timeframe.MINUTE_15);
  }

  getOhlc15MinuteHistorical(...args: Historical): Promise<OHLCData[]> {
    return this.historical(Timeframe.MINUTE_15, args);
  }

  getOhlc1Hour(symbol: string): Promise<OHLCData[]> {
    return this.fetchOhlc(symbol, Timeframe.HOUR_1);
  }

  getOhlc1HourHistorical(...args: Historical): Promise<OHLCData[]> {
    return this.historical(Timeframe.HOUR_1, args);
  }

  getOhlc1DayHistorical(...args: Historical): Promise<OHLCData[]> {
    return this.historical(Timeframe.DAY_1, args);
  }

  /**
   * @deprecated The server does not serve 1-week bars (error 400210). Always throws
   * ValidationError; request 1-day bars and aggregate them client-side.
   */
  async getOhlc1WeekHistorical(...args: Historical): Promise<OHLCData[]> {
    requireNonEmpty(args[1], 'fromDate');
    requireNonEmpty(args[2], 'toDate');
    throw new ValidationError(WEEK_MONTH_REJECTED('1w'));
  }

  /**
   * @deprecated The server does not serve 1-month bars (error 400210). Always throws
   * ValidationError; request 1-day bars and aggregate them client-side.
   */
  async getOhlc1MonthHistorical(...args: Historical): Promise<OHLCData[]> {
    requireNonEmpty(args[1], 'fromDate');
    requireNonEmpty(args[2], 'toDate');
    throw new ValidationError(WEEK_MONTH_REJECTED('1M'));
  }

  /** Bulk download is not implemented: the server has no `data/file` endpoint yet. */
  async downloadOhlc1Minute(_symbol: string): Promise<Dict> {
    throw new Error('OHLC download is not implemented yet');
  }

  /** Bulk download is not implemented: the server has no `data/file` endpoint yet. */
  async downloadOhlc1Day(_symbol: string): Promise<Dict> {
    throw new Error('OHLC download is not implemented yet');
  }

  // ---------------------------------------------------------------------------
  // Market indexes
  // ---------------------------------------------------------------------------

  private async fetchIndexes(board?: Board | string): Promise<MarketIndexes[]> {
    const resolved = restBoard(board);
    const data = await this.restClient.get(EP_DATA_INDEX_LIST, resolved ? { board: resolved } : {});
    return marketIndexesFromList(rows(data, 'indexes'));
  }

  getIndexes(): Promise<MarketIndexes[]> {
    return this.fetchIndexes();
  }

  getIndexesByBoard(board: Board | string): Promise<MarketIndexes[]> {
    requireNonEmpty(board, 'board');
    return this.fetchIndexes(board);
  }

  // ---------------------------------------------------------------------------
  // Index summary
  // ---------------------------------------------------------------------------

  private async fetchIndexSummary(
    index?: string,
    board?: Board | string,
    tradingDate?: string,
  ): Promise<MarketIndexSummary[]> {
    const params: Dict = {};
    if (index !== undefined) params.index = index;
    const resolved = restBoard(board);
    if (resolved !== undefined) params.board = resolved;
    if (tradingDate !== undefined) params.tradingDate = tradingDate;
    const data = await this.restClient.get(EP_DATA_INDEX_SUMMARY, params);
    return marketIndexSummaryFromList(rows(data, 'index summary'));
  }

  async getIndexSummary(index: string): Promise<MarketIndexSummary | undefined> {
    requireNonEmpty(index, 'index');
    return (await this.fetchIndexSummary(index))[0];
  }

  async getIndexSummaryHistorical(
    index: string,
    tradingDate: string,
  ): Promise<MarketIndexSummary | undefined> {
    requireNonEmpty(index, 'index');
    requireNonEmpty(tradingDate, 'tradingDate');
    return (await this.fetchIndexSummary(index, undefined, tradingDate))[0];
  }

  async getBoardSummary(board: Board | string): Promise<MarketIndexSummary | undefined> {
    requireNonEmpty(board, 'board');
    return (await this.fetchIndexSummary(undefined, board))[0];
  }

  async getBoardSummaryHistorical(
    board: Board | string,
    tradingDate: string,
  ): Promise<MarketIndexSummary | undefined> {
    requireNonEmpty(board, 'board');
    requireNonEmpty(tradingDate, 'tradingDate');
    return (await this.fetchIndexSummary(undefined, board, tradingDate))[0];
  }

  // ---------------------------------------------------------------------------
  // Securities info
  // ---------------------------------------------------------------------------

  private async fetchSecuritiesInfo(
    index?: string,
    board?: Board | string,
    symbol?: string,
  ): Promise<SecuritiesInfo[]> {
    const params: Dict = {};
    if (symbol !== undefined) params.symbol = symbol;
    const resolved = restBoard(board);
    if (resolved !== undefined) params.board = resolved;
    if (index !== undefined) params.index = index;
    const data = await this.restClient.get(EP_DATA_SECURITIES_BY_BOARD, params);
    return securitiesInfoFromList(rows(data, 'securities info'));
  }

  async getSecuritiesInfo(symbol: string): Promise<SecuritiesInfo | undefined> {
    requireNonEmpty(symbol, 'symbol');
    return (await this.fetchSecuritiesInfo(undefined, undefined, symbol))[0];
  }

  getSecuritiesInfoByIndex(index: string): Promise<SecuritiesInfo[]> {
    requireNonEmpty(index, 'index');
    return this.fetchSecuritiesInfo(index);
  }

  getSecuritiesInfoByBoard(board: Board | string): Promise<SecuritiesInfo[]> {
    requireNonEmpty(board, 'board');
    return this.fetchSecuritiesInfo(undefined, board);
  }

  // ---------------------------------------------------------------------------
  // Securities summary
  // ---------------------------------------------------------------------------

  private summaryParams(
    from: string,
    to: string,
    symbol: string | undefined,
    index: string | undefined,
    page: number,
    size: number,
  ): Dict {
    requireExactlyOne(symbol, index, 'symbol', 'index');
    requireDateRange(from, to);
    checkPaging(page, size);
    return securitiesSummaryRequestToParams({ from, to, symbol, index, pageIndex: page, pageSize: size });
  }

  /** Fetch every page of the range (follows `pagesCount`, falling back to `pageCount`). */
  private async fetchSecuritiesSummary(
    from: string,
    to: string,
    symbol?: string,
    index?: string,
    size = DEFAULT_SIZE,
  ): Promise<SecuritiesSummary[]> {
    let page = DEFAULT_PAGE;
    let data = await this.restClient.get(
      EP_DATA_SECURITIES_SUMMARY,
      this.summaryParams(from, to, symbol, index, page, size),
    );
    const items = securitiesSummaryFromList(dataRows(data, 'securities summary'));
    const pages = pagesCount(data);
    while (page < pages && items.length > 0) {
      page++;
      data = await this.restClient.get(
        EP_DATA_SECURITIES_SUMMARY,
        this.summaryParams(from, to, symbol, index, page, size),
      );
      const more = securitiesSummaryFromList(dataRows(data, 'securities summary'));
      if (more.length === 0) break;
      items.push(...more);
    }
    return items;
  }

  getSecuritiesSummary(symbol: string): Promise<SecuritiesSummary[]> {
    requireNonEmpty(symbol, 'symbol');
    const today = todayDateStr();
    return this.fetchSecuritiesSummary(today, today, symbol);
  }

  getSecuritiesSummaryHistorical(symbol: string, from: string, to: string): Promise<SecuritiesSummary[]> {
    requireNonEmpty(symbol, 'symbol');
    requireNonEmpty(from, 'fromDate');
    requireNonEmpty(to, 'toDate');
    return this.fetchSecuritiesSummary(from, to, symbol);
  }

  getSecuritiesSummaryByIndex(index: string): Promise<SecuritiesSummary[]> {
    requireNonEmpty(index, 'index');
    const today = todayDateStr();
    return this.fetchSecuritiesSummary(today, today, undefined, index);
  }

  getSecuritiesSummaryByIndexHistorical(
    index: string,
    from: string,
    to: string,
  ): Promise<SecuritiesSummary[]> {
    requireNonEmpty(index, 'index');
    requireNonEmpty(from, 'fromDate');
    requireNonEmpty(to, 'toDate');
    return this.fetchSecuritiesSummary(from, to, undefined, index);
  }

  // ---------------------------------------------------------------------------
  // Master data
  // ---------------------------------------------------------------------------

  private async fetchMasterData(from: string, to: string): Promise<MasterData[]> {
    const items: MasterData[] = [];
    for (let page = DEFAULT_PAGE; ; page++) {
      requireDateRange(from, to);
      checkPaging(page, DEFAULT_SIZE);
      const data = await this.restClient.get(
        EP_DATA_MASTER_DATA,
        masterDataRequestToParams({ from, to, pageIndex: page, pageSize: DEFAULT_SIZE }),
      );
      items.push(...masterDataFromList(dataRows(data, 'master data')));
      if (page >= pagesCount(data)) break;
    }
    return items;
  }

  /** Today's reference prices (ceiling/floor/reference); every page is fetched. */
  getMasterData(): Promise<MasterData[]> {
    const today = todayDateStr();
    return this.fetchMasterData(today, today);
  }

  getMasterDataHistorical(from: string, to: string): Promise<MasterData[]> {
    requireNonEmpty(from, 'fromDate');
    requireNonEmpty(to, 'toDate');
    return this.fetchMasterData(from, to);
  }

  // ---------------------------------------------------------------------------
  // Corporate actions
  // ---------------------------------------------------------------------------

  /** Validate and build the query params (limits as the server documents them). */
  private corporateActionsParams(
    from: string,
    to: string,
    symbol: string | undefined,
    language: string,
    page: number,
    size: number,
  ): Dict {
    requireDateRange(from, to, { maxDays: CORPORATE_ACTIONS_MAX_DAYS });
    if (symbol !== undefined && symbol !== null) {
      requireSymbol(symbol);
      if (symbol.length > CORPORATE_ACTIONS_SYMBOL_MAX_LENGTH) {
        throw new ValidationError(
          `symbol must be at most ${CORPORATE_ACTIONS_SYMBOL_MAX_LENGTH} characters, got ${symbol.length}`,
        );
      }
    }
    const lang = typeof language === 'string' ? language.trim().toLowerCase() : language;
    if (!CORPORATE_ACTIONS_LANGUAGES.includes(lang)) {
      throw new ValidationError(
        `language must be one of ${CORPORATE_ACTIONS_LANGUAGES.join(', ')}, got '${String(language)}'`,
      );
    }
    requirePositiveInt(page, 'page');
    if (!CORPORATE_ACTIONS_PAGE_SIZES.includes(size)) {
      throw new ValidationError(
        `size must be one of ${CORPORATE_ACTIONS_PAGE_SIZES.join(', ')}, got ${String(size)}`,
      );
    }
    return corporateActionsRequestToParams({
      from,
      to,
      symbol: symbol ?? undefined,
      language: lang,
      pageIndex: page,
      pageSize: size,
    });
  }

  private async fetchCorporateActions(
    from: string,
    to: string,
    symbol: string | undefined,
    language: string,
  ): Promise<CorporateAction[]> {
    const size = Math.max(...CORPORATE_ACTIONS_PAGE_SIZES);
    const items: CorporateAction[] = [];
    for (let page = DEFAULT_PAGE; ; page++) {
      const params = this.corporateActionsParams(from, to, symbol, language, page, size);
      const data = await this.restClient.get(EP_DATA_CORPORATE_ACTIONS, params);
      items.push(...corporateActionsFromList(dataRows(data, 'corporate actions')));
      if (page >= pagesCount(data)) break;
    }
    return items;
  }

  /** Today's corporate actions (dividends, bonus shares, rights issues, ...); every page is fetched. */
  getCorporateActions(symbol?: string, language = 'vn'): Promise<CorporateAction[]> {
    const today = todayDateStr();
    return this.fetchCorporateActions(today, today, symbol, language);
  }

  /** Corporate actions in a past date range (at most 5 days per request); every page is fetched. */
  getCorporateActionsHistorical(
    from: string,
    to: string,
    symbol?: string,
    language = 'vn',
  ): Promise<CorporateAction[]> {
    return this.fetchCorporateActions(from, to, symbol, language);
  }
}

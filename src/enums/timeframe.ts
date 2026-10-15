export enum Timeframe {
  MINUTE_1 = '1m',
  MINUTE_3 = '3m',
  MINUTE_5 = '5m',
  MINUTE_15 = '15m',
  HOUR_1 = '1h',
  DAY_1 = '1d',
  WEEK_1 = '1w',
  MONTH_1 = '1M',
}

/**
 * Timeframes the OHLC endpoint accepts. `1w`/`1M` exist as members for backward compatibility,
 * but the server rejects them with error 400210.
 */
export const ALLOWED_TIMEFRAMES: ReadonlySet<Timeframe> = new Set([
  Timeframe.DAY_1,
  Timeframe.MINUTE_1,
  Timeframe.MINUTE_3,
  Timeframe.MINUTE_5,
  Timeframe.MINUTE_15,
  Timeframe.HOUR_1,
]);

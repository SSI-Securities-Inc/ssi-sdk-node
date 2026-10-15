/**
 * EXPERIMENTAL features that are not part of the stable facade.
 *
 * Trading WebSocket (order entry over `/ws/v3/trading`): the server side has not been announced
 * as released, so use it only against an environment you were told supports it. It is not
 * exported from the main entry and `Trading`/`Stream` never connect to it.
 *
 * ```ts
 * import { Auth, Config } from '@ssi.developer/ssi-sdk';
 * import { asyncTradingWs } from '@ssi.developer/ssi-sdk/experimental';
 *
 * const auth = new Auth(config);
 * await auth.ensureAuthenticated('123456');
 * const ws = await asyncTradingWs(auth);   // connects to Config.tradingWsUrl
 * const ack = await ws.placeOrder(...);    // PD ack; the outcome comes via order events
 * await ws.close();
 * ```
 */
import type { Auth } from './client.js';
import { TradingWSClient, TradingWSClientOptions } from './transport/tradingWs.js';
import { TradingWSService } from './services/tradingWs.js';

export { TradingWSError } from './exceptions.js';
export { TradingWSClient, MUTATING_METHODS, buildCommand, unwrap } from './transport/tradingWs.js';
export type { TradingWSResponse, TradingWSClientOptions } from './transport/tradingWs.js';
export { TradingWSService } from './services/tradingWs.js';
export type { FcoParamsKind, FcoListOptions, OrderBookQuery } from './services/tradingWs.js';

/** Caller options win key by key; an explicit `undefined` falls back to the `Config` value. */
function withDefaults(
  config: { timeoutMs: number; userAgent?: string },
  options: TradingWSClientOptions,
): TradingWSClientOptions {
  const merged: TradingWSClientOptions = { ...options };
  if (merged.requestTimeoutMs === undefined) merged.requestTimeoutMs = config.timeoutMs;
  if (merged.userAgent === undefined) merged.userAgent = config.userAgent;
  return merged;
}

/**
 * Open the trading WebSocket for an authenticated `Auth` and return the service.
 *
 * @param options - Transport tunables (timeouts, signature encoding, ping); `requestTimeoutMs`
 *   and `userAgent` default to the `Config` values.
 */
export async function asyncTradingWs(
  auth: Auth,
  options: TradingWSClientOptions = {},
): Promise<TradingWSService> {
  const config = auth.config;
  const client = new TradingWSClient(
    config.tradingWsUrl,
    () => auth.ensureAuthenticated(),
    config.privateKey,
    withDefaults(config, options),
  );
  await client.connect();
  return new TradingWSService(client, config);
}

export { asyncTradingWs as tradingWs };

# Changelog

All notable changes to `@ssi.developer/ssi-sdk` (Node.js / TypeScript). The version lives in `package.json`
and `src/version.ts` (kept in sync by `npm run sync-version`, which runs before every build).

Version 3.3.0 brings the Node SDK in line with `ssi-sdk-python` 3.3.0 (the source of truth for behaviour).
Items marked **BREAKING** change behaviour callers may depend on; the rest are additive or fixes.
Renamed members keep their old name as a deprecated alias, except the duration options and fields renamed to `...Ms`
(see the BREAKING entry under Changed), which have no alias.

Units: every duration the SDK defines is **milliseconds** and its name ends in `Ms`; `Token.expiresAt` is epoch
**seconds** (it is the server value).

## 3.3.0 - 2026-10-08

### Security
- Secrets no longer reach logs, `toString()`, `JSON.stringify` or `util.inspect`: `Config`, `Token` and
  `OTPResponse` hide `apiSecret`, `privateKey`, tokens and `transactionId` (the request shapes are plain
  interfaces, so never log them yourself); the REST client logs only method and path; the WebSocket client no longer logs the
  `Authorization` header, raw frames or URL query strings; exception `responseBody` is masked
  (`redact` / `mask` are exported).
- `new Auth(config)` / `new Data(...)` etc. never mutate the caller's `Config`, and an unknown option throws
  `ConfigurationError` instead of being ignored.
- **Action for the owner:** an older version could write a Bearer token to the log from the WebSocket client;
  revoke/rotate any token that was logged.
- WebSocket URLs must be `wss://` (streaming and trading WS); a plain `ws://` is refused.

### Added
- Exceptions: `SmartOTPPendingError`, `SmartOTPRejectedError`, `ReauthenticationRequired`, `DuplicateRequestError`,
  `TradingWSError`; `RateLimitError` gained `statusCode`, `retryAfterMs`, `limit`, `remaining`, `reset`; `APIError`
  takes `headers`. Enum `ServerErrorCode` covers the auth/OTP/refresh/signature/trading/data-validator codes;
  any refresh-token-unusable code (401101-401104, 401106-401108) forces re-authentication.
- `OTPResponse` and `requestOtpTyped()` (`transactionId` exists only for Smart OTP). `Auth` has explicit
  `token`, `accessToken`, `isTokenExpired`, `hasRefreshToken`, `canRefresh`, `getToken()` and `setToken()`.
- `Config`: `tradingApiDomain` (`tradingApiUrl` getter; follows `apiUrl` while left at the default),
  `tradingWsDomain` (`tradingWsUrl` getter), `userAgent`, `autoReconnect`, `otpPollIntervalMs`, `otpPollMaxWaitMs`,
  `maxBatchOrders` (default **20**), `toOptions()`. `apiUrl`, `streamingUrl`, `tradingApiDomain` and
  `tradingWsDomain` fall back to their defaults when missing or blank.
- Market data: `iterOhlc()` (async generator) / `getOhlcAll()`; `securitiesSummary` and `masterdata` follow
  `pagesCount`; foreign-trade fields on `MarketIndexSummary`; `stockType` on `SecuritiesInfo`; optional
  `ceiling`/`floor`/`refPrice` on `SecuritiesSummary`; `ALLOWED_TIMEFRAMES`.
- Trading: `placeBatchOrders()` / `cancelBatchOrders()` (`POST`/`DELETE /order/batch`, up to
  `Config.maxBatchOrders`, signed over the whole body); optional `clientRequestId` (idempotency key) on every
  `place*` method; `getFcoStatusHistory()`; optional OTP `code` on FCO place/cancel; `OrderStatus` lists every
  status the server emits; `sign()` verifies its result.
- REST client follows the server's rate-limit headers: `X-RateLimit-Limit` caps the request rate (never above
  `rateLimitPerSecond`), `X-RateLimit-Remaining: 0` rests one second, and a `429` on a `GET` is waited out
  (`Retry-After`, else 1s doubling; at most 3 retries, never over 30s) before `RateLimitError`. Orders and any
  `POST`/`PUT`/`DELETE` are never replayed. Last numbers: `restClient.rateLimit`.
- Streaming: supervised connection (reconnect with capped exponential backoff and jitter, a fresh token on every
  connect, proactive reconnect before the token expires, `{"code","msg"}` refusal frames honoured: 401/403
  refresh once, 429 waits at least 30 s), automatic resubscribe, requests split into frames under 4096 bytes.
  `isConnected`, `reconnectCount`, `lastError`, `onConnection` (`ConnectionEvent`).
- Streaming: typed callbacks `onMarketFlag`, `onOrder`, `onOrderMatch`, `onPortfolio`, `onIndexSummary`
  (alongside `onData`/`onTrading`, which still receive everything); `listSubscription()`, `subscribeMarket()`,
  `subscribeIndexTrade()`, `subscribeIndexSummary()`, `unsubscribeOrderStatus()`, `unsubscribePortfolio()`,
  `unsubscribeAll()`; clearer aliases (`subscribeTrades`, `subscribeQuotes`, `subscribeOrders`,
  `subscribeIndexTicks`, `subscribeMasterData`, `subscribeSessionFlag`, ...); `OrderMatchMessage`,
  `MarketDataMessage`, `IndexTickMessage`, `IndexSummaryMessage`; validated topic builder
  (`buildTopic`, `buildTopics`, `TOPIC_TYPES`, `STREAM_INTERVALS`). Topic codes are upper-cased (accounts are not).
- EXPERIMENTAL trading WebSocket, import from `@ssi.developer/ssi-sdk/experimental` (`asyncTradingWs` /
  `tradingWs`, `TradingWSClient`, `TradingWSService`, `TradingWSError`): signed order/FCO commands over
  `Config.tradingWsUrl`. Not exported from the main entry and not used by `Trading`/`Stream`. Signature
  encoding defaults to `"auto"` (base64 first, one retry in hex if the signature is refused with
  401006/401008/401013). A command that times out is never retried. `subscribeOrderEvents(accountNo)` needs one
  explicit account.
- Tests: `npm test` runs a `node:test` suite (62 tests) over config redaction, validators, token expiry,
  dispatch/reconnect helpers, the supervised WebSocket client with a fake socket, the trading WS client, parity
  fixes and `PriceLike` money input.

### Changed
- **BREAKING** All streaming `subscribe*` / `unsubscribe*` methods and `disconnect()` return a `Promise`
  (they used to return `void` and fire the send in the background). `await` them to surface validation and
  send errors; un-awaited calls now produce an unhandled rejection on failure.
- **BREAKING** All durations are milliseconds and carry an `Ms` suffix. There is no alias: an old `Config` option
  throws `ConfigurationError` ("Unknown Config option(s)") and an old field or option name is a compile error.
  | Old | New |
  | --- | --- |
  | `Config.timeout` | `Config.timeoutMs` |
  | `Config.retryDelay` | `Config.retryDelayMs` |
  | `Config.otpPollInterval` | `Config.otpPollIntervalMs` |
  | `Config.otpPollMaxWait` | `Config.otpPollMaxWaitMs` |
  | `RateLimitError.retryAfter` (seconds) | `RateLimitError.retryAfterMs` (milliseconds, `Retry-After` x 1000) |
  | trading WS option `requestTimeout` | `requestTimeoutMs` |
  | trading WS option `handshakeGrace` | `handshakeGraceMs` |
  | trading WS option `maxRateLimitWait` | `maxRateLimitWaitMs` |
  | trading WS option `pingInterval` | `pingIntervalMs` |
  Multiply any value you used for the old seconds-based fields by 1000.
- **BREAKING** Only `GET` is retried on timeout. `POST`/`PUT`/`DELETE` (auth, OTP, orders, FCO) are sent once.
- **BREAKING** `APIError.code` is the server's error code when the body has one (HTTP status stays in
  `statusCode`). HTTP 200 carrying `code` other than 200/204 raises `APIError`; the empty-result marker
  `{"code": 204}` yields empty results.
- **BREAKING** `ensureAuthenticated` treats a token with unknown expiry as expired, expires tokens 30 s early,
  and throws `ReauthenticationRequired` when the session cannot be refreshed. Concurrent refreshes make one call.
- **BREAKING** `AuthenticationError` (and its subclasses `SmartOTPPendingError`, `SmartOTPRejectedError`,
  `ReauthenticationRequired`) now extends `SSIError` directly, as a sibling of `APIError`. Code that relied on
  `catch (e) { if (e instanceof APIError) ... }` no longer catches auth failures: check `AuthenticationError` too, or
  catch `SSIError`. The constructor arguments did not change.
- **BREAKING** Only a timeout is retried on a `GET` (`retryAsync` / `isTimeoutError`); a connection reset or other
  network error is no longer retried.
- A forced `refresh()` that finds the token already renewed by a concurrent caller reuses it instead of calling the
  server again (single-flight; `ensureAuthenticated` skips a token that is fresh again).
- `parseDate` reads `a/b/YYYY HH:MM:SS` as dd/MM/YYYY; a date-only `a/b/YYYY` stays MM/DD/YYYY first, then dd/MM/YYYY.
- FCO: `fcoOrderBook` over the trading WS sends `pageIndex=1`, `pageSize=10`; `fco/cancel` sends `userAgent` only when
  `Config.userAgent` is set; an FCO price word (`ATO`/`ATC`/`MTL`/`MP`/`MOK`/`MAK`, any case, trimmed) has no slip.
- `asyncTradingWs(auth, options)` fills `requestTimeoutMs` and `userAgent` from `Config` when the option is missing or
  `undefined`.
- **BREAKING** Money and price input is `PriceLike` (`number | string`) everywhere: `place*`, `modifyOrder*`,
  `getMaxBuySell`, batch items, FCO prices, trigger prices (`stopPrice`, `activePrice`, `trailingAmount`,
  `tpActivePrice`, `slActivePrice`), slips and the trading WS. A string must be a plain decimal (`"25000.50"`): `NaN`,
  `Infinity`, empty text, an exponent (`"1e3"`) and a thousands separator (`"25,000"`) throw `ValidationError`
  before anything is sent. The `"25,000.50"` and `"1e-7"` strings that `formatPrice` used to accept are now refused.
  Order and FCO price text is sent as the caller wrote it (never rounded through a float; a `number` is expanded to
  plain digits); trigger fields and slips stay JSON numbers on the wire as in Python, and a string that a JS number
  cannot hold exactly (e.g. `"9007199254740993"`) is refused instead of rounded. FCO price strings that are neither a
  market word, `LO`/`PLO`, nor a plain decimal are refused. Response models still return money as `number` (changing
  them would break every consumer; the JSON the server sends is parsed as numbers anyway).
- **BREAKING** `Account.accountType` is `undefined` when the server omits it and the raw string for an unknown type.
- **BREAKING** `requireNonEmpty` treats `0`/`false` as present (still rejects null, blank strings, empty collections).
- **BREAKING** Streaming `onResponse` callbacks receive acks and no longer replace the
  `onData`/`onTrading`/`onHeartbeat` handler; interval topics accept only `tick`/`1m`/`5m`; topics are validated
  before sending; `OrderStatusMessage.price` is a number, or `ATO`/`ATC`/`MP` for market-priced orders, and `modifyTime` is `modifiedTime`.
- **BREAKING** `Order.osQuantity` is `undefined` (the server never sends it); `filledQuantity` and `cancelQuantity`
  read `filledQty`/`cancelQty`.
- Prices are sent as plain decimal strings (no exponent notation); `quantity` must be a positive integer; a limit
  order without a price is rejected. Market-priced helpers (ATO/ATC/MTL) keep sending `"0"`.
- Every order/FCO sends this machine's real device id (`getDeviceId()`); no placeholder MAC.
- FCO: dates must be `YYYY/MM/DD HH:MM:SS`, `from <= to`, window at most 31 days; `fco/cancel` sends `deviceId`;
  operators `0..4` in responses are parsed; response models tolerate unknown enum values.
- `maxBuySell` reads `purchasingPower`; balance reads `advancedCashT0/T1`, `withdrawableSSI/VSDC`; PPMMR accepts the
  server's key casing; positions send `querySummary` explicitly.
- Numeric parsing accepts `"1234.0"` and `"2,493,089"` and rejects inf/nan.
- OHLC methods complete a date-only `from`/`to` to `00:00:00` / `23:59:59` (the server answers 400213 otherwise);
  `page`/`size` < 1 are refused locally.
- The build now emits two entry points (`.` and `./experimental`).

### Deprecated
- `MaxBuySellResponse.purchasePower` -> `purchasingPower`; `DerivativeAccountBalance.cashWithdrawableSsi/Vsdc` ->
  `withdrawableSsi/Vsdc`; `OrderStatusMessage.modifyTime` -> `modifiedTime`;
  `PortfolioMessage.totalAsset/cashBalance/stockValue` (the server never sends them).
- Kept as aliases of renamed members: `buildGtdPayload` / `buildStopPayload` / `buildTrailingStopPayload` /
  `buildOcoPayload` / `buildBullBearPayload` (-> `gtdToPayload`, ...), `mapFco*` (-> `fco*FromDict`),
  `modifyOrderPriceById` / `modifyOrderQuantityById` (-> `...ByOrderId`), `subscribeFcoOrderStatus`
  (-> `subscribeOrderStatus`; FCO updates arrive on the same `order.<account>` topic).
- `getOhlc1WeekHistorical` / `getOhlc1MonthHistorical` now throw `ValidationError`: the server rejects those
  timeframes (400210).

### Fixed
- `EquityPosition` now carries `t1BuyQuantity` / `t2BuyQuantity` (the server's `t1BuyQuantity` / `t2BuyQuantity`,
  added to REST and trading-WS `position` next to `t1SellQuantity` / `t2SellQuantity`); they were silently dropped.
- `subscribeBoard`/`subscribeIndex` (and their `unsubscribe*`) now send `trade.<code>@*`, `quote.<code>@*` and
  `room.<code>@*`. By the server's routing (`ConnectionManager.IsBasketIndexPattern`/`IsExchangePattern`) a basket
  index or exchange is only fanned out to its symbols with the `@*` interval; the bare `trade.VN30`/`trade.HOSE`
  was acked "ok" but never matched a tick. The topic builder accepts `@*` (`STREAM_INTERVAL_ALL`) for `trade`/`quote`/
  `room`/`put`/`oddlot` with one concrete code. Based on reading the server code (its public docs still show the bare
  form); not yet confirmed against a live server.
- A comma list in one topic (`VNM,FPT`) is rejected with `ValidationError`: the server never splits on commas, so it
  was acked "ok" and matched nothing. Pass a list of filters instead (one topic each).
- The token refresh request now carries the `Authorization` header like every other request, matching the Python
  SDK (it was stripped for `/api/v3/auth/refresh`). The header is only removed by `clearAuthHeader()` after a
  reauth error. A bare JSON array response is returned as is (no `{data: [...]}` wrapping), as in Python.
- `market.FLAG` (tail upper-cased) was not recognised as the session flag; topic types match without regard to case.
- `trade.index.<code>` ticks are `IndexTickMessage`, not a symbol `TradeMessage`.
- `ping(onResponse, intervalMs)` loop now stops on `disconnect()`.
- `sign()` throws `ValidationError` (no key material in the message) for a missing or malformed `privateKey`.
- A WebSocket frame that is not a JSON object no longer breaks the receive loop; a failing user handler is logged
  with a masked message; a server refusal of a subscription is logged by category only.
- Smart OTP polling no longer treats a malformed token response as "pending".
- `TradingWSService` methods are all `async`, so validation errors reject the returned promise instead of
  throwing synchronously.

### Not ported from Python (by design or platform)
- Python's sync/async class pairs (`AsyncAuth`, `AsyncData`, ...), `Decimal`, and the `Config.deviceId`
  removal: Node has one promise-based API and keeps money as decimal strings; `Config` never had a `deviceId`.
- `Config.proxy` is not applied to WebSockets: the `ws` library has no built-in proxy support. Pass an
  `agent` through the experimental client options if you need one.
- `placeFco` of the experimental trading WS takes `{ kind, params }` (`'gtd' | 'stop' | 'trailingStop' | 'oco' |
  'bullBear'`) because the TypeScript params interfaces cannot be told apart at runtime (Python dispatches on the class).
- `getOpenDerivativePositions` / `getClosedDerivativePositions` return `[]` where Python raises when the server omits the list.
- Bulk OHLC download (`downloadOhlc*`: the server has no `data/file` endpoint yet) and `fcoEvent` streaming.

# AGENT.md - guide for developers and AI agents using @ssi.developer/ssi-sdk

Instructions, patterns and conventions for AI coding assistants (Claude, Gemini, Cursor, Copilot, ...) and humans integrating
the `@ssi.developer/ssi-sdk` Node.js / TypeScript package (version 3.3.0). The full method list is in `API_METHODS.md`,
changes are in `CHANGELOG.md`, usage in `README.md`.

---

## 1. Overview and architecture

SDK for SSI's **FastConnect v3 API** (ESM and CommonJS, strict TypeScript): authentication (OTP, Smart OTP, refresh),
market data, trading and portfolio (orders, FCO conditional orders, batch orders), and realtime streaming.

```
Facade (Auth / Data / Trading / Stream)
   └── Services (TokenManager, MarketDataService, AccountService, PortfolioService, TradingService, StreamingService)
        └── Transport (RestClient / WebSocketClient)
             └── Leaves (models, enums, utils, constants, config)
```

Rules of the design:
1. `Auth` owns the REST client and the token; `Data`, `Trading` and `Stream` take an `Auth` and share them.
2. Everything that hits the network returns a `Promise`. There is no sync API.
3. Every duration the SDK defines is **milliseconds** and its name ends in `Ms` (`timeoutMs`, `retryDelayMs`, `RateLimitError.retryAfterMs`, ...); `Token.expiresAt` is epoch **seconds**.
4. Money and prices are `PriceLike` (`number | string`). Pass a plain decimal string (`"25000.50"`) to avoid float rounding;
   `NaN`, `Infinity`, empty text, exponent (`"1e3"`) and separators (`"25,000"`) throw `ValidationError`. Order/FCO price text goes
   out as written; trigger fields and slips go out as JSON numbers and a string a JS number cannot hold exactly is refused.
   Responses return money as `number`. Never do float arithmetic on a price you send.
5. Only `GET` is retried (timeouts). Orders, FCO, OTP and auth `POST`/`PUT`/`DELETE` are sent once: use `clientRequestId` as
   an idempotency key and check the order book before resending after an error.
6. The experimental trading WebSocket lives in a separate entry point: `@ssi.developer/ssi-sdk/experimental`.

---

## 2. Setup and authentication

```typescript
import { Auth, Data, Trading, Stream } from '@ssi.developer/ssi-sdk';

const auth = new Auth({
  clientId: process.env.SSI_CLIENT_ID,
  apiKey: process.env.SSI_API_KEY,
  apiSecret: process.env.SSI_API_SECRET,
  privateKey: process.env.SSI_PRIVATE_KEY, // base64 XML RSA key, only for signed orders
});
await auth.authenticate(process.env.SSI_OTP);          // market data needs no OTP
const data = new Data(auth);
const trading = new Trading(auth);
const stream = new Stream(auth);
```

`new Auth(config | options, overrides?)` never mutates a `Config` you pass and throws `ConfigurationError` on an unknown option.
Read secrets from the environment or a vault, never from source. Nothing in `Config`, `Token` or an exception prints a secret,
but do not log them yourself.

Smart OTP: `const { transactionId } = await auth.requestOtpTyped()`, then
`await auth.ensureAuthenticated(undefined, transactionId)` polls until the user approves (`otpPollIntervalMs` / `otpPollMaxWaitMs`).
`ensureAuthenticated()` reuses, refreshes or authenticates; it throws `ReauthenticationRequired` when a new OTP is needed.

`Config` options: `clientId`, `apiUrl`, `streamingUrl`, `tradingApiDomain`, `tradingWsDomain`, `apiKey`, `apiSecret`,
`privateKey`, `timeoutMs`, `maxRetries`, `retryDelayMs`, `rateLimitPerSecond`, `maxBatchOrders` (20), `proxy`, `userAgent`,
`autoReconnect`, `otpPollIntervalMs`, `otpPollMaxWaitMs`, `logLevel`. Blank or missing URLs fall back to defaults. WebSocket URLs must be `wss://`.

---

## 3. API cheatsheet (full list: `API_METHODS.md`)

### 3.1 Market data (`data.marketData`)

| Method | Returns | Notes |
|---|---|---|
| `getOhlc1Minute(symbol)` (also 3/5/15 minute, `1Hour`) | `OHLCData[]` | latest trading day |
| `getOhlc1MinuteHistorical(symbol, from, to, page?, size?)` (also 3/5/15 minute, 1Hour, 1Day) | `OHLCData[]` | date-only values are completed to the day |
| `iterOhlc(symbol, timeframe, from?, to?, size?)` | `AsyncGenerator<OHLCData>` | follows every page: `for await (const bar of ...)` |
| `getOhlcAll(symbol, timeframe, from?, to?, size?, ascending?)` | `OHLCData[]` | all pages |
| `getIndexes()` / `getIndexesByBoard(board)` | `MarketIndexes[]` | |
| `getIndexSummary(index)` / `getBoardSummary(board)` (+ `Historical(x, tradingDate)`) | `MarketIndexSummary \| undefined` | |
| `getSecuritiesInfo(symbol)` / `...ByIndex` / `...ByBoard` | `SecuritiesInfo` | |
| `getSecuritiesSummary(symbol)` / `...Historical` / `...ByIndex` | `SecuritiesSummary[]` | follows `pagesCount` |
| `getMasterData()` / `getMasterDataHistorical(from, to)` | `MasterData[]` | ceiling, floor, reference |

`getOhlc1WeekHistorical` / `getOhlc1MonthHistorical` throw `ValidationError` (the server rejects them).

### 3.2 Account and portfolio (`trading.account`, `trading.portfolio`)

`getAccountInfo()`; `getEquityBalance`, `getDerivativeBalance`, `getEquityPositions`, `getDerivativePositions`,
`getOpenDerivativePositions`, `getClosedDerivativePositions`, `getEquityPpmmr`, `getDerivativePpmmr`, `getTodayOrders`
(all take `accountNo`), `getHistoricalOrders(accountNo, fromDate, toDate)`.

### 3.3 Orders (`trading.trading`)

`placeLimitOrder(accountNo, symbol, side, quantity, price, clientRequestId?)`, `placeMarketOrder`, `placeAtoOrder`,
`placeAtcOrder`, `placeOrder(..., price, orderType, clientRequestId?)`; `modifyOrderPrice` / `modifyOrderQuantity`
(by `clientRequestId`) and `...ByOrderId`; `cancelOrder(accountNo, clientRequestId)` / `cancelOrderById(accountNo, orderId)`;
`placeBatchOrders(orders)` / `cancelBatchOrders(orders)` (at most `Config.maxBatchOrders`, one signed request, one bad order
fails the batch); `getMaxBuySell(accountNo, symbol, price)` / `getMaxBuySellAtMarketPrice`.

### 3.4 FCO conditional orders (`trading.trading`)

`placeFcoGtd`, `placeFcoStop`, `placeFcoStopLimit`, `placeFcoTrailingStop`, `placeFcoTrailingStopLimit`, `placeFcoOco`,
`placeFcoBullBear` (all end with `fromDate, toDate, code?`), `cancelFco(fcoId, code?)`, `getFcoByAccountNo`, `getFcoBySymbol`,
`getFcoByStatus`, `getFcoByDate`, `getFcoById`, `getFcoOrderBook`, `getFcoStatusHistory`.
Dates must be `YYYY/MM/DD HH:MM:SS`, `from <= to`, a window of at most 31 days (`fromBeginningOfDay()` / `fromEndOfDay()` help).
`code` is the optional OTP for conditional orders.

### 3.5 Streaming (`stream.streaming`)

Every `subscribe*` / `unsubscribe*` and `disconnect()` returns a `Promise`: `await` them.

```typescript
const s = stream.streaming;
s.onOrder = (m) => console.log('order', m.orderId, m.status);
s.onConnection = (e) => console.log('connection', e.state);
await s.connect();
await s.subscribeTrades(['SSI']);
await s.subscribeOrders('1234561');   // one account, or '*' for all
await s.wait();
```

Typed callbacks: `onMarketFlag`, `onIndexSummary`, `onOrder`, `onOrderMatch`, `onPortfolio` (plus `onData` / `onTrading` /
`onHeartbeat` that receive everything). State: `isConnected`, `reconnectCount`, `lastError`. The connection reconnects by itself
(capped exponential backoff, fresh token each time, resubscribe), so do not rebuild it on a drop. Interval topics accept only
`tick`, `1m`, `5m`. `buildTopic` / `buildTopics` build validated topic strings.

### 3.6 Experimental trading WebSocket

```typescript
import { asyncTradingWs } from '@ssi.developer/ssi-sdk/experimental';
const ws = await asyncTradingWs(auth);           // connects to Config.tradingWsUrl
await ws.subscribeOrderEvents('1234561');
const ack = await ws.placeOrder('1234561', 'SSI', OrderSide.BUY, 100, '25000', OrderType.LO, 'my-id-1');
await ws.close();
```

Use it only against an environment you were told supports it. It is not part of `Trading` or `Stream`. Orders return the `PD`
ack; the outcome arrives on order events (`ws.client.onEvent`). A command that times out is not retried.

---

## 4. Errors

All extend `SSIError` (`message`, `code`, `statusCode`, `responseBody` (masked), `headers`): `APIError` (`DuplicateRequestError`),
`AuthenticationError` (`SmartOTPPendingError`, `SmartOTPRejectedError`, `ReauthenticationRequired`), a sibling of `APIError`, not
a child: `instanceof APIError` does not catch auth failures. Also `RateLimitError`
(`retryAfterMs` milliseconds, `limit`, `remaining`, `reset`), `WebSocketError` (`TradingWSError`), `ValidationError`, `ConfigurationError`.
`ServerErrorCode` lists the server's codes. Show callers a generic message; do not echo `responseBody` to end users.

---

## 5. Rules for code generators

1. Dates for FCO: `"YYYY/MM/DD HH:MM:SS"`. Market-data dates: `YYYY/MM/DD` (date-only is accepted).
2. Never hardcode or print secrets (keys, secrets, tokens, OTP, `transactionId`, account or customer ids in logs/tests).
3. Use the enums (`OrderSide.BUY`, `OrderType.LO`, `FCOOperator.GREATER_OR_EQUAL`, `Timeframe`) instead of raw strings.
4. `await` every streaming call; do not fire-and-forget a subscribe.
5. Do not retry an order automatically after a timeout or network error: look it up by `clientRequestId` first.
6. Keep TLS verification on, including in dev. Do not point the SDK at `ws://` or plain `http://` hosts.
7. Verify changes with `npm run type-check && npm run build && npm test`.
8. Deprecated names still work (some also warn at runtime): `buildGtdPayload` and friends, `mapFco*`, `modifyOrderPriceById`,
   `modifyOrderQuantityById`, `subscribeFcoOrderStatus`. Prefer the new names.

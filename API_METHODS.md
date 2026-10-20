# API_METHODS.md - every public method

> Written by hand from `src/` for 3.3.2 (the Python SDK generates its list; keep this file in step when a method is added or renamed).
> Narrative guides: `README.md` (usage), `AGENT.md` (cheat sheet), `CHANGELOG.md`.

Clients: `Auth`, `Data`, `Trading`, `Stream` (see `src/client.ts`). Every method that talks to the network returns a `Promise`.
Timeouts and delays are in **milliseconds**. Prices and money inputs (order, modify, max buy/sell, batch items, FCO prices, trigger prices, trailing amounts, slips, trading WS) are `PriceLike` (`number | string`). A string must be a plain decimal such as `"25000.50"`; `NaN`, `Infinity`, empty text, an exponent (`"1e3"`) or a thousands separator throws `ValidationError`. Order and FCO price text is sent as written; trigger fields and slips are sent as JSON numbers and a string a JS number cannot hold exactly is refused. Responses return money as `number`. `AuthenticationError` (with `SmartOTPPendingError`, `SmartOTPRejectedError`, `ReauthenticationRequired`) is a sibling of `APIError` under `SSIError`.

## Authentication

Reach it through `auth.tokenManager` (also delegated onto `auth`).

| Method | Arguments | What it does |
|---|---|---|
| `authenticate` | `(otp?: string, transactionId?: string) => Promise<Token>` | Get an access token with consumer credentials plus OTP (or a Smart OTP `transactionId`). |
| `ensureAuthenticated` | `(otp?, transactionId?, pollIntervalMs?, pollMaxRetries?) => Promise<string>` | Return a valid access token: reuse, refresh or authenticate; polls Smart OTP approval. |
| `refresh` | `() => Promise<Token>` | New access token from the refresh token (one server call for concurrent callers). |
| `requestOtp` | `() => Promise<Record<string, unknown>>` | Ask for an OTP (normal) or push an approval (Smart OTP). |
| `requestOtpTyped` | `() => Promise<OTPResponse>` | Same, typed. |
| `getToken` / `setToken` | `() => Token \| null` / `(Token \| TokenInit) => void` | Read or set the stored token. |

Getters on `auth`: `token`, `accessToken`, `isTokenExpired`, `hasRefreshToken`, `canRefresh`; `auth.config`, `auth.restClient`.

## Market data

Reach it through `data.marketData`.

| Method | Arguments | What it does |
|---|---|---|
| `getOhlc1Minute` / `3Minute` / `5Minute` / `15Minute` / `1Hour` | `(symbol)` | OHLC bars for the latest trading day. |
| `getOhlc{1Minute,3Minute,5Minute,15Minute,1Hour,1Day}Historical` | `(symbol, from, to, page = 1, size = 1000)` | OHLC bars between two dates (date-only values are completed to the day). |
| `getOhlc1WeekHistorical` / `getOhlc1MonthHistorical` | `(symbol, from, to, page?, size?)` | Deprecated: throw `ValidationError` (the server does not serve them). |
| `iterOhlc` | `(symbol, timeframe, from?, to?, size = 1000) => AsyncGenerator<OHLCData>` | Iterate every bar in a range, page after page. |
| `getOhlcAll` | `(symbol, timeframe, from?, to?, size = 1000, ascending = false) => Promise<OHLCData[]>` | Every bar in a range across all pages. |
| `downloadOhlc1Minute` / `downloadOhlc1Day` | `(symbol)` | Not implemented (no server endpoint yet). |
| `getIndexes` | `() => MarketIndexes[]` | All market indexes. |
| `getIndexesByBoard` | `(board)` | Indexes of one board. |
| `getIndexSummary` / `getIndexSummaryHistorical` | `(index)` / `(index, tradingDate)` | Summary of an index (latest / one date). |
| `getBoardSummary` / `getBoardSummaryHistorical` | `(board)` / `(board, tradingDate)` | Summary of a board (latest / one date). |
| `getSecuritiesInfo` | `(symbol) => SecuritiesInfo \| undefined` | Info record of one security. |
| `getSecuritiesInfoByIndex` / `getSecuritiesInfoByBoard` | `(index)` / `(board)` | Info records of an index or board. |
| `getSecuritiesSummary` / `getSecuritiesSummaryHistorical` | `(symbol)` / `(symbol, from, to)` | Securities summary (today / date range). |
| `getSecuritiesSummaryByIndex` / `...ByIndexHistorical` | `(index)` / `(index, from, to)` | Summary of an index's members. |
| `getMasterData` / `getMasterDataHistorical` | `()` / `(from, to)` | Ceiling, floor and reference prices. |
| `getCorporateActions` | `(symbol?: string, language = 'vn') => CorporateAction[]` | Today's corporate actions (dividends, bonus shares, rights issues, ...). |
| `getCorporateActionsHistorical` | `(from: string, to: string, symbol?: string, language = 'vn') => CorporateAction[]` | Corporate actions in a past date range (at most 5 days). |

## Account

Reach it through `trading.account`.

| Method | Arguments | What it does |
|---|---|---|
| `getAccountInfo` | `() => Promise<Account[]>` | Accessible trading accounts. |

## Portfolio

Reach it through `trading.portfolio`. All take `accountNo`.

| Method | Arguments | What it does |
|---|---|---|
| `getEquityBalance` / `getDerivativeBalance` | `(accountNo)` | Account balance. |
| `getEquityPositions` | `(accountNo)` | Equity holdings. |
| `getDerivativePositions` / `getOpenDerivativePositions` / `getClosedDerivativePositions` | `(accountNo)` | Derivative positions (all / open / closed). |
| `getEquityPpmmr` / `getDerivativePpmmr` | `(accountNo)` | Purchasing power and margin ratio. |
| `getTodayOrders` | `(accountNo) => Order[]` | Today's orders. |
| `getHistoricalOrders` | `(accountNo, fromDate, toDate) => Order[]` | Orders in a date range. |

## Trading (orders, FCO, batch)

Reach it through `trading.trading`. Order methods are never retried; pass `clientRequestId` as an idempotency key.

| Method | Arguments | What it does |
|---|---|---|
| `placeOrder` | `(accountNo, symbol, side, quantity, price, orderType, clientRequestId?)` | Place an order of any type. |
| `placeLimitOrder` | `(accountNo, symbol, side, quantity, price, clientRequestId?)` | LO order. |
| `placeMarketOrder` / `placeAtoOrder` / `placeAtcOrder` | `(accountNo, symbol, side, quantity, clientRequestId?)` | MTL / ATO / ATC order. |
| `modifyOrderPrice` / `modifyOrderPriceByOrderId` | `(accountNo, clientRequestId \| orderId, price)` | Change an order's price. |
| `modifyOrderQuantity` / `modifyOrderQuantityByOrderId` | `(accountNo, clientRequestId \| orderId, quantity)` | Change an order's quantity. |
| `modifyOrderPriceById` / `modifyOrderQuantityById` | same as `...ByOrderId` | Deprecated aliases. |
| `cancelOrder` / `cancelOrderById` | `(accountNo, clientRequestId)` / `(accountNo, orderId)` | Cancel an order. |
| `placeBatchOrders` / `cancelBatchOrders` | `(orders)` | Batch place / cancel in one signed request (up to `Config.maxBatchOrders`). |
| `getMaxBuySell` / `getMaxBuySellAtMarketPrice` | `(accountNo, symbol, price)` / `(accountNo, symbol)` | Maximum buy/sell quantity. |
| `placeFcoGtd` | `(accountNo, symbol, side, quantity, price, priceSlip, fromDate, toDate, code?)` | GTD conditional order. |
| `placeFcoStop` | `(accountNo, symbol, side, quantity, stopPrice, operator, fromDate, toDate, code?)` | Stop order. |
| `placeFcoStopLimit` | `(..., price, priceSlip, stopPrice, operator, fromDate, toDate, code?)` | Stop-limit order. |
| `placeFcoTrailingStop` | `(..., activePrice, trailingAmount, fromDate, toDate, code?)` | Trailing stop. |
| `placeFcoTrailingStopLimit` | `(..., activePrice, trailingAmount, priceSlip, fromDate, toDate, code?)` | Trailing stop-limit. |
| `placeFcoOco` | `(..., tpActivePrice, slActivePrice, tpPrice, slPrice, tpSlip, slSlip, fromDate, toDate, code?)` | One-cancels-the-other. |
| `placeFcoBullBear` | `(..., price, priceSlip, tpActivePrice, slActivePrice, tpPrice, slPrice, tpSlip, slSlip, fromDate, toDate, code?)` | Bull-bear order. |
| `cancelFco` | `(fcoId, code?)` | Cancel a conditional order. |
| `getFcoByAccountNo` / `getFcoBySymbol` | `(accountNo[, symbol], pageIndex?, pageSize?)` | List conditional orders. |
| `getFcoByStatus` | `(accountNo, processStatus \| processStatus[], pageIndex?, pageSize?)` | Filter by status. |
| `getFcoByDate` | `(accountNo, fromDate, toDate, pageIndex?, pageSize?)` | Filter by date. |
| `getFcoById` | `(accountNo, fcoId) => FCOInfo \| undefined` | One conditional order. |
| `getFcoOrderBook` | `(fcoId, pageIndex?, pageSize?)` | Execution log of a conditional order. |
| `getFcoStatusHistory` | `(fcoId) => FCOStatusHistoryItem[]` | Status transitions of a conditional order. |

## Streaming

Reach it through `stream.streaming`. Every `subscribe*` / `unsubscribe*` / `disconnect` returns a `Promise<void>`: `await` it.

| Method | Arguments | What it does |
|---|---|---|
| `connect` / `disconnect` | `()` | Open / close the WebSocket (disconnect also stops the ping loop). |
| `wait` | `(timeoutMs?)` | Resolve when the connection ends for good or the timeout passes. |
| `ping` | `(onResponse?, intervalMs?)` | One ping, or a background loop when `intervalMs` is given. |
| `listSubscription` | `(timeoutMs = 5000) => { trading, data }` | Topics this connection is subscribed to. |
| `subscribeSymbol` / `unsubscribeSymbol` | `(symbols[, onResponse])` | Trade + quote + foreign room. |
| `subscribeSymbolTrade` / `Quote` / `Room` / `PutThrough` / `OddLot` | `(symbols, onResponse?)` | One channel per symbol. `unsubscribe...` takes `(symbols)`. |
| `subscribeSymbolOhlcv` / `unsubscribeSymbolOhlcv` | `(symbols, interval[, onResponse])` | Candles; `interval` is `tick`, `1m` or `5m`. |
| `subscribeBoard` / `subscribeIndex` | `(boards \| indices, onResponse?)` | Trade, quote and room of a board / index, sent as `<type>.<code>@*` (the server only fans out with `@*`); `unsubscribe...` takes the list. |
| `subscribeIndexTrade` / `unsubscribeIndexTrade` | `(indices, interval?, onResponse?)` | Ticks of the index itself (`trade.index.<code>`). |
| `subscribeIndexSummary` / `unsubscribeIndexSummary` | `(indices[, onResponse])` | `indexsummary.<code>`. |
| `subscribeMarket` / `unsubscribeMarket` | `(symbols[, onResponse])` | Master data (ceiling, floor, reference). |
| `subscribeMarketFlag` / `unsubscribeMarketFlag` | `([onResponse])` | Session flags (ATO, LO, ATC, ...). |
| `subscribeOrderStatus` / `unsubscribeOrderStatus` | `(accountNo = '*'[, onResponse])` | `order.<account>` events. |
| `subscribePortfolio` / `unsubscribePortfolio` | `(accountNo = '*'[, onResponse])` | `portfolio.<account>` events. |
| `unsubscribeAll` | `() => { trading, data }` | Drop everything this connection subscribed to. |

Aliases (same methods): `subscribeTrades`, `subscribeQuotes`, `subscribeForeignRoom`, `subscribePutThrough`, `subscribeOddLot`,
`subscribeCandles`, `subscribeExchangeTrades` (= `subscribeBoard`), `subscribeIndexConstituents` (= `subscribeIndex`),
`subscribeIndexTicks`, `subscribeMasterData`, `subscribeSessionFlag`, `subscribeOrders`, `subscribePositions`, and their `unsubscribe...`
twins. Deprecated: `subscribeFcoOrderStatus` (= `subscribeOrderStatus`).

Callbacks and state (assign a function to `on*`):

| Name | What it is |
|---|---|
| `onData` / `onTrading` / `onHeartbeat` | Every data / trading / heartbeat message. |
| `onMarketFlag`, `onIndexSummary`, `onOrder`, `onOrderMatch`, `onPortfolio` | Typed callbacks for one message kind. |
| `onConnection` | `ConnectionEvent`: connected / reconnected / disconnected / failed. |
| `isConnected`, `reconnectCount`, `lastError` | Connection state. |

## Trading WebSocket

`import { asyncTradingWs } from '@ssi.developer/ssi-sdk'`; `const ws = await asyncTradingWs(auth)`.
`Trading` and `Stream` never connect to it. Commands are never retried; order methods return the `PD` ack and the outcome comes on the order events.

| Method | Arguments | What it does |
|---|---|---|
| `placeOrder` | `(accountNo, symbol, side, quantity, price, orderType, clientRequestId?)` | `order.place`. |
| `amendOrder` | `(accountNo, price?, quantity?, orderId?, clientRequestId?)` | `order.amend` (price or quantity, not both). |
| `cancelOrder` | `(accountNo, orderId?, clientRequestId?)` | `order.cancel` (exactly one id). |
| `batchNewOrders` / `batchCancelOrders` | `(orders)` | `order.batchNew` / `order.batchCancel`, atomic. |
| `placeFco` | `({ kind: 'gtd' \| 'stop' \| 'trailingStop' \| 'oco' \| 'bullBear', params })` | `fco.place`. |
| `cancelFco` | `(fcoId, code?)` | `fco.cancel`. |
| `listFco` | `(accountNo, { fcoId?, type?, processStatus?, symbol?, side?, fromDate?, toDate?, pageIndex?, pageSize? })` | `fco.list` (one status only). |
| `fcoOrderBook` / `fcoStatusHistory` | `(fcoId)` | `fco.orderbook` / `fco.statusHistory`. |
| `queryPosition` | `(accountNo, querySummary = true)` | `query.position`. |
| `queryMaxBuySell` | `(accountNo, symbol, price?)` | `query.maxBuySell` (price as a JSON number). |
| `queryAccountBalance` / `queryPpmmrAccount` | `(accountNo)` | Balance / purchasing power. |
| `queryOrderBook` | `(accountNo, { fromDate?, toDate?, symbol?, orderStatus?, pageIndex?, pageSize? })` | `query.orderBook`. |
| `subscribeOrderEvents` / `unsubscribeOrderEvents` | `(accountNo)` | `order.<account>` (one account, no `*`). |
| `subscribePortfolioEvents` / `unsubscribePortfolioEvents` | `(accountNo)` | `portfolio.<account>`. |
| `unsubscribeAllEvents` | `()` | Drop every trading subscription of the socket. |
| `command` | `(method, params) => TradingWSResponse` | Send any command, return the first response frame. |
| `close` | `()` | Close the socket. |

Property `client`: the transport (`TradingWSClient`); set `client.onEvent` to receive events.

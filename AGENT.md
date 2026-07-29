# AGENT.md — AI Agent Integration Guide for @ssi.developer/ssi-sdk

This guide provides AI coding assistants (Claude, Gemini, Cursor, Copilot, etc.) with instructions, code patterns, architectural conventions, and an API cheatsheet for integrating and interacting with the `@ssi.developer/ssi-sdk` Node.js / TypeScript package.

---

## 1. Overview & Architecture

`@ssi.developer/ssi-sdk` is a lightweight, high-performance Node.js/TypeScript SDK for SSI's **FastConnect v3 API**. It provides modern TypeScript support (ESM & CommonJS) for:
- Authentication & Token Management (OTP, Refresh Token, Auto-refresh)
- Market Data (OHLC 1min/1day, Indexes, Securities Information & Summary)
- Trading & Portfolio (Order placement/modification/cancellation, FCO conditional orders, Account balances, Positions, PPMMR)
- Realtime Streaming (WebSocket market data & trading events)

### Layering & Structure
```
Facade Client (Auth / Data / Trading / Stream)
   └── Services (MarketDataService, AccountService, PortfolioService, TradingService, StreamingService)
        └── Transport (RestClient / StreamingClient)
             └── Leaf Modules (models, enums, utils, constants, config)
```

### Key Architectural Constraints for AI Agents
1. **Modular Facade Pattern**: Root clients are split into 4 specialized clients: `Auth`, `Data`, `Trading`, `Stream`. All non-Auth clients accept an `Auth` instance.
2. **TypeScript Interfaces & Types**: Request/Response models are strictly typed using TypeScript interfaces in `src/models`.
3. **Type Safety with Enums**: All protocol constants (`OrderSide`, `OrderType`, `OrderStatus`, `Board`, `AccountType`, `FCOType`, `FCOOperator`, `FCOStatus`, `Timeframe`) are defined as Enums in `src/enums`.
4. **Header User-Agent Parity**: Requests to SSI API include a browser `User-Agent` header by default (`DEFAULT_USER_AGENT`) to ensure seamless firewall pass-through.

---

## 2. Authentication & Setup Pattern

### Configuration Initialization
```typescript
import { Config } from '@ssi.developer/ssi-sdk';

const config = new Config({
  clientId: "YOUR_CLIENT_ID",
  apiKey: "YOUR_API_KEY",
  apiSecret: "YOUR_API_SECRET",
  privateKey: "YOUR_PRIVATE_KEY", // Base64 RSA Private Key
  apiUrl: "https://api.ssi.com.vn",
});
```

### Authentication Flow
```typescript
import { Auth, Trading, Data, Stream } from '@ssi.developer/ssi-sdk';

async function main() {
  const auth = new Auth(config);

  // Authenticate with OTP (Required for Trading & Streaming)
  await auth.authenticate("123456");

  // Create sub-clients sharing the auth context
  const data = new Data(auth);
  const trading = new Trading(auth);
  const stream = new Stream(auth);
}
```

---

## 3. Public API Cheatsheet for AI Agents

### 3.1 Market Data (`data.marketData`)

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `getOhlc1Minute` | `symbol, pageIndex?, pageSize?` | `Promise<OHLCData>` | Query 1-minute candle OHLCV data |
| `getOhlc1Day` | `symbol, pageIndex?, pageSize?` | `Promise<OHLCData>` | Query 1-day candle OHLCV data |
| `downloadOhlc1Minute` | `symbol` | `Promise<OHLCData>` | Download full 1-minute OHLC history |
| `downloadOhlc1Day` | `symbol` | `Promise<OHLCData>` | Download full 1-day OHLC history |
| `getMarketIndexes` | `indexId?` | `Promise<MarketIndexes>` | Get list of market indexes |
| `getMarketIndexSummary` | `indexId?, fromDate?, toDate?, pageIndex?, pageSize?` | `Promise<MarketIndexSummary>` | Summary metrics for an index |
| `getSecuritiesInfo` | `symbol?, market?, pageIndex?, pageSize?` | `Promise<SecuritiesInfo>` | Security details (listed shares, lot size, etc.) |
| `getSecuritiesSummary` | `symbol?, market?, pageIndex?, pageSize?` | `Promise<SecuritiesSummary>` | Summary of stock transactions |

### 3.2 Account & Portfolio (`trading.account` & `trading.portfolio`)

| Service | Method | Return Type | Description |
|---------|--------|-------------|-------------|
| `account` | `getAccountInfo()` | `Promise<AccountInfo[]>` | Query list of sub-accounts |
| `portfolio` | `getEquityBalance(accountNo)` | `Promise<EquityAccountBalance>` | Cash balance & debt for cash/margin account |
| `portfolio` | `getDerivativeBalance(accountNo)` | `Promise<DerivativeAccountBalance>` | Balance & margin for derivative account |
| `portfolio` | `getEquityPositions(accountNo)` | `Promise<EquityPosition[]>` | Equity stock holdings |
| `portfolio` | `getDerivativePositions(accountNo)` | `Promise<AllDerivativePosition>` | Derivative contract positions (open & closed) |
| `portfolio` | `getTodayOrders(accountNo)` | `Promise<Order[]>` | Intraday orders |
| `portfolio` | `getHistoricalOrders(accountNo, fromDate, toDate)` | `Promise<Order[]>` | Historical order book entries |
| `portfolio` | `getEquityPpmmr(accountNo)` | `Promise<EquityPPMMR>` | Purchasing power & margin ratio (Equity) |
| `portfolio` | `getDerivativePpmmr(accountNo)` | `Promise<DerivativePPMMR>` | Purchasing power & margin ratio (Derivative) |

### 3.3 Standard Trading (`trading.trading`)

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `placeLimitOrder` | `accountNo, symbol, side, quantity, price` | `Promise<PlaceOrderResponse>` | Place LO order |
| `placeMarketOrder` | `accountNo, symbol, side, quantity` | `Promise<PlaceOrderResponse>` | Place MTL market order |
| `placeAtoOrder` | `accountNo, symbol, side, quantity` | `Promise<PlaceOrderResponse>` | Place ATO opening order |
| `placeAtcOrder` | `accountNo, symbol, side, quantity` | `Promise<PlaceOrderResponse>` | Place ATC closing order |
| `placeOrder` | `accountNo, symbol, side, quantity, price, orderType` | `Promise<PlaceOrderResponse>` | Place order with custom OrderType |
| `modifyOrderPriceById` | `accountNo, orderId, price` | `Promise<ModifyOrderResponse>` | Modify order price by server order ID |
| `modifyOrderQuantityById` | `accountNo, orderId, quantity` | `Promise<ModifyOrderResponse>` | Modify order quantity by server order ID |
| `cancelOrderById` | `accountNo, orderId` | `Promise<CancelOrderResponse>` | Cancel order by server order ID |
| `getMaxBuySell` | `accountNo, symbol, price` | `Promise<MaxBuySellResponse>` | Max buy/sell qty at given price |

### 3.4 Flexible Conditional Orders - FCO (`trading.trading`)

| Method | Key Parameters | Return Type | Description |
|--------|----------------|-------------|-------------|
| `placeFcoGtd` | `accountNo, symbol, side, quantity, price, priceSlip, fromDate, toDate` | `Promise<FCOPlaceResponse>` | Good Till Date order |
| `placeFcoStop` | `accountNo, symbol, side, quantity, stopPrice, operator, fromDate, toDate` | `Promise<FCOPlaceResponse>` | Stop Market order |
| `placeFcoStopLimit` | `accountNo, symbol, side, quantity, price, priceSlip, stopPrice, operator, fromDate, toDate` | `Promise<FCOPlaceResponse>` | Stop Limit order |
| `placeFcoTrailingStop` | `accountNo, symbol, side, quantity, activePrice, trailingAmount, fromDate, toDate` | `Promise<FCOPlaceResponse>` | Trailing Stop Market |
| `placeFcoTrailingStopLimit` | `accountNo, symbol, side, quantity, activePrice, trailingAmount, priceSlip, fromDate, toDate` | `Promise<FCOPlaceResponse>` | Trailing Stop Limit |
| `placeFcoOco` | `accountNo, symbol, side, quantity, tpActivePrice, slActivePrice, tpPrice, slPrice, tpSlip, slSlip, fromDate, toDate` | `Promise<FCOPlaceResponse>` | One-Cancels-the-Other |
| `placeFcoBullBear` | `accountNo, symbol, side, quantity, price, priceSlip, tpActivePrice, slActivePrice, tpPrice, slPrice, tpSlip, slSlip, fromDate, toDate` | `Promise<FCOPlaceResponse>` | Bull Bear order |
| `cancelFco` | `fcoId` | `Promise<FCOCancelResponse>` | Cancel FCO by ID |
| `getFcoByAccountNo` | `accountNo, pageIndex?, pageSize?` | `Promise<FCOListResponse>` | List account's FCO orders |
| `getFcoBySymbol` | `accountNo, symbol, pageIndex?, pageSize?` | `Promise<FCOListResponse>` | Filter FCO orders by symbol |
| `getFcoByStatus` | `accountNo, processStatus, pageIndex?, pageSize?` | `Promise<FCOListResponse>` | Filter FCO by status (`TRIT`, `WAIT`, etc.) |
| `getFcoByDate` | `accountNo, fromDate, toDate, pageIndex?, pageSize?` | `Promise<FCOListResponse>` | Filter FCO by date range |
| `getFcoById` | `accountNo, fcoId` | `Promise<FCOInfo \| null>` | Single FCO order details |
| `getFcoOrderBook` | `fcoId, pageIndex?, pageSize?` | `Promise<FCOOrderBookResponse>` | Execution logs of FCO |

---

## 4. Code Examples for Common AI Tasks

### Example 1: Placing & Instantly Cancelling a GTD FCO Order
```typescript
import {
  Auth,
  Trading,
  OrderSide,
  OrderType,
  fromBeginningOfDay,
  fromEndOfDay,
} from '@ssi.developer/ssi-sdk';

const auth = new Auth(config);
await auth.authenticate("123456");
const trading = new Trading(auth);

const accountNo = "1318761";
const fromDate = fromBeginningOfDay(); // "YYYY/MM/DD 00:00:00"
const toDate = fromEndOfDay();           // "YYYY/MM/DD 23:59:59"

// 1. Place GTD order
const gtdRes = await trading.trading.placeFcoGtd(
  accountNo,
  "SSI",
  OrderSide.BUY,
  100,
  OrderType.MTL,
  0.5,
  fromDate,
  toDate
);
console.log(`Placed FCO ID: ${gtdRes.fcoId}`);

// 2. Immediately cancel FCO order
const cancelRes = await trading.trading.cancelFco(gtdRes.fcoId);
console.log(`Cancelled FCO ID: ${cancelRes.fcoId}`);
```

### Example 2: Realtime Streaming Callbacks (Market Data & Trading Events)
```typescript
import { Stream, DataMessage, TradingMessage, HeartbeatMessage } from '@ssi.developer/ssi-sdk';

const stream = new Stream(auth);

stream.streaming.onData = (msg: DataMessage) => {
  console.log('[Market Data]', msg);
};

stream.streaming.onTrading = (msg: TradingMessage) => {
  console.log('[Trading Event]', msg);
};

stream.streaming.onHeartbeat = (msg: HeartbeatMessage) => {
  console.log('[Heartbeat]', msg.status);
};

await stream.streaming.connect();
stream.streaming.subscribeSymbolTrade(["SSI"]);
stream.streaming.subscribeOrderStatus("1318761");
stream.streaming.subscribeFcoOrderStatus("1318761");
```

---

## 5. Rules & Guidelines for AI Code Generators

1. **Date Format for FCO**: FCO date arguments (`fromDate`, `toDate`) **must** be formatted as `"YYYY/MM/DD HH:MM:SS"` (use `fromBeginningOfDay()` / `fromEndOfDay()`).
2. **Never hardcode secrets**: Access tokens, private keys, API secrets, and OTPs should never be committed to git. Use environment variables or local `config.json`.
3. **Use Enum constants**: Pass Enum constants (`OrderSide.BUY`, `OrderType.LO`, `FCOOperator.GREATER_OR_EQUAL`) instead of raw strings.
4. **Clean Builds**: Maintain TypeScript strict typing and run `npm run type-check && npm run build` to verify changes.

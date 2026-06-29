# SSI Node.js SDK

Node.js/TypeScript SDK cho nền tảng giao dịch chứng khoán SSI. Hỗ trợ REST API và WebSocket streaming.

[![npm version](https://img.shields.io/npm/v/@ssi.developer/ssi-sdk?logo=npm&label=npm)](https://www.npmjs.com/package/@ssi.developer/ssi-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@ssi.developer/ssi-sdk?logo=npm&label=downloads)](https://www.npmjs.com/package/@ssi.developer/ssi-sdk)
[![Node version](https://img.shields.io/node/v/@ssi.developer/ssi-sdk?logo=node.js)](https://github.com/SSI-Securities-Inc/ssi-sdk-node)
[![Release](https://img.shields.io/github/v/release/SSI-Securities-Inc/ssi-sdk-node)](https://github.com/SSI-Securities-Inc/ssi-sdk-node/releases)
[![License](https://img.shields.io/github/license/SSI-Securities-Inc/ssi-sdk-node)](https://github.com/SSI-Securities-Inc/ssi-sdk-node/blob/main/LICENSE)

## Mục lục

- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Kiến trúc Client](#kiến-trúc-client)
- [Xác thực](#1-xác-thực)
- [Tài khoản](#2-tài-khoản)
- [Dữ liệu thị trường](#3-dữ-liệu-thị-trường)
- [Danh mục đầu tư](#4-danh-mục-đầu-tư)
- [Giao dịch](#5-giao-dịch)
- [Streaming realtime](#6-streaming-realtime)
- [Xử lý lỗi](#7-xử-lý-lỗi)
- [Cấu hình nâng cao](#8-cấu-hình-nâng-cao)

---

## Cài đặt

```bash
npm install @ssi.developer/ssi-sdk
# hoặc
yarn add @ssi.developer/ssi-sdk
# hoặc
pnpm add @ssi.developer/ssi-sdk
```

---

## Cấu hình

Tạo đối tượng `Config` (hoặc truyền trực tiếp `ConfigOptions` vào client `Auth`):

```typescript
import { Config } from '@ssi.developer/ssi-sdk';

const config = new Config({
  clientId: "YOUR_CLIENT_ID",
  apiKey: "YOUR_API_KEY",
  apiSecret: "YOUR_API_SECRET",
  privateKey: "YOUR_PRIVATE_KEY", // Private key dùng ký lệnh (Base64 XML)
});
```

**Tất cả tuỳ chọn cấu hình:**

| Tham số | Kiểu | Mặc định | Mô tả |
|---------|------|----------|-------|
| `clientId` | `string` | `""` | Client ID xác thực (bắt buộc cho danh mục đầu tư) |
| `apiKey` | `string` | `""` | API key từ SSI |
| `apiSecret` | `string` | `""` | API secret từ SSI |
| `privateKey` | `string` | `""` | Private key cho ký lệnh giao dịch |
| `apiUrl` | `string` | `"https://api.ssi.com.vn"` | URL REST API |
| `streamingUrl` | `string` | `"wss://stream.ssi.com.vn/ws/v3"` | URL WebSocket streaming |
| `timeout` | `number` | `60000` | Timeout request (millisecond) |
| `maxRetries` | `number` | `5` | Số lần retry tối đa |
| `retryDelay` | `number` | `2000` | Delay cơ sở giữa các lần retry (exponential backoff, millisecond) |
| `rateLimitPerSecond` | `number` | `10` | Giới hạn request/giây (0 = không giới hạn) |

---

## Kiến trúc Client

SDK sử dụng kiến trúc **modular** gồm 4 client chuyên biệt:

| Client | Mô tả | Yêu cầu |
|--------|-------|---------|
| `Auth` | Xác thực & quản lý token | `Config` / `ConfigOptions` |
| `Data` | Dữ liệu thị trường (OHLC, chỉ số, chứng khoán) | `Auth` (không cần OTP) |
| `Trading` | Giao dịch + danh mục + tài khoản | `Auth` (cần OTP) |
| `Stream` | Streaming realtime qua WebSocket | `Auth` (cần OTP) |

**Luồng khởi tạo:**

```
Config / ConfigOptions → Auth → authenticate(otp) → Data / Trading / Stream
```

`Auth` là client gốc — quản lý REST client và token. Các client `Data`, `Trading`, `Stream` đều nhận `Auth` làm tham số và chia sẻ chung HTTP connection.

**Services được cung cấp bởi mỗi client:**

| Client | Service | Truy cập | Mô tả |
|--------|---------|---------|-------|
| `Auth` | `TokenManager` | `auth.tokenManager` | Xác thực, OTP, refresh token |
| `Data` | `MarketDataService` | `data.marketData` | OHLC, chỉ số, chứng khoán, securities summary |
| `Trading` | `TradingService` | `trading.trading` | Đặt/sửa/huỷ lệnh, sức mua/bán |
| `Trading` | `AccountService` | `trading.account` | Thông tin tài khoản |
| `Trading` | `PortfolioService` | `trading.portfolio` | Số dư, vị thế, sổ lệnh, PPMMR |
| `Stream` | `StreamingService` | `stream.streaming` | Subscribe/unsubscribe realtime data |

### Sử dụng TypeScript/ESM

```typescript
import { Auth, Data, Trading, Stream, Board } from '@ssi.developer/ssi-sdk';

async function main() {
  const auth = new Auth({
    clientId: "YOUR_CLIENT_ID",
    apiKey: "YOUR_API_KEY",
    apiSecret: "YOUR_API_SECRET",
    privateKey: "YOUR_PRIVATE_KEY",
  });

  // Xác thực (cần OTP cho giao dịch và streaming)
  await auth.authenticate("222222");

  // Dữ liệu thị trường
  const data = new Data(auth);
  const ohlc = await data.marketData.getOhlc1Minute("SSI");
  console.log(ohlc);

  // Giao dịch & danh mục
  const trading = new Trading(auth);
  const accounts = await trading.account.getAccountInfo();
  console.log(accounts);

  // Streaming
  const stream = new Stream(auth);
  stream.streaming.onData = (msg) => console.log('Realtime data:', msg);
  await stream.streaming.connect();
  stream.streaming.subscribeSymbolTrade(["SSI"]);
  stream.streaming.ping();
  await stream.streaming.wait();
}

main().catch(console.error);
```

### Chỉ dùng dữ liệu thị trường (không cần OTP)

```typescript
import { Auth, Data } from '@ssi.developer/ssi-sdk';

const auth = new Auth({
  apiKey: "YOUR_API_KEY",
  apiSecret: "YOUR_API_SECRET",
});

await auth.authenticate(); // Không cần OTP cho market data

const data = new Data(auth);
const ohlc = await data.marketData.getOhlc1Minute("SSI");
```

---

## 1. Xác thực

Dùng `Auth`. Các method của `tokenManager` được delegate trực tiếp lên client `Auth`.

### 1.1. Xác thực với OTP

```typescript
// Dùng trực tiếp trên auth (delegate từ tokenManager)
const token = await auth.authenticate("222222");
console.log(`Access token: ${token.accessToken}`);
console.log(`Expires at: ${token.expiresAt}`);

// Hoặc truy cập qua tokenManager
const token2 = await auth.tokenManager.authenticate("222222");
```

### 1.2. Yêu cầu gửi OTP

```typescript
const result = await auth.requestOtp();
console.log(result);
```

### 1.3. Làm mới token

```typescript
const token = await auth.refresh();
```

### 1.4. Tự động đảm bảo xác thực

```typescript
// Tự động refresh nếu token hết hạn, hoặc yêu cầu OTP nếu chưa có token
const accessToken = await auth.ensureAuthenticated("222222");
```

### 1.5. Kiểm tra trạng thái token

```typescript
console.log(auth.getToken());                       // Token object hoặc null
console.log(auth.tokenManager.getAccessToken());   // Access token string hoặc undefined
console.log(auth.tokenManager.isTokenExpired());   // true/false
console.log(auth.tokenManager.hasRefreshToken());  // true/false
```

---

## 2. Tài khoản

Truy cập qua `trading.account` (client `Trading`).

### 2.1. Lấy danh sách tài khoản

```typescript
const accounts = await trading.account.getAccountInfo();

for (const acc of accounts) {
  console.log(`${acc.accountNo} - ${acc.accountType}`);
}
```

**Trả về:** `Promise<Account[]>` — mỗi `Account` có:
- `accountNo: string` — Số tài khoản
- `accountType: AccountType` — Loại tài khoản (`EQUITY`, `EQUITY_MARGIN`, `DERIVATIVE`)

---

## 3. Dữ liệu thị trường

Truy cập qua `data.marketData` (client `Data`).

> **Lưu ý:** `Data` chỉ cần `auth.authenticate()` (không cần OTP).

### Tổng quan method

| Nhóm | Method | Mô tả |
|------|--------|-------|
| **OHLC trong ngày** | `getOhlc1Minute(symbol)` | Nến 1 phút |
| | `getOhlc3Minute(symbol)` | Nến 3 phút |
| | `getOhlc5Minute(symbol)` | Nến 5 phút |
| | `getOhlc15Minute(symbol)` | Nến 15 phút |
| | `getOhlc1Hour(symbol)` | Nến 1 giờ |
| **OHLC lịch sử** | `getOhlc1MinuteHistorical(symbol, from, to, page, size)` | 1 phút |
| | `getOhlc3MinuteHistorical(...)` | 3 phút |
| | `getOhlc5MinuteHistorical(...)` | 5 phút |
| | `getOhlc15MinuteHistorical(...)` | 15 phút |
| | `getOhlc1HourHistorical(...)` | 1 giờ |
| | `getOhlc1DayHistorical(...)` | 1 ngày |
| | `getOhlc1WeekHistorical(...)` | 1 tuần |
| | `getOhlc1MonthHistorical(...)` | 1 tháng |
| **Chỉ số** | `getIndexes()` | Tất cả chỉ số |
| | `getIndexesByBoard(board)` | Chỉ số theo sàn |
| **Index Summary** | `getIndexSummary(index)` | Summary chỉ số hiện tại |
| | `getIndexSummaryHistorical(index, tradingDate)` | Summary chỉ số lịch sử |
| | `getBoardSummary(board)` | Summary sàn hiện tại |
| | `getBoardSummaryHistorical(board, tradingDate)` | Summary sàn lịch sử |
| **Chứng khoán** | `getSecuritiesInfo(symbol)` | Thông tin 1 mã |
| | `getSecuritiesInfoByIndex(index)` | Theo chỉ số |
| | `getSecuritiesInfoByBoard(board)` | Theo sàn |
| **Securities Summary** | `getSecuritiesSummary(symbol)` | Summary mã hiện tại |
| | `getSecuritiesSummaryHistorical(symbol, from, to)` | Summary mã lịch sử |
| | `getSecuritiesSummaryByIndex(index)` | Summary theo chỉ số |
| | `getSecuritiesSummaryByIndexHistorical(index, from, to)` | Summary chỉ số lịch sử |

### 3.1. Dữ liệu OHLC (nến)

SDK cung cấp các method OHLC theo từng timeframe:

**Lấy dữ liệu trong ngày (không cần truyền ngày):**

```typescript
// OHLC 1 phút trong ngày
const ohlc = await data.marketData.getOhlc1Minute("SSI");
for (const candle of ohlc) {
  console.log(`${candle.tradingDate}: O=${candle.openPrice} H=${candle.highPrice} L=${candle.lowPrice} C=${candle.closePrice} V=${candle.volume}`);
}
```

**Lấy dữ liệu lịch sử (truyền khoảng ngày + phân trang):**

```typescript
// OHLC 1 ngày lịch sử
const ohlc = await data.marketData.getOhlc1DayHistorical(
  "SSI",
  "2026/03/01 00:00:00",
  "2026/03/27 23:59:59",
  1,
  100
);
```

**Trả về:** `Promise<OHLCData[]>` — mỗi `OHLCData` có:
- `symbol`, `tradingDate`, `openPrice`, `highPrice`, `lowPrice`, `closePrice`, `volume`, `value`

**Tham số historical:**

| Tham số | Kiểu | Mặc định | Mô tả |
|---------|------|----------|-------|
| `symbol` | `string` | *(bắt buộc)* | Mã chứng khoán |
| `from` | `string` | *(bắt buộc)* | Ngày bắt đầu (định dạng `YYYY/MM/DD` hoặc `YYYY/MM/DD HH:mm:ss`) |
| `to` | `string` | *(bắt buộc)* | Ngày kết thúc |
| `page` | `number` | `1` | Trang hiện tại |
| `size` | `number` | `1000` | Số bản ghi/trang |

### 3.2. Danh sách chỉ số thị trường

```typescript
import { Board } from '@ssi.developer/ssi-sdk';

// Lấy tất cả chỉ số
const indices = await data.marketData.getIndexes();

// Lấy theo sàn
const hoseIndices = await data.marketData.getIndexesByBoard(Board.HOSE);

for (const idx of indices) {
  console.log(`${idx.index} - ${idx.indexName}`);
}
```

**Trả về:** `Promise<MarketIndexes[]>` — mỗi item có: `index`, `indexName`, `board`

### 3.3. Tổng hợp chỉ số (Index Summary)

```typescript
// Summary hiện tại
const summary = await data.marketData.getIndexSummary("VNINDEX");
if (summary) {
  console.log(`${summary.indexValue} (${summary.indexChange >= 0 ? '+' : ''}${summary.indexChange.toFixed(2)})`);
}

// Summary lịch sử
const summaryHist = await data.marketData.getIndexSummaryHistorical("VNINDEX", "2025/01/15");

// Summary theo sàn
const boardSummary = await data.marketData.getBoardSummary(Board.HOSE);

// Summary sàn lịch sử
const boardSummaryHist = await data.marketData.getBoardSummaryHistorical(Board.HOSE, "2025/01/15");
```

**Trả về:** `Promise<MarketIndexSummary | null>`

### 3.4. Thông tin chứng khoán

```typescript
// Lấy thông tin 1 mã
const info = await data.marketData.getSecuritiesInfo("SSI");

// Lấy theo chỉ số
const securities = await data.marketData.getSecuritiesInfoByIndex("VN30");

// Lấy theo sàn
const hoseSecurities = await data.marketData.getSecuritiesInfoByBoard(Board.HOSE);
```

**Trả về:** `Promise<SecuritiesInfo | null>` hoặc `Promise<SecuritiesInfo[]>`

### 3.5. Tổng hợp chứng khoán (Securities Summary)

```typescript
// Summary hiện tại
const summary = await data.marketData.getSecuritiesSummary("SSI");

// Summary lịch sử
const summaryHist = await data.marketData.getSecuritiesSummaryHistorical(
  "SSI",
  "2025/01/01",
  "2025/01/31"
);

// Summary theo chỉ số
const summaryIndex = await data.marketData.getSecuritiesSummaryByIndex("VN30");

// Summary theo chỉ số lịch sử
const summaryIndexHist = await data.marketData.getSecuritiesSummaryByIndexHistorical(
  "VN30",
  "2025/01/01",
  "2025/01/31"
);
```

**Trả về:** `Promise<SecuritiesSummary[]>`

---

## 4. Danh mục đầu tư

Truy cập qua `trading.portfolio` (client `Trading`).

### Tổng quan method

| Nhóm | Method | Trả về |
|------|--------|--------|
| **Số dư** | `getEquityBalance(accountNo)` | `EquityAccountBalance` |
| | `getDerivativeBalance(accountNo)` | `DerivativeAccountBalance` |
| **Vị thế** | `getEquityPositions(accountNo)` | `EquityPosition[]` |
| | `getDerivativePositions(accountNo)` | `AllDerivativePosition` |
| | `getOpenDerivativePositions(accountNo)` | `DerivativePosition[]` |
| | `getClosedDerivativePositions(accountNo)` | `DerivativePosition[]` |
| **Sổ lệnh** | `getTodayOrders(accountNo)` | `Order[]` |
| | `getHistoricalOrders(accountNo, from, to)` | `Order[]` |
| **PPMMR** | `getEquityPpmmr(accountNo)` | `EquityPPMMR` |
| | `getDerivativePpmmr(accountNo)` | `DerivativePPMMR` |

### 4.1. Số dư tài khoản

```typescript
// Số dư tài khoản cơ sở
const equityBalance = await trading.portfolio.getEquityBalance("1234561");
console.log(`Available cash: ${equityBalance.availableCash}`);

// Số dư tài khoản phái sinh
const derivativeBalance = await trading.portfolio.getDerivativeBalance("1234568");
```

### 4.2. Vị thế (Positions)

```typescript
// Vị thế cơ sở
const positions = await trading.portfolio.getEquityPositions("1234561");
for (const pos of positions) {
  console.log(`${pos.symbol}: ${pos.quantity} cp | Giá vốn: ${pos.costPrice}`);
}

// Vị thế phái sinh (tất cả vị thế mở/đóng)
const derivativePositions = await trading.portfolio.getDerivativePositions("1234568");

// Chỉ vị thế mở phái sinh
const openPos = await trading.portfolio.getOpenDerivativePositions("1234568");
```

### 4.3. Sổ lệnh (Order Book)

```typescript
// Lệnh trong ngày
const todayOrders = await trading.portfolio.getTodayOrders("1234561");

// Lệnh lịch sử
const historicalOrders = await trading.portfolio.getHistoricalOrders(
  "1234561",
  "2025/01/01",
  "2025/01/31"
);
```

### 4.4. PPMMR (Purchasing Power / Margin Maintenance Ratio)

```typescript
// PPMMR cơ sở
const equityPpmmr = await trading.portfolio.getEquityPpmmr("1234561");
console.log(`Purchasing power: ${equityPpmmr.purchasingPower}`);

// PPMMR phái sinh
const derivativePpmmr = await trading.portfolio.getDerivativePpmmr("1234568");
```

---

## 5. Giao dịch

Truy cập qua `trading.trading` (client `Trading`).

### Tổng quan method

| Nhóm | Method | Trả về |
|------|--------|--------|
| **Đặt lệnh** | `placeOrder(accountNo, symbol, side, quantity, price, orderType)` | `PlaceOrderResponse` |
| | `placeLimitOrder(accountNo, symbol, side, quantity, price)` | `PlaceOrderResponse` |
| | `placeMarketOrder(accountNo, symbol, side, quantity)` | `PlaceOrderResponse` |
| | `placeAtoOrder(accountNo, symbol, side, quantity)` | `PlaceOrderResponse` |
| | `placeAtcOrder(accountNo, symbol, side, quantity)` | `PlaceOrderResponse` |
| **Sửa lệnh** | `modifyOrderPrice(accountNo, clientRequestId, price)` | `ModifyOrderResponse` |
| | `modifyOrderPriceById(accountNo, orderId, price)` | `ModifyOrderResponse` |
| | `modifyOrderQuantity(accountNo, clientRequestId, quantity)` | `ModifyOrderResponse` |
| | `modifyOrderQuantityById(accountNo, orderId, quantity)` | `ModifyOrderResponse` |
| **Huỷ lệnh** | `cancelOrder(accountNo, clientRequestId)` | `CancelOrderResponse` |
| | `cancelOrderById(accountNo, orderId)` | `CancelOrderResponse` |
| **Sức mua/bán** | `getMaxBuySell(accountNo, symbol, price)` | `MaxBuySellResponse` |
| | `getMaxBuySellAtMarketPrice(accountNo, symbol)` | `MaxBuySellResponse` |

### 5.1. Đặt lệnh

```typescript
import { OrderSide, OrderType } from '@ssi.developer/ssi-sdk';

// Lệnh giới hạn (LO)
const result = await trading.trading.placeLimitOrder(
  "1234561",
  "SSI",
  OrderSide.BUY,
  100,
  66000
);
console.log(`Order ID: ${result.orderId}, Status: ${result.status}`);

// Lệnh thị trường (MTL)
const marketOrder = await trading.trading.placeMarketOrder(
  "1234561",
  "SSI",
  OrderSide.BUY,
  100
);
```

**Loại lệnh (`OrderType`):**

| Giá trị | Mô tả |
|---------|-------|
| `OrderType.LO` | Lệnh giới hạn (Limit Order) |
| `OrderType.MTL` | Lệnh thị trường (Market To Limit) |
| `OrderType.MP` | Lệnh thị trường (Market Price) |
| `OrderType.ATO` | Lệnh mở cửa (At The Open) |
| `OrderType.ATC` | Lệnh đóng cửa (At The Close) |
| `OrderType.MOK` | Match Or Kill |
| `OrderType.MAK` | Match And Kill |
| `OrderType.PLO` | Post Lunch Order |

### 5.2. Sửa lệnh

Chỉ có thể sửa **giá** hoặc **số lượng** (không đồng thời).

```typescript
// Sửa giá theo orderId
const result = await trading.trading.modifyOrderPriceById(
  "1234561",
  "ORD123",
  68000
);
```

### 5.3. Huỷ lệnh

```typescript
// Huỷ lệnh theo orderId
const result = await trading.trading.cancelOrderById("1234561", "ORD123");
```

### 5.4. Sức mua/bán tối đa

```typescript
const maxBS = await trading.trading.getMaxBuySell("1234561", "SSI", 66000);
console.log(`Max buy: ${maxBS.maxBuyQuantity}`);
```

---

## 6. Streaming realtime

Truy cập qua `stream.streaming` (client `Stream`). Cần gọi `await stream.streaming.connect()` trước.

### Tổng quan method

| Nhóm | Method | Mô tả |
|------|--------|-------|
| **Kết nối** | `connect()` | Kết nối WebSocket |
| | `disconnect()` | Ngắt kết nối |
| | `wait()` | Chờ nhận dữ liệu (block) |
| **Heartbeat** | `ping(onResponse?, intervalMs?)` | Ping server |
| **Subscribe mã** | `subscribeSymbol(symbols, onResponse?)` | Trade + Quote + Room |
| | `subscribeSymbolTrade(symbols, onResponse?)` | Chỉ trade |
| | `subscribeSymbolQuote(symbols, onResponse?)` | Chỉ quote (bid/ask) |
| | `subscribeSymbolRoom(symbols, onResponse?)` | Chỉ foreign room |
| | `subscribeSymbolPutThrough(symbols, onResponse?)` | Chỉ thoả thuận |
| | `subscribeSymbolOddLot(symbols, onResponse?)` | Chỉ lô lẻ |
| | `subscribeSymbolOhlcv(symbols, interval, onResponse?)` | OHLCV theo timeframe |
| **Subscribe sàn/chỉ số** | `subscribeBoard(boards, onResponse?)` | Theo sàn |
| | `subscribeIndex(indices, onResponse?)` | Theo chỉ số |
| **Subscribe giao dịch** | `subscribeOrderStatus(accountNo?, onResponse?)` | Trạng thái lệnh |
| | `subscribePortfolio(accountNo?, onResponse?)` | Portfolio changes |
| **Unsubscribe** | `unsubscribeSymbol(symbols)` | Huỷ tất cả kênh cho mã |
| | `unsubscribeSymbolTrade(symbols)` | Huỷ trade |
| | `unsubscribeSymbolQuote(symbols)` | Huỷ quote |
| | `unsubscribeSymbolRoom(symbols)` | Huỷ foreign room |
| | `unsubscribeSymbolPutThrough(symbols)` | Huỷ thoả thuận |
| | `unsubscribeSymbolOddLot(symbols)` | Huỷ lô lẻ |
| | `unsubscribeBoard(boards)` | Huỷ sàn |
| | `unsubscribeIndex(indices)` | Huỷ chỉ số |

**Callbacks:**

- `onData`: `(msg: DataMessage) => void` — Nhận market data (tự động phân loại type)
- `onTrading`: `(msg: TradingMessage) => void` — Nhận sự kiện giao dịch (lệnh/portfolio)
- `onHeartbeat`: `(msg: HeartbeatMessage) => void` — Nhận heartbeat

### 6.1. Thiết lập callback

```typescript
stream.streaming.onData = (msg) => {
  console.log('Market data:', msg);
};

stream.streaming.onTrading = (msg) => {
  console.log('Trading data:', msg);
};

stream.streaming.onHeartbeat = (msg) => {
  console.log('Heartbeat status:', msg.status);
};
```

**Các message type nhận được qua `onData`:**

| Topic | Message Type | Mô tả |
|-------|-------------|-------|
| `trade.*` | `TradeMessage` | Dữ liệu khớp lệnh |
| `trade.*.<timeframe>` | `IntervalMessage` | Dữ liệu OHLCV theo interval |
| `quote.*` | `QuoteMessage` | Dữ liệu giá (bid/ask) |
| `room.*` | `ForeignRoomMessage` | Room nước ngoài |
| `market.*` | `MarketStatusMessage` | Trạng thái thị trường |
| `put.*` | `PutMessage` | Thoả thuận |
| `oddlot.*` | `OddLotMessage` | Lô lẻ |

**Các message type nhận được qua `onTrading`:**

| Topic | Message Type | Mô tả |
|-------|-------------|-------|
| `order.*` | `OrderStatusMessage` | Trạng thái lệnh |
| `portfolio.*` | `PortfolioMessage` | Thay đổi danh mục |

### 6.2. Subscribe dữ liệu thị trường

```typescript
// Subscribe tất cả kênh (trade + quote + room) cho mã
stream.streaming.subscribeSymbol(["SSI", "HPG"]);

// Subscribe từng kênh riêng
stream.streaming.subscribeSymbolTrade(["SSI"]);
stream.streaming.subscribeSymbolQuote(["SSI"]);

// Subscribe OHLCV theo interval
import { Timeframe } from '@ssi.developer/ssi-sdk';
stream.streaming.subscribeSymbolOhlcv(["SSI"], Timeframe.MINUTE_1);

// Subscribe theo sàn
stream.streaming.subscribeBoard([Board.HOSE]);
```

### 6.3. Subscribe giao dịch (order status & portfolio)

```typescript
// Subscribe tất cả tài khoản
stream.streaming.subscribeOrderStatus();

// Subscribe portfolio
stream.streaming.subscribePortfolio();
```

### 6.4. Heartbeat

```typescript
// Ping một lần
stream.streaming.ping();

// Ping tự động theo interval (30 giây)
stream.streaming.ping(undefined, 30000);
```

### 6.5. Ví dụ streaming hoàn chỉnh

```typescript
import { Auth, Stream, Timeframe } from '@ssi.developer/ssi-sdk';

async function run() {
  const auth = new Auth({
    clientId: "YOUR_CLIENT_ID",
    apiKey: "YOUR_API_KEY",
    apiSecret: "YOUR_API_SECRET",
  });
  await auth.authenticate("222222");

  const stream = new Stream(auth);
  await stream.streaming.connect();

  stream.streaming.onData = (msg) => console.log('Data:', msg);
  stream.streaming.onTrading = (msg) => console.log('Trading:', msg);

  stream.streaming.subscribeSymbol(["SSI"]);
  stream.streaming.subscribeOrderStatus();
  stream.streaming.ping();

  await stream.streaming.wait();
}
```

---

## 7. Xử lý lỗi

SDK sử dụng hệ thống exception phân cấp:

```typescript
import { SSIError } from '@ssi.developer/ssi-sdk';

try {
  await auth.authenticate("wrong_otp");
} catch (e) {
  if (e instanceof SSIError) {
    console.log(`Lỗi: ${e.message} (code: ${e.code})`);
  }
}
```

**Các exception:**

| Exception | Mô tả |
|-----------|-------|
| `SSIError` | Base exception — có `message`, `code`, `statusCode`, `responseBody`, `headers` |
| `AuthenticationError` | Xác thực thất bại (sai credentials, token hết hạn) |
| `APIError` | API trả về lỗi |
| `WebSocketError` | Lỗi kết nối hoặc giao tiếp WebSocket |
| `ValidationError` | Lỗi validate input |
| `RateLimitError` | Vượt quá giới hạn request — có thêm `retryAfter` |

---

## 8. Cấu hình nâng cao

### Tuỳ chỉnh retry & rate limit

```typescript
const auth = new Auth({
  clientId: "YOUR_CLIENT_ID",
  apiKey: "YOUR_API_KEY",
  apiSecret: "YOUR_API_SECRET",
  maxRetries: 3,
  retryDelay: 1000,           // ms
  rateLimitPerSecond: 5,
});
```

---

## API Reference

### Enums

Tất cả enum có thể import từ `@ssi.developer/ssi-sdk`:

```typescript
import { OrderSide, OrderType, OrderStatus, Board, AccountType, Timeframe } from '@ssi.developer/ssi-sdk';
```

#### `OrderSide`

| Giá trị | Value | Mô tả |
|---------|-------|-------|
| `BUY` | `"B"` | Mua |
| `SELL` | `"S"` | Bán |

#### `OrderType`

| Lớp | Giá trị | Mô tả |
|-----|---------|-------|
| `LO` | `"LO"` | Lệnh giới hạn |
| `MTL` | `"MTL"` | Market To Limit |
| `MP` | `"MP"` | Market Price |
| `ATO` | `"ATO"` | At The Open |
| `ATC` | `"ATC"` | At The Close |
| `MOK` | `"MOK"` | Match Or Kill |
| `MAK` | `"MAK"` | Match And Kill |
| `PLO` | `"PLO"` | Post Lunch Order |

#### `OrderStatus`

| Giá trị | Value | Mô tả |
|---------|-------|-------|
| `PENDING` | `"PD"` | Đang chờ |
| `PENDING_APPROVAL` | `"WA"` | Chờ duyệt |
| `READY` | `"RS"` | Sẵn sàng |
| `SENT` | `"SD"` | Đã gửi |
| `QUEUED` | `"QU"` | Đã xếp hàng |
| `FILLED` | `"FF"` | Khớp toàn bộ |
| `PARTIAL_FILLED` | `"PF"` | Khớp một phần |
| `PARTIAL_CANCELLED` | `"FFPC"` | Khớp một phần + huỷ phần còn lại |
| `PENDING_MODIFY` | `"WM"` | Chờ sửa |
| `PENDING_CANCEL` | `"WC"` | Chờ huỷ |
| `CANCELLED` | `"CL"` | Đã huỷ |
| `REJECTED` | `"RJ"` | Bị từ chối |
| `EXPIRED` | `"EX"` | Hết hạn |
| `PRE_SESSION` | `"IAV"` | Phiên trước |

#### `Board`

| Giá trị | Value | Mô tả |
|---------|-------|-------|
| `HOSE` | `"HOSE"` | Sàn HOSE |
| `HNX` | `"HNX"` | Sàn HNX |
| `UPCOM` | `"UPCOM"` | Sàn UPCOM |

#### `AccountType`

| Giá trị | Value | Mô tả |
|---------|-------|-------|
| `EQUITY` | `"Cash"` | Tài khoản cơ sở |
| `EQUITY_MARGIN` | `"Margin"` | Tài khoản ký quỹ |
| `DERIVATIVE` | `"Derivative"` | Tài khoản phái sinh |

#### `Timeframe`

| Giá trị | Value | Mô tả |
|---------|-------|-------|
| `MINUTE_1` | `"1m"` | 1 phút |
| `MINUTE_3` | `"3m"` | 3 phút |
| `MINUTE_5` | `"5m"` | 5 phút |
| `MINUTE_15` | `"15m"` | 15 phút |
| `HOUR_1` | `"1h"` | 1 giờ |
| `DAY_1` | `"1d"` | 1 ngày |
| `WEEK_1` | `"1w"` | 1 tuần |
| `MONTH_1` | `"1M"` | 1 tháng |

---

### Models / Types

Các kiểu dữ liệu (Interfaces/Types) có thể import từ `@ssi.developer/ssi-sdk`:

#### Authentication

**`Token`** — Kết quả xác thực

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accessToken` | `string` | Token truy cập |
| `tokenType` | `string` | Loại token (thường là `"Bearer"`) |
| `expiresAt` | `number` | Thời điểm hết hạn (timestamp giây) |
| `refreshToken` | `string` | Token làm mới |
| `refreshTokenExpiresAt` | `number` | Thời điểm refresh token hết hạn |

#### Account

**`Account`** — Thông tin tài khoản

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accountNo` | `string` | Số tài khoản |
| `accountType` | `AccountType` | Loại tài khoản |

#### Market Data

**`OHLCData`** — Dữ liệu nến OHLC

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `symbol` | `string` | Mã chứng khoán |
| `tradingDate` | `string` | Ngày giao dịch |
| `openPrice` | `number` | Giá mở cửa |
| `highPrice` | `number` | Giá cao nhất |
| `lowPrice` | `number` | Giá thấp nhất |
| `closePrice` | `number` | Giá đóng cửa |
| `volume` | `number` | Khối lượng |
| `value` | `number` | Giá trị giao dịch |

**`MarketIndexes`** — Thông tin chỉ số

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `index` | `string` | Mã chỉ số |
| `indexName` | `string` | Tên chỉ số |
| `board` | `Board` | Sàn |

**`MarketIndexSummary`** — Tổng hợp chỉ số

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `index` | `string` | Mã chỉ số |
| `board` | `string` | Sàn |
| `tradingDate` | `string` | Ngày giao dịch |
| `indexValue` | `number` | Giá trị chỉ số |
| `indexChange` | `number` | Thay đổi giá |
| `indexChangePercent` | `number` | Thay đổi giá (%) |
| `totalTrade` | `number` | Tổng KL giao dịch |
| `totalTradeValue` | `number` | Tổng giá trị giao dịch |
| `totalMatch` | `number` | Tổng KL khớp lệnh |
| `totalMatchValue` | `number` | Tổng giá trị khớp lệnh |
| `totalDeal` | `number` | Tổng KL thoả thuận |
| `totalDealValue` | `number` | Tổng giá trị thoả thuận |
| `totalAdvanceStock` | `number` | Số mã tăng |
| `totalDeclineStock` | `number` | Số mã giảm |
| `totalSteadyStock` | `number` | Số mã đứng |
| `totalCeilingStock` | `number` | Số mã trần |
| `totalFloorStock` | `number` | Số mã sàn |
| `totalPropBuy` | `number` | KL mua tự doanh |
| `totalPropBuyValue` | `number` | Giá trị mua tự doanh |
| `totalPropSell` | `number` | KL bán tự doanh |
| `totalPropSellValue` | `number` | Giá trị bán tự doanh |

**`SecuritiesInfo`** — Thông tin chứng khoán

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `symbol` | `string` | Mã chứng khoán |
| `board` | `Board` | Sàn |
| `index` | `string` | Chỉ số |
| `symbolNameVi` | `string` | Tên tiếng Việt |
| `symbolNameEn` | `string` | Tên tiếng Anh |
| `lotSize` | `number` | Lô giao dịch |
| `maturityDate` | `string` | Ngày đáo hạn |
| `firstTradingDate` | `string` | Ngày giao dịch đầu tiên |
| `lastTradingDate` | `string` | Ngày giao dịch cuối cùng |
| `cwUnderlyingSymbol` | `string` | Mã CK cơ sở (CW) |
| `cwExercisePrice` | `number` | Giá thực hiện (CW) |
| `cwExecutionRatio` | `number` | Tỷ lệ chuyển đổi (CW) |
| `listedShares` | `number` | Số CP niêm yết |
| `icbCode` | `string` | Mã ngành ICB |
| `icbName` | `string` | Tên ngành ICB |
| `iIndex` | `number` | Chỉ số I |
| `iNav` | `number` | NAV (ETF) |

**`SecuritiesSummary`** — Tổng hợp chứng khoán

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `symbol` | `string` | Mã chứng khoán |
| `tradingDate` | `string` | Ngày giao dịch |
| `priceChange` | `number` | Thay đổi giá |
| `priceChangePercent` | `number` | Thay đổi giá (%) |
| `openPrice` | `number` | Giá mở cửa |
| `highPrice` | `number` | Giá cao nhất |
| `lowPrice` | `number` | Giá thấp nhất |
| `closePrice` | `number` | Giá đóng cửa |
| `averagePrice` | `number` | Giá trung bình |
| `totalMatch` | `number` | Tổng KL khớp |
| `totalMatchValue` | `number` | Tổng giá trị khớp |
| `totalBuy` | `number` | Tổng KL mua |
| `totalTradeBuy` | `number` | Giá trị mua |
| `totalSell` | `number` | Tổng KL bán |
| `totalTradeSell` | `number` | Giá trị bán |

#### Portfolio

**`EquityAccountBalance`** — Số dư tài khoản cơ sở

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accountNo` | `string` | Số tài khoản |
| `availableCash` | `number` | Tiền mặt khả dụng |
| `totalDebt` | `number` | Tổng nợ |
| `interestLoan` | `number` | Lãi vay |
| `overdueFeeLoan` | `number` | Phí vay quá hạn |
| `withdrawal` | `number` | Số tiền rút được |
| `onHoldCash` | `number` | Tiền tạm giữ |
| `sellUnmatched` | `number` | Bán chưa khớp |
| `sellT0` / `sellT1` / `sellT2` | `number` | Tiền bán chờ về T+0/T+1/T+2 |
| `buyUnmatched` | `number` | Mua chưa khớp |
| `buyT0` / `buyT1` / `buyT2` | `number` | Tiền mua chờ khớp T+0/T+1/T+2 |
| `advanceCashT0` / `advanceCashT1` | `number` | Ứng trước T+0/T+1 |
| `holdSubscription` | `number` | Giữ đăng ký quyền mua |
| `bankBalance` | `number` | Số dư ngân hàng |
| `dividend` / `dividendMargin` | `number` | Cổ tức nhận được |
| `blockCash` | `number` | Tiền phong toả |
| `interestCash` | `number` | Lãi tiền gửi |
| `limitT0` | `number` | Hạn mức T+0 |
| `termDeposit` | `number` | Tiền gửi kỳ hạn |

**`DerivativeAccountBalance`** — Số dư tài khoản phái sinh

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accountNo` | `string` | Số tài khoản |
| `accountBalance` | `number` | Số dư tài khoản |
| `fee` / `commission` / `interest` | `number` | Phí / Hoa hồng / Lãi |
| `extInterest` | `number` | Lãi ngoài |
| `loan` | `number` | Khoản vay |
| `deliveryAmount` | `number` | Giá trị chuyển giao |
| `floatingPL` / `tradingPL` / `totalPL` | `number` | Lãi lỗ trạng thái / Lãi lỗ thực tế / Tổng lãi lỗ |
| `withdrawable` | `number` | Số tiền rút được |
| `cashSSI` / `cashVSDC` | `number` | Tiền tại SSI / Tiền tại VSDC |
| `validNonCashSSI` / `validNonCashVSDC` | `number` | Tài sản phi tiền mặt hợp lệ tại SSI / VSDC |
| `cashWithdrawableSSI` / `cashWithdrawableVSDC` | `number` | Tiền rút được tại SSI / VSDC |

**`EquityPosition`** — Vị thế cơ sở

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accountNo` | `string` | Số tài khoản |
| `symbol` | `string` | Mã chứng khoán |
| `quantity` | `number` | Tổng số lượng |
| `sellableQuantity` | `number` | Số lượng bán được |
| `costPrice` | `number` | Giá vốn |
| `blockQuantity` | `number` | SL phong toả |
| `dividendQuantity` | `number` | SL cổ tức |
| `buyingQuantity` / `boughtQuantity` | `number` | SL chờ mua / đã mua |
| `sellingQuantity` / `soldQuantity` | `number` | SL chờ bán / đã bán |
| `t1SellQuantity` / `t2SellQuantity` | `number` | SL bán T+1/T+2 |
| `mortgageQuantity` | `number` | SL cầm cố |
| `restrictedQuantity` | `number` | SL hạn chế chuyển nhượng |

**`DerivativePosition`** — Vị thế phái sinh

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accountNo` | `string` | Số tài khoản |
| `symbol` | `string` | Mã hợp đồng |
| `long` / `short` / `net` | `number` | Vị thế mua / bán / ròng |
| `bidAvgPrice` / `askAvgPrice` | `number` | Giá trung bình mua / bán |
| `tradePrice` | `number` | Giá giao dịch |
| `floatingPL` / `tradingPL` | `number` | Lãi lỗ trạng thái / Lãi lỗ thực tế |

**`Order`** — Thông tin lệnh

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accountNo` | `string` | Số tài khoản |
| `clientRequestId` | `string` | ID yêu cầu client |
| `orderId` | `string` | ID lệnh hệ thống |
| `symbol` | `string` | Mã chứng khoán |
| `side` | `OrderSide` | Mua/Bán |
| `orderType` | `OrderType` | Loại lệnh |
| `price` / `avgPrice` | `number` | Giá đặt / Giá trung bình khớp |
| `quantity` | `number` | SL đặt |
| `osQuantity` | `number` | SL chờ |
| `filledQuantity` | `number` | SL đã khớp |
| `cancelQuantity` | `number` | SL đã huỷ |
| `status` | `OrderStatus` | Trạng thái lệnh |
| `inputTime` / `modifyTime` | `string` | Thời gian đặt / sửa |
| `message` | `string` | Thông báo / Lý do lỗi |

#### Trading

**`PlaceOrderResponse`** — Kết quả đặt lệnh

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `orderId` | `string` | ID lệnh |
| `clientRequestId` | `string` | ID yêu cầu client |
| `status` | `OrderStatus` | Trạng thái |

**`ModifyOrderResponse`** — Kết quả sửa lệnh

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `clientModifyId` | `string` | ID yêu cầu sửa |
| `orderId` | `string` | ID lệnh |
| `clientRequestId` | `string` | ID yêu cầu gốc |
| `status` | `OrderStatus` | Trạng thái |

**`CancelOrderResponse`** — Kết quả huỷ lệnh

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `clientCancelId` | `string` | ID yêu cầu huỷ |
| `orderId` | `string` | ID lệnh |
| `clientRequestId` | `string` | ID yêu cầu gốc |
| `status` | `OrderStatus` | Trạng thái |

**`MaxBuySellResponse`** — Sức mua/bán tối đa

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `accountNo` | `string` | Số tài khoản |
| `symbol` | `string` | Mã chứng khoán |
| `maxBuyQuantity` | `number` | SL mua tối đa |
| `maxSellQuantity` | `number` | SL bán tối đa |
| `marginRatio` | `string` | Tỷ lệ ký quỹ |
| `purchasePower` | `string` | Sức mua |

#### Streaming Messages

**`TradeMessage`** — Dữ liệu khớp lệnh

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"trade"` | Loại message |
| `tradingTime` | `string` | Thời gian khớp |
| `symbol` | `string` | Mã CK |
| `price` | `number` | Giá khớp |
| `quantity` | `number` | KL khớp |
| `side` | `string` | Bên mua/bán (`"B"`, `"S"`, `"U"`) |
| `totalVolume` | `number` | Tổng khối lượng khớp |

**`IntervalMessage`** — Dữ liệu OHLCV theo interval

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"trade"` | Loại message |
| `intervalTime` | `string` | Thời gian interval |
| `tradingTime` | `string` | Thời gian giao dịch |
| `symbol` | `string` | Mã CK |
| `open` / `high` / `low` / `close` | `number` | Giá OHLC |
| `volume` | `number` | Khối lượng |

**`QuoteMessage`** — Dữ liệu giá bid/ask

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"quote"` | Loại message |
| `tradingTime` | `string` | Thời gian |
| `symbol` | `string` | Mã CK |
| `bidPrices` / `bidVolumes` | `number[]` | Giá/KL bid |
| `askPrices` / `askVolumes` | `number[]` | Giá/KL ask |

**`ForeignRoomMessage`** — Room nước ngoài

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"room"` | Loại message |
| `tradingTime` | `string` | Thời gian |
| `symbol` | `string` | Mã CK |
| `totalRoom` / `currentRoom` | `number` | Tổng room / Room còn lại |
| `buyQuantity` / `buyValue` | `number` | KL/Giá trị mua nước ngoài |
| `sellQuantity` / `sellValue` | `number` | KL/Giá trị bán nước ngoài |

**`PutMessage`** — Thoả thuận

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"put"` | Loại message |
| `tradingTime` | `string` | Thời gian |
| `symbol` | `string` | Mã CK |
| `price` | `number` | Giá thoả thuận |
| `quantity` | `number` | KL thoả thuận |
| `totalQuantity` / `totalValue` | `number` | Tổng KL / Tổng giá trị |

**`OddLotMessage`** — Lô lẻ

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"oddlot"` | Loại message |
| `tradingTime` | `string` | Thời gian |
| `symbol` | `string` | Mã CK |
| `price` | `number` | Giá |
| `quantity` | `number` | Khối lượng |
| `bidPrices` / `bidVolumes` | `number[]` | Giá/KL bid |
| `askPrices` / `askVolumes` | `number[]` | Giá/KL ask |

**`MarketStatusMessage`** — Trạng thái thị trường

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"market"` | Loại message |
| `market` | `string` | Thị trường |
| `status` | `string` | Trạng thái |
| `tradingDate` | `string` | Ngày giao dịch |

**`OrderStatusMessage`** — Trạng thái lệnh (streaming)

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"orderEvent"` | Loại message |
| `accountNo` | `string` | Số tài khoản |
| `clientRequestId` / `orderId` | `string` | ID yêu cầu / ID lệnh |
| `symbol` | `string` | Mã CK |
| `side` | `OrderSide` | Mua/Bán |
| `orderType` | `OrderType` | Loại lệnh |
| `price` | `number` | Giá đặt |
| `quantity` / `osQuantity` / `filledQuantity` / `cancelQuantity` | `number` | SL đặt / chờ / khớp / huỷ |
| `status` | `OrderStatus` | Trạng thái |
| `inputTime` / `modifyTime` | `string` | Thời gian đặt / sửa |
| `message` | `string` | Thông báo / Lý do lỗi |

**`PortfolioMessage`** — Thay đổi danh mục (streaming)

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `type` | `"clientPortfolioEvent"` | Loại message |
| `accountNo` | `string` | Số tài khoản |
| `totalAsset` | `number` | Tổng tài sản |
| `cashBalance` | `number` | Số dư tiền mặt |
| `stockValue` | `number` | Giá trị chứng khoán |

**`HeartbeatMessage`** — Heartbeat

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `method` | `string` | Method |
| `channel` | `StreamingChannel` | Channel |
| `status` | `string` | Trạng thái |
| `message` | `string` | Thông báo |

---

## Giấy phép

MIT License. Bản quyền thuộc về SSI Securities Corporation.

// ---------------------------------------------------------------------------
// Main client classes
// ---------------------------------------------------------------------------
export { Auth, Data, Trading, Stream } from './client.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export { Config, ConfigOptions } from './config.js';

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------
export {
  SSIError,
  APIError,
  AuthenticationError,
  RateLimitError,
  WebSocketError,
  ValidationError,
  ConfigurationError,
} from './exceptions.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export {
  AccountType,
  Board,
  Timeframe,
  OrderSide,
  OrderType,
  OrderStatus,
  StreamingMethod,
  StreamingChannel,
  StreamingType,
  DataTopic,
  DataType,
  HTTPStatus,
} from './enums/index.js';

// ---------------------------------------------------------------------------
// Models / Types
// ---------------------------------------------------------------------------
export type {
  Account,
  Token,
  TokenRequest,
  OTPRequest,
  RefreshTokenRequest,
  OHLCRequest,
  OHLCData,
  MarketIndexes,
  MarketIndexSummary,
  SecuritiesInfo,
  SecuritiesSummary,
  PlaceOrderRequest,
  PlaceOrderResponse,
  ModifyOrderRequest,
  ModifyOrderResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  MaxBuySellRequest,
  MaxBuySellResponse,
  EquityAccountBalance,
  DerivativeAccountBalance,
  AccountBalance,
  EquityPosition,
  DerivativePosition,
  AllDerivativePosition,
  Position,
  EquityPPMMR,
  DerivativePPMMR,
  Order,
  OrderBook,
  RequestMessage,
  HeartbeatMessage,
  TradeMessage,
  IntervalMessage,
  QuoteMessage,
  MarketStatusMessage,
  ForeignRoomMessage,
  PutMessage,
  OddLotMessage,
  OrderStatusMessage,
  PortfolioMessage,
  DataMessage,
  TradingMessage,
} from './models/index.js';

// ---------------------------------------------------------------------------
// Services (for direct use if needed)
// ---------------------------------------------------------------------------
export {
  TokenManager,
  AccountService,
  MarketDataService,
  TradingService,
  PortfolioService,
  StreamingService,
} from './services/index.js';
export type {
  DataCallback,
  TradingCallback,
  HeartbeatCallback,
  ResponseCallback,
} from './services/index.js';

// ---------------------------------------------------------------------------
// Transport (advanced use)
// ---------------------------------------------------------------------------
export { RestClient, WebSocketClient } from './transport/index.js';
export type { MessageHandler } from './transport/index.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export { sign, toFloat, toInt, toNumber, toPrice, RateLimiter } from './utils/index.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { VERSION } from './version.js';

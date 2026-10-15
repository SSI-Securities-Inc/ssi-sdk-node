// ---------------------------------------------------------------------------
// Main client classes
// ---------------------------------------------------------------------------
export { Auth, Data, Trading, Stream } from './client.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export { Config } from './config.js';
export type { ConfigOptions } from './config.js';

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------
export {
  SSIError,
  APIError,
  AuthenticationError,
  RateLimitError,
  WebSocketError,
  TradingWSError,
  ValidationError,
  ConfigurationError,
  SmartOTPPendingError,
  SmartOTPRejectedError,
  ReauthenticationRequired,
  DuplicateRequestError,
} from './exceptions.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export {
  AccountType,
  Board,
  Timeframe,
  ALLOWED_TIMEFRAMES,
  OrderSide,
  OrderType,
  OrderStatus,
  StreamingMethod,
  StreamingChannel,
  StreamingType,
  DataTopic,
  DataType,
  HTTPStatus,
  ServerErrorCode,
  FCOType,
  FCOOperator,
  FCOStatus,
} from './enums/index.js';
export type { FCOStatusLike, FCOTypeLike, FCOOperatorLike } from './enums/index.js';

// ---------------------------------------------------------------------------
// Models / Types and their builders
// ---------------------------------------------------------------------------
export * from './models/index.js';

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
  classifyDataMessage,
  classifyTradingMessage,
  parseDataMessage,
  parseTradingMessage,
} from './services/index.js';
export type {
  DataCallback,
  TradingCallback,
  HeartbeatCallback,
  ResponseCallback,
  ConnectionCallback,
  DataKind,
  TradingKind,
} from './services/index.js';

// ---------------------------------------------------------------------------
// Transport (advanced use)
// ---------------------------------------------------------------------------
export { RestClient, WebSocketClient } from './transport/index.js';
export type {
  MessageHandler,
  TokenProvider,
  WebSocketClientOptions,
  ConnectionEvent,
  ConnectionState,
} from './transport/index.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export {
  sign,
  toFloat,
  toInt,
  toNumber,
  toPrice,
  RateLimiter,
  convertToDatetimeStr,
  todayDateStr,
  fromBeginningOfDay,
  fromEndOfDay,
  generateRequestId,
  buildTopic,
  buildTopics,
  TOPIC_TYPES,
  STREAM_INTERVALS,
  STREAM_INTERVAL_ALL,
  redact,
  mask,
} from './utils/index.js';
export type { StreamInterval } from './utils/index.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { VERSION } from './version.js';

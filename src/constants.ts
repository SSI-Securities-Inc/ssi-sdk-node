/** Protocol constants (fixed by server spec – not user-configurable). */

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export const DEFAULT_SIZE = 1000;
export const DEFAULT_PAGE = 1;

// ---------------------------------------------------------------------------
// Rate Limiting & Retries
// ---------------------------------------------------------------------------
export const DEFAULT_TIMEOUT = 60_000; // ms
export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_RETRY_DELAY = 2_000; // ms base for exponential backoff
export const DEFAULT_RATE_LIMIT_PER_SECOND = 10;
export const WS_THREAD_JOIN_TIMEOUT = 5_000; // ms

// ---------------------------------------------------------------------------
// HTTP Headers & Auth
// ---------------------------------------------------------------------------
export const HEADER_CONTENT_TYPE = 'Content-Type';
export const HEADER_ACCEPT = 'Accept';
export const HEADER_AUTHORIZATION = 'Authorization';
export const HEADER_RETRY_AFTER = 'Retry-After';
export const HEADER_SIGNATURE = 'X-Signature';
export const CONTENT_TYPE_JSON = 'application/json';
export const AUTH_SCHEME_BEARER = 'Bearer ';

// ---------------------------------------------------------------------------
// Base URLs
// ---------------------------------------------------------------------------
export const DEFAULT_API_URL = 'https://api.ssi.com.vn';
export const DEFAULT_STREAMING_URL = 'wss://stream.ssi.com.vn/ws/v3';

// ---------------------------------------------------------------------------
// API Endpoints — Authentication
// ---------------------------------------------------------------------------
export const EP_ACCESS_TOKEN = '/api/v3/auth/token';
export const EP_REFRESH_TOKEN = '/api/v3/auth/refresh';
export const EP_REQUEST_OTP = '/api/v3/auth/requestOtp';

// ---------------------------------------------------------------------------
// API Endpoints — Market Data
// ---------------------------------------------------------------------------
export const EP_DATA_OHLC = '/api/v3/data/ohlc';
export const EP_DATA_OHLC_DOWNLOAD = '/api/v3/data/ohlc/download';
export const EP_DATA_INDEX_LIST = '/api/v3/data/indexList';
export const EP_DATA_INDEX_SUMMARY = '/api/v3/data/indexSummary';
export const EP_DATA_SECURITIES_BY_BOARD = '/api/v3/data/securitiesByBoard';
export const EP_DATA_SECURITIES_SUMMARY = '/api/v3/data/securitiesSummary';

// ---------------------------------------------------------------------------
// API Endpoints — Trading
// ---------------------------------------------------------------------------
export const EP_TRADING_ORDER = '/api/v3/trading/order';
export const EP_TRADING_MAX_BUY_SELL = '/api/v3/trading/maxBuySell';

// ---------------------------------------------------------------------------
// API Endpoints — Portfolio & Account
// ---------------------------------------------------------------------------
export const EP_ACCOUNT_INFO = '/api/v3/account/info';
export const EP_ACCOUNT_BALANCE = '/api/v3/trading/accountBalance';
export const EP_ACCOUNT_PPMMR = '/api/v3/trading/ppmmrAccount';
export const EP_POSITIONS = '/api/v3/trading/position';
export const EP_ORDER_HISTORY = '/api/v3/trading/orderBook';

// ---------------------------------------------------------------------------
// WebSocket Constants
// ---------------------------------------------------------------------------
export const WS_KEY_CHANNEL = 'channel';

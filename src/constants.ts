/** Protocol constants (fixed by server spec – not user-configurable). */

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export const DEFAULT_SIZE = 1000;
export const DEFAULT_PAGE = 1;

// ---------------------------------------------------------------------------
// Rate Limiting & Retries
// ---------------------------------------------------------------------------
export const DEFAULT_TIMEOUT_MS = 60_000; // ms
export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_RETRY_DELAY_MS = 2_000; // ms base for exponential backoff
export const DEFAULT_RATE_LIMIT_PER_SECOND = 10;
// The server states its quota in X-RateLimit-Limit and, on 429, Retry-After; the REST client
// follows them. A 429 on a GET is waited out and retried this many times, never longer than this.
export const RATE_LIMIT_MAX_RETRIES = 3;
export const RATE_LIMIT_DEFAULT_WAIT_MS = 1_000; // ms when the 429 carries no Retry-After (doubles per retry)
export const RATE_LIMIT_MAX_WAIT_MS = 30_000; // ms; a longer wait is not taken silently: RateLimitError is thrown
export const WS_THREAD_JOIN_TIMEOUT_MS = 5_000; // ms

// ---------------------------------------------------------------------------
// HTTP Headers & Auth
// ---------------------------------------------------------------------------
export const HEADER_CONTENT_TYPE = 'Content-Type';
export const HEADER_ACCEPT = 'Accept';
export const HEADER_AUTHORIZATION = 'Authorization';
export const HEADER_RETRY_AFTER = 'Retry-After';
export const HEADER_RATE_LIMIT_LIMIT = 'X-RateLimit-Limit';
export const HEADER_RATE_LIMIT_REMAINING = 'X-RateLimit-Remaining';
export const HEADER_SIGNATURE = 'X-Signature';
export const HEADER_USER_AGENT = 'User-Agent';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
export const CONTENT_TYPE_JSON = 'application/json';
export const AUTH_SCHEME_BEARER = 'Bearer ';


// ---------------------------------------------------------------------------
// Base URLs
// ---------------------------------------------------------------------------
export const DEFAULT_API_URL = 'https://api.ssi.com.vn';
export const DEFAULT_STREAMING_URL = 'wss://stream.ssi.com.vn/ws/v3';
// Paths served by the trading API (orders, FCO, account, portfolio). They go to
// Config.tradingApiUrl, which is apiUrl unless tradingApiDomain is set.
export const TRADING_API_PATH_PREFIXES: readonly string[] = ['/api/v3/trading', '/api/v3/account'];
// Trading WebSocket (nothing in the facade clients connects to it; open it with asyncTradingWs).
export const TRADING_WS_PATH = '/ws/v3/trading';
export const DEFAULT_TRADING_WS_DOMAIN = 'wss://api.ssi.com.vn' + TRADING_WS_PATH;
// While Config.tradingApiDomain stays at this default it follows apiUrl.
export const DEFAULT_TRADING_API_DOMAIN = DEFAULT_API_URL;

// ---------------------------------------------------------------------------
// API Endpoints — Authentication
// ---------------------------------------------------------------------------
export const EP_ACCESS_TOKEN = '/api/v3/auth/token';
export const EP_REFRESH_TOKEN = '/api/v3/auth/refresh';
export const EP_REQUEST_OTP = '/api/v3/auth/requestOtp';

// Smart OTP pending approval code (HTTP 202 + code 401114)
export const SMART_OTP_PENDING_STATUS = 202;
export const SMART_OTP_PENDING_CODE = 401114;

// Treat a token as expired this many seconds early so it never expires mid-request.
export const TOKEN_EXPIRY_SKEW_SECONDS = 30;

// Smart OTP codes after which polling can never succeed (rejected / expired / unknown transaction).
export const SMART_OTP_TERMINAL_CODES: ReadonlySet<number> = new Set([401113, 401115, 401116]);

// Refresh failures meaning the refresh token is unusable: retrying cannot help, re-authenticate.
export const REFRESH_REAUTH_CODES: ReadonlySet<number> = new Set([
  401101, 401102, 401103, 401104, 401106, 401107, 401108,
]);

// HTTP 409 on an order/FCO/batch request: the client/batch request id was already used.
export const HTTP_STATUS_CONFLICT = 409;

// Config defaults for Smart OTP approval polling (ms): every 5s for up to 60s in total.
export const DEFAULT_OTP_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_OTP_POLL_MAX_WAIT_MS = 60_000;

// ---------------------------------------------------------------------------
// API Endpoints — Market Data
// ---------------------------------------------------------------------------
export const EP_DATA_OHLC = '/api/v3/data/ohlc';
export const EP_DATA_OHLC_DOWNLOAD = '/api/v3/data/ohlc/download';
export const EP_DATA_INDEX_LIST = '/api/v3/data/indexList';
export const EP_DATA_INDEX_SUMMARY = '/api/v3/data/indexSummary';
export const EP_DATA_SECURITIES_BY_BOARD = '/api/v3/data/securitiesByBoard';
export const EP_DATA_SECURITIES_SUMMARY = '/api/v3/data/securitiesSummary';
export const EP_DATA_MASTER_DATA = '/api/v3/data/masterdata';
export const EP_DATA_CORPORATE_ACTIONS = '/api/v3/data/corporateActions';

// corporateActions: the span of one request is capped at 5 days, pageSize must be one of these,
// language is vn or en.
export const CORPORATE_ACTIONS_MAX_DAYS = 5;
export const CORPORATE_ACTIONS_PAGE_SIZES: readonly number[] = [10, 20, 50, 100];
export const CORPORATE_ACTIONS_LANGUAGES: readonly string[] = ['vn', 'en'];

// ---------------------------------------------------------------------------
// API Endpoints — Trading
// ---------------------------------------------------------------------------
export const EP_TRADING_ORDER = '/api/v3/trading/order';
export const EP_TRADING_ORDER_BATCH = '/api/v3/trading/order/batch';
export const EP_TRADING_MAX_BUY_SELL = '/api/v3/trading/maxBuySell';
export const EP_TRADING_FCO_ORDER = '/api/v3/trading/fco/order';
export const EP_TRADING_FCO_LIST = '/api/v3/trading/fco/list';
export const EP_TRADING_FCO_ORDER_BOOK = '/api/v3/trading/fco/orderbook';
export const EP_TRADING_FCO_STATUS_HISTORY = '/api/v3/trading/fco/statusHistory';

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

// Synthetic dispatch routes for frames that carry no `channel`. Real channels (DATA, TRADING,
// HEARTBEAT) keep their own names as routes.
export const WS_ROUTE_ACK = '@ack'; // {method, channel, status, message} replies to a request
export const WS_ROUTE_ERROR = '@error'; // {code, msg} the server sends before closing a socket
export const WS_ROUTE_LIST_SUBSCRIPTION = '@list_subscription'; // {trading: 'a;b', data: 'x;y'}
export const WS_ROUTE_ID = '@id'; // frames answering a request that carried an `id` (trading socket)

// DATA-channel topic carrying market session flags (ATO, LO, ATC, ...) for all boards.
export const TOPIC_MARKET_FLAG = 'market.flag';

// Order request ids: the server rejects anything longer than 20 characters.
export const MAX_CLIENT_REQUEST_ID_LENGTH = 20;

// Server MaxBatchOrderCount (its default): Config.maxBatchOrders overrides it.
export const MAX_BATCH_ORDERS = 20;

// WebSocket reconnect policy (ms)
export const WS_RECONNECT_MAX_DELAY_MS = 60_000; // upper bound of the exponential backoff
export const WS_RATE_LIMIT_BACKOFF_MS = 30_000; // minimum wait after the server answers 429 on connect
export const WS_TOKEN_REFRESH_LEAD_MS = 60_000; // reconnect with a fresh token this long before expiry
export const WS_SERVER_MAX_CONNECTIONS = 10; // the server allows this many sockets per client

// The stream server's MaxMessageSize is 4096 bytes: keep every frame we send under it.
export const WS_MAX_FRAME_BYTES = 4000;

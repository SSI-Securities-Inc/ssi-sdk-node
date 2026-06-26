import { Config, ConfigOptions } from './config.js';
import { RestClient } from './transport/restClient.js';
import { WebSocketClient } from './transport/websocketClient.js';
import { TokenManager } from './services/tokenManager.js';
import { AccountService } from './services/account.js';
import { MarketDataService } from './services/marketData.js';
import { TradingService } from './services/trading.js';
import { PortfolioService } from './services/portfolio.js';
import { StreamingService } from './services/streaming.js';
import { Token } from './models/auth.js';

// ---------------------------------------------------------------------------
// Auth client
// ---------------------------------------------------------------------------

export class Auth {
  readonly config: Config;
  readonly restClient: RestClient;
  readonly tokenManager: TokenManager;

  constructor(options: ConfigOptions | Config) {
    this.config = options instanceof Config ? options : new Config(options);
    this.restClient = new RestClient(this.config);
    this.tokenManager = new TokenManager(this.config, this.restClient);
  }

  /** Request an OTP via SMS/email before calling `authenticate(otp)`. */
  requestOtp(): Promise<Record<string, unknown>> {
    return this.tokenManager.requestOtp();
  }

  /** Authenticate and retrieve an access token. Pass `otp` for trading/streaming. */
  authenticate(otp?: string): Promise<Token> {
    return this.tokenManager.authenticate(otp);
  }

  /** Refresh an existing access token using the refresh token. */
  refresh(): Promise<Token> {
    return this.tokenManager.refresh();
  }

  /**
   * Return the current access token, renewing if expired. Refreshes via the
   * refresh token when available, otherwise requires `otp` (first login only).
   */
  ensureAuthenticated(otp?: string): Promise<string> {
    return this.tokenManager.ensureAuthenticated(otp);
  }

  getToken(): Token | null {
    return this.tokenManager.getToken();
  }

  /** Restore a previously obtained token (e.g. from cache) to skip re-authentication. */
  setToken(token: Token): void {
    this.tokenManager.setToken(token);
  }
}

// ---------------------------------------------------------------------------
// Data (market data) client
// ---------------------------------------------------------------------------

export class Data {
  readonly marketData: MarketDataService;

  constructor(auth: Auth) {
    this.marketData = new MarketDataService(auth.restClient);
  }
}

// ---------------------------------------------------------------------------
// Trading client (requires OTP-authenticated Auth)
// ---------------------------------------------------------------------------

export class Trading {
  readonly trading: TradingService;
  readonly account: AccountService;
  readonly portfolio: PortfolioService;
  readonly tokenManager: TokenManager;

  constructor(auth: Auth) {
    this.tokenManager = auth.tokenManager;
    this.trading = new TradingService(auth.restClient);
    this.account = new AccountService(auth.restClient);
    this.portfolio = new PortfolioService(auth.restClient, auth.config.clientId);
  }
}

// ---------------------------------------------------------------------------
// Stream (real-time streaming) client (requires OTP-authenticated Auth)
// ---------------------------------------------------------------------------

export class Stream {
  readonly streaming: StreamingService;
  private readonly wsClient: WebSocketClient;

  constructor(auth: Auth) {
    const token = auth.tokenManager.getAccessToken();
    this.wsClient = new WebSocketClient(auth.config);
    if (token) this.wsClient.setToken(token);
    this.streaming = new StreamingService(this.wsClient);
  }

  /** Update the WebSocket token (e.g. after token refresh). */
  updateToken(token: string): void {
    this.wsClient.setToken(token);
  }

  disconnect(): void {
    this.streaming.disconnect();
  }
}

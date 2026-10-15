import { Config, ConfigOptions } from './config.js';
import { RestClient } from './transport/restClient.js';
import { WebSocketClient } from './transport/websocketClient.js';
import { TokenManager } from './services/tokenManager.js';
import { AccountService } from './services/account.js';
import { MarketDataService } from './services/marketData.js';
import { TradingService } from './services/trading.js';
import { PortfolioService } from './services/portfolio.js';
import { StreamingService } from './services/streaming.js';
import { Token, TokenInit, OTPResponse } from './models/auth.js';

/**
 * Build a Config, or derive one from `config` with `overrides` applied. The caller's Config is
 * never mutated (it may be shared); unknown option names are rejected by `Config`.
 */
function makeConfig(config: Config | ConfigOptions, overrides?: ConfigOptions): Config {
  if (config instanceof Config) {
    if (!overrides || Object.keys(overrides).length === 0) return config;
    return new Config({ ...config.toOptions(), ...overrides });
  }
  return new Config({ ...config, ...(overrides ?? {}) });
}

// ---------------------------------------------------------------------------
// Auth client
// ---------------------------------------------------------------------------

export class Auth {
  readonly config: Config;
  readonly restClient: RestClient;
  readonly tokenManager: TokenManager;

  /**
   * @param options - A `Config`, or the options to build one. When a `Config` is given with
   *   `overrides`, a changed copy is used and the original is left untouched.
   */
  constructor(options: ConfigOptions | Config, overrides?: ConfigOptions) {
    this.config = makeConfig(options, overrides);
    this.restClient = new RestClient(this.config);
    this.tokenManager = new TokenManager(this.config, this.restClient);
  }

  /** Request an OTP via SMS/email before calling `authenticate(otp)`. */
  requestOtp(): Promise<Record<string, unknown>> {
    return this.tokenManager.requestOtp();
  }

  /** Typed variant of `requestOtp()`. */
  requestOtpTyped(): Promise<OTPResponse> {
    return this.tokenManager.requestOtpTyped();
  }

  /** Authenticate and retrieve an access token. Pass `otp` or `transactionId` for trading/streaming. */
  authenticate(otp?: string, transactionId?: string): Promise<Token> {
    return this.tokenManager.authenticate(otp, transactionId);
  }

  /** Refresh an existing access token using the refresh token. */
  refresh(): Promise<Token> {
    return this.tokenManager.refresh();
  }

  /**
   * Return the current access token, renewing if expired. Refreshes via the refresh token when
   * available, otherwise requires `otp` or `transactionId` (Smart OTP polling).
   */
  ensureAuthenticated(
    otp?: string,
    transactionId?: string,
    pollIntervalMs?: number,
    pollMaxRetries?: number,
  ): Promise<string> {
    return this.tokenManager.ensureAuthenticated(otp, transactionId, pollIntervalMs, pollMaxRetries);
  }

  get token(): Token | null {
    return this.tokenManager.getToken();
  }

  get accessToken(): string | null {
    return this.tokenManager.getAccessToken();
  }

  get isTokenExpired(): boolean {
    return this.tokenManager.isTokenExpired();
  }

  get hasRefreshToken(): boolean {
    return this.tokenManager.hasRefreshToken();
  }

  get canRefresh(): boolean {
    return this.tokenManager.canRefresh();
  }

  getToken(): Token | null {
    return this.tokenManager.getToken();
  }

  /** Restore a previously obtained token (e.g. from cache) to skip re-authentication. */
  setToken(token: Token | TokenInit): void {
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
    this.portfolio = new PortfolioService(auth.restClient);
  }
}

// ---------------------------------------------------------------------------
// Stream (real-time streaming) client (requires OTP-authenticated Auth)
// ---------------------------------------------------------------------------

export class Stream {
  readonly streaming: StreamingService;
  readonly tokenManager: TokenManager;
  private readonly wsClient: WebSocketClient;

  constructor(auth: Auth) {
    const tokenManager = auth.tokenManager;
    this.tokenManager = tokenManager;
    this.wsClient = new WebSocketClient(auth.config, {
      tokenProvider: async (forceRefresh: boolean) => {
        if (forceRefresh && tokenManager.hasRefreshToken()) await tokenManager.refresh();
        return tokenManager.ensureAuthenticated();
      },
      expiryProvider: () => tokenManager.getToken()?.effectiveExpiresAt ?? 0,
    });
    const token = tokenManager.getAccessToken();
    if (token) this.wsClient.setToken(token);
    this.streaming = new StreamingService(this.wsClient);
  }

  /** Update the WebSocket token (e.g. after a manual token refresh). */
  updateToken(token: string): void {
    this.wsClient.setToken(token);
  }

  /** Stop streaming and close the socket. */
  disconnect(): Promise<void> {
    return this.streaming.disconnect();
  }
}

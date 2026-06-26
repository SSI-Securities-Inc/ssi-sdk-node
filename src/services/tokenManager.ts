import { RestClient } from '../transport/restClient.js';
import { EP_ACCESS_TOKEN, EP_REFRESH_TOKEN, EP_REQUEST_OTP } from '../constants.js';
import { Token, TokenRequest, OTPRequest, RefreshTokenRequest } from '../models/auth.js';
import { Config } from '../config.js';
import { AuthenticationError } from '../exceptions.js';

export class TokenManager {
  private token: Token | null = null;

  constructor(
    private readonly config: Config,
    private readonly restClient: RestClient,
  ) {}

  getToken(): Token | null {
    return this.token;
  }

  getAccessToken(): string | null {
    return this.token?.accessToken ?? null;
  }

  /** Whether the current token is missing or past its expiry. `expiresAt <= 0` means never expires. */
  isTokenExpired(): boolean {
    if (!this.token) return true;
    if (this.token.expiresAt <= 0) return false;
    return Date.now() / 1000 >= this.token.expiresAt;
  }

  isAuthenticated(): boolean {
    return !this.isTokenExpired();
  }

  /** Whether a refresh token is available to renew the access token without an OTP. */
  hasRefreshToken(): boolean {
    return Boolean(this.token?.refreshToken);
  }

  /** Manually set a token (e.g. one restored from cache). Updates the REST auth header. */
  setToken(token: Token): void {
    this.token = token;
    this.restClient.setAuthHeader(token.accessToken);
  }

  async authenticate(otp?: string): Promise<Token> {
    const body: TokenRequest = {
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
      ...(otp ? { otp } : {}),
    };
    const data = await this.restClient.post<{ data: Token } | Token>(EP_ACCESS_TOKEN, body);
    const raw = data as Record<string, unknown>;
    this.token = (raw.data as Token | undefined) ?? (data as Token);
    this.restClient.setAuthHeader(this.token.accessToken);
    return this.token;
  }

  async refresh(): Promise<Token> {
    if (!this.token?.refreshToken) throw new Error('No refresh token available');
    const body: RefreshTokenRequest = { refreshToken: this.token.refreshToken };
    const data = await this.restClient.post<{ data: Token } | Token>(EP_REFRESH_TOKEN, body);
    const raw = data as Record<string, unknown>;
    this.token = (raw.data as Token | undefined) ?? (data as Token);
    this.restClient.setAuthHeader(this.token.accessToken);
    return this.token;
  }

  async requestOtp(): Promise<Record<string, unknown>> {
    const body: OTPRequest = {
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
    };
    return this.restClient.post<Record<string, unknown>>(EP_REQUEST_OTP, body);
  }

  /**
   * Ensure a valid access token is available, renewing if needed.
   *
   * If the token is expired and a refresh token exists, it is refreshed
   * automatically (no OTP needed). Otherwise a fresh OTP is required — and only
   * on first login or when no refresh token is available.
   */
  async ensureAuthenticated(otp?: string): Promise<string> {
    if (this.isTokenExpired()) {
      if (this.hasRefreshToken()) {
        await this.refresh();
      } else if (otp) {
        await this.authenticate(otp);
      } else {
        throw new AuthenticationError(
          'OTP is required to authenticate — no refresh token available',
          'AUTH_REQUIRED',
          0,
        );
      }
    }
    return this.token!.accessToken;
  }
}

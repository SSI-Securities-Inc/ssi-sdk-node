import { RestClient } from '../transport/restClient.js';
import {
  EP_ACCESS_TOKEN,
  EP_REFRESH_TOKEN,
  EP_REQUEST_OTP,
  SMART_OTP_PENDING_STATUS,
  SMART_OTP_PENDING_CODE,
} from '../constants.js';
import { Token, TokenRequest, OTPRequest, RefreshTokenRequest } from '../models/auth.js';
import { Config } from '../config.js';
import { APIError, AuthenticationError } from '../exceptions.js';

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

  async authenticate(otp?: string, transactionId?: string): Promise<Token> {
    const body: TokenRequest = {
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
      ...(otp ? { otp } : {}),
      ...(transactionId ? { transactionId } : {}),
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
   * automatically (no OTP needed). Otherwise a fresh OTP or Smart OTP transactionId is required.
   */
  async ensureAuthenticated(
    otp?: string,
    transactionId?: string,
    pollIntervalMs = 5000,
    pollMaxRetries = 6,
  ): Promise<string> {
    if (this.isTokenExpired()) {
      if (this.hasRefreshToken()) {
        await this.refresh();
      } else if (otp) {
        await this.authenticate(otp);
      } else if (transactionId) {
        await this.pollSmartOtp(transactionId, pollIntervalMs, pollMaxRetries);
      } else {
        throw new AuthenticationError(
          'OTP or Smart OTP transactionId is required to authenticate — no refresh token available',
          'AUTH_REQUIRED',
          0,
        );
      }
    }
    return this.token!.accessToken;
  }

  private isSmartOtpPending(err: unknown): boolean {
    if (err instanceof APIError) {
      if (err.statusCode !== SMART_OTP_PENDING_STATUS) return false;
      const body = err.responseBody as Record<string, unknown> | undefined;
      return body?.code === SMART_OTP_PENDING_CODE;
    }
    return false;
  }

  private async pollSmartOtp(
    transactionId: string,
    intervalMs: number,
    maxRetries: number,
  ): Promise<Token> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.authenticate(undefined, transactionId);
      } catch (err) {
        if (!this.isSmartOtpPending(err)) {
          throw err;
        }
        if (attempt >= maxRetries) {
          throw new AuthenticationError(
            `Smart OTP approval not confirmed after ${maxRetries} attempts — please approve on your device.`,
            'SMART_OTP_TIMEOUT',
            401,
          );
        }
        console.log(`[Smart OTP] Pending approval (attempt ${attempt}/${maxRetries}), retrying in ${intervalMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    throw new AuthenticationError('Smart OTP polling failed', 'SMART_OTP_FAILED', 401);
  }
}

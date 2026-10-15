import { RestClient } from '../transport/restClient.js';
import {
  EP_ACCESS_TOKEN,
  EP_REFRESH_TOKEN,
  EP_REQUEST_OTP,
  REFRESH_REAUTH_CODES,
  SMART_OTP_PENDING_CODE,
  TOKEN_EXPIRY_SKEW_SECONDS,
} from '../constants.js';
import {
  Token,
  TokenInit,
  TokenRequest,
  OTPRequest,
  OTPResponse,
  RefreshTokenRequest,
} from '../models/auth.js';
import { Config } from '../config.js';
import {
  APIError,
  AuthenticationError,
  ReauthenticationRequired,
  SmartOTPPendingError,
  SSIError,
} from '../exceptions.js';
import { redact } from '../utils/redact.js';
import { createLogger } from '../utils/logger.js';
import { sleep } from '../utils/retry.js';

function buildAuthRequest(config: Config, otp?: string, transactionId?: string): TokenRequest {
  if (!config.apiKey || !config.apiSecret) {
    throw new AuthenticationError('apiKey and apiSecret are required for authentication');
  }
  if (otp && transactionId) {
    throw new AuthenticationError('Pass only one of otp or transactionId, not both');
  }
  return {
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    ...(otp ? { otp } : {}),
    ...(transactionId ? { transactionId } : {}),
  };
}

function buildRefreshRequest(config: Config, refreshToken: string): RefreshTokenRequest {
  if (!config.apiKey || !config.apiSecret) {
    throw new AuthenticationError('apiKey and apiSecret are required for token refresh');
  }
  return { refreshToken };
}

function buildOtpRequest(config: Config): OTPRequest {
  if (!config.apiKey || !config.apiSecret) {
    throw new AuthenticationError('apiKey and apiSecret are required for OTP request');
  }
  return { apiKey: config.apiKey, apiSecret: config.apiSecret };
}

/**
 * Whether an auth error means the Smart OTP approval is still pending.
 * Confirmed against SSI FastConnect: HTTP 202 with body `{"code": 401114, "msg": "Push-approval is pending"}`.
 */
function isSmartOtpPending(error: unknown): boolean {
  if (error instanceof SmartOTPPendingError) return true;
  if (!(error instanceof SSIError)) return false;
  const body = error.responseBody;
  return (
    typeof body === 'object' &&
    body !== null &&
    String((body as Record<string, unknown>).code) === String(SMART_OTP_PENDING_CODE)
  );
}

/**
 * Whether a refresh failure means the refresh token is dead (401101-401104 / 401106-401108).
 * The server treats a reused refresh token as a leak and revokes the apiKey's whole session, so
 * the only way forward is a new OTP login: never retry.
 */
function isReauthError(error: SSIError): boolean {
  return [...REFRESH_REAUTH_CODES].some((code) => String(code) === String(error.code));
}

/** Resolve Smart OTP poll (interval ms, attempts); explicit args win over `config`. */
function pollAttempts(
  config: Config,
  intervalMs?: number,
  maxRetries?: number,
): { wait: number; attempts: number } {
  const wait = intervalMs ?? config.otpPollIntervalMs;
  if (maxRetries !== undefined) return { wait, attempts: Math.max(1, maxRetries) };
  if (wait <= 0) return { wait, attempts: 1 };
  return { wait, attempts: Math.max(1, Math.ceil(config.otpPollMaxWaitMs / wait)) };
}

/** Parse and validate a token from a raw response payload. */
function parseToken(data: unknown, context: string): Token {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new APIError(`Unexpected response format while ${context}`, undefined, undefined, redact(data));
  }
  const record = data as Record<string, unknown>;
  const payload = 'data' in record ? record.data : record;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new APIError(`Unexpected token payload format while ${context}`, undefined, undefined, redact(data));
  }
  const token = Token.fromDict(payload as Record<string, unknown>);
  if (!token.accessToken) {
    throw new APIError(
      `${context.charAt(0).toUpperCase()}${context.slice(1)} payload is missing access token`,
      undefined,
      undefined,
      redact(data),
    );
  }
  return token;
}

export class TokenManager {
  private token: Token | null = null;
  private refreshChain: Promise<unknown> = Promise.resolve();
  private readonly logger;

  constructor(
    private readonly config: Config,
    private readonly restClient: RestClient,
  ) {
    this.logger = createLogger('ssi_sdk.services.token_manager', config.logLevel);
  }

  getToken(): Token | null {
    return this.token;
  }

  getAccessToken(): string | null {
    return this.token?.accessToken ?? null;
  }

  /**
   * Whether the current access token is missing or (nearly) expired.
   *
   * A 30-second skew is applied so a token is never sent seconds before it dies; a token with
   * an unknown expiry (`expiresAt <= 0`) is treated as expired.
   */
  isTokenExpired(): boolean {
    if (!this.token) return true;
    if (this.token.expiresAt <= 0) return true;
    return Date.now() / 1000 >= this.token.expiresAt - TOKEN_EXPIRY_SKEW_SECONDS;
  }

  isAuthenticated(): boolean {
    return !this.isTokenExpired();
  }

  /** Whether a refresh token is available to renew the access token without an OTP. */
  hasRefreshToken(): boolean {
    return Boolean(this.token?.refreshToken);
  }

  /** Whether the current token can still be refreshed (refresh token present and not expired). */
  canRefresh(): boolean {
    return Boolean(this.token?.canRefresh);
  }

  /** Manually set a token (e.g. one restored from cache). Updates the REST auth header. */
  setToken(token: Token | TokenInit): void {
    this.token = token instanceof Token ? token : new Token(token);
    this.restClient.setAuthHeader(this.token.accessToken);
    this.logger.debug('Access token set manually');
  }

  /** Forget the token and stop sending it; the session is unusable. */
  private clearToken(): void {
    this.token = null;
    this.restClient.clearAuthHeader();
  }

  private checkRefreshable(): void {
    if (!this.hasRefreshToken()) {
      throw new AuthenticationError('No refresh token available — authenticate first');
    }
    if (!this.canRefresh()) {
      throw new ReauthenticationRequired('Refresh token expired — authenticate again with a new OTP');
    }
  }

  /**
   * Authenticate using consumer credentials and OTP to obtain an access token.
   *
   * @param otp - Normal OTP code typed by the user (SMS/email).
   * @param transactionId - Smart OTP transaction id (from `requestOtp`), used once the user
   *   approves the request on their device. Mutually exclusive with `otp`. A single attempt:
   *   throws SmartOTPPendingError while the approval is pending; `ensureAuthenticated` polls.
   */
  async authenticate(otp?: string, transactionId?: string): Promise<Token> {
    const body = buildAuthRequest(this.config, otp, transactionId);
    const data = await this.restClient.request('POST', EP_ACCESS_TOKEN, { data: body, retry: false });
    this.token = parseToken(data, 'authenticating');
    this.restClient.setAuthHeader(this.token.accessToken);
    this.logger.debug('Authentication successful');
    return this.token;
  }

  /**
   * Obtain a new access token using the current refresh token.
   *
   * Concurrent callers are coalesced: only one request reaches the server, the others reuse
   * its result. Note this is per process: the server keeps one active session per apiKey, so a
   * login/refresh in another process invalidates this token.
   *
   * @throws AuthenticationError if no refresh token is available.
   * @throws ReauthenticationRequired if the refresh token expired or the server rejected it
   *   (401101-401104/401106-401108); the stored token is cleared and a new OTP is required.
   */
  refresh(): Promise<Token> {
    return this.refreshSingleFlight(true);
  }

  /**
   * Refresh under a single-flight chain.
   *
   * @param force - When false (the `ensureAuthenticated` path) the refresh is skipped if the
   *   token is still valid by the time this call runs. When true it is skipped only if another
   *   caller renewed the token while this one waited.
   */
  private refreshSingleFlight(force: boolean): Promise<Token> {
    this.checkRefreshable();
    const observed = this.token?.accessToken;
    const run = this.refreshChain.then(async () => {
      if (this.coalesced(observed) || (!force && !this.isTokenExpired())) return this.token as Token;
      this.checkRefreshable();
      return this.runRefresh();
    });
    this.refreshChain = run.catch(() => undefined);
    return run;
  }

  private coalesced(observedAccessToken: string | undefined): boolean {
    return (
      this.token !== null && this.token.accessToken !== observedAccessToken && !this.isTokenExpired()
    );
  }

  private async runRefresh(): Promise<Token> {
    const current = this.token as Token;
    const body = buildRefreshRequest(this.config, current.refreshToken);
    let data: unknown;
    try {
      data = await this.restClient.request('POST', EP_REFRESH_TOKEN, { data: body, retry: false });
    } catch (err) {
      if (err instanceof SSIError && isReauthError(err)) {
        this.clearToken();
        throw new ReauthenticationRequired(
          'Refresh token rejected by the server — authenticate again with a new OTP',
          err.code,
          err.statusCode,
          err.responseBody,
          err.headers,
        );
      }
      throw err;
    }
    this.token = parseToken(data, 'refreshing');
    this.restClient.setAuthHeader(this.token.accessToken);
    this.logger.debug('Token refreshed successfully');
    return this.token;
  }

  /**
   * Request an OTP to be sent (normal OTP) or pushed for approval (Smart OTP).
   *
   * Both account types share the same request endpoint: the server decides how to deliver the
   * OTP based on how the account was registered.
   */
  async requestOtp(): Promise<Record<string, unknown>> {
    const body = buildOtpRequest(this.config);
    const data = await this.restClient.request('POST', EP_REQUEST_OTP, { data: body, retry: false });
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new APIError('Unexpected response format while requesting OTP');
    }
    return data as Record<string, unknown>;
  }

  /** Request an OTP and return it as an `OTPResponse` (`transactionId` is set only for Smart OTP). */
  async requestOtpTyped(): Promise<OTPResponse> {
    return OTPResponse.fromDict(await this.requestOtp());
  }

  /**
   * Ensure a valid token is available, refreshing or authenticating as needed.
   *
   * A still-valid token is returned as is. Otherwise: refresh if the refresh token is usable,
   * else log in with `otp` / `transactionId`.
   *
   * @param otp - Normal OTP code typed by the user, verified in a single call.
   * @param transactionId - Smart OTP transaction id. Approval on the device is asynchronous, so
   *   this polls `authenticate` every `pollIntervalMs` until the user approves. If polling runs
   *   out while the transaction is still valid, call again with the same `transactionId`.
   * @param pollIntervalMs - Milliseconds between polls (default `Config.otpPollIntervalMs`).
   * @param pollMaxRetries - Max poll attempts (default `Config.otpPollMaxWaitMs` / interval).
   */
  async ensureAuthenticated(
    otp?: string,
    transactionId?: string,
    pollIntervalMs?: number,
    pollMaxRetries?: number,
  ): Promise<string> {
    if (this.token && !this.isTokenExpired()) return this.token.accessToken;
    if (this.token && this.canRefresh()) {
      await this.refreshSingleFlight(false);
    } else if (otp) {
      await this.authenticate(otp);
    } else if (transactionId) {
      await this.pollSmartOtp(transactionId, pollIntervalMs, pollMaxRetries);
    } else if (this.token) {
      throw new ReauthenticationRequired(
        'Session expired and cannot be refreshed — authenticate again with a new OTP',
      );
    } else {
      throw new AuthenticationError(
        'OTP or Smart OTP transactionId is required to authenticate — no token available',
      );
    }
    return (this.token as Token | null)?.accessToken ?? '';
  }

  /**
   * Poll `authenticate()` with a Smart OTP transaction id until approved or polls run out.
   * A pending approval (202/401114) keeps polling; any other error, including the
   * rejected/expired/unknown-transaction codes, stops immediately.
   */
  private async pollSmartOtp(
    transactionId: string,
    intervalMs?: number,
    maxRetries?: number,
  ): Promise<Token> {
    const { wait, attempts } = pollAttempts(this.config, intervalMs, maxRetries);
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.authenticate(undefined, transactionId);
      } catch (err) {
        if (!isSmartOtpPending(err)) throw err;
        if (attempt >= attempts) {
          const api = err as SSIError;
          throw new SmartOTPPendingError(
            `Smart OTP approval not confirmed after ${attempts} attempts — ask the user to approve ` +
              'the request on their device, then call again with the same transactionId',
            api.code,
            api.statusCode,
          );
        }
        this.logger.info(
          `Smart OTP approval still pending (attempt ${attempt}/${attempts}), retrying in ${(wait / 1000).toFixed(0)}s...`,
        );
        await sleep(wait);
      }
    }
  }
}

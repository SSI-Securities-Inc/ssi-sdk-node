import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Config } from '../config.js';
import {
  HEADER_AUTHORIZATION,
  HEADER_CONTENT_TYPE,
  HEADER_ACCEPT,
  CONTENT_TYPE_JSON,
  AUTH_SCHEME_BEARER,
} from '../constants.js';
import { APIError, AuthenticationError, RateLimitError } from '../exceptions.js';
import { RateLimiter, retryAsync } from '../utils/retry.js';

// ---------------------------------------------------------------------------
// Response handler
// ---------------------------------------------------------------------------
function handleResponse(response: AxiosResponse): unknown {
  if (response.status === 204) return {};
  const body = response.data;
  if (Array.isArray(body)) return { data: body };
  if (typeof body === 'object' && body !== null && !('data' in body)) return { data: body };
  return body;
}

function handleAxiosError(err: unknown): never {
  if (axios.isAxiosError(err) && err.response) {
    const { status, data, headers } = err.response;
    if (status === 401 || status === 403) {
      throw new AuthenticationError(
        `Authentication failed: ${status}`,
        String(status),
        status,
        data,
      );
    }
    if (status === 429) {
      const retryAfter = headers['retry-after'];
      throw new RateLimitError(
        'Rate limit exceeded',
        retryAfter ? parseFloat(retryAfter) : undefined,
      );
    }
    if (status >= 400) {
      throw new APIError(`API error: ${status}`, String(status), status, data);
    }
  }
  throw err;
}

// ---------------------------------------------------------------------------
// REST Client
// ---------------------------------------------------------------------------
export class RestClient {
  private readonly rateLimiter: RateLimiter;
  private headers: Record<string, string>;
  private axiosInstance: AxiosInstance;

  constructor(private readonly config: Config) {
    this.rateLimiter = new RateLimiter(config.rateLimitPerSecond);
    this.headers = {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
      [HEADER_ACCEPT]: CONTENT_TYPE_JSON,
    };
    this.axiosInstance = this.createInstance();
  }

  private createInstance(): AxiosInstance {
    const cfg: AxiosRequestConfig = {
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
        [HEADER_ACCEPT]: CONTENT_TYPE_JSON,
      },
      paramsSerializer: {
        serialize: (params) => {
          return Object.entries(params)
            .map(([key, val]) => {
              if (val === undefined || val === null) return '';
              const encodedVal = encodeURIComponent(String(val)).replace(/%2F/g, '/');
              return `${encodeURIComponent(key)}=${encodedVal}`;
            })
            .filter(Boolean)
            .join('&');
        }
      }
    };
    if (this.config.proxy) {
      const url = new URL(this.config.proxy);
      cfg.proxy = {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port, 10),
        ...(url.username ? { auth: { username: url.username, password: url.password } } : {}),
      };
    }
    return axios.create(cfg);
  }

  getPrivateKey(): string {
    return this.config.privateKey;
  }

  setAuthHeader(token: string): void {
    this.headers[HEADER_AUTHORIZATION] = `${AUTH_SCHEME_BEARER}${token}`;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: {
      params?: Record<string, unknown>;
      data?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    await this.rateLimiter.acquire();

    return retryAsync(
      async () => {
        try {
          const reqHeaders = { ...this.headers, ...options.headers };
          if (path === '/api/v3/auth/refresh') {
            delete reqHeaders[HEADER_AUTHORIZATION];
          }
          const response = await this.axiosInstance.request({
            method,
            url: path,
            params: options.params,
            data: options.data,
            headers: reqHeaders,
          });
          return handleResponse(response) as T;
        } catch (err) {
          handleAxiosError(err);
        }
      },
      this.config.maxRetries,
      this.config.retryDelay,
    );
  }

  get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  post<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', path, { data, headers });
  }

  put<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PUT', path, { data, headers });
  }

  delete<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', path, { data, headers });
  }
}

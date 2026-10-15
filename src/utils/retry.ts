/**
 * Token-bucket rate limiter that follows what the server says.
 *
 * `perSecond` is the caller's own ceiling (0 = unlimited). `cap()` lowers the effective rate
 * to the server's advertised limit, and `pause()` holds every caller for a while (the server
 * asked us to wait). A rate of 0 stays unlimited: the caller opted out.
 */
export class RateLimiter {
  private readonly configured: number;
  private max: number;
  private tokens: number;
  private last: number;
  private pauseUntil = 0;

  constructor(perSecond: number) {
    this.configured = perSecond;
    this.max = perSecond;
    this.tokens = perSecond;
    this.last = performance.now();
  }

  /** The effective requests-per-second ceiling now (0 = unlimited). */
  get rate(): number {
    return this.max;
  }

  /** Never go faster than `serverLimit` per second (ignored when unlimited/invalid). */
  cap(serverLimit: number | null | undefined): void {
    if (!serverLimit || serverLimit <= 0 || this.configured <= 0) return;
    this.max = Math.min(this.configured, serverLimit);
    this.tokens = Math.min(this.tokens, this.max);
  }

  /** Make every `acquire()` wait until `seconds` from now (never shortens a pause). */
  pause(seconds: number): void {
    if (!(seconds > 0)) return;
    this.pauseUntil = Math.max(this.pauseUntil, performance.now() + seconds * 1000);
  }

  /** Take a token and return 0, or return how many ms to wait before trying again. */
  private reserve(): number {
    const now = performance.now();
    if (now < this.pauseUntil) return this.pauseUntil - now;
    if (this.max <= 0) return 0;
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.max, this.tokens + elapsed * this.max);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.max) * 1000);
  }

  /** Wait until a request token is available. */
  async acquire(): Promise<void> {
    for (let wait = this.reserve(); wait > 0; wait = this.reserve()) {
      await sleep(wait);
    }
  }
}

/**
 * Exponential back-off retry wrapper for async functions.
 *
 * Only retries on a timeout (like the Python SDK); every other failure (connection reset,
 * refused, DNS, HTTP errors) is raised at once. Callers decide whether the call is safe to
 * repeat (the REST client does this for GET only; orders are never retried).
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
): Promise<T> {
  const retries = Math.max(0, maxRetries);
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isTimeoutError(err) || attempt >= retries) throw err;
      await sleep(delayMs * Math.pow(2, attempt));
    }
  }
}

/** Whether `err` is a request timeout (axios `timeout of Nms exceeded`, `ETIMEDOUT`, `TimeoutError`). */
export function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, name, message } = err as { code?: string; name?: string; message?: string };
  if (code === 'ETIMEDOUT' || name === 'TimeoutError') return true;
  return code === 'ECONNABORTED' && /timeout/i.test(message ?? '');
}

/** Whether `err` is a transport-level failure (used to hide request details, not to retry). */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as NodeJS.ErrnoException).code;
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNABORTED' ||
    (err as { name?: string }).name === 'TimeoutError'
  );
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Sleep `ms`, or less when `signal` aborts (it resolves either way, never rejects). */
export const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

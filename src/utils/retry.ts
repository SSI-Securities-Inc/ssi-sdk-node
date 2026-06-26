/**
 * Token-bucket rate limiter.
 *
 * Allows up to `perSecond` acquisitions per second; 0 means unlimited.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly perSecond: number) {
    this.tokens = perSecond;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.perSecond, this.tokens + elapsed * this.perSecond);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    if (this.perSecond <= 0) return;
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) / this.perSecond) * 1000);
      await sleep(waitMs);
    }
  }
}

/** Exponential back-off retry wrapper for async functions.
 *  Only retries on network-level errors (ECONNRESET, ETIMEDOUT, ENOTFOUND).
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRetryable = isNetworkError(err);
      if (!isRetryable || attempt === maxRetries) throw err;
      lastError = err;
      await sleep(delayMs * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

function isNetworkError(err: unknown): boolean {
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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

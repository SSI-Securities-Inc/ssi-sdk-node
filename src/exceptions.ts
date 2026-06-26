/** Error hierarchy for the SSI SDK. */

export class SSIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class APIError extends SSIError {
  readonly code: string;
  readonly statusCode: number;
  readonly responseBody: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    responseBody?: unknown,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class AuthenticationError extends APIError {}

export class RateLimitError extends SSIError {
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export class WebSocketError extends SSIError {}

export class ValidationError extends SSIError {}

export class ConfigurationError extends SSIError {}

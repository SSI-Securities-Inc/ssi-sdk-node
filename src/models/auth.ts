export interface TokenRequest {
  apiKey: string;
  apiSecret: string;
  otp?: string;
}

export interface OTPRequest {
  apiKey: string;
  apiSecret: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface Token {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}

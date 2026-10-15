/**
 * Minimal leveled logger. Messages must never carry secrets: callers log only methods,
 * paths, counts and codes (never tokens, OTPs, account numbers or request bodies).
 */

const LEVELS: Record<string, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  WARN: 30,
  ERROR: 40,
  CRITICAL: 50,
};

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(name: string, level = 'INFO'): Logger {
  const threshold = LEVELS[String(level).toUpperCase()] ?? LEVELS.INFO;
  const emit = (severity: number, label: string, message: string): void => {
    if (severity < threshold) return;
    // stderr keeps stdout free for the caller's own output.
    console.error(`[${label}] ${name}: ${message}`);
  };
  return {
    debug: (message) => emit(10, 'DEBUG', message),
    info: (message) => emit(20, 'INFO', message),
    warn: (message) => emit(30, 'WARNING', message),
    error: (message) => emit(40, 'ERROR', message),
  };
}

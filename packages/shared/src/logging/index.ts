import pino, { Logger, LoggerOptions } from 'pino';
import { getContext, getCorrelationId, getDurationMs } from './context.js';

export {
  runWithContext,
  runWithContextAsync,
  getContext,
  getCorrelationId,
  getUserId,
  updateContext,
  generateCorrelationId,
  getDurationMs,
  type RequestContext,
} from './context.js';

/**
 * Configuration options for creating a logger
 */
export interface LoggerConfig {
  name: string;
  level?: string;
  pretty?: boolean;
}

/**
 * Create a pino logger with ZK-DPP defaults
 */
export function createLogger(config: LoggerConfig): Logger {
  const { name, level = process.env.LOG_LEVEL || 'info', pretty = process.env.NODE_ENV !== 'production' } = config;

  const options: LoggerOptions = {
    name,
    level,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: () => ({}), // Remove pid and hostname
    },
    mixin: () => {
      const ctx = getContext();
      return {
        service: name,
        ...(ctx?.correlationId && { correlationId: ctx.correlationId }),
        ...(ctx?.userId && { userId: ctx.userId }),
        ...(ctx?.operation && { operation: ctx.operation }),
      };
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  };

  // Use pino-pretty in development
  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(options);
}

/**
 * Log an operation completion with duration
 */
export function logOperation(
  logger: Logger,
  operation: string,
  meta?: Record<string, unknown>
): void {
  const duration = getDurationMs();
  logger.info({ operation, durationMs: duration, ...meta }, `${operation} completed`);
}

/**
 * Log an error with context
 */
export function logError(
  logger: Logger,
  error: Error,
  operation?: string,
  meta?: Record<string, unknown>
): void {
  const duration = getDurationMs();
  logger.error(
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      operation,
      durationMs: duration,
      ...meta,
    },
    `Error in ${operation ?? 'unknown operation'}: ${error.message}`
  );
}

/**
 * Create a child logger with additional context
 */
export function childLogger(
  logger: Logger,
  bindings: Record<string, unknown>
): Logger {
  return logger.child(bindings);
}

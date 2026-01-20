import { ErrorCode, ErrorCodes, getHttpStatusFromCode } from './codes.js';

export { ErrorCodes, type ErrorCode, getHttpStatusFromCode } from './codes.js';

/**
 * Base error class for all ZK-DPP errors
 */
export class ZkDppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ZkDppError';
    this.code = code;
    this.statusCode = getHttpStatusFromCode(code);
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Validation error for invalid input data
 */
export class ValidationError extends ZkDppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCodes.VALIDATION_FAILED, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error for missing or invalid credentials
 */
export class AuthenticationError extends ZkDppError {
  constructor(
    message: string = 'Authentication required',
    code: ErrorCode = ErrorCodes.AUTHENTICATION_REQUIRED
  ) {
    super(code, message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error for insufficient permissions
 */
export class AuthorizationError extends ZkDppError {
  constructor(
    message: string = 'Access denied',
    code: ErrorCode = ErrorCodes.AUTHORIZATION_FAILED,
    details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends ZkDppError {
  constructor(
    resource: string,
    identifier?: string,
    code: ErrorCode = ErrorCodes.NOT_FOUND
  ) {
    const message = identifier
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`;
    super(code, message, { resource, identifier });
    this.name = 'NotFoundError';
  }
}

/**
 * Proof verification error
 */
export class ProofVerificationError extends ZkDppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.PROOF_VERIFICATION_FAILED,
    details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'ProofVerificationError';
  }
}

/**
 * Database error
 */
export class DatabaseError extends ZkDppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.DATABASE_ERROR,
    details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'DatabaseError';
  }
}

/**
 * Event bus error
 */
export class EventBusError extends ZkDppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.EVENT_BUS_ERROR,
    details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'EventBusError';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends ZkDppError {
  constructor(
    message: string = 'Rate limit exceeded',
    retryAfterMs?: number
  ) {
    super(ErrorCodes.RATE_LIMIT_EXCEEDED, message, { retryAfterMs });
    this.name = 'RateLimitError';
  }
}

/**
 * Internal server error
 */
export class InternalError extends ZkDppError {
  constructor(
    message: string = 'Internal server error',
    code: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'InternalError';
  }
}

/**
 * Check if an error is a ZkDppError
 */
export function isZkDppError(error: unknown): error is ZkDppError {
  return error instanceof ZkDppError;
}

/**
 * Wrap an unknown error into a ZkDppError
 */
export function wrapError(error: unknown): ZkDppError {
  if (isZkDppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, ErrorCodes.INTERNAL_ERROR, {
      originalError: error.name,
    });
  }

  return new InternalError('An unexpected error occurred');
}

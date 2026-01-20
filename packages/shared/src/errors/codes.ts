/**
 * Error codes for the ZK-DPP protocol
 * Format: ZKDPP-{CATEGORY}-{NUMBER}
 */
export const ErrorCodes = {
  // Validation errors (1xx)
  VALIDATION_FAILED: 'ZKDPP-VAL-100',
  INVALID_SCHEMA: 'ZKDPP-VAL-101',
  INVALID_PROOF_FORMAT: 'ZKDPP-VAL-102',
  INVALID_COMMITMENT: 'ZKDPP-VAL-103',
  INVALID_PREDICATE: 'ZKDPP-VAL-104',
  MISSING_REQUIRED_FIELD: 'ZKDPP-VAL-105',

  // Authentication errors (2xx)
  AUTHENTICATION_REQUIRED: 'ZKDPP-AUTH-200',
  INVALID_TOKEN: 'ZKDPP-AUTH-201',
  TOKEN_EXPIRED: 'ZKDPP-AUTH-202',
  INVALID_SIGNATURE: 'ZKDPP-AUTH-203',

  // Authorization errors (3xx)
  AUTHORIZATION_FAILED: 'ZKDPP-AUTHZ-300',
  INSUFFICIENT_ROLE: 'ZKDPP-AUTHZ-301',
  ACCESS_DENIED: 'ZKDPP-AUTHZ-302',
  RESOURCE_FORBIDDEN: 'ZKDPP-AUTHZ-303',

  // Not found errors (4xx)
  NOT_FOUND: 'ZKDPP-NF-400',
  PRODUCT_NOT_FOUND: 'ZKDPP-NF-401',
  SUPPLIER_NOT_FOUND: 'ZKDPP-NF-402',
  PREDICATE_NOT_FOUND: 'ZKDPP-NF-403',
  COMMITMENT_NOT_FOUND: 'ZKDPP-NF-404',

  // Proof verification errors (5xx)
  PROOF_VERIFICATION_FAILED: 'ZKDPP-PROOF-500',
  PROOF_EXPIRED: 'ZKDPP-PROOF-501',
  NONCE_ALREADY_USED: 'ZKDPP-PROOF-502',
  INVALID_MERKLE_PROOF: 'ZKDPP-PROOF-503',
  CIRCUIT_NOT_FOUND: 'ZKDPP-PROOF-504',

  // Database errors (6xx)
  DATABASE_ERROR: 'ZKDPP-DB-600',
  CONNECTION_FAILED: 'ZKDPP-DB-601',
  QUERY_FAILED: 'ZKDPP-DB-602',
  DUPLICATE_ENTRY: 'ZKDPP-DB-603',

  // Event bus errors (7xx)
  EVENT_BUS_ERROR: 'ZKDPP-EB-700',
  EVENT_PUBLISH_FAILED: 'ZKDPP-EB-701',
  EVENT_SUBSCRIBE_FAILED: 'ZKDPP-EB-702',

  // Rate limit errors (8xx)
  RATE_LIMIT_EXCEEDED: 'ZKDPP-RL-800',

  // Internal errors (9xx)
  INTERNAL_ERROR: 'ZKDPP-INT-900',
  SERVICE_UNAVAILABLE: 'ZKDPP-INT-901',
  CONFIGURATION_ERROR: 'ZKDPP-INT-902',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes mapped to error categories
 */
export const ErrorHttpStatus: Record<string, number> = {
  'ZKDPP-VAL': 400,
  'ZKDPP-AUTH': 401,
  'ZKDPP-AUTHZ': 403,
  'ZKDPP-NF': 404,
  'ZKDPP-PROOF': 422,
  'ZKDPP-DB': 500,
  'ZKDPP-EB': 500,
  'ZKDPP-RL': 429,
  'ZKDPP-INT': 500,
};

/**
 * Get HTTP status code from error code
 */
export function getHttpStatusFromCode(code: ErrorCode): number {
  const prefix = code.split('-').slice(0, 2).join('-');
  return ErrorHttpStatus[prefix] ?? 500;
}

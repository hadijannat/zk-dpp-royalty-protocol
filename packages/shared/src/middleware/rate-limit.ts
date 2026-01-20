import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/**
 * Rate limit configuration presets
 */
export const RateLimitPresets = {
  // Default rate limits for public endpoints
  PUBLIC: {
    max: 100,
    timeWindow: 60000, // 1 minute
  },
  // Rate limits for authenticated endpoints
  AUTHENTICATED: {
    max: 1000,
    timeWindow: 60000,
  },
  // Rate limits for verification endpoints (resource intensive)
  VERIFICATION: {
    max: 100,
    timeWindow: 60000,
  },
  // Rate limits for DPP endpoints
  DPP: {
    max: 500,
    timeWindow: 60000,
  },
  // Rate limits for settlement endpoints
  SETTLEMENT: {
    max: 50,
    timeWindow: 60000,
  },
  // Strict rate limits for sensitive operations
  STRICT: {
    max: 10,
    timeWindow: 60000,
  },
} as const;

export type RateLimitPreset = keyof typeof RateLimitPresets;

/**
 * Rate limit configuration options
 */
export interface RateLimitConfig {
  max: number;
  timeWindow: number;
  keyGenerator?: (request: { ip: string; user?: { id: string } }) => string;
  skipAuth?: boolean;
}

/**
 * Generate rate limit key based on user ID (if authenticated) or IP
 */
function defaultKeyGenerator(request: { ip: string; user?: { id: string } }): string {
  return request.user?.id || request.ip;
}

/**
 * Register global rate limiting on Fastify instance
 */
export async function registerRateLimit(
  app: FastifyInstance,
  config: Partial<RateLimitConfig> = {}
): Promise<void> {
  const {
    max = RateLimitPresets.PUBLIC.max,
    timeWindow = RateLimitPresets.PUBLIC.timeWindow,
    keyGenerator = defaultKeyGenerator,
  } = config;

  await app.register(rateLimit, {
    max,
    timeWindow,
    keyGenerator: (request) => keyGenerator(request as { ip: string; user?: { id: string } }),
    errorResponseBuilder: (_request, context) => ({
      error: 'RateLimitError',
      code: 'ZKDPP-RL-800',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      details: {
        limit: context.max,
        remaining: 0,
        retryAfterMs: context.ttl,
      },
      timestamp: new Date().toISOString(),
    }),
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}

/**
 * Create route-specific rate limit config
 */
export function createRouteRateLimit(preset: RateLimitPreset): {
  config: {
    rateLimit: {
      max: number;
      timeWindow: number;
    };
  };
} {
  return {
    config: {
      rateLimit: RateLimitPresets[preset],
    },
  };
}

/**
 * Create custom route-specific rate limit config
 */
export function createCustomRouteRateLimit(
  max: number,
  timeWindowMs: number
): {
  config: {
    rateLimit: {
      max: number;
      timeWindow: number;
    };
  };
} {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow: timeWindowMs,
      },
    },
  };
}

/**
 * IP whitelist for rate limiting exemption (e.g., internal services)
 */
const ipWhitelist = new Set<string>([
  '127.0.0.1',
  '::1',
  // Add internal service IPs here
]);

/**
 * Add IP to rate limit whitelist
 */
export function addToWhitelist(ip: string): void {
  ipWhitelist.add(ip);
}

/**
 * Check if IP is whitelisted
 */
export function isWhitelisted(ip: string): boolean {
  return ipWhitelist.has(ip);
}

/**
 * Key generator that skips rate limiting for whitelisted IPs
 */
export function whitelistAwareKeyGenerator(request: {
  ip: string;
  user?: { id: string };
}): string {
  if (isWhitelisted(request.ip)) {
    // Use a special key that has very high limits
    return '__whitelisted__';
  }
  return defaultKeyGenerator(request);
}

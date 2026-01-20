export {
  createAuthPreHandler,
  createOptionalAuthPreHandler,
  registerAuthErrorHandler,
  getKeycloakConfig,
  type AuthConfig,
  type TokenClaims,
  type AuthUser,
} from './auth.js';

export {
  DppViewRoles,
  RoleHierarchy,
  type DppViewType,
  getEffectiveRoles,
  hasAnyRole,
  hasAllRoles,
  requireAnyRole,
  requireAllRoles,
  requireDppViewAccess,
  checkResourceOwnership,
  requireResourceOwnership,
} from './rbac.js';

export {
  RateLimitPresets,
  type RateLimitPreset,
  type RateLimitConfig,
  registerRateLimit,
  createRouteRateLimit,
  createCustomRouteRateLimit,
  addToWhitelist,
  isWhitelisted,
  whitelistAwareKeyGenerator,
} from './rate-limit.js';

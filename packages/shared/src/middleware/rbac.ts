import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthorizationError, ErrorCodes } from '../errors/index.js';
import type { AuthUser } from './auth.js';

/**
 * DPP View types with associated roles
 */
export const DppViewRoles = {
  PUBLIC: [], // No authentication required
  LEGIT_INTEREST: ['auditor', 'authority', 'brand'],
  AUTHORITY: ['authority'],
} as const;

export type DppViewType = keyof typeof DppViewRoles;

/**
 * Role hierarchy for permission inheritance
 */
export const RoleHierarchy: Record<string, string[]> = {
  authority: ['auditor', 'brand'], // Authority inherits from auditor and brand
  auditor: [], // No inheritance
  brand: [], // No inheritance
  supplier: [], // No inheritance
};

/**
 * Get all effective roles including inherited ones
 */
export function getEffectiveRoles(userRoles: string[]): string[] {
  const effective = new Set<string>(userRoles);

  for (const role of userRoles) {
    const inherited = RoleHierarchy[role] || [];
    inherited.forEach((r) => effective.add(r));
  }

  return Array.from(effective);
}

/**
 * Check if user has any of the required roles
 */
export function hasAnyRole(user: AuthUser | undefined, requiredRoles: readonly string[]): boolean {
  if (requiredRoles.length === 0) {
    return true; // No roles required
  }

  if (!user) {
    return false;
  }

  const effectiveRoles = getEffectiveRoles(user.roles);
  return requiredRoles.some((role) => effectiveRoles.includes(role));
}

/**
 * Check if user has all of the required roles
 */
export function hasAllRoles(user: AuthUser | undefined, requiredRoles: readonly string[]): boolean {
  if (requiredRoles.length === 0) {
    return true;
  }

  if (!user) {
    return false;
  }

  const effectiveRoles = getEffectiveRoles(user.roles);
  return requiredRoles.every((role) => effectiveRoles.includes(role));
}

/**
 * Create RBAC preHandler requiring any of the specified roles
 */
export function requireAnyRole(...roles: string[]) {
  return async function rbacPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    if (!hasAnyRole(request.user, roles)) {
      throw new AuthorizationError(
        `Insufficient permissions. Required roles: ${roles.join(' or ')}`,
        ErrorCodes.INSUFFICIENT_ROLE,
        { requiredRoles: roles, userRoles: request.user?.roles || [] }
      );
    }
  };
}

/**
 * Create RBAC preHandler requiring all of the specified roles
 */
export function requireAllRoles(...roles: string[]) {
  return async function rbacPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    if (!hasAllRoles(request.user, roles)) {
      throw new AuthorizationError(
        `Insufficient permissions. Required roles: ${roles.join(' and ')}`,
        ErrorCodes.INSUFFICIENT_ROLE,
        { requiredRoles: roles, userRoles: request.user?.roles || [] }
      );
    }
  };
}

/**
 * Create RBAC preHandler for DPP view access
 */
export function requireDppViewAccess(viewType: DppViewType) {
  const requiredRoles = DppViewRoles[viewType];

  return async function dppViewRbacPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    // PUBLIC view doesn't require auth
    if (viewType === 'PUBLIC') {
      return;
    }

    if (!request.user) {
      throw new AuthorizationError(
        'Authentication required for this view',
        ErrorCodes.AUTHORIZATION_FAILED
      );
    }

    if (!hasAnyRole(request.user, requiredRoles)) {
      throw new AuthorizationError(
        `Access denied to ${viewType} view. Required roles: ${requiredRoles.join(' or ')}`,
        ErrorCodes.ACCESS_DENIED,
        { viewType, requiredRoles, userRoles: request.user.roles }
      );
    }
  };
}

/**
 * Check if user can access a specific resource (ownership check)
 */
export function checkResourceOwnership(
  user: AuthUser | undefined,
  resourceOwnerId: string
): boolean {
  if (!user) {
    return false;
  }

  // Authority can access any resource
  if (user.roles.includes('authority')) {
    return true;
  }

  return user.id === resourceOwnerId;
}

/**
 * Create preHandler that checks resource ownership
 */
export function requireResourceOwnership(getOwnerId: (request: FastifyRequest) => string) {
  return async function ownershipPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const ownerId = getOwnerId(request);

    if (!checkResourceOwnership(request.user, ownerId)) {
      throw new AuthorizationError(
        'You do not have permission to access this resource',
        ErrorCodes.RESOURCE_FORBIDDEN
      );
    }
  };
}

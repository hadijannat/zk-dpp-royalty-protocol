import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import * as jose from 'jose';
import { AuthenticationError, ErrorCodes } from '../errors/index.js';
import { updateContext } from '../logging/index.js';

/**
 * JWT claims from Keycloak token
 */
export interface TokenClaims {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [clientId: string]: {
      roles: string[];
    };
  };
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

/**
 * User info extracted from token
 */
export interface AuthUser {
  id: string;
  email?: string;
  username?: string;
  roles: string[];
}

/**
 * Extend FastifyRequest to include auth user
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Auth middleware configuration
 */
export interface AuthConfig {
  issuer: string;
  audience?: string;
  jwksUri: string;
  clientId?: string;
}

/**
 * Create JWKS remote key set for token verification
 */
let jwks: jose.JWTVerifyGetKey | null = null;

function getJwks(jwksUri: string): jose.JWTVerifyGetKey {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(jwksUri));
  }
  return jwks;
}

/**
 * Extract token from Authorization header
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Extract roles from token claims
 */
function extractRoles(claims: TokenClaims, clientId?: string): string[] {
  const roles: Set<string> = new Set();

  // Realm-level roles
  if (claims.realm_access?.roles) {
    claims.realm_access.roles.forEach((role) => roles.add(role));
  }

  // Client-specific roles
  if (clientId && claims.resource_access?.[clientId]?.roles) {
    claims.resource_access[clientId].roles.forEach((role) => roles.add(role));
  }

  return Array.from(roles);
}

/**
 * Verify JWT token and extract user info
 */
async function verifyToken(
  token: string,
  config: AuthConfig
): Promise<AuthUser> {
  try {
    const jwksKey = getJwks(config.jwksUri);

    const { payload } = await jose.jwtVerify(token, jwksKey, {
      issuer: config.issuer,
      audience: config.audience,
    });

    const claims = payload as TokenClaims;

    return {
      id: claims.sub,
      email: claims.email,
      username: claims.preferred_username,
      roles: extractRoles(claims, config.clientId),
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new AuthenticationError('Token expired', ErrorCodes.TOKEN_EXPIRED);
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      throw new AuthenticationError('Invalid token signature', ErrorCodes.INVALID_TOKEN);
    }
    throw new AuthenticationError('Invalid token', ErrorCodes.INVALID_TOKEN);
  }
}

/**
 * Create authentication preHandler for Fastify
 */
export function createAuthPreHandler(config: AuthConfig) {
  return async function authPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const token = extractToken(request);

    if (!token) {
      throw new AuthenticationError(
        'Authorization header required',
        ErrorCodes.AUTHENTICATION_REQUIRED
      );
    }

    const user = await verifyToken(token, config);
    request.user = user;

    // Update logging context with user info
    updateContext({ userId: user.id });
  };
}

/**
 * Create optional authentication preHandler (doesn't throw if no token)
 */
export function createOptionalAuthPreHandler(config: AuthConfig) {
  return async function optionalAuthPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const token = extractToken(request);

    if (!token) {
      return; // No token, continue without auth
    }

    try {
      const user = await verifyToken(token, config);
      request.user = user;
      updateContext({ userId: user.id });
    } catch {
      // Invalid token in optional auth - continue without user
      request.log.debug('Invalid token in optional auth, continuing without user');
    }
  };
}

/**
 * Register auth error handler on Fastify instance
 */
export function registerAuthErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthenticationError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }
    throw error;
  });
}

/**
 * Get default Keycloak config from environment
 */
export function getKeycloakConfig(): AuthConfig {
  const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
  const realm = process.env.KEYCLOAK_REALM || 'zkdpp';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'zkdpp-services';

  return {
    issuer: `${keycloakUrl}/realms/${realm}`,
    jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
    audience: clientId,
    clientId,
  };
}

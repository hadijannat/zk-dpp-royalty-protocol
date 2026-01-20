# ADR-005: Keycloak as Identity Provider

## Status

Accepted

## Context

The ZK-DPP system requires identity and access management for:

- User authentication (suppliers, brands, auditors, authorities)
- Role-based access control (RBAC)
- Service-to-service authentication
- Token management (JWT issuance and validation)
- Multi-tenancy support (organizations)

Requirements:
- OIDC/OAuth 2.0 compliance for standard integration
- Fine-grained role management
- Self-hosted option for data sovereignty
- Support for external identity federation

## Decision

We will use **Keycloak** as the identity provider for all authentication and authorization needs.

### Configuration

```yaml
# Keycloak realm configuration
realm: zkdpp
roles:
  - supplier    # Can create commitments, respond to requests
  - brand       # Can request verifications, view DPPs
  - auditor     # Can view LEGIT_INTEREST tier
  - authority   # Can view AUTHORITY tier (full access)

clients:
  - zkdpp-api   # Backend services
  - zkdpp-web   # Web application
  - zkdpp-edge  # Edge Agent (desktop)
```

### JWT Claims

```json
{
  "sub": "user-uuid",
  "realm_access": {
    "roles": ["supplier", "auditor"]
  },
  "resource_access": {
    "zkdpp-api": {
      "roles": ["read:dpp", "write:commitment"]
    }
  },
  "organization_id": "org-123",
  "supplier_id": "supplier-456"
}
```

## Consequences

### Positive

- **Industry standard**: OIDC/OAuth 2.0 compliant
- **Rich feature set**: SSO, federation, MFA, user management
- **Self-hosted**: Full control over identity data
- **Extensible**: Custom authenticators, mappers, themes
- **Active development**: Red Hat backing, large community
- **Admin UI**: Built-in management console

### Negative

- **Resource intensive**: Requires 512MB-1GB RAM minimum
- **Complexity**: Many features means steep learning curve
- **Java-based**: Different tech stack from main application
- **Configuration drift**: Easy to misconfigure in complex setups

### Neutral

- Requires PostgreSQL or other database for persistence
- Theme customization requires Freemarker knowledge
- Updates require careful migration planning

## Alternatives Considered

### Auth0

- **Pros**: Fully managed, excellent DX, great documentation
- **Cons**: SaaS-only (data sovereignty), cost at scale, vendor lock-in
- **Rejected because**: Need self-hosted option for EU data residency requirements

### Ory Stack (Kratos + Hydra + Keto)

- **Pros**: Modern architecture, Kubernetes-native, lightweight
- **Cons**: Multiple services to manage, less mature, smaller community
- **Rejected because**: Operational complexity of managing 3 separate services

### Authelia

- **Pros**: Lightweight, simple, good for small deployments
- **Cons**: Limited features, no admin UI, limited OIDC support
- **Rejected because**: Feature set too limited for enterprise requirements

### AWS Cognito

- **Pros**: Fully managed, scales infinitely, AWS integration
- **Cons**: AWS lock-in, limited customization, no self-hosted option
- **Rejected because**: Cloud lock-in unacceptable for data sovereignty

### Zitadel

- **Pros**: Modern, cloud-native, good multi-tenancy
- **Cons**: Newer project, smaller community, less documentation
- **Rejected because**: Less battle-tested, smaller ecosystem

## Integration Pattern

### Service Authentication

```typescript
// packages/auth-client/src/index.ts
import Keycloak from 'keycloak-connect';

export async function validateToken(token: string): Promise<TokenClaims> {
  const decoded = await keycloak.verifyToken(token);
  return {
    userId: decoded.sub,
    roles: decoded.realm_access?.roles || [],
    organizationId: decoded.organization_id,
    supplierId: decoded.supplier_id,
  };
}
```

### Fastify Middleware

```typescript
// packages/shared/src/middleware/auth.ts
export const authPreHandler = async (request, reply) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  try {
    request.user = await validateToken(token);
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
};
```

### Role-Based Access Control

```typescript
// packages/shared/src/middleware/rbac.ts
export const requireRoles = (...roles: string[]) => {
  return async (request, reply) => {
    const userRoles = request.user?.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));
    if (!hasRole) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
};

// Usage in route
app.get('/dpp/:sku/view/authority', {
  preHandler: [authPreHandler, requireRoles('authority')],
}, handler);
```

## References

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak Helm Chart](https://github.com/bitnami/charts/tree/main/bitnami/keycloak)
- [OIDC Specification](https://openid.net/specs/openid-connect-core-1_0.html)

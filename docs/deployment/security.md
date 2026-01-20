# Security Best Practices

Security guidelines for deploying and operating the ZK-DPP Royalty Protocol in production.

## Overview

The ZK-DPP system handles sensitive supply chain data and implements privacy-preserving proofs. Security is paramount across all components.

## Authentication & Authorization

### JWT Token Security

1. **Token Validation**
   - All tokens are validated against Keycloak's public keys
   - Token expiry is strictly enforced
   - Audience and issuer claims are verified

2. **Role-Based Access Control (RBAC)**
   - DPP views are gated by role:
     - `PUBLIC`: No auth required
     - `LEGIT_INTEREST`: Requires `auditor` or `authority` role
     - `AUTHORITY`: Requires `authority` role only

3. **Token Best Practices**
   ```bash
   # Short token lifetime (recommended: 5-15 minutes)
   ACCESS_TOKEN_LIFESPAN=300

   # Use refresh tokens with rotation
   REFRESH_TOKEN_LIFESPAN=1800
   ```

### API Key Security (Gateway Signing)

```bash
# Generate strong Ed25519 keys
# Store in secure secret management (Vault, AWS Secrets Manager, etc.)
# Rotate keys periodically
```

## Network Security

### TLS Configuration

Always use TLS in production:

```yaml
# Ingress TLS config
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  tls:
    - hosts:
        - api.zkdpp.io
      secretName: zkdpp-tls
```

### Internal Communication

- Use mTLS for service-to-service communication (Istio/Linkerd)
- Encrypt NATS connections with TLS
- Use SSL for PostgreSQL connections

```bash
# PostgreSQL with SSL
DATABASE_URL=postgresql://zkdpp:pass@host:5432/zkdpp?sslmode=require
```

### Network Policies

Implement Kubernetes network policies to restrict traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: verify-gateway-policy
spec:
  podSelector:
    matchLabels:
      app: verify-gateway
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - port: 3001
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: nats
      ports:
        - port: 4222
```

## Data Protection

### Sensitive Data at Rest

1. **Database Encryption**
   - Enable PostgreSQL encryption at rest
   - Use encrypted volumes in Kubernetes

2. **Secrets Management**
   - Never store secrets in code or config files
   - Use:
     - Kubernetes Secrets (with encryption at rest)
     - HashiCorp Vault
     - AWS Secrets Manager / GCP Secret Manager
     - Azure Key Vault

3. **Evidence Files**
   - Supplier evidence stays local (Edge Agent)
   - Only commitments and proofs are transmitted

### Data in Transit

- All external traffic over TLS 1.3
- Internal traffic encrypted via mTLS
- Proof packages contain no raw values

### Commitment Security

The commitment model ensures:
- Raw claim values never leave the supplier's device
- Only cryptographic commitments are shared
- Proofs reveal only boolean results (pass/fail)

## Input Validation

### Schema Validation

All services validate input against JSON schemas:

```typescript
// Proof packages are validated before processing
if (!validateProofPackage(proofPackage)) {
  return { error: 'Invalid proof package' };
}
```

### Rate Limiting

Services implement rate limiting to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/verify` | 100/min (unauthenticated) | 60s |
| `/verify` | 1000/min (authenticated) | 60s |
| `/dpp/*` | 500/min | 60s |
| `/settlements` | 50/min | 60s |

### Replay Protection

- Each proof includes a unique nonce
- Nonces are tracked and rejected if reused
- Time windows prevent stale proofs

```typescript
// Nonce validation
if (nonceStore.hasNonce(nonce)) {
  return { error: 'Nonce already used' };
}
```

## Security Headers

All services apply security headers via Helmet:

```typescript
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
```

Headers applied:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy`
- `Strict-Transport-Security` (when TLS enabled)

## Blockchain Security

### Smart Contract Security

1. **Audit Status**: Contracts should be audited before mainnet deployment
2. **Upgradability**: Consider proxy patterns for upgrades
3. **Access Control**: Owner-only functions for sensitive operations

### Wallet Security

```bash
# Use dedicated wallets for settlement operations
# Never use personal wallets
# Consider multi-sig for high-value operations

# Hardware wallet integration for production
BLOCKCHAIN_PRIVATE_KEY=hardware://ledger
```

### Transaction Security

- Gas limits prevent runaway costs
- Nonce management prevents replay
- Dispute window allows challenge

## Logging & Audit

### Structured Logging

All services use Pino for structured logging:

```json
{
  "level": "info",
  "time": 1705312200000,
  "correlationId": "abc123",
  "service": "verify-gateway",
  "msg": "Proof verified",
  "predicateId": "RECYCLED_CONTENT_GTE_V1",
  "duration": 145
}
```

### Sensitive Data in Logs

**Never log:**
- Private keys
- Raw claim values
- Full proof bytes
- Authentication tokens

**Safe to log:**
- Correlation IDs
- Predicate IDs
- Commitment roots (public)
- Timestamps
- Error messages (sanitized)

### Audit Trail

For compliance, maintain audit logs:

```sql
CREATE TABLE audit.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(100),
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    action VARCHAR(50),
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Vulnerability Management

### Dependency Scanning

```bash
# Node.js dependencies
pnpm audit

# Rust dependencies
cargo audit

# Container images
trivy image zkdpp-verify-gateway:latest
```

### Security Updates

1. Subscribe to security advisories:
   - Node.js security releases
   - Rust security announcements
   - Noir framework updates

2. Regular update schedule:
   - Critical: Immediate
   - High: Within 24 hours
   - Medium: Within 7 days
   - Low: Next release cycle

## OWASP Top 10 Mitigations

| Vulnerability | Mitigation |
|---------------|------------|
| A01 Broken Access Control | RBAC, JWT validation, route guards |
| A02 Cryptographic Failures | Ed25519 signatures, TLS everywhere |
| A03 Injection | Schema validation, parameterized queries |
| A04 Insecure Design | ZK proofs, commitment model |
| A05 Security Misconfiguration | Helmet, secure defaults |
| A06 Vulnerable Components | Dependency scanning, updates |
| A07 Auth Failures | Keycloak, token validation |
| A08 Integrity Failures | Signed receipts, Merkle proofs |
| A09 Logging Failures | Structured logging, audit trail |
| A10 SSRF | Input validation, allowlists |

## Incident Response

### Detection

Monitor for:
- Failed authentication attempts
- Unusual API patterns
- Proof verification failures
- Database anomalies

### Response Procedure

1. **Identify**: Determine scope and severity
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove threat
4. **Recover**: Restore normal operations
5. **Lessons**: Post-incident review

### Contact

Report security issues: security@zkdpp.io

See [SECURITY.md](../../SECURITY.md) for responsible disclosure policy.

## Compliance Considerations

### GDPR

- Supplier data stays local (Edge Agent)
- Only cryptographic proofs are processed
- No personal data in verification receipts

### SOC 2

- Access logging enabled
- Encryption at rest and in transit
- Regular security assessments

### EU Battery Regulation

- Compliant predicate library
- Audit trail for verifications
- Tamper-evident receipts

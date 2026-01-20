# Configuration Reference

Complete environment variable reference for all ZK-DPP services.

## Common Variables

These variables are used by all services:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode (`development`, `production`) | `development` | No |
| `HOST` | Bind address | `0.0.0.0` | No |
| `CORS_ORIGIN` | Allowed CORS origins (`*` for all) | `*` | No |
| `LOG_LEVEL` | Pino log level (trace, debug, info, warn, error) | `info` | No |

## Authentication (Keycloak)

All services use these variables for JWT authentication:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `KEYCLOAK_URL` | Keycloak server URL | `http://localhost:8080` | No |
| `KEYCLOAK_REALM` | Keycloak realm name | `zkdpp` | No |
| `KEYCLOAK_CLIENT_ID` | OAuth client ID | `zkdpp-api` | No |
| `KEYCLOAK_ENABLED` | Enable/disable auth (`true`/`false`) | `true` | No |

## Verify Gateway (Port 3001)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `3001` | No |
| `NATS_URL` | NATS server URL | `nats://localhost:4222` | No |
| `SIGNING_KEY_ID` | Gateway key identifier | `gateway-key-001` | No |
| `SIGNING_KEY_PRIVATE` | Ed25519 private key (base64) | - | **Yes** (prod) |
| `NONCE_WINDOW_MS` | Nonce validity window in ms | `300000` (5 min) | No |
| `ZK_BACKEND` | ZK proof backend (`noir-cli`, `mock`) | `noir-cli` | No |
| `NARGO_BIN` | Path to nargo binary | `nargo` | No |
| `NOIR_CIRCUITS_DIR` | Directory containing Noir circuits | - | No |
| `ALLOW_MOCK_PROOFS` | Allow mock proofs when Noir unavailable | `false` | No |

### Signing Key Generation

Generate an Ed25519 keypair for the gateway:

```bash
# Using Node.js
node -e "
const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
console.log('Private:', privateKey.export({type: 'pkcs8', format: 'pem'}));
console.log('Public:', publicKey.export({type: 'spki', format: 'pem'}));
"
```

## DPP Builder (Port 3002)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `3002` | No |
| `DATABASE_URL` | PostgreSQL connection string | See below | **Yes** |
| `NATS_URL` | NATS server URL | `nats://localhost:4222` | No |

### Database URL Format

```
postgresql://[user]:[password]@[host]:[port]/[database]
```

Example:
```
postgresql://zkdpp:zkdpp_dev_password@localhost:5433/zkdpp
```

## Metering & Billing (Port 3003)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `3003` | No |
| `DATABASE_URL` | PostgreSQL connection string | See above | **Yes** |
| `NATS_URL` | NATS server URL | `nats://localhost:4222` | No |

### Blockchain Configuration (Optional)

When blockchain settlement is enabled:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BLOCKCHAIN_RPC_URL` | Ethereum JSON-RPC endpoint | - | No |
| `BLOCKCHAIN_PRIVATE_KEY` | Wallet private key for transactions | - | No |
| `BLOCKCHAIN_CHAIN_ID` | Chain ID (84532 = Base Sepolia) | `84532` | No |
| `CONTRACT_SETTLEMENT_ADDRESS` | RoyaltySettlement contract | - | No |
| `CONTRACT_ESCROW_ADDRESS` | VerificationEscrow contract | - | No |
| `CONTRACT_DISTRIBUTOR_ADDRESS` | PaymentDistributor contract | - | No |
| `CONTRACT_USDC_ADDRESS` | USDC token contract | - | No |

## Rate Limiting

Each service has configurable rate limits:

| Service | Default Limit | Window |
|---------|--------------|--------|
| verify-gateway | 100 req/min | 60s |
| dpp-builder | 500 req/min | 60s |
| metering-billing | 100 req/min | 60s |

Override via code or custom middleware.

## NATS JetStream

Stream and consumer configuration:

| Stream | Subjects | Retention |
|--------|----------|-----------|
| `VERIFICATIONS` | `proofs.verified.*` | WorkQueue |
| `RECEIPTS` | `receipts.issued.*` | Limits |

## Example Configuration Files

### Development (.env.development)

```bash
# Services
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://zkdpp:zkdpp_dev_password@localhost:5433/zkdpp

# NATS
NATS_URL=nats://localhost:4222

# Auth (optional in dev)
KEYCLOAK_ENABLED=false

# Verify Gateway
ALLOW_MOCK_PROOFS=true
ZK_BACKEND=mock

# No blockchain in dev
```

### Production (.env.production)

```bash
# Services
NODE_ENV=production
LOG_LEVEL=info

# Database (use secrets manager in practice)
DATABASE_URL=postgresql://zkdpp:${DB_PASSWORD}@postgres:5432/zkdpp

# NATS
NATS_URL=nats://nats:4222

# Auth
KEYCLOAK_URL=https://auth.yourdomain.com
KEYCLOAK_REALM=zkdpp
KEYCLOAK_CLIENT_ID=zkdpp-api
KEYCLOAK_ENABLED=true

# Verify Gateway
ZK_BACKEND=noir-cli
NARGO_BIN=/usr/local/bin/nargo
NOIR_CIRCUITS_DIR=/app/circuits/noir/predicates
SIGNING_KEY_PRIVATE=${GATEWAY_SIGNING_KEY}

# Blockchain
BLOCKCHAIN_RPC_URL=https://mainnet.base.org
BLOCKCHAIN_PRIVATE_KEY=${SETTLEMENT_WALLET_KEY}
BLOCKCHAIN_CHAIN_ID=8453
CONTRACT_SETTLEMENT_ADDRESS=0x...
CONTRACT_ESCROW_ADDRESS=0x...
CONTRACT_DISTRIBUTOR_ADDRESS=0x...
CONTRACT_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## Keycloak Realm Configuration

### Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| `supplier` | Can generate proofs, view own data | - |
| `brand` | Can request verifications, view products | - |
| `auditor` | Can view LEGIT_INTEREST DPP views | LEGIT_INTEREST |
| `authority` | Full access to all DPP views | AUTHORITY |

### Client Scopes

Configure the `zkdpp-api` client with:

- **Standard Flow**: Enabled
- **Direct Access Grants**: Enabled (for testing)
- **Service Accounts**: Enabled (for service-to-service)
- **Valid Redirect URIs**: Your application URLs
- **Web Origins**: `+` (all origins from redirect URIs)

### Token Claims

Ensure tokens include:

```json
{
  "realm_access": {
    "roles": ["supplier", "auditor"]
  },
  "preferred_username": "user@example.com",
  "sub": "user-uuid"
}
```

## Database Schema

The services expect these schemas in PostgreSQL:

```sql
-- Products schema (dpp-builder)
CREATE SCHEMA IF NOT EXISTS dpp;

-- Metering schema (metering-billing)
CREATE SCHEMA IF NOT EXISTS metering;
```

Initialize using the scripts in `infra/docker/init-db/`.

## Health Check Configuration

All services expose:

| Endpoint | Purpose | Successful Response |
|----------|---------|---------------------|
| `/health` | Overall health | `status: "healthy"` |
| `/ready` | Readiness probe | `ready: true` |
| `/live` | Liveness probe | `alive: true` |

Configure your orchestrator to check these endpoints:

```yaml
# Kubernetes probe example
livenessProbe:
  httpGet:
    path: /live
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
```

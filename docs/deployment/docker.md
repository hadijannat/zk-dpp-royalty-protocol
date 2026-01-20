# Docker Deployment Guide

This guide covers deploying the ZK-DPP Royalty Protocol using Docker and Docker Compose.

## Prerequisites

- Docker 24.0+
- Docker Compose 2.20+
- At least 4GB RAM available for containers
- 10GB disk space for images and volumes

## Quick Start (Development)

The development stack includes PostgreSQL, NATS, and Keycloak:

```bash
# Start infrastructure
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Verify services are running
docker compose -f infra/docker/docker-compose.dev.yml ps
```

### Service Ports

| Service    | Port  | Purpose              |
|------------|-------|----------------------|
| PostgreSQL | 5433  | Database             |
| NATS       | 4222  | Event bus            |
| NATS HTTP  | 8222  | Monitoring dashboard |
| Keycloak   | 8080  | Identity provider    |

## Production Docker Compose

Create a `docker-compose.prod.yml` for production deployments:

```yaml
version: '3.8'

services:
  verify-gateway:
    image: ghcr.io/hadijannat/zkdpp-verify-gateway:latest
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - NATS_URL=nats://nats:4222
      - KEYCLOAK_URL=http://keycloak:8080
      - KEYCLOAK_REALM=zkdpp
      - SIGNING_KEY_PRIVATE=${SIGNING_KEY_PRIVATE}
    depends_on:
      nats:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  dpp-builder:
    image: ghcr.io/hadijannat/zkdpp-dpp-builder:latest
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - PORT=3002
      - DATABASE_URL=postgresql://zkdpp:${DB_PASSWORD}@postgres:5432/zkdpp
      - NATS_URL=nats://nats:4222
      - KEYCLOAK_URL=http://keycloak:8080
      - KEYCLOAK_REALM=zkdpp
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  metering-billing:
    image: ghcr.io/hadijannat/zkdpp-metering-billing:latest
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - PORT=3003
      - DATABASE_URL=postgresql://zkdpp:${DB_PASSWORD}@postgres:5432/zkdpp
      - NATS_URL=nats://nats:4222
      - KEYCLOAK_URL=http://keycloak:8080
      - KEYCLOAK_REALM=zkdpp
      - BLOCKCHAIN_RPC_URL=${BLOCKCHAIN_RPC_URL}
      - BLOCKCHAIN_PRIVATE_KEY=${BLOCKCHAIN_PRIVATE_KEY}
      - BLOCKCHAIN_CHAIN_ID=${BLOCKCHAIN_CHAIN_ID}
      - CONTRACT_SETTLEMENT_ADDRESS=${CONTRACT_SETTLEMENT_ADDRESS}
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: zkdpp
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: zkdpp
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U zkdpp"]
      interval: 5s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M

  nats:
    image: nats:2.10-alpine
    command: ["-js", "-m", "8222", "--store_dir", "/data"]
    volumes:
      - nats_data:/data
    healthcheck:
      test: ["CMD", "nats-server", "-sl=jetstream=advisory"]
      interval: 5s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    command: start --optimized
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/zkdpp
      KC_DB_USERNAME: zkdpp
      KC_DB_PASSWORD: ${DB_PASSWORD}
      KC_HOSTNAME: ${KEYCLOAK_HOSTNAME}
      KC_PROXY: edge
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M

volumes:
  postgres_data:
  nats_data:

networks:
  default:
    name: zkdpp-network
```

## Building Images

### Build All Services

```bash
# Build production images
docker build -t zkdpp-verify-gateway:latest -f services/verify-gateway/Dockerfile .
docker build -t zkdpp-dpp-builder:latest -f services/dpp-builder/Dockerfile .
docker build -t zkdpp-metering-billing:latest -f services/metering-billing/Dockerfile .
```

### Example Dockerfile (services/verify-gateway/Dockerfile)

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY services/verify-gateway/ ./services/verify-gateway/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @zkdpp/verify-gateway build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/verify-gateway/package.json ./services/verify-gateway/
COPY --from=builder /app/services/verify-gateway/dist/ ./services/verify-gateway/dist/

RUN corepack enable && pnpm install --frozen-lockfile --prod

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3001

CMD ["node", "services/verify-gateway/dist/index.js"]
```

## Environment Variables

Create a `.env` file for production secrets:

```bash
# Database
DB_PASSWORD=your-secure-password-here

# Keycloak
KEYCLOAK_HOSTNAME=auth.yourdomain.com

# Blockchain (optional)
BLOCKCHAIN_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
BLOCKCHAIN_PRIVATE_KEY=0x...
BLOCKCHAIN_CHAIN_ID=84532
CONTRACT_SETTLEMENT_ADDRESS=0x...

# Gateway signing key
SIGNING_KEY_PRIVATE=your-ed25519-private-key
```

## Health Checks

All services expose health endpoints:

```bash
# Check verify-gateway
curl http://localhost:3001/health

# Check dpp-builder
curl http://localhost:3002/health

# Check metering-billing
curl http://localhost:3003/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "0.1.0",
  "services": {
    "database": true,
    "nats": true
  }
}
```

## Monitoring

### Prometheus Metrics

Each service exposes metrics at `/metrics`:

```bash
curl http://localhost:3001/metrics
```

### NATS Monitoring

Access the NATS monitoring dashboard at `http://localhost:8222`:

```bash
# View JetStream info
curl http://localhost:8222/jsz
```

## Scaling

Services can be scaled horizontally:

```bash
docker compose -f docker-compose.prod.yml up -d --scale verify-gateway=3
```

Use a load balancer (nginx, Traefik, or cloud LB) in front of scaled services.

## Backup and Restore

### PostgreSQL Backup

```bash
# Backup
docker exec zkdpp-postgres pg_dump -U zkdpp zkdpp > backup.sql

# Restore
cat backup.sql | docker exec -i zkdpp-postgres psql -U zkdpp zkdpp
```

### NATS JetStream Backup

```bash
# Backup streams
docker exec zkdpp-nats nats stream backup -a streams_backup/
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs zkdpp-verify-gateway

# Check resource usage
docker stats
```

### Database connection issues

```bash
# Test connection
docker exec zkdpp-postgres psql -U zkdpp -c "SELECT 1"

# Check network
docker network inspect zkdpp-network
```

### NATS connection issues

```bash
# Check NATS health
curl http://localhost:8222/healthz

# View connections
curl http://localhost:8222/connz
```

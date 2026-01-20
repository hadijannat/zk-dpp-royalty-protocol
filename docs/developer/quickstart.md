# Quickstart Guide

Get the ZK-DPP Royalty Protocol running locally in 5 minutes.

## Prerequisites

- **Node.js** 20+ and **pnpm** 8+
- **Docker** and **Docker Compose**
- **Rust** (latest stable) with `cargo`
- **Noir** (`nargo`) for ZK circuits

## 1. Clone and Install

```bash
git clone https://github.com/hadijannat/zk-dpp-royalty-protocol.git
cd zk-dpp-royalty-protocol

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## 2. Start Infrastructure

```bash
# Start PostgreSQL, NATS, and Keycloak
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Verify services are healthy
docker compose -f infra/docker/docker-compose.dev.yml ps
```

## 3. Start Services

In three separate terminals (or use a process manager):

```bash
# Terminal 1: Verify Gateway (port 3001)
pnpm --filter @zkdpp/verify-gateway dev

# Terminal 2: DPP Builder (port 3002)
pnpm --filter @zkdpp/dpp-builder dev

# Terminal 3: Metering & Billing (port 3003)
pnpm --filter @zkdpp/metering-billing dev
```

## 4. Verify Installation

```bash
# Check all services are healthy
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health

# View available predicates
curl http://localhost:3001/predicates | jq
```

## 5. Quick Test: Create and Verify

```bash
# Create a product
curl -X POST http://localhost:3002/products \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "BAT-001",
    "name": "EV Battery Pack",
    "description": "100kWh lithium-ion battery pack"
  }'

# View the public DPP (no predicates verified yet)
curl http://localhost:3002/dpp/BAT-001/view/public | jq
```

## Interactive API Docs

Each service exposes Swagger UI for interactive exploration:

- **Verify Gateway**: http://localhost:3001/docs
- **DPP Builder**: http://localhost:3002/docs
- **Metering & Billing**: http://localhost:3003/docs

## What's Next?

- **[Local Setup Guide](./local-setup.md)** - Complete development environment
- **[Architecture Overview](./architecture.md)** - System design deep dive
- **[Core Concepts](./concepts.md)** - DPP, predicates, commitments
- **[Testing Guide](./testing.md)** - Running tests

## Troubleshooting

### Port Conflicts

If ports 3001-3003 are in use:

```bash
# Check what's using the port
lsof -i :3001

# Kill the process or change ports in .env
```

### Database Connection Failed

```bash
# Ensure PostgreSQL is running
docker compose -f infra/docker/docker-compose.dev.yml logs postgres

# Reset the database if needed
docker compose -f infra/docker/docker-compose.dev.yml down -v
docker compose -f infra/docker/docker-compose.dev.yml up -d
```

### NATS Connection Issues

```bash
# Check NATS logs
docker compose -f infra/docker/docker-compose.dev.yml logs nats

# Verify JetStream is enabled
curl http://localhost:8222/jsz
```

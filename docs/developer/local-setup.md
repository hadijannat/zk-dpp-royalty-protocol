# Local Development Setup

Complete guide for setting up a full ZK-DPP development environment.

## Prerequisites

### Required Software

| Software | Minimum Version | Installation |
|----------|----------------|--------------|
| Node.js | 20.x | [nodejs.org](https://nodejs.org/) |
| pnpm | 8.x | `npm install -g pnpm` |
| Rust | stable (1.75+) | [rustup.rs](https://rustup.rs/) |
| Docker | 24.x | [docker.com](https://www.docker.com/) |
| Docker Compose | 2.x | Included with Docker Desktop |

### Optional (for full development)

| Software | Purpose | Installation |
|----------|---------|--------------|
| Noir (nargo) | ZK circuit development | [noir-lang.org](https://noir-lang.org/) |
| Ollama | Local AI inference | [ollama.ai](https://ollama.ai/) |
| Foundry | Smart contract development | [getfoundry.sh](https://getfoundry.sh/) |

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/hadijannat/zk-dpp-royalty-protocol.git
cd zk-dpp-royalty-protocol
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
pnpm install

# Build Rust crates
cargo build --release

# Build TypeScript packages
pnpm build
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your local settings:

```bash
# Database
DATABASE_URL=postgresql://zkdpp:zkdpp_dev@localhost:5432/zkdpp

# NATS
NATS_URL=nats://localhost:4222

# Keycloak (optional for local dev)
KEYCLOAK_ENABLED=false
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=zkdpp
KEYCLOAK_CLIENT_ID=zkdpp-api

# Service Ports
VERIFY_GATEWAY_PORT=3001
DPP_BUILDER_PORT=3002
METERING_BILLING_PORT=3003

# Blockchain (optional)
BLOCKCHAIN_ENABLED=false
BLOCKCHAIN_RPC_URL=
BLOCKCHAIN_CHAIN_ID=84532
```

### 4. Start Infrastructure

```bash
# Start all infrastructure services
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Verify services are running
docker compose -f infra/docker/docker-compose.dev.yml ps
```

Expected output:
```
NAME                    STATUS          PORTS
zkdpp-postgres         running         5432->5432/tcp
zkdpp-nats             running         4222->4222/tcp, 8222->8222/tcp
zkdpp-keycloak         running         8080->8080/tcp
```

### 5. Initialize Database

The database schema is automatically created by the init scripts. To manually reset:

```bash
# Drop and recreate database
docker compose -f infra/docker/docker-compose.dev.yml down -v
docker compose -f infra/docker/docker-compose.dev.yml up -d
```

## Running Services

### Option A: Individual Terminals

```bash
# Terminal 1: Verify Gateway
pnpm --filter @zkdpp/verify-gateway dev

# Terminal 2: DPP Builder
pnpm --filter @zkdpp/dpp-builder dev

# Terminal 3: Metering & Billing
pnpm --filter @zkdpp/metering-billing dev
```

### Option B: Using Script

```bash
./scripts/dev.sh
```

### Option C: VS Code Tasks

If using VS Code, use the provided tasks:

1. Open Command Palette (`Cmd+Shift+P`)
2. Select "Tasks: Run Task"
3. Choose "Start All Services"

## Verifying Setup

### Health Checks

```bash
# All services should return {"status": "healthy"}
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### NATS Verification

```bash
# Check JetStream status
curl http://localhost:8222/jsz

# View streams
curl http://localhost:8222/jsz?streams=true
```

### Database Verification

```bash
# Connect to PostgreSQL
docker exec -it zkdpp-postgres psql -U zkdpp -d zkdpp

# List tables
\dt dpp.*
\dt metering.*
```

## Development Workflow

### Making Changes

1. **Edit source files** in `services/*/src/` or `packages/*/src/`
2. **Services auto-reload** when running in dev mode
3. **Run tests** after changes: `pnpm test`

### Package Development

When modifying shared packages:

```bash
# Rebuild the specific package
pnpm --filter @zkdpp/schemas build

# Or rebuild all packages
pnpm build
```

### Circuit Development

If modifying Noir circuits:

```bash
# Navigate to circuit directory
cd circuits/noir/predicates/recycled_content_gte_v1

# Compile circuit
nargo compile

# Run tests
nargo test

# Generate proving/verification keys
nargo prove
nargo verify
```

## IDE Setup

### VS Code (Recommended)

Install these extensions:

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **rust-analyzer** - Rust language support
- **Noir Language Support** - Circuit development
- **Docker** - Container management

Recommended settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  }
}
```

### IntelliJ IDEA / WebStorm

1. Open project root
2. Trust the project
3. Install "Rust" plugin for Rust support
4. Configure Node.js interpreter (Node 20+)

## Edge Agent Development

The Edge Agent requires additional setup:

### Prerequisites

```bash
# Install Tauri CLI
cargo install tauri-cli

# Install Ollama (for AI extraction)
curl https://ollama.ai/install.sh | sh

# Pull required model
ollama pull phi3
```

### Running Edge Agent

```bash
cd apps/edge-agent

# Development mode (hot reload)
cargo tauri dev

# Build for production
cargo tauri build
```

## Smart Contract Development

If working with blockchain integration:

### Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Contract Development

```bash
cd contracts

# Compile contracts
forge build

# Run tests
forge test -vvv

# Deploy to testnet
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

## Common Issues

### "Module not found" errors

```bash
# Rebuild all packages
pnpm build

# Clear node_modules and reinstall
rm -rf node_modules
pnpm install
```

### Database connection refused

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View logs
docker logs zkdpp-postgres
```

### Port already in use

```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or change port in .env
```

### NATS connection timeout

```bash
# Restart NATS
docker compose -f infra/docker/docker-compose.dev.yml restart nats

# Check logs
docker logs zkdpp-nats
```

## Next Steps

- [Testing Guide](./testing.md) - Running and writing tests
- [Architecture Overview](./architecture.md) - System design
- [API Documentation](http://localhost:3001/docs) - Interactive API docs

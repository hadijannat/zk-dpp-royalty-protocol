#!/bin/bash
# Development runner script for ZK-DPP services

set -e

echo "=== ZK-DPP Development Environment ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Start infrastructure if not running
echo -e "${YELLOW}Checking infrastructure...${NC}"
if ! docker-compose -f infra/docker/docker-compose.dev.yml ps | grep -q "Up"; then
    echo "Starting infrastructure (PostgreSQL, NATS, Keycloak)..."
    docker-compose -f infra/docker/docker-compose.dev.yml up -d
    echo "Waiting for services to be ready..."
    sleep 5
fi

echo -e "${GREEN}Infrastructure running${NC}"
echo ""

# Check if PostgreSQL is ready
echo "Waiting for PostgreSQL..."
until docker exec zkdpp-postgres pg_isready -U zkdpp > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}PostgreSQL ready${NC}"

# Check if NATS is ready
echo "Waiting for NATS..."
until docker exec zkdpp-nats nats-server --version > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}NATS ready${NC}"

echo ""
echo "=== Starting Services ==="
echo ""

# Function to run service in background
run_service() {
    local service=$1
    local port=$2
    echo "Starting $service on port $port..."
    if [ "$service" = "verify-gateway" ]; then
        ZK_BACKEND="${ZK_BACKEND:-mock}" \
        ALLOW_MOCK_PROOFS="${ALLOW_MOCK_PROOFS:-true}" \
        ALLOW_EPHEMERAL_KEYS="${ALLOW_EPHEMERAL_KEYS:-true}" \
        pnpm --filter "@zkdpp/$service" dev &
    else
        pnpm --filter "@zkdpp/$service" dev &
    fi
}

# Start services
run_service "verify-gateway" 3001
run_service "dpp-builder" 3002
run_service "metering-billing" 3003

echo ""
echo -e "${GREEN}All services starting...${NC}"
echo ""
echo "Service URLs:"
echo "  - Verify Gateway:    http://localhost:3001"
echo "  - DPP Builder:       http://localhost:3002"
echo "  - Metering Billing:  http://localhost:3003"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for all background processes
wait

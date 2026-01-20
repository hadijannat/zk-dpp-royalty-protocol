# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

# Copy workspace config files first (better caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files for all workspaces
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY packages/predicate-lib/package.json ./packages/predicate-lib/
COPY packages/shared/package.json ./packages/shared/
COPY packages/contracts/package.json ./packages/contracts/
COPY services/metering-billing/package.json ./services/metering-billing/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/schemas/ ./packages/schemas/
COPY packages/event-bus/ ./packages/event-bus/
COPY packages/predicate-lib/ ./packages/predicate-lib/
COPY packages/shared/ ./packages/shared/
COPY packages/contracts/ ./packages/contracts/
COPY services/metering-billing/ ./services/metering-billing/

# Build packages in dependency order
RUN pnpm --filter @zkdpp/schemas build
RUN pnpm --filter @zkdpp/event-bus build
RUN pnpm --filter @zkdpp/predicate-lib build
RUN pnpm --filter @zkdpp/shared build
RUN pnpm --filter @zkdpp/contracts build
RUN pnpm --filter @zkdpp/metering-billing build

# Production stage
FROM node:20-alpine AS runner

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

# Copy workspace config
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./

# Copy built packages
COPY --from=builder --chown=nodejs:nodejs /app/packages/schemas/package.json ./packages/schemas/
COPY --from=builder --chown=nodejs:nodejs /app/packages/schemas/dist/ ./packages/schemas/dist/

COPY --from=builder --chown=nodejs:nodejs /app/packages/event-bus/package.json ./packages/event-bus/
COPY --from=builder --chown=nodejs:nodejs /app/packages/event-bus/dist/ ./packages/event-bus/dist/

COPY --from=builder --chown=nodejs:nodejs /app/packages/predicate-lib/package.json ./packages/predicate-lib/
COPY --from=builder --chown=nodejs:nodejs /app/packages/predicate-lib/dist/ ./packages/predicate-lib/dist/
COPY --from=builder --chown=nodejs:nodejs /app/packages/predicate-lib/predicates.json ./packages/predicate-lib/

COPY --from=builder --chown=nodejs:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared/dist/ ./packages/shared/dist/

COPY --from=builder --chown=nodejs:nodejs /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder --chown=nodejs:nodejs /app/packages/contracts/dist/ ./packages/contracts/dist/

COPY --from=builder --chown=nodejs:nodejs /app/services/metering-billing/package.json ./services/metering-billing/
COPY --from=builder --chown=nodejs:nodejs /app/services/metering-billing/dist/ ./services/metering-billing/dist/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3003

ENV NODE_ENV=production
ENV PORT=3003

WORKDIR /app/services/metering-billing

CMD ["node", "dist/index.js"]

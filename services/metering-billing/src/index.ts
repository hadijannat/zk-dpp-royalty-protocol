import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { EventBus, EVENTS } from '@zkdpp/event-bus';
import type { VerificationEvent } from '@zkdpp/schemas';
import { canonicalId } from '@zkdpp/predicate-lib';
import {
  createLogger,
  createAuthPreHandler,
  getKeycloakConfig,
  registerRateLimit,
  initMetrics,
  getMetrics,
  getContentType,
  generateCorrelationId,
} from '@zkdpp/shared';
import { Database } from './db/index.js';
import { registerUsageRoutes } from './routes/usage.js';
import { registerSettlementRoutes } from './routes/settlements.js';
import { registerBlockchainRoutes } from './routes/blockchain.js';
import type { ServiceConfig, BlockchainConfig } from './types.js';

const SERVICE_NAME = 'metering-billing';
const logger = createLogger({ name: SERVICE_NAME });

// Initialize metrics
initMetrics(SERVICE_NAME);

/**
 * Load configuration from environment variables
 */
function loadConfig(): ServiceConfig {
  const config: ServiceConfig = {
    port: parseInt(process.env.PORT || '3003', 10),
    host: process.env.HOST || '0.0.0.0',
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://zkdpp:zkdpp_dev_password@localhost:5433/zkdpp',
  };

  // Load blockchain configuration if available
  if (
    process.env.BLOCKCHAIN_RPC_URL &&
    process.env.BLOCKCHAIN_PRIVATE_KEY &&
    process.env.CONTRACT_SETTLEMENT_ADDRESS
  ) {
    config.blockchain = {
      rpcUrl: process.env.BLOCKCHAIN_RPC_URL,
      privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY,
      chainId: parseInt(process.env.BLOCKCHAIN_CHAIN_ID || '84532', 10), // Base Sepolia default
      contracts: {
        settlement: process.env.CONTRACT_SETTLEMENT_ADDRESS,
        escrow: process.env.CONTRACT_ESCROW_ADDRESS || '',
        distributor: process.env.CONTRACT_DISTRIBUTOR_ADDRESS || '',
        usdc: process.env.CONTRACT_USDC_ADDRESS || '',
      },
    };
    logger.info('Blockchain configuration loaded');
  } else {
    logger.info('Blockchain configuration not found - blockchain features disabled');
  }

  return config;
}

/**
 * Create and configure the Fastify server
 */
async function createServer(config: ServiceConfig) {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
  });

  // Security: Register Helmet for security headers
  await app.register(helmet, {
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

  // Register CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  });

  // Register Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ZK-DPP Metering & Billing API',
        description: 'Usage tracking, settlement management, and blockchain integration for data royalties',
        version: '0.1.0',
      },
      servers: [{ url: `http://${config.host}:${config.port}` }],
      tags: [
        { name: 'Health', description: 'Service health endpoints' },
        { name: 'Usage', description: 'Verification usage tracking' },
        { name: 'Settlements', description: 'Settlement statement management' },
        { name: 'Blockchain', description: 'On-chain settlement operations' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Register rate limiting (stricter for settlement endpoints)
  await registerRateLimit(app, {
    max: 100,
    timeWindow: 60000,
  });

  // Add correlation ID to all requests
  app.addHook('onRequest', async (request, _reply) => {
    const correlationId =
      (request.headers['x-correlation-id'] as string) || generateCorrelationId();
    request.headers['x-correlation-id'] = correlationId;
  });

  // Auth required for all metering endpoints
  const authConfig = getKeycloakConfig();
  const authHandler = createAuthPreHandler(authConfig);

  // Decorate app to allow routes to skip auth for health checks
  app.decorate('authenticate', authHandler);

  // Metrics endpoint (no auth required)
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', getContentType());
    return getMetrics();
  });

  // Initialize database
  const db = new Database(config.databaseUrl);
  await db.connect();
  logger.info('Database connected');

  // Initialize event bus and subscribe to verification events
  let eventBus: EventBus | null = null;
  try {
    eventBus = new EventBus({
      servers: [config.natsUrl],
      name: 'metering-billing',
    });
    await eventBus.connect();
    await eventBus.ensureStreams();
    logger.info('Connected to NATS');

    // Subscribe to verification events for automatic metering
    await eventBus.subscribeToSubject<VerificationEvent>(
      EVENTS.VERIFICATION.PROOF_VERIFIED,
      async (event: VerificationEvent) => {
        logger.info({
          eventId: event.eventId,
          predicateId: `${event.payload.predicateId.name}@${event.payload.predicateId.version}`,
        }, 'Received verification event');

        try {
          // Extract supplier ID from event payload
          const supplierId = event.payload.supplierId;

          await db.recordUsage({
            eventId: event.eventId,
            supplierId,
            brandId: event.payload.requesterId,
            predicateId: canonicalId(event.payload.predicateId),
            receiptId: event.payload.receiptId,
            verifiedAt: event.timestamp,
          });

          logger.info({ eventId: event.eventId }, 'Usage recorded from event');
        } catch (error) {
          logger.error({ error, eventId: event.eventId }, 'Failed to record usage from event');
        }
      },
      { durable: 'metering-consumer' }
    );

    logger.info('Subscribed to verification events');
  } catch (error) {
    logger.warn({ error }, 'Failed to connect to NATS - metering will work via API only');
  }

  // Register health routes
  app.get('/health', async () => {
    const dbHealthy = await db.healthCheck();
    const natsConnected = eventBus?.isConnected() ?? false;

    return {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      services: {
        database: dbHealthy,
        nats: natsConnected,
      },
    };
  });

  app.get('/ready', async (request, reply) => {
    const dbHealthy = await db.healthCheck();
    if (dbHealthy) {
      return { ready: true };
    }
    reply.code(503);
    return { ready: false };
  });

  app.get('/live', async () => {
    return { alive: true };
  });

  // Register routes
  registerUsageRoutes(app, db);
  registerSettlementRoutes(app, db);
  registerBlockchainRoutes(app, db, config.blockchain);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    if (eventBus) {
      await eventBus.disconnect();
    }
    await db.disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return app;
}

/**
 * Main entry point
 */
async function main() {
  const config = loadConfig();

  logger.info({
    config: {
      ...config,
      databaseUrl: config.databaseUrl.replace(/:[^:@]+@/, ':****@'),
    },
  }, 'Starting metering-billing');

  const app = await createServer(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Server listening on http://${config.host}:${config.port}`);
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.fatal({ error }, 'Unhandled error');
  process.exit(1);
});

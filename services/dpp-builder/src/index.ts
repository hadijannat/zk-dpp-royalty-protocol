import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import pino from 'pino';
import { EventBus, EVENTS } from '@zkdpp/event-bus';
import type { VerificationEvent } from '@zkdpp/schemas';
import { canonicalId } from '@zkdpp/predicate-lib';
import { Database } from './db/index.js';
import { ViewComposer } from './services/view-composer.js';
import { registerProductRoutes } from './routes/products.js';
import { registerDPPRoutes } from './routes/dpp.js';
import type { ServiceConfig } from './types.js';

const logger = pino({
  name: 'dpp-builder',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Load configuration from environment variables
 */
function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT || '3002', 10),
    host: process.env.HOST || '0.0.0.0',
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://zkdpp:zkdpp_dev_password@localhost:5433/zkdpp',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  };
}

/**
 * Create and configure the Fastify server
 */
async function createServer(config: ServiceConfig) {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
  });

  // Register CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // Register JWT auth
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // Initialize database
  const db = new Database(config.databaseUrl);
  await db.connect();
  logger.info('Database connected');

  // Initialize view composer
  const viewComposer = new ViewComposer(db);

  // Initialize event bus (optional)
  let eventBus: EventBus | null = null;
  try {
    eventBus = new EventBus({
      servers: [config.natsUrl],
      name: 'dpp-builder',
    });
    await eventBus.connect();
    await eventBus.ensureStreams();
    logger.info('Connected to NATS');

    // Subscribe to verification events
    await eventBus.subscribeToSubject<VerificationEvent>(
      EVENTS.VERIFICATION.PROOF_VERIFIED,
      async (event: VerificationEvent) => {
        logger.info({
          eventId: event.eventId,
          predicateId: `${event.payload.predicateId.name}@${event.payload.predicateId.version}`,
        }, 'Received verification event');

        if (!event.payload.productBinding) {
          logger.warn({ eventId: event.eventId }, 'Verification event missing product binding');
          return;
        }

        const product = await db.getProductByBinding(event.payload.productBinding);
        if (!product) {
          logger.warn({ eventId: event.eventId }, 'No product matched product binding');
          return;
        }

        await db.recordVerification(product.id, {
          predicateId: canonicalId(event.payload.predicateId),
          receiptId: event.payload.receiptId,
          result: event.payload.result,
          supplierId: event.payload.supplierId,
        });
      },
      { durable: 'dpp-builder-consumer' }
    );
  } catch (error) {
    logger.warn({ error }, 'Failed to connect to NATS - running without event bus');
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
  registerProductRoutes(app, db);
  registerDPPRoutes(app, viewComposer);

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
      jwtSecret: '[REDACTED]',
      databaseUrl: config.databaseUrl.replace(/:[^:@]+@/, ':****@'),
    },
  }, 'Starting dpp-builder');

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

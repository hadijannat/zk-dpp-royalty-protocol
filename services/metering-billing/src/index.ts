import Fastify from 'fastify';
import cors from '@fastify/cors';
import pino from 'pino';
import { EventBus, EVENTS } from '@zkdpp/event-bus';
import type { VerificationEvent } from '@zkdpp/schemas';
import { Database } from './db/index.js';
import { registerUsageRoutes } from './routes/usage.js';
import { registerSettlementRoutes } from './routes/settlements.js';
import type { ServiceConfig } from './types.js';

const logger = pino({
  name: 'metering-billing',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Load configuration from environment variables
 */
function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT || '3003', 10),
    host: process.env.HOST || '0.0.0.0',
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://zkdpp:zkdpp_dev_password@localhost:5433/zkdpp',
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
    methods: ['GET', 'POST'],
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
            predicateId: `${event.payload.predicateId.name}@${event.payload.predicateId.version}`,
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

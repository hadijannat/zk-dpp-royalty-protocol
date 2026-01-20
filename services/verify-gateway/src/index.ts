import Fastify from 'fastify';
import cors from '@fastify/cors';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { EventBus, EVENTS } from '@zkdpp/event-bus';
import type { VerificationEvent } from '@zkdpp/schemas';
import { Verifier } from './services/verifier.js';
import { nonceStore } from './services/nonce-store.js';
import { registerVerifyRoutes } from './routes/verify.js';
import { registerPredicateRoutes } from './routes/predicates.js';
import { registerHealthRoutes } from './routes/health.js';
import type { ServiceConfig } from './types.js';

const logger = pino({
  name: 'verify-gateway',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Load configuration from environment variables
 */
function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    signingKeyId: process.env.SIGNING_KEY_ID || 'gateway-key-001',
    signingKeyPrivate: process.env.SIGNING_KEY_PRIVATE || '',
    nonceWindowMs: parseInt(process.env.NONCE_WINDOW_MS || '300000', 10), // 5 minutes
  };
}

/**
 * Create and configure the Fastify server
 */
async function createServer(config: ServiceConfig) {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Register CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  });

  // Initialize event bus (optional - service works without it)
  let eventBus: EventBus | null = null;
  try {
    eventBus = new EventBus({
      servers: [config.natsUrl],
      name: 'verify-gateway',
    });
    await eventBus.connect();
    await eventBus.ensureStreams();
    logger.info('Connected to NATS');
  } catch (error) {
    logger.warn({ error }, 'Failed to connect to NATS - running without event bus');
  }

  // Initialize verifier
  const gatewayId = `gateway-${uuidv4().slice(0, 8)}`;
  const verifier = new Verifier({
    signingKeyId: config.signingKeyId,
    signingKeyPrivate: config.signingKeyPrivate,
    gatewayId,
  });
  await verifier.init();
  logger.info('Verifier initialized');

  // Start nonce cleanup
  nonceStore.startCleanup();

  // Register routes
  registerHealthRoutes(app, eventBus);
  registerPredicateRoutes(app);
  registerVerifyRoutes(app, verifier);

  // Hook to publish verification events
  if (eventBus) {
    app.addHook('onResponse', async (request, reply) => {
      // Only publish for successful verifications
      if (
        request.url === '/verify' &&
        request.method === 'POST' &&
        reply.statusCode === 200
      ) {
        try {
          const body = request.body as {
            proofPackage?: {
              predicateId?: { name: string; version: string };
              publicInputs?: { commitmentRoot?: string };
            }
          };
          if (body?.proofPackage?.predicateId) {
            const eventId = uuidv4();
            const event: VerificationEvent = {
              eventId,
              eventType: 'proofs.verified',
              timestamp: new Date().toISOString(),
              payload: {
                receiptId: eventId,
                predicateId: body.proofPackage.predicateId,
                supplierId: 'unknown', // Would come from request context
                requesterId: 'unknown', // Would come from request context
                result: true,
                commitmentRoot: body.proofPackage.publicInputs?.commitmentRoot,
              },
              metadata: {
                gatewayId,
              },
            };

            await eventBus.publish(EVENTS.VERIFICATION.PROOF_VERIFIED, event);
            logger.debug({ eventId }, 'Published verification event');
          }
        } catch (error) {
          logger.error({ error }, 'Failed to publish verification event');
        }
      }
    });
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    nonceStore.stopCleanup();
    if (eventBus) {
      await eventBus.disconnect();
    }
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

  logger.info({ config: { ...config, signingKeyPrivate: '[REDACTED]' } }, 'Starting verify-gateway');

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

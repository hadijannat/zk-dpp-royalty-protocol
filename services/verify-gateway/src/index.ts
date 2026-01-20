import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '@zkdpp/event-bus';
import { execFileSync } from 'child_process';
import {
  createLogger,
  createOptionalAuthPreHandler,
  getKeycloakConfig,
  registerRateLimit,
  initMetrics,
  getMetrics,
  getContentType,
  runWithContextAsync,
  generateCorrelationId,
  type RequestContext,
} from '@zkdpp/shared';
import { Verifier } from './services/verifier.js';
import { nonceStore } from './services/nonce-store.js';
import { registerVerifyRoutes } from './routes/verify.js';
import { registerPredicateRoutes } from './routes/predicates.js';
import { registerHealthRoutes } from './routes/health.js';
import type { ServiceConfig } from './types.js';

const SERVICE_NAME = 'verify-gateway';
const logger = createLogger({ name: SERVICE_NAME });

// Initialize metrics
initMetrics(SERVICE_NAME);

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
    zkBackend: (process.env.ZK_BACKEND as 'noir-cli' | 'mock') || 'noir-cli',
    nargoBin: process.env.NARGO_BIN || 'nargo',
    noirCircuitsDir: process.env.NOIR_CIRCUITS_DIR,
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
        title: 'ZK-DPP Verify Gateway API',
        description: 'Zero-Knowledge proof verification service for Digital Product Passports',
        version: '0.1.0',
      },
      servers: [{ url: `http://${config.host}:${config.port}` }],
      tags: [
        { name: 'Health', description: 'Service health endpoints' },
        { name: 'Predicates', description: 'ZK predicate discovery' },
        { name: 'Verification', description: 'Proof verification' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Register rate limiting
  await registerRateLimit(app, {
    max: 100,
    timeWindow: 60000,
  });

  // Add correlation ID and context to all requests
  app.addHook('onRequest', async (request, _reply) => {
    const correlationId =
      (request.headers['x-correlation-id'] as string) || generateCorrelationId();
    request.headers['x-correlation-id'] = correlationId;
  });

  // Optional auth (verify endpoint may work without auth)
  const authConfig = getKeycloakConfig();
  const optionalAuth = createOptionalAuthPreHandler(authConfig);
  app.addHook('preHandler', optionalAuth);

  // Metrics endpoint
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', getContentType());
    return getMetrics();
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

  // Verify Noir toolchain availability if configured
  if (config.zkBackend === 'noir-cli') {
    try {
      execFileSync(config.nargoBin, ['--version'], { stdio: 'pipe' });
    } catch (error) {
      if (process.env.ALLOW_MOCK_PROOFS === 'true') {
        logger.warn({ error }, 'Noir CLI not available, falling back to mock verifier');
        config.zkBackend = 'mock';
      } else {
        throw new Error('Noir CLI not available. Set NARGO_BIN or enable ALLOW_MOCK_PROOFS.');
      }
    }
  }

  // Initialize verifier
  const gatewayId = `gateway-${uuidv4().slice(0, 8)}`;
  const verifier = new Verifier({
    signingKeyId: config.signingKeyId,
    signingKeyPrivate: config.signingKeyPrivate,
    gatewayId,
    zkBackend: config.zkBackend,
    nargoBin: config.nargoBin,
    noirCircuitsDir: config.noirCircuitsDir,
    nonceWindowMs: config.nonceWindowMs,
  });
  await verifier.init();
  logger.info('Verifier initialized');

  // Start nonce cleanup
  nonceStore.setWindowMs(config.nonceWindowMs);
  nonceStore.startCleanup();

  // Register routes
  registerHealthRoutes(app, eventBus);
  registerPredicateRoutes(app);
  registerVerifyRoutes(app, verifier, eventBus);

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

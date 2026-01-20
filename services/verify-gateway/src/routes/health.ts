import type { FastifyInstance } from 'fastify';
import type { EventBus } from '@zkdpp/event-bus';
import type { HealthResponse } from '../types.js';

const VERSION = '0.1.0';

export function registerHealthRoutes(
  app: FastifyInstance,
  eventBus: EventBus | null
): void {
  /**
   * GET /health
   *
   * Health check endpoint for orchestration and monitoring.
   */
  app.get<{ Reply: HealthResponse }>(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  nats: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (): Promise<HealthResponse> => {
      const natsConnected = eventBus?.isConnected() ?? false;

      const status = natsConnected ? 'healthy' : 'degraded';

      return {
        status,
        timestamp: new Date().toISOString(),
        version: VERSION,
        services: {
          nats: natsConnected,
        },
      };
    }
  );

  /**
   * GET /ready
   *
   * Readiness probe for Kubernetes.
   */
  app.get(
    '/ready',
    {
      schema: {
        response: {
          200: { type: 'object', properties: { ready: { type: 'boolean' } } },
          503: { type: 'object', properties: { ready: { type: 'boolean' } } },
        },
      },
    },
    async (request, reply) => {
      // Service is ready when NATS is connected
      const natsConnected = eventBus?.isConnected() ?? true; // OK if no event bus

      if (natsConnected) {
        return { ready: true };
      }

      reply.code(503);
      return { ready: false };
    }
  );

  /**
   * GET /live
   *
   * Liveness probe for Kubernetes.
   */
  app.get(
    '/live',
    {
      schema: {
        response: {
          200: { type: 'object', properties: { alive: { type: 'boolean' } } },
        },
      },
    },
    async () => {
      return { alive: true };
    }
  );
}

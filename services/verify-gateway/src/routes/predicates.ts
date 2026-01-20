import type { FastifyInstance } from 'fastify';
import { getAllPredicates, getPredicateById } from '@zkdpp/predicate-lib';
import type { PredicatesResponse, PredicateInfo } from '../types.js';

export function registerPredicateRoutes(app: FastifyInstance): void {
  /**
   * GET /predicates
   *
   * List all available predicates with their verification keys.
   */
  app.get<{ Reply: PredicatesResponse }>(
    '/predicates',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              predicates: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    version: { type: 'string' },
                    description: { type: 'string' },
                    accessGroups: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    pricing: {
                      type: 'object',
                      properties: {
                        perVerification: { type: 'number' },
                        currency: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (): Promise<PredicatesResponse> => {
      const allPredicates = getAllPredicates();

      const predicates: PredicateInfo[] = allPredicates.map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        accessGroups: p.accessGroups,
        pricing: {
          perVerification: p.pricing.perVerification,
          currency: p.pricing.currency,
        },
      }));

      return { predicates };
    }
  );

  /**
   * GET /predicates/:id
   *
   * Get details for a specific predicate.
   */
  app.get<{
    Params: { id: string };
    Reply: PredicateInfo | { error: string };
  }>(
    '/predicates/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply): Promise<PredicateInfo | { error: string }> => {
      const { id } = request.params;
      const predicate = getPredicateById(id);

      if (!predicate) {
        reply.code(404);
        return { error: `Predicate not found: ${id}` };
      }

      return {
        id: id,
        name: predicate.name,
        version: predicate.version,
        description: predicate.description,
        accessGroups: predicate.accessGroups,
        pricing: {
          perVerification: predicate.pricing.perVerification,
          currency: predicate.pricing.currency,
        },
      };
    }
  );
}

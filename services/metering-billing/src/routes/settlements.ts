import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/index.js';
import type {
  GenerateStatementRequest,
  GenerateStatementResponse,
  SettlementStatement,
} from '../types.js';

export function registerSettlementRoutes(app: FastifyInstance, db: Database): void {
  /**
   * POST /settlements
   *
   * Generate a new settlement statement
   */
  app.post<{ Body: GenerateStatementRequest; Reply: GenerateStatementResponse }>(
    '/settlements',
    {
      schema: {
        body: {
          type: 'object',
          required: ['supplierId', 'periodStart', 'periodEnd'],
          properties: {
            supplierId: { type: 'string' },
            periodStart: { type: 'string' },
            periodEnd: { type: 'string' },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<GenerateStatementResponse> => {
      try {
        const statement = await db.generateStatement(request.body);
        reply.code(201);
        return { success: true, statement };
      } catch (error) {
        request.log.error({ error }, 'Failed to generate statement');
        reply.code(500);
        return { success: false, error: 'Failed to generate statement' };
      }
    }
  );

  /**
   * GET /settlements/:id
   *
   * Get a specific settlement statement
   */
  app.get<{
    Params: { id: string };
    Reply: { statement: SettlementStatement } | { error: string };
  }>(
    '/settlements/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<{ statement: SettlementStatement } | { error: string }> => {
      const statement = await db.getStatement(request.params.id);

      if (!statement) {
        reply.code(404);
        return { error: 'Statement not found' };
      }

      return { statement };
    }
  );

  /**
   * GET /settlements/supplier/:supplierId
   *
   * List all statements for a supplier
   */
  app.get<{
    Params: { supplierId: string };
    Reply: { statements: SettlementStatement[] };
  }>(
    '/settlements/supplier/:supplierId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            supplierId: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request): Promise<{ statements: SettlementStatement[] }> => {
      const statements = await db.getStatementsBySupplier(request.params.supplierId);
      return { statements };
    }
  );

  /**
   * POST /settlements/:id/finalize
   *
   * Finalize a draft statement
   */
  app.post<{
    Params: { id: string };
    Reply: GenerateStatementResponse;
  }>(
    '/settlements/:id/finalize',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<GenerateStatementResponse> => {
      const statement = await db.finalizeStatement(request.params.id);

      if (!statement) {
        reply.code(404);
        return { success: false, error: 'Statement not found or already finalized' };
      }

      return { success: true, statement };
    }
  );
}

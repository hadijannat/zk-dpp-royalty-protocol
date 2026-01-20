import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/index.js';
import type {
  RecordUsageRequest,
  RecordUsageResponse,
  GetUsageSummaryResponse,
  GetAggregationsResponse,
  UsageSummary,
} from '../types.js';

export function registerUsageRoutes(app: FastifyInstance, db: Database): void {
  /**
   * POST /usage
   *
   * Record a verification usage event
   */
  app.post<{ Body: RecordUsageRequest; Reply: RecordUsageResponse }>(
    '/usage',
    {
      schema: {
        body: {
          type: 'object',
          required: ['eventId', 'supplierId', 'predicateId', 'receiptId', 'verifiedAt'],
          properties: {
            eventId: { type: 'string' },
            supplierId: { type: 'string' },
            brandId: { type: 'string' },
            predicateId: { type: 'string' },
            receiptId: { type: 'string' },
            verifiedAt: { type: 'string' },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<RecordUsageResponse> => {
      try {
        const usage = await db.recordUsage(request.body);
        reply.code(201);
        return { success: true, usage };
      } catch (error) {
        request.log.error({ error }, 'Failed to record usage');
        reply.code(500);
        return { success: false, error: 'Failed to record usage' };
      }
    }
  );

  /**
   * GET /usage/supplier/:supplierId
   *
   * Get usage summary for a supplier
   */
  app.get<{
    Params: { supplierId: string };
    Querystring: { startDate?: string; endDate?: string };
    Reply: GetUsageSummaryResponse;
  }>(
    '/usage/supplier/:supplierId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            supplierId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request): Promise<GetUsageSummaryResponse> => {
      const { supplierId } = request.params;
      const { startDate, endDate } = request.query;

      const usages = await db.getUsageBySupplier(supplierId, startDate, endDate);

      // Build summary
      const byPredicate = new Map<string, { predicate_id: string; count: number; amount: number }>();
      let totalAmount = 0;

      for (const usage of usages) {
        let pred = byPredicate.get(usage.predicate_id);
        if (!pred) {
          pred = { predicate_id: usage.predicate_id, count: 0, amount: 0 };
          byPredicate.set(usage.predicate_id, pred);
        }
        pred.count++;
        const price = parseFloat(String(usage.price_per_verification));
        pred.amount += price;
        totalAmount += price;
      }

      const summary: UsageSummary = {
        supplier_id: supplierId,
        period: startDate && endDate ? `${startDate} to ${endDate}` : 'all time',
        total_verifications: usages.length,
        total_amount: totalAmount,
        currency: usages[0]?.currency || 'EUR',
        by_predicate: Array.from(byPredicate.values()),
      };

      return { success: true, summary };
    }
  );

  /**
   * GET /usage/aggregations/:supplierId
   *
   * Get monthly aggregations for a supplier
   */
  app.get<{
    Params: { supplierId: string };
    Querystring: { startMonth?: string; endMonth?: string };
    Reply: GetAggregationsResponse;
  }>(
    '/usage/aggregations/:supplierId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            supplierId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            startMonth: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
            endMonth: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request): Promise<GetAggregationsResponse> => {
      const { supplierId } = request.params;
      const { startMonth, endMonth } = request.query;

      const aggregations = await db.getMonthlyAggregations(supplierId, startMonth, endMonth);

      return { success: true, aggregations };
    }
  );
}

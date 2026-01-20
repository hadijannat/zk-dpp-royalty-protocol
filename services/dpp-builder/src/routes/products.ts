import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/index.js';
import type {
  CreateProductRequest,
  CreateProductResponse,
  LinkSupplierRequest,
  LinkSupplierResponse,
  RecordVerificationRequest,
  RecordVerificationResponse,
  Product,
} from '../types.js';

export function registerProductRoutes(app: FastifyInstance, db: Database): void {
  /**
   * POST /products
   *
   * Create a new product
   */
  app.post<{ Body: CreateProductRequest; Reply: CreateProductResponse }>(
    '/products',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sku', 'name', 'category'],
          properties: {
            sku: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              product: { type: 'object', additionalProperties: true },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: CreateProductRequest }>,
      reply: FastifyReply
    ): Promise<CreateProductResponse> => {
      try {
        // Check for existing SKU
        const existing = await db.getProductBySku(request.body.sku);
        if (existing) {
          reply.code(400);
          return { success: false, error: 'SKU already exists' };
        }

        const product = await db.createProduct(request.body);
        reply.code(201);
        return { success: true, product };
      } catch (error) {
        request.log.error({ error }, 'Failed to create product');
        reply.code(500);
        return { success: false, error: 'Failed to create product' };
      }
    }
  );

  /**
   * GET /products
   *
   * List all products
   */
  app.get<{
    Querystring: { limit?: number; offset?: number };
    Reply: { products: Product[] };
  }>(
    '/products',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 100 },
            offset: { type: 'integer', default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              products: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    async (request): Promise<{ products: Product[] }> => {
      const { limit = 100, offset = 0 } = request.query;
      const products = await db.listProducts(limit, offset);
      return { products };
    }
  );

  /**
   * GET /products/:id
   *
   * Get a product by ID
   */
  app.get<{
    Params: { id: string };
    Reply: { product: Product } | { error: string };
  }>(
    '/products/:id',
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
    async (request, reply): Promise<{ product: Product } | { error: string }> => {
      const product = await db.getProduct(request.params.id);
      if (!product) {
        reply.code(404);
        return { error: 'Product not found' };
      }
      return { product };
    }
  );

  /**
   * POST /products/:id/link-supplier
   *
   * Link a supplier to a product
   */
  app.post<{
    Params: { id: string };
    Body: LinkSupplierRequest;
    Reply: LinkSupplierResponse;
  }>(
    '/products/:id/link-supplier',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['supplierId', 'commitmentRoot', 'supplierPublicKey'],
          properties: {
            supplierId: { type: 'string' },
            commitmentRoot: { type: 'string' },
            supplierPublicKey: { type: 'string' },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<LinkSupplierResponse> => {
      const product = await db.getProduct(request.params.id);
      if (!product) {
        reply.code(404);
        return { success: false, error: 'Product not found' };
      }

      try {
        const link = await db.linkSupplier(request.params.id, request.body);
        reply.code(201);
        return { success: true, link };
      } catch (error) {
        request.log.error({ error }, 'Failed to link supplier');
        reply.code(500);
        return { success: false, error: 'Failed to link supplier' };
      }
    }
  );

  /**
   * POST /products/:id/verifications
   *
   * Record a predicate verification for a product
   */
  app.post<{
    Params: { id: string };
    Body: RecordVerificationRequest;
    Reply: RecordVerificationResponse;
  }>(
    '/products/:id/verifications',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['predicateId', 'receiptId', 'result', 'supplierId'],
          properties: {
            predicateId: { type: 'string' },
            receiptId: { type: 'string' },
            result: { type: 'boolean' },
            supplierId: { type: 'string' },
            expiresAt: { type: 'string' },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<RecordVerificationResponse> => {
      const product = await db.getProduct(request.params.id);
      if (!product) {
        reply.code(404);
        return { success: false, error: 'Product not found' };
      }

      try {
        const verification = await db.recordVerification(request.params.id, request.body);
        reply.code(201);
        return { success: true, verification };
      } catch (error) {
        request.log.error({ error }, 'Failed to record verification');
        reply.code(500);
        return { success: false, error: 'Failed to record verification' };
      }
    }
  );
}

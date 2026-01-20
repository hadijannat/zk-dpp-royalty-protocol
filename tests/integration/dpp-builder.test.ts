/**
 * Integration tests for the DPP Builder service.
 *
 * Prerequisites:
 * 1. Start infrastructure: docker-compose -f infra/docker/docker-compose.dev.yml up -d
 * 2. Start dpp-builder: pnpm --filter @zkdpp/dpp-builder dev
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DPP_BUILDER_URL = process.env.DPP_BUILDER_URL || 'http://localhost:3002';

describe('DPP Builder', () => {
  let createdProductId: string | null = null;

  describe('Health endpoints', () => {
    it('GET /health returns service status', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('services');
      expect(data.services).toHaveProperty('database');
    });

    it('GET /live returns alive status', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/live`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({ alive: true });
    });
  });

  describe('Products API', () => {
    it('POST /products creates a new product', async () => {
      const product = {
        sku: `TEST-${Date.now()}`,
        name: 'Test Battery Pack',
        category: 'battery',
        description: 'A test product for integration testing',
        metadata: {
          manufacturer: 'Test Corp',
          weight: '500g',
        },
      };

      const response = await fetch(`${DPP_BUILDER_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.product).toHaveProperty('id');
      expect(data.product.sku).toBe(product.sku);
      expect(data.product.name).toBe(product.name);

      createdProductId = data.product.id;
    });

    it('GET /products lists products', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/products`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('products');
      expect(Array.isArray(data.products)).toBe(true);
    });

    it('GET /products/:id returns specific product', async () => {
      if (!createdProductId) {
        throw new Error('No product created in previous test');
      }

      const response = await fetch(`${DPP_BUILDER_URL}/products/${createdProductId}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.product.id).toBe(createdProductId);
    });

    it('GET /products/:id returns 404 for unknown product', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/products/non-existent-id`);
      expect(response.status).toBe(404);
    });
  });

  describe('DPP Views API', () => {
    it('GET /dpp/:id/view/public returns public view', async () => {
      if (!createdProductId) {
        throw new Error('No product created in previous test');
      }

      const response = await fetch(`${DPP_BUILDER_URL}/dpp/${createdProductId}/view/public`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.dpp).toHaveProperty('product');
      expect(data.dpp).toHaveProperty('accessLevel', 'PUBLIC');
      // Public view should NOT have verifiedPredicates
      expect(data.dpp).not.toHaveProperty('verifiedPredicates');
    });

    it('GET /dpp/:id/view/legit-interest returns legit interest view', async () => {
      if (!createdProductId) {
        throw new Error('No product created in previous test');
      }

      const response = await fetch(`${DPP_BUILDER_URL}/dpp/${createdProductId}/view/legit-interest`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.dpp).toHaveProperty('accessLevel', 'LEGIT_INTEREST');
      expect(data.dpp).toHaveProperty('verifiedPredicates');
      expect(data.dpp).toHaveProperty('supplierCount');
    });

    it('GET /dpp/:id/view/authority returns authority view', async () => {
      if (!createdProductId) {
        throw new Error('No product created in previous test');
      }

      const response = await fetch(`${DPP_BUILDER_URL}/dpp/${createdProductId}/view/authority`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.dpp).toHaveProperty('accessLevel', 'AUTHORITY');
      expect(data.dpp).toHaveProperty('verifiedPredicates');
      expect(data.dpp).toHaveProperty('suppliers');
      expect(data.dpp).toHaveProperty('auditTrail');
    });

    it('GET /dpp/:id/view/public returns 404 for unknown product', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/dpp/non-existent/view/public`);
      expect(response.status).toBe(404);
    });
  });

  describe('Supplier Linking', () => {
    it('POST /products/:id/link-supplier links a supplier', async () => {
      if (!createdProductId) {
        throw new Error('No product created in previous test');
      }

      const supplierLink = {
        supplierId: 'SUPPLIER-001',
        commitmentRoot: '0x' + 'a'.repeat(64),
        supplierPublicKey: '0x' + 'b'.repeat(64),
      };

      const response = await fetch(`${DPP_BUILDER_URL}/products/${createdProductId}/link-supplier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierLink),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.link).toHaveProperty('id');
    });
  });

  describe('Verification Recording', () => {
    it('POST /products/:id/verifications records a verification', async () => {
      if (!createdProductId) {
        throw new Error('No product created in previous test');
      }

      const verification = {
        predicateId: 'RECYCLED_CONTENT_GTE_V1',
        receiptId: crypto.randomUUID(),
        result: true,
        supplierId: 'SUPPLIER-001',
      };

      const response = await fetch(`${DPP_BUILDER_URL}/products/${createdProductId}/verifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verification),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.verification).toHaveProperty('id');
      expect(data.verification.result).toBe(true);
    });
  });
});

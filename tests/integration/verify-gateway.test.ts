/**
 * Integration tests for the Verify Gateway service.
 *
 * Prerequisites:
 * 1. Start infrastructure: docker-compose -f infra/docker/docker-compose.dev.yml up -d
 * 2. Start verify-gateway: pnpm --filter @zkdpp/verify-gateway dev
 */

import { describe, it, expect, beforeAll } from 'vitest';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

describe('Verify Gateway', () => {
  describe('Health endpoints', () => {
    it('GET /health returns service status', async () => {
      const response = await fetch(`${GATEWAY_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('timestamp');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
    });

    it('GET /live returns alive status', async () => {
      const response = await fetch(`${GATEWAY_URL}/live`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({ alive: true });
    });

    it('GET /ready returns readiness status', async () => {
      const response = await fetch(`${GATEWAY_URL}/ready`);
      // May return 200 or 503 depending on NATS connection
      expect([200, 503]).toContain(response.status);

      const data = await response.json();
      expect(data).toHaveProperty('ready');
    });
  });

  describe('Predicates endpoints', () => {
    it('GET /predicates returns available predicates', async () => {
      const response = await fetch(`${GATEWAY_URL}/predicates`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('predicates');
      expect(Array.isArray(data.predicates)).toBe(true);

      // Should have at least one predicate
      expect(data.predicates.length).toBeGreaterThan(0);

      // Check predicate structure
      const predicate = data.predicates[0];
      expect(predicate).toHaveProperty('id');
      expect(predicate).toHaveProperty('name');
      expect(predicate).toHaveProperty('version');
      expect(predicate).toHaveProperty('accessGroups');
    });

    it('GET /predicates/:id returns specific predicate', async () => {
      const response = await fetch(`${GATEWAY_URL}/predicates/RECYCLED_CONTENT_GTE_V1`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('id', 'RECYCLED_CONTENT_GTE_V1');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('pricing');
    });

    it('GET /predicates/:id returns 404 for unknown predicate', async () => {
      const response = await fetch(`${GATEWAY_URL}/predicates/UNKNOWN_PREDICATE`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Verification endpoint', () => {
    it('POST /verify rejects invalid proof package', async () => {
      const response = await fetch(`${GATEWAY_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proofPackage: {
            // Invalid - missing required fields
          },
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data).toHaveProperty('error');
    });

    it('POST /verify accepts valid proof package (simulated)', async () => {
      // Create a mock valid proof package
      const proofPackage = {
        predicateId: {
          name: 'RECYCLED_CONTENT_GTE',
          version: 'V1',
        },
        proof: 'a'.repeat(64), // Mock proof data (hex)
        publicInputs: {
          threshold: 20,
          commitmentRoot: 'a'.repeat(64),
          productBinding: 'b'.repeat(64),
          requesterBinding: 'c'.repeat(64),
        },
        nonce: crypto.randomUUID(),
        generatedAt: Date.now(),
        context: {
          supplierId: 'SUPPLIER-TEST',
          requesterId: 'BRAND-TEST',
          productId: 'PRODUCT-TEST',
        },
      };

      const response = await fetch(`${GATEWAY_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofPackage }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('receipt');
      expect(data.receipt).toHaveProperty('id');
      expect(data.receipt).toHaveProperty('result', true);
      expect(data.receipt).toHaveProperty('gatewaySignature');
    });
  });
});

/**
 * End-to-End Flow Test
 *
 * This test simulates the complete flow from proof generation to DPP display:
 * 1. Create a product in DPP Builder
 * 2. Link a supplier to the product
 * 3. Submit a proof to the Verify Gateway
 * 4. Record the verification in DPP Builder
 * 5. Verify the DPP views show correct data
 *
 * Prerequisites:
 * 1. Start infrastructure: docker-compose -f infra/docker/docker-compose.dev.yml up -d
 * 2. Start all services:
 *    - pnpm --filter @zkdpp/verify-gateway dev
 *    - pnpm --filter @zkdpp/dpp-builder dev
 *    - pnpm --filter @zkdpp/metering-billing dev
 */

import { describe, it, expect, beforeAll } from 'vitest';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
const DPP_BUILDER_URL = process.env.DPP_BUILDER_URL || 'http://localhost:3002';
const METERING_URL = process.env.METERING_URL || 'http://localhost:3003';

describe('E2E Flow: Battery Passport Verification', () => {
  let productId: string;
  let receiptId: string;
  const supplierId = `SUPPLIER-${Date.now()}`;
  const commitmentRoot = '0x' + 'abc123'.repeat(10).slice(0, 64);

  describe('Step 1: Create Product', () => {
    it('creates a new battery product', async () => {
      const product = {
        sku: `BATTERY-${Date.now()}`,
        name: 'EV Battery Pack Model X',
        category: 'battery',
        description: 'High-capacity lithium battery for electric vehicles',
        metadata: {
          capacity: '75 kWh',
          chemistry: 'NMC',
          weight: '450 kg',
          manufacturer: 'BatteryTech Inc.',
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
      productId = data.product.id;
      console.log(`Created product: ${productId}`);
    });
  });

  describe('Step 2: Link Supplier', () => {
    it('links supplier with commitment to product', async () => {
      const supplierLink = {
        supplierId,
        commitmentRoot,
        supplierPublicKey: '0x' + 'pubkey'.repeat(10).slice(0, 64),
      };

      const response = await fetch(`${DPP_BUILDER_URL}/products/${productId}/link-supplier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierLink),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      console.log(`Linked supplier: ${supplierId}`);
    });
  });

  describe('Step 3: Verify Proof via Gateway', () => {
    it('verifies recycled content proof', async () => {
      const proofPackage = {
        predicateId: {
          name: 'RECYCLED_CONTENT_GTE',
          version: 'V1',
        },
        proof: 'z'.repeat(128), // Simulated proof data
        publicInputs: {
          threshold: 20, // Require 20% recycled content
          commitmentRoot,
          productBinding: productId,
          requesterBinding: 'brand-001',
        },
        nonce: crypto.randomUUID(),
        generatedAt: Date.now(),
      };

      const response = await fetch(`${GATEWAY_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofPackage }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.receipt).toHaveProperty('id');
      expect(data.receipt.result).toBe(true);
      expect(data.receipt).toHaveProperty('gatewaySignature');

      receiptId = data.receipt.id;
      console.log(`Received verification receipt: ${receiptId}`);
    });

    it('verifies carbon footprint proof', async () => {
      const proofPackage = {
        predicateId: {
          name: 'CARBON_FOOTPRINT_LTE',
          version: 'V1',
        },
        proof: 'y'.repeat(128),
        publicInputs: {
          threshold: 100, // Max 100 kg CO2e
          commitmentRoot,
          productBinding: productId,
          requesterBinding: 'brand-001',
        },
        nonce: crypto.randomUUID(),
        generatedAt: Date.now(),
      };

      const response = await fetch(`${GATEWAY_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofPackage }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      console.log(`Carbon footprint verification: ${data.receipt.id}`);
    });
  });

  describe('Step 4: Record Verifications in DPP', () => {
    it('records recycled content verification', async () => {
      const verification = {
        predicateId: 'RECYCLED_CONTENT_GTE_V1',
        receiptId,
        result: true,
        supplierId,
      };

      const response = await fetch(`${DPP_BUILDER_URL}/products/${productId}/verifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verification),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      console.log(`Recorded verification: ${data.verification.id}`);
    });

    it('records carbon footprint verification', async () => {
      const verification = {
        predicateId: 'CARBON_FOOTPRINT_LTE_V1',
        receiptId: crypto.randomUUID(),
        result: true,
        supplierId,
      };

      const response = await fetch(`${DPP_BUILDER_URL}/products/${productId}/verifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verification),
      });

      expect(response.status).toBe(201);
    });
  });

  describe('Step 5: Verify DPP Views', () => {
    it('public view shows basic product info only', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/dpp/${productId}/view/public`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.dpp.accessLevel).toBe('PUBLIC');
      expect(data.dpp.product).toHaveProperty('id');
      expect(data.dpp.product).toHaveProperty('name');
      // Should NOT contain sensitive data
      expect(data.dpp).not.toHaveProperty('verifiedPredicates');
      expect(data.dpp).not.toHaveProperty('suppliers');
      console.log('Public view: OK');
    });

    it('legit interest view shows verified predicates', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/dpp/${productId}/view/legit-interest`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.dpp.accessLevel).toBe('LEGIT_INTEREST');
      expect(data.dpp.verifiedPredicates).toBeDefined();
      expect(data.dpp.supplierCount).toBeGreaterThan(0);
      // Should have our verifications
      const predicateIds = data.dpp.verifiedPredicates.map((p: any) => p.predicateId);
      expect(predicateIds).toContain('RECYCLED_CONTENT_GTE_V1');
      console.log(`Legit interest view: ${data.dpp.verifiedPredicates.length} predicates`);
    });

    it('authority view shows full audit trail', async () => {
      const response = await fetch(`${DPP_BUILDER_URL}/dpp/${productId}/view/authority`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.dpp.accessLevel).toBe('AUTHORITY');
      expect(data.dpp.suppliers).toBeDefined();
      expect(data.dpp.suppliers.length).toBeGreaterThan(0);
      expect(data.dpp.auditTrail).toBeDefined();
      expect(data.dpp.auditTrail.length).toBeGreaterThan(0);
      console.log(`Authority view: ${data.dpp.suppliers.length} suppliers, ${data.dpp.auditTrail.length} audit entries`);
    });
  });

  describe('Step 6: Check Metering Service', () => {
    it('metering service is healthy', async () => {
      const response = await fetch(`${METERING_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(['healthy', 'degraded']).toContain(data.status);
    });

    it('usage can be queried', async () => {
      const response = await fetch(`${METERING_URL}/usage?supplier_id=${supplierId}`);
      // Note: Usage recording happens via NATS events, which may not
      // be connected in test environment, so we just check the API works
      expect([200, 404]).toContain(response.status);
    });
  });
});

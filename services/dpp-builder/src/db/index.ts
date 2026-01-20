import { Pool, PoolClient } from 'pg';
import pino from 'pino';
import type {
  Product,
  ProductSupplierLink,
  VerifiedPredicate,
  CreateProductRequest,
  LinkSupplierRequest,
  RecordVerificationRequest,
} from '../types.js';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({ name: 'dpp-builder-db' });

export class Database {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      logger.info('Database connected');
    } finally {
      client.release();
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('Database disconnected');
  }

  // Products

  async createProduct(input: CreateProductRequest): Promise<Product> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const result = await this.pool.query<Product>(
      `INSERT INTO dpp_builder.products (id, sku, name, description, category, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        id,
        input.sku,
        input.name,
        input.description || null,
        input.category,
        JSON.stringify(input.metadata || {}),
        now,
      ]
    );

    return result.rows[0];
  }

  async getProduct(id: string): Promise<Product | null> {
    const result = await this.pool.query<Product>(
      'SELECT * FROM dpp_builder.products WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async getProductBySku(sku: string): Promise<Product | null> {
    const result = await this.pool.query<Product>(
      'SELECT * FROM dpp_builder.products WHERE sku = $1',
      [sku]
    );
    return result.rows[0] || null;
  }

  async listProducts(limit = 100, offset = 0): Promise<Product[]> {
    const result = await this.pool.query<Product>(
      'SELECT * FROM dpp_builder.products ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  async updateProduct(id: string, updates: Partial<CreateProductRequest>): Promise<Product | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(updates.category);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) {
      return this.getProduct(id);
    }

    fields.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());
    values.push(id);

    const result = await this.pool.query<Product>(
      `UPDATE dpp_builder.products SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  // Supplier Links

  async linkSupplier(productId: string, input: LinkSupplierRequest): Promise<ProductSupplierLink> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const result = await this.pool.query<ProductSupplierLink>(
      `INSERT INTO dpp_builder.product_supplier_links (id, product_id, supplier_id, commitment_root, supplier_public_key, linked_at, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [
        id,
        productId,
        input.supplierId,
        input.commitmentRoot,
        input.supplierPublicKey,
        now,
      ]
    );

    return result.rows[0];
  }

  async getSupplierLinks(productId: string): Promise<ProductSupplierLink[]> {
    const result = await this.pool.query<ProductSupplierLink>(
      'SELECT * FROM dpp_builder.product_supplier_links WHERE product_id = $1 AND active = true ORDER BY linked_at DESC',
      [productId]
    );
    return result.rows;
  }

  async deactivateSupplierLink(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE dpp_builder.product_supplier_links SET active = false WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Verified Predicates

  async recordVerification(
    productId: string,
    input: RecordVerificationRequest
  ): Promise<VerifiedPredicate> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const result = await this.pool.query<VerifiedPredicate>(
      `INSERT INTO dpp_builder.verified_predicates (id, product_id, supplier_id, predicate_id, receipt_id, result, verified_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        productId,
        input.supplierId,
        input.predicateId,
        input.receiptId,
        input.result,
        now,
        input.expiresAt || null,
      ]
    );

    return result.rows[0];
  }

  async getVerifiedPredicates(productId: string): Promise<VerifiedPredicate[]> {
    const now = new Date().toISOString();
    const result = await this.pool.query<VerifiedPredicate>(
      `SELECT * FROM dpp_builder.verified_predicates
       WHERE product_id = $1
       AND (expires_at IS NULL OR expires_at > $2)
       ORDER BY verified_at DESC`,
      [productId, now]
    );
    return result.rows;
  }

  async getVerifiedPredicatesBySupplier(
    productId: string,
    supplierId: string
  ): Promise<VerifiedPredicate[]> {
    const now = new Date().toISOString();
    const result = await this.pool.query<VerifiedPredicate>(
      `SELECT * FROM dpp_builder.verified_predicates
       WHERE product_id = $1 AND supplier_id = $2
       AND (expires_at IS NULL OR expires_at > $2)
       ORDER BY verified_at DESC`,
      [productId, supplierId, now]
    );
    return result.rows;
  }

  // Health check

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

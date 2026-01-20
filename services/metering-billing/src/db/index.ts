import { Pool } from 'pg';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { getPredicateById } from '@zkdpp/predicate-lib';
import type {
  VerificationUsage,
  MonthlyAggregation,
  SettlementStatement,
  SettlementBreakdown,
  RecordUsageRequest,
  GenerateStatementRequest,
  SettlementStatementWithBlockchain,
  BlockchainStatus,
  SupplierWallet,
} from '../types.js';

const logger = pino({ name: 'metering-db' });

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

  // Usage Recording

  async recordUsage(input: RecordUsageRequest): Promise<VerificationUsage> {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Get pricing from predicate
    const predicate = getPredicateById(input.predicateId);
    const pricePerVerification = predicate?.pricing.perVerification ?? 0.05;
    const currency = predicate?.pricing.currency ?? 'EUR';

    const result = await this.pool.query<VerificationUsage>(
      `INSERT INTO metering.verification_usage
       (id, event_id, supplier_id, brand_id, predicate_id, receipt_id, verified_at, price_per_verification, currency, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        input.eventId,
        input.supplierId,
        input.brandId || null,
        input.predicateId,
        input.receiptId,
        input.verifiedAt,
        pricePerVerification,
        currency,
        now,
      ]
    );

    return result.rows[0];
  }

  async getUsageBySupplier(
    supplierId: string,
    startDate?: string,
    endDate?: string
  ): Promise<VerificationUsage[]> {
    let query = 'SELECT * FROM metering.verification_usage WHERE supplier_id = $1';
    const params: unknown[] = [supplierId];

    if (startDate) {
      params.push(startDate);
      query += ` AND verified_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND verified_at < $${params.length}`;
    }

    query += ' ORDER BY verified_at DESC';

    const result = await this.pool.query<VerificationUsage>(query, params);
    return result.rows;
  }

  // Monthly Aggregations

  async getMonthlyAggregations(
    supplierId: string,
    startMonth?: string,
    endMonth?: string
  ): Promise<MonthlyAggregation[]> {
    let query = `
      SELECT
        supplier_id,
        brand_id,
        predicate_id,
        TO_CHAR(DATE_TRUNC('month', verified_at), 'YYYY-MM') as month,
        COUNT(*) as verification_count,
        SUM(price_per_verification) as total_amount,
        currency
      FROM metering.verification_usage
      WHERE supplier_id = $1
    `;
    const params: unknown[] = [supplierId];

    if (startMonth) {
      params.push(startMonth + '-01');
      query += ` AND verified_at >= $${params.length}`;
    }

    if (endMonth) {
      // Add one month to end to include the entire month
      params.push(endMonth + '-01');
      query += ` AND verified_at < ($${params.length}::date + interval '1 month')`;
    }

    query += `
      GROUP BY supplier_id, brand_id, predicate_id, DATE_TRUNC('month', verified_at), currency
      ORDER BY month DESC, predicate_id
    `;

    const result = await this.pool.query<MonthlyAggregation>(query, params);
    return result.rows;
  }

  // Settlement Statements

  async generateStatement(input: GenerateStatementRequest): Promise<SettlementStatement> {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Get all usage for the period
    const usageResult = await this.pool.query<VerificationUsage>(
      `SELECT * FROM metering.verification_usage
       WHERE supplier_id = $1 AND verified_at >= $2 AND verified_at < $3
       ORDER BY predicate_id, brand_id`,
      [input.supplierId, input.periodStart, input.periodEnd]
    );

    const usages = usageResult.rows;

    // Build breakdown by predicate and brand
    const breakdownMap = new Map<string, SettlementBreakdown>();

    for (const usage of usages) {
      const key = `${usage.predicate_id}:${usage.brand_id || 'none'}`;
      let breakdown = breakdownMap.get(key);

      if (!breakdown) {
        const predicate = getPredicateById(usage.predicate_id);
        breakdown = {
          predicate_id: usage.predicate_id,
          predicate_name: predicate?.name || usage.predicate_id,
          brand_id: usage.brand_id,
          verification_count: 0,
          price_per_verification: usage.price_per_verification,
          subtotal: 0,
        };
        breakdownMap.set(key, breakdown);
      }

      breakdown.verification_count++;
      breakdown.subtotal += usage.price_per_verification;
    }

    const breakdown = Array.from(breakdownMap.values());
    const totalVerifications = usages.length;
    const totalAmount = breakdown.reduce((sum, b) => sum + b.subtotal, 0);
    const currency = usages[0]?.currency || 'EUR';

    // Insert statement
    const result = await this.pool.query<SettlementStatement>(
      `INSERT INTO metering.settlement_statements
       (id, supplier_id, period_start, period_end, total_verifications, total_amount, currency, breakdown, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9)
       RETURNING *`,
      [
        id,
        input.supplierId,
        input.periodStart,
        input.periodEnd,
        totalVerifications,
        totalAmount,
        currency,
        JSON.stringify(breakdown),
        now,
      ]
    );

    const statement = result.rows[0];
    statement.breakdown = breakdown;

    return statement;
  }

  async getStatement(id: string): Promise<SettlementStatement | null> {
    const result = await this.pool.query<SettlementStatement>(
      'SELECT * FROM metering.settlement_statements WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;

    const statement = result.rows[0];
    if (typeof statement.breakdown === 'string') {
      statement.breakdown = JSON.parse(statement.breakdown);
    }

    return statement;
  }

  async getStatementsBySupplier(supplierId: string): Promise<SettlementStatement[]> {
    const result = await this.pool.query<SettlementStatement>(
      `SELECT * FROM metering.settlement_statements
       WHERE supplier_id = $1
       ORDER BY period_start DESC`,
      [supplierId]
    );

    return result.rows.map(s => {
      if (typeof s.breakdown === 'string') {
        s.breakdown = JSON.parse(s.breakdown);
      }
      return s;
    });
  }

  async finalizeStatement(id: string): Promise<SettlementStatement | null> {
    const result = await this.pool.query<SettlementStatement>(
      `UPDATE metering.settlement_statements
       SET status = 'FINALIZED', finalized_at = $2
       WHERE id = $1 AND status = 'DRAFT'
       RETURNING *`,
      [id, new Date().toISOString()]
    );

    if (result.rows.length === 0) return null;

    const statement = result.rows[0];
    if (typeof statement.breakdown === 'string') {
      statement.breakdown = JSON.parse(statement.breakdown);
    }

    return statement;
  }

  // Blockchain-related methods

  async getStatementWithBlockchain(id: string): Promise<SettlementStatementWithBlockchain | null> {
    const result = await this.pool.query<SettlementStatementWithBlockchain>(
      `SELECT *,
        COALESCE(blockchain_status, 'NOT_SUBMITTED') as blockchain_status
       FROM metering.settlement_statements
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const statement = result.rows[0];
    if (typeof statement.breakdown === 'string') {
      statement.breakdown = JSON.parse(statement.breakdown);
    }

    return statement;
  }

  async updateBlockchainStatus(
    id: string,
    status: BlockchainStatus,
    supplierWallet?: string
  ): Promise<void> {
    const updates = ['blockchain_status = $2'];
    const params: unknown[] = [id, status];

    if (supplierWallet) {
      params.push(supplierWallet);
      updates.push(`supplier_wallet = $${params.length}`);
    }

    await this.pool.query(
      `UPDATE metering.settlement_statements
       SET ${updates.join(', ')}
       WHERE id = $1`,
      params
    );
  }

  async updateBlockchainSubmission(
    id: string,
    data: {
      txHash: string;
      blockNumber: number;
      status: BlockchainStatus;
    }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE metering.settlement_statements
       SET blockchain_status = $2,
           tx_hash = $3,
           block_number = $4,
           chain_submitted_at = $5
       WHERE id = $1`,
      [id, data.status, data.txHash, data.blockNumber, new Date().toISOString()]
    );
  }

  async updateBlockchainFinalization(
    id: string,
    data: {
      txHash: string;
      blockNumber: number;
    }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE metering.settlement_statements
       SET blockchain_status = 'FINALIZED',
           chain_finalized_at = $2,
           status = 'PAID'
       WHERE id = $1`,
      [id, new Date().toISOString()]
    );
  }

  async registerSupplierWallet(
    supplierId: string,
    walletAddress: string
  ): Promise<SupplierWallet> {
    const result = await this.pool.query<SupplierWallet>(
      `INSERT INTO metering.supplier_wallets (supplier_id, wallet_address, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (supplier_id) DO UPDATE SET wallet_address = $2
       RETURNING *`,
      [supplierId, walletAddress.toLowerCase(), new Date().toISOString()]
    );

    return result.rows[0];
  }

  async getSupplierWallet(supplierId: string): Promise<SupplierWallet | null> {
    const result = await this.pool.query<SupplierWallet>(
      'SELECT * FROM metering.supplier_wallets WHERE supplier_id = $1',
      [supplierId]
    );

    return result.rows[0] || null;
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

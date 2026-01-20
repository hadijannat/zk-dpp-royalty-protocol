/**
 * Metering & Billing Types
 *
 * Defines the data models for usage tracking and settlement.
 */

export interface VerificationUsage {
  id: string;
  event_id: string;
  supplier_id: string;
  brand_id: string | null;
  predicate_id: string;
  receipt_id: string;
  verified_at: string;
  price_per_verification: number;
  currency: string;
  recorded_at: string;
}

export interface MonthlyAggregation {
  supplier_id: string;
  brand_id: string | null;
  predicate_id: string;
  month: string; // YYYY-MM
  verification_count: number;
  total_amount: number;
  currency: string;
}

export interface SettlementStatement {
  id: string;
  supplier_id: string;
  period_start: string;
  period_end: string;
  total_verifications: number;
  total_amount: number;
  currency: string;
  breakdown: SettlementBreakdown[];
  status: 'DRAFT' | 'FINALIZED' | 'PAID';
  created_at: string;
  finalized_at: string | null;
}

export interface SettlementBreakdown {
  predicate_id: string;
  predicate_name: string;
  brand_id: string | null;
  verification_count: number;
  price_per_verification: number;
  subtotal: number;
}

export interface UsageSummary {
  supplier_id: string;
  period: string;
  total_verifications: number;
  total_amount: number;
  currency: string;
  by_predicate: {
    predicate_id: string;
    count: number;
    amount: number;
  }[];
}

export interface ServiceConfig {
  port: number;
  host: string;
  natsUrl: string;
  databaseUrl: string;
  blockchain?: BlockchainConfig;
}

/**
 * Blockchain configuration
 */
export interface BlockchainConfig {
  rpcUrl: string;
  privateKey: string;
  chainId: number;
  contracts: {
    settlement: string;
    escrow: string;
    distributor: string;
    usdc: string;
  };
}

/**
 * Blockchain status for a settlement
 */
export type BlockchainStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING'
  | 'SUBMITTED'
  | 'FINALIZED'
  | 'DISPUTED'
  | 'PAID'
  | 'FAILED';

/**
 * Extended settlement statement with blockchain info
 */
export interface SettlementStatementWithBlockchain extends SettlementStatement {
  supplier_wallet?: string;
  blockchain_status: BlockchainStatus;
  tx_hash?: string;
  block_number?: number;
  chain_submitted_at?: string;
  chain_finalized_at?: string;
}

/**
 * Supplier wallet registration
 */
export interface SupplierWallet {
  supplier_id: string;
  wallet_address: string;
  created_at: string;
}

/**
 * Request to submit settlement on-chain
 */
export interface SubmitOnChainRequest {
  supplierWallet: string;
}

/**
 * Response from on-chain submission
 */
export interface SubmitOnChainResponse {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
}

/**
 * Blockchain status response
 */
export interface BlockchainStatusResponse {
  statementId: string;
  blockchainStatus: BlockchainStatus;
  txHash?: string;
  blockNumber?: number;
  chainSubmittedAt?: string;
  chainFinalizedAt?: string;
  isFinalizable?: boolean;
  remainingDisputeTime?: number;
}

/**
 * API Request/Response types
 */

export interface RecordUsageRequest {
  eventId: string;
  supplierId: string;
  brandId?: string;
  predicateId: string;
  receiptId: string;
  verifiedAt: string;
}

export interface RecordUsageResponse {
  success: boolean;
  usage?: VerificationUsage;
  error?: string;
}

export interface GetUsageSummaryResponse {
  success: boolean;
  summary?: UsageSummary;
  error?: string;
}

export interface GenerateStatementRequest {
  supplierId: string;
  periodStart: string;
  periodEnd: string;
}

export interface GenerateStatementResponse {
  success: boolean;
  statement?: SettlementStatement;
  error?: string;
}

export interface GetAggregationsResponse {
  success: boolean;
  aggregations?: MonthlyAggregation[];
  error?: string;
}

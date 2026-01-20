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

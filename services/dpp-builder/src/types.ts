/**
 * DPP Builder Types
 *
 * Defines the data models and API types for the DPP Builder service.
 */

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProductSupplierLink {
  id: string;
  product_id: string;
  supplier_id: string;
  commitment_root: string;
  supplier_public_key: string;
  linked_at: string;
  active: boolean;
}

export interface VerifiedPredicate {
  id: string;
  product_id: string;
  supplier_id: string;
  predicate_id: string;
  receipt_id: string;
  result: boolean;
  verified_at: string;
  expires_at: string | null;
}

/**
 * Access levels for DPP views
 */
export type AccessLevel = 'PUBLIC' | 'LEGIT_INTEREST' | 'AUTHORITY';

/**
 * Common product info across all views
 */
interface ProductBasicInfo {
  id: string;
  sku: string;
  name: string;
  category: string;
}

/**
 * Verified predicate result info
 */
interface VerifiedPredicateInfo {
  predicateId: string;
  predicateName: string;
  result: boolean;
  verifiedAt: string;
}

/**
 * Supplier info for authority view
 */
interface SupplierInfo {
  id: string;
  commitmentRoot: string;
  publicKey: string;
  linkedAt: string;
}

/**
 * Audit trail entry
 */
interface AuditEntry {
  eventType: string;
  timestamp: string;
  details: Record<string, unknown>;
}

/**
 * DPP View - Public
 * Basic product information only
 */
export interface DPPViewPublic {
  product: ProductBasicInfo;
  accessLevel: 'PUBLIC';
}

/**
 * DPP View - Legitimate Interest
 * Product info + verified predicate results (true/false, no raw values)
 */
export interface DPPViewLegitInterest {
  product: ProductBasicInfo;
  accessLevel: 'LEGIT_INTEREST';
  verifiedPredicates: VerifiedPredicateInfo[];
  supplierCount: number;
}

/**
 * DPP View - Authority
 * Full access including raw values and audit trail
 */
export interface DPPViewAuthority {
  product: ProductBasicInfo;
  accessLevel: 'AUTHORITY';
  verifiedPredicates: VerifiedPredicateInfo[];
  supplierCount: number;
  suppliers: SupplierInfo[];
  auditTrail: AuditEntry[];
}

export type DPPView = DPPViewPublic | DPPViewLegitInterest | DPPViewAuthority;

/**
 * API Request/Response types
 */

export interface CreateProductRequest {
  sku: string;
  name: string;
  description?: string;
  category: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProductResponse {
  success: boolean;
  product?: Product;
  error?: string;
}

export interface LinkSupplierRequest {
  supplierId: string;
  commitmentRoot: string;
  supplierPublicKey: string;
}

export interface LinkSupplierResponse {
  success: boolean;
  link?: ProductSupplierLink;
  error?: string;
}

export interface RecordVerificationRequest {
  predicateId: string;
  receiptId: string;
  result: boolean;
  supplierId: string;
  expiresAt?: string;
}

export interface RecordVerificationResponse {
  success: boolean;
  verification?: VerifiedPredicate;
  error?: string;
}

export interface GetDPPViewResponse {
  success: boolean;
  dpp?: DPPView;
  error?: string;
}

export interface ServiceConfig {
  port: number;
  host: string;
  natsUrl: string;
  databaseUrl: string;
}

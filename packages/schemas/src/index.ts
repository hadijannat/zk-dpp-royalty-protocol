import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this module
const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, '..', 'schemas');

// Initialize AJV with formats
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Load schemas
function loadSchema(name: string) {
  const path = join(schemasDir, `${name}.schema.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Schema objects
export const claimSchema = loadSchema('claim');
export const evidenceSchema = loadSchema('evidence');
export const commitmentSchema = loadSchema('commitment');
export const proofPackageSchema = loadSchema('proof-package');
export const receiptSchema = loadSchema('receipt');
export const verificationEventSchema = loadSchema('events/verification-event');

// Compile validators
export const validateClaim = ajv.compile(claimSchema);
export const validateEvidence = ajv.compile(evidenceSchema);
export const validateCommitment = ajv.compile(commitmentSchema);
export const validateProofPackage = ajv.compile(proofPackageSchema);
export const validateReceipt = ajv.compile(receiptSchema);
export const validateVerificationEvent = ajv.compile(verificationEventSchema);

// TypeScript types inferred from schemas
export interface PredicateId {
  name: string;
  version: string;
}

export interface Claim {
  id: string;
  type: 'recycled_content' | 'carbon_footprint' | 'certification' | 'substance_content' | 'origin' | 'manufacturing_date' | 'battery_capacity' | 'battery_chemistry';
  value: number | string | boolean | Record<string, unknown>;
  unit: string;
  productId: string;
  supplierId: string;
  evidenceIds?: string[];
  confidence?: number;
  verified?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface Evidence {
  id: string;
  type: 'certificate' | 'test_report' | 'bill_of_materials' | 'manufacturing_record' | 'supplier_declaration' | 'audit_report' | 'other';
  supplierId: string;
  originalFilename?: string;
  mimeType?: string;
  contentHash: string;
  extractedText?: string;
  issuer?: {
    name?: string;
    identifier?: string;
    type?: 'certification_body' | 'laboratory' | 'supplier' | 'authority' | 'other';
  };
  validFrom?: string;
  validUntil?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Commitment {
  id: string;
  supplierId: string;
  root: string;
  claimCount: number;
  claimIds?: string[];
  publicKey?: string;
  signature: string;
  validFrom?: string;
  validUntil?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PublicInputs {
  threshold?: number;
  commitmentRoot: string;
  productBinding: string;
  requesterBinding: string;
  timestamp?: number;
  extra?: Record<string, unknown>;
}

export interface ProofPackage {
  predicateId: PredicateId;
  proof: string;
  publicInputs: PublicInputs;
  nonce: string;
  generatedAt: number;
  supplierSignature?: string;
  usageTerms?: {
    allowedPurposes?: string[];
    expiresAt?: string;
    retentionPolicy?: string;
  };
}

export interface VerificationReceipt {
  id: string;
  predicateId: PredicateId;
  result: boolean;
  commitmentRoot?: string;
  productBinding?: string;
  requesterBinding?: string;
  supplierId?: string;
  requesterId?: string;
  nonce?: string;
  verifiedAt: string;
  expiresAt?: string;
  gatewayId?: string;
  gatewaySignature: string;
  error?: string;
}

export interface VerificationEvent {
  eventId: string;
  eventType: 'proofs.verified';
  timestamp: string;
  payload: {
    receiptId: string;
    predicateId: PredicateId;
    supplierId: string;
    requesterId: string;
    productBinding?: string;
    result: boolean;
    commitmentRoot?: string;
  };
  metadata?: {
    gatewayId?: string;
    correlationId?: string;
    traceId?: string;
  };
}

// Validation helper that throws on invalid
export function assertValid<T>(
  validator: (data: unknown) => data is T,
  data: unknown,
  schemaName: string
): asserts data is T {
  if (!validator(data)) {
    const errors = (validator as any).errors;
    throw new Error(
      `Invalid ${schemaName}: ${errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ')}`
    );
  }
}

// Type guards using validators
export function isClaim(data: unknown): data is Claim {
  return validateClaim(data);
}

export function isEvidence(data: unknown): data is Evidence {
  return validateEvidence(data);
}

export function isCommitment(data: unknown): data is Commitment {
  return validateCommitment(data);
}

export function isProofPackage(data: unknown): data is ProofPackage {
  return validateProofPackage(data);
}

export function isVerificationReceipt(data: unknown): data is VerificationReceipt {
  return validateReceipt(data);
}

export function isVerificationEvent(data: unknown): data is VerificationEvent {
  return validateVerificationEvent(data);
}

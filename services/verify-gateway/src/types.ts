import type { ProofPackage, VerificationReceipt } from '@zkdpp/schemas';

export interface VerifyRequest {
  proofPackage: ProofPackage;
}

export interface VerifyResponse {
  success: boolean;
  receipt?: VerificationReceipt;
  error?: string;
}

export interface PredicateInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  accessGroups: string[];
  pricing: {
    perVerification: number;
    currency: string;
  };
}

export interface PredicatesResponse {
  predicates: PredicateInfo[];
}

export interface NonceEntry {
  nonce: string;
  timestamp: number;
  predicateId: string;
}

export interface ServiceConfig {
  port: number;
  host: string;
  natsUrl: string;
  signingKeyId: string;
  signingKeyPrivate: string;
  nonceWindowMs: number;
  zkBackend: 'noir-cli' | 'mock';
  nargoBin: string;
  noirCircuitsDir?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    nats: boolean;
  };
}

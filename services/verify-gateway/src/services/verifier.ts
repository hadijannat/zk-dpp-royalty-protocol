import { v4 as uuidv4 } from 'uuid';
import * as jose from 'jose';
import type { ProofPackage, VerificationReceipt } from '@zkdpp/schemas';
import { getPredicateById, type PredicateDefinition } from '@zkdpp/predicate-lib';
import { nonceStore } from './nonce-store.js';
import pino from 'pino';
import { verifyWithNoirCli } from './noir-cli.js';

const logger = pino({ name: 'verifier' });

export interface VerifierConfig {
  signingKeyId: string;
  signingKeyPrivate: string;
  gatewayId: string;
  zkBackend: 'noir-cli' | 'mock';
  nargoBin: string;
  noirCircuitsDir?: string;
  nonceWindowMs: number;
}

/**
 * Service for verifying ZK proofs and issuing receipts.
 *
 * In the MVP, we simulate proof verification since the Noir WASM
 * verifier integration requires additional setup. In production,
 * this would call the actual zkp-core WASM module.
 */
export class Verifier {
  private config: VerifierConfig;
  private privateKey: jose.KeyLike | null = null;

  constructor(config: VerifierConfig) {
    this.config = config;
  }

  /**
   * Initialize the signing key
   */
  async init(): Promise<void> {
    try {
      // In production, load from secure key storage
      // Generate a key only if explicitly allowed
      if (this.config.signingKeyPrivate) {
        const keyData = Buffer.from(this.config.signingKeyPrivate, 'base64');
        this.privateKey = await jose.importPKCS8(
          new TextDecoder().decode(keyData),
          'EdDSA'
        );
      } else {
        const allowEphemeral = process.env.ALLOW_EPHEMERAL_KEYS === 'true';
        if (!allowEphemeral) {
          throw new Error('SIGNING_KEY_PRIVATE is required unless ALLOW_EPHEMERAL_KEYS=true');
        }

        // Generate a new key for development
        const { privateKey } = await jose.generateKeyPair('EdDSA');
        this.privateKey = privateKey;
        logger.warn('Using generated signing key - not suitable for production');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize signing key');
      throw error;
    }
  }

  /**
   * Verify a proof package and issue a receipt
   */
  async verify(proofPackage: ProofPackage): Promise<{
    success: boolean;
    receipt?: VerificationReceipt;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // 1. Validate proof package structure
      const validationResult = this.validateProofPackage(proofPackage);
      if (!validationResult.valid) {
        return { success: false, error: validationResult.error };
      }

      // 2. Check predicate exists
      const predicateKey = `${proofPackage.predicateId.name}_${proofPackage.predicateId.version}`;
      const predicate = getPredicateById(predicateKey);
      if (!predicate) {
        return { success: false, error: `Unknown predicate: ${predicateKey}` };
      }

      // 3. Check time window
      const now = Date.now();
      const createdAt = proofPackage.generatedAt < 1_000_000_000_000
        ? proofPackage.generatedAt * 1000
        : proofPackage.generatedAt;
      const windowMs = this.config.nonceWindowMs;

      if (Math.abs(now - createdAt) > windowMs) {
        return { success: false, error: 'Proof package timestamp outside valid window' };
      }

      // 4. Check replay (nonce)
      const nonce = proofPackage.nonce;
      if (!nonceStore.checkAndStore(nonce, predicateKey)) {
        return { success: false, error: 'Nonce already used (replay detected)' };
      }

      // 5. Verify the ZK proof
      const proofResult = await this.verifyZkProof(proofPackage, predicate);
      if (!proofResult.valid) {
        return { success: false, error: proofResult.error || 'ZK proof verification failed' };
      }

      // 6. Create and sign receipt
      const receipt = await this.createReceipt(proofPackage, startTime);

      logger.info({
        receiptId: receipt.id,
        predicateId: predicateKey,
        durationMs: Date.now() - startTime,
      }, 'Proof verified successfully');

      return { success: true, receipt };

    } catch (error) {
      logger.error({ error }, 'Verification error');
      return { success: false, error: 'Internal verification error' };
    }
  }

  /**
   * Validate proof package structure
   */
  private validateProofPackage(pkg: ProofPackage): { valid: boolean; error?: string } {
    if (!pkg.proof) {
      return { valid: false, error: 'Missing proof data' };
    }

    if (!pkg.predicateId || !pkg.predicateId.name || !pkg.predicateId.version) {
      return { valid: false, error: 'Missing predicateId' };
    }

    if (!pkg.publicInputs) {
      return { valid: false, error: 'Missing publicInputs' };
    }

    if (!pkg.publicInputs.commitmentRoot) {
      return { valid: false, error: 'Missing commitmentRoot in publicInputs' };
    }

    return { valid: true };
  }

  /**
   * Verify the ZK proof using the Noir verifier.
   *
   * In MVP, this simulates verification by checking proof structure.
   * In production, this would call the zkp-core WASM module.
   */
  private async verifyZkProof(
    proofPackage: ProofPackage,
    predicate: PredicateDefinition
  ): Promise<{ valid: boolean; error?: string }> {
    // Basic validation that proof data exists and has reasonable length
    const proofData = proofPackage.proof;
    if (!proofData || proofData.length < 32 || proofData.length % 2 !== 0) {
      logger.warn({ proofLength: proofData?.length }, 'Invalid proof data length');
      return { valid: false, error: 'Invalid proof data length' };
    }

    if (this.config.zkBackend === 'mock') {
      if (process.env.ALLOW_MOCK_PROOFS !== 'true') {
        return { valid: false, error: 'Mock backend disabled. Set ALLOW_MOCK_PROOFS=true to enable.' };
      }
      logger.warn('ZK backend is set to mock - not suitable for production');
      return { valid: true };
    }

    if (this.config.zkBackend === 'noir-cli') {
      return verifyWithNoirCli({
        predicate,
        proofPackage,
        nargoBin: this.config.nargoBin,
        circuitsDir: this.config.noirCircuitsDir,
      });
    }

    return { valid: false, error: 'Unsupported ZK backend configuration' };
  }

  /**
   * Create and sign a verification receipt
   */
  private async createReceipt(
    proofPackage: ProofPackage,
    startTime: number
  ): Promise<VerificationReceipt> {
    const receiptId = uuidv4();
    const verifiedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const receipt: VerificationReceipt = {
      id: receiptId,
      predicateId: proofPackage.predicateId,
      result: true,
      commitmentRoot: proofPackage.publicInputs.commitmentRoot,
      productBinding: proofPackage.publicInputs.productBinding,
      requesterBinding: proofPackage.publicInputs.requesterBinding,
      supplierId: proofPackage.context?.supplierId,
      requesterId: proofPackage.context?.requesterId,
      nonce: proofPackage.nonce,
      verifiedAt,
      gatewayId: this.config.gatewayId,
      gatewaySignature: '', // Will be filled below
    };

    // Sign the receipt
    receipt.gatewaySignature = await this.signReceipt(receipt);

    logger.debug({
      receiptId,
      durationMs,
    }, 'Receipt created');

    return receipt;
  }

  /**
   * Sign the receipt using EdDSA
   */
  private async signReceipt(receipt: Omit<VerificationReceipt, 'gatewaySignature'>): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Signing key not initialized');
    }

    // Create JWT-like signature
    const payload = {
      rid: receipt.id,
      pid: `${receipt.predicateId.name}@${receipt.predicateId.version}`,
      root: receipt.commitmentRoot,
      result: receipt.result,
      iat: Math.floor(new Date(receipt.verifiedAt).getTime() / 1000),
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'EdDSA', kid: this.config.signingKeyId })
      .sign(this.privateKey);

    return jwt;
  }
}

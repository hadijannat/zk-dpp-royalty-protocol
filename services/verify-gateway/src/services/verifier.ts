import { v4 as uuidv4 } from 'uuid';
import * as jose from 'jose';
import type { ProofPackage, VerificationReceipt } from '@zkdpp/schemas';
import { getPredicateById } from '@zkdpp/predicate-lib';
import { nonceStore } from './nonce-store.js';
import pino from 'pino';
import crypto from 'crypto';

const logger = pino({ name: 'verifier' });

export interface VerifierConfig {
  signingKeyId: string;
  signingKeyPrivate: string;
  gatewayId: string;
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
      // For MVP, we generate a key if not provided
      if (this.config.signingKeyPrivate) {
        const keyData = Buffer.from(this.config.signingKeyPrivate, 'base64');
        this.privateKey = await jose.importPKCS8(
          new TextDecoder().decode(keyData),
          'EdDSA'
        );
      } else {
        // Generate a new key for development
        const { privateKey } = await jose.generateKeyPair('EdDSA');
        this.privateKey = privateKey;
        logger.warn('Using generated signing key - not suitable for production');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize signing key');
      // Fall back to generated key for development
      const { privateKey } = await jose.generateKeyPair('EdDSA');
      this.privateKey = privateKey;
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
      const createdAt = proofPackage.generatedAt;
      const windowMs = 5 * 60 * 1000; // 5 minutes

      if (Math.abs(now - createdAt) > windowMs) {
        return { success: false, error: 'Proof package timestamp outside valid window' };
      }

      // 4. Check replay (nonce)
      const nonce = proofPackage.nonce || uuidv4();
      if (!nonceStore.checkAndStore(nonce, predicateKey)) {
        return { success: false, error: 'Nonce already used (replay detected)' };
      }

      // 5. Verify the ZK proof
      // In MVP, we simulate verification. In production, this calls the WASM verifier.
      const proofValid = await this.verifyZkProof(proofPackage);
      if (!proofValid) {
        return { success: false, error: 'ZK proof verification failed' };
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
  private async verifyZkProof(proofPackage: ProofPackage): Promise<boolean> {
    // MVP: Simulate verification
    // Check that proof data is non-empty and properly formatted
    const proofData = proofPackage.proof;

    // Basic validation that proof data exists and has reasonable length
    if (!proofData || proofData.length < 32) {
      logger.warn({ proofLength: proofData?.length }, 'Invalid proof data length');
      return false;
    }

    // In production, this would be:
    // const vkey = await this.loadVerificationKey(proofPackage.predicateId);
    // const result = verifyProofWasm(JSON.stringify(proofPackage), JSON.stringify(vkey));
    // return result.valid;

    // For MVP, accept proofs that have valid structure
    logger.debug('MVP: Simulated proof verification passed');
    return true;
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
   * Hash the proof package for logging/auditing
   */
  private hashProofPackage(pkg: ProofPackage): string {
    const content = JSON.stringify({
      predicateId: pkg.predicateId,
      commitmentRoot: pkg.publicInputs.commitmentRoot,
      publicInputs: pkg.publicInputs,
      generatedAt: pkg.generatedAt,
    });

    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return hash;
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

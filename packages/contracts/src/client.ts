import {
  Contract,
  ContractTransactionResponse,
  JsonRpcProvider,
  Signer,
  Wallet,
  keccak256,
  toUtf8Bytes,
  formatUnits,
  parseUnits,
} from 'ethers';

import { RoyaltySettlementABI } from './abis/RoyaltySettlement';
import { VerificationEscrowABI } from './abis/VerificationEscrow';
import { PaymentDistributorABI } from './abis/PaymentDistributor';
import { ERC20ABI } from './abis';

import {
  Statement,
  StatementStatus,
  StatementSubmission,
  TransactionResult,
  GasEstimate,
  ContractAddresses,
  ClientConfig,
  FeeBreakdown,
  VerificationRecord,
} from './types';

/**
 * ZK-DPP Contract Client
 *
 * TypeScript client for interacting with the ZK-DPP Royalty Protocol smart contracts
 * on Base L2.
 *
 * @example
 * ```typescript
 * import { ZKDPPContractClient } from '@zkdpp/contracts';
 *
 * const client = new ZKDPPContractClient({
 *   addresses: {
 *     settlement: '0x...',
 *     escrow: '0x...',
 *     distributor: '0x...',
 *     usdc: '0x...',
 *   },
 *   chainId: 84532, // Base Sepolia
 *   rpcUrl: 'https://sepolia.base.org',
 * });
 *
 * // Connect with a signer for write operations
 * const connectedClient = client.connect(signer);
 *
 * // Submit a settlement statement
 * const result = await connectedClient.submitStatement({
 *   statementId: 'stmt-2024-01',
 *   supplier: '0x...',
 *   totalAmount: '1000000000', // 1000 USDC
 *   statementHash: '0x...',
 * });
 * ```
 */
export class ZKDPPContractClient {
  private provider: JsonRpcProvider;
  private signer?: Signer;
  private addresses: ContractAddresses;
  private chainId: number;

  // Contract instances
  private settlementContract: Contract;
  private escrowContract: Contract;
  private distributorContract: Contract;
  private usdcContract: Contract;

  constructor(config: ClientConfig) {
    this.addresses = config.addresses;
    this.chainId = config.chainId;

    // Initialize provider
    this.provider = config.rpcUrl
      ? new JsonRpcProvider(config.rpcUrl)
      : new JsonRpcProvider();

    // Initialize read-only contract instances
    this.settlementContract = new Contract(
      config.addresses.settlement,
      RoyaltySettlementABI,
      this.provider
    );
    this.escrowContract = new Contract(
      config.addresses.escrow,
      VerificationEscrowABI,
      this.provider
    );
    this.distributorContract = new Contract(
      config.addresses.distributor,
      PaymentDistributorABI,
      this.provider
    );
    this.usdcContract = new Contract(
      config.addresses.usdc,
      ERC20ABI,
      this.provider
    );
  }

  /**
   * Connect a signer for write operations
   */
  connect(signer: Signer): ZKDPPContractClient {
    this.signer = signer;
    this.settlementContract = this.settlementContract.connect(signer) as Contract;
    this.escrowContract = this.escrowContract.connect(signer) as Contract;
    this.distributorContract = this.distributorContract.connect(signer) as Contract;
    this.usdcContract = this.usdcContract.connect(signer) as Contract;
    return this;
  }

  /**
   * Connect using a private key
   */
  connectWithKey(privateKey: string): ZKDPPContractClient {
    const wallet = new Wallet(privateKey, this.provider);
    return this.connect(wallet);
  }

  // ============ Settlement Contract Methods ============

  /**
   * Submit a new settlement statement (owner only)
   */
  async submitStatement(submission: StatementSubmission): Promise<TransactionResult> {
    this.requireSigner();

    const statementIdBytes = this.toBytes32(submission.statementId);
    const statementHashBytes = submission.statementHash.startsWith('0x')
      ? submission.statementHash
      : this.toBytes32(submission.statementHash);

    const tx: ContractTransactionResponse = await this.settlementContract.submitStatement(
      statementIdBytes,
      submission.supplier,
      BigInt(submission.totalAmount),
      statementHashBytes
    );

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      hash: tx.hash,
      receipt,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Finalize a statement after the dispute window
   */
  async finalizeStatement(statementId: string): Promise<TransactionResult> {
    this.requireSigner();

    const tx: ContractTransactionResponse = await this.settlementContract.finalizeStatement(
      this.toBytes32(statementId)
    );

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      hash: tx.hash,
      receipt,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Dispute a statement (supplier only, within dispute window)
   */
  async disputeStatement(statementId: string, reason: string): Promise<TransactionResult> {
    this.requireSigner();

    const tx: ContractTransactionResponse = await this.settlementContract.disputeStatement(
      this.toBytes32(statementId),
      reason
    );

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      hash: tx.hash,
      receipt,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Claim accumulated payment balance
   */
  async claimPayment(): Promise<TransactionResult> {
    this.requireSigner();

    const tx: ContractTransactionResponse = await this.settlementContract.claimPayment();

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      hash: tx.hash,
      receipt,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Get statement details
   */
  async getStatement(statementId: string): Promise<Statement | null> {
    const stmt = await this.settlementContract.getStatement(this.toBytes32(statementId));

    if (stmt.status === StatementStatus.None) {
      return null;
    }

    return {
      statementHash: stmt.statementHash,
      supplier: stmt.supplier,
      totalAmount: stmt.totalAmount,
      submittedAt: stmt.submittedAt,
      finalizedAt: stmt.finalizedAt,
      status: Number(stmt.status) as StatementStatus,
    };
  }

  /**
   * Check if a statement can be finalized
   */
  async isFinalizable(statementId: string): Promise<boolean> {
    return this.settlementContract.isFinalizable(this.toBytes32(statementId));
  }

  /**
   * Get claimable balance for a supplier
   */
  async getClaimableBalance(supplier: string): Promise<string> {
    const balance = await this.settlementContract.getClaimableBalance(supplier);
    return balance.toString();
  }

  /**
   * Get remaining dispute time in seconds
   */
  async getRemainingDisputeTime(statementId: string): Promise<number> {
    const remaining = await this.settlementContract.getRemainingDisputeTime(
      this.toBytes32(statementId)
    );
    return Number(remaining);
  }

  /**
   * Get the dispute window duration
   */
  async getDisputeWindow(): Promise<number> {
    const window = await this.settlementContract.disputeWindow();
    return Number(window);
  }

  /**
   * Estimate gas for statement submission
   */
  async estimateSubmissionGas(submission: StatementSubmission): Promise<GasEstimate> {
    const statementIdBytes = this.toBytes32(submission.statementId);
    const statementHashBytes = submission.statementHash.startsWith('0x')
      ? submission.statementHash
      : this.toBytes32(submission.statementHash);

    const gasLimit = await this.settlementContract.submitStatement.estimateGas(
      statementIdBytes,
      submission.supplier,
      BigInt(submission.totalAmount),
      statementHashBytes
    );

    const feeData = await this.provider.getFeeData();

    return {
      gasLimit,
      gasPrice: feeData.gasPrice ?? 0n,
      maxFeePerGas: feeData.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
      estimatedCost: gasLimit * (feeData.gasPrice ?? 0n),
    };
  }

  // ============ Escrow Contract Methods ============

  /**
   * Deposit USDC to escrow (requires prior approval)
   */
  async deposit(amount: string): Promise<TransactionResult> {
    this.requireSigner();

    const tx: ContractTransactionResponse = await this.escrowContract.deposit(BigInt(amount));

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      hash: tx.hash,
      receipt,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Record a verification event (owner only)
   */
  async recordVerification(record: VerificationRecord): Promise<TransactionResult> {
    this.requireSigner();

    const tx: ContractTransactionResponse = await this.escrowContract.recordVerification(
      record.brand,
      record.supplier,
      BigInt(record.amount),
      this.toBytes32(record.receiptId)
    );

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      hash: tx.hash,
      receipt,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Get brand's deposited balance
   */
  async getBrandBalance(brand: string): Promise<string> {
    const balance = await this.escrowContract.getBrandBalance(brand);
    return balance.toString();
  }

  /**
   * Get supplier's pending total across all brands
   */
  async getSupplierPendingTotal(supplier: string): Promise<string> {
    const total = await this.escrowContract.getSupplierPendingTotal(supplier);
    return total.toString();
  }

  /**
   * Check if a receipt has been recorded
   */
  async isReceiptRecorded(receiptId: string): Promise<boolean> {
    return this.escrowContract.isReceiptRecorded(this.toBytes32(receiptId));
  }

  // ============ Distributor Contract Methods ============

  /**
   * Calculate fee breakdown for an amount
   */
  async calculateFees(totalAmount: string): Promise<FeeBreakdown> {
    const [supplierAmount, protocolFee, gatewayFee] =
      await this.distributorContract.calculateFees(BigInt(totalAmount));

    return {
      supplierAmount,
      protocolFee,
      gatewayFee,
    };
  }

  /**
   * Get current fee configuration
   */
  async getFees(): Promise<{ protocolFeeBps: number; gatewayFeeBps: number }> {
    const [protocolFeeBps, gatewayFeeBps] = await this.distributorContract.getFees();
    return {
      protocolFeeBps: Number(protocolFeeBps),
      gatewayFeeBps: Number(gatewayFeeBps),
    };
  }

  /**
   * Get accumulated protocol fees
   */
  async getAccumulatedProtocolFees(): Promise<string> {
    const fees = await this.distributorContract.getAccumulatedProtocolFees();
    return fees.toString();
  }

  /**
   * Get accumulated gateway fees for an operator
   */
  async getAccumulatedGatewayFees(gateway: string): Promise<string> {
    const fees = await this.distributorContract.getAccumulatedGatewayFees(gateway);
    return fees.toString();
  }

  // ============ USDC Methods ============

  /**
   * Approve USDC spending
   */
  async approveUsdc(spender: string, amount: string): Promise<TransactionResult> {
    this.requireSigner();

    const tx: ContractTransactionResponse = await this.usdcContract.approve(
      spender,
      BigInt(amount)
    );

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      hash: tx.hash,
      receipt,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Get USDC balance
   */
  async getUsdcBalance(address: string): Promise<string> {
    const balance = await this.usdcContract.balanceOf(address);
    return balance.toString();
  }

  /**
   * Get USDC allowance
   */
  async getUsdcAllowance(owner: string, spender: string): Promise<string> {
    const allowance = await this.usdcContract.allowance(owner, spender);
    return allowance.toString();
  }

  // ============ Utility Methods ============

  /**
   * Convert a string to bytes32
   */
  toBytes32(value: string): string {
    if (value.startsWith('0x') && value.length === 66) {
      return value;
    }
    return keccak256(toUtf8Bytes(value));
  }

  /**
   * Format USDC amount for display (6 decimals)
   */
  formatUsdc(amount: string | bigint): string {
    return formatUnits(amount, 6);
  }

  /**
   * Parse USDC amount from display format
   */
  parseUsdc(amount: string): string {
    return parseUnits(amount, 6).toString();
  }

  /**
   * Get contract addresses
   */
  getAddresses(): ContractAddresses {
    return { ...this.addresses };
  }

  /**
   * Get the connected chain ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get the provider
   */
  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  /**
   * Get the signer (if connected)
   */
  getSigner(): Signer | undefined {
    return this.signer;
  }

  private requireSigner(): asserts this is { signer: Signer } {
    if (!this.signer) {
      throw new Error('Signer required for write operations. Call connect() first.');
    }
  }
}

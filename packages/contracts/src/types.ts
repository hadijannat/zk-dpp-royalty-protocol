import { TransactionReceipt, TransactionResponse } from 'ethers';

/**
 * Statement status enum matching the Solidity enum
 */
export enum StatementStatus {
  None = 0,
  Submitted = 1,
  Disputed = 2,
  Finalized = 3,
  Paid = 4,
}

/**
 * Settlement statement structure
 */
export interface Statement {
  statementHash: string;
  supplier: string;
  totalAmount: bigint;
  submittedAt: bigint;
  finalizedAt: bigint;
  status: StatementStatus;
}

/**
 * Statement submission parameters
 */
export interface StatementSubmission {
  statementId: string;
  supplier: string;
  totalAmount: string; // String for BigInt compatibility
  statementHash: string;
}

/**
 * Verification record parameters
 */
export interface VerificationRecord {
  brand: string;
  supplier: string;
  amount: string;
  receiptId: string;
}

/**
 * Payment distribution parameters
 */
export interface PaymentDistribution {
  supplier: string;
  totalAmount: string;
  gateway: string;
}

/**
 * Fee breakdown structure
 */
export interface FeeBreakdown {
  supplierAmount: bigint;
  protocolFee: bigint;
  gatewayFee: bigint;
}

/**
 * Transaction result with receipt
 */
export interface TransactionResult {
  hash: string;
  receipt: TransactionReceipt;
  blockNumber: number;
  gasUsed: bigint;
}

/**
 * Gas estimate result
 */
export interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedCost: bigint;
}

/**
 * Contract addresses configuration
 */
export interface ContractAddresses {
  settlement: string;
  escrow: string;
  distributor: string;
  usdc: string;
}

/**
 * Client configuration options
 */
export interface ClientConfig {
  addresses: ContractAddresses;
  chainId: number;
  rpcUrl?: string;
}

/**
 * Event types
 */
export interface StatementSubmittedEvent {
  statementId: string;
  supplier: string;
  totalAmount: bigint;
  statementHash: string;
  blockNumber: number;
  transactionHash: string;
}

export interface StatementFinalizedEvent {
  statementId: string;
  supplier: string;
  totalAmount: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface StatementDisputedEvent {
  statementId: string;
  supplier: string;
  reason: string;
  blockNumber: number;
  transactionHash: string;
}

export interface PaymentClaimedEvent {
  supplier: string;
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface VerificationRecordedEvent {
  brand: string;
  supplier: string;
  amount: bigint;
  receiptId: string;
  blockNumber: number;
  transactionHash: string;
}

/**
 * Supported chain IDs
 */
export enum ChainId {
  BaseMainnet = 8453,
  BaseSepolia = 84532,
  Localhost = 31337,
}

/**
 * Known contract addresses by chain
 */
export const KNOWN_ADDRESSES: Record<number, Partial<ContractAddresses>> = {
  [ChainId.BaseMainnet]: {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  [ChainId.BaseSepolia]: {
    // Populated after deployment
  },
};

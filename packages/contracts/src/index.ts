/**
 * @zkdpp/contracts
 *
 * TypeScript client for ZK-DPP Royalty Protocol smart contracts on Base L2.
 *
 * @example
 * ```typescript
 * import { ZKDPPContractClient, ChainId } from '@zkdpp/contracts';
 *
 * // Create client
 * const client = new ZKDPPContractClient({
 *   addresses: {
 *     settlement: '0x...',
 *     escrow: '0x...',
 *     distributor: '0x...',
 *     usdc: '0x...',
 *   },
 *   chainId: ChainId.BaseSepolia,
 *   rpcUrl: 'https://sepolia.base.org',
 * });
 *
 * // Connect with wallet for write operations
 * const connectedClient = client.connectWithKey(process.env.PRIVATE_KEY!);
 *
 * // Read operations (no signer needed)
 * const statement = await client.getStatement('stmt-001');
 * const balance = await client.getClaimableBalance('0x...');
 *
 * // Write operations (requires signer)
 * const result = await connectedClient.submitStatement({
 *   statementId: 'stmt-2024-01',
 *   supplier: '0x...',
 *   totalAmount: client.parseUsdc('1000'), // 1000 USDC
 *   statementHash: '0x...',
 * });
 * ```
 */

// Main client
export { ZKDPPContractClient } from './client';

// Types
export {
  // Enums
  StatementStatus,
  ChainId,

  // Interfaces
  Statement,
  StatementSubmission,
  VerificationRecord,
  PaymentDistribution,
  FeeBreakdown,
  TransactionResult,
  GasEstimate,
  ContractAddresses,
  ClientConfig,

  // Events
  StatementSubmittedEvent,
  StatementFinalizedEvent,
  StatementDisputedEvent,
  PaymentClaimedEvent,
  VerificationRecordedEvent,

  // Constants
  KNOWN_ADDRESSES,
} from './types';

// ABIs for advanced usage
export {
  RoyaltySettlementABI,
  VerificationEscrowABI,
  PaymentDistributorABI,
  ERC20ABI,
} from './abis';

// Re-export ethers utilities that are commonly needed
export { keccak256, toUtf8Bytes, formatUnits, parseUnits } from 'ethers';

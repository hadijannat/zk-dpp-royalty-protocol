/**
 * RoyaltySettlement contract ABI
 * Generated from contracts/src/RoyaltySettlement.sol
 */
export const RoyaltySettlementABI = [
  // Constructor
  {
    type: 'constructor',
    inputs: [
      { name: '_paymentToken', type: 'address' },
      { name: '_initialOwner', type: 'address' },
    ],
  },

  // Events
  {
    type: 'event',
    name: 'StatementSubmitted',
    inputs: [
      { name: 'statementId', type: 'bytes32', indexed: true },
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'totalAmount', type: 'uint256', indexed: false },
      { name: 'statementHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'StatementFinalized',
    inputs: [
      { name: 'statementId', type: 'bytes32', indexed: true },
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'totalAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'StatementDisputed',
    inputs: [
      { name: 'statementId', type: 'bytes32', indexed: true },
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'reason', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PaymentClaimed',
    inputs: [
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },

  // Read functions
  {
    type: 'function',
    name: 'getStatement',
    stateMutability: 'view',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'statementHash', type: 'bytes32' },
          { name: 'supplier', type: 'address' },
          { name: 'totalAmount', type: 'uint256' },
          { name: 'submittedAt', type: 'uint256' },
          { name: 'finalizedAt', type: 'uint256' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getClaimableBalance',
    stateMutability: 'view',
    inputs: [{ name: 'supplier', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isFinalizable',
    stateMutability: 'view',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getRemainingDisputeTime',
    stateMutability: 'view',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'disputeWindow',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimableBalances',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paymentToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },

  // Write functions
  {
    type: 'function',
    name: 'submitStatement',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'statementId', type: 'bytes32' },
      { name: 'supplier', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'statementHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeStatement',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'disputeStatement',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'statementId', type: 'bytes32' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimPayment',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setDisputeWindow',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newWindow', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // Errors
  {
    type: 'error',
    name: 'StatementAlreadyExists',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'StatementNotFound',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
  },
  { type: 'error', name: 'InvalidSupplierAddress', inputs: [] },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  {
    type: 'error',
    name: 'StatementNotSubmitted',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'DisputeWindowNotPassed',
    inputs: [
      { name: 'statementId', type: 'bytes32' },
      { name: 'remainingTime', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'StatementAlreadyFinalized',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'StatementDisputed',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'NotSupplier',
    inputs: [
      { name: 'statementId', type: 'bytes32' },
      { name: 'caller', type: 'address' },
    ],
  },
  {
    type: 'error',
    name: 'DisputeWindowPassed',
    inputs: [{ name: 'statementId', type: 'bytes32' }],
  },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'InvalidDisputeWindow', inputs: [] },
] as const;

export type RoyaltySettlementABIType = typeof RoyaltySettlementABI;
